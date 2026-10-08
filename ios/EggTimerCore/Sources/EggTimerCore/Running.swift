import Foundation

/// A running cook: its start, its choices and what it observed
/// (design/one-screen.md section 3 and 4; DECISIONS.md 96 and 97).
///
/// Transliterated from `src/core/running.ts`, whose comments say what each
/// part is for, and held to it by `fixtures/running.json`. A cook is its
/// start, its choices and its events; the plan (`replan`) is derived from
/// them each time and never stored as truth. Times are epoch seconds, except
/// the record's id, the web's milliseconds. Nothing here reads a clock.

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
}

/// What was observed, as clock times. Never re-derived; kept when a
/// correction makes one unread.
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
}

/// The plan as the cook ran (running-cook review 1.3, 2.4): what the record
/// says was said for this egg, and what Done shows, kept with the cook from
/// the first plan on the pot's surface made once the egg is pulled
/// (`keepAsRan`), and replaced only by a correction planned on the calibration
/// before this egg (`asRanCorrected`). See `CookAsRan` in
/// `src/core/running.ts`.
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
            "params": ["alpha_m2s": params.alphaM2s, "tauAirScale": params.tauAirScale] as [String: Any],
        ]
    }
}

public struct RunningCook: Sendable, Equatable {
    /// When Start was pressed, whole ms since 1970: the record's id on the
    /// web. Never corrected.
    public var idMs: Double
    /// When the egg went in: correctable, never after now or the first event.
    public var startedAtS: Double
    public var choices: CookChoices
    public var events: CookEvents
    /// The nudge this cook drew (E8): 0 when sharing was off at the start.
    public var nudgeS: Double
    /// The pans as remembered at the start.
    public var boilMemory: BoilMemory
    public var units: Units
    public var lang: String
    /// Whether a measured pan was on file at the start.
    public var boilRemembered: Bool
    /// Since when the choices have said a cold start; nil while they say
    /// boiling (`boilToRemember`).
    public var coldSinceS: Double?
    /// The first moment the choices said a boiling start: the start for a
    /// cook begun hot, the first correction to boiling for one begun cold;
    /// nil if they never have (`boilToRemember`).
    public var firstHotAtS: Double?
    /// When the choices or the start were last corrected; nil until they
    /// are. A plan never puts the pull before it (`replan`).
    public var correctedAtS: Double?
    /// The plan as it ran, from the pull on; nil before it, and until a plan
    /// on the pot's surface has been made since (`keepAsRan`).
    public var asRan: CookAsRan?

    public init(
        idMs: Double, startedAtS: Double, choices: CookChoices, events: CookEvents, nudgeS: Double,
        boilMemory: BoilMemory, units: Units, lang: String, boilRemembered: Bool, coldSinceS: Double?,
        firstHotAtS: Double?, correctedAtS: Double?, asRan: CookAsRan? = nil
    ) {
        self.idMs = idMs
        self.startedAtS = startedAtS
        self.choices = choices
        self.events = events
        self.nudgeS = nudgeS
        self.boilMemory = boilMemory
        self.units = units
        self.lang = lang
        self.boilRemembered = boilRemembered
        self.coldSinceS = coldSinceS
        self.firstHotAtS = firstHotAtS
        self.correctedAtS = correctedAtS
        self.asRan = asRan
    }

    /// The cook as the web stores it, for JSONSerialization: an absent value
    /// is JSON's null, so that `readRunningCook` gives back the same cook.
    public var jsonObject: [String: Any] {
        let c = choices
        let pulled: Any = events.pulled.map {
            ["due_s": $0.dueS, "out_s": $0.outS, "by": $0.by.rawValue, "confirmed": $0.confirmed] as [String: Any]
        } ?? NSNull()
        return [
            "id_ms": idMs,
            "startedAt_s": startedAtS,
            "choices": [
                "mass_kg": c.massKg, "massFrom": c.massFrom.rawValue,
                "sizeTable": c.sizeTable?.rawValue ?? NSNull(), "eggFrom": c.eggFrom.rawValue,
                "customStart_C": c.customStartC, "room_C": c.roomC ?? NSNull(),
                "startMode": c.startMode.rawValue, "afterBoil": c.afterBoil.rawValue,
                "cooling": c.cooling.rawValue, "waterLitres": c.waterLitres, "eggCount": c.eggCount,
                "altitude_m": c.altitudeM, "level": c.level,
            ] as [String: Any],
            "events": [
                "boilAt_s": events.boilAtS ?? NSNull(), "pulled": pulled,
                "cooledAt_s": events.cooledAtS ?? NSNull(), "rangAt_s": events.rangAtS ?? NSNull(),
            ] as [String: Any],
            "nudge_s": nudgeS,
            "boilMemory": boilMemory,
            "units": units.rawValue,
            "lang": lang,
            "boilRemembered": boilRemembered,
            "coldSince_s": coldSinceS ?? NSNull(),
            "firstHotAt_s": firstHotAtS ?? NSNull(),
            "correctedAt_s": correctedAtS ?? NSNull(),
            "asRan": asRan?.jsonObject ?? NSNull(),
        ]
    }
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
/// rolling boil: the one assembly of both (once `Planner.setup` and `egg`).
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

/// A cook started at `nowMs` (epoch ms) with these choices, the nudge it
/// drew and the pans as remembered now.
public func startCook(
    nowMs: Double, choices: CookChoices, nudgeS: Double, boilMemory: BoilMemory, units: Units, lang: String
) -> RunningCook {
    let start = nowMs / 1000
    return RunningCook(
        idMs: nowMs.rounded(), startedAtS: start, choices: choices, events: .none, nudgeS: nudgeS,
        boilMemory: boilMemory, units: units, lang: lang, boilRemembered: hasBoilMemory(boilMemory),
        coldSinceS: choices.startMode == .cold ? start : nil, firstHotAtS: choices.startMode == .hot ? start : nil,
        correctedAtS: nil
    )
}

/// Full rolling boil, tapped at `nowS`: taken only on a cold start still
/// heating, and not before the start.
public func withBoil(_ cook: RunningCook, nowS: Double) -> RunningCook {
    let e = cook.events
    if cook.choices.startMode != .cold || e.boilAtS != nil || e.pulled != nil { return cook }
    if !(nowS >= cook.startedAtS) { return cook }
    var next = cook
    next.events.boilAtS = nowS
    return next
}

/// A correction at `nowS`: the choices replaced. The start and the events are
/// kept, but for a pull that rang; after the pull, the level the egg was
/// pulled at is kept (the slider only previews).
public func corrected(_ cook: RunningCook, choices: CookChoices, nowS: Double) -> RunningCook {
    var since: Double?
    if choices.startMode == .cold {
        if cook.choices.startMode == .cold, let kept = cook.coldSinceS {
            since = kept
        } else {
            since = nowS
        }
    }
    var next = cook
    next.choices = choices
    if cook.events.pulled != nil { next.choices.level = cook.choices.level }
    if cook.firstHotAtS == nil, choices.startMode == .hot { next.firstHotAtS = nowS }
    next.events.rangAtS = nil
    next.coldSinceS = since
    next.correctedAtS = nowS
    return next
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
    var next = cook
    next.startedAtS = startedAtS
    next.events.rangAtS = nil
    next.correctedAtS = nowS
    return next
}

/// The cook's answer when a plan asks (`askIfStillIn`), at `nowS`: the egg is
/// still in the water. The pull the clock assumed is dropped, with its
/// cooling, and the cook is planned again as told now.
public func stillIn(_ cook: RunningCook, nowS: Double) -> RunningCook {
    guard let p = cook.events.pulled, p.by == .timeout, !p.confirmed else { return cook }
    var next = cook
    next.asRan = nil
    next.events.pulled = nil
    next.events.cooledAtS = nil
    next.events.rangAtS = nil
    next.correctedAtS = nowS
    return next
}

/// The other answer: the egg came out when the clock assumed. The pull stands.
public func pullStands(_ cook: RunningCook) -> RunningCook {
    guard let p = cook.events.pulled, !p.confirmed else { return cook }
    var next = cook
    next.events.pulled?.confirmed = true
    return next
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

/// A finite number or JSON's null, as `.some(nil)`; anything else, or a
/// missing key, `nil`.
private func numberOrNull(_ v: Any?) -> Double?? {
    if isNull(v) { return .some(nil) }
    guard let d = finite(v) else { return nil }
    return .some(d)
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
        massKg: mass, massFrom: massFrom, sizeTable: table, eggFrom: eggFrom, customStartC: custom, roomC: room,
        startMode: start, afterBoil: after, cooling: cooling, waterLitres: water, eggCount: count,
        altitudeM: altitude, level: level
    )
}

private func readEvents(_ raw: Any?, startS: Double) -> CookEvents? {
    guard let r = raw as? [String: Any] else { return nil }
    guard let boil = numberOrNull(r["boilAt_s"]) else { return nil }
    if let b = boil, b < startS { return nil }
    var pulled: Pulled?
    if !isNull(r["pulled"]) {
        guard let p = r["pulled"] as? [String: Any],
              let due = finite(p["due_s"]), due >= startS,
              let out = finite(p["out_s"]), out >= due,
              let by = (p["by"] as? String).flatMap(PulledBy.init(rawValue:)),
              isJSONBool(p["confirmed"]), let confirmed = p["confirmed"] as? Bool,
              by == .timeout || confirmed else { return nil }
        pulled = Pulled(dueS: due, outS: out, by: by, confirmed: confirmed)
    }
    guard let cooled = numberOrNull(r["cooledAt_s"]) else { return nil }
    if let c = cooled {
        guard let pulled, c >= pulled.outS else { return nil }
    }
    guard let rang = numberOrNull(r["rangAt_s"]) else { return nil }
    if let at = rang, at < startS { return nil }
    return CookEvents(boilAtS: boil, pulled: pulled, cooledAtS: cooled, rangAtS: rang)
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
private func readAsRan(_ raw: Any?, startS: Double) -> CookAsRan? {
    guard let r = raw as? [String: Any],
          let at = numberOrNull(r["correctedAt_s"]),
          let level = finite(r["level"]), level >= 0, level <= 1,
          let cook = finite(r["cook_s"]), cook > 0,
          let nudge = finite(r["nudge_s"]),
          let forecast = readForecast(r["forecast"]),
          let peak = finite(r["peakYolk_C"]),
          isJSONBool(r["probeMoment"]), let probe = r["probeMoment"] as? Bool,
          let params = r["params"] as? [String: Any],
          let alpha = finite(params["alpha_m2s"]), alpha > 0,
          let tau = finite(params["tauAirScale"]), tau > 0 else { return nil }
    if let a = at, a < startS { return nil }
    return CookAsRan(
        correctedAtS: at, level: level, cookS: cook, nudgeS: nudge, forecast: forecast, peakYolkC: peak,
        probeMoment: probe, params: ModelParams(alphaM2s: alpha, tauAirScale: tau)
    )
}

/// A stored cook, parsed from its JSON and read defensively: whole, or nil.
/// A shape this build cannot read is reported, not guessed at.
public func readRunningCook(_ raw: Any?) -> RunningCook? {
    guard let r = raw as? [String: Any] else { return nil }
    guard let id = finite(r["id_ms"]), id > 0,
          let start = finite(r["startedAt_s"]), start > 0,
          let choices = readChoices(r["choices"]),
          let events = readEvents(r["events"], startS: start),
          let nudge = finite(r["nudge_s"]),
          let memory = readBoilMemory(r["boilMemory"]),
          let units = (r["units"] as? String).flatMap(Units.init(rawValue:)),
          let lang = r["lang"] as? String, !lang.isEmpty,
          isJSONBool(r["boilRemembered"]), let remembered = r["boilRemembered"] as? Bool,
          let since = numberOrNull(r["coldSince_s"]),
          let firstHot = numberOrNull(r["firstHotAt_s"]),
          let correctedAt = numberOrNull(r["correctedAt_s"]) else { return nil }
    if let at = correctedAt, at < start { return nil }
    // The plan as it ran: present, null or whole, and only once pulled.
    guard r.keys.contains("asRan") else { return nil }
    var asRan: CookAsRan?
    if !isNull(r["asRan"]) {
        guard let ran = readAsRan(r["asRan"], startS: start), events.pulled != nil else { return nil }
        asRan = ran
    }
    return RunningCook(
        idMs: id, startedAtS: start, choices: choices, events: events, nudgeS: nudge, boilMemory: memory,
        units: units, lang: lang, boilRemembered: remembered, coldSinceS: since, firstHotAtS: firstHot,
        correctedAtS: correctedAt, asRan: asRan
    )
}

// MARK: - Stored to the bit

// The cook in the web's stored shape, for JSONEncoder and JSONDecoder (Swift
// only: the web's JSON.parse is exact). JSONSerialization reads a 17-digit
// double back an ulp off, and an ulp in the mass is another decision
// surface's key, so a cook stored through it rebuilt its surface on every
// relaunch; JSONEncoder writes each double's shortest round-trip form and
// JSONDecoder reads it back to the bit. Absent values are written as JSON's
// null, as the web writes them. Decoding checks the shape only: a decoded
// cook is still read through `readRunningCook(cook.jsonObject)`, which is
// exact, since nothing in between is text.

extension CookChoices: Codable {
    private enum CodingKeys: String, CodingKey {
        case massKg = "mass_kg", massFrom, sizeTable, eggFrom, customStartC = "customStart_C"
        case roomC = "room_C", startMode, afterBoil, cooling, waterLitres, eggCount
        case altitudeM = "altitude_m", level
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            massKg: try c.decode(Double.self, forKey: .massKg),
            massFrom: try c.decode(MassFrom.self, forKey: .massFrom),
            sizeTable: try c.decodeIfPresent(SizeTable.self, forKey: .sizeTable),
            eggFrom: try c.decode(EggFrom.self, forKey: .eggFrom),
            customStartC: try c.decode(Double.self, forKey: .customStartC),
            roomC: try c.decodeIfPresent(Double.self, forKey: .roomC),
            startMode: try c.decode(StartMode.self, forKey: .startMode),
            afterBoil: try c.decode(HeatAfterBoil.self, forKey: .afterBoil),
            cooling: try c.decode(Cooling.self, forKey: .cooling),
            waterLitres: try c.decode(Double.self, forKey: .waterLitres),
            eggCount: try c.decode(Double.self, forKey: .eggCount),
            altitudeM: try c.decode(Double.self, forKey: .altitudeM),
            level: try c.decode(Double.self, forKey: .level)
        )
    }

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
        try c.encode(waterLitres, forKey: .waterLitres)
        try c.encode(eggCount, forKey: .eggCount)
        try c.encode(altitudeM, forKey: .altitudeM)
        try c.encode(level, forKey: .level)
    }
}

extension Pulled: Codable {
    private enum CodingKeys: String, CodingKey {
        case dueS = "due_s", outS = "out_s", by, confirmed
    }
}

extension CookEvents: Codable {
    private enum CodingKeys: String, CodingKey {
        case boilAtS = "boilAt_s", pulled, cooledAtS = "cooledAt_s", rangAtS = "rangAt_s"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            boilAtS: try c.decodeIfPresent(Double.self, forKey: .boilAtS),
            pulled: try c.decodeIfPresent(Pulled.self, forKey: .pulled),
            cooledAtS: try c.decodeIfPresent(Double.self, forKey: .cooledAtS),
            rangAtS: try c.decodeIfPresent(Double.self, forKey: .rangAtS)
        )
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(boilAtS, forKey: .boilAtS)
        try c.encode(pulled, forKey: .pulled)
        try c.encode(cooledAtS, forKey: .cooledAtS)
        try c.encode(rangAtS, forKey: .rangAtS)
    }
}

extension CookAsRan: Codable {
    private enum CodingKeys: String, CodingKey {
        case correctedAtS = "correctedAt_s", level, cookS = "cook_s", nudgeS = "nudge_s", forecast
        case peakYolkC = "peakYolk_C", probeMoment, params
    }

    private enum ParamsKeys: String, CodingKey {
        case alphaM2s = "alpha_m2s", tauAirScale
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let p = try c.nestedContainer(keyedBy: ParamsKeys.self, forKey: .params)
        self.init(
            correctedAtS: try c.decodeIfPresent(Double.self, forKey: .correctedAtS),
            level: try c.decode(Double.self, forKey: .level),
            cookS: try c.decode(Double.self, forKey: .cookS),
            nudgeS: try c.decode(Double.self, forKey: .nudgeS),
            forecast: try c.decode(Forecast.self, forKey: .forecast),
            peakYolkC: try c.decode(Double.self, forKey: .peakYolkC),
            probeMoment: try c.decode(Bool.self, forKey: .probeMoment),
            params: ModelParams(
                alphaM2s: try p.decode(Double.self, forKey: .alphaM2s),
                tauAirScale: try p.decode(Double.self, forKey: .tauAirScale)
            )
        )
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(correctedAtS, forKey: .correctedAtS)
        try c.encode(level, forKey: .level)
        try c.encode(cookS, forKey: .cookS)
        try c.encode(nudgeS, forKey: .nudgeS)
        try c.encode(forecast, forKey: .forecast)
        try c.encode(peakYolkC, forKey: .peakYolkC)
        try c.encode(probeMoment, forKey: .probeMoment)
        var p = c.nestedContainer(keyedBy: ParamsKeys.self, forKey: .params)
        try p.encode(params.alphaM2s, forKey: .alphaM2s)
        try p.encode(params.tauAirScale, forKey: .tauAirScale)
    }
}

extension RunningCook: Codable {
    private enum CodingKeys: String, CodingKey {
        case idMs = "id_ms", startedAtS = "startedAt_s", choices, events, nudgeS = "nudge_s", boilMemory
        case units, lang, boilRemembered, coldSinceS = "coldSince_s", firstHotAtS = "firstHotAt_s"
        case correctedAtS = "correctedAt_s", asRan
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            idMs: try c.decode(Double.self, forKey: .idMs),
            startedAtS: try c.decode(Double.self, forKey: .startedAtS),
            choices: try c.decode(CookChoices.self, forKey: .choices),
            events: try c.decode(CookEvents.self, forKey: .events),
            nudgeS: try c.decode(Double.self, forKey: .nudgeS),
            boilMemory: try c.decode(BoilMemory.self, forKey: .boilMemory),
            units: try c.decode(Units.self, forKey: .units),
            lang: try c.decode(String.self, forKey: .lang),
            boilRemembered: try c.decode(Bool.self, forKey: .boilRemembered),
            coldSinceS: try c.decodeIfPresent(Double.self, forKey: .coldSinceS),
            firstHotAtS: try c.decodeIfPresent(Double.self, forKey: .firstHotAtS),
            correctedAtS: try c.decodeIfPresent(Double.self, forKey: .correctedAtS),
            asRan: try c.decodeIfPresent(CookAsRan.self, forKey: .asRan)
        )
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(idMs, forKey: .idMs)
        try c.encode(startedAtS, forKey: .startedAtS)
        try c.encode(choices, forKey: .choices)
        try c.encode(events, forKey: .events)
        try c.encode(nudgeS, forKey: .nudgeS)
        try c.encode(boilMemory, forKey: .boilMemory)
        try c.encode(units, forKey: .units)
        try c.encode(lang, forKey: .lang)
        try c.encode(boilRemembered, forKey: .boilRemembered)
        try c.encode(coldSinceS, forKey: .coldSinceS)
        try c.encode(firstHotAtS, forKey: .firstHotAtS)
        try c.encode(correctedAtS, forKey: .correctedAtS)
        try c.encode(asRan, forKey: .asRan)
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

/// Everything derived from a cook. Never stored as truth. `replan` in
/// `src/core/running.ts` says what each part is.
public struct CookPlan: Sendable {
    public let egg: Egg
    public let setup: CookSetup
    public let provisional: Bool
    public let lengthened: Bool
    public let inputs: DecisionInputs?
    public let answer: LevelAnswer
    public let level: Double
    public let solution: Solution
    public let decided: DecidedAnswer?
    public let leanS: Double
    public let nudgeS: Double
    public let cookTimeS: Double
    public let overdue: Bool
    public let askIfStillIn: Bool
    public let coolS: Double
    public let probeMoment: Bool
    public let deadlines: Deadlines
    public let slowHobAtS: Double?
    /// While provisional, where the slow hob's rule got to, for the next plan
    /// to start from (`replan`'s `hint`); nil otherwise.
    public let slowHob: SlowHobHint?
    /// When the cook is too old to pick back up (`cookTooOld`).
    public let tooOldAtS: Double
    public let certainty: CertaintyReading?
    public let forecast: Forecast?
}

/// Where the slow hob's rule got to in one plan, and what it was worked out
/// under (review 2.1): handed to the next plan, which starts the rule there.
/// The place kept is the last lengthening that did not creep, which the rule
/// from the start passes through at any later moment. See `SlowHobHint` in
/// `src/core/running.ts`.
public struct SlowHobHint: Sendable, Equatable {
    public let startedAtS: Double
    public let choices: CookChoices
    /// The remembered time to boil the rule starts from, s.
    public let fromRampS: Double
    /// The lean carried and the cook's nudge, s.
    public let carryS: Double
    public let params: ModelParams
    public let whiteDoseMin: Double
    public let steps: Int
    public let lastS: Double
    public let rampS: Double
    /// The carried cook time at `rampS`; nil when no plan needed it.
    public let carriedS: Double?

    public init(
        startedAtS: Double, choices: CookChoices, fromRampS: Double, carryS: Double, params: ModelParams,
        whiteDoseMin: Double, steps: Int, lastS: Double, rampS: Double, carriedS: Double?
    ) {
        self.startedAtS = startedAtS
        self.choices = choices
        self.fromRampS = fromRampS
        self.carryS = carryS
        self.params = params
        self.whiteDoseMin = whiteDoseMin
        self.steps = steps
        self.lastS = lastS
        self.rampS = rampS
        self.carriedS = carriedS
    }
}

/// Whether the slow hob's `hint` may be taken for `cook` under `c` with
/// `leanHintS`, at `nowS`: still heating on a guess, the same start, choices,
/// remembered time, lean and nudge, calibration parameters and white target,
/// to the bit, and the clock past the place kept. Otherwise it is ignored.
public func slowHobHintFits(
    _ hint: SlowHobHint, _ cook: RunningCook, _ c: Calibration, leanHintS: Double, nowS: Double
) -> Bool {
    let ch = cook.choices
    let e = cook.events
    guard ch.startMode == .cold, e.boilAtS == nil, e.pulled == nil else { return false }
    guard hint.startedAtS == cook.startedAtS, hint.choices == ch else { return false }
    guard hint.fromRampS == estimateTimeToBoil(cook.boilMemory, litres: ch.waterLitres) else { return false }
    guard hint.carryS == leanHintS + cook.nudgeS else { return false }
    let p = calibrationParams(c)
    guard hint.params.alphaM2s == p.alphaM2s, hint.params.tauAirScale == p.tauAirScale else { return false }
    guard hint.whiteDoseMin == calibrationDoneness(c, level: 1.0).whiteDoseMin else { return false }
    return hint.steps == 0 || nowS - cook.startedAtS > hint.lastS
}

/// Whether two decision surfaces' inputs are the same pot, egg and posterior:
/// every number equal.
public func sameDecisionInputs(_ a: DecisionInputs, _ b: DecisionInputs) -> Bool {
    a == b
}

/// The most lengthenings one plan works through.
public let slowHobMaxSteps = 100

/// How long past its end a cook is still worth picking back up, s.
public let restoreWindowS = 3600.0

/// Whether a stored cook is too old to pick back up at `nowS`, from its plan.
public func cookTooOld(_ plan: CookPlan, nowS: Double) -> Bool {
    nowS > plan.tooOldAtS
}

/// The id of the egg still open to correction: the stored running cook's,
/// until it is too old to pick back up; nil when there is none. Every other
/// logged egg is final.
public func openEggId(_ cook: RunningCook?, plan: CookPlan?, nowS: Double) -> Double? {
    guard let cook, let plan, !cookTooOld(plan, nowS: nowS) else { return nil }
    return cook.idMs
}

/// The plan for a cook at `nowS`, under calibration `c`. `nowS` is read by
/// the slow hob's rule alone. See `replan` in `src/core/running.ts`.
public func replan(
    _ cook: RunningCook, _ c: Calibration, surface: CookSurface?, leanHintS: Double, nowS: Double,
    hint: SlowHobHint? = nil
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
    // unless no pan was remembered (review 1.2).
    var ramp = estimateTimeToBoil(cook.boilMemory, litres: ch.waterLitres)
    if let tap = tapAt, !(cook.boilRemembered && tappedAfterLateCold(cook)) { ramp = tap - start }
    let fromRamp = ramp
    // The slow hob's hint, taken only when it fits: the rule starts where it
    // got to, and its first place needs no solve.
    var resume: SlowHobHint?
    if provisional, let hint, slowHobHintFits(hint, cook, c, leanHintS: leanHintS, nowS: nowS) { resume = hint }
    if let resume { ramp = resume.rampS }
    var pot = cookSetupOf(ch, timeToBoilS: ramp)
    // Nil while the hint stands for it: solved only if the plan stops there.
    var found: LevelAnswer? = resume == nil
        ? answerAt(c, egg: pot.egg, setup: pot.setup, level: ch.level, profile: nil, snapRetry: true) : nil
    var lengthened = false
    var slowHobAt: Double?
    var slowHob: SlowHobHint?

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
                    c, egg: pot.egg, setup: pot.setup, level: ch.level, profile: nil, snapRetry: true
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
            if !(heated > fire) || step >= slowHobMaxSteps {
                slowHobAt = start + fire
                break
            }
            // Creeping: once every slowHobEveryS from `next`, up to the last
            // before now.
            last = creeping ? next + slowHobEveryS * (((heated - next) / slowHobEveryS).rounded(.up) - 1) : fire
            ramp = last + slowHobExtraS < most ? last + slowHobExtraS : most
            lengthened = true
            pot = cookSetupOf(ch, timeToBoilS: ramp)
            found = answerAt(c, egg: pot.egg, setup: pot.setup, level: ch.level, profile: nil, snapRetry: true)
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
        slowHob = SlowHobHint(
            startedAtS: start, choices: ch, fromRampS: fromRamp, carryS: carry, params: params,
            whiteDoseMin: calibrationDoneness(c, level: 1.0).whiteDoseMin,
            steps: keptSteps, lastS: keptLast, rampS: keptRamp, carriedS: keptCarried
        )
    }

    let mean = found ?? answerAt(c, egg: pot.egg, setup: pot.setup, level: ch.level, profile: nil, snapRetry: true)
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
    if pulled == nil, !provisional, let rang = e.rangAtS {
        cookTime = rang - start
        cookEnd = rang
    }
    let ran = solutionAt(egg: pot.egg, setup: pot.setup, params: params, solution: planned, cookTimeS: cookTime)

    // A pull the clock assumed, and a correction since that would, without
    // it, pull after the correction or heat again: ask, rather than land in
    // the cooling.
    var ask = false
    if let pulled, pulled.by == .timeout, !pulled.confirmed, let at = cook.correctedAtS, at >= pulled.outS {
        // Only a correction that leaves the egg still to cook when it was made.
        ask = (cold && e.boilAtS == nil) || start + planned.result.cookTimeS > at
    }

    var cool = coolingSecondsFor(ran.result)
    var coolEnd: Double?
    if ch.cooling != .counter {
        let out = pulled?.outS ?? cookEnd + pullGraceSeconds
        if pulled != nil, let cooled = e.cooledAtS {
            coolEnd = cooled
            cool = cooled - out
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
        egg: pot.egg, setup: pot.setup, provisional: provisional, lengthened: lengthened, inputs: inputs,
        answer: answer, level: answer.level, solution: ran, decided: decided, leanS: lean, nudgeS: nudge,
        cookTimeS: cookTime, overdue: overdue, askIfStillIn: ask, coolS: cool,
        probeMoment: probeMomentFor(ran.result, cooling: ch.cooling),
        deadlines: Deadlines(
            cookEndS: cookEnd, coolEndS: coolEnd, provisional: provisional,
            outAtS: pulled?.by == .cook ? pulled?.outS : nil, asking: ask
        ),
        slowHobAtS: slowHobAt, slowHob: slowHob, tooOldAtS: tooOld, certainty: certainty, forecast: forecast
    )
}

/// The cook's tap out of the pull at `nowS`: taken only while `plan` says
/// Pull, and the pull it records is the one that rang.
public func withOut(_ cook: RunningCook, plan: CookPlan, nowS: Double) -> RunningCook {
    if cook.events.pulled != nil || phaseAt(plan.deadlines, nowS: nowS) != .pull { return cook }
    var next = cook
    next.events.pulled = Pulled(dueS: plan.deadlines.cookEndS, outS: nowS, by: .cook, confirmed: true)
    return next
}

/// The events the clock alone decides, as of `nowS`, from the plan that rang:
/// the pull rang, the grace ran out (unconfirmed) and the counted cooling
/// ended.
public func eventsDue(_ cook: RunningCook, plan: CookPlan, nowS: Double) -> CookEvents {
    // While the plan asks whether the egg is still in, the clock decides
    // nothing (running-cook review 3).
    if plan.askIfStillIn { return cook.events }
    let d = plan.deadlines
    var pulled = cook.events.pulled
    var cooled = cook.events.cooledAtS
    var rang = cook.events.rangAtS
    if pulled == nil, rang == nil, !d.provisional, nowS >= d.cookEndS { rang = d.cookEndS }
    if pulled == nil, !d.provisional, nowS >= d.cookEndS + pullGraceSeconds {
        pulled = Pulled(dueS: d.cookEndS, outS: d.cookEndS + pullGraceSeconds, by: .timeout, confirmed: false)
    }
    if pulled != nil, cooled == nil, let end = d.coolEndS, nowS >= end { cooled = end }
    return CookEvents(boilAtS: cook.events.boilAtS, pulled: pulled, cooledAtS: cooled, rangAtS: rang)
}

// MARK: - The cook as it ran

/// The plan as it ran, from `plan`: nil unless the cook is pulled, `plan` is
/// on its pot's surface, and it is a plan of the cook as pulled (its cook
/// time the pull's, to the bit).
private func asRanOf(_ cook: RunningCook, _ plan: CookPlan) -> CookAsRan? {
    guard let pulled = cook.events.pulled, plan.decided != nil, let forecast = plan.forecast,
          let inputs = plan.inputs, plan.cookTimeS == pulled.dueS - cook.startedAtS else { return nil }
    return CookAsRan(
        correctedAtS: cook.correctedAtS, level: plan.level, cookS: plan.cookTimeS, nudgeS: plan.nudgeS,
        forecast: forecast, peakYolkC: plan.solution.result.peakYolkC, probeMoment: plan.probeMoment,
        params: inputs.params
    )
}

/// The cook with the plan as it ran kept: taken from `plan` the first time
/// the cook is pulled and `plan`, a plan of the cook as pulled, is on its
/// surface. Otherwise the cook as it was. See `keepAsRan` in
/// `src/core/running.ts`.
public func keepAsRan(_ cook: RunningCook, plan: CookPlan) -> RunningCook {
    guard cook.asRan == nil, cook.events.pulled != nil, let ran = asRanOf(cook, plan) else { return cook }
    var kept = cook
    kept.asRan = ran
    return kept
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

/// A correction after the pull, as it ran: the corrected cook planned on
/// `before`, the calibration before this egg, on that calibration's surface
/// for the corrected pot; nil while `surface` is not that pot's. Before the
/// pull, the cook as it was.
public func asRanCorrected(
    _ cook: RunningCook, before: Calibration, surface: CookSurface?, nowS: Double
) -> RunningCook? {
    guard cook.events.pulled != nil else { return cook }
    guard let ran = asRanOf(cook, replan(cook, before, surface: surface, leanHintS: 0, nowS: nowS)) else {
        return nil
    }
    var again = cook
    again.asRan = ran
    return again
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

/// Why `cookFactsFor` made no facts: no plan as it ran kept and `plan` not on
/// its surface (plan on the surface `plan.inputs` asks for, `keepAsRan`, ask
/// again), or one kept before a correction since (`asRanCorrected`).
public enum FactsRefused: String, Sendable, Equatable {
    case noSurface, stale
}

/// The facts, or why there are none: exactly one is nil.
public struct CookFactsResult: Sendable, Equatable {
    public let facts: CookFacts?
    public let refused: FactsRefused?
}

/// The facts `recordFor` makes the record of, from the cook as last corrected
/// and its plan, with whichever answers have been given: the level, cook
/// time, nudge and forecast from the plan as it ran when kept, else from
/// `plan` on its surface; never from a plan with no surface.
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
        (level, cookS, nudgeS, forecast) = (plan.level, plan.cookTimeS, plan.nudgeS, f)
    } else {
        return CookFactsResult(facts: nil, refused: .noSurface)
    }
    let pulled = cook.events.pulled
    return CookFactsResult(facts: CookFacts(
        app: ctx.app, appVersion: ctx.appVersion, prior: ctx.prior, day: ctx.day, id: ctx.id,
        massKg: plan.egg.massKg, massFrom: cook.choices.massFrom, sizeTable: cook.choices.sizeTable,
        setup: plan.setup, eggFrom: cook.choices.eggFrom, boilRemembered: cook.boilRemembered,
        level: level, cookS: cookS, nudgeS: nudgeS,
        outS: pulled?.by == .cook ? pulled.map { $0.outS - cook.startedAtS } : nil,
        coolS: plan.coolS, yolkWord: yolkWord, white: white, probe: probe, forecast: forecast,
        lang: cook.lang, units: cook.units,
        boilTapped: cook.events.boilAtS != nil && !(cook.boilRemembered && tappedAfterLateCold(cook))
    ), refused: nil)
}

/// A measured time to a rolling boil, for the boil memory.
public struct BoilToRemember: Sendable, Equatable {
    public let litres: Double
    public let seconds: Double
}

/// What the boil memory learns from this cook, written when it ends: the tap
/// on a cold start, unless the cook was told to watch for it only after the
/// water could already have boiled.
public func boilToRemember(_ cook: RunningCook) -> BoilToRemember? {
    let ch = cook.choices
    guard ch.startMode == .cold, let tap = cook.events.boilAtS else { return nil }
    let watched = watchedFromS(cook, tap: tap)
    if watched - cook.startedAtS > estimateTimeToBoil(cook.boilMemory, litres: ch.waterLitres) { return nil }
    return BoilToRemember(litres: ch.waterLitres, seconds: tap - cook.startedAtS)
}

/// When the cook began watching for the boil tapped at `tap`: when Start was
/// pressed, for a tap before the choices first said boiling; otherwise when
/// they last said cold.
private func watchedFromS(_ cook: RunningCook, tap: Double) -> Double {
    if let hot = cook.firstHotAtS, tap >= hot { return cook.coldSinceS ?? cook.startedAtS }
    return cook.idMs / 1000
}

/// Whether the boil was tapped after a correction from boiling to cold made
/// later than this water's remembered time to boil.
private func tappedAfterLateCold(_ cook: RunningCook) -> Bool {
    guard let tap = cook.events.boilAtS, let hot = cook.firstHotAtS, tap >= hot else { return false }
    let remembered = estimateTimeToBoil(cook.boilMemory, litres: cook.choices.waterLitres)
    return watchedFromS(cook, tap: tap) - cook.startedAtS > remembered
}

/// What a cook leaves when it ends, by Cancel or by Start again: the boil to
/// remember, and whether it was cooked through and so is an egg to log.
public struct CookEnding: Sendable, Equatable {
    public let boil: BoilToRemember?
    public let finished: Bool
}

public func cookEnding(_ cook: RunningCook, plan: CookPlan, nowS: Double) -> CookEnding {
    CookEnding(
        boil: boilToRemember(cook), finished: !plan.askIfStillIn && phaseAt(plan.deadlines, nowS: nowS) == .done
    )
}
