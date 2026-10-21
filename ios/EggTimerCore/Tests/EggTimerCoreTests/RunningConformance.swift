import Testing
import Foundation
@testable import EggTimerCore

/// A running cook against `fixtures/running.json`, generated from
/// `src/core/running.ts`: its egg and pot, the moves the cook makes, the
/// plan derived from it, and the record it makes.
///
/// The two apps must plan the same cook alike: the alarm, the cooling and
/// the record are all read off the plan. A cook is made as the fixture says,
/// by core's own moves from its start, never read from a stored one: how
/// each app stores a cook is its own. Every clock time is compared as seconds
/// from the cook's start, as a cook time is.

/// The choices the fixture's cooks start from, with a cook's change laid on.
private func cookChoices(_ over: Any?) throws -> CookChoices {
    let base = try Fixtures.object("running.json", "start.choices")
    return try decoded(CookChoices.self, base.merging(over as? [String: Any] ?? [:]) { _, change in change })
}

/// decide.json's posteriors as calibrations, by name.
private func calibrations() throws -> [String: Calibration] {
    var out = [String: Calibration]()
    for p in try Fixtures.list("decide.json", "posteriors") {
        let name = try p.str("name")
        guard let post = try posteriorsByName([p])[name] else { throw FixtureError("no posterior \(name)") }
        out[name] = try Calibration(posterior: post, eggsLogged: Int(p.num("eggsLogged")))
    }
    return out
}

/// The fixture's cooks, each made as it says: started, then each move, by
/// core's own calls.
private func fixtureCooks(_ calibrations: [String: Calibration]) throws -> [RunningCook] {
    let start = try Fixtures.object("running.json", "start")
    let units = try start.value(Units.self, "units")
    let lang = try start.str("lang")
    return try Fixtures.list("running.json", "cooks").map { r in
        var cook = try startCook(
            nowS: r.optionalNum("at_s") ?? start.num("at_s"), choices: cookChoices(r["over"]),
            nudgeS: r.optionalNum("nudge_s") ?? 0, boilMemory: decoded(BoilMemory.self, r["memory"] ?? start["memory"]),
            units: units, lang: lang
        )
        for m in try r.rows("moves", mayBeEmpty: true) {
            if m["boil"] != nil {
                cook = withBoil(cook, nowS: try m.num("boil"))
            } else if m["correct"] != nil {
                cook = try corrected(cook, choices: cookChoices(m["correct"]), nowS: m.num("now"))
            } else if m["start"] != nil {
                guard let moved = try startCorrected(cook, startedAtS: m.num("start"), nowS: m.num("now")) else {
                    throw FixtureError("a start the cook's recipe corrects is refused")
                }
                cook = moved
            } else if m["stillIn"] != nil {
                cook = stillIn(cook, nowS: try m.num("stillIn"))
            } else if m["stands"] != nil {
                cook = pullStands(cook)
            } else if m["events"] != nil {
                cook = writeEvents(cook, try decoded(CookEvents.self, m["events"]))
            } else {
                let k = try m.object("keep")
                guard let c = calibrations[try k.str("posterior")] else { throw FixtureError("keep: no posterior") }
                let now = try k.num("now_s")
                guard let inputs = replan(cook, c, surface: nil, leanHintS: 0, nowS: now).inputs else {
                    throw FixtureError("keep: no surface wanted")
                }
                let grid = try doseGrid(k["grid"], egg: inputs.egg, setup: inputs.setup)
                let surface = CookSurface(inputs: inputs, grid: grid, profile: nil)
                cook = keepAsRan(cook, plan: replan(cook, c, surface: surface, leanHintS: 0, nowS: now))
            }
        }
        return cook
    }
}

/// A cook as a move leaves it, as the fixture writes it: the entries the
/// move added to its log, and the log folded. The choices are whole here;
/// the fixture writes them as a change to its start's.
private struct Folded: Encodable {
    let added: Int
    let startedAtS: Double
    let choices: CookChoices
    let events: CookEvents
    let correctedAtS: Double?

    enum CodingKeys: String, CodingKey {
        case added, startedAtS = "startedAt_s", choices, events, correctedAtS = "correctedAt_s"
    }

    init(_ after: RunningCook, from cook: RunningCook) {
        added = after.log.count - cook.log.count
        startedAtS = after.startedAtS
        choices = after.choices
        events = after.events
        correctedAtS = after.correctedAtS
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(added, forKey: .added)
        try c.encode(startedAtS, forKey: .startedAtS)
        try c.encode(choices, forKey: .choices)
        try c.encode(events, forKey: .events)
        try c.encode(correctedAtS, forKey: .correctedAtS)
    }
}

/// A plan as running.json writes it: its row, and where the slow hob's rule
/// got to.
private struct RunningPlanRow: Encodable {
    let row: PlanRow
    let memo: SlowHobMemo?

    enum CodingKeys: String, CodingKey { case memo }

    func encode(to encoder: Encoder) throws {
        try row.encode(to: encoder)
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(memo, forKey: .memo)
    }
}

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

    /// Exactly: which water a cooling's temperature is, and the field it is
    /// kept in, are core's, and do no arithmetic.
    @Test("the cooling's water: the temperature given, set and cleared, for each cooling")
    func coolingWaters() throws {
        func row(_ w: CookChoices) -> [String: Any] {
            ["cooling": w.cooling.rawValue, "tapWater_C": w.tapWaterC ?? NSNull(), "bowlWater_C": w.bowlWaterC ?? NSNull()]
        }
        let rows = try Fixtures.list("running.json", "coolingWaters")
        #expect(rows.count == Cooling.allCases.count * 4)
        for r in rows {
            let ch = try cookChoices(r["waters"])
            let what = "\(ch.cooling), tap \(String(describing: ch.tapWaterC)), bowl \(String(describing: ch.bowlWaterC))"
            #expect(givenCoolingWaterC(ch) == (try r.optionalNum("given")), "\(what): given")
            expectJSON(row(withCoolingWater(ch, try r.num("to_C"))), r["set"], "\(what): set")
            expectJSON(row(withCoolingWater(ch, nil)), r["cleared"], "\(what): cleared")
        }
    }

    /// Exactly: a cook's fields are the values given, and a move does no
    /// arithmetic on them.
    @Test("the boil tap, a correction and a corrected start, taken and refused")
    func moves() throws {
        let cooks = try fixtureCooks(calibrations())
        let base = try Fixtures.object("running.json", "start.choices")
        let rows = try Fixtures.list("running.json", "moves")
        #expect(rows.count >= 15)
        for row in rows {
            let note = try row.str("note")
            let cook = cooks[Int(try row.num("cook"))]
            let move = try row.object("move")
            let after: RunningCook?
            if move["boil"] != nil {
                after = withBoil(cook, nowS: try move.num("boil"))
            } else if move["correct"] != nil {
                after = try corrected(cook, choices: cookChoices(move["correct"]), nowS: move.num("now"))
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
            var expected = row["after"] as? [String: Any]
            if let change = expected?["choices"] as? [String: Any] {
                expected?["choices"] = base.merging(change) { _, c in c }
            }
            expectJSON(after.map { Folded($0, from: cook) }, expected ?? NSNull(), note, tolerance: 0)
        }
    }

    /// Every plan, made as the app makes it: with no surface, which says the
    /// pot it wants, then on that surface, rebuilt from the fixture's extent.
    /// A surface for another pot is the other cook's, and must go unread.
    @Test("the plan across a cook's phases and every kind of correction, and the moves that need one")
    func plans() throws {
        let byName = try posteriorsByName(Fixtures.list("decide.json", "posteriors"))
        let cooks = try fixtureCooks(calibrations())
        let rows = try Fixtures.list("running.json", "plans")
        #expect(rows.count >= 30)
        var hobsAsked = 0
        var memosHanded = 0
        for row in rows {
            let note = try row.str("note")
            let post = try #require(byName[row.str("posterior")], "\(note): no posterior")
            let c = try Calibration(posterior: post, eggsLogged: Int(row.num("eggsLogged")))
            let cook = cooks[Int(try row.num("cook"))]
            let start = cook.startedAtS
            let (hint, now) = try (row.num("leanHint_s"), row.num("now_s"))
            var surface: CookSurface?
            if let s = row["surface"] as? [String: Any] {
                var (of, ofNow) = (cook, now)
                if let other = s["of"] as? [String: Any] {
                    of = cooks[Int(try other.num("cook"))]
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
            expectJSON(RunningPlanRow(row: PlanRow(plan, nowS: now), memo: plan.memo), row["plan"], note, clockFrom: start)
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
            expectJSON(made.facts.map(recordFor), row["record"], "\(note): the record", strict: true)
            expectJSON(made.refused, row["refused"], "\(note): why refused")
            // The cook as it ran: current, kept, shown, and planned again on
            // the plan's calibration and surface.
            let ran = try row.object("asRan")
            #expect(try asRanCurrent(cook) == ran.flag("current"), "\(note): as it ran, current")
            expectJSON(keepAsRan(cook, plan: plan).asRan, ran["kept"], "\(note): as it ran, kept", strict: true)
            // What Done shows and what is planned again, written "kept" where
            // they are what is kept.
            let kept = { (v: Any?) -> Any? in (v as? String) == "kept" ? ran["kept"] : v }
            let shown = asRanShown(cook, plan: plan)
            expectJSON(shown, kept(ran["shown"]), "\(note): as it ran, shown")
            expectJSON(shown.map { solutionAsRan(plan, ran: $0) }, ran["solution"], "\(note): as it ran, solved")
            let again = asRanCorrected(cook, before: c, surface: surface, nowS: now).map { PlannedAgain(asRan: $0.asRan) }
            let correctedRow = (ran["corrected"] as? [String: Any]).map { r in ["asRan": kept(r["asRan"]) as Any] }
            expectJSON(again, correctedRow ?? NSNull(), "\(note): as it ran, planned again")
            expectJSON(boilToRemember(cook), row["boil"], "\(note): the boil remembered")
            expectJSON(cookEnding(cook, plan: plan, nowS: now), row["ending"], "\(note): the ending")
        }
        #expect(hobsAsked >= 7, "the slow hob's moment asked of too few plans")
        #expect(memosHanded >= 5, "too few plans with a memo to hand back")
    }

    @Test("what the boil memory learns from a cook, and what it does not")
    func remembers() throws {
        let cooks = try fixtureCooks(calibrations())
        let rows = try Fixtures.list("running.json", "remembers")
        #expect(rows.count >= 8)
        for row in rows {
            try expectJSON(boilToRemember(cooks[Int(row.num("cook"))]), row["boil"], row.str("note"))
        }
    }
}

/// The key of a decision surface's inputs is this core's own, as the web's is
/// the web's: each app's caches and the plan key surfaces by it, and no
/// fixture holds its bits. What it must do, it does here.
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
        // A cold pan's water is in a cold start's key.
        func key(_ start: StartMode, _ pan: Double?) -> String {
            var s = pot.setup
            s.startMode = start
            s.panStartC = pan
            return inputsKey(DecisionInputs(egg: pot.egg, setup: s, params: .default, whiteDoseMin: whiteDoseTarget))
        }
        #expect(key(.cold, 15) != key(.cold, 8), "two cold pans, two keys")
        #expect(key(.cold, 15) != key(.cold, nil), "given is not the room")
    }

    /// Every field of the inputs, found by walking their JSON rather than
    /// named: each number moved by the least it can be, each string to every
    /// other raw value the inputs' enums have, and each field taken away. The
    /// key moves exactly when the inputs do, so a field added to them is in
    /// it.
    @Test("moves with every field of the inputs")
    func everyField() throws {
        let row = try Fixtures.list("running.json", "setups")[0]
        let pot = try cookSetupOf(decoded(CookChoices.self, row["choices"]), timeToBoilS: row.num("timeToBoil_s"))
        var setup = pot.setup
        setup.startMode = .cold
        setup.panStartC = 15
        setup.cooling = .bowl
        setup.coolingWaterC = 12
        setup.bowlLitres = 2
        setup.afterBoil = .off
        let a = DecisionInputs(egg: pot.egg, setup: setup, params: .default, whiteDoseMin: whiteDoseTarget)
        let json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(a)) as? [String: Any])
        let raws = StartMode.allCases.map(\.rawValue) + Cooling.allCases.map(\.rawValue)
            + HeatAfterBoil.allCases.map(\.rawValue)

        func leaves(_ o: [String: Any], _ at: [String]) -> [[String]] {
            o.flatMap { k, v in (v as? [String: Any]).map { leaves($0, at + [k]) } ?? [at + [k]] }
        }
        func changed(_ o: [String: Any], _ path: [String], _ to: Any?) -> [String: Any] {
            var out = o
            if path.count == 1 {
                out[path[0]] = to
            } else if let inner = o[path[0]] as? [String: Any] {
                out[path[0]] = changed(inner, Array(path.dropFirst()), to)
            }
            return out
        }
        func inputs(_ o: [String: Any]) -> DecisionInputs? {
            guard let data = try? JSONSerialization.data(withJSONObject: o) else { return nil }
            return try? JSONDecoder().decode(DecisionInputs.self, from: data)
        }

        let paths = leaves(json, [])
        #expect(paths.count >= 18, "\(paths.count) fields")
        for path in paths {
            let what = path.joined(separator: ".")
            var value: Any? = json
            for k in path { value = (value as? [String: Any])?[k] }
            var tries: [Any?] = [nil]
            if let s = value as? String {
                tries += raws.filter { $0 != s }
            } else if let x = value as? Double {
                tries.append(x.nextUp)
            }
            var moved = false
            for to in tries {
                guard let b = inputs(changed(json, path, to)) else { continue }
                #expect((b == a) == (inputsKey(b) == inputsKey(a)), "\(what) to \(String(describing: to))")
                moved = moved || b != a
            }
            #expect(moved, "\(what): some change to it is another input")
        }
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
