import Foundation

/// The twin of `src/core/decide.ts`, held to it by `fixtures/decide.json`; the
/// TypeScript's comments say what each part is for.

// MARK: - The surface

/// Codable, so the app can key a cache on it.
public struct DecisionInputs: Sendable, Codable, Equatable {
    public let egg: Egg
    public let setup: CookSetup
    public let params: ModelParams
    public let whiteDoseMin: Double

    public init(egg: Egg, setup: CookSetup, params: ModelParams, whiteDoseMin: Double) {
        self.egg = egg
        self.setup = setup
        self.params = params
        self.whiteDoseMin = whiteDoseMin
    }

    enum CodingKeys: String, CodingKey {
        case egg, setup, params, whiteDoseMin = "whiteDose_min"
    }
}

public func decisionInputs(_ c: Calibration, egg: Egg, setup: CookSetup) -> DecisionInputs {
    DecisionInputs(
        egg: egg, setup: setup, params: calibrationParams(c),
        whiteDoseMin: calibrationDoneness(c, level: 1.0).whiteDoseMin
    )
}

/// The key of a decision surface's inputs: the whole of them, as their JSON
/// with its keys sorted, so a field added to `DecisionInputs` or to anything
/// in it is in the key with nothing here to edit; an optional field is absent
/// when nil. Equal keys are equal inputs, to the bit, since Foundation writes
/// each double so that it reads back exactly. The web makes its own the same
/// way; neither reads the other's, so no fixture holds its text, and
/// `InputsKeyTests` holds this one.
public func inputsKey(_ inputs: DecisionInputs) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    encoder.nonConformingFloatEncodingStrategy = .convertToString(
        positiveInfinity: "+inf", negativeInfinity: "-inf", nan: "nan"
    )
    guard let data = try? encoder.encode(inputs) else {
        // Doubles, strings and enums, every double written: nothing to refuse.
        preconditionFailure("a decision's inputs did not encode")
    }
    return String(decoding: data, as: UTF8.self)
}

public func decisionGridSpec(_ inputs: DecisionInputs) -> GridSpec {
    let hard = solveCookTime(
        egg: inputs.egg, setup: inputs.setup, params: inputs.params,
        doneness: Doneness(level: 1, yolkDoseMin: yolkDoseHard, whiteDoseMin: inputs.whiteDoseMin)
    )
    let softS = hard.minCookTimeS
    let hardS = hard.result.cookTimeS > softS ? hard.result.cookTimeS : softS
    let lo = max(decisionTimeMinS, min(softS, hardS) - decisionWindowS)
    let hi = hardS + decisionWindowS
    let count = Int(((hi - lo) / decisionTimeStepS).rounded(.up)) + 1
    let alpha = inputs.params.alphaM2s
    return GridSpec(
        alphaMin: alpha * decisionAlphaLo,
        alphaMax: alpha * decisionAlphaHi,
        alphaCount: decisionAlphaCount,
        timeMinS: lo,
        timeMaxS: lo + decisionTimeStepS * Double(count - 1),
        timeCount: count
    )
}

func decisionGridRequest(_ inputs: DecisionInputs) -> GridRequest {
    GridRequest(egg: inputs.egg, setup: inputs.setup, spec: decisionGridSpec(inputs))
}

public func buildDecisionGrid(_ inputs: DecisionInputs) -> DoseGrid {
    buildRequestedGrid(decisionGridRequest(inputs))
}

// MARK: - The choice

public func expectedLoss(
    _ post: Posterior, _ grid: DoseGrid, _ cookTimeS: Double, _ logNominalTarget: Double
) -> Double {
    var loss = 0.0
    var total = 0.0
    for i in 0..<post.particles.count {
        let w = post.weights[i]
        if w == 0.0 { continue }
        let p = post.particles[i]
        let yolk = yolkProbit(grid, p, cookTimeS, logNominalTarget)
        let white = whiteProbit(grid, p, cookTimeS)
        loss += w * (yolk[0] + yolk[2] + runnyWhiteLoss * white[0])
        total += w
    }
    return total > 0.0 ? loss / total : 0.0
}

public func hitOdds(
    _ post: Posterior, _ grid: DoseGrid, _ cookTimeS: Double, _ logNominalTarget: Double
) -> Double {
    var hit = 0.0
    var total = 0.0
    for i in 0..<post.particles.count {
        let w = post.weights[i]
        if w == 0.0 { continue }
        let p = post.particles[i]
        let yolk = yolkProbit(grid, p, cookTimeS, logNominalTarget)
        let white = whiteProbit(grid, p, cookTimeS)
        let right = withUnrelated(yolk[1])
        let set = (1.0 - unrelated) * (1.0 - white[0]) + 2.0 * unrelated / 3.0
        hit += w * right * set
        total += w
    }
    return total > 0.0 ? hit / total : 0.0
}

/// The same steps in the same order as the TypeScript.
public func chooseCookTime(
    _ post: Posterior, _ grid: DoseGrid, _ logNominalTarget: Double, aroundS: Double
) -> Double {
    let gridHi = grid.timeMinS + grid.timeStepS * Double(grid.timeCount - 1)
    let lo = max(grid.timeMinS, aroundS - decisionWindowS)
    let hi = min(gridHi, aroundS + decisionWindowS)
    if !(hi > lo) { return aroundS }
    func f(_ t: Double) -> Double {
        expectedLoss(post, grid, t, logNominalTarget) + leanCostPerS * abs(t - aroundS)
    }
    let steps = Int(((hi - lo) / choiceScanStepS).rounded(.up))
    let step = (hi - lo) / Double(steps)
    var best = 0
    var bestValue = Double.infinity
    for k in 0...steps {
        let v = f(lo + step * Double(k))
        if v < bestValue {
            bestValue = v
            best = k
        }
    }
    var a = lo + step * Double(best > 0 ? best - 1 : 0)
    var b = lo + step * Double(best < steps ? best + 1 : steps)
    var c = b - invPhi * (b - a)
    var d = a + invPhi * (b - a)
    var fc = f(c)
    var fd = f(d)
    while b - a > refineTolS {
        if fc <= fd {
            b = d
            d = c
            fd = fc
            c = b - invPhi * (b - a)
            fc = f(c)
        } else {
            a = c
            c = d
            fc = fd
            d = a + invPhi * (b - a)
            fd = f(d)
        }
    }
    let mid = 0.5 * (a + b)
    return f(mid) <= bestValue ? mid : lo + step * Double(best)
}

// MARK: - The decision

public struct Decision: Sendable, Codable {
    public let cookTimeS: Double
    public let meanCookTimeS: Double
    public let chosen: Bool
    public let odds: Double
    public let oddsTenths: Int

    /// How far the choice leaned from the mean solve, s: what a mid-cook
    /// re-solve carries (`carriedSolution`). The TypeScript works it out where
    /// it is used.
    public var leanS: Double { cookTimeS - meanCookTimeS }

    enum CodingKeys: String, CodingKey {
        case cookTimeS = "cookTime_s", meanCookTimeS = "meanCookTime_s", chosen, odds, oddsTenths
    }
}

public func decisionApplies(_ sol: Solution) -> Bool {
    sol.whiteSets && sol.reachable
}

public func oddsInTenths(_ odds: Double) -> Int {
    Int((odds * 10.0).rounded())
}

public struct TimeBounds: Sendable, Equatable, Codable {
    public let loS: Double
    public let hiS: Double

    public init(loS: Double, hiS: Double) {
        self.loS = loS
        self.hiS = hiS
    }

    enum CodingKeys: String, CodingKey {
        case loS = "lo_s", hiS = "hi_s"
    }
}

public func decideAt(
    _ post: Posterior, eggsLogged: Int, grid: DoseGrid, meanCookTimeS: Double, applies: Bool,
    logNominalTarget: Double, bounds: TimeBounds? = nil
) -> Decision {
    let chosen = applies && eggsLogged > 0
    var t = chosen
        ? chooseCookTime(post, grid, logNominalTarget, aroundS: meanCookTimeS)
        : meanCookTimeS
    if chosen, let bounds {
        if t > bounds.hiS { t = bounds.hiS }
        if t < bounds.loS { t = bounds.loS }
    }
    let odds = hitOdds(post, grid, t, logNominalTarget)
    return Decision(
        cookTimeS: t,
        meanCookTimeS: meanCookTimeS,
        chosen: chosen,
        odds: odds,
        oddsTenths: oddsInTenths(odds)
    )
}

public func decide(
    _ c: Calibration, grid: DoseGrid, solution sol: Solution, logNominalTarget: Double,
    bounds: TimeBounds? = nil
) -> Decision {
    decideAt(
        c.posterior, eggsLogged: c.eggsLogged, grid: grid, meanCookTimeS: sol.result.cookTimeS,
        applies: decisionApplies(sol), logNominalTarget: logNominalTarget, bounds: bounds
    )
}

func solutionAt(
    egg: Egg, setup: CookSetup, params: ModelParams, solution sol: Solution, cookTimeS: Double
) -> Solution {
    if cookTimeS == sol.result.cookTimeS { return sol }
    return Solution(
        result: simulate(egg: egg, setup: setup, params: params, cookTimeS: cookTimeS),
        reachable: sol.reachable, minCookTimeS: sol.minCookTimeS,
        softestLevel: sol.softestLevel, hardestLevel: sol.hardestLevel, whiteSets: sol.whiteSets
    )
}

public func decidedSolution(
    egg: Egg, setup: CookSetup, params: ModelParams, solution sol: Solution, decision d: Decision,
    nudgeS: Double = 0
) -> Solution {
    solutionAt(
        egg: egg, setup: setup, params: params, solution: sol,
        cookTimeS: d.cookTimeS + appliedNudge(sol, nudgeS: nudgeS)
    )
}

// MARK: - The nudge

public func nudgeSeconds(_ u: Double) -> Double {
    let n = 2 * nudgeMaxS + 1
    let k = (u * n).rounded(.down)
    return (k < 0 ? 0 : k > n - 1 ? n - 1 : k) - nudgeMaxS
}

public func appliedNudge(_ sol: Solution, nudgeS: Double) -> Double {
    decisionApplies(sol) ? nudgeS : 0
}

public func carriedSolution(
    egg: Egg, setup: CookSetup, params: ModelParams, solution sol: Solution, leanS: Double
) -> Solution {
    if leanS == 0 || !decisionApplies(sol) { return sol }
    return solutionAt(
        egg: egg, setup: setup, params: params, solution: sol, cookTimeS: sol.result.cookTimeS + leanS
    )
}
