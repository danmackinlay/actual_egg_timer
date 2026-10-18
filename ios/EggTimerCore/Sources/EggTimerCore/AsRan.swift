import Foundation

/// The cook as it ran: the plan kept from the pull on, what Done shows from
/// it, the record's facts, and what a cook leaves when it ends. The twin of
/// `src/core/asRan.ts`, held to it by `fixtures/running.json` and
/// `fixtures/step.json`; the TypeScript's comments say what each part is for.

public struct CookAsRan: Sendable, Equatable, Codable {
    public var correctedAtS: Double?
    public var level: Double
    public var cookS: Double
    public var nudgeS: Double
    public var forecast: Forecast
    public var peakYolkC: Double
    public var probeMoment: Bool
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

private func asRanOf(_ cook: RunningCook, _ plan: CookPlan) -> CookAsRan? {
    guard let pulled = cook.events.pulled, plan.decided != nil, let forecast = plan.forecast,
          let inputs = plan.inputs, plan.cookTimeS == pulled.dueS - cook.startedAtS else { return nil }
    return CookAsRan(
        correctedAtS: cook.correctedAtS, level: plan.answer.level, cookS: plan.cookTimeS, nudgeS: plan.nudgeS,
        forecast: forecast, peakYolkC: plan.solution.result.peakYolkC, probeMoment: plan.probeMoment,
        params: inputs.params
    )
}

public func keepAsRan(_ cook: RunningCook, plan: CookPlan) -> RunningCook {
    guard cook.asRan == nil, cook.events.pulled != nil, let ran = asRanOf(cook, plan) else { return cook }
    return appendEntry(cook, .ran(ran))
}

public func asRanCurrent(_ cook: RunningCook) -> Bool {
    guard let ran = cook.asRan, cook.events.pulled != nil else { return false }
    return ran.correctedAtS == cook.correctedAtS
}

public func asRanShown(_ cook: RunningCook, plan: CookPlan) -> CookAsRan? {
    if cook.asRan != nil { return asRanCurrent(cook) ? cook.asRan : nil }
    return asRanOf(cook, plan)
}

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

public enum FactsRefused: String, Sendable, Equatable, Codable {
    case noSurface, stale
}

public struct CookFactsResult: Sendable, Equatable, Codable {
    public let facts: CookFacts?
    public let refused: FactsRefused?
}

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

public struct CookEnding: Sendable, Equatable, Codable {
    public let boil: BoilToRemember?
    public let finished: Bool
    public let remake: Bool
}

public func cookEnding(_ cook: RunningCook, plan: CookPlan, nowS: Double) -> CookEnding {
    CookEnding(
        boil: boilToRemember(cook), finished: !asksIfStillIn(plan) && phaseAt(plan.deadlines, nowS: nowS) == .done,
        remake: cook.events.pulled != nil && cook.asRan != nil && !asRanCurrent(cook)
    )
}
