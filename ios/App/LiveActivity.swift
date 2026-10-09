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

    /// End the cook's card at once: a card saying "Done" beside the alarm that
    /// says the same is one message twice. The alarm stays in Notification
    /// Centre for anyone who missed it; with notifications off, the app is on
    /// screen ringing.
    ///
    /// It ends on the content it last showed, not on a done state: a card
    /// dismissed at once never draws its final content, so the widget has no
    /// words for a done stage.
    ///
    /// The same call clears everything else: a cancel, and a card left behind
    /// by a force-quit mid-cook, which would otherwise sit there counting down
    /// to an egg nobody is cooking.
    static func endAll() async {
        for activity in Activity<CookActivity>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    /// End every card to go when its own stage ends, or at once if that has
    /// passed: a card an earlier build began for a cook this build does not
    /// read, which nothing will update again. Until then it shows what it
    /// showed, beside the notifications still pending for it.
    static func endAtTheirEnds() async {
        // The card's dates are the system's (`AppClock.real`).
        let now = AppClock.system
        for activity in Activity<CookActivity>.activities {
            let ends = activity.content.state.ends
            await activity.end(nil, dismissalPolicy: ends > now ? .after(ends) : .immediate)
        }
    }

    #if DEBUG
    /// Every card the system holds for the app, its state, stage and end
    /// (in cook time), to the debug log (`Screenshots.log`).
    static func logAll(_ when: String) {
        for activity in Activity<CookActivity>.activities {
            let s = activity.content.state
            Screenshots.log(
                "\(when) activity \(activity.activityState) \(s.stage.rawValue) ends \(Int(AppClock.fromReal(s.ends).timeIntervalSince1970.rounded()))"
            )
        }
    }
    #endif

    private static func content(
        _ state: CookActivity.ContentState
    ) -> ActivityContent<CookActivity.ContentState> {
        // Past the deadline the reading is no longer trustworthy, and the
        // system should grey it out rather than keep presenting it as live.
        ActivityContent(state: state, staleDate: state.ends.addingTimeInterval(90))
    }
}
