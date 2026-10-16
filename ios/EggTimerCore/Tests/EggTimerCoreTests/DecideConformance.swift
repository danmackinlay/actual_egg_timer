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

/// The solution at a row's level, as the app solves it: the posterior's
/// parameters and doneness.
private func meanSolve(_ c: Calibration, egg: Egg, setup: CookSetup, level: Double) -> Solution {
    solveCookTime(egg: egg, setup: setup, params: calibrationParams(c), doneness: calibrationDoneness(c, level: level))
}

@Suite("Decide")
struct DecideConformance {
    @Test("where each pot's decision surface goes")
    func specs() throws {
        for (i, row) in try Fixtures.list("decide.json", "specs").enumerated() {
            expectJSON(decisionGridSpec(try decoded(DecisionInputs.self, row["inputs"])), row["spec"], "spec \(i)")
        }
    }

    @Test("the surface the choices are made on")
    func surface() throws {
        try expectJSON(decideGrid(), Fixtures.object("decide.json", "grid")["surface"], "the surface")
    }

    @Test("the loss, the odds, the time chosen and the decision, from three posteriors")
    func decisions() throws {
        let file = try Fixtures.load("decide.json")
        let grid = try decideGrid()
        let g = try file.object("grid")
        let (egg, pot) = try (decoded(Egg.self, g["egg"]), decoded(CookSetup.self, g["setup"]))
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
            let mean = try row.num("meanCookTime_s")
            try expectClose(chooseCookTime(post, grid, target, aroundS: mean), row.num("chosen_s"), "\(label) chosen time")
            let (eggs, applies) = try (Int(row.num("eggsLogged")), row.flag("applies"))
            let d = decideAt(post, eggsLogged: eggs, grid: grid, meanCookTimeS: mean, applies: applies, logNominalTarget: target)
            expectJSON(d, row["decision"], "\(label) decision")
            for held in try row.rows("held") {
                let h = try decideAt(
                    post, eggsLogged: eggs, grid: grid, meanCookTimeS: mean, applies: applies, logNominalTarget: target,
                    bounds: decoded(TimeBounds.self, held["bounds"])
                )
                expectJSON(h, held["decision"], "\(label) held")
            }
            let c = Calibration(posterior: post, eggsLogged: eggs)
            let sol = try meanSolve(c, egg: egg, setup: pot, level: row.num("level"))
            let params = calibrationParams(c)
            expectJSON(
                decidedSolution(egg: egg, setup: pot, params: params, solution: sol, decision: d), row["decided"],
                "\(label) decided", tolerances: wholeCookDoses
            )
            expectJSON(
                decidedSolution(egg: egg, setup: pot, params: params, solution: sol, decision: d, nudgeS: -7), row["nudged"],
                "\(label) nudged", tolerances: wholeCookDoses
            )
        }
    }

    @Test("the nudge from a uniform draw: each whole second alike, clamped at the ends")
    func nudges() throws {
        for row in try Fixtures.list("decide.json", "nudges") {
            let u = try row.num("u")
            #expect(try nudgeSeconds(u) == row.num("nudge_s"), "draw \(u)")
        }
    }

    @Test("a cook re-solved mid-cook carries the lean it chose")
    func carried() throws {
        let file = try Fixtures.load("decide.json")
        let posteriors = try posteriorsByName(file.rows("posteriors"))
        var calibrations = [String: Calibration]()
        for p in try file.rows("posteriors") {
            let name = try p.str("name")
            calibrations[name] = try Calibration(posterior: #require(posteriors[name]), eggsLogged: Int(p.num("eggsLogged")))
        }
        let egg = try decoded(Egg.self, file.object("grid")["egg"])
        for row in try file.rows("carried") {
            let c = try #require(calibrations[row.str("posterior")], "no posterior")
            let pot = try decoded(CookSetup.self, row["setup"])
            let (level, lean) = try (row.num("level"), row.num("lean_s"))
            let carried = carriedSolution(
                egg: egg, setup: pot, params: calibrationParams(c), solution: meanSolve(c, egg: egg, setup: pot, level: level),
                leanS: lean
            )
            expectJSON(carried, row["carried"], "level \(level), lean \(lean)", tolerances: wholeCookDoses)
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
