import Foundation
import UserNotifications

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
        completionHandler([.banner, .sound, .list])
    }

    /// Ask once. Returns false if the user has said no, in which case the cook
    /// still runs - it just cannot shout.
    func authorize() async -> Bool {
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
    func schedule(pullAt: Date, coolDoneAt: Date?) {
        cancel()

        request(
            id: pullID, at: pullAt,
            title: "Eggs out — now",
            body: "Straight into the cooling, or the yolk keeps cooking."
        )

        if let coolDoneAt {
            request(
                id: coolID, at: coolDoneAt,
                title: "Cooling done",
                body: "The carryover is over. That is the egg you asked for."
            )
        }
    }

    func cancel() {
        centre.removePendingNotificationRequests(withIdentifiers: [pullID, coolID])
    }

    /// What the system says it is holding FOR THIS COOK, for the UI to show.
    /// Claiming an alarm is set without asking is how an egg timer loses trust.
    ///
    /// Counts our two identifiers rather than every pending request on the
    /// device. The unfiltered count was a weak check that any other app's
    /// notification could satisfy - and nothing read it anyway.
    func pendingCount() async -> Int {
        let ours: Set<String> = [pullID, coolID]
        return await centre.pendingNotificationRequests()
            .filter { ours.contains($0.identifier) }
            .count
    }

    private func request(id: String, at date: Date, title: String, body: String) {
        let seconds = date.timeIntervalSinceNow
        guard seconds > 0 else { return }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
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
        centre.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }
}
