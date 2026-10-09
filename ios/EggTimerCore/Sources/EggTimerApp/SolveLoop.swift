import Foundation
import EggTimerCore

/// The idle screen's solve: one loop at a time, off the main actor, a solve
/// started at most every 90 ms (`recompute`), a change while it solves taken
/// up when that solve is done, whose answer is shown meanwhile, a step
/// behind and without the snap; only an answer to the current question is
/// applied in full. Then this pot's decision surface, once the inputs have
/// sat still, and the odds profiles the answer wants. What it finds is the
/// planner's (`solution`, `decision` and the rest); the bookkeeping is its
/// own.
///
/// The loop is not `Task.detached`, which does not inherit cancellation:
/// "Eggs in" cancels it (`currentSolution`), and a detached loop would go on
/// solving for a result thrown away.
@MainActor
public final class SolveLoop {
    /// The planner it solves for, which holds it: the two live as long as the
    /// app, and a solve in flight keeps both.
    private let planner: Planner

    init(_ planner: Planner) {
        self.planner = planner
    }

    /// The loop in flight, if one is (`recompute`), and which run it is.
    private var task: Task<Void, Never>?
    private var solverRun = 0
    /// When the loop last started a solve, for the throttle.
    private var lastSolveStart: ContinuousClock.Instant?
    /// Waiting for the inputs to sit still before building a new pot's surface.
    private var settleTask: Task<Void, Never>?
    /// Bumped by every `recompute()`: which question the inputs are asking.
    private var asked = 0
    /// Which question `solution` answers, or nil when it answers none of them -
    /// nothing yet. `solution` is current only when this equals `asked`;
    /// between an input change and the coalesced solve landing, it is the
    /// answer to the PREVIOUS inputs.
    private var answered: Int?
    /// Profiles asked for and not yet in, so each lands once.
    private var profilesAsked = Set<String>()

    /// Whether a solve, a surface or a profile is under way.
    public var busy: Bool { task != nil || settleTask != nil || !profilesAsked.isEmpty }

    /// Solves start at most this often. A drag fires `didSet` on every step,
    /// and a solve is too long to run on each one - with the heat off it is a
    /// standing scan. 90 ms, the same window the web app uses.
    private static let coalesce = Duration.milliseconds(90)

    /// How long the inputs must sit still, after the solve, before a new pot's
    /// decision surface is built. The web app's `DECISION_SETTLE_MS`.
    private static let settle = Duration.milliseconds(300)

    /// The question the inputs ask, read on the main actor for a solve off it:
    /// what `recompute` and `currentSolution` both solve for.
    private struct InputSnapshot: Sendable {
        let level: Double
        let egg: Egg
        let setup: CookSetup
        let calibration: Calibration
        /// What the advice needs to know that the setup does not say: whether
        /// the egg is a size off the carton, and whether its start is the room
        /// preset's assumption rather than the fridge.
        let facts: AdviceFacts
        /// The nudge, for a cook who is sharing (E8); zero otherwise.
        let nudgeS: Double

        /// What this pot's decision surface and odds profile are kept by.
        var inputs: DecisionInputs { decisionInputs(calibration, egg: egg, setup: setup) }
    }

    /// The inputs as they stand.
    private var inputSnapshot: InputSnapshot {
        InputSnapshot(
            level: planner.settings.doneness, egg: planner.egg, setup: planner.setup, calibration: planner.calibration,
            facts: AdviceFacts(eggFromClass: planner.massFrom == .sizeClass, startAssumed: planner.settings.startTempMode == .room),
            nudgeS: planner.nudgeS
        )
    }

    /// Re-solve for the inputs as they stand.
    ///
    /// A THROTTLE, as the web's `scheduleSolve` is, not a debounce. It used to
    /// cancel the solve in flight and wait out 90 ms afresh on every change,
    /// so a stepper held down (a change every 100 ms) or a drag landed nothing
    /// at all until the finger stopped: measured on the simulator, the time on
    /// screen froze for the whole two seconds of a hold (LOGBOOK.md, 4 October
    /// 2026). Now one solve loop runs at a time. A change while it solves is
    /// picked up when it finishes; the answer it just got is shown meanwhile,
    /// a step behind, without the snap (`applyInterim`).
    public func recompute() {
        asked &+= 1
        // A pot's surface is built only once the inputs have sat still.
        settleTask?.cancel()
        settleTask = nil
        // No pan, no solve. The sous-vide answer is `sousVide` (Planner.swift)
        // and needs none of this. It goes FIRST, before anything is solved for,
        // so it neither pays for a hot-start solve it would discard nor leaves
        // half of one on screen. Clearing the solution is what also makes the
        // start button dead, which is the truth here: there is nothing to start.
        if planner.isSousVide {
            task?.cancel()
            task = nil
            planner.solution = nil
            planner.warning = ""
            planner.decision = nil
            planner.outcome = nil
            planner.certainty = nil
            planner.oddsProfile = nil
            planner.advice = []
            planner.adviceShown = false
            planner.held = Planner.Held()
            return
        }
        // The loop in flight takes the new question when its solve is done.
        guard task == nil else { return }
        solverRun &+= 1
        let run = solverRun
        task = Task { [weak self] in
            await self?.solveLoop()
            // Only this run's own handle: one cancelled by `currentSolution`
            // may finish after a newer run has started.
            if self?.solverRun == run { self?.task = nil }
        }
    }

    /// Solve until an answer is for the inputs as they stand. The first solve
    /// of a burst starts at once; each after it at most every 90 ms, the web
    /// app's window.
    private func solveLoop() async {
        while true {
            if let last = lastSolveStart {
                let wait = Self.coalesce - (ContinuousClock.now - last)
                if wait > .zero { try? await Task.sleep(for: wait) }
            }
            guard !Task.isCancelled, !planner.isSousVide else { return }
            lastSolveStart = ContinuousClock.now
            let question = asked
            let snapshot = inputSnapshot
            let inputs = snapshot.inputs
            let answer = await Self.solve(snapshot, inputs: inputs)
            // The time is chosen on this pot's decision surface. The surface
            // does not depend on the slider, so a drag is answered from the one
            // already built and the time never jumps mid-drag; a new pot shows
            // the mean solve's time first, and the chosen one when its surface
            // lands, once the inputs have settled.
            var chosen: Answer?
            if let grid = await Services.grids.cached(inputs) {
                chosen = await Self.decided(answer, grid: grid, snapshot)
            }
            guard !Task.isCancelled, !planner.isSousVide else { return }
            guard question == asked else {
                applyInterim(chosen ?? answer, question: question)
                continue
            }
            if let chosen {
                land(chosen, question: question, calibration: snapshot.calibration)
            } else {
                apply(answer, question: question)
                settle(answer, snapshot, question: question)
            }
            return
        }
    }

    /// Build this pot's surface once the inputs have sat still, and show the
    /// time chosen on it if they still have.
    private func settle(_ answer: Answer, _ snapshot: InputSnapshot, question: Int) {
        settleTask = Task { [weak self] in
            try? await Task.sleep(for: Self.settle)
            guard !Task.isCancelled else { return }
            let grid = await Services.grids.grid(snapshot.inputs)
            guard !Task.isCancelled else { return }
            let chosen = await Self.decided(answer, grid: grid, snapshot)
            guard !Task.isCancelled, let self, question == self.asked, !self.planner.isSousVide else { return }
            self.settleTask = nil
            self.land(chosen, question: question, calibration: snapshot.calibration)
        }
    }

    /// A chosen answer, on screen: the solve is done with, and the profiles it
    /// found missing are asked for.
    private func land(_ chosen: Answer, question: Int, calibration: Calibration) {
        apply(chosen, question: question)
        askForProfiles(chosen.missing, calibration: calibration)
    }

    /// The answer, with its time decided by core (`decideAnswer`, Reach.swift),
    /// and, where the word asked is a wild guess there, what to say and
    /// whether a change the model prices makes it surer (`protocolAdvice`). Off the main actor, like the
    /// solve: a decision is a few thousand probits. Profiles not yet worked
    /// out - this pot's, and those of the changes the advice would price - are
    /// listed in `missing`. Once this pot's profile is in, the time is held by
    /// it, so a softer level never gets a later time than a firmer one
    /// (DECISIONS.md 84); until then a level has its own choice.
    private nonisolated static func decided(
        _ answer: Answer, grid: DoseGrid, _ snapshot: InputSnapshot
    ) async -> Answer {
        let egg = snapshot.egg
        let calibration = snapshot.calibration
        // The nudge moves the chosen time, where one is chosen, for a cook who
        // is sharing (E8); the time shown, the time started and the outcome
        // under it are all at the nudged time.
        let d = decideAnswer(
            calibration, egg: egg, setup: answer.setup, grid: grid, solution: answer.solution,
            level: answer.level, profile: answer.profile, nudgeS: snapshot.nudgeS
        )
        var chosen = answer
        chosen.solution = d.solution
        chosen.decision = d.decision
        chosen.nudgeS = d.nudgeS
        chosen.outcome = d.outcome
        chosen.certainty = d.certainty
        if answer.profile == nil {
            chosen.missing.append(decisionInputs(calibration, egg: egg, setup: answer.setup))
        }
        guard d.adviceWanted else { return chosen }
        var priced: [(key: String, profile: OddsProfile)] = []
        for change in pricedChanges(answer.setup) {
            let changed = decisionInputs(calibration, egg: egg, setup: change.setup)
            if let p = await Services.grids.cachedProfile(changed, calibration) {
                priced.append((key: change.key, profile: p))
            } else {
                chosen.missing.append(changed)
            }
        }
        let advice = protocolAdvice(
            answer.setup, facts: snapshot.facts, level: d.level, pAsked: d.certainty.words.pAsked, priced: priced
        )
        chosen.advice = advice.keys
        chosen.adviceShown = advice.surer
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
                _ = await Services.grids.profile(inputs, calibration)
                guard let self else { return }
                self.profilesAsked.remove(key)
                guard !self.planner.isSousVide, self.wantedProfileKeys.contains(key) else { return }
                self.recompute()
            }
        }
    }

    /// The profiles the screen wants now: this pot's, and its priced changes'.
    private var wantedProfileKeys: Set<String> {
        let calibration = planner.calibration
        let inputs = decisionInputs(calibration, egg: planner.egg, setup: planner.setup)
        var keys: Set<String> = [DecisionGrids.profileKey(inputs, calibration)]
        for change in pricedChanges(planner.setup) {
            keys.insert(DecisionGrids.profileKey(
                decisionInputs(calibration, egg: planner.egg, setup: change.setup), calibration
            ))
        }
        return keys
    }

    /// Solve, and read the result as a decision about the slider: core
    /// `answerAt`, with the setup and profile it was asked for.
    ///
    /// `nonisolated async` is what takes it off the main actor; no inner
    /// `Task` of any kind, since an unstructured task does not inherit the
    /// caller's cancellation. The caller (`recompute()`) drops a superseded
    /// answer by its question number. A running cook is planned by core
    /// (`replan`, Cook.swift), not here.
    private nonisolated static func solve(
        egg: Egg, setup: CookSetup, level: Double, calibration: Calibration, profile: OddsProfile? = nil
    ) async -> Answer {
        let a = Perf.time(.answerAt) { answerAt(
            calibration, egg: egg, setup: setup, level: level, profile: profile
        ) }
        return Answer(
            solution: a.solution, verdict: a.verdict, lowOdds: a.lowOdds, setup: setup, level: a.level,
            profile: profile
        )
    }

    /// Solve for a snapshot of the inputs. The odds at every level, if this
    /// pot's are in, set the slider's ends (Reach.swift); if not, the physical
    /// limits do.
    private nonisolated static func solve(_ snapshot: InputSnapshot, inputs: DecisionInputs) async -> Answer {
        let profile = await Services.grids.cachedProfile(inputs, snapshot.calibration)
        return await solve(
            egg: snapshot.egg, setup: snapshot.setup, level: snapshot.level,
            calibration: snapshot.calibration, profile: profile
        )
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
    /// caller reads the choices for its cook. Loops only if the inputs move
    /// again while it solves.
    public func currentSolution() async -> Solution? {
        while true {
            if planner.isSousVide { return nil }
            if let solution = planner.solution, answered == asked { return solution }
            task?.cancel()
            task = nil
            let question = asked
            let snapshot = inputSnapshot
            let inputs = snapshot.inputs
            var answer = await Self.solve(snapshot, inputs: inputs)
            // The time on screen is the chosen one whenever this pot's surface
            // is already built, so "Eggs in" starts on that one too. A
            // surface still to build is not waited for: the mean is what the
            // screen would show, and the egg is going in now.
            if let grid = await Services.grids.cached(inputs) {
                answer = await Self.decided(answer, grid: grid, snapshot)
            }
            guard question == asked else { continue }
            apply(answer, question: question)
        }
    }

    /// An answer for inputs that have moved on while it was solved: on screen
    /// so a drag or a held stepper is followed, but without the snap, which
    /// would move the slider under a finger that is still moving it. The
    /// answer for where the finger stops comes next and is applied in full.
    private func applyInterim(_ answer: Answer, question: Int) {
        apply(answer, question: question, snap: false)
    }

    private func apply(_ answer: Answer, question: Int, snap: Bool = true) {
        Perf.landed(question: question, interim: !snap, chosen: answer.decision != nil, odds: answer.profile != nil, cookS: answer.solution.result.cookTimeS)
        // What the idle screen shows, for the scripted checks: the time, and
        // whether it is decided on this pot's surface.
        Screenshots.log(.answer(
            cookS: answer.solution.result.cookTimeS, decided: answer.decision != nil, odds: answer.profile != nil
        ))
        planner.solution = answer.solution
        answered = question
        planner.decision = answer.decision
        planner.outcome = answer.decision == nil ? nil : answer.outcome
        planner.certainty = answer.decision == nil ? nil : answer.certainty
        planner.appliedNudgeS = answer.decision == nil ? 0 : answer.nudgeS
        planner.oddsProfile = answer.profile
        planner.advice = answer.advice
        planner.adviceShown = answer.decision != nil && answer.adviceShown
        planner.warning = warningText(
            answer.verdict, lowOdds: answer.lowOdds, level: answer.level, setup: answer.setup,
            water: planner.show(.water, answer.setup.waterLitres)
        )
        planner.hold()
        if snap, let snapTo = answer.verdict.snapTo, snapTo != planner.settings.doneness {
            planner.applying = true
            planner.settings.doneness = snapTo
            planner.applying = false
            SettingsStore.save(planner)
        }
    }

    private struct Answer: Sendable {
        var solution: Solution
        /// Why it was refused, if it was, and where the slider must go: only
        /// out of what the pan cannot deliver.
        var verdict: Verdict
        /// Whether the level answered is a wild guess so far, softer or
        /// firmer than every level that is not (`lowOddsAt`): the dots, which
        /// the slider rests on.
        var lowOdds: Bool
        /// The setup this answer is about, so the warning can quote the pan
        /// the answer was computed for rather than whatever is current.
        var setup: CookSetup
        /// The level the solution is for: the one asked, or the one it snapped to.
        var level: Double
        /// The choice made on it, once this pot's surface is in.
        var decision: Decision? = nil
        /// What the egg at the chosen time will be like, with the decision.
        var outcome: Outcome? = nil
        /// How sure I am of it, with the decision.
        var certainty: CertaintyReading? = nil
        /// The nudge the chosen time took (`appliedNudge`).
        var nudgeS: Double = 0
        /// The odds at every level for this pot and posterior (Reach.swift),
        /// once worked out: the warning reads its range, and the track is
        /// shaded and dotted by it.
        var profile: OddsProfile? = nil
        /// What to say under a wild guess, as catalogue keys; empty for nothing.
        var advice: [String] = []
        /// Whether the way to it shows: a wild guess that a priced change
        /// makes surer (`ProtocolAdvice.surer`).
        var adviceShown = false
        /// Profiles this answer would have used and that are not worked out
        /// yet: asked for once it is applied.
        var missing: [DecisionInputs] = []
    }

    /// Re-solve for the inputs as they stand.
    ///
    /// Needed when a cook ends: a new nudge is drawn, and a pan timed by the
    /// cook just ended is remembered, so the idle screen's time is not the
    /// one it showed before the cook.
    public func refresh() {
        recompute()
    }
}
