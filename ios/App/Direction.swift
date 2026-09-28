import EggTimerCore

/// The outcome summary in words, the web's `src/ui/outcome.ts` (UI.md section
/// 8): which way the egg is likely to miss, whether the white is a risk, the
/// yolk's likely range as the slider's own words, and the one-tap way to play
/// safe. The numbers are core's (`predictOutcome`, `saferLevels`); this only
/// chooses which catalogue key says them, by the web's rules, word for word.

/// What the egg at the chosen time will be like: core's `Outcome`, as the app
/// carries it. Codable, so a running cook keeps the direction it started with
/// across a relaunch, as the web's cook keeps it across a reload.
struct Forecast: Codable, Equatable, Sendable {
    var pTooSoft: Double
    var pJustRight: Double
    var pTooFirm: Double
    var pWhiteRunny: Double
    var levelLow: Double
    var levelMedian: Double
    var levelHigh: Double
    /// "soft", "firm" or "balanced": core's `Lean`, by its raw value.
    var lean: String

    init(_ o: Outcome) {
        pTooSoft = o.pTooSoft
        pJustRight = o.pJustRight
        pTooFirm = o.pTooFirm
        pWhiteRunny = o.pWhiteRunny
        levelLow = o.levelLow
        levelMedian = o.levelMedian
        levelHigh = o.levelHigh
        lean = o.lean.rawValue
    }
}

/// The one-tap suggestion under the direction.
struct PlaySafe: Equatable, Sendable {
    /// `outcome.safe.firm` or `outcome.safe.soft`.
    let key: String
    /// The level a tap moves the slider to.
    let level: Double
    /// The catalogue key of the word in {level}.
    let word: String

    /// "Rather not risk it soft? Try: Fudgy".
    var text: String { tr(key, ["level": .text(tr(word))]) }
}

enum Direction {
    /// P(just right) at or above which the yolk is "probably just right": more
    /// likely than not, and nothing less. The web's `DIRECTION_LIKELY`.
    static let likely = 0.5
    /// P(too soft) or P(too firm) at or above which a play-safe level is
    /// offered: one egg in five, the white's line's threshold. The web's
    /// `SAFE_RISK`.
    static let safeRisk = 0.2

    /// The catalogue key of the direction sentence.
    static func key(_ o: Forecast) -> String {
        if o.pJustRight >= likely {
            if o.lean == Lean.firm.rawValue { return "outcome.likely.firm" }
            if o.lean == Lean.soft.rawValue { return "outcome.likely.soft" }
            return "outcome.likely"
        }
        if o.lean == Lean.firm.rawValue { return "outcome.miss.firm" }
        if o.lean == Lean.soft.rawValue { return "outcome.miss.soft" }
        return "outcome.unsure"
    }

    /// Whether the white gets its line: core's `whiteRisk`, so the line and a
    /// softer play-safe level can never disagree about what a risky white is.
    static func whiteAtRisk(_ o: Forecast) -> Bool {
        o.pWhiteRunny >= whiteRisk
    }

    /// The bracket in words, for VoiceOver: "Likely yolk: Soft to Fudgy", or
    /// one word when both ends are nearest the same one.
    static func range(_ o: Forecast) -> String {
        let low = anchorNear(o.levelLow).key
        let high = anchorNear(o.levelHigh).key
        if low == high { return tr("outcome.range.one", ["level": .text(tr(low))]) }
        return tr("outcome.range", ["low": .text(tr(low)), "high": .text(tr(high))])
    }

    /// Whether either way of missing is risk enough to look for a play-safe
    /// level at all: when neither is, there is nothing to compute.
    static func playSafeWanted(_ o: Forecast) -> Bool {
        o.pTooSoft >= safeRisk || o.pTooFirm >= safeRisk
    }

    /// The suggestion for the outcome at `level` and its play-safe levels, or
    /// nil when there is none worth making. One at most, for the larger risk;
    /// a tie goes to the firm-safe one, because an underdone egg is the worse
    /// failure for most cooks.
    static func playSafe(_ o: Forecast, _ s: SaferLevels, level: Double) -> PlaySafe? {
        let firmSafe = s.firmerLevel != nil && o.pTooSoft >= safeRisk
        let softSafe = s.softerLevel != nil && o.pTooFirm >= safeRisk
        if firmSafe, let to = s.firmerLevel, !softSafe || o.pTooSoft >= o.pTooFirm {
            return PlaySafe(key: "outcome.safe.firm", level: to, word: word(to, from: level, same: "outcome.safe.firmer"))
        }
        if softSafe, let to = s.softerLevel {
            return PlaySafe(key: "outcome.safe.soft", level: to, word: word(to, from: level, same: "outcome.safe.softer"))
        }
        return nil
    }

    /// The doneness word nearest `to`, or "A little firmer" / "A little
    /// softer" when that is already the slider's word, so the button never
    /// offers the word on screen.
    private static func word(_ to: Double, from: Double, same: String) -> String {
        let word = anchorNear(to).key
        return word == anchorNear(from).key ? same : word
    }
}
