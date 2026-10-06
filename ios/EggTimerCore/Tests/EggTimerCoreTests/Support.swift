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
/// posterior met when DECISIONS.md 95 drew it again, at a time-scale where
/// the peak agreed to 1.5e-13 and the doses to 2-5e-12; at the neighbouring
/// 1.69935809e-7 both agree to 1e-14 (LOGBOOK.md, 6 October 2026). Still
/// eight orders tighter than anything that would change an answer.
let wholeCookDoseTolerance = 1e-11

/// The one comparison every conformance suite makes: relative to the expected
/// value, or absolute below 1.
func expectClose(
    _ actual: Double, _ expected: Double, _ what: String,
    tolerance: Double = conformanceTolerance, sourceLocation: SourceLocation = #_sourceLocation
) {
    let scale = max(abs(expected), 1.0)
    let error = abs(actual - expected) / scale
    #expect(
        error <= tolerance,
        "\(what): expected \(expected), got \(actual) (relative error \(error))",
        sourceLocation: sourceLocation
    )
}

/// A pot as the fixtures write one. A missing `afterBoil` is `.hold`, exactly
/// as the TypeScript's optional field is, and several fixtures omit it; an
/// afterBoil, start mode or cooling the port does not know fails.
func cookSetup(_ json: [String: Any]) throws -> CookSetup {
    let afterBoil = try json.optionalValue(HeatAfterBoil.self, "afterBoil") ?? .hold
    return try CookSetup(
        startMode: json.value(StartMode.self, "startMode"),
        eggStartC: json.num("eggStart_C"), ambientC: json.num("ambient_C"),
        boilingC: json.num("boiling_C"), timeToBoilS: json.num("timeToBoil_s"),
        cooling: json.value(Cooling.self, "cooling"),
        waterLitres: json.num("waterLitres"), afterBoil: afterBoil, eggCount: json.num("eggCount")
    )
}

/// A particle set as the fixtures write one: every particle and every weight.
/// The RNG state is the fixture's own unless `rng` is given, which is for the
/// posteriors that are written without one because nothing draws from them.
func posterior(_ json: [String: Any], rng: Int32? = nil) throws -> Posterior {
    let particles = try json.rows("particles").map {
        try Particle(
            alphaM2s: $0.num("alpha_m2s"), logDoseOffset: $0.num("logDoseOffset"),
            noise: $0.num("noise"),
            whiteOffset: $0.num("whiteOffset"), whiteFirmGap: $0.num("whiteFirmGap")
        )
    }
    let state: Int32
    if let rng {
        state = rng
    } else {
        state = Int32(truncating: try #require(json["rng"] as? NSNumber, "a particle set with no rng"))
    }
    return Posterior(particles: particles, weights: try json.numbers("weights"), rng: state)
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

/// A dose grid built from a fixture's recorded extent and resolution, for the
/// fixture's egg and pot.
func doseGrid(_ g: [String: Any], egg: Egg, setup: CookSetup) throws -> DoseGrid {
    try buildDoseGrid(
        egg: egg, setup: setup, tauAirScale: g.num("tauAirScale"),
        spec: GridSpec(
            alphaMin: g.num("alphaMin"), alphaMax: g.num("alphaMax"), alphaCount: Int(g.num("alphaCount")),
            timeMinS: g.num("timeMin_s"), timeMaxS: g.num("timeMax_s"), timeCount: Int(g.num("timeCount"))
        )
    )
}
