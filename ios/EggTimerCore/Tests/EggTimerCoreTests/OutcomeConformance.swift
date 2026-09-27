import Testing
import Foundation
@testable import EggTimerCore

/// The predicted outcome at the chosen time, against `fixtures/outcome.json`:
/// the three yolk answers, a runny white, the level range and the lean. The
/// surface and three of the posteriors are decide.json's; a fourth, a cook
/// whose three jammy eggs were all just right, is outcome.json's own.
private let tolerance = 1e-12

private func expectClose(
    _ actual: Double, _ expected: Double, _ what: String,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    let scale = max(abs(expected), 1.0)
    let error = abs(actual - expected) / scale
    #expect(
        error <= tolerance, "\(what): expected \(expected), got \(actual) (relative error \(error))",
        sourceLocation: sourceLocation
    )
}

private func object(_ json: [String: Any], _ key: String) -> [String: Any] {
    guard let o = json[key] as? [String: Any] else { fatalError("fixture has no object \(key)") }
    return o
}

private func rows(_ json: [String: Any], _ key: String) -> [[String: Any]] {
    guard let r = json[key] as? [[String: Any]] else { fatalError("fixture has no rows \(key)") }
    return r
}

private func setupOf(_ json: [String: Any]) -> CookSetup {
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

private func posteriors(_ list: [[String: Any]]) -> [String: Posterior] {
    var out = [String: Posterior]()
    for p in list {
        let particles = rows(p, "particles").map {
            Particle(
                alphaM2s: $0.num("alpha_m2s"), logDoseOffset: $0.num("logDoseOffset"),
                tauAirScale: $0.num("tauAirScale"), noise: $0.num("noise"),
                whiteOffset: $0.num("whiteOffset"), whiteFirmGap: $0.num("whiteFirmGap")
            )
        }
        guard let weights = p["weights"] as? [NSNumber] else { fatalError("no weights") }
        out[p.str("name")] = Posterior(particles: particles, weights: weights.map(\.doubleValue), rng: 1)
    }
    return out
}

private func decideGrid() -> DoseGrid {
    let g = object(Fixtures.load("decide.json"), "grid")
    return buildDoseGrid(
        egg: Geometry.eggFromMass(object(g, "egg").num("mass_kg")), setup: setupOf(object(g, "setup")),
        tauAirScale: g.num("tauAirScale"),
        alphaMin: g.num("alphaMin"), alphaMax: g.num("alphaMax"), alphaCount: Int(g.num("alphaCount")),
        timeMinS: g.num("timeMin_s"), timeMaxS: g.num("timeMax_s"), timeCount: Int(g.num("timeCount"))
    )
}

@Suite("Outcome")
struct OutcomeConformance {
    @Test("the constants")
    func constants() {
        let c = object(Fixtures.load("outcome.json"), "constants")
        #expect(leanRatio == c.num("leanRatio"))
        #expect(levelLowQ == c.num("levelLowQ"))
        #expect(levelHighQ == c.num("levelHighQ"))
    }

    @Test("the answers, the level range and the lean, from four posteriors")
    func outcomes() {
        let file = Fixtures.load("outcome.json")
        let grid = decideGrid()
        var byName = posteriors(rows(Fixtures.load("decide.json"), "posteriors"))
        for (name, post) in posteriors(rows(file, "posteriors")) { byName[name] = post }
        for (i, row) in rows(file, "cases").enumerated() {
            guard let post = byName[row.str("posterior")] else { fatalError("case \(i): no posterior") }
            let target = row.num("logNominalTarget")
            for at in rows(row, "at") {
                let t = at.num("t")
                let label = "case \(i) (\(row.str("note"))) at \(t)"
                let o = predictOutcome(post, grid, t, target)
                let expected = object(at, "outcome")
                expectClose(o.pTooSoft, expected.num("pTooSoft"), "\(label) too soft")
                expectClose(o.pJustRight, expected.num("pJustRight"), "\(label) just right")
                expectClose(o.pTooFirm, expected.num("pTooFirm"), "\(label) too firm")
                expectClose(o.pWhiteRunny, expected.num("pWhiteRunny"), "\(label) runny")
                expectClose(o.levelLow, expected.num("levelLow"), "\(label) level low")
                expectClose(o.levelMedian, expected.num("levelMedian"), "\(label) level median")
                expectClose(o.levelHigh, expected.num("levelHigh"), "\(label) level high")
                #expect(o.lean.rawValue == expected.str("lean"), "\(label) lean")
            }
        }
    }

    @Test("the lean, at the ratio's edge")
    func leans() {
        for row in rows(Fixtures.load("outcome.json"), "leans") {
            let lean = leanOf(row.num("pTooSoft"), row.num("pTooFirm"))
            #expect(lean.rawValue == row.str("lean"), "\(row)")
        }
    }
}
