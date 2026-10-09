import Foundation
import Observation
import EggTimerCore
import EggTimerCopy
import EggTimerShared

/// The egg screen's objects: the Planner (every input, the solve and the
/// learning), the Cook (core's state machine running one egg, and what it
/// asks of the app) and the corrections in hand (`Edits`). The views read
/// them; a button that moves the cook on commits a correction in hand first,
/// here, once, rather than in whichever view has the button.
@Observable
@MainActor
public final class AppModel {
    public let planner = Planner()
    /// Corrections while a cook runs (`Edits`).
    public let edits = Edits()
    public let cook: Cook
    /// True while "Eggs in" waits on a solve for the inputs as they now stand,
    /// so a second tap cannot start a second cook.
    public private(set) var starting = false
    /// The egg a change in hand aims for, while a control is held during a
    /// cook and for a moment after (design/one-screen.md section 5): drawn
    /// in place of the live egg. Nil otherwise.
    public var aimView: SectionView?

    public init() {
        cook = Cook(planner: planner, edits: edits)
    }

    /// The screen is up: read what was stored, pick up a cook that was
    /// running, and start sharing.
    public func appear() {
        edits.model = self
        // Install the notification delegate before anything can fire.
        Services.alarm.activate()
        // The planner's own stored state, read here rather than in its
        // init: @State evaluates its initial value on every construction of
        // the view struct and keeps only the first.
        planner.load()
        #if DEBUG
        planner.seed(Screenshots.seedEggs)
        Perf.drive(planner)
        Services.card.logAll("launch")
        Task {
            try? await Task.sleep(for: .seconds(3))
            Services.card.logAll("launch+3s")
            _ = await Services.alarm.pendingDeadlines()
        }
        #endif
        // After the calibration is loaded, which the restored cook's plan
        // reads.
        cook.restore()
        // Sharing, if the cook turned it on (Sharing.swift): every egg in the
        // log is final but one still open to correction (`Cook.eggOpen`), so
        // the server never has an egg that can still change.
        Services.sharing.start(host: ShareHost(
            log: { [planner] in planner.kept.log },
            finalCount: { [planner, cook] in
                planner.kept.log.count - (cook.eggOpen(atS: AppClock.nowS) ? 1 : 0)
            }
        ))
        // The planner solved before sharing was read, so without the nudge
        // (E8); a cook who is sharing has the time solved again with it.
        if Services.sharing.state.on { planner.refresh() }
    }

    /// Which words the idle readout says: core's `phaseKeys`, from the
    /// controls. A running cook's are its readout's (`Cook.readout`).
    public func keys(_ phase: Phase) -> PhaseKeys {
        phaseKeys(PhaseFacts(
            phase: phase,
            startMode: planner.coldStart ? .cold : .hot,
            afterBoil: planner.heatOff ? .off : .hold,
            cooling: planner.cooling,
            whiteSets: planner.solution?.whiteSets ?? true,
            boilKnown: planner.hasBoilMemory,
            probeWanted: cook.asksForProbe
        ))
    }

    /// "Eggs in", tapped: one cook, however many taps.
    public func eggsIn() {
        guard !starting else { return }
        starting = true
        Task { await startCook() }
    }

    /// "Eggs in": a cook on the inputs as they stand. `planner.solution` may
    /// still answer the inputs before a change, so this asks for the current
    /// one, and nothing awaits between it landing and the choices being read:
    /// the cook is the inputs it was solved for, a slider just snapped
    /// included.
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

    /// Cancel, and Start again at Done: a change in hand is committed first,
    /// and core decides what the cook leaves - a pan it timed remembered, an
    /// egg cooked through logged, answered or not, its record made again
    /// first for a correction after the pull.
    public func cancel() { startAgain() }

    public func startAgain() {
        edits.touchedElsewhere()
        cook.end()
    }

    /// Back in the foreground: the clock decides what is due, and a cook too
    /// old ends, its egg final, before sharing sends what it owes.
    public func endIfNoLongerOpen() {
        cook.lookAgain()
    }

    /// This egg's record, for scoring a probe reading against: once it is
    /// logged, the record written then, the log's last (nothing else is
    /// logged while a cook runs); before, the one core makes now.
    public func liveRecord() -> EggRecord? {
        cook.logged ? planner.kept.log.last : cook.eggRecord()
    }

    /// One answer, about the yolk, the white or the probe, in whichever order
    /// they come: the cook keeps it, and logs the egg as core makes its
    /// record (`Cook`).
    public func answer(yolk: YolkWord?, white: WhiteReport?, probe: ProbeReading? = nil) {
        cook.answer(yolk: yolk, white: white, probe: probe)
    }

    // MARK: - Buttons that move the cook on

    /// Full rolling boil, the egg out, and the answers to "still in the
    /// water?": a correction still settling is committed first, so the
    /// button acts on the cook as the controls say it is.
    public func boil() {
        edits.touchedElsewhere()
        cook.boil()
    }

    public func pulledOut() {
        edits.touchedElsewhere()
        cook.pulledOut()
    }

    public func stillIn() {
        edits.touchedElsewhere()
        cook.stillIn()
    }

    public func stillOut() {
        edits.touchedElsewhere()
        cook.stillOut()
    }

    /// A correction committed (`Edits.commit`).
    public func correct(_ choices: CookChoices, startedAtS: Double?) {
        cook.correct(choices: choices, startedAtS: startedAtS)
    }
}
