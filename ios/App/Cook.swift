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
    /// How sure I am of the plan's time, and its pot's odds at every level
    /// (the slider's shading), on its pot's surface: the last read on one,
    /// held while a new pot's is built (the boil tapped, a correction), as
    /// the web holds them, rather than blanking for the second that takes.
    private(set) var heldCertainty: CertaintyReading?
    private(set) var heldProfile: OddsProfile?
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

    var phase: Phase { phase(at: AppClock.now) }

    /// The phase at a given instant.
    ///
    /// Takes the clock rather than reading it, so one render sees ONE time. A
    /// `body` pass reads the phase about ten times, so a phase that read
    /// the clock on every access could cross a boundary between two of those
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

    /// The plan as it ran, once the egg is out (`asRanShown`): what Done and
    /// the cooling show, whatever a later plan on a newer posterior reads
    /// (running-cook review 2.4). Nil before the pull, and until it is kept
    /// with no surface yet; the plan is shown then.
    var asRan: CookAsRan? {
        guard let running, let plan else { return nil }
        return asRanShown(running, plan: plan)
    }

    /// The level and the peak yolk the cook was planned to, as it ran once
    /// the egg is out: what "You asked for" and the sentence say.
    var shownLevel: Double? { asRan?.level ?? plan?.level }
    var shownPeakYolkC: Double? { asRan?.peakYolkC ?? plan?.solution.result.peakYolkC }
    /// The solve as the cook ran, once the egg is out (core `solutionAsRan`):
    /// the plan's pot at the time that ran, on the parameters it ran under,
    /// so what Done says of the egg beside the peak - the texture note - is
    /// never redrawn from a posterior that has folded this egg's own answer
    /// (onescreen review 2.2). Nil before the pull, and until the plan as it
    /// ran is had; worked out with each plan.
    private(set) var ranSolution: Solution?
    /// Whether the cooling ended at the yolk's peak, as it ran.
    var shownProbeMoment: Bool { asRan?.probeMoment ?? plan?.probeMoment ?? false }

    /// How much of the cook the plan takes to be the heating ramp, s: the
    /// tap, the remembered pan or the slow hob's guess. Zero on a hot start,
    /// where no ramp is on the clock.
    var assumedBoilS: Double {
        guard let setup = plan?.setup, setup.startMode == .cold else { return 0 }
        return setup.timeToBoilS
    }

    var secondsToPull: TimeInterval { max(0, pullAt.map { $0.timeIntervalSince(AppClock.now) } ?? 0) }
    var secondsToCoolDone: TimeInterval { max(0, coolDoneAt.map { $0.timeIntervalSince(AppClock.now) } ?? 0) }
    /// Seconds of cooking after the boil is reached - the number every recipe
    /// quotes, and the only part of a cold start comparable to one.
    var secondsAfterBoil: TimeInterval { cookSeconds - assumedBoilS }

    /// This egg as a record (INFERENCE.md section 4), with whichever answers
    /// have been given - nil for one nobody gave - or nil when there is no
    /// cook, or when core refuses its facts (`cookFactsFor`: no plan as it
    /// ran kept and no surface yet, or one a correction has made stale), so
    /// no record is made with no forecast: core's `cookFactsFor` and
    /// `recordFor`, from the cook as it stands and its plan, as the web makes
    /// it.
    func eggRecord(yolk: YolkWord?, white: WhiteReport? = nil, probe: ProbeReading? = nil) -> EggRecord? {
        guard let running, let plan else { return nil }
        return Self.record(running, plan, yolk: yolk, white: white, probe: probe).record
    }

    /// Whether core refuses this egg's record only for want of its pot's
    /// surface: no plan as it ran kept, and no plan on the surface yet, which
    /// a relaunch leaves for the second it takes to build (running-cook
    /// review 1.3). An answer given then is held until it lands
    /// (`AppModel.answer`), and the plan that lands calls `planTaken`.
    var recordWaitsForSurface: Bool {
        guard let running, let plan else { return false }
        return Self.record(running, plan, yolk: nil, white: nil, probe: nil).refused != nil
    }

    /// This egg's record from a cook and a plan of it, as core makes it, or
    /// nil when core refuses: what a correction after the pull logs in place
    /// of the egg's record (`AppModel.refreshAsRan`).
    static func recordOf(
        _ cook: RunningCook, _ plan: CookPlan, yolk: YolkWord?, white: WhiteReport?, probe: ProbeReading?
    ) -> EggRecord? {
        record(cook, plan, yolk: yolk, white: white, probe: probe).record
    }

    /// Called whenever a plan is taken: what an answer held for the surface
    /// waits on. Set by the model.
    var planTaken: (() -> Void)?

    private static func record(
        _ cook: RunningCook, _ plan: CookPlan, yolk: YolkWord?, white: WhiteReport?, probe: ProbeReading?
    ) -> (record: EggRecord?, refused: FactsRefused?) {
        let made = cookFactsFor(
            cook, plan: plan,
            // One cook at a time here: no `id` (src/core/record.ts).
            context: RecordContext(
                app: .ios, appVersion: AppClock.mark(Calibrations.appVersion), prior: Calibrations.population.id,
                day: day(Date(timeIntervalSince1970: cook.startedAtS)), id: nil
            ),
            yolkWord: yolk, white: white, probe: probe
        )
        return (made.facts.map(recordFor), made.refused)
    }

    /// A finished egg nobody answered about, as a cook ends: what its record
    /// is made from.
    struct Unanswered {
        let cook: RunningCook
        let plan: CookPlan
        let calibration: Calibration
        let leanHintS: Double
        let nowS: Double
    }

    /// The unanswered egg of the cook as it stands, if it ends now cooked
    /// through and never answered about; nil otherwise.
    func unanswered(at now: Date = AppClock.now) -> Unanswered? {
        guard let running, let plan, !feedbackGiven,
              cookEnding(running, plan: plan, nowS: now.timeIntervalSince1970).finished else { return nil }
        return Unanswered(
            cook: running, plan: plan, calibration: calibration(), leanHintS: leanHintS,
            nowS: now.timeIntervalSince1970
        )
    }

    /// An unanswered egg's record if it can be made now, without building a
    /// surface: from the plan as it ran, the usual case. Start again logs it
    /// before the stored cook is cleared, so no kill in between can lose it.
    static func unansweredRecordNow(_ u: Unanswered) -> EggRecord? {
        record(u.cook, u.plan, yolk: nil, white: nil, probe: nil).record
    }

    /// An unanswered egg's record, never one with no forecast (running-cook
    /// review 1.3): from the plan as it ran when kept, else from its plan on
    /// its pot's surface, which is built here when the plan has none (a
    /// relaunch, or a cook dropped as too old). Nil only when core refuses
    /// it for another reason (a correction not yet planned as it ran).
    static func unansweredRecord(_ u: Unanswered) async -> EggRecord? {
        let first = record(u.cook, u.plan, yolk: nil, white: nil, probe: nil)
        if let made = first.record { return made }
        if first.refused == .stale {
            // Corrected after the pull, and not yet planned as it ran: on the
            // calibration as it stands, which has not learned from this egg,
            // since nobody answered about it.
            guard let inputs = replan(u.cook, u.calibration, surface: nil, leanHintS: 0, nowS: u.nowS).inputs else {
                return nil
            }
            let grid = await DecisionGrids.shared.grid(inputs)
            let profile = await DecisionGrids.shared.profile(inputs, u.calibration)
            let surface = CookSurface(inputs: inputs, grid: grid, profile: profile)
            guard let ran = asRanCorrected(u.cook, before: u.calibration, surface: surface, nowS: u.nowS) else {
                return nil
            }
            let plan = replan(ran, u.calibration, surface: surface, leanHintS: 0, nowS: u.nowS)
            return record(ran, plan, yolk: nil, white: nil, probe: nil).record
        }
        guard first.refused == .noSurface, let inputs = u.plan.inputs else { return nil }
        let grid = await DecisionGrids.shared.grid(inputs)
        let profile = await DecisionGrids.shared.cachedProfile(inputs, u.calibration)
        let surface = CookSurface(inputs: inputs, grid: grid, profile: profile)
        let again = replan(u.cook, u.calibration, surface: surface, leanHintS: u.leanHintS, nowS: u.nowS)
        return record(keepAsRan(u.cook, plan: again), again, yolk: nil, white: nil, probe: nil).record
    }

    /// A probe reading typed at DONE, as the record carries it
    /// (`probeReadingFor`): in C, and when it was asked for - the end of the
    /// counted cooling - from the moment the record scores as the pull. Nil
    /// when there is no cook. Scored against `record` when one is given: the
    /// egg's record as written at its first answer (`AppModel.liveRecord`).
    func probeReading(centreC: Double, against given: EggRecord? = nil) -> ProbeReading? {
        guard let running, let record = given ?? eggRecord(yolk: nil) else { return nil }
        return probeReadingFor(
            record, centreC: centreC, coolEndS: plan?.deadlines.coolEndS.map { $0 - running.startedAtS }
        )
    }

    /// What the cook leaves if it ends now (`cookEnding`): the boil to
    /// remember, and whether it was cooked through. Nil when there is none.
    func ending(at now: Date = AppClock.now) -> CookEnding? {
        guard let running, let plan else { return nil }
        return cookEnding(running, plan: plan, nowS: now.timeIntervalSince1970)
    }

    /// Whether this cook's egg is in the log and still open to correction:
    /// answered, and the stored cook not too old to pick back up
    /// (`openEggId`). Sharing holds it back; every other egg is final.
    func eggOpen(at now: Date) -> Bool {
        feedbackGiven && openEggId(running, plan: plan, nowS: now.timeIntervalSince1970) != nil
    }

    /// Whether the cook on screen is still the egg open to correction
    /// (`cookStillOpen`): the stored cook is this one, and it is not too old
    /// by the plan held. When it is not, its egg is final: the model ends it
    /// as Start again does, and nothing more is logged for it (running-cook
    /// review 2.3). False when there is no cook.
    func stillOpen(at now: Date = AppClock.now) -> Bool {
        guard let running, let plan else { return false }
        let stored = UserDefaults.standard.data(forKey: Self.savedKey)
            .flatMap { try? JSONDecoder().decode(Stored.self, from: $0) }
        return cookStillOpen(running, plan: plan, storedIdMs: stored?.cook.idMs, nowS: now.timeIntervalSince1970)
    }

    /// Called when the tick finds the cook too old to pick back up (an
    /// abandoned heat two hours on, or Done an hour past its end): the model
    /// ends it as Start again does (running-cook review 2.2).
    var tooOld: (() -> Void)?

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
        #if DEBUG
        busy += 1
        defer { busy -= 1; logIfSettled() }
        #endif
        generation &+= 1
        let gen = generation
        reset()
        let cook = startCook(
            nowMs: AppClock.now.timeIntervalSince1970 * 1000, choices: choices, nudgeS: nudgeS,
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

        if let state = activityState(at: AppClock.now) {
            let attributes = Self.attributes(cook)
            #if DEBUG
            Self.logCard("start", state)
            #endif
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
        let next = withBoil(running, nowS: AppClock.now.timeIntervalSince1970)
        guard next != running else { return }
        change(to: next)
    }

    /// "They're in the ice bath", "they're under the tap", "they're out": the
    /// cook's tap out of PULL, mirroring the web's. The cooling is timed from
    /// the tap rather than from the end of the grace, and the tap is what the
    /// record calls a measured pull.
    func pulledOut() {
        guard let running, let plan else { return }
        let next = withOut(running, plan: plan, nowS: AppClock.now.timeIntervalSince1970)
        guard next != running else { return }
        Ringer.shared.stop()
        change(to: next)
    }

    /// A correction committed (`Edits`; DECISIONS.md 96 to 98): the start
    /// (when the eggs went in) and the choices replaced (`startCorrected`,
    /// `corrected`), and the cook planned again from its start, stored, and
    /// drawn. Overdue is decided by the plan of the corrected cook: a pull
    /// now in the past is the moment of the correction, and rings now
    /// (`ringIfDue`). A correction that puts the pull back in the future
    /// before the egg was seen to come out - changed back within the grace -
    /// cancels it (`adopt`): nothing was observed. The alarms and the card
    /// follow the plan, as they follow any.
    ///
    /// Once the egg has been `answered` about it came out: a pull the clock
    /// assumed stands, confirmed (`pullStands`), so a correction at Done never
    /// asks whether it is still in the water behind the questions (onescreen
    /// review 2.1). A correction once Done keeps Done (core `corrected`).
    func correct(choices: CookChoices, startedAtS: Double?, answered: Bool = false) {
        guard var c = running else { return }
        let now = AppClock.now.timeIntervalSince1970
        if let s = startedAtS, s != c.startedAtS { c = startCorrected(c, startedAtS: s, nowS: now) ?? c }
        if choices != c.choices { c = corrected(c, choices: choices, nowS: now) }
        guard c != running else { return }
        if answered { c = pullStands(c) }
        change(to: c)
    }

    /// "Are the eggs still in the water?" Yes: the pull the clock assumed is
    /// dropped, and the cook planned again as told now; a pull already past
    /// is now, and rings, as if the egg had never been taken out (`stillIn`).
    func answerStillIn() {
        guard let running, plan?.askIfStillIn == true else { return }
        rung = [:]
        change(to: stillIn(running, nowS: AppClock.now.timeIntervalSince1970))
    }

    /// No: the egg came out when the clock assumed. The pull stands,
    /// confirmed, the correction applies to the record, and the plan does
    /// not ask again (`pullStands`).
    func answerOut() {
        guard let running, plan?.askIfStillIn == true else { return }
        Ringer.shared.stop()
        change(to: pullStands(running))
    }

    /// The plan as it ran, made again for a correction after the pull on the
    /// calibration before this egg (`asRanCorrected`), kept with the cook if
    /// it is still the cook it was made for.
    func keepCorrectedAsRan(_ next: RunningCook) {
        guard var c = running, c.idMs == next.idMs, c.correctedAtS == next.correctedAtS,
              c.asRan != next.asRan else { return }
        c.asRan = next.asRan
        running = c
        persist()
        replanSoon()
    }

    /// A plan of `hand`, the cook as a change in hand would make it, for its
    /// preview: on the plan's surface when it is the same pot, else on the
    /// interim time, as a plan with no surface is. Stores nothing and rings
    /// nothing.
    func previewPlan(_ hand: RunningCook, nowS: Double) async -> CookPlan {
        let input = PlanInput(
            cook: hand, calibration: calibration(), surface: surface, leanHintS: leanHintS, nowS: nowS
        )
        return await Task.detached(priority: .userInitiated) {
            replan(input.cook, input.calibration, surface: input.surface, leanHintS: input.leanHintS, nowS: input.nowS)
        }.value
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
    func skipToDone(ago: Double = 2) {
        guard var cook = running, let plan else { return }
        let cooking = plan.cookTimeS
        let cooled = cook.choices.cooling == .counter ? 0 : plan.coolS
        let start = AppClock.now.timeIntervalSince1970 - (cooking + cooled + ago)
        cook = Self.shifted(cook, by: start - cook.startedAtS)
        let out = start + cooking
        cook.events = CookEvents(
            pulled: Pulled(dueS: out, outS: out, by: .cook, confirmed: true),
            cooledAtS: cook.choices.cooling == .counter ? nil : out + cooled
        )
        change(to: cook)
    }

    /// A debug build's `-cookAgo` (Screenshots.swift): the cook as it stands,
    /// every time in it moved back `seconds`, and planned again.
    func moveBack(_ seconds: Double) {
        guard let cook = running else { return }
        change(to: Self.shifted(cook, by: -seconds))
    }

    /// The cook with every clock time in it moved by `shift`, s.
    private static func shifted(_ cook: RunningCook, by shift: Double) -> RunningCook {
        var c = cook
        c.idMs = (c.idMs + shift * 1000).rounded()
        c.startedAtS += shift
        c.coldSinceS = c.coldSinceS.map { $0 + shift }
        c.firstHotAtS = c.firstHotAtS.map { $0 + shift }
        c.correctedAtS = c.correctedAtS.map { $0 + shift }
        c.events.boilAtS = c.events.boilAtS.map { $0 + shift }
        c.events.cooledAtS = c.events.cooledAtS.map { $0 + shift }
        c.events.rangAtS = c.events.rangAtS.map { $0 + shift }
        c.events.pulled = c.events.pulled.map {
            Pulled(dueS: $0.dueS + shift, outS: $0.outS + shift, by: $0.by, confirmed: $0.confirmed)
        }
        if var ran = c.asRan {
            ran.correctedAtS = ran.correctedAtS.map { $0 + shift }
            c.asRan = ran
        }
        return c
    }
    #endif

    /// The cook ends: its alarms, its card and its ticker go, and it is
    /// forgotten - but for `keepStored`, while its record is made again
    /// before the egg is final (onescreen review 1.2): the model forgets it
    /// then (`forgetStored`), and a kill in between finds it at the next
    /// launch.
    func cancel(keepStored: Bool = false) {
        #if DEBUG
        Screenshots.log("cook ended")
        #endif
        generation &+= 1
        Alarm.shared.cancel()
        Ringer.shared.stop()
        activity { await LiveActivity.endAll() }
        ticker?.cancel()
        ticker = nil
        running = nil
        reset()
        if !keepStored { persist() }
    }

    /// The stored cook forgotten, if it is still the one started at `idMs`:
    /// a cook kept stored while its record was made again (`cancel`), not a
    /// new one started since.
    static func forgetStored(idMs: Double) {
        let defaults = UserDefaults.standard
        guard let data = defaults.data(forKey: savedKey),
              let stored = try? JSONDecoder().decode(Stored.self, from: data), stored.cook.idMs == idMs else { return }
        defaults.removeObject(forKey: savedKey)
        #if DEBUG
        Screenshots.log("stored none")
        #endif
    }

    /// Everything one cook held, gone: what a start and a cancel share.
    private func reset() {
        plan = nil
        plannedFor = nil
        outcome = nil
        heldCertainty = nil
        heldProfile = nil
        ranSolution = nil
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
        /// The last plan's slow hob, where its rule got to (running-cook
        /// review 2.1): core takes it only when it fits this cook.
        var hint: SlowHobHint?
    }

    private struct Made: Sendable {
        let plan: CookPlan
        let outcome: Outcome?
        /// The solve as the cook ran, once the egg is out (`solutionAsRan`).
        let ran: Solution?
    }

    private func planInput() -> PlanInput? {
        guard let running else { return nil }
        return PlanInput(
            cook: running, calibration: calibration(), surface: surface, leanHintS: leanHintS,
            nowS: AppClock.now.timeIntervalSince1970, hint: plan?.slowHob
        )
    }

    /// The plan, and what the egg at its time will be like on its pot's
    /// surface: the decided outcome when the plan keeps the decided time,
    /// otherwise the one at the plan's time.
    private nonisolated static func made(_ i: PlanInput) -> Made {
        let p = replan(
            i.cook, i.calibration, surface: i.surface, leanHintS: i.leanHintS, nowS: i.nowS, hint: i.hint
        )
        var outcome: Outcome?
        if let d = p.decided, let s = i.surface {
            outcome = p.cookTimeS == d.solution.result.cookTimeS
                ? d.outcome
                : predictOutcome(i.calibration.posterior, s.grid, p.cookTimeS, logYolkTarget(p.level))
        }
        // As it ran, with the plan as it ran kept as `adopt` keeps it: one
        // simulation here, off the main actor, rather than in a draw.
        let ran = asRanShown(keepAsRan(i.cook, plan: p), plan: p).map { solutionAsRan(p, ran: $0) }
        return Made(plan: p, outcome: outcome, ran: ran)
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
                    #if DEBUG
                    self.logIfSettled()
                    #endif
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

    /// A new plan taken: the cook keeps the plan as it ran once it is pulled
    /// and this plan is on its surface (`keepAsRan`, stored when it is new),
    /// the alarms follow its deadlines when they moved, the surface it wants
    /// is asked for, and the card is told.
    private func adopt(_ made: Made, for planned: RunningCook) {
        let next = made.plan
        // The plan as it ran is not something a plan reads, so the plan is
        // still the cook's with it kept.
        let cook = keepAsRan(planned, plan: next)
        if cook != planned {
            running = cook
            persist()
        }
        let before = plan?.deadlines
        #if DEBUG
        Screenshots.log(
            "plan pull \(next.deadlines.cookEndS) cooled \(next.deadlines.coolEndS.map { String($0) } ?? "-")"
                + " lengthened \(next.lengthened) surface \(next.decided != nil)"
                + " next \(next.slowHobAtS.map { String($0) } ?? "-")"
                + " asking \(next.askIfStillIn) overdue \(next.overdue)"
        )
        Screenshots.log(
            "verdict \(next.answer.verdict.kind) white sets \(next.solution.whiteSets) cook \(next.cookTimeS)"
        )
        #endif
        let wasAsking = plan?.askIfStillIn
        plan = next
        plannedFor = cook
        // A pull made overdue by a correction and changed back within the
        // grace is cancelled: nothing rings for it. Nor while the plan asks
        // whether the egg is still in the water.
        let phaseNow = phase(at: AppClock.now)
        if phaseNow == .heating || phaseNow == .cooking || next.askIfStillIn { Ringer.shared.stop() }
        #if DEBUG
        // What Done shows: the peak as it ran once kept, else this plan's.
        Screenshots.log(String(
            format: "shown peak %.2f level %.3f planned peak %.2f",
            shownPeakYolkC ?? .nan, shownLevel ?? .nan, next.solution.result.peakYolkC
        ))
        #endif
        if let o = made.outcome { outcome = o }
        ranSolution = made.ran
        if next.decided != nil {
            heldCertainty = next.certainty
            // This pot's own, or none until it lands after the surface.
            heldProfile = surface.flatMap { $0.inputs == next.inputs ? $0.profile : nil }
        }
        if next.decided != nil, next.leanS != leanHintS {
            leanHintS = next.leanS
            persist()
        }
        if let before, Self.moved(before, next.deadlines) || wasAsking != next.askIfStillIn {
            // A deadline rung for and since moved rings again at its new time.
            rung = rung.filter { Self.same($0.value, Self.at($0.key, next.deadlines)) }
            // But a cook already Done stays silent: a correction there
            // corrects only the record, and the cooling's end it writes
            // (Done on the counter, corrected to ice) is not one to ring
            // (onescreen review 2.1).
            if phaseAt(before, nowS: AppClock.now.timeIntervalSince1970) == .done, phaseNow == .done {
                rung[.pull] = next.deadlines.cookEndS
                if let cooled = next.deadlines.coolEndS { rung[.cooled] = cooled }
            }
            if alarmAuthorized == true {
                // A deadline past and not moved keeps what covered it: its
                // notification has been delivered, and a correction in the
                // pull's grace that holds the pull must not ring it again in
                // the app (onescreen review 3).
                let nowS = AppClock.now.timeIntervalSince1970
                alarmCovers = alarmCovers.filter { d in
                    guard let at = Self.at(d, next.deadlines) else { return false }
                    return at <= nowS && Self.same(Self.at(d, before), at)
                }
                scheduleAlarms()
                Task { await readBackAlarms() }
            }
        }
        askForSurface(next.inputs)
        pushActivity()
        planTaken?()
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
        #if DEBUG
        logIfSettled()
        #endif
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

    private static let savedKey = "cookInProgress.v3"
    /// Where earlier builds kept their cook, in shapes this build does not
    /// read: 0.3's and 0.4's (`cookInProgress`), and an earlier 0.5 build's,
    /// without the plan as it ran (`cookInProgress.v2`, running-cook review
    /// 1.3; DECISIONS.md 48).
    private static let oldKeys = ["cookInProgress", "cookInProgress.v2"]

    private func persist() {
        guard let running else {
            UserDefaults.standard.removeObject(forKey: Self.savedKey)
            #if DEBUG
            Screenshots.log("stored none")
            #endif
            return
        }
        let stored = Stored(cook: running, feedbackGiven: feedbackGiven, leanHintS: leanHintS)
        if let data = try? JSONEncoder().encode(stored) {
            UserDefaults.standard.set(data, forKey: Self.savedKey)
            #if DEBUG
            Screenshots.log("stored \(String(decoding: data, as: UTF8.self))")
            #endif
        }
    }

    /// What a cook too old to pick back up leaves for the caller: the boil to
    /// remember; its egg if it was cooked through and never answered about,
    /// to log as "Start again" would have (`unansweredRecord`); and the cook
    /// itself when its answered egg's record must be made again first
    /// (`cookEnding(...).remake`, onescreen review 1.2), stored until the
    /// caller has made it (`forgetStored`).
    struct Dropped {
        var boil: BoilToRemember?
        var egg: Unanswered?
        var remake: RunningCook?
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
        // A cook an earlier build was running at the upgrade: kept aside as
        // stored, with the results (DECISIONS.md 81, 97), not converted, and
        // the key deleted, so it is read once. Its notifications and its card
        // are left alone: they are still right for the egg in the pot, and
        // nothing else times it now (design/one-screen-review.md 2.6). Its
        // card is ended, though, to go at its own end: nothing will update it
        // again, so it would otherwise sit there stale for the system's eight
        // hours (running-cook review 3).
        var keptOld = false
        for key in Self.oldKeys {
            guard let old = defaults.data(forKey: key) else { continue }
            Calibrations.keepUnreadCook(old)
            defaults.removeObject(forKey: key)
            keptOld = true
            #if DEBUG
            Screenshots.log("restore kept aside \(key)")
            #endif
        }
        if keptOld { activity { await LiveActivity.endAtTheirEnds() } }
        guard let data = defaults.data(forKey: Self.savedKey) else { return nil }
        // A cook this build cannot read whole is not patched; it is kept
        // aside, as stored, and exported with the results (DECISIONS.md 81).
        // Nothing then knows what its alarms and its card are for, so they go.
        guard let stored = try? JSONDecoder().decode(Stored.self, from: data),
              let cook = readRunningCook(stored.cook.jsonObject) else {
            Calibrations.keepUnreadCook(data)
            defaults.removeObject(forKey: Self.savedKey)
            #if DEBUG
            Screenshots.log("restore unreadable")
            #endif
            Alarm.shared.cancel()
            activity { await LiveActivity.endAll() }
            return nil
        }

        let now = AppClock.now.timeIntervalSince1970
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
            let ending = cookEnding(cook, plan: made.plan, nowS: now)
            // An answered egg corrected after its pull, its record not made
            // again before the app went: kept stored until it is.
            let remake = stored.feedbackGiven && ending.remake
            if !remake { defaults.removeObject(forKey: Self.savedKey) }
            #if DEBUG
            Screenshots.log("restore too old")
            #endif
            // Always this build's own cook, so its alarms and its card are
            // this cook's, and there is nothing left for them to time
            // (running-cook review 2.2).
            Alarm.shared.cancel()
            activity { await LiveActivity.endAll() }
            // Its record is made on its pot's surface, which this plan,
            // made at launch, has not got (running-cook review 1.3).
            let egg = !stored.feedbackGiven && ending.finished
                ? Unanswered(
                    cook: cook, plan: made.plan, calibration: input.calibration, leanHintS: stored.leanHintS, nowS: now
                )
                : nil
            return Dropped(boil: ending.boil, egg: egg, remake: remake ? cook : nil)
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
        #if DEBUG
        Screenshots.log("restore \(phaseAt(made.plan.deadlines, nowS: now).rawValue) events written \(due != cook.events)")
        #endif
        generation &+= 1
        reset()
        running = restored
        feedbackGiven = stored.feedbackGiven
        leanHintS = stored.leanHintS
        persist()
        adopt(made, for: restored)

        // The alarms were handed to the system at absolute dates; set them
        // again from the restored plan, and read the count back rather than
        // assuming it.
        let gen = generation
        #if DEBUG
        busy += 1
        #endif
        Task {
            #if DEBUG
            defer { busy -= 1; logIfSettled() }
            #endif
            // A cancel while either of these is awaited ends this cook; what
            // they return is then about a cook that no longer exists.
            let authorized = await Alarm.shared.authorize()
            guard gen == generation else { return }
            alarmAuthorized = authorized
            // The restored plan's, as `start()` sets them: the slow hob is a
            // function of the clock, so the plan picked back up can pull at
            // another moment than the one the notifications still pending
            // were set for (running-cook review 1.4). A deadline past is not
            // scheduled.
            if authorized { scheduleAlarms() }
            await readBackAlarms()
            guard gen == generation else { return }
            // Re-establish the Lock Screen card. A cook can come back from a
            // force-quit, but it can also come back from a reinstall, which
            // takes the activity with it - and an app that has restored a cook
            // while the Lock Screen shows nothing is the same broken promise in
            // the other direction. A cook that is already finished gets none:
            // there is nothing left to count down to.
            if phase != .done, let state = activityState(at: AppClock.now) {
                let attributes = Self.attributes(restored)
                #if DEBUG
                Self.logCard("start", state)
                #endif
                await activity { await LiveActivity.start(attributes, state: state) }.value
                guard gen == generation else { return }
                pushed = state
            }
            #if DEBUG
            Screenshots.log("restored")
            #endif
        }
        startTicking()
        return nil
    }

    private func scheduleAlarms() {
        guard let pullAt, let running else { return }
        // While the plan asks whether the egg is still in the water, nothing
        // past the question is timed (running-cook review 3): the deadlines
        // wait on the answer. No correction in this build can ask yet.
        if plan?.askIfStillIn == true {
            Alarm.shared.cancel()
            return
        }
        Alarm.shared.schedule(
            pullAt: pullAt, coolDoneAt: coolDoneAt, probe: asksForProbe, cooling: running.choices.cooling
        )
    }

    /// Ask the system what it is holding, rather than assuming.
    ///
    /// A cancel while the system is asked leaves the answer unread: it is
    /// about a cook that no longer exists.
    private func readBackAlarms() async {
        #if DEBUG
        busy += 1
        defer { busy -= 1; logIfSettled() }
        #endif
        let gen = generation
        let held = await Alarm.shared.pendingDeadlines()
        guard gen == generation else { return }
        pendingAlarms = held.count
        let now = AppClock.now
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
        let now = AppClock.now
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
        #if DEBUG
        Screenshots.log("ring \(due.rawValue)")
        #endif
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
                // At Done only the hour that keeps the egg open is left to
                // watch for, so the tick slows down.
                let done = self?.phase == .done
                try? await AppClock.sleep(done ? 5 : 0.25)
                guard let self else { return }
                self.tick()
            }
        }
    }

    /// One tick: whether the cook is too old; the events the clock has
    /// decided, written the first time they are past, from the plan of the
    /// cook as it stands; the slow hob's next lengthening; the card; and the
    /// ring.
    private func tick() {
        #if DEBUG
        // Once the tick has done what the phase asks, so a script that waits
        // for the phase and then for `settled` sees what it set going.
        defer { logPhase() }
        #endif
        // Too old to pick back up, by the plan held: ended as Start again
        // ends it, here as at a relaunch (running-cook review 2.2).
        if running != nil, let plan, cookTooOld(plan, nowS: AppClock.now.timeIntervalSince1970) {
            tooOld?()
            return
        }
        guard let running, let plan, plannedFor == running else {
            pushActivity()
            ringIfDue()
            return
        }
        let now = AppClock.now.timeIntervalSince1970
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

    #if DEBUG
    /// The phase last written to the debug log.
    @ObservationIgnored private var loggedPhase: Phase?

    /// How many starts, restores and alarm read-backs are under way.
    @ObservationIgnored private var busy = 0

    /// Nothing under way - no plan being made, no surface being built, no
    /// start, restore or read-back - to the debug log: what the scripted
    /// checks wait for before they move the clock on.
    private func logIfSettled() {
        guard planning == nil, surfaceAsked == nil, busy == 0 else { return }
        Screenshots.log("settled")
    }

    /// The phase, to the debug log when it changes, and whether that left
    /// the cook settled.
    private func logPhase() {
        let now = phase
        guard now != loggedPhase else { return }
        loggedPhase = now
        Screenshots.log("phase \(now.rawValue)")
        logIfSettled()
    }

    /// A card pushed, to the debug log, its end in cook time.
    private static func logCard(_ what: String, _ s: CookActivity.ContentState) {
        Screenshots.log(
            "activity \(what) \(s.stage.rawValue) ends \(Int(AppClock.fromReal(s.ends).timeIntervalSince1970.rounded()))"
                + " up \(s.countsUp == true)"
                + " cook \(s.cook?.doneness ?? "-")|\(s.cook?.peakYolk ?? "-")|\(s.cook?.eggMass ?? "-")|\(s.cook?.cooling ?? "-")"
        )
    }
    #endif

    // MARK: - Live Activity

    /// The card's fixed part: the language the cook was started in.
    private static func attributes(_ cook: RunningCook) -> CookActivity {
        CookActivity(lang: cook.lang)
    }

    /// The card's description of this cook, from its plan, in its own units
    /// and its own language: in each state pushed, so a plan made again
    /// updates the card in place.
    private static func description(_ cook: RunningCook, _ plan: CookPlan) -> CookActivity.Description {
        // Once the egg is out, as it ran (`asRanShown`).
        let ran = asRanShown(cook, plan: plan)
        return CookActivity.Description(
            doneness: tr(anchorNear(ran?.level ?? plan.level).key, in: cook.lang),
            peakYolk: showIn(cook.units, .temperature, ran?.peakYolkC ?? plan.solution.result.peakYolkC),
            eggMass: showIn(cook.units, .mass, plan.egg.massKg * 1000),
            cooling: cook.choices.cooling.rawValue
        )
    }

    /// What the Lock Screen should be showing. Each stage hands over its own
    /// span, so the system can draw the countdown without asking again.
    ///
    /// The system counts it on its own clock, so its dates are the moments
    /// the cook's come (`AppClock.real`): the same dates, but under a debug
    /// build's fast clock a countdown that reaches zero with the app's in
    /// real seconds.
    private func activityState(at now: Date) -> CookActivity.ContentState? {
        guard var state = cardState(at: now) else { return nil }
        state.began = AppClock.real(state.began)
        state.ends = AppClock.real(state.ends)
        return state
    }

    /// The card's state in cook time.
    private func cardState(at now: Date) -> CookActivity.ContentState? {
        guard let running, let plan else { return nil }
        let d = plan.deadlines
        let start = Date(timeIntervalSince1970: running.startedAtS)
        let pull = Date(timeIntervalSince1970: d.cookEndS)
        let cook = Self.description(running, plan)
        // While the plan asks whether the eggs are still in the water, the
        // card shows the pull, "now", with the pull's line naming the
        // cooling, not a cooling's countdown that may not be running: if
        // they are still in, that is what to do. Until the question is
        // answered, or the cook is too old.
        if plan.askIfStillIn, phase(at: now) != .idle {
            return .init(
                stage: .pull, began: pull, ends: Date(timeIntervalSince1970: plan.tooOldAtS), provisional: false,
                cook: cook
            )
        }
        switch phase(at: now) {
        case .idle, .done:
            return nil
        case .heating where plan.lengthened:
            // The time heated, counting up to when the guess gives out, not
            // down to a pull that keeps moving (running-cook review 3).
            return .init(
                stage: .heating, began: start, ends: Date(timeIntervalSince1970: plan.tooOldAtS), provisional: true,
                countsUp: true, cook: cook
            )
        case .heating:
            return .init(stage: .heating, began: start, ends: pull, provisional: true, cook: cook)
        case .cooking:
            return .init(stage: .cooking, began: start, ends: pull, provisional: false, cook: cook)
        case .pull:
            return .init(
                stage: .pull, began: pull, ends: pull.addingTimeInterval(pullGraceSeconds), provisional: false,
                cook: cook
            )
        case .cooling:
            let from = outAt ?? pull.addingTimeInterval(pullGraceSeconds)
            return .init(stage: .cooling, began: from, ends: coolDoneAt ?? from, provisional: false, cook: cook)
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
            #if DEBUG
            Screenshots.log("activity end done")
            #endif
            activity { await LiveActivity.endAll() }
            return
        }
        guard let state = activityState(at: AppClock.now), state != pushed else { return }
        pushed = state
        #if DEBUG
        Self.logCard("update", state)
        #endif
        activity { await LiveActivity.update(state) }
    }
}
