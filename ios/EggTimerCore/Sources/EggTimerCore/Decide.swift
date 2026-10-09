import Foundation

/// Deciding, not just estimating (INFERENCE.md section 8).
///
/// The time is CHOSEN: for a candidate pull time every particle says how likely
/// each answer is, through the probit the filter learns with, and the time with
/// the lowest expected
///
///     P(too soft) + P(too firm) + runnyWhiteLoss * P(runny)
///
/// is the recommendation - from the first egg that taught anything; before it,
/// the literature's time stands. The odds are P(not runny AND just right)
/// there. The reasons, and the measurements behind every constant, are
/// in src/core/decide.ts, which this is held to by fixtures/decide.json: two
/// apps given the same posterior and the same pot must choose the same time.

/// How much worse a runny white is than a yolk one answer off: the owner's
/// number (DECISIONS.md 7).
public let runnyWhiteLoss = 3.0

// MARK: - The surface

public let decisionAlphaLo = 0.6
public let decisionAlphaHi = 1.65
public let decisionAlphaCount = 13
/// The time axis, s between columns.
public let decisionTimeStepS = 10.0
/// How far either side of the mean solve's time the choice may go, s.
public let decisionWindowS = 120.0
/// No decision grid starts before this, s.
private let decisionTimeMinS = 20.0

/// What a decision grid is built from: the pot, the egg, and where the
/// posterior stands. Codable, so the app can key a cache on it.
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
}

public func decisionInputs(_ c: Calibration, egg: Egg, setup: CookSetup) -> DecisionInputs {
    DecisionInputs(
        egg: egg, setup: setup, params: calibrationParams(c),
        whiteDoseMin: calibrationDoneness(c, level: 1.0).whiteDoseMin
    )
}

/// A number as a key: its 64 bits as sixteen hex digits, so two numbers have
/// the same key exactly when they are equal (0 and -0 alike). See `numberKey`
/// in `src/core/decide.ts`, whose text this is to the character.
public func numberKey(_ x: Double) -> String {
    let bits = (x == 0 ? 0.0 : x).bitPattern
    let hex = String(bits, radix: 16)
    return String(repeating: "0", count: 16 - hex.count) + hex
}

/// The key of a decision surface's inputs, every number to the bit
/// (`numberKey`), in a fixed order: what the plan and this app's caches of
/// surfaces and odds key them by, and the web's alike (`inputsKey`,
/// `fixtures/running.json`).
public func inputsKey(_ inputs: DecisionInputs) -> String {
    let e = inputs.egg
    let s = inputs.setup
    let p = inputs.params
    let numbers = [
        e.radiusM, e.minorDiameterM, e.massKg, e.volumeM3,
        s.eggStartC, s.ambientC, s.boilingC, s.timeToBoilS, s.waterLitres, s.eggCount,
        p.alphaM2s, p.tauAirScale, inputs.whiteDoseMin,
    ]
    var key = "\(s.startMode.rawValue)|\(s.afterBoil.rawValue)|\(s.cooling.rawValue)"
    for n in numbers { key += "|" + numberKey(n) }
    return key
}

/// Every level this pot can deliver, and the window either side: the soft end
/// is the shortest white-setting cook, the hard end the answer at level 1.
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
    GridRequest(
        egg: inputs.egg, setup: inputs.setup, tauAirScale: inputs.params.tauAirScale,
        spec: decisionGridSpec(inputs)
    )
}

public func buildDecisionGrid(_ inputs: DecisionInputs) -> DoseGrid {
    buildRequestedGrid(decisionGridRequest(inputs))
}

// MARK: - The choice

/// The expected loss of pulling at `cookTimeS`. The unrelated share adds the
/// same constant at every time, so it is left out.
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

/// P(the white is not runny AND the yolk is just right), as the cook would
/// answer it.
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
        // withUnrelated(white[1]) + withUnrelated(white[2]), in one step.
        let set = (1.0 - unrelated) * (1.0 - white[0]) + 2.0 * unrelated / 3.0
        hit += w * right * set
        total += w
    }
    return total > 0.0 ? hit / total : 0.0
}

/// What leaning costs, in eggs per second away from the mean solve: ten
/// seconds cost a thousandth of an egg. It is what makes the choice defined
/// where the loss is flat - see src/core/decide.ts.
public let leanCostPerS = 1e-4

private let choiceScanStepS = 4.0
private let refineTolS = 0.02
private let invPhi = (5.0.squareRoot() - 1.0) / 2.0

/// The time that minimises the expected loss plus `leanCostPerS` for every
/// second away from `aroundS`, within `decisionWindowS` of it and inside the
/// grid: a scan, then a golden section around its best sample. The same steps
/// in the same order as the TypeScript.
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

public struct Decision: Sendable {
    /// The time to pull, s from eggs in.
    public let cookTimeS: Double
    /// What the mean solve said, which the choice started from.
    public let meanCookTimeS: Double
    /// Whether the time was chosen, or is the mean solve's.
    public let chosen: Bool
    /// P(hit the mark) at `cookTimeS`, and the same in tenths, which is how
    /// the reach and the advice thresholds are written. Not on screen.
    public let odds: Double
    public let oddsTenths: Int

    /// How far the choice leaned from the mean solve, s: what a mid-cook
    /// re-solve carries (`carriedSolution`).
    public var leanS: Double { cookTimeS - meanCookTimeS }
}

/// Whether a solve leaves a cook to choose a time for.
public func decisionApplies(_ sol: Solution) -> Bool {
    sol.whiteSets && sol.reachable
}

/// Tenths, which is how the reach and advice thresholds are written.
public func oddsInTenths(_ odds: Double) -> Int {
    Int((odds * 10.0).rounded())
}

/// Where the monotone envelope holds a level's time, s: no sooner than `loS`,
/// no later than `hiS` (`envelopeBounds`, Reach.swift). `loS` is 0 and `hiS`
/// infinite where nothing holds that side.
public struct TimeBounds: Sendable, Equatable {
    public let loS: Double
    public let hiS: Double

    public init(loS: Double, hiS: Double) {
        self.loS = loS
        self.hiS = hiS
    }
}

/// Decide, from the parts. The time is chosen when `applies` and at least one
/// egg has taught something; otherwise it is `meanCookTimeS`. A chosen time is
/// then held within `bounds`, so a softer level is never given a later time
/// than a firmer one (DECISIONS.md 84), and the odds are read at the time held.
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

/// Decide for a mean solve at `logNominalTarget`: the level the verdict left,
/// held within `bounds` (`envelopeBounds` at that level).
public func decide(
    _ c: Calibration, grid: DoseGrid, solution sol: Solution, logNominalTarget: Double,
    bounds: TimeBounds? = nil
) -> Decision {
    decideAt(
        c.posterior, eggsLogged: c.eggsLogged, grid: grid, meanCookTimeS: sol.result.cookTimeS,
        applies: decisionApplies(sol), logNominalTarget: logNominalTarget, bounds: bounds
    )
}

/// The solve, re-read at another time: the same verdict and limits, and the
/// cook the mean parameters predict at `cookTimeS`.
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

/// The solve, at the decided time, moved by the nudge where one applies.
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

/// The most the nudge moves a time, s, either way (INFERENCE.md section 8,
/// E8). Why, and why ten: src/core/decide.ts.
public let nudgeMaxS = 10.0

/// A uniform draw on [0, 1) as the nudge: a whole number of seconds from
/// -nudgeMaxS to +nudgeMaxS, each equally likely. The app supplies the
/// randomness; core only turns it into seconds.
public func nudgeSeconds(_ u: Double) -> Double {
    let n = 2 * nudgeMaxS + 1
    let k = (u * n).rounded(.down)
    return (k < 0 ? 0 : k > n - 1 ? n - 1 : k) - nudgeMaxS
}

/// The nudge a solve takes: all of it where a time is chosen for, none where
/// the solver's own answer stands.
public func appliedNudge(_ sol: Solution, nudgeS: Double) -> Double {
    decisionApplies(sol) ? nudgeS : 0
}

/// A cook already under way, re-solved for a new time to boil: the mean solve,
/// leaned as far as the choice leaned at "Eggs in".
public func carriedSolution(
    egg: Egg, setup: CookSetup, params: ModelParams, solution sol: Solution, leanS: Double
) -> Solution {
    if leanS == 0 || !decisionApplies(sol) { return sol }
    return solutionAt(
        egg: egg, setup: setup, params: params, solution: sol, cookTimeS: sol.result.cookTimeS + leanS
    )
}
