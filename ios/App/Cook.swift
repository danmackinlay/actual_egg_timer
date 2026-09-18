import Foundation
import Observation
import EggTimerCore

/// A cook in progress.
///
///     IDLE -> HEATING -> COOKING -> PULL -> COOLING -> DONE
///
/// Every deadline is an absolute `Date` and every phase is DERIVED from the
/// current time rather than counted down. A tick that stops - because the app
/// was backgrounded, the screen locked, or the phone was busy - therefore
/// cannot make the egg wrong: the next time anything asks, the answer is
/// computed from the clock.
///
/// Nothing here drives the display. Redrawing a countdown is the view's job and
/// SwiftUI has a mechanism for it (`TimelineView`); a counter bumped here to
/// force a redraw does NOT work under `@Observable`, because a property the
/// view never reads creates no dependency - which is exactly the bug that used
/// to leave the on-screen clock frozen while the alarm underneath it was
/// perfectly correct. The ticker below exists only to revise a slow hob and to
/// push Live Activity stage changes.
///
/// HEATING exists only on a cold start, where t = 0 is the moment the egg goes
/// into the cold pan - the same t = 0 the physics core uses, so the one
/// deadline covers the ramp and the boil together. Until "Full rolling boil" is
/// tapped the time to boil is a guess, so the deadline is a guess, and
/// everything that shows it says so.
@Observable
@MainActor
final class Cook {
    enum Phase: Equatable {
        case idle
        /// Cold start, in the pan, water not yet at a rolling boil.
        case heating
        /// In the water, counting down to the pull.
        case cooking
        /// Out now. The one moment the app is allowed to be loud.
        case pull
        /// In the ice or under the tap, carryover still running.
        case cooling
        case done
    }

    /// What is being cooked, captured at "Eggs in". The inputs disappear off
    /// screen once a cook starts, and the Lock Screen has no access to them at
    /// all, so the description travels with the cook rather than being read
    /// back out of the controls.
    struct Ticket: Equatable, Codable {
        var doneness: String
        var peakYolkC: Double
        var peakWhiteC: Double
        var eggGrams: Double
        var cooling: Cooling
        var coldStart: Bool
        /// log10 of the yolk dose this cook was ASKED for, captured at "Eggs
        /// in". The calibration needs what was requested, not what the slider
        /// happens to say by the time the egg is eaten.
        var logNominalTarget: Double
    }

    private(set) var startedAt: Date?
    private(set) var pullAt: Date?
    private(set) var coolDoneAt: Date?
    private(set) var ticket: Ticket?

    /// How much of the cook is currently believed to be the heating ramp, s.
    /// Zero on a hot start, where no ramp is on the clock.
    private(set) var assumedBoilS: Double = 0
    /// True on a cold start until the boil is tapped.
    private(set) var provisional = false

    /// nil until the question has been asked and answered. The prompt is on
    /// screen for a second or two, and during that second the app must not
    /// claim it has no permission - it does not know yet.
    private(set) var alarmAuthorized: Bool?
    private(set) var pendingAlarms = 0

    /// Re-solve for a time to boil, answering with the total cook time. The
    /// machine cannot solve for itself and should not try: this is set by the
    /// view, which owns the inputs. Returning nil leaves the deadline alone.
    var resolveCookTime: ((Double) async -> Double?)?

    private var ticker: Task<Void, Never>?
    private var lastRevise: Date?
    private var pushedStage: CookActivity.Stage?

    /// Bumped whenever the cook this object represents changes identity - a
    /// start, or a cancel.
    ///
    /// Every method below that awaits is holding values it read BEFORE the
    /// await, and the user can press Cancel during it. Without this guard, a
    /// cancel that lands while `recordBoil` or the slow-hob revision is waiting
    /// on a solve gets overwritten the moment the solve returns: `setDeadlines`
    /// writes `pullAt` back from a captured `startedAt`, and since `phase` keys
    /// off `pullAt`, the app springs back to a cook the user had just stopped.
    /// That is not hypothetical - it is what "cancel doesn't reset" looks like.
    private var generation = 0

    /// How long the cooling step is given before the egg counts as done.
    /// Matches COOLING_SECONDS in the web app's machine.
    static let coolingSeconds: TimeInterval = 180
    /// If nobody confirms the transfer, assume it happened. A stalled timer at
    /// the hob is worse than a slightly optimistic one.
    static let pullGraceSeconds: TimeInterval = 20

    /// A cold start still not boiling this close to its provisional deadline
    /// has a slower hob than we assumed. Push the estimate out rather than
    /// count down to an alarm for an egg that has not begun cooking.
    private static let reviseWhenLeftS: TimeInterval = 45
    private static let reviseExtraS: TimeInterval = 60
    private static let reviseEverySSeconds: TimeInterval = 10

    var phase: Phase {
        // A cook is its START, its DEADLINE and its ticket, or it is nothing.
        // Keying off `pullAt` alone let a half-written state read as a running
        // cook: anything that set a deadline without a start - a late async
        // continuation, a partial restore - resurrected a timer the user had
        // cancelled. Requiring all three makes that unrepresentable rather than
        // merely unlikely, which is the right guarantee for a Cancel button.
        guard let pullAt, startedAt != nil, ticket != nil else { return .idle }
        if provisional { return .heating }
        let now = Date.now
        if now < pullAt { return .cooking }
        guard let coolDoneAt else { return .done }
        if now < pullAt.addingTimeInterval(Self.pullGraceSeconds) { return .pull }
        return now < coolDoneAt ? .cooling : .done
    }

    /// The cook time actually used, egg-in to egg-out. This is what the
    /// calibration is told, and it is derived from the two dates rather than
    /// remembered separately, so a cold start's revisions are already in it.
    var cookSeconds: TimeInterval {
        guard let startedAt, let pullAt else { return 0 }
        return pullAt.timeIntervalSince(startedAt)
    }

    var secondsToPull: TimeInterval { max(0, (pullAt ?? .now).timeIntervalSinceNow) }
    var secondsToCoolDone: TimeInterval { max(0, (coolDoneAt ?? .now).timeIntervalSinceNow) }
    /// Seconds of cooking after the boil is reached - the number every recipe
    /// quotes, and the only part of a cold start comparable to one.
    var secondsAfterBoil: TimeInterval {
        guard let startedAt, let pullAt else { return 0 }
        return pullAt.timeIntervalSince(startedAt) - assumedBoilS
    }

    // MARK: - Driving the cook

    func start(
        cookSeconds: Double, assumedBoilS: Double, coldStart: Bool, ticket: Ticket
    ) async {
        generation &+= 1
        let gen = generation
        let now = Date.now
        startedAt = now
        self.ticket = ticket
        self.assumedBoilS = coldStart ? assumedBoilS : 0
        provisional = coldStart
        lastRevise = nil
        pushedStage = nil
        setDeadlines(from: now, cookSeconds: cookSeconds, cooling: ticket.cooling)

        let authorized = await Alarm.shared.authorize()
        guard gen == generation else { return }
        alarmAuthorized = authorized
        if authorized { scheduleAlarms() }
        pendingAlarms = await Alarm.shared.pendingCount()
        guard gen == generation else { return }

        if let state = activityState {
            await LiveActivity.start(
                CookActivity(
                    doneness: ticket.doneness,
                    peakYolkC: Int(ticket.peakYolkC.rounded()),
                    eggGrams: ticket.eggGrams
                ),
                state: state
            )
            guard gen == generation else { return }
            pushedStage = state.stage
        }
        startTicking()
    }

    /// "Full rolling boil": the time to boil stops being a guess. Tapping at
    /// first bubbles under-measures the boil by 15-25%, which is why the button
    /// says what it says.
    /// Returns the measured seconds, so the caller can remember this pan.
    @discardableResult
    func recordBoil() async -> Double? {
        guard phase == .heating, let startedAt, let ticket else { return nil }
        let gen = generation
        let measured = Date.now.timeIntervalSince(startedAt)
        guard let total = await resolveCookTime?(measured) else { return nil }
        // Cancelled while the solve was running: there is no cook to correct.
        guard gen == generation else { return nil }
        assumedBoilS = measured
        provisional = false
        setDeadlines(from: startedAt, cookSeconds: total, cooling: ticket.cooling)
        if alarmAuthorized == true { scheduleAlarms() }
        pendingAlarms = await Alarm.shared.pendingCount()
        guard gen == generation else { return nil }
        pushActivity(force: true)
        return measured
    }

    func cancel() {
        generation &+= 1
        Alarm.shared.cancel()
        Task { await LiveActivity.endAll() }
        ticker?.cancel()
        ticker = nil
        startedAt = nil
        pullAt = nil
        coolDoneAt = nil
        ticket = nil
        assumedBoilS = 0
        provisional = false
        pendingAlarms = 0
        alarmAuthorized = nil
        pushedStage = nil
        lastRevise = nil
        persist()
    }

    private func setDeadlines(from origin: Date, cookSeconds: Double, cooling: Cooling) {
        let pull = origin.addingTimeInterval(cookSeconds)
        pullAt = pull
        // Resting on the counter has no cooling step to time: the egg is simply
        // out, and the carryover is the point rather than something to wait out.
        coolDoneAt = cooling == .counter
            ? nil
            : pull.addingTimeInterval(Self.pullGraceSeconds + Self.coolingSeconds)
        persist()
    }

    // MARK: - Surviving a relaunch

    /// Everything needed to pick a cook back up, as absolute dates.
    ///
    /// The alarm is already with the system and the Live Activity is already on
    /// the Lock Screen, so a force-quit or a crash leaves BOTH of them counting
    /// down to an egg the app itself has forgotten. Reopening to an idle screen
    /// while the Lock Screen says four minutes left is the worst thing an egg
    /// timer can do: it makes the user distrust the alarm that was, in fact,
    /// perfectly correct.
    private struct Saved: Codable {
        var startedAt: Date
        var pullAt: Date
        var coolDoneAt: Date?
        var assumedBoilS: Double
        var provisional: Bool
        var ticket: Ticket
    }

    private static let savedKey = "cookInProgress"

    private func persist() {
        guard let startedAt, let pullAt, let ticket else {
            UserDefaults.standard.removeObject(forKey: Self.savedKey)
            return
        }
        let saved = Saved(
            startedAt: startedAt, pullAt: pullAt, coolDoneAt: coolDoneAt,
            assumedBoilS: assumedBoilS, provisional: provisional, ticket: ticket
        )
        if let data = try? JSONEncoder().encode(saved) {
            UserDefaults.standard.set(data, forKey: Self.savedKey)
        }
    }

    /// Pick up a cook that was running when the app was last closed.
    ///
    /// Called by the view, NOT from `init`. `@State private var cook = Cook()`
    /// evaluates its initial value every time the enclosing view struct is
    /// constructed, and SwiftUI keeps only the first - so anything with side
    /// effects in `init` runs on instances that are then thrown away, starting
    /// tickers nobody will ever cancel.
    func restoreIfNeeded() {
        guard startedAt == nil else { return }
        guard
            let data = UserDefaults.standard.data(forKey: Self.savedKey),
            let saved = try? JSONDecoder().decode(Saved.self, from: data)
        else { return }

        // An egg an hour past the end of its cooling step has been eaten or
        // thrown out. Either way nobody wants yesterday's timer on screen.
        let ends = saved.coolDoneAt ?? saved.pullAt
        guard Date.now < ends.addingTimeInterval(3600) else {
            UserDefaults.standard.removeObject(forKey: Self.savedKey)
            return
        }

        startedAt = saved.startedAt
        pullAt = saved.pullAt
        coolDoneAt = saved.coolDoneAt
        assumedBoilS = saved.assumedBoilS
        provisional = saved.provisional
        ticket = saved.ticket
        // The alarms were handed to the system at absolute dates and are still
        // pending; read the count back rather than assuming it.
        Task {
            alarmAuthorized = await Alarm.shared.authorize()
            pendingAlarms = await Alarm.shared.pendingCount()
            // Re-establish the Lock Screen card. A cook can come back from a
            // force-quit, but it can also come back from a reinstall, which
            // takes the activity with it - and an app that has restored a cook
            // while the Lock Screen shows nothing is the same broken promise in
            // the other direction. A cook that is already finished gets none:
            // there is nothing left to count down to.
            if phase != .done, let state = activityState {
                await LiveActivity.start(
                    CookActivity(
                        doneness: saved.ticket.doneness,
                        peakYolkC: Int(saved.ticket.peakYolkC.rounded()),
                        eggGrams: saved.ticket.eggGrams
                    ),
                    state: state
                )
                pushedStage = state.stage
            }
        }
        startTicking()
    }

    private func scheduleAlarms() {
        guard let pullAt else { return }
        Alarm.shared.schedule(pullAt: pullAt, coolDoneAt: coolDoneAt)
    }

    // MARK: - The ticker

    private func startTicking() {
        ticker?.cancel()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(250))
                guard let self else { return }
                await self.reviseIfHobIsSlow()
                self.pushActivity(force: false)
                if self.phase == .done { return }
            }
        }
    }

    private func reviseIfHobIsSlow() async {
        guard phase == .heating, let startedAt, let ticket else { return }
        guard secondsToPull < Self.reviseWhenLeftS else { return }
        let now = Date.now
        if let lastRevise, now.timeIntervalSince(lastRevise) < Self.reviseEverySSeconds { return }
        lastRevise = now

        let gen = generation
        let assumed = now.timeIntervalSince(startedAt) + Self.reviseExtraS
        guard let total = await resolveCookTime?(assumed) else { return }
        guard gen == generation else { return }
        assumedBoilS = assumed
        setDeadlines(from: startedAt, cookSeconds: total, cooling: ticket.cooling)
        if alarmAuthorized == true { scheduleAlarms() }
        pushActivity(force: true)
    }

    // MARK: - Live Activity

    /// What the Lock Screen should be showing. Each stage hands over its own
    /// span, so the system can draw the countdown without asking again.
    private var activityState: CookActivity.ContentState? {
        guard let startedAt, let pullAt else { return nil }
        switch phase {
        case .idle:
            return nil
        case .heating:
            return .init(stage: .heating, began: startedAt, ends: pullAt, provisional: true)
        case .cooking:
            return .init(stage: .cooking, began: startedAt, ends: pullAt, provisional: false)
        case .pull:
            return .init(
                stage: .pull, began: pullAt,
                ends: pullAt.addingTimeInterval(Self.pullGraceSeconds), provisional: false
            )
        case .cooling:
            let from = pullAt.addingTimeInterval(Self.pullGraceSeconds)
            return .init(
                stage: .cooling, began: from,
                ends: coolDoneAt ?? from, provisional: false
            )
        case .done:
            return .init(stage: .done, began: pullAt, ends: pullAt, provisional: false)
        }
    }

    /// Push only when the stage changes, or when a deadline has actually moved.
    /// The countdown itself needs no help: the system draws it from the dates.
    private func pushActivity(force: Bool) {
        guard let state = activityState else { return }
        guard force || state.stage != pushedStage else { return }
        pushedStage = state.stage
        Task {
            if state.stage == .done {
                await LiveActivity.finish(state)
            } else {
                await LiveActivity.update(state)
            }
        }
    }
}
