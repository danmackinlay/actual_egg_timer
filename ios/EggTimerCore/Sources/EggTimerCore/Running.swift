import Foundation

/// A running cook: its start and the log of everything since
/// (design/one-screen.md section 3 and 4; DECISIONS.md 96 to 98).
///
/// Transliterated from `src/core/running.ts`, whose comments say what each
/// part is for, and held to it by `fixtures/running.json` and
/// `fixtures/step.json`. A cook is its start (when the egg went in, and the
/// choices then) and an append-only log; the cook as it stands is the log
/// folded (`appendEntry`), and the plan (`replan`) is derived from it each
/// time, never stored as truth. Times are epoch seconds, except the record's
/// id, the web's milliseconds. Nothing here reads a clock.

// MARK: - The types

/// The cook as chosen: what the sentence, the slider and Settings' pot rows
/// say, in SI.
public struct CookChoices: Sendable, Equatable {
    public var massKg: Double
    public var massFrom: MassFrom
    public var sizeTable: SizeTable?
    public var eggFrom: EggFrom
    public var customStartC: Double
    /// The room as measured, while it counts (`roomInUse`), or nil.
    public var roomC: Double?
    public var startMode: StartMode
    public var afterBoil: HeatAfterBoil
    public var cooling: Cooling
    public var waterLitres: Double
    public var eggCount: Double
    public var altitudeM: Double
    /// The yolk wanted, [0, 1]: the slider.
    public var level: Double

    public init(
        massKg: Double, massFrom: MassFrom, sizeTable: SizeTable?, eggFrom: EggFrom, customStartC: Double,
        roomC: Double?, startMode: StartMode, afterBoil: HeatAfterBoil, cooling: Cooling, waterLitres: Double,
        eggCount: Double, altitudeM: Double, level: Double
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
        self.waterLitres = waterLitres
        self.eggCount = eggCount
        self.altitudeM = altitudeM
        self.level = level
    }

    /// As the web stores it, for JSONSerialization.
    public var jsonObject: [String: Any] {
        [
            "mass_kg": massKg, "massFrom": massFrom.rawValue, "sizeTable": sizeTable?.rawValue ?? NSNull(),
            "eggFrom": eggFrom.rawValue, "customStart_C": customStartC, "room_C": roomC ?? NSNull(),
            "startMode": startMode.rawValue, "afterBoil": afterBoil.rawValue, "cooling": cooling.rawValue,
            "waterLitres": waterLitres, "eggCount": eggCount, "altitude_m": altitudeM, "level": level,
        ]
    }
}

/// The pull: when it was due, when the egg came out, and who said so.
public struct Pulled: Sendable, Equatable {
    public var dueS: Double
    public var outS: Double
    public var by: PulledBy
    /// Whether the egg is known to have come out then: a cook's tap always; a
    /// pull by `timeout` only once the cook says it stands (`pullStands`).
    public var confirmed: Bool

    public init(dueS: Double, outS: Double, by: PulledBy, confirmed: Bool) {
        self.dueS = dueS
        self.outS = outS
        self.by = by
        self.confirmed = confirmed
    }

    var jsonObject: [String: Any] {
        ["due_s": dueS, "out_s": outS, "by": by.rawValue, "confirmed": confirmed]
    }
}

/// What was observed, as clock times: the log's events folded.
public struct CookEvents: Sendable, Equatable {
    public var boilAtS: Double?
    public var pulled: Pulled?
    /// The counted cooling ended. Never written on the counter.
    public var cooledAtS: Double?
    /// The pull rang, the egg still in: held by a plan the cook did not
    /// cause, cleared by anything the cook tells the plan after it.
    public var rangAtS: Double?

    public init(boilAtS: Double? = nil, pulled: Pulled? = nil, cooledAtS: Double? = nil, rangAtS: Double? = nil) {
        self.boilAtS = boilAtS
        self.pulled = pulled
        self.cooledAtS = cooledAtS
        self.rangAtS = rangAtS
    }

    /// A cook with nothing observed yet.
    public static let none = CookEvents()

    var jsonObject: [String: Any] {
        [
            "boilAt_s": boilAtS ?? NSNull(), "pulled": pulled?.jsonObject ?? NSNull(),
            "cooledAt_s": cooledAtS ?? NSNull(), "rangAt_s": rangAtS ?? NSNull(),
        ]
    }
}

/// The plan as the cook ran: what the record says was said for this egg, and
/// what Done shows. See `CookAsRan` in `src/core/running.ts`.
public struct CookAsRan: Sendable, Equatable {
    /// The cook's `correctedAtS` when it was taken (`asRanCurrent`).
    public var correctedAtS: Double?
    public var level: Double
    public var cookS: Double
    public var nudgeS: Double
    public var forecast: Forecast
    /// The peak yolk shown, and whether the cooling ends at it.
    public var peakYolkC: Double
    public var probeMoment: Bool
    /// The model's parameters it was planned under.
    public var params: ModelParams

    public init(
        correctedAtS: Double?, level: Double, cookS: Double, nudgeS: Double, forecast: Forecast, peakYolkC: Double,
        probeMoment: Bool, params: ModelParams
    ) {
        self.correctedAtS = correctedAtS
        self.level = level
        self.cookS = cookS
        self.nudgeS = nudgeS
        self.forecast = forecast
        self.peakYolkC = peakYolkC
        self.probeMoment = probeMoment
        self.params = params
    }

    /// As the web stores it, for JSONSerialization.
    public var jsonObject: [String: Any] {
        [
            "correctedAt_s": correctedAtS ?? NSNull(), "level": level, "cook_s": cookS, "nudge_s": nudgeS,
            "forecast": [
                "cook_s": forecast.cookS, "yolk": forecast.yolk, "white": forecast.white,
                "yolkWord": forecast.yolkWord ?? NSNull(),
            ] as [String: Any],
            "peakYolk_C": peakYolkC, "probeMoment": probeMoment,
            "params": ["alpha_m2s": params.alphaM2s] as [String: Any],
        ]
    }
}

/// When the egg went in and the choices, as at the press of Start.
public struct CookStart: Sendable, Equatable {
    public let atS: Double
    public let choices: CookChoices

    public init(atS: Double, choices: CookChoices) {
        self.atS = atS
        self.choices = choices
    }
}

/// One thing that happened to a cook, as the log keeps it. See `CookEntry` in
/// `src/core/running.ts`.
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

    /// As the web stores it, for JSONSerialization.
    public var jsonObject: [String: Any] {
        var o: [String: Any] = ["kind": kind]
        switch self {
        case let .boil(at), let .stillIn(at), let .logged(at), let .ended(at):
            o["at_s"] = at
        case let .correct(at, choices):
            o["at_s"] = at
            o["choices"] = choices.jsonObject
        case let .start(at, startedAt):
            o["at_s"] = at
            o["startedAt_s"] = startedAt
        case let .pulled(p):
            o["pulled"] = p?.jsonObject ?? NSNull()
        case .stands:
            break
        case let .cooled(at), let .rang(at):
            o["at_s"] = at ?? NSNull()
        case let .ran(r):
            o["asRan"] = r?.jsonObject ?? NSNull()
        case let .answered(at, yolk, white, probe):
            o["at_s"] = at
            o["yolkWord"] = yolk?.rawValue ?? NSNull()
            o["white"] = white?.rawValue ?? NSNull()
            o["probe"] = probe.map { ["centre_C": $0.centreC, "after_s": $0.afterS ?? NSNull()] as [String: Any] }
                ?? NSNull()
        }
        return o
    }
}

/// A running cook: what was fixed at the press, the start and the log, and
/// the log folded, which only core sets (`appendEntry` and the moves over
/// it). See `RunningCook` in `src/core/running.ts`.
public struct RunningCook: Sendable, Equatable {
    /// When Start was pressed, whole ms since 1970: the record's id on the
    /// web. Never corrected.
    public internal(set) var idMs: Double
    /// The nudge this cook drew (E8): 0 when sharing was off at the start.
    public internal(set) var nudgeS: Double
    /// The pans as remembered at the start.
    public internal(set) var boilMemory: BoilMemory
    public internal(set) var units: Units
    public internal(set) var lang: String
    public internal(set) var start: CookStart
    public internal(set) var log: [CookEntry]
    /// The log folded: when the egg went in, the choices, the events, when
    /// last corrected, and the plan as it ran.
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

    /// The cook as the web stores it, for JSONSerialization: what was fixed
    /// at the press, the start and the log, which are read back, and the cook
    /// as it stands, written for whoever reads the store by eye and never read.
    public var jsonObject: [String: Any] {
        [
            "id_ms": idMs, "nudge_s": nudgeS, "boilMemory": boilMemory, "units": units.rawValue, "lang": lang,
            "start": ["at_s": start.atS, "choices": start.choices.jsonObject] as [String: Any],
            "log": log.map(\.jsonObject),
            "startedAt_s": startedAtS, "choices": choices.jsonObject, "events": events.jsonObject,
            "correctedAt_s": correctedAtS ?? NSNull(), "asRan": asRan?.jsonObject ?? NSNull(),
        ]
    }

    /// The cook as it is stored (`storedCook`): what was fixed at the press,
    /// the start and the log, and no more, since the rest is the log folded.
    var storedObject: [String: Any] {
        [
            "id_ms": idMs, "nudge_s": nudgeS, "boilMemory": boilMemory, "units": units.rawValue, "lang": lang,
            "start": ["at_s": start.atS, "choices": start.choices.jsonObject] as [String: Any],
            "log": log.map(\.jsonObject),
        ]
    }
}

// MARK: - The phases and deadlines

/// The phases of a cook, in order.
///
///     IDLE -> HEATING -> COOKING -> PULL -> COOLING -> DONE
public enum Phase: String, Sendable {
    case idle = "IDLE"
    case heating = "HEATING"
    case cooking = "COOKING"
    case pull = "PULL"
    case cooling = "COOLING"
    case done = "DONE"
}

/// Counted-down cooling. Carryover is what ruins a soft egg, so this is a stage
/// of the cook, not a suggestion appended to the end of it.
///
/// This is the FALLBACK: the countdown runs to the moment the yolk's
/// centre peaks (`coolingSecondsFor`). See src/core/running.ts.
public let coolingSeconds = 180.0

/// The shortest counted cooling, s: a floor under a rounding.
public let coolingMinSeconds = 60.0

/// How long to count the cooling down, s from the pull: to the moment the
/// yolk's centre peaks, for this cook as the solver ran it.
public func coolingSecondsFor(_ result: CookResult) -> Double {
    let toPeak = result.peakYolkTimeS - result.cookTimeS
    if !(toPeak > 0.0) { return coolingSeconds }
    let whole = toPeak.rounded()
    return whole < coolingMinSeconds ? coolingMinSeconds : whole
}

/// Whether this cook has a moment to take a probe reading at: a counted
/// cooling that ends when the yolk's centre peaks. Not on the counter, and not
/// when the centre peaked before the egg came out.
public func probeMomentFor(_ result: CookResult, cooling: Cooling) -> Bool {
    if cooling == .counter { return false }
    return result.peakYolkTimeS - result.cookTimeS >= coolingMinSeconds
}

/// How many prior sds of the time-scale either side of the posterior mean a
/// kitchen may be and still have its reading taken.
public let probeAlphaSds = 3.0

/// How far past those kitchens' peaks a reading may land and still be taken, C.
public let probeMarginC = 3.0

/// The centre readings the app will take for this cook, C, as (low, high): a
/// reading outside is refused at entry rather than folded. See
/// src/core/running.ts.
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
    let bath = coolingMediumC(setup.cooling, ambientC: setup.ambientC)
    let floor = min(setup.eggStartC, setup.ambientC, bath)
    let lo = min(slow.peakYolkC, fast.peakYolkC) - probeMarginC
    let hi = max(slow.peakYolkC, fast.peakYolkC) + probeMarginC
    return (lo < floor ? floor : lo, hi > setup.boilingC ? setup.boilingC : hi)
}

/// A slow hob: a cold start still not boiling this close to its provisional
/// deadline, s, has a slower hob than assumed. Both apps push the estimate out
/// to the time heating so far plus `slowHobExtraS`, at most once every
/// `slowHobEveryS`.
public let slowHobWhenLeftS = 45.0
public let slowHobExtraS = 60.0
public let slowHobEveryS = 10.0

/// If nobody confirms the transfer, assume it happened. A stalled timer at the
/// hob is worse than a slightly optimistic one.
public let pullGraceSeconds = 20.0

/// The deadlines a cook is made of, as epoch seconds. `coolEndS` is nil when
/// there is no cooling step to time - resting on the counter, where the
/// carryover IS the point rather than something to wait out.
public struct Deadlines: Sendable {
    public let cookEndS: Double
    public let coolEndS: Double?
    /// True on a cold start until the boil is tapped: the deadline is a guess.
    public let provisional: Bool
    /// When the cook said the eggs were out, inside the pull's grace; nil until
    /// they do. The tap ends the pull, and the cooling (whose deadline the app
    /// then times from the tap) starts there.
    public let outAtS: Double?
    /// The plan asks whether the egg is still in the water (`asksIfStillIn`):
    /// nothing past the question, so the phase that would be Done reads
    /// Cooling until it is answered.
    public let asking: Bool

    public init(cookEndS: Double, coolEndS: Double?, provisional: Bool, outAtS: Double? = nil, asking: Bool = false) {
        self.cookEndS = cookEndS
        self.coolEndS = coolEndS
        self.provisional = provisional
        self.outAtS = outAtS
        self.asking = asking
    }
}

/// Which phase a cook is in at a given instant.
///
/// Pure, and it takes the clock rather than reading it, so one render sees one
/// time. This is the rule both apps derive from, and it exists here because
/// they did not agree on it: this app checked for a cooling deadline BEFORE
/// checking the pull grace, so a counter rest - which has no cooling deadline -
/// fell straight from COOKING to DONE. "Out of the water — now" never appeared,
/// the 20 s grace never ran, and the phone still fired the pull notification at
/// a screen that already said Done. The web app always passed through PULL.
///
/// PULL is therefore unconditional: every cook has a moment where the egg has
/// to come out, whatever happens to it next. It ends early only when the cook
/// says the eggs are out (`outAtS`).
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

/// The cook with one more entry in its log, folded in: the one place the
/// cook as it stands changes.
public func appendEntry(_ cook: RunningCook, _ entry: CookEntry) -> RunningCook {
    var next = applyEntry(cook, entry)
    next.log.append(entry)
    return next
}

/// What one entry does to the cook as it stands.
private func applyEntry(_ cook: RunningCook, _ entry: CookEntry) -> RunningCook {
    var c = cook
    switch entry {
    case let .boil(at):
        c.events.boilAtS = at
    case let .correct(at, choices):
        // After the pull the yolk wanted is not corrected (DECISIONS.md 98);
        // Done on the counter and corrected to a counted cooling: that cooling
        // ended here at the latest.
        let e = cook.events
        c.choices = choices
        if e.pulled != nil { c.choices.level = cook.choices.level }
        if e.pulled != nil, e.cooledAtS == nil, cook.choices.cooling == .counter, choices.cooling != .counter {
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

/// The cook folded from its start and log.
private func foldCook(
    idMs: Double, start: CookStart, nudgeS: Double, boilMemory: BoilMemory, units: Units, lang: String,
    log: [CookEntry]
) -> RunningCook {
    var cook = RunningCook(idMs: idMs, start: start, nudgeS: nudgeS, boilMemory: boilMemory, units: units, lang: lang)
    for entry in log { cook = appendEntry(cook, entry) }
    return cook
}

/// Since when the choices have said a cold start, and the first moment they
/// said a boiling one, from the start and the corrections in the log. See
/// `coldHistory` in `src/core/running.ts`.
public func coldHistory(_ cook: RunningCook) -> (coldSinceS: Double?, firstHotAtS: Double?) {
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

/// What has been said about the egg: the first yolk word, white and probe
/// reading given, each kept once said.
public struct CookAnswers: Sendable, Equatable {
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

/// What has been said about the egg so far.
public func answersOf(_ cook: RunningCook) -> CookAnswers {
    answersIn(cook.log, count: cook.log.count)
}

/// What had been said when the egg's record was last written, or nil.
public func answersLogged(_ cook: RunningCook) -> CookAnswers? {
    guard let i = cook.log.lastIndex(where: { $0.kind == "logged" }) else { return nil }
    return answersIn(cook.log, count: i)
}

/// Whether anything has been said about the egg.
public func answered(_ cook: RunningCook) -> Bool {
    let a = answersOf(cook)
    return a.yolkWord != nil || a.white != nil || a.probe != nil
}

/// When the cook ended (Start again, Cancel, or too old), or nil while it runs.
public func endedAtS(_ cook: RunningCook) -> Double? {
    for entry in cook.log.reversed() {
        if case let .ended(at) = entry { return at }
    }
    return nil
}

/// Whether a measured pan was on file at the start.
public func boilRemembered(_ cook: RunningCook) -> Bool {
    hasBoilMemory(cook.boilMemory)
}

// MARK: - The egg and the pot

/// The solver's egg and pot.
public struct CookPot: Sendable, Equatable {
    public let egg: Egg
    public let setup: CookSetup
}

/// The egg's temperature as it goes in, C.
public func eggStartOf(_ ch: CookChoices) -> Double {
    switch ch.eggFrom {
    case .custom: ch.customStartC
    case .fridge: startTempPresetC(.fridge, roomC: ch.roomC)
    case .room: startTempPresetC(.room, roomC: ch.roomC)
    }
}

/// The egg and the pot the solver is told, for these choices and a time to a
/// rolling boil: the one assembly of both.
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
            eggCount: ch.eggCount
        )
    )
}

// MARK: - The transitions

/// A cook started at `nowS` with these choices, the nudge it drew and the
/// pans as remembered now.
public func startCook(
    nowS: Double, choices: CookChoices, nudgeS: Double, boilMemory: BoilMemory, units: Units, lang: String
) -> RunningCook {
    RunningCook(
        idMs: (nowS * 1000).rounded(), start: CookStart(atS: nowS, choices: choices), nudgeS: nudgeS,
        boilMemory: boilMemory, units: units, lang: lang
    )
}

/// Full rolling boil, tapped at `nowS`: taken only on a cold start still
/// heating, and not before the start.
public func withBoil(_ cook: RunningCook, nowS: Double) -> RunningCook {
    let e = cook.events
    if cook.choices.startMode != .cold || e.boilAtS != nil || e.pulled != nil { return cook }
    if !(nowS >= cook.startedAtS) { return cook }
    return appendEntry(cook, .boil(atS: nowS))
}

/// A correction at `nowS`: the choices replaced, as if they had always been
/// these. See `corrected` in `src/core/running.ts`.
public func corrected(_ cook: RunningCook, choices: CookChoices, nowS: Double) -> RunningCook {
    appendEntry(cook, .correct(atS: nowS, choices: choices))
}

/// The latest the start can be corrected to at `nowS`: now, or the first
/// event, whichever is sooner, an unread one included.
public func latestStartS(_ cook: RunningCook, nowS: Double) -> Double {
    var latest = nowS
    let e = cook.events
    if let boil = e.boilAtS, boil < latest { latest = boil }
    if let pulled = e.pulled, pulled.dueS < latest { latest = pulled.dueS }
    if let cooled = e.cooledAtS, cooled < latest { latest = cooled }
    return latest
}

/// The earliest the start can be corrected to: the most the app takes for a
/// time to boil before Start was pressed (`idMs`), fixed at the press.
public func earliestStartS(_ cook: RunningCook) -> Double {
    cook.idMs / 1000 - Limits.timeToBoilS.upperBound
}

/// The start corrected to `startedAtS` at `nowS`, or nil: refused when it is
/// later than `latestStartS`, earlier than `earliestStartS`, or not a time.
public func startCorrected(_ cook: RunningCook, startedAtS: Double, nowS: Double) -> RunningCook? {
    if !startedAtS.isFinite || startedAtS > latestStartS(cook, nowS: nowS) { return nil }
    if startedAtS < earliestStartS(cook) { return nil }
    return appendEntry(cook, .start(atS: nowS, startedAtS: startedAtS))
}

/// The cook's answer when a plan asks whether the egg is still in the water,
/// at `nowS`: it is. The pull the clock assumed is dropped, with its cooling.
public func stillIn(_ cook: RunningCook, nowS: Double) -> RunningCook {
    guard let p = cook.events.pulled, p.by == .timeout, !p.confirmed else { return cook }
    return appendEntry(cook, .stillIn(atS: nowS))
}

/// The other answer: the egg came out when the clock assumed. The pull stands.
public func pullStands(_ cook: RunningCook) -> RunningCook {
    guard let p = cook.events.pulled, !p.confirmed else { return cook }
    return appendEntry(cook, .stands)
}

/// Whether two sets of events are the same, every field.
public func sameEvents(_ a: CookEvents, _ b: CookEvents) -> Bool {
    a == b
}

/// The cook with its events made `events`: an entry logged for each that
/// differs. The same cook when none does.
public func writeEvents(_ cook: RunningCook, _ events: CookEvents) -> RunningCook {
    var next = cook
    let e = cook.events
    if let boil = events.boilAtS, events.boilAtS != e.boilAtS { next = appendEntry(next, .boil(atS: boil)) }
    if events.pulled != e.pulled { next = appendEntry(next, .pulled(events.pulled)) }
    if events.cooledAtS != next.events.cooledAtS { next = appendEntry(next, .cooled(atS: events.cooledAtS)) }
    if events.rangAtS != e.rangAtS { next = appendEntry(next, .rang(atS: events.rangAtS)) }
    return next
}

/// The cook with `asRan` as its plan as it ran: logged if it differs.
public func withAsRan(_ cook: RunningCook, _ asRan: CookAsRan?) -> RunningCook {
    if asRan == cook.asRan { return cook }
    return appendEntry(cook, .ran(asRan))
}

/// The cook a level asked for after the pull would have made, for the
/// slider's preview: these choices, as if not yet pulled and never corrected.
/// A cook for a plan and nothing else, never stored or stepped. See
/// `levelPreview` in `src/core/running.ts`.
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

/// One entry with every clock time in it moved by `by`.
private func shiftedEntry(_ entry: CookEntry, by: Double) -> CookEntry {
    switch entry {
    case let .boil(at): .boil(atS: at + by)
    case let .correct(at, choices): .correct(atS: at + by, choices: choices)
    case let .start(at, startedAt): .start(atS: at + by, startedAtS: startedAt + by)
    case let .pulled(p):
        .pulled(p.map { Pulled(dueS: $0.dueS + by, outS: $0.outS + by, by: $0.by, confirmed: $0.confirmed) })
    case .stands: .stands
    case let .cooled(at): .cooled(atS: at.map { $0 + by })
    case let .rang(at): .rang(atS: at.map { $0 + by })
    case let .stillIn(at): .stillIn(atS: at + by)
    case let .ran(r):
        .ran(r.map {
            var moved = $0
            moved.correctedAtS = $0.correctedAtS.map { $0 + by }
            return moved
        })
    case let .answered(at, yolk, white, probe): .answered(atS: at + by, yolkWord: yolk, white: white, probe: probe)
    case let .logged(at): .logged(atS: at + by)
    case let .ended(at): .ended(atS: at + by)
    }
}

/// The cook with every clock time in it moved by `by` s, the press with
/// them: what a development clock does to reach a moment without waiting.
public func shiftedCook(_ cook: RunningCook, by: Double) -> RunningCook {
    foldCook(
        idMs: (cook.idMs + by * 1000).rounded(), start: CookStart(atS: cook.start.atS + by, choices: cook.start.choices),
        nudgeS: cook.nudgeS, boilMemory: cook.boilMemory, units: cook.units, lang: cook.lang,
        log: cook.log.map { shiftedEntry($0, by: by) }
    )
}

// MARK: - Two copies of one cook

private func earlier(_ a: Double?, _ b: Double?) -> Double? {
    guard let a else { return b }
    guard let b else { return a }
    return min(a, b)
}

/// The pull to keep of two: the cook's tap over the clock's assumption, and of
/// two alike the earlier out, then the earlier due.
private func betterPull(_ a: Pulled?, _ b: Pulled?) -> Pulled? {
    guard let a else { return b }
    guard let b else { return a }
    if a.by != b.by { return a.by == .cook ? a : b }
    if a.outS != b.outS { return a.outS < b.outS ? a : b }
    return a.dueS <= b.dueS ? a : b
}

/// `ours` with what another copy of the same cook saw taken up. See
/// `takeUpEvents` in `src/core/running.ts`.
public func takeUpEvents(_ ours: RunningCook, _ theirs: RunningCook) -> RunningCook {
    guard theirs.idMs == ours.idMs else { return ours }
    let same = ours.startedAtS == theirs.startedAtS && ours.choices == theirs.choices
    let a = ours.events
    let b = theirs.events
    let boil = earlier(a.boilAtS, b.boilAtS)
    let theirPull = same || b.pulled?.by == .cook ? b.pulled : nil
    let pulled = betterPull(a.pulled, theirPull)
    let cooled = earlier(pulled == a.pulled ? a.cooledAtS : nil, same && pulled == b.pulled ? b.cooledAtS : nil)
    let rang = earlier(a.boilAtS == boil ? a.rangAtS : nil, same && b.boilAtS == boil ? b.rangAtS : nil)
    let events = CookEvents(boilAtS: boil, pulled: pulled, cooledAtS: cooled, rangAtS: rang)
    func fits(_ r: CookAsRan?) -> Bool {
        guard let r, let pulled else { return false }
        return r.cookS == pulled.dueS - ours.startedAtS && r.correctedAtS == ours.correctedAtS
    }
    let asRan = fits(ours.asRan) ? ours.asRan : fits(theirs.asRan) ? theirs.asRan : nil
    if events == a, asRan == ours.asRan { return ours }
    return withAsRan(writeEvents(ours, events), asRan)
}

/// Whether copy `a` of a cook was corrected after copy `b` was.
public func correctedLater(_ a: RunningCook, _ b: RunningCook) -> Bool {
    guard let at = a.correctedAtS else { return false }
    guard let bt = b.correctedAtS else { return true }
    return at > bt
}

// MARK: - The stored cook

/// Whether a value JSONSerialization gave is JSON's true or false, which
/// bridges to Bool as the numbers 0 and 1 do too.
private func isJSONBool(_ v: Any?) -> Bool {
    guard let n = v as? NSNumber else { return false }
    return CFGetTypeID(n) == CFBooleanGetTypeID()
}

/// A finite JSON number that is not a boolean, or nil.
private func finite(_ v: Any?) -> Double? {
    guard !isJSONBool(v), let n = v as? NSNumber else { return nil }
    let d = n.doubleValue
    return d.isFinite ? d : nil
}

/// JSON's null.
private func isNull(_ v: Any?) -> Bool {
    v is NSNull
}

/// A value read where JSON's null is allowed: `value` is nil for the null.
private struct OrNull<T> {
    let value: T?
}

/// A finite number or JSON's null, as `.value`; anything else, or a missing
/// key, nil.
private func numberOrNull(_ v: Any?) -> OrNull<Double>? {
    if isNull(v) { return OrNull(value: nil) }
    guard let d = finite(v) else { return nil }
    return OrNull(value: d)
}

private func readChoices(_ raw: Any?) -> CookChoices? {
    guard let r = raw as? [String: Any] else { return nil }
    guard let mass = finite(r["mass_kg"]), mass > 0,
          let massFrom = (r["massFrom"] as? String).flatMap(MassFrom.init(rawValue:)) else { return nil }
    var table: SizeTable?
    if massFrom == .sizeClass {
        guard let t = (r["sizeTable"] as? String).flatMap(SizeTable.init(rawValue:)) else { return nil }
        table = t
    } else if !isNull(r["sizeTable"]) {
        return nil
    }
    guard let eggFrom = (r["eggFrom"] as? String).flatMap(EggFrom.init(rawValue:)),
          let custom = finite(r["customStart_C"]),
          let room = numberOrNull(r["room_C"]),
          let start = (r["startMode"] as? String).flatMap(StartMode.init(rawValue:)),
          let after = (r["afterBoil"] as? String).flatMap(HeatAfterBoil.init(rawValue:)),
          let cooling = (r["cooling"] as? String).flatMap(Cooling.init(rawValue:)),
          let water = finite(r["waterLitres"]), water > 0,
          let count = finite(r["eggCount"]), count > 0,
          let altitude = finite(r["altitude_m"]),
          let level = finite(r["level"]), level >= 0, level <= 1 else { return nil }
    return CookChoices(
        massKg: mass, massFrom: massFrom, sizeTable: table, eggFrom: eggFrom, customStartC: custom, roomC: room.value,
        startMode: start, afterBoil: after, cooling: cooling, waterLitres: water, eggCount: count,
        altitudeM: altitude, level: level
    )
}

/// A pull, or nil: out before it was due, by nobody, or a cook's own tap
/// unconfirmed.
private func readPulled(_ raw: Any?) -> Pulled? {
    guard let p = raw as? [String: Any],
          let due = finite(p["due_s"]), let out = finite(p["out_s"]), out >= due,
          let by = (p["by"] as? String).flatMap(PulledBy.init(rawValue:)),
          isJSONBool(p["confirmed"]), let confirmed = p["confirmed"] as? Bool,
          by == .timeout || confirmed else { return nil }
    return Pulled(dueS: due, outS: out, by: by, confirmed: confirmed)
}

private func readBoilMemory(_ raw: Any?) -> BoilMemory? {
    guard let r = raw as? [String: Any] else { return nil }
    var out = BoilMemory()
    for (key, value) in r {
        guard let seconds = finite(value), seconds > 0 else { return nil }
        out[key] = seconds
    }
    return out
}

/// `count` finite numbers, or nil.
private func numbers(_ v: Any?, count: Int) -> [Double]? {
    guard let a = v as? [Any], a.count == count else { return nil }
    var out: [Double] = []
    for x in a {
        guard let d = finite(x) else { return nil }
        out.append(d)
    }
    return out
}

/// A forecast as the web writes one, or nil: `parseForecast`'s rules.
private func readForecast(_ raw: Any?) -> Forecast? {
    guard let r = raw as? [String: Any], let t = finite(r["cook_s"]),
          let yolk = numbers(r["yolk"], count: 3), let white = numbers(r["white"], count: 3) else { return nil }
    var words: [Double]?
    if let w = r["yolkWord"], !isNull(w) {
        guard let five = numbers(w, count: 5) else { return nil }
        words = five
    }
    let f = Forecast(cookS: t, yolk: yolk, white: white, yolkWord: words)
    return validForecast(f) ? f : nil
}

/// The plan as it ran, or nil if any field is missing or out of kind.
private func readAsRan(_ raw: Any?) -> CookAsRan? {
    guard let r = raw as? [String: Any],
          let at = numberOrNull(r["correctedAt_s"]),
          let level = finite(r["level"]), level >= 0, level <= 1,
          let cook = finite(r["cook_s"]), cook > 0,
          let nudge = finite(r["nudge_s"]),
          let forecast = readForecast(r["forecast"]),
          let peak = finite(r["peakYolk_C"]),
          isJSONBool(r["probeMoment"]), let probe = r["probeMoment"] as? Bool,
          let params = r["params"] as? [String: Any],
          let alpha = finite(params["alpha_m2s"]), alpha > 0 else { return nil }
    return CookAsRan(
        correctedAtS: at.value, level: level, cookS: cook, nudgeS: nudge, forecast: forecast, peakYolkC: peak,
        probeMoment: probe, params: ModelParams(alphaM2s: alpha)
    )
}

/// A probe reading as the log keeps one, or none (JSON's null), as `.value`;
/// nil if it is neither.
private func readProbe(_ raw: Any?) -> OrNull<ProbeReading>? {
    if isNull(raw) { return OrNull(value: nil) }
    guard let r = raw as? [String: Any], let centre = finite(r["centre_C"]),
          let after = numberOrNull(r["after_s"]) else { return nil }
    return OrNull(value: ProbeReading(centreC: centre, afterS: after.value))
}

/// One entry of a stored log, or nil if it is not one.
private func readEntry(_ raw: Any?) -> CookEntry? {
    guard let r = raw as? [String: Any], let kind = r["kind"] as? String else { return nil }
    let at = finite(r["at_s"])
    switch kind {
    case "boil": return at.map { .boil(atS: $0) }
    case "stillIn": return at.map { .stillIn(atS: $0) }
    case "logged": return at.map { .logged(atS: $0) }
    case "ended": return at.map { .ended(atS: $0) }
    case "correct":
        guard let at, let choices = readChoices(r["choices"]) else { return nil }
        return .correct(atS: at, choices: choices)
    case "start":
        guard let at, let startedAt = finite(r["startedAt_s"]) else { return nil }
        return .start(atS: at, startedAtS: startedAt)
    case "pulled":
        if isNull(r["pulled"]) { return .pulled(nil) }
        return readPulled(r["pulled"]).map { .pulled($0) }
    case "stands": return .stands
    case "cooled": return numberOrNull(r["at_s"]).map { .cooled(atS: $0.value) }
    case "rang": return numberOrNull(r["at_s"]).map { .rang(atS: $0.value) }
    case "ran":
        if isNull(r["asRan"]) { return .ran(nil) }
        return readAsRan(r["asRan"]).map { .ran($0) }
    case "answered":
        guard let at, let probe = readProbe(r["probe"]) else { return nil }
        var yolk: YolkWord?
        if !isNull(r["yolkWord"]) {
            guard let w = (r["yolkWord"] as? String).flatMap(YolkWord.init(rawValue:)) else { return nil }
            yolk = w
        }
        var white: WhiteReport?
        if !isNull(r["white"]) {
            guard let w = (r["white"] as? String).flatMap(WhiteReport.init(rawValue:)) else { return nil }
            white = w
        }
        return .answered(atS: at, yolkWord: yolk, white: white, probe: probe.value)
    default:
        return nil
    }
}

/// Whether the folded events are in order. See `foldInOrder` in
/// `src/core/running.ts`.
private func foldInOrder(_ cook: RunningCook) -> Bool {
    let e = cook.events
    let start = cook.startedAtS
    if let b = e.boilAtS, b < start { return false }
    if let p = e.pulled, p.dueS < start { return false }
    if let c = e.cooledAtS {
        guard let p = e.pulled, c >= p.outS else { return false }
    }
    if let r = e.rangAtS, r < start { return false }
    if let at = cook.correctedAtS, at < start { return false }
    if cook.asRan != nil, e.pulled == nil { return false }
    if let at = cook.asRan?.correctedAtS, at < start { return false }
    return true
}

/// A stored cook, parsed from its JSON and read defensively: whole, or nil.
/// What was fixed at the press, the start and the log are read, and the log
/// folded again; the cook as it stood when written is not read.
public func readRunningCook(_ raw: Any?) -> RunningCook? {
    guard let r = raw as? [String: Any],
          let id = finite(r["id_ms"]), id > 0,
          let nudge = finite(r["nudge_s"]),
          let memory = readBoilMemory(r["boilMemory"]),
          let units = (r["units"] as? String).flatMap(Units.init(rawValue:)),
          let lang = r["lang"] as? String, !lang.isEmpty,
          let start = r["start"] as? [String: Any],
          let at = finite(start["at_s"]), at > 0,
          let choices = readChoices(start["choices"]),
          let rawLog = r["log"] as? [Any] else { return nil }
    var log: [CookEntry] = []
    for item in rawLog {
        guard let entry = readEntry(item) else { return nil }
        log.append(entry)
    }
    let cook = foldCook(
        idMs: id, start: CookStart(atS: at, choices: choices), nudgeS: nudge, boilMemory: memory, units: units,
        lang: lang, log: log
    )
    return foldInOrder(cook) ? cook : nil
}

// MARK: - The cook as stored

/// Whether the egg had been written down with an answer when the cook was
/// stored. See `KeptAnswers` in `src/core/running.ts`.
public enum KeptAnswers: String, Sendable {
    case unanswered = "none"
    case beforeReload
}

/// A cook in progress as both apps store it (`StoreRegistry.cook`): the cook,
/// whether its egg was answered, and the lean last decided. Written by
/// JSONEncoder and read by JSONDecoder, to the bit, through `JSONValue`, and
/// read whole by `readStoredCook`.
public struct StoredCook: Sendable, Equatable {
    public let cook: RunningCook
    public let answers: KeptAnswers
    public let leanHintS: Double

    public init(cook: RunningCook, answers: KeptAnswers, leanHintS: Double) {
        self.cook = cook
        self.answers = answers
        self.leanHintS = leanHintS
    }

    /// As both apps store it, for JSONSerialization. See `storedCook`.
    public var jsonObject: [String: Any] {
        stamped(StoreRegistry.cook, [
            "cook": cook.storedObject, "answers": answers.rawValue, "leanHint_s": leanHintS,
        ])
    }
}

/// A stored cook read back, parsed JSON: whole, or nil. See `readStoredCook`
/// in `src/core/running.ts`.
public func readStoredCook(_ raw: Any?) -> StoredCook? {
    guard let o = inFormat(StoreRegistry.cook, raw),
          let cook = readRunningCook(o["cook"]),
          let answers = (o["answers"] as? String).flatMap(KeptAnswers.init(rawValue:)),
          let hint = finite(o["leanHint_s"]) else { return nil }
    return StoredCook(cook: cook, answers: answers, leanHintS: hint)
}

extension StoredCook: Codable {
    public init(from decoder: Decoder) throws {
        let value = try JSONValue(from: decoder)
        guard let stored = readStoredCook(value.any) else {
            throw DecodingError.dataCorrupted(
                DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "not a stored cook")
            )
        }
        self = stored
    }

    public func encode(to encoder: Encoder) throws {
        try JSONValue(jsonObject).encode(to: encoder)
    }
}

// MARK: - Stored to the bit

/// A JSON value, read and written exactly: what a stored cook goes through.
/// JSONSerialization reads a 17-digit double back an ulp off, and an ulp in
/// the mass is another decision surface's key, so a cook is written by
/// JSONEncoder (each double's shortest round-trip form) and read by
/// JSONDecoder (to the bit) into this, and then read whole by
/// `readRunningCook`, the one reader, as the web reads it.
enum JSONValue: Codable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let d = try? c.decode(Double.self) {
            self = .number(d)
        } else if let s = try? c.decode(String.self) {
            self = .string(s)
        } else if let a = try? c.decode([JSONValue].self) {
            self = .array(a)
        } else {
            self = .object(try c.decode([String: JSONValue].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case let .bool(b): try c.encode(b)
        case let .number(d): try c.encode(d)
        case let .string(s): try c.encode(s)
        case let .array(a): try c.encode(a)
        case let .object(o): try c.encode(o)
        }
    }

    /// A value as this core's `jsonObject`s hold them: Swift's own types.
    init(_ v: Any) {
        if v is NSNull {
            self = .null
        } else if let n = v as? NSNumber {
            // Swift's Bool bridges to CFBoolean, its numbers to other NSNumbers.
            self = CFGetTypeID(n) == CFBooleanGetTypeID() ? .bool(n.boolValue) : .number(n.doubleValue)
        } else if let s = v as? String {
            self = .string(s)
        } else if let a = v as? [Any] {
            self = .array(a.map(JSONValue.init))
        } else if let o = v as? [String: Any] {
            self = .object(o.mapValues(JSONValue.init))
        } else {
            self = .null
        }
    }

    /// As JSONSerialization gives it, for the readers.
    var any: Any {
        switch self {
        case .null: NSNull()
        case let .bool(b): b
        case let .number(d): d
        case let .string(s): s
        case let .array(a): a.map(\.any)
        case let .object(o): o.mapValues(\.any)
        }
    }
}

extension RunningCook: Codable {
    public init(from decoder: Decoder) throws {
        let value = try JSONValue(from: decoder)
        guard let cook = readRunningCook(value.any) else {
            throw DecodingError.dataCorrupted(
                DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "not a running cook")
            )
        }
        self = cook
    }

    public func encode(to encoder: Encoder) throws {
        try JSONValue(jsonObject).encode(to: encoder)
    }
}

// MARK: - The plan

/// A pot's decision surface, as the app built it off the main thread, with
/// the inputs it was built for and the pot's odds profile if that is in.
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

/// Where the slow hob's rule got to in one plan, handed to the next
/// (`replan`'s `memo`). Opaque to the apps, which hand it back and never read
/// it. See `SlowHobMemo` and `SlowHobPlace` in `src/core/running.ts`.
public struct SlowHobMemo: Sendable, Equatable {
    /// What the rule read, to the bit (`slowHobKey`).
    let key: String
    let steps: Int
    let lastS: Double
    let rampS: Double
    /// The carried cook time at `rampS`; nil when no plan needed it.
    let carriedS: Double?
}

/// Everything derived from a cook. Never stored as truth. `replan` in
/// `src/core/running.ts` says what each part is.
public struct CookPlan: Sendable {
    public let egg: Egg
    public let setup: CookSetup
    /// Nil while the slow hob has lengthened the guess (`guessLengthened`).
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
    /// What `phaseAt` reads: `provisional` while the time to boil is a
    /// guess, `asking` while the plan asks whether the egg is still in.
    public let deadlines: Deadlines
    /// While provisional, when the slow hob's rule next lengthens the guess:
    /// the app plans again once the clock is past it (`slowHobDue`).
    public let slowHobAtS: Double?
    /// While provisional, where the slow hob's rule got to, for the next plan.
    public let memo: SlowHobMemo?
    /// When the cook is too old to pick back up (`cookTooOld`).
    public let tooOldAtS: Double
    public let certainty: CertaintyReading?
    public let forecast: Forecast?
}

/// Whether the slow hob has lengthened the guess: the pull moves with the
/// clock, so no time left is shown from it.
public func guessLengthened(_ plan: CookPlan) -> Bool {
    plan.inputs == nil
}

/// Whether the plan asks whether the egg is still in the water.
public func asksIfStillIn(_ plan: CookPlan) -> Bool {
    plan.deadlines.asking
}

/// The choices as a key: every field, numbers to the bit.
private func choicesKey(_ ch: CookChoices) -> String {
    [
        ch.massFrom.rawValue, ch.sizeTable?.rawValue ?? "-", ch.eggFrom.rawValue, ch.startMode.rawValue,
        ch.afterBoil.rawValue, ch.cooling.rawValue, numberKey(ch.massKg), numberKey(ch.customStartC),
        ch.roomC.map(numberKey) ?? "-", numberKey(ch.waterLitres), numberKey(ch.eggCount), numberKey(ch.altitudeM),
        numberKey(ch.level),
    ].joined(separator: "|")
}

/// What the slow hob's rule reads, as a key.
private func slowHobKey(_ cook: RunningCook, _ c: Calibration, leanHintS: Double) -> String {
    let p = calibrationParams(c)
    return [
        numberKey(cook.startedAtS), choicesKey(cook.choices),
        numberKey(estimateTimeToBoil(cook.boilMemory, litres: cook.choices.waterLitres)),
        numberKey(leanHintS + cook.nudgeS), numberKey(p.alphaM2s),
        numberKey(calibrationDoneness(c, level: 1.0).whiteDoseMin),
    ].joined(separator: "/")
}

/// Whether the slow hob's memo may be taken for `cook` under `c` with
/// `leanHintS`, at `nowS`: still heating on a guess, worked out under the
/// same start, choices, remembered time, lean and nudge, parameters and white
/// target, and the clock past the place kept. Otherwise it is ignored.
public func slowHobMemoFits(
    _ memo: SlowHobMemo?, _ cook: RunningCook, _ c: Calibration, leanHintS: Double, nowS: Double
) -> Bool {
    guard let memo else { return false }
    let e = cook.events
    guard cook.choices.startMode == .cold, e.boilAtS == nil, e.pulled == nil else { return false }
    guard memo.key == slowHobKey(cook, c, leanHintS: leanHintS) else { return false }
    return memo.steps == 0 || nowS > cook.startedAtS + memo.lastS
}

/// Whether the slow hob's moment has come at `nowS`: strictly past
/// `slowHobAtS`, the one comparison `replan` lengthens by.
public func slowHobDue(_ plan: CookPlan, nowS: Double) -> Bool {
    guard let at = plan.slowHobAtS else { return false }
    return nowS > at
}

/// Whether two decision surfaces' inputs are the same pot, egg and posterior:
/// the same key (`inputsKey`).
public func sameDecisionInputs(_ a: DecisionInputs, _ b: DecisionInputs) -> Bool {
    inputsKey(a) == inputsKey(b)
}

/// The most lengthenings one plan works through.
public let slowHobMaxSteps = 100

/// How long past its end a cook is still worth picking back up, s.
public let restoreWindowS = 3600.0

/// Whether a cook is too old to pick back up at `nowS`, from its plan.
public func cookTooOld(_ plan: CookPlan, nowS: Double) -> Bool {
    nowS > plan.tooOldAtS
}

/// The id of the egg still open to correction: the stored running cook's,
/// until it is too old to pick back up; nil when there is none.
public func openEggId(_ cook: RunningCook?, plan: CookPlan?, nowS: Double) -> Double? {
    guard let cook, let plan, !cookTooOld(plan, nowS: nowS) else { return nil }
    return cook.idMs
}

/// Whether the cook on a screen is still the egg open to correction.
public func cookStillOpen(_ cook: RunningCook, plan: CookPlan, storedIdMs: Double?, nowS: Double) -> Bool {
    storedIdMs == cook.idMs && !cookTooOld(plan, nowS: nowS)
}

/// The plan for a cook at `nowS`, under calibration `c`. `nowS` is read by
/// the slow hob's rule alone. See `replan` in `src/core/running.ts`.
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
    if let tap = tapAt, !(boilRemembered(cook) && tappedAfterLateCold(cook)) { ramp = tap - start }
    // The memo's place, taken only when it fits: the rule starts where it
    // got to, and its first place needs no solve.
    let resume = provisional && slowHobMemoFits(memo, cook, c, leanHintS: leanHintS, nowS: nowS) ? memo : nil
    if let resume { ramp = resume.rampS }
    var pot = cookSetupOf(ch, timeToBoilS: ramp)
    // Nil while the memo stands for it: solved only if the plan stops there.
    var found: LevelAnswer? = resume == nil
        ? answerAt(c, egg: pot.egg, setup: pot.setup, level: ch.level, profile: nil) : nil
    var lengthened = false
    var slowHobAt: Double?
    var place: SlowHobMemo?

    if provisional {
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
                slowHobAt = start + fire
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
        place = SlowHobMemo(
            key: slowHobKey(cook, c, leanHintS: leanHintS), steps: keptSteps, lastS: keptLast, rampS: keptRamp,
            carriedS: keptCarried
        )
    }

    let mean = found ?? answerAt(c, egg: pot.egg, setup: pot.setup, level: ch.level, profile: nil)
    let inputs = lengthened ? nil : decisionInputs(c, egg: pot.egg, setup: pot.setup)
    var s: CookSurface?
    if let inputs, let surface, sameDecisionInputs(surface.inputs, inputs) { s = surface }
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

    var cool = coolingSecondsFor(ran.result)
    var coolEnd: Double?
    if ch.cooling != .counter {
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
        slowHobAtS: slowHobAt, memo: place, tooOldAtS: tooOld, certainty: certainty, forecast: forecast
    )
}

/// The cook's tap out of the pull at `nowS`: taken only while `plan` says
/// Pull, and the pull it records is the one that rang.
public func withOut(_ cook: RunningCook, plan: CookPlan, nowS: Double) -> RunningCook {
    if cook.events.pulled != nil || phaseAt(plan.deadlines, nowS: nowS) != .pull { return cook }
    return appendEntry(cook, .pulled(Pulled(dueS: plan.deadlines.cookEndS, outS: nowS, by: .cook, confirmed: true)))
}

/// The events the clock alone decides, as of `nowS`, from the plan that rang.
/// See `eventsDue` in `src/core/running.ts`.
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

// MARK: - The cook as it ran

/// The plan as it ran, from `plan`: nil unless the cook is pulled, `plan` is
/// on its pot's surface, and it is a plan of the cook as pulled.
private func asRanOf(_ cook: RunningCook, _ plan: CookPlan) -> CookAsRan? {
    guard let pulled = cook.events.pulled, plan.decided != nil, let forecast = plan.forecast,
          let inputs = plan.inputs, plan.cookTimeS == pulled.dueS - cook.startedAtS else { return nil }
    return CookAsRan(
        correctedAtS: cook.correctedAtS, level: plan.answer.level, cookS: plan.cookTimeS, nudgeS: plan.nudgeS,
        forecast: forecast, peakYolkC: plan.solution.result.peakYolkC, probeMoment: plan.probeMoment,
        params: inputs.params
    )
}

/// The cook with the plan as it ran kept: taken from `plan` the first time
/// the cook is pulled and `plan` is on its surface.
public func keepAsRan(_ cook: RunningCook, plan: CookPlan) -> RunningCook {
    guard cook.asRan == nil, cook.events.pulled != nil, let ran = asRanOf(cook, plan) else { return cook }
    return appendEntry(cook, .ran(ran))
}

/// Whether the cook's plan as it ran is kept and taken since its last
/// correction.
public func asRanCurrent(_ cook: RunningCook) -> Bool {
    guard let ran = cook.asRan, cook.events.pulled != nil else { return false }
    return ran.correctedAtS == cook.correctedAtS
}

/// What Done shows for the cook: the plan as it ran, kept; until it is kept,
/// the same from `plan` on its surface; otherwise nil, and Done shows `plan`.
public func asRanShown(_ cook: RunningCook, plan: CookPlan) -> CookAsRan? {
    if cook.asRan != nil { return asRanCurrent(cook) ? cook.asRan : nil }
    return asRanOf(cook, plan)
}

/// The solve as the cook ran, for the texture note beside the peak.
public func solutionAsRan(_ plan: CookPlan, ran: CookAsRan) -> Solution {
    if let p = plan.inputs?.params, p.alphaM2s == ran.params.alphaM2s, plan.cookTimeS == ran.cookS {
        return plan.solution
    }
    let sol = plan.solution
    return Solution(
        result: simulate(egg: plan.egg, setup: plan.setup, params: ran.params, cookTimeS: ran.cookS),
        reachable: sol.reachable, minCookTimeS: sol.minCookTimeS,
        softestLevel: sol.softestLevel, hardestLevel: sol.hardestLevel, whiteSets: sol.whiteSets
    )
}

/// A correction after the pull, as it ran: the corrected cook planned on
/// `before`, the calibration before this egg, on that calibration's surface
/// for the corrected pot; nil while `surface` is not that pot's.
public func asRanCorrected(
    _ cook: RunningCook, before: Calibration, surface: CookSurface?, nowS: Double
) -> RunningCook? {
    guard cook.events.pulled != nil else { return cook }
    guard let ran = asRanOf(cook, replan(cook, before, surface: surface, leanHintS: 0, nowS: nowS)) else {
        return nil
    }
    return appendEntry(cook, .ran(ran))
}

// MARK: - The record, the memory

/// What an app adds to a cook's facts: which app and build, the prior's
/// population, the local day the cook started, and the record's id (none on
/// iOS).
public struct RecordContext: Sendable, Equatable {
    public var app: AppName
    public var appVersion: String
    public var prior: String
    public var day: String
    public var id: Int?

    public init(app: AppName, appVersion: String, prior: String, day: String, id: Int?) {
        self.app = app
        self.appVersion = appVersion
        self.prior = prior
        self.day = day
        self.id = id
    }
}

/// Why `cookFactsFor` made no facts.
public enum FactsRefused: String, Sendable, Equatable {
    case noSurface, stale
}

/// The facts, or why there are none: exactly one is nil.
public struct CookFactsResult: Sendable, Equatable {
    public let facts: CookFacts?
    public let refused: FactsRefused?
}

/// The facts `recordFor` makes the record of. See `cookFactsFor` in
/// `src/core/running.ts`.
public func cookFactsFor(
    _ cook: RunningCook, plan: CookPlan, context ctx: RecordContext, yolkWord: YolkWord?, white: WhiteReport?,
    probe: ProbeReading?
) -> CookFactsResult {
    if cook.asRan != nil, !asRanCurrent(cook) { return CookFactsResult(facts: nil, refused: .stale) }
    let level: Double
    let cookS: Double
    let nudgeS: Double
    let forecast: Forecast
    if let kept = cook.asRan {
        (level, cookS, nudgeS, forecast) = (kept.level, kept.cookS, kept.nudgeS, kept.forecast)
    } else if plan.decided != nil, let f = plan.forecast {
        (level, cookS, nudgeS, forecast) = (plan.answer.level, plan.cookTimeS, plan.nudgeS, f)
    } else {
        return CookFactsResult(facts: nil, refused: .noSurface)
    }
    let pulled = cook.events.pulled
    let remembered = boilRemembered(cook)
    return CookFactsResult(facts: CookFacts(
        app: ctx.app, appVersion: ctx.appVersion, prior: ctx.prior, day: ctx.day, id: ctx.id,
        massKg: plan.egg.massKg, massFrom: cook.choices.massFrom, sizeTable: cook.choices.sizeTable,
        setup: plan.setup, eggFrom: cook.choices.eggFrom, boilRemembered: remembered,
        level: level, cookS: cookS, nudgeS: nudgeS,
        outS: pulled?.by == .cook ? pulled.map { $0.outS - cook.startedAtS } : nil,
        coolS: plan.coolS, yolkWord: yolkWord, white: white, probe: probe, forecast: forecast,
        lang: cook.lang, units: cook.units,
        boilTapped: cook.events.boilAtS != nil && !(remembered && tappedAfterLateCold(cook))
    ), refused: nil)
}

/// A measured time to a rolling boil, for the boil memory.
public struct BoilToRemember: Sendable, Equatable {
    public let litres: Double
    public let seconds: Double
}

/// What the boil memory learns from this cook, written when it ends.
public func boilToRemember(_ cook: RunningCook) -> BoilToRemember? {
    let ch = cook.choices
    guard ch.startMode == .cold, let tap = cook.events.boilAtS else { return nil }
    let watched = watchedFromS(cook, tap: tap)
    if watched - cook.startedAtS > estimateTimeToBoil(cook.boilMemory, litres: ch.waterLitres) { return nil }
    return BoilToRemember(litres: ch.waterLitres, seconds: tap - cook.startedAtS)
}

/// When the cook began watching for the boil tapped at `tap`.
private func watchedFromS(_ cook: RunningCook, tap: Double) -> Double {
    let h = coldHistory(cook)
    if let hot = h.firstHotAtS, tap >= hot { return h.coldSinceS ?? cook.startedAtS }
    return cook.idMs / 1000
}

/// Whether the boil was tapped after a correction from boiling to cold made
/// later than this water's remembered time to boil.
private func tappedAfterLateCold(_ cook: RunningCook) -> Bool {
    guard let tap = cook.events.boilAtS, let hot = coldHistory(cook).firstHotAtS, tap >= hot else { return false }
    let remembered = estimateTimeToBoil(cook.boilMemory, litres: cook.choices.waterLitres)
    return watchedFromS(cook, tap: tap) - cook.startedAtS > remembered
}

/// What a cook leaves when it ends, by Cancel or by Start again.
public struct CookEnding: Sendable, Equatable {
    public let boil: BoilToRemember?
    public let finished: Bool
    /// The record must be made again before the cook is forgotten.
    public let remake: Bool
}

public func cookEnding(_ cook: RunningCook, plan: CookPlan, nowS: Double) -> CookEnding {
    CookEnding(
        boil: boilToRemember(cook), finished: !asksIfStillIn(plan) && phaseAt(plan.deadlines, nowS: nowS) == .done,
        remake: cook.events.pulled != nil && cook.asRan != nil && !asRanCurrent(cook)
    )
}
