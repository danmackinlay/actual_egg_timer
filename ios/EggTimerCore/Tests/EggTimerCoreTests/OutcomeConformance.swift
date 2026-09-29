import Testing
import Foundation
@testable import EggTimerCore

/// The predicted outcome at the chosen time, against `fixtures/outcome.json`:
/// the three yolk answers, a runny white, the level range and the lean. The
/// surface and three of the posteriors are decide.json's; a fourth, a cook
/// whose three jammy eggs were all just right, is outcome.json's own.

private func setupOf(_ json: [String: Any]) throws -> CookSetup {
    let startMode = try #require(StartMode(rawValue: json.str("startMode")), "fixture setup: \(json)")
    let cooling = try #require(Cooling(rawValue: json.str("cooling")), "fixture setup: \(json)")
    let afterBoil = HeatAfterBoil(rawValue: json["afterBoil"] as? String ?? "hold") ?? .hold
    return try CookSetup(
        startMode: startMode, eggStartC: json.num("eggStart_C"), ambientC: json.num("ambient_C"),
        boilingC: json.num("boiling_C"), timeToBoilS: json.num("timeToBoil_s"), cooling: cooling,
        waterLitres: json.num("waterLitres"), afterBoil: afterBoil, eggCount: json.num("eggCount")
    )
}

private func posteriors(_ list: [[String: Any]]) throws -> [String: Posterior] {
    var out = [String: Posterior]()
    for p in list {
        let particles = try p.rows("particles").map {
            try Particle(
                alphaM2s: $0.num("alpha_m2s"), logDoseOffset: $0.num("logDoseOffset"),
                tauAirScale: $0.num("tauAirScale"), noise: $0.num("noise"),
                whiteOffset: $0.num("whiteOffset"), whiteFirmGap: $0.num("whiteFirmGap")
            )
        }
        out[try p.str("name")] = Posterior(particles: particles, weights: try p.numbers("weights"), rng: 1)
    }
    return out
}

private func decideGrid() throws -> DoseGrid {
    let g = try Fixtures.object("decide.json", "grid")
    return try buildDoseGrid(
        egg: Geometry.eggFromMass(g.object("egg").num("mass_kg")), setup: setupOf(g.object("setup")),
        tauAirScale: g.num("tauAirScale"),
        alphaMin: g.num("alphaMin"), alphaMax: g.num("alphaMax"), alphaCount: Int(g.num("alphaCount")),
        timeMinS: g.num("timeMin_s"), timeMaxS: g.num("timeMax_s"), timeCount: Int(g.num("timeCount"))
    )
}

@Suite("Outcome")
struct OutcomeConformance {
    @Test("the constants")
    func constants() throws {
        let c = try Fixtures.object("outcome.json", "constants")
        #expect(try leanRatio == c.num("leanRatio"))
        #expect(try levelLowQ == c.num("levelLowQ"))
        #expect(try levelHighQ == c.num("levelHighQ"))
    }

    @Test("the answers, the level range and the lean, from four posteriors")
    func outcomes() throws {
        let file = try Fixtures.load("outcome.json")
        let grid = try decideGrid()
        var byName = try posteriors(Fixtures.list("decide.json", "posteriors"))
        for (name, post) in try posteriors(file.rows("posteriors")) { byName[name] = post }
        for (i, row) in try file.rows("cases").enumerated() {
            let post = try #require(byName[row.str("posterior")], "case \(i): no posterior")
            let target = try row.num("logNominalTarget")
            let note = try row.str("note")
            for at in try row.rows("at") {
                let t = try at.num("t")
                let label = "case \(i) (\(note)) at \(t)"
                let o = predictOutcome(post, grid, t, target)
                let expected = try at.object("outcome")
                try expectClose(o.pTooSoft, expected.num("pTooSoft"), "\(label) too soft")
                try expectClose(o.pJustRight, expected.num("pJustRight"), "\(label) just right")
                try expectClose(o.pTooFirm, expected.num("pTooFirm"), "\(label) too firm")
                try expectClose(o.pWhiteRunny, expected.num("pWhiteRunny"), "\(label) runny")
                try expectClose(o.levelLow, expected.num("levelLow"), "\(label) level low")
                try expectClose(o.levelMedian, expected.num("levelMedian"), "\(label) level median")
                try expectClose(o.levelHigh, expected.num("levelHigh"), "\(label) level high")
                #expect(try o.lean.rawValue == expected.str("lean"), "\(label) lean")
            }
        }
    }

    @Test("the lean, at the ratio's edge")
    func leans() throws {
        for row in try Fixtures.list("outcome.json", "leans") {
            let lean = try leanOf(row.num("pTooSoft"), row.num("pTooFirm"))
            #expect(try lean.rawValue == row.str("lean"), "\(row)")
        }
    }
}
