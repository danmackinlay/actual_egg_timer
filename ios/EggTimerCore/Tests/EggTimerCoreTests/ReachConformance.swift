import Testing
import Foundation
@testable import EggTimerCore

/// The odds at every level, the range they allow, the verdict with it, the
/// shading and the advice, against `fixtures/reach.json`.
///
/// A profile is a solve and a decision per level, and both apps must walk the
/// same levels in the same order and land on the same ends of the range, or
/// the two sliders offer different eggs. The posteriors are decide.json's.

private func profileOf(_ json: [String: Any]) throws -> OddsProfile {
    try OddsProfile(
        points: json.rows("points").map {
            try LevelOdds(level: $0.num("level"), cookTimeS: $0.num("cookTime_s"), odds: $0.num("odds"))
        },
        best: json.num("best"),
        physicalSoftest: json.num("physicalSoftest"), physicalHardest: json.num("physicalHardest"),
        softest: json.optionalNum("softest"), hardest: json.optionalNum("hardest")
    )
}

@Suite("Reach")
struct ReachConformance {
    @Test("the constants")
    func constants() throws {
        let c = try Fixtures.object("reach.json", "constants")
        #expect(try reachOdds == c.num("reachOdds"))
        #expect(try profileStep == Int(c.num("profileStep")))
        #expect(try adviceBelowTenths == Int(c.num("adviceBelowTenths")))
        #expect(try adviceMarginTenths == Int(c.num("adviceMarginTenths")))
        #expect(try adviceGain == c.num("adviceGain"))
        #expect(try shadeBestMin == c.num("shadeBestMin"))
    }

    @Test("no shading when the best odds are under a tenth")
    func shadingThreshold() throws {
        for row in try Fixtures.list("reach.json", "shading") {
            let profile = try profileOf(row.object("profile"))
            let shades = shadingOf(profile)
            // Empty for the profile under a tenth, which is the point; the
            // count is compared first, so an empty list is still checked.
            let expected = try row.rows("shading", mayBeEmpty: true)
            #expect(shades.count == expected.count, "best \(profile.best)")
            for (a, b) in zip(shades, expected) {
                try expectClose(a.level, b.num("level"), "best \(profile.best) level")
                try expectClose(a.strength, b.num("strength"), "best \(profile.best) strength")
            }
        }
    }

    /// Every profile in the fixture. The package builds `-O` even for tests,
    /// so a profile's couple of dozen solves are quick.
    @Test("the odds at every level, the range, and the shading")
    func profiles() throws {
        let byName = try posteriorsByName(Fixtures.list("decide.json", "posteriors"))
        for (i, row) in try Fixtures.list("reach.json", "profiles").enumerated() {
            let name = try row.str("posterior")
            let post = try #require(byName[name], "profile \(i): no posterior")
            let c = try Calibration(posterior: post, eggsLogged: Int(row.num("eggsLogged")))
            let egg = try Geometry.eggFromMass(row.object("egg").num("mass_kg"))
            let setup = try cookSetup(row.object("setup"))
            let grid = try doseGrid(row.object("grid"), egg: egg, setup: setup)
            let p = oddsProfile(c, egg: egg, setup: setup, grid: grid)
            let expected = try profileOf(row.object("profile"))
            let label = "profile \(i) (\(name), \(setup.cooling))"
            #expect(p.points.count == expected.points.count, "\(label) points")
            for (a, b) in zip(p.points, expected.points) {
                expectClose(a.level, b.level, "\(label) level")
                expectClose(a.cookTimeS, b.cookTimeS, "\(label) time at \(b.level)")
                expectClose(a.odds, b.odds, "\(label) odds at \(b.level)")
            }
            expectClose(p.best, expected.best, "\(label) best")
            expectClose(p.physicalSoftest, expected.physicalSoftest, "\(label) physical softest")
            expectClose(p.physicalHardest, expected.physicalHardest, "\(label) physical hardest")
            #expect(p.softest == expected.softest, "\(label) softest")
            #expect(p.hardest == expected.hardest, "\(label) hardest")

            let shades = shadingOf(p)
            let expectedShades = try row.rows("shading")
            #expect(shades.count == expectedShades.count, "\(label) shades")
            for (a, b) in zip(shades, expectedShades) {
                try expectClose(a.strength, b.num("strength"), "\(label) shade at \(b.num("level"))")
            }
            for near in try row.rows("near") {
                let level = try near.num("level")
                try expectClose(oddsNear(p, level: level), near.num("odds"), "\(label) near \(level)")
            }
            // The envelope: the bounds at a level, and the time the app gives
            // there, decided within them. No bound above is null in JSON.
            for env in try row.rows("envelope") {
                let level = try env.num("level")
                let bounds = envelopeBounds(p, level: level)
                if let expectedBounds = env["bounds"] as? [String: Any] {
                    let b = try #require(bounds, "\(label) bounds at \(level)")
                    try expectClose(b.loS, expectedBounds.num("lo_s"), "\(label) lo at \(level)")
                    if let hi = try expectedBounds.optionalNum("hi_s") {
                        expectClose(b.hiS, hi, "\(label) hi at \(level)")
                    } else {
                        #expect(b.hiS == .infinity, "\(label) hi at \(level)")
                    }
                } else {
                    #expect(bounds == nil, "\(label) bounds at \(level)")
                }
                let a = answerAt(c, egg: egg, setup: setup, level: level, profile: p, snapRetry: true)
                let d = decide(
                    c, grid: grid, solution: a.solution, logNominalTarget: logYolkTarget(a.level),
                    bounds: envelopeBounds(p, level: a.level)
                )
                try expectClose(d.cookTimeS, env.num("held_s"), "\(label) time held at \(level)")
            }
        }
    }

    /// The solve, the verdict and the retry at the level it snaps to, for each
    /// profile's pot, with the profile as the fixture has it.
    @Test("the answer at a level, its snap-and-retry, and its warning")
    func answers() throws {
        let byName = try posteriorsByName(Fixtures.list("decide.json", "posteriors"))
        let profiles = try Fixtures.list("reach.json", "profiles")
        for row in try Fixtures.list("reach.json", "answers") {
            let index = try Int(row.num("profile"))
            try #require(profiles.indices.contains(index), "answer for a profile \(index) the fixture lacks")
            let p = profiles[index]
            let post = try #require(byName[p.str("posterior")], "no posterior")
            let c = try Calibration(posterior: post, eggsLogged: Int(p.num("eggsLogged")))
            let egg = try Geometry.eggFromMass(p.object("egg").num("mass_kg"))
            let level = try row.num("level")
            let withOdds = try row.flag("withOdds")
            let snapRetry = try row.flag("snapRetry")
            let a = try answerAt(
                c, egg: egg, setup: cookSetup(p.object("setup")), level: level,
                profile: withOdds ? profileOf(p.object("profile")) : nil,
                snapRetry: snapRetry
            )
            let label = "profile \(index) at \(level), odds \(withOdds), retry \(snapRetry)"
            #expect(try a.verdict.kind.rawValue == row.str("kind"), "\(label) kind")
            #expect(try a.verdict.snapTo == row.optionalNum("snapTo"), "\(label) snapTo")
            #expect(try a.level == row.num("answeredLevel"), "\(label) level")
            #expect(try a.lowOdds == row.flag("lowOdds"), "\(label) lowOdds")
            #expect(try a.solution.reachable == row.flag("reachable"), "\(label) reachable")
            try expectClose(a.solution.result.cookTimeS, row.num("cookTime_s"), "\(label) cook time")
        }
    }

    @Test("the warning, with and without a range at 3/10")
    func lowOdds() throws {
        for row in try Fixtures.list("reach.json", "lowOdds") {
            var profile: OddsProfile?
            if let range = row["range"] as? [String: Any] {
                profile = try OddsProfile(
                    points: [], best: 0.6, physicalSoftest: 0.1, physicalHardest: 0.9,
                    softest: range.optionalNum("softest"), hardest: range.optionalNum("hardest")
                )
            }
            let level = try row.num("level")
            let label = "\(level), \(String(describing: row["range"]))"
            #expect(try lowOddsAt(profile, level: level) == row.flag("lowOdds"), "\(label)")
        }
    }

    @Test("when advice is offered, and which")
    func advice() throws {
        let file = try Fixtures.load("reach.json")
        let adviceProfile = try profileOf(file.object("adviceProfile"))
        for row in try file.rows("adviceWanted") {
            let best = try row.optionalNum("best")
            let tenths = try row.num("tenths")
            let profile = best.map {
                OddsProfile(
                    points: adviceProfile.points, best: $0, physicalSoftest: adviceProfile.physicalSoftest,
                    physicalHardest: adviceProfile.physicalHardest, softest: adviceProfile.softest,
                    hardest: adviceProfile.hardest
                )
            }
            #expect(
                try adviceWanted(Int(tenths), profile: profile) == row.flag("wanted"),
                "\(tenths) against \(String(describing: best))"
            )
        }
        for row in try file.rows("advice") {
            let setup = try cookSetup(row.object("setup"))
            let facts = try AdviceFacts(eggFromClass: row.flag("eggFromClass"), startAssumed: row.flag("startAssumed"))
            #expect(unpricedAdvice(setup, facts: facts) == (row["unpriced"] as? [String]), "unpriced \(row)")
            let priced = pricedChanges(setup)
            // Most pots have nothing to price; the keys are compared whole, so
            // an empty list is still checked.
            let expected = try row.rows("priced", mayBeEmpty: true)
            #expect(try priced.map(\.key) == expected.map { try $0.str("key") }, "priced keys \(row)")
            for (a, b) in zip(priced, expected) {
                #expect(try a.setup == cookSetup(b.object("setup")), "priced setup \(a.key)")
            }
            for shown in try row.rows("shown") {
                let keys = try protocolAdvice(
                    setup, facts: facts, level: shown.num("level"), odds: shown.num("odds"),
                    priced: priced.map { (key: $0.key, profile: adviceProfile) }
                )
                #expect(keys == (shown["keys"] as? [String]), "shown \(shown)")
            }
        }
    }
}
