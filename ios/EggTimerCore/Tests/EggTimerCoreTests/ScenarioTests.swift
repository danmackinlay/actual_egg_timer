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

private func loadScenarios() -> (egg: Egg, params: ModelParams, cases: [Scenario]) {
    let file = Fixtures.load("scenarios.json")
    guard let eggJSON = file["egg"] as? [String: Any],
          let paramsJSON = file["params"] as? [String: Any],
          let caseList = file["cases"] as? [[String: Any]] else {
        fatalError("fixtures/scenarios.json is not shaped as expected")
    }

    // Rebuilt from the recorded minor diameter rather than read field by field,
    // so the geometry is exercised here too: if eggFromMinorDiameter drifts,
    // every scenario moves and this is where it shows.
    let egg = Geometry.eggFromMinorDiameter(eggJSON.num("minorDiameter_m"))
    let params = ModelParams(
        alphaM2s: paramsJSON.num("alpha_m2s"), tauAirScale: paramsJSON.num("tauAirScale")
    )

    let cases = caseList.map { c -> Scenario in
        guard let setupJSON = c["setup"] as? [String: Any],
              let solution = c["solution"] as? [String: Any],
              let atFixed = c["atFixed444s"] as? [String: Any],
              let name = c["name"] as? String,
              let startMode = StartMode(rawValue: setupJSON["startMode"] as? String ?? ""),
              let cooling = Cooling(rawValue: setupJSON["cooling"] as? String ?? "") else {
            fatalError("malformed scenario: \(c)")
        }
        // Absent means 'hold', exactly as the TypeScript's optional field does.
        let afterBoil = HeatAfterBoil(rawValue: setupJSON["afterBoil"] as? String ?? "hold") ?? .hold
        let setup = CookSetup(
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
        return Scenario(
            name: name, level: c.num("level"), setup: setup, solution: solution, atFixed: atFixed
        )
    }
    return (egg, params, cases)
}

/// Whole-cook tolerance, relative.
///
/// The same 1e-12 the pure functions hold to, which is more than this needed:
/// probing at 1e-15 puts the worst observed disagreement at 7e-15, on an
/// accumulated dose after ~20,000 calls each to exp() and pow(), where two libm
/// implementations are entitled to differ in the last bit every time. Cook
/// times, peak temperatures and the boolean verdicts agree at 1e-15 outright.
///
/// Three orders of headroom over the noise, and still ten orders tighter than
/// anything that would change an answer - so an algebraic mistake, an
/// off-by-one in the integration loop, or a misread branch cannot pass.
private let scenarioTolerance = 1e-12

private func expectClose(
    _ actual: Double, _ expected: Double, _ what: String,
    tolerance: Double = scenarioTolerance, sourceLocation: SourceLocation = #_sourceLocation
) {
    let scale = max(abs(expected), 1.0)
    let error = abs(actual - expected) / scale
    #expect(
        error <= tolerance,
        "\(what): expected \(expected), got \(actual) (relative error \(error))",
        sourceLocation: sourceLocation
    )
}

@Suite("Whole cooks")
struct ScenarioConformance {
    @Test("every scenario solves to the same cook")
    func solutions() {
        let (egg, params, cases) = loadScenarios()
        for scenario in cases {
            let solution = solveCookTime(
                egg: egg, setup: scenario.setup, params: params,
                doneness: donenessFromSlider(scenario.level)
            )
            let expected = scenario.solution
            let at = scenario.name

            #expect(
                solution.reachable == (expected["reachable"] as? Bool ?? true),
                "reachable, \(at)"
            )
            #expect(
                solution.whiteSets == (expected["whiteSets"] as? Bool ?? true),
                "whiteSets, \(at)"
            )
            expectClose(solution.softestLevel, expected.num("softestLevel"), "softestLevel, \(at)")
            expectClose(solution.hardestLevel, expected.num("hardestLevel"), "hardestLevel, \(at)")
            expectClose(solution.minCookTimeS, expected.num("minCookTime_s"), "minCookTime, \(at)")
            expectClose(solution.result.cookTimeS, expected.num("cookTime_s"), "cookTime, \(at)")
            expectClose(solution.result.peakYolkC, expected.num("peakYolk_C"), "peak yolk, \(at)")
            expectClose(solution.result.peakWhiteC, expected.num("peakWhite_C"), "peak white, \(at)")
            expectClose(solution.result.yolkAtPullC, expected.num("yolkAtPull_C"), "yolk at pull, \(at)")
            expectClose(solution.result.yolkDoseMin, expected.num("yolkDose_min"), "yolk dose, \(at)")
            expectClose(solution.result.whiteDoseMin, expected.num("whiteDose_min"), "white dose, \(at)")
        }
    }

    @Test("a fixed 7.4 minute cook lands identically")
    func fixedCook() {
        // No search involved: straight integration, so a difference here is the
        // simulation itself rather than a bisection landing on a different step.
        let (egg, params, cases) = loadScenarios()
        for scenario in cases {
            let r = simulate(
                egg: egg, setup: scenario.setup, params: params, cookTimeS: 7.4 * 60
            )
            let at = scenario.name
            expectClose(r.peakYolkC, scenario.atFixed.num("peakYolk_C"), "peak yolk, \(at)")
            expectClose(r.yolkDoseMin, scenario.atFixed.num("yolkDose_min"), "yolk dose, \(at)")
            expectClose(r.whiteDoseMin, scenario.atFixed.num("whiteDose_min"), "white dose, \(at)")
        }
    }
}
