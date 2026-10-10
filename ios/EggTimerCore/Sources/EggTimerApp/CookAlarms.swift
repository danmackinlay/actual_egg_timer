import Foundation
import Observation
import EggTimerCore

/// A cook's alarms and its ring, as the cook hands them on: the moments the
/// plan sets (core's `alarms` effect), set with the system
/// (`Services.alarm`) once the cook may have them and read back rather than
/// assumed; and the ring in the app (`Services.ringer`, core's `ring` and
/// `silence`) for a deadline no notification holds, while someone could
/// hear it (`deadlineToRing`).
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
    /// The moment each deadline's notification was asked for, and the
    /// deadlines a notification holds, from the read-back: one delivered
    /// is no longer pending but did its job, so a past one stays. A ring
    /// for a deadline held here is the notification's, not the app's.
    @ObservationIgnored private var notifiedAt: [RingDeadline: Double] = [:]
    @ObservationIgnored private var covers: Set<RingDeadline> = []

    /// The cook `id` begun on screen: the alarms asked for, set if they may
    /// be, and read back.
    func begin(_ id: Double) async {
        Services.ringer.activate()
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
    private func schedule() {
        let (pullS, cooledS) = at
        let now = AppClock.nowS
        // A deadline past and not moved keeps what covered it: its
        // notification has been delivered.
        covers = covers.filter { d in
            guard let at = d == .pull ? pullS : cooledS, let asked = notifiedAt[d] else { return false }
            return at <= now && abs(asked - at) < 1e-3
        }
        let (cook, probe) = onScreen()
        guard pullS != nil || cooledS != nil, let cook else {
            notifiedAt = [:]
            Services.alarm.cancel()
            return
        }
        notifiedAt = notifiedAt.filter { covers.contains($0.key) }
        if let p = pullS, p > now { notifiedAt[.pull] = p }
        if let c = cooledS, c > now { notifiedAt[.cooled] = c }
        Services.alarm.schedule(pullS: pullS, cooledS: cooledS, probe: probe, cooling: cook.choices.cooling)
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
        let now = AppClock.nowS
        // One delivered is no longer pending, and stays.
        covers = held.union(covers.filter { d in notifiedAt[d].map { $0 <= now } ?? false })
    }

    /// A deadline the step says rings (core's `ring`), of a plan with these
    /// deadlines: rung in the app unless its notification holds it, and only
    /// for one that came while the app was on screen, where someone could
    /// hear it in time (`deadlineToRing`).
    func ring(_ deadline: RingDeadline, _ d: Deadlines) {
        let now = AppClock.nowS
        // Held by a notification only if it was asked for this moment: a
        // correction that moved the deadline is not covered by the old one.
        let held = covers.filter { c in
            notifiedAt[c].map { abs($0 - (c == .pull ? d.cookEndS : d.coolEndS ?? .nan)) < 1e-3 } ?? false
        }
        guard deadlineToRing(
            phase: deadline == .pull ? .pull : .done, nowS: now, pullS: d.cookEndS, cooledS: d.coolEndS,
            authorized: authorized, scheduled: held, rung: [], onScreenSinceS: Services.ringer.onScreenSinceS
        ) == deadline else { return }
        Screenshots.log(.ring(deadline: deadline.rawValue))
        Services.ringer.ring(deadline)
    }

    /// The ring stopped (core's `silence`).
    func silence() { Services.ringer.stop() }

    /// The cook gone from the screen: the ring stops, and the next cook's
    /// alarms are asked for afresh.
    func reset() {
        authorized = nil
        pending = 0
        notifiedAt = [:]
        covers = []
        Services.ringer.stop()
    }
}
