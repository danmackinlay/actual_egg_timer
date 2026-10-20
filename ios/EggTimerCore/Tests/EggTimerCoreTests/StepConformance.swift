import Testing
import Foundation
@testable import EggTimerCore

/// The running cook as one state machine against `fixtures/step.json`,
/// generated from `src/core/step.ts`: each trace replayed event by event, with
/// what the app had built landed as the fixture says, and what the step made
/// held to the web's at every step: the cook folded, the plan, the lean, what
/// it needs, the effects and the readout. Each trace is a test of its own,
/// so the traces run side by side.
///
/// The fixture writes what the machine moves of the plan (`planRow` in
/// tools/fixtures/shared.ts), as running.json does, and so does this. Every clock time is compared as seconds from the cook's start.

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

/// The cook: how long its log is, and the log folded. Its entries are each
/// app's own to store.
private struct CookRow: Encodable {
    let idMs: Double
    let logLength: Int
    let startedAtS: Double
    let events: CookEvents
    let correctedAtS: Double?
    let endedAtS: Double?

    enum CodingKeys: String, CodingKey {
        case idMs = "id_ms", logLength, startedAtS = "startedAt_s", events, correctedAtS = "correctedAt_s"
        case endedAtS = "endedAt_s"
    }

    init(_ c: RunningCook) {
        idMs = c.idMs
        logLength = c.log.count
        startedAtS = c.startedAtS
        events = c.events
        correctedAtS = c.correctedAtS
        endedAtS = EggTimerCore.endedAtS(c)
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

/// The traces' places in the fixture, for the test to be run over, each
/// trace on its own.
private let traceIndices: [Int] = (try? Fixtures.list("step.json", "traces").count).map { Array(0..<$0) } ?? []

@Suite("Step")
struct StepConformance {
    @Test("the traces are all there: some thirty, and two hundred steps")
    func counted() throws {
        let traces = try Fixtures.list("step.json", "traces")
        #expect(traces.count >= 30)
        #expect(try traces.reduce(0) { $0 + (try $1.rows("steps")).count } >= 200)
        #expect(traceIndices.count == traces.count)
    }

    @Test("every trace, event by event: the cook, its plan, what it needs, the effects and the readout", arguments: traceIndices)
    func traces(_ index: Int) throws {
        var posteriors = [String: Calibration]()
        for p in try Fixtures.list("decide.json", "posteriors") {
            let name = try p.str("name")
            posteriors[name] = try Calibration(
                posterior: #require(posteriorsByName([p])[name]), eggsLogged: Int(p.num("eggsLogged"))
            )
        }
        let traces = try Fixtures.list("step.json", "traces")
        do {
            let trace = traces[index]
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
                    cook: out.cook.map { CookRow($0) }, plan: out.plan.map { PlanRow($0, nowS: now) },
                    leanHintS: out.leanHintS, need: NeedRow(out.need), effects: out.effects, readout: readout
                )
                var expected = s
                for input in ["event", "reload", "posterior", "landed", "probe"] { expected[input] = nil }
                let clock = out.cook?.start.atS ?? was?.start.atS ?? now
                expectJSON(made, expected, what, clockFrom: clock)
                state = out.state
                last = out
            }
        }
    }
}
