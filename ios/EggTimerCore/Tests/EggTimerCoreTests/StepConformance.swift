import Testing
import Foundation
@testable import EggTimerCore

/// The running cook as one state machine against `fixtures/step.json`,
/// generated from `src/core/step.ts`: each trace replayed event by event, with
/// what the app had built landed as the fixture says, and the cook's log, the
/// plan, what it needs, the effects and the readout held to the web's at
/// every step.

/// An event as the fixtures write one.
private func eventOf(_ j: [String: Any]) throws -> CookEvent {
    let now = try j.num("now_s")
    switch try j.str("kind") {
    case "start":
        var memory = BoilMemory()
        for (k, v) in try j.object("boilMemory") { memory[k] = (v as? NSNumber)?.doubleValue }
        return try .start(
            nowS: now, choices: choicesOf(j.object("choices")), nudgeS: j.num("nudge_s"), boilMemory: memory,
            units: j.value(Units.self, "units"), lang: j.str("lang"), leanHintS: j.num("leanHint_s")
        )
    case "boil": return .boil(nowS: now)
    case "correct": return try .correct(nowS: now, choices: choicesOf(j.object("choices")))
    case "correctStart": return try .correctStart(nowS: now, startedAtS: j.num("startedAt_s"))
    case "out": return .out(nowS: now)
    case "stillIn": return .stillIn(nowS: now)
    case "pullStands": return .pullStands(nowS: now)
    case "tick": return .tick(nowS: now)
    case "surfaceLanded": return .surfaceLanded(nowS: now)
    case "answered":
        let probe = try (j["probe"] as? [String: Any]).map {
            ProbeReading(centreC: try $0.num("centre_C"), afterS: try $0.optionalNum("after_s"))
        }
        return try .answered(
            nowS: now, yolkWord: j.optionalValue(YolkWord.self, "yolkWord"),
            white: j.optionalValue(WhiteReport.self, "white"), probe: probe
        )
    case "startAgain": return .startAgain(nowS: now)
    default: throw FixtureError("an unknown event \(j)")
    }
}

/// A time, absolute, against the fixture's: to the conformance tolerance of
/// the cook's own span, as a cook time is.
private func expectAt(_ a: Double?, _ e: Double?, start: Double, _ what: String) {
    switch (a, e) {
    case (nil, nil): break
    case let (x?, y?): expectClose(x - start, y - start, what)
    default: Issue.record("\(what): expected \(String(describing: e)), got \(String(describing: a))")
    }
}

private func expectLine(_ l: ReadoutLine?, _ json: Any?, _ what: String) throws {
    guard let j = json as? [String: Any] else {
        #expect(l == nil, "\(what)")
        return
    }
    let line = try #require(l, "\(what): no line")
    #expect(try line.key == j.str("key"), "\(what): key")
    let args = try j.object("args")
    #expect(Set(line.args.keys) == Set(args.keys), "\(what): its numbers \(line.args.keys.sorted())")
    for (k, v) in args {
        if let n = v as? NSNumber, let got = line.args[k] { expectClose(got, n.doubleValue, "\(what): \(k)") }
    }
}

private func expectReadout(_ r: Readout?, _ json: Any?, _ what: String) throws {
    guard let j = json as? [String: Any] else {
        #expect(r == nil, "\(what): no readout")
        return
    }
    let ro = try #require(r, "\(what): a readout")
    #expect(try ro.phase.rawValue == j.str("phase"), "\(what): phase")
    #expect(try ro.asking == j.flag("asking"), "\(what): asking")
    #expect(try ro.label == j.str("label"), "\(what): label")
    try expectClose(ro.clockS, j.num("clock_s"), "\(what): clock")
    #expect(try ro.sign == j.str("sign"), "\(what): sign")
    try expectLine(ro.subline, j["subline"], "\(what): subline")
    let spoken = try j.object("spoken")
    #expect(try ro.spoken.say.rawValue == spoken.str("say"), "\(what): spoken")
    try expectLine(
        ReadoutLine(key: ro.spoken.say.rawValue, args: ro.spoken.args),
        ["key": spoken.str("say"), "args": spoken.object("args")], "\(what): spoken"
    )
    #expect(try ro.primary == j.optionalStr("primary"), "\(what): primary")
    #expect(try ro.secondary == j.optionalStr("secondary"), "\(what): secondary")
    try expectLine(ro.hint, j["hint"], "\(what): hint")
    #expect(try ro.cancel == j.flag("cancel"), "\(what): cancel")
}

private func expectEffects(_ effects: [CookEffect], _ json: [[String: Any]], start: Double, _ what: String) throws {
    #expect(effects.map(\.kind) == json.map { $0["kind"] as? String ?? "" }, "\(what): effects \(effects.map(\.kind))")
    for (e, j) in zip(effects, json) {
        switch e {
        case let .alarms(pull, cooled):
            expectAt(pull, try j.optionalNum("pull_s"), start: start, "\(what): the pull's alarm")
            expectAt(cooled, try j.optionalNum("cooled_s"), start: start, "\(what): the cooling's alarm")
        case let .ring(moment):
            #expect(try moment.rawValue == j.str("moment"), "\(what): rings")
        case let .rememberBoil(boil):
            let b = try j.object("boil")
            try expectClose(boil.litres, b.num("litres"), "\(what): litres remembered")
            try expectClose(boil.seconds, b.num("seconds"), "\(what): seconds remembered")
        case let .log(record, replaces):
            #expect(try replaces == j.flag("replaces"), "\(what): replaces")
            let written = try JSONSerialization.jsonObject(with: JSONEncoder().encode(record))
            #expect(sameJSON(written, j["record"], relative: conformanceTolerance), "\(what): the record")
        case .persist, .silence, .forget, .sendFinal:
            break
        }
    }
}

private func expectPlan(_ p: CookPlan?, _ json: Any?, now: Double, start: Double, _ what: String) throws {
    guard let j = json as? [String: Any] else {
        #expect(p == nil, "\(what): no plan")
        return
    }
    let plan = try #require(p, "\(what): a plan")
    #expect(try phaseAt(plan.deadlines, nowS: now).rawValue == j.str("phase"), "\(what): phase")
    try expectClose(plan.cookTimeS, j.num("cookTime_s"), "\(what): cook time")
    try expectClose(plan.setup.timeToBoilS, j.num("timeToBoil_s"), "\(what): time to boil")
    let d = try j.object("deadlines")
    expectAt(plan.deadlines.cookEndS, try d.num("cookEnd_s"), start: start, "\(what): the pull")
    expectAt(plan.deadlines.coolEndS, try d.optionalNum("coolEnd_s"), start: start, "\(what): the cooling's end")
    #expect(try plan.deadlines.provisional == d.flag("provisional"), "\(what): provisional")
    #expect(try plan.deadlines.asking == d.flag("asking"), "\(what): asking")
    expectAt(plan.deadlines.outAtS, try d.optionalNum("outAt_s"), start: start, "\(what): out")
    #expect(try (plan.decided != nil) == j.flag("decided"), "\(what): decided")
    #expect(try guessLengthened(plan) == j.flag("lengthened"), "\(what): lengthened")
    try expectClose(plan.leanS, j.num("lean_s"), "\(what): lean")
    try expectClose(plan.answer.level, j.num("level"), "\(what): level")
    #expect(try plan.answer.verdict.kind.rawValue == j.str("verdict"), "\(what): verdict")
    #expect(try plan.overdue == j.flag("overdue"), "\(what): overdue")
    expectAt(plan.slowHobAtS, try j.optionalNum("slowHobAt_s"), start: start, "\(what): the slow hob")
    expectAt(plan.tooOldAtS, try j.num("tooOldAt_s"), start: start, "\(what): too old")
    if let c = j["certainty"] as? [String: Any] {
        let sure = try #require(plan.certainty, "\(what): how sure")
        #expect(try sure.words.certainty.rawValue == c.str("certainty"), "\(what): certainty")
        #expect(try sure.words.from == Int(c.num("from")) && sure.words.to == Int(c.num("to")), "\(what): interval")
        try expectClose(sure.time.lowS, c.num("low_s"), "\(what): time low")
        try expectClose(sure.time.highS, c.num("high_s"), "\(what): time high")
    } else {
        #expect(plan.certainty == nil, "\(what): no certainty")
    }
}

private func expectCook(_ cook: RunningCook?, was: RunningCook?, _ json: Any?, _ what: String) throws {
    guard let j = json as? [String: Any] else {
        #expect(cook == nil, "\(what): no cook")
        return
    }
    let c = try #require(cook, "\(what): a cook")
    let start = c.start.atS
    #expect(try c.log.count == Int(j.num("logLength")), "\(what): log \(c.log.map(\.kind))")
    let from = was.map { $0.idMs == c.idMs && c.log.count >= $0.log.count ? $0.log.count : 0 } ?? 0
    let added = c.log.count >= from ? Array(c.log[from...]) : []
    #expect(
        sameJSON(added.map(\.jsonObject), j["added"], relative: conformanceTolerance),
        "\(what): logged \(added.map(\.kind))"
    )
    expectAt(c.startedAtS, try j.num("startedAt_s"), start: start, "\(what): started")
    #expect(
        sameJSON(c.events.jsonObject, j["events"], relative: conformanceTolerance), "\(what): events \(c.events)"
    )
    expectAt(c.correctedAtS, try j.optionalNum("correctedAt_s"), start: start, "\(what): corrected")
    expectAt(endedAtS(c), try j.optionalNum("endedAt_s"), start: start, "\(what): ended")
}

@Suite("Step")
struct StepConformance {
    @Test("every trace, event by event: the cook, its plan, what it needs, the effects and the readout")
    func traces() throws {
        var posteriors = [String: Calibration]()
        for p in try Fixtures.list("decide.json", "posteriors") {
            let byName = try posteriorsByName([p])
            let name = try p.str("name")
            posteriors[name] = try Calibration(
                posterior: #require(byName[name]), eggsLogged: Int(p.num("eggsLogged"))
            )
        }
        let traces = try Fixtures.list("step.json", "traces")
        #expect(traces.count >= 30)
        var steps = 0
        for trace in traces {
            let note = try trace.str("note")
            var env = try CookEnv(
                calibration: #require(posteriors[trace.str("posterior")]), surfaces: [], before: nil,
                app: trace.value(AppName.self, "app"), appVersion: "0.5.0-alpha.1", prior: literaturePopulation.id,
                day: "2026-10-07"
            )
            let before = try #require(posteriors[trace.str("before")])
            var state = CookState(cook: nil, plan: nil, leanHintS: 0)
            var last: CookStep?
            for (i, s) in try trace.rows("steps").enumerated() {
                let what = "\(note), step \(i)"
                if let name = s["posterior"] as? String { env.calibration = try #require(posteriors[name]) }
                if s["reload"] as? Bool == true {
                    let stored = try state.cook.map {
                        try #require(readRunningCook($0.jsonObject), "\(what): the stored cook reads back")
                    }
                    state = CookState(cook: stored, plan: nil, leanHintS: state.leanHintS)
                    env.surfaces = []
                    env.before = nil
                }
                for landed in s["landed"] as? [[String: Any]] ?? [] {
                    let need = try #require(last?.need, "\(what): nothing was needed")
                    switch try landed.str("on") {
                    case "now":
                        let inputs = try #require(need.surface, "\(what): no surface was needed")
                        let grid = try doseGrid(landed.object("grid"), egg: inputs.egg, setup: inputs.setup)
                        let profile = try (landed["profile"] as? [String: Any]).map { try profileOf($0) }
                        env.surfaces.append(CookSurface(inputs: inputs, grid: grid, profile: profile))
                    case "calibrationBefore":
                        #expect(need.before, "\(what): the calibration before was not needed")
                        env.before = CookBefore(calibration: before, surfaces: [])
                    case "before":
                        let inputs = try #require(need.beforeSurface, "\(what): no surface before was needed")
                        let grid = try doseGrid(landed.object("grid"), egg: inputs.egg, setup: inputs.setup)
                        env.before?.surfaces.append(CookSurface(inputs: inputs, grid: grid, profile: nil))
                    default:
                        Issue.record("\(what): landed what?")
                    }
                }
                let event = try eventOf(s.object("event"))
                let was = state.cook
                let out = step(state, event, env)
                let now = event.nowS
                let start = out.cook?.start.atS ?? was?.start.atS ?? now
                try expectCook(out.cook, was: was, s["cook"], what)
                try expectPlan(out.plan, s["plan"], now: now, start: start, what)
                try expectClose(out.leanHintS, s.num("leanHint_s"), "\(what): lean")
                let need = try s.object("need")
                #expect(try (out.need.surface != nil) == need.flag("surface"), "\(what): a surface needed")
                #expect(try out.need.before == need.flag("before"), "\(what): the calibration before needed")
                #expect(try (out.need.beforeSurface != nil) == need.flag("beforeSurface"), "\(what): a surface before")
                expectAt(out.need.wakeAtS, try need.optionalNum("wakeAt_s"), start: start, "\(what): wake")
                try expectEffects(out.effects, s.rows("effects", mayBeEmpty: true), start: start, what)
                let probe = try (s["probe"] as? [String: Any]).map {
                    ReadoutProbe(wanted: try $0.flag("wanted"), pending: try $0.flag("pending"))
                }
                let readout = out.cook.flatMap { c in
                    out.plan.map { readoutAt(c, plan: $0, nowS: now, probe: probe ?? ReadoutProbe(wanted: false, pending: false)) }
                }
                try expectReadout(readout, s["readout"], what)
                state = out.state
                last = out
                steps += 1
            }
        }
        #expect(steps >= 200)
    }
}
