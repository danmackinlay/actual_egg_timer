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
private let tolerance = 1e-12

private func expectClose(
    _ actual: Double, _ expected: Double, _ what: String,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    let scale = max(abs(expected), 1.0)
    let error = abs(actual - expected) / scale
    #expect(
        error <= tolerance,
        "\(what): expected \(expected), got \(actual) (relative error \(error))",
        sourceLocation: sourceLocation
    )
}

private func units() -> [String: Any] { Fixtures.load("units.json") }

private func list(_ key: String) -> [[String: Any]] {
    guard let rows = units()[key] as? [[String: Any]] else { fatalError("fixtures/units.json has no \(key)") }
    return rows
}

private func english() -> Catalogue {
    let url = Fixtures.repoRoot.appendingPathComponent("copy/en.json")
    guard let data = try? Data(contentsOf: url), let catalogue = try? Catalogue(json: data, fallback: nil) else {
        fatalError("could not read copy/en.json")
    }
    return catalogue
}

private func system(_ raw: Any?) -> UnitSystem {
    guard let string = raw as? String, let system = UnitSystem(rawValue: string) else {
        fatalError("not a unit system: \(String(describing: raw))")
    }
    return system
}

private func range(_ raw: Any?) -> ClosedRange<Double>? {
    guard let object = raw as? [String: Any] else { return nil }
    return object.num("lo")...object.num("hi")
}

@Suite("Metric and Imperial match the reference implementation")
struct UnitsConformance {
    @Test("every conversion, both ways")
    func conversions() {
        for group in list("conversions") {
            guard let unit = UnitId(rawValue: group.str("unit")), let cases = group["cases"] as? [[String: Any]] else {
                fatalError("bad conversion group \(group)")
            }
            for c in cases {
                let si = c.num("si")
                expectClose(fromSI(unit, si), c.num("value"), "\(unit.rawValue) from \(si)")
                expectClose(toSI(unit, fromSI(unit, si)), c.num("back"), "\(unit.rawValue) back from \(si)")
            }
        }
    }

    @Test("every measure: unit, step, decimals, keys and bounds")
    func measures() {
        let rows = list("measures")
        #expect(rows.count == Quantity.allCases.count * 2 + 2)
        for c in rows {
            guard let q = Quantity(rawValue: c.str("quantity")) else { fatalError("quantity \(c)") }
            let m = measureFor(q, system: system(c["system"]), region: c["region"] as? String)
            let what = "\(q.rawValue) \(c.str("system")) \(String(describing: c["region"]))"
            #expect(m.unit.rawValue == c.str("unit"), "\(what): unit")
            #expect(m.step == c.num("step"), "\(what): step")
            #expect(m.stepNum == c.num("stepNum") && m.stepDen == c.num("stepDen"), "\(what): step ratio")
            #expect(Double(m.decimals) == c.num("decimals"), "\(what): decimals")
            #expect(m.unitKey == c.str("unitKey"), "\(what): unit key")
            #expect(m.formatKey == c.str("formatKey"), "\(what): format key")
            #expect(m.limit == range(c["limit"]), "\(what): limit")
            // Exactly: a bound is a value a control accepts, and must be the
            // same value in both apps.
            #expect(m.bounds == range(c["bounds"]), "\(what): bounds \(String(describing: m.bounds))")
        }
    }

    @Test("what is shown for a stored value, and how it reads in English")
    func display() {
        let en = english()
        for c in list("measures") {
            guard let q = Quantity(rawValue: c.str("quantity")),
                  let points = c["display"] as? [[String: Any]],
                  let nan = c["notANumber"] as? [String: Any] else { fatalError("measure \(c)") }
            let m = measureFor(q, system: system(c["system"]), region: c["region"] as? String)
            for p in points {
                let si = p.num("si")
                let what = "\(q.rawValue) in \(m.unit.rawValue) at \(si)"
                expectClose(EggTimerCore.display(m, si), p.num("value"), what)
                #expect(displayText(m, si) == p.str("text"), "\(what): \(displayText(m, si))")
                let text = quantityText(m, si)
                #expect(en.render(text.key, ["value": .fixed(text.value)]) == p.str("rendered"), "\(what) rendered")
            }
            expectClose(EggTimerCore.display(m, .nan), nan.num("value"), "\(q.rawValue) NaN")
            #expect(displayText(m, .nan) == nan.str("text"), "\(q.rawValue) NaN text")
        }
    }

    @Test("the round trip: every value every control can hold comes back as set")
    func roundTrip() {
        var checked = 0
        for c in list("measures") {
            guard let q = Quantity(rawValue: c.str("quantity")),
                  let rows = c["roundTrip"] as? [[String: Any]],
                  let typed = c["typed"] as? [[String: Any]] else { fatalError("measure \(c)") }
            let m = measureFor(q, system: system(c["system"]), region: c["region"] as? String)
            for r in rows {
                let value = r.num("typed")
                guard let si = parse(m, value) else {
                    Issue.record("\(q.rawValue) \(value): no reading")
                    continue
                }
                expectClose(si, r.num("si"), "\(q.rawValue) in \(m.unit.rawValue): \(value) stored")
                #expect(displayText(m, si) == r.str("text"), "\(q.rawValue) \(value): shown \(displayText(m, si))")
                #expect(displayText(m, si) == String(format: "%.\(m.decimals)f", value), "\(q.rawValue) \(value)")
                checked += 1
            }
            for r in typed {
                let value = r.optionalNum("typed") ?? .nan
                let si = parse(m, value)
                if let expected = r.optionalNum("si") {
                    guard let si else {
                        Issue.record("\(q.rawValue) \(value): no reading")
                        continue
                    }
                    expectClose(si, expected, "\(q.rawValue) typed \(value)")
                    #expect(displayText(m, si) == r.str("text"), "\(q.rawValue) typed \(value) shown")
                } else {
                    #expect(si == nil, "\(q.rawValue) typed \(value) is no reading")
                }
            }
        }
        #expect(checked > 1000, "\(checked) round trips")
    }

    @Test("the regional default")
    func regional() {
        for c in list("regional") {
            let ms = (c["measurementSystem"] as? String).flatMap(MeasurementSystemName.init(rawValue:))
            let temp = (c["temperature"] as? String).flatMap(TemperaturePreference.init(rawValue:))
            let actual = regionalUnits(region: c["region"] as? String, measurementSystem: ms, temperature: temp)
            #expect(actual.rawValue == c.str("units"), "\(c)")
        }
    }

    @Test("a choice is stored as a choice, and a flip is a change of system")
    func choose() {
        for c in list("choose") {
            let chosen = (c["chosen"] as? String).flatMap(UnitSystem.init(rawValue:))
            let choice = chooseUnits(chosen: chosen, regional: system(c["regional"]), next: system(c["next"]))
            #expect(choice.chosen.rawValue == c.str("stored"), "\(c)")
            #expect(choice.flip?.rawValue == c["flip"] as? String, "\(c): flip")
        }
        for c in list("stored") {
            let raw = c["raw"]
            // JSON's true and 0 both arrive as NSNumber; neither is a choice.
            #expect(readChosenUnits(raw is NSNull ? nil : raw)?.rawValue == c["chosen"] as? String, "\(String(describing: raw))")
        }
    }

    @Test("size labels in both systems")
    func sizeLabels() {
        let en = english()
        for c in list("sizeLabels") {
            let table = c.str("table") == "us" ? usSizeClasses : sizeClasses
            guard let cls = table.first(where: { $0.key == c.str("key") }),
                  let mass = c["mass"] as? [String: Any] else { fatalError("size label \(c)") }
            let label = sizeClassLabel(cls, system: system(c["system"]))
            #expect(label.mass.key == mass.str("key"), "\(c)")
            #expect(CopyConformance.arg(mass["value"] ?? "") == .fixed(label.mass.value), "\(c)")
            let text = en.render(label.key, ["mass": .text(en.render(label.mass.key, ["value": .fixed(label.mass.value)]))])
            #expect(text == c.str("text"), "\(text)")
        }
    }
}
