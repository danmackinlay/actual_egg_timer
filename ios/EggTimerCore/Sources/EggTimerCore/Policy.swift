import Foundation

/// The decisions that turn a Solution into a cook, transliterated from
/// `src/core/policy.ts`.
///
/// These decisions live in core, not in each app, so that the two apps cannot
/// disagree about them: a default egg, a number of eggs in the pan, a
/// calibration grid.
///
/// The line is drawn at DECISIONS, not at words. Which refusal applies, where
/// the slider must move to, which texture band a temperature falls in, how wide
/// the calibration grid is: policy, pure, and conformance-tested against
/// `fixtures/policy.json`. The sentences a cook reads are not here: which key
/// a screen says is `Wording.swift`, and the text is the catalogue.
///
/// Pure, like the rest of this package: no UserDefaults, no SwiftUI, no clock.

// MARK: - Bounds

/// Bounds on every number a user can type or drag, in one place. They go onto
/// the controls, onto what is typed, and onto what comes back out of storage,
/// so the three cannot drift apart - and now they cannot drift between the two
/// apps either.
public enum Limits {
    /// Hens' eggs: an EU XL is 73 g and up, most under 80; above 90 is a
    /// double-yolker or another bird, which this model does not describe.
    public static let massG = 25.0...90.0
    public static let eggTempC = -2.0...40.0
    /// A kitchen's air, measured with the probe (the room setting): colder
    /// than 5 C is a cellar, hotter than 40 C a kitchen nobody cooks in.
    public static let roomC = 5.0...40.0
    public static let altitudeM = -400.0...5000.0
    public static let waterLitres = 0.25...12.0
    public static let eggCount = 1.0...24.0
    public static let doneness = 0.0...1.0
    /// Across every table. The table in use is shorter than this outside the
    /// US, so a stored index also goes through `carrySizeIndex`.
    public static let sizeIndex = -1.0...Double(max(sizeClasses.count, usSizeClasses.count) - 1)
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

func isWithin(_ value: Double, _ range: ClosedRange<Double>) -> Bool {
    value.isFinite && range.contains(value)
}

// MARK: - Defaults

/// What the two named egg-temperature buttons mean, C, when the room has not
/// been measured. Both platforms label the buttons from `startTempPresetC`,
/// so a button cannot say one thing and the model another.
public enum StartTempPresets {
    public static let fridgeC = 4.0
    public static let roomC = Constants.tRoomC
}

/// The two named egg-temperature buttons.
public enum StartTempPreset: String, Sendable {
    case fridge, room
}

/// What an egg-temperature button means, C, given the room as measured, or
/// nil when it has not been (`roomInUse`). An egg that has been sitting out is
/// at the room's temperature, so a measured room moves the Room button with
/// it; a fridge is a fridge.
public func startTempPresetC(_ preset: StartTempPreset, roomC: Double?) -> Double {
    switch preset {
    case .fridge: StartTempPresets.fridgeC
    case .room: roomC ?? StartTempPresets.roomC
    }
}

/// The room the model is told about, C, or nil to assume one: the cook's
/// measured room, from Settings, which is offered - and so counts - only while
/// they have said they have a probe thermometer (the owner's request of
/// 5 October 2026, DECISIONS.md 78). A setting out of sight changes nothing.
/// Clamped, like everything typed or stored.
public func roomInUse(probe: Bool, roomC: Double?) -> Double? {
    guard probe, let roomC, roomC.isFinite else { return nil }
    return clamp(roomC, to: Limits.roomC)
}

/// The room, as far as the model is concerned, given the egg's start and the
/// room as measured (`roomInUse`), or nil.
///
/// A measured room is the room. Without one: on the default path - eggs into
/// boiling water, straight into an ice bath - the room is worth nothing at
/// all, and on a cold start about two seconds per degree. It earns its keep
/// resting on the counter and standing with the heat off, and in both the user
/// has usually already said: an egg that has been sitting out IS at room
/// temperature. A fridge egg says nothing about the room, so that case keeps
/// the default.
public func ambientFor(eggStartC: Double, roomC: Double?) -> Double {
    if let roomC { return roomC }
    return eggStartC >= roomEggFromC ? eggStartC : Constants.tRoomC
}

/// An egg at or above this, C, has been sitting out, and is the room's
/// temperature; below it, it is a fridge egg and says nothing about the room.
public let roomEggFromC = 15.0

/// Fallback when no pan has ever been measured, s.
public let defaultTimeToBoilS = 480.0

/// The inputs a fresh install starts from. Both apps read these, because two
/// apps that answer differently out of the box are two different answers to the
/// same question - which is exactly what 4 eggs of 62.3 g here against 2 eggs of
/// 68 g on the web amounted to.
public enum Defaults {
    /// Index into the region's size classes - 'Large' in both tables, 68 g in
    /// the EU one and 60.2 g on an American carton.
    public static let sizeIndex = 2
    public static let customStartC = 12.0
    public static let altitudeM = 0.0
    public static let waterLitres = 2.0
    public static let eggCount = 2
    public static let doneness = 0.41
    /// The reference egg, an EU Large. The app takes its default from the
    /// region's table, `sizeClassesFor(region:)[sizeIndex]`. Derived rather
    /// than restated, so the size class and the mass can never disagree.
    public static let eggMassKg = sizeClasses[sizeIndex].massKg
}

/// A stored size index, read against the table in use now.
///
/// An index means something only inside one table, and the table can change
/// underneath a stored record: the phone's region changes, or - the case that
/// matters - a record saved before there were two tables is read by an
/// American. The index keeps its NAME. A cook who picked Large picked the word
/// on their carton, and the region says whose carton it is, so a Large stays a
/// Large and cooks at the new table's mass. Keeping the mass instead would leave
/// every American who never touched the control on the EU Large.
///
/// Both tables hold the same names at the same indices as far as the shorter
/// goes, so keeping the name is keeping the index. A Jumbo read outside the US
/// becomes Extra large. A weighed egg (-1) is weighed in any region.
public func carrySizeIndex(_ stored: Double, classes: [SizeClass]) -> Int {
    guard stored.isFinite else { return Defaults.sizeIndex }
    // Negatives first, so rounding never has to settle -0.5: Swift rounds that
    // tie away from zero and JavaScript towards +infinity.
    if stored < 0 { return -1 }
    return min(Int(stored.rounded()), classes.count - 1)
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
    /// The pan can deliver it, but it would hit the mark less than 3 times in
    /// 10 (`verdictWithOdds`, Reach.swift). Snap UP.
    case unlikelySoft
    /// The same at the firm end. Snap DOWN.
    case unlikelyHard
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
            worthSaying: limit.key != wanted.key
        )
    }

    let limit = anchorNear(sol.softestLevel)
    let snapped = snapUp(sol.softestLevel)
    return Verdict(
        kind: .tooSoftForWhite,
        wanted: wanted,
        limit: limit,
        snapTo: snapped > level ? snapped : nil,
        worthSaying: limit.key != wanted.key
    )
}

// MARK: - The texture

/// What the pan makes of the white: `runny` when it never gets the white the
/// dose that sets it, and otherwise what its peak temperature makes of it.
public enum WhiteBand: String, Sendable {
    case runny
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

public struct Texture: Sendable, Equatable {
    public let white: WhiteBand
    public let yolk: YolkBand
}

/// The texture note's thresholds, which are a reading of the model rather than
/// a turn of phrase - so they are decided here and worded in the app.
///
/// The bands read PEAK TEMPERATURES, while the white's own criterion is a dose
/// (`Solution.whiteSets`). The two disagree only when the pan never gets the
/// white there at all, and then the dose is the one telling the truth: the
/// white is runny, whatever its peak. See src/core/policy.ts.
public func textureFor(peakYolkC: Double, peakWhiteC: Double, whiteSets: Bool) -> Texture {
    let white: WhiteBand = !whiteSets ? .runny
        : (peakWhiteC < WhiteBandBelowC.justSet ? .justSet : (peakWhiteC < WhiteBandBelowC.set ? .set : .firm))
    let yolk: YolkBand
    switch peakYolkC {
    case ..<YolkBandBelowC.liquid: yolk = .liquid
    case ..<YolkBandBelowC.soft: yolk = .soft
    case ..<YolkBandBelowC.jammy: yolk = .jammy
    case ..<YolkBandBelowC.fudgy: yolk = .fudgy
    default: yolk = .set
    }
    return Texture(white: white, yolk: yolk)
}

/// The peak white temperature, C, below which the white is in each band; at or
/// above the last it is firm.
public enum WhiteBandBelowC {
    public static let justSet = 71.0
    public static let set = 82.0
}

/// The peak yolk temperature, C, below which the yolk is in each band; at or
/// above the last it is set.
public enum YolkBandBelowC {
    public static let liquid = 58.0
    public static let soft = 63.0
    public static let jammy = 68.0
    public static let fudgy = 73.0
}

/// The texture note as the catalogue's keys: the line's own key, and the key
/// of the fragment that fills each of its placeholders. The app renders the
/// fragments and hands them in; it chooses nothing.
public struct TextureNote: Sendable, Equatable {
    public let key: String
    public let parts: [String: String]
}

/// Which words a texture is said in. A white that never sets is the whole
/// note, "white stays runny" with no yolk after it, as the web has always said
/// it; every other white is named with its yolk. The keys are written out
/// whole so that the copy tests can find each one.
public func textureNoteKeys(_ t: Texture) -> TextureNote {
    let white: String
    switch t.white {
    case .runny: return TextureNote(key: "texture.white.runny", parts: [:])
    case .justSet: white = "texture.white.justSet"
    case .set: white = "texture.white.set"
    case .firm: white = "texture.white.firm"
    }
    let yolk: String
    switch t.yolk {
    case .liquid: yolk = "texture.yolk.liquid"
    case .soft: yolk = "texture.yolk.soft"
    case .jammy: yolk = "texture.yolk.jammy"
    case .fudgy: yolk = "texture.yolk.fudgy"
    case .set: yolk = "texture.yolk.set"
    }
    return TextureNote(key: "texture.note", parts: ["white": white, "yolk": yolk])
}

// MARK: - The calibration

/// Particles in the filter, and the seed they start from. Both apps must agree
/// or two identical kitchens learn two different things from the same egg.
public let particleCount = 1000
public let calibrationSeed: Int32 = 0x5eed_1e

/// Where to build the dose surface for one logged outcome.
///
/// This is the single most consequential thing in this file. The grid is handed
/// to `buildDoseGrid` by the CALLER, so its bounds decide what the particle
/// filter can see and therefore what the posterior becomes: two apps with
/// different grids learn different things from the same egg. It was duplicated
/// by hand in both apps, agreeing only by luck of maintenance.
///
/// The calibration grid's alpha bounds, as factors of the posterior's centre.
public let calibrationAlphaLow = 0.55
public let calibrationAlphaHigh = 1.8

/// The bounds bracket the plausible answer rather than the whole domain: alpha
/// within a factor of ~2 of where the posterior currently sits, and cook times
/// from a third of what was cooked to a bit over double it.
public func calibrationGrid(alphaCentre: Double, cookTimeS: Double) -> GridSpec {
    GridSpec(
        alphaMin: alphaCentre * calibrationAlphaLow,
        alphaMax: alphaCentre * calibrationAlphaHigh,
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

func volumeKey(_ litres: Double) -> String {
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
///
/// This is the FALLBACK: the countdown runs to the moment the yolk's
/// centre peaks (`coolingSecondsFor`). See src/core/policy.ts.
public let coolingSeconds = 180.0

/// The shortest counted cooling, s: a floor under a rounding.
public let coolingMinSeconds = 60.0

/// How long to count the cooling down, s from the pull: to the moment the
/// yolk's centre peaks, for this cook as the solver ran it.
public func coolingSecondsFor(_ result: CookResult) -> Double {
    let toPeak = result.peakYolkTimeS - result.cookTimeS
    if !(toPeak > 0.0) { return coolingSeconds }
    let whole = toPeak.rounded()
    return whole < coolingMinSeconds ? coolingMinSeconds : whole
}

/// Whether this cook has a moment to take a probe reading at: a counted
/// cooling that ends when the yolk's centre peaks. Not on the counter, and not
/// when the centre peaked before the egg came out.
public func probeMomentFor(_ result: CookResult, cooling: Cooling) -> Bool {
    if cooling == .counter { return false }
    return result.peakYolkTimeS - result.cookTimeS >= coolingMinSeconds
}

/// How many prior sds of the time-scale either side of the posterior mean a
/// kitchen may be and still have its reading taken.
public let probeAlphaSds = 3.0

/// How far past those kitchens' peaks a reading may land and still be taken, C.
public let probeMarginC = 3.0

/// The centre readings the app will take for this cook, C, as (low, high): a
/// reading outside is refused at entry rather than folded. See
/// src/core/policy.ts.
public func plausibleProbeRangeC(
    egg: Egg, setup: CookSetup, params: ModelParams, cookTimeS: Double
) -> (low: Double, high: Double) {
    let spread = exp(probeAlphaSds * Constants.alphaRelSD)
    let slow = simulate(
        egg: egg, setup: setup,
        params: ModelParams(alphaM2s: params.alphaM2s / spread, tauAirScale: params.tauAirScale),
        cookTimeS: cookTimeS
    )
    let fast = simulate(
        egg: egg, setup: setup,
        params: ModelParams(alphaM2s: params.alphaM2s * spread, tauAirScale: params.tauAirScale),
        cookTimeS: cookTimeS
    )
    let bath = coolingMediumC(setup.cooling, ambientC: setup.ambientC)
    let floor = min(setup.eggStartC, setup.ambientC, bath)
    let lo = min(slow.peakYolkC, fast.peakYolkC) - probeMarginC
    let hi = max(slow.peakYolkC, fast.peakYolkC) + probeMarginC
    return (lo < floor ? floor : lo, hi > setup.boilingC ? setup.boilingC : hi)
}

/// A slow hob: a cold start still not boiling this close to its provisional
/// deadline, s, has a slower hob than assumed. Both apps push the estimate out
/// to the time heating so far plus `slowHobExtraS`, at most once every
/// `slowHobEveryS`.
public let slowHobWhenLeftS = 45.0
public let slowHobExtraS = 60.0
public let slowHobEveryS = 10.0

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
    /// When the cook said the eggs were out, inside the pull's grace; nil until
    /// they do. The tap ends the pull, and the cooling (whose deadline the app
    /// then times from the tap) starts there.
    public let outAtS: Double?

    public init(cookEndS: Double, coolEndS: Double?, provisional: Bool, outAtS: Double? = nil) {
        self.cookEndS = cookEndS
        self.coolEndS = coolEndS
        self.provisional = provisional
        self.outAtS = outAtS
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
/// to come out, whatever happens to it next. It ends early only when the cook
/// says the eggs are out (`outAtS`).
public func phaseAt(_ d: Deadlines, nowS: Double) -> Phase {
    if d.provisional { return .heating }
    if nowS < d.cookEndS { return .cooking }
    let out = d.outAtS.map { nowS >= $0 } ?? false
    if nowS < d.cookEndS + pullGraceSeconds && !out { return .pull }
    guard let coolEndS = d.coolEndS else { return .done }
    return nowS < coolEndS ? .cooling : .done
}

// MARK: - Ringing

// When the iOS app sounds an alarm itself, because the system will not.
//
// The alarm is a pair of local notifications (`App/Alarm.swift`). When
// permission is refused, not yet given, or the request did not take, the app
// says "keep the app open" - and this is what makes that advice true: while
// the app is on screen it rings at each deadline itself. When a notification
// IS holding the deadline it rings nothing, because the notification's own
// sound is already presented in the foreground and a second one would double
// it.
//
// It lives in the core rather than in the app so it can be tested headlessly,
// as `phaseAt` is. It is not a transliteration: the web app has no
// notifications, so it rings at every deadline (`src/ui/app.ts`, `onTick`)
// and has nothing to decide.

/// A moment the cook is told about. The probe moment is not a third one:
/// it is the end of the counted cooling, and only its words differ.
public enum RingDeadline: String, Sendable, Hashable, CaseIterable {
    /// Out of the water, now.
    case pull
    /// The counted cooling is over - or, with a probe, the moment to read it.
    case cooled
}

/// Which deadline the app should ring for at this instant, or nil.
///
/// Pure, and takes the clock, like `phaseAt`. The caller asks on every tick and
/// rings for what comes back, then adds it to `rung`: a deadline rings once.
///
/// - Parameters:
///   - phase: the cook's phase now, with the cook's tap out of PULL applied.
///   - nowS: the time, s.
///   - pullS: the pull deadline, s.
///   - cooledS: the end of the counted cooling, s; nil when the egg rests on
///     the counter and there is no cooling to count.
///   - authorized: whether notifications are allowed; nil while that is not
///     known - the question is on screen, or was never answered.
///   - scheduled: the deadlines whose notification the system said it was
///     holding, read back rather than assumed. A notification that has been
///     delivered is no longer pending, so the caller keeps a past deadline in
///     here once it has been seen.
///   - rung: the deadlines already rung for this cook.
///   - onScreenSinceS: when the app last came on screen, s; nil while it is in
///     the background. A deadline that passed before that is not rung: the
///     cook who opens the app is looking at the screen that says it, and a
///     sound nobody could have heard in time is not an alarm.
public func deadlineToRing(
    phase: Phase,
    nowS: Double,
    pullS: Double,
    cooledS: Double?,
    authorized: Bool?,
    scheduled: Set<RingDeadline>,
    rung: Set<RingDeadline>,
    onScreenSinceS: Double?
) -> RingDeadline? {
    guard let onScreenSinceS else { return nil }

    let deadline: RingDeadline
    let atS: Double
    switch phase {
    case .pull:
        deadline = .pull
        atS = pullS
    case .done:
        // A counter rest ends at the pull, and has no moment of its own.
        guard let cooledS else { return nil }
        deadline = .cooled
        atS = cooledS
    case .idle, .heating, .cooking, .cooling:
        return nil
    }

    guard nowS >= atS, atS >= onScreenSinceS, !rung.contains(deadline) else { return nil }
    // The notification has it, and presents its own sound in the foreground.
    if authorized == true && scheduled.contains(deadline) { return nil }
    return deadline
}
