import Testing
import Foundation
@testable import EggTimerCore

/// The play-safe levels, against `fixtures/safer.json`: the outcome read at a
/// level as the app reads it, and the softest offered level whose 10% point
/// reaches the cook's level and the firmest whose 90% point stays under it
/// with a white that is not a risk (P(runny) under `whiteRisk`).
///
/// The search is a bisection over solves and decisions, so both apps must read
/// the same levels in the same order and land on the same ones, or they
/// suggest different eggs. Each case carries its odds profile, which
/// `fixtures/reach.json` already holds the computation of; the posteriors are
/// decide.json's, but for the last case: the web's fresh install at jammy, on
/// the prior built from its count and seed and the production surface, where
/// the yolk alone would point softer to where the white is a risk.
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

/// A number or null.
private func optional(_ json: [String: Any], _ key: String) -> Double? {
    (json[key] as? NSNumber)?.doubleValue
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

private func posteriors() -> [String: Posterior] {
    var out = [String: Posterior]()
    for p in rows(Fixtures.load("decide.json"), "posteriors") {
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

private func profileOf(_ json: [String: Any]) -> OddsProfile {
    OddsProfile(
        points: rows(json, "points").map { LevelOdds(level: $0.num("level"), odds: $0.num("odds")) },
        best: json.num("best"),
        physicalSoftest: json.num("physicalSoftest"), physicalHardest: json.num("physicalHardest"),
        softest: optional(json, "softest"), hardest: optional(json, "hardest")
    )
}

@Suite("Safer")
struct SaferConformance {
    /// One test per case, so they run side by side: a search is a dozen or so
    /// solves and decisions, slow in a debug build.
    @Test("the white's threshold")
    func constants() {
        #expect(whiteRisk == object(Fixtures.load("safer.json"), "constants").num("whiteRisk"))
    }

    @Test("the outcome at a level, and the play-safe levels", arguments: [0, 1, 2, 3, 4, 5])
    func safer(_ i: Int) {
        let all = rows(Fixtures.load("safer.json"), "cases")
        #expect(all.count == 6)
        let row = all[i]
        let post: Posterior
        if let prior = row["prior"] as? [String: Any] {
            post = createPrior(count: Int(prior.num("count")), seed: Int32(prior.num("seed")))
        } else if let named = posteriors()[row.str("posterior")] {
            post = named
        } else {
            fatalError("case \(i): no posterior")
        }
        let c = Calibration(posterior: post, eggsLogged: Int(row.num("eggsLogged")))
        let egg = Geometry.eggFromMass(object(row, "egg").num("mass_kg"))
        let setup = setupOf(object(row, "setup"))
        let g = object(row, "grid")
        let grid = buildDoseGrid(
            egg: egg, setup: setup, tauAirScale: g.num("tauAirScale"),
            alphaMin: g.num("alphaMin"), alphaMax: g.num("alphaMax"), alphaCount: Int(g.num("alphaCount")),
            timeMinS: g.num("timeMin_s"), timeMaxS: g.num("timeMax_s"), timeCount: Int(g.num("timeCount"))
        )
        let profile = profileOf(object(row, "profile"))

        let offered = object(row, "offered")
        let range = offeredPositions(profile)
        #expect(range?.lo == Int(offered.num("lo")), "case \(i): offered from")
        #expect(range?.hi == Int(offered.num("hi")), "case \(i): offered to")

        for at in rows(row, "outcomes") {
            let level = at.num("level")
            let label = "case \(i) at \(level)"
            let o = outcomeAtLevel(c, egg: egg, setup: setup, grid: grid, level: level)
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
        for at in rows(row, "safer") {
            let level = at.num("level")
            let s = saferLevels(c, egg: egg, setup: setup, grid: grid, profile: profile, level: level)
            #expect(s.firmerLevel == optional(at, "firmerLevel"), "case \(i) at \(level): firmer")
            #expect(s.softerLevel == optional(at, "softerLevel"), "case \(i) at \(level): softer")
            // Softer never buys the yolk with a runny white.
            if let softer = s.softerLevel {
                let o = outcomeAtLevel(c, egg: egg, setup: setup, grid: grid, level: softer)
                #expect(o.pWhiteRunny < whiteRisk, "case \(i) at \(level): softer's white \(o.pWhiteRunny)")
            }
        }
    }
}
