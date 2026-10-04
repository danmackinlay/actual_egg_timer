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
        // The machine cannot solve for itself. A cold start needs a fresh
        // answer twice: when the boil is tapped, and whenever a slow hob
        // forces the estimate out.
        cook.resolveCookTime = { [planner] seconds, level, lean, nudge in
            await planner.cookResult(timeToBoilS: seconds, level: level, leanS: lean, nudgeS: nudge)
        }
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
        #endif
        // After the solver is wired, so a restored cold start can revise
        // straight away rather than waiting for the next attempt. A cook too
        // old to pick up, finished and never answered about, is still an egg,
        // logged as "Start again" would have logged it.
        if let dropped = cook.restoreIfNeeded() {
            planner.logUnanswered(dropped)
        }
        // Sharing, if the cook turned it on (Sharing.swift): every egg in the
        // log is final but the one on screen, whose answers may still come.
        Sharing.shared.start(host: Sharing.Host(
            log: { [planner] in planner.kept.log },
            finalCount: { [planner] in planner.kept.log.count - (planner.answers == nil ? 0 : 1) }
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
    /// cook's ticket while one runs and from the controls while idle.
    func keys(_ phase: Phase) -> PhaseKeys {
        let setup = cook.ticket?.setup
        return phaseKeys(PhaseFacts(
            phase: phase,
            startMode: setup?.startMode ?? (planner.coldStart ? .cold : .hot),
            afterBoil: setup?.afterBoil ?? (planner.heatOff ? .off : .hold),
            cooling: setup?.cooling ?? planner.cooling,
            whiteSets: planner.solution?.whiteSets ?? true,
            boilKnown: planner.hasBoilMemory,
            probeWanted: cook.asksForProbe
        ))
    }

    /// "Eggs in", tapped: one cook, however many taps.
    func eggsIn() {
        guard !starting else { return }
        starting = true
        Task { await startCook() }
    }

    /// "Eggs in": start a cook on the answer to the inputs as they stand.
    ///
    /// `planner.solution` is what is on screen, and for the coalesce and the
    /// solve after any change it still answers the previous inputs - so this
    /// asks for the current one, which is the same answer unless an input has
    /// just moved. Nothing awaits between that answer landing and `cook.start(...)`
    /// taking it, so the ticket and the start are read off the inputs it was
    /// solved for, including a slider the answer has just snapped. They used
    /// to be read at two different moments - the ticket in the tap, the start
    /// mode in a task after it - and a picker change landing between the two
    /// ran a cold start's heating phase under a ticket that said hot.
    private func startCook() async {
        let current = await planner.currentSolution()
        starting = false
        guard cook.phase == .idle, let solution = current, solution.whiteSets else { return }
        await cook.start(
            cookSeconds: solution.result.cookTimeS,
            assumedBoilS: planner.timeToBoilS,
            coldStart: planner.coldStart,
            ticket: Cook.Ticket(planner: planner, solution: solution)
        )
    }

    /// Cancel, from any running phase: the idle screen solves again for the
    /// inputs as they stand.
    func cancel() {
        cook.cancel()
        planner.redrawNudge()
        planner.refresh()
    }

    /// "Start again", at Done. An egg nobody answered about is still logged;
    /// it folds nothing.
    func startAgain() {
        if !cook.feedbackGiven, let egg = cook.eggRecord(yolk: nil) {
            planner.logUnanswered(egg)
        }
        cook.cancel()
        planner.endEgg()
        // A new cook, a new nudge.
        planner.redrawNudge()
        planner.refresh()
        // The egg just finished is final now: no answer can be added to it.
        Sharing.shared.sendFinal()
    }

    /// One answer, about the yolk, the white or the probe, in whichever order
    /// they come. The first writes the egg down, before anything is learned
    /// from it; the second folds the same egg again from the posterior before
    /// it - or, after a relaunch, replays the log (`resumeAnswers`).
    func answer(yolk: Feedback?, white: WhiteReport?, probe: ProbeReading? = nil) {
        if planner.answers != nil {
            Task { await planner.secondAnswer(yolk: yolk, white: white, probe: probe) }
            return
        }
        // The cook owns the flag and persists it, so a relaunch neither asks
        // again nor logs the egg a second time as unanswered.
        guard !cook.feedbackGiven,
              let egg = cook.eggRecord(yolk: yolk, white: white, probe: probe) else { return }
        cook.recordFeedbackGiven()
        Task { await planner.record(egg) }
    }
}
