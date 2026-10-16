import Testing
import Foundation
@testable import EggTimerCore

/// The running cook as one state machine against `fixtures/step.json`,
/// generated from `src/core/step.ts`: each trace replayed event by event, with
/// what the app had built landed as the fixture says, and what the step made
/// held to the web's at every step, whole: the cook, the plan, the lean, what
/// it needs, the effects and the readout.
///
/// The plan is held whole in running.json; here the fixture writes what the
/// machine moves of it (`planJson` in tools/fixtures/step.ts), and so does
/// this. Every clock time is compared as seconds from the cook's start.

/// A step as the fixture writes what it made.
private struct StepRow: Encodable {
    let cook: CookRow?
    let plan: PlanRow?
    let leanHintS: Double
    let need: NeedRow
    let effects: [CookEffect]
    let readout: Readout?

    enum CodingKeys: String, CodingKey {
        case cook, plan, leanHintS = "leanHint_s", need, effects, readout
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(cook, forKey: .cook)
        try c.encode(plan, forKey: .plan)
        try c.encode(leanHintS, forKey: .leanHintS)
        try c.encode(need, forKey: .need)
        try c.encode(effects, forKey: .effects)
        try c.encode(readout, forKey: .readout)
    }
}

/// The cook: its log, the entries this step added to it, and the log folded.
private struct CookRow: Encodable {
    let idMs: Double
    let logLength: Int
    let added: [CookEntry]
    let startedAtS: Double
    let events: CookEvents
    let correctedAtS: Double?
    let endedAtS: Double?

    enum CodingKeys: String, CodingKey {
        case idMs = "id_ms", logLength, added, startedAtS = "startedAt_s", events, correctedAtS = "correctedAt_s"
        case endedAtS = "endedAt_s"
    }

    init(_ c: RunningCook, was: RunningCook?) {
        let from = was.map { $0.idMs == c.idMs && c.log.count >= $0.log.count ? $0.log.count : 0 } ?? 0
        idMs = c.idMs
        logLength = c.log.count
        added = Array(c.log[from...])
        startedAtS = c.startedAtS
        events = c.events
        correctedAtS = c.correctedAtS
        endedAtS = EggTimerCore.endedAtS(c)
    }
}

/// The plan, as far as the machine moves it.
private struct PlanRow: Encodable {
    let phase: Phase
    let cookTimeS: Double
    let timeToBoilS: Double
    let deadlines: Deadlines
    let decided: Bool
    let lengthened: Bool
    let leanS: Double
    let level: Double
    let verdict: RefusalKind
    let overdue: Bool
    let slowHobAtS: Double?
    let tooOldAtS: Double
    let certainty: Sure?

    struct Sure: Encodable {
        let certainty: Certainty
        let from: Int
        let to: Int
        let lowS: Double
        let highS: Double
        enum CodingKeys: String, CodingKey { case certainty, from, to, lowS = "low_s", highS = "high_s" }
    }

    enum CodingKeys: String, CodingKey {
        case phase, cookTimeS = "cookTime_s", timeToBoilS = "timeToBoil_s", deadlines, decided, lengthened
        case leanS = "lean_s", level, verdict, overdue, slowHobAtS = "slowHobAt_s", tooOldAtS = "tooOldAt_s", certainty
    }

    init(_ p: CookPlan, nowS: Double) {
        phase = phaseAt(p.deadlines, nowS: nowS)
        cookTimeS = p.cookTimeS
        timeToBoilS = p.setup.timeToBoilS
        deadlines = p.deadlines
        decided = p.decided != nil
        lengthened = guessLengthened(p)
        leanS = p.leanS
        level = p.answer.level
        verdict = p.answer.verdict.kind
        overdue = p.overdue
        slowHobAtS = p.slowHobAtS
        tooOldAtS = p.tooOldAtS
        certainty = p.certainty.map {
            Sure(certainty: $0.words.certainty, from: $0.words.from, to: $0.words.to, lowS: $0.time.lowS, highS: $0.time.highS)
        }
    }
}

/// What the state waits for: whether each surface is wanted, not which.
private struct NeedRow: Encodable {
    let surface: Bool
    let before: Bool
    let beforeSurface: Bool
    let wakeAtS: Double?

    enum CodingKeys: String, CodingKey { case surface, before, beforeSurface, wakeAtS = "wakeAt_s" }

    init(_ n: CookNeed) {
        surface = n.surface != nil
        before = n.before
        beforeSurface = n.beforeSurface != nil
        wakeAtS = n.wakeAtS
    }
}

@Suite("Step")
struct StepConformance {
    @Test("every trace, event by event: the cook, its plan, what it needs, the effects and the readout")
    func traces() throws {
        var posteriors = [String: Calibration]()
        for p in try Fixtures.list("decide.json", "posteriors") {
            let name = try p.str("name")
            posteriors[name] = try Calibration(
                posterior: #require(posteriorsByName([p])[name]), eggsLogged: Int(p.num("eggsLogged"))
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
                    state = CookState(cook: state.cook, plan: nil, leanHintS: state.leanHintS)
                    env.surfaces = []
                    env.before = nil
                }
                for landed in s["landed"] as? [[String: Any]] ?? [] {
                    let need = try #require(last?.need, "\(what): nothing was needed")
                    switch try landed.str("on") {
                    case "now":
                        let inputs = try #require(need.surface, "\(what): no surface was needed")
                        let grid = try doseGrid(landed["grid"], egg: inputs.egg, setup: inputs.setup)
                        let profile = try (landed["profile"] as? [String: Any]).map { try decoded(OddsProfile.self, $0) }
                        env.surfaces.append(CookSurface(inputs: inputs, grid: grid, profile: profile))
                    case "calibrationBefore":
                        #expect(need.before, "\(what): the calibration before was not needed")
                        env.before = CookBefore(calibration: before, surfaces: [])
                    case "before":
                        let inputs = try #require(need.beforeSurface, "\(what): no surface before was needed")
                        let grid = try doseGrid(landed["grid"], egg: inputs.egg, setup: inputs.setup)
                        env.before?.surfaces.append(CookSurface(inputs: inputs, grid: grid, profile: nil))
                    default:
                        Issue.record("\(what): landed what?")
                    }
                }
                let event = try decoded(CookEvent.self, s["event"])
                let was = state.cook
                let out = step(state, event, env)
                let now = event.nowS
                let probe = try (s["probe"] as? [String: Any]).map { try decoded(ReadoutProbe.self, $0) }
                let readout = out.cook.flatMap { c in
                    out.plan.map { readoutAt(c, plan: $0, nowS: now, probe: probe ?? ReadoutProbe(wanted: false, pending: false)) }
                }
                let made = StepRow(
                    cook: out.cook.map { CookRow($0, was: was) }, plan: out.plan.map { PlanRow($0, nowS: now) },
                    leanHintS: out.leanHintS, need: NeedRow(out.need), effects: out.effects, readout: readout
                )
                var expected = s
                for input in ["event", "reload", "posterior", "landed", "probe"] { expected[input] = nil }
                expectJSON(made, expected, what, clockFrom: out.cook?.start.atS ?? was?.start.atS ?? now)
                state = out.state
                last = out
                steps += 1
            }
        }
        #expect(steps >= 200)
    }
}
