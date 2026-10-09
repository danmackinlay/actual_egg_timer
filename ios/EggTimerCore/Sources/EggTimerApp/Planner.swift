import Foundation
import Observation
import EggTimerCore
import EggTimerCopy
import EggTimerShared

/// Every input the solver has, and the answer it last gave.
///
/// The inputs are one value, the settings both apps keep (`settings`, core's
/// `AppSettings`), and a cook's choices are made from them (`choices`) and
/// back (`adopt`). This file holds them and what is derived from them. The
/// solve is `SolveLoop`, the learning from each egg `Learning`, and the
/// decision surfaces both of them share are in DecisionGrids.swift.
///
/// What this class decides is only what a KITCHEN knows. The decisions above
/// the physics - snapping, which refusal applies, the texture bands, the
/// calibration grid, the bounds and the defaults - live in EggTimerCore, so
/// this app and the web app cannot answer differently.
@Observable
@MainActor
public final class Planner {
    // MARK: - Inputs

    /// The controls, as both apps keep them: core's `AppSettings`, one value,
    /// stored as it is (`SettingsStore`). While a cook runs they are its own
    /// choices (`adopt`), and a change is a correction in hand (`Edits`).
    public var settings = AppSettings.defaults { didSet { settingsChanged(from: oldValue) } }

    /// A sous-vide on screen: never stored, so the pan under it
    /// (`settings.startMode`) stays the one saved.
    private var sousVideChosen = false

    /// The size classes on this cook's carton: American in region US, EU
    /// everywhere else. Region only - not the language, not the units. Read
    /// once, like the web app's, and a stored index is carried into it by
    /// `carrySizeIndex` if the region has changed since.
    public let sizeClasses = sizeClassesFor(region: deviceRegion)

    /// The mass the solver is given: the class's, or the weighed one.
    public var eggMassG: Double {
        sizeClasses.indices.contains(settings.sizeIndex)
            ? sizeClasses[settings.sizeIndex].massKg * 1000 : settings.weighedMassG
    }

    /// `sizeClasses` by name, read with it, for the record.
    private let sizeTableInUse = sizeTableFor(region: deviceRegion)
    /// Where the egg's mass came from, for the record: the carton's class, or the
    /// slider - which is a scale as far as this screen is concerned.
    public var massFrom: MassFrom { sizeClasses.indices.contains(settings.sizeIndex) ? .sizeClass : .scale }
    /// Whose carton, for a class; nil for a weighed egg.
    public var sizeTable: SizeTable? { massFrom == .sizeClass ? sizeTableInUse : nil }

    /// A class from the menu, or -1 for Weighed, which goes back to the mass
    /// last weighed - the one its menu item names - as the web's "Measured
    /// below" does.
    public func chooseSize(_ index: Int) {
        settings.sizeIndex = index
    }

    /// The slider. A weighed egg is better information than a carton, so moving
    /// it overrides the class - the same rule as measuring on the web.
    public func weigh(_ grams: Double) {
        var next = settings
        next.weighedMassG = grams
        next.sizeIndex = -1
        settings = next
    }

    /// Where the egg starts. Cold start: into cold water, and the heating ramp
    /// is part of the cook. Hot start: into water already at a rolling boil.
    /// Sous-vide: into a bath already at the target temperature, which is not a
    /// cook this solver can time at all - see `sousVide` below.
    ///
    /// Cold is the default because it is the better way to boil an egg: the
    /// shell is never thermally shocked, and the app can MEASURE the ramp
    /// instead of assuming it. The cost is that it needs you to tap the boil.
    public var start: StartChoice {
        get { sousVideChosen ? .sousVide : settings.startMode == .hot ? .hot : .cold }
        set {
            guard newValue != start else { return }
            sousVideChosen = newValue == .sousVide
            if newValue != .sousVide, settings.startMode.rawValue != newValue.rawValue {
                settings.startMode = newValue == .hot ? .hot : .cold
            } else {
                changed()
            }
        }
    }

    /// A cold start, as the pan solver and the phase machine mean it. Sous-vide
    /// is neither: it answers false here and is filtered out by `isSousVide`
    /// before anything reads this.
    public var coldStart: Bool { start == .cold }

    /// True when there is no pan at all. The readout, the action button and the
    /// solve all branch on it.
    public var isSousVide: Bool { start == .sousVide }
    /// The standing method - heat off at the boil, lid on. The pan coasts down
    /// and the cook is whatever the stored heat can still do.
    public var heatOff: Bool {
        get { settings.afterBoil == .off }
        set { settings.afterBoil = newValue ? .off : .hold }
    }

    /// A change of the settings: saved and solved for, or, while a cook runs,
    /// a correction in hand. The units alone are saved, and nothing solved:
    /// the egg does not change when its numbers change clothes.
    private func settingsChanged(from old: AppSettings) {
        guard !applying else { return }
        var rest = settings
        rest.unitsChosen = old.unitsChosen
        guard rest != old else {
            SettingsStore.save(self)
            return
        }
        changed()
    }

    // MARK: - Units

    /// The system this phone starts in: its temperature preference, then its
    /// measurement system, then its region (`regionalUnits`). Read once, like
    /// the size classes.
    public let regionalUnits = platformUnits()

    /// The system on screen: the cook's choice (`settings.unitsChosen`, never
    /// a default stored as one), else the phone's.
    public var units: UnitSystem { effectiveUnits(chosen: settings.unitsChosen, regional: regionalUnits) }

    /// The cook picks a system. A change of system is posted as
    /// `.unitsFlipped`, which the switch into 1750 listens for
    /// (`LanguageChoice`); a default never is.
    public func chooseUnits(_ next: UnitSystem) {
        let choice = EggTimerCore.chooseUnits(chosen: settings.unitsChosen, regional: regionalUnits, next: next)
        settings.unitsChosen = choice.chosen
        if let flip = choice.flip {
            NotificationCenter.default.post(name: .unitsFlipped, object: self, userInfo: ["flip": flip.rawValue])
        }
    }

    // MARK: - The thermometer

    /// "I have a probe thermometer" (`settings.probe`), from the controls: when
    /// the cooling ends, ask for one reading from the middle of the egg. It
    /// brings a measured room into the model, or takes it out (`roomInUseC`),
    /// so the pot is solved again.
    public func setProbe(_ on: Bool) {
        settings.probe = on
    }

    /// The room, from Settings; nil is "not measured". Clamped like anything
    /// typed.
    public func setRoom(_ c: Double?) {
        settings.roomC = c.map { clamp($0, to: Limits.roomC) }
    }

    /// The room the model is told about, or nil to assume one.
    public var roomInUseC: Double? { roomInUse(probe: settings.probe, roomC: settings.roomC) }

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
    // Written only by the Planner, its solve (`SolveLoop`) and its learning
    // (`Learning`).

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

    // MARK: - The solve and the learning

    /// The idle screen's solve (`SolveLoop`), and the learning from each egg
    /// (`Learning`): each with its own bookkeeping.
    @ObservationIgnored public private(set) var solver: SolveLoop!
    @ObservationIgnored public private(set) var learner: Learning!

    public init() {
        solver = SolveLoop(self)
        learner = Learning(self)
    }

    /// Re-solve for the inputs as they stand: when a cook ends (a new nudge,
    /// a pan the cook timed remembered), and when what the solve reads moves.
    public func refresh() {
        solver.recompute()
    }

    /// A change of the controls: saved and solved for, or, while a cook runs,
    /// a correction in hand (`Edits`), neither saved nor solved for here.
    public func changed() {
        guard !applying else { return }
        // While a cook runs the controls are its own: a change is a
        // correction in hand (`Edits`), neither saved nor solved for here.
        if let onEdit {
            onEdit()
            return
        }
        Perf.input()
        SettingsStore.save(self)
        solver.recompute()
    }

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
        var next = settings
        next.doneness = c.level
        if c.massFrom == .sizeClass, let i = sizeClasses.firstIndex(where: { abs($0.massKg - c.massKg) < 1e-12 }) {
            next.sizeIndex = i
        } else {
            next.weighedMassG = c.massKg * 1000
            next.sizeIndex = -1
        }
        next.startTempMode = c.eggFrom
        next.customStartC = c.customStartC
        next.startMode = c.startMode
        next.afterBoil = c.afterBoil
        next.cooling = c.cooling
        next.waterLitres = c.waterLitres
        next.eggCount = Int(c.eggCount.rounded())
        next.altitudeM = c.altitudeM
        sousVideChosen = false
        settings = next
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
        settings = SettingsStore.read(classes: sizeClasses)
        applying = false
        solver.recompute()
        // Eggs written down but not yet folded - the app was killed mid-fold, or
        // the posterior had to be rebuilt from the log - are folded now, off the
        // main actor. The app runs on what it had until they land.
        if kept.folded < kept.log.count {
            Task { await learner.drain() }
        }
    }

    // MARK: - Derived setup

    /// The cook as the controls choose it, in SI: core's `CookChoices`, which
    /// a cook started now holds as its own (the web's `choicesOf`). Sous-vide
    /// is neither start, and says hot here; nothing starts one.
    public var choices: CookChoices {
        let s = settings
        return CookChoices(
            massKg: eggMassG / 1000, massFrom: massFrom, sizeTable: sizeTable, eggFrom: s.startTempMode,
            customStartC: s.customStartC, roomC: roomInUseC, startMode: coldStart ? .cold : .hot,
            afterBoil: s.afterBoil, cooling: s.cooling, waterLitres: s.waterLitres,
            eggCount: Double(s.eggCount), altitudeM: s.altitudeM, level: s.doneness
        )
    }

    /// The egg and the pot the solver is told, from core (`cookSetupOf`), with
    /// this pan's remembered time to boil: the one assembly both apps share.
    public var pot: CookPot { cookSetupOf(choices, timeToBoilS: timeToBoilS) }

    public var egg: Egg { pot.egg }

    public var boilingC: Double { Thermo.boilingPointAtAltitude(settings.altitudeM) }

    /// Time to a rolling boil, s - the pan's one measured number. Remembered
    /// per water volume, because the same pan on the same hob gives the same
    /// answer next time. It is the length of a cold start's ramp and nothing
    /// more: with the heat off the pan's cooling comes from the water volume
    /// (`Protocols.panTimeConstant`), so a hot start carries it only for the
    /// record, which says which pan was assumed.
    public var timeToBoilS: Double { estimateTimeToBoil(boilMemory, litres: settings.waterLitres) }

    public var hasBoilMemory: Bool { EggTimerCore.hasBoilMemory(boilMemory) }

    public var setup: CookSetup { pot.setup }

    /// The label moves with the finger; the numbers follow when the solve lands.
    public var label: String { tr(anchorNear(settings.doneness).key) }

    public var eggsLogged: Int { calibration.eggsLogged }

    /// The isothermal limit for the egg and the calibrated alpha as they stand.
    ///
    /// Computed, where `solution` is stored and solved on a task. This one needs
    /// no integration at all - a bisection on the Fourier number and two closed
    /// forms - so putting it through the coalesce machinery would buy latency
    /// and a chance to be stale in exchange for nothing.
    public var sousVide: SousVideEstimate {
        let doneness = calibrationDoneness(calibration, level: settings.doneness)
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
