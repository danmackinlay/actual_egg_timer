import Foundation
import EggTimerCore

/// The cook in progress as this app stores it (`StoreRegistry.cook`), so a
/// relaunch does not lose the egg: the cook, whether its egg was answered,
/// and the lean last decided. The web stores its own in the same shape
/// (`src/ui/storedCook.ts`).
///
/// What is written is what was fixed at the press, the start and the log;
/// the cook as it stands is the log folded again on reading, by core's
/// `foldCook`, and nothing derived is stored as truth. Written by
/// JSONEncoder (each double's shortest round-trip form) and read by
/// JSONDecoder, to the bit: an ulp in the mass is another decision surface's
/// key.
///
/// Read defensively, whole or not at all: a cook is what the calibration
/// learns from and what the alarms ring for, so a shape this build cannot
/// read - another format, a field missing or out of kind, an entry it does
/// not know, events out of order - fails to decode, and `Cook` drops it. A
/// field that may be JSON's null must still be there. Extra fields are
/// ignored.
public struct StoredCook: Sendable, Equatable {
    public let cook: RunningCook
    public let answers: KeptAnswers
    public let leanHintS: Double

    public init(cook: RunningCook, answers: KeptAnswers, leanHintS: Double) {
        self.cook = cook
        self.answers = answers
        self.leanHintS = leanHintS
    }
}

/// Whether the egg had been written down with an answer when the cook was
/// stored: a cook stored as answered is read back as answered, so its egg is
/// never logged a second time.
public enum KeptAnswers: String, Sendable, Codable {
    case unanswered = "none"
    case beforeReload
}

/// A stored value this build does not take.
private func refused(_ why: String) -> DecodingError {
    DecodingError.dataCorrupted(DecodingError.Context(codingPath: [], debugDescription: why))
}

private func require(_ ok: Bool, _ why: String) throws {
    if !ok { throw refused(why) }
}

extension StoredCook: Codable {
    private enum Keys: String, CodingKey {
        case v, cook, answers
        case leanHintS = "leanHint_s"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        try require(try c.decode(Int.self, forKey: .v) == StoreRegistry.cook.format, "another format")
        cook = try c.decode(StoredRunningCook.self, forKey: .cook).cook
        answers = try c.decode(KeptAnswers.self, forKey: .answers)
        leanHintS = try c.decode(Double.self, forKey: .leanHintS)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(StoreRegistry.cook.format, forKey: .v)
        try c.encode(StoredRunningCook(cook), forKey: .cook)
        try c.encode(answers, forKey: .answers)
        try c.encode(leanHintS, forKey: .leanHintS)
    }
}

// MARK: - The cook

/// A running cook as stored: the press, the start and the log.
private struct StoredRunningCook: Codable {
    let cook: RunningCook

    init(_ cook: RunningCook) { self.cook = cook }

    enum Keys: String, CodingKey {
        case idMs = "id_ms", nudgeS = "nudge_s", boilMemory, units, lang, start, log
        case atS = "at_s", choices
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let id = try c.decode(Double.self, forKey: .idMs)
        let memory = try c.decode(BoilMemory.self, forKey: .boilMemory)
        let lang = try c.decode(String.self, forKey: .lang)
        let start = try c.nestedContainer(keyedBy: Keys.self, forKey: .start)
        let at = try start.decode(Double.self, forKey: .atS)
        try require(id > 0 && memory.values.allSatisfy { $0 > 0 } && !lang.isEmpty && at > 0, "the press")
        let folded = foldCook(
            idMs: id, start: CookStart(atS: at, choices: try start.decode(StoredChoices.self, forKey: .choices).choices),
            nudgeS: try c.decode(Double.self, forKey: .nudgeS), boilMemory: memory,
            units: try c.decode(Units.self, forKey: .units), lang: lang,
            log: try c.decode([StoredEntry].self, forKey: .log).map(\.entry)
        )
        try require(inOrder(folded), "events out of order")
        cook = folded
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(cook.idMs, forKey: .idMs)
        try c.encode(cook.nudgeS, forKey: .nudgeS)
        try c.encode(cook.boilMemory, forKey: .boilMemory)
        try c.encode(cook.units, forKey: .units)
        try c.encode(cook.lang, forKey: .lang)
        var start = c.nestedContainer(keyedBy: Keys.self, forKey: .start)
        try start.encode(cook.start.atS, forKey: .atS)
        try start.encode(StoredChoices(cook.start.choices), forKey: .choices)
        try c.encode(cook.log.map(StoredEntry.init), forKey: .log)
    }
}

/// Whether the folded events are in order: nothing before the start, a
/// pull out no sooner than it was due, a cooling ended only after the egg
/// came out, the plan as it ran only once pulled, and no correction before
/// the start.
private func inOrder(_ cook: RunningCook) -> Bool {
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

// MARK: - The choices

private struct StoredChoices: Codable {
    let choices: CookChoices

    init(_ choices: CookChoices) { self.choices = choices }

    enum Keys: String, CodingKey {
        case massKg = "mass_kg", massFrom, sizeTable, eggFrom, customStartC = "customStart_C", roomC = "room_C"
        case startMode, afterBoil, cooling, tapWaterC = "tapWater_C", bowlLitres, bowlWaterC = "bowlWater_C"
        case waterLitres, eggCount, altitudeM = "altitude_m", level
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let massFrom = try c.decode(MassFrom.self, forKey: .massFrom)
        // A class is off a carton; a measured egg is off none.
        let table = try c.decode(SizeTable?.self, forKey: .sizeTable)
        try require((massFrom == .sizeClass) == (table != nil), "the carton")
        let ch = CookChoices(
            massKg: try c.decode(Double.self, forKey: .massKg), massFrom: massFrom, sizeTable: table,
            eggFrom: try c.decode(EggFrom.self, forKey: .eggFrom),
            customStartC: try c.decode(Double.self, forKey: .customStartC),
            roomC: try c.decode(Double?.self, forKey: .roomC),
            startMode: try c.decode(StartMode.self, forKey: .startMode),
            afterBoil: try c.decode(HeatAfterBoil.self, forKey: .afterBoil),
            cooling: try c.decode(Cooling.self, forKey: .cooling),
            waterLitres: try c.decode(Double.self, forKey: .waterLitres),
            eggCount: try c.decode(Double.self, forKey: .eggCount),
            altitudeM: try c.decode(Double.self, forKey: .altitudeM), level: try c.decode(Double.self, forKey: .level),
            tapWaterC: try c.decode(Double?.self, forKey: .tapWaterC),
            bowlLitres: try c.decode(Double.self, forKey: .bowlLitres),
            bowlWaterC: try c.decode(Double?.self, forKey: .bowlWaterC)
        )
        try require(
            ch.massKg > 0 && ch.bowlLitres > 0 && ch.waterLitres > 0 && ch.eggCount > 0 && (0...1).contains(ch.level),
            "the choices"
        )
        choices = ch
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(choices.massKg, forKey: .massKg)
        try c.encode(choices.massFrom, forKey: .massFrom)
        try c.encode(choices.sizeTable, forKey: .sizeTable)
        try c.encode(choices.eggFrom, forKey: .eggFrom)
        try c.encode(choices.customStartC, forKey: .customStartC)
        try c.encode(choices.roomC, forKey: .roomC)
        try c.encode(choices.startMode, forKey: .startMode)
        try c.encode(choices.afterBoil, forKey: .afterBoil)
        try c.encode(choices.cooling, forKey: .cooling)
        try c.encode(choices.tapWaterC, forKey: .tapWaterC)
        try c.encode(choices.bowlLitres, forKey: .bowlLitres)
        try c.encode(choices.bowlWaterC, forKey: .bowlWaterC)
        try c.encode(choices.waterLitres, forKey: .waterLitres)
        try c.encode(choices.eggCount, forKey: .eggCount)
        try c.encode(choices.altitudeM, forKey: .altitudeM)
        try c.encode(choices.level, forKey: .level)
    }
}

// MARK: - The log

private struct StoredEntry: Codable {
    let entry: CookEntry

    init(_ entry: CookEntry) { self.entry = entry }

    enum Keys: String, CodingKey {
        case kind, atS = "at_s", choices, startedAtS = "startedAt_s", pulled, asRan, yolkWord, white, probe
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let at = { try c.decode(Double.self, forKey: .atS) }
        switch try c.decode(String.self, forKey: .kind) {
        case "boil": entry = .boil(atS: try at())
        case "stillIn": entry = .stillIn(atS: try at())
        case "logged": entry = .logged(atS: try at())
        case "ended": entry = .ended(atS: try at())
        case "correct": entry = .correct(atS: try at(), choices: try c.decode(StoredChoices.self, forKey: .choices).choices)
        case "start": entry = .start(atS: try at(), startedAtS: try c.decode(Double.self, forKey: .startedAtS))
        case "pulled": entry = .pulled(try c.decode(StoredPulled?.self, forKey: .pulled)?.pulled)
        case "stands": entry = .stands
        case "cooled": entry = .cooled(atS: try c.decode(Double?.self, forKey: .atS))
        case "rang": entry = .rang(atS: try c.decode(Double?.self, forKey: .atS))
        case "ran": entry = .ran(try c.decode(StoredAsRan?.self, forKey: .asRan)?.asRan)
        case "answered":
            entry = .answered(
                atS: try at(), yolkWord: try c.decode(YolkWord?.self, forKey: .yolkWord),
                white: try c.decode(WhiteReport?.self, forKey: .white),
                probe: try c.decode(ProbeReading?.self, forKey: .probe)
            )
        default: throw refused("an entry this build does not know")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(entry.kind, forKey: .kind)
        switch entry {
        case let .boil(at), let .stillIn(at), let .logged(at), let .ended(at):
            try c.encode(at, forKey: .atS)
        case let .correct(at, choices):
            try c.encode(at, forKey: .atS)
            try c.encode(StoredChoices(choices), forKey: .choices)
        case let .start(at, startedAt):
            try c.encode(at, forKey: .atS)
            try c.encode(startedAt, forKey: .startedAtS)
        case let .pulled(p):
            try c.encode(p.map(StoredPulled.init), forKey: .pulled)
        case .stands:
            break
        case let .cooled(at), let .rang(at):
            try c.encode(at, forKey: .atS)
        case let .ran(r):
            try c.encode(r.map(StoredAsRan.init), forKey: .asRan)
        case let .answered(at, yolk, white, probe):
            try c.encode(at, forKey: .atS)
            try c.encode(yolk, forKey: .yolkWord)
            try c.encode(white, forKey: .white)
            try c.encode(probe, forKey: .probe)
        }
    }
}

/// A pull: out no sooner than it was due, by the cook or the clock, and a
/// cook's own tap confirmed.
private struct StoredPulled: Codable {
    let pulled: Pulled

    init(_ pulled: Pulled) { self.pulled = pulled }

    enum Keys: String, CodingKey {
        case dueS = "due_s", outS = "out_s", by, confirmed
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let p = Pulled(
            dueS: try c.decode(Double.self, forKey: .dueS), outS: try c.decode(Double.self, forKey: .outS),
            by: try c.decode(PulledBy.self, forKey: .by), confirmed: try c.decode(Bool.self, forKey: .confirmed)
        )
        try require(p.outS >= p.dueS && (p.by == .timeout || p.confirmed), "the pull")
        pulled = p
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(pulled.dueS, forKey: .dueS)
        try c.encode(pulled.outS, forKey: .outS)
        try c.encode(pulled.by, forKey: .by)
        try c.encode(pulled.confirmed, forKey: .confirmed)
    }
}

/// The plan as it ran.
private struct StoredAsRan: Codable {
    let asRan: CookAsRan

    init(_ asRan: CookAsRan) { self.asRan = asRan }

    enum Keys: String, CodingKey {
        case correctedAtS = "correctedAt_s", level, cookS = "cook_s", nudgeS = "nudge_s", forecast
        case peakYolkC = "peakYolk_C", probeMoment, params, alphaM2s = "alpha_m2s"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let params = try c.nestedContainer(keyedBy: Keys.self, forKey: .params)
        let r = CookAsRan(
            correctedAtS: try c.decode(Double?.self, forKey: .correctedAtS),
            level: try c.decode(Double.self, forKey: .level), cookS: try c.decode(Double.self, forKey: .cookS),
            nudgeS: try c.decode(Double.self, forKey: .nudgeS), forecast: try c.decode(Forecast.self, forKey: .forecast),
            peakYolkC: try c.decode(Double.self, forKey: .peakYolkC),
            probeMoment: try c.decode(Bool.self, forKey: .probeMoment),
            params: ModelParams(alphaM2s: try params.decode(Double.self, forKey: .alphaM2s))
        )
        try require(
            (r.correctedAtS ?? 0) >= 0 && (0...1).contains(r.level) && r.cookS > 0 && validForecast(r.forecast)
                && r.params.alphaM2s > 0,
            "the plan as it ran"
        )
        asRan = r
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(asRan.correctedAtS, forKey: .correctedAtS)
        try c.encode(asRan.level, forKey: .level)
        try c.encode(asRan.cookS, forKey: .cookS)
        try c.encode(asRan.nudgeS, forKey: .nudgeS)
        try c.encode(asRan.forecast, forKey: .forecast)
        try c.encode(asRan.peakYolkC, forKey: .peakYolkC)
        try c.encode(asRan.probeMoment, forKey: .probeMoment)
        var params = c.nestedContainer(keyedBy: Keys.self, forKey: .params)
        try params.encode(asRan.params.alphaM2s, forKey: .alphaM2s)
    }
}
