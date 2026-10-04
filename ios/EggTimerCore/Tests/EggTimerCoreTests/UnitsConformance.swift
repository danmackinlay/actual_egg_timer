import Testing
import Foundation
@testable import EggTimerCore
import EggTimerCopy

/// Conformance against `fixtures/units.json`, generated from `src/core/units.ts`.
///
/// Metric and Imperial have to convert identically in the two apps, or the
/// same egg reads as 2.4 oz on one and 2.39 on the other. This holds the port
/// to every conversion, every measure's step and inward-rounded bounds, every
/// display (including the halves, the limits and not-a-number), and the round
/// trip of every value every control can hold - about a thousand of them.
///
/// Numbers are compared at 1e-12 relative, like the rest of the port; the TEXT
/// a cook reads is compared exactly.

private func range(_ raw: Any?) throws -> ClosedRange<Double>? {
    guard let object = raw as? [String: Any] else { return nil }
    return try object.num("lo")...object.num("hi")
}

@Suite("Metric and Imperial match the reference implementation")
struct UnitsConformance {
    @Test("every conversion, both ways")
    func conversions() throws {
        for group in try Fixtures.list("units.json", "conversions") {
            let unit = try group.value(UnitId.self, "unit")
            for c in try group.rows("cases") {
                let si = try c.num("si")
                try expectClose(fromSI(unit, si), c.num("value"), "\(unit.rawValue) from \(si)")
                try expectClose(toSI(unit, fromSI(unit, si)), c.num("back"), "\(unit.rawValue) back from \(si)")
            }
        }
    }

    @Test("every measure: unit, step, decimals, keys and bounds")
    func measures() throws {
        let rows = try Fixtures.list("units.json", "measures")
        #expect(rows.count == Quantity.allCases.count * 2 + 2)
        for c in rows {
            let q = try c.value(Quantity.self, "quantity")
            let system = try c.value(UnitSystem.self, "system")
            let m = measureFor(q, system: system, region: c["region"] as? String)
            let what = "\(q.rawValue) \(system.rawValue) \(String(describing: c["region"]))"
            #expect(try m.unit.rawValue == c.str("unit"), "\(what): unit")
            #expect(try m.step == c.num("step"), "\(what): step")
            #expect(try m.stepNum == c.num("stepNum") && m.stepDen == c.num("stepDen"), "\(what): step ratio")
            #expect(try Double(m.decimals) == c.num("decimals"), "\(what): decimals")
            #expect(try m.trim == c.flag("trim"), "\(what): trim")
            #expect(try m.unitKey == c.str("unitKey"), "\(what): unit key")
            #expect(try m.formatKey == c.str("formatKey"), "\(what): format key")
            #expect(try m.limit == range(c["limit"]), "\(what): limit")
            // Exactly: a bound is a value a control accepts, and must be the
            // same value in both apps.
            #expect(try m.bounds == range(c["bounds"]), "\(what): bounds \(String(describing: m.bounds))")
        }
    }

    @Test("what is shown for a stored value")
    func display() throws {
        for c in try Fixtures.list("units.json", "measures") {
            let q = try c.value(Quantity.self, "quantity")
            let nan = try c.object("notANumber")
            let m = try measureFor(q, system: c.value(UnitSystem.self, "system"), region: c["region"] as? String)
            for p in try c.rows("display") {
                let si = try p.num("si")
                let what = "\(q.rawValue) in \(m.unit.rawValue) at \(si)"
                try expectClose(EggTimerCore.display(m, si), p.num("value"), what)
                #expect(try displayText(m, si) == p.str("text"), "\(what): \(displayText(m, si))")
            }
            try expectClose(EggTimerCore.display(m, .nan), nan.num("value"), "\(q.rawValue) NaN")
            #expect(try displayText(m, .nan) == nan.str("text"), "\(q.rawValue) NaN text")
        }
    }

    @Test("the round trip: every value every control can hold comes back as set")
    func roundTrip() throws {
        var checked = 0
        for c in try Fixtures.list("units.json", "measures") {
            let q = try c.value(Quantity.self, "quantity")
            // A measure no control sets (it has no bounds) has no round trip;
            // `checked` below is what stops this loop passing empty.
            let rows = try c.rows("roundTrip", mayBeEmpty: true)
            let typed = try c.rows("typed")
            let m = try measureFor(q, system: c.value(UnitSystem.self, "system"), region: c["region"] as? String)
            for r in rows {
                let value = try r.num("typed")
                guard let si = parse(m, value) else {
                    Issue.record("\(q.rawValue) \(value): no reading")
                    continue
                }
                try expectClose(si, r.num("si"), "\(q.rawValue) in \(m.unit.rawValue): \(value) stored")
                #expect(try displayText(m, si) == r.str("text"), "\(q.rawValue) \(value): shown \(displayText(m, si))")
                #expect(displayText(m, si) == String(format: "%.\(shownDecimals(m, value))f", value), "\(q.rawValue) \(value)")
                checked += 1
            }
            for r in typed {
                let value = try r.optionalNum("typed") ?? .nan
                let si = parse(m, value)
                if let expected = try r.optionalNum("si") {
                    guard let si else {
                        Issue.record("\(q.rawValue) \(value): no reading")
                        continue
                    }
                    expectClose(si, expected, "\(q.rawValue) typed \(value)")
                    #expect(try displayText(m, si) == r.str("text"), "\(q.rawValue) typed \(value) shown")
                } else {
                    #expect(si == nil, "\(q.rawValue) typed \(value) is no reading")
                }
            }
        }
        #expect(checked > 700, "\(checked) round trips")
    }

    @Test("the regional default")
    func regional() throws {
        for c in try Fixtures.list("units.json", "regional") {
            let ms = (c["measurementSystem"] as? String).flatMap(MeasurementSystemName.init(rawValue:))
            let temp = (c["temperature"] as? String).flatMap(TemperaturePreference.init(rawValue:))
            let actual = regionalUnits(region: c["region"] as? String, measurementSystem: ms, temperature: temp)
            #expect(try actual.rawValue == c.str("units"), "\(c)")
        }
    }

    @Test("a choice is stored as a choice, and a flip is a change of system")
    func choose() throws {
        for c in try Fixtures.list("units.json", "choose") {
            let chosen = (c["chosen"] as? String).flatMap(UnitSystem.init(rawValue:))
            let choice = try chooseUnits(
                chosen: chosen, regional: c.value(UnitSystem.self, "regional"), next: c.value(UnitSystem.self, "next")
            )
            #expect(try choice.chosen.rawValue == c.str("stored"), "\(c)")
            #expect(choice.flip?.rawValue == c["flip"] as? String, "\(c): flip")
        }
        for c in try Fixtures.list("units.json", "stored") {
            let raw = c["raw"]
            // JSON's true and 0 both arrive as NSNumber; neither is a choice.
            #expect(readChosenUnits(raw is NSNull ? nil : raw)?.rawValue == c["chosen"] as? String, "\(String(describing: raw))")
        }
    }

    @Test("size labels in both systems")
    func sizeLabels() throws {
        let en = try Fixtures.catalogue("en")
        for c in try Fixtures.list("units.json", "sizeLabels") {
            let table = try c.str("table") == "us" ? usSizeClasses : sizeClasses
            let key = try c.str("key")
            let cls = try #require(table.first(where: { $0.key == key }), "size label \(c)")
            let mass = try c.object("mass")
            let label = try sizeClassLabel(cls, system: c.value(UnitSystem.self, "system"))
            #expect(try label.mass.key == mass.str("key"), "\(c)")
            #expect(CopyConformance.arg(mass["value"] ?? "") == .fixed(label.mass.value), "\(c)")
            let text = en.render(label.key, ["mass": .text(en.render(label.mass.key, ["value": .fixed(label.mass.value)]))])
            #expect(try text == c.str("text"), "\(text)")
        }
    }
}
