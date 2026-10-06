import Foundation

/// Sharing's state (E6; INFERENCE.md section 7, COLLECTIVE.md section 1): what
/// a device that shares keeps beside its log, how each thing the cook does or
/// the server answers moves it, and how a stored copy is read.
///
/// Transliterated from `src/core/share.ts`, whose comment says what each
/// field is for, and held to it by `fixtures/share.json`. The app
/// (`Sharing.swift`) holds the state, writes it through and does the talking;
/// App Attest is the app's alone.
///
/// No I/O, no clock, no randomness: a new id and the time are the caller's,
/// passed in. `busySince` is epoch ms, as the web keeps it; the app converts
/// at its storage.

public struct ShareState: Sendable, Equatable {
    public var on: Bool
    public var uid: String?
    public var sent: Int
    public var seq: Int
    public var uids: [String]
    public var deleting: [String]
    public var busy: Int
    public var busySince: Double?

    public init(
        on: Bool = false, uid: String? = nil, sent: Int = 0, seq: Int = 0, uids: [String] = [],
        deleting: [String] = [], busy: Int = 0, busySince: Double? = nil
    ) {
        self.on = on
        self.uid = uid
        self.sent = sent
        self.seq = seq
        self.uids = uids
        self.deleting = deleting
        self.busy = busy
        self.busySince = busySince
    }

    public static let fresh = ShareState()

    /// The state as the web stores it, for JSONSerialization: an absent value
    /// is JSON's null, so that `readShareState` gives back the same state.
    public var jsonObject: [String: Any] {
        [
            "on": on, "uid": uid ?? NSNull(), "sent": sent, "seq": seq, "uids": uids,
            "deleting": deleting, "busy": busy, "busySince": busySince ?? NSNull(),
        ]
    }
}

private let hexDigits = Array("0123456789abcdef".utf8)

/// A cook's id as both apps make it and the server takes it: a version 4
/// UUID, in lower case. The web's pattern, written out: hex digits in groups
/// of 8, 4, 4, 4 and 12, the version digit 4, and a variant digit of 8, 9, a
/// or b.
public func isUid(_ s: String) -> Bool {
    let chars = Array(s.utf8)
    guard chars.count == 36 else { return false }
    for (i, c) in chars.enumerated() {
        switch i {
        case 8, 13, 18, 23: if c != UInt8(ascii: "-") { return false }
        case 14: if c != hexDigits[4] { return false }
        case 19: if !hexDigits[8...11].contains(c) { return false }
        default: if !hexDigits.contains(c) { return false }
        }
    }
    return true
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

/// A stored state, parsed from its JSON and read defensively: anything
/// damaged reads as off, and every id that can be read is kept, so a deletion
/// can still reach it. Without an id there is nothing sent to count.
public func readShareState(_ raw: Any?) -> ShareState {
    guard let r = raw as? [String: Any] else { return .fresh }
    let uid = (r["uid"] as? String).flatMap { isUid($0) ? $0 : nil }
    var uids = ids(r["uids"])
    if let uid, !uids.contains(uid) { uids.append(uid) }
    let on = isJSONBool(r["on"]) && (r["on"] as? NSNumber)?.boolValue == true
    let since = jsonNumber(r["busySince"])
    return ShareState(
        on: on && uid != nil,
        uid: uid,
        sent: uid == nil ? 0 : count(r["sent"]),
        seq: uid == nil ? 0 : count(r["seq"]),
        uids: uids,
        deleting: ids(r["deleting"]),
        busy: uid == nil ? 0 : count(r["busy"]),
        busySince: uid != nil && since?.isFinite == true ? since : nil
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
        next.seq = 0
        next.uids.append(fresh)
        next.busy = 0
        next.busySince = nil
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
    next.seq = 0
    next.busy = 0
    next.busySince = nil
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

/// A log shorter than what was sent has been dropped and begun again (a
/// damaged log): what it holds now is new.
public func reconciled(_ s: ShareState, logLength: Int) -> ShareState {
    guard s.sent > logLength else { return s }
    var next = s
    next.sent = 0
    next.busy = 0
    next.busySince = nil
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
/// answer: the caller leaves the state as it is. `now` is epoch ms.
public func answered(_ s: ShareState, status: Int, now: Double) -> ShareAnswered {
    var next = s
    if shareReply(status) == .busy {
        let since = s.busySince ?? now
        let busy = s.busy + 1
        if !shareGivesUp(tries: busy, waitedS: (now - since) / 1000) {
            next.busy = busy
            next.busySince = since
            return ShareAnswered(next: next, moved: false)
        }
    }
    next.sent += 1
    next.seq += 1
    next.busy = 0
    next.busySince = nil
    return ShareAnswered(next: next, moved: true)
}

/// Whether a deletion the server answered `status` is done: 200, or 400, an
/// id the server will never hold. Anything else is asked again.
public func deletionDone(_ status: Int) -> Bool {
    status == 200 || status == 400
}

/// The server confirmed `uid` deleted: it is no longer asked for.
public func deletionConfirmed(_ s: ShareState, uid: String) -> ShareState {
    var next = s
    next.deleting.removeAll { $0 == uid }
    return next
}
