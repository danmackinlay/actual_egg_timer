import Foundation
import Observation
import EggTimerCore
import EggTimerShared

/// A cook in progress, as an effect runner over core's `step` (Step.swift):
/// each thing that happens to the cook is an event, `step` returns the cook
/// as it now stands, its plan, what it waits for (`need`) and what the app
/// must do (`effects`), and this holds the state, steps it and hands each
/// effect on: the cook written down here, the alarms and the ring to
/// `CookAlarms`, the card on the Lock Screen to `CookCard`, the boil and the
/// egg's record to the planner, what is final to sharing. What a step waits
/// for (its pot's surface, the calibration before this egg and a surface on
/// it) `CookSurfaces` builds off the main actor. The screens draw from the
/// state (`readout`, core's `readoutAt`) at their frame's moment.
///
///     IDLE -> HEATING -> COOKING -> PULL -> COOLING -> DONE
///
/// Every phase is derived from the plan's deadlines and the time (`phaseAt`),
/// never counted down, so a tick that stops - the app in the background, the
/// screen locked - cannot make the egg wrong.
///
/// Steps run one at a time, off the main actor (a plan is a dozen solves),
/// in the order the events came; each event carries its own moment. The
/// ticker sends a tick only when the clock has something to decide
/// (`dueAt`): the events it writes, the slow hob's next lengthening, the cook
/// too old.
///
/// A cook that ends before its egg's record can be made - the calibration
/// before this egg, or a surface on it, still to build - leaves the screen
/// at once and waits in `ending`, stored, stepped as each lands, until it is
/// logged and forgotten.
@Observable
@MainActor
public final class Cook {
    /// The cook on screen, its plan and the lean: core's `CookState`, the cook
    /// nil while idle. A cook ended is never on screen.
    public private(set) var state = CookState(cook: nil, plan: nil, leanHintS: 0)
    /// What it waits for; nil for nothing.
    private var need: CookNeed?

    /// Cooks ended whose egg's record is still to be made.
    private struct Ending {
        var state: CookState
        var need: CookNeed?
    }
    private var ending: [Ending] = []

    /// What the plan shows beside the cook, on its pot's surface: what the
    /// egg at the plan's time will be like; how sure I am of it and the odds
    /// at every level, held while a new pot's surface is built; and the solve
    /// as the cook ran once the egg is out (`solutionAsRan`), so Done never
    /// reads a posterior that has folded this egg's answer.
    public private(set) var outcome: Outcome?
    public private(set) var heldCertainty: CertaintyReading?
    public private(set) var heldProfile: OddsProfile?
    public private(set) var ranSolution: Solution?

    /// An ended cook whose record could not be made again, left stored for
    /// the next launch to make: its egg is not final until then, or until a
    /// new cook is stored over it.
    private var unremade = false

    /// What the cook's effects are handed to: its alarms and its ring, its
    /// card on the Lock Screen, and what its steps wait for, built.
    public let alarms = CookAlarms()
    private let card = CookCard()
    private let surfaces = CookSurfaces()

    @ObservationIgnored private let planner: Planner
    @ObservationIgnored private let edits: Edits?

    private enum Job {
        case event(CookEvent)
        /// Something a cook waited for has been built.
        case landed
        #if DEBUG
        /// The cook replaced, outside the state machine (`moveBack`).
        case replace(RunningCook)
        #endif
    }
    @ObservationIgnored private var jobs: [Job] = []
    private var stepping: Task<Void, Never>?
    private var ticker: Task<Void, Never>?
    /// Starts and restores under way, whose alarms and card are being set.
    @ObservationIgnored private var busy = 0
    /// Ticks taken: a step's `idle` waits for a tick at its moment
    /// (`Screenshots.idle(after:)`).
    @ObservationIgnored public private(set) var ticks = 0
    @ObservationIgnored private var log = CookLog()

    public init(planner: Planner, edits: Edits? = nil) {
        self.planner = planner
        self.edits = edits
        alarms.onScreen = { [weak self] in (self?.running, self?.asksForProbe ?? false) }
        alarms.onSettled = { [weak self] in self?.logIfSettled() }
        surfaces.landed = { [weak self] in self?.send(.landed) }
    }

    // MARK: - Read off the state

    /// The cook on screen and its plan, or nil while idle.
    public var running: RunningCook? { state.cook }
    public var plan: CookPlan? { state.cook == nil ? nil : state.plan }

    /// The phase at `nowS`.
    public func phase(atS nowS: Double) -> Phase {
        guard running != nil, let plan else { return .idle }
        return phaseAt(plan.deadlines, nowS: nowS)
    }

    /// The phase now, for a tap; a view takes its frame's moment.
    public var phase: Phase { phase(atS: AppClock.nowS) }

    /// What the readout says at `nowS` (core's `readoutAt`); nil while idle.
    public func readout(atS nowS: Double) -> Readout? {
        guard let cook = running, let plan else { return nil }
        return readoutAt(cook, plan: plan, nowS: nowS, probe: ReadoutProbe(wanted: asksForProbe, pending: false))
    }

    /// What has been said about the egg on screen.
    public var answers: CookAnswers? { running.map(answersOf) }

    /// Whether the egg on screen is in the log.
    public var logged: Bool { running.map { answersLogged($0) != nil } ?? false }

    /// Whether this cook will ask for a probe reading when its cooling ends.
    public var asksForProbe: Bool { plan?.probeMoment == true && planner.settings.probe }

    /// The plan as it ran, once the egg is out (`asRanShown`): what Done and
    /// the cooling show, whatever a later plan on a newer posterior reads.
    public var asRan: CookAsRan? {
        guard let running, let plan else { return nil }
        return asRanShown(running, plan: plan)
    }

    /// The level and peak yolk the cook was planned to, as it ran once out.
    public var shownLevel: Double? { asRan?.level ?? plan?.answer.level }
    public var shownPeakYolkC: Double? { asRan?.peakYolkC ?? plan?.solution.result.peakYolkC }
    public var shownProbeMoment: Bool { asRan?.probeMoment ?? plan?.probeMoment ?? false }

    /// Whether this cook's egg is in the log and not yet final: the egg on
    /// screen, answered and not too old, or an ended one whose record is
    /// being made again or was left for the next launch. Sharing holds it
    /// back; every other egg is final.
    public func eggOpen(atS nowS: Double) -> Bool {
        if logged, openEggId(running, plan: plan, nowS: nowS) != nil { return true }
        return unremade || ending.contains { $0.state.cook.map { answersLogged($0) != nil } ?? false }
    }

    /// This egg's record as core makes it now, with what has been said, or
    /// nil when core refuses it (no forecast yet).
    public func eggRecord() -> EggRecord? {
        guard let running, let plan else { return nil }
        let said = answersOf(running)
        return cookFactsFor(
            running, plan: plan, context: context(running), yolkWord: said.yolkWord, white: said.white,
            probe: said.probe
        ).facts.map(recordFor)
    }

    /// A probe reading typed at Done, as the record carries it, scored
    /// against `record` (the egg's as logged, or as core makes it now).
    public func probeReading(centreC: Double, against record: EggRecord) -> ProbeReading? {
        guard let running else { return nil }
        return probeReadingFor(
            record, centreC: centreC, coolEndS: plan?.deadlines.coolEndS.map { $0 - running.startedAtS }
        )
    }

    /// Whether the ticker runs, and whether nothing is under way: no step,
    /// nothing being built, no start, restore or read-back. What a step's
    /// `idle` and the tests wait for.
    public var ticking: Bool { ticker != nil }
    public var isSettled: Bool {
        stepping == nil && jobs.isEmpty && surfaces.idle && busy == 0 && alarms.readingBack == 0
    }

    // MARK: - What happens to the cook

    /// "Eggs in": a cook with these choices, the nudge it drew, the pans as
    /// remembered and the lean the time on screen took. Its first plan reads
    /// the surface the screen chose on, when it is built, so the egg is timed
    /// as the screen said. Returns once the cook is planned.
    public func start(
        choices: CookChoices, nudgeS: Double, boilMemory: BoilMemory, units: UnitSystem, lang: String,
        leanHintS: Double
    ) async {
        guard running == nil else { return }
        let c = planner.calibration
        let pot = cookSetupOf(choices, timeToBoilS: estimateTimeToBoil(boilMemory, litres: choices.waterLitres))
        await surfaces.takeBuilt(decisionInputs(c, egg: pot.egg, setup: pot.setup), c)
        send(.event(.start(
            nowS: AppClock.nowS, choices: choices, nudgeS: nudgeS, boilMemory: boilMemory, units: units, lang: lang,
            leanHintS: leanHintS
        )))
        await stepping?.value
    }

    /// "Full rolling boil". Tapping at first bubbles under-measures the boil
    /// by 15-25%, which is why the button says what it says.
    public func boil() { send(.event(.boil(nowS: AppClock.nowS))) }
    /// The egg out of the water, at the pull.
    public func pulledOut() { send(.event(.out(nowS: AppClock.nowS))) }
    /// "Still in the water?" Yes, and no: the pull the clock assumed stands.
    public func stillIn() { send(.event(.stillIn(nowS: AppClock.nowS))) }
    public func stillOut() { send(.event(.pullStands(nowS: AppClock.nowS))) }
    /// Cancel, or Start again: core decides what the cook leaves.
    public func end() { send(.event(.startAgain(nowS: AppClock.nowS))) }

    /// A correction committed (`Edits`): the start and the choices replaced,
    /// two steps, the start first.
    public func correct(choices: CookChoices, startedAtS: Double?) {
        let now = AppClock.nowS
        if let s = startedAtS { send(.event(.correctStart(nowS: now, startedAtS: s))) }
        send(.event(.correct(nowS: now, choices: choices)))
    }

    /// An answer at Done.
    public func answer(yolk: YolkWord?, white: WhiteReport?, probe: ProbeReading?) {
        guard running != nil else { return }
        // An egg too old takes no answer: the clock ends it first.
        let now = AppClock.nowS
        send(.event(.tick(nowS: now)))
        send(.event(.answered(nowS: now, yolkWord: yolk, white: white, probe: probe)))
    }

    /// Looked at again (back in the foreground): the clock decides what is
    /// due, a cook too old ended among it.
    public func lookAgain() {
        guard running != nil else { return }
        send(.event(.tick(nowS: AppClock.nowS)))
    }

    /// The cooking with a probe setting changed: the cooling's alarm, if it
    /// is still to come, asks for the reading or not.
    public func probeSettingChanged() {
        guard phase != .done else { return }
        alarms.again()
    }

    /// A plan of `hand`, the cook as a change in hand would make it, for its
    /// preview: on the surfaces built, the lean as it stands. Stores nothing
    /// and rings nothing.
    public func previewPlan(_ hand: RunningCook, nowS: Double) async -> CookPlan {
        let c = planner.calibration
        let surface = surfaceFor(surfaces.all(c), plan?.inputs)
        let lean = state.leanHintS
        return await Task.detached(priority: .userInitiated) {
            replan(hand, c, surface: surface, leanHintS: lean, nowS: nowS)
        }.value
    }

    #if DEBUG
    /// A debug build's `-uiScreen done`: the cook moved back in time so the
    /// eggs came out on time and the cooling ended `ago` s ago.
    public func skipToDone(ago: Double = 2) {
        guard var cook = running, let plan else { return }
        let cooking = plan.cookTimeS
        let cooled = cook.choices.cooling == .counter ? 0 : plan.coolS
        let start = AppClock.nowS - (cooking + cooled + ago)
        cook = shiftedCook(cook, by: start - cook.startedAtS)
        let out = start + cooking
        cook = writeEvents(cook, CookEvents(
            boilAtS: cook.events.boilAtS, pulled: Pulled(dueS: out, outS: out, by: .cook, confirmed: true),
            cooledAtS: cook.choices.cooling == .counter ? nil : out + cooled
        ))
        send(.replace(cook))
    }

    /// A debug build's `-cookAgo`: every time in the cook moved back.
    public func moveBack(_ seconds: Double) {
        guard let cook = running else { return }
        send(.replace(shiftedCook(cook, by: -seconds)))
    }
    #endif

    /// The process gone, for a test: the ticker stops, and the store keeps
    /// what it has.
    func killed() {
        ticker?.cancel()
        ticker = nil
    }

    // MARK: - The steps

    private func send(_ job: Job) {
        if case .event(.tick) = job, jobs.contains(where: { if case .event(.tick) = $0 { true } else { false } }) {
            return
        }
        jobs.append(job)
        guard stepping == nil else { return }
        stepping = Task { [weak self] in await self?.work() }
    }

    private func work() async {
        while !jobs.isEmpty {
            let job = jobs.removeFirst()
            switch job {
            case let .event(event):
                if running != nil || isStart(event) { await stepOnScreen(event) }
            case .landed:
                let now = AppClock.nowS
                if running != nil { await stepOnScreen(.surfaceLanded(nowS: now)) }
                await stepEnding(nowS: now)
            #if DEBUG
            case let .replace(cook):
                guard running != nil else { break }
                // Planned afresh, as at a relaunch, and stored.
                state = CookState(cook: cook, plan: nil, leanHintS: state.leanHintS)
                await stepOnScreen(.tick(nowS: AppClock.nowS))
                persist(running, leanHintS: state.leanHintS)
            #endif
            }
        }
        stepping = nil
        logIfSettled()
    }

    private func isStart(_ e: CookEvent) -> Bool {
        if case .start = e { true } else { false }
    }

    /// The step, with what it shows beside the cook, made off the main actor.
    private struct Made: Sendable {
        let step: CookStep
        let outcome: Outcome?
        let ran: Solution?
    }

    private nonisolated static func made(_ state: CookState, _ event: CookEvent, _ env: CookEnv) -> Made {
        let s = step(state, event, env)
        guard let cook = s.cook, let p = s.plan else { return Made(step: s, outcome: nil, ran: nil) }
        var outcome: Outcome?
        if let d = p.decided, let surface = surfaceFor(env.surfaces, p.inputs) {
            outcome = p.cookTimeS == d.solution.result.cookTimeS
                ? d.outcome
                : predictOutcome(env.calibration.posterior, surface.grid, p.cookTimeS, logYolkTarget(p.answer.level))
        }
        let ran = asRanShown(cook, plan: p).map { solutionAsRan(p, ran: $0) }
        return Made(step: s, outcome: outcome, ran: ran)
    }

    /// What the app holds for a step of `cook`.
    private func env(for cook: RunningCook?, nowS: Double) -> CookEnv {
        let c = planner.calibration
        return CookEnv(
            calibration: c, surfaces: surfaces.all(c), before: cook.flatMap { surfaces.before[$0.idMs] }, app: .ios,
            appVersion: AppClock.mark(Calibrations.appVersion), prior: Calibrations.population.id,
            day: localDay(cook?.startedAtS ?? nowS)
        )
    }

    /// The record's context for `cook`: one cook at a time here, so no `id`.
    private func context(_ cook: RunningCook) -> RecordContext {
        RecordContext(
            app: .ios, appVersion: AppClock.mark(Calibrations.appVersion), prior: Calibrations.population.id,
            day: localDay(cook.startedAtS), id: nil
        )
    }

    /// The cook on screen stepped with `event`.
    private func stepOnScreen(_ event: CookEvent) async {
        let was = state
        let env = env(for: was.cook, nowS: event.nowS)
        let made = await Task.detached(priority: .userInitiated) { Self.made(was, event, env) }.value
        take(made, was: was, event: event)
    }

    /// Each ended cook stepped as something it waited for has landed; those
    /// logged and forgotten go.
    private func stepEnding(nowS: Double) async {
        for e in ending {
            guard let cook = e.state.cook else { continue }
            let env = env(for: cook, nowS: nowS)
            let state = e.state
            let s = await Task.detached(priority: .userInitiated) {
                step(state, .surfaceLanded(nowS: nowS), env)
            }.value
            guard let i = ending.firstIndex(where: { $0.state.cook?.idMs == cook.idMs }) else { continue }
            perform(s.effects, for: cook, after: s.cook, leanHintS: s.leanHintS, onScreen: running == nil)
            if asRanStale(cook), s.cook.map(asRanStale) != true { Screenshots.log(.asRanRemade) }
            if s.cook == nil {
                ending.remove(at: i)
            } else {
                ending[i] = Ending(state: s.state, need: s.need)
            }
        }
        keepBefore()
        follow()
    }

    /// A step of the cook on screen taken: the state, what it shows, the
    /// effects, and what it waits for.
    private func take(_ made: Made, was: CookState, event: CookEvent) {
        let s = made.step
        guard let cook = s.cook, endedAtS(cook) == nil else {
            // Off the screen: logged and forgotten, or ended with its record
            // still to make, waiting.
            if was.cook != nil { leave() }
            if s.cook != nil { ending.append(Ending(state: s.state, need: s.need)) }
            perform(s.effects, for: s.cook ?? was.cook, after: s.cook, leanHintS: s.leanHintS, onScreen: true)
            if was.cook != nil {
                // The idle screen solved again: a new nudge, and a pan the
                // cook timed remembered.
                planner.redrawNudge()
                planner.refresh()
            }
            keepBefore()
            follow()
            return
        }
        let started = was.cook == nil
        state = s.state
        need = s.need
        if let o = made.outcome { outcome = o }
        ranSolution = made.ran
        if let p = s.plan, p.decided != nil {
            heldCertainty = p.certainty
            heldProfile = surfaceFor(surfaces.all(planner.calibration), p.inputs)?.profile
        }
        if started { unremade = false }
        perform(s.effects, for: cook, after: cook, leanHintS: s.leanHintS, onScreen: true)
        CookLog.plan(s, was: was, event: event, shown: (shownPeakYolkC, shownLevel))
        CookLog.step(was: was.cook, now: cook, event: event)
        keepBefore()
        follow()
        if started { begin(cook) }
        card.push(running, plan, atS: AppClock.nowS)
    }

    /// What core asks of the app, for `cook` (`after`, the cook as the step
    /// left it, nil when it is gone), handed on.
    ///
    /// The alarms and the ring are the screen's: an ended cook stepped while
    /// another is on screen leaves them alone.
    private func perform(
        _ effects: [CookEffect], for cook: RunningCook?, after: RunningCook?, leanHintS: Double, onScreen: Bool
    ) {
        for e in effects {
            switch e {
            case .persist:
                persist(after, leanHintS: leanHintS)
            case let .alarms(pullS, cooledS):
                if onScreen { alarms.plan(pullS: pullS, cooledS: cooledS) }
            case let .ring(deadline):
                if onScreen, let plan { alarms.ring(deadline, plan.deadlines) }
            case .silence:
                if onScreen { alarms.silence() }
            case let .rememberBoil(boil):
                planner.rememberBoil(boil)
            case let .log(record, replaces):
                planner.learner.logRecord(record, replaces: replaces)
            case .forget:
                if let cook { Self.forgetStored(idMs: cook.idMs) }
            case .sendFinal:
                Services.sharing.sendFinal()
            }
        }
    }

    /// What each cook waits for, asked for.
    private func follow() {
        if let cook = running, let need { ask(need, for: cook, ended: false) }
        for e in ending {
            if let cook = e.state.cook, let need = e.need { ask(need, for: cook, ended: true) }
        }
    }

    private func ask(_ need: CookNeed, for cook: RunningCook, ended: Bool) {
        if let inputs = need.surface { surfaces.build(inputs, on: planner.calibration) }
        // `-uiHoldAsRan YES`: the calibration before the egg is never made
        // while the cook runs in this launch.
        if need.before, ended || !Screenshots.holdAsRan {
            surfaces.buildBefore(
                cook.idMs, logged: answersLogged(cook) != nil ? planner.kept.log.indices.last : nil,
                from: planner.learner
            )
        }
        guard let inputs = need.beforeSurface, surfaces.before[cook.idMs] != nil else { return }
        // `-uiFailRemake YES`: an ended cook's record is never made again in
        // this launch; the cook stays stored for the next.
        if Screenshots.failRemake, ended {
            ending.removeAll { $0.state.cook?.idMs == cook.idMs }
            unremade = true
            Screenshots.log(.asRanNotRemade)
            return
        }
        surfaces.buildBefore(cook.idMs, surface: inputs)
    }

    /// The calibrations before an egg still wanted: a cook's whose plan as it
    /// ran is stale.
    private func keepBefore() {
        surfaces.keep(Set(([state] + ending.map(\.state)).compactMap { $0.cook }.filter(asRanStale).map(\.idMs)))
    }

    // MARK: - On and off the screen

    /// A cook begun on screen, started or picked back up: its controls show
    /// its own choices, and the alarms are asked for, set, read back, and
    /// the card started.
    private func begin(_ cook: RunningCook, restored: Bool = false) {
        planner.adopt(cook.choices)
        edits?.begin()
        startTicking()
        busy += 1
        Task {
            defer {
                busy -= 1
                logIfSettled()
            }
            await alarms.begin(cook.idMs)
            guard running?.idMs == cook.idMs else { return }
            // The card as it stands once the alarms are asked for, which can
            // take a prompt's seconds.
            if let now = running, let plan { await card.start(now, plan, atS: AppClock.nowS) }
            guard running?.idMs == cook.idMs else { return }
            if restored { Screenshots.log(.restored) }
        }
    }

    /// The cook has left the screen (ended, or gone): its ticker, ring and
    /// card go, and the controls answer to the idle screen again.
    private func leave() {
        Screenshots.log(.cookEnded)
        state = CookState(cook: nil, plan: nil, leanHintS: 0)
        need = nil
        outcome = nil
        heldCertainty = nil
        heldProfile = nil
        ranSolution = nil
        alarms.reset()
        card.reset()
        ticker?.cancel()
        ticker = nil
        edits?.end()
    }

    // MARK: - The ticker

    private func startTicking() {
        ticker?.cancel()
        ticker = Task { [weak self] in
            // At Done only the egg's hour is left to watch for: slower.
            var done = self?.phase == .done
            while !Task.isCancelled {
                try? await AppClock.sleep(done ? 5 : 0.25)
                guard let self, !Task.isCancelled else { return }
                done = self.tick() == .done
            }
        }
    }

    /// One tick: a step when the clock has something to decide, and the
    /// card. Returns the phase, which sets the ticker's pace.
    private func tick() -> Phase {
        let now = AppClock.nowS
        defer {
            if log.phase(phase(atS: now)) { logIfSettled() }
            ticks &+= 1
        }
        // Stepped only when the clock has something to decide (core's
        // `tickDue`, which the step asks too).
        if let cook = running, let plan, tickDue(cook, plan, nowS: now) { send(.event(.tick(nowS: now))) }
        card.push(running, plan, atS: now)
        return phase(atS: now)
    }

    /// Nothing under way, to the debug log.
    private func logIfSettled() {
        guard isSettled else { return }
        Screenshots.log(.settled)
    }

    // MARK: - Surviving a relaunch

    /// What is stored: the cook, whether it has been answered about, and the
    /// last decided lean. The alarms are with the system and the card on the
    /// Lock Screen, so a force-quit leaves both counting down: the cook is
    /// picked back up to match them.
    private struct Stored: Codable {
        var cook: RunningCook
        var feedbackGiven: Bool
        var leanHintS: Double

        private enum CodingKeys: String, CodingKey {
            case cook, feedbackGiven, leanHintS = "leanHint_s"
        }
    }

    static let savedKey = "cookInProgress.v4"

    private func persist(_ cook: RunningCook?, leanHintS: Double) {
        guard let cook else { return }
        let stored = Stored(cook: cook, feedbackGiven: answered(cook), leanHintS: leanHintS)
        if let data = try? JSONEncoder().encode(stored) {
            Stores.set(data, forKey: Self.savedKey)
            #if DEBUG
            Screenshots.log(.stored(value: Screenshots.Encoded(value: stored)))
            #endif
        }
    }

    /// The stored cook forgotten, unless another cook is stored now.
    static func forgetStored(idMs: Double) {
        if let data = Stores.store.data(forKey: savedKey),
           let stored = try? JSONDecoder().decode(Stored.self, from: data), stored.cook.idMs != idMs { return }
        Stores.remove(savedKey)
        #if DEBUG
        Screenshots.log(.stored(value: nil))
        #endif
    }

    /// Pick up the cook stored when the app was last closed: a tick of it
    /// with no plan yet, stepped here on the main actor before the screen's
    /// first answer, so a relaunch never shows idle over a running cook. The
    /// clock writes what it decided while the app was away; one too old ends
    /// as Start again ends it. Called by the view, not from `init`.
    public func restore() {
        guard running == nil, ending.isEmpty else { return }
        // An earlier build's cook, its key deleted at launch: its
        // notifications are left, and its card ended at its own end.
        if Stores.takeRetiredCook() { card.endAtTheirEnds() }
        guard let data = Stores.store.data(forKey: Self.savedKey) else { return }
        // A cook this build cannot read whole is dropped, with what timed it.
        guard let stored = try? JSONDecoder().decode(Stored.self, from: data),
              let cook = readRunningCook(stored.cook.jsonObject) else {
            Stores.remove(Self.savedKey)
            #if DEBUG
            Screenshots.log(.restoreUnreadable)
            #endif
            Services.alarm.cancel()
            card.endAll()
            return
        }
        let now = AppClock.nowS
        let was = CookState(cook: cook, plan: nil, leanHintS: stored.leanHintS)
        let made = Self.made(was, .tick(nowS: now), env(for: cook, nowS: now))
        let s = made.step
        guard let after = s.cook, endedAtS(after) == nil else {
            Screenshots.log(.restoreTooOld)
            // Its alarms and its card are this cook's, and there is nothing
            // left for them to time; an ended cook waits for its record.
            card.endAll()
            if s.cook != nil { ending.append(Ending(state: s.state, need: s.need)) }
            perform(s.effects, for: cook, after: s.cook, leanHintS: s.leanHintS, onScreen: true)
            follow()
            return
        }
        Screenshots.log(.restore(
            phase: s.plan.map { phaseAt($0.deadlines, nowS: now).rawValue } ?? Phase.idle.rawValue,
            eventsWritten: after.events != cook.events
        ))
        state = s.state
        need = s.need
        if let o = made.outcome { outcome = o }
        ranSolution = made.ran
        if let plan = s.plan, plan.decided != nil { heldCertainty = plan.certainty }
        // Written down whatever the clock decided, so the store holds what
        // this launch picked up.
        persist(after, leanHintS: s.leanHintS)
        perform(
            s.effects.filter { $0 != .persist }, for: cook, after: after, leanHintS: s.leanHintS, onScreen: true
        )
        CookLog.plan(s, was: was, event: .tick(nowS: now), shown: (shownPeakYolkC, shownLevel))
        follow()
        begin(after, restored: true)
    }
}
