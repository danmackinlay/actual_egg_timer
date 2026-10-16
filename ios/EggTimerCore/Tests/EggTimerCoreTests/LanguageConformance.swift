import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/language.json`, generated from
/// `src/core/language.ts`: the switch into the English of 1750, which
/// tags are 1750, and the record's register.
///
/// The two apps must agree move for move, or a cook who flips units on the web
/// and on the phone ends up reading different Englishes for the same reason.

/// A state as the fixture writes it: JSON, with null for nil.
private func state(_ raw: Any?) throws -> LanguageState {
    let object = try #require(raw as? [String: Any], "not a language state: \(String(describing: raw))")
    return LanguageState(chosen: object["chosen"] as? String)
}

@Suite("The English of 1750 switches as the reference implementation does")
struct LanguageConformance {
    @Test("which tags are 1750, which are modern English, and the register")
    func tags() throws {
        for c in try Fixtures.list("language.json", "tags") {
            let tag = try c.str("tag")
            #expect(try isPeriod(tag) == c.flag("isPeriod"), "isPeriod(\(tag))")
            #expect(try isModernEnglish(tag) == c.flag("isModernEnglish"), "isModernEnglish(\(tag))")
            #expect(try registerOf(tag) == c.str("register"), "registerOf(\(tag))")
        }
    }

    @Test("every move from every reachable state")
    func transitions() throws {
        let rows = try Fixtures.list("language.json", "transitions")
        #expect(rows.count >= 20)
        for c in rows {
            let before = try state(c["state"])
            let move = try c.object("move")
            let after: LanguageState
            if move["flip"] is String {
                after = try languageAfterFlip(before, move.value(UnitsFlip.self, "flip"))
            } else {
                after = try languageAfterPick(before, move.str("pick"))
            }
            #expect(try after == state(c["next"]), "\(before) then \(move)")
            #expect(try effectiveLanguage(after) == c.str("effective"), "\(before) then \(move)")
        }
    }
}
