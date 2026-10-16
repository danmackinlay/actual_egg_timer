import Testing
import Foundation
@testable import EggTimerCore

/// Whole cooks, against `fixtures/scenarios.json`.
///
/// `ConformanceTests` pins the pure functions. This pins what happens when they
/// are wired together and run for ten thousand steps: the surface schedule, the
/// dose integrals, the bisection, and the standing scan - including the two
/// cases that exist only with the heat off, where the pan cannot reach the
/// requested doneness and where it never sets the white at all.
/// The fixture's egg is rebuilt from its mass, and held to the one written,
/// so the geometry is exercised here too: if eggFromMass drifts, every
/// scenario moves and this is where it shows.
private func loadScenarios() throws -> (egg: Egg, params: ModelParams, cases: [[String: Any]]) {
    let file = try Fixtures.load("scenarios.json")
    let egg = try Geometry.eggFromMass(decoded(Egg.self, file["egg"]).massKg)
    expectJSON(egg, file["egg"], "the egg")
    return (egg, try decoded(ModelParams.self, file["params"]), try file.rows("cases"))
}

// Whole cooks are held to the same `conformanceTolerance` (1e-12, relative)
// as the pure functions, which is more than this needed: probing at 1e-15 puts
// the worst observed disagreement at 7e-15, on an accumulated dose after
// ~20,000 calls each to exp() and pow(), where two libm implementations are
// entitled to differ in the last bit every time. Cook times, peak temperatures
// and the boolean verdicts agree at 1e-15 outright.
//
// Three orders of headroom over the noise, and still ten orders tighter than
// anything that would change an answer - so an algebraic mistake, an
// off-by-one in the integration loop, or a misread branch cannot pass.

@Suite("Whole cooks")
struct ScenarioConformance {
    @Test("every scenario solves to the same cook")
    func solutions() throws {
        let (egg, params, cases) = try loadScenarios()
        for c in cases {
            let solution = try solveCookTime(
                egg: egg, setup: decoded(CookSetup.self, c["setup"]), params: params,
                doneness: donenessFromSlider(c.num("level"))
            )
            try expectJSON(solution, c["solution"], c.str("name"))
        }
    }

    /// No search involved: straight integration, so a difference here is the
    /// simulation itself rather than a bisection landing on a different step.
    @Test("a fixed 7.4 minute cook lands identically")
    func fixedCook() throws {
        let (egg, params, cases) = try loadScenarios()
        for c in cases {
            let r = try simulate(egg: egg, setup: decoded(CookSetup.self, c["setup"]), params: params, cookTimeS: 7.4 * 60)
            try expectJSON(r, c["atFixed444s"], c.str("name"))
        }
    }
}
