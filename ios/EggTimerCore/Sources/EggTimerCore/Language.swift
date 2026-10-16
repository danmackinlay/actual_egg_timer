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
/// the app speaks `defaultLanguage`.
///
/// No I/O. The app keeps and reads back its own (`LanguageChoice`).

public struct LanguageState: Sendable, Equatable {
    /// The catalogue on screen, or nil for the default: the cook's pick, or
    /// 1750 put there by the units switch.
    public let chosen: String?

    public init(chosen: String?) {
        self.chosen = chosen
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
