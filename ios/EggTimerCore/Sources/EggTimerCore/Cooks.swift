import Foundation

/// The cooks an app holds, over `step` (Step.swift): the one on screen, and
/// those ended whose egg's record is still to be made.
///
/// Transliterated from `src/core/cooks.ts`, whose comments say what each part
/// is for, and held to it by the traces in `fixtures/cooks.json`. Pure.

/// A cook ended before its egg's record could be made, and what it waits for.
public struct EndingCook: Sendable {
    public var cook: RunningCook?
    public var plan: CookPlan?
    public var leanHintS: Double
    public var need: CookNeed

    public init(cook: RunningCook?, plan: CookPlan?, leanHintS: Double, need: CookNeed) {
        self.cook = cook
        self.plan = plan
        self.leanHintS = leanHintS
        self.need = need
    }

    /// The state to hand to its next step.
    public var state: CookState { CookState(cook: cook, plan: plan, leanHintS: leanHintS) }
}

/// The cooks an app holds: the one on screen (its cook nil while idle), what
/// it waits for, and those ended whose record is still to be made.
public struct Cooks: Sendable {
    public var screen: CookState
    public var need: CookNeed
    public var ending: [EndingCook]

    public init(screen: CookState, need: CookNeed, ending: [EndingCook]) {
        self.screen = screen
        self.need = need
        self.ending = ending
    }

    /// No cooks: the screen idle, nothing ending.
    public static let none = Cooks(screen: CookState(cook: nil, plan: nil, leanHintS: 0), need: .none, ending: [])
}

/// What the app holds for one of its cooks: the calibration before its egg,
/// once built, and the local day it started, in the app's time zone.
public struct CookAt: Sendable {
    public var idMs: Double
    public var before: CookBefore?
    public var day: String

    public init(idMs: Double, before: CookBefore?, day: String) {
        self.idMs = idMs
        self.before = before
        self.day = day
    }
}

/// What the app holds for a step of its cooks: `CookEnv`'s, with each cook's
/// own in `at`; `day` is today's, for a cook starting.
public struct CooksEnv: Sendable {
    public var calibration: Calibration
    public var surfaces: [CookSurface]
    public var app: AppName
    public var appVersion: String
    public var prior: String
    public var day: String
    public var at: [CookAt]

    public init(
        calibration: Calibration, surfaces: [CookSurface], app: AppName, appVersion: String, prior: String,
        day: String, at: [CookAt]
    ) {
        self.calibration = calibration
        self.surfaces = surfaces
        self.app = app
        self.appVersion = appVersion
        self.prior = prior
        self.day = day
        self.at = at
    }
}

/// An effect, with whose cook it is: the one on screen (or starting there)
/// when it was stepped, or one ended off it; and whether that cook had ended,
/// or gone, when the step was over.
public struct CooksEffect: Sendable, Equatable, Encodable {
    public var idMs: Double
    public var onScreen: Bool
    public var ended: Bool
    public var effect: CookEffect

    enum CodingKeys: String, CodingKey { case idMs = "id_ms", onScreen, ended, effect }
}

/// The cooks as a step leaves them, and what the app must do.
public struct CooksStep: Sendable {
    public var cooks: Cooks
    public var effects: [CooksEffect]
}

/// A cook as it was stored: what a relaunch picks back up.
public struct CookStored: Sendable {
    public var cook: RunningCook
    public var leanHintS: Double

    public init(cook: RunningCook, leanHintS: Double) {
        self.cook = cook
        self.leanHintS = leanHintS
    }
}

/// A cook, and what it waits for.
public struct CookWaiting: Sendable {
    public var cook: RunningCook
    public var need: CookNeed
}

private let idleState = CookState(cook: nil, plan: nil, leanHintS: 0)

/// What the app holds for a step of `cook`, or of a cook starting.
private func envOf(_ env: CooksEnv, _ cook: RunningCook?) -> CookEnv {
    var before: CookBefore?
    var day = env.day
    if let cook {
        for a in env.at where a.idMs == cook.idMs {
            before = a.before
            day = a.day
        }
    }
    return CookEnv(
        calibration: env.calibration, surfaces: env.surfaces, before: before, app: env.app,
        appVersion: env.appVersion, prior: env.prior, day: day
    )
}

/// Whether an effect is the screen's: the alarms, the ring, the silence.
private func screens(_ e: CookEffect) -> Bool {
    switch e {
    case .alarms, .ring, .silence: true
    default: false
    }
}

/// The cook on screen stepped with `event`, its effects tagged into
/// `effects`: still on screen, waiting in `ending`, or gone.
private func stepScreen(_ q: Cooks, _ event: CookEvent, _ env: CooksEnv, _ effects: inout [CooksEffect]) -> Cooks {
    let was = q.screen.cook
    let s = step(q.screen, event, envOf(env, was))
    let ended = s.cook.map { endedAtS($0) != nil } ?? true
    guard let cook = s.cook ?? was else { return q }
    for e in s.effects { effects.append(CooksEffect(idMs: cook.idMs, onScreen: true, ended: ended, effect: e)) }
    guard let after = s.cook else { return Cooks(screen: idleState, need: .none, ending: q.ending) }
    if ended {
        let waiting = EndingCook(cook: after, plan: s.plan, leanHintS: s.leanHintS, need: s.need)
        return Cooks(screen: idleState, need: .none, ending: q.ending + [waiting])
    }
    return Cooks(screen: s.state, need: s.need, ending: q.ending)
}

private func isStart(_ e: CookEvent) -> Bool {
    if case .start = e { true } else { false }
}

private func isTick(_ e: CookEvent) -> Bool {
    if case .tick = e { true } else { false }
}

/// The cook on screen stepped with `event`, after the tick that ends it when
/// it is too old at the event's moment. See `cooksStep` in
/// `src/core/cooks.ts`.
public func cooksStep(_ q: Cooks, _ event: CookEvent, _ env: CooksEnv) -> CooksStep {
    var effects: [CooksEffect] = []
    var cooks = q
    if !isStart(event), !isTick(event), let plan = q.screen.plan, cookTooOld(plan, nowS: event.nowS) {
        cooks = stepScreen(cooks, .tick(nowS: event.nowS), env, &effects)
    }
    let on = cooks.screen.cook != nil
    if isStart(event) ? on : !on { return CooksStep(cooks: cooks, effects: effects) }
    let after = stepScreen(cooks, event, env, &effects)
    return CooksStep(cooks: after, effects: effects)
}

/// A stored cook picked back up at `nowS`: a tick of it with no plan yet, in
/// place of any cook on screen and of itself if it was waiting.
public func cooksRestore(_ q: Cooks, _ stored: CookStored, nowS: Double, _ env: CooksEnv) -> CooksStep {
    let ending = q.ending.filter { $0.cook?.idMs != stored.cook.idMs }
    var effects: [CooksEffect] = []
    let picked = Cooks(
        screen: CookState(cook: stored.cook, plan: nil, leanHintS: stored.leanHintS), need: .none, ending: ending
    )
    let after = stepScreen(picked, .tick(nowS: nowS), env, &effects)
    return CooksStep(cooks: after, effects: effects)
}

/// Something a cook waited for built, at `nowS`: the cook on screen stepped,
/// then each ended one; those logged and forgotten go.
public func cooksLanded(_ q: Cooks, nowS: Double, _ env: CooksEnv) -> CooksStep {
    let first = cooksStep(q, .surfaceLanded(nowS: nowS), env)
    var effects = first.effects
    var left: [EndingCook] = []
    for e in first.cooks.ending {
        guard let cook = e.cook else { continue }
        let s = step(e.state, .surfaceLanded(nowS: nowS), envOf(env, cook))
        for x in s.effects where !screens(x) {
            effects.append(CooksEffect(idMs: cook.idMs, onScreen: false, ended: true, effect: x))
        }
        if let after = s.cook { left.append(EndingCook(cook: after, plan: s.plan, leanHintS: s.leanHintS, need: s.need)) }
    }
    return CooksStep(cooks: Cooks(screen: first.cooks.screen, need: first.cooks.need, ending: left), effects: effects)
}

/// Each cook, on screen and ended, with what it waits for.
public func cooksWaiting(_ q: Cooks) -> [CookWaiting] {
    var out: [CookWaiting] = []
    if let cook = q.screen.cook { out.append(CookWaiting(cook: cook, need: q.need)) }
    for e in q.ending {
        if let cook = e.cook { out.append(CookWaiting(cook: cook, need: e.need)) }
    }
    return out
}

/// The cooks whose calibration before their egg is still wanted.
public func beforeWanted(_ q: Cooks) -> [Double] {
    cooksWaiting(q).map(\.cook).filter(asRanStale).map(\.idMs)
}

/// The eggs logged and still open at `nowS`, by their cooks' ids. See
/// `openEggs` in `src/core/cooks.ts`.
public func openEggs(_ q: Cooks, nowS: Double) -> [Double] {
    var out: [Double] = []
    if let s = q.screen.cook, answersLogged(s) != nil, openEggId(s, plan: q.screen.plan, nowS: nowS) != nil {
        out.append(s.idMs)
    }
    for e in q.ending {
        if let c = e.cook, answersLogged(c) != nil { out.append(c.idMs) }
    }
    return out
}
