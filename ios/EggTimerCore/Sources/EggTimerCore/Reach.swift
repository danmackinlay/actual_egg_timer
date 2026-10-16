import Foundation
import EggTimerCopy

/// The twin of `src/core/reach.ts`, held to it by `fixtures/reach.json`; the
/// TypeScript's comments say what each part is for.

/// One point of the odds profile.
public struct LevelOdds: Sendable, Equatable, Codable {
    public let level: Double
    public let cookTimeS: Double
    public let odds: Double
    public let pAsked: Double
    public let certainty: Certainty

    /// `pAsked` and `certainty` default so that a profile read back without
    /// them (a fixture that holds only the odds and times) takes a wild guess
    /// at no chance, which neither the envelope nor the warning reads.
    public init(level: Double, cookTimeS: Double, odds: Double, pAsked: Double = 0, certainty: Certainty = .wildGuess) {
        self.level = level
        self.cookTimeS = cookTimeS
        self.odds = odds
        self.pAsked = pAsked
        self.certainty = certainty
    }

    enum CodingKeys: String, CodingKey {
        case level, cookTimeS = "cookTime_s", odds, pAsked, certainty
    }
}

public struct OddsProfile: Sendable, Equatable, Codable {
    public let points: [LevelOdds]
    public let best: Double
    public let bestAsked: Double
    public let physicalSoftest: Double
    public let physicalHardest: Double
    public let softest: Double?
    public let hardest: Double?

    public init(
        points: [LevelOdds], best: Double, bestAsked: Double = 0, physicalSoftest: Double, physicalHardest: Double,
        softest: Double?, hardest: Double?
    ) {
        self.points = points
        self.best = best
        self.bestAsked = bestAsked
        self.physicalSoftest = physicalSoftest
        self.physicalHardest = physicalHardest
        self.softest = softest
        self.hardest = hardest
    }
}

private func levelOf(_ position: Int) -> Double {
    Double(position) / sliderSteps
}

private func positionUp(_ level: Double) -> Int {
    Int((snapUp(level) * sliderSteps).rounded())
}

private func positionDown(_ level: Double) -> Int {
    Int((snapDown(level) * sliderSteps).rounded())
}

public func envelopeBounds(_ profile: OddsProfile?, level: Double) -> TimeBounds? {
    guard let profile, !profile.points.isEmpty else { return nil }
    var lo = 0.0
    var hi = Double.infinity
    for p in profile.points {
        if p.level <= level + sameLevel { lo = p.cookTimeS }
        if p.level >= level - sameLevel && hi == Double.infinity { hi = p.cookTimeS }
    }
    return TimeBounds(loS: lo, hiS: hi)
}

private func decisionAtLevel(
    _ c: Calibration, egg: Egg, setup: CookSetup, grid: DoseGrid, level: Double, bounds: TimeBounds?
) -> Decision {
    let sol = solveCookTime(
        egg: egg, setup: setup, params: calibrationParams(c), doneness: calibrationDoneness(c, level: level)
    )
    return decide(c, grid: grid, solution: sol, logNominalTarget: logYolkTarget(level), bounds: bounds)
}

private struct ProfileWork {
    let c: Calibration
    let egg: Egg
    let setup: CookSetup
    let grid: DoseGrid
    var positions: [Int] = []
    var times: [Double] = []
    var odds: [Double] = []
    var pAsked: [Double] = []
    var certainty: [Certainty] = []
}

private func surerThanGuess(_ c: Certainty) -> Bool {
    c != .wildGuess
}

private func decidePoint(_ w: inout ProfileWork, _ position: Int, _ bounds: TimeBounds) -> Bool {
    let level = levelOf(position)
    let d = decisionAtLevel(w.c, egg: w.egg, setup: w.setup, grid: w.grid, level: level, bounds: bounds)
    let sure = wordCertainty(yolkWordProbabilities(w.c.posterior, w.grid, d.cookTimeS), asked: askedWord(level))
    var i = w.positions.count
    while i > 0 && w.positions[i - 1] > position { i -= 1 }
    w.positions.insert(position, at: i)
    w.times.insert(d.cookTimeS, at: i)
    w.odds.insert(d.odds, at: i)
    w.pAsked.insert(sure.pAsked, at: i)
    w.certainty.insert(sure.certainty, at: i)
    return surerThanGuess(sure.certainty)
}

private func surerAtPosition(_ w: inout ProfileWork, _ position: Int) -> Bool {
    var i = 0
    while i < w.positions.count && w.positions[i] < position { i += 1 }
    if i < w.positions.count && w.positions[i] == position { return surerThanGuess(w.certainty[i]) }
    let below = i > 0 ? w.times[i - 1] : 0.0
    let over = i < w.positions.count ? w.times[i] : Double.infinity
    return decidePoint(&w, position, TimeBounds(loS: below, hiS: over))
}

private func reachEnd(_ w: inout ProfileWork, reaches: Int, short: Int) -> Int {
    var r = reaches
    var s = short
    while abs(s - r) > 1 {
        let mid = (r + s) / 2
        if surerAtPosition(&w, mid) { r = mid } else { s = mid }
    }
    return r
}

public func oddsProfile(_ c: Calibration, egg: Egg, setup: CookSetup, grid: DoseGrid) -> OddsProfile {
    let edge = solveCookTime(
        egg: egg, setup: setup, params: calibrationParams(c), doneness: calibrationDoneness(c, level: 1.0)
    )
    let lo = positionUp(edge.softestLevel)
    let hi = positionDown(edge.hardestLevel)
    if !edge.whiteSets || hi < lo {
        return OddsProfile(
            points: [], best: 0, bestAsked: 0, physicalSoftest: levelOf(lo), physicalHardest: levelOf(hi),
            softest: nil, hardest: nil
        )
    }

    var positions = [lo]
    var k = (lo / profileStep + 1) * profileStep
    while k < hi {
        positions.append(k)
        k += profileStep
    }
    if hi > lo { positions.append(hi) }
    var w = ProfileWork(c: c, egg: egg, setup: setup, grid: grid)
    var above = Double.infinity
    for i in stride(from: positions.count - 1, through: 0, by: -1) {
        _ = decidePoint(&w, positions[i], TimeBounds(loS: 0.0, hiS: above))
        above = w.times[0]
    }
    var gridSure: [Bool] = []
    var anySure = false
    for k in w.certainty {
        gridSure.append(surerThanGuess(k))
        if surerThanGuess(k) { anySure = true }
    }

    var softest: Double?
    var hardest: Double?
    if c.eggsLogged > 0 && anySure {
        var first = 0
        while !gridSure[first] { first += 1 }
        var last = positions.count - 1
        while !gridSure[last] { last -= 1 }
        let s = first > 0 ? reachEnd(&w, reaches: positions[first], short: positions[first - 1]) : positions[first]
        let h = last < positions.count - 1
            ? reachEnd(&w, reaches: positions[last], short: positions[last + 1]) : positions[last]
        softest = levelOf(s)
        hardest = levelOf(h)
    }

    var points: [LevelOdds] = []
    var best = 0.0
    var bestAsked = 0.0
    for i in 0..<w.positions.count {
        points.append(LevelOdds(
            level: levelOf(w.positions[i]), cookTimeS: w.times[i], odds: w.odds[i],
            pAsked: w.pAsked[i], certainty: w.certainty[i]
        ))
        if w.odds[i] > best { best = w.odds[i] }
        if w.pAsked[i] > bestAsked { bestAsked = w.pAsked[i] }
    }
    return OddsProfile(
        points: points, best: best, bestAsked: bestAsked, physicalSoftest: levelOf(lo), physicalHardest: levelOf(hi),
        softest: softest, hardest: hardest
    )
}

// MARK: - The warning

public func lowOddsAt(_ profile: OddsProfile?, level: Double) -> Bool {
    guard let profile, let softest = profile.softest, let hardest = profile.hardest else { return false }
    return level < softest - sameLevel || level > hardest + sameLevel
}

// MARK: - The answer

public struct LevelAnswer: Sendable, Codable {
    public let solution: Solution
    public let verdict: Verdict
    public let level: Double
    public let lowOdds: Bool
}

public func answerAt(
    _ c: Calibration, egg: Egg, setup: CookSetup, level: Double, profile: OddsProfile?
) -> LevelAnswer {
    let params = calibrationParams(c)
    let solution = solveCookTime(
        egg: egg, setup: setup, params: params, doneness: calibrationDoneness(c, level: level)
    )
    let verdict = verdictFor(solution, level: level)
    if let snapTo = verdict.snapTo {
        let retry = solveCookTime(
            egg: egg, setup: setup, params: params, doneness: calibrationDoneness(c, level: snapTo)
        )
        if retry.reachable {
            return LevelAnswer(
                solution: retry, verdict: verdict, level: snapTo, lowOdds: lowOddsAt(profile, level: snapTo)
            )
        }
    }
    return LevelAnswer(solution: solution, verdict: verdict, level: level, lowOdds: lowOddsAt(profile, level: level))
}

// MARK: - The shading

public struct Shade: Sendable, Equatable, Codable {
    public let level: Double
    public let strength: Double
}

public func shadingOf(_ profile: OddsProfile) -> [Shade] {
    guard profile.bestAsked >= shadeBestMin else { return [] }
    return profile.points.map {
        Shade(level: $0.level, strength: min(1, max(0, $0.pAsked / profile.bestAsked)))
    }
}

// MARK: - The advice

public func adviceWanted(_ c: Certainty) -> Bool {
    c == .wildGuess
}

public struct AdviceFacts: Sendable, Equatable, Codable {
    public let eggFromClass: Bool
    public let startAssumed: Bool

    public init(eggFromClass: Bool, startAssumed: Bool) {
        self.eggFromClass = eggFromClass
        self.startAssumed = startAssumed
    }
}

public struct PricedChange: Sendable, Equatable, Codable {
    public let key: CopyKey
    public let setup: CookSetup
}

public func pricedChanges(_ setup: CookSetup) -> [PricedChange] {
    var out: [PricedChange] = []
    if setup.cooling == .counter {
        var ice = setup
        ice.cooling = .ice
        out.append(PricedChange(key: .`advice.ice`, setup: ice))
    }
    if setup.afterBoil == .off && setup.waterLitres < Limits.waterLitres.upperBound {
        var more = setup
        more.waterLitres = min(Limits.waterLitres.upperBound, 2 * setup.waterLitres)
        out.append(PricedChange(key: .`advice.moreWater`, setup: more))
    }
    return out
}

public func unpricedAdvice(_ setup: CookSetup, facts: AdviceFacts) -> [CopyKey] {
    var keys: [CopyKey] = []
    if facts.startAssumed && setup.eggStartC > StartTempPresets.fridgeC + fridgeMarginC {
        keys.append(.`advice.fridge`)
    }
    if facts.eggFromClass { keys.append(.`advice.weigh`) }
    return keys
}

public func askedNear(_ profile: OddsProfile, level: Double) -> Double {
    let pts = profile.points
    guard let first = pts.first, let last = pts.last,
          level >= first.level - sameLevel, level <= last.level + sameLevel else {
        return 0
    }
    let word = askedWord(level)
    var below = -1
    var above = -1
    for i in 0..<pts.count where askedWord(pts[i].level) == word {
        if pts[i].level <= level + sameLevel { below = i }
        if pts[i].level >= level - sameLevel && above < 0 { above = i }
    }
    if below < 0 && above < 0 { return 0 }
    if below < 0 { return pts[above].pAsked }
    if above < 0 { return pts[below].pAsked }
    let a = pts[below]
    let b = pts[above]
    let span = b.level - a.level
    return span > 0 ? a.pAsked + (b.pAsked - a.pAsked) * ((level - a.level) / span) : a.pAsked
}

public struct ProtocolAdvice: Sendable, Equatable, Codable {
    public let keys: [CopyKey]
    public let surer: Bool
}

public func protocolAdvice(
    _ setup: CookSetup, facts: AdviceFacts, level: Double, pAsked: Double,
    priced: [(key: CopyKey, profile: OddsProfile)]
) -> ProtocolAdvice {
    var keys = unpricedAdvice(setup, facts: facts)
    var surer = false
    for change in priced where askedNear(change.profile, level: level) - pAsked >= adviceGain {
        keys.append(change.key)
        surer = true
    }
    return ProtocolAdvice(keys: keys, surer: surer)
}

// MARK: - The decided answer

public struct DecidedAnswer: Sendable, Codable {
    public let level: Double
    public let solution: Solution
    public let decision: Decision
    public let outcome: Outcome
    public let certainty: CertaintyReading
    public let nudgeS: Double
    public let adviceWanted: Bool

    enum CodingKeys: String, CodingKey {
        case level, solution, decision, outcome, certainty, nudgeS = "nudge_s", adviceWanted
    }
}

public func decideAnswer(
    _ c: Calibration, egg: Egg, setup: CookSetup, grid: DoseGrid, solution sol: Solution, level: Double,
    profile: OddsProfile?, nudgeS: Double
) -> DecidedAnswer {
    let target = logYolkTarget(level)
    let d = decide(
        c, grid: grid, solution: sol, logNominalTarget: target, bounds: envelopeBounds(profile, level: level)
    )
    let nudge = appliedNudge(sol, nudgeS: nudgeS)
    let certainty = certaintyAt(c.posterior, grid, d.cookTimeS + nudge, level: level)
    return DecidedAnswer(
        level: level,
        solution: decidedSolution(
            egg: egg, setup: setup, params: calibrationParams(c), solution: sol, decision: d, nudgeS: nudge
        ),
        decision: d,
        outcome: predictOutcome(c.posterior, grid, d.cookTimeS + nudge, target),
        certainty: certainty,
        nudgeS: nudge,
        adviceWanted: sol.whiteSets && adviceWanted(certainty.words.certainty)
    )
}
