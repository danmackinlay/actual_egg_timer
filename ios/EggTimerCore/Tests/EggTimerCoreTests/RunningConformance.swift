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
            #expect(sameJSON(after?.jsonObject, row["after"]), "\(note)")
        }
    }

    @Test("a stored cook is read whole or not at all, and what is written reads back")
    func reads() throws {
        let rows = try Fixtures.list("running.json", "reads")
        #expect(rows.count >= 40)
        for row in rows {
            let note = try row.str("note")
            let read = readRunningCook(row["raw"])
            #expect(sameJSON(read?.jsonObject, row["cook"]), "\(note)")
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
            var cook = base
            cook.startedAtS += draw.next()
            cook.idMs = (cook.startedAtS * 1000).rounded()
            cook.choices.massKg = 0.04 + 0.04 * draw.next()
            cook.choices.waterLitres = 0.2 + 3 * draw.next()
            cook.choices.level = draw.next()
            cook.choices.altitudeM = 2000 * draw.next()
            cook.nudgeS = 20 * draw.next() - 10
            cook.boilMemory = ["\(cook.choices.waterLitres)": 300 + 600 * draw.next()]
            if cook.events.boilAtS != nil { cook.events.boilAtS = cook.startedAtS + 400 + draw.next() }
            cooks.append(cook)
        }
        for cook in cooks {
            let data = try JSONEncoder().encode(cook)
            let back = try JSONDecoder().decode(RunningCook.self, from: data)
            #expect(back == cook)
            // What the app reads through: the same cook, nothing in between
            // being text.
            #expect(readRunningCook(back.jsonObject) == cook)
            // The web's keys and nulls: what JSONSerialization makes of it is
            // the cook's own JSON, to its last bit but one.
            #expect(sameJSON(try JSONSerialization.jsonObject(with: data), cook.jsonObject, ulps: 4))
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
            let slowHob = try (row["hint"] as? [String: Any]).map { try slowHobHintOf($0) }
            let plan = replan(cook, c, surface: surface, leanHintS: hint, nowS: now, hint: slowHob)
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

/// The slow hob's hint as the fixtures write one.
private func slowHobHintOf(_ json: [String: Any]) throws -> SlowHobHint {
    let params = try json.object("params")
    return try SlowHobHint(
        startedAtS: json.num("startedAt_s"), choices: choicesOf(json.object("choices")),
        fromRampS: json.num("fromRamp_s"), carryS: json.num("carry_s"),
        params: ModelParams(alphaM2s: params.num("alpha_m2s"), tauAirScale: params.num("tauAirScale")),
        whiteDoseMin: json.num("whiteDose_min"), steps: Int(json.num("steps")), lastS: json.num("last_s"),
        rampS: json.num("ramp_s"), carriedS: json.optionalNum("carried_s")
    )
}

private func expectHint(_ h: SlowHobHint?, _ json: Any?, _ note: String) throws {
    guard let j = json as? [String: Any] else {
        #expect(h == nil, "\(note): no slow hob's hint")
        return
    }
    let hint = try #require(h, "\(note): a slow hob's hint")
    let want = try slowHobHintOf(j)
    #expect(hint.steps == want.steps, "\(note): hint steps")
    expectClose(hint.lastS, want.lastS, "\(note): hint's last")
    expectClose(hint.rampS, want.rampS, "\(note): hint's ramp")
    expectClose(hint.fromRampS, want.fromRampS, "\(note): hint's start")
    expectClose(hint.carryS, want.carryS, "\(note): hint's carry")
    switch (hint.carriedS, want.carriedS) {
    case (nil, nil): break
    case let (a?, b?): expectClose(a, b, "\(note): hint's carried time")
    default: Issue.record("\(note): hint's carried time")
    }
}

/// An odds profile as the fixtures write one.
private func profileOf(_ json: [String: Any]) throws -> OddsProfile {
    try OddsProfile(
        points: json.rows("points", mayBeEmpty: true).map {
            try LevelOdds(level: $0.num("level"), cookTimeS: $0.num("cookTime_s"), odds: $0.num("odds"))
        },
        best: json.num("best"),
        physicalSoftest: json.num("physicalSoftest"), physicalHardest: json.num("physicalHardest"),
        softest: json.optionalNum("softest"), hardest: json.optionalNum("hardest")
    )
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
    #expect(try p.provisional == json.flag("provisional"), "\(note): provisional")
    #expect(try p.lengthened == json.flag("lengthened"), "\(note): lengthened")
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
    try expectClose(p.level, json.num("level"), "\(note): level")
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
    #expect(try p.askIfStillIn == json.flag("askIfStillIn"), "\(note): ask if still in")
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
    try expectHint(p.slowHob, json["slowHob"], note)
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
