import Foundation
import EggTimerCore

/// The share queue's state (INFERENCE.md section 7): what a phone that
/// shares keeps beside its log, how each thing the cook does or the server
/// answers moves it, and how a stored copy is read and written. `Sharing`
/// holds it, writes it through and runs the sends, whose requests go through
/// a `ShareTransport` (the app's `ShareNetwork`); what the server takes and
/// what its answers mean is core's (`Share.swift`).
/// The web keeps the same state alike (`src/ui/shareState.ts`), whose
/// comment says what each field is for.
///
/// No I/O, no clock, no randomness: a new id and the time are the caller's,
/// passed in. Every time is epoch s; `sharing.v1` keeps `busySince` as
/// seconds since 2001 (`storedShare`, `readStoredShare`).

public struct ShareState: Sendable, Equatable {
    public var on: Bool
    public var uid: String?
    public var sent: Int
    public var seq: Int
    public var uids: [String]
    public var deleting: [String]
    public var busy: Int
    public var busySinceS: Double?

    public init(
        on: Bool = false, uid: String? = nil, sent: Int = 0, seq: Int = firstSeq, uids: [String] = [],
        deleting: [String] = [], busy: Int = 0, busySinceS: Double? = nil
    ) {
        self.on = on
        self.uid = uid
        self.sent = sent
        self.seq = seq
        self.uids = uids
        self.deleting = deleting
        self.busy = busy
        self.busySinceS = busySinceS
    }

    public static let fresh = ShareState()

    /// The state as the web's `shareState.ts` has it, for
    /// JSONSerialization: an absent value is JSON's null, so that
    /// `readShareState` gives back the same state.
    var jsonObject: [String: Any] {
        [
            "on": on, "uid": uid ?? NSNull(), "sent": sent, "seq": seq, "uids": uids,
            "deleting": deleting, "busy": busy, "busySince_s": busySinceS ?? NSNull(),
        ]
    }
}

/// How long a step waits on busy answers before it gives up: a result is
/// then passed over, as if refused, and an attestation, or a signature the
/// phone could not make, given up for the id, which then sends open - as a
/// phone that lost its key does. So nothing waits for good.
///
/// Both bounds must be met. Three days outlasts the outages that pass - a
/// deploy gone wrong, a provider's bad day, Apple's service down - including
/// one that waits a weekend for the owner to fix it. Five busy answers, each
/// from its own run, keep a phone opened once in a while from giving up on
/// the first busy answer after days asleep. Only busy answers count (no
/// answer does not), and the count starts again for each result.
let shareWaitTries = 5
let shareWaitS = 3.0 * 24 * 60 * 60

/// Whether a step that has had `tries` busy answers, the first `waitedS` ago,
/// stops waiting. A negative wait is a clock set back since: the tries alone
/// decide.
public func shareGivesUp(tries: Int, waitedS: Double) -> Bool {
    tries >= shareWaitTries && (waitedS >= shareWaitS || waitedS < 0)
}

// MARK: - Reads

/// Whether a value JSONSerialization gave is JSON's true or false, which
/// bridges to Bool as the numbers 0 and 1 do too.
private func isJSONBool(_ v: Any?) -> Bool {
    guard let n = v as? NSNumber else { return false }
    return CFGetTypeID(n) == CFBooleanGetTypeID()
}

/// A JSON number that is not a boolean, or nil.
private func jsonNumber(_ v: Any?) -> Double? {
    guard !isJSONBool(v), let n = v as? NSNumber else { return nil }
    return n.doubleValue
}

private func count(_ v: Any?) -> Int {
    guard let d = jsonNumber(v), d >= 0, let i = Int(exactly: d) else { return 0 }
    return i
}

private func ids(_ v: Any?) -> [String] {
    var out: [String] = []
    guard let list = v as? [Any] else { return out }
    for x in list {
        if let s = x as? String, isUid(s) { out.append(s) }
    }
    return out
}

/// A stored state, parsed from its JSON (`busySince_s` in epoch s), and read
/// defensively: anything damaged reads as off, and every id that can be read
/// is kept, so a deletion can still reach it. Without an id there is nothing
/// sent to count.
func readShareState(_ raw: Any?) -> ShareState {
    guard let r = raw as? [String: Any] else { return .fresh }
    let uid = (r["uid"] as? String).flatMap { isUid($0) ? $0 : nil }
    var uids = ids(r["uids"])
    if let uid, !uids.contains(uid) { uids.append(uid) }
    let on = isJSONBool(r["on"]) && (r["on"] as? NSNumber)?.boolValue == true
    let since = jsonNumber(r["busySince_s"])
    return ShareState(
        on: on && uid != nil,
        uid: uid,
        sent: uid == nil ? 0 : count(r["sent"]),
        seq: uid == nil ? firstSeq : count(r["seq"]),
        uids: uids,
        deleting: ids(r["deleting"]),
        busy: uid == nil ? 0 : count(r["busy"]),
        busySinceS: uid != nil && since?.isFinite == true ? since : nil
    )
}

// MARK: - Transitions

/// Sharing turned on: `fresh`, a newly made id, becomes the cook's if there
/// is none; otherwise it is not used.
public func turnedOn(_ s: ShareState, fresh: String) -> ShareState {
    var next = s
    next.on = true
    if s.uid == nil {
        next.uid = fresh
        next.sent = 0
        next.seq = firstSeq
        next.uids.append(fresh)
        next.busy = 0
        next.busySinceS = nil
    }
    return next
}

/// Sharing turned off: nothing is deleted; that is the other button.
public func turnedOff(_ s: ShareState) -> ShareState {
    var next = s
    next.on = false
    return next
}

/// The cook forgot everything: the log is empty, and the next egg is a new
/// cook's, under `fresh`, a newly made id, if sharing is on, and under one
/// made when it is turned on if not. The old id stays in `uids` for deletion.
public func forgotten(_ s: ShareState, fresh: String) -> ShareState {
    var next = s
    next.sent = 0
    next.seq = firstSeq
    next.busy = 0
    next.busySinceS = nil
    if s.on {
        next.uid = fresh
        next.uids.append(fresh)
    } else {
        next.uid = nil
    }
    return next
}

/// "Delete what I've sent": sharing goes off, every id this device has used
/// is to be deleted, and none is kept.
public func deletionAsked(_ s: ShareState) -> ShareState {
    var deleting = s.deleting
    for uid in s.uids where !deleting.contains(uid) { deleting.append(uid) }
    return ShareState(deleting: deleting)
}

/// A log shorter than what was sent, or one that no longer holds the egg
/// waiting on a busy answer, has been dropped and begun again (a damaged
/// log): what it holds now is new. The waiting egg was sent at `seq`, and the
/// server may have kept it there, so the new log's first egg goes at the
/// number after; the server takes a gap.
public func reconciled(_ s: ShareState, logLength: Int) -> ShareState {
    guard s.sent > logLength || (s.busy > 0 && s.sent >= logLength) else { return s }
    var next = s
    next.sent = 0
    if s.busy > 0 { next.seq = nextSeq(s.seq) }
    next.busy = 0
    next.busySinceS = nil
    return next
}

/// The index in the log of the next egg to send, or nil when there is none
/// to send: sharing off, no id, or every final egg gone. `finalCount` is how
/// many of the log's eggs are final: all, unless the last is the egg on
/// screen, whose answers may still come.
public func nextToSend(_ s: ShareState, finalCount: Int, logLength: Int) -> Int? {
    let final = min(finalCount, logLength)
    guard s.on, s.uid != nil, s.sent < final else { return nil }
    return s.sent
}

public struct ShareAnswered: Sendable, Equatable {
    public let next: ShareState
    /// Whether the cursor moved on, so the run goes on to the next egg.
    public let moved: Bool
}

/// The egg at the cursor answered `status`: whether the cursor moves on, and
/// the state with it. Kept or refused, it does; busy, it waits - counted,
/// unless it has waited long enough, when it is passed over as if refused, so
/// that one egg cannot hold up the rest for good. No answer at all is not an
/// answer: the caller leaves the state as it is. `nowS` is epoch s.
public func answered(_ s: ShareState, status: Int, nowS: Double) -> ShareAnswered {
    var next = s
    if shareReply(status) == .busy {
        let since = s.busySinceS ?? nowS
        let busy = s.busy + 1
        if !shareGivesUp(tries: busy, waitedS: nowS - since) {
            next.busy = busy
            next.busySinceS = since
            return ShareAnswered(next: next, moved: false)
        }
    }
    next.sent += 1
    next.seq = nextSeq(s.seq)
    next.busy = 0
    next.busySinceS = nil
    return ShareAnswered(next: next, moved: true)
}

/// The server confirmed `uid` deleted: it is no longer asked for.
public func deletionConfirmed(_ s: ShareState, uid: String) -> ShareState {
    var next = s
    next.deleting.removeAll { $0 == uid }
    return next
}

// MARK: - Kept

/// What is kept, as `sharing.v1` holds it: the web's JSON, but
/// with `busySince` a `Date` as JSONEncoder wrote one (seconds since 2001),
/// where the state counts epoch s, and with no key for an absent value.
public func storedShare(_ s: ShareState) -> Data? {
    var o = s.jsonObject.filter { !($0.value is NSNull) }
    o["busySince_s"] = nil
    if let since = s.busySinceS { o["busySince"] = since - Date.timeIntervalBetween1970AndReferenceDate }
    return try? JSONSerialization.data(withJSONObject: o)
}

/// What `sharing.v1` holds, read back by `readShareState`, which keeps every
/// id it can from a damaged copy, so a deletion still pending is not lost
/// with the rest.
public func readStoredShare(_ data: Data?) -> ShareState {
    let raw = data.flatMap { try? JSONSerialization.jsonObject(with: $0) }
    guard var o = raw as? [String: Any] else { return readShareState(raw) }
    // A number moved to epoch s; anything else left for the reader to refuse.
    let since = o.removeValue(forKey: "busySince")
    let number = (since as? NSNumber).flatMap { CFGetTypeID($0) == CFBooleanGetTypeID() ? nil : $0.doubleValue }
    o["busySince_s"] = number.map { $0 + Date.timeIntervalBetween1970AndReferenceDate } ?? since
    return readShareState(o)
}
