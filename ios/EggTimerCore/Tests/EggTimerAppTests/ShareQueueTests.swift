import Foundation
import Testing
@testable import EggTimerApp
import EggTimerCore

/// The share queue's state (ShareQueue.swift): read from `sharing.v1`
/// defensively and written back as it always was, moved by what the cook
/// does and the server answers, and never filing two eggs at one number
/// under one id. The web's is tested alike (test/share.test.ts).
@Suite("The share queue")
struct ShareQueueTests {
    let a = "11111111-1111-4111-8111-111111111111"
    let b = "22222222-2222-4222-8222-222222222222"

    func json(_ o: [String: Any]) -> Data { try! JSONSerialization.data(withJSONObject: o) }

    @Test func whatIsKeptIsReadDefensivelyAndEveryReadableIdKept() {
        #expect(readStoredShare(nil) == .fresh)
        #expect(readStoredShare(Data("not json".utf8)) == .fresh)
        #expect(readStoredShare(Data("[1]".utf8)) == .fresh)
        #expect(!readStoredShare(json(["on": true, "uid": "nobody"])).on, "on, with no id, is off")
        #expect(!readStoredShare(json(["on": 1, "uid": a])).on, "on must be true, not 1")
        let s = readStoredShare(json(["on": true, "uid": a, "sent": 3, "seq": -1, "uids": [b, "x", 7], "deleting": [b]]))
        #expect(s == ShareState(on: true, uid: a, sent: 3, seq: 0, uids: [b, a], deleting: [b]))
        let lost = readStoredShare(json(["on": false, "sent": 3, "seq": 4, "busy": 2, "uids": [a], "deleting": [a, b]]))
        #expect(lost == ShareState(uids: [a], deleting: [a, b]), "without an id, nothing sent to count")
        let damaged = readStoredShare(json(["on": true, "uid": a, "busy": "x", "busySince": "y"]))
        #expect(damaged.busy == 0 && damaged.busySinceS == nil)
    }

    /// `busySince` as seconds since 2001, as JSONEncoder wrote a `Date`, and
    /// no key for an absent value; read back to the same state.
    @Test func whatIsWrittenIsWhatWasAlwaysStoredAndReadsBack() throws {
        var s = turnedOn(.fresh, fresh: a)
        (s.sent, s.seq, s.busy, s.busySinceS) = (2, 3, 1, 1_791_244_800.25)
        let data = try #require(storedShare(s))
        let o = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(Set(o.keys) == ["on", "uid", "sent", "seq", "uids", "deleting", "busy", "busySince"])
        #expect((o["busySince"] as? Double) == 1_791_244_800.25 - Date.timeIntervalBetween1970AndReferenceDate)
        #expect(readStoredShare(data) == s)
        let empty = try #require(storedShare(.fresh))
        let fresh = try #require(try JSONSerialization.jsonObject(with: empty) as? [String: Any])
        #expect(fresh["uid"] == nil && fresh["busySince"] == nil)
    }

    @Test func onOffForgetAndDeleteTheIdLivesAsLongAsTheLogItSends() {
        var s = turnedOn(.fresh, fresh: a)
        #expect(s.on && s.uid == a && s.uids == [a])
        (s.sent, s.seq) = (4, 4)
        s = turnedOn(turnedOff(s), fresh: b)
        #expect(s.uid == a && s.sent == 4 && s.seq == 4 && s.uids == [a], "off and on again: the same cook")
        s = forgotten(s, fresh: b)
        #expect(s.on && s.uid == b && s.sent == 0 && s.seq == 0 && s.uids == [a, b], "a forget is a new cook")
        var off = turnedOff(s)
        off.sent = 2
        off = forgotten(off, fresh: a)
        #expect(off.uid == nil && off.sent == 0 && off.uids == [a, b], "off: the next id is made when it goes on")
        let gone = deletionAsked(s)
        #expect(gone == ShareState(deleting: [a, b]))
        var again = gone
        again.uids = [a]
        #expect(deletionAsked(again).deleting == [a, b], "no id asked for twice")
        #expect(deletionConfirmed(gone, uid: a).deleting == [b])
        var long = s
        long.sent = 5
        #expect(reconciled(long, logLength: 2).sent == 0 && reconciled(long, logLength: 2).seq == s.seq,
                "a dropped log begins again; its numbers carry on")
        long.sent = 2
        #expect(reconciled(long, logLength: 5) == long)
        var waiting = long
        waiting.busy = 1
        waiting.busySinceS = 1e9
        let passed = reconciled(waiting, logLength: 2)
        #expect(passed.sent == 0 && passed.seq == nextSeq(s.seq) && passed.busy == 0,
                "the egg waiting on a busy answer dropped with its log: its number is passed over")
        #expect(reconciled(waiting, logLength: 3) == waiting, "the waiting egg still in the log")
        let moved = [200, 201, 400, 409, 413, 415, 422, 403, 404, 429, 500, 503].map { answered(s, status: $0, nowS: 0).moved }
        #expect(moved == [true, true, true, true, true, true, true, false, false, false, false, false])
        #expect(nextToSend(s, finalCount: 3, logLength: 3) == 0)
        #expect(nextToSend(s, finalCount: 3, logLength: 0) == nil)
        #expect(nextToSend(turnedOff(s), finalCount: 3, logLength: 3) == nil)
        #expect(nextToSend(s, finalCount: 2, logLength: 3) == 0)
    }

    @Test func aBusyServerIsWaitedOnCountedAndGivenUpOnAfterFiveAnswersAndThreeDays() {
        let day = 24.0 * 3600
        var s = turnedOn(.fresh, fresh: a)
        (s.sent, s.seq) = (2, 7)
        let at = [0, 1, 2, 2.9, 3.5].map { 1e9 + $0 * day }
        for now in at.prefix(4) {
            let r = answered(s, status: 503, nowS: now)
            #expect(!r.moved)
            s = r.next
        }
        #expect(s.sent == 2 && s.seq == 7 && s.busy == 4 && s.busySinceS == 1e9, "counted from the first")
        let after = answered(s, status: 429, nowS: at[4])
        #expect(after.moved, "the fifth, three days on: passed over")
        #expect(after.next.sent == 3 && after.next.seq == 8 && after.next.busy == 0 && after.next.busySinceS == nil)
        var soon = s
        soon.busySinceS = at[4] - day
        #expect(!answered(soon, status: 500, nowS: at[4]).moved, "four, then a fifth only a day on")
        #expect(shareGivesUp(tries: shareWaitTries, waitedS: shareWaitS))
        #expect(!shareGivesUp(tries: shareWaitTries - 1, waitedS: 10 * shareWaitS), "a phone opened once in days")
        #expect(!shareGivesUp(tries: 100, waitedS: shareWaitS - 1), "a busy afternoon is waited out")
        #expect(shareGivesUp(tries: shareWaitTries, waitedS: -60), "a clock set back: the tries decide")
        #expect(forgotten(s, fresh: b).busySinceS == nil, "a new cook, a new count")
    }

    /// The server keeps the first egg at an id and number and drops any
    /// other sent there as a retry (core's `nextSeq`). A long walk through
    /// every move - eggs logged, sharing on and off, a forget, a deletion, a
    /// damaged log dropped, every kind of answer, a relaunch - posting each
    /// egg the queue offers, and noting which egg went at each id and
    /// number. An egg is its log's (`gen`, bumped when the log is emptied or
    /// dropped) and its place. A log is dropped between eggs or while one
    /// waits on a busy answer, whose number the server may have kept.
    @Test func noNumberIsUsedForASecondEggUnderOneId() {
        #expect(firstSeq == 0 && nextSeq(41) == 42)
        var draw = SplitMix(seed: 20_261_015)
        var made = 0
        func freshUid() -> String {
            made += 1
            return String(format: "%08x-0000-4000-8000-000000000000", made)
        }
        var s = ShareState.fresh
        var gen = 0
        var logLength = 0
        var now = 1e9
        var filed: [String: String] = [:]
        var posts = 0
        for _ in 0..<20000 {
            let u = draw.next()
            if u < 0.2 {
                logLength += 1
            } else if u < 0.25 {
                s = draw.next() < 0.5 ? turnedOn(s, fresh: freshUid()) : turnedOff(s)
            } else if u < 0.27 {
                s = forgotten(s, fresh: freshUid())
                gen += 1
                logLength = 0
            } else if u < 0.29 {
                s = deletionAsked(s)
                if let first = s.deleting.first, draw.next() < 0.5 { s = deletionConfirmed(s, uid: first) }
            } else if u < 0.31 {
                // A damaged log, dropped and begun again with what came
                // after. A relaunch reads a dropped log as empty, so while an
                // egg waits the new one is no longer than the egg in flight.
                gen += 1
                logLength = Int(draw.next() * 3)
                if s.busy > 0 { logLength = min(logLength, s.sent) }
                s = reconciled(s, logLength: logLength)
            } else if u < 0.33 {
                s = reconciled(readStoredShare(storedShare(s)), logLength: logLength)
            } else {
                let final = draw.next() < 0.8 ? logLength : max(0, logLength - 1)
                guard let at = nextToSend(s, finalCount: final, logLength: logLength), let uid = s.uid else { continue }
                let egg = "\(gen):\(at)"
                let key = "\(uid)/\(s.seq)"
                #expect(filed[key] == nil || filed[key] == egg, "\(key): egg \(egg), where egg \(filed[key] ?? "") went")
                filed[key] = egg
                posts += 1
                let status = [201, 200, 400, 409, 503, 429, 404][Int(draw.next() * 7)]
                now += draw.next() < 0.5 ? 60 : 2 * 24 * 3600
                s = answered(s, status: status, nowS: now).next
            }
        }
        #expect(posts > 2000 && filed.count > 1000, "\(posts) posts, \(filed.count) eggs filed")
    }
}
