import Testing
import Foundation
@testable import EggTimerCore

/// A running cook against `fixtures/running.json`, generated from
/// `src/core/running.ts`: its egg and pot, the moves the cook makes, the
/// plan derived from it, and the record it makes.
///
/// The two apps must plan the same cook alike: the alarm, the cooling and
/// the record are all read off the plan. A cook is read as both apps store
/// it, its own Codable, and folded; every clock time is compared as seconds
/// from the cook's start, as a cook time is.

/// The plan as it ran, planned again, as the fixture writes it.
private struct PlannedAgain: Encodable {
    let asRan: CookAsRan?
}

@Suite("Running")
struct RunningConformance {
    @Test("the egg and the pot, for every branch of the choices")
    func setups() throws {
        let rows = try Fixtures.list("running.json", "setups")
        #expect(rows.count >= 20)
        for (i, row) in rows.enumerated() {
            let pot = try cookSetupOf(decoded(CookChoices.self, row["choices"]), timeToBoilS: row.num("timeToBoil_s"))
            expectJSON(pot.egg, row["egg"], "setup \(i): the egg")
            expectJSON(pot.setup, row["setup"], "setup \(i): the pot")
        }
    }

    /// Exactly: a cook's fields are stored values, and a move does no
    /// arithmetic on them.
    @Test("the boil tap, a correction and a corrected start, taken and refused")
    func moves() throws {
        let rows = try Fixtures.list("running.json", "moves")
        #expect(rows.count >= 15)
        for row in rows {
            let note = try row.str("note")
            let cook = try decoded(RunningCook.self, row["cook"])
            let move = try row.object("move")
            let after: RunningCook?
            if move["boil"] != nil {
                after = withBoil(cook, nowS: try move.num("boil"))
            } else if move["correct"] != nil {
                after = try corrected(cook, choices: decoded(CookChoices.self, move["correct"]), nowS: move.num("now"))
            } else if move["stillIn"] != nil {
                after = stillIn(cook, nowS: try move.num("stillIn"))
            } else if move["stands"] != nil {
                after = pullStands(cook)
            } else {
                let now = try move.num("now")
                try expectClose(latestStartS(cook, nowS: now), row.num("latest_s"), "\(note): latest start")
                try expectClose(earliestStartS(cook), row.num("earliest_s"), "\(note): earliest start")
                after = startCorrected(cook, startedAtS: try move.optionalNum("start") ?? .nan, nowS: now)
            }
            expectJSON(after, row["after"], note, tolerance: 0)
        }
    }

    /// Every plan, made as the app makes it: with no surface, which says the
    /// pot it wants, then on that surface, rebuilt from the fixture's extent.
    /// A surface for another pot is the other cook's, and must go unread.
    @Test("the plan across a cook's phases and every kind of correction, and the moves that need one")
    func plans() throws {
        let byName = try posteriorsByName(Fixtures.list("decide.json", "posteriors"))
        let rows = try Fixtures.list("running.json", "plans")
        #expect(rows.count >= 30)
        var hobsAsked = 0
        var memosHanded = 0
        for row in rows {
            let note = try row.str("note")
            let post = try #require(byName[row.str("posterior")], "\(note): no posterior")
            let c = try Calibration(posterior: post, eggsLogged: Int(row.num("eggsLogged")))
            let cook = try decoded(RunningCook.self, row["cook"])
            let start = cook.startedAtS
            let (hint, now) = try (row.num("leanHint_s"), row.num("now_s"))
            var surface: CookSurface?
            if let s = row["surface"] as? [String: Any] {
                var (of, ofNow) = (cook, now)
                if let other = s["of"] as? [String: Any] {
                    of = try decoded(RunningCook.self, other["cook"])
                    ofNow = try other.num("now_s")
                }
                let inputs = try #require(
                    replan(of, c, surface: nil, leanHintS: hint, nowS: ofNow).inputs, "\(note): no surface wanted"
                )
                let grid = try doseGrid(s["grid"], egg: inputs.egg, setup: inputs.setup)
                let profile = try (s["profile"] as? [String: Any]).map { try decoded(OddsProfile.self, $0) }
                surface = CookSurface(inputs: inputs, grid: grid, profile: profile)
            }
            let plan = replan(cook, c, surface: surface, leanHintS: hint, nowS: now)
            expectJSON(plan, row["plan"], note, clockFrom: start)
            #expect(try openEggId(cook, plan: plan, nowS: now) == row.optionalNum("open"), "\(note): the open egg")
            for out in try row.rows("outs", mayBeEmpty: true) {
                let t = try out.num("now_s")
                expectJSON(withOut(cook, plan: plan, nowS: t).events, out["events"], "\(note): out at \(t - start)", clockFrom: start)
            }
            for due in try row.rows("dues", mayBeEmpty: true) {
                let t = try due.num("now_s")
                expectJSON(eventsDue(cook, plan: plan, nowS: t), due["events"], "\(note): due at \(t - start)", clockFrom: start)
            }
            // Only the last cases ask; `hobsAsked` says some did.
            for hob in row["hobDue"] as? [[String: Any]] ?? [] {
                hobsAsked += 1
                let t = try hob.num("now_s")
                #expect(try slowHobDue(plan, nowS: t) == hob.flag("due"), "\(note): the slow hob's moment at \(t - start)")
            }
            // At the slow hob's moment itself (this core's, to the bit) it has
            // not come, and the plan made then on this plan's memo is the plan
            // already made: a clock stopped there plans nothing more. And this
            // core's memo handed back, as each app hands it, makes the plan
            // that working the rule from the start makes, to the bit. Neither
            // is the web's to say: the memo's key is each core's own.
            if let at = plan.slowHobAtS, let memo = plan.memo {
                memosHanded += 1
                #expect(!slowHobDue(plan, nowS: at), "\(note): due at its own moment")
                let then = replan(cook, c, surface: surface, leanHintS: hint, nowS: at, memo: memo)
                #expect(then.slowHobAtS == at, "\(note): planned again at its moment, it moved")
                for later in [now + 15, at + 1] {
                    let fromMemo = try jsonOf(replan(cook, c, surface: surface, leanHintS: hint, nowS: later, memo: memo))
                    let fromStart = try jsonOf(replan(cook, c, surface: surface, leanHintS: hint, nowS: later))
                    let moved = jsonDifferences(fromMemo, fromStart, tolerance: 0)
                    #expect(moved.isEmpty, "\(note): planned on its memo at \(later - start), \(moved.prefix(3))")
                }
            }
            // The record, the boil remembered, and how the cook ends.
            let answers = try decoded(CookAnswers.self, row["answers"])
            let made = try cookFactsFor(
                cook, plan: plan, context: decoded(RecordContext.self, row["context"]), yolkWord: answers.yolkWord,
                white: answers.white, probe: answers.probe
            )
            expectJSON(made.facts.map(recordFor), row["record"], "\(note): the record")
            expectJSON(made.refused, row["refused"], "\(note): why refused")
            // The cook as it ran: current, kept, shown, and planned again on
            // the plan's calibration and surface.
            let ran = try row.object("asRan")
            #expect(try asRanCurrent(cook) == ran.flag("current"), "\(note): as it ran, current")
            expectJSON(keepAsRan(cook, plan: plan).asRan, ran["kept"], "\(note): as it ran, kept")
            let shown = asRanShown(cook, plan: plan)
            expectJSON(shown, ran["shown"], "\(note): as it ran, shown")
            expectJSON(shown.map { solutionAsRan(plan, ran: $0) }, ran["solution"], "\(note): as it ran, solved")
            let again = asRanCorrected(cook, before: c, surface: surface, nowS: now).map { PlannedAgain(asRan: $0.asRan) }
            expectJSON(again, ran["corrected"], "\(note): as it ran, planned again")
            expectJSON(boilToRemember(cook), row["boil"], "\(note): the boil remembered")
            expectJSON(cookEnding(cook, plan: plan, nowS: now), row["ending"], "\(note): the ending")
        }
        #expect(hobsAsked >= 7, "the slow hob's moment asked of too few plans")
        #expect(memosHanded >= 5, "too few plans with a memo to hand back")
    }

    @Test("what the boil memory learns from a cook, and what it does not")
    func remembers() throws {
        let rows = try Fixtures.list("running.json", "remembers")
        #expect(rows.count >= 8)
        for row in rows {
            try expectJSON(boilToRemember(decoded(RunningCook.self, row["cook"])), row["boil"], row.str("note"))
        }
    }
}

/// The key of a decision surface's inputs is this core's own, as the web's is
/// the web's: each app's caches and the plan key surfaces by it, and no
/// fixture holds its bits (DECISIONS.md 109). What it must do, it does here.
@Suite("The surface key")
struct InputsKeyTests {
    @Test("equal exactly when the inputs are, numbers to the bit")
    func key() throws {
        let row = try Fixtures.list("running.json", "setups")[0]
        let pot = try cookSetupOf(decoded(CookChoices.self, row["choices"]), timeToBoilS: row.num("timeToBoil_s"))
        let a = DecisionInputs(egg: pot.egg, setup: pot.setup, params: .default, whiteDoseMin: whiteDoseTarget)
        let again = try JSONDecoder().decode(DecisionInputs.self, from: JSONEncoder().encode(a))
        #expect(inputsKey(again) == inputsKey(a), "the same inputs, through JSON")
        var nudged = pot.setup
        nudged.eggStartC += 1e-12
        #expect(inputsKey(DecisionInputs(egg: pot.egg, setup: nudged, params: .default, whiteDoseMin: whiteDoseTarget)) != inputsKey(a))
        #expect(numberKey(0) == numberKey(-0.0))
        #expect(numberKey(480) == "407e000000000000")
        #expect(numberKey(0.1) == "3fb999999999999a")
    }
}

@Suite("The phase rule matches the reference implementation")
struct PhaseConformance {
    /// The counter-rest timeline matters most: with no cooling deadline, an
    /// app that fell from COOKING straight to DONE would never show "Out of
    /// the water — now" or run the 20 s grace, while the pull notification
    /// still fired at a screen that already said Done. Sampled either side of
    /// every boundary: the phase with the boil known, while it is a guess,
    /// and while a question is open.
    @Test("every boundary, with and without a cooling step")
    func timelines() throws {
        for timeline in try Fixtures.list("running.json", "phase.timelines") {
            let name = try timeline.str("name")
            let (cookEndS, coolEndS, outAtS) = try (
                timeline.num("cookEnd_s"), timeline.optionalNum("coolEnd_s"), timeline.optionalNum("outAt_s")
            )
            func phase(provisional: Bool, asking: Bool = false, _ nowS: Double) -> String {
                phaseAt(
                    Deadlines(cookEndS: cookEndS, coolEndS: coolEndS, provisional: provisional, outAtS: outAtS, asking: asking),
                    nowS: nowS
                ).rawValue
            }
            for sample in try timeline.rows("samples") {
                let nowS = try sample.num("now_s")
                let got: [String: Any] = [
                    "now_s": nowS, "phase": phase(provisional: false, nowS), "provisional": phase(provisional: true, nowS),
                    "asking": phase(provisional: false, asking: true, nowS),
                ]
                expectJSON(got, sample, "\(name) at \(nowS) s")
            }
        }
    }
}
