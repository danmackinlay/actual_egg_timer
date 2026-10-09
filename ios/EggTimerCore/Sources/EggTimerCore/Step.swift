import Foundation

/// The running cook as one state machine: `step` takes a cook, one thing that
/// happened to it, and what the app holds, and returns the cook as it now
/// stands, its plan, what it is waiting for, and what the app must do.
///
/// Transliterated from `src/core/step.ts`, whose comments say what each part
/// is for and what a step does, and held to it by the traces in
/// `fixtures/step.json`. Pure: times are the events' own, epoch seconds.

/// What happened to the cook, at `nowS`. Cancel is `startAgain`. A relaunch
/// is a `tick` on a stored cook with no plan yet.
public enum CookEvent: Sendable {
    case start(
        nowS: Double, choices: CookChoices, nudgeS: Double, boilMemory: BoilMemory, units: Units, lang: String,
        leanHintS: Double
    )
    case boil(nowS: Double)
    case correct(nowS: Double, choices: CookChoices)
    case correctStart(nowS: Double, startedAtS: Double)
    case out(nowS: Double)
    case stillIn(nowS: Double)
    case pullStands(nowS: Double)
    case tick(nowS: Double)
    case surfaceLanded(nowS: Double)
    case answered(nowS: Double, yolkWord: YolkWord?, white: WhiteReport?, probe: ProbeReading?)
    case startAgain(nowS: Double)

    /// When it happened.
    public var nowS: Double {
        switch self {
        case let .start(now, _, _, _, _, _, _), let .boil(now), let .correct(now, _), let .correctStart(now, _),
             let .out(now), let .stillIn(now), let .pullStands(now), let .tick(now), let .surfaceLanded(now),
             let .answered(now, _, _, _), let .startAgain(now):
            now
        }
    }
}

/// What the app keeps between steps, and stores (the cook and the lean).
public struct CookState: Sendable {
    /// The running cook, or one ended whose egg is not yet logged; nil while
    /// idle.
    public var cook: RunningCook?
    /// Its plan, as the last step made it; nil before the first.
    public var plan: CookPlan?
    /// The lean last decided, s: a cache, never truth.
    public var leanHintS: Double

    public init(cook: RunningCook?, plan: CookPlan?, leanHintS: Double) {
        self.cook = cook
        self.plan = plan
        self.leanHintS = leanHintS
    }
}

/// The calibration before this egg, and the surfaces built on it.
public struct CookBefore: Sendable {
    public var calibration: Calibration
    public var surfaces: [CookSurface]

    public init(calibration: Calibration, surfaces: [CookSurface]) {
        self.calibration = calibration
        self.surfaces = surfaces
    }
}

/// What the app holds for a step.
public struct CookEnv: Sendable {
    public var calibration: Calibration
    public var surfaces: [CookSurface]
    public var before: CookBefore?
    public var app: AppName
    public var appVersion: String
    public var prior: String
    public var day: String

    public init(
        calibration: Calibration, surfaces: [CookSurface], before: CookBefore?, app: AppName, appVersion: String,
        prior: String, day: String
    ) {
        self.calibration = calibration
        self.surfaces = surfaces
        self.before = before
        self.app = app
        self.appVersion = appVersion
        self.prior = prior
        self.day = day
    }
}

/// What the state is waiting for.
public struct CookNeed: Sendable {
    /// The surface the plan's pot wants, with its odds profile.
    public var surface: DecisionInputs?
    /// The calibration before this egg.
    public var before: Bool
    /// The surface on the calibration before this egg for the corrected pot.
    public var beforeSurface: DecisionInputs?
    /// The next moment the clock decides something, or nil.
    public var wakeAtS: Double?

    static let none = CookNeed(surface: nil, before: false, beforeSurface: nil, wakeAtS: nil)
}

/// What the app must do.
public enum CookEffect: Sendable, Equatable {
    /// Write the cook and the lean down.
    case persist
    /// Hold these alarms and no others.
    case alarms(pullS: Double?, cooledS: Double?)
    /// Ring now.
    case ring(RingDeadline)
    /// Stop a ring sounding.
    case silence
    /// Teach the boil memory this pan's time to a rolling boil.
    case rememberBoil(BoilToRemember)
    /// Log the egg's record, in place of any under its id when `replaces`.
    case log(EggRecord, replaces: Bool)
    /// Forget the stored cook: its egg is final.
    case forget
    /// Send what is now final, if sharing is on.
    case sendFinal

    public var kind: String {
        switch self {
        case .persist: "persist"
        case .alarms: "alarms"
        case .ring: "ring"
        case .silence: "silence"
        case .rememberBoil: "rememberBoil"
        case .log: "log"
        case .forget: "forget"
        case .sendFinal: "sendFinal"
        }
    }
}

/// What a step returns: the state to keep, and to hand to the next.
public struct CookStep: Sendable {
    public var cook: RunningCook?
    public var plan: CookPlan?
    public var leanHintS: Double
    public var need: CookNeed
    public var effects: [CookEffect]

    /// The state to hand to the next step.
    public var state: CookState { CookState(cook: cook, plan: plan, leanHintS: leanHintS) }
}

/// The surface in `surfaces` for these inputs, or nil.
public func surfaceFor(_ surfaces: [CookSurface], _ inputs: DecisionInputs?) -> CookSurface? {
    guard let inputs else { return nil }
    let key = inputsKey(inputs)
    return surfaces.first { inputsKey($0.inputs) == key }
}

/// The cook planned at `nowS` on the surface its pot wants, as far as the app
/// has it.
private func planOn(
    _ cook: RunningCook, _ c: Calibration, _ surfaces: [CookSurface], lean: Double, nowS: Double, last: CookPlan?
) -> CookPlan {
    let memo = last?.memo
    var plan = replan(cook, c, surface: surfaceFor(surfaces, last?.inputs), leanHintS: lean, nowS: nowS, memo: memo)
    if plan.inputs != nil, plan.decided == nil, let s = surfaceFor(surfaces, plan.inputs) {
        plan = replan(cook, c, surface: s, leanHintS: lean, nowS: nowS, memo: memo)
    }
    return plan
}

private struct Alarms: Equatable {
    var pullS: Double?
    var cooledS: Double?
}

/// The alarms a cook's plan sets.
private func alarmsOf(_ cook: RunningCook?, _ plan: CookPlan?) -> Alarms {
    guard let cook, let plan, endedAtS(cook) == nil, !asksIfStillIn(plan) else { return Alarms() }
    let e = cook.events
    let d = plan.deadlines
    return Alarms(
        pullS: e.pulled == nil && e.rangAtS == nil ? d.cookEndS : nil,
        cooledS: e.cooledAtS == nil ? d.coolEndS : nil
    )
}

/// Whether the cook is Done by its events.
private func doneByEvents(_ cook: RunningCook) -> Bool {
    cook.events.pulled != nil && (cook.choices.cooling == .counter || cook.events.cooledAtS != nil)
}

/// The next moment the clock decides something for this cook, after `nowS`.
private func wakeAt(_ cook: RunningCook, _ plan: CookPlan, nowS: Double) -> Double? {
    var times = [plan.tooOldAtS]
    if let at = plan.slowHobAtS { times.append(at) }
    let e = cook.events
    let d = plan.deadlines
    if !asksIfStillIn(plan) {
        if !d.provisional, e.pulled == nil {
            if e.rangAtS == nil { times.append(d.cookEndS) }
            times.append(d.cookEndS + pullGraceSeconds)
        }
        if e.cooledAtS == nil, let end = d.coolEndS { times.append(end) }
    }
    return times.filter { $0 > nowS }.min()
}

private func lastIndex(_ cook: RunningCook, _ kind: String) -> Int {
    cook.log.lastIndex { $0.kind == kind } ?? -1
}

/// Whether the egg's record is to be logged now.
private func recordDue(_ cook: RunningCook, unanswered: Bool) -> Bool {
    let logged = lastIndex(cook, "logged")
    if logged < 0 { return answered(cook) || unanswered }
    return lastIndex(cook, "answered") > logged || lastIndex(cook, "ran") > logged
}

/// Whether the plan as it ran is kept but stale.
private func asRanStale(_ cook: RunningCook) -> Bool {
    cook.events.pulled != nil && cook.asRan != nil && !asRanCurrent(cook)
}

/// Where a step has got to.
private struct Work {
    var cook: RunningCook
    var plan: CookPlan
    /// The cook `plan` was made for at this step's moment on these surfaces.
    var plannedFor: RunningCook?
    var lean: Double
    var need = CookNeed.none
    var effects: [CookEffect] = []
}

/// The plan as it ran made again for a correction after the pull, on the
/// calibration before this egg, when it is in; until then, what is wanted.
private func remakeAsRan(_ w: inout Work, _ env: CookEnv, nowS: Double) {
    guard asRanStale(w.cook) else { return }
    guard let before = env.before else {
        w.need.before = true
        return
    }
    let inputs = replan(w.cook, before.calibration, surface: nil, leanHintS: 0, nowS: nowS).inputs
    guard let s = surfaceFor(before.surfaces, inputs),
          let next = asRanCorrected(w.cook, before: before.calibration, surface: s, nowS: nowS) else {
        w.need.beforeSurface = inputs
        return
    }
    w.cook = next
}

/// The egg's record, logged when it is due. Whether nothing is left to log.
@discardableResult
private func logRecord(_ w: inout Work, _ env: CookEnv, nowS: Double, unanswered: Bool) -> Bool {
    remakeAsRan(&w, env, nowS: nowS)
    if asRanStale(w.cook) { return false }
    if !recordDue(w.cook, unanswered: unanswered) { return true }
    let said = answersOf(w.cook)
    let ctx = RecordContext(
        app: env.app, appVersion: env.appVersion, prior: env.prior, day: env.day,
        id: env.app == .web ? Int(w.cook.idMs) : nil
    )
    let made = cookFactsFor(w.cook, plan: w.plan, context: ctx, yolkWord: said.yolkWord, white: said.white, probe: said.probe)
    guard let facts = made.facts else {
        if let inputs = w.plan.inputs { w.need.surface = inputs }
        return false
    }
    w.effects.append(.log(recordFor(facts), replaces: answersLogged(w.cook) != nil))
    w.cook = appendEntry(w.cook, .logged(atS: nowS))
    return true
}

/// Plan the cook, write what the clock decided, keep the plan as it ran.
private func settle(_ w: inout Work, _ env: CookEnv, nowS: Double, last: CookPlan?) {
    var plan = w.plannedFor == w.cook
        ? w.plan : planOn(w.cook, env.calibration, env.surfaces, lean: w.lean, nowS: nowS, last: last)
    if endedAtS(w.cook) == nil {
        let due = eventsDue(w.cook, plan: plan, nowS: nowS)
        if due != w.cook.events {
            w.cook = writeEvents(w.cook, due)
            plan = planOn(w.cook, env.calibration, env.surfaces, lean: w.lean, nowS: nowS, last: plan)
        }
    }
    w.cook = keepAsRan(w.cook, plan: plan)
    w.plan = plan
    w.plannedFor = nil
    if plan.decided != nil { w.lean = plan.leanS }
    if let inputs = plan.inputs, surfaceFor(env.surfaces, inputs)?.profile == nil { w.need.surface = inputs }
}

/// The cook ended at `nowS`.
private func endCook(_ w: inout Work, nowS: Double) {
    let ending = cookEnding(w.cook, plan: w.plan, nowS: nowS)
    if let boil = ending.boil { w.effects.append(.rememberBoil(boil)) }
    w.effects.append(.silence)
    w.cook = appendEntry(w.cook, .ended(atS: nowS))
}

/// An ended cook: its egg logged as it must be, then forgotten. Whether it is.
private func finishEnded(_ w: inout Work, _ env: CookEnv, nowS: Double) -> Bool {
    guard let at = endedAtS(w.cook) else { return false }
    let finished = cookEnding(w.cook, plan: w.plan, nowS: at).finished
    if answersLogged(w.cook) != nil || finished {
        if !logRecord(&w, env, nowS: nowS, unanswered: finished) { return false }
    }
    w.effects.append(.forget)
    w.effects.append(.sendFinal)
    return true
}

/// The state unchanged, with what it still needs.
private func quiet(_ state: CookState, _ env: CookEnv, nowS: Double) -> CookStep {
    guard let cook = state.cook, let plan = state.plan else {
        return CookStep(cook: state.cook, plan: state.plan, leanHintS: state.leanHintS, need: .none, effects: [])
    }
    var need = CookNeed.none
    if let inputs = plan.inputs, surfaceFor(env.surfaces, inputs)?.profile == nil { need.surface = inputs }
    need.wakeAtS = endedAtS(cook) == nil ? wakeAt(cook, plan, nowS: nowS) : nil
    return CookStep(cook: cook, plan: plan, leanHintS: state.leanHintS, need: need, effects: [])
}

/// One step of a cook. See `step` in `src/core/step.ts`.
public func step(_ state: CookState, _ event: CookEvent, _ env: CookEnv) -> CookStep {
    let nowS = event.nowS
    if case let .start(_, choices, nudgeS, boilMemory, units, lang, leanHintS) = event {
        if state.cook != nil { return quiet(state, env, nowS: nowS) }
        let cook = startCook(nowS: nowS, choices: choices, nudgeS: nudgeS, boilMemory: boilMemory, units: units, lang: lang)
        let first = planOn(cook, env.calibration, env.surfaces, lean: leanHintS, nowS: nowS, last: nil)
        let w = Work(cook: cook, plan: first, plannedFor: cook, lean: leanHintS)
        return finish(CookState(cook: nil, plan: nil, leanHintS: leanHintS), w, env, nowS: nowS)
    }
    guard let held = state.cook else { return quiet(state, env, nowS: nowS) }
    let last = state.plan
    let plan = last ?? planOn(held, env.calibration, env.surfaces, lean: state.leanHintS, nowS: nowS, last: nil)
    var w = Work(cook: held, plan: plan, plannedFor: last == nil ? held : nil, lean: state.leanHintS)
    let ended = endedAtS(held) != nil
    let asking = asksIfStillIn(plan)
    let phase = phaseAt(plan.deadlines, nowS: nowS)

    switch event {
    case .start:
        break
    case .tick:
        // Nothing due: the plan stands.
        if let last, ended || (!slowHobDue(last, nowS: nowS) && !cookTooOld(last, nowS: nowS)
            && eventsDue(held, plan: last, nowS: nowS) == held.events) {
            return quiet(state, env, nowS: nowS)
        }
    case .surfaceLanded:
        break
    case .boil:
        if !ended, !asking, phase == .heating { w.cook = withBoil(held, nowS: nowS) }
    case let .correct(_, choices):
        var levelAside = choices
        levelAside.level = held.choices.level
        // After the pull the yolk wanted only previews: a change of it alone
        // corrects nothing.
        if !ended, choices != held.choices, !(held.events.pulled != nil && levelAside == held.choices) {
            w.cook = corrected(held, choices: choices, nowS: nowS)
            // An egg answered about came out: a pull the clock assumed stands.
            if answered(held) { w.cook = pullStands(w.cook) }
        }
    case let .correctStart(_, startedAtS):
        if !ended, startedAtS != held.startedAtS {
            w.cook = startCorrected(held, startedAtS: startedAtS, nowS: nowS) ?? held
            if w.cook != held, answered(held) { w.cook = pullStands(w.cook) }
        }
    case .out:
        if !ended {
            w.cook = withOut(held, plan: plan, nowS: nowS)
            if w.cook != held { w.effects.append(.silence) }
        }
    case .stillIn:
        if !ended, asking { w.cook = stillIn(held, nowS: nowS) }
    case .pullStands:
        if !ended, asking {
            w.cook = pullStands(held)
            w.effects.append(.silence)
        }
    case let .answered(_, yolkWord, white, probe):
        if ended || asking || phase != .done { return quiet(state, env, nowS: nowS) }
        // Each question is answered once: the first word given is the one kept.
        let said = answersOf(held)
        let yolk = said.yolkWord == nil ? yolkWord : nil
        let whiteNew = said.white == nil ? white : nil
        let probeNew = said.probe == nil ? probe : nil
        if yolk == nil, whiteNew == nil, probeNew == nil { return quiet(state, env, nowS: nowS) }
        w.cook = appendEntry(held, .answered(atS: nowS, yolkWord: yolk, white: whiteNew, probe: probeNew))
    case .startAgain:
        if !ended { endCook(&w, nowS: nowS) }
    }
    return finish(state, w, env, nowS: nowS)
}

/// The step's work settled: the plan, the record, the end, the ring and the
/// alarms, and what the cook is waiting for.
private func finish(_ state: CookState, _ work: Work, _ env: CookEnv, nowS: Double) -> CookStep {
    var w = work
    let was = state.cook
    var alarmsBefore: Alarms? = state.plan == nil ? nil : alarmsOf(was, state.plan)
    settle(&w, env, nowS: nowS, last: state.plan ?? w.plan)
    if endedAtS(w.cook) == nil, cookTooOld(w.plan, nowS: nowS) { endCook(&w, nowS: nowS) }

    if endedAtS(w.cook) != nil {
        // Ended: no alarm is left, whatever the record still waits for.
        if alarmsBefore == nil || alarmsBefore != Alarms() { w.effects.append(.alarms(pullS: nil, cooledS: nil)) }
        alarmsBefore = Alarms()
        if finishEnded(&w, env, nowS: nowS) {
            return CookStep(cook: nil, plan: nil, leanHintS: 0, need: .none, effects: w.effects)
        }
    } else {
        // A correction after the pull: the plan as it ran made again on the
        // calibration before this egg, and the record with it if it is logged.
        remakeAsRan(&w, env, nowS: nowS)
        if recordDue(w.cook, unanswered: false) { logRecord(&w, env, nowS: nowS, unanswered: false) }

        // The ring, from what this step wrote.
        let before = was?.events
        let after = w.cook.events
        let asking = asksIfStillIn(w.plan)
        let rangNow = !asking && after.rangAtS != nil && before?.rangAtS != after.rangAtS
            && (after.pulled == nil || after.pulled?.by == .timeout)
        if rangNow { w.effects.append(.ring(.pull)) }
        if !rangNow, !asking, doneByEvents(w.cook), !(was.map(doneByEvents) ?? false) {
            w.effects.append(.ring(.cooled))
        }
        if let before, before.rangAtS != nil, after.rangAtS == nil, after.pulled == nil {
            w.effects.append(.silence)
        }
    }

    let alarms = alarmsOf(w.cook, w.plan)
    if alarmsBefore == nil || alarms != alarmsBefore {
        w.effects.append(.alarms(pullS: alarms.pullS, cooledS: alarms.cooledS))
    }
    let changed = was == nil || w.cook.log.count != was?.log.count || w.lean != state.leanHintS
    if changed { w.effects.insert(.persist, at: 0) }
    var need = w.need
    need.wakeAtS = endedAtS(w.cook) == nil ? wakeAt(w.cook, w.plan, nowS: nowS) : nil
    return CookStep(cook: w.cook, plan: w.plan, leanHintS: w.lean, need: need, effects: w.effects)
}
