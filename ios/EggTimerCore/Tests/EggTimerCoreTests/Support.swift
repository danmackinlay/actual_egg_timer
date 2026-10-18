import Testing
import Foundation
@testable import EggTimerCore

/// How close two numbers must be for the two implementations to agree.
///
/// Relative and tight: 1e-12 is a few ulps of a double, which is all that
/// differing libm implementations of exp/sin/log10 can cost. An algebraic
/// mistake is never that small. Every suite holds to it, whole cooks included
/// (see ScenarioTests.swift for the headroom there).
let conformanceTolerance = 1e-12

/// A whole cook's accumulated dose, where the two libms' last bits are
/// compounded. One ulp of difference in one mode's per-step decay factor,
/// carried through the ~1300 steps of a cook, is ~1.5e-13 of the peak
/// temperature, and a dose is exponential in it (ln 10 / z, 0.5 per degree
/// for the yolk): ~5e-12. That is what the decide fixture's `firmer`
/// posterior meets, at a time-scale where
/// the peak agreed to 1.5e-13 and the doses to 2-5e-12; at the neighbouring
/// 1.69935809e-7 both agree to 1e-14. Still
/// eight orders tighter than anything that would change an answer.
let wholeCookDoseTolerance = 1e-11

/// A whole cook's doses held to `wholeCookDoseTolerance` and the rest of it
/// to `conformanceTolerance`, as `expectJSON`'s `tolerances`.
let wholeCookDoses = ["yolkDose_min": wholeCookDoseTolerance, "whiteDose_min": wholeCookDoseTolerance]

/// How far two numbers are apart, as every conformance suite measures it:
/// relative to the expected value, or absolute below 1.
func closeness(_ actual: Double, _ expected: Double) -> Double {
    abs(actual - expected) / max(abs(expected), 1.0)
}

/// A single number against the fixture's.
func expectClose(
    _ actual: Double, _ expected: Double, _ what: String,
    tolerance: Double = conformanceTolerance, sourceLocation: SourceLocation = #_sourceLocation
) {
    let error = closeness(actual, expected)
    #expect(
        error <= tolerance,
        "\(what): expected \(expected), got \(actual) (relative error \(error))",
        sourceLocation: sourceLocation
    )
}

// MARK: - Whole values

/// What a non-finite number is written as here: JSON has none, and
/// JSON.stringify writes each as null, so a comparison reads this as null.
private let nonFinite = "\u{0}non-finite"

/// A value as JSON, as the fixtures hold one: through its Codable, which
/// spells each field as the TypeScript does, then JSONSerialization.
func jsonOf<T: Encodable>(_ value: T) throws -> Any {
    let encoder = JSONEncoder()
    encoder.nonConformingFloatEncodingStrategy = .convertToString(
        positiveInfinity: nonFinite, negativeInfinity: nonFinite, nan: nonFinite
    )
    return try JSONSerialization.jsonObject(with: encoder.encode(value), options: [.fragmentsAllowed])
}

/// A fixture's value as the core type it is, through that type's Codable: the
/// fixtures are machine-written, so a value that does not decode is a bug in
/// the generator, and fails the test that read it.
func decoded<T: Decodable>(_ type: T.Type, _ json: Any?) throws -> T {
    guard let json else { throw FixtureError("no \(T.self) where the fixture should have one") }
    let data = try JSONSerialization.data(withJSONObject: json, options: [.fragmentsAllowed])
    return try JSONDecoder().decode(T.self, from: data)
}

/// What a field the TypeScript may leave out means when it is absent.
private func absentMeans(_ key: String) -> Any? {
    switch key {
    case "afterBoil": "hold"
    case "asking": false
    default: nil
    }
}

/// Every place `actual` and `expected`, both as JSONSerialization gives them,
/// differ: a path and the two values. Numbers agree to `tolerance` relative
/// above 1 and absolute below, or to the tolerance
/// `tolerances` gives their key; with `clockFrom`, a number past 1e9 is an
/// epoch time and is compared as seconds from it, as a cook time is. JSON's
/// null and a non-finite number are alike; strings, booleans and lengths are
/// compared exactly.
///
/// A missing key reads as null, or as what `absentMeans` says it means:
/// Swift's own Codable leaves a nil out where the TypeScript writes null, and
/// a result that only these tests encode need not spell its nulls. What is
/// stored or sent is held `strict`: a key is in both or in neither, so a null
/// left out is found, as the server's `parseRecord` would refuse it.
func jsonDifferences(
    _ actual: Any?, _ expected: Any?, tolerance: Double = conformanceTolerance,
    tolerances: [String: Double] = [:], clockFrom: Double? = nil, strict: Bool = false, at path: String = ""
) -> [String] {
    func isNull(_ v: Any?) -> Bool { v == nil || v is NSNull || (v as? String) == nonFinite }
    func shown(_ v: Any?) -> String {
        if isNull(v) { return "null" }
        if let v, JSONSerialization.isValidJSONObject(v) || v is NSNumber || v is String,
           let data = try? JSONSerialization.data(withJSONObject: v, options: [.fragmentsAllowed, .sortedKeys]),
           let text = String(data: data, encoding: .utf8) {
            return text.count > 120 ? "\(text.prefix(117))..." : text
        }
        return String(describing: v)
    }
    let here = path.isEmpty ? "the value" : path
    if isNull(actual) || isNull(expected) {
        return isNull(actual) && isNull(expected) ? [] : ["\(here): \(shown(actual)), expected \(shown(expected))"]
    }
    if let a = actual as? [String: Any], let e = expected as? [String: Any] {
        return Set(a.keys).union(e.keys).sorted().flatMap { key -> [String] in
            let at = path.isEmpty ? key : "\(path).\(key)"
            if strict, (a[key] == nil) != (e[key] == nil) {
                let (x, y) = (a[key].map { shown($0) } ?? "absent", e[key].map { shown($0) } ?? "absent")
                return ["\(at): \(x), expected \(y)"]
            }
            let (x, y) = strict ? (a[key], e[key]) : (a[key] ?? absentMeans(key), e[key] ?? absentMeans(key))
            return jsonDifferences(
                x, y, tolerance: tolerances[key] ?? tolerance, tolerances: tolerances, clockFrom: clockFrom,
                strict: strict, at: at
            )
        }
    }
    if let a = actual as? [Any], let e = expected as? [Any] {
        guard a.count == e.count else { return ["\(here): \(a.count) items, expected \(e.count)"] }
        return zip(a, e).enumerated().flatMap { i, pair in
            jsonDifferences(
                pair.0, pair.1, tolerance: tolerance, tolerances: tolerances, clockFrom: clockFrom, strict: strict,
                at: "\(path)[\(i)]"
            )
        }
    }
    if let a = actual as? NSNumber, let e = expected as? NSNumber {
        let (ab, eb) = (CFGetTypeID(a) == CFBooleanGetTypeID(), CFGetTypeID(e) == CFBooleanGetTypeID())
        if ab || eb {
            return ab && eb && a.boolValue == e.boolValue ? [] : ["\(here): \(shown(a)), expected \(shown(e))"]
        }
        var (x, y) = (a.doubleValue, e.doubleValue)
        if let clock = clockFrom, abs(y) >= 1e9 {
            x -= clock
            y -= clock
        }
        let error = closeness(x, y)
        return error <= tolerance ? [] : ["\(here): \(a.doubleValue), expected \(e.doubleValue) (\(error))"]
    }
    if let a = actual as? String, let e = expected as? String, a == e { return [] }
    return ["\(here): \(shown(actual)), expected \(shown(expected))"]
}

/// The comparison every conformance suite makes: a result of this core,
/// whole, against the fixture's, as `jsonDifferences` compares them; `strict`
/// for what is stored or sent.
func expectJSON<T: Encodable>(
    _ actual: T, _ expected: Any?, _ what: String, tolerance: Double = conformanceTolerance,
    tolerances: [String: Double] = [:], clockFrom: Double? = nil, strict: Bool = false,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    do {
        let differences = jsonDifferences(
            try jsonOf(actual), expected, tolerance: tolerance, tolerances: tolerances, clockFrom: clockFrom,
            strict: strict
        )
        let shown = differences.prefix(6).joined(separator: "; ")
        let more = differences.count > 6 ? "; and \(differences.count - 6) more" : ""
        #expect(differences.isEmpty, "\(what): \(shown)\(more)", sourceLocation: sourceLocation)
    } catch {
        Issue.record("\(what): \(error)", sourceLocation: sourceLocation)
    }
}

/// `expectJSON` for a row put together here, of numbers, words and flags,
/// in the fixture's own spelling.
func expectJSON(
    _ actual: [String: Any], _ expected: Any?, _ what: String, tolerance: Double = conformanceTolerance,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    let differences = jsonDifferences(actual, expected, tolerance: tolerance)
    #expect(differences.isEmpty, "\(what): \(differences.prefix(6).joined(separator: "; "))", sourceLocation: sourceLocation)
}

/// A particle set as the fixtures write one: every particle and every weight.
/// The RNG state is the fixture's own unless `rng` is given, which is for the
/// posteriors that are written without one because nothing draws from them.
func posterior(_ json: [String: Any], rng: Int32? = nil) throws -> Posterior {
    var json = json
    if let rng { json["rng"] = Int(rng) }
    return try decoded(Posterior.self, json)
}

/// decide.json's named posteriors (outcome.json has one more), which carry no
/// RNG state because nothing draws from them. The prior is written as its
/// count and seed, and drawn here as the app draws it.
func posteriorsByName(_ list: [[String: Any]]) throws -> [String: Posterior] {
    var out = [String: Posterior]()
    for p in list {
        out[try p.str("name")] = p["particles"] == nil
            ? try createPrior(count: Int(p.num("count")), seed: Int32(p.num("seed")))
            : try posterior(p, rng: 1)
    }
    return out
}

/// decide.json's surface, which outcome.json and certainty.json read their
/// posteriors on too: built from its egg, pot and spec.
func decideGrid() throws -> DoseGrid {
    let g = try Fixtures.object("decide.json", "grid")
    return try doseGrid(g["spec"], egg: decoded(Egg.self, g["egg"]), setup: decoded(CookSetup.self, g["setup"]))
}

/// A dose grid built to a fixture's spec (its extent and resolution, as a
/// `GridSpec`), for the fixture's egg and pot. Each is built once and shared:
/// the running and step fixtures ask for a few dozen surfaces hundreds of
/// times, and a surface is the slow part.
func doseGrid(_ spec: Any?, egg: Egg, setup: CookSetup) throws -> DoseGrid {
    builtGrids.grid(egg: egg, setup: setup, spec: try decoded(GridSpec.self, spec))
}

/// The dose grids built so far, by egg, pot and spec. Suites run in parallel,
/// so it is locked; a grid is built outside the lock, and two suites wanting
/// the same one at once may each build it.
private final class BuiltGrids: @unchecked Sendable {
    private let lock = NSLock()
    private var grids = [String: DoseGrid]()

    func grid(egg: Egg, setup: CookSetup, spec: GridSpec) -> DoseGrid {
        let key = "\(egg)|\(setup)|\(spec)"
        if let grid = lock.withLock({ grids[key] }) { return grid }
        let grid = buildDoseGrid(egg: egg, setup: setup, spec: spec)
        lock.withLock { grids[key] = grid }
        return grid
    }
}

private let builtGrids = BuiltGrids()

/// The comparison itself: a conformance suite that compared nothing would
/// pass, so what `jsonDifferences` finds is held here.
@Suite("Whole values")
struct WholeValueTests {
    private func json(_ text: String) throws -> Any {
        try JSONSerialization.jsonObject(with: Data(text.utf8))
    }

    @Test("each kind of difference is found, at its path, and only those")
    func differences() throws {
        let fixture = try json(#"{"a": 1.5, "b": {"c": [1, 2e9], "d": null}, "e": true, "f": "x", "afterBoil": "hold"}"#)
        let same = try json(#"{"a": 1.5000000000001, "b": {"c": [1, 2e9]}, "e": true, "f": "x"}"#)
        #expect(jsonDifferences(same, fixture).isEmpty)
        let other = try json(
            #"{"a": 1.5001, "b": {"c": [1, 2.0000001e9], "d": 0}, "e": 1, "f": "y", "g": 2, "afterBoil": "off"}"#
        )
        let found = jsonDifferences(other, fixture).map { String($0.prefix { $0 != ":" }) }
        #expect(found == ["a", "afterBoil", "b.c[1]", "b.d", "e", "f", "g"])
        #expect(jsonDifferences(other, fixture, clockFrom: 2e9).count == found.count, "seconds from the clock")
        #expect(jsonDifferences(try jsonOf([1.0, .infinity]), [1, NSNull()]).isEmpty, "a non-finite number is null")
        #expect(jsonDifferences([1, 2], [1]).count == 1, "a length")
        let strictly = jsonDifferences(same, fixture, strict: true).map { String($0.prefix { $0 != ":" }) }
        #expect(strictly == ["afterBoil", "b.d"], "strict: a key left out is not its null, nor what it means")
        let written = try json(
            #"{"a": 1.5, "b": {"c": [1, 2e9], "d": null}, "e": true, "f": "x", "afterBoil": "hold", "g": null}"#
        )
        #expect(jsonDifferences(written, fixture, strict: true).count == 1, "strict: a null not in the fixture")
        let (leftOut, null): (Any, Any) = ([[String: Any]()], [["x": NSNull()]])
        #expect(jsonDifferences(leftOut, null).isEmpty, "lenient: in a list")
        #expect(jsonDifferences(leftOut, null, strict: true).count == 1, "strict: in a list")
    }
}
