import Foundation
import EggTimerCopy

/// The twin of `src/core/readout.ts`, held to it by `fixtures/step.json`; the
/// TypeScript's comments say what each part is for.

/// One line of words: a key, and the numbers it takes by name.
public struct ReadoutLine: Sendable, Equatable, Codable {
    public let key: CopyKey
    public let args: [String: Double]
}

/// What a screen reader hears for the clock. iOS speaks none of these yet.
public struct Spoken: Sendable, Equatable, Codable {
    public enum Say: String, Sendable, Codable {
        case heating, cooking, pull, cooling, done, probe, stillIn, subline
    }

    public let say: Say
    public let args: [String: Double]
}

public struct Readout: Sendable, Equatable, Codable {
    public let phase: Phase
    public let asking: Bool
    public let label: CopyKey
    public let clockS: Double
    /// "" or "+", the TypeScript's union.
    public let sign: String
    public let subline: ReadoutLine
    public let spoken: Spoken
    public let primary: CopyKey?
    public let secondary: CopyKey?
    public let hint: ReadoutLine?
    public let cancel: Bool

    enum CodingKeys: String, CodingKey {
        case phase, asking, label, clockS = "clock_s", sign, subline, spoken, primary, secondary, hint, cancel
    }
}

public struct ReadoutProbe: Sendable, Equatable, Codable {
    public var wanted: Bool
    public var pending: Bool

    public init(wanted: Bool, pending: Bool) {
        self.wanted = wanted
        self.pending = pending
    }
}

func coolingStartsInS(_ d: Deadlines, cooling: Cooling, nowS: Double) -> Double? {
    guard phaseAt(d, nowS: nowS) == .pull, !restsInAir(cooling) else { return nil }
    return max(0, (pullGraceSeconds - (nowS - d.cookEndS)).rounded(.up))
}

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
            phase: phase, asking: true, label: .`ask.stillIn`, clockS: since, sign: "+",
            subline: ReadoutLine(key: .`readout.sub.stillIn`, args: [:]),
            spoken: Spoken(say: .stillIn, args: ["time": since]),
            primary: .`ask.stillIn.yes`, secondary: .`ask.stillIn.no`, hint: nil, cancel: true
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
