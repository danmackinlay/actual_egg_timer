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
/// The cancel used to be a lie. The work ran inside `Task.detached`, which does
/// not inherit cancellation and never checked for it, so `task?.cancel()`
/// cancelled only the wrapper: every superseded slider tick still ran its full
/// scan to completion - about a second each with the heat off - and the result
/// was thrown away at the end. There was no debounce either, so a single drag
/// queued dozens of them. Now the coalesce keeps most of them from starting,
/// and the ones that do start inherit cancellation and check it between solves.
///
/// What this class decides is only what a KITCHEN knows. The decisions above
/// the physics - snapping, which refusal applies, the texture bands, the
/// calibration grid, the bounds and the defaults - live in EggTimerCore's
/// Policy, so this app and the web app cannot answer differently.
/// Where the egg comes from. A room is an assumption and Custom is the cook's
/// own number; a fridge is the one the model knows.
enum StartTemp: String, Codable {
    case fridge, room, custom
}

@Observable
@MainActor
final class Kitchen {
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

    /// A class from the menu. Weighed starts from the egg on screen rather than
    /// from whatever was last weighed, so choosing it moves nothing.
    func chooseSize(_ index: Int) {
        if index < 0, sizeIndex >= 0 { weighedMassG = eggMassG }
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
    var startTemp: StartTemp = .fridge { didSet { changed() } }
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
    /// An Int, because eggs are. It was a Double only because the core mirrors
    /// a TypeScript `number`, and that is the core's business rather than the
    /// app's - the conversion belongs at the boundary, not in the control.
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
    private(set) var unitsChosen: UnitSystem? { didSet { if !applying { Settings.save(self) } } }

    /// The system on screen.
    var units: UnitSystem { effectiveUnits(chosen: unitsChosen, regional: regionalUnits) }

    /// The cook picks a system. A change of system is posted as
    /// `.unitsFlipped`, the hook F6 needs; a default never is.
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

    // MARK: - The thermometer (E4)

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
        Settings.save(self)
    }

    /// The answer to the offer made during a cook.
    func answerProbeOffer(_ yes: Bool) {
        probeAsked = true
        if yes { probe = true }
        Settings.save(self)
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

    /// The cook the pan is being asked for, or nil while there is no answer -
    /// which includes sous-vide, where there is no pan to solve for. A nil
    /// solution is already what disables the start button, so the sous-vide
    /// screen's dead action needs no second rule.
    private(set) var solution: Solution?
    /// What this kitchen has learned from its own eggs, and the eggs themselves:
    /// the posterior, the base it started from, and the log it was folded from.
    private(set) var kept = Calibrations.freshKept()
    /// What this kitchen has learned from its own eggs. Before any feedback it
    /// is the prior, whose mean IS the literature value - so calibration is
    /// purely additive and the app is fully useful on day one.
    var calibration: Calibration { kept.calibration }
    /// True while the dose surface is being rebuilt after an outcome.
    private(set) var learning = false
    /// What the cook on screen has said so far - the yolk, the white, or both -
    /// or nil before the first answer. Both questions stay on screen until the
    /// cook moves on; this is what marks each one answered.
    ///
    /// Deliberately not persisted, with the surface a second answer is folded
    /// against: after a relaunch the questions are not offered again, and the
    /// one left unanswered stays a skip in the record.
    private(set) var answers: Answers?
    /// Why the requested doneness was refused, in words, or empty. The point is
    /// to teach the constraint rather than merely to block the control.
    private(set) var refusal = ""
    /// The choice behind the time on screen (E5): the odds, "still learning",
    /// and how far it leaned from the mean solve. Nil until this pot's decision
    /// surface has been built, and on the sous-vide screen.
    private(set) var decision: Decision?
    /// The odds at every level for the pot on screen and the posterior as it
    /// stands (Reach.swift): the track's shading, and the range the slider
    /// offers. Nil until it has been worked out, after this pot's surface;
    /// until then the physical limits are the whole rule, as before.
    private(set) var oddsProfile: OddsProfile?
    /// What the egg at the chosen time will be like (`predictOutcome`, read at
    /// the decided time on the decision's own surface): the direction, the
    /// white's line and the bracket. Nil whenever `decision` is.
    private(set) var outcome: Forecast?
    /// Under low odds, what would make this cook more reliable, as catalogue
    /// keys in the order shown; empty when there is nothing to say.
    private(set) var advice: [String] = []
    /// Profiles asked for and not yet in, so each lands once.
    private var profilesAsked = Set<String>()

    struct Answers: Sendable {
        var yolk: Feedback?
        var white: WhiteReport?
        /// A probe reading at the middle, when the cooling ended (E4).
        var probe: ProbeReading?
    }

    /// The live egg once folded: its place in the log, the surface it was
    /// scored against, and the calibration as it stood before it - so that a
    /// second answer folds the egg again rather than on top of itself.
    private struct Folded: Sendable {
        let index: Int
        let grid: DoseGrid
        let before: Calibration
    }
    private var folded: Folded?

    private var task: Task<Void, Never>?
    /// Bumped by every `recompute()`: which question the inputs are asking.
    private var asked = 0
    /// Which question `solution` answers, or nil when it answers none of them -
    /// a mid-cook re-solve, or nothing yet. `solution` is current only when
    /// this equals `asked`; between an input change and the coalesced solve
    /// landing, it is the answer to the PREVIOUS inputs.
    private var answered: Int?
    /// Bumped by "forget what it learned", so a fold still running when the
    /// button is pressed lands on nothing rather than on the fresh prior.
    private var generation = 0
    /// The egg on screen, whose second answer may still come. Every other egg in
    /// the log is folded quietly.
    private var liveIndex: Int?
    private var draining = false
    /// Set while the solver is moving the slider itself, so that snapping to a
    /// reachable position does not start another solve.
    private var applying = false
    private var boilMemory: BoilMemory = [:]
    private var loaded = false

    /// Read what was stored and solve for it.
    ///
    /// NOT `init`. `@State private var kitchen = Kitchen()` evaluates its
    /// initial value on every construction of the view struct, and SwiftUI
    /// keeps only the first instance - so I/O and a solve in `init` ran for
    /// every discarded Kitchen as well, and those solves ran to completion.
    /// `Cook` already avoids exactly this by doing its restore from
    /// `onAppear`; this does the same, and is idempotent so a second
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
        Settings.load(into: self)
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
            alphaM2s: Calibrations.params(calibration).alphaM2s,
            bathC: sousVideBathC,
            yolkDoseMin: doneness.yolkDoseMin,
            whiteDoseMin: doneness.whiteDoseMin
        )
    }

    /// log10 of the yolk dose the slider is currently asking for. This is what
    /// the filter treats as the nominal target, and the user's taste offset is
    /// learned relative to it, so it carries across slider positions.
    var logNominalTarget: Double { log10(donenessFromSlider(doneness).yolkDoseMin) }

    // MARK: - Solving

    private func changed() {
        guard !applying else { return }
        Settings.save(self)
        recompute()
    }

    /// Coalesce solves. A drag fires `didSet` on every step, and a solve is
    /// far too long to run on each one - with the heat off it is a standing
    /// scan of about a second. 90 ms, the same window the web app uses.
    private static let coalesceNanos: UInt64 = 90_000_000

    /// How long the inputs must sit still, on top of the coalesce, before a new
    /// pot's decision surface is built. The web app's `DECISION_SETTLE_MS`.
    private static let settleNanos: UInt64 = 300_000_000

    private func recompute() {
        task?.cancel()
        task = nil
        asked &+= 1
        // No pan, no solve. The sous-vide answer is `sousVide` above and needs
        // none of this. It goes FIRST, before anything is solved for - the web
        // app used to branch only at the point of PAINTING, so it paid for a
        // full hot-start solve it then discarded and left half of it on screen.
        // Clearing the solution is what also makes the start button dead, which
        // is the truth here: there is nothing to start.
        if isSousVide {
            solution = nil
            refusal = ""
            decision = nil
            outcome = nil
            oddsProfile = nil
            advice = []
            return
        }
        let level = doneness
        let setup = setup
        let egg = egg
        let calibration = calibration
        let facts = adviceFacts
        // Tagged with the question it answers, so neither step below can land
        // on inputs that have moved since, and "Eggs in" can tell whether the
        // time on screen is theirs (`currentSolution`).
        let question = asked
        task = Task { [weak self] in
            try? await Task.sleep(nanoseconds: Self.coalesceNanos)
            guard !Task.isCancelled else { return }
            // The odds at every level, if this pot's are in, set the slider's
            // ends (Reach.swift); if not, the physical limits do.
            let inputs = decisionInputs(calibration, egg: egg, setup: setup)
            let profile = await DecisionGrids.shared.cachedProfile(inputs, calibration)
            let answer = await Self.solve(
                egg: egg, setup: setup, level: level, calibration: calibration, profile: profile
            )
            guard !Task.isCancelled else { return }
            // E5: the time is chosen on this pot's decision surface. The surface
            // does not depend on the slider, so a drag is answered from the one
            // already built and the time never jumps mid-drag; a new pot shows
            // the mean solve's time first, and the chosen one when its surface
            // lands, once the inputs have settled.
            if let grid = await DecisionGrids.shared.cached(inputs) {
                let chosen = await Self.decided(
                    answer, grid: grid, egg: egg, calibration: calibration, facts: facts
                )
                guard !Task.isCancelled, question == self?.asked else { return }
                self?.task = nil
                self?.apply(chosen, question: question)
                self?.askForProfiles(chosen.missing, calibration: calibration)
                return
            }
            guard question == self?.asked else { return }
            self?.apply(answer, question: question)
            try? await Task.sleep(nanoseconds: Self.settleNanos)
            guard !Task.isCancelled else { return }
            let grid = await DecisionGrids.shared.grid(inputs)
            guard !Task.isCancelled else { return }
            let chosen = await Self.decided(
                answer, grid: grid, egg: egg, calibration: calibration, facts: facts
            )
            guard !Task.isCancelled, question == self?.asked else { return }
            self?.task = nil
            self?.apply(chosen, question: question)
            self?.askForProfiles(chosen.missing, calibration: calibration)
        }
    }

    /// What the advice needs to know that the setup does not say: whether the
    /// egg is a size off the carton, and whether its start is the room preset's
    /// assumption rather than the fridge.
    private var adviceFacts: AdviceFacts {
        AdviceFacts(eggFromClass: massFrom == .sizeClass, startAssumed: startTemp == .room)
    }

    /// The answer, with its time chosen from the whole posterior (E5, Decide.swift)
    /// rather than solved at its mean, and what to say if the odds there are
    /// low. Off the main actor, like the solve: a decision is a few thousand
    /// probits. Profiles not yet worked out - this pot's, and those of the
    /// changes the advice would price - are listed in `missing`.
    private nonisolated static func decided(
        _ answer: Answer, grid: DoseGrid, egg: Egg, calibration: Calibration, facts: AdviceFacts
    ) async -> Answer {
        let target = log10(donenessFromSlider(answer.level).yolkDoseMin)
        let d = decide(calibration, grid: grid, solution: answer.solution, logNominalTarget: target)
        var chosen = answer
        chosen.solution = decidedSolution(
            egg: egg, setup: answer.setup, params: Calibrations.params(calibration),
            solution: answer.solution, decision: d
        )
        chosen.decision = d
        // What the egg at that time will be like: about 2 ms beside the
        // decision's 13-16, so it goes with it (INFERENCE.md section 8).
        chosen.outcome = Forecast(predictOutcome(calibration.posterior, grid, d.cookTimeS, target))
        if answer.profile == nil {
            chosen.missing.append(decisionInputs(calibration, egg: egg, setup: answer.setup))
        }
        guard answer.solution.whiteSets, adviceWanted(d.oddsTenths, profile: answer.profile) else {
            return chosen
        }
        var priced: [(key: String, profile: OddsProfile)] = []
        for change in pricedChanges(answer.setup) {
            let changed = decisionInputs(calibration, egg: egg, setup: change.setup)
            if let p = await DecisionGrids.shared.cachedProfile(changed, calibration) {
                priced.append((key: change.key, profile: p))
            } else {
                chosen.missing.append(changed)
            }
        }
        chosen.advice = protocolAdvice(
            answer.setup, facts: facts, level: answer.level, odds: d.odds, priced: priced
        )
        return chosen
    }

    /// Ask for the profiles an answer found missing, off the main actor, and
    /// solve again when one lands if the screen still wants it: this pot's, or
    /// a priced change of it. Each is asked for once.
    private func askForProfiles(_ missing: [DecisionInputs], calibration: Calibration) {
        for inputs in missing {
            let key = DecisionGrids.profileKey(inputs, calibration)
            guard !profilesAsked.contains(key) else { continue }
            profilesAsked.insert(key)
            Task { [weak self] in
                _ = await DecisionGrids.shared.profile(inputs, calibration)
                guard let self else { return }
                self.profilesAsked.remove(key)
                guard !self.isSousVide, self.wantedProfileKeys.contains(key) else { return }
                self.recompute()
            }
        }
    }

    /// The profiles the screen wants now: this pot's, and its priced changes'.
    private var wantedProfileKeys: Set<String> {
        let inputs = decisionInputs(calibration, egg: egg, setup: setup)
        var keys: Set<String> = [DecisionGrids.profileKey(inputs, calibration)]
        for change in pricedChanges(setup) {
            keys.insert(DecisionGrids.profileKey(
                decisionInputs(calibration, egg: egg, setup: change.setup), calibration
            ))
        }
        return keys
    }

    /// Solve, and read the result as a decision about the slider.
    ///
    /// No inner `Task` of any kind. This is `nonisolated async`, which is all
    /// that is needed to get off the main actor, and it means the CALLER's
    /// cancellation applies: `Task.isCancelled` below is the recompute task,
    /// which `recompute()` cancels.
    ///
    /// Wrapping the body in `Task { }` - as this did, with a comment claiming
    /// it fixed the cancellation - does not work. An unstructured task inherits
    /// priority and actor context but NOT cancellation, exactly like the
    /// `Task.detached` it replaced, so the guard inside it was dead code and
    /// superseded solves still ran to completion. Only the 90 ms coalesce was
    /// doing anything.
    ///
    /// `snapRetry` is false for a cook already under way: the target is frozen,
    /// so re-solving at a snapped position would answer for an egg nobody is
    /// cooking.
    private nonisolated static func solve(
        egg: Egg, setup: CookSetup, level: Double, calibration: Calibration, snapRetry: Bool = true,
        profile: OddsProfile? = nil
    ) async -> Answer {
        // The white's target moves with what the eggs said about the white (E3),
        // so the doneness comes from the calibration as well as the parameters.
        let params = Calibrations.params(calibration)
        var result = solveCookTime(
            egg: egg, setup: setup, params: params, doneness: calibrationDoneness(calibration, level: level)
        )
        // With this pot's odds in, the slider's ends are where they reach 3/10
        // (Reach.swift); without them, or with none that high, where the pan
        // reaches.
        let verdict = verdictWithOdds(result, level: level, profile: profile)

        // Re-solve at the position the user is actually being offered, so the
        // numbers on screen are the numbers for that cook rather than for one
        // that was refused. Only worth it when the slider is going to move, and
        // only if nobody has asked a newer question in the meantime.
        var solvedAt = level
        if snapRetry, let snapTo = verdict.snapTo, !Task.isCancelled {
            let retry = solveCookTime(
                egg: egg, setup: setup, params: params, doneness: calibrationDoneness(calibration, level: snapTo)
            )
            if retry.reachable {
                result = retry
                solvedAt = snapTo
            }
        }
        return Answer(solution: result, verdict: verdict, setup: setup, level: solvedAt, profile: profile)
    }

    /// Re-solve a cook already under way, for a corrected time to boil.
    ///
    /// The doneness is the one the cook was STARTED at, and nothing here may
    /// move it - not the slider, and not the answer. This used to call the idle
    /// path, discard its `snapTo` and return the SNAPPED solution's cook time,
    /// so a measured ramp that made the requested doneness unreachable quietly
    /// re-timed the pan for a different egg while the slider, the stored
    /// setting and the captured ticket all still described the one asked for.
    ///
    /// `snapRetry: false` is what makes that true rather than merely intended:
    /// an unreachable target now answers with the furthest this pan goes, which
    /// is the only cook on offer, instead of with a cook at a target nobody
    /// chose.
    ///
    /// `leanS` is how far the choice leaned from the mean solve at "Eggs in"
    /// (E5). A new ramp is a new pot, whose decision surface is a second or more
    /// away with the egg already in the water, so the lean is carried instead
    /// (`carriedSolution`); test/decide.test.ts measures what that costs.
    ///
    /// The answer is the whole cook: its time, and the peak the cooling
    /// counts to (E4).
    func cookResult(timeToBoilS: Double, level: Double, leanS: Double) async -> CookResult? {
        let setup = setup(timeToBoilS: timeToBoilS)
        let answer = await Self.solve(
            egg: egg, setup: setup, level: level, calibration: calibration, snapRetry: false
        )
        let carried = carriedSolution(
            egg: egg, setup: setup, params: Calibrations.params(calibration),
            solution: answer.solution, leanS: leanS
        )
        // The numbers on screen follow the cook; the refusal does not. A
        // refusal is advice about a control that is no longer on screen.
        solution = carried
        // A pan with a measured or pushed-out ramp is not the idle question.
        answered = nil
        return carried.result
    }

    /// The solution for the inputs as they stand NOW, solving for them first
    /// if the one on screen is not yet theirs. Nil for sous-vide, where there
    /// is no pan to solve for.
    ///
    /// "Eggs in" reads this rather than `solution`. The solve for an input
    /// change waits out the coalesce and then runs off the main actor, and for
    /// that whole time `solution` is still the answer to the previous inputs -
    /// so a start mode changed and "Eggs in" tapped straight after started a
    /// cold start's heating phase on the hot start's time. The web app solves
    /// synchronously at start;
    /// this solves the same question, off the main actor, and only when the
    /// answer on screen is stale.
    ///
    /// Applied like any other answer, so a snap moves the slider before the
    /// caller reads the level for its ticket. Loops only if the inputs move
    /// again while it solves.
    func currentSolution() async -> Solution? {
        while true {
            if isSousVide { return nil }
            if let solution, answered == asked { return solution }
            task?.cancel()
            task = nil
            let question = asked
            let calibration = calibration
            let egg = egg
            let setup = setup
            let facts = adviceFacts
            let inputs = decisionInputs(calibration, egg: egg, setup: setup)
            let profile = await DecisionGrids.shared.cachedProfile(inputs, calibration)
            var answer = await Self.solve(
                egg: egg, setup: setup, level: doneness, calibration: calibration, profile: profile
            )
            // The time on screen is the chosen one whenever this pot's surface
            // is already built (E5), so "Eggs in" starts on that one too. A
            // surface still to build is not waited for: the mean is what the
            // screen would show, and the egg is going in now.
            if let grid = await DecisionGrids.shared.cached(inputs) {
                answer = await Self.decided(answer, grid: grid, egg: egg, calibration: calibration, facts: facts)
            }
            guard question == asked else { continue }
            apply(answer, question: question)
        }
    }

    private func apply(_ answer: Answer, question: Int) {
        solution = answer.solution
        answered = question
        decision = answer.decision
        outcome = answer.decision == nil ? nil : answer.outcome
        oddsProfile = answer.profile
        advice = answer.advice
        refusal = refusalText(answer.verdict, setup: answer.setup, water: show(.water, answer.setup.waterLitres))
        if let snapTo = answer.verdict.snapTo, snapTo != doneness {
            applying = true
            doneness = snapTo
            applying = false
            Settings.save(self)
        }
    }

    private struct Answer: Sendable {
        var solution: Solution
        /// Why it was refused, if it was, and where the slider must go.
        var verdict: Verdict
        /// The setup this answer is about, so the refusal can quote the pan
        /// the answer was computed for rather than whatever is current.
        var setup: CookSetup
        /// The level the solution is for: the one asked, or the one it snapped to.
        var level: Double
        /// The choice made on it (E5), once this pot's surface is in.
        var decision: Decision? = nil
        /// What the egg at the chosen time will be like, with the decision.
        var outcome: Forecast? = nil
        /// The odds at every level for this pot and posterior (Reach.swift),
        /// once worked out: the verdict read its range, and the track is
        /// shaded by it.
        var profile: OddsProfile? = nil
        /// What to say under low odds, as catalogue keys; empty for nothing.
        var advice: [String] = []
        /// Profiles this answer would have used and that are not worked out
        /// yet: asked for once it is applied.
        var missing: [DecisionInputs] = []
    }

    // MARK: - Learning from an egg

    /// Write one egg down with its first answer - the yolk or the white - then
    /// learn from it.
    ///
    /// Written down FIRST, before any arithmetic: an app killed during the fold
    /// then folds it again on the next launch, rather than losing it. The
    /// record carries the egg and pan the cook was RUN with, off the ticket.
    func record(_ egg: EggRecord) async {
        answers = Answers(yolk: egg.yolk, white: egg.white, probe: egg.probe)
        folded = nil
        liveIndex = kept.log.count
        kept.log.append(egg)
        Calibrations.save(kept)
        await drain()
    }

    /// The second answer about the egg on screen - the white after the yolk, or
    /// the yolk after the white.
    ///
    /// If the egg is still being folded, the answer is written into its record
    /// and the fold, which reads the record when its surface lands, takes both.
    /// If it has been folded, it is folded AGAIN from the calibration as it
    /// stood before it, against the same surface, so the posterior is what a
    /// replay of the log makes whichever order the taps came in. Refused, and
    /// nothing written, when that is no longer possible - which is what keeps
    /// the log and the posterior one thing. The web app's `recordSecondAnswer`.
    func secondAnswer(yolk: Feedback?, white: WhiteReport?, probe: ProbeReading? = nil) async {
        guard var given = answers, let index = liveIndex ?? folded?.index,
              index == kept.log.count - 1 else { return }
        if yolk != nil, given.yolk != nil { return }
        if white != nil, given.white != nil { return }
        if probe != nil, given.probe != nil { return }
        var egg = kept.log[index]
        if let yolk { egg.yolk = yolk; given.yolk = yolk }
        if let white { egg.white = white; given.white = white }
        if let probe { egg.probe = probe; given.probe = probe }
        if kept.folded <= index {
            answers = given
            kept.log[index] = egg
            Calibrations.save(kept)
            await drain()
            return
        }
        guard let done = folded, done.index == index, kept.folded == index + 1 else { return }
        answers = given
        learning = true
        let gen = generation
        let again = await Task.detached(priority: .userInitiated) {
            var c = done.before
            foldRecord(&c, egg, grid: done.grid)
            return c
        }.value
        if gen == generation {
            kept.log[index] = egg
            kept.calibration = again
            Calibrations.save(kept)
        }
        learning = false
        recompute()
    }

    /// The cook has moved on: the next answers are about the next egg.
    func endEgg() {
        answers = nil
        folded = nil
        liveIndex = nil
    }

    /// An egg finished and never answered about. Still a record - the cook, the
    /// recommendation and the pull are data for the fit - and it folds nothing.
    func logUnanswered(_ egg: EggRecord) {
        kept.log.append(egg)
        Calibrations.save(kept)
        Task { await drain() }
    }

    /// Fold every egg not yet folded, one surface at a time.
    ///
    /// The grid build is a second or two of arithmetic, so it goes to a
    /// detached task, as it always has; a catch-up after a relaunch is several
    /// of them, and takes the same path. The fold itself is milliseconds, and
    /// happens back here, reading the record AFTER the surface lands: an answer
    /// that arrived while it was being built is folded with the first, as a
    /// replay folds them.
    ///
    /// One drain at a time: a call made while one runs returns at once, and the
    /// running one picks up whatever was appended, because it reads the log
    /// again after every egg.
    private func drain() async {
        guard !draining else { return }
        draining = true
        learning = true
        while kept.folded < kept.log.count {
            let gen = generation
            let index = kept.folded
            let egg = kept.log[index]
            guard recordTeaches(egg) else {
                kept.folded += 1
                Calibrations.save(kept)
                continue
            }
            // Centred where the posterior stood BEFORE this egg, exactly as
            // `replay` does it; nothing else folds while this runs.
            let request = gridRequest(kept.calibration, egg)
            let grid = await Task.detached(priority: .userInitiated) {
                buildRequestedGrid(request)
            }.value
            // Forgotten while the surface was being built.
            guard gen == generation else { continue }
            let before = kept.calibration
            var next = before
            foldRecord(&next, kept.log[index], grid: grid)
            kept.calibration = next
            kept.folded += 1
            if index == liveIndex {
                liveIndex = nil
                folded = Folded(index: index, grid: grid, before: before)
            }
            Calibrations.save(kept)
        }
        draining = false
        learning = false
        // The egg just eaten keeps the numbers it was cooked with; the new
        // ones show up on the next cook.
        recompute()
    }

    /// Re-solve for the inputs as they stand.
    ///
    /// Needed after a cancel. A cold start's boil tap re-solves with the
    /// MEASURED ramp and leaves that answer in `solution`; without this, the
    /// idle screen goes on showing the cook that was just abandoned, which
    /// reads as a Cancel button that did not work.
    func refresh() {
        recompute()
    }

    /// Take it all back: the posterior, the log of eggs it was folded from, the
    /// base under it, AND the measured pan. The web app clears them all from one
    /// button, and a kitchen that has forgotten your taste but still insists it
    /// knows your hob is not a state anyone asked for.
    func resetCalibration() {
        generation &+= 1
        liveIndex = nil
        folded = nil
        answers = nil
        Calibrations.reset()
        kept = Calibrations.freshKept()
        BoilMemories.reset()
        boilMemory = [:]
        recompute()
    }

    #if DEBUG
    /// Debug builds only (Screenshots.swift, `-seedEggs`): write eggs into
    /// the log through the app's own store, as if each had been cooked at the
    /// level and setup on screen, at its mean time, and answered as given
    /// about the yolk; then fold them, as a relaunch folds eggs it finds
    /// unfolded. Only into an empty log, so a relaunch does not seed twice.
    func seed(_ answers: [Feedback]) {
        guard kept.log.isEmpty, !answers.isEmpty, !isSousVide else { return }
        let solved = solveCookTime(
            egg: egg, setup: setup, params: Calibrations.params(calibration),
            doneness: calibrationDoneness(calibration, level: doneness)
        )
        let seconds = solved.result.cookTimeS
        for answer in answers {
            kept.log.append(EggRecord(
                day: "2026-09-28", app: .ios, appVersion: Calibrations.appVersion,
                egg: RecordEgg(massG: recordMassG(massKg: egg.massKg), massFrom: massFrom, sizeTable: sizeTable),
                setup: RecordSetup(
                    setup: setup, eggFrom: startTemp == .fridge ? .fridge : .room,
                    timeToBoilFrom: coldStart ? .measured : .default
                ),
                level: doneness, recommendedS: seconds, pulledS: seconds, pulledBy: .cook,
                cooledS: cooling == .counter ? 0 : coolingSecondsFor(solved.result),
                yolk: answer, lang: "en", units: .metric
            ))
        }
        Calibrations.save(kept)
        Task { await drain() }
    }
    #endif

    // MARK: - Measuring the boil

    /// Record a measured time to a rolling boil and remember it for this
    /// volume. Blended with whatever was already known, so one odd run - lid
    /// off, pan half empty - does not dominate.
    func rememberBoil(seconds: Double) {
        boilMemory = EggTimerCore.rememberBoil(boilMemory, litres: waterLitres, seconds: seconds)
        BoilMemories.save(boilMemory)
    }

}

// MARK: - Decision surfaces

/// This app's decision surfaces (E5), one per pot and posterior, built off the
/// main actor and kept. The slider is not part of the key, so dragging it never
/// waits for one. Two asks for the same pot share one build, and the build is
/// not cancelled with the solve that asked for it: a pot that comes back should
/// not be built twice. The web app keeps the same cache (`decisionGrid`).
actor DecisionGrids {
    static let shared = DecisionGrids()

    /// The pot on screen, the one before, and a cold start's measured ramp.
    private static let kept = 6

    private var done: [String: DoseGrid] = [:]
    private var order: [String] = []
    private var building: [String: Task<DoseGrid, Never>] = [:]

    private static func key(_ inputs: DecisionInputs) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        guard let data = try? encoder.encode(inputs) else { return "" }
        return String(decoding: data, as: UTF8.self)
    }

    func cached(_ inputs: DecisionInputs) -> DoseGrid? {
        done[Self.key(inputs)]
    }

    func grid(_ inputs: DecisionInputs) async -> DoseGrid {
        let key = Self.key(inputs)
        if let grid = done[key] { return grid }
        if let running = building[key] { return await running.value }
        let build = Task.detached(priority: .userInitiated) { buildDecisionGrid(inputs) }
        building[key] = build
        let grid = await build.value
        building[key] = nil
        if done[key] == nil { order.append(key) }
        done[key] = grid
        while order.count > Self.kept {
            done[order.removeFirst()] = nil
        }
        return grid
    }

    // MARK: The odds at every level

    /// Profiles by pot AND posterior: unlike the surface, a profile reads every
    /// particle, so a fold - or a second answer refolded, which keeps the
    /// count - makes a new one. A few more than the surfaces, for the priced
    /// changes the advice asks about.
    private static let profilesKept = 8

    private var profiles: [String: OddsProfile] = [:]
    private var profileOrder: [String] = []
    private var profileBuilds: [String: Task<OddsProfile, Never>] = [:]

    /// A cheap summary of where the posterior stands: the count and the
    /// weighted sums of every dimension. Any fold moves at least one of them.
    /// The web app's `posteriorPrint`.
    nonisolated static func profileKey(_ inputs: DecisionInputs, _ c: Calibration) -> String {
        var a = 0.0, b = 0.0, d = 0.0, e = 0.0
        let post = c.posterior
        for (p, w) in zip(post.particles, post.weights) {
            a += w * p.alphaM2s
            b += w * p.logDoseOffset
            d += w * (p.noise + p.tauAirScale)
            e += w * (p.whiteOffset + p.whiteFirmGap)
        }
        return "\(key(inputs))#\(c.eggsLogged)|\(post.rng)|\(post.particles.count)|\(a)|\(b)|\(d)|\(e)"
    }

    func cachedProfile(_ inputs: DecisionInputs, _ c: Calibration) -> OddsProfile? {
        profiles[Self.profileKey(inputs, c)]
    }

    /// The odds at every level for this pot and posterior, on the pot's
    /// surface (built first if need be), off the main actor: a couple of dozen
    /// solves and decisions. Two asks share one build.
    func profile(_ inputs: DecisionInputs, _ c: Calibration) async -> OddsProfile {
        let key = Self.profileKey(inputs, c)
        if let p = profiles[key] { return p }
        if let running = profileBuilds[key] { return await running.value }
        let surface = await grid(inputs)
        if let p = profiles[key] { return p }
        if let running = profileBuilds[key] { return await running.value }
        let build = Task.detached(priority: .userInitiated) {
            oddsProfile(c, egg: inputs.egg, setup: inputs.setup, grid: surface)
        }
        profileBuilds[key] = build
        let p = await build.value
        profileBuilds[key] = nil
        if profiles[key] == nil { profileOrder.append(key) }
        profiles[key] = p
        while profileOrder.count > Self.profilesKept {
            profiles[profileOrder.removeFirst()] = nil
        }
        return p
    }
}

// MARK: - Refusals, in words

/// The refusal, in words.
///
/// The DECISION - which refusal applies, where the slider must move to, and
/// whether the gap is big enough to be worth a sentence at all - is
/// `verdictFor` in EggTimerCore, so that this app and the web app cannot refuse
/// differently. What is left here is the sentence, which is this app's own: the
/// point is to teach the constraint, not merely to block the control.
private func refusalText(_ v: Verdict, setup: CookSetup, water: String) -> String {
    guard v.worthSaying else { return "" }
    let limit = tr(v.limit.key).lowercased()

    switch v.kind {
    case .none:
        return ""

    case .whiteNeverSets:
        // The standing method's worst failure: the water falls past the
        // temperature the white needs before the white has had it, so there is
        // no cook here at all - not a soft one, not a hard one.
        return tr("refusal.whiteNeverSets")

    case .harderThanPanReaches:
        // The standing method's own failure: the pan cools off before the yolk
        // gets where it was asked to go, and no amount of waiting fixes it.
        return tr("refusal.harderThanPan", [
            "water": .text(water), "limit": .text(limit),
        ])

    case .tooSoftForWhite:
        switch setup.cooling {
        case .counter:
            return tr("refusal.counter", ["limit": .text(limit)])
        case .tap:
            return tr("refusal.tap", ["limit": .text(limit)])
        case .ice:
            return tr("refusal.ice", ["limit": .text(limit)])
        }

    case .unlikelySoft, .unlikelyHard:
        // The pan could, but the odds say it would rarely come out right
        // (Reach.swift): the slider's end is the last level at 3/10.
        return tr(v.kind == .unlikelySoft ? "refusal.unlikelySoft" : "refusal.unlikelyHard", [
            "hits": .int(Int((reachOdds * 10).rounded())), "of": .int(10), "limit": .text(limit),
        ])
    }
}

// MARK: - Units

/// The phone's region: which carton's size classes, and which Imperial unit
/// water is in. Region only, as `Locale` reports it.
let deviceRegion: String? = Locale.current.region?.identifier

/// The system this phone starts in, before the cook chooses.
///
/// iOS knows more than a browser does: the measurement system, and since iOS
/// 16 the temperature unit a cook can set in Settings, which reaches `Locale`
/// as its `mu` keyword and so `UnitTemperature(forLocale:)`. Which of them
/// wins is core policy (`regionalUnits`); this only reads them.
func platformUnits() -> UnitSystem {
    let locale = Locale.current
    let system: MeasurementSystemName = switch locale.measurementSystem {
    case .us: .us
    case .uk: .uk
    default: .metric
    }
    let fahrenheit = UnitTemperature(forLocale: locale).symbol == UnitTemperature.fahrenheit.symbol
    return regionalUnits(
        region: locale.region?.identifier, measurementSystem: system,
        temperature: fahrenheit ? .fahrenheit : .celsius
    )
}

/// A value stored in SI, as the cook reads it in a given system. Outside the
/// Kitchen for the cook, which renders the Live Activity's numbers in the
/// system the egg was set up in.
func showIn(_ units: UnitSystem, _ q: Quantity, _ si: Double) -> String {
    let text = quantityText(measureFor(q, system: units, region: deviceRegion), si)
    return tr(text.key, ["value": .fixed(text.value)])
}

extension Notification.Name {
    /// Posted by `Kitchen.chooseUnits` when the cook's own choice changes the
    /// system on screen, with the `UnitsFlip` raw value under "flip". Nothing
    /// observes it yet: it is the hook F6 needs - an English UI switched from
    /// metric to Imperial goes into the English of 1750 (LANGUAGE.md §6).
    static let unitsFlipped = Notification.Name("unitsFlipped")
}

// MARK: - Presentation helpers

/// One line on what the model expects of this cook. Which band the egg falls
/// in, and which keys say it, are core policy - including that a white the pan
/// never sets is runny, which this app used to miss: it named such a white
/// from its peak, "white just set".
func textureNote(peakYolkC: Double, peakWhiteC: Double, whiteSets: Bool) -> String {
    let note = textureNoteKeys(textureFor(peakYolkC: peakYolkC, peakWhiteC: peakWhiteC, whiteSets: whiteSets))
    return tr(note.key, note.parts.mapValues { .text(tr($0)) })
}

func clockString(_ seconds: Double) -> String {
    let total = Int(max(0, seconds.rounded()))
    return String(format: "%d:%02d", total / 60, total % 60)
}
