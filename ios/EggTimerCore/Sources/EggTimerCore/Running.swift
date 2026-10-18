import Foundation

/// A running cook: its start and the log of everything since.
///
/// Transliterated from `src/core/running.ts`, whose comments say what each
/// part is for, and held to it by `fixtures/running.json` and
/// `fixtures/step.json`.

// MARK: - The types

public struct CookChoices: Sendable, Equatable, Codable {
    public var massKg: Double
    public var massFrom: MassFrom
    public var sizeTable: SizeTable?
    public var eggFrom: EggFrom
    public var customStartC: Double
    public var roomC: Double?
    public var startMode: StartMode
    public var afterBoil: HeatAfterBoil
    public var cooling: Cooling
    public var tapWaterC: Double?
    public var bowlLitres: Double
    public var bowlWaterC: Double?
    public var waterLitres: Double
    public var eggCount: Double
    public var altitudeM: Double
    public var level: Double

    public init(
        massKg: Double, massFrom: MassFrom, sizeTable: SizeTable?, eggFrom: EggFrom, customStartC: Double,
        roomC: Double?, startMode: StartMode, afterBoil: HeatAfterBoil, cooling: Cooling, waterLitres: Double,
        eggCount: Double, altitudeM: Double, level: Double,
        tapWaterC: Double? = nil, bowlLitres: Double = Defaults.bowlLitres, bowlWaterC: Double? = nil
    ) {
        self.massKg = massKg
        self.massFrom = massFrom
        self.sizeTable = sizeTable
        self.eggFrom = eggFrom
        self.customStartC = customStartC
        self.roomC = roomC
        self.startMode = startMode
        self.afterBoil = afterBoil
        self.cooling = cooling
        self.tapWaterC = tapWaterC
        self.bowlLitres = bowlLitres
        self.bowlWaterC = bowlWaterC
        self.waterLitres = waterLitres
        self.eggCount = eggCount
        self.altitudeM = altitudeM
        self.level = level
    }

    enum CodingKeys: String, CodingKey {
        case massKg = "mass_kg", massFrom, sizeTable, eggFrom, customStartC = "customStart_C"
        case roomC = "room_C", startMode, afterBoil, cooling, tapWaterC = "tapWater_C", bowlLitres
        case bowlWaterC = "bowlWater_C", waterLitres, eggCount, altitudeM = "altitude_m", level
    }

    /// Nulls are written, not omitted, as the TypeScript stores a cook's
    /// choices: the synthesized coding would leave each nil out.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(massKg, forKey: .massKg)
        try c.encode(massFrom, forKey: .massFrom)
        try c.encode(sizeTable, forKey: .sizeTable)
        try c.encode(eggFrom, forKey: .eggFrom)
        try c.encode(customStartC, forKey: .customStartC)
        try c.encode(roomC, forKey: .roomC)
        try c.encode(startMode, forKey: .startMode)
        try c.encode(afterBoil, forKey: .afterBoil)
        try c.encode(cooling, forKey: .cooling)
        try c.encode(tapWaterC, forKey: .tapWaterC)
        try c.encode(bowlLitres, forKey: .bowlLitres)
        try c.encode(bowlWaterC, forKey: .bowlWaterC)
        try c.encode(waterLitres, forKey: .waterLitres)
        try c.encode(eggCount, forKey: .eggCount)
        try c.encode(altitudeM, forKey: .altitudeM)
        try c.encode(level, forKey: .level)
    }
}

public struct Pulled: Sendable, Equatable, Codable {
    public var dueS: Double
    public var outS: Double
    public var by: PulledBy
    public var confirmed: Bool

    public init(dueS: Double, outS: Double, by: PulledBy, confirmed: Bool) {
        self.dueS = dueS
        self.outS = outS
        self.by = by
        self.confirmed = confirmed
    }

    enum CodingKeys: String, CodingKey {
        case dueS = "due_s", outS = "out_s", by, confirmed
    }
}

public struct CookEvents: Sendable, Equatable, Codable {
    public var boilAtS: Double?
    public var pulled: Pulled?
    public var cooledAtS: Double?
    public var rangAtS: Double?

    public init(boilAtS: Double? = nil, pulled: Pulled? = nil, cooledAtS: Double? = nil, rangAtS: Double? = nil) {
        self.boilAtS = boilAtS
        self.pulled = pulled
        self.cooledAtS = cooledAtS
        self.rangAtS = rangAtS
    }

    public static let none = CookEvents()

    enum CodingKeys: String, CodingKey {
        case boilAtS = "boilAt_s", pulled, cooledAtS = "cooledAt_s", rangAtS = "rangAt_s"
    }
}

public struct CookStart: Sendable, Equatable, Codable {
    public let atS: Double
    public let choices: CookChoices

    public init(atS: Double, choices: CookChoices) {
        self.atS = atS
        self.choices = choices
    }

    enum CodingKeys: String, CodingKey {
        case atS = "at_s", choices
    }
}

public enum CookEntry: Sendable, Equatable {
    case boil(atS: Double)
    case correct(atS: Double, choices: CookChoices)
    case start(atS: Double, startedAtS: Double)
    case pulled(Pulled?)
    case stands
    case cooled(atS: Double?)
    case rang(atS: Double?)
    case stillIn(atS: Double)
    case ran(CookAsRan?)
    case answered(atS: Double, yolkWord: YolkWord?, white: WhiteReport?, probe: ProbeReading?)
    case logged(atS: Double)
    case ended(atS: Double)

    /// Its kind, as the web writes it.
    public var kind: String {
        switch self {
        case .boil: "boil"
        case .correct: "correct"
        case .start: "start"
        case .pulled: "pulled"
        case .stands: "stands"
        case .cooled: "cooled"
        case .rang: "rang"
        case .stillIn: "stillIn"
        case .ran: "ran"
        case .answered: "answered"
        case .logged: "logged"
        case .ended: "ended"
        }
    }
}

/// The fields from `startedAtS` on are the log folded, which only core sets
/// (`appendEntry` and the moves over it).
public struct RunningCook: Sendable, Equatable {
    public internal(set) var idMs: Double
    public internal(set) var nudgeS: Double
    public internal(set) var boilMemory: BoilMemory
    public internal(set) var units: Units
    public internal(set) var lang: String
    public internal(set) var start: CookStart
    public internal(set) var log: [CookEntry]
    public internal(set) var startedAtS: Double
    public internal(set) var choices: CookChoices
    public internal(set) var events: CookEvents
    public internal(set) var correctedAtS: Double?
    public internal(set) var asRan: CookAsRan?

    init(
        idMs: Double, start: CookStart, nudgeS: Double, boilMemory: BoilMemory, units: Units, lang: String
    ) {
        self.idMs = idMs
        self.nudgeS = nudgeS
        self.boilMemory = boilMemory
        self.units = units
        self.lang = lang
        self.start = start
        self.log = []
        self.startedAtS = start.atS
        self.choices = start.choices
        self.events = .none
        self.correctedAtS = nil
        self.asRan = nil
    }
}

/// An entry as the web writes one: its kind, and that kind's fields.
extension CookEntry: Codable {
    private enum Keys: String, CodingKey {
        case kind, atS = "at_s", choices, startedAtS = "startedAt_s", pulled, asRan, yolkWord, white, probe
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let at = { try c.decode(Double.self, forKey: .atS) }
        switch try c.decode(String.self, forKey: .kind) {
        case "boil": self = .boil(atS: try at())
        case "correct": self = .correct(atS: try at(), choices: try c.decode(CookChoices.self, forKey: .choices))
        case "start": self = .start(atS: try at(), startedAtS: try c.decode(Double.self, forKey: .startedAtS))
        case "pulled": self = .pulled(try c.decodeIfPresent(Pulled.self, forKey: .pulled))
        case "stands": self = .stands
        case "cooled": self = .cooled(atS: try c.decodeIfPresent(Double.self, forKey: .atS))
        case "rang": self = .rang(atS: try c.decodeIfPresent(Double.self, forKey: .atS))
        case "stillIn": self = .stillIn(atS: try at())
        case "ran": self = .ran(try c.decodeIfPresent(CookAsRan.self, forKey: .asRan))
        case "answered":
            self = .answered(
                atS: try at(), yolkWord: try c.decodeIfPresent(YolkWord.self, forKey: .yolkWord),
                white: try c.decodeIfPresent(WhiteReport.self, forKey: .white),
                probe: try c.decodeIfPresent(ProbeReading.self, forKey: .probe)
            )
        case "logged": self = .logged(atS: try at())
        case "ended": self = .ended(atS: try at())
        case let kind:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "no entry of kind \(kind)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(kind, forKey: .kind)
        switch self {
        case let .boil(at), let .stillIn(at), let .logged(at), let .ended(at): try c.encode(at, forKey: .atS)
        case let .correct(at, choices):
            try c.encode(at, forKey: .atS)
            try c.encode(choices, forKey: .choices)
        case let .start(at, startedAt):
            try c.encode(at, forKey: .atS)
            try c.encode(startedAt, forKey: .startedAtS)
        case let .pulled(p): try c.encode(p, forKey: .pulled)
        case .stands: break
        case let .cooled(at), let .rang(at): try c.encode(at, forKey: .atS)
        case let .ran(r): try c.encode(r, forKey: .asRan)
        case let .answered(at, yolk, white, probe):
            try c.encode(at, forKey: .atS)
            try c.encode(yolk, forKey: .yolkWord)
            try c.encode(white, forKey: .white)
            try c.encode(probe, forKey: .probe)
        }
    }
}

/// Coded as the TypeScript's: what was fixed at the press, the start and the
/// log, and no more; the rest is the log folded again on reading (`foldCook`).
extension RunningCook: Codable {
    private enum Keys: String, CodingKey {
        case idMs = "id_ms", nudgeS = "nudge_s", boilMemory, units, lang, start, log
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        self = foldCook(
            idMs: try c.decode(Double.self, forKey: .idMs), start: try c.decode(CookStart.self, forKey: .start),
            nudgeS: try c.decode(Double.self, forKey: .nudgeS), boilMemory: try c.decode(BoilMemory.self, forKey: .boilMemory),
            units: try c.decode(Units.self, forKey: .units), lang: try c.decode(String.self, forKey: .lang),
            log: try c.decode([CookEntry].self, forKey: .log)
        )
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(idMs, forKey: .idMs)
        try c.encode(nudgeS, forKey: .nudgeS)
        try c.encode(boilMemory, forKey: .boilMemory)
        try c.encode(units, forKey: .units)
        try c.encode(lang, forKey: .lang)
        try c.encode(start, forKey: .start)
        try c.encode(log, forKey: .log)
    }
}

// MARK: - The phases and deadlines

public enum Phase: String, Sendable, Codable {
    case idle = "IDLE"
    case heating = "HEATING"
    case cooking = "COOKING"
    case pull = "PULL"
    case cooling = "COOLING"
    case done = "DONE"
}

public func coolingSecondsFor(_ result: CookResult) -> Double {
    let toPeak = result.peakYolkTimeS - result.cookTimeS
    if !(toPeak > 0.0) { return coolingSeconds }
    let whole = toPeak.rounded()
    return whole < coolingMinSeconds ? coolingMinSeconds : whole
}

public func countedCoolingS(_ result: CookResult, cooling: Cooling) -> Double {
    cooling == .eggCup ? Constants.eggCupOpenedS : coolingSecondsFor(result)
}

public func probeMomentFor(_ result: CookResult, cooling: Cooling) -> Bool {
    if restsInAir(cooling) { return false }
    return result.peakYolkTimeS - result.cookTimeS >= coolingMinSeconds
}

public func plausibleProbeRangeC(
    egg: Egg, setup: CookSetup, params: ModelParams, cookTimeS: Double
) -> (low: Double, high: Double) {
    let spread = exp(probeAlphaSds * Constants.alphaRelSD)
    let slow = simulate(
        egg: egg, setup: setup,
        params: ModelParams(alphaM2s: params.alphaM2s / spread),
        cookTimeS: cookTimeS
    )
    let fast = simulate(
        egg: egg, setup: setup,
        params: ModelParams(alphaM2s: params.alphaM2s * spread),
        cookTimeS: cookTimeS
    )
    let bath = coolingMediumC(setup)
    let floor = min(setup.eggStartC, setup.ambientC, bath)
    let lo = min(slow.peakYolkC, fast.peakYolkC) - probeMarginC
    let hi = max(slow.peakYolkC, fast.peakYolkC) + probeMarginC
    return (lo < floor ? floor : lo, hi > setup.boilingC ? setup.boilingC : hi)
}

public struct Deadlines: Sendable {
    public let cookEndS: Double
    public let coolEndS: Double?
    public let provisional: Bool
    public let outAtS: Double?
    public let asking: Bool

    public init(cookEndS: Double, coolEndS: Double?, provisional: Bool, outAtS: Double? = nil, asking: Bool = false) {
        self.cookEndS = cookEndS
        self.coolEndS = coolEndS
        self.provisional = provisional
        self.outAtS = outAtS
        self.asking = asking
    }
}

/// The TypeScript's, with no `asking` for not asking.
extension Deadlines: Codable {
    private enum CodingKeys: String, CodingKey {
        case cookEndS = "cookEnd_s", coolEndS = "coolEnd_s", provisional, outAtS = "outAt_s", asking
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            cookEndS: try c.decode(Double.self, forKey: .cookEndS), coolEndS: try c.decodeIfPresent(Double.self, forKey: .coolEndS),
            provisional: try c.decode(Bool.self, forKey: .provisional), outAtS: try c.decodeIfPresent(Double.self, forKey: .outAtS),
            asking: try c.decodeIfPresent(Bool.self, forKey: .asking) ?? false
        )
    }
}

public func phaseAt(_ d: Deadlines, nowS: Double) -> Phase {
    if d.provisional { return .heating }
    if nowS < d.cookEndS { return .cooking }
    let out = d.outAtS.map { nowS >= $0 } ?? false
    if nowS < d.cookEndS + pullGraceSeconds && !out { return .pull }
    // A question open about the pull: not Done until it is answered.
    if d.asking { return .cooling }
    guard let coolEndS = d.coolEndS else { return .done }
    return nowS < coolEndS ? .cooling : .done
}

// MARK: - The log

public func appendEntry(_ cook: RunningCook, _ entry: CookEntry) -> RunningCook {
    var next = applyEntry(cook, entry)
    next.log.append(entry)
    return next
}

private func applyEntry(_ cook: RunningCook, _ entry: CookEntry) -> RunningCook {
    var c = cook
    switch entry {
    case let .boil(at):
        c.events.boilAtS = at
    case let .correct(at, choices):
        // After the pull the yolk wanted is not corrected: it was not a
        // mistake, and the slider only previews.
        // Done on the counter and corrected to a counted cooling: that cooling
        // ended here at the latest.
        let e = cook.events
        c.choices = choices
        if e.pulled != nil { c.choices.level = cook.choices.level }
        if e.pulled != nil, e.cooledAtS == nil, !countsDown(cook.choices.cooling), countsDown(choices.cooling) {
            c.events.cooledAtS = at
        }
        c.correctedAtS = at
    case let .start(at, startedAt):
        c.startedAtS = startedAt
        c.correctedAtS = at
    case let .pulled(p):
        c.events.pulled = p
    case .stands:
        c.events.pulled?.confirmed = true
    case let .cooled(at):
        c.events.cooledAtS = at
    case let .rang(at):
        c.events.rangAtS = at
    case let .stillIn(at):
        c.events.pulled = nil
        c.events.cooledAtS = nil
        c.events.rangAtS = nil
        c.correctedAtS = at
        c.asRan = nil
    case let .ran(r):
        c.asRan = r
    case .answered, .logged, .ended:
        break
    }
    return c
}

public func foldCook(
    idMs: Double, start: CookStart, nudgeS: Double, boilMemory: BoilMemory, units: Units, lang: String,
    log: [CookEntry]
) -> RunningCook {
    var cook = RunningCook(idMs: idMs, start: start, nudgeS: nudgeS, boilMemory: boilMemory, units: units, lang: lang)
    for entry in log { cook = appendEntry(cook, entry) }
    return cook
}

func coldHistory(_ cook: RunningCook) -> (coldSinceS: Double?, firstHotAtS: Double?) {
    var mode = cook.start.choices.startMode
    var since: Double? = mode == .cold ? cook.start.atS : nil
    var firstHot: Double? = mode == .hot ? cook.start.atS : nil
    for entry in cook.log {
        guard case let .correct(at, choices) = entry else { continue }
        if choices.startMode == .cold {
            if !(mode == .cold && since != nil) { since = at }
        } else {
            since = nil
            if firstHot == nil { firstHot = at }
        }
        mode = choices.startMode
    }
    return (since, firstHot)
}

public struct CookAnswers: Sendable, Equatable, Codable {
    public var yolkWord: YolkWord?
    public var white: WhiteReport?
    public var probe: ProbeReading?
}

private func answersIn(_ log: [CookEntry], count: Int) -> CookAnswers {
    var a = CookAnswers()
    for entry in log.prefix(count) {
        guard case let .answered(_, yolk, white, probe) = entry else { continue }
        if a.yolkWord == nil { a.yolkWord = yolk }
        if a.white == nil { a.white = white }
        if a.probe == nil { a.probe = probe }
    }
    return a
}

public func answersOf(_ cook: RunningCook) -> CookAnswers {
    answersIn(cook.log, count: cook.log.count)
}

public func answersLogged(_ cook: RunningCook) -> CookAnswers? {
    guard let i = cook.log.lastIndex(where: { $0.kind == "logged" }) else { return nil }
    return answersIn(cook.log, count: i)
}

public func answered(_ cook: RunningCook) -> Bool {
    let a = answersOf(cook)
    return a.yolkWord != nil || a.white != nil || a.probe != nil
}

public func endedAtS(_ cook: RunningCook) -> Double? {
    for entry in cook.log.reversed() {
        if case let .ended(at) = entry { return at }
    }
    return nil
}

public func boilRemembered(_ cook: RunningCook) -> Bool {
    hasBoilMemory(cook.boilMemory)
}

// MARK: - The egg and the pot

public struct CookPot: Sendable, Equatable, Codable {
    public let egg: Egg
    public let setup: CookSetup
}

func eggStartOf(_ ch: CookChoices) -> Double {
    switch ch.eggFrom {
    case .custom: ch.customStartC
    case .fridge: startTempPresetC(.fridge, roomC: ch.roomC)
    case .room: startTempPresetC(.room, roomC: ch.roomC)
    }
}

public func cookSetupOf(_ ch: CookChoices, timeToBoilS: Double) -> CookPot {
    let eggStart = eggStartOf(ch)
    return CookPot(
        egg: Geometry.eggFromMass(ch.massKg),
        setup: CookSetup(
            startMode: ch.startMode,
            eggStartC: eggStart,
            ambientC: ambientFor(eggStartC: eggStart, roomC: ch.roomC),
            boilingC: Thermo.boilingPointAtAltitude(ch.altitudeM),
            timeToBoilS: timeToBoilS,
            cooling: ch.cooling,
            waterLitres: ch.waterLitres,
            afterBoil: ch.afterBoil,
            eggCount: ch.eggCount,
            // The water the eggs cool in: running water's temperature if
            // given; a bowl's volume, and its temperature if given. An
            // absent temperature is assumed where it is read (`coolingMediumC`).
            coolingWaterC: ch.cooling == .tap ? ch.tapWaterC : ch.cooling == .bowl ? ch.bowlWaterC : nil,
            bowlLitres: ch.cooling == .bowl ? ch.bowlLitres : nil
        )
    )
}

// MARK: - The transitions

public func startCook(
    nowS: Double, choices: CookChoices, nudgeS: Double, boilMemory: BoilMemory, units: Units, lang: String
) -> RunningCook {
    RunningCook(
        idMs: (nowS * 1000).rounded(), start: CookStart(atS: nowS, choices: choices), nudgeS: nudgeS,
        boilMemory: boilMemory, units: units, lang: lang
    )
}

public func withBoil(_ cook: RunningCook, nowS: Double) -> RunningCook {
    let e = cook.events
    if cook.choices.startMode != .cold || e.boilAtS != nil || e.pulled != nil { return cook }
    if !(nowS >= cook.startedAtS) { return cook }
    return appendEntry(cook, .boil(atS: nowS))
}

public func corrected(_ cook: RunningCook, choices: CookChoices, nowS: Double) -> RunningCook {
    appendEntry(cook, .correct(atS: nowS, choices: choices))
}

public func latestStartS(_ cook: RunningCook, nowS: Double) -> Double {
    var latest = nowS
    let e = cook.events
    if let boil = e.boilAtS, boil < latest { latest = boil }
    if let pulled = e.pulled, pulled.dueS < latest { latest = pulled.dueS }
    if let cooled = e.cooledAtS, cooled < latest { latest = cooled }
    return latest
}

public func earliestStartS(_ cook: RunningCook) -> Double {
    cook.idMs / 1000 - Limits.timeToBoilS.upperBound
}

public func startCorrected(_ cook: RunningCook, startedAtS: Double, nowS: Double) -> RunningCook? {
    if !startedAtS.isFinite || startedAtS > latestStartS(cook, nowS: nowS) { return nil }
    if startedAtS < earliestStartS(cook) { return nil }
    return appendEntry(cook, .start(atS: nowS, startedAtS: startedAtS))
}

public func stillIn(_ cook: RunningCook, nowS: Double) -> RunningCook {
    guard let p = cook.events.pulled, p.by == .timeout, !p.confirmed else { return cook }
    return appendEntry(cook, .stillIn(atS: nowS))
}

public func pullStands(_ cook: RunningCook) -> RunningCook {
    guard let p = cook.events.pulled, !p.confirmed else { return cook }
    return appendEntry(cook, .stands)
}

public func writeEvents(_ cook: RunningCook, _ events: CookEvents) -> RunningCook {
    var next = cook
    let e = cook.events
    if let boil = events.boilAtS, events.boilAtS != e.boilAtS { next = appendEntry(next, .boil(atS: boil)) }
    if events.pulled != e.pulled { next = appendEntry(next, .pulled(events.pulled)) }
    if events.cooledAtS != next.events.cooledAtS { next = appendEntry(next, .cooled(atS: events.cooledAtS)) }
    if events.rangAtS != e.rangAtS { next = appendEntry(next, .rang(atS: events.rangAtS)) }
    return next
}

public func levelPreview(_ cook: RunningCook, choices: CookChoices) -> RunningCook {
    var c = cook
    c.log = cook.log.filter { ["boil", "correct", "start"].contains($0.kind) }
    c.choices = choices
    c.correctedAtS = nil
    c.asRan = nil
    c.events.pulled = nil
    c.events.cooledAtS = nil
    c.events.rangAtS = nil
    return c
}

// MARK: - The plan

public struct CookSurface: Sendable {
    public let inputs: DecisionInputs
    public let grid: DoseGrid
    public let profile: OddsProfile?

    public init(inputs: DecisionInputs, grid: DoseGrid, profile: OddsProfile?) {
        self.inputs = inputs
        self.grid = grid
        self.profile = profile
    }
}

/// Its fields are core's alone: the apps hand it back to `replan` and never
/// read it.
public struct SlowHobMemo: Sendable, Equatable {
    let reads: SlowHobReads
    let steps: Int
    let lastS: Double
    let rampS: Double
    let carriedS: Double?
}

/// Where the rule got to, and not what it read: that is this core's own,
/// and two cores' numbers agree only in distribution.
extension SlowHobMemo: Encodable {
    private enum CodingKeys: String, CodingKey {
        case steps, lastS = "last_s", rampS = "ramp_s", carriedS = "carried_s"
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(steps, forKey: .steps)
        try c.encode(lastS, forKey: .lastS)
        try c.encode(rampS, forKey: .rampS)
        try c.encode(carriedS, forKey: .carriedS)
    }
}

public struct CookPlan: Sendable, Encodable {
    public let egg: Egg
    public let setup: CookSetup
    public let inputs: DecisionInputs?
    public let answer: LevelAnswer
    public let solution: Solution
    public let decided: DecidedAnswer?
    public let leanS: Double
    public let nudgeS: Double
    public let cookTimeS: Double
    public let overdue: Bool
    public let coolS: Double
    public let probeMoment: Bool
    public let deadlines: Deadlines
    public let slowHobAtS: Double?
    public let memo: SlowHobMemo?
    public let tooOldAtS: Double
    public let certainty: CertaintyReading?
    public let forecast: Forecast?

    enum CodingKeys: String, CodingKey {
        case egg, setup, inputs, answer, solution, decided, leanS = "lean_s", nudgeS = "nudge_s"
        case cookTimeS = "cookTime_s", overdue, coolS = "cool_s", probeMoment, deadlines
        case slowHobAtS = "slowHobAt_s", memo, tooOldAtS = "tooOldAt_s", certainty, forecast
    }
}

public func guessLengthened(_ plan: CookPlan) -> Bool {
    plan.inputs == nil
}

public func asksIfStillIn(_ plan: CookPlan) -> Bool {
    plan.deadlines.asking
}

struct SlowHobReads: Sendable, Equatable {
    let startedAtS: Double
    let choices: CookChoices
    let rememberedS: Double
    let carryS: Double
    let alphaM2s: Double
    let whiteDoseMin: Double
}

private func slowHobReads(_ cook: RunningCook, _ c: Calibration, leanHintS: Double) -> SlowHobReads {
    SlowHobReads(
        startedAtS: cook.startedAtS, choices: cook.choices,
        rememberedS: estimateTimeToBoil(cook.boilMemory, litres: cook.choices.waterLitres),
        carryS: leanHintS + cook.nudgeS, alphaM2s: calibrationParams(c).alphaM2s,
        whiteDoseMin: calibrationDoneness(c, level: 1.0).whiteDoseMin
    )
}

/// The TypeScript's `memoPlace`, as whether the memo's place may be taken.
func slowHobMemoFits(
    _ memo: SlowHobMemo?, _ cook: RunningCook, _ c: Calibration, leanHintS: Double, nowS: Double
) -> Bool {
    guard let memo else { return false }
    let e = cook.events
    guard cook.choices.startMode == .cold, e.boilAtS == nil, e.pulled == nil else { return false }
    guard memo.reads == slowHobReads(cook, c, leanHintS: leanHintS) else { return false }
    return memo.steps == 0 || nowS > cook.startedAtS + memo.lastS
}

public func slowHobDue(_ plan: CookPlan, nowS: Double) -> Bool {
    guard let at = plan.slowHobAtS else { return false }
    return nowS > at
}

public func cookTooOld(_ plan: CookPlan, nowS: Double) -> Bool {
    nowS > plan.tooOldAtS
}

public func openEggId(_ cook: RunningCook?, plan: CookPlan?, nowS: Double) -> Double? {
    guard let cook, let plan, !cookTooOld(plan, nowS: nowS) else { return nil }
    return cook.idMs
}

private struct SlowHob {
    let pot: CookPot
    let found: LevelAnswer?
    let lengthened: Bool
    let atS: Double?
    let place: SlowHobMemo
}

private func slowHob(
    _ cook: RunningCook, _ c: Calibration, leanHintS: Double, nowS: Double, memo: SlowHobMemo?, rememberedS: Double
) -> SlowHob {
    let ch = cook.choices
    let start = cook.startedAtS
    let params = calibrationParams(c)
    let carry = leanHintS + cook.nudgeS
    // The memo's place, taken only when it fits: the rule starts where it
    // got to, and its first place needs no solve.
    let resume = slowHobMemoFits(memo, cook, c, leanHintS: leanHintS, nowS: nowS) ? memo : nil
    var ramp = resume?.rampS ?? rememberedS
    var pot = cookSetupOf(ch, timeToBoilS: ramp)
    // Nil while the memo stands for it: solved only if the plan stops there.
    var found: LevelAnswer? = resume == nil
        ? answerAt(c, egg: pot.egg, setup: pot.setup, level: ch.level, profile: nil) : nil
    var lengthened = false
    var at: Double?
    let heated = nowS - start
    let most = Limits.timeToBoilS.upperBound
    var last = 0.0
    var step = 0
    var known: Double?
    if let resume {
        step = resume.steps
        last = resume.lastS
        known = resume.carriedS
        lengthened = step > 0
    }
    // The place to keep: the last lengthening that did not creep.
    var keptSteps = step
    var keptLast = last
    var keptRamp = ramp
    var keptCarried: Double?
    var crept = false
    while true {
        // No longer than the most the app takes for a time to boil.
        if !(ramp < most) { break }
        let t: Double
        if let k = known {
            t = k
            known = nil
        } else {
            let a = found ?? answerAt(
                c, egg: pot.egg, setup: pot.setup, level: ch.level, profile: nil
            )
            found = a
            t = carriedSolution(
                egg: pot.egg, setup: pot.setup, params: params, solution: a.solution, leanS: carry
            ).result.cookTimeS
        }
        if !crept, step == keptSteps { keptCarried = t }
        let next = last + slowHobEveryS
        let due = t - slowHobWhenLeftS
        let creeping = !(due > next)
        let fire = creeping ? next : due
        // Lengthened only once the clock is strictly past the moment, as
        // the plan states it (`slowHobAtS`, `slowHobDue`).
        if !(nowS > start + fire) || step >= slowHobMaxSteps {
            at = start + fire
            break
        }
        // Creeping: once every slowHobEveryS from `next`, up to the last
        // before now.
        last = creeping ? next + slowHobEveryS * (((heated - next) / slowHobEveryS).rounded(.up) - 1) : fire
        ramp = last + slowHobExtraS < most ? last + slowHobExtraS : most
        lengthened = true
        pot = cookSetupOf(ch, timeToBoilS: ramp)
        found = answerAt(c, egg: pot.egg, setup: pot.setup, level: ch.level, profile: nil)
        if creeping {
            crept = true
        } else if !crept {
            keptSteps = step + 1
            keptLast = last
            keptRamp = ramp
            keptCarried = nil
        }
        step += 1
    }
    let place = SlowHobMemo(
        reads: slowHobReads(cook, c, leanHintS: leanHintS), steps: keptSteps, lastS: keptLast, rampS: keptRamp,
        carriedS: keptCarried
    )
    return SlowHob(pot: pot, found: found, lengthened: lengthened, atS: at, place: place)
}

public func replan(
    _ cook: RunningCook, _ c: Calibration, surface: CookSurface?, leanHintS: Double, nowS: Double,
    memo: SlowHobMemo? = nil
) -> CookPlan {
    let ch = cook.choices
    let e = cook.events
    let start = cook.startedAtS
    let pulled = e.pulled
    let cold = ch.startMode == .cold
    let tapAt: Double? = cold ? e.boilAtS : nil
    let provisional = cold && e.boilAtS == nil && pulled == nil
    let params = calibrationParams(c)
    let carry = leanHintS + cook.nudgeS

    // A tap after a late correction to cold runs on the remembered time,
    // unless no pan was remembered.
    var ramp = estimateTimeToBoil(cook.boilMemory, litres: ch.waterLitres)
    if let tap = tapAt, boilTapCounts(cook) { ramp = tap - start }
    let hob = provisional ? slowHob(cook, c, leanHintS: leanHintS, nowS: nowS, memo: memo, rememberedS: ramp) : nil
    let pot = hob?.pot ?? cookSetupOf(ch, timeToBoilS: ramp)
    let found = hob?.found
    let lengthened = hob?.lengthened ?? false

    let mean = found ?? answerAt(c, egg: pot.egg, setup: pot.setup, level: ch.level, profile: nil)
    let inputs = lengthened ? nil : decisionInputs(c, egg: pot.egg, setup: pot.setup)
    var s: CookSurface?
    if let inputs, let surface, inputsKey(surface.inputs) == inputsKey(inputs) { s = surface }
    let profile = s?.profile
    let answer = LevelAnswer(
        solution: mean.solution, verdict: mean.verdict, level: mean.level,
        lowOdds: lowOddsAt(profile, level: mean.level)
    )

    var decided: DecidedAnswer?
    let planned: Solution
    let lean: Double
    let nudge: Double
    if let s {
        let d = decideAnswer(
            c, egg: pot.egg, setup: pot.setup, grid: s.grid, solution: answer.solution, level: answer.level,
            profile: profile, nudgeS: cook.nudgeS
        )
        decided = d
        planned = d.solution
        lean = d.decision.cookTimeS - d.decision.meanCookTimeS
        nudge = d.nudgeS
    } else {
        planned = carriedSolution(
            egg: pot.egg, setup: pot.setup, params: params, solution: answer.solution, leanS: carry
        )
        lean = decisionApplies(answer.solution) ? leanHintS : 0
        nudge = appliedNudge(answer.solution, nudgeS: cook.nudgeS)
    }

    // The latest the cook told the plan something: a correction, or the tap.
    var told = cook.correctedAtS
    if let tapAt, told.map({ tapAt > $0 }) ?? true { told = tapAt }
    var cookTime = planned.result.cookTimeS
    var cookEnd = start + cookTime
    var overdue = false
    if let pulled {
        cookTime = pulled.dueS - start
        cookEnd = pulled.dueS
    } else if !provisional, let told, start + cookTime < told {
        cookTime = told - start
        cookEnd = told
        overdue = true
    }
    // The pull that rang, held, unless the cook has told the plan something
    // since that puts the pull after that moment.
    if pulled == nil, !provisional, let rang = e.rangAtS {
        let undone = told.map { $0 > rang && start + planned.result.cookTimeS > $0 } ?? false
        if !undone {
            cookTime = rang - start
            cookEnd = rang
        }
    }
    let ran = solutionAt(egg: pot.egg, setup: pot.setup, params: params, solution: planned, cookTimeS: cookTime)

    // A pull the clock assumed, and a correction since that would, without
    // it, pull after the correction or heat again: ask.
    var ask = false
    if let pulled, pulled.by == .timeout, !pulled.confirmed, let at = cook.correctedAtS, at >= pulled.outS {
        ask = (cold && e.boilAtS == nil) || start + planned.result.cookTimeS > at
    }

    var cool = countedCoolingS(ran.result, cooling: ch.cooling)
    var coolEnd: Double?
    if countsDown(ch.cooling) {
        let out = pulled?.outS ?? cookEnd + pullGraceSeconds
        if pulled != nil, let cooled = e.cooledAtS {
            // As it ran; but a cooling a correction ended, not yet written
            // down as counted, ends at the counted time if that is sooner.
            let stamped = cooled == cook.correctedAtS && out + cool < cooled
            let end = stamped ? out + cool : cooled
            coolEnd = end
            cool = end - out
        } else {
            coolEnd = out + cool
        }
    }

    var ended = coolEnd ?? pulled?.outS ?? cookEnd + pullGraceSeconds
    // A question open has not ended the cook before it was asked.
    if ask, let at = cook.correctedAtS, at > ended { ended = at }
    let tooOld = provisional ? start + Limits.timeToBoilS.upperBound : ended + restoreWindowS

    var certainty: CertaintyReading?
    var forecast: Forecast?
    if let s {
        let outcome: Outcome
        if let decided, cookTime == decided.solution.result.cookTimeS {
            outcome = decided.outcome
        } else {
            outcome = predictOutcome(c.posterior, s.grid, cookTime, logYolkTarget(answer.level))
        }
        forecast = forecastOf(outcome, cookS: cookTime)
        certainty = certaintyAt(c.posterior, s.grid, cookTime, level: answer.level)
    }

    return CookPlan(
        egg: pot.egg, setup: pot.setup, inputs: inputs, answer: answer, solution: ran, decided: decided,
        leanS: lean, nudgeS: nudge, cookTimeS: cookTime, overdue: overdue, coolS: cool,
        probeMoment: probeMomentFor(ran.result, cooling: ch.cooling),
        deadlines: Deadlines(
            cookEndS: cookEnd, coolEndS: coolEnd, provisional: provisional,
            outAtS: pulled?.by == .cook ? pulled?.outS : nil, asking: ask
        ),
        slowHobAtS: hob?.atS, memo: hob?.place, tooOldAtS: tooOld, certainty: certainty, forecast: forecast
    )
}

public func withOut(_ cook: RunningCook, plan: CookPlan, nowS: Double) -> RunningCook {
    if cook.events.pulled != nil || phaseAt(plan.deadlines, nowS: nowS) != .pull { return cook }
    return appendEntry(cook, .pulled(Pulled(dueS: plan.deadlines.cookEndS, outS: nowS, by: .cook, confirmed: true)))
}

public func eventsDue(_ cook: RunningCook, plan: CookPlan, nowS: Double) -> CookEvents {
    if asksIfStillIn(plan) { return cook.events }
    let d = plan.deadlines
    var pulled = cook.events.pulled
    var cooled = cook.events.cooledAtS
    var rang = cook.events.rangAtS
    if pulled == nil, let r = rang, d.provisional || d.cookEndS != r { rang = nil }
    if pulled == nil, rang == nil, !d.provisional, nowS >= d.cookEndS { rang = d.cookEndS }
    if pulled == nil, !d.provisional, nowS >= d.cookEndS + pullGraceSeconds {
        pulled = Pulled(dueS: d.cookEndS, outS: d.cookEndS + pullGraceSeconds, by: .timeout, confirmed: false)
    }
    if pulled != nil, cooled == nil, let end = d.coolEndS, nowS >= end { cooled = end }
    if pulled != nil, let c = cooled, let end = d.coolEndS, end < c { cooled = end }
    return CookEvents(boilAtS: cook.events.boilAtS, pulled: pulled, cooledAtS: cooled, rangAtS: rang)
}

// MARK: - The memory

public struct BoilToRemember: Sendable, Equatable, Codable {
    public let litres: Double
    public let seconds: Double
}

public func boilToRemember(_ cook: RunningCook) -> BoilToRemember? {
    let ch = cook.choices
    guard ch.startMode == .cold, let tap = cook.events.boilAtS else { return nil }
    let watched = watchedFromS(cook, tap: tap)
    if watched - cook.startedAtS > estimateTimeToBoil(cook.boilMemory, litres: ch.waterLitres) { return nil }
    return BoilToRemember(litres: ch.waterLitres, seconds: tap - cook.startedAtS)
}

private func watchedFromS(_ cook: RunningCook, tap: Double) -> Double {
    let h = coldHistory(cook)
    if let hot = h.firstHotAtS, tap >= hot { return h.coldSinceS ?? cook.startedAtS }
    return cook.idMs / 1000
}

func boilTapCounts(_ cook: RunningCook) -> Bool {
    cook.events.boilAtS != nil && !(boilRemembered(cook) && tappedAfterLateCold(cook))
}

private func tappedAfterLateCold(_ cook: RunningCook) -> Bool {
    guard let tap = cook.events.boilAtS, let hot = coldHistory(cook).firstHotAtS, tap >= hot else { return false }
    let remembered = estimateTimeToBoil(cook.boilMemory, litres: cook.choices.waterLitres)
    return watchedFromS(cook, tap: tap) - cook.startedAtS > remembered
}
