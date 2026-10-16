import Foundation

/// Sharing's contract with the server (INFERENCE.md section 7): a cook's id
/// as the server takes it, the number each egg is filed under, what an
/// answer to a sent egg or an attestation means, and when a deletion is
/// done. Transliterated from `src/core/share.ts`, whose comment says why,
/// and held to it by `fixtures/share.json`.
///
/// The queue that sends the log and the state it keeps are the app's
/// (`ShareQueue.swift`, in EggTimerApp); App Attest is the app's alone.

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

// MARK: - The egg's number

/// The number the egg after one filed at `seq` goes under, the same id.
public func nextSeq(_ seq: Int) -> Int {
    seq + 1
}

// MARK: - The server's answers

/// What an answer from the collection endpoint means to the app that sent a
/// result or an attestation (`shareReply` in share.ts, whose comment has the
/// reasons): kept (200, 201); busy (403, 404, 408, 429, any 5xx - an answer
/// about the way to the server, not about what was sent), so wait and ask
/// again on a later run, within the app's bound; or refused for good
/// (anything else - 400, 409, 413, 415, 422, any other 4xx - an answer about
/// the request itself), so the result is passed over and an attestation
/// given up. No answer at all is the caller's: it waits, uncounted.
public enum ShareReply: String, Sendable {
    case kept, busy, refused
}

public func shareReply(_ status: Int) -> ShareReply {
    if status == 200 || status == 201 { return .kept }
    if [403, 404, 408, 429].contains(status) || (500...599).contains(status) { return .busy }
    return .refused
}

/// Whether a deletion the server answered `status` is done: 200, or 400, an
/// id the server will never hold. Anything else is asked again.
public func deletionDone(_ status: Int) -> Bool {
    status == 200 || status == 400
}
