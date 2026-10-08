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
    /// True while "Eggs in" waits on a solve for the inputs as they now stand,
    /// so a second tap cannot start a second cook.
    private(set) var starting = false

    /// The screen is up: wire the cook to the planner, read what was stored,
    /// and pick up a cook that was running.
    func appear() {
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
            finalCount: { [planner, cook] in planner.kept.log.count - (cook.eggOpen(at: .now) ? 1 : 0) }
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
        if let boil = cook.ending()?.boil { planner.rememberBoil(boil) }
        held = nil
        cook.cancel()
        planner.redrawNudge()
        planner.refresh()
    }

    /// "Start again", at Done: what the cook leaves (`cookEnding`). A pan it
    /// timed is remembered, and an egg cooked through that nobody answered
    /// about is still logged; it folds nothing.
    func startAgain() {
        if let ending = cook.ending() {
            if let boil = ending.boil { planner.rememberBoil(boil) }
            if let egg = cook.unanswered() { logUnanswered(egg) }
        }
        held = nil
        cook.cancel()
        planner.endEgg()
        // A new cook, a new nudge.
        planner.redrawNudge()
        planner.refresh()
        // The egg just finished is final now: no answer can be added to it.
        Sharing.shared.sendFinal()
    }

    /// Back in the foreground, or about to take an answer: a cook that is no
    /// longer the egg open to correction (`Cook.stillOpen`: too old, or no
    /// longer the stored cook) is ended as Start again ends it, so its
    /// questions go and nothing more is logged for it; an unanswered egg
    /// cooked through is logged as Start again logs it (running-cook review
    /// 2.2, 2.3).
    func endIfNoLongerOpen() {
        guard cook.running != nil, !cook.stillOpen() else { return }
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
            held = Planner.Answers(yolk: yolk, white: white, probe: probe)
            #if DEBUG
            Screenshots.log("answer held")
            #endif
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
            Screenshots.log("answer held made")
            #endif
            cook.recordFeedbackGiven()
            Task { await planner.record(egg) }
        } else if !cook.recordWaitsForSurface {
            // Refused for another reason, or the cook is gone: nothing to make.
            held = nil
        }
    }

    /// Log a finished egg nobody answered about, made on its pot's surface
    /// when it must be (`Cook.unansweredRecord`), and send what is final.
    private func logUnanswered(_ egg: Cook.Unanswered) {
        Task {
            guard let record = await Cook.unansweredRecord(egg) else { return }
            planner.logUnanswered(record)
            Sharing.shared.sendFinal()
        }
    }
}
