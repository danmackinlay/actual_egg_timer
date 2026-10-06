import Testing
import Foundation
@testable import EggTimerCore

/// A running cook against `fixtures/running.json`, generated from
/// `src/core/running.ts`: its egg and pot, the moves the cook makes, a
/// stored cook read back, the plan derived from it, and the record it makes.
///
/// The two apps must plan the same cook alike: the alarm, the cooling and
/// the record are all read off the plan.

/// Two JSON values, as JSONSerialization gives them, equal: numbers exactly,
/// since a cook's fields are stored values and no arithmetic, or to within
/// `ulps` of the larger; a missing key and JSON's null alike.
func sameJSON(_ a: Any?, _ b: Any?, ulps: Double = 0) -> Bool {
    let aNull = a == nil || a is NSNull
    let bNull = b == nil || b is NSNull
    if aNull || bNull { return aNull && bNull }
    if let x = a as? [String: Any], let y = b as? [String: Any] {
        for key in Set(x.keys).union(y.keys) where !sameJSON(x[key], y[key], ulps: ulps) { return false }
        return true
    }
    if let x = a as? [Any], let y = b as? [Any] {
        return x.count == y.count && zip(x, y).allSatisfy { sameJSON($0, $1, ulps: ulps) }
    }
    if let x = a as? String, let y = b as? String { return x == y }
    if let x = a as? NSNumber, let y = b as? NSNumber {
        let xb = CFGetTypeID(x) == CFBooleanGetTypeID()
        let yb = CFGetTypeID(y) == CFBooleanGetTypeID()
        if xb || yb { return xb && yb && x.boolValue == y.boolValue }
        let (u, v) = (x.doubleValue, y.doubleValue)
        return u == v || abs(u - v) <= ulps * max(abs(u), abs(v)).ulp
    }
    return false
}

/// The choices as the fixture writes them, field by field: not through
/// `readRunningCook`, which is under test.
func choicesOf(_ json: [String: Any]) throws -> CookChoices {
    try CookChoices(
        massKg: json.num("mass_kg"), massFrom: json.value(MassFrom.self, "massFrom"),
        sizeTable: json.optionalValue(SizeTable.self, "sizeTable"), eggFrom: json.value(EggFrom.self, "eggFrom"),
        customStartC: json.num("customStart_C"), roomC: json.optionalNum("room_C"),
        startMode: json.value(StartMode.self, "startMode"), afterBoil: json.value(HeatAfterBoil.self, "afterBoil"),
        cooling: json.value(Cooling.self, "cooling"), waterLitres: json.num("waterLitres"),
        eggCount: json.num("eggCount"), altitudeM: json.num("altitude_m"), level: json.num("level")
    )
}

/// A cook the fixture writes, read as the app will read it.
func runningCookOf(_ json: Any?, _ what: String) throws -> RunningCook {
    try #require(readRunningCook(json), "\(what): the cook does not read")
}

@Suite("Running")
struct RunningConformance {
    @Test("the egg and the pot, for every branch of the choices")
    func setups() throws {
        let rows = try Fixtures.list("running.json", "setups")
        #expect(rows.count >= 20)
        for (i, row) in rows.enumerated() {
            let pot = try cookSetupOf(choicesOf(row.object("choices")), timeToBoilS: row.num("timeToBoil_s"))
            let egg = try row.object("egg")
            let label = "setup \(i)"
            try expectClose(pot.egg.radiusM, egg.num("radius_m"), "\(label) radius")
            try expectClose(pot.egg.minorDiameterM, egg.num("minorDiameter_m"), "\(label) minor diameter")
            try expectClose(pot.egg.massKg, egg.num("mass_kg"), "\(label) mass")
            try expectClose(pot.egg.volumeM3, egg.num("volume_m3"), "\(label) volume")
            let expected = try cookSetup(row.object("setup"))
            #expect(pot.setup.startMode == expected.startMode, "\(label) start")
            #expect(pot.setup.afterBoil == expected.afterBoil, "\(label) burner")
            #expect(pot.setup.cooling == expected.cooling, "\(label) cooling")
            expectClose(pot.setup.eggStartC, expected.eggStartC, "\(label) egg start")
            expectClose(pot.setup.ambientC, expected.ambientC, "\(label) room")
            expectClose(pot.setup.boilingC, expected.boilingC, "\(label) boiling point")
            #expect(pot.setup.timeToBoilS == expected.timeToBoilS, "\(label) time to boil")
            #expect(pot.setup.waterLitres == expected.waterLitres, "\(label) water")
            #expect(pot.setup.eggCount == expected.eggCount, "\(label) eggs")
        }
    }

    @Test("the boil tap, a correction and a corrected start, taken and refused")
    func moves() throws {
        let rows = try Fixtures.list("running.json", "moves")
        #expect(rows.count >= 15)
        for row in rows {
            let note = try row.str("note")
            let cook = try runningCookOf(row["cook"], note)
            let move = try row.object("move")
            let after: RunningCook?
            if move["boil"] != nil {
                after = withBoil(cook, nowS: try move.num("boil"))
            } else if let choices = move["correct"] as? [String: Any] {
                after = corrected(cook, choices: try choicesOf(choices), nowS: try move.num("now"))
            } else {
                let now = try move.num("now")
                try expectClose(latestStartS(cook, nowS: now), row.num("latest_s"), "\(note): latest start")
                after = startCorrected(cook, startedAtS: try move.optionalNum("start") ?? .nan, nowS: now)
            }
            #expect(sameJSON(after?.jsonObject, row["after"]), "\(note)")
        }
    }

    @Test("a stored cook is read whole or not at all, and what is written reads back")
    func reads() throws {
        let rows = try Fixtures.list("running.json", "reads")
        #expect(rows.count >= 40)
        for row in rows {
            let note = try row.str("note")
            let read = readRunningCook(row["raw"])
            #expect(sameJSON(read?.jsonObject, row["cook"]), "\(note)")
            if let read {
                let data = try JSONSerialization.data(withJSONObject: read.jsonObject)
                // To the last bit but one: JSONSerialization writes 0.068 as
                // 0.068000000000000005 and reads that back an ulp off.
                let back = readRunningCook(try JSONSerialization.jsonObject(with: data))
                #expect(sameJSON(back?.jsonObject, read.jsonObject, ulps: 4), "\(note): round trip")
            }
        }
    }
}
