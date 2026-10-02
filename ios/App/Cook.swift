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
/// perfectly correct. The ticker below exists only to revise a slow hob, to
/// push Live Activity stage changes, and to ring for a deadline no
/// notification holds.
///
/// HEATING exists only on a cold start, where t = 0 is the moment the egg goes
/// into the cold pan - the same t = 0 the physics core uses, so the one
/// deadline covers the ramp and the boil together. Until "Full rolling boil" is
/// tapped the time to boil is a guess, so the deadline is a guess, and
/// everything that shows it says so.
@Observable
@MainActor
final class Cook {
    /// What is being cooked, captured at "Eggs in". The inputs disappear off
    /// screen once a cook starts, and the Lock Screen has no access to them at
    /// all, so the description travels with the cook rather than being read
    /// back out of the controls.
    struct Ticket: Equatable, Codable {
        var doneness: String
        var peakYolkC: Double
        /// The doneness level that target came from, so a mid-cook re-solve can
        /// answer for the cook in the pan rather than for the slider.
        var level: Double
        /// The egg and the pan this cook was run with.
        ///
        /// Frozen here, and updated only when the ramp is actually measured.
        /// Read off the planner when the cook answers, the time to boil would
        /// come from the blended memory rather than from THIS cook's measured
        /// ramp, and the dose grid the posterior is updated against would
        /// describe a pan that never cooked this egg.
        var egg: Egg
        var setup: CookSetup
        /// Where the egg's mass came from, and whose carton if it was a class -
        /// for the record. No carton for a weighed egg.
        var massFrom: MassFrom
        var sizeTable: SizeTable?
        /// Where the egg came from - the fridge, the room or the cook's own
        /// number - for the record and the sentence shown while the cook runs.
        var startTemp: EggFrom
        /// Whether a measured pan was on file at "Eggs in" - what a hot start,
        /// which never times its own pan, cooked on.
        var boilRemembered: Bool
        /// The system the cook was reading at "Eggs in", for the record and the
        /// Lock Screen. Everything above is SI whatever it says.
        var units: UnitSystem
        /// The language the cook was reading at "Eggs in", for the record: the
        /// catalogue's tag.
        var lang: String
        /// How far the choice leaned from the mean solve at "Eggs in", s,
        /// carried onto a mid-cook re-solve. Zero when the time was not chosen.
        var leanS: Double

        /// What the egg was expected to be like at "Eggs in": the direction
        /// and the white's line, shown for the whole cook as the web shows
        /// them. Nil when the cook was started before they were known.
        var outcome: Outcome?
        /// What the app said at "Eggs in", as the record keeps it: every
        /// answer's probability and the time it was for (DECISIONS.md 37).
        /// Nil when the cook was started before the odds were known.
        var forecast: Forecast?

        /// How long the counted cooling runs from the pull, s: to the moment the
        /// yolk's centre peaks, for this cook (`coolingSecondsFor`).
        var coolS: Double
        /// Whether this cook has a moment to probe at: a counted cooling that
        /// ends at the peak (`probeMomentFor`).
        var probeMoment: Bool

        /// Read off the egg and the pan, not stored beside them.
        var eggGrams: Double { egg.massKg * 1000 }
        var cooling: Cooling { setup.cooling }
        var coldStart: Bool { setup.startMode == .cold }

        /// The Lock Screen's description of this cook, in its own units and
        /// its own language.
        var activity: CookActivity {
            let system = units
            return CookActivity(
                doneness: doneness,
                peakYolk: showIn(system, .temperature, peakYolkC),
                eggMass: showIn(system, .mass, eggGrams),
                cooling: cooling.rawValue,
                lang: lang
            )
        }

        /// The same cook, against a time to boil that is now known rather than
        /// guessed.
        func withTimeToBoil(_ seconds: Double) -> Ticket {
            var next = self
            next.setup.timeToBoilS = seconds
            return next
        }

        /// The same cook, re-solved: the cooling counts to the peak the new
        /// solve puts after the pull.
        func withResolved(_ result: CookResult) -> Ticket {
            var next = self
            next.coolS = coolingSecondsFor(result)
            next.probeMoment = probeMomentFor(result, cooling: cooling)
            return next
        }
    }

    private(set) var startedAt: Date?
    private(set) var pullAt: Date?
    private(set) var coolDoneAt: Date?
    /// When the cook said the eggs came out - the tap out of PULL - or nil
    /// while nobody has. The web app's `outAt_ms`, and a MEASURED pull in the
    /// record where the grace running out is only an assumed one.
    private(set) var outAt: Date?
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
    /// Alarms the system says it is actually holding for this cook, read back
    /// from `UNUserNotificationCenter` rather than assumed from the permission
    /// prompt. An egg timer that claims an alarm it has not got is worse than
    /// one with no alarm at all - which is what ios/README.md has always said,
    /// and what the subline did not do.
    private(set) var pendingAlarms = 0
    /// The deadlines a notification holds, from the same read-back. One that
    /// has been delivered is no longer pending but did its job, so it stays.
    /// Whatever is not in here, the app rings itself (`ringIfDue`).
    private var alarmCovers: Set<RingDeadline> = []
    /// The deadlines the app has rung for this cook: each rings once.
    private var rung: Set<RingDeadline> = []
    /// One report per egg, and it has to outlive the view.
    ///
    /// This was `@State` on ContentView, so a relaunch inside the hour that
    /// `restoreIfNeeded` covers brought back a finished cook with the question
    /// unasked. Answering it a second time folded the same egg into the
    /// posterior twice - a double weight on one observation, from a user who
    /// thought they were answering once.
    private(set) var feedbackGiven = false

    /// Re-solve for a time to boil, answering with the cook it now is - its
    /// total time, and the peak the cooling counts to. The machine cannot solve
    /// for itself and should not try: this is set by the view, which owns the
    /// inputs. Returning nil leaves the deadline alone.
    ///
    /// Takes the level the cook is being RUN at, so a corrected ramp re-times
    /// the egg in the pan instead of whatever the slider now says, and the lean
    /// the choice made at "Eggs in", which the re-solve carries.
    var resolveCookTime: ((Double, Double, Double) async -> CookResult?)?

    /// Whether the cook has said they have a probe thermometer, read when
    /// the alarms are scheduled: the cooling's alarm then asks for the reading.
    /// Set by the view, which owns the setting.
    var probeWanted: (() -> Bool)?

    private var ticker: Task<Void, Never>?
    private var lastRevise: Date?
    private var pushedStage: CookActivity.Stage?
    /// Whether the card has been ended for this cook, which happens once, at
    /// done: there is no done stage to push.
    private var activityFinished = false

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

    /// The last Live Activity call made. Each new one waits for it, so the
    /// calls reach ActivityKit in the order the cook made them: a cancel's
    /// end can never land before the start it is ending, and a done card's
    /// end never before the update it follows.
    private var activityCalls: Task<Void, Never>?

    /// Queue a Live Activity call behind every earlier one.
    @discardableResult
    private func activity(_ call: @escaping @Sendable () async -> Void) -> Task<Void, Never> {
        let previous = activityCalls
        let next = Task {
            await previous?.value
            await call()
        }
        activityCalls = next
        return next
    }

    // The grace and the cooling's lengths are EggTimerCore's
    // (`pullGraceSeconds`, `coolingSeconds`), so the two apps cannot time the
    // same egg differently.

    var phase: Phase { phase(at: .now) }

    /// How long the cooling counts once the eggs are out, s: to the yolk's
    /// peak for this cook, or the flat fallback when there is no cook.
    var coolFor: TimeInterval { ticket?.coolS ?? coolingSeconds }

    /// Whether this cook will ask for a probe reading when its cooling ends.
    var asksForProbe: Bool { ticket?.probeMoment == true && probeWanted?() == true }

    /// The phase at a given instant.
    ///
    /// Takes the clock rather than reading it, so one render sees ONE time. A
    /// `body` pass reads the phase about ten times, so a phase that read
    /// `Date.now` on every access could cross a boundary between two of those
    /// reads, and the label describe one phase while the button below it
    /// described the next. `TimelineView` already hands the view a date; this
    /// is what it is for.
    func phase(at now: Date) -> Phase {
        // A cook is its START, its DEADLINE and its ticket, or it is nothing.
        // Keying off `pullAt` alone would let a half-written state read as a
        // running cook: anything that set a deadline without a start - a late
        // async continuation, a partial restore - would resurrect a timer the
        // user had cancelled. Requiring all three makes that unrepresentable
        // rather than merely unlikely, which is the right guarantee for a
        // Cancel button.
        guard let pullAt, startedAt != nil, ticket != nil else { return .idle }
        // The ORDER of the remaining tests is core policy, so the two apps
        // cannot disagree about it. See `phaseAt`. The
        // cook's tap out of PULL (`outAt`) is core's too.
        return phaseAt(
            Deadlines(
                cookEndS: pullAt.timeIntervalSince1970,
                coolEndS: coolDoneAt?.timeIntervalSince1970,
                provisional: provisional,
                outAtS: outAt?.timeIntervalSince1970
            ),
            nowS: now.timeIntervalSince1970
        )
    }

    /// The cook time actually used, egg-in to egg-out. This is what the
    /// calibration is told, and it is derived from the two dates rather than
    /// remembered separately, so a cold start's revisions are already in it.
    var cookSeconds: TimeInterval {
        guard let startedAt, let pullAt else { return 0 }
        return pullAt.timeIntervalSince(startedAt)
    }

    /// This egg as a record (INFERENCE.md section 4), with whichever answers
    /// have been given - nil for one nobody gave - or nil when there is no cook.
    ///
    /// The pull is MEASURED when the cook tapped out of PULL (`pulledOut`) -
    /// `pulledBy: .cook`, at the tap, as the web app records it - and ASSUMED
    /// when the grace simply ran out: `.timeout`, at the scheduled time.
    func eggRecord(yolk: Feedback?, white: WhiteReport? = nil, probe: ProbeReading? = nil) -> EggRecord? {
        guard let startedAt, pullAt != nil, let ticket else { return nil }
        let scheduled = cookSeconds
        let measured = outAt.map { $0.timeIntervalSince(startedAt) }.flatMap { $0 > 0 ? $0 : nil }
        return EggRecord(
            day: Self.day(startedAt),
            app: .ios,
            appVersion: Calibrations.appVersion,
            egg: RecordEgg(
                massG: recordMassG(massKg: ticket.egg.massKg),
                massFrom: ticket.massFrom,
                sizeTable: ticket.massFrom == .sizeClass ? ticket.sizeTable ?? .eu : nil
            ),
            setup: RecordSetup(
                setup: ticket.setup,
                eggFrom: ticket.startTemp,
                timeToBoilFrom: Self.timeToBoilFrom(ticket)
            ),
            level: ticket.level,
            recommendedS: scheduled,
            pulledS: measured ?? scheduled,
            pulledBy: measured == nil ? .timeout : .cook,
            cooledS: ticket.cooling == .counter ? 0 : coolFor,
            yolk: yolk,
            white: white,
            probe: probe,
            forecast: ticket.forecast,
            lang: ticket.lang,
            // What kind of English the answers were given in: the fit
            // can then tell a 1750 "Too rear" from a modern "Too soft".
            register: registerOf(ticket.lang),
            units: ticket.units
        )
    }

    /// A probe reading typed at DONE, as the record carries it: in C, and when
    /// it was asked for - the end of the counted cooling - from the moment the
    /// record scores as the pull. Nil when there is no cook.
    func probeReading(centreC: Double) -> ProbeReading? {
        guard let startedAt, let record = eggRecord(yolk: nil) else { return nil }
        let asked = coolDoneAt.map { $0.timeIntervalSince(startedAt) - recordCookTimeS(record) }
        return ProbeReading(centreC: recordProbeC(centreC), afterS: asked.flatMap { $0 >= 0 ? $0 : nil })
    }

    /// Where the solve's time to boil came from. A cold start cannot finish
    /// without the boil being tapped, so it is always measured. A hot start
    /// cooked on the remembered pan or the default guess.
    private static func timeToBoilFrom(_ ticket: Ticket) -> TimeToBoilFrom {
        if ticket.setup.startMode == .cold { return .measured }
        return ticket.boilRemembered ? .remembered : .default
    }

    /// The local calendar day a cook started on, YYYY-MM-DD. A day, not a
    /// timestamp.
    private static func day(_ date: Date) -> String {
        let c = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
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
        activityFinished = false
        alarmCovers = []
        rung = []
        setDeadlines(from: now, cookSeconds: cookSeconds, cooling: ticket.cooling)

        let authorized = await Alarm.shared.authorize()
        guard gen == generation else { return }
        alarmAuthorized = authorized
        if authorized { scheduleAlarms() }
        await readBackAlarms()
        guard gen == generation else { return }

        if let state = activityState {
            let attributes = ticket.activity
            await activity { await LiveActivity.start(attributes, state: state) }.value
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
        guard let result = await resolveCookTime?(measured, ticket.level, ticket.leanS) else { return nil }
        // Cancelled while the solve was running: there is no cook to correct.
        guard gen == generation else { return nil }
        assumedBoilS = measured
        provisional = false
        // The pan that actually cooked this egg. The calibration is told about
        // the measured ramp, not the blend that was guessed at "Eggs in"; and
        // the cooling counts to the peak this solve puts after the pull.
        self.ticket = ticket.withTimeToBoil(measured).withResolved(result)
        setDeadlines(from: startedAt, cookSeconds: result.cookTimeS, cooling: ticket.cooling)
        if alarmAuthorized == true { scheduleAlarms() }
        await readBackAlarms()
        guard gen == generation else { return nil }
        pushActivity(force: true)
        return measured
    }

    /// "They're in the ice bath", "they're under the tap", "they're out": the
    /// cook's tap out of PULL, mirroring the web machine's `beginCooling`. The
    /// cooling is timed from the tap rather than from the end of the grace, and
    /// the tap is what the record calls a measured pull.
    func pulledOut() {
        let now = Date.now
        guard phase(at: now) == .pull, let ticket else { return }
        Ringer.shared.stop()
        outAt = now
        coolDoneAt = ticket.cooling == .counter ? nil : now.addingTimeInterval(coolFor)
        persist()
        // The pull alarm has been and gone; this puts the cooled one at the
        // cooling's new end.
        if alarmAuthorized == true { scheduleAlarms() }
        Task { await readBackAlarms() }
        pushActivity(force: true)
    }

    func cancel() {
        generation &+= 1
        Alarm.shared.cancel()
        Ringer.shared.stop()
        activity { await LiveActivity.endAll() }
        ticker?.cancel()
        ticker = nil
        startedAt = nil
        pullAt = nil
        coolDoneAt = nil
        outAt = nil
        ticket = nil
        assumedBoilS = 0
        provisional = false
        pendingAlarms = 0
        alarmCovers = []
        rung = []
        alarmAuthorized = nil
        feedbackGiven = false
        pushedStage = nil
        activityFinished = false
        lastRevise = nil
        persist()
    }

    /// Record that this egg has been reported on. Idempotent by construction:
    /// the caller asks first, and a second call cannot fold a second
    /// observation because there is nothing left to fold.
    func recordFeedbackGiven() {
        guard !feedbackGiven else { return }
        feedbackGiven = true
        persist()
    }

    private func setDeadlines(from origin: Date, cookSeconds: Double, cooling: Cooling) {
        let pull = origin.addingTimeInterval(cookSeconds)
        pullAt = pull
        outAt = nil
        // Resting on the counter has no cooling step to time: the egg is simply
        // out, and the carryover is the point rather than something to wait out.
        coolDoneAt = cooling == .counter
            ? nil
            : pull.addingTimeInterval(pullGraceSeconds + coolFor)
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
        var feedbackGiven: Bool
        /// The cook's tap out of PULL, or nil while nobody has made it.
        var outAt: Date?
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
            assumedBoilS: assumedBoilS, provisional: provisional,
            feedbackGiven: feedbackGiven, outAt: outAt, ticket: ticket
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
        guard let data = UserDefaults.standard.data(forKey: Self.savedKey) else { return }
        // A cook this build cannot read whole is dropped, not patched: no build
        // that saved an older shape left the owner's devices.
        guard let saved = try? JSONDecoder().decode(Saved.self, from: data) else {
            UserDefaults.standard.removeObject(forKey: Self.savedKey)
            return
        }

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
        feedbackGiven = saved.feedbackGiven
        outAt = saved.outAt
        ticket = saved.ticket
        // The alarms were handed to the system at absolute dates and are still
        // pending; read the count back rather than assuming it.
        let gen = generation
        Task {
            // A cancel while either of these is awaited ends this cook; what
            // they return is then about a cook that no longer exists.
            let authorized = await Alarm.shared.authorize()
            guard gen == generation else { return }
            alarmAuthorized = authorized
            await readBackAlarms()
            guard gen == generation else { return }
            // Re-establish the Lock Screen card. A cook can come back from a
            // force-quit, but it can also come back from a reinstall, which
            // takes the activity with it - and an app that has restored a cook
            // while the Lock Screen shows nothing is the same broken promise in
            // the other direction. A cook that is already finished gets none:
            // there is nothing left to count down to.
            if phase != .done, let state = activityState {
                let attributes = saved.ticket.activity
                await activity { await LiveActivity.start(attributes, state: state) }.value
                guard gen == generation else { return }
                pushedStage = state.stage
            }
        }
        startTicking()
    }

    private func scheduleAlarms() {
        guard let pullAt else { return }
        Alarm.shared.schedule(
            pullAt: pullAt, coolDoneAt: coolDoneAt, probe: asksForProbe,
            cooling: ticket?.cooling ?? .ice
        )
    }

    /// Ask the system what it is holding, rather than assuming.
    ///
    /// A cancel while the system is asked leaves the answer unread: it is
    /// about a cook that no longer exists.
    private func readBackAlarms() async {
        let gen = generation
        let held = await Alarm.shared.pendingDeadlines()
        guard gen == generation else { return }
        pendingAlarms = held.count
        let now = Date.now
        let delivered = alarmCovers.filter { deadline in
            (deadline == .pull ? pullAt : coolDoneAt).map { $0 <= now } ?? false
        }
        alarmCovers = held.union(delivered)
    }

    /// Ring for a deadline no notification holds, while the app is on screen:
    /// what makes "keep the app open" true. See `deadlineToRing`.
    private func ringIfDue() {
        guard let pullAt else { return }
        let now = Date.now
        guard let due = deadlineToRing(
            phase: phase(at: now),
            nowS: now.timeIntervalSince1970,
            pullS: pullAt.timeIntervalSince1970,
            cooledS: coolDoneAt?.timeIntervalSince1970,
            authorized: alarmAuthorized,
            scheduled: alarmCovers,
            rung: rung,
            onScreenSinceS: Ringer.shared.onScreenSince?.timeIntervalSince1970
        ) else { return }
        rung.insert(due)
        Ringer.shared.ring(due)
    }

    /// The cook has just said they have a probe: the cooling's alarm, if
    /// it is still to come, now asks for the reading.
    func probeSettingChanged() {
        guard alarmAuthorized == true, phase != .done else { return }
        scheduleAlarms()
    }

    // MARK: - The ticker

    private func startTicking() {
        Ringer.shared.activate()
        ticker?.cancel()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(250))
                guard let self else { return }
                await self.reviseIfHobIsSlow()
                self.pushActivity(force: false)
                self.ringIfDue()
                if self.phase == .done { return }
            }
        }
    }

    private func reviseIfHobIsSlow() async {
        guard phase == .heating, let startedAt, let ticket else { return }
        guard secondsToPull < slowHobWhenLeftS else { return }
        let now = Date.now
        if let lastRevise, now.timeIntervalSince(lastRevise) < slowHobEveryS { return }
        lastRevise = now

        let gen = generation
        let assumed = now.timeIntervalSince(startedAt) + slowHobExtraS
        guard let result = await resolveCookTime?(assumed, ticket.level, ticket.leanS) else { return }
        guard gen == generation else { return }
        assumedBoilS = assumed
        self.ticket = ticket.withTimeToBoil(assumed).withResolved(result)
        setDeadlines(from: startedAt, cookSeconds: result.cookTimeS, cooling: ticket.cooling)
        if alarmAuthorized == true { scheduleAlarms() }
        pushActivity(force: true)
    }

    // MARK: - Live Activity

    /// What the Lock Screen should be showing. Each stage hands over its own
    /// span, so the system can draw the countdown without asking again.
    private var activityState: CookActivity.ContentState? {
        guard let startedAt, let pullAt else { return nil }
        switch phase {
        case .idle, .done:
            return nil
        case .heating:
            return .init(stage: .heating, began: startedAt, ends: pullAt, provisional: true)
        case .cooking:
            return .init(stage: .cooking, began: startedAt, ends: pullAt, provisional: false)
        case .pull:
            return .init(
                stage: .pull, began: pullAt,
                ends: pullAt.addingTimeInterval(pullGraceSeconds), provisional: false
            )
        case .cooling:
            let from = outAt ?? pullAt.addingTimeInterval(pullGraceSeconds)
            return .init(
                stage: .cooling, began: from,
                ends: coolDoneAt ?? from, provisional: false
            )
        }
    }

    /// Push only when the stage changes, or when a deadline has actually moved.
    /// The countdown itself needs no help: the system draws it from the dates.
    ///
    /// At done the card ends at once (`LiveActivity.endAll`), once per cook -
    /// including a card left from before a relaunch that restored a cook
    /// already done.
    private func pushActivity(force: Bool) {
        if phase == .done {
            guard force || !activityFinished else { return }
            activityFinished = true
            activity { await LiveActivity.endAll() }
            return
        }
        guard let state = activityState else { return }
        guard force || state.stage != pushedStage else { return }
        pushedStage = state.stage
        activity { await LiveActivity.update(state) }
    }
}

extension Cook.Ticket {
    /// Everything the cook is, frozen at "Eggs in", off the planner as it
    /// stands and the solution being started. The calibration learns from this
    /// and from nothing else, so a slider left somewhere different afterwards
    /// cannot rewrite what was cooked.
    @MainActor
    init(planner: Planner, solution: Solution) {
        self.init(
            doneness: planner.label,
            peakYolkC: solution.result.peakYolkC,
            level: planner.doneness,
            egg: planner.egg,
            setup: planner.setup,
            massFrom: planner.massFrom,
            sizeTable: planner.sizeTable,
            startTemp: planner.startTemp,
            boilRemembered: planner.hasBoilMemory,
            units: planner.units,
            lang: Copy.activeLocale,
            // The choice on screen, if it has been made: the time started IS
            // the chosen one, and a mid-cook re-solve carries its lean.
            leanS: planner.decision?.leanS ?? 0,
            outcome: planner.shownOutcome,
            // What the app says now, as the record keeps it: wherever a
            // decision has been made, as the web's ticket has it.
            forecast: planner.outcome.map { forecastOf($0, cookS: solution.result.cookTimeS) },
            // The cooling counts to the yolk's peak for this cook.
            coolS: coolingSecondsFor(solution.result),
            probeMoment: probeMomentFor(solution.result, cooling: planner.cooling)
        )
    }
}
