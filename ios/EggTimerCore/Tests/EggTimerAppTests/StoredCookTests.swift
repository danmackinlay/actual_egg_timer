import Foundation
import Testing
@testable import EggTimerApp
import EggTimerCore

/// The cook as this app stores it (StoredCook.swift), through the load path
/// a relaunch takes (`Cook.readStored`): a cook at every stage comes back to
/// the bit, in the shape the web stores its own; and one damaged anywhere,
/// or of another build, is refused whole. The web holds its own reader to its
/// own table (test/storedCook.test.ts).
@Suite("The stored cook") @MainActor
struct StoredCookTests {
    /// 7 October 2026, 09:00 UTC.
    static let s = 1_791_363_600.0
    static let choices = CookChoices(
        massKg: 0.0625, massFrom: .sizeClass, sizeTable: .eu, eggFrom: .fridge, customStartC: 12, roomC: nil,
        startMode: .cold, afterBoil: .hold, cooling: .ice, waterLitres: 2, eggCount: 2, altitudeM: 0, level: 0.41
    )
    static let asRan = CookAsRan(
        correctedAtS: nil, level: 0.41, cookS: 318.7, nudgeS: 0,
        forecast: Forecast(
            cookS: 318.7, yolk: [0.2, 0.7, 0.1], white: [0.05, 0.9, 0.05], yolkWord: [0.1, 0.2, 0.4, 0.2, 0.1]
        ),
        peakYolkC: 64.7, probeMoment: true, params: ModelParams(alphaM2s: 1.4321e-7)
    )

    static func cookOf(_ change: (inout CookChoices) -> Void = { _ in }, nudgeS: Double = 0) -> RunningCook {
        var ch = choices
        change(&ch)
        return startCook(
            nowS: s, choices: ch, nudgeS: nudgeS, boilMemory: ["2.0": 480, "3.0": 610], units: .metric, lang: "en"
        )
    }

    /// The cooks the table damages, each with the entry a row damages in
    /// its log: pulled `[boil, pulled]`, cooled `[boil, pulled, cooled]`,
    /// kept and answered with a fourth, heavier `[boil, correct]`, moved
    /// `[start]`, rung `[rang]`.
    static let cold = cookOf()
    static let hot = cookOf({ $0.startMode = .hot }, nudgeS: -7)
    static let tapped = withBoil(cold, nowS: s + 532.5)
    static let pulled = writeEvents(tapped, CookEvents(
        boilAtS: tapped.events.boilAtS, pulled: Pulled(dueS: s + 851.2, outS: s + 858.9, by: .cook, confirmed: true)
    ))
    static let cooled: RunningCook = {
        var e = pulled.events
        e.cooledAtS = s + 1031.9
        return writeEvents(pulled, e)
    }()
    static let kept = appendEntry(cooled, .ran(asRan))
    static let answered = appendEntry(cooled, .answered(
        atS: s + 1100, yolkWord: .jammy, white: nil, probe: ProbeReading(centreC: 66.4, afterS: 180)
    ))
    static let timedOut = writeEvents(hot, CookEvents(
        pulled: Pulled(dueS: s + 380, outS: s + 400, by: .timeout, confirmed: false), cooledAtS: s + 590,
        rangAtS: s + 380
    ))
    static let rung = writeEvents(hot, CookEvents(rangAtS: s + 380))
    static let moved = startCorrected(cold, startedAtS: s - 60, nowS: s + 10)!
    static let heavier: RunningCook = {
        var ch = tapped.choices
        ch.massKg = 0.076
        return corrected(tapped, choices: ch, nowS: s + 600)
    }()

    /// A cook as this app writes it.
    func written(_ cook: RunningCook) throws -> Data {
        try JSONEncoder().encode(StoredCook(cook: cook, answers: .unanswered, leanHintS: 0))
    }

    @Test func aCookAtEveryStageComesBackToTheBitInTheWebsShape() throws {
        let s = Self.s
        var cooks: [RunningCook] = [
            Self.cold, Self.hot, Self.tapped, Self.pulled, Self.cooled, Self.kept, Self.answered, Self.timedOut,
            pullStands(Self.timedOut), Self.rung, Self.moved, Self.heavier,
            stillIn(corrected(Self.timedOut, choices: Self.choices, nowS: s + 700), nowS: s + 703),
            startCook(nowS: s, choices: Self.choices, nudgeS: 3, boilMemory: [:], units: .imperial, lang: "en-x-1750"),
            Self.cookOf {
                $0.massFrom = .girth
                $0.sizeTable = nil
                $0.roomC = 23.5
                $0.cooling = .bowl
                $0.bowlLitres = 1.5
                $0.tapWaterC = 12.5
            },
            appendEntry(appendEntry(Self.answered, .logged(atS: s + 1101)), .ended(atS: s + 1102)),
            appendEntry(Self.cooled, .answered(atS: s + 1100, yolkWord: nil, white: .firm, probe: nil)),
            appendEntry(Self.kept, .ran(nil)),
        ]
        // And each again with doubles of 17 significant digits in its
        // fields: every time moved by a fraction, and a correction of every
        // number, logged as a cook makes one.
        var draw = SplitMix(seed: 20_261_007)
        for base in cooks {
            var cook = shiftedCook(base, by: draw.next())
            var choices = cook.choices
            choices.massKg = 0.04 + 0.04 * draw.next()
            choices.waterLitres = 0.2 + 3 * draw.next()
            choices.level = draw.next()
            choices.altitudeM = 2000 * draw.next()
            cook = corrected(cook, choices: choices, nowS: cook.startedAtS + 1 + draw.next())
            cooks.append(foldCook(
                idMs: cook.idMs, start: cook.start, nudgeS: 20 * draw.next() - 10,
                boilMemory: ["\(choices.waterLitres)": 300 + 600 * draw.next()], units: cook.units, lang: cook.lang,
                log: cook.log
            ))
        }
        for (i, cook) in cooks.enumerated() {
            let stored = StoredCook(
                cook: cook, answers: i % 2 == 0 ? .unanswered : .beforeReload, leanHintS: draw.next()
            )
            #expect(Cook.readStored(try JSONEncoder().encode(stored)) == stored, "cook \(i)")
        }
        // The web's keys, a field that may be null written as null, and the
        // cook as it stands not written at all.
        let o = try #require(try JSONSerialization.jsonObject(with: written(Self.kept)) as? [String: Any])
        #expect(Set(o.keys) == ["v", "cook", "answers", "leanHint_s"])
        #expect((o["v"] as? Int) == StoreRegistry.cook.format && (o["answers"] as? String) == "none")
        let cook = try #require(o["cook"] as? [String: Any])
        #expect(Set(cook.keys) == ["id_ms", "nudge_s", "boilMemory", "units", "lang", "start", "log"])
        let start = try #require(cook["start"] as? [String: Any])
        let choices = try #require(start["choices"] as? [String: Any])
        #expect(choices.count == 16 && choices["room_C"] is NSNull && choices["sizeTable"] as? String == "eu")
        let log = try #require(cook["log"] as? [[String: Any]])
        #expect(log.map { $0["kind"] as? String } == ["boil", "pulled", "cooled", "ran"])
        let ran = try #require(log[3]["asRan"] as? [String: Any])
        #expect(ran["correctedAt_s"] is NSNull)
        #expect((ran["params"] as? [String: Any])?["alpha_m2s"] as? Double == 1.4321e-7)
    }

    /// A stored cook with the value at `path` in its cook replaced: `nil`
    /// removes the key; NSNull is JSON's null.
    func damaged(_ cook: RunningCook, _ path: [String], _ value: Any?) throws -> Data {
        let o = try JSONSerialization.jsonObject(with: written(cook))
        return try JSONSerialization.data(withJSONObject: put(o, ["cook"] + path, value))
    }

    func put(_ node: Any, _ path: [String], _ value: Any?) -> Any {
        guard let key = path.first else { return value ?? NSNull() }
        let rest = Array(path.dropFirst())
        if var list = node as? [Any], let i = Int(key) {
            list[i] = put(list[i], rest, value)
            return list
        }
        var o = node as? [String: Any] ?? [:]
        if rest.isEmpty, value == nil {
            o[key] = nil
        } else {
            o[key] = put(o[key] ?? [String: Any](), rest, value)
        }
        return o
    }

    @Test func aCookDamagedAnywhereIsRefusedWhole() throws {
        let s = Self.s
        let boil: [String: Any] = ["kind": "boil", "at_s": s + 532.5]
        let null = NSNull()
        let asRan = ["log", "3", "asRan"]
        let refused: [(String, RunningCook, [String], Any?)] = [
            ("no id", Self.pulled, ["id_ms"], nil),
            ("an id that is not a number", Self.pulled, ["id_ms"], "1791363600000"),
            ("no start", Self.pulled, ["start"], nil),
            ("a start that is a list", Self.pulled, ["start"], [Any]()),
            ("a start of zero", Self.pulled, ["start", "at_s"], 0),
            ("no choices", Self.pulled, ["start", "choices"], nil),
            ("a bowl of no water", Self.pulled, ["start", "choices", "bowlLitres"], 0),
            ("no bowl", Self.pulled, ["start", "choices", "bowlLitres"], nil),
            ("running water at a temperature in words", Self.pulled, ["start", "choices", "tapWater_C"], "cold"),
            ("no word on the bowl's water", Self.pulled, ["start", "choices", "bowlWater_C"], nil),
            ("choices that are a list", Self.pulled, ["start", "choices"], [Any]()),
            ("no mass", Self.pulled, ["start", "choices", "mass_kg"], nil),
            ("a mass of zero", Self.pulled, ["start", "choices", "mass_kg"], 0),
            ("a mass that is true", Self.pulled, ["start", "choices", "mass_kg"], true),
            ("an unknown mass source", Self.pulled, ["start", "choices", "massFrom"], "guess"),
            ("a class with no carton", Self.pulled, ["start", "choices", "sizeTable"], null),
            ("an unknown carton", Self.pulled, ["start", "choices", "sizeTable"], "uk"),
            ("an unknown egg source", Self.pulled, ["start", "choices", "eggFrom"], "counter"),
            ("no egg temperature of its own", Self.pulled, ["start", "choices", "customStart_C"], null),
            ("a room that is a string", Self.pulled, ["start", "choices", "room_C"], "20"),
            ("no room at all", Self.pulled, ["start", "choices", "room_C"], nil),
            ("sous-vide", Self.pulled, ["start", "choices", "startMode"], "sous"),
            ("an unknown burner", Self.pulled, ["start", "choices", "afterBoil"], "low"),
            ("no burner", Self.pulled, ["start", "choices", "afterBoil"], nil),
            ("an unknown cooling", Self.pulled, ["start", "choices", "cooling"], "fridge"),
            ("no water", Self.pulled, ["start", "choices", "waterLitres"], 0),
            ("no eggs", Self.pulled, ["start", "choices", "eggCount"], 0),
            ("no altitude", Self.pulled, ["start", "choices", "altitude_m"], null),
            ("a level past hard", Self.pulled, ["start", "choices", "level"], 1.01),
            ("a level under runny", Self.pulled, ["start", "choices", "level"], -0.01),
            ("no log", Self.pulled, ["log"], nil),
            ("a log that is not a list", Self.pulled, ["log"], ["0": boil]),
            ("an entry that is a number", Self.pulled, ["log", "0"], 3),
            ("an entry of a kind this build does not know", Self.pulled, ["log", "0", "kind"], "heatOff"),
            ("a boil before the start", Self.pulled, ["log", "0", "at_s"], s - 1),
            ("a boil that is a string", Self.pulled, ["log", "0", "at_s"], "soon"),
            ("a boil with no time", Self.pulled, ["log", "0", "at_s"], nil),
            ("a pull that is a list", Self.pulled, ["log", "1", "pulled"], [Any]()),
            ("a pull due before the start", Self.pulled, ["log", "1", "pulled", "due_s"], s - 5),
            ("out before it was due", Self.pulled, ["log", "1", "pulled", "out_s"], s + 851),
            ("pulled by nobody", Self.pulled, ["log", "1", "pulled", "by"], null),
            ("a pull neither confirmed nor not", Self.pulled, ["log", "1", "pulled", "confirmed"], nil),
            ("a pull confirmed as a number", Self.pulled, ["log", "1", "pulled", "confirmed"], 1),
            ("the cook's own tap, unconfirmed", Self.pulled, ["log", "1", "pulled", "confirmed"], false),
            ("no pull in a pull entry", Self.pulled, ["log", "1", "pulled"], nil),
            ("a correction whose choices do not read", Self.heavier, ["log", "1", "choices", "level"], 1.01),
            ("a correction with no time", Self.heavier, ["log", "1", "at_s"], "then"),
            ("corrected before the start", Self.heavier, ["log", "1", "at_s"], s - 1),
            ("a start corrected to no time", Self.moved, ["log", "0", "startedAt_s"], null),
            ("rang before the start", Self.rung, ["log", "0", "at_s"], s - 1),
            ("rang as a string", Self.rung, ["log", "0", "at_s"], "then"),
            ("cooled without a pull", Self.cooled, ["log", "1"], boil),
            ("cooled before the egg came out", Self.cooled, ["log", "2", "at_s"], s + 858),
            ("an answer in a word not asked", Self.answered, ["log", "3", "yolkWord"], "gooey"),
            ("a white answer not asked", Self.answered, ["log", "3", "white"], "set"),
            ("a probe reading that is not one", Self.answered, ["log", "3", "probe", "centre_C"], "hot"),
            ("an answer with no probe word", Self.answered, ["log", "3", "probe"], nil),
            ("a nudge that is not a number", Self.pulled, ["nudge_s"], null),
            ("pans that are a list", Self.pulled, ["boilMemory"], [480]),
            ("a pan that is not a time", Self.pulled, ["boilMemory", "2.0"], "slow"),
            ("a pan of no time", Self.pulled, ["boilMemory", "2.0"], 0),
            ("unknown units", Self.pulled, ["units"], "si"),
            ("no language", Self.pulled, ["lang"], ""),
            ("the plan as it ran, with no pull", Self.kept, ["log", "1"], boil),
            ("the plan as it ran, a list", Self.kept, asRan, [Any]()),
            ("the plan as it ran, no forecast", Self.kept, asRan + ["forecast"], null),
            ("the plan as it ran, a forecast that is not one", Self.kept, asRan + ["forecast", "yolk"], [0.5, 0.6, 0.1]),
            ("the plan as it ran, a level past hard", Self.kept, asRan + ["level"], 1.5),
            ("the plan as it ran, no cook time", Self.kept, asRan + ["cook_s"], 0),
            ("the plan as it ran, a nudge that is a string", Self.kept, asRan + ["nudge_s"], "3"),
            ("the plan as it ran, no peak yolk", Self.kept, asRan + ["peakYolk_C"], nil),
            ("the plan as it ran, the probe moment a number", Self.kept, asRan + ["probeMoment"], 1),
            ("the plan as it ran, a diffusivity of zero", Self.kept, asRan + ["params", "alpha_m2s"], 0),
            ("the plan as it ran, corrected before the start", Self.kept, asRan + ["correctedAt_s"], s - 1),
            ("the plan as it ran, corrected before 1970", Self.kept, asRan + ["correctedAt_s"], -1),
        ]
        #expect(refused.count > 70)
        for (note, cook, path, value) in refused {
            #expect(Cook.readStored(try damaged(cook, path, value)) == nil, "\(note)")
        }
        // What is written beside the log is not read: the cook as it stood,
        // which builds before this one wrote there, damaged or not, and any
        // field this build does not know.
        let want = StoredCook(cook: Self.pulled, answers: .unanswered, leanHintS: 0)
        let beside: [([String], Any)] = [(["events", "boilAt_s"], "soon"), (["startedAt_s"], s), (["ticket"], ["old": true])]
        for (path, value) in beside {
            #expect(Cook.readStored(try damaged(Self.pulled, path, value)) == want, "\(path) ignored")
        }
    }

    @Test func aStoreInAnotherFormatOrOfAnotherBuildIsRefused() throws {
        let format = try #require(StoreRegistry.cook.format)
        let base = try #require(try JSONSerialization.jsonObject(with: written(Self.answered)) as? [String: Any])
        func text(_ o: Any) throws -> Data { try JSONSerialization.data(withJSONObject: o) }
        func with(_ key: String, _ value: Any?) throws -> Data {
            var o = base
            o[key] = value
            return try text(o)
        }
        #expect(Cook.readStored(try text(base)) == StoredCook(cook: Self.answered, answers: .unanswered, leanHintS: 0))
        var later = base
        later["later"] = [1, 2]
        #expect(Cook.readStored(try text(later)) != nil, "a field this build does not know: ignored")
        let pastAnyDouble = String(decoding: try text(base), as: UTF8.self)
            .replacingOccurrences(of: "\"leanHint_s\":0", with: "\"leanHint_s\":1e400")
        #expect(pastAnyDouble.contains("1e400"))
        let earlier = ["cook": base["cook"] ?? NSNull(), "feedbackGiven": false, "leanHint_s": 0]
        let refused: [(String, Data)] = [
            ("not JSON", Data("{damaged".utf8)), ("empty", Data()), ("null", Data("null".utf8)),
            ("a number", Data("6".utf8)), ("text", Data("\"cook\"".utf8)), ("a list", try text([base])),
            ("the web's shape before formats were inside", try with("v", nil)),
            ("the iPhone's shape before (cookInProgress.v4)", try text(earlier)),
            ("an earlier format", try with("v", format - 1)), ("a later format", try with("v", format + 1)),
            ("the format as text", try with("v", "\(format)")), ("the format true", try with("v", true)),
            ("the format and a half", try with("v", Double(format) + 0.5)),
            ("no answers", try with("answers", nil)), ("answers this build does not know", try with("answers", "some")),
            ("answers true", try with("answers", true)), ("no lean", try with("leanHint_s", nil)),
            ("a lean of null", try with("leanHint_s", NSNull())), ("a lean as text", try with("leanHint_s", "12")),
            ("a lean past any double", Data(pastAnyDouble.utf8)),
            ("no cook", try with("cook", nil)), ("a cook that is a list", try with("cook", [Any]())),
        ]
        for (about, data) in refused { #expect(Cook.readStored(data) == nil, "\(about)") }
    }
}

/// A fixed stream of doubles in [0, 1) with every bit of the mantissa used:
/// SplitMix64, for draws a test can repeat.
struct SplitMix {
    var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> Double {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        z ^= z >> 31
        return Double(z >> 11) / Double(UInt64(1) << 53)
    }
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
/// them.
private func shiftedCook(_ cook: RunningCook, by: Double) -> RunningCook {
    foldCook(
        idMs: (cook.idMs + by * 1000).rounded(), start: CookStart(atS: cook.start.atS + by, choices: cook.start.choices),
        nudgeS: cook.nudgeS, boilMemory: cook.boilMemory, units: cook.units, lang: cook.lang,
        log: cook.log.map { shiftedEntry($0, by: by) }
    )
}
