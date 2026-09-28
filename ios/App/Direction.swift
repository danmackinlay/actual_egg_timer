import EggTimerCore

/// The outcome summary in words, the web's `src/ui/outcome.ts` (UI.md section
/// 8): which way the egg is likely to miss, whether the white is a risk, the
/// yolk's likely range as the slider's own words. The numbers are core's
/// (`predictOutcome`); this only chooses which catalogue key says them, by the
/// web's rules, word for word. The one-tap way to play safe that went under
/// the direction is gone from both apps, and from core (28 September).

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

enum Direction {
    /// P(just right) at or above which the yolk is "probably just right": more
    /// likely than not, and nothing less. The web's `DIRECTION_LIKELY`.
    static let likely = 0.5

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

    /// Whether the white gets its line: core's `whiteRisk`.
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
}
