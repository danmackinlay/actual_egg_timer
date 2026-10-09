import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/share.json`, generated from
/// `src/core/share.ts`: sharing's state, read from storage and moved by what
/// the cook does and the server answers.
///
/// The two apps must agree move for move: a phone that read a damaged store
/// differently from the web lost its pending deletions (`80150cb`).

/// A state as the fixture writes it, field by field: not through
/// `readShareState`, which is under test.
private func state(_ raw: Any?) throws -> ShareState {
    let o = try #require(raw as? [String: Any], "not a sharing state: \(String(describing: raw))")
    return ShareState(
        on: try o.flag("on"),
        uid: try o.optionalStr("uid"),
        sent: Int(try o.num("sent")),
        seq: Int(try o.num("seq")),
        uids: try #require(o["uids"] as? [String]),
        deleting: try #require(o["deleting"] as? [String]),
        busy: Int(try o.num("busy")),
        busySince: try o.optionalNum("busySince")
    )
}

@Suite("Sharing's state moves as the reference implementation does")
struct ShareConformance {
    @Test("the fresh state, and which strings are an id")
    func ids() throws {
        let fixture = try Fixtures.load("share.json")
        #expect(try ShareState.fresh == state(fixture["fresh"]))
        for c in try Fixtures.list("share.json", "uids") {
            let uid = try c.str("uid")
            #expect(try isUid(uid) == c.flag("isUid"), "isUid(\(uid))")
        }
    }

    @Test("a stored state is read defensively, and what is written reads back")
    func reads() throws {
        for c in try Fixtures.list("share.json", "reads") {
            let raw: Any? = c["raw"] is NSNull ? nil : c["raw"]
            let read = readShareState(raw)
            #expect(try read == state(c["state"]), "read \(String(describing: raw))")
            let data = try JSONSerialization.data(withJSONObject: read.jsonObject)
            let back = try JSONSerialization.jsonObject(with: data)
            #expect(readShareState(back) == read, "round trip of \(read)")
        }
    }

    @Test("every move from every reachable state")
    func transitions() throws {
        let states = try Fixtures.list("share.json", "states").map { try state($0) }
        let rows = try Fixtures.list("share.json", "transitions")
        #expect(rows.count >= 300)
        for c in rows {
            let before = states[Int(try c.num("from"))]
            let expected = states[Int(try c.num("to"))]
            let move = try c.object("move")
            var after: ShareState
            var moved: Bool?
            if let fresh = move["turnOn"] as? String {
                after = turnedOn(before, fresh: fresh)
            } else if move["turnOff"] != nil {
                after = turnedOff(before)
            } else if let fresh = move["forget"] as? String {
                after = forgotten(before, fresh: fresh)
            } else if move["deleteAsked"] != nil {
                after = deletionAsked(before)
            } else if move["reconcile"] != nil {
                after = reconciled(before, logLength: Int(try move.num("reconcile")))
            } else if move["answer"] != nil {
                let r = answered(before, status: Int(try move.num("answer")), now: try move.num("now"))
                after = r.next
                moved = r.moved
            } else {
                after = deletionConfirmed(before, uid: try move.str("deleted"))
            }
            #expect(after == expected, "\(before) then \(move)")
            if c["moved"] != nil { #expect(try moved == c.flag("moved"), "\(before) then \(move)") }
        }
    }

    @Test("the next egg to send, and which answers end a deletion")
    func sending() throws {
        let states = try Fixtures.list("share.json", "states").map { try state($0) }
        for c in try Fixtures.list("share.json", "nextToSend") {
            let s = states[Int(try c.num("state"))]
            let at = nextToSend(s, finalCount: Int(try c.num("finalCount")), logLength: Int(try c.num("logLength")))
            #expect(try at.map(Double.init) == c.optionalNum("at"), "\(s) with \(c)")
        }
        for c in try Fixtures.list("share.json", "deletionDone") {
            #expect(try deletionDone(Int(c.num("status"))) == c.flag("done"))
        }
    }
}

@Suite("What a sharing sender makes of the endpoint's answer matches the reference implementation")
struct ShareReplyConformance {
    @Test("every status's reading, and the bounds on waiting")
    func cases() throws {
        let share = try Fixtures.object("share.json", "answers")
        #expect(Double(shareWaitTries) == (try share.num("waitTries")), "shareWaitTries")
        try expectClose(shareWaitS, share.num("wait_s"), "shareWaitS")
        for c in try share.rows("replies") {
            let status = Int(try c.num("status"))
            let want = try c.value(ShareReply.self, "reply")
            #expect(shareReply(status) == want, "shareReply(\(status))")
        }
        for c in try share.rows("givesUp") {
            let tries = Int(try c.num("tries"))
            let waitedS = try c.num("waited_s")
            #expect(
                shareGivesUp(tries: tries, waitedS: waitedS) == (try c.flag("givesUp")),
                "shareGivesUp(\(tries), \(waitedS))"
            )
        }
    }
}
