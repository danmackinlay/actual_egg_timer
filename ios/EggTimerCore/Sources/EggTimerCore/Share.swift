import Foundation

/// The twin of `src/core/share.ts`, held to it by `fixtures/share.json`; the
/// TypeScript's comments say what each part is for. App Attest is the iOS
/// app's alone, and not here.

private let hexDigits = Array("0123456789abcdef".utf8)

/// The TypeScript's pattern, written out: lower-case hex digits in groups of
/// 8, 4, 4, 4 and 12, the version digit 4, and a variant digit of 8, 9, a or b.
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

public func nextSeq(_ seq: Int) -> Int {
    seq + 1
}

// MARK: - The server's answers

public enum ShareReply: String, Sendable {
    case kept, busy, refused
}

public func shareReply(_ status: Int) -> ShareReply {
    if status == 200 || status == 201 { return .kept }
    if [403, 404, 408, 429].contains(status) || (500...599).contains(status) { return .busy }
    return .refused
}

public func deletionDone(_ status: Int) -> Bool {
    status == 200 || status == 400
}
