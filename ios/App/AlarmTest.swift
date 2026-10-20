#if DEBUG
import EggTimerApp
import EggTimerCore
import Foundation

/// `-alarmTest <s>` (Screenshots.swift), debug builds only: the two alarms a
/// cook sets, `s` and twice `s` from now, without a cook to wait through, so
/// each way the app sounds can be heard in seconds.
///
/// The notifications are the cook's: asked for with the real question and
/// set through `Alarm.schedule`, words, sound and interruption level as a
/// cook's, so with the app in the background or the phone locked they sound
/// as a cook's would. With the app on screen they are presented as a cook's
/// are, without their sound, and the app rings itself through `Ringer`, as
/// a cook's deadline does when it comes on screen (`deadlineToRing`): only
/// if the app has been on screen since before the moment. A ring lasts up
/// to 40 s, so the second replaces the first unless a touch has stopped it.
@MainActor
enum AlarmTest {
    static func start() {
        guard let lead = Screenshots.alarmTestS, lead > 0 else { return }
        Task { @MainActor in
            // The question over the screen, once there is one.
            try? await Task.sleep(for: .seconds(1))
            let allowed = await Alarm.shared.authorize()
            let pull = AppClock.nowS + lead, cooled = AppClock.nowS + 2 * lead
            if allowed {
                Alarm.shared.schedule(pullS: pull, cooledS: cooled, probe: false, cooling: .ice)
                _ = await Alarm.shared.pendingDeadlines()
            }
            for (deadline, at) in [(RingDeadline.pull, pull), (.cooled, cooled)] {
                try? await AppClock.wait(until: at)
                guard let since = Ringer.shared.onScreenSinceS, since <= at else {
                    Screenshots.log(.ringSkipped(deadline: deadline.rawValue, reason: "not on screen at the deadline"))
                    continue
                }
                Screenshots.log(.ring(deadline: deadline.rawValue))
                Ringer.shared.ring(deadline)
            }
        }
    }
}
#endif
