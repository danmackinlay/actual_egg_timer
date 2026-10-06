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

    public init(dueS: Double, outS: Double, by: PulledBy) {
        self.dueS = dueS
        self.outS = outS
        self.by = by
    }
}

/// What was observed, as clock times. Never re-derived; kept when a
/// correction makes one unread.
public struct CookEvents: Sendable, Equatable {
    public var boilAtS: Double?
    public var pulled: Pulled?
    /// The counted cooling ended. Never written on the counter.
    public var cooledAtS: Double?

    public init(boilAtS: Double? = nil, pulled: Pulled? = nil, cooledAtS: Double? = nil) {
        self.boilAtS = boilAtS
        self.pulled = pulled
        self.cooledAtS = cooledAtS
    }

    /// A cook with nothing observed yet.
    public static let none = CookEvents()
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

    public init(
        idMs: Double, startedAtS: Double, choices: CookChoices, events: CookEvents, nudgeS: Double,
        boilMemory: BoilMemory, units: Units, lang: String, boilRemembered: Bool, coldSinceS: Double?
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
    }

    /// The cook as the web stores it, for JSONSerialization: an absent value
    /// is JSON's null, so that `readRunningCook` gives back the same cook.
    public var jsonObject: [String: Any] {
        let c = choices
        let pulled: Any = events.pulled.map {
            ["due_s": $0.dueS, "out_s": $0.outS, "by": $0.by.rawValue] as [String: Any]
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
                "cooledAt_s": events.cooledAtS ?? NSNull(),
            ] as [String: Any],
            "nudge_s": nudgeS,
            "boilMemory": boilMemory,
            "units": units.rawValue,
            "lang": lang,
            "boilRemembered": boilRemembered,
            "coldSince_s": coldSinceS ?? NSNull(),
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
        coldSinceS: choices.startMode == .cold ? start : nil
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
/// kept.
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
    next.coldSinceS = since
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

/// The start corrected to `startedAtS` at `nowS`, or nil: refused when it is
/// later than `latestStartS`, or not a time.
public func startCorrected(_ cook: RunningCook, startedAtS: Double, nowS: Double) -> RunningCook? {
    if !startedAtS.isFinite || startedAtS > latestStartS(cook, nowS: nowS) { return nil }
    var next = cook
    next.startedAtS = startedAtS
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
              let by = (p["by"] as? String).flatMap(PulledBy.init(rawValue:)) else { return nil }
        pulled = Pulled(dueS: due, outS: out, by: by)
    }
    guard let cooled = numberOrNull(r["cooledAt_s"]) else { return nil }
    if let c = cooled {
        guard let pulled, c >= pulled.outS else { return nil }
    }
    return CookEvents(boilAtS: boil, pulled: pulled, cooledAtS: cooled)
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
          let since = numberOrNull(r["coldSince_s"]) else { return nil }
    return RunningCook(
        idMs: id, startedAtS: start, choices: choices, events: events, nudgeS: nudge, boilMemory: memory,
        units: units, lang: lang, boilRemembered: remembered, coldSinceS: since
    )
}
