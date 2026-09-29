import Foundation
import Observation
import EggTimerCore
import EggTimerCopy

/// Every input the solver has, and the answer it last gave.
///
/// The solve is roughly a dozen full simulations of ten thousand steps each, so
/// it does not belong on the main actor while a finger is on the slider. Each
/// change coalesces for a moment, then starts a task that cancels the one in
/// flight, and a result is only published if it is still the answer to the
/// current question.
///
/// The coalesce keeps most superseded slider ticks from starting, and the ones
/// that do start inherit cancellation and check it between solves. Not
/// `Task.detached`, which does not inherit cancellation: there `task?.cancel()`
/// would cancel only the wrapper, and every superseded tick would run its full
/// scan - about a second each with the heat off - for a result thrown away.
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
final class Planner {
    // MARK: - Inputs

    var doneness: Double = Defaults.doneness { didSet { changed() } }
    /// The size classes on this cook's carton: American in region US, EU
    /// everywhere else. Region only - not the language, not the units. Read
    /// once, like the web app's, and a stored index is carried into it by
    /// `carrySizeIndex` if the region has changed since.
    let sizeClasses = sizeClassesFor(region: deviceRegion)
    /// Index into `sizeClasses`, or -1 for an egg that was weighed.
    private(set) var sizeIndex: Int = Defaults.sizeIndex { didSet { changed() } }
    /// What the slider says when the egg was weighed. Ignored while a class is
    /// chosen, and kept, so that choosing Weighed again goes back to it.
    private(set) var weighedMassG: Double = Defaults.eggMassKg * 1000 { didSet { changed() } }

    /// The mass the solver is given: the class's, or the weighed one.
    var eggMassG: Double {
        sizeClasses.indices.contains(sizeIndex) ? sizeClasses[sizeIndex].massKg * 1000 : weighedMassG
    }

    /// `sizeClasses` by name, read with it, for the record.
    private let sizeTableInUse = sizeTableFor(region: deviceRegion)
    /// Where the egg's mass came from, for the record: the carton's class, or the
    /// slider - which is a scale as far as this screen is concerned.
    var massFrom: MassFrom { sizeClasses.indices.contains(sizeIndex) ? .sizeClass : .scale }
    /// Whose carton, for a class; nil for a weighed egg.
    var sizeTable: SizeTable? { massFrom == .sizeClass ? sizeTableInUse : nil }

    /// A class from the menu, or -1 for Weighed, which goes back to the mass
    /// last weighed - the one its menu item names - as the web's "Measured
    /// below" does.
    func chooseSize(_ index: Int) {
        sizeIndex = index
    }

    /// The slider. A weighed egg is better information than a carton, so moving
    /// it overrides the class - the same rule as measuring on the web.
    func weigh(_ grams: Double) {
        weighedMassG = grams
        sizeIndex = -1
    }

    /// Restore from storage without going through the rules above.
    func restoreSize(index: Int, weighedMassG grams: Double) {
        weighedMassG = grams
        sizeIndex = index
    }
    /// Where the egg comes from: the fridge, the room, or a temperature the
    /// cook knows better (the web's `startTempMode`).
    var startTemp: EggFrom = .fridge { didSet { changed() } }
    /// The egg's temperature when it is Custom. Kept while another choice is
    /// made, so choosing Custom again goes back to it.
    var customStartC: Double = Defaults.customStartC { didSet { changed() } }
    var cooling: Cooling = .ice { didSet { changed() } }
    /// Where the egg starts. Cold start: into cold water, and the heating ramp
    /// is part of the cook. Hot start: into water already at a rolling boil.
    /// Sous-vide: into a bath already at the target temperature, which is not a
    /// cook this solver can time at all - see `sousVide` below.
    ///
    /// Cold is the default because it is the better way to boil an egg: the
    /// shell is never thermally shocked, and the app can MEASURE the ramp
    /// instead of assuming it. The cost is that it needs you to tap the boil.
    var start: StartChoice = .cold { didSet { changed() } }

    /// A cold start, as the pan solver and the phase machine mean it. Sous-vide
    /// is neither: it answers false here and is filtered out by `isSousVide`
    /// before anything reads this.
    var coldStart: Bool { start == .cold }

    /// True when there is no pan at all. The readout, the action button and the
    /// solve all branch on it.
    var isSousVide: Bool { start == .sousVide }
    /// The standing method - heat off at the boil, lid on. The pan coasts down
    /// and the cook is whatever the stored heat can still do.
    var heatOff: Bool = false { didSet { changed() } }
    var altitudeM: Double = Defaults.altitudeM { didSet { changed() } }
    var waterLitres: Double = Defaults.waterLitres { didSet { changed() } }
    /// An Int, because eggs are. The core takes a Double, because it mirrors a
    /// TypeScript `number`; that is the core's business rather than the app's,
    /// and the conversion belongs at the boundary, not in the control.
    var eggCount: Int = Defaults.eggCount { didSet { changed() } }

    // MARK: - Units

    /// The system this phone starts in: its temperature preference, then its
    /// measurement system, then its region (`regionalUnits`). Read once, like
    /// the size classes.
    let regionalUnits = platformUnits()
    /// Metric or Imperial as the COOK chose it, or nil if they never have. Not
    /// the system on screen, which falls back to `regionalUnits`: storing that
    /// instead would turn a default into a choice nobody made. Saved, but no
    /// re-solve: the egg does not change when its numbers change clothes.
    private(set) var unitsChosen: UnitSystem? { didSet { if !applying { SettingsStore.save(self) } } }

    /// The system on screen.
    var units: UnitSystem { effectiveUnits(chosen: unitsChosen, regional: regionalUnits) }

    /// The cook picks a system. A change of system is posted as
    /// `.unitsFlipped`, which the switch into 1750 listens for
    /// (`LanguageChoice`); a default never is.
    func chooseUnits(_ next: UnitSystem) {
        let choice = EggTimerCore.chooseUnits(chosen: unitsChosen, regional: regionalUnits, next: next)
        unitsChosen = choice.chosen
        if let flip = choice.flip {
            NotificationCenter.default.post(name: .unitsFlipped, object: self, userInfo: ["flip": flip.rawValue])
        }
    }

    /// Restore from storage without saving it straight back.
    func restoreUnits(_ chosen: UnitSystem?) {
        unitsChosen = chosen
    }

    // MARK: - The thermometer

    /// "I have a probe thermometer": when the cooling ends, ask for one reading
    /// from the middle of the egg. Off until the cook says so.
    private(set) var probe = false
    /// Whether the once-only offer during a cook has been answered, either
    /// way. The setting stays in the controls; the offer does not come back.
    private(set) var probeAsked = false

    /// The setting, from the controls. Changing it is saying so.
    func setProbe(_ on: Bool) {
        probe = on
        probeAsked = true
        SettingsStore.save(self)
    }

    /// The answer to the offer made during a cook.
    func answerProbeOffer(_ yes: Bool) {
        probeAsked = true
        if yes { probe = true }
        SettingsStore.save(self)
    }

    /// Restore from storage without saving it straight back.
    func restoreProbe(on: Bool, asked: Bool) {
        probe = on
        probeAsked = asked
    }

    /// The readings the app takes for this cook, C: outside them it is a typo,
    /// the white or another egg, and is refused rather than folded.
    func probeRange(egg: Egg, setup: CookSetup, cookTimeS: Double) -> (low: Double, high: Double) {
        plausibleProbeRangeC(
            egg: egg, setup: setup, params: calibrationParams(calibration), cookTimeS: cookTimeS
        )
    }

    /// One quantity in the system on screen.
    func measure(_ q: Quantity) -> Measure { measureFor(q, system: units, region: deviceRegion) }

    /// A value stored in SI, as the cook reads it: "4 °C", "39 °F", "2.4 oz".
    func show(_ q: Quantity, _ si: Double) -> String { showIn(units, q, si) }

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
    var solution: Solution?
    /// What this kitchen has learned from its own eggs, and the eggs themselves:
    /// the posterior, the base it started from, and the log it was folded from.
    var kept = Calibrations.freshKept()
    /// What this kitchen has learned from its own eggs. Before any feedback it
    /// is the prior, whose mean IS the literature value - so calibration is
    /// purely additive and the app is fully useful on day one.
    var calibration: Calibration { kept.calibration }
    /// True while the dose surface is being rebuilt after an outcome.
    var learning = false
    /// What the cook on screen has said so far - the yolk, the white, or both -
    /// or nil before the first answer. Both questions stay on screen until the
    /// cook moves on; this is what marks each one answered.
    ///
    /// Deliberately not persisted, with the surface a second answer is folded
    /// against: after a relaunch the questions are not offered again, and the
    /// one left unanswered stays a skip in the record.
    var answers: Answers?
    /// Why the requested doneness was refused, in words, or empty. The point is
    /// to teach the constraint rather than merely to block the control.
    var refusal = ""
    /// The choice behind the time on screen: the odds, and how far it leaned
    /// from the mean solve. Nil until this pot's decision surface has been
    /// built, and on the sous-vide screen.
    var decision: Decision?
    /// The odds at every level for the pot on screen and the posterior as it
    /// stands (Reach.swift): the track's shading, and the range the slider
    /// offers. Nil until it has been worked out, after this pot's surface;
    /// until then the physical limits are the whole rule.
    var oddsProfile: OddsProfile?
    /// What the egg at the chosen time will be like (`predictOutcome`, read at
    /// the decided time on the decision's own surface): the direction, the
    /// white's line and the bracket. Nil whenever `decision` is.
    var outcome: Outcome?
    /// Under low odds, what would make this cook more reliable, as catalogue
    /// keys in the order shown; empty when there is nothing to say.
    var advice: [String] = []
    /// What the direction, the white's line and the bracket are about, and what
    /// a cook started now carries on its ticket: the choice on screen's outcome,
    /// once this pot's surface has landed. Nil before that, where the white
    /// never sets, and in sous-vide.
    var shownForecast: Outcome? {
        guard !isSousVide, decision != nil, solution?.whiteSets == true else { return nil }
        return outcome
    }
    /// Whether the odds on screen are low enough to point the cook at Help
    /// (`adviceWanted` in Reach.swift): under 5/10, or 3/10 short of the best
    /// level's. Never in sous-vide, or where the white never sets.
    var adviceWanted: Bool {
        guard !isSousVide, solution?.whiteSets == true, let d = decision else { return false }
        return EggTimerCore.adviceWanted(d.oddsTenths, profile: oddsProfile)
    }

    // MARK: - Bookkeeping
    //
    // The solve's and the learning's own state. Internal for the same reason
    // as the outputs, and for no one else.

    /// Profiles asked for and not yet in, so each lands once.
    var profilesAsked = Set<String>()

    struct Answers: Sendable {
        var yolk: Feedback?
        var white: WhiteReport?
        /// A probe reading at the middle, when the cooling ended.
        var probe: ProbeReading?
    }

    /// The live egg once folded: its place in the log, the surface it was
    /// scored against, and the calibration as it stood before it - so that a
    /// second answer folds the egg again rather than on top of itself.
    struct Folded: Sendable {
        let index: Int
        let grid: DoseGrid
        let before: Calibration
    }
    var folded: Folded?

    var task: Task<Void, Never>?
    /// Bumped by every `recompute()`: which question the inputs are asking.
    var asked = 0
    /// Which question `solution` answers, or nil when it answers none of them -
    /// a mid-cook re-solve, or nothing yet. `solution` is current only when
    /// this equals `asked`; between an input change and the coalesced solve
    /// landing, it is the answer to the PREVIOUS inputs.
    var answered: Int?
    /// Bumped by "forget what it learned", so a fold still running when the
    /// button is pressed lands on nothing rather than on the fresh prior.
    var generation = 0
    /// The egg on screen, whose second answer may still come. Every other egg in
    /// the log is folded quietly.
    var liveIndex: Int?
    var draining = false
    /// Set while the solver is moving the slider itself, so that snapping to a
    /// reachable position does not start another solve.
    var applying = false
    var boilMemory: BoilMemory = [:]
    private var loaded = false

    /// Read what was stored and solve for it.
    ///
    /// NOT `init`. `@State private var model = AppModel()`, which makes the
    /// Planner, evaluates its initial value on every construction of the view
    /// struct, and SwiftUI keeps only the first instance - so I/O and a solve
    /// in `init` ran for every discarded Planner as well, and those solves ran
    /// to completion. `Cook` already avoids exactly this by doing its restore
    /// from `onAppear`; this does the same, and is idempotent so a second
    /// `onAppear` costs nothing.
    func load() {
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

    var egg: Egg { Geometry.eggFromMass(eggMassG / 1000.0) }

    var eggStartC: Double {
        switch startTemp {
        case .fridge: StartTempPresets.fridgeC
        case .room: StartTempPresets.roomC
        case .custom: customStartC
        }
    }

    /// The room, as far as the model is concerned.
    ///
    /// There is no separate input for it, and there should not be: on the
    /// default path - eggs into boiling water, straight into an ice bath - the
    /// room is worth nothing at all, and on a cold start about two seconds per
    /// degree. It earns its keep resting on the counter and standing with the
    /// heat off, and in both the user has usually already said: an egg that has
    /// been sitting out IS at room temperature. A fridge egg says nothing about
    /// the room, so that case keeps the default.
    var ambientC: Double { ambientFor(eggStartC: eggStartC) }

    var boilingC: Double { Thermo.boilingPointAtAltitude(altitudeM) }

    /// Time to a rolling boil, s - the pan's one measured number. Remembered
    /// per water volume, because the same pan on the same hob gives the same
    /// answer next time. It is the length of a cold start's ramp and nothing
    /// more: with the heat off the pan's cooling comes from the water volume
    /// (`Protocols.panTimeConstant`), so a hot start carries it only for the
    /// record, which says which pan was assumed.
    var timeToBoilS: Double { estimateTimeToBoil(boilMemory, litres: waterLitres) }

    var hasBoilMemory: Bool { EggTimerCore.hasBoilMemory(boilMemory) }

    var setup: CookSetup {
        setup(timeToBoilS: timeToBoilS)
    }

    func setup(timeToBoilS: Double) -> CookSetup {
        CookSetup(
            startMode: coldStart ? .cold : .hot,
            eggStartC: eggStartC,
            ambientC: ambientC,
            boilingC: boilingC,
            timeToBoilS: timeToBoilS,
            cooling: cooling,
            waterLitres: waterLitres,
            afterBoil: heatOff ? .off : .hold,
            eggCount: Double(eggCount)
        )
    }

    /// The label moves with the finger; the numbers follow when the solve lands.
    var label: String { tr(anchorNear(doneness).key) }

    var eggsLogged: Int { calibration.eggsLogged }

    /// The isothermal limit for the egg and the calibrated alpha as they stand.
    ///
    /// Computed, where `solution` is stored and solved on a task. This one needs
    /// no integration at all - a bisection on the Fourier number and two closed
    /// forms - so putting it through the coalesce machinery would buy latency
    /// and a chance to be stale in exchange for nothing.
    var sousVide: SousVideEstimate {
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

    /// Record a measured time to a rolling boil and remember it for this
    /// volume. Blended with whatever was already known, so one odd run - lid
    /// off, pan half empty - does not dominate.
    func rememberBoil(seconds: Double) {
        boilMemory = EggTimerCore.rememberBoil(boilMemory, litres: waterLitres, seconds: seconds)
        BoilMemories.save(boilMemory)
    }
}
