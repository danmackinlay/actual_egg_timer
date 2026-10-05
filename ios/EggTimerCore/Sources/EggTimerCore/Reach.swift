import Foundation

/// The odds at every level the slider offers, and what follows from them:
/// which levels the app warns of, how the track is shaded, and when the app
/// says how to make an egg more reliable.
///
/// A profile point is the odds the app computes when the slider sits at that
/// level - the mean solve there, decided on the pot's decision surface - so
/// the two cannot disagree. The levels are the two physical edges on the
/// slider's grid, every `profileStep` positions between them, and, once an egg
/// has taught something and a level reaches `reachOdds`, a bisection on the
/// slider's own grid at each end of the range at 3/10 or better. Outside that
/// range, and inside the physical edges, the app warns that the level comes
/// out right fewer than 3 times in 10 so far; it never refuses it, and only
/// what the pan cannot deliver moves the slider (DECISIONS.md 83). With no
/// level at 3/10, or before the first egg, nothing is warned of. The reasons,
/// and the measurements, are in src/core/reach.ts, which this is held to by
/// fixtures/reach.json.

/// The odds under which a level is warned of: 3/10, the owner's number.
public let reachOdds = 0.3

/// Slider positions between profile points.
public let profileStep = 5

public struct LevelOdds: Sendable, Equatable {
    public let level: Double
    public let odds: Double

    public init(level: Double, odds: Double) {
        self.level = level
        self.odds = odds
    }
}

public struct OddsProfile: Sendable, Equatable {
    /// Sorted by level, from `physicalSoftest` to `physicalHardest`. Empty when
    /// the white never sets.
    public let points: [LevelOdds]
    /// The best odds of any point: what the shading is relative to.
    public let best: Double
    /// The physical edges, on the slider's grid.
    public let physicalSoftest: Double
    public let physicalHardest: Double
    /// The softest and firmest levels at `reachOdds` or better, or nil when the
    /// odds warn of nothing. Both nil or both set. Outside them, and inside the
    /// physical edges, is what the track dots and the app warns of.
    public let softest: Double?
    public let hardest: Double?

    public init(
        points: [LevelOdds], best: Double, physicalSoftest: Double, physicalHardest: Double,
        softest: Double?, hardest: Double?
    ) {
        self.points = points
        self.best = best
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

/// The odds the app shows when the slider sits at `level`, a level the pan can
/// deliver: the mean solve there, decided on `grid`.
func oddsAtLevel(
    _ c: Calibration, egg: Egg, setup: CookSetup, grid: DoseGrid, level: Double
) -> Double {
    let sol = solveCookTime(
        egg: egg, setup: setup, params: calibrationParams(c), doneness: calibrationDoneness(c, level: level)
    )
    let logTarget = logYolkTarget(level)
    return decide(c, grid: grid, solution: sol, logNominalTarget: logTarget).odds
}

/// The odds at every level the pot can deliver, and where they reach 3/10.
/// `grid` is this pot's decision surface, for the same calibration.
public func oddsProfile(_ c: Calibration, egg: Egg, setup: CookSetup, grid: DoseGrid) -> OddsProfile {
    let edge = solveCookTime(
        egg: egg, setup: setup, params: calibrationParams(c), doneness: calibrationDoneness(c, level: 1.0)
    )
    let lo = positionUp(edge.softestLevel)
    let hi = positionDown(edge.hardestLevel)
    if !edge.whiteSets || hi < lo {
        return OddsProfile(
            points: [], best: 0, physicalSoftest: levelOf(lo), physicalHardest: levelOf(hi),
            softest: nil, hardest: nil
        )
    }

    var odds: [Int: Double] = [:]
    func at(_ position: Int) -> Double {
        if let known = odds[position] { return known }
        let p = oddsAtLevel(c, egg: egg, setup: setup, grid: grid, level: levelOf(position))
        odds[position] = p
        return p
    }

    var positions = [lo]
    var k = (lo / profileStep + 1) * profileStep
    while k < hi {
        positions.append(k)
        k += profileStep
    }
    if hi > lo { positions.append(hi) }
    var best = 0.0
    for k in positions {
        let p = at(k)
        if p > best { best = p }
    }

    var softest: Double?
    var hardest: Double?
    if c.eggsLogged > 0 && best >= reachOdds {
        var first = 0
        while at(positions[first]) < reachOdds { first += 1 }
        var last = positions.count - 1
        while at(positions[last]) < reachOdds { last -= 1 }

        var s = positions[first]
        if first > 0 {
            var under = positions[first - 1]
            while s - under > 1 {
                let mid = (under + s) / 2
                if at(mid) >= reachOdds { s = mid } else { under = mid }
            }
        }
        var h = positions[last]
        if last < positions.count - 1 {
            var over = positions[last + 1]
            while over - h > 1 {
                let mid = (h + over) / 2
                if at(mid) >= reachOdds { h = mid } else { over = mid }
            }
        }
        softest = levelOf(s)
        hardest = levelOf(h)
    }

    let points = odds.keys.sorted().map { LevelOdds(level: levelOf($0), odds: odds[$0]!) }
    for point in points where point.odds > best { best = point.odds }
    return OddsProfile(
        points: points, best: best, physicalSoftest: levelOf(lo), physicalHardest: levelOf(hi),
        softest: softest, hardest: hardest
    )
}

// MARK: - The warning

/// Whether the app warns that `level` comes out right fewer than 3 times in
/// 10 so far: true when the profile has a range at 3/10 or better and the
/// level is softer than its softest or firmer than its firmest. False with no
/// profile, or one that warns of nothing. It moves nothing: what the pan
/// cannot deliver is `verdictFor`'s.
public func lowOddsAt(_ profile: OddsProfile?, level: Double) -> Bool {
    guard let profile, let softest = profile.softest, let hardest = profile.hardest else { return false }
    return level < softest || level > hardest
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

/// How strongly the track is shaded at a level: its odds over the best
/// level's, 0 to 1.
public struct Shade: Sendable, Equatable {
    public let level: Double
    public let strength: Double
}

/// The best odds below which the track is not shaded at all: odds nowhere
/// worth a tenth, so there is no "where it works best" to show.
public let shadeBestMin = 0.05

/// The shading's stops, one per profile point; empty with nothing to shade.
public func shadingOf(_ profile: OddsProfile) -> [Shade] {
    guard profile.best >= shadeBestMin else { return [] }
    return profile.points.map {
        Shade(level: $0.level, strength: min(1, max(0, $0.odds / profile.best)))
    }
}

// MARK: - The advice

/// Below this many tenths, the chosen level's odds are low.
public let adviceBelowTenths = 5
/// And this many tenths under the best level is a clear margin.
public let adviceMarginTenths = 3
/// How much a change must raise this level's odds to be worth saying.
public let adviceGain = 0.05
/// How far over the fridge preset an egg must start before "straight from the
/// fridge" is advice, C.
private let fridgeMarginC = 1.0

/// Whether the odds at the chosen level are low enough to offer advice.
public func adviceWanted(_ oddsTenths: Int, profile: OddsProfile?) -> Bool {
    if oddsTenths < adviceBelowTenths { return true }
    guard let profile else { return false }
    return oddsInTenths(profile.best) - oddsTenths >= adviceMarginTenths
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

/// A profile's odds at a level, interpolated; 0 outside its points.
public func oddsNear(_ profile: OddsProfile, level: Double) -> Double {
    let pts = profile.points
    guard let first = pts.first, let last = pts.last, level >= first.level, level <= last.level else {
        return 0
    }
    for i in 1..<max(pts.count, 1) {
        let a = pts[i - 1]
        let b = pts[i]
        if level <= b.level {
            let span = b.level - a.level
            return span > 0 ? a.odds + (b.odds - a.odds) * ((level - a.level) / span) : b.odds
        }
    }
    return first.odds
}

/// What to say under low odds, as catalogue keys in the order shown.
public func protocolAdvice(
    _ setup: CookSetup, facts: AdviceFacts, level: Double, odds: Double,
    priced: [(key: String, profile: OddsProfile)]
) -> [String] {
    var keys = unpricedAdvice(setup, facts: facts)
    for change in priced where oddsNear(change.profile, level: level) - odds >= adviceGain {
        keys.append(change.key)
    }
    return keys
}
