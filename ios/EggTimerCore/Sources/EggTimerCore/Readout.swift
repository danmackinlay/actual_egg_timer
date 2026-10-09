import Foundation

/// What the readout says while a cook runs: the words above, on and under the
/// clock, the buttons, and the numbers they take, for a cook and its plan at
/// one moment. Transliterated from `src/core/readout.ts`, whose comments say
/// what each part is, and held to it by `fixtures/step.json`.

/// One line of words: a key, and the numbers it takes by name. `time`,
/// `elapsed`, `boil`, `after` and `cooking` are seconds, shown as a clock;
/// `boiling` is degrees Celsius; `seconds` a whole number of seconds.
public struct ReadoutLine: Sendable, Equatable {
    public let key: String
    public let args: [String: Double]
}

/// What a screen reader hears for the clock: which line to say (the web's
/// spoken lines; iOS speaks none of them yet), or the line under the clock.
public struct Spoken: Sendable, Equatable {
    public enum Say: String, Sendable {
        case heating, cooking, pull, cooling, done, probe, stillIn, subline
    }

    public let say: Say
    public let args: [String: Double]
}

public struct Readout: Sendable, Equatable {
    /// The phase the clock reads, and whether the plan asks whether the egg
    /// is still in.
    public let phase: Phase
    public let asking: Bool
    /// Above the clock.
    public let label: String
    /// The clock, s, never below zero, and whether it counts on past the pull.
    public let clockS: Double
    public let sign: String
    public let subline: ReadoutLine
    public let spoken: Spoken
    /// The primary button, and the second (the "no" to "still in the water?").
    public let primary: String?
    public let secondary: String?
    public let hint: ReadoutLine?
    /// Whether Cancel is offered.
    public let cancel: Bool
}

/// What the readout needs of the cook's probe.
public struct ReadoutProbe: Sendable, Equatable {
    public var wanted: Bool
    public var pending: Bool

    public init(wanted: Bool, pending: Bool) {
        self.wanted = wanted
        self.pending = pending
    }
}

/// Whole seconds until the counted cooling starts without the cook; nil
/// outside the pull, and on a counter rest.
public func coolingStartsInS(_ d: Deadlines, cooling: Cooling, nowS: Double) -> Double? {
    guard phaseAt(d, nowS: nowS) == .pull, cooling != .counter else { return nil }
    return max(0, (pullGraceSeconds - (nowS - d.cookEndS)).rounded(.up))
}

/// The readout for `cook` with its `plan` at `nowS`. See `readoutAt` in
/// `src/core/readout.ts`.
public func readoutAt(
    _ cook: RunningCook, plan: CookPlan, nowS: Double, probe: ReadoutProbe = ReadoutProbe(wanted: false, pending: false)
) -> Readout {
    let ch = cook.choices
    let d = plan.deadlines
    let phase = phaseAt(d, nowS: nowS)
    let cold = ch.startMode == .cold
    let cookTime = plan.cookTimeS
    let boil = cold ? plan.setup.timeToBoilS : 0
    let toPull = d.cookEndS - nowS

    if asksIfStillIn(plan) {
        let since = max(0, nowS - d.cookEndS)
        return Readout(
            phase: phase, asking: true, label: "ask.stillIn", clockS: since, sign: "+",
            subline: ReadoutLine(key: "readout.sub.stillIn", args: [:]),
            spoken: Spoken(say: .stillIn, args: ["time": since]),
            primary: "ask.stillIn.yes", secondary: "ask.stillIn.no", hint: nil, cancel: true
        )
    }

    let keys = phaseKeys(PhaseFacts(
        phase: phase, startMode: cold ? .cold : .hot, afterBoil: ch.afterBoil, cooling: ch.cooling,
        whiteSets: true, boilKnown: true, probeWanted: probe.wanted
    ))
    var clock = 0.0
    var sign = ""
    var subline: [String: Double] = [:]
    var spoken = Spoken(say: .done, args: [:])
    var hint: [String: Double] = [:]
    switch phase {
    case .heating:
        let heated = nowS - cook.startedAtS
        subline = ["elapsed": heated, "boil": boil]
        if guessLengthened(plan) {
            clock = heated
            spoken = Spoken(say: .subline, args: subline)
        } else {
            clock = toPull
            spoken = Spoken(say: .heating, args: ["time": toPull])
        }
    case .cooking:
        clock = toPull
        subline = ["boil": boil, "after": cookTime - boil]
        spoken = Spoken(say: .cooking, args: ["time": toPull])
        hint = ["boiling": plan.setup.boilingC]
    case .pull:
        clock = -toPull
        sign = "+"
        spoken = Spoken(say: .pull, args: [:])
        hint = ["seconds": coolingStartsInS(d, cooling: ch.cooling, nowS: nowS) ?? 0]
    case .cooling:
        let toCool = max(0, (d.coolEndS ?? nowS) - nowS)
        clock = toCool
        spoken = Spoken(say: .cooling, args: ["time": toCool])
    case .done, .idle:
        clock = cookTime
        subline = ["boil": boil, "cooking": cookTime - boil]
        spoken = Spoken(say: probe.pending ? .probe : .done, args: [:])
    }
    return Readout(
        phase: phase, asking: false, label: keys.label, clockS: max(0, clock), sign: sign,
        subline: ReadoutLine(key: keys.subline, args: subline), spoken: spoken,
        primary: keys.action, secondary: nil,
        hint: keys.hint.map { ReadoutLine(key: $0, args: hint) },
        cancel: phase != .done
    )
}
