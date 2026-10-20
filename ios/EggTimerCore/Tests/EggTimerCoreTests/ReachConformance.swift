import Testing
import Foundation
@testable import EggTimerCore

/// The odds and the certainty at every level, the range they allow, the
/// verdict with it, the shading and the advice, against `fixtures/reach.json`.
///
/// A profile is a solve and a decision per level, and both apps must walk the
/// same levels in the same order and land on the same ends of the range, or
/// the two sliders offer different eggs. The posteriors are decide.json's.

/// A pot of the fixture's: its calibration, egg and setup, and its surface
/// built to the fixture's spec.
private struct Pot {
    let c: Calibration
    let egg: Egg
    let setup: CookSetup
    let grid: DoseGrid
    let profile: OddsProfile

    init(_ row: [String: Any], _ post: Posterior) throws {
        c = try Calibration(posterior: post, eggsLogged: Int(row.num("eggsLogged")))
        egg = try decoded(Egg.self, row["egg"])
        setup = try decoded(CookSetup.self, row["setup"])
        grid = try doseGrid(row["grid"], egg: egg, setup: setup)
        profile = try decoded(OddsProfile.self, row["profile"])
    }
}

/// An answer as the fixture writes it: the level, the verdict, whether the
/// odds are low, and the time solved for, without the rest of the solve.
private func answerRow<T: Encodable>(_ a: T) throws -> [String: Any] {
    var row = try #require(try jsonOf(a) as? [String: Any])
    let solution = row["solution"] as? [String: Any]
    row["cook_s"] = (solution?["result"] as? [String: Any])?["cookTime_s"] ?? NSNull()
    row["solution"] = nil
    return row
}

/// A decided answer as the fixture writes it: what the apps show, without
/// the solve moved to the time decided.
private func decidedRow<T: Encodable>(_ d: T) throws -> [String: Any] {
    var row = try #require(try jsonOf(d) as? [String: Any])
    row["solution"] = nil
    return row
}

@Suite("Reach")
struct ReachConformance {
    @Test("no shading when the best chance is under a twentieth")
    func shadingThreshold() throws {
        for row in try Fixtures.list("reach.json", "shading") {
            let profile = try decoded(OddsProfile.self, row["profile"])
            expectJSON(shadingOf(profile), row["shading"], "best \(profile.bestAsked)")
        }
    }

    /// Every profile in the fixture. The package builds `-O` even for tests,
    /// so a profile's couple of dozen solves are quick.
    @Test("the odds and the certainty at every level, the range, and the shading")
    func profiles() throws {
        let byName = try posteriorsByName(Fixtures.list("decide.json", "posteriors"))
        for (i, row) in try Fixtures.list("reach.json", "profiles").enumerated() {
            let pot = try Pot(row, #require(byName[row.str("posterior")], "profile \(i): no posterior"))
            let label = "profile \(i) (\(try row.str("posterior")), \(pot.setup.cooling))"
            let p = oddsProfile(pot.c, egg: pot.egg, setup: pot.setup, grid: pot.grid)
            expectJSON(p, row["profile"], label)
            expectJSON(shadingOf(p), row["shading"], "\(label): the shading")
            for near in try row.rows("near") {
                let level = try near.num("level")
                try expectClose(askedNear(p, level: level), near.num("pAsked"), "\(label) near \(level)")
            }
            // The envelope: the bounds at a level, and the time the app gives
            // there, decided within them.
            for env in try row.rows("envelope") {
                let level = try env.num("level")
                expectJSON(envelopeBounds(p, level: level), env["bounds"], "\(label): the bounds at \(level)")
                let a = answerAt(pot.c, egg: pot.egg, setup: pot.setup, level: level, profile: p)
                let d = decide(
                    pot.c, grid: pot.grid, solution: a.solution, logNominalTarget: logYolkTarget(a.level),
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
            let pot = try Pot(profiles[index], #require(byName[profiles[index].str("posterior")], "no posterior"))
            let (level, withOdds) = try (row.num("level"), row.flag("withOdds"))
            let a = answerAt(pot.c, egg: pot.egg, setup: pot.setup, level: level, profile: withOdds ? pot.profile : nil)
            expectJSON(try answerRow(a), row["answer"], "profile \(index) at \(level), odds \(withOdds)")
        }
    }

    /// The answer with its time decided (`decideAnswer`), as both apps show
    /// it: for each profile's pot, the owner's egg and a pot whose white never
    /// sets. The profile is the fixture's, so this holds the decision alone;
    /// `profiles()` holds the profile.
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
        for entry in pots {
            let pot = try Pot(entry.row, #require(byName[entry.posterior], "\(entry.label): no posterior"))
            for row in try entry.row.rows("decided") {
                let (asked, withOdds, drawn) = try (row.num("asked"), row.flag("withOdds"), row.num("drawn_s"))
                let label = "\(entry.label) at \(asked), odds \(withOdds), nudge \(drawn)"
                let odds = withOdds ? pot.profile : nil
                let a = answerAt(pot.c, egg: pot.egg, setup: pot.setup, level: asked, profile: odds)
                expectJSON(try answerRow(a), row["answer"], "\(label): the answer")
                let own = decide(pot.c, grid: pot.grid, solution: a.solution, logNominalTarget: logYolkTarget(a.level))
                try expectClose(own.cookTimeS, row.num("own_s"), "\(label) own choice")
                let d = decideAnswer(
                    pot.c, egg: pot.egg, setup: pot.setup, grid: pot.grid, solution: a.solution, level: a.level,
                    profile: odds, nudgeS: drawn
                )
                expectJSON(try decidedRow(d), row["decided"], label)
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
            #expect(try lowOddsAt(profile, level: level) == row.flag("lowOdds"), "\(level), \(String(describing: row["range"]))")
        }
    }

    @Test("when advice is looked for, which is said, and when the link shows")
    func advice() throws {
        let file = try Fixtures.load("reach.json")
        let adviceProfile = try decoded(OddsProfile.self, file["adviceProfile"])
        for row in try file.rows("adviceWanted") {
            let c = try row.value(Certainty.self, "certainty")
            #expect(try adviceWanted(c) == row.flag("wanted"), "\(c)")
        }
        for row in try file.rows("advice") {
            let setup = try decoded(CookSetup.self, row["setup"])
            let facts = try decoded(AdviceFacts.self, row)
            expectJSON(unpricedAdvice(setup, facts: facts), row["unpriced"], "unpriced \(setup)")
            let priced = pricedChanges(setup)
            expectJSON(priced, row["priced"], "priced \(setup)")
            for shown in try row.rows("shown") {
                let advice = try protocolAdvice(
                    setup, facts: facts, level: shown.num("level"), pAsked: shown.num("pAsked"),
                    priced: priced.map { (key: $0.key, profile: adviceProfile) }
                )
                expectJSON(advice, shown["advice"], "shown \(shown)")
            }
        }
    }
}
