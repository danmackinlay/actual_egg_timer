import Foundation
import Observation
import EggTimerCore
import EggTimerCopy
import EggTimerShared

/// The egg screen's objects: the Planner (every input, the solve and the
/// learning), the Cook (core's state machine running one egg, and what it
/// asks of the app) and the correction in hand (`InHand`). The views read
/// them; a button that moves the cook on commits a correction in hand first,
/// here, once, rather than in whichever view has the button.
@Observable
@MainActor
public final class AppModel {
    public let planner = Planner()
    /// The correction in hand while a cook runs (`InHand`).
    public let inHand = InHand()
    public let cook: Cook
    /// True while "Eggs in" waits on a solve for the inputs as they now stand,
    /// so a second tap cannot start a second cook.
    public private(set) var starting = false
    /// The egg a change in hand aims for, while a control is held during a
    /// cook and for a moment after: drawn
    /// in place of the live egg. Nil otherwise.
    public var aimView: SectionView?

    public init() {
        cook = Cook(planner: planner, inHand: inHand)
    }

    /// The screen is up: read what was stored, pick up a cook that was
    /// running, and start sharing.
    public func appear() {
        inHand.model = self
        // The planner's own stored state, read here rather than in its
        // init: @State evaluates its initial value on every construction of
        // the view struct and keeps only the first.
        planner.load()
        #if DEBUG
        // The alarms read back three seconds on, to the debug log, for the UI
        // tests: what the system holds once the launch has settled.
        Task {
            try? await Task.sleep(for: .seconds(3))
            _ = await Services.alarm.pendingDeadlines()
        }
        #endif
        // After the calibration is loaded, which the restored cook's plan
        // reads.
        cook.restore()
        // Sharing, if the cook turned it on (Sharing.swift): every egg in the
        // log is final but those still open to correction (`Cook.openEggs`),
        // so the server never has an egg that can still change. Its records
        // carry no id: the open eggs are the log's last.
        Services.sharing.start(host: ShareHost(
            log: { [planner] in planner.kept.log },
            finalCount: { [planner, cook] in
                planner.kept.log.count - cook.openEggs(atS: AppClock.nowS).count
            }
        ))
        // The planner solved before sharing was read, so without the nudge;
        // a cook who is sharing has the time solved again with it.
        if Services.sharing.state.on { planner.refresh() }
    }

    /// Which words the idle readout says: core's `phaseKeys`, from the
    /// controls. A running cook's are its readout's (`Cook.readout`).
    public func keys(_ phase: Phase) -> PhaseKeys {
        phaseKeys(PhaseFacts(
            phase: phase,
            startMode: planner.coldStart ? .cold : .hot,
            afterBoil: planner.heatOff ? .off : .hold,
            cooling: planner.settings.cooling,
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
        let current = await planner.solver.currentSolution()
        starting = false
        guard cook.phase == .idle, let solution = current, solution.whiteSets else { return }
        await cook.start(
            choices: planner.choices,
            // The nudge drawn for this cook, while sharing is on.
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
    public func cancel() {
        inHand.moveOn(.cancel)
        cook.end()
    }

    public func startAgain() {
        inHand.moveOn(.primary)
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

    /// What a probe reading saved came to: refused, with the range it should
    /// be in, or taken.
    public enum ProbeSaved: Equatable {
        case refused(lowC: Double, highC: Double)
        case taken(Double)
    }

    /// A probe reading typed at Done, in SI, or nil for one that is not a
    /// number. A change in hand is committed first, and the cook corrected,
    /// so the reading is scored on the cook as the controls say it is; then
    /// it is refused outside the range this egg could read, or taken as an
    /// answer. Nil when there is nothing to score it on, or a reading has
    /// been given.
    public func saveProbe(readingC: Double?) async -> ProbeSaved? {
        inHand.moveOn(.probe)
        await cook.caughtUp()
        guard let plan = cook.plan, cook.answers?.probe == nil, let record = liveRecord() else { return nil }
        let range = planner.probeRange(egg: plan.egg, setup: plan.setup, cookTimeS: recordCookTimeS(record))
        guard let readingC, readingC >= range.low, readingC <= range.high else {
            return .refused(lowC: range.low, highC: range.high)
        }
        guard let probe = cook.probeReading(centreC: readingC, against: record) else { return nil }
        answer(yolk: nil, white: nil, probe: probe)
        return .taken(readingC)
    }

    /// One answer, about the yolk, the white or the probe, in whichever order
    /// they come: the cook keeps it, and logs the egg as core makes its
    /// record (`Cook`).
    public func answer(yolk: YolkWord?, white: WhiteReport?, probe: ProbeReading? = nil) {
        cook.answer(yolk: yolk, white: white, probe: probe)
    }

    // MARK: - Buttons that move the cook on

    /// Rolling boil, the egg out, and the answers to "still in the
    /// water?": a correction still settling is committed first, so the
    /// button acts on the cook as the controls say it is.
    public func boil() {
        inHand.moveOn(.primary)
        cook.boil()
    }

    public func pulledOut() {
        inHand.moveOn(.primary)
        cook.pulledOut()
    }

    public func stillIn() {
        inHand.moveOn(.stillInWater)
        cook.stillIn()
    }

    public func stillOut() {
        inHand.moveOn(.stillInWater)
        cook.stillOut()
    }

    /// A correction committed (`InHand`).
    func correct(_ choices: CookChoices, startedAtS: Double?) {
        cook.correct(choices: choices, startedAtS: startedAtS)
    }
}
