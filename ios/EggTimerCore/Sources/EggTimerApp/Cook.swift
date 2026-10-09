import Foundation
import Observation
import EggTimerCore
import EggTimerShared

/// A cook in progress, as an effect runner over core's `step` (Step.swift):
/// each thing that happens to the cook is an event, `step` returns the cook
/// as it now stands, its plan, what it waits for (`need`) and what the app
/// must do (`effects`), and this does it - writes the cook down, holds the
/// alarms the plan sets, rings where no notification already rang, stops a
/// ring, remembers the boil, logs the egg's record, forgets the cook and
/// sends what is final - builds what the cook waits for (its pot's surface,
/// the calibration before this egg and a surface on it) off the main actor,
/// and keeps the Lock Screen card with the plan. The screens draw from the
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
    /// The calibration before a cook's egg and the surfaces built on it, by
    /// the cook's id: what a record corrected after the pull is planned on.
    /// Kept while the cook's plan as it ran is stale.
    private var before: [Double: CookBefore] = [:]
    /// The surfaces built for cooks, by `inputsKey`, and their odds by
    /// `DecisionGrids.profileKey`: what each step is handed.
    private var grids: [String: (inputs: DecisionInputs, grid: DoseGrid)] = [:]
    private var profiles: [String: OddsProfile] = [:]
    /// What is being built, by what it is for, so each is asked for once.
    private var building: Set<String> = []

    /// What the plan shows beside the cook, on its pot's surface: what the
    /// egg at the plan's time will be like; how sure I am of it and the odds
    /// at every level, held while a new pot's surface is built; and the solve
    /// as the cook ran once the egg is out (`solutionAsRan`), so Done never
    /// reads a posterior that has folded this egg's answer.
    public private(set) var outcome: Outcome?
    public private(set) var heldCertainty: CertaintyReading?
    public private(set) var heldProfile: OddsProfile?
    public private(set) var ranSolution: Solution?

    /// Whether alarms may be set: nil until asked and answered, so the
    /// screen never says there is no permission while the prompt is up.
    public private(set) var alarmAuthorized: Bool?
    /// Alarms the system says it holds for this cook, read back, never
    /// assumed: an egg timer that claims an alarm it has not got is worse
    /// than one with none.
    public private(set) var pendingAlarms = 0
    /// The alarms the plan sets (core's `alarms` effect), epoch s.
    private var alarms: (pullS: Double?, cooledS: Double?) = (nil, nil)
    /// The moment each deadline's notification was asked for, and the
    /// deadlines a notification holds, from the read-back: one delivered
    /// is no longer pending but did its job, so a past one stays. A ring
    /// for a deadline held here is the notification's, not the app's.
    private var notifiedAt: [RingDeadline: Double] = [:]
    private var alarmCovers: Set<RingDeadline> = []

    /// An ended cook whose record could not be made again, left stored for
    /// the next launch to make: its egg is not final until then, or until a
    /// new cook is stored over it.
    private var unremade = false

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
    @ObservationIgnored private var pushed: CookActivity.ContentState?
    @ObservationIgnored private var activityFinished = false
    /// The last Live Activity call; each waits for it, so the calls reach
    /// ActivityKit in the order made.
    @ObservationIgnored private var activityCalls: Task<Void, Never>?

    public init(planner: Planner, edits: Edits? = nil) {
        self.planner = planner
        self.edits = edits
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
        let inputs = decisionInputs(c, egg: pot.egg, setup: pot.setup)
        if let grid = await Services.grids.cached(inputs) {
            grids[inputsKey(inputs)] = (inputs, grid)
            if let p = await Services.grids.cachedProfile(inputs, c) { profiles[DecisionGrids.profileKey(inputs, c)] = p }
        }
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
        guard alarmAuthorized == true, phase != .done else { return }
        scheduleAlarms()
    }

    /// A plan of `hand`, the cook as a change in hand would make it, for its
    /// preview: on the surfaces built, the lean as it stands. Stores nothing
    /// and rings nothing.
    public func previewPlan(_ hand: RunningCook, nowS: Double) async -> CookPlan {
        let c = planner.calibration
        let surface = surfaceFor(surfaces(c), plan?.inputs)
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
        #if DEBUG
        logIfSettled()
        #endif
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
            calibration: c, surfaces: surfaces(c), before: cook.flatMap { before[$0.idMs] }, app: .ios,
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

    /// The surfaces built, with their odds on `c` where they are in.
    private func surfaces(_ c: Calibration) -> [CookSurface] {
        grids.values.map {
            CookSurface(inputs: $0.inputs, grid: $0.grid, profile: profiles[DecisionGrids.profileKey($0.inputs, c)])
        }
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
            #if DEBUG
            if asRanStale(cook), s.cook.map(asRanStale) != true { Screenshots.log(.asRanRemade) }
            #endif
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
            heldProfile = surfaceFor(surfaces(planner.calibration), p.inputs)?.profile
        }
        if started { unremade = false }
        perform(s.effects, for: cook, after: cook, leanHintS: s.leanHintS, onScreen: true)
        #if DEBUG
        logPlan(s, was: was, event: event)
        if let w = was.cook, asRanStale(w), !asRanStale(cook) { Screenshots.log(.asRanCorrected) }
        if case .answered = event, answerHeld(cook) { Screenshots.log(.answerHeld) }
        if let w = was.cook, answerHeld(w), !answerHeld(cook) { Screenshots.log(.answerHeldMade) }
        #endif
        keepBefore()
        follow()
        if started { begin(cook) }
        pushActivity(atS: AppClock.nowS)
    }

    /// Whether an answer is in the cook's log that its record does not hold
    /// yet: held for the surface, or for the record made again.
    private func answerHeld(_ cook: RunningCook) -> Bool {
        let answered = cook.log.lastIndex { $0.kind == "answered" } ?? -1
        let logged = cook.log.lastIndex { $0.kind == "logged" } ?? -1
        return answered > logged
    }

    /// Whether a cook's plan as it ran waits to be made again for a
    /// correction after the pull.
    private func asRanStale(_ cook: RunningCook) -> Bool {
        cook.events.pulled != nil && cook.asRan != nil && !asRanCurrent(cook)
    }

    /// What core asks of the app, for `cook` (`after`, the cook as the step
    /// left it, nil when it is gone).
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
                guard onScreen else { break }
                alarms = (pullS, cooledS)
                if alarmAuthorized == true || running == nil { scheduleAlarms() }
            case let .ring(deadline):
                if onScreen { ring(deadline) }
            case .silence:
                if onScreen { Services.ringer.stop() }
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
        if let inputs = need.surface { buildSurface(inputs) }
        if need.before { buildBefore(cook, ended: ended) }
        if let inputs = need.beforeSurface { buildBeforeSurface(cook.idMs, inputs, ended: ended) }
    }

    /// The calibrations before an egg still wanted: a cook's whose plan as it
    /// ran is stale.
    private func keepBefore() {
        let stale = Set(([state] + ending.map(\.state)).compactMap { $0.cook }.filter(asRanStale).map(\.idMs))
        before = before.filter { stale.contains($0.key) }
    }

    /// A pot's surface and its odds on the calibration as it stands, built
    /// off the main actor; the cooks stepped as each lands.
    private func buildSurface(_ inputs: DecisionInputs) {
        let key = "surface|\(inputsKey(inputs))"
        guard !building.contains(key) else { return }
        building.insert(key)
        let c = planner.calibration
        Task {
            let grid = await Services.grids.grid(inputs)
            grids[inputsKey(inputs)] = (inputs, grid)
            if let p = await Services.grids.cachedProfile(inputs, c) {
                profiles[DecisionGrids.profileKey(inputs, c)] = p
            } else {
                send(.landed)
                profiles[DecisionGrids.profileKey(inputs, c)] = await Services.grids.profile(inputs, c)
            }
            building.remove(key)
            send(.landed)
        }
    }

    /// The calibration before the egg of `cook`: the one held before it was
    /// folded, or the log replayed up to it (`Planner.calibrationBefore`).
    private func buildBefore(_ cook: RunningCook, ended: Bool) {
        #if DEBUG
        // `-uiHoldAsRan YES`: never made while the cook runs in this launch.
        if Screenshots.holdAsRan, !ended { return }
        #endif
        let key = "before|\(cook.idMs)"
        guard !building.contains(key), before[cook.idMs] == nil else { return }
        building.insert(key)
        let logged = answersLogged(cook) != nil ? planner.kept.log.indices.last : nil
        Task {
            let c = await planner.learner.calibrationBefore(logged)
            before[cook.idMs] = CookBefore(calibration: c, surfaces: [])
            building.remove(key)
            send(.landed)
        }
    }

    /// The surface and its odds for `inputs` on the calibration before the
    /// egg of the cook `id`.
    private func buildBeforeSurface(_ id: Double, _ inputs: DecisionInputs, ended: Bool) {
        guard let held = before[id] else { return }
        #if DEBUG
        // `-uiFailRemake YES`: an ended cook's record is never made again in
        // this launch; the cook stays stored for the next.
        if Screenshots.failRemake, ended {
            ending.removeAll { $0.state.cook?.idMs == id }
            unremade = true
            Screenshots.log(.asRanNotRemade)
            return
        }
        #endif
        let key = "beforeSurface|\(id)|\(inputsKey(inputs))"
        guard !building.contains(key) else { return }
        building.insert(key)
        let c = held.calibration
        Task {
            let grid = await Services.grids.grid(inputs)
            let profile = await Services.grids.profile(inputs, c)
            building.remove(key)
            if var now = before[id] {
                now.surfaces.append(CookSurface(inputs: inputs, grid: grid, profile: profile))
                before[id] = now
            }
            send(.landed)
        }
    }

    // MARK: - On and off the screen

    /// A cook begun on screen, started or picked back up: its controls show
    /// its own choices, and the alarms are asked for, set, read back, and
    /// the card started.
    private func begin(_ cook: RunningCook, restored: Bool = false) {
        planner.adopt(cook.choices)
        edits?.begin()
        startTicking()
        #if DEBUG
        busy += 1
        #endif
        Task {
            #if DEBUG
            defer { busy -= 1; logIfSettled() }
            #endif
            let authorized = await Services.alarm.authorize()
            guard running?.idMs == cook.idMs else { return }
            alarmAuthorized = authorized
            if authorized { scheduleAlarms() }
            await readBackAlarms()
            guard running?.idMs == cook.idMs else { return }
            // The card as it stands once the alarms are asked for, which can
            // take a prompt's seconds; none for a cook already Done.
            let now = AppClock.nowS
            if phase(atS: now) != .done, let s = activityState(atS: now) {
                #if DEBUG
                Self.logCard("start", s)
                #endif
                await activity { await Services.card.start(CookActivity(lang: cook.lang), state: s) }.value
                guard running?.idMs == cook.idMs else { return }
                pushed = s
            }
            #if DEBUG
            if restored { Screenshots.log(.restored) }
            #endif
        }
    }

    /// The cook has left the screen (ended, or gone): its ticker, ring and
    /// card go, and the controls answer to the idle screen again.
    private func leave() {
        #if DEBUG
        Screenshots.log(.cookEnded)
        #endif
        state = CookState(cook: nil, plan: nil, leanHintS: 0)
        need = nil
        outcome = nil
        heldCertainty = nil
        heldProfile = nil
        ranSolution = nil
        alarmAuthorized = nil
        pendingAlarms = 0
        notifiedAt = [:]
        alarmCovers = []
        pushed = nil
        activityFinished = false
        ticker?.cancel()
        ticker = nil
        Services.ringer.stop()
        activity { await Services.card.endAll() }
        edits?.end()
    }

    // MARK: - The alarms and the ring

    /// The alarms the plan sets, with the system: none for an end that has
    /// passed, and nothing while the plan asks whether the egg is still in.
    private func scheduleAlarms() {
        let (pullS, cooledS) = alarms
        let now = AppClock.nowS
        // A deadline past and not moved keeps what covered it: its
        // notification has been delivered.
        alarmCovers = alarmCovers.filter { d in
            guard let at = d == .pull ? pullS : cooledS, let asked = notifiedAt[d] else { return false }
            return at <= now && abs(asked - at) < 1e-3
        }
        guard pullS != nil || cooledS != nil, let cook = running else {
            notifiedAt = [:]
            Services.alarm.cancel()
            return
        }
        notifiedAt = notifiedAt.filter { alarmCovers.contains($0.key) }
        if let p = pullS, p > now { notifiedAt[.pull] = p }
        if let c = cooledS, c > now { notifiedAt[.cooled] = c }
        Services.alarm.schedule(pullS: pullS, cooledS: cooledS, probe: asksForProbe, cooling: cook.choices.cooling)
        Task { await readBackAlarms() }
    }

    /// Ask the system what it is holding, rather than assuming.
    private func readBackAlarms() async {
        #if DEBUG
        busy += 1
        defer { busy -= 1; logIfSettled() }
        #endif
        let id = running?.idMs
        let held = await Services.alarm.pendingDeadlines()
        guard running?.idMs == id else { return }
        pendingAlarms = held.count
        let now = AppClock.nowS
        // One delivered is no longer pending, and stays.
        alarmCovers = held.union(alarmCovers.filter { d in notifiedAt[d].map { $0 <= now } ?? false })
    }

    /// A deadline the step says rings: rung in the app unless its
    /// notification holds it, and only for one that came while the app was
    /// on screen, where someone could hear it in time (`deadlineToRing`).
    private func ring(_ deadline: RingDeadline) {
        guard let plan else { return }
        let d = plan.deadlines
        let now = AppClock.nowS
        // Held by a notification only if it was asked for this moment: a
        // correction that moved the deadline is not covered by the old one.
        let held = alarmCovers.filter { c in
            notifiedAt[c].map { abs($0 - (c == .pull ? d.cookEndS : d.coolEndS ?? .nan)) < 1e-3 } ?? false
        }
        guard deadlineToRing(
            phase: deadline == .pull ? .pull : .done, nowS: now, pullS: d.cookEndS, cooledS: d.coolEndS,
            authorized: alarmAuthorized, scheduled: held, rung: [],
            onScreenSinceS: Services.ringer.onScreenSinceS
        ) == deadline else { return }
        #if DEBUG
        Screenshots.log(.ring(deadline: deadline.rawValue))
        #endif
        Services.ringer.ring(deadline)
    }

    // MARK: - The ticker

    private func startTicking() {
        Services.ringer.activate()
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
        #if DEBUG
        defer {
            logPhase(atS: now)
            ticks &+= 1
        }
        #endif
        // Stepped only when the clock has something to decide (core's
        // `tickDue`, which the step asks too).
        if let cook = running, let plan, tickDue(cook, plan, nowS: now) { send(.event(.tick(nowS: now))) }
        pushActivity(atS: now)
        return phase(atS: now)
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
        if Stores.takeRetiredCook() { activity { await Services.card.endAtTheirEnds() } }
        guard let data = Stores.store.data(forKey: Self.savedKey) else { return }
        // A cook this build cannot read whole is dropped, with what timed it.
        guard let stored = try? JSONDecoder().decode(Stored.self, from: data),
              let cook = readRunningCook(stored.cook.jsonObject) else {
            Stores.remove(Self.savedKey)
            #if DEBUG
            Screenshots.log(.restoreUnreadable)
            #endif
            Services.alarm.cancel()
            activity { await Services.card.endAll() }
            return
        }
        let now = AppClock.nowS
        let was = CookState(cook: cook, plan: nil, leanHintS: stored.leanHintS)
        let made = Self.made(was, .tick(nowS: now), env(for: cook, nowS: now))
        let s = made.step
        guard let after = s.cook, endedAtS(after) == nil else {
            #if DEBUG
            Screenshots.log(.restoreTooOld)
            #endif
            // Its alarms and its card are this cook's, and there is nothing
            // left for them to time; an ended cook waits for its record.
            activity { await Services.card.endAll() }
            if s.cook != nil { ending.append(Ending(state: s.state, need: s.need)) }
            perform(s.effects, for: cook, after: s.cook, leanHintS: s.leanHintS, onScreen: true)
            follow()
            return
        }
        #if DEBUG
        let p = s.plan.map { phaseAt($0.deadlines, nowS: now).rawValue } ?? Phase.idle.rawValue
        Screenshots.log(.restore(phase: p, eventsWritten: after.events != cook.events))
        #endif
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
        #if DEBUG
        logPlan(s, was: was, event: .tick(nowS: now))
        #endif
        follow()
        begin(after, restored: true)
    }

    // MARK: - Live Activity

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

    /// The card's description of this cook, as it ran once the egg is out.
    private static func description(_ cook: RunningCook, _ plan: CookPlan) -> CookActivity.Description {
        let ran = asRanShown(cook, plan: plan)
        return CookActivity.Description(
            doneness: tr(anchorNear(ran?.level ?? plan.answer.level).key, in: cook.lang),
            peakYolk: showIn(cook.units, .temperature, ran?.peakYolkC ?? plan.solution.result.peakYolkC),
            eggMass: showIn(cook.units, .mass, plan.egg.massKg * 1000),
            cooling: cook.choices.cooling.rawValue
        )
    }

    /// What the Lock Screen shows, its dates on the system's clock
    /// (`AppClock.real`), so the system counts it down on its own.
    private func activityState(atS now: Double) -> CookActivity.ContentState? {
        guard var s = cardState(atS: now) else { return nil }
        s.began = AppClock.real(s.began)
        s.ends = AppClock.real(s.ends)
        return s
    }

    /// The card's state in cook time.
    private func cardState(atS now: Double) -> CookActivity.ContentState? {
        guard let running, let plan else { return nil }
        let at = { (s: Double) in Date(timeIntervalSince1970: s) }
        let d = plan.deadlines
        let cook = Self.description(running, plan)
        let phase = phase(atS: now)
        // While the plan asks whether the eggs are still in the water: the
        // pull, "now", until it is answered or the cook is too old.
        if asksIfStillIn(plan), phase != .idle {
            return .init(stage: .pull, began: at(d.cookEndS), ends: at(plan.tooOldAtS), provisional: false, cook: cook)
        }
        switch phase {
        case .idle, .done:
            return nil
        case .heating where guessLengthened(plan):
            // The time heated, counting up to when the guess gives out.
            return .init(
                stage: .heating, began: at(running.startedAtS), ends: at(plan.tooOldAtS), provisional: true,
                countsUp: true, cook: cook
            )
        case .heating:
            return .init(stage: .heating, began: at(running.startedAtS), ends: at(d.cookEndS), provisional: true, cook: cook)
        case .cooking:
            return .init(stage: .cooking, began: at(running.startedAtS), ends: at(d.cookEndS), provisional: false, cook: cook)
        case .pull:
            return .init(
                stage: .pull, began: at(d.cookEndS), ends: at(d.cookEndS + pullGraceSeconds), provisional: false, cook: cook
            )
        case .cooling:
            let from = running.events.pulled?.outS ?? d.cookEndS + pullGraceSeconds
            return .init(stage: .cooling, began: at(from), ends: at(d.coolEndS ?? from), provisional: false, cook: cook)
        }
    }

    /// Pushed only when what the card shows changed; at Done ended, once.
    private func pushActivity(atS now: Double) {
        if running != nil, phase(atS: now) == .done {
            guard !activityFinished else { return }
            activityFinished = true
            #if DEBUG
            Screenshots.log(.activityEnd)
            #endif
            activity { await Services.card.endAll() }
            return
        }
        guard let s = activityState(atS: now), s != pushed else { return }
        pushed = s
        #if DEBUG
        Self.logCard("update", s)
        #endif
        activity { await Services.card.update(s) }
    }

    #if DEBUG
    // MARK: - The debug log

    @ObservationIgnored private var loggedPhase: Phase?
    /// Starts, restores and alarm read-backs under way.
    @ObservationIgnored private var busy = 0
    /// Ticks taken, and whether the ticker runs: a step's `idle` waits for a
    /// tick at its moment (`Screenshots.idle(after:)`).
    @ObservationIgnored public private(set) var ticks = 0
    public var ticking: Bool { ticker != nil }

    /// Nothing under way: no step, nothing being built, no start, restore or
    /// read-back.
    public var isSettled: Bool { stepping == nil && jobs.isEmpty && building.isEmpty && busy == 0 }

    private func logIfSettled() {
        guard isSettled else { return }
        Screenshots.log(.settled)
    }

    private func logPhase(atS now: Double) {
        let phase = phase(atS: now)
        guard phase != loggedPhase else { return }
        loggedPhase = phase
        Screenshots.log(.phase(phase: phase.rawValue))
        logIfSettled()
    }

    /// A plan made, to the debug log: any step but a tick that decided
    /// nothing, which keeps the plan it had.
    private func logPlan(_ s: CookStep, was: CookState, event: CookEvent) {
        guard let next = s.plan else { return }
        if case .tick = event, was.plan != nil, s.effects.isEmpty, s.cook == was.cook { return }
        Screenshots.log(.plan(
            pull: next.deadlines.cookEndS, cooled: next.deadlines.coolEndS, lengthened: guessLengthened(next),
            surface: next.decided != nil, next: next.slowHobAtS, asking: asksIfStillIn(next), overdue: next.overdue
        ))
        Screenshots.log(.verdict(
            kind: "\(next.answer.verdict.kind)", whiteSets: next.solution.whiteSets, cookS: next.cookTimeS
        ))
        Screenshots.log(.shown(peak: shownPeakYolkC, level: shownLevel, plannedPeak: next.solution.result.peakYolkC))
    }

    private static func logCard(_ what: String, _ s: CookActivity.ContentState) {
        Screenshots.log(.activity(
            what: what, stage: s.stage.rawValue, ends: Int(AppClock.fromReal(s.ends).timeIntervalSince1970.rounded()),
            up: s.countsUp, cook: [s.cook.doneness, s.cook.peakYolk, s.cook.eggMass, s.cook.cooling]
        ))
    }
    #endif
}
