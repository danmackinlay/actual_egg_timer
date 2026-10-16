import Foundation

/// The cook as it ran: the plan kept from the pull on, what Done shows from
/// it, the record's facts, and what a cook leaves when it ends. The twin of
/// `src/core/asRan.ts`, held to it by `fixtures/running.json` and
/// `fixtures/step.json`; the TypeScript's comments say what each part is for.

/// The plan as the cook ran: what the record says was said for this egg, and
/// what Done shows. See `CookAsRan` in `src/core/asRan.ts`.
public struct CookAsRan: Sendable, Equatable, Codable {
    /// The cook's `correctedAtS` when it was taken (`asRanCurrent`).
    public var correctedAtS: Double?
    public var level: Double
    public var cookS: Double
    public var nudgeS: Double
    public var forecast: Forecast
    /// The peak yolk shown, and whether the cooling ends at it.
    public var peakYolkC: Double
    public var probeMoment: Bool
    /// The model's parameters it was planned under.
    public var params: ModelParams

    public init(
        correctedAtS: Double?, level: Double, cookS: Double, nudgeS: Double, forecast: Forecast, peakYolkC: Double,
        probeMoment: Bool, params: ModelParams
    ) {
        self.correctedAtS = correctedAtS
        self.level = level
        self.cookS = cookS
        self.nudgeS = nudgeS
        self.forecast = forecast
        self.peakYolkC = peakYolkC
        self.probeMoment = probeMoment
        self.params = params
    }

    enum CodingKeys: String, CodingKey {
        case correctedAtS = "correctedAt_s", level, cookS = "cook_s", nudgeS = "nudge_s", forecast
        case peakYolkC = "peakYolk_C", probeMoment, params
    }
}

// MARK: - The cook as it ran

/// The plan as it ran, from `plan`: nil unless the cook is pulled, `plan` is
/// on its pot's surface, and it is a plan of the cook as pulled.
private func asRanOf(_ cook: RunningCook, _ plan: CookPlan) -> CookAsRan? {
    guard let pulled = cook.events.pulled, plan.decided != nil, let forecast = plan.forecast,
          let inputs = plan.inputs, plan.cookTimeS == pulled.dueS - cook.startedAtS else { return nil }
    return CookAsRan(
        correctedAtS: cook.correctedAtS, level: plan.answer.level, cookS: plan.cookTimeS, nudgeS: plan.nudgeS,
        forecast: forecast, peakYolkC: plan.solution.result.peakYolkC, probeMoment: plan.probeMoment,
        params: inputs.params
    )
}

/// The cook with the plan as it ran kept: taken from `plan` the first time
/// the cook is pulled and `plan` is on its surface.
public func keepAsRan(_ cook: RunningCook, plan: CookPlan) -> RunningCook {
    guard cook.asRan == nil, cook.events.pulled != nil, let ran = asRanOf(cook, plan) else { return cook }
    return appendEntry(cook, .ran(ran))
}

/// Whether the cook's plan as it ran is kept and taken since its last
/// correction.
public func asRanCurrent(_ cook: RunningCook) -> Bool {
    guard let ran = cook.asRan, cook.events.pulled != nil else { return false }
    return ran.correctedAtS == cook.correctedAtS
}

/// What Done shows for the cook: the plan as it ran, kept; until it is kept,
/// the same from `plan` on its surface; otherwise nil, and Done shows `plan`.
public func asRanShown(_ cook: RunningCook, plan: CookPlan) -> CookAsRan? {
    if cook.asRan != nil { return asRanCurrent(cook) ? cook.asRan : nil }
    return asRanOf(cook, plan)
}

/// The solve as the cook ran, for the texture note beside the peak.
public func solutionAsRan(_ plan: CookPlan, ran: CookAsRan) -> Solution {
    if let p = plan.inputs?.params, p.alphaM2s == ran.params.alphaM2s, plan.cookTimeS == ran.cookS {
        return plan.solution
    }
    let sol = plan.solution
    return Solution(
        result: simulate(egg: plan.egg, setup: plan.setup, params: ran.params, cookTimeS: ran.cookS),
        reachable: sol.reachable, minCookTimeS: sol.minCookTimeS,
        softestLevel: sol.softestLevel, hardestLevel: sol.hardestLevel, whiteSets: sol.whiteSets
    )
}

/// A correction after the pull, as it ran: the corrected cook planned on
/// `before`, the calibration before this egg, on that calibration's surface
/// for the corrected pot; nil while `surface` is not that pot's.
public func asRanCorrected(
    _ cook: RunningCook, before: Calibration, surface: CookSurface?, nowS: Double
) -> RunningCook? {
    guard cook.events.pulled != nil else { return cook }
    guard let ran = asRanOf(cook, replan(cook, before, surface: surface, leanHintS: 0, nowS: nowS)) else {
        return nil
    }
    return appendEntry(cook, .ran(ran))
}

// MARK: - The record

/// What an app adds to a cook's facts: which app and build, the prior's
/// population, the local day the cook started, and the record's id (none on
/// iOS).
public struct RecordContext: Sendable, Equatable, Codable {
    public var app: AppName
    public var appVersion: String
    public var prior: String
    public var day: String
    public var id: Int?

    public init(app: AppName, appVersion: String, prior: String, day: String, id: Int?) {
        self.app = app
        self.appVersion = appVersion
        self.prior = prior
        self.day = day
        self.id = id
    }
}

/// Why `cookFactsFor` made no facts.
public enum FactsRefused: String, Sendable, Equatable, Codable {
    case noSurface, stale
}

/// The facts, or why there are none: exactly one is nil.
public struct CookFactsResult: Sendable, Equatable, Codable {
    public let facts: CookFacts?
    public let refused: FactsRefused?
}

/// The facts `recordFor` makes the record of. See `cookFactsFor` in
/// `src/core/asRan.ts`.
public func cookFactsFor(
    _ cook: RunningCook, plan: CookPlan, context ctx: RecordContext, yolkWord: YolkWord?, white: WhiteReport?,
    probe: ProbeReading?
) -> CookFactsResult {
    if cook.asRan != nil, !asRanCurrent(cook) { return CookFactsResult(facts: nil, refused: .stale) }
    let level: Double
    let cookS: Double
    let nudgeS: Double
    let forecast: Forecast
    if let kept = cook.asRan {
        (level, cookS, nudgeS, forecast) = (kept.level, kept.cookS, kept.nudgeS, kept.forecast)
    } else if plan.decided != nil, let f = plan.forecast {
        (level, cookS, nudgeS, forecast) = (plan.answer.level, plan.cookTimeS, plan.nudgeS, f)
    } else {
        return CookFactsResult(facts: nil, refused: .noSurface)
    }
    let pulled = cook.events.pulled
    return CookFactsResult(facts: CookFacts(
        app: ctx.app, appVersion: ctx.appVersion, prior: ctx.prior, day: ctx.day, id: ctx.id,
        massKg: plan.egg.massKg, massFrom: cook.choices.massFrom, sizeTable: cook.choices.sizeTable,
        setup: plan.setup, eggFrom: cook.choices.eggFrom, boilRemembered: boilRemembered(cook),
        level: level, cookS: cookS, nudgeS: nudgeS,
        outS: pulled?.by == .cook ? pulled.map { $0.outS - cook.startedAtS } : nil,
        coolS: plan.coolS, yolkWord: yolkWord, white: white, probe: probe, forecast: forecast,
        lang: cook.lang, units: cook.units,
        boilTapped: boilTapCounts(cook)
    ), refused: nil)
}

/// What a cook leaves when it ends, by Cancel or by Start again.
public struct CookEnding: Sendable, Equatable, Codable {
    public let boil: BoilToRemember?
    public let finished: Bool
    /// The record must be made again before the cook is forgotten.
    public let remake: Bool
}

public func cookEnding(_ cook: RunningCook, plan: CookPlan, nowS: Double) -> CookEnding {
    CookEnding(
        boil: boilToRemember(cook), finished: !asksIfStillIn(plan) && phaseAt(plan.deadlines, nowS: nowS) == .done,
        remake: cook.events.pulled != nil && cook.asRan != nil && !asRanCurrent(cook)
    )
}
