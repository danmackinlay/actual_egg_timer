import Foundation
import Testing
@testable import EggTimerApp
import EggTimerCore

/// The cook as this app stores it (StoredCook.swift), through the load path
/// a relaunch takes (`Cook.readStored`): a cook at every stage comes back to
/// the bit, and a value that does not decode, or is in another format, reads
/// as no cook. What the app then does with it is CookTests'
/// (`whatThisBuildCannotReadIsDropped`).
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

    /// A cook at each stage.
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

    @Test func aCookAtEveryStageComesBackToTheBit() throws {
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
            #expect(Cook.readStored(try encodeStamped(StoreRegistry.cook, stored)) == stored, "cook \(i)")
        }
    }

    @Test func aValueThatDoesNotDecodeIsNoCook() throws {
        let format = try #require(StoreRegistry.cook.format)
        let want = StoredCook(cook: Self.answered, answers: .unanswered, leanHintS: 0)
        let written = try encodeStamped(StoreRegistry.cook, want)
        let base = try #require(try JSONSerialization.jsonObject(with: written) as? [String: Any])
        func with(_ key: String, _ value: Any?) throws -> Data {
            var o = base
            o[key] = value
            return try JSONSerialization.data(withJSONObject: o)
        }
        #expect(Cook.readStored(written) == want)
        let refused: [(String, Data)] = [
            ("not JSON", Data("{damaged".utf8)), ("empty", Data()), ("null", Data("null".utf8)),
            ("a list", try JSONSerialization.data(withJSONObject: [base])),
            ("no format", try with("v", nil)), ("an earlier format", try with("v", format - 1)),
            ("a later format", try with("v", format + 1)), ("the format as text", try with("v", "\(format)")),
            ("no answers", try with("answers", nil)), ("answers this build does not know", try with("answers", "none")),
            ("no lean", try with("leanHintS", nil)), ("no cook", try with("cook", nil)),
            ("a cook with only its id", try with("cook", ["id_ms": 1])),
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
