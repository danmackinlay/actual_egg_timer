import Testing
import Foundation
@testable import EggTimerCore

/// The odds and the certainty at every level, the range they allow, the
/// verdict with it, the shading and the advice, against `fixtures/reach.json`.
///
/// A profile is a solve and a decision per level, and both apps must walk the
/// same levels in the same order and land on the same ends of the range, or
/// the two sliders offer different eggs. The posteriors are decide.json's.

private func profileOf(_ json: [String: Any]) throws -> OddsProfile {
    try OddsProfile(
        // Empty where the white never sets: no level to give odds on.
        points: json.rows("points", mayBeEmpty: true).map {
            try LevelOdds(
                level: $0.num("level"), cookTimeS: $0.num("cookTime_s"), odds: $0.num("odds"),
                pAsked: $0.num("pAsked"), certainty: $0.value(Certainty.self, "certainty")
            )
        },
        best: json.num("best"), bestAsked: json.num("bestAsked"),
        physicalSoftest: json.num("physicalSoftest"), physicalHardest: json.num("physicalHardest"),
        softest: json.optionalNum("softest"), hardest: json.optionalNum("hardest")
    )
}

@Suite("Reach")
struct ReachConformance {
    @Test("the constants")
    func constants() throws {
        let c = try Fixtures.object("reach.json", "constants")
        #expect(try profileStep == Int(c.num("profileStep")))
        #expect(try adviceGain == c.num("adviceGain"))
        #expect(try shadeBestMin == c.num("shadeBestMin"))
    }

    @Test("no shading when the best chance is under a twentieth")
    func shadingThreshold() throws {
        for row in try Fixtures.list("reach.json", "shading") {
            let profile = try profileOf(row.object("profile"))
            let shades = shadingOf(profile)
            // Empty for the profile under a tenth, which is the point; the
            // count is compared first, so an empty list is still checked.
            let expected = try row.rows("shading", mayBeEmpty: true)
            #expect(shades.count == expected.count, "best \(profile.bestAsked)")
            for (a, b) in zip(shades, expected) {
                try expectClose(a.level, b.num("level"), "best \(profile.bestAsked) level")
                try expectClose(a.strength, b.num("strength"), "best \(profile.bestAsked) strength")
            }
        }
    }

    /// Every profile in the fixture. The package builds `-O` even for tests,
    /// so a profile's couple of dozen solves are quick.
    @Test("the odds and the certainty at every level, the range, and the shading")
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
                expectClose(a.pAsked, b.pAsked, "\(label) P(asked) at \(b.level)")
                #expect(a.certainty == b.certainty, "\(label) certainty at \(b.level)")
            }
            expectClose(p.best, expected.best, "\(label) best")
            expectClose(p.bestAsked, expected.bestAsked, "\(label) best P(asked)")
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
                try expectClose(askedNear(p, level: level), near.num("pAsked"), "\(label) near \(level)")
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

    /// The answer with its time decided (`decideAnswer`), as both apps show
    /// it: for each profile's pot, the owner's egg (DECISIONS.md 83 and 84)
    /// and a pot whose white never sets. The profile is the fixture's, so this
    /// holds the decision alone; `profiles()` holds the profile.
    @Test("the decided answer: the envelope, the nudge, the outcome, the certainty and the advice")
    func decided() throws {
        let file = try Fixtures.load("reach.json")
        var byName = try posteriorsByName(Fixtures.list("decide.json", "posteriors"))
        let owner = try file.object("owner")
        for (name, post) in try posteriorsByName([owner.object("posterior")]) { byName[name] = post }
        var pots: [(label: String, row: [String: Any], posterior: String)] = []
        for (i, row) in try file.rows("profiles").enumerated() {
            pots.append((label: "profile \(i)", row: row, posterior: try row.str("posterior")))
        }
        pots.append((label: "owner", row: owner, posterior: "owner"))
        pots.append((label: "never sets", row: try file.object("neverSets"), posterior: try file.object("neverSets").str("posterior")))
        for pot in pots {
            let post = try #require(byName[pot.posterior], "\(pot.label): no posterior")
            let c = try Calibration(posterior: post, eggsLogged: Int(pot.row.num("eggsLogged")))
            let egg = try Geometry.eggFromMass(pot.row.object("egg").num("mass_kg"))
            let setup = try cookSetup(pot.row.object("setup"))
            let grid = try doseGrid(pot.row.object("grid"), egg: egg, setup: setup)
            let profile = try profileOf(pot.row.object("profile"))
            for row in try pot.row.rows("decided") {
                let asked = try row.num("asked")
                let withOdds = try row.flag("withOdds")
                let drawn = try row.num("drawn_s")
                let label = "\(pot.label) at \(asked), odds \(withOdds), nudge \(drawn)"
                let odds = withOdds ? profile : nil
                let a = answerAt(c, egg: egg, setup: setup, level: asked, profile: odds, snapRetry: true)
                #expect(try a.level == row.num("answeredLevel"), "\(label) answered level")
                #expect(try a.lowOdds == row.flag("lowOdds"), "\(label) low odds")
                let own = decide(c, grid: grid, solution: a.solution, logNominalTarget: logYolkTarget(a.level))
                try expectClose(own.cookTimeS, row.num("own_s"), "\(label) own choice")
                let d = decideAnswer(
                    c, egg: egg, setup: setup, grid: grid, solution: a.solution, level: a.level,
                    profile: odds, nudgeS: drawn
                )
                #expect(try d.level == row.num("level"), "\(label) level")
                let sol = try row.object("solution")
                #expect(try d.solution.reachable == sol.flag("reachable"), "\(label) reachable")
                #expect(try d.solution.whiteSets == sol.flag("whiteSets"), "\(label) white sets")
                try expectClose(d.solution.result.cookTimeS, sol.num("cookTime_s"), "\(label) time shown")
                try expectClose(d.solution.result.peakYolkC, sol.num("peakYolk_C"), "\(label) peak yolk")
                let dec = try row.object("decision")
                try expectClose(d.decision.cookTimeS, dec.num("cookTime_s"), "\(label) time decided")
                try expectClose(d.decision.meanCookTimeS, dec.num("meanCookTime_s"), "\(label) mean time")
                #expect(try d.decision.chosen == dec.flag("chosen"), "\(label) chosen")
                try expectClose(d.decision.odds, dec.num("odds"), "\(label) odds")
                #expect(try d.decision.oddsTenths == Int(dec.num("oddsTenths")), "\(label) tenths")
                let o = try row.object("outcome")
                try expectClose(d.outcome.pTooSoft, o.num("pTooSoft"), "\(label) too soft")
                try expectClose(d.outcome.pJustRight, o.num("pJustRight"), "\(label) just right")
                try expectClose(d.outcome.pTooFirm, o.num("pTooFirm"), "\(label) too firm")
                try expectClose(d.outcome.pWhiteRunny, o.num("pWhiteRunny"), "\(label) runny")
                try expectClose(d.outcome.levelLow, o.num("levelLow"), "\(label) level low")
                try expectClose(d.outcome.levelMedian, o.num("levelMedian"), "\(label) level median")
                try expectClose(d.outcome.levelHigh, o.num("levelHigh"), "\(label) level high")
                #expect(try d.outcome.lean.rawValue == o.str("lean"), "\(label) lean")
                let cr = try row.object("certainty")
                let w = try cr.object("words")
                #expect(try d.certainty.words.asked == Int(w.num("asked")), "\(label) asked")
                #expect(try d.certainty.words.certainty.rawValue == w.str("certainty"), "\(label) certainty")
                try expectClose(d.certainty.words.pAsked, w.num("pAsked"), "\(label) P(asked)")
                try expectClose(d.certainty.words.pNear, w.num("pNear"), "\(label) P(near)")
                #expect(try d.certainty.words.from == Int(w.num("from")), "\(label) from")
                #expect(try d.certainty.words.to == Int(w.num("to")), "\(label) to")
                #expect(try d.certainty.words.mostLikely == Int(w.num("mostLikely")), "\(label) most likely")
                let tr = try cr.object("time")
                try expectClose(d.certainty.time.lowS, tr.num("low_s"), "\(label) time low")
                try expectClose(d.certainty.time.highS, tr.num("high_s"), "\(label) time high")
                #expect(try d.nudgeS == row.num("nudge_s"), "\(label) nudge taken")
                #expect(try d.adviceWanted == row.flag("adviceWanted"), "\(label) advice wanted")
            }
        }
    }

    @Test("the warning, with and without a range that is not a wild guess")
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

    @Test("when advice is looked for, which is said, and when the link shows")
    func advice() throws {
        let file = try Fixtures.load("reach.json")
        let adviceProfile = try profileOf(file.object("adviceProfile"))
        for row in try file.rows("adviceWanted") {
            let c = try row.value(Certainty.self, "certainty")
            #expect(try adviceWanted(c) == row.flag("wanted"), "\(c)")
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
                let advice = try protocolAdvice(
                    setup, facts: facts, level: shown.num("level"), pAsked: shown.num("pAsked"),
                    priced: priced.map { (key: $0.key, profile: adviceProfile) }
                )
                let expected = try shown.object("advice")
                #expect(advice.keys == (expected["keys"] as? [String]), "shown \(shown)")
                #expect(try advice.surer == expected.flag("surer"), "surer \(shown)")
            }
        }
    }
}
