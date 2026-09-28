import Foundation
import Observation
import EggTimerCore
import EggTimerCopy

/// The egg screen's two objects and the wiring between them: the Kitchen
/// (every input, the solve and the learning) and the Cook (the phase machine
/// running one egg). The views read both; what needs both at once - starting a
/// cook, ending one, an answer about the egg - is here, once, rather than in
/// whichever view has the button.
@Observable
@MainActor
final class AppModel {
    let kitchen = Kitchen()
    let cook = Cook()
    /// True while "Eggs in" waits on a solve for the inputs as they now stand,
    /// so a second tap cannot start a second cook.
    private(set) var starting = false

    /// The screen is up: wire the cook to the kitchen, read what was stored,
    /// and pick up a cook that was running.
    func appear() {
        // Install the notification delegate before anything can fire.
        Alarm.shared.activate()
        // The machine cannot solve for itself. A cold start needs a fresh
        // answer twice: when the boil is tapped, and whenever a slow hob
        // forces the estimate out.
        cook.resolveCookTime = { [kitchen] seconds, level, lean in
            await kitchen.cookResult(timeToBoilS: seconds, level: level, leanS: lean)
        }
        // Whether the cooling's alarm asks for a probe reading (E4).
        cook.probeWanted = { [kitchen] in kitchen.probe }
        // The kitchen's own stored state, read here rather than in its
        // init: @State evaluates its initial value on every construction of
        // the view struct and keeps only the first, so init was doing the I/O
        // and starting a solve for Kitchens that were then thrown away.
        kitchen.load()
        #if DEBUG
        kitchen.seed(Screenshots.seedEggs)
        #endif
        // After the solver is wired, so a restored cold start can revise
        // straight away rather than waiting for the next attempt.
        cook.restoreIfNeeded()
    }

    /// Which words the readout says in a phase: core's `phaseKeys`, from the
    /// cook's ticket while one runs and from the controls while idle.
    func keys(_ phase: Phase) -> PhaseKeys {
        let setup = cook.ticket?.setup
        return phaseKeys(PhaseFacts(
            phase: phase,
            startMode: setup?.startMode ?? (kitchen.coldStart ? .cold : .hot),
            afterBoil: setup?.afterBoil ?? (kitchen.heatOff ? .off : .hold),
            cooling: setup?.cooling ?? kitchen.cooling,
            whiteSets: kitchen.solution?.whiteSets ?? true,
            boilKnown: kitchen.hasBoilMemory,
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
    /// `kitchen.solution` is what is on screen, and for the coalesce and the
    /// solve after any change it still answers the previous inputs - so this
    /// asks for the current one, which is the same answer unless an input has
    /// just moved. Nothing awaits between that answer landing and `cook.start(...)`
    /// taking it, so the ticket and the start are read off the inputs it was
    /// solved for, including a slider the answer has just snapped. They used
    /// to be read at two different moments - the ticket in the tap, the start
    /// mode in a task after it - and a picker change landing between the two
    /// ran a cold start's heating phase under a ticket that said hot.
    private func startCook() async {
        let current = await kitchen.currentSolution()
        starting = false
        guard cook.phase == .idle, let solution = current, solution.whiteSets else { return }
        await cook.start(
            cookSeconds: solution.result.cookTimeS,
            assumedBoilS: kitchen.timeToBoilS,
            coldStart: kitchen.coldStart,
            ticket: Cook.Ticket(kitchen: kitchen, solution: solution)
        )
    }

    /// Cancel, from any running phase: the idle screen solves again for the
    /// inputs as they stand.
    func cancel() {
        cook.cancel()
        kitchen.refresh()
    }

    /// "Start again", at Done. An egg nobody answered about is still logged;
    /// it folds nothing.
    func startAgain() {
        if !cook.feedbackGiven, let egg = cook.eggRecord(yolk: nil) {
            kitchen.logUnanswered(egg)
        }
        cook.cancel()
        kitchen.endEgg()
        kitchen.refresh()
    }

    /// One answer, about the yolk, the white or the probe, in whichever order
    /// they come. The first writes the egg down, before anything is learned
    /// from it; the second folds the same egg again from the posterior before
    /// it.
    func answer(yolk: Feedback?, white: WhiteReport?, probe: ProbeReading? = nil) {
        if kitchen.answers != nil {
            Task { await kitchen.secondAnswer(yolk: yolk, white: white, probe: probe) }
            return
        }
        // The cook owns the flag and persists it, so a relaunch neither asks
        // again nor logs the egg a second time as unanswered.
        guard !cook.feedbackGiven,
              let egg = cook.eggRecord(yolk: yolk, white: white, probe: probe) else { return }
        cook.recordFeedbackGiven()
        Task { await kitchen.record(egg) }
    }
}
