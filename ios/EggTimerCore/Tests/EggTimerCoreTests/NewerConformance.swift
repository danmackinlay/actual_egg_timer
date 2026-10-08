import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/newer.json`, generated from
/// `src/core/newer.ts`: which build may write (DECISIONS.md 100). The two
/// apps must order versions alike, or one would guard against a build the
/// other thinks is older.

@Suite("Which build may write, as the reference implementation decides")
struct NewerConformance {
    @Test("versions parse, and what is not one does not")
    func parse() throws {
        for c in try Fixtures.list("newer.json", "parse") {
            let text = try c.str("text")
            let got = parseVersion(text)
            if let want = c["version"] as? [String: Any] {
                let v = try #require(got, "parseVersion(\(text))")
                #expect(try v.major == Int(want.num("major")), "\(text)")
                #expect(try v.minor == Int(want.num("minor")), "\(text)")
                #expect(try v.patch == Int(want.num("patch")), "\(text)")
                #expect(v.pre == want["pre"] as? [String], "\(text)")
            } else {
                #expect(got == nil, "parseVersion(\(text))")
            }
        }
    }

    @Test("every pair of versions orders the same")
    func compare() throws {
        let rows = try Fixtures.list("newer.json", "compare")
        #expect(rows.count >= 100)
        for c in rows {
            let a = try c.str("a")
            let b = try c.str("b")
            let want = (c["order"] as? NSNumber).map { $0.intValue }
            #expect(compareVersions(a, b) == want, "\(a) against \(b)")
        }
    }

    @Test("the verdict on a stored mark")
    func check() throws {
        for c in try Fixtures.list("newer.json", "check") {
            let mark = c["mark"] as? String
            let mine = try c.str("mine")
            #expect(try writerCheck(mark, mine).rawValue == c.str("verdict"), "\(String(describing: mark)) against \(mine)")
        }
    }
}
