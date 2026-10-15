import Foundation
import Testing
@testable import EggTimerCore

/// A running cook as the fixtures write it, both ways: read field by field
/// and folded by core's `foldCook` (each app's own reader of what it stores
/// is tested in its own suite), and written as JSONSerialization objects to
/// compare with the fixture's. The fixtures are machine-written, so a read
/// checks only that each field is there and of its kind.

/// A cook the fixture writes: what was fixed at the press, the start and
/// the log, folded.
func runningCookOf(_ json: Any?, _ what: String) throws -> RunningCook {
    let o = try #require(json as? [String: Any], "\(what): not a cook")
    let start = try o.object("start")
    return try foldCook(
        idMs: o.num("id_ms"), start: CookStart(atS: start.num("at_s"), choices: choicesOf(start.object("choices"))),
        nudgeS: o.num("nudge_s"), boilMemory: #require(o["boilMemory"] as? [String: Double], "\(what): pans"),
        units: o.value(Units.self, "units"), lang: o.str("lang"),
        log: #require(o["log"] as? [[String: Any]], "\(what): log").map(entryOf)
    )
}

/// One entry of a log the fixture writes.
func entryOf(_ e: [String: Any]) throws -> CookEntry {
    switch try e.str("kind") {
    case "boil": return .boil(atS: try e.num("at_s"))
    case "stillIn": return .stillIn(atS: try e.num("at_s"))
    case "logged": return .logged(atS: try e.num("at_s"))
    case "ended": return .ended(atS: try e.num("at_s"))
    case "correct": return .correct(atS: try e.num("at_s"), choices: try choicesOf(e.object("choices")))
    case "start": return .start(atS: try e.num("at_s"), startedAtS: try e.num("startedAt_s"))
    case "pulled":
        return .pulled(try (e["pulled"] as? [String: Any]).map {
            Pulled(dueS: try $0.num("due_s"), outS: try $0.num("out_s"), by: try $0.value(PulledBy.self, "by"),
                   confirmed: try $0.flag("confirmed"))
        })
    case "stands": return .stands
    case "cooled": return .cooled(atS: try e.optionalNum("at_s"))
    case "rang": return .rang(atS: try e.optionalNum("at_s"))
    case "ran": return .ran(try (e["asRan"] as? [String: Any]).map(asRanOf))
    case "answered":
        return .answered(
            atS: try e.num("at_s"), yolkWord: try e.optionalValue(YolkWord.self, "yolkWord"),
            white: try e.optionalValue(WhiteReport.self, "white"),
            probe: try (e["probe"] as? [String: Any]).map {
                ProbeReading(centreC: try $0.num("centre_C"), afterS: try $0.optionalNum("after_s"))
            }
        )
    case let kind: throw FixtureError("an entry of no kind this core knows: \(kind)")
    }
}

/// The plan as it ran, as the fixture writes it.
func asRanOf(_ r: [String: Any]) throws -> CookAsRan {
    let f = try r.object("forecast")
    return try CookAsRan(
        correctedAtS: r.optionalNum("correctedAt_s"), level: r.num("level"), cookS: r.num("cook_s"),
        nudgeS: r.num("nudge_s"),
        forecast: Forecast(
            cookS: f.num("cook_s"), yolk: #require(f["yolk"] as? [Double]), white: #require(f["white"] as? [Double]),
            yolkWord: f["yolkWord"] as? [Double]
        ),
        peakYolkC: r.num("peakYolk_C"), probeMoment: r.flag("probeMoment"),
        params: ModelParams(alphaM2s: r.object("params").num("alpha_m2s"))
    )
}

extension CookChoices {
    /// As the fixture writes it, for JSONSerialization.
    var jsonObject: [String: Any] {
        [
            "mass_kg": massKg, "massFrom": massFrom.rawValue, "sizeTable": sizeTable?.rawValue ?? NSNull(),
            "eggFrom": eggFrom.rawValue, "customStart_C": customStartC, "room_C": roomC ?? NSNull(),
            "startMode": startMode.rawValue, "afterBoil": afterBoil.rawValue, "cooling": cooling.rawValue,
            "tapWater_C": tapWaterC ?? NSNull(), "bowlLitres": bowlLitres, "bowlWater_C": bowlWaterC ?? NSNull(),
            "waterLitres": waterLitres, "eggCount": eggCount, "altitude_m": altitudeM, "level": level,
        ]
    }
}

extension Pulled {
    var jsonObject: [String: Any] {
        ["due_s": dueS, "out_s": outS, "by": by.rawValue, "confirmed": confirmed]
    }
}

extension CookEvents {
    var jsonObject: [String: Any] {
        [
            "boilAt_s": boilAtS ?? NSNull(), "pulled": pulled?.jsonObject ?? NSNull(),
            "cooledAt_s": cooledAtS ?? NSNull(), "rangAt_s": rangAtS ?? NSNull(),
        ]
    }
}

extension CookAsRan {
    var jsonObject: [String: Any] {
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

extension CookEntry {
    var jsonObject: [String: Any] {
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

extension RunningCook {
    /// What was fixed at the press, the start and the log, and no more,
    /// since the rest is the log folded.
    var jsonObject: [String: Any] {
        [
            "id_ms": idMs, "nudge_s": nudgeS, "boilMemory": boilMemory, "units": units.rawValue, "lang": lang,
            "start": ["at_s": start.atS, "choices": start.choices.jsonObject] as [String: Any],
            "log": log.map(\.jsonObject),
        ]
    }
}
