import Foundation
import EggTimerCopy

/// Which catalogue the cook reads, and the one rule that moves it without
/// being asked: an English UI switched from metric to Imperial goes into the
/// English of 1750, and back to metric comes out again (LANGUAGE.md section 6).
///
/// Transliterated from `src/core/language.ts`, and held to it by
/// `fixtures/language.json`. Here rather than in EggTimerCopy because the rule
/// is about the units switch (`UnitsFlip`), which is the core's; the renderer
/// only ever needs a tag.
///
/// The English of 1750 is a language with a tag of its own, `en-x-1750`: the
/// strings come from `copy/en-x-1750.json`, and the formats from the region,
/// because `formattingLocale` drops a private-use subtag. So nothing here
/// knows about numbers or clocks, only about which catalogue is on screen.
///
/// Like the units, the cook's own choice is kept apart from the default.
/// `chosen` is what the cook picked, or nil if they never have, in which case
/// the app speaks `defaultLanguage`. `flippedFrom` remembers what the units
/// switch replaced, so that switching back restores it - including "never
/// chose", which stays a default rather than becoming a choice the cook never
/// made.
///
/// No I/O. The app keeps this in UserDefaults, as the JSON the web stores.

/// The catalogue a fresh install reads.
public let defaultLanguage = "en"

/// The English of 1750's catalogue tag.
public let periodLanguage = "en-x-1750"

/// Every catalogue the picker offers, in its order.
public let languages: [String] = [defaultLanguage, periodLanguage]

/// The private-use subtag that marks the register.
private let periodSubtag = "x-1750"

public struct LanguageState: Sendable, Equatable {
    /// What `chosen` was before the units switch put the cook into 1750, in a
    /// box so that a nil choice can be remembered.
    public struct Flipped: Sendable, Equatable {
        public let chosen: String?
        public init(chosen: String?) { self.chosen = chosen }
    }

    /// The catalogue the cook chose, or nil for the default.
    public let chosen: String?
    /// Nil when the 1750 on screen, if any, is not the switch's doing.
    public let flippedFrom: Flipped?

    public init(chosen: String?, flippedFrom: Flipped?) {
        self.chosen = chosen
        self.flippedFrom = flippedFrom
    }

    public static let fresh = LanguageState(chosen: nil, flippedFrom: nil)

    /// The state as the web stores it, for JSONSerialization: an absent value
    /// is JSON's null, so that `readLanguageState` gives back the same state.
    public var jsonObject: [String: Any] {
        let from: Any = flippedFrom.map { ["chosen": $0.chosen ?? NSNull()] as [String: Any] } ?? NSNull()
        return ["chosen": chosen ?? NSNull(), "flippedFrom": from]
    }
}

/// The catalogue on screen.
public func effectiveLanguage(_ state: LanguageState) -> String {
    state.chosen ?? defaultLanguage
}

/// Whether a tag is the English of 1750, in any region: `en-x-1750`,
/// `en-US-x-1750`.
public func isPeriod(_ tag: String) -> Bool {
    let lower = tag.lowercased()
    return languageOf(lower) == "en" && (lower.hasSuffix("-" + periodSubtag) || lower.contains("-" + periodSubtag + "-"))
}

/// Whether a tag is the English of today: English, not 1750. Only a cook
/// reading this is moved by the units switch; a Czech UI is not.
public func isModernEnglish(_ tag: String) -> Bool {
    languageOf(tag) == "en" && !isPeriod(tag)
}

/// The record's `register` (INFERENCE.md section 4): what kind of English the
/// answers were given in, "1750" or "modern".
public func registerOf(_ tag: String) -> String {
    isPeriod(tag) ? "1750" : "modern"
}

/// The language after the cook's own switch of units. Metric to Imperial in
/// modern English goes into 1750 and remembers what it left; Imperial to
/// metric comes back to it, if the switch was what put the cook there. Any
/// other language, or a 1750 the cook chose in the picker, is left alone.
public func languageAfterFlip(_ state: LanguageState, _ flip: UnitsFlip) -> LanguageState {
    if flip == .metricToImperial {
        if !isModernEnglish(effectiveLanguage(state)) { return state }
        return LanguageState(chosen: periodLanguage, flippedFrom: .init(chosen: state.chosen))
    }
    guard let from = state.flippedFrom else { return state }
    return LanguageState(chosen: from.chosen, flippedFrom: nil)
}

/// The language after the cook picks one. A pick is always the cook's own, so
/// it forgets what the units switch did: choosing English leaves 1750 and
/// keeps °F, and a later switch to metric does not undo a pick.
public func languageAfterPick(_ state: LanguageState, _ tag: String) -> LanguageState {
    LanguageState(chosen: tag, flippedFrom: nil)
}

/// A stored state, read defensively: anything malformed is the fresh one. A
/// tag is kept only if it is one of `known`, so a catalogue that has gone
/// cannot be asked for.
public func readLanguageState(_ raw: Any?, known: [String]) -> LanguageState {
    guard let r = raw as? [String: Any] else { return .fresh }
    func tag(_ v: Any?) -> String? {
        guard let s = v as? String, known.contains(s) else { return nil }
        return s
    }
    let chosen = tag(r["chosen"])
    var flippedFrom: LanguageState.Flipped? = nil
    if let from = r["flippedFrom"] as? [String: Any] {
        flippedFrom = .init(chosen: tag(from["chosen"]))
    }
    // A remembered switch only means something while 1750 is on screen.
    if chosen == nil || !isPeriod(chosen!) { flippedFrom = nil }
    return LanguageState(chosen: chosen, flippedFrom: flippedFrom)
}
