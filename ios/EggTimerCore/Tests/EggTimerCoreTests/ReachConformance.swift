import Testing
import Foundation
@testable import EggTimerCore

/// The odds at every level, the range they allow, the verdict with it, the
/// shading and the advice, against `fixtures/reach.json`.
///
/// A profile is a solve and a decision per level, and both apps must walk the
/// same levels in the same order and land on the same ends of the range, or
/// the two sliders offer different eggs. The posteriors are decide.json's.
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

@Suite("Reach")
struct ReachConformance {
    @Test("the constants")
    func constants() {
        let c = object(Fixtures.load("reach.json"), "constants")
        #expect(reachOdds == c.num("reachOdds"))
        #expect(profileStep == Int(c.num("profileStep")))
        #expect(adviceBelowTenths == Int(c.num("adviceBelowTenths")))
        #expect(adviceMarginTenths == Int(c.num("adviceMarginTenths")))
        #expect(adviceGain == c.num("adviceGain"))
    }

    /// One test per profile, so the three run side by side: a profile is a
    /// couple of dozen solves, slow in a debug build.
    @Test("the odds at every level, the range, and the shading", arguments: [0, 1, 2])
    func profile(_ i: Int) {
        let byName = posteriors()
        let all = rows(Fixtures.load("reach.json"), "profiles")
        #expect(all.count == 3)
        do {
            let row = all[i]
            guard let post = byName[row.str("posterior")] else { fatalError("profile \(i): no posterior") }
            let c = Calibration(posterior: post, eggsLogged: Int(row.num("eggsLogged")))
            let egg = Geometry.eggFromMass(object(row, "egg").num("mass_kg"))
            let setup = setupOf(object(row, "setup"))
            let g = object(row, "grid")
            let grid = buildDoseGrid(
                egg: egg, setup: setup, tauAirScale: g.num("tauAirScale"),
                alphaMin: g.num("alphaMin"), alphaMax: g.num("alphaMax"), alphaCount: Int(g.num("alphaCount")),
                timeMinS: g.num("timeMin_s"), timeMaxS: g.num("timeMax_s"), timeCount: Int(g.num("timeCount"))
            )
            let p = oddsProfile(c, egg: egg, setup: setup, grid: grid)
            let expected = profileOf(object(row, "profile"))
            let label = "profile \(i) (\(row.str("posterior")), \(setup.cooling))"
            #expect(p.points.count == expected.points.count, "\(label) points")
            for (a, b) in zip(p.points, expected.points) {
                expectClose(a.level, b.level, "\(label) level")
                expectClose(a.odds, b.odds, "\(label) odds at \(b.level)")
            }
            expectClose(p.best, expected.best, "\(label) best")
            expectClose(p.physicalSoftest, expected.physicalSoftest, "\(label) physical softest")
            expectClose(p.physicalHardest, expected.physicalHardest, "\(label) physical hardest")
            #expect(p.softest == expected.softest, "\(label) softest")
            #expect(p.hardest == expected.hardest, "\(label) hardest")

            let shades = shadingOf(p)
            let expectedShades = rows(row, "shading")
            #expect(shades.count == expectedShades.count, "\(label) shades")
            for (a, b) in zip(shades, expectedShades) {
                expectClose(a.strength, b.num("strength"), "\(label) shade at \(b.num("level"))")
            }
            for near in rows(row, "near") {
                expectClose(oddsNear(p, level: near.num("level")), near.num("odds"), "\(label) near \(near.num("level"))")
            }
        }
    }

    @Test("the verdict, with and without the odds' range")
    func verdicts() {
        let result = CookResult(
            cookTimeS: 400, peakYolkC: 65, peakYolkTimeS: 500, yolkAtPullC: 60, yolkDoseMin: 1,
            whiteDoseMin: 1, peakWhiteC: 80
        )
        func solution(_ name: String) -> Solution {
            Solution(
                result: result, reachable: name == "reachable", minCookTimeS: 300,
                softestLevel: 0.1, hardestLevel: 0.9, whiteSets: name != "never"
            )
        }
        for row in rows(Fixtures.load("reach.json"), "verdicts") {
            var profile: OddsProfile?
            if let range = row["range"] as? [String: Any] {
                profile = OddsProfile(
                    points: [], best: 0.6, physicalSoftest: 0.1, physicalHardest: 0.9,
                    softest: optional(range, "softest"), hardest: optional(range, "hardest")
                )
            }
            let level = row.num("level")
            let v = verdictWithOdds(solution(row.str("solution")), level: level, profile: profile)
            let label = "\(row.str("solution")) at \(level), \(String(describing: row["range"]))"
            #expect(v.kind.rawValue == row.str("kind"), "\(label) kind")
            #expect(v.wanted.key == row.str("wanted"), "\(label) wanted")
            #expect(v.limit.key == row.str("limit"), "\(label) limit")
            #expect(v.snapTo == optional(row, "snapTo"), "\(label) snapTo")
            #expect(v.worthSaying == row.flag("worthSaying"), "\(label) worthSaying")
        }
    }

    @Test("when advice is offered, and which")
    func advice() {
        let file = Fixtures.load("reach.json")
        let adviceProfile = profileOf(object(file, "adviceProfile"))
        for row in rows(file, "adviceWanted") {
            let best = optional(row, "best")
            let profile = best.map {
                OddsProfile(
                    points: adviceProfile.points, best: $0, physicalSoftest: adviceProfile.physicalSoftest,
                    physicalHardest: adviceProfile.physicalHardest, softest: adviceProfile.softest,
                    hardest: adviceProfile.hardest
                )
            }
            #expect(
                adviceWanted(Int(row.num("tenths")), profile: profile) == row.flag("wanted"),
                "\(row.num("tenths")) against \(String(describing: best))"
            )
        }
        for row in rows(file, "advice") {
            let setup = setupOf(object(row, "setup"))
            let facts = AdviceFacts(eggFromClass: row.flag("eggFromClass"), startAssumed: row.flag("startAssumed"))
            #expect(unpricedAdvice(setup, facts: facts) == (row["unpriced"] as? [String]), "unpriced \(row)")
            let priced = pricedChanges(setup)
            let expected = rows(row, "priced")
            #expect(priced.map(\.key) == expected.map { $0.str("key") }, "priced keys \(row)")
            for (a, b) in zip(priced, expected) {
                #expect(a.setup == setupOf(object(b, "setup")), "priced setup \(a.key)")
            }
            for shown in rows(row, "shown") {
                let keys = protocolAdvice(
                    setup, facts: facts, level: shown.num("level"), odds: shown.num("odds"),
                    priced: priced.map { (key: $0.key, profile: adviceProfile) }
                )
                #expect(keys == (shown["keys"] as? [String]), "shown \(shown)")
            }
        }
    }
}
