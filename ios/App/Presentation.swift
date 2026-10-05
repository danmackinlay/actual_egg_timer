import Foundation
import EggTimerCore
import EggTimerCopy

// MARK: - The warning line, in words

/// The warning line, in words: a refusal, or the level's low odds. Which, and
/// which words say it, are core's (`answerAt`, `warningKey`); the arguments are
/// this app's, and they quote the pan the answer was computed for. The low
/// odds name the level the slider rests on, a word standing alone before the
/// colon.
func warningText(_ v: Verdict, lowOdds: Bool, level: Double, setup: CookSetup, water: String) -> String {
    guard let ref = warningKey(v, lowOdds: lowOdds, cooling: setup.cooling) else { return "" }
    return tr(ref, [
        "limit": .text(midSentence(tr(v.limit.key), locale: Copy.activeLocale)), "water": .text(water),
        "doneness": .text(tr(anchorNear(level).key)),
    ])
}

// MARK: - Units

/// The phone's region: which carton's size classes, and which Imperial unit
/// water is in. Region only, as `Locale` reports it.
let deviceRegion: String? = Locale.current.region?.identifier

/// The system this phone starts in, before the cook chooses.
///
/// iOS knows more than a browser does: the measurement system, and since iOS
/// 16 the temperature unit a cook can set in Settings, which reaches `Locale`
/// as its `mu` keyword and so `UnitTemperature(forLocale:)`. Which of them
/// wins is core policy (`regionalUnits`); this only reads them.
func platformUnits() -> UnitSystem {
    let locale = Locale.current
    let system: MeasurementSystemName = switch locale.measurementSystem {
    case .us: .us
    case .uk: .uk
    default: .metric
    }
    let fahrenheit = UnitTemperature(forLocale: locale).symbol == UnitTemperature.fahrenheit.symbol
    return regionalUnits(
        region: locale.region?.identifier, measurementSystem: system,
        temperature: fahrenheit ? .fahrenheit : .celsius
    )
}

/// A value stored in SI, as the cook reads it in a given system. Outside the
/// Planner for the cook, which renders the Live Activity's numbers in the
/// system the egg was set up in.
func showIn(_ units: UnitSystem, _ q: Quantity, _ si: Double) -> String {
    let text = quantityText(measureFor(q, system: units, region: deviceRegion), si)
    return tr(text.key, ["value": .fixed(text.value)])
}

extension Notification.Name {
    /// Posted by `Planner.chooseUnits` when the cook's own choice changes the
    /// system on screen, with the `UnitsFlip` raw value under "flip".
    /// `LanguageChoice` observes it: an English UI switched from metric to
    /// Imperial goes into the English of 1750 (LANGUAGE.md §6).
    static let unitsFlipped = Notification.Name("unitsFlipped")
}

// MARK: - Presentation helpers

/// One line on what the model expects of this cook. Which band the egg falls
/// in, and which keys say it, are core policy - including that a white the pan
/// never sets is runny, not named from its peak as "white just set".
func textureNote(peakYolkC: Double, peakWhiteC: Double, whiteSets: Bool) -> String {
    let note = textureNoteKeys(textureFor(peakYolkC: peakYolkC, peakWhiteC: peakWhiteC, whiteSets: whiteSets))
    return tr(note.key, note.parts.mapValues { .text(tr($0)) })
}

func clockString(_ seconds: Double) -> String {
    let total = Int(max(0, seconds.rounded()))
    return String(format: "%d:%02d", total / 60, total % 60)
}
