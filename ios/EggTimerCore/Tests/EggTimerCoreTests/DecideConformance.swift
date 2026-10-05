import Testing
import Foundation
@testable import EggTimerCore

/// The choice of time, against `fixtures/decide.json`.
///
/// The two apps must choose the SAME time for the same posterior and the same
/// pot, so this pins every step: where each pot's decision surface goes (a
/// solve, then arithmetic), the surface itself, the expected loss and the odds
/// at fixed times, and the time the search lands on - a scan and a golden
/// section, whose comparisons both languages must make the same way.

private func fixtureGrid(_ file: [String: Any]) throws -> (grid: DoseGrid, json: [String: Any]) {
    let g = try file.object("grid")
    let grid = try doseGrid(
        g, egg: Geometry.eggFromMass(g.object("egg").num("mass_kg")), setup: cookSetup(g.object("setup"))
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

private func expectSolution(_ s: Solution, _ json: [String: Any], _ label: String) throws {
    let reachable = try json.flag("reachable")
    #expect(s.reachable == reachable, "\(label) reachable")
    try expectClose(s.result.cookTimeS, json.num("cookTime_s"), "\(label) cook time")
    try expectClose(s.result.peakYolkC, json.num("peakYolk_C"), "\(label) peak yolk")
    try expectClose(s.result.yolkDoseMin, json.num("yolkDose_min"), "\(label) yolk dose")
    try expectClose(s.result.whiteDoseMin, json.num("whiteDose_min"), "\(label) white dose")
}

@Suite("Decide")
struct DecideConformance {
    @Test("the constants")
    func constants() throws {
        let c = try Fixtures.object("decide.json", "constants")
        #expect(try runnyWhiteLoss == c.num("runnyWhiteLoss"))
        #expect(try leanCostPerS == c.num("leanCostPerS"))
        #expect(try decisionAlphaLo == c.num("decisionAlphaLo"))
        #expect(try decisionAlphaHi == c.num("decisionAlphaHi"))
        #expect(try decisionAlphaCount == Int(c.num("decisionAlphaCount")))
        #expect(try decisionTimeStepS == c.num("decisionTimeStep_s"))
        #expect(try decisionWindowS == c.num("decisionWindow_s"))
    }

    @Test("where each pot's decision surface goes")
    func specs() throws {
        for (i, row) in try Fixtures.list("decide.json", "specs").enumerated() {
            let inputs = try row.object("inputs")
            let params = try inputs.object("params")
            let spec = try decisionGridSpec(DecisionInputs(
                egg: Geometry.eggFromMass(inputs.object("egg").num("mass_kg")),
                setup: cookSetup(inputs.object("setup")),
                params: ModelParams(alphaM2s: params.num("alpha_m2s"), tauAirScale: params.num("tauAirScale")),
                whiteDoseMin: inputs.num("whiteDose_min")
            ))
            let expected = try row.object("spec")
            try expectClose(spec.alphaMin, expected.num("alphaMin"), "spec \(i) alphaMin")
            try expectClose(spec.alphaMax, expected.num("alphaMax"), "spec \(i) alphaMax")
            #expect(try spec.alphaCount == Int(expected.num("alphaCount")), "spec \(i) alphaCount")
            try expectClose(spec.timeMinS, expected.num("timeMin_s"), "spec \(i) timeMin")
            try expectClose(spec.timeMaxS, expected.num("timeMax_s"), "spec \(i) timeMax")
            #expect(try spec.timeCount == Int(expected.num("timeCount")), "spec \(i) timeCount")
        }
    }

    @Test("the surface the choices are made on")
    func surface() throws {
        let (grid, json) = try fixtureGrid(Fixtures.load("decide.json"))
        let yolk = try json.numbers("logYolk")
        let white = try json.numbers("logWhite")
        #expect(grid.logYolk.count == yolk.count)
        for i in 0..<yolk.count {
            expectClose(grid.logYolk[i], yolk[i], "logYolk[\(i)]")
            expectClose(grid.logWhite[i], white[i], "logWhite[\(i)]")
        }
    }

    @Test("the loss, the odds, the time chosen and the decision, from three posteriors")
    func decisions() throws {
        let file = try Fixtures.load("decide.json")
        let (grid, _) = try fixtureGrid(file)
        let byName = try posteriorsByName(file.rows("posteriors"))

        for (i, row) in try file.rows("cases").enumerated() {
            let name = try row.str("posterior")
            let post = try #require(byName[name], "case \(i): no posterior \(name)")
            let target = try row.num("logNominalTarget")
            let label = "case \(i) (\(name))"
            for probe in try row.rows("loss") {
                let t = try probe.num("t")
                try expectClose(expectedLoss(post, grid, t, target), probe.num("loss"), "\(label) loss at \(t)")
            }
            for probe in try row.rows("odds") {
                let t = try probe.num("t")
                try expectClose(hitOdds(post, grid, t, target), probe.num("odds"), "\(label) odds at \(t)")
            }
            try expectClose(
                chooseCookTime(post, grid, target, aroundS: row.num("meanCookTime_s")), row.num("chosen_s"),
                "\(label) chosen time"
            )
            let d = try decideAt(
                post, eggsLogged: Int(row.num("eggsLogged")), grid: grid,
                meanCookTimeS: row.num("meanCookTime_s"), applies: row.flag("applies"), logNominalTarget: target
            )
            let expected = try row.object("decision")
            try expectClose(d.cookTimeS, expected.num("cookTime_s"), "\(label) decided time")
            #expect(try d.chosen == expected.flag("chosen"), "\(label) chosen")
            try expectClose(d.odds, expected.num("odds"), "\(label) odds")
            #expect(try d.oddsTenths == Int(expected.num("oddsTenths")), "\(label) tenths")
            for held in try row.rows("held") {
                let b = try held.object("bounds")
                let bounds = try TimeBounds(loS: b.num("lo_s"), hiS: b.num("hi_s"))
                let h = try decideAt(
                    post, eggsLogged: Int(row.num("eggsLogged")), grid: grid,
                    meanCookTimeS: row.num("meanCookTime_s"), applies: row.flag("applies"),
                    logNominalTarget: target, bounds: bounds
                )
                try expectClose(h.cookTimeS, held.num("cookTime_s"), "\(label) held time")
                try expectClose(h.odds, held.num("odds"), "\(label) held odds")
            }

            let c = try Calibration(posterior: post, eggsLogged: Int(row.num("eggsLogged")))
            let g = try file.object("grid")
            let egg = try Geometry.eggFromMass(g.object("egg").num("mass_kg"))
            let pot = try cookSetup(g.object("setup"))
            let decided = try decidedSolution(
                egg: egg, setup: pot, params: calibrationParams(c),
                solution: meanSolve(c, egg: egg, setup: pot, level: row.num("level")), decision: d
            )
            try expectSolution(decided, row.object("decided"), "\(label) decided")
            let nudged = try decidedSolution(
                egg: egg, setup: pot, params: calibrationParams(c),
                solution: meanSolve(c, egg: egg, setup: pot, level: row.num("level")), decision: d, nudgeS: -7
            )
            try expectSolution(nudged, row.object("nudged"), "\(label) nudged")
        }
    }

    @Test("the nudge from a uniform draw: each whole second alike, clamped at the ends")
    func nudges() throws {
        let file = try Fixtures.load("decide.json")
        #expect(try nudgeMaxS == file.num("nudgeMax_s"))
        for row in try file.rows("nudges") {
            let u = try row.num("u")
            #expect(try nudgeSeconds(u) == row.num("nudge_s"), "draw \(u)")
        }
    }

    @Test("a cook re-solved mid-cook carries the lean it chose")
    func carried() throws {
        let file = try Fixtures.load("decide.json")
        let posteriors = try posteriorsByName(file.rows("posteriors"))
        var byName = [String: (Posterior, Int)]()
        for p in try file.rows("posteriors") {
            let name = try p.str("name")
            byName[name] = (try #require(posteriors[name]), Int(try p.num("eggsLogged")))
        }
        let egg = try Geometry.eggFromMass(file.object("grid").object("egg").num("mass_kg"))
        for row in try file.rows("carried") {
            let (post, eggs) = try #require(byName[row.str("posterior")], "no posterior")
            let c = Calibration(posterior: post, eggsLogged: eggs)
            let pot = try cookSetup(row.object("setup"))
            let level = try row.num("level")
            let lean = try row.num("lean_s")
            let sol = meanSolve(c, egg: egg, setup: pot, level: level)
            let carried = carriedSolution(
                egg: egg, setup: pot, params: calibrationParams(c), solution: sol, leanS: lean
            )
            try expectSolution(carried, row.object("carried"), "level \(level), lean \(lean)")
        }
    }

    @Test("odds in tenths, at the rounding edges")
    func tenths() throws {
        for row in try Fixtures.list("decide.json", "tenths") {
            let odds = try row.num("odds")
            #expect(try oddsInTenths(odds) == Int(row.num("tenths")), "\(odds)")
        }
    }
}
