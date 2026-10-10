import Foundation
import EggTimerCopy

/// Which catalogue the cook reads, and the one rule that moves it without
/// being asked: an English UI switched from metric to Imperial goes into the
/// English of 1750 (LANGUAGE.md section 6). Switching back to metric changes
/// nothing about the language; the cook leaves 1750 with the picker.
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
/// the app speaks `defaultLanguage`. A stored state may also carry
/// `flippedFrom`, what the units switch replaced, which nothing reads; a read
/// ignores it.
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
    /// The catalogue on screen, or nil for the default: the cook's pick, or
    /// 1750 put there by the units switch.
    public let chosen: String?

    public init(chosen: String?) {
        self.chosen = chosen
    }

    public static let fresh = LanguageState(chosen: nil)

    /// The state as the web stores it, for JSONSerialization: an absent value
    /// is JSON's null, so that `readLanguageState` gives back the same state.
    public var jsonObject: [String: Any] {
        ["chosen": chosen ?? NSNull()]
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
/// modern English goes into 1750. Imperial to metric leaves the language as it
/// is, as does any switch in another language or in 1750 already.
public func languageAfterFlip(_ state: LanguageState, _ flip: UnitsFlip) -> LanguageState {
    guard flip == .metricToImperial, isModernEnglish(effectiveLanguage(state)) else { return state }
    return LanguageState(chosen: periodLanguage)
}

/// The language after the cook picks one: choosing English leaves 1750 and
/// keeps °F.
public func languageAfterPick(_ state: LanguageState, _ tag: String) -> LanguageState {
    LanguageState(chosen: tag)
}

/// A stored state, read defensively: anything malformed is the fresh one. A
/// tag is kept only if it is one of `known`, so a catalogue that has gone
/// cannot be asked for. Any other field, such as the retired `flippedFrom`,
/// is ignored.
public func readLanguageState(_ raw: Any?, known: [String]) -> LanguageState {
    guard let r = raw as? [String: Any] else { return .fresh }
    guard let chosen = r["chosen"] as? String, known.contains(chosen) else { return .fresh }
    return LanguageState(chosen: chosen)
}
