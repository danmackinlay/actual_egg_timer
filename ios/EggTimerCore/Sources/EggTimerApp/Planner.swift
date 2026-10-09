import Foundation
import Observation
import EggTimerCore
import EggTimerCopy
import EggTimerShared

/// Every input the solver has, and the answer it last gave.
///
/// The solve is roughly a dozen full simulations of ten thousand steps each, so
/// it does not belong on the main actor while a finger is on the slider. One
/// solve loop runs at a time, off the main actor, starting a solve at most
/// every 90 ms (`recompute`): a change while it solves is taken up when that
/// solve is done, whose answer is shown meanwhile, a step behind and without
/// the snap. Only an answer to the current question is applied in full.
///
/// The loop is not `Task.detached`, which does not inherit cancellation:
/// "Eggs in" cancels it (`currentSolution`), and a detached loop would go on
/// solving for a result thrown away.
///
/// This file holds the inputs and what is derived from them. The solve is in
/// Planner+Solve.swift, the learning from each egg in Planner+Learning.swift,
/// and the decision surfaces both of them share in DecisionGrids.swift.
///
/// What this class decides is only what a KITCHEN knows. The decisions above
/// the physics - snapping, which refusal applies, the texture bands, the
/// calibration grid, the bounds and the defaults - live in EggTimerCore's
/// Policy, so this app and the web app cannot answer differently.
@Observable
@MainActor
public final class Planner {
    // MARK: - Inputs

    public var doneness: Double = Defaults.doneness { didSet { changed() } }
    /// The size classes on this cook's carton: American in region US, EU
    /// everywhere else. Region only - not the language, not the units. Read
    /// once, like the web app's, and a stored index is carried into it by
    /// `carrySizeIndex` if the region has changed since.
    public let sizeClasses = sizeClassesFor(region: deviceRegion)
    /// Index into `sizeClasses`, or -1 for an egg that was weighed.
    public private(set) var sizeIndex: Int = Defaults.sizeIndex { didSet { changed() } }
    /// What the slider says when the egg was weighed. Ignored while a class is
    /// chosen, and kept, so that choosing Weighed again goes back to it.
    public private(set) var weighedMassG: Double = Defaults.eggMassKg * 1000 { didSet { changed() } }

    /// The mass the solver is given: the class's, or the weighed one.
    public var eggMassG: Double {
        sizeClasses.indices.contains(sizeIndex) ? sizeClasses[sizeIndex].massKg * 1000 : weighedMassG
    }

    /// `sizeClasses` by name, read with it, for the record.
    private let sizeTableInUse = sizeTableFor(region: deviceRegion)
    /// Where the egg's mass came from, for the record: the carton's class, or the
    /// slider - which is a scale as far as this screen is concerned.
    public var massFrom: MassFrom { sizeClasses.indices.contains(sizeIndex) ? .sizeClass : .scale }
    /// Whose carton, for a class; nil for a weighed egg.
    public var sizeTable: SizeTable? { massFrom == .sizeClass ? sizeTableInUse : nil }

    /// A class from the menu, or -1 for Weighed, which goes back to the mass
    /// last weighed - the one its menu item names - as the web's "Measured
    /// below" does.
    public func chooseSize(_ index: Int) {
        sizeIndex = index
    }

    /// The slider. A weighed egg is better information than a carton, so moving
    /// it overrides the class - the same rule as measuring on the web.
    public func weigh(_ grams: Double) {
        weighedMassG = grams
        sizeIndex = -1
    }

    /// Restore from storage without going through the rules above.
    public func restoreSize(index: Int, weighedMassG grams: Double) {
        weighedMassG = grams
        sizeIndex = index
    }
    /// Where the egg comes from: the fridge, the room, or a temperature the
    /// cook knows better (the web's `startTempMode`).
    public var startTemp: EggFrom = .fridge { didSet { changed() } }
    /// The egg's temperature when it is Custom. Kept while another choice is
    /// made, so choosing Custom again goes back to it.
    public var customStartC: Double = Defaults.customStartC { didSet { changed() } }
    public var cooling: Cooling = .ice { didSet { changed() } }
    /// Where the egg starts. Cold start: into cold water, and the heating ramp
    /// is part of the cook. Hot start: into water already at a rolling boil.
    /// Sous-vide: into a bath already at the target temperature, which is not a
    /// cook this solver can time at all - see `sousVide` below.
    ///
    /// Cold is the default because it is the better way to boil an egg: the
    /// shell is never thermally shocked, and the app can MEASURE the ramp
    /// instead of assuming it. The cost is that it needs you to tap the boil.
    public var start: StartChoice = .cold { didSet { changed() } }

    /// A cold start, as the pan solver and the phase machine mean it. Sous-vide
    /// is neither: it answers false here and is filtered out by `isSousVide`
    /// before anything reads this.
    public var coldStart: Bool { start == .cold }

    /// True when there is no pan at all. The readout, the action button and the
    /// solve all branch on it.
    public var isSousVide: Bool { start == .sousVide }
    /// The standing method - heat off at the boil, lid on. The pan coasts down
    /// and the cook is whatever the stored heat can still do.
    public var heatOff: Bool = false { didSet { changed() } }
    public var altitudeM: Double = Defaults.altitudeM { didSet { changed() } }
    public var waterLitres: Double = Defaults.waterLitres { didSet { changed() } }
    /// An Int, because eggs are. The core takes a Double, because it mirrors a
    /// TypeScript `number`; that is the core's business rather than the app's,
    /// and the conversion belongs at the boundary, not in the control.
    public var eggCount: Int = Defaults.eggCount { didSet { changed() } }

    // MARK: - Units

    /// The system this phone starts in: its temperature preference, then its
    /// measurement system, then its region (`regionalUnits`). Read once, like
    /// the size classes.
    public let regionalUnits = platformUnits()
    /// Metric or Imperial as the COOK chose it, or nil if they never have. Not
    /// the system on screen, which falls back to `regionalUnits`: storing that
    /// instead would turn a default into a choice nobody made. Saved, but no
    /// re-solve: the egg does not change when its numbers change clothes.
    public private(set) var unitsChosen: UnitSystem? { didSet { if !applying { SettingsStore.save(self) } } }

    /// The system on screen.
    public var units: UnitSystem { effectiveUnits(chosen: unitsChosen, regional: regionalUnits) }

    /// The cook picks a system. A change of system is posted as
    /// `.unitsFlipped`, which the switch into 1750 listens for
    /// (`LanguageChoice`); a default never is.
    public func chooseUnits(_ next: UnitSystem) {
        let choice = EggTimerCore.chooseUnits(chosen: unitsChosen, regional: regionalUnits, next: next)
        unitsChosen = choice.chosen
        if let flip = choice.flip {
            NotificationCenter.default.post(name: .unitsFlipped, object: self, userInfo: ["flip": flip.rawValue])
        }
    }

    /// Restore from storage without saving it straight back.
    public func restoreUnits(_ chosen: UnitSystem?) {
        unitsChosen = chosen
    }

    // MARK: - The thermometer

    /// "I have a probe thermometer": when the cooling ends, ask for one reading
    /// from the middle of the egg - the alarm says so, and the line under the
    /// cooling countdown - and offer a room temperature. Off until the cook
    /// says so. The reading's field after a cook is there whatever this is
    /// (DECISIONS.md 92).
    public private(set) var probe = false

    /// The setting, from the controls. It brings a measured room into the
    /// model, or takes it out (`roomInUseC`), so the pot is solved again.
    public func setProbe(_ on: Bool) {
        probe = on
        changed()
    }

    /// Restore from storage without saving it straight back.
    public func restoreProbe(on: Bool) {
        probe = on
    }

    /// The room as the cook measured it, C, or nil for not measured, when a
    /// room is assumed. Offered, and counted, only while `probe` is on
    /// (`roomInUse`); kept while it is off, for when it comes back on.
    public private(set) var roomC: Double?

    /// The room, from Settings; nil is "not measured". Clamped like anything
    /// typed.
    public func setRoom(_ c: Double?) {
        roomC = c.map { clamp($0, to: Limits.roomC) }
        changed()
    }

    /// Restore from storage without saving it straight back.
    public func restoreRoom(_ c: Double?) {
        roomC = c.map { clamp($0, to: Limits.roomC) }
    }

    /// The room the model is told about, or nil to assume one.
    public var roomInUseC: Double? { roomInUse(probe: probe, roomC: roomC) }

    /// The readings the app takes for this cook, C: outside them it is a typo,
    /// the white or another egg, and is refused rather than folded.
    public func probeRange(egg: Egg, setup: CookSetup, cookTimeS: Double) -> (low: Double, high: Double) {
        plausibleProbeRangeC(
            egg: egg, setup: setup, params: calibrationParams(calibration), cookTimeS: cookTimeS
        )
    }

    /// One quantity in the system on screen.
    public func measure(_ q: Quantity) -> Measure { measureFor(q, system: units, region: deviceRegion) }

    /// A value stored in SI, as the cook reads it: "4 °C", "39 °F", "2.4 oz".
    public func show(_ q: Quantity, _ si: Double) -> String { showIn(units, q, si) }

    // MARK: - Outputs
    //
    // Written only by the Planner and its extensions (Planner+Solve.swift,
    // Planner+Learning.swift). Internal rather than `private(set)` because
    // Swift's `private` stops at the file; nothing outside the Planner writes
    // them.

    /// The cook the pan is being asked for, or nil while there is no answer -
    /// which includes sous-vide, where there is no pan to solve for. A nil
    /// solution is already what disables the start button, so the sous-vide
    /// screen's dead action needs no second rule.
    public var solution: Solution?
    /// What this kitchen has learned from its own eggs, and the eggs themselves:
    /// the posterior, the base it started from, and the log it was folded from.
    public var kept = Calibrations.freshKept()
    /// What this kitchen has learned from its own eggs. Before any feedback it
    /// is the prior, whose mean IS the literature value - so calibration is
    /// purely additive and the app is fully useful on day one.
    public var calibration: Calibration { kept.calibration }

    /// A new cook, a new nudge.
    public func redrawNudge() {
        nudgeDraw = nudgeSeconds(Double.random(in: 0..<1))
    }
    /// True while the dose surface is being rebuilt after an outcome.
    public var learning = false
    /// The warning line while idle, in words, or empty: why the requested
    /// doneness was refused, the point being to teach the constraint rather
    /// than merely to block the control; or else that the level on screen is
    /// a wild guess so far, a dotted one (`warningKey`).
    public var warning = ""
    /// The choice behind the time on screen: the odds, and how far it leaned
    /// from the mean solve. Nil until this pot's decision surface has been
    /// built, and on the sous-vide screen.
    public var decision: Decision?
    /// The odds at every level for the pot on screen and the posterior as it
    /// stands (Reach.swift): the track's shading, and the range the slider
    /// offers. Nil until it has been worked out, after this pot's surface;
    /// until then the physical limits are the whole rule.
    public var oddsProfile: OddsProfile?
    /// What the egg at the chosen time will be like (`predictOutcome`, read at
    /// the decided time on the decision's own surface): the white's line. Nil
    /// whenever `decision` is.
    public var outcome: Outcome?
    /// How sure I am of the time on screen (`certaintyAt`, read with the
    /// outcome): the line under the time, what pressing it opens, and the
    /// bracket under the slider (`wordBracket`). Nil
    /// whenever `decision` is.
    public var certainty: CertaintyReading?
    /// This launch's nudge (E8, DECISIONS.md 61): a whole number of seconds
    /// from -10 to +10, drawn at launch and again after each cook, so the
    /// time on screen holds still while the cook looks at it.
    public var nudgeDraw = nudgeSeconds(Double.random(in: 0..<1))
    /// The nudge the time takes now: the draw while sharing is on, none while
    /// it is off - the consent covers it, and nothing else does.
    public var nudgeS: Double { Services.sharing.state.on ? nudgeDraw : 0 }
    /// The nudge the time on screen took (`appliedNudge`): what a cook started
    /// now carries, and its record keeps apart from the time recommended.
    public var appliedNudgeS: Double = 0
    /// Under a wild guess, what would make this cook more reliable, as
    /// catalogue keys in the order shown; empty when there is nothing to say.
    public var advice: [String] = []
    /// Whether the way to Help's advice shows (Reach.swift, `protocolAdvice`):
    /// the word asked is a wild guess at the time on screen, and a change the
    /// model can price makes it surer. Never in sous-vide, or where the white
    /// never sets (`DecidedAnswer.adviceWanted`).
    public var adviceShown = false
    /// What the white's line is about, and what a cook
    /// started now is timed by: the choice on screen's outcome,
    /// once this pot's surface has landed. Nil before that, where the white
    /// never sets, and in sous-vide.
    public var shownOutcome: Outcome? {
        guard !isSousVide, decision != nil, solution?.whiteSets == true else { return nil }
        return outcome
    }
    /// How sure I am of the choice on screen, under the same conditions.
    public var shownCertainty: CertaintyReading? {
        guard !isSousVide, decision != nil, solution?.whiteSets == true else { return nil }
        return certainty
    }

    // MARK: - Held on screen

    /// The shading, the outcome and the advice link as last shown, kept
    /// while a new pot's surface is built (`hold()`), so a tap on a stepper
    /// does not blank them for the second that takes and bring them back.
    /// Display only: what a cook started now carries is `decision` and
    /// `shownOutcome`, which are nil until the surface lands.
    public struct Held {
        public var profile: OddsProfile?
        public var outcome: Outcome?
        public var certainty: CertaintyReading?
        public var adviceShown = false
    }
    public var held = Held()

    /// Take what is on screen into `held`, wherever it is this pot's own.
    public func hold() {
        if let p = oddsProfile { held.profile = p }
        if decision != nil {
            held.outcome = shownOutcome
            held.certainty = shownCertainty
            held.adviceShown = adviceShown
        }
    }

    /// Whether something held may stand in: a pan whose white sets, with this
    /// pot's own not in yet.
    private var holding: Bool { !isSousVide && solution?.whiteSets == true }

    /// The track's shading: this pot's odds, or the last shown until they land.
    public var shownProfile: OddsProfile? { oddsProfile ?? (holding ? held.profile : nil) }
    /// The white's line: this pot's, or the last shown until its surface
    /// lands.
    public var heldOutcome: Outcome? { decision != nil ? shownOutcome : (holding ? held.outcome : nil) }
    /// The line under the time and the bracket, likewise.
    public var heldCertainty: CertaintyReading? { decision != nil ? shownCertainty : (holding ? held.certainty : nil) }
    /// The way to Help's advice, likewise.
    public var shownAdvice: Bool {
        decision != nil ? (!isSousVide && adviceShown) : (holding && held.adviceShown)
    }

    // MARK: - Bookkeeping
    //
    // The solve's and the learning's own state. Internal for the same reason
    // as the outputs, and for no one else.

    /// Profiles asked for and not yet in, so each lands once.
    public var profilesAsked = Set<String>()

    /// The live egg once folded: its place in the log, the surface it was
    /// scored against, and the calibration as it stood before it - so that a
    /// second answer folds the egg again rather than on top of itself.
    public struct Folded: Sendable {
        public let index: Int
        public let grid: DoseGrid
        public let before: Calibration
    }
    public var folded: Folded?

    /// The solve loop in flight, if one is (`recompute`), and which run it is.
    public var task: Task<Void, Never>?
    public var solverRun = 0
    /// When the loop last started a solve, for the throttle.
    public var lastSolveStart: ContinuousClock.Instant?
    /// Waiting for the inputs to sit still before building a new pot's surface.
    public var settleTask: Task<Void, Never>?
    /// Bumped by every `recompute()`: which question the inputs are asking.
    public var asked = 0
    /// Which question `solution` answers, or nil when it answers none of them -
    /// nothing yet. `solution` is current only when
    /// this equals `asked`; between an input change and the coalesced solve
    /// landing, it is the answer to the PREVIOUS inputs.
    public var answered: Int?
    /// Bumped by "forget what it learned", so a fold still running when the
    /// button is pressed lands on nothing rather than on the fresh prior.
    public var generation = 0
    /// The egg on screen, whose second answer may still come. Every other egg in
    /// the log is folded quietly.
    public var liveIndex: Int?
    public var draining = false
    /// Set while the solver is moving the slider itself, so that snapping to a
    /// reachable position does not start another solve.
    public var applying = false
    public var boilMemory: BoilMemory = [:]
    private var loaded = false
    /// Set while a cook runs: a change to a control is then a correction in
    /// hand (`Edits.controlsChanged`), and is neither saved nor solved for.
    @ObservationIgnored public var onEdit: (() -> Void)?

    /// The controls set to a running cook's own choices, as they stood when
    /// it was stored (a relaunch): what the controls show while it runs
    /// (design/one-screen.md section 4, review 2.5). Neither saved nor
    /// solved for: a correction writes the settings it changes. The room is
    /// left as it is, since the choices hold only the room in use.
    public func adopt(_ c: CookChoices) {
        applying = true
        defer { applying = false }
        doneness = c.level
        if c.massFrom == .sizeClass,
           let i = sizeClasses.firstIndex(where: { abs($0.massKg - c.massKg) < 1e-12 }) {
            sizeIndex = i
        } else {
            weighedMassG = c.massKg * 1000
            sizeIndex = -1
        }
        startTemp = c.eggFrom
        customStartC = c.customStartC
        start = c.startMode == .cold ? .cold : .hot
        heatOff = c.afterBoil == .off
        cooling = c.cooling
        waterLitres = c.waterLitres
        eggCount = Int(c.eggCount.rounded())
        altitudeM = c.altitudeM
    }

    /// Read what was stored and solve for it.
    ///
    /// NOT `init`. `@State private var model = AppModel()`, which makes the
    /// Planner, evaluates its initial value on every construction of the view
    /// struct, and SwiftUI keeps only the first instance - so I/O and a solve
    /// in `init` ran for every discarded Planner as well, and those solves ran
    /// to completion. `Cook` already avoids exactly this by doing its restore
    /// from `onAppear`; this does the same, and is idempotent so a second
    /// `onAppear` costs nothing.
    public func load() {
        guard !loaded else { return }
        loaded = true
        // Load with saving suppressed. Each assignment would otherwise fire
        // `changed()` and write the WHOLE settings object back - including the
        // properties not yet loaded, still sitting at their defaults - so
        // restoring `doneness` would overwrite the stored altitude with zero
        // before the next line ever got to read it.
        applying = true
        kept = Calibrations.load()
        boilMemory = BoilMemories.load()
        SettingsStore.load(into: self)
        applying = false
        recompute()
        // Eggs written down but not yet folded - the app was killed mid-fold, or
        // the posterior had to be rebuilt from the log - are folded now, off the
        // main actor. The app runs on what it had until they land.
        if kept.folded < kept.log.count {
            Task { await drain() }
        }
    }

    // MARK: - Derived setup

    /// The cook as the controls choose it, in SI: core's `CookChoices`, which
    /// a cook started now holds as its own (the web's `choicesOf`). Sous-vide
    /// is neither start, and says hot here; nothing starts one.
    public var choices: CookChoices {
        CookChoices(
            massKg: eggMassG / 1000, massFrom: massFrom, sizeTable: sizeTable, eggFrom: startTemp,
            customStartC: customStartC, roomC: roomInUseC, startMode: coldStart ? .cold : .hot,
            afterBoil: heatOff ? .off : .hold, cooling: cooling, waterLitres: waterLitres,
            eggCount: Double(eggCount), altitudeM: altitudeM, level: doneness
        )
    }

    /// The egg and the pot the solver is told, from core (`cookSetupOf`), with
    /// this pan's remembered time to boil: the one assembly both apps share.
    public var pot: CookPot { cookSetupOf(choices, timeToBoilS: timeToBoilS) }

    public var egg: Egg { pot.egg }

    public var boilingC: Double { Thermo.boilingPointAtAltitude(altitudeM) }

    /// Time to a rolling boil, s - the pan's one measured number. Remembered
    /// per water volume, because the same pan on the same hob gives the same
    /// answer next time. It is the length of a cold start's ramp and nothing
    /// more: with the heat off the pan's cooling comes from the water volume
    /// (`Protocols.panTimeConstant`), so a hot start carries it only for the
    /// record, which says which pan was assumed.
    public var timeToBoilS: Double { estimateTimeToBoil(boilMemory, litres: waterLitres) }

    public var hasBoilMemory: Bool { EggTimerCore.hasBoilMemory(boilMemory) }

    public var setup: CookSetup { pot.setup }

    /// The label moves with the finger; the numbers follow when the solve lands.
    public var label: String { tr(anchorNear(doneness).key) }

    public var eggsLogged: Int { calibration.eggsLogged }

    /// The isothermal limit for the egg and the calibrated alpha as they stand.
    ///
    /// Computed, where `solution` is stored and solved on a task. This one needs
    /// no integration at all - a bisection on the Fourier number and two closed
    /// forms - so putting it through the coalesce machinery would buy latency
    /// and a chance to be stale in exchange for nothing.
    public var sousVide: SousVideEstimate {
        let doneness = calibrationDoneness(calibration, level: doneness)
        return sousVideEstimate(
            radiusM: egg.radiusM,
            alphaM2s: calibrationParams(calibration).alphaM2s,
            bathC: sousVideBathC,
            yolkDoseMin: doneness.yolkDoseMin,
            whiteDoseMin: doneness.whiteDoseMin
        )
    }

    // MARK: - Measuring the boil

    /// Remember a measured time to a rolling boil for its volume, when a
    /// cook ends (`cookEnding`): the cook as last corrected, not the tap.
    /// Blended with whatever was already known, so one odd run - lid off, pan
    /// half empty - does not dominate.
    public func rememberBoil(_ boil: BoilToRemember) {
        boilMemory = EggTimerCore.rememberBoil(boilMemory, litres: boil.litres, seconds: boil.seconds)
        BoilMemories.save(boilMemory)
    }
}
