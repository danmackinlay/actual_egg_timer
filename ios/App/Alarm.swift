import EggTimerCore
import EggTimerCopy
import Foundation
import UserNotifications
import EggTimerApp
import EggTimerShared

/// The alarm, which is the whole reason this is a native app.
///
/// A web page cannot do this. On iOS a home-screen web app's timers are
/// suspended the moment the screen locks, and WebKit has never shipped a way to
/// schedule a local notification, so the browser version can only ring while you
/// are looking at it - which is exactly when you do not need it.
///
/// Nothing of ours runs in the background either. The difference is that we can
/// hand the system ABSOLUTE fire dates up front and let it do the waiting.
@MainActor
final class Alarm: NSObject, UNUserNotificationCenterDelegate {
    static let shared = Alarm()

    private let centre = UNUserNotificationCenter.current()
    private let pullID = "cook.pull"
    private let coolID = "cook.cool"

    private override init() {
        super.init()
        centre.delegate = self
    }

    /// Touch the singleton early, so the delegate below is installed before any
    /// notification can be delivered.
    func activate() {}

    /// Present the alarm even when the app is already open.
    ///
    /// Without this iOS hands a foreground notification straight to the app and
    /// shows nothing: no banner, no sound, not even an entry on the Lock
    /// Screen. For most apps that is the right default and for this one it is a
    /// silent failure - watching the countdown is the case where the egg timer
    /// must be loudest, not quietest.
    /// Declared `nonisolated`, and the completion-handler form rather than the
    /// async one, because both parameters are non-Sendable: the async version
    /// cannot be satisfied by a main-actor method without sending them across
    /// the boundary. Nothing here touches either, so there is nothing to send.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler(Screenshots.muteAudio ? [.banner, .list] : [.banner, .sound, .list])
    }

    /// Ask once. Returns false if the user has said no, in which case the cook
    /// still runs - it just cannot shout.
    func authorize() async -> Bool {
        // Screenshots of a phase (Screenshots.swift) run on a fresh simulator,
        // where the system would ask, and its alert would be in the picture.
        if Screenshots.noAlarmPrompt { return false }
        // Quiet notifications, granted with no prompt, so a simulator nobody
        // taps still holds the alarms to read back.
        if Screenshots.provisionalAlarms {
            return (try? await centre.requestAuthorization(options: [.alert, .sound, .provisional])) ?? false
        }
        let settings = await centre.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return true
        case .denied:
            return false
        default:
            return (try? await centre.requestAuthorization(options: [.alert, .sound])) ?? false
        }
    }

    /// Schedule the two moments that matter. Both are absolute: the system owns
    /// the waiting, so a locked phone, a backgrounded app or a force-quit
    /// changes nothing.
    ///
    /// The cooling ends when the yolk's centre peaks. For a cook with a
    /// probe thermometer that is the moment to take the reading, so the second
    /// alarm asks for it instead of announcing the end.
    ///
    /// The pull alarm names the cooling the cook chose (`pullLineKey`).
    func schedule(pullS: Double?, cooledS: Double?, probe: Bool, cooling: Cooling) {
        cancel()

        if let pullAt = pullS.map(Date.init(timeIntervalSince1970:)) {
            request(
                id: pullID, moment: .pull, at: pullAt,
                title: tr("alarm.pull.title"),
                body: tr(pullLineKey(cooling: cooling.rawValue))
            )
        }

        if let coolDoneAt = cooledS.map(Date.init(timeIntervalSince1970:)) {
            request(
                id: coolID, moment: .cooled, at: coolDoneAt,
                title: tr(probe ? "alarm.probe.title" : "alarm.cooled.title"),
                body: tr(probe ? "alarm.probe.body" : "alarm.cooled.body")
            )
        }
    }

    func cancel() {
        Screenshots.log(.alarmsCancelled)
        centre.removePendingNotificationRequests(withIdentifiers: [pullID, coolID])
    }

    /// What the system says it is holding FOR THIS COOK: for the UI to show,
    /// and for the app to know which deadlines it must ring itself (Ringer).
    /// Claiming an alarm is set without asking is how an egg timer loses trust.
    ///
    /// Reads our two identifiers rather than every pending request on the
    /// device: an unfiltered count is a weak check that any other app's
    /// notification could satisfy.
    func pendingDeadlines() async -> Set<RingDeadline> {
        let ours: [String: RingDeadline] = [pullID: .pull, coolID: .cooled]
        let pending = await centre.pendingNotificationRequests()
        if Screenshots.logging {
        // Its moment in cook time, though a pending interval trigger's
        // `nextTriggerDate()` is now plus the interval, so it drifts by the
        // time since it was scheduled: `scheduled` says when it fires.
        Screenshots.log(.pending(alarms: pending.map { r in
            let at = (r.trigger as? UNTimeIntervalNotificationTrigger)?.nextTriggerDate().map(AppClock.app)
            return Screenshots.PendingAlarm(id: r.identifier, at: at.map { Int($0.timeIntervalSince1970) })
        }))
        // And those the system has delivered and still shows, which the
        // scripted checks read to see one fire.
        let delivered = await centre.deliveredNotifications().map(\.request.identifier).filter { ours[$0] != nil }
        Screenshots.log(.delivered(ids: delivered.sorted()))
        }
        return Set(pending.compactMap { ours[$0.identifier] })
    }

    private func request(id: String, moment: RingDeadline, at date: Date, title: String, body: String) {
        // The system's seconds to the moment: under a debug build's fast
        // clock, the cook's interval scaled (`AppClock`).
        let seconds = AppClock.realInterval(until: date)
        guard seconds > 0 else { return }
        Screenshots.log(.scheduled(id: id, at: date.timeIntervalSince1970, inS: seconds))

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        // The cook's sound: whole periods of it, under the
        // 30 s past which iOS plays its default instead (tools/sounds.ts).
        content.sound = UNNotificationSound(
            named: UNNotificationSoundName(AlarmSoundChoice.file(AlarmSoundChoice.shared.sound, moment))
        )
        if Screenshots.muteAudio { content.sound = nil }
        // An egg is time-sensitive in the literal sense the name was coined
        // for: thirty seconds late is a different egg. This level is what lets
        // the alarm through a Focus mode, and it is why the app carries the
        // matching entitlement (see ActualEggTimer.entitlements). Unsigned
        // simulator builds have no entitlement and silently fall back to the
        // default level, which is the correct failure: quieter, never wrong.
        content.interruptionLevel = .timeSensitive
        // Sorts the alarm above whatever else has piled up on the Lock Screen.
        content.relevanceScore = 1.0

        // An interval trigger rather than a calendar one: the cook is a
        // duration, and a clock that changes underneath it - a timezone, a
        // leap second, the user editing the time - must not move the egg.
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
        centre.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger)) { error in
            if let error { Screenshots.log(.notScheduled(id: id, error: error.localizedDescription)) }
        }
    }
}

/// What the app's logic asks of the alarms (`Services`, in EggTimerApp).
extension Alarm: AlarmScheduling {}
