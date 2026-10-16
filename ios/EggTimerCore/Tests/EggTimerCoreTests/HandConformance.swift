import Testing
import Foundation
@testable import EggTimerCore

/// The correction in hand against `fixtures/hand.json`, generated from
/// `src/core/hand.ts`: each sequence replayed event by event, timers and all,
/// and what each event made held whole; the choices a commit of each group
/// makes, the cook the aimed-for egg is planned on, and the start's steps.

/// A cook previewed as the fixture writes it: what the plan reads of it.
private struct PreviewRow: Encodable {
    let startedAtS: Double
    let choices: CookChoices
    let events: CookEvents
    let correctedAtS: Double?
    let logLength: Int

    enum CodingKeys: String, CodingKey {
        case startedAtS = "startedAt_s", choices, events, correctedAtS = "correctedAt_s", logLength
    }

    init(_ c: RunningCook) {
        startedAtS = c.startedAtS
        choices = c.choices
        events = c.events
        correctedAtS = c.correctedAtS
        logLength = c.log.count
    }
}

/// A step of the start as the fixture writes it.
private struct StartRow: Encodable {
    let startS: Double
    let limit: StartLimit?

    enum CodingKeys: String, CodingKey { case startS = "start_s", limit }
}

@Suite("Hand")
struct HandConformance {
    private func cooks() throws -> [String: RunningCook] {
        var byName = [String: RunningCook]()
        for c in try Fixtures.list("hand.json", "cooks") { byName[try c.str("name")] = try decoded(RunningCook.self, c["cook"]) }
        return byName
    }

    @Test("every sequence, event by event: the state, the commit, the aimed-for egg and the timers")
    func sequences() throws {
        let sequences = try Fixtures.list("hand.json", "sequences")
        #expect(sequences.count >= 15)
        for q in sequences {
            let note = try q.str("note")
            var state = nothingInHand()
            for (i, s) in try q.rows("steps").enumerated() {
                let out = handStep(state, try decoded(HandEvent.self, s["event"]))
                var expected = s
                expected["event"] = nil
                expectJSON(out, expected, "\(note), step \(i)")
                state = out.state
            }
        }
    }

    @Test("what a commit of each group makes of a cook, before the pull and after")
    func choices() throws {
        let cooks = try cooks()
        let said = try decoded(CookChoices.self, Fixtures.node("hand.json", "said"))
        for c in try Fixtures.list("hand.json", "choices") {
            let cook = try #require(cooks[c.str("cook")])
            let group = try c.value(HandGroup.self, "group")
            let made = handChoices(cook, said: said, group: group)
            expectJSON(made, c["choices"], "\(try c.str("cook")), \(group)")
        }
    }

    @Test("the cook the aimed-for egg is planned on")
    func previews() throws {
        let cooks = try cooks()
        let said = try decoded(CookChoices.self, Fixtures.node("hand.json", "said"))
        for p in try Fixtures.list("hand.json", "previews") {
            let cook = try #require(cooks[p.str("cook")])
            let group = try p.value(HandGroup.self, "group")
            let made = previewCook(cook, said: said, group: group, startS: try p.num("start_s"), nowS: try p.num("now_s"))
            expectJSON(PreviewRow(made), p["preview"], "\(try p.str("cook")), \(group)", clockFrom: cook.startedAtS)
        }
    }

    @Test("the start's − and +, to each of the cook's limits")
    func starts() throws {
        let cooks = try cooks()
        for s in try Fixtures.list("hand.json", "starts") {
            let cook = try #require(cooks[s.str("cook")])
            let made = startStepped(cook, fromS: try s.num("from_s"), up: try s.flag("up"), nowS: try s.num("now_s"))
            expectJSON(
                StartRow(startS: made.startS, limit: made.limit), ["start_s": s["start_s"] as Any, "limit": s["limit"] as Any],
                "\(try s.str("cook")) from \(try s.num("from_s"))", clockFrom: cook.startedAtS
            )
        }
    }
}
