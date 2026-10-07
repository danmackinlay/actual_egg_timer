import Foundation
import Observation
import EggTimerCore

/// A cook in progress.
///
///     IDLE -> HEATING -> COOKING -> PULL -> COOLING -> DONE
///
/// A cook is core's `RunningCook`: its start, its choices and what it
/// observed (the boil tapped, the pull, the cooling ended), as clock times
/// (design/one-screen.md section 3 and 4). Everything else is its plan
/// (`replan`), derived from those and never stored as truth: the time to
/// boil in force, the pull, the cooling's end, the record. Every phase is
/// DERIVED from the plan's deadlines and the current time (`phaseAt`) rather
/// than counted down. A tick that stops - because the app was backgrounded,
/// the screen locked, or the phone was busy - therefore cannot make the egg
/// wrong: the next time anything asks, the answer is computed from the clock.
///
/// The plan is made again only when something it reads changes: the cook
/// (a tap, an event the clock decided), its pot's decision surface landing,
/// the slow hob's next lengthening (`slowHobAtS`), or a launch. Never every
/// tick. A plan is about a dozen solves, so it is made off the main actor,
/// and only the plan of the cook as it now stands is taken.
///
/// Nothing here drives the display. Redrawing a countdown is the view's job and
/// SwiftUI has a mechanism for it (`TimelineView`); a counter bumped here to
/// force a redraw does NOT work under `@Observable`, because a property the
/// view never reads creates no dependency - which is exactly the bug that used
/// to leave the on-screen clock frozen while the alarm underneath it was
/// perfectly correct. The ticker below exists only to write the events the
/// clock decides (`eventsDue`), to plan again when the slow hob says, to push
/// Live Activity changes, and to ring for a deadline no notification holds.
///
/// HEATING exists only on a cold start, where t = 0 is the moment the egg goes
/// into the cold pan - the same t = 0 the physics core uses, so the one
/// deadline covers the ramp and the boil together. Until "Full rolling boil" is
/// tapped the time to boil is a guess, so the deadline is a guess, and
/// everything that shows it says so.
@Observable
@MainActor
final class Cook {
    /// The cook in the pan, or nil while idle.
    private(set) var running: RunningCook?
    /// Its plan, or nil until the first one is made.
    private(set) var plan: CookPlan?
    /// The cook `plan` was made for. The events the clock decides are written
    /// only from a plan of the cook as it now stands.
    private var plannedFor: RunningCook?
    /// What the egg at the plan's time will be like - the direction and the
    /// white's line - on its pot's surface; the last one shown while a new
    /// pot's surface is built, so a boil tap does not blank it for the second
    /// that takes.
    private(set) var outcome: Outcome?
    /// The last lean decided on a surface, s: the interim while a surface is
    /// built again after a relaunch. A cache, never truth.
    private var leanHintS: Double = 0
    /// The decision surface the plan reads, when it is the plan's pot's
    /// (`CookPlan.inputs`), and the inputs one has been asked for.
    private var surface: CookSurface?
    private var surfaceAsked: DecisionInputs?

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
    /// The deadlines the app has rung for this cook, each with the time it
    /// rang for: each rings once, and again only if the plan moves it.
    private var rung: [RingDeadline: Double] = [:]
    /// One report per egg, and it has to outlive the view.
    ///
    /// This was `@State` on ContentView, so a relaunch inside the hour that
    /// `restoreIfNeeded` covers brought back a finished cook with the question
    /// unasked. Answering it a second time folded the same egg into the
    /// posterior twice - a double weight on one observation, from a user who
    /// thought they were answering once.
    private(set) var feedbackGiven = false

    /// The calibration as it stands, which every plan reads. Set by the
    /// model, which owns the planner.
    var calibration: () -> Calibration = { Calibrations.fresh() }

    /// Whether the cook has said they have a probe thermometer, read when
    /// the alarms are scheduled: the cooling's alarm then asks for the reading.
    /// Set by the view, which owns the setting.
    var probeWanted: (() -> Bool)?

    private var ticker: Task<Void, Never>?
    /// The plan being made, if one is, and whether the cook changed since it
    /// was asked for.
    private var planning: Task<Void, Never>?
    private var planAgain = false
    private var pushed: CookActivity.ContentState?
    /// Whether the card has been ended for this cook, which happens once, at
    /// done: there is no done stage to push.
    private var activityFinished = false

    /// Bumped whenever the cook this object represents changes identity - a
    /// start, or a cancel.
    ///
    /// Every method below that awaits is holding values it read BEFORE the
    /// await, and the user can press Cancel during it. Without this guard, a
    /// plan or a surface that lands after a cancel would bring back the cook
    /// the user had just stopped. That is not hypothetical - it is what
    /// "cancel doesn't reset" looks like.
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

    /// The phase at a given instant.
    ///
    /// Takes the clock rather than reading it, so one render sees ONE time. A
    /// `body` pass reads the phase about ten times, so a phase that read
    /// `Date.now` on every access could cross a boundary between two of those
    /// reads, and the label describe one phase while the button below it
    /// described the next. `TimelineView` already hands the view a date; this
    /// is what it is for.
    func phase(at now: Date) -> Phase {
        // A cook is a running cook AND its plan, or it is nothing: a plan left
        // by a late continuation after a cancel cannot resurrect a timer.
        guard running != nil, let plan else { return .idle }
        return phaseAt(plan.deadlines, nowS: now.timeIntervalSince1970)
    }

    // MARK: - Read off the plan

    var startedAt: Date? { running.map { Date(timeIntervalSince1970: $0.startedAtS) } }
    var pullAt: Date? { plan.map { Date(timeIntervalSince1970: $0.deadlines.cookEndS) } }
    var coolDoneAt: Date? { plan?.deadlines.coolEndS.map { Date(timeIntervalSince1970: $0) } }
    /// When the egg came out: the cook's tap out of PULL, or the grace
    /// running out (an assumed pull), or nil while it is in.
    var outAt: Date? { running?.events.pulled.map { Date(timeIntervalSince1970: $0.outS) } }

    /// How long the counted cooling runs once the eggs are out, s: to the
    /// yolk's peak for this cook, or the flat fallback when there is no cook.
    var coolFor: TimeInterval { plan?.coolS ?? coolingSeconds }

    /// Whether this cook will ask for a probe reading when its cooling ends.
    var asksForProbe: Bool { plan?.probeMoment == true && probeWanted?() == true }

    /// The cook time, egg-in to egg-out: the pull's, once there is one.
    var cookSeconds: TimeInterval { plan?.cookTimeS ?? 0 }

    /// How much of the cook the plan takes to be the heating ramp, s: the
    /// tap, the remembered pan or the slow hob's guess. Zero on a hot start,
    /// where no ramp is on the clock.
    var assumedBoilS: Double {
        guard let setup = plan?.setup, setup.startMode == .cold else { return 0 }
        return setup.timeToBoilS
    }

    var secondsToPull: TimeInterval { max(0, (pullAt ?? .now).timeIntervalSinceNow) }
    var secondsToCoolDone: TimeInterval { max(0, (coolDoneAt ?? .now).timeIntervalSinceNow) }
    /// Seconds of cooking after the boil is reached - the number every recipe
    /// quotes, and the only part of a cold start comparable to one.
    var secondsAfterBoil: TimeInterval { cookSeconds - assumedBoilS }

    /// This egg as a record (INFERENCE.md section 4), with whichever answers
    /// have been given - nil for one nobody gave - or nil when there is no
    /// cook: core's `cookFactsFor` and `recordFor`, from the cook as it stands
    /// and its plan, as the web makes it.
    func eggRecord(yolk: YolkWord?, white: WhiteReport? = nil, probe: ProbeReading? = nil) -> EggRecord? {
        guard let running, let plan else { return nil }
        return Self.record(running, plan, yolk: yolk, white: white, probe: probe)
    }

    private static func record(
        _ cook: RunningCook, _ plan: CookPlan, yolk: YolkWord?, white: WhiteReport?, probe: ProbeReading?
    ) -> EggRecord {
        recordFor(cookFactsFor(
            cook, plan: plan,
            // One cook at a time here: no `id` (src/core/record.ts).
            context: RecordContext(
                app: .ios, appVersion: Calibrations.appVersion, prior: Calibrations.population.id,
                day: day(Date(timeIntervalSince1970: cook.startedAtS)), id: nil
            ),
            yolkWord: yolk, white: white, probe: probe
        ))
    }

    /// A probe reading typed at DONE, as the record carries it
    /// (`probeReadingFor`): in C, and when it was asked for - the end of the
    /// counted cooling - from the moment the record scores as the pull. Nil
    /// when there is no cook.
    func probeReading(centreC: Double) -> ProbeReading? {
        guard let running, let record = eggRecord(yolk: nil) else { return nil }
        return probeReadingFor(
            record, centreC: centreC, coolEndS: plan?.deadlines.coolEndS.map { $0 - running.startedAtS }
        )
    }

    /// What the cook leaves if it ends now (`cookEnding`): the boil to
    /// remember, and whether it was cooked through. Nil when there is none.
    func ending(at now: Date = .now) -> CookEnding? {
        guard let running, let plan else { return nil }
        return cookEnding(running, plan: plan, nowS: now.timeIntervalSince1970)
    }

    /// Whether this cook's egg is in the log and still open to correction:
    /// answered, and the stored cook not too old to pick back up
    /// (`openEggId`). Sharing holds it back; every other egg is final.
    func eggOpen(at now: Date) -> Bool {
        feedbackGiven && openEggId(running, plan: plan, nowS: now.timeIntervalSince1970) != nil
    }

    /// The local calendar day a cook started on, YYYY-MM-DD. A day, not a
    /// timestamp.
    private static func day(_ date: Date) -> String {
        let c = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    // MARK: - Driving the cook

    /// "Eggs in": a cook with these choices, the nudge it drew (none when
    /// sharing is off), the pans as remembered now, and the lean the time on
    /// screen took. The first plan reads the surface the screen chose on,
    /// when it is built, so the egg is timed as the screen said.
    func start(
        choices: CookChoices, nudgeS: Double, boilMemory: BoilMemory, units: UnitSystem, lang: String,
        leanHintS: Double
    ) async {
        generation &+= 1
        let gen = generation
        reset()
        let cook = startCook(
            nowMs: Date.now.timeIntervalSince1970 * 1000, choices: choices, nudgeS: nudgeS,
            boilMemory: boilMemory, units: units, lang: lang
        )
        running = cook
        self.leanHintS = leanHintS
        persist()

        // The surface the time on screen was chosen on, and its odds at every
        // level, if they are built: the same decision the screen made.
        let c = calibration()
        let pot = cookSetupOf(choices, timeToBoilS: estimateTimeToBoil(boilMemory, litres: choices.waterLitres))
        let inputs = decisionInputs(c, egg: pot.egg, setup: pot.setup)
        if let grid = await DecisionGrids.shared.cached(inputs) {
            let profile = await DecisionGrids.shared.cachedProfile(inputs, c)
            guard gen == generation else { return }
            surface = CookSurface(inputs: inputs, grid: grid, profile: profile)
        }
        await planNow()
        guard gen == generation, plan != nil else { return }

        let authorized = await Alarm.shared.authorize()
        guard gen == generation else { return }
        alarmAuthorized = authorized
        if authorized { scheduleAlarms() }
        await readBackAlarms()
        guard gen == generation else { return }

        if let state = activityState(at: .now), let plan {
            let attributes = Self.attributes(cook, plan)
            await activity { await LiveActivity.start(attributes, state: state) }.value
            guard gen == generation else { return }
            pushed = state
        }
        startTicking()
    }

    /// "Full rolling boil": the time to boil stops being a guess. Tapping at
    /// first bubbles under-measures the boil by 15-25%, which is why the button
    /// says what it says. Remembered for this pan when the cook ends
    /// (`cookEnding`), not now: by then it is the cook as last corrected.
    func boil() {
        guard let running, phase == .heating else { return }
        let next = withBoil(running, nowS: Date.now.timeIntervalSince1970)
        guard next != running else { return }
        change(to: next)
    }

    /// "They're in the ice bath", "they're under the tap", "they're out": the
    /// cook's tap out of PULL, mirroring the web's. The cooling is timed from
    /// the tap rather than from the end of the grace, and the tap is what the
    /// record calls a measured pull.
    func pulledOut() {
        guard let running, let plan else { return }
        let next = withOut(running, plan: plan, nowS: Date.now.timeIntervalSince1970)
        guard next != running else { return }
        Ringer.shared.stop()
        change(to: next)
    }

    /// The cook replaced by what it now is: stored, and planned again.
    private func change(to next: RunningCook) {
        running = next
        persist()
        replanSoon()
    }

    #if DEBUG
    /// A debug build's `-uiScreen done` (Screenshots.swift): the cook just
    /// started, moved back in time so that the eggs came out on time and the
    /// cooling ended a moment ago. The questions after an egg, without
    /// waiting for one.
    func skipToDone() {
        guard var cook = running, let plan else { return }
        let cooking = plan.cookTimeS
        let cooled = cook.choices.cooling == .counter ? 0 : plan.coolS
        let start = Date.now.timeIntervalSince1970 - (cooking + cooled + 2)
        let shift = start - cook.startedAtS
        cook.idMs = (cook.idMs + shift * 1000).rounded()
        cook.startedAtS = start
        cook.coldSinceS = cook.coldSinceS.map { $0 + shift }
        cook.firstHotAtS = cook.firstHotAtS.map { $0 + shift }
        let out = start + cooking
        cook.events = CookEvents(
            pulled: Pulled(dueS: out, outS: out, by: .cook, confirmed: true),
            cooledAtS: cook.choices.cooling == .counter ? nil : out + cooled
        )
        change(to: cook)
    }
    #endif

    func cancel() {
        generation &+= 1
        Alarm.shared.cancel()
        Ringer.shared.stop()
        activity { await LiveActivity.endAll() }
        ticker?.cancel()
        ticker = nil
        running = nil
        reset()
        persist()
    }

    /// Everything one cook held, gone: what a start and a cancel share.
    private func reset() {
        plan = nil
        plannedFor = nil
        outcome = nil
        leanHintS = 0
        surface = nil
        surfaceAsked = nil
        planning = nil
        planAgain = false
        pendingAlarms = 0
        alarmCovers = []
        rung = [:]
        alarmAuthorized = nil
        feedbackGiven = false
        pushed = nil
        activityFinished = false
    }

    /// Record that this egg has been reported on. Idempotent by construction:
    /// the caller asks first, and a second call cannot fold a second
    /// observation because there is nothing left to fold.
    func recordFeedbackGiven() {
        guard !feedbackGiven else { return }
        feedbackGiven = true
        persist()
    }

    // MARK: - The plan

    /// What a plan is made from, read on the main actor for a plan off it.
    private struct PlanInput: Sendable {
        let cook: RunningCook
        let calibration: Calibration
        let surface: CookSurface?
        let leanHintS: Double
        let nowS: Double
    }

    private struct Made: Sendable {
        let plan: CookPlan
        let outcome: Outcome?
    }

    private func planInput() -> PlanInput? {
        guard let running else { return nil }
        return PlanInput(
            cook: running, calibration: calibration(), surface: surface, leanHintS: leanHintS,
            nowS: Date.now.timeIntervalSince1970
        )
    }

    /// The plan, and what the egg at its time will be like on its pot's
    /// surface: the decided outcome when the plan keeps the decided time,
    /// otherwise the one at the plan's time.
    private nonisolated static func made(_ i: PlanInput) -> Made {
        let p = replan(i.cook, i.calibration, surface: i.surface, leanHintS: i.leanHintS, nowS: i.nowS)
        var outcome: Outcome?
        if let d = p.decided, let s = i.surface {
            outcome = p.cookTimeS == d.solution.result.cookTimeS
                ? d.outcome
                : predictOutcome(i.calibration.posterior, s.grid, p.cookTimeS, logYolkTarget(p.level))
        }
        return Made(plan: p, outcome: outcome)
    }

    /// Plan the cook as it stands, off the main actor: one plan at a time,
    /// and once more if the cook changed while it was made.
    private func replanSoon() {
        if planning != nil {
            planAgain = true
            return
        }
        let gen = generation
        planning = Task { [weak self] in
            while true {
                guard let self, gen == self.generation, let input = self.planInput() else { return }
                self.planAgain = false
                let made = await Task.detached(priority: .userInitiated) { Self.made(input) }.value
                guard gen == self.generation else { return }
                if self.running == input.cook { self.adopt(made, for: input.cook) }
                if !self.planAgain {
                    self.planning = nil
                    return
                }
            }
        }
    }

    /// Plan the cook as it stands, and wait for it.
    private func planNow() async {
        replanSoon()
        await planning?.value
    }

    /// A new plan taken: the alarms follow its deadlines when they moved, the
    /// surface it wants is asked for, and the card is told.
    private func adopt(_ made: Made, for cook: RunningCook) {
        let next = made.plan
        let before = plan?.deadlines
        plan = next
        plannedFor = cook
        if let o = made.outcome { outcome = o }
        if next.decided != nil, next.leanS != leanHintS {
            leanHintS = next.leanS
            persist()
        }
        if let before, Self.moved(before, next.deadlines) {
            // A deadline rung for and since moved rings again at its new time.
            rung = rung.filter { Self.same($0.value, Self.at($0.key, next.deadlines)) }
            if alarmAuthorized == true {
                alarmCovers = []
                scheduleAlarms()
                Task { await readBackAlarms() }
            }
        }
        askForSurface(next.inputs)
        pushActivity()
    }

    /// When a deadline is, s.
    private static func at(_ deadline: RingDeadline, _ d: Deadlines) -> Double? {
        deadline == .pull ? d.cookEndS : d.coolEndS
    }

    /// Two deadlines the same, to the millisecond: the same pull planned
    /// again, from its own due time, can come back a few ulps off.
    private static func same(_ a: Double?, _ b: Double?) -> Bool {
        switch (a, b) {
        case (nil, nil): true
        case let (x?, y?): abs(x - y) < 1e-3
        default: false
        }
    }

    private static func moved(_ a: Deadlines, _ b: Deadlines) -> Bool {
        !same(a.cookEndS, b.cookEndS) || !same(a.coolEndS, b.coolEndS)
    }

    /// Build the decision surface a plan wants, off the main actor, and plan
    /// again when it lands, and again when its odds at every level do (as
    /// the idle screen takes them).
    private func askForSurface(_ inputs: DecisionInputs?) {
        guard let inputs, surfaceAsked != inputs else { return }
        if let s = surface, s.inputs == inputs, s.profile != nil { return }
        surfaceAsked = inputs
        let gen = generation
        let c = calibration()
        Task { [weak self] in
            let grid = await DecisionGrids.shared.grid(inputs)
            guard let self, gen == self.generation, self.plan?.inputs == inputs else {
                self?.dropAsked(inputs, gen)
                return
            }
            let cached = await DecisionGrids.shared.cachedProfile(inputs, c)
            guard gen == self.generation else { return }
            if self.surface?.inputs != inputs || (cached != nil && self.surface?.profile == nil) {
                self.surface = CookSurface(inputs: inputs, grid: grid, profile: cached)
                self.replanSoon()
            }
            guard cached == nil else {
                self.dropAsked(inputs, gen)
                return
            }
            let profile = await DecisionGrids.shared.profile(inputs, c)
            guard gen == self.generation else { return }
            self.dropAsked(inputs, gen)
            guard self.plan?.inputs == inputs, self.surface?.inputs == inputs else { return }
            self.surface = CookSurface(inputs: inputs, grid: grid, profile: profile)
            self.replanSoon()
        }
    }

    private func dropAsked(_ inputs: DecisionInputs, _ gen: Int) {
        if gen == generation, surfaceAsked == inputs { surfaceAsked = nil }
    }

    // MARK: - Surviving a relaunch

    /// What is stored: the cook, whether it has been answered about, and the
    /// last decided lean (design/one-screen.md section 4). Through JSONEncoder
    /// and JSONDecoder, which give every double back to the bit: the
    /// JSONSerialization path read a 17-digit double back an ulp off, and an
    /// ulp in the mass is another surface's key.
    ///
    /// The alarm is already with the system and the Live Activity is already on
    /// the Lock Screen, so a force-quit or a crash leaves BOTH of them counting
    /// down to an egg the app itself has forgotten. Reopening to an idle screen
    /// while the Lock Screen says four minutes left is the worst thing an egg
    /// timer can do: it makes the user distrust the alarm that was, in fact,
    /// perfectly correct.
    private struct Stored: Codable {
        var cook: RunningCook
        var feedbackGiven: Bool
        var leanHintS: Double

        private enum CodingKeys: String, CodingKey {
            case cook, feedbackGiven, leanHintS = "leanHint_s"
        }
    }

    private static let savedKey = "cookInProgress.v2"
    /// Where 0.4 kept its cook, in a shape this build does not read.
    private static let oldKey = "cookInProgress"

    private func persist() {
        guard let running else {
            UserDefaults.standard.removeObject(forKey: Self.savedKey)
            return
        }
        let stored = Stored(cook: running, feedbackGiven: feedbackGiven, leanHintS: leanHintS)
        if let data = try? JSONEncoder().encode(stored) {
            UserDefaults.standard.set(data, forKey: Self.savedKey)
        }
    }

    /// What a cook too old to pick back up leaves for the caller: the boil to
    /// remember, and its egg if it was cooked through and never answered
    /// about, to log as "Start again" would have.
    struct Dropped {
        var boil: BoilToRemember?
        var egg: EggRecord?
    }

    /// Pick up a cook that was running when the app was last closed.
    ///
    /// Called by the view, NOT from `init`. `@State private var cook = Cook()`
    /// evaluates its initial value every time the enclosing view struct is
    /// constructed, and SwiftUI keeps only the first - so anything with side
    /// effects in `init` runs on instances that are then thrown away, starting
    /// tickers nobody will ever cancel.
    ///
    /// Planned here, on the main actor, before the screen's first answer, so
    /// a relaunch never shows idle for a moment over a running cook; dropped
    /// when that plan says it is too old (`cookTooOld`); and the events the
    /// clock decided while the app was away are written at once.
    func restoreIfNeeded() -> Dropped? {
        guard running == nil else { return nil }
        let defaults = UserDefaults.standard
        // A cook 0.4 was running at the upgrade: kept aside as stored, with
        // the results (DECISIONS.md 81, 97), not converted, and the key
        // deleted, so it is read once. Its notifications and its card are
        // left alone: they are still right for the egg in the pot, and
        // nothing else times it now (design/one-screen-review.md 2.6).
        if let old = defaults.data(forKey: Self.oldKey) {
            Calibrations.keepUnreadCook(old)
            defaults.removeObject(forKey: Self.oldKey)
        }
        guard let data = defaults.data(forKey: Self.savedKey) else { return nil }
        // A cook this build cannot read whole is not patched; it is kept
        // aside, as stored, and exported with the results (DECISIONS.md 81).
        // Nothing then knows what its alarms and its card are for, so they go.
        guard let stored = try? JSONDecoder().decode(Stored.self, from: data),
              let cook = readRunningCook(stored.cook.jsonObject) else {
            Calibrations.keepUnreadCook(data)
            defaults.removeObject(forKey: Self.savedKey)
            Alarm.shared.cancel()
            activity { await LiveActivity.endAll() }
            return nil
        }

        let now = Date.now.timeIntervalSince1970
        let input = PlanInput(
            cook: cook, calibration: calibration(), surface: nil, leanHintS: stored.leanHintS, nowS: now
        )
        var made = Self.made(input)
        // An egg an hour past its end has been eaten or thrown out, and one
        // still heating two hours on was abandoned. Either way nobody wants
        // yesterday's timer on screen - but an egg that was cooked through
        // and never answered about is still logged, as "Start again" would
        // have logged it, and a pan timed is still remembered.
        if cookTooOld(made.plan, nowS: now) {
            defaults.removeObject(forKey: Self.savedKey)
            let ending = cookEnding(cook, plan: made.plan, nowS: now)
            let egg = !stored.feedbackGiven && ending.finished
                ? Self.record(cook, made.plan, yolk: nil, white: nil, probe: nil)
                : nil
            return Dropped(boil: ending.boil, egg: egg)
        }

        var restored = cook
        // What the clock decided while the app was away, from the plan that
        // rang.
        let due = eventsDue(cook, plan: made.plan, nowS: now)
        if due != cook.events {
            restored.events = due
            made = Self.made(PlanInput(
                cook: restored, calibration: input.calibration, surface: nil, leanHintS: stored.leanHintS, nowS: now
            ))
        }
        generation &+= 1
        reset()
        running = restored
        feedbackGiven = stored.feedbackGiven
        leanHintS = stored.leanHintS
        persist()
        adopt(made, for: restored)

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
            if phase != .done, let state = activityState(at: .now), let plan {
                let attributes = Self.attributes(restored, plan)
                await activity { await LiveActivity.start(attributes, state: state) }.value
                guard gen == generation else { return }
                pushed = state
            }
        }
        startTicking()
        return nil
    }

    private func scheduleAlarms() {
        guard let pullAt, let running else { return }
        Alarm.shared.schedule(
            pullAt: pullAt, coolDoneAt: coolDoneAt, probe: asksForProbe, cooling: running.choices.cooling
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
    /// what makes "keep the app open" true. See `deadlineToRing`. Whenever
    /// the phase enters Pull at a pull no notification holds, it rings.
    private func ringIfDue() {
        guard let plan else { return }
        let now = Date.now
        let d = plan.deadlines
        guard let due = deadlineToRing(
            phase: phase(at: now),
            nowS: now.timeIntervalSince1970,
            pullS: d.cookEndS,
            cooledS: d.coolEndS,
            authorized: alarmAuthorized,
            scheduled: alarmCovers,
            rung: Set(rung.keys),
            onScreenSinceS: Ringer.shared.onScreenSince?.timeIntervalSince1970
        ) else { return }
        rung[due] = Self.at(due, d)
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
                self.tick()
                if self.phase == .done { return }
            }
        }
    }

    /// One tick: the events the clock has decided, written the first time
    /// they are past, from the plan of the cook as it stands; the slow hob's
    /// next lengthening; the card; and the ring.
    private func tick() {
        guard let running, let plan, plannedFor == running else {
            pushActivity()
            ringIfDue()
            return
        }
        let now = Date.now.timeIntervalSince1970
        let due = eventsDue(running, plan: plan, nowS: now)
        if due != running.events {
            var next = running
            next.events = due
            change(to: next)
        } else if let at = plan.slowHobAtS, now >= at, planning == nil {
            replanSoon()
        }
        pushActivity()
        ringIfDue()
    }

    // MARK: - Live Activity

    /// The card's description of this cook, in its own units and its own
    /// language, from the plan it starts on.
    private static func attributes(_ cook: RunningCook, _ plan: CookPlan) -> CookActivity {
        CookActivity(
            doneness: tr(anchorNear(plan.level).key, in: cook.lang),
            peakYolk: showIn(cook.units, .temperature, plan.solution.result.peakYolkC),
            eggMass: showIn(cook.units, .mass, plan.egg.massKg * 1000),
            cooling: cook.choices.cooling.rawValue,
            lang: cook.lang
        )
    }

    /// What the Lock Screen should be showing. Each stage hands over its own
    /// span, so the system can draw the countdown without asking again.
    private func activityState(at now: Date) -> CookActivity.ContentState? {
        guard let running, let plan else { return nil }
        let d = plan.deadlines
        let start = Date(timeIntervalSince1970: running.startedAtS)
        let pull = Date(timeIntervalSince1970: d.cookEndS)
        switch phase(at: now) {
        case .idle, .done:
            return nil
        case .heating:
            return .init(stage: .heating, began: start, ends: pull, provisional: true)
        case .cooking:
            return .init(stage: .cooking, began: start, ends: pull, provisional: false)
        case .pull:
            return .init(stage: .pull, began: pull, ends: pull.addingTimeInterval(pullGraceSeconds), provisional: false)
        case .cooling:
            let from = outAt ?? pull.addingTimeInterval(pullGraceSeconds)
            return .init(stage: .cooling, began: from, ends: coolDoneAt ?? from, provisional: false)
        }
    }

    /// Push only when what the card shows has changed: its stage, or a
    /// deadline that actually moved. The countdown itself needs no help: the
    /// system draws it from the dates.
    ///
    /// At done the card ends at once (`LiveActivity.endAll`), once per cook -
    /// including a card left from before a relaunch that restored a cook
    /// already done.
    private func pushActivity() {
        if running != nil, phase == .done {
            guard !activityFinished else { return }
            activityFinished = true
            activity { await LiveActivity.endAll() }
            return
        }
        guard let state = activityState(at: .now), state != pushed else { return }
        pushed = state
        activity { await LiveActivity.update(state) }
    }
}
