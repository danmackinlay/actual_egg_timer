import Testing
import Foundation
@testable import EggTimerCore

/// The cooks an app holds against `fixtures/cooks.json`, generated from
/// `src/core/cooks.ts`: each trace replayed step by step - an event, what
/// was built landing for the cooks that waited on it, a relaunch - and what
/// it made held to the web's: the cook on screen and each ended one, the
/// effects tagged with whose cook, the eggs still open and the calibrations
/// before still wanted. Every clock time is compared as seconds from the
/// first cook's start.

/// A step as the fixture writes what it made.
private struct CooksRow: Encodable {
    let cooks: Summary
    let effects: [CooksEffect]
    let openEggs: [Double]
    let beforeWanted: [Double]
}

/// The cooks: the one on screen by its id, phase and log, and each ended one
/// by its id, log and what it waits for.
private struct Summary: Encodable {
    let screen: Screen?
    let ending: [Ending]

    struct Screen: Encodable {
        let idMs: Double
        let phase: Phase
        let logLength: Int
        enum CodingKeys: String, CodingKey { case idMs = "id_ms", phase, logLength }
    }

    struct Ending: Encodable {
        let idMs: Double?
        let logLength: Int
        let need: Wants
        enum CodingKeys: String, CodingKey { case idMs = "id_ms", logLength, need }
    }

    /// What a cook waits for: whether each surface is wanted, not which.
    struct Wants: Encodable {
        let surface: Bool
        let before: Bool
        let beforeSurface: Bool
        let wakeAtS: Double?
        enum CodingKeys: String, CodingKey { case surface, before, beforeSurface, wakeAtS = "wakeAt_s" }
    }

    init(_ q: Cooks, nowS: Double) {
        if let cook = q.screen.cook, let plan = q.screen.plan {
            screen = Screen(idMs: cook.idMs, phase: phaseAt(plan.deadlines, nowS: nowS), logLength: cook.log.count)
        } else {
            screen = nil
        }
        ending = q.ending.map { e in
            Ending(
                idMs: e.cook?.idMs, logLength: e.cook?.log.count ?? 0,
                need: Wants(
                    surface: e.need.surface != nil, before: e.need.before, beforeSurface: e.need.beforeSurface != nil,
                    wakeAtS: e.need.wakeAtS
                )
            )
        }
    }
}

private let traceIndices: [Int] = (try? Fixtures.list("cooks.json", "traces").count).map { Array(0..<$0) } ?? []

@Suite("Cooks")
struct CooksConformance {
    @Test("the traces are all there")
    func counted() throws {
        let traces = try Fixtures.list("cooks.json", "traces")
        #expect(traces.count >= 4)
        #expect(traceIndices.count == traces.count)
    }

    @Test("every trace, step by step: the cooks, the tagged effects, the open eggs, the calibrations before wanted", arguments: traceIndices)
    func traces(_ index: Int) throws {
        var posteriors = [String: Calibration]()
        for p in try Fixtures.list("decide.json", "posteriors") {
            let name = try p.str("name")
            posteriors[name] = try Calibration(
                posterior: #require(posteriorsByName([p])[name]), eggsLogged: Int(p.num("eggsLogged"))
            )
        }
        let trace = try Fixtures.list("cooks.json", "traces")[index]
        let note = try trace.str("note")
        let calibration = try #require(posteriors[trace.str("posterior")])
        let before = try #require(posteriors[trace.str("before")])
        let app = try trace.value(AppName.self, "app")
        var surfaces: [CookSurface] = []
        var befores: [Double: CookBefore] = [:]
        var q = Cooks.none
        func env(_ q: Cooks) -> CooksEnv {
            CooksEnv(
                calibration: calibration, surfaces: surfaces, app: app, appVersion: "0.5.0-alpha.1",
                prior: literaturePopulation.id, day: "2026-10-07",
                at: cooksWaiting(q).map { CookAt(idMs: $0.cook.idMs, before: befores[$0.cook.idMs], day: "2026-10-07") }
            )
        }
        var clock: Double?
        for (i, s) in try trace.rows("steps").enumerated() {
            let what = "\(note), step \(i)"
            let out: CooksStep
            let now: Double
            if s["event"] != nil {
                let event = try decoded(CookEvent.self, s["event"])
                now = event.nowS
                out = cooksStep(q, event, env(q))
            } else if let restore = s["restore"] as? [String: Any] {
                now = try restore.num("now_s")
                let screen = try #require(q.screen.cook, "\(what): nothing to restore")
                surfaces = []
                befores = [:]
                out = cooksRestore(.none, CookStored(cook: screen, leanHintS: q.screen.leanHintS), nowS: now, env(q))
            } else {
                let land = try #require(s["land"] as? [String: Any], "\(what): no event, restore or land")
                now = try land.num("now_s")
                let waiting = cooksWaiting(q)
                for landed in land["landed"] as? [[String: Any]] ?? [] {
                    let id = try landed.num("id_ms")
                    let need = try #require(waiting.first { $0.cook.idMs == id }?.need, "\(what): no cook \(id) waits")
                    switch try landed.str("on") {
                    case "now":
                        let inputs = try #require(need.surface, "\(what): no surface was needed")
                        let grid = try doseGrid(landed["grid"], egg: inputs.egg, setup: inputs.setup)
                        surfaces.append(CookSurface(inputs: inputs, grid: grid, profile: nil))
                    case "calibrationBefore":
                        #expect(need.before, "\(what): the calibration before was not needed")
                        befores[id] = CookBefore(calibration: before, surfaces: [])
                    case "before":
                        let inputs = try #require(need.beforeSurface, "\(what): no surface before was needed")
                        let grid = try doseGrid(landed["grid"], egg: inputs.egg, setup: inputs.setup)
                        befores[id]?.surfaces.append(CookSurface(inputs: inputs, grid: grid, profile: nil))
                    default:
                        Issue.record("\(what): landed what?")
                    }
                }
                out = cooksLanded(q, nowS: now, env(q))
            }
            if clock == nil { clock = now }
            q = out.cooks
            let made = CooksRow(
                cooks: Summary(q, nowS: now), effects: out.effects, openEggs: openEggs(q, nowS: now),
                beforeWanted: beforeWanted(q)
            )
            var expected = s
            for input in ["event", "restore", "land"] { expected[input] = nil }
            expectJSON(made, expected, what, clockFrom: clock)
        }
    }
}
