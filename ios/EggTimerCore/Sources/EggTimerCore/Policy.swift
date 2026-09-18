import Foundation

/// The decisions that turn a Solution into a cook, transliterated from
/// `src/core/policy.ts`.
///
/// Everything here used to live in `ios/App/Kitchen.swift` and again in
/// `src/ui/app.ts`, copied by hand, with nothing holding the two versions
/// together and no test on either. That is where every user-visible divergence
/// between the two apps came from - a different default egg, a different number
/// of eggs in the pan, and a calibration grid that agreed only by luck.
///
/// The line is drawn at DECISIONS, not at words. Which refusal applies, where
/// the slider must move to, which texture band a temperature falls in, how wide
/// the calibration grid is: policy, pure, and conformance-tested against
/// `fixtures/policy.json`. The sentences a cook reads stay in the app, because
/// they are copy and they differ per platform.
///
/// Pure, like the rest of this package: no UserDefaults, no SwiftUI, no clock.

// MARK: - Bounds

/// Bounds on every number a user can type or drag, in one place. They go onto
/// the controls, onto what is typed, and onto what comes back out of storage,
/// so the three cannot drift apart - and now they cannot drift between the two
/// apps either.
public enum Limits {
    public static let massG = 25.0...120.0
    public static let girthMM = 90.0...200.0
    public static let minorMM = 30.0...60.0
    public static let eggTempC = -2.0...40.0
    public static let altitudeM = -400.0...5000.0
    public static let waterLitres = 0.25...12.0
    public static let eggCount = 1.0...24.0
    public static let doneness = 0.0...1.0
    /// A tap under half a minute is a double tap, not a boil; over two hours is
    /// an app left open.
    public static let timeToBoilS = 30.0...7200.0
}

/// Clamp a number that is already a number. A non-finite value is not a reading
/// at all, so it pins to the floor rather than propagating.
public func clamp(_ value: Double, to range: ClosedRange<Double>) -> Double {
    guard value.isFinite else { return range.lowerBound }
    return min(range.upperBound, max(range.lowerBound, value))
}

public func isWithin(_ value: Double, _ range: ClosedRange<Double>) -> Bool {
    value.isFinite && range.contains(value)
}

// MARK: - Defaults

/// What the two named egg-temperature buttons mean, C. Their labels are
/// rendered from this on both platforms, so a button cannot say one thing and
/// the model another.
public enum StartTempPresets {
    public static let fridgeC = 4.0
    public static let roomC = Constants.tRoomC
}

/// The room, as far as the model is concerned, given the egg's start.
///
/// There is no separate input for it, and there should not be: on the default
/// path - eggs into boiling water, straight into an ice bath - the room is
/// worth nothing at all, and on a cold start about two seconds per degree. It
/// earns its keep resting on the counter and standing with the heat off, and in
/// both the user has usually already said: an egg that has been sitting out IS
/// at room temperature. A fridge egg says nothing about the room, so that case
/// keeps the default.
public func ambientFor(eggStartC: Double) -> Double {
    eggStartC >= 15 ? eggStartC : Constants.tRoomC
}

/// Fallback when no pan has ever been measured, s.
public let defaultTimeToBoilS = 480.0

/// The inputs a fresh install starts from. Both apps read these, because two
/// apps that answer differently out of the box are two different answers to the
/// same question - which is exactly what 4 eggs of 62.3 g here against 2 eggs of
/// 68 g on the web amounted to.
public enum Defaults {
    /// Index into `sizeClasses` - 'Large', 68 g.
    public static let sizeIndex = 2
    public static let customMinorMM = 44.0
    public static let customStartC = 12.0
    public static let altitudeM = 0.0
    public static let waterLitres = 2.0
    public static let eggCount = 2
    public static let doneness = 0.41
    /// Derived rather than restated, so the size class and the mass can never
    /// disagree.
    public static let eggMassKg = sizeClasses[sizeIndex].massKg
}

// MARK: - The slider

/// Positions per unit of slider travel. A snapped level always lands where the
/// thumb can sit.
public let sliderSteps = 100.0

/// Round a level onto the slider's grid, away from the unreachable side. The
/// nudge keeps a level already on the grid from being pushed a whole step by
/// floating-point noise.
public func snapUp(_ level: Double) -> Double {
    clamp((level * sliderSteps - 1e-9).rounded(.up) / sliderSteps, to: Limits.doneness)
}

public func snapDown(_ level: Double) -> Double {
    clamp((level * sliderSteps + 1e-9).rounded(.down) / sliderSteps, to: Limits.doneness)
}

/// The labelled position nearest a slider level. An exact tie goes to the
/// softer anchor, because the table is walked in order and only a strictly
/// smaller gap displaces the incumbent. Stated rather than left implicit: it
/// decides which refusal sentence a cook reads, so both ports must agree.
public func anchorNear(_ level: Double) -> DonenessAnchor {
    var best = donenessAnchors[0]
    var bestGap = abs(best.level - level)
    for i in 1..<donenessAnchors.count {
        let gap = abs(donenessAnchors[i].level - level)
        if gap < bestGap {
            bestGap = gap
            best = donenessAnchors[i]
        }
    }
    return best
}

/// Peak yolk temperature the slider is asking for, interpolated between the
/// anchors. The dose scale is logarithmic precisely so that this is linear in
/// temperature, so a straight interpolation is right - and it costs nothing,
/// which lets the reading track the finger while the real solve catches up.
public func targetPeakYolkC(_ level: Double) -> Double {
    let last = donenessAnchors.count - 1
    if level <= donenessAnchors[0].level { return donenessAnchors[0].approxPeakYolkC }
    for i in 0..<last {
        let a = donenessAnchors[i]
        let b = donenessAnchors[i + 1]
        if level <= b.level {
            let span = b.level - a.level
            guard span > 0 else { return b.approxPeakYolkC }
            let t = (level - a.level) / span
            return a.approxPeakYolkC + t * (b.approxPeakYolkC - a.approxPeakYolkC)
        }
    }
    return donenessAnchors[last].approxPeakYolkC
}

// MARK: - The verdict

/// Why a requested doneness was refused, if it was.
///
///  - `tooSoftForWhite`      even the shortest cook that sets the white already
///                           overshoots the yolk. Snap UP.
///  - `harderThanPanReaches` the heat is off and the pan runs out before the
///                           yolk gets there. Snap DOWN.
///  - `whiteNeverSets`       the water falls past what the white needs while the
///                           egg is still in it. Nothing on the slider is on
///                           offer, so there is nowhere to snap to.
public enum RefusalKind: String, Sendable {
    case none
    case tooSoftForWhite
    case harderThanPanReaches
    case whiteNeverSets
}

public struct Verdict: Sendable {
    public let kind: RefusalKind
    /// The anchor the user asked for.
    public let wanted: DonenessAnchor
    /// The nearest anchor this pan can actually deliver - the softest for
    /// `tooSoftForWhite`, the hardest for `harderThanPanReaches`. Equal to
    /// `wanted` when there is nothing to say.
    public let limit: DonenessAnchor
    /// Where the slider must move to, or nil to leave it alone.
    public let snapTo: Double?
    /// False when the gap is real but too small to be worth a sentence: a
    /// sliver of unreachable track that rounds to the same label the user asked
    /// for. Only explain a refusal someone can actually taste.
    public let worthSaying: Bool
}

/// Read a Solution as a decision about the slider. Deliberately does NOT
/// re-solve: the caller decides whether the snapped position is worth a second
/// solve, because mid-cook it is not - the egg is already in the water.
public func verdictFor(_ sol: Solution, level: Double) -> Verdict {
    let wanted = anchorNear(level)

    if sol.reachable {
        return Verdict(kind: .none, wanted: wanted, limit: wanted, snapTo: nil, worthSaying: false)
    }

    if !sol.whiteSets {
        // Nothing to snap to: the slider has no reachable position at all. The
        // numbers shown are the furthest this pan goes, which is the only
        // honest thing left to put on screen - and it is always worth saying.
        return Verdict(
            kind: .whiteNeverSets, wanted: wanted, limit: wanted, snapTo: nil, worthSaying: true
        )
    }

    if level > sol.hardestLevel {
        let limit = anchorNear(sol.hardestLevel)
        let capped = snapDown(sol.hardestLevel)
        return Verdict(
            kind: .harderThanPanReaches,
            wanted: wanted,
            limit: limit,
            snapTo: capped < level ? capped : nil,
            worthSaying: limit.label != wanted.label
        )
    }

    let limit = anchorNear(sol.softestLevel)
    let snapped = snapUp(sol.softestLevel)
    return Verdict(
        kind: .tooSoftForWhite,
        wanted: wanted,
        limit: limit,
        snapTo: snapped > level ? snapped : nil,
        worthSaying: limit.label != wanted.label
    )
}

// MARK: - The texture

/// What the white's peak temperature makes of it.
public enum WhiteBand: String, Sendable {
    case justSet
    case set
    case firm
}

/// What the yolk's peak temperature makes of it.
public enum YolkBand: String, Sendable {
    case liquid
    case soft
    case jammy
    case fudgy
    case set
}

public struct Texture: Sendable {
    public let white: WhiteBand
    public let yolk: YolkBand
}

/// The texture note's thresholds, which are a reading of the model rather than
/// a turn of phrase - so they are decided here and worded in the app. Note
/// these read PEAK TEMPERATURES, while the white's own criterion is a dose: the
/// two disagree only when the pan never gets the white there at all, and then
/// the dose is the one telling the truth.
public func textureFor(peakYolkC: Double, peakWhiteC: Double) -> Texture {
    let white: WhiteBand = peakWhiteC < 71 ? .justSet : (peakWhiteC < 82 ? .set : .firm)
    let yolk: YolkBand
    switch peakYolkC {
    case ..<58: yolk = .liquid
    case ..<63: yolk = .soft
    case ..<68: yolk = .jammy
    case ..<73: yolk = .fudgy
    default: yolk = .set
    }
    return Texture(white: white, yolk: yolk)
}

// MARK: - The calibration

/// Particles in the filter, and the seed they start from. Both apps must agree
/// or two identical kitchens learn two different things from the same egg.
public let particleCount = 1000
public let calibrationSeed: Int32 = 0x5eed_1e

/// The dose surface's extent and resolution.
public struct GridSpec: Sendable {
    public let alphaMin: Double
    public let alphaMax: Double
    public let alphaCount: Int
    public let timeMinS: Double
    public let timeMaxS: Double
    public let timeCount: Int
}

/// Where to build the dose surface for one logged outcome.
///
/// This is the single most consequential thing in this file. The grid is handed
/// to `buildDoseGrid` by the CALLER, so its bounds decide what the particle
/// filter can see and therefore what the posterior becomes: two apps with
/// different grids learn different things from the same egg. It was duplicated
/// by hand in both apps, agreeing only by luck of maintenance.
///
/// The bounds bracket the plausible answer rather than the whole domain: alpha
/// within a factor of ~2 of where the posterior currently sits, and cook times
/// from a third of what was cooked to a bit over double it.
public func calibrationGrid(alphaCentre: Double, cookTimeS: Double) -> GridSpec {
    GridSpec(
        alphaMin: alphaCentre * 0.55,
        alphaMax: alphaCentre * 1.8,
        alphaCount: 21,
        timeMinS: max(60, cookTimeS * 0.35),
        timeMaxS: cookTimeS * 2.4,
        timeCount: 32
    )
}

// MARK: - Boil memory

/// Remembered time to a rolling boil, seconds, keyed by water volume in litres
/// to one decimal place. Same pan, same hob, same answer next time. Storage is
/// the app's business; how the numbers combine is this module's.
public typealias BoilMemory = [String: Double]

public func volumeKey(_ litres: Double) -> String {
    String(format: "%.1f", litres)
}

/// Blend a new measurement with what was already known for this volume, so one
/// odd run does not dominate. Returns the memory unchanged when the measurement
/// is not credible.
public func rememberBoil(_ memory: BoilMemory, litres: Double, seconds: Double) -> BoilMemory {
    guard isWithin(seconds, Limits.timeToBoilS) else { return memory }
    var updated = memory
    let key = volumeKey(litres)
    updated[key] = updated[key].map { 0.5 * $0 + 0.5 * seconds } ?? seconds
    return updated
}

/// Best guess at the time to a rolling boil for this volume: the exact
/// remembered value, else the nearest remembered volume scaled by litres
/// (energy is roughly proportional to mass), else the default.
///
/// The nearest volume is found over SORTED keys, and ties go to the smaller
/// volume. That is not fussiness: this walked a Dictionary here and insertion
/// order on the web, so two equidistant pans could give the two apps different
/// answers.
public func estimateTimeToBoil(_ memory: BoilMemory, litres: Double) -> Double {
    if let exact = memory[volumeKey(litres)] { return exact }

    let keys = memory.keys.sorted { (Double($0) ?? 0) < (Double($1) ?? 0) }
    var bestLitres = 0.0
    var bestSeconds = 0.0
    var bestDistance = Double.infinity
    for key in keys {
        guard let candidate = Double(key), candidate.isFinite, candidate > 0 else { continue }
        guard let seconds = memory[key] else { continue }
        let distance = abs(candidate - litres)
        if distance < bestDistance {
            bestDistance = distance
            bestLitres = candidate
            bestSeconds = seconds
        }
    }
    guard bestLitres > 0 else { return defaultTimeToBoilS }
    return clamp(bestSeconds * (litres / bestLitres), to: Limits.timeToBoilS)
}

public func hasBoilMemory(_ memory: BoilMemory) -> Bool {
    !memory.isEmpty
}

// MARK: - The phase rule

/// The phases of a cook, in order.
///
///     IDLE -> HEATING -> COOKING -> PULL -> COOLING -> DONE
public enum Phase: String, Sendable {
    case idle = "IDLE"
    case heating = "HEATING"
    case cooking = "COOKING"
    case pull = "PULL"
    case cooling = "COOLING"
    case done = "DONE"
}

/// Counted-down cooling. Carryover is what ruins a soft egg, so this is a stage
/// of the cook, not a suggestion appended to the end of it.
public let coolingSeconds = 180.0

/// If nobody confirms the transfer, assume it happened. A stalled timer at the
/// hob is worse than a slightly optimistic one.
public let pullGraceSeconds = 20.0

/// The deadlines a cook is made of, as epoch seconds. `coolEndS` is nil when
/// there is no cooling step to time - resting on the counter, where the
/// carryover IS the point rather than something to wait out.
public struct Deadlines: Sendable {
    public let cookEndS: Double
    public let coolEndS: Double?
    /// True on a cold start until the boil is tapped: the deadline is a guess.
    public let provisional: Bool

    public init(cookEndS: Double, coolEndS: Double?, provisional: Bool) {
        self.cookEndS = cookEndS
        self.coolEndS = coolEndS
        self.provisional = provisional
    }
}

/// Which phase a cook is in at a given instant.
///
/// Pure, and it takes the clock rather than reading it, so one render sees one
/// time. This is the rule both apps derive from, and it exists here because
/// they did not agree on it: this app checked for a cooling deadline BEFORE
/// checking the pull grace, so a counter rest - which has no cooling deadline -
/// fell straight from COOKING to DONE. "Out of the water — now" never appeared,
/// the 20 s grace never ran, and the phone still fired the pull notification at
/// a screen that already said Done. The web app always passed through PULL.
///
/// PULL is therefore unconditional: every cook has a moment where the egg has
/// to come out, whatever happens to it next.
public func phaseAt(_ d: Deadlines, nowS: Double) -> Phase {
    if d.provisional { return .heating }
    if nowS < d.cookEndS { return .cooking }
    if nowS < d.cookEndS + pullGraceSeconds { return .pull }
    guard let coolEndS = d.coolEndS else { return .done }
    return nowS < coolEndS ? .cooling : .done
}
