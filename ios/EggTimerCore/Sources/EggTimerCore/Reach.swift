import Foundation

/// The odds at every level the slider offers, and what follows from them:
/// which levels are offered at all, how the track is shaded, and when the app
/// says how to make a cook more reliable (the owner, 27 September).
///
/// A profile point is the odds the app shows when the slider sits at that
/// level - the mean solve there, decided on the pot's decision surface - so
/// the two cannot disagree. The levels are the two physical edges on the
/// slider's grid, every `profileStep` positions between them, and, once an egg
/// has taught something and a level reaches `reachOdds`, a bisection on the
/// slider's own grid at each end of the reachable range. With no level at
/// 3/10, or before the first egg, the odds refuse nothing and the physical
/// limits stand. The reasons, and the measurements, are in src/core/reach.ts,
/// which this is held to by fixtures/reach.json.

/// The odds a level must reach to be offered: 3/10 (owner, 27 September).
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
    /// odds refuse nothing. Both nil or both set.
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
public func oddsAtLevel(
    _ c: Calibration, egg: Egg, setup: CookSetup, grid: DoseGrid, level: Double
) -> Double {
    let sol = solveCookTime(
        egg: egg, setup: setup, params: calibrationParams(c), doneness: calibrationDoneness(c, level: level)
    )
    let logTarget = log10(donenessFromSlider(level).yolkDoseMin)
    return decide(c, grid: grid, solution: sol, logNominalTarget: logTarget).odds
}

/// The odds at every level the pot can deliver, and the range they allow.
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

// MARK: - The verdict

/// `verdictFor`, with the range the odds allow. A level the pan cannot
/// deliver keeps its physical reason, and snaps to the nearer end of the odds'
/// range; one it can deliver but the odds do not allow is `unlikelySoft` or
/// `unlikelyHard`. With no profile, or one that refuses nothing, this is
/// `verdictFor`.
public func verdictWithOdds(_ sol: Solution, level: Double, profile: OddsProfile?) -> Verdict {
    let v = verdictFor(sol, level: level)
    guard let profile, let softest = profile.softest, let hardest = profile.hardest else { return v }
    let wanted = v.wanted

    switch v.kind {
    case .whiteNeverSets:
        return v
    case .tooSoftForWhite:
        let to = max(v.snapTo ?? level, softest)
        let limit = anchorNear(to)
        return Verdict(
            kind: v.kind, wanted: wanted, limit: limit, snapTo: to > level ? to : nil,
            worthSaying: limit.key != wanted.key
        )
    case .harderThanPanReaches:
        let to = min(v.snapTo ?? level, hardest)
        let limit = anchorNear(to)
        return Verdict(
            kind: v.kind, wanted: wanted, limit: limit, snapTo: to < level ? to : nil,
            worthSaying: limit.key != wanted.key
        )
    default:
        break
    }
    if level < softest {
        let limit = anchorNear(softest)
        return Verdict(
            kind: .unlikelySoft, wanted: wanted, limit: limit, snapTo: softest,
            worthSaying: limit.key != wanted.key
        )
    }
    if level > hardest {
        let limit = anchorNear(hardest)
        return Verdict(
            kind: .unlikelyHard, wanted: wanted, limit: limit, snapTo: hardest,
            worthSaying: limit.key != wanted.key
        )
    }
    return v
}

// MARK: - The shading

/// How strongly the track is shaded at a level: its odds over the best
/// level's, 0 to 1.
public struct Shade: Sendable, Equatable {
    public let level: Double
    public let strength: Double
}

/// The shading's stops, one per profile point; empty with nothing to shade.
public func shadingOf(_ profile: OddsProfile) -> [Shade] {
    guard profile.best >= 0.05 else { return [] }
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
