import Foundation
import Observation
import EggTimerCore

/// A cook's alarms and its ring, as the cook hands them on: the moments the
/// plan sets (core's `alarms` effect), set with the system
/// (`Services.alarm`) once the cook may have them and read back rather than
/// assumed; and the ring in the app (`Services.ringer`, core's `ring` and
/// `silence`) for each deadline that comes while the app is on screen,
/// where someone could hear it, and that no alarm of the system's holds
/// (`deadlineToRing`).
@Observable
@MainActor
public final class CookAlarms {
    /// Whether alarms may be set: nil until asked and answered, so the
    /// screen never says there is no permission while the prompt is up.
    public private(set) var authorized: Bool?
    /// Alarms the system says it holds for this cook, read back, never
    /// assumed: an egg timer that claims an alarm it has not got is worse
    /// than one with none.
    public private(set) var pending = 0

    /// The cook on screen, and whether its cooling asks for a probe
    /// reading, read when the alarms are set (`Cook`).
    @ObservationIgnored var onScreen: () -> (cook: RunningCook?, probe: Bool) = { (nil, false) }
    /// Read-backs under way, and what is told as each ends (`Cook.isSettled`).
    @ObservationIgnored private(set) var readingBack = 0
    @ObservationIgnored var onSettled: () -> Void = {}

    /// The alarms the plan sets, epoch s.
    @ObservationIgnored private var at: (pullS: Double?, cooledS: Double?) = (nil, nil)

    /// The cook `id` begun on screen: the alarms asked for, set if they may
    /// be, and read back.
    func begin(_ id: Double) async {
        let ok = await Services.alarm.authorize()
        guard onScreen().cook?.idMs == id else { return }
        authorized = ok
        if ok { schedule() }
        await readBack()
    }

    /// The plan's alarms (core's `alarms`), set if they may be. With no cook
    /// on screen, every one is cancelled.
    func plan(pullS: Double?, cooledS: Double?) {
        at = (pullS, cooledS)
        if authorized == true || onScreen().cook == nil { schedule() }
    }

    /// Set again, as they stand: the probe setting changed, so the
    /// cooling's alarm asks for the reading or not.
    func again() {
        guard authorized == true else { return }
        schedule()
    }

    /// The alarms the plan sets, with the system: none for an end that has
    /// passed, and nothing while the plan asks whether the egg is still in.
    /// An alarm sounding sounds on until the cook stops it, or takes the
    /// eggs out in the app; with no cook on screen, every one goes.
    private func schedule() {
        let (pullS, cooledS) = at
        let (cook, probe) = onScreen()
        guard let cook else {
            Services.alarm.cancel()
            return
        }
        Services.alarm.schedule(
            pullS: pullS, cooledS: cooledS, probe: probe, cooling: cook.choices.cooling,
            silencing: cook.events.pulled?.by == .cook ? [.pull] : []
        )
        Task { await readBack() }
    }

    /// Ask the system what it is holding, rather than assuming.
    private func readBack() async {
        readingBack += 1
        defer {
            readingBack -= 1
            onSettled()
        }
        let id = onScreen().cook?.idMs
        let held = await Services.alarm.pendingDeadlines()
        guard onScreen().cook?.idMs == id else { return }
        pending = held.count
    }

    /// A deadline the step says rings (core's `ring`), of a plan with these
    /// deadlines: rung in the app if it came while the app was on screen,
    /// where someone could hear it in time, and the system holds no alarm
    /// for it (`deadlineToRing`). The system's alarm sounds over the app
    /// too, so the app ringing as well would ring the deadline twice. What
    /// the system holds is read back at the deadline, not assumed.
    func ring(_ deadline: RingDeadline, _ d: Deadlines) {
        readingBack += 1
        Task {
            defer {
                readingBack -= 1
                onSettled()
            }
            let held = await Services.alarm.pendingDeadlines()
            guard deadlineToRing(
                phase: deadline == .pull ? .pull : .done, nowS: AppClock.nowS, pullS: d.cookEndS,
                cooledS: d.coolEndS, rung: [], held: held, onScreenSinceS: Services.ringer.onScreenSinceS
            ) == deadline else {
                let reason = held.contains(deadline) ? "the system's alarm rings it" : "not on screen at the deadline"
                return DebugLog.log(.ringSkipped(deadline: deadline.rawValue, reason: reason))
            }
            DebugLog.log(.ring(deadline: deadline.rawValue))
            Services.ringer.ring(deadline)
        }
    }

    /// The ring stopped (core's `silence`).
    func silence() { Services.ringer.stop() }

    /// The cook gone from the screen: the ring stops, and the next cook's
    /// alarms are asked for afresh.
    func reset() {
        authorized = nil
        pending = 0
        Services.ringer.stop()
    }
}
