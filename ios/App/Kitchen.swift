import Foundation
import Observation
import EggTimerCore

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
@Observable
@MainActor
final class Kitchen {
    // MARK: - Inputs

    var doneness: Double = Defaults.doneness { didSet { changed() } }
    var eggMassG: Double = Defaults.eggMassKg * 1000 { didSet { changed() } }
    var fromFridge: Bool = true { didSet { changed() } }
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

    // MARK: - Outputs

    /// The cook the pan is being asked for, or nil while there is no answer -
    /// which includes sous-vide, where there is no pan to solve for. A nil
    /// solution is already what disables the start button, so the sous-vide
    /// screen's dead action needs no second rule.
    private(set) var solution: Solution?
    /// What this kitchen has learned from its own eggs. Before any feedback it
    /// is the prior, whose mean IS the literature value - so calibration is
    /// purely additive and the app is fully useful on day one.
    private(set) var calibration = Calibrations.fresh()
    /// True while the dose surface is being rebuilt after an outcome.
    private(set) var learning = false
    /// The second question, when there is one: the white of the egg just eaten,
    /// asked only when the model cannot already guess the answer. Nil the rest of
    /// the time, which is most of the time - see `shouldAskAboutWhite`.
    ///
    /// Deliberately not persisted. It is a moment in a conversation rather than a
    /// fact about the egg, and rebuilding the surface it needs would cost a second
    /// of arithmetic to re-ask a question nobody answered.
    private(set) var whiteQuestion: WhiteQuestion?
    /// Why the requested doneness was refused, in words, or empty. The point is
    /// to teach the constraint rather than merely to block the control.
    private(set) var refusal = ""

    /// The white question and what answering it needs: the surface the yolk
    /// answer was scored against, and the cook it describes.
    struct WhiteQuestion: Sendable {
        let grid: DoseGrid
        let cookTimeS: Double
    }

    private var task: Task<Void, Never>?
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
        calibration = Calibrations.load()
        boilMemory = BoilMemories.load()
        Settings.load(into: self)
        applying = false
        recompute()
    }

    // MARK: - Derived setup

    var egg: Egg { Geometry.eggFromMass(eggMassG / 1000.0) }

    var eggStartC: Double { fromFridge ? StartTempPresets.fridgeC : StartTempPresets.roomC }

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
    /// answer next time. Note the solver wants it on a HOT start too: with the
    /// heat off it is the pan's loss time constant, which is the only
    /// measurement of the pan there is.
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
    var label: String { anchorNear(doneness).label }

    var eggsLogged: Int { calibration.eggsLogged }
    var calibrationSpread: Double { Calibrations.spread(calibration) }

    /// The isothermal limit for the egg and the calibrated alpha as they stand.
    ///
    /// Computed, where `solution` is stored and solved on a task. This one needs
    /// no integration at all - a bisection on the Fourier number and two closed
    /// forms - so putting it through the coalesce machinery would buy latency
    /// and a chance to be stale in exchange for nothing.
    var sousVide: SousVideEstimate {
        let doneness = donenessFromSlider(doneness)
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

    private func recompute() {
        task?.cancel()
        // No pan, no solve. The sous-vide answer is `sousVide` above and needs
        // none of this. It goes FIRST, before anything is solved for - the web
        // app used to branch only at the point of PAINTING, so it paid for a
        // full hot-start solve it then discarded and left half of it on screen.
        // Clearing the solution is what also makes the start button dead, which
        // is the truth here: there is nothing to start.
        if isSousVide {
            solution = nil
            refusal = ""
            return
        }
        let level = doneness
        let setup = setup
        let egg = egg
        let params = Calibrations.params(calibration)
        task = Task { [weak self] in
            try? await Task.sleep(nanoseconds: Self.coalesceNanos)
            guard !Task.isCancelled else { return }
            let answer = await Self.solve(egg: egg, setup: setup, level: level, params: params)
            guard !Task.isCancelled else { return }
            self?.apply(answer)
        }
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
        egg: Egg, setup: CookSetup, level: Double, params: ModelParams, snapRetry: Bool = true
    ) async -> Answer {
        var result = solveCookTime(
            egg: egg, setup: setup, params: params, doneness: donenessFromSlider(level)
        )
        let verdict = verdictFor(result, level: level)

        // Re-solve at the position the user is actually being offered, so the
        // numbers on screen are the numbers for that cook rather than for one
        // that was refused. Only worth it when the slider is going to move, and
        // only if nobody has asked a newer question in the meantime.
        if snapRetry, let snapTo = verdict.snapTo, !Task.isCancelled {
            let retry = solveCookTime(
                egg: egg, setup: setup, params: params, doneness: donenessFromSlider(snapTo)
            )
            if retry.reachable { result = retry }
        }
        return Answer(solution: result, verdict: verdict, setup: setup)
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
    func cookTime(timeToBoilS: Double, level: Double) async -> Double? {
        let answer = await Self.solve(
            egg: egg, setup: setup(timeToBoilS: timeToBoilS), level: level,
            params: Calibrations.params(calibration), snapRetry: false
        )
        // The numbers on screen follow the cook; the refusal does not. A
        // refusal is advice about a control that is no longer on screen.
        solution = answer.solution
        return answer.solution.result.cookTimeS
    }

    private func apply(_ answer: Answer) {
        solution = answer.solution
        refusal = refusalText(answer.verdict, setup: answer.setup)
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
    }

    // MARK: - Learning from an egg

    /// Fold in one outcome and re-solve with what was learned.
    ///
    /// The grid build is roughly a second of arithmetic, so it goes to a
    /// detached task. It happens once, after the egg has been eaten, and never
    /// while anything is being adjusted - which is the whole reason the surface
    /// is cached rather than simulated per particle.
    /// `egg` and `setup` are the ones the cook was RUN with, carried on the
    /// ticket. They used to be read off the kitchen as it stood at the moment
    /// the user got round to answering, so the time to boil came from the
    /// blended memory - a pan that had never cooked this egg - rather than from
    /// this cook's measured ramp. The grid is built from the setup, so the
    /// outcome was being attributed to a cook that never happened.
    func record(
        feedback: Feedback, egg: Egg, setup: CookSetup,
        cookTimeS: Double, logNominalTarget: Double
    ) async {
        guard !learning else { return }
        learning = true
        whiteQuestion = nil
        let current = calibration
        let outcome = await Task.detached(priority: .userInitiated) {
            Calibrations.recordOutcome(
                current, egg: egg, setup: setup,
                cookTimeS: cookTimeS, logNominalTarget: logNominalTarget, feedback: feedback
            )
        }.value
        calibration = outcome.calibration
        Calibrations.save(outcome.calibration)
        // The second question, and only when the model cannot already guess the
        // answer. On a jammy egg or anything firmer the white is far past setting
        // and every particle agrees, so nothing is asked and the default path stays
        // one tap; on a soft one the white is near its threshold and the answer
        // moves alpha. The decision is `shouldAskAboutWhite` in EggTimerCore, so
        // both apps ask on exactly the same eggs.
        whiteQuestion = outcome.askWhite
            ? WhiteQuestion(grid: outcome.grid, cookTimeS: cookTimeS)
            : nil
        learning = false
        // The egg just eaten keeps the numbers it was cooked with; the new
        // ones show up on the next cook.
        recompute()
    }

    /// Fold in the answer to the second question. Milliseconds rather than a
    /// second, because the surface it needs was built by the yolk answer and kept -
    /// but still off the main actor, because the arithmetic is the same shape.
    func recordWhite(_ white: WhiteReport) async {
        guard !learning, let question = whiteQuestion else { return }
        learning = true
        let current = calibration
        let updated = await Task.detached(priority: .userInitiated) {
            Calibrations.recordWhite(
                current, grid: question.grid, cookTimeS: question.cookTimeS, white: white
            )
        }.value
        calibration = updated
        Calibrations.save(updated)
        // Cleared only now, so the question stays on screen saying "learning…"
        // while the fold runs rather than vanishing under the finger. `learning`
        // is what stops a second tap in the meantime.
        whiteQuestion = nil
        learning = false
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

    /// Take it all back: the posterior AND the measured pan. The web app clears
    /// both from one button, and a kitchen that has forgotten your taste but
    /// still insists it knows your hob is not a state anyone asked for.
    func resetCalibration() {
        Calibrations.reset()
        calibration = Calibrations.fresh()
        whiteQuestion = nil
        BoilMemories.reset()
        boilMemory = [:]
        recompute()
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

// MARK: - Refusals, in words

/// The refusal, in words.
///
/// The DECISION - which refusal applies, where the slider must move to, and
/// whether the gap is big enough to be worth a sentence at all - is
/// `verdictFor` in EggTimerCore, so that this app and the web app cannot refuse
/// differently. What is left here is the sentence, which is this app's own: the
/// point is to teach the constraint, not merely to block the control.
private func refusalText(_ v: Verdict, setup: CookSetup) -> String {
    guard v.worthSaying else { return "" }
    let wanted = v.wanted.label.lowercased()
    let limit = v.limit.label.lowercased()

    switch v.kind {
    case .none:
        return ""

    case .whiteNeverSets:
        // The standing method's worst failure: the water falls past the
        // temperature the white needs before the white has had it, so there is
        // no cook here at all - not a soft one, not a hard one.
        return "With the heat off this pan never sets the white: the water falls below what the "
            + "white needs while the egg is still in it. Nothing on the slider is reachable. "
            + "More water, a slower boil, or keep it boiling."

    case .harderThanPanReaches:
        // The standing method's own failure: the pan cools off before the yolk
        // gets where it was asked to go, and no amount of waiting fixes it.
        return "With the heat off, the water runs out before the yolk gets there — "
            + "\(wanted) isn't reachable in \(litresText(setup.waterLitres)) L. "
            + "Hardest here is \(limit). More water, or keep it boiling."

    case .tooSoftForWhite:
        switch setup.cooling {
        case .counter:
            return "Resting on the counter keeps cooking the yolk — \(wanted) isn't reachable. "
                + "Softest here is \(limit). Use an ice bath."
        case .tap:
            return "A cold tap doesn't pull the heat out fast enough — \(wanted) isn't reachable. "
                + "Softest here is \(limit). Ice water gets you further."
        case .ice:
            return "Any shorter and the white is still raw — \(wanted) isn't reachable for this egg. "
                + "Softest here is \(limit)."
        }
    }
}

/// Litres as someone would say them: "2", not "1.7500000000000002".
private func litresText(_ litres: Double) -> String {
    litres == litres.rounded() ? String(Int(litres)) : String(format: "%.1f", litres)
}

// MARK: - Presentation helpers

/// One line on what the model expects of this cook. Which band a temperature
/// falls in is core policy; what the band is called is this app's copy.
func textureNote(peakYolkC: Double, peakWhiteC: Double) -> String {
    let t = textureFor(peakYolkC: peakYolkC, peakWhiteC: peakWhiteC)
    let white: String
    switch t.white {
    case .justSet: white = "white just set"
    case .set: white = "white set"
    case .firm: white = "white firm"
    }
    let yolk: String
    switch t.yolk {
    case .liquid: yolk = "yolk liquid"
    case .soft: yolk = "yolk soft, barely thickened"
    case .jammy: yolk = "yolk jammy"
    case .fudgy: yolk = "yolk fudgy"
    case .set: yolk = "yolk fully set"
    }
    return "\(white), \(yolk)"
}

func clockString(_ seconds: Double) -> String {
    let total = Int(max(0, seconds.rounded()))
    return String(format: "%d:%02d", total / 60, total % 60)
}
