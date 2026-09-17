import Foundation
import Observation
import EggTimerCore

/// A cook in progress.
///
/// Every deadline is an absolute `Date` and every phase is DERIVED from the
/// current time rather than counted down. A tick that stops - because the app
/// was backgrounded, the screen locked, or the phone was busy - therefore
/// cannot make the egg wrong: the next time anything asks, the answer is
/// computed from the clock. The ticker only exists to redraw.
@Observable
@MainActor
final class Cook {
    enum Phase: Equatable {
        case idle
        /// In the water, counting down to the pull.
        case cooking
        /// Out now. The one moment the app is allowed to be loud.
        case pull
        /// In the ice or under the tap, carryover still running.
        case cooling
        case done
    }

    private(set) var startedAt: Date?
    private(set) var pullAt: Date?
    private(set) var coolDoneAt: Date?
    /// nil until the question has been asked and answered. The prompt is on
    /// screen for a second or two, and during that second the app must not
    /// claim it has no permission - it does not know yet.
    private(set) var alarmAuthorized: Bool?
    private(set) var pendingAlarms = 0

    /// Bumped by the ticker purely to force a redraw; nothing reads it.
    private(set) var tick = 0
    private var ticker: Task<Void, Never>?

    /// How long the cooling step is given before the egg counts as done.
    /// Matches COOLING_SECONDS in the web app's machine.
    static let coolingSeconds: TimeInterval = 180

    var phase: Phase {
        guard let pullAt else { return .idle }
        let now = Date.now
        if now < pullAt { return .cooking }
        guard let coolDoneAt else { return .done }
        // A short grace after the pull, so the loud moment does not vanish
        // before anyone has reached the pan.
        if now < pullAt.addingTimeInterval(20) { return .pull }
        return now < coolDoneAt ? .cooling : .done
    }

    var secondsToPull: TimeInterval { max(0, (pullAt ?? .now).timeIntervalSinceNow) }
    var secondsToCoolDone: TimeInterval { max(0, (coolDoneAt ?? .now).timeIntervalSinceNow) }

    func start(cookSeconds: Double, cooling: Cooling) async {
        let now = Date.now
        let pull = now.addingTimeInterval(cookSeconds)
        // Resting on the counter has no cooling step to time: the egg is simply
        // out, and the carryover is the point rather than something to wait out.
        let coolDone = cooling == .counter ? nil : pull.addingTimeInterval(Self.coolingSeconds)

        startedAt = now
        pullAt = pull
        coolDoneAt = coolDone

        let authorized = await Alarm.shared.authorize()
        alarmAuthorized = authorized
        if authorized {
            Alarm.shared.schedule(pullAt: pull, coolDoneAt: coolDone)
        }
        pendingAlarms = await Alarm.shared.pendingCount()
        startTicking()
    }

    func cancel() {
        Alarm.shared.cancel()
        ticker?.cancel()
        ticker = nil
        startedAt = nil
        pullAt = nil
        coolDoneAt = nil
        pendingAlarms = 0
        alarmAuthorized = nil
    }

    private func startTicking() {
        ticker?.cancel()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(250))
                guard let self else { return }
                self.tick &+= 1
                if self.phase == .done { return }
            }
        }
    }
}
