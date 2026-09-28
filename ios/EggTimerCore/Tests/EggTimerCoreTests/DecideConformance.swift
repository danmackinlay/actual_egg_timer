import Testing
import Foundation
@testable import EggTimerCore

/// E5's choice, against `fixtures/decide.json`.
///
/// The two apps must choose the SAME time for the same posterior and the same
/// pot, so this pins every step: where each pot's decision surface goes (a
/// solve, then arithmetic), the surface itself, the expected loss and the odds
/// at fixed times, and the time the search lands on - a scan and a golden
/// section, whose comparisons both languages must make the same way.

private func doubles(_ json: [String: Any], _ key: String) -> [Double] {
    guard let list = json[key] as? [NSNumber] else {
        fatalError("fixture has no numeric array \(key)")
    }
    return list.map(\.doubleValue)
}

private func object(_ json: [String: Any], _ key: String) -> [String: Any] {
    guard let o = json[key] as? [String: Any] else { fatalError("fixture has no object \(key)") }
    return o
}

private func setup(_ json: [String: Any]) -> CookSetup {
    guard let startMode = StartMode(rawValue: json.str("startMode")),
          let cooling = Cooling(rawValue: json.str("cooling")) else {
        fatalError("fixture setup is not shaped as expected: \(json)")
    }
    let afterBoil = HeatAfterBoil(rawValue: json["afterBoil"] as? String ?? "hold") ?? .hold
    return CookSetup(
        startMode: startMode, eggStartC: json.num("eggStart_C"), ambientC: json.num("ambient_C"),
        boilingC: json.num("boiling_C"), timeToBoilS: json.num("timeToBoil_s"), cooling: cooling,
        waterLitres: json.num("waterLitres"), afterBoil: afterBoil, eggCount: json.num("eggCount")
    )
}

private func posterior(_ json: [String: Any]) -> Posterior {
    guard let rows = json["particles"] as? [[String: Any]] else {
        fatalError("fixture posterior has no particles")
    }
    let particles = rows.map {
        Particle(
            alphaM2s: $0.num("alpha_m2s"), logDoseOffset: $0.num("logDoseOffset"),
            tauAirScale: $0.num("tauAirScale"), noise: $0.num("noise"),
            whiteOffset: $0.num("whiteOffset"), whiteFirmGap: $0.num("whiteFirmGap")
        )
    }
    return Posterior(particles: particles, weights: doubles(json, "weights"), rng: 1)
}

private func fixtureGrid(_ file: [String: Any]) -> (grid: DoseGrid, json: [String: Any]) {
    let g = object(file, "grid")
    let grid = buildDoseGrid(
        egg: Geometry.eggFromMass(object(g, "egg").num("mass_kg")), setup: setup(object(g, "setup")),
        tauAirScale: g.num("tauAirScale"),
        alphaMin: g.num("alphaMin"), alphaMax: g.num("alphaMax"), alphaCount: Int(g.num("alphaCount")),
        timeMinS: g.num("timeMin_s"), timeMaxS: g.num("timeMax_s"), timeCount: Int(g.num("timeCount"))
    )
    return (grid, g)
}

/// The solution at a row's level, as the app solves it: the posterior's
/// parameters and doneness.
private func meanSolve(_ c: Calibration, egg: Egg, setup: CookSetup, level: Double) -> Solution {
    solveCookTime(
        egg: egg, setup: setup, params: calibrationParams(c), doneness: calibrationDoneness(c, level: level)
    )
}

private func expectSolution(_ s: Solution, _ json: [String: Any], _ label: String) {
    #expect(s.reachable == json.flag("reachable"), "\(label) reachable")
    expectClose(s.result.cookTimeS, json.num("cookTime_s"), "\(label) cook time")
    expectClose(s.result.peakYolkC, json.num("peakYolk_C"), "\(label) peak yolk")
    expectClose(s.result.yolkDoseMin, json.num("yolkDose_min"), "\(label) yolk dose")
    expectClose(s.result.whiteDoseMin, json.num("whiteDose_min"), "\(label) white dose")
}

@Suite("Decide")
struct DecideConformance {
    @Test("the constants")
    func constants() {
        let c = object(Fixtures.load("decide.json"), "constants")
        #expect(runnyWhiteLoss == c.num("runnyWhiteLoss"))
        #expect(leanCostPerS == c.num("leanCostPerS"))
        #expect(decisionAlphaLo == c.num("decisionAlphaLo"))
        #expect(decisionAlphaHi == c.num("decisionAlphaHi"))
        #expect(decisionAlphaCount == Int(c.num("decisionAlphaCount")))
        #expect(decisionTimeStepS == c.num("decisionTimeStep_s"))
        #expect(decisionWindowS == c.num("decisionWindow_s"))
    }

    @Test("where each pot's decision surface goes")
    func specs() {
        guard let rows = Fixtures.load("decide.json")["specs"] as? [[String: Any]] else {
            fatalError("no specs in fixtures/decide.json")
        }
        for (i, row) in rows.enumerated() {
            let inputs = object(row, "inputs")
            let params = object(inputs, "params")
            let spec = decisionGridSpec(DecisionInputs(
                egg: Geometry.eggFromMass(object(inputs, "egg").num("mass_kg")),
                setup: setup(object(inputs, "setup")),
                params: ModelParams(alphaM2s: params.num("alpha_m2s"), tauAirScale: params.num("tauAirScale")),
                whiteDoseMin: inputs.num("whiteDose_min")
            ))
            let expected = object(row, "spec")
            expectClose(spec.alphaMin, expected.num("alphaMin"), "spec \(i) alphaMin")
            expectClose(spec.alphaMax, expected.num("alphaMax"), "spec \(i) alphaMax")
            #expect(spec.alphaCount == Int(expected.num("alphaCount")), "spec \(i) alphaCount")
            expectClose(spec.timeMinS, expected.num("timeMin_s"), "spec \(i) timeMin")
            expectClose(spec.timeMaxS, expected.num("timeMax_s"), "spec \(i) timeMax")
            #expect(spec.timeCount == Int(expected.num("timeCount")), "spec \(i) timeCount")
        }
    }

    @Test("the surface the choices are made on")
    func surface() {
        let (grid, json) = fixtureGrid(Fixtures.load("decide.json"))
        let yolk = doubles(json, "logYolk")
        let white = doubles(json, "logWhite")
        #expect(grid.logYolk.count == yolk.count)
        for i in 0..<yolk.count {
            expectClose(grid.logYolk[i], yolk[i], "logYolk[\(i)]")
            expectClose(grid.logWhite[i], white[i], "logWhite[\(i)]")
        }
    }

    @Test("the loss, the odds, the time chosen and the decision, from three posteriors")
    func decisions() {
        let file = Fixtures.load("decide.json")
        let (grid, _) = fixtureGrid(file)
        guard let posteriors = file["posteriors"] as? [[String: Any]],
              let cases = file["cases"] as? [[String: Any]] else {
            fatalError("fixtures/decide.json is not shaped as expected")
        }
        var byName = [String: Posterior]()
        for p in posteriors { byName[p.str("name")] = posterior(p) }

        for (i, row) in cases.enumerated() {
            guard let post = byName[row.str("posterior")] else { fatalError("case \(i): no posterior") }
            let target = row.num("logNominalTarget")
            let label = "case \(i) (\(row.str("posterior")))"
            for probe in (row["loss"] as? [[String: Any]]) ?? [] {
                expectClose(expectedLoss(post, grid, probe.num("t"), target), probe.num("loss"), "\(label) loss at \(probe.num("t"))")
            }
            for probe in (row["odds"] as? [[String: Any]]) ?? [] {
                expectClose(hitOdds(post, grid, probe.num("t"), target), probe.num("odds"), "\(label) odds at \(probe.num("t"))")
            }
            expectClose(
                chooseCookTime(post, grid, target, aroundS: row.num("meanCookTime_s")), row.num("chosen_s"),
                "\(label) chosen time"
            )
            let d = decideAt(
                post, eggsLogged: Int(row.num("eggsLogged")), grid: grid,
                meanCookTimeS: row.num("meanCookTime_s"), applies: row.flag("applies"), logNominalTarget: target
            )
            let expected = object(row, "decision")
            expectClose(d.cookTimeS, expected.num("cookTime_s"), "\(label) decided time")
            #expect(d.chosen == expected.flag("chosen"), "\(label) chosen")
            expectClose(d.odds, expected.num("odds"), "\(label) odds")
            #expect(d.oddsTenths == Int(expected.num("oddsTenths")), "\(label) tenths")

            let c = Calibration(posterior: post, eggsLogged: Int(row.num("eggsLogged")))
            let g = object(file, "grid")
            let egg = Geometry.eggFromMass(object(g, "egg").num("mass_kg"))
            let pot = setup(object(g, "setup"))
            let decided = decidedSolution(
                egg: egg, setup: pot, params: calibrationParams(c),
                solution: meanSolve(c, egg: egg, setup: pot, level: row.num("level")), decision: d
            )
            expectSolution(decided, object(row, "decided"), "\(label) decided")
        }
    }

    @Test("a cook re-solved mid-cook carries the lean it chose")
    func carried() {
        let file = Fixtures.load("decide.json")
        guard let posteriors = file["posteriors"] as? [[String: Any]],
              let rows = file["carried"] as? [[String: Any]], !rows.isEmpty else {
            fatalError("fixtures/decide.json has no carried rows")
        }
        var byName = [String: (Posterior, Int)]()
        for p in posteriors { byName[p.str("name")] = (posterior(p), Int(p.num("eggsLogged"))) }
        let egg = Geometry.eggFromMass(object(object(file, "grid"), "egg").num("mass_kg"))
        for row in rows {
            guard let (post, eggs) = byName[row.str("posterior")] else { fatalError("no posterior") }
            let c = Calibration(posterior: post, eggsLogged: eggs)
            let pot = setup(object(row, "setup"))
            let sol = meanSolve(c, egg: egg, setup: pot, level: row.num("level"))
            let carried = carriedSolution(
                egg: egg, setup: pot, params: calibrationParams(c), solution: sol, leanS: row.num("lean_s")
            )
            expectSolution(carried, object(row, "carried"), "level \(row.num("level")), lean \(row.num("lean_s"))")
        }
    }

    @Test("odds in tenths, at the rounding edges")
    func tenths() {
        guard let rows = Fixtures.load("decide.json")["tenths"] as? [[String: Any]] else {
            fatalError("no tenths in fixtures/decide.json")
        }
        for row in rows {
            #expect(oddsInTenths(row.num("odds")) == Int(row.num("tenths")), "\(row.num("odds"))")
        }
    }
}
