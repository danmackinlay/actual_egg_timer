import Foundation
import Observation
import EggTimerCore
import EggTimerShared

/// A cook in progress, as an effect runner over core's cooks (Cooks.swift,
/// over `step`): each thing that happens to the cook is an event, core
/// returns the cooks as they now stand - the one on screen, its plan and
/// what it waits for, and those ended waiting on their records - and what
/// the app must do, each effect tagged with whose cook it is; this holds the
/// cooks, steps them and hands each effect on: the cook written down here,
/// the alarms and the ring to
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
/// (`tickDue`): the events it writes, the slow hob's next lengthening, the cook
/// too old.
///
/// A cook that ends before its egg's record can be made - the calibration
/// before this egg, or a surface on it, still to build - leaves the screen
/// at once and waits in core's `ending`, stored, stepped as each lands, until
/// it is logged and forgotten; a new cook may start beside it, and an ended
/// cook is written only over its own stored copy, never over the new one's.
@Observable
@MainActor
public final class Cook {
    /// The cooks, core's `Cooks`: the one on screen, its plan and the lean,
    /// the cook nil while idle; what it waits for; and those ended whose egg's
    /// record is still to be made. A cook ended is never on screen.
    private(set) var cooks = Cooks.none
    /// The cook on screen, its plan and the lean: core's `CookState`.
    var state: CookState { cooks.screen }

    /// What the plan shows beside the cook, on its pot's surface: what the
    /// egg at the plan's time will be like; how sure I am of it and the odds
    /// at every level, held while a new pot's surface is built; and the solve
    /// as the cook ran once the egg is out (`solutionAsRan`), so Done never
    /// reads a posterior that has folded this egg's answer.
    public private(set) var outcome: Outcome?
    public private(set) var heldCertainty: CertaintyReading?
    public private(set) var heldProfile: OddsProfile?
    public private(set) var ranSolution: Solution?

    /// What the cook's effects are handed to: its alarms and its ring, its
    /// card on the Lock Screen, and what its steps wait for, built.
    public let alarms = CookAlarms()
    private let card = CookCard()
    private let surfaces = CookSurfaces()

    @ObservationIgnored private let planner: Planner
    @ObservationIgnored private let inHand: InHand?
    /// Where the calibration before an egg comes from: the planner's
    /// learning, or a test's.
    @ObservationIgnored var learned: any LearnedBefore

    private enum Job {
        case event(CookEvent)
        /// Something a cook waited for has been built.
        case landed
    }

    /// A job as the cooks take it: the event, or what was built landing, at
    /// its moment.
    private enum Move: Sendable {
        case event(CookEvent)
        case landed(nowS: Double)

        var nowS: Double {
            switch self {
            case let .event(e): e.nowS
            case let .landed(now): now
            }
        }

        /// The event the cook on screen was stepped with.
        var event: CookEvent {
            switch self {
            case let .event(e): e
            case let .landed(now): .surfaceLanded(nowS: now)
            }
        }
    }
    @ObservationIgnored private var jobs: [Job] = []
    private var stepping: Task<Void, Never>?
    private var ticker: Task<Void, Never>?
    /// Starts and restores under way, whose alarms and card are being set.
    @ObservationIgnored private var busy = 0
    #if DEBUG
    /// Ticks taken: a step's `idle` waits for a tick at its moment
    /// (`DebugLog.idle(after:)`), and a test for a tick at its clock's.
    @ObservationIgnored private(set) var ticks = 0
    #endif
    @ObservationIgnored private var log = CookLog()
    /// Those waiting for something being built to land (`caughtUp`).
    @ObservationIgnored private var landing: [CheckedContinuation<Void, Never>] = []

    init(planner: Planner, inHand: InHand? = nil) {
        self.planner = planner
        self.inHand = inHand
        learned = planner.learner
        alarms.onScreen = { [weak self] in (self?.running, self?.asksForProbe ?? false) }
        alarms.onSettled = { [weak self] in self?.logIfSettled() }
        surfaces.landed = { [weak self] in
            guard let self else { return }
            send(.landed)
            let waiting = landing
            landing = []
            for w in waiting { w.resume() }
        }
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
    var logged: Bool { running.map { answersLogged($0) != nil } ?? false }

    /// Whether this cook will ask for a probe reading when its cooling ends.
    var asksForProbe: Bool { plan?.probeMoment == true && planner.settings.probe }

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

    /// The eggs in the log and not yet final, by their cooks' ids (core's
    /// `openEggs`): the egg on screen, answered and not too old, and each
    /// ended one whose record is being made again. Sharing holds them back;
    /// every other egg is final.
    public func openEggs(atS nowS: Double) -> [Double] {
        EggTimerCore.openEggs(cooks, nowS: nowS)
    }

    /// This egg's record as core makes it now, with what has been said, or
    /// nil when core refuses it (no forecast yet).
    func eggRecord() -> EggRecord? {
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

    #if DEBUG
    /// Whether the ticker runs, for a step's `idle`.
    var ticking: Bool { ticker != nil }
    #endif

    /// Whether nothing is under way: no step, nothing being built, no start,
    /// restore or read-back. What a step's `idle` and the tests wait for.
    var isSettled: Bool {
        stepping == nil && jobs.isEmpty && surfaces.idle && busy == 0 && alarms.readingBack == 0
    }

    // MARK: - What happens to the cook

    /// "Eggs in": a cook with these choices, the nudge it drew, the pans as
    /// remembered and the lean the time on screen took. Its first plan reads
    /// the surface the screen chose on, when it is built, so the egg is timed
    /// as the screen said. Returns once the cook is planned.
    func start(
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

    /// "Rolling boil". Tapping at first bubbles under-measures the time to
    /// boil by 15-25%, which is why the button and the hint above it ask
    /// for the whole surface rolling.
    func boil() { send(.event(.boil(nowS: AppClock.nowS))) }
    /// The egg out of the water, at the pull.
    func pulledOut() { send(.event(.out(nowS: AppClock.nowS))) }
    /// "Still in the water?" Yes, and no: the pull the clock assumed stands.
    func stillIn() { send(.event(.stillIn(nowS: AppClock.nowS))) }
    func stillOut() { send(.event(.pullStands(nowS: AppClock.nowS))) }
    /// Cancel, or Start again: core decides what the cook leaves.
    func end() { send(.event(.startAgain(nowS: AppClock.nowS))) }

    /// A correction committed (`InHand`): the start and the choices replaced,
    /// two steps, the start first.
    func correct(choices: CookChoices, startedAtS: Double?) {
        let now = AppClock.nowS
        if let s = startedAtS { send(.event(.correctStart(nowS: now, startedAtS: s))) }
        send(.event(.correct(nowS: now, choices: choices)))
    }

    /// Until every step sent so far has been taken, and everything they
    /// asked to be built has landed and been stepped in: a correction just
    /// committed is then the cook's, planned on its own pot's surface, before
    /// what follows reads it.
    func caughtUp() async {
        await stepping?.value
        while !surfaces.idle {
            await withCheckedContinuation { landing.append($0) }
            await stepping?.value
        }
    }

    /// An answer at Done. An egg too old takes none: core ends it first.
    func answer(yolk: YolkWord?, white: WhiteReport?, probe: ProbeReading?) {
        guard running != nil else { return }
        send(.event(.answered(nowS: AppClock.nowS, yolkWord: yolk, white: white, probe: probe)))
    }

    /// Looked at again (back in the foreground): the clock decides what is
    /// due, a cook too old ended among it.
    func lookAgain() {
        guard running != nil else { return }
        send(.event(.tick(nowS: AppClock.nowS)))
    }

    /// The cooking with a probe setting changed: the cooling's alarm, if it
    /// is still to come, asks for the reading or not.
    func probeSettingChanged() {
        guard phase != .done else { return }
        alarms.again()
    }

    /// A plan of `hand`, the cook as a change in hand would make it, for its
    /// preview: on the surfaces built, the lean as it stands. Stores nothing
    /// and rings nothing.
    func previewPlan(_ hand: RunningCook, nowS: Double) async -> CookPlan {
        let c = planner.calibration
        let surface = surfaceFor(surfaces.all(c), plan?.inputs)
        let lean = state.leanHintS
        return await Task.detached(priority: .userInitiated) {
            replan(hand, c, surface: surface, leanHintS: lean, nowS: nowS)
        }.value
    }

    /// The process gone, for a test: the ticker stops, a change in hand
    /// goes uncommitted with its waits, and the store keeps what it has.
    func killed() {
        ticker?.cancel()
        ticker = nil
        inHand?.end()
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
                if running != nil || isStart(event) { await stepCooks(.event(event)) }
            case .landed:
                if running != nil || !cooks.ending.isEmpty { await stepCooks(.landed(nowS: AppClock.nowS)) }
            }
        }
        stepping = nil
        logIfSettled()
    }

    private func isStart(_ e: CookEvent) -> Bool {
        if case .start = e { true } else { false }
    }

    /// The step of the cooks, with what it shows beside the cook on screen,
    /// made off the main actor.
    private struct Made: Sendable {
        let step: CooksStep
        let outcome: Outcome?
        let ran: Solution?
    }

    private nonisolated static func made(_ q: Cooks, _ move: Move, _ env: CooksEnv) -> Made {
        switch move {
        case let .event(event): shown(cooksStep(q, event, env), env)
        case let .landed(nowS): shown(cooksLanded(q, nowS: nowS, env), env)
        }
    }

    /// What the cook on screen shows beside it, as `s` leaves it.
    private nonisolated static func shown(_ s: CooksStep, _ env: CooksEnv) -> Made {
        guard let cook = s.cooks.screen.cook, let p = s.cooks.screen.plan else {
            return Made(step: s, outcome: nil, ran: nil)
        }
        var outcome: Outcome?
        if let d = p.decided, let surface = surfaceFor(env.surfaces, p.inputs) {
            outcome = p.cookTimeS == d.solution.result.cookTimeS
                ? d.outcome
                : predictOutcome(env.calibration.posterior, surface.grid, p.cookTimeS, logYolkTarget(p.answer.level))
        }
        let ran = asRanShown(cook, plan: p).map { solutionAsRan(p, ran: $0) }
        return Made(step: s, outcome: outcome, ran: ran)
    }

    /// What the app holds for a step of its cooks, and of `stored` if one is
    /// picked back up: each cook's calibration before its egg, and the local
    /// day it started.
    private func env(nowS: Double, also stored: RunningCook? = nil) -> CooksEnv {
        let c = planner.calibration
        let held = cooksWaiting(cooks).map(\.cook) + (stored.map { [$0] } ?? [])
        return CooksEnv(
            calibration: c, surfaces: surfaces.all(c), app: .ios, appVersion: AppClock.mark(Calibrations.appVersion),
            prior: Calibrations.population.id, day: localDay(nowS),
            at: held.map { CookAt(idMs: $0.idMs, before: surfaces.before[$0.idMs], day: localDay($0.startedAtS)) }
        )
    }

    /// The record's context for `cook`: one cook at a time here, so no `id`.
    private func context(_ cook: RunningCook) -> RecordContext {
        RecordContext(
            app: .ios, appVersion: AppClock.mark(Calibrations.appVersion), prior: Calibrations.population.id,
            day: localDay(cook.startedAtS), id: nil
        )
    }

    /// The cooks stepped with `move`, off the main actor, and the step taken.
    private func stepCooks(_ move: Move) async {
        let was = cooks
        let env = env(nowS: move.nowS)
        let made = await Task.detached(priority: .userInitiated) { Self.made(was, move, env) }.value
        take(made, was: was, move: move)
    }

    /// A step of the cooks taken: the cooks, what the one on screen shows,
    /// the effects, and what each waits for. A cook that has left the screen
    /// (logged and forgotten, or ended with its record still to make,
    /// waiting) takes its ticker, ring and card with it.
    private func take(_ made: Made, was: Cooks, move: Move) {
        let s = made.step
        let left = was.screen.cook != nil && s.cooks.screen.cook == nil
        let started = was.screen.cook == nil && s.cooks.screen.cook != nil
        if left { leave() }
        cooks = s.cooks
        if running != nil {
            if let o = made.outcome { outcome = o }
            ranSolution = made.ran
            if let p = plan, p.decided != nil {
                heldCertainty = p.certainty
                heldProfile = surfaceFor(surfaces.all(planner.calibration), p.inputs)?.profile
            }
        }
        perform(s.effects)
        if running != nil { CookLog.plan(state, effects: s.effects, was: was.screen, event: move.event) }
        if left {
            // The idle screen solved again: a new nudge, and a pan the cook
            // timed remembered.
            planner.redrawNudge()
            planner.refresh()
        }
        keepBefore()
        follow()
        if started, let cook = running { begin(cook) }
        if running != nil { card.push(running, plan, atS: AppClock.nowS) }
    }

    /// What core asks of the app, each for the cook it names, handed on.
    ///
    /// The alarms and the ring are the screen's: core tags them so, and
    /// drops those of a cook off it.
    private func perform(_ effects: [CooksEffect]) {
        for t in effects {
            switch t.effect {
            case .persist:
                persist(t.idMs, ended: t.ended)
            case let .alarms(pullS, cooledS):
                if t.onScreen { alarms.plan(pullS: pullS, cooledS: cooledS) }
            case let .ring(deadline):
                if t.onScreen, let plan { alarms.ring(deadline, plan.deadlines) }
            case .silence:
                if t.onScreen { alarms.silence() }
            case let .rememberBoil(boil):
                planner.rememberBoil(boil)
            case let .log(record, replaces):
                planner.learner.logRecord(record, replaces: replaces)
            case .forget:
                Self.forgetStored(idMs: t.idMs)
            case .sendFinal:
                Services.sharing.sendFinal()
            }
        }
    }

    /// What each cook waits for, asked for.
    private func follow() {
        for w in cooksWaiting(cooks) { ask(w.need, for: w.cook) }
    }

    private func ask(_ need: CookNeed, for cook: RunningCook) {
        if let inputs = need.surface { surfaces.build(inputs, on: planner.calibration) }
        if need.before {
            surfaces.buildBefore(
                cook.idMs, logged: answersLogged(cook) != nil ? planner.kept.log.indices.last : nil, from: learned
            )
        }
        guard let inputs = need.beforeSurface, surfaces.before[cook.idMs] != nil else { return }
        surfaces.buildBefore(cook.idMs, surface: inputs)
    }

    /// The calibrations before an egg still wanted (core's `beforeWanted`).
    private func keepBefore() {
        surfaces.keep(Set(beforeWanted(cooks)))
    }

    // MARK: - On and off the screen

    /// A cook begun on screen, started or picked back up: its controls show
    /// its own choices, and the alarms are asked for, set, read back, and
    /// the card started.
    private func begin(_ cook: RunningCook, restored: Bool = false) {
        planner.adopt(cook.choices)
        inHand?.begin()
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
            if restored { DebugLog.log(.restored) }
        }
    }

    /// The cook has left the screen (ended, or gone): its ticker, ring and
    /// card go, and the controls answer to the idle screen again.
    private func leave() {
        // While the cook is still here, so a level only previewed after the
        // pull goes back to its own.
        inHand?.end()
        outcome = nil
        heldCertainty = nil
        heldProfile = nil
        ranSolution = nil
        alarms.reset()
        card.reset()
        ticker?.cancel()
        ticker = nil
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
            #if DEBUG
            ticks &+= 1
            #endif
        }
        // Stepped only when the clock has something to decide (core's
        // `tickDue`, which the step asks too).
        if let cook = running, let plan, tickDue(cook, plan, nowS: now) { send(.event(.tick(nowS: now))) }
        card.push(running, plan, atS: now)
        return phase(atS: now)
    }

    /// Nothing under way, to the debug log.
    private func logIfSettled() {
        #if DEBUG
        guard isSettled else { return }
        DebugLog.log(.settled)
        #endif
    }

    // MARK: - Surviving a relaunch

    /// What is stored is a `StoredCook` (StoredCook.swift): the
    /// cook, whether its egg has been answered, and the last decided lean.
    /// The alarms are with the system and the card on the Lock Screen, so a
    /// force-quit leaves both counting down: the cook is picked back up to
    /// match them.
    static let savedKey = StoreRegistry.cook.key

    /// A stored cook's data as this app reads it, whole, or nil.
    static func readStored(_ data: Data) -> StoredCook? {
        decodeStamped(StoreRegistry.cook, StoredCook.self, from: data)
    }

    /// The cook `idMs` written down as the cooks now hold it, with the lean
    /// beside it; one ended only over its own stored copy, so that it never
    /// takes the place of a newer cook's, which a relaunch would then lose.
    private func persist(_ idMs: Double, ended: Bool) {
        let held = cooks.screen.cook?.idMs == idMs ? cooks.screen : cooks.ending.first { $0.cook?.idMs == idMs }?.state
        guard let held, let cook = held.cook else { return }
        if ended {
            guard let data = Stores.store.data(forKey: Self.savedKey), Self.readStored(data)?.cook.idMs == idMs else {
                return
            }
        }
        write(cook, leanHintS: held.leanHintS)
    }

    private func write(_ cook: RunningCook, leanHintS: Double) {
        let stored = StoredCook(cook: cook, answers: answered(cook) ? .beforeReload : .unanswered, leanHintS: leanHintS)
        if let data = try? encodeStamped(StoreRegistry.cook, stored) {
            Stores.set(data, forKey: Self.savedKey)
            DebugLog.log(.stored(value: DebugLog.Encoded(value: Stamped(StoreRegistry.cook, stored))))
        }
    }

    /// The stored cook forgotten, unless another cook is stored now.
    static func forgetStored(idMs: Double) {
        if let data = Stores.store.data(forKey: savedKey), let stored = readStored(data),
           stored.cook.idMs != idMs { return }
        Stores.remove(savedKey)
        DebugLog.log(.stored(value: nil))
    }

    /// Pick up the cook stored when the app was last closed: a tick of it
    /// with no plan yet, stepped here on the main actor before the screen's
    /// first answer, so a relaunch never shows idle over a running cook. The
    /// clock writes what it decided while the app was away; one too old ends
    /// as Start again ends it. Called by the view, not from `init`.
    func restore() {
        guard running == nil, cooks.ending.isEmpty else { return }
        guard let data = Stores.store.data(forKey: Self.savedKey) else { return }
        // A cook this build cannot read whole is dropped, with what timed it.
        guard let stored = Self.readStored(data) else {
            Stores.remove(Self.savedKey)
            Services.alarm.cancel()
            card.endAll()
            return
        }
        let cook = stored.cook
        let now = AppClock.nowS
        let was = cooks
        let env = env(nowS: now, also: cook)
        let made = Self.shown(cooksRestore(was, CookStored(cook: cook, leanHintS: stored.leanHintS), nowS: now, env), env)
        let s = made.step
        cooks = s.cooks
        guard let after = running else {
            DebugLog.log(.restoreTooOld)
            // Its alarms and its card are this cook's, and there is nothing
            // left for them to time; an ended cook waits for its record.
            card.endAll()
            perform(s.effects)
            follow()
            return
        }
        DebugLog.log(.restore(
            phase: plan.map { phaseAt($0.deadlines, nowS: now).rawValue } ?? Phase.idle.rawValue,
            eventsWritten: after.events != cook.events
        ))
        if let o = made.outcome { outcome = o }
        ranSolution = made.ran
        if let plan, plan.decided != nil { heldCertainty = plan.certainty }
        // Written down whatever the clock decided, so the store holds what
        // this launch picked up.
        write(after, leanHintS: state.leanHintS)
        perform(s.effects.filter { $0.effect != .persist })
        CookLog.plan(
            state, effects: s.effects, was: CookState(cook: cook, plan: nil, leanHintS: stored.leanHintS),
            event: .tick(nowS: now)
        )
        follow()
        begin(after, restored: true)
    }
}
