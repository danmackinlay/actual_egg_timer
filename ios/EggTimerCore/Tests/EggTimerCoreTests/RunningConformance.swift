import Testing
import Foundation
@testable import EggTimerCore

/// A running cook against `fixtures/running.json`, generated from
/// `src/core/running.ts`: its egg and pot, the moves the cook makes, a
/// stored cook read back, the plan derived from it, and the record it makes.
///
/// The two apps must plan the same cook alike: the alarm, the cooling and
/// the record are all read off the plan.

/// Two JSON values, as JSONSerialization gives them, equal: numbers exactly,
/// since a cook's fields are stored values and no arithmetic, or to within
/// `ulps` of the larger, or `relative` of the larger (absolute below 1); a
/// missing key and JSON's null alike.
func sameJSON(_ a: Any?, _ b: Any?, ulps: Double = 0, relative: Double = 0) -> Bool {
    let aNull = a == nil || a is NSNull
    let bNull = b == nil || b is NSNull
    if aNull || bNull { return aNull && bNull }
    if let x = a as? [String: Any], let y = b as? [String: Any] {
        for key in Set(x.keys).union(y.keys) where !sameJSON(x[key], y[key], ulps: ulps, relative: relative) {
            return false
        }
        return true
    }
    if let x = a as? [Any], let y = b as? [Any] {
        return x.count == y.count && zip(x, y).allSatisfy { sameJSON($0, $1, ulps: ulps, relative: relative) }
    }
    if let x = a as? String, let y = b as? String { return x == y }
    if let x = a as? NSNumber, let y = b as? NSNumber {
        let xb = CFGetTypeID(x) == CFBooleanGetTypeID()
        let yb = CFGetTypeID(y) == CFBooleanGetTypeID()
        if xb || yb { return xb && yb && x.boolValue == y.boolValue }
        let (u, v) = (x.doubleValue, y.doubleValue)
        let scale = max(abs(u), abs(v))
        return u == v || abs(u - v) <= ulps * scale.ulp || abs(u - v) <= relative * max(scale, 1)
    }
    return false
}

/// The choices as the fixture writes them, field by field: not through
/// `readRunningCook`, which is under test.
func choicesOf(_ json: [String: Any]) throws -> CookChoices {
    try CookChoices(
        massKg: json.num("mass_kg"), massFrom: json.value(MassFrom.self, "massFrom"),
        sizeTable: json.optionalValue(SizeTable.self, "sizeTable"), eggFrom: json.value(EggFrom.self, "eggFrom"),
        customStartC: json.num("customStart_C"), roomC: json.optionalNum("room_C"),
        startMode: json.value(StartMode.self, "startMode"), afterBoil: json.value(HeatAfterBoil.self, "afterBoil"),
        cooling: json.value(Cooling.self, "cooling"), waterLitres: json.num("waterLitres"),
        eggCount: json.num("eggCount"), altitudeM: json.num("altitude_m"), level: json.num("level")
    )
}

/// A cook as it is stored: what was fixed at the press, the start and the
/// log, as the fixtures write every cook.
func storedJSON(_ cook: RunningCook?) -> [String: Any]? {
    cook?.jsonObject
}

/// A cook the fixture writes, read as the app will read it.
func runningCookOf(_ json: Any?, _ what: String) throws -> RunningCook {
    try #require(readRunningCook(json), "\(what): the cook does not read")
}

@Suite("Running")
struct RunningConformance {
    @Test("the egg and the pot, for every branch of the choices")
    func setups() throws {
        let rows = try Fixtures.list("running.json", "setups")
        #expect(rows.count >= 20)
        for (i, row) in rows.enumerated() {
            let pot = try cookSetupOf(choicesOf(row.object("choices")), timeToBoilS: row.num("timeToBoil_s"))
            let egg = try row.object("egg")
            let label = "setup \(i)"
            try expectClose(pot.egg.radiusM, egg.num("radius_m"), "\(label) radius")
            try expectClose(pot.egg.minorDiameterM, egg.num("minorDiameter_m"), "\(label) minor diameter")
            try expectClose(pot.egg.massKg, egg.num("mass_kg"), "\(label) mass")
            try expectClose(pot.egg.volumeM3, egg.num("volume_m3"), "\(label) volume")
            let expected = try cookSetup(row.object("setup"))
            #expect(pot.setup.startMode == expected.startMode, "\(label) start")
            #expect(pot.setup.afterBoil == expected.afterBoil, "\(label) burner")
            #expect(pot.setup.cooling == expected.cooling, "\(label) cooling")
            expectClose(pot.setup.eggStartC, expected.eggStartC, "\(label) egg start")
            expectClose(pot.setup.ambientC, expected.ambientC, "\(label) room")
            expectClose(pot.setup.boilingC, expected.boilingC, "\(label) boiling point")
            #expect(pot.setup.timeToBoilS == expected.timeToBoilS, "\(label) time to boil")
            #expect(pot.setup.waterLitres == expected.waterLitres, "\(label) water")
            #expect(pot.setup.eggCount == expected.eggCount, "\(label) eggs")
            // The key of the inputs, from the fixture's own numbers, read from
            // their text to the bit: the same key as the web's, character for
            // character.
            let n = try #require(row["keyNumbers"] as? [String], "\(label): no key numbers").compactMap(Double.init)
            #expect(n.count == 12, "\(label): key numbers")
            guard n.count == 12 else { continue }
            var setup = expected
            (setup.eggStartC, setup.ambientC, setup.boilingC, setup.timeToBoilS) = (n[4], n[5], n[6], n[7])
            (setup.waterLitres, setup.eggCount) = (n[8], n[9])
            let inputs = DecisionInputs(
                egg: Egg(radiusM: n[0], minorDiameterM: n[1], massKg: n[2], volumeM3: n[3]), setup: setup,
                params: ModelParams(alphaM2s: n[10]), whiteDoseMin: n[11]
            )
            #expect(try inputsKey(inputs) == row.str("inputsKey"), "\(label) inputs key \(inputsKey(inputs))")
        }
    }

    @Test("the boil tap, a correction and a corrected start, taken and refused")
    func moves() throws {
        let rows = try Fixtures.list("running.json", "moves")
        #expect(rows.count >= 15)
        for row in rows {
            let note = try row.str("note")
            let cook = try runningCookOf(row["cook"], note)
            let move = try row.object("move")
            let after: RunningCook?
            if move["boil"] != nil {
                after = withBoil(cook, nowS: try move.num("boil"))
            } else if let choices = move["correct"] as? [String: Any] {
                after = corrected(cook, choices: try choicesOf(choices), nowS: try move.num("now"))
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
            #expect(sameJSON(storedJSON(after), row["after"]), "\(note)")
        }
    }

    @Test("a stored cook is read whole or not at all, and what is written reads back")
    func reads() throws {
        let rows = try Fixtures.list("running.json", "reads")
        #expect(rows.count >= 40)
        for row in rows {
            let note = try row.str("note")
            let read = readRunningCook(row["raw"])
            #expect(sameJSON(storedJSON(read), row["cook"]), "\(note)")
            if let read {
                let data = try JSONSerialization.data(withJSONObject: read.jsonObject)
                // To the last bit but one: JSONSerialization writes 0.068 as
                // 0.068000000000000005 and reads that back an ulp off.
                let back = readRunningCook(try JSONSerialization.jsonObject(with: data))
                #expect(sameJSON(back?.jsonObject, read.jsonObject, ulps: 4), "\(note): round trip")
            }
        }
    }

    @Test("a stored cook through JSONEncoder and JSONDecoder comes back to the bit, in the web's shape")
    func storedToTheBit() throws {
        var cooks = try Fixtures.list("running.json", "reads").compactMap { readRunningCook($0["raw"]) }
        #expect(cooks.count >= 10)
        // And each again with doubles of 17 significant digits in its fields,
        // which is what JSONSerialization read back an ulp off.
        var draw = SplitMix(seed: 20261007)
        for base in cooks {
            // Every time moved by a fraction, and a correction of every
            // number, logged as a cook makes one.
            var cook = shiftedCook(base, by: draw.next())
            var choices = cook.choices
            choices.massKg = 0.04 + 0.04 * draw.next()
            choices.waterLitres = 0.2 + 3 * draw.next()
            choices.level = draw.next()
            choices.altitudeM = 2000 * draw.next()
            cook = corrected(cook, choices: choices, nowS: cook.startedAtS + 1 + draw.next())
            cook.nudgeS = 20 * draw.next() - 10
            cook.boilMemory = ["\(choices.waterLitres)": 300 + 600 * draw.next()]
            cooks.append(cook)
        }
        for (i, cook) in cooks.enumerated() {
            let stored = StoredCook(cook: cook, answers: i % 2 == 0 ? .unanswered : .beforeReload, leanHintS: draw.next())
            let data = try JSONEncoder().encode(stored)
            let back = try JSONDecoder().decode(StoredCook.self, from: data)
            #expect(back == stored)
            #expect(back.cook == cook)
            // The web's keys and nulls: what JSONSerialization makes of it is
            // the store's own JSON, to its last bit but one.
            #expect(sameJSON(try JSONSerialization.jsonObject(with: data), stored.jsonObject, ulps: 4))
        }
    }

    @Test("the constants")
    func constants() throws {
        let c = try Fixtures.object("running.json", "constants")
        #expect(try slowHobWhenLeftS == c.num("slowHobWhenLeft_s"))
        #expect(try slowHobExtraS == c.num("slowHobExtra_s"))
        #expect(try slowHobEveryS == c.num("slowHobEvery_s"))
        #expect(try slowHobMaxSteps == Int(c.num("slowHobMaxSteps")))
        #expect(try pullGraceSeconds == c.num("pullGrace_s"))
        #expect(try restoreWindowS == c.num("restoreWindow_s"))
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
        for row in rows {
            let note = try row.str("note")
            let post = try #require(byName[row.str("posterior")], "\(note): no posterior")
            let c = try Calibration(posterior: post, eggsLogged: Int(row.num("eggsLogged")))
            let cook = try runningCookOf(row["cook"], note)
            let hint = try row.num("leanHint_s")
            let now = try row.num("now_s")
            var surface: CookSurface?
            if let s = row["surface"] as? [String: Any] {
                var of = cook
                var ofNow = now
                if let other = s["of"] as? [String: Any] {
                    of = try runningCookOf(other["cook"], "\(note): the surface's cook")
                    ofNow = try other.num("now_s")
                }
                let inputs = try #require(
                    replan(of, c, surface: nil, leanHintS: hint, nowS: ofNow).inputs, "\(note): no surface wanted"
                )
                let grid = try doseGrid(s.object("grid"), egg: inputs.egg, setup: inputs.setup)
                let profile = try (s["profile"] as? [String: Any]).map { try profileOf($0) }
                surface = CookSurface(inputs: inputs, grid: grid, profile: profile)
            }
            let memo = try (row["hint"] as? [String: Any]).map { try slowHobMemoOf($0) }
            let plan = replan(cook, c, surface: surface, leanHintS: hint, nowS: now, memo: memo)
            try expectPlan(plan, row.object("plan"), start: cook.startedAtS, note)
            #expect(try openEggId(cook, plan: plan, nowS: now) == row.optionalNum("open"), "\(note): the open egg")
            let stillOpen = [
                cookStillOpen(cook, plan: plan, storedIdMs: cook.idMs, nowS: now),
                cookStillOpen(cook, plan: plan, storedIdMs: nil, nowS: now),
                cookStillOpen(cook, plan: plan, storedIdMs: cook.idMs + 60000, nowS: now),
            ]
            #expect(stillOpen == (row["stillOpen"] as? [Bool]), "\(note): still open")
            for out in try row.rows("outs", mayBeEmpty: true) {
                let t = try out.num("now_s")
                let after = withOut(cook, plan: plan, nowS: t)
                try expectEvents(after.events, out.object("events"), "\(note): out at \(t - cook.startedAtS)")
            }
            for due in try row.rows("dues", mayBeEmpty: true) {
                let t = try due.num("now_s")
                try expectEvents(
                    eventsDue(cook, plan: plan, nowS: t), due.object("events"), "\(note): due at \(t - cook.startedAtS)"
                )
            }
            // Only the last cases ask; `hobsAsked` says some did.
            for hob in row["hobDue"] as? [[String: Any]] ?? [] {
                hobsAsked += 1
                let t = try hob.num("now_s")
                #expect(
                    try slowHobDue(plan, nowS: t) == hob.flag("due"),
                    "\(note): the slow hob's moment at \(t - cook.startedAtS)"
                )
            }
            // At the slow hob's moment itself (this core's, to the bit) it has
            // not come, and the plan made then is the plan already made: a
            // clock stopped there plans nothing more.
            if let at = plan.slowHobAtS, plan.memo != nil {
                #expect(!slowHobDue(plan, nowS: at), "\(note): due at its own moment")
                let then = replan(cook, c, surface: surface, leanHintS: hint, nowS: at, memo: memo)
                #expect(then.slowHobAtS == at, "\(note): planned again at its moment, it moved")
            }
            // The record, the boil remembered, and how the cook ends.
            let ctx = try row.object("context")
            let answers = try row.object("answers")
            let probe = try (answers["probe"] as? [String: Any]).map {
                ProbeReading(centreC: try $0.num("centre_C"), afterS: try $0.optionalNum("after_s"))
            }
            let made = try cookFactsFor(
                cook, plan: plan,
                context: RecordContext(
                    app: ctx.value(AppName.self, "app"), appVersion: ctx.str("appVersion"), prior: ctx.str("prior"),
                    day: ctx.str("day"), id: ctx.optionalNum("id").map { Int($0) }
                ),
                yolkWord: answers.optionalValue(YolkWord.self, "yolkWord"),
                white: answers.optionalValue(WhiteReport.self, "white"), probe: probe
            )
            if row["record"] is [String: Any] {
                let facts = try #require(made.facts, "\(note): refused \(String(describing: made.refused))")
                #expect(made.refused == nil, "\(note): refused")
                let written = try JSONSerialization.jsonObject(with: JSONEncoder().encode(recordFor(facts)))
                #expect(sameJSON(written, row["record"], relative: conformanceTolerance), "\(note): the record")
            } else {
                #expect(made.facts == nil, "\(note): a record from a plan core refuses")
                #expect(try made.refused?.rawValue == row.str("refused"), "\(note): why refused")
            }
            // The cook as it ran: current, kept, shown, and planned again on
            // the plan's calibration and surface.
            let ran = try row.object("asRan")
            #expect(try asRanCurrent(cook) == ran.flag("current"), "\(note): as it ran, current")
            expectAsRan(keepAsRan(cook, plan: plan).asRan, ran["kept"], "\(note): as it ran, kept")
            expectAsRan(asRanShown(cook, plan: plan), ran["shown"], "\(note): as it ran, shown")
            if let sj = ran["solution"] as? [String: Any] {
                let shown = try #require(asRanShown(cook, plan: plan), "\(note): nothing shown as it ran")
                let sol = solutionAsRan(plan, ran: shown)
                try expectClose(sol.result.peakYolkC, sj.num("peakYolk_C"), "\(note): as it ran, peak yolk")
                try expectClose(sol.result.peakWhiteC, sj.num("peakWhite_C"), "\(note): as it ran, peak white")
                #expect(try sol.whiteSets == sj.flag("whiteSets"), "\(note): as it ran, white sets")
            } else {
                #expect(asRanShown(cook, plan: plan) == nil, "\(note): shown as it ran")
            }
            let again = asRanCorrected(cook, before: c, surface: surface, nowS: now)
            if let j = ran["corrected"] as? [String: Any] {
                let a = try #require(again, "\(note): planned again")
                expectAsRan(a.asRan, j["asRan"], "\(note): as it ran, planned again")
            } else {
                #expect(again == nil, "\(note): planned again without the surface")
            }
            try expectBoil(boilToRemember(cook), row["boil"], "\(note): the boil remembered")
            let ending = cookEnding(cook, plan: plan, nowS: now)
            let expectedEnding = try row.object("ending")
            try expectBoil(ending.boil, expectedEnding["boil"], "\(note): the boil at the end")
            #expect(try ending.finished == expectedEnding.flag("finished"), "\(note): finished")
            #expect(try ending.remake == expectedEnding.flag("remake"), "\(note): made again first")
        }
        #expect(hobsAsked >= 7, "the slow hob's moment asked of too few plans")
    }

    @Test("two copies of one cook: what each takes up from the other, and which a reload restores")
    func takeUps() throws {
        let rows = try Fixtures.list("running.json", "takeUps")
        #expect(rows.count >= 8)
        for row in rows {
            let note = try row.str("note")
            let ours = try runningCookOf(row["ours"], "\(note): ours")
            let theirs = try runningCookOf(row["theirs"], "\(note): theirs")
            #expect(sameJSON(storedJSON(takeUpEvents(ours, theirs)), row["oursAfter"]), "\(note): ours")
            #expect(sameJSON(storedJSON(takeUpEvents(theirs, ours)), row["theirsAfter"]), "\(note): theirs")
            let later = [correctedLater(ours, theirs), correctedLater(theirs, ours)]
            #expect(later == (row["later"] as? [Bool]), "\(note): corrected later")
        }
    }

    @Test("what the boil memory learns from a cook, and what it does not")
    func remembers() throws {
        let rows = try Fixtures.list("running.json", "remembers")
        #expect(rows.count >= 8)
        for row in rows {
            let note = try row.str("note")
            try expectBoil(boilToRemember(runningCookOf(row["cook"], note)), row["boil"], note)
        }
    }
}

private func expectBoil(_ b: BoilToRemember?, _ json: Any?, _ what: String) throws {
    if let j = json as? [String: Any] {
        let boil = try #require(b, "\(what): nothing remembered")
        try expectClose(boil.litres, j.num("litres"), "\(what): litres")
        try expectClose(boil.seconds, j.num("seconds"), "\(what): seconds")
    } else {
        #expect(b == nil, "\(what): remembered")
    }
}

/// The plan as it ran against the fixture's, nil and JSON's null alike.
private func expectAsRan(_ a: CookAsRan?, _ json: Any?, _ what: String) {
    #expect(sameJSON(a?.jsonObject, json, relative: conformanceTolerance), "\(what)")
}

/// The slow hob's memo as the fixtures write one: its place, and the key of
/// what the web's core read, which this core may make otherwise in the last
/// bits; a memo that does not fit is ignored, and the plan is the same.
private func slowHobMemoOf(_ json: [String: Any]) throws -> SlowHobMemo {
    try SlowHobMemo(
        key: json.str("key"), steps: Int(json.num("steps")), lastS: json.num("last_s"), rampS: json.num("ramp_s"),
        carriedS: json.optionalNum("carried_s")
    )
}

private func expectMemo(_ h: SlowHobMemo?, _ json: Any?, _ note: String) throws {
    guard let j = json as? [String: Any] else {
        #expect(h == nil, "\(note): no slow hob's memo")
        return
    }
    let hint = try #require(h, "\(note): a slow hob's memo")
    let want = try slowHobMemoOf(j)
    #expect(hint.steps == want.steps, "\(note): memo steps")
    expectClose(hint.lastS, want.lastS, "\(note): memo's last")
    expectClose(hint.rampS, want.rampS, "\(note): memo's ramp")
    switch (hint.carriedS, want.carriedS) {
    case (nil, nil): break
    case let (a?, b?): expectClose(a, b, "\(note): hint's carried time")
    default: Issue.record("\(note): hint's carried time")
    }
}

/// A clock time, as seconds from the cook's start: an epoch time's relative
/// error is a cook time's absolute one over 1.8e9.
private func expectTime(_ actual: Double?, _ expected: Double?, start: Double, _ what: String) {
    switch (actual, expected) {
    case (nil, nil): break
    case let (a?, e?): expectClose(a - start, e - start, what)
    default: Issue.record("\(what): expected \(String(describing: expected)), got \(String(describing: actual))")
    }
}

private func expectEvents(_ e: CookEvents, _ json: [String: Any], _ what: String) throws {
    let start = try json.optionalNum("boilAt_s") ?? e.boilAtS ?? 0
    expectTime(e.boilAtS, try json.optionalNum("boilAt_s"), start: start, "\(what): boil")
    if let p = json["pulled"] as? [String: Any] {
        let pulled = try #require(e.pulled, "\(what): not pulled")
        let due = try p.num("due_s")
        expectTime(pulled.dueS, due, start: due - 1000, "\(what): due")
        expectTime(pulled.outS, try p.num("out_s"), start: due - 1000, "\(what): out")
        #expect(try pulled.by.rawValue == p.str("by"), "\(what): by")
        #expect(try pulled.confirmed == p.flag("confirmed"), "\(what): confirmed")
    } else {
        #expect(e.pulled == nil, "\(what): pulled")
    }
    let cooled = try json.optionalNum("cooledAt_s")
    expectTime(e.cooledAtS, cooled, start: (cooled ?? 0) - 1000, "\(what): cooled")
    let rang = try json.optionalNum("rangAt_s")
    expectTime(e.rangAtS, rang, start: (rang ?? 0) - 1000, "\(what): rang")
}

private func expectPlan(_ p: CookPlan, _ json: [String: Any], start: Double, _ note: String) throws {
    try expectClose(p.egg.massKg, json.object("egg").num("mass_kg"), "\(note): mass")
    let setup = try cookSetup(json.object("setup"))
    #expect(p.setup.startMode == setup.startMode, "\(note): start")
    expectClose(p.setup.timeToBoilS, setup.timeToBoilS, "\(note): time to boil")
    if let inputs = json["inputs"] as? [String: Any] {
        let i = try #require(p.inputs, "\(note): no inputs")
        try expectClose(i.params.alphaM2s, inputs.object("params").num("alpha_m2s"), "\(note): inputs' alpha")
        try expectClose(i.whiteDoseMin, inputs.num("whiteDose_min"), "\(note): inputs' white")
    } else {
        #expect(p.inputs == nil, "\(note): inputs")
    }
    let a = try json.object("answer")
    try expectClose(p.answer.level, a.num("level"), "\(note): answer level")
    #expect(try p.answer.verdict.kind.rawValue == a.str("kind"), "\(note): verdict")
    #expect(try p.answer.verdict.snapTo == a.optionalNum("snapTo"), "\(note): snap to")
    #expect(try p.answer.lowOdds == a.flag("lowOdds"), "\(note): low odds")
    try expectClose(p.answer.solution.result.cookTimeS, a.num("cookTime_s"), "\(note): mean solve")
    let sol = try json.object("solution")
    #expect(try p.solution.reachable == sol.flag("reachable"), "\(note): reachable")
    #expect(try p.solution.whiteSets == sol.flag("whiteSets"), "\(note): white sets")
    try expectClose(p.solution.result.cookTimeS, sol.num("cookTime_s"), "\(note): solution's time")
    try expectClose(p.solution.result.peakYolkC, sol.num("peakYolk_C"), "\(note): peak yolk")
    try expectClose(p.solution.result.peakYolkTimeS, sol.num("peakYolkTime_s"), "\(note): peak time")
    if let d = json["decided"] as? [String: Any] {
        let decided = try #require(p.decided, "\(note): not decided")
        try expectClose(decided.level, d.num("level"), "\(note): decided level")
        try expectClose(decided.solution.result.cookTimeS, d.num("cookTime_s"), "\(note): decided time")
        let dd = try d.object("decision")
        try expectClose(decided.decision.cookTimeS, dd.num("cookTime_s"), "\(note): decision")
        try expectClose(decided.decision.meanCookTimeS, dd.num("meanCookTime_s"), "\(note): decision's mean")
        #expect(try decided.decision.chosen == dd.flag("chosen"), "\(note): chosen")
        try expectClose(decided.decision.odds, dd.num("odds"), "\(note): odds")
        #expect(try decided.decision.oddsTenths == Int(dd.num("oddsTenths")), "\(note): tenths")
        try expectClose(decided.nudgeS, d.num("nudge_s"), "\(note): decided nudge")
        #expect(try decided.adviceWanted == d.flag("adviceWanted"), "\(note): advice")
    } else {
        #expect(p.decided == nil, "\(note): decided")
    }
    try expectClose(p.leanS, json.num("lean_s"), "\(note): lean")
    try expectClose(p.nudgeS, json.num("nudge_s"), "\(note): nudge")
    try expectClose(p.cookTimeS, json.num("cookTime_s"), "\(note): cook time")
    #expect(try p.overdue == json.flag("overdue"), "\(note): overdue")
    try expectClose(p.coolS, json.num("cool_s"), "\(note): cooling")
    #expect(try p.probeMoment == json.flag("probeMoment"), "\(note): probe moment")
    let dl = try json.object("deadlines")
    expectTime(p.deadlines.cookEndS, try dl.num("cookEnd_s"), start: start, "\(note): cook end")
    expectTime(p.deadlines.coolEndS, try dl.optionalNum("coolEnd_s"), start: start, "\(note): cooling end")
    #expect(try p.deadlines.provisional == dl.flag("provisional"), "\(note): deadlines provisional")
    #expect(try p.deadlines.asking == dl.flag("asking"), "\(note): deadlines asking")
    expectTime(p.deadlines.outAtS, try dl.optionalNum("outAt_s"), start: start, "\(note): out")
    expectTime(p.slowHobAtS, try json.optionalNum("slowHobAt_s"), start: start, "\(note): slow hob")
    expectTime(p.tooOldAtS, try json.num("tooOldAt_s"), start: start, "\(note): too old")
    try expectMemo(p.memo, json["memo"], note)
    if let cj = json["certainty"] as? [String: Any] {
        let c = try #require(p.certainty, "\(note): no certainty")
        let w = try cj.object("words")
        #expect(try c.words.asked == Int(w.num("asked")), "\(note): asked")
        #expect(try c.words.certainty.rawValue == w.str("certainty"), "\(note): certainty")
        try expectClose(c.words.pAsked, w.num("pAsked"), "\(note): pAsked")
        try expectClose(c.words.pInterval, w.num("pInterval"), "\(note): pInterval")
        #expect(try c.words.from == Int(w.num("from")) && c.words.to == Int(w.num("to")), "\(note): interval")
        #expect(try c.words.mostLikely == Int(w.num("mostLikely")), "\(note): most likely")
        let t = try cj.object("time")
        try expectClose(c.time.lowS, t.num("low_s"), "\(note): time low")
        try expectClose(c.time.highS, t.num("high_s"), "\(note): time high")
    } else {
        #expect(p.certainty == nil, "\(note): certainty")
    }
    if let fj = json["forecast"] as? [String: Any] {
        let f = try #require(p.forecast, "\(note): no forecast")
        try expectClose(f.cookS, fj.num("cook_s"), "\(note): forecast's time")
        for (key, got) in [("yolk", f.yolk), ("white", f.white), ("yolkWord", f.yolkWord ?? [])] {
            let want = try fj.numbers(key)
            #expect(got.count == want.count, "\(note): forecast \(key)")
            for (x, y) in zip(got, want) { expectClose(x, y, "\(note): forecast \(key)") }
        }
    } else {
        #expect(p.forecast == nil, "\(note): forecast")
    }
}

/// A fixed stream of doubles in [0, 1) with every bit of the mantissa used:
/// SplitMix64, for draws a test can repeat.
private struct SplitMix {
    var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> Double {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        z ^= z >> 31
        return Double(z >> 11) / Double(UInt64(1) << 53)
    }
}

@Suite("The phase rule matches the reference implementation")
struct PhaseConformance {
    /// The counter-rest timeline matters most: with no cooling deadline, an
    /// app that fell from COOKING straight to DONE would never show "Out of
    /// the water — now" or run the 20 s grace, while the pull notification
    /// still fired at a screen that already said Done. Sampled either side of
    /// every boundary.
    @Test("every boundary, with and without a cooling step")
    func timelines() throws {
        for timeline in try Fixtures.list("running.json", "phase.timelines") {
            let name = try timeline.str("name")
            let cookEndS = try timeline.num("cookEnd_s")
            let coolEndS = try timeline.optionalNum("coolEnd_s")
            let outAtS = try timeline.optionalNum("outAt_s")
            for sample in try timeline.rows("samples") {
                let nowS = try sample.num("now_s")
                let phase = try sample.str("phase")
                let provisional = try sample.str("provisional")
                let running = phaseAt(
                    Deadlines(cookEndS: cookEndS, coolEndS: coolEndS, provisional: false, outAtS: outAtS),
                    nowS: nowS
                )
                #expect(
                    running.rawValue == phase,
                    "\(name) at \(nowS) s: expected \(phase), got \(running.rawValue)"
                )
                let guessing = phaseAt(
                    Deadlines(cookEndS: cookEndS, coolEndS: coolEndS, provisional: true, outAtS: outAtS),
                    nowS: nowS
                )
                let what = "\(name) at \(nowS) s, boil not yet tapped:"
                    + " expected \(provisional), got \(guessing.rawValue)"
                #expect(guessing.rawValue == provisional, "\(what)")
                let asking = phaseAt(
                    Deadlines(cookEndS: cookEndS, coolEndS: coolEndS, provisional: false, outAtS: outAtS, asking: true),
                    nowS: nowS
                )
                #expect(try asking.rawValue == sample.str("asking"), "\(name) at \(nowS) s, asking")
            }
        }
    }

    @Test("the cooling step and the pull grace are the same lengths")
    func constants() throws {
        let phase = try Fixtures.object("running.json", "phase")
        try expectClose(coolingSeconds, phase.num("coolingSeconds"), "coolingSeconds")
        try expectClose(pullGraceSeconds, phase.num("pullGraceSeconds"), "pullGraceSeconds")
        let slowHob = try phase.object("slowHob")
        try expectClose(slowHobWhenLeftS, slowHob.num("whenLeft_s"), "slowHobWhenLeftS")
        try expectClose(slowHobExtraS, slowHob.num("extra_s"), "slowHobExtraS")
        try expectClose(slowHobEveryS, slowHob.num("every_s"), "slowHobEveryS")
    }
}
