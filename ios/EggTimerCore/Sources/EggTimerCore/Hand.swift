import Foundation

// The correction in hand: when a change to the controls mid-cook is
// committed. The rules, the groups, which touches are another control and
// which moments are leaving are `src/core/hand.ts`'s header; this is its
// twin, held to it by `fixtures/hand.json`.

/// A group of the cook's choices a control makes, or the start's time.
public enum HandGroup: String, Sendable, Codable, CaseIterable {
    case mass, eggFrom, customStart, room, startMode, afterBoil, cooling, tapWater, bowlLitres, bowlWater, waterLitres,
        eggCount, altitude, level, startedAt
}

/// A control that makes no choice of the cook's, or a button that moves the
/// cook on: using one commits the change in hand.
public enum HandControl: String, Sendable, Codable {
    case primary, cancel, stillInWater, clause, probe, setting
}

/// The settle before a commit, the plan of the aimed-for egg, and the
/// aimed-for egg held after the last change.
public enum HandTimer: String, Sendable, Codable, CaseIterable {
    case settle, preview, hold
}

/// What the cook did to the controls, or a timer come round, at `atS`.
public enum HandEvent: Sendable, Equatable {
    case change(atS: Double, group: HandGroup)
    case down(atS: Double, group: HandGroup)
    case up(atS: Double)
    case leave(atS: Double)
    case moveOn(atS: Double, control: HandControl)
    case timer(atS: Double, timer: HandTimer)
    case fresh(atS: Double)

    public var atS: Double {
        switch self {
        case let .change(at, _), let .down(at, _), let .up(at), let .leave(at), let .moveOn(at, _), let .timer(at, _),
             let .fresh(at):
            at
        }
    }
}

/// An event as the web writes one: its kind, the moment, and that kind's
/// field.
extension HandEvent: Codable {
    private enum Keys: String, CodingKey { case kind, atS = "at_s", group, control, timer }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let at = try c.decode(Double.self, forKey: .atS)
        switch try c.decode(String.self, forKey: .kind) {
        case "change": self = .change(atS: at, group: try c.decode(HandGroup.self, forKey: .group))
        case "down": self = .down(atS: at, group: try c.decode(HandGroup.self, forKey: .group))
        case "up": self = .up(atS: at)
        case "leave": self = .leave(atS: at)
        case "moveOn": self = .moveOn(atS: at, control: try c.decode(HandControl.self, forKey: .control))
        case "timer": self = .timer(atS: at, timer: try c.decode(HandTimer.self, forKey: .timer))
        case "fresh": self = .fresh(atS: at)
        case let kind:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "no hand event \(kind)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(atS, forKey: .atS)
        switch self {
        case let .change(_, g): try c.encode("change", forKey: .kind); try c.encode(g, forKey: .group)
        case let .down(_, g): try c.encode("down", forKey: .kind); try c.encode(g, forKey: .group)
        case .up: try c.encode("up", forKey: .kind)
        case .leave: try c.encode("leave", forKey: .kind)
        case let .moveOn(_, k): try c.encode("moveOn", forKey: .kind); try c.encode(k, forKey: .control)
        case let .timer(_, t): try c.encode("timer", forKey: .kind); try c.encode(t, forKey: .timer)
        case .fresh: try c.encode("fresh", forKey: .kind)
        }
    }
}

/// A finger down on a control: when, on which group, and whether a change of
/// that group came while it was down.
public struct HandPress: Sendable, Equatable, Codable {
    public var atS: Double
    public var group: HandGroup
    public var changed: Bool

    enum CodingKeys: String, CodingKey { case atS = "at_s", group, changed }
}

/// What `handStep` holds between events.
public struct HandState: Sendable, Equatable, Codable {
    /// The group whose change is in hand, not yet committed.
    public var hand: HandGroup?
    /// The finger down on a control.
    public var down: HandPress?
    /// When the last change came; nil for none since the controls were
    /// drawn afresh.
    public var changedS: Double?
    /// Whether an aimed-for egg is shown: from a change until it is let go.
    public var aimed: Bool
    /// Whether the preview is set and has not come round.
    public var previewing: Bool

    enum CodingKeys: String, CodingKey { case hand, down, changedS = "changed_s", aimed, previewing }
}

/// A timer set for `atS`, or cancelled with nil.
public struct HandTimerSet: Sendable, Equatable, Codable {
    public var timer: HandTimer
    public var atS: Double?

    enum CodingKeys: String, CodingKey { case timer, atS = "at_s" }
}

/// What to do with the aimed-for egg: plan it for the change in hand, or let
/// it go and show the cook's own level.
public enum HandAim: String, Sendable, Codable {
    case plan, letGo
}

/// What an event does.
public struct HandStep: Sendable, Equatable, Codable {
    public var state: HandState
    /// The group whose change to commit now, before anything else the event
    /// leads the app to do.
    public var commit: HandGroup?
    public var aim: HandAim?
    public var timers: [HandTimerSet]
}

/// Nothing in hand, on controls drawn afresh.
public func nothingInHand() -> HandState {
    HandState(hand: nil, down: nil, changedS: nil, aimed: false, previewing: false)
}

private func setTimer(_ out: inout HandStep, _ timer: HandTimer, _ atS: Double?) {
    out.timers.removeAll { $0.timer == timer }
    out.timers.append(HandTimerSet(timer: timer, atS: atS))
}

private func holdUntil(_ s: HandState, _ atS: Double) -> Double {
    s.changedS.map { max(atS, $0 + handSettleS) } ?? atS
}

private func commit(_ out: inout HandStep, _ atS: Double) {
    let s = out.state
    guard let hand = s.hand else { return }
    out.state.hand = nil
    out.commit = hand
    setTimer(&out, .settle, nil)
    setTimer(&out, .hold, holdUntil(s, atS))
}

private func holdAgain(_ out: inout HandStep, _ atS: Double) {
    if out.state.aimed { setTimer(&out, .hold, holdUntil(out.state, atS)) }
}

/// What `event` does to `state`. See `handStep` in `src/core/hand.ts`.
public func handStep(_ state: HandState, _ event: HandEvent) -> HandStep {
    var out = HandStep(state: state, commit: nil, aim: nil, timers: [])
    let at = event.atS
    switch event {
    case let .change(_, g):
        if let hand = state.hand, hand != g { commit(&out, at) }
        let wasPreviewing = out.state.previewing
        if var d = out.state.down, d.group == g {
            d.changed = true
            out.state.down = d
        }
        out.state.hand = g
        out.state.changedS = at
        out.state.aimed = true
        out.state.previewing = true
        setTimer(&out, .hold, nil)
        if !wasPreviewing { setTimer(&out, .preview, at + handPreviewS) }
        if out.state.down?.group != g { setTimer(&out, .settle, at + handSettleS) }
    case let .down(_, g):
        if let hand = state.hand, hand != g { commit(&out, at) }
        out.state.down = HandPress(atS: at, group: g, changed: false)
        setTimer(&out, .settle, nil)
    case .up:
        guard let d = state.down else { return out }
        out.state.down = nil
        guard let hand = state.hand else {
            holdAgain(&out, at)
            return out
        }
        if hand == d.group, d.changed, d.group == .level || at - d.atS >= handHeldS {
            commit(&out, at)
        } else {
            setTimer(&out, .settle, at + handSettleS)
        }
    case .leave:
        out.state.down = nil
        if state.hand == nil { holdAgain(&out, at) } else { commit(&out, at) }
    case .moveOn:
        commit(&out, at)
    case let .timer(_, timer):
        switch timer {
        case .settle:
            if state.down == nil { commit(&out, at) }
        case .preview:
            out.state.previewing = false
            out.aim = state.hand == nil ? nil : .plan
        case .hold:
            if state.hand == nil, state.down == nil, state.aimed {
                out.state.aimed = false
                out.aim = .letGo
            }
        }
    case .fresh:
        out.state = nothingInHand()
        out.aim = state.aimed ? .letGo : nil
        setTimer(&out, .settle, nil)
        setTimer(&out, .preview, nil)
        setTimer(&out, .hold, nil)
    }
    return out
}

/// `choices` with `group`'s choices taken from `said`; the start's time takes
/// none.
public func takeGroup(_ choices: CookChoices, said: CookChoices, group: HandGroup) -> CookChoices {
    var c = choices
    switch group {
    case .mass:
        c.massKg = said.massKg
        c.massFrom = said.massFrom
        c.sizeTable = said.sizeTable
    case .eggFrom: c.eggFrom = said.eggFrom
    case .customStart: c.customStartC = said.customStartC
    case .room: c.roomC = said.roomC
    case .startMode: c.startMode = said.startMode
    case .afterBoil: c.afterBoil = said.afterBoil
    case .cooling: c.cooling = said.cooling
    case .tapWater: c.tapWaterC = said.tapWaterC
    case .bowlLitres: c.bowlLitres = said.bowlLitres
    case .bowlWater: c.bowlWaterC = said.bowlWaterC
    case .waterLitres: c.waterLitres = said.waterLitres
    case .eggCount: c.eggCount = said.eggCount
    case .altitude: c.altitudeM = said.altitudeM
    case .level: c.level = said.level
    case .startedAt: break
    }
    return c
}

/// The group a change to the temperature of the water this cooling cools in
/// makes: running water's is the cold tap's, and the bowl's its own; nil for
/// ice or the air.
public func coolingWaterGroup(_ cooling: Cooling) -> HandGroup? {
    switch cooling {
    case .tap: .tapWater
    case .bowl: .bowlWater
    case .ice, .counter, .eggCup: nil
    }
}

/// The choices a commit of `group` makes of `cook`, the controls saying
/// `said`; nil for a change a correction cannot make (`correctable`).
public func handChoices(_ cook: RunningCook, said: CookChoices, group: HandGroup) -> CookChoices? {
    let taken = takeGroup(cook.choices, said: said, group: group)
    return correctable(cook, taken) == taken ? taken : nil
}

/// The cook as the change in hand would make it, for the aimed-for egg's
/// plan. Stored nowhere and stepped nowhere.
public func previewCook(
    _ cook: RunningCook, said: CookChoices, group: HandGroup, startS: Double, nowS: Double
) -> RunningCook {
    if group == .startedAt {
        return startS == cook.startedAtS ? cook : startCorrected(cook, startedAtS: startS, nowS: nowS) ?? cook
    }
    let taken = takeGroup(cook.choices, said: said, group: group)
    return handChoices(cook, said: said, group: group) == nil
        ? levelPreview(cook, choices: taken) : corrected(cook, choices: taken, nowS: nowS)
}

/// Why the start's − or + went no further, and the time it stopped at.
public struct StartLimit: Sendable, Equatable, Codable {
    public enum Kind: String, Sendable, Codable { case now, boil, pull, earliest }
    public var kind: Kind
    public var atS: Double

    enum CodingKeys: String, CodingKey { case kind, atS = "at_s" }
}

/// The start a minute earlier or later than `fromS`, as far as the cook
/// allows at `nowS`, and why it went no further.
public func startStepped(
    _ cook: RunningCook, fromS: Double, up: Bool, nowS: Double
) -> (startS: Double, limit: StartLimit?) {
    let earliest = earliestStartS(cook)
    let latest = latestStartS(cook, nowS: nowS)
    var next = fromS + (up ? 60 : -60)
    var limit: StartLimit?
    if next >= latest {
        next = latest
        let e = cook.events
        let kind: StartLimit.Kind = e.boilAtS == latest ? .boil
            : e.pulled?.dueS == latest || e.cooledAtS == latest ? .pull : .now
        limit = StartLimit(kind: kind, atS: latest)
    }
    if next <= earliest {
        next = earliest
        limit = StartLimit(kind: .earliest, atS: earliest)
    }
    return (next, limit)
}
