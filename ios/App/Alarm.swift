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
final class Alarm {
    static let shared = Alarm()

    private let centre = UNUserNotificationCenter.current()
    private let pullID = "cook.pull"
    private let coolID = "cook.cool"

    private init() {}

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

    /// What the system says it is holding for us, for the UI to show. Claiming
    /// an alarm is set without asking is how an egg timer loses trust.
    func pendingCount() async -> Int {
        await centre.pendingNotificationRequests().count
    }

    private func request(id: String, at date: Date, title: String, body: String) {
        let seconds = date.timeIntervalSinceNow
        guard seconds > 0 else { return }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        // An interval trigger rather than a calendar one: the cook is a
        // duration, and a clock that changes underneath it - a timezone, a
        // leap second, the user editing the time - must not move the egg.
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
        centre.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }
}
