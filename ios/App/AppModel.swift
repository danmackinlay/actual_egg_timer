import Foundation
import Observation
import EggTimerCore
import EggTimerCopy

/// The egg screen's two objects and the wiring between them: the Planner
/// (every input, the solve and the learning) and the Cook (the phase machine
/// running one egg). The views read both; what needs both at once - starting a
/// cook, ending one, an answer about the egg - is here, once, rather than in
/// whichever view has the button.
@Observable
@MainActor
final class AppModel {
    let planner = Planner()
    let cook = Cook()
    /// Corrections while a cook runs (`Edits`).
    let edits = Edits()
    /// True while "Eggs in" waits on a solve for the inputs as they now stand,
    /// so a second tap cannot start a second cook.
    private(set) var starting = false
    /// The egg a change in hand aims for, while a control is held during a
    /// cook and for a moment after (design/one-screen.md section 5): drawn
    /// in place of the live egg. Nil otherwise.
    var aimView: SectionView?

    /// The screen is up: wire the cook to the planner, read what was stored,
    /// and pick up a cook that was running.
    func appear() {
        edits.model = self
        // Install the notification delegate before anything can fire.
        Alarm.shared.activate()
        // Every plan of a running cook reads the calibration as it stands.
        cook.calibration = { [planner] in planner.calibration }
        // Whether the cooling's alarm asks for a probe reading.
        cook.probeWanted = { [planner] in planner.probe }
        // The planner's own stored state, read here rather than in its
        // init: @State evaluates its initial value on every construction of
        // the view struct and keeps only the first, so init was doing the I/O
        // and starting a solve for Planners that were then thrown away.
        planner.load()
        #if DEBUG
        planner.seed(Screenshots.seedEggs)
        Perf.drive(planner)
        LiveActivity.logAll("launch")
        Task {
            try? await Task.sleep(for: .seconds(3))
            LiveActivity.logAll("launch+3s")
            _ = await Alarm.shared.pendingDeadlines()
        }
        #endif
        // After the calibration is loaded, which the restored cook's plan
        // reads. A cook too old to pick up leaves what Start again would: a
        // pan it timed is remembered, and an egg finished and never answered
        // about is still logged.
        if let dropped = cook.restoreIfNeeded() {
            if let boil = dropped.boil { planner.rememberBoil(boil) }
            if let egg = dropped.egg { logUnanswered(egg) }
            // Answered, corrected after the pull, and its record not made
            // again before the app went: made now, before the egg is final.
            if let stale = dropped.remake {
                remakeThenEnd(stale, logged: planner.kept.log.indices.last, before: nil)
            }
        }
        // A cook picked back up: its controls show its own choices, and
        // correct it (design/one-screen.md section 4, review 2.5).
        if let running = cook.running {
            planner.adopt(running.choices)
            edits.begin()
            // A correction after the pull whose record was not made again
            // before the app went: made now.
            Task { await refreshAsRan() }
        }
        // An answer held for the pot's surface is made when a plan lands.
        cook.planTaken = { [weak self] in self?.answerHeld() }
        // A cook the tick finds too old is ended as Start again ends it.
        cook.tooOld = { [weak self] in self?.endIfNoLongerOpen() }
        // Sharing, if the cook turned it on (Sharing.swift): every egg in the
        // log is final but the stored cook's, until Start again or until it is
        // too old to pick back up (`openEggId`), so the server never has an
        // egg that can still change.
        Sharing.shared.start(host: Sharing.Host(
            log: { [planner] in planner.kept.log },
            finalCount: { [weak self, planner, cook] in
                // Nor the egg whose record is being made again as its cook
                // ends (`remakeThenEnd`), or is left stored for the next
                // launch to make (`unremade`).
                let open = cook.eggOpen(at: AppClock.now) || (self?.remaking ?? 0) > 0 || self?.unremade == true
                return planner.kept.log.count - (open ? 1 : 0)
            }
        ))
        // A finished cook answered before the relaunch keeps its open
        // questions open, if its egg is still the last in the log and has not
        // been sent: a later answer then changes nothing already shared. Here,
        // after sharing has read what it sent and before it sends anything.
        if cook.feedbackGiven, cook.phase == .done, let egg = cook.eggRecord(yolk: nil),
           Sharing.shared.state.sent < planner.kept.log.count {
            planner.resumeAnswers(egg)
        }
        // The planner solved before sharing was read, so without the nudge
        // (E8); a cook who is sharing has the time solved again with it. Not
        // the other way round: sharing reads the log, which the planner loads.
        if Sharing.shared.state.on { planner.refresh() }
    }

    /// Which words the readout says in a phase: core's `phaseKeys`, from the
    /// running cook's plan while one runs and from the controls while idle.
    func keys(_ phase: Phase) -> PhaseKeys {
        let plan = cook.plan
        let setup = plan?.setup
        return phaseKeys(PhaseFacts(
            phase: phase,
            startMode: setup?.startMode ?? (planner.coldStart ? .cold : .hot),
            afterBoil: setup?.afterBoil ?? (planner.heatOff ? .off : .hold),
            cooling: setup?.cooling ?? planner.cooling,
            whiteSets: plan?.solution.whiteSets ?? planner.solution?.whiteSets ?? true,
            boilKnown: cook.running?.boilRemembered ?? planner.hasBoilMemory,
            probeWanted: cook.asksForProbe
        ))
    }

    /// "Eggs in", tapped: one cook, however many taps.
    func eggsIn() {
        guard !starting else { return }
        starting = true
        Task { await startCook() }
    }

    /// "Eggs in": start a cook on the inputs as they stand.
    ///
    /// `planner.solution` is what is on screen, and for the coalesce and the
    /// solve after any change it still answers the previous inputs - so this
    /// asks for the current one, which is the same answer unless an input has
    /// just moved. Nothing awaits between that answer landing and the choices
    /// being read, so the cook is the inputs it was solved for, including a
    /// slider the answer has just snapped. They used to be read at two
    /// different moments - the cook in the tap, the start mode in a task after
    /// it - and a picker change landing between the two ran a cold start's
    /// heating phase under a cook that said hot.
    private func startCook() async {
        let current = await planner.currentSolution()
        starting = false
        guard cook.phase == .idle, let solution = current, solution.whiteSets else { return }
        // The controls are the cook's from here: a change is a correction.
        edits.begin()
        // Stored over a cook left for the next launch: that egg is final now.
        unremade = false
        await cook.start(
            choices: planner.choices,
            // The nudge drawn for this cook, while sharing is on (E8).
            nudgeS: planner.nudgeS,
            boilMemory: planner.boilMemory,
            units: planner.units,
            lang: Copy.activeLocale,
            // The lean of the time on screen, while its surface is found.
            leanHintS: planner.decision?.leanS ?? 0
        )
    }

    /// Cancel, from any running phase: a pan the cook timed is remembered
    /// (`cookEnding`), and the idle screen solves again for the inputs as
    /// they stand.
    func cancel() {
        edits.touchedElsewhere()
        edits.end()
        if let boil = cook.ending()?.boil { planner.rememberBoil(boil) }
        held = nil
        cook.cancel()
        planner.redrawNudge()
        planner.refresh()
    }

    /// "Start again", at Done: what the cook leaves (`cookEnding`). A pan it
    /// timed is remembered, and an egg cooked through whose answer was never
    /// made into its record is still logged, with any answer held for it
    /// (`held`), as the web logs `heldAnswers()`; with none, it folds
    /// nothing. An answered egg corrected after its pull whose record is not
    /// yet made again - a change still settling is committed just above, so
    /// the usual case - has it made first, in place of the egg logged, and
    /// only then is the cook forgotten and the egg final (`remake`,
    /// onescreen review 1.2).
    func startAgain() {
        edits.touchedElsewhere()
        edits.end()
        var stale: RunningCook?
        if let ending = cook.ending() {
            if let boil = ending.boil { planner.rememberBoil(boil) }
            if ending.remake, cook.feedbackGiven, let running = cook.running {
                stale = running
            } else if let egg = cook.unanswered() {
                logUnanswered(egg, held: held)
            }
        }
        // Read before `endEgg` lets go of what this process folded.
        let logged = planner.kept.log.indices.last
        let before = stale == nil ? nil : planner.calibrationBeforeAtHand(logged)
        held = nil
        cook.cancel(keepStored: stale != nil)
        planner.endEgg()
        // A new cook, a new nudge.
        planner.redrawNudge()
        planner.refresh()
        if let stale {
            remakeThenEnd(stale, logged: logged, before: before)
        } else {
            // The egg just finished is final now: no answer can be added to it.
            Sharing.shared.sendFinal()
        }
    }

    /// How many ended cooks' records are being made again (`remakeThenEnd`):
    /// their eggs are not final until they are.
    private(set) var remaking = 0

    /// An ended cook whose record could not be made again (`remakeThenEnd`),
    /// left stored for the next launch to make: its egg is not final until
    /// then, or until a new cook is stored over it.
    private var unremade = false

    /// How many times more an ended cook's record is tried before the cook
    /// is left stored: the web's `RECORD_TRIES`.
    private static let remakeTries = 3

    /// An answered egg's record made again for its correction after the pull
    /// (`correctedAsRan`, on `before`, the calibration before it, or worked
    /// out here), logged in place of the egg at `logged`, its answers kept;
    /// then the stored cook forgotten and what is final sent. If it cannot
    /// be made, the cook stays stored, and the next launch makes it, as a
    /// cook killed before it was made is (`Cook.restoreIfNeeded`).
    private func remakeThenEnd(_ stale: RunningCook, logged: Int?, before: Calibration?) {
        remaking += 1
        Task {
            defer { remaking -= 1 }
            let base: Calibration
            if let before { base = before } else { base = await planner.calibrationBefore(logged) }
            for _ in 0...Self.remakeTries {
                var remade = await Self.correctedAsRan(stale, before: base)
                #if DEBUG
                if Screenshots.failRemake { remade = nil }
                #endif
                guard let made = remade else { continue }
                #if DEBUG
                Screenshots.log(.asRanRemade)
                #endif
                relogCorrected(made, logged: logged)
                Cook.forgetStored(idMs: stale.idMs)
                Sharing.shared.sendFinal()
                return
            }
            unremade = true
            #if DEBUG
            Screenshots.log(.asRanNotRemade)
            #endif
        }
    }

    /// Back in the foreground, or about to take an answer: a cook that is no
    /// longer the egg open to correction (`Cook.stillOpen`: too old, or no
    /// longer the stored cook) is ended as Start again ends it, so its
    /// questions go and nothing more is logged for it; an unanswered egg
    /// cooked through is logged as Start again logs it (running-cook review
    /// 2.2, 2.3). A cook not yet planned - the moment after Eggs in - is
    /// not judged: `stillOpen` is false without a plan.
    func endIfNoLongerOpen() {
        guard cook.running != nil, cook.plan != nil, !cook.stillOpen() else { return }
        startAgain()
    }

    /// This egg's record, for scoring a probe reading against: once it has
    /// been answered, the record written then, the log's last (nothing is
    /// logged while a cook is stored), and never one made again from a
    /// plan. A plan made after the egg's own fold - at a relaunch at Done -
    /// reads a posterior that already holds the egg, so a record from it is
    /// not what was cooked to. Before an answer, the cook's own.
    func liveRecord() -> EggRecord? {
        cook.feedbackGiven ? planner.kept.log.last : cook.eggRecord(yolk: nil)
    }

    /// One answer, about the yolk, the white or the probe, in whichever order
    /// they come. The first writes the egg down, before anything is learned
    /// from it; the second folds the same egg again from the posterior before
    /// it - or, after a relaunch, replays the log (`resumeAnswers`).
    ///
    /// A first answer given before the pot's surface is built again after a
    /// relaunch, when core will not make the record (it would have no
    /// forecast), is held and made when the plan on the surface lands
    /// (`answerHeld`), a second or so later (running-cook review 1.3).
    func answer(yolk: YolkWord?, white: WhiteReport?, probe: ProbeReading? = nil) {
        // An egg already final takes no more answers (running-cook review 2.3).
        guard cook.stillOpen() else {
            endIfNoLongerOpen()
            return
        }
        if planner.answers != nil {
            Task { await planner.secondAnswer(yolk: yolk, white: white, probe: probe) }
            return
        }
        // The cook owns the flag and persists it, so a relaunch neither asks
        // again nor logs the egg a second time as unanswered.
        guard !cook.feedbackGiven else { return }
        if var waiting = held {
            waiting.yolk = waiting.yolk ?? yolk
            waiting.white = waiting.white ?? white
            waiting.probe = waiting.probe ?? probe
            held = waiting
            return
        }
        if let egg = cook.eggRecord(yolk: yolk, white: white, probe: probe) {
            cook.recordFeedbackGiven()
            Task { await planner.record(egg) }
        } else if cook.recordWaitsForSurface {
            // Its pot's surface not built yet, or a correction after the
            // pull not yet planned as it ran (`refreshAsRan`).
            held = Planner.Answers(yolk: yolk, white: white, probe: probe)
            #if DEBUG
            Screenshots.log(.answerHeld)
            #endif
        }
    }

    // MARK: - Buttons that move the cook on

    /// Full rolling boil, the egg out, and the answers to "still in the
    /// water?": a correction still settling is committed first, so the
    /// button acts on the cook as the controls say it is.
    func boil() {
        edits.touchedElsewhere()
        cook.boil()
    }

    func pulledOut() {
        edits.touchedElsewhere()
        cook.pulledOut()
    }

    func stillIn() {
        edits.touchedElsewhere()
        cook.answerStillIn()
    }

    func stillOut() {
        edits.touchedElsewhere()
        cook.answerOut()
        Task { await refreshAsRan() }
    }

    // MARK: - Corrections

    /// A correction committed (`Edits.commit`): the cook corrected
    /// (`Cook.correct`), and after the pull the record with it.
    func correct(_ choices: CookChoices, startedAtS: Double?) {
        cook.correct(choices: choices, startedAtS: startedAtS, answered: cook.feedbackGiven || held != nil)
        Task { await refreshAsRan() }
    }

    /// A correction after the pull corrects the record (DECISIONS.md 96,
    /// 98): the plan as it ran is made again for the corrected cook, on the
    /// calibration before this egg (`Planner.calibrationBefore`, core
    /// `asRanCorrected`), never on one that has folded this egg's own answer
    /// (design/one-screen.md section 4, "Never from its own outcome"), on
    /// that calibration's surface and odds for the corrected pot, built off
    /// the main actor. Done shows it once it is in. An egg already logged
    /// has its record replaced from the same plan, its answers kept, and is
    /// folded again (`Planner.replaceLogged`); an answer held meanwhile (the
    /// record refused as stale) is made then. Dropped if the cook has been
    /// corrected again, or has ended, before it lands.
    func refreshAsRan() async {
        guard let running = cook.running, running.events.pulled != nil, running.asRan != nil,
              !asRanCurrent(running) else { return }
        #if DEBUG
        // `-uiHoldAsRan YES`: never made in this launch, as if the app were
        // killed before it landed (Screenshots.swift).
        if Screenshots.holdAsRan { return }
        #endif
        let logged = cook.feedbackGiven ? planner.kept.log.indices.last : nil
        let before = await planner.calibrationBefore(logged)
        let made = await Self.correctedAsRan(running, before: before)
        guard let made, let now = cook.running, now.idMs == running.idMs,
              now.correctedAtS == running.correctedAtS else { return }
        cook.keepCorrectedAsRan(made.cook)
        #if DEBUG
        Screenshots.log(.asRanCorrected)
        #endif
        relogCorrected(made, logged: logged)
        answerHeld()
    }

    /// The cook corrected after its pull, its plan as it ran made again on
    /// `before`, the calibration before this egg (core `asRanCorrected`), on
    /// that calibration's surface and odds for the corrected pot, built off
    /// the main actor; with that plan, for its record.
    private static func correctedAsRan(
        _ running: RunningCook, before: Calibration
    ) async -> (cook: RunningCook, plan: CookPlan)? {
        let nowS = AppClock.now.timeIntervalSince1970
        return await Task.detached(priority: .userInitiated) {
            guard let inputs = replan(running, before, surface: nil, leanHintS: 0, nowS: nowS).inputs else { return nil }
            let grid = await DecisionGrids.shared.grid(inputs)
            let profile = await DecisionGrids.shared.profile(inputs, before)
            let surface = CookSurface(inputs: inputs, grid: grid, profile: profile)
            guard let next = asRanCorrected(running, before: before, surface: surface, nowS: nowS) else { return nil }
            return (next, replan(next, before, surface: surface, leanHintS: 0, nowS: nowS))
        }.value
    }

    /// The egg at `logged`, the log's last, its record made again from
    /// `made`, its answers kept, and folded again (`Planner.replaceLogged`).
    private func relogCorrected(_ made: (cook: RunningCook, plan: CookPlan), logged: Int?) {
        guard let index = logged, index == planner.kept.log.indices.last else { return }
        let had = planner.kept.log[index]
        if let record = Cook.recordOf(made.cook, made.plan, yolk: had.yolkWord, white: had.white, probe: had.probe) {
            planner.replaceLogged(index, record)
        }
    }

    /// The answers given while the record waited for the pot's surface, made
    /// once a plan lets it; nil when none is held. On screen as given.
    private(set) var held: Planner.Answers?

    /// A plan has landed: the held answer, if the record can be made now.
    private func answerHeld() {
        guard let h = held else { return }
        guard cook.stillOpen() else {
            held = nil
            return
        }
        if let egg = cook.eggRecord(yolk: h.yolk, white: h.white, probe: h.probe) {
            held = nil
            guard !cook.feedbackGiven else { return }
            #if DEBUG
            Screenshots.log(.answerHeldMade)
            #endif
            cook.recordFeedbackGiven()
            Task { await planner.record(egg) }
        } else if !cook.recordWaitsForSurface {
            // Refused for another reason, or the cook is gone: nothing to make.
            held = nil
        }
    }

    /// Log a finished egg whose answer was never made into its record, with
    /// any answer `held` for it, made on its pot's surface when it must be
    /// (`Cook.unansweredRecord`), and send what is final.
    private func logUnanswered(_ egg: Cook.Unanswered, held: Planner.Answers? = nil) {
        // Logged before the stored cook goes whenever the record can be made
        // at once; only an egg whose surface must still be built waits.
        if let record = Cook.unansweredRecordNow(egg, held: held) {
            planner.logUnanswered(record)
            // Sent once final: at a relaunch now; at Start again, by its own
            // send once the stored cook is gone (this one skips it as open).
            Sharing.shared.sendFinal()
            return
        }
        Task {
            guard let record = await Cook.unansweredRecord(egg, held: held) else { return }
            planner.logUnanswered(record)
            Sharing.shared.sendFinal()
        }
    }
}
