import Foundation

/// The odds at every level the slider offers, and what follows from them:
/// which levels the app warns of, how the track is shaded, and when the app
/// says how to make an egg more reliable.
///
/// A profile point is the odds the app computes when the slider sits at that
/// level - the mean solve there, decided on the pot's decision surface - so
/// the two cannot disagree, and how sure the app is there in words: the
/// chance of the word asked, which shades the track, and `certaintyAt`'s
/// class, which dots it (DECISIONS.md 97). The levels are the two physical
/// edges on the slider's grid, every `profileStep` positions between them,
/// and, once an egg has taught something and a level is not a wild guess, a
/// bisection on the slider's own grid at each end of the range that is not.
/// Outside that range, and inside the physical edges, the app warns that the
/// level is a wild guess so far; it never refuses it, and only what the pan
/// cannot deliver moves the slider (DECISIONS.md 83). With every level a wild
/// guess, or before the first egg, nothing is warned of.
///
/// The profile also holds the time monotone in the level (DECISIONS.md 84):
/// its points are decided from the hard end, each held under the time of the
/// point above it - a running minimum, the projection of the per-level choices
/// onto schedules that never fall as the level rises - and a level between
/// two points is held between their times (`envelopeBounds`): monotone at
/// the points, and within about a second of it between them. The reasons,
/// and the measurements, are in src/core/reach.ts, which this is held to by
/// fixtures/reach.json.
///
/// What the screen shows at a level, once the pot's surface is built, is
/// `decideAnswer`: the decision held by the envelope, the nudge, the solve,
/// the outcome and the certainty at the time given, and whether advice is
/// wanted. Both apps call it; until 6 October 2026 each wrote it out for
/// itself.

/// Slider positions between profile points.
public let profileStep = 5

/// One point of the profile: a slider level, the time the app gives there
/// (after the envelope), the odds of that time, and how sure the app is there
/// in words.
public struct LevelOdds: Sendable, Equatable {
    public let level: Double
    public let cookTimeS: Double
    public let odds: Double
    /// P(the word asked at this level) at its time: what the shading reads.
    public let pAsked: Double
    /// `certaintyAt`'s class at this level's time: a wild guess is dotted at
    /// the ends.
    public let certainty: Certainty

    /// A point; a profile read back without its certainty (a fixture that
    /// holds only the odds and times) takes a wild guess at no chance, which
    /// neither the envelope nor the warning reads.
    public init(level: Double, cookTimeS: Double, odds: Double, pAsked: Double = 0, certainty: Certainty = .wildGuess) {
        self.level = level
        self.cookTimeS = cookTimeS
        self.odds = odds
        self.pAsked = pAsked
        self.certainty = certainty
    }
}

public struct OddsProfile: Sendable, Equatable {
    /// Sorted by level, from `physicalSoftest` to `physicalHardest`. Empty when
    /// the white never sets.
    public let points: [LevelOdds]
    /// The best odds of any point. The advice was measured against it until
    /// 8 October 2026.
    public let best: Double
    /// The best `pAsked` of any point: what the shading is relative to.
    public let bestAsked: Double
    /// The physical edges, on the slider's grid.
    public let physicalSoftest: Double
    public let physicalHardest: Double
    /// The softest and firmest levels that are not a wild guess, or nil when
    /// nothing is warned of. Both nil or both set. Outside them, and inside
    /// the physical edges, is what the track dots and the app warns of.
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

/// How close a level must be to a point to be that point: the slider's levels
/// are hundredths, which neither language holds exactly.
private let sameLevel = 1e-9

/// Where the envelope holds the time at `level`: no sooner than the time of the
/// nearest point at or below it, no later than the time of the nearest point
/// at or above it. At a point, both are that point's time. Nil with no
/// profile, or one with no points: the level keeps its own choice.
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

/// The decision the app makes when the slider sits at `level`, a level the pan
/// can deliver: the mean solve there, decided on `grid`, held within `bounds`.
private func decisionAtLevel(
    _ c: Calibration, egg: Egg, setup: CookSetup, grid: DoseGrid, level: Double, bounds: TimeBounds?
) -> Decision {
    let sol = solveCookTime(
        egg: egg, setup: setup, params: calibrationParams(c), doneness: calibrationDoneness(c, level: level)
    )
    return decide(c, grid: grid, solution: sol, logNominalTarget: logYolkTarget(level), bounds: bounds)
}

/// The odds the app shows when the slider sits at `level`, with `profile` - the
/// pot's, or nil before it is built - holding its time.
func oddsAtLevel(
    _ c: Calibration, egg: Egg, setup: CookSetup, grid: DoseGrid, level: Double, profile: OddsProfile?
) -> Double {
    decisionAtLevel(
        c, egg: egg, setup: setup, grid: grid, level: level, bounds: envelopeBounds(profile, level: level)
    ).odds
}

/// A profile being built: the pot it is for, and the points decided on it so
/// far, as arrays kept in order of slider position. Plain data, handed to the
/// functions below rather than closed over (core invariant 2).
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

/// Whether a class is surer than a wild guess: a level the track does not dot.
private func surerThanGuess(_ c: Certainty) -> Bool {
    c != .wildGuess
}

/// Decide the point at `position`, held within `bounds`; read how sure the
/// app is at the time decided; keep both in `w`, in order; and return whether
/// it is surer than a wild guess.
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

/// Whether `position` is surer than a wild guess: a point already decided, or
/// one decided now, held between the nearest points known on either side, so
/// that it moves no time the profile already gave.
private func surerAtPosition(_ w: inout ProfileWork, _ position: Int) -> Bool {
    var i = 0
    while i < w.positions.count && w.positions[i] < position { i += 1 }
    if i < w.positions.count && w.positions[i] == position { return surerThanGuess(w.certainty[i]) }
    let below = i > 0 ? w.times[i - 1] : 0.0
    let over = i < w.positions.count ? w.times[i] : Double.infinity
    return decidePoint(&w, position, TimeBounds(loS: below, hiS: over))
}

/// One end of the range that is not a wild guess, by bisection on the slider's
/// grid between `reaches`, a position surer than a wild guess, and `short`, a
/// wild guess on either side: the surer position next to one that is not.
private func reachEnd(_ w: inout ProfileWork, reaches: Int, short: Int) -> Int {
    var r = reaches
    var s = short
    while abs(s - r) > 1 {
        let mid = (r + s) / 2
        if surerAtPosition(&w, mid) { r = mid } else { s = mid }
    }
    return r
}

/// The odds and the certainty at every level the pot can deliver, and the
/// range that is not a wild guess. `grid` is this pot's decision surface, for
/// the same calibration.
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
    // The envelope: from the hard end, each point held under the one above it.
    var w = ProfileWork(c: c, egg: egg, setup: setup, grid: grid)
    var above = Double.infinity
    for i in stride(from: positions.count - 1, through: 0, by: -1) {
        _ = decidePoint(&w, positions[i], TimeBounds(loS: 0.0, hiS: above))
        above = w.times[0]
    }
    // Before any bisection, w holds exactly these positions, in this order.
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
        // The softest first, then the firmest: a point the first bisection adds
        // holds the second's.
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

/// Whether the app warns that `level` is a wild guess so far - a dotted level:
/// true when the profile has a range that is not a wild guess and the level is
/// softer than its softest or firmer than its firmest. False with no profile,
/// or one that warns of nothing. It moves nothing: what the pan cannot deliver
/// is `verdictFor`'s. The name is older than the rule.
public func lowOddsAt(_ profile: OddsProfile?, level: Double) -> Bool {
    guard let profile, let softest = profile.softest, let hardest = profile.hardest else { return false }
    // A level a hair off its end - 35 * 0.01 is not 35 / 100 - is that end.
    return level < softest - sameLevel || level > hardest + sameLevel
}

// MARK: - The answer

/// A solve, the verdict on it, the level it is for, and whether the odds there
/// are warned of.
public struct LevelAnswer: Sendable {
    public let solution: Solution
    public let verdict: Verdict
    /// The level the solution is for: the one asked, or the one it snapped to.
    public let level: Double
    /// `lowOddsAt` that level.
    public let lowOdds: Bool
}

/// Solve for a level, judge it (`verdictFor`: only what the pan cannot deliver
/// moves the slider), and, when the verdict moves the slider, solve again at
/// the level it moves to, so the numbers on screen are for the egg on offer.
/// The retry is kept only if it reaches. Then whether the odds at the level
/// answered are warned of.
///
/// `snapRetry` is false for an egg already in the water: its target is
/// frozen, so a solve at a snapped level would answer for an egg nobody is
/// cooking.
public func answerAt(
    _ c: Calibration, egg: Egg, setup: CookSetup, level: Double, profile: OddsProfile?, snapRetry: Bool
) -> LevelAnswer {
    let params = calibrationParams(c)
    let solution = solveCookTime(
        egg: egg, setup: setup, params: params, doneness: calibrationDoneness(c, level: level)
    )
    let verdict = verdictFor(solution, level: level)
    if snapRetry, let snapTo = verdict.snapTo {
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

/// How strongly the track is shaded at a level: the chance of the word asked
/// there over the best level's (DECISIONS.md 97), 0 to 1.
public struct Shade: Sendable, Equatable {
    public let level: Double
    public let strength: Double
}

/// The best chance below which the track is not shaded at all: there is no
/// "where it works best" to show.
public let shadeBestMin = 0.05

/// The shading's stops, one per profile point; empty with nothing to shade.
public func shadingOf(_ profile: OddsProfile) -> [Shade] {
    guard profile.bestAsked >= shadeBestMin else { return [] }
    return profile.points.map {
        Shade(level: $0.level, strength: min(1, max(0, $0.pAsked / profile.bestAsked)))
    }
}

// MARK: - The advice

// When to advise (reach.ts, "WHEN TO ADVISE"): the word asked is a wild
// guess at the time on screen, and a change the model can price raises the
// chance of that word there by `adviceGain` or more.

/// How much a change must raise the chance of the word asked at this level
/// to be worth saying: a twentieth.
public let adviceGain = 0.05
/// How far over the fridge preset an egg must start before "straight from the
/// fridge" is advice, C.
private let fridgeMarginC = 1.0

/// Whether the word asked is unsure enough to look for advice: a wild guess.
public func adviceWanted(_ c: Certainty) -> Bool {
    c == .wildGuess
}

/// What the setup alone does not say about the egg.
public struct AdviceFacts: Sendable, Equatable {
    public let eggFromClass: Bool
    public let startAssumed: Bool

    public init(eggFromClass: Bool, startAssumed: Bool) {
        self.eggFromClass = eggFromClass
        self.startAssumed = startAssumed
    }
}

/// A change of protocol the model can price: the same pot, one thing changed.
public struct PricedChange: Sendable, Equatable {
    public let key: String
    public let setup: CookSetup
}

/// The changes the model can price, for this setup: ice instead of the
/// counter, and with the heat off, twice the water. Never the tap, which the
/// model prices the same as ice.
public func pricedChanges(_ setup: CookSetup) -> [PricedChange] {
    var out: [PricedChange] = []
    if setup.cooling == .counter {
        var ice = setup
        ice.cooling = .ice
        out.append(PricedChange(key: "advice.ice", setup: ice))
    }
    if setup.afterBoil == .off && setup.waterLitres < Limits.waterLitres.upperBound {
        var more = setup
        more.waterLitres = min(Limits.waterLitres.upperBound, 2 * setup.waterLitres)
        out.append(PricedChange(key: "advice.moreWater", setup: more))
    }
    return out
}

/// The advice the model cannot price: the inputs it takes as exact.
public func unpricedAdvice(_ setup: CookSetup, facts: AdviceFacts) -> [String] {
    var keys: [String] = []
    if facts.startAssumed && setup.eggStartC > StartTempPresets.fridgeC + fridgeMarginC {
        keys.append("advice.fridge")
    }
    if facts.eggFromClass { keys.append("advice.weigh") }
    return keys
}

/// A profile's chance of the word asked at a level, interpolated between its
/// nearest points either side that ask the same word, or the nearest such
/// point where only one side has one; 0 outside the profile.
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

/// What to say, and whether to show the way to it.
public struct ProtocolAdvice: Sendable, Equatable {
    /// Catalogue keys in the order shown: the unpriced advice, then each
    /// priced change that makes the word asked surer.
    public let keys: [String]
    /// Whether a priced change makes it surer: the link shows (with
    /// `adviceWanted`).
    public let surer: Bool
}

/// What to say under a wild guess: the unpriced advice, then each priced
/// change whose profile raises the chance of the word asked at `level` by
/// `adviceGain` or more over `pAsked`, the chance at the time on screen.
public func protocolAdvice(
    _ setup: CookSetup, facts: AdviceFacts, level: Double, pAsked: Double,
    priced: [(key: String, profile: OddsProfile)]
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

/// The answer at a level, with its time decided on the pot's surface: what
/// the screen shows, and what a cook started now carries. Both apps' one
/// copy of it (REVIEW-0.4.x, "Bloat and factoring" 1).
public struct DecidedAnswer: Sendable {
    /// The level decided for: the answer's (`LevelAnswer.level`), after any
    /// snap. The advice is priced here, against the chance of the word asked
    /// in `certainty`.
    public let level: Double
    /// The mean solve, re-read at the decided time with the nudge in it
    /// (`decidedSolution`): its verdict and limits are the mean solve's.
    public let solution: Solution
    /// The time decided, before the nudge, and its odds.
    public let decision: Decision
    /// What the egg at the nudged time will be like, on the same surface.
    public let outcome: Outcome
    /// How sure the app is of the egg at the nudged time, in words, and the
    /// likely time range (`certaintyAt`): the line under the time.
    public let certainty: CertaintyReading
    /// The nudge the time took (`appliedNudge`): all of it where a time is
    /// chosen for, none where the solver's own answer stands.
    public let nudgeS: Double
    /// Whether the word asked is a wild guess (`adviceWanted`) and the white
    /// sets, so there is a cook to advise on: the advice is looked for. The
    /// link shows when `protocolAdvice` also finds a change that helps.
    public let adviceWanted: Bool
}

/// Decide an answer: the time for `sol`, the mean solve at `level` (an
/// `answerAt`'s solution and level), on `grid`, this pot's decision surface;
/// held within the envelope of `profile`, or by nothing while it is nil
/// (DECISIONS.md 84); then moved by `nudgeS`, the nudge the app drew, where
/// a time is chosen for (E8). The solve is re-read at the time given and the
/// outcome predicted there. A level the odds warn of is decided at that level
/// like any other (DECISIONS.md 83).
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
