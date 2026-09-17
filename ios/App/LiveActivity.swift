import ActivityKit
import Foundation

/// The one Live Activity a cook is allowed to have.
///
/// Nothing here holds the `Activity` handle. ActivityKit's `Activity` is a
/// non-Sendable class whose methods run off the main actor, so keeping one in a
/// `@MainActor` object and awaiting on it is a data race that Swift 6 correctly
/// refuses to compile. Every call therefore asks the SYSTEM what is running and
/// acts on that - the same discipline `Alarm` uses when it reads its pending
/// count back from `UNUserNotificationCenter` rather than assuming. An egg
/// timer that claims a Lock Screen card it has not got is worse than one with
/// no card at all.
///
/// The app pushes a new state only when the STAGE changes, never once a second:
/// the countdown itself is drawn by the system from the two dates in the state.
/// Updating on a timer would drain the battery redrawing something that was
/// already correct, and would stop the moment the app was suspended - which is
/// exactly when the Lock Screen is all the user can see.
enum LiveActivity {
    /// False when the user has switched Live Activities off for this app, or
    /// the device does not do them. Worth asking rather than assuming: the
    /// timer must behave the same either way.
    static var enabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    static func start(_ attributes: CookActivity, state: CookActivity.ContentState) async {
        guard enabled else { return }
        await endAll()
        _ = try? Activity.request(attributes: attributes, content: content(state), pushType: nil)
    }

    static func update(_ state: CookActivity.ContentState) async {
        let payload = content(state)
        for activity in Activity<CookActivity>.activities {
            await activity.update(payload)
        }
    }

    /// End the cook's card, leaving the finished state on the Lock Screen
    /// briefly so someone who missed the alarm still sees what happened.
    static func finish(_ state: CookActivity.ContentState) async {
        let payload = content(state)
        for activity in Activity<CookActivity>.activities {
            await activity.end(payload, dismissalPolicy: .after(.now.addingTimeInterval(120)))
        }
    }

    /// Clear everything, including a card left behind by a force-quit mid-cook,
    /// which would otherwise sit there counting down to an egg nobody is
    /// cooking.
    static func endAll() async {
        for activity in Activity<CookActivity>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    private static func content(
        _ state: CookActivity.ContentState
    ) -> ActivityContent<CookActivity.ContentState> {
        // Past the deadline the reading is no longer trustworthy, and the
        // system should grey it out rather than keep presenting it as live.
        ActivityContent(state: state, staleDate: state.ends.addingTimeInterval(90))
    }
}
