import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/share.json`, generated from
/// `src/core/share.ts`: sharing's contract with the server, which both apps
/// send to and read the answers of alike.
@Suite("Sharing's contract with the server is the reference implementation's")
struct ShareConformance {
    @Test("which strings are an id")
    func ids() throws {
        for c in try Fixtures.list("share.json", "uids") {
            let uid = try c.str("uid")
            #expect(try isUid(uid) == c.flag("isUid"), "isUid(\(uid))")
        }
    }

    @Test("the number each egg is filed under")
    func seq() throws {
        let seq = try Fixtures.object("share.json", "seq")
        for c in try seq.rows("next") {
            #expect(try Double(nextSeq(Int(c.num("seq")))) == c.num("next"), "\(c)")
        }
    }

    @Test("every status's reading, and which answers end a deletion")
    func answers() throws {
        for c in try Fixtures.list("share.json", "replies") {
            let status = Int(try c.num("status"))
            let want = try c.value(ShareReply.self, "reply")
            #expect(shareReply(status) == want, "shareReply(\(status))")
        }
        for c in try Fixtures.list("share.json", "deletionDone") {
            #expect(try deletionDone(Int(c.num("status"))) == c.flag("done"))
        }
    }
}
