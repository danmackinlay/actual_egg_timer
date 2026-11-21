import AlarmKit
import EggTimerCore
import EggTimerCopy
import Foundation
import SwiftUI
import EggTimerApp
import EggTimerShared

/// The alarm, which is the whole reason this is a native app.
///
/// A web page cannot do this. On iOS a home-screen web app's timers are
/// suspended the moment the screen locks, and WebKit has never shipped a way to
/// schedule an alarm, so the browser version can only ring while you are
/// looking at it - which is exactly when you do not need it.
///
/// Nothing of ours runs in the background either. The difference is that we can
/// hand the system ABSOLUTE fire dates up front and let it do the waiting.
///
/// The alarms are AlarmKit's: they sound as the Clock app's do, through silent
/// mode and any Focus, with a full-screen alert on the Lock Screen and on a
/// paired watch. Each is a one-off alarm at a fixed date, with no AlarmKit
/// countdown: the cook's own Live Activity (`LiveActivity`) is the countdown,
/// and a countdown of AlarmKit's would be a second card for the same egg, which
/// AlarmKit would also need a widget of its own to draw. The alert is its title
/// alone and the system's Stop.
@MainActor
final class Alarm {
    static let shared = Alarm()

    private let manager = AlarmManager.shared
    /// Fixed, so a relaunch, a new cook or a cancel finds the alarms a
    /// previous launch set, without keeping their ids anywhere.
    private let pullID = UUID(uuidString: "6A1D2C3E-0001-4E6F-9A11-5E6E0A1A2001")!
    private let coolID = UUID(uuidString: "6A1D2C3E-0002-4E6F-9A11-5E6E0A1A2002")!

    /// The work handed to AlarmKit, one call after another: scheduling is
    /// asynchronous, and a cancel or a read-back that overtook a schedule
    /// would cancel or count the alarms of the cook before.
    private var queue: Task<Void, Never>?

    private init() {}

    private func enqueue(_ work: @escaping @MainActor () async -> Void) -> Task<Void, Never> {
        let previous = queue
        let task = Task { @MainActor in
            await previous?.value
            await work()
        }
        queue = task
        return task
    }

    /// Ask once. Returns false if the cook has said no, in which case the cook
    /// still runs - it just cannot shout. AlarmKit asks once in the app's
    /// life: after a no, only Settings changes it.
    func authorize() async -> Bool {
        let ok = await ask()
        if DebugLog.logging { DebugLog.log(.alarmAuthorization(status: word(manager.authorizationState))) }
        return ok
    }

    private func ask() async -> Bool {
        // Screenshots of a phase (DebugLog.swift) run on a fresh simulator,
        // where the system would ask, and its alert would be in the picture.
        if DebugLog.noAlarmPrompt { return false }
        switch manager.authorizationState {
        case .authorized:
            return true
        case .denied:
            return false
        case .notDetermined:
            return (try? await Self.requestAuthorization()) == .authorized
        @unknown default:
            return false
        }
    }

    private func word(_ state: AlarmManager.AuthorizationState) -> String {
        switch state {
        case .notDetermined: "notDetermined"
        case .denied: "denied"
        case .authorized: "authorized"
        @unknown default: "unknown"
        }
    }

    /// Schedule the two moments that matter. Both are absolute: the system owns
    /// the waiting, so a locked phone, a backgrounded app or a force-quit
    /// changes nothing.
    ///
    /// The cooling ends when the yolk's centre peaks. For a cook with a
    /// probe thermometer that is the moment to take the reading, so the second
    /// alarm asks for it instead of announcing the end. In an egg cup the
    /// countdown ends at the opening, and the second alarm says to eat them.
    ///
    /// An alarm whose moment has come is left to sound: the plan drops a
    /// moment once it has come, and cancelling an alarm stops it. Its moment,
    /// not its state: the app's tick at the deadline can come a moment before
    /// the system starts the alarm, which a cancel then would never sound.
    /// The cook stops it with the system's Stop, or, for the pull, by taking
    /// the eggs out in the app (`silencing`).
    func schedule(pullS: Double?, cooledS: Double?, probe: Bool, cooling: Cooling, silencing: Set<RingDeadline>) {
        let cooledTitle: Words = tr(probe ? .`alarm.probe.title` : cooling == .eggCup ? .`alarm.opened.title` : .`alarm.cooled.title`)
        let pullTitle: Words = tr(.`alarm.pull.title`)
        _ = enqueue { [self] in
            let come = Set(((try? manager.alarms) ?? []).filter(hasCome).map(\.id))
            let keep = come.filter { !silencing.contains($0 == pullID ? .pull : .cooled) }
            remove(sparing: keep)
            if let pullS, !keep.contains(pullID) { await add(id: pullID, moment: .pull, atS: pullS, title: pullTitle) }
            if let cooledS, !keep.contains(coolID) { await add(id: coolID, moment: .cooled, atS: cooledS, title: cooledTitle) }
        }
    }

    func cancel() {
        _ = enqueue { [self] in remove(sparing: []) }
    }

    /// Whether an alarm sounds, or its moment has come in cook time: under a
    /// debug build's frozen clock the system's moment is a day on
    /// (`AppClock`), and the cook's is what the plan dropped.
    private func hasCome(_ alarm: AlarmKit.Alarm) -> Bool {
        if alarm.state == .alerting { return true }
        guard case .fixed(let date) = alarm.schedule else { return false }
        return AppClock.fromReal(date).timeIntervalSince1970 <= AppClock.nowS + 0.5
    }

    private func remove(sparing keep: Set<UUID>) {
        DebugLog.log(.alarmsCancelled)
        // An alarm already gone, stopped or never set, throws; nothing to do.
        for id in [pullID, coolID] where !keep.contains(id) { try? manager.cancel(id: id) }
    }

    /// What the system says it is holding FOR THIS COOK: for the UI to show,
    /// and for the app to know which deadlines it must ring itself (Ringer).
    /// Claiming an alarm is set without asking is how an egg timer loses trust.
    ///
    /// Reads our two ids rather than every alarm the app has, after any
    /// scheduling still under way.
    func pendingDeadlines() async -> Set<RingDeadline> {
        await enqueue {}.value
        let ours: [UUID: RingDeadline] = [pullID: .pull, coolID: .cooled]
        let held = ((try? manager.alarms) ?? []).filter { ours[$0.id] != nil }
        if DebugLog.logging {
            DebugLog.log(.pending(alarms: held.map { alarm in
                let at: Int? = if case .fixed(let date) = alarm.schedule {
                    Int(AppClock.fromReal(date).timeIntervalSince1970)
                } else { nil }
                return DebugLog.PendingAlarm(id: name(alarm.id), at: at, state: state(alarm.state))
            }.sorted { $0.id < $1.id }))
        }
        return Set(held.compactMap { ours[$0.id] })
    }

    private func name(_ id: UUID) -> String { id == pullID ? "cook.pull" : "cook.cool" }

    private func state(_ state: AlarmKit.Alarm.State) -> String {
        switch state {
        case .scheduled: "scheduled"
        case .countdown: "countdown"
        case .paused: "paused"
        case .alerting: "alerting"
        @unknown default: "unknown"
        }
    }

    private func add(id: UUID, moment: RingDeadline, atS: Double, title: Words) async {
        // The system's seconds to the moment: under a debug build's fast
        // clock, the cook's interval scaled (`AppClock`).
        let seconds = AppClock.realInterval(until: Date(timeIntervalSince1970: atS))
        guard seconds > 0 else { return }
        // A fixed date is an instant, not a time of day: a change of time
        // zone, or the cook setting the clock, does not move it.
        let fires = Date.now.addingTimeInterval(seconds)

        // The cook's sound, from the files the in-app ring plays: whole
        // periods of it (tools/sounds.ts).
        let file = AlarmSoundChoice.file(AlarmSoundChoice.shared.sound, moment)
        DebugLog.log(.scheduled(
            id: name(id), at: atS, inS: seconds, sound: file,
            bundled: Bundle.main.url(forResource: file, withExtension: nil) != nil
        ))
        let attributes = AlarmAttributes<CookAlarm>(
            presentation: AlarmPresentation(alert: AlarmPresentation.Alert(title: title.resource)),
            tintColor: Palette.accent
        )
        if let error = await Self.schedule(id: id, fires: fires, attributes: attributes, file: file) {
            DebugLog.log(.notScheduled(id: name(id), error: error))
        }
    }

    // AlarmManager is not Sendable, so its asynchronous calls are made off
    // the main actor, from the shared instance, with only Sendable values in
    // and out.

    nonisolated private static func requestAuthorization() async throws -> AlarmManager.AuthorizationState {
        try await AlarmManager.shared.requestAuthorization()
    }

    /// Nil once scheduled, else why not.
    nonisolated private static func schedule(
        id: UUID, fires: Date, attributes: AlarmAttributes<CookAlarm>, file: String
    ) async -> String? {
        do {
            _ = try await AlarmManager.shared.schedule(
                id: id,
                configuration: .alarm(schedule: .fixed(fires), attributes: attributes, sound: .named(file))
            )
            return nil
        } catch {
            return String(describing: error)
        }
    }
}

/// What an alarm carries for a widget to draw: nothing, since the alarms have
/// no countdown of AlarmKit's to draw.
struct CookAlarm: AlarmMetadata {}

/// What the app's logic asks of the alarms (`Services`, in EggTimerApp).
extension Alarm: AlarmScheduling {}
