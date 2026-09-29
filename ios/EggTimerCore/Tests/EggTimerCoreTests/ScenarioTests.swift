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
private struct Scenario {
    let name: String
    let level: Double
    let setup: CookSetup
    let solution: [String: Any]
    let atFixed: [String: Any]
}

private func loadScenarios() throws -> (egg: Egg, params: ModelParams, cases: [Scenario]) {
    let file = try Fixtures.load("scenarios.json")
    let eggJSON = try file.object("egg")
    let paramsJSON = try file.object("params")

    // Rebuilt from the recorded mass rather than read field by field, so the
    // geometry is exercised here too: if eggFromMass drifts, every scenario
    // moves and this is where it shows.
    let egg = try Geometry.eggFromMass(eggJSON.num("mass_kg"))
    let params = try ModelParams(
        alphaM2s: paramsJSON.num("alpha_m2s"), tauAirScale: paramsJSON.num("tauAirScale")
    )

    let cases = try file.rows("cases").map { c -> Scenario in
        let setupJSON = try c.object("setup")
        let startMode = try #require(StartMode(rawValue: setupJSON["startMode"] as? String ?? ""), "malformed scenario: \(c)")
        let cooling = try #require(Cooling(rawValue: setupJSON["cooling"] as? String ?? ""), "malformed scenario: \(c)")
        // Absent means 'hold', exactly as the TypeScript's optional field does.
        let afterBoil = HeatAfterBoil(rawValue: setupJSON["afterBoil"] as? String ?? "hold") ?? .hold
        let setup = try CookSetup(
            startMode: startMode,
            eggStartC: setupJSON.num("eggStart_C"),
            ambientC: setupJSON.num("ambient_C"),
            boilingC: setupJSON.num("boiling_C"),
            timeToBoilS: setupJSON.num("timeToBoil_s"),
            cooling: cooling,
            waterLitres: setupJSON.num("waterLitres"),
            afterBoil: afterBoil,
            eggCount: setupJSON.num("eggCount")
        )
        return try Scenario(
            name: c.str("name"), level: c.num("level"), setup: setup,
            solution: c.object("solution"), atFixed: c.object("atFixed444s")
        )
    }
    return (egg, params, cases)
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
        for scenario in cases {
            let solution = solveCookTime(
                egg: egg, setup: scenario.setup, params: params,
                doneness: donenessFromSlider(scenario.level)
            )
            let expected = scenario.solution
            let at = scenario.name

            #expect(try solution.reachable == expected.flag("reachable"), "reachable, \(at)")
            #expect(try solution.whiteSets == expected.flag("whiteSets"), "whiteSets, \(at)")
            try expectClose(solution.softestLevel, expected.num("softestLevel"), "softestLevel, \(at)")
            try expectClose(solution.hardestLevel, expected.num("hardestLevel"), "hardestLevel, \(at)")
            try expectClose(solution.minCookTimeS, expected.num("minCookTime_s"), "minCookTime, \(at)")
            try expectClose(solution.result.cookTimeS, expected.num("cookTime_s"), "cookTime, \(at)")
            try expectClose(solution.result.peakYolkC, expected.num("peakYolk_C"), "peak yolk, \(at)")
            try expectClose(solution.result.peakWhiteC, expected.num("peakWhite_C"), "peak white, \(at)")
            try expectClose(solution.result.yolkAtPullC, expected.num("yolkAtPull_C"), "yolk at pull, \(at)")
            try expectClose(solution.result.yolkDoseMin, expected.num("yolkDose_min"), "yolk dose, \(at)")
            try expectClose(solution.result.whiteDoseMin, expected.num("whiteDose_min"), "white dose, \(at)")
        }
    }

    @Test("a fixed 7.4 minute cook lands identically")
    func fixedCook() throws {
        // No search involved: straight integration, so a difference here is the
        // simulation itself rather than a bisection landing on a different step.
        let (egg, params, cases) = try loadScenarios()
        for scenario in cases {
            let r = simulate(
                egg: egg, setup: scenario.setup, params: params, cookTimeS: 7.4 * 60
            )
            let at = scenario.name
            try expectClose(r.peakYolkC, scenario.atFixed.num("peakYolk_C"), "peak yolk, \(at)")
            try expectClose(r.yolkDoseMin, scenario.atFixed.num("yolkDose_min"), "yolk dose, \(at)")
            try expectClose(r.whiteDoseMin, scenario.atFixed.num("whiteDose_min"), "white dose, \(at)")
        }
    }
}
