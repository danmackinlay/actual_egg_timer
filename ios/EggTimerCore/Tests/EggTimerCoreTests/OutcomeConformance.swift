import Testing
import Foundation
@testable import EggTimerCore

/// The predicted outcome at the chosen time, against `fixtures/outcome.json`:
/// the three yolk answers, a runny white, the level range and the lean. The
/// surface and three of the posteriors are decide.json's; a fourth, a cook
/// whose three jammy eggs were all just right, is outcome.json's own.
@Suite("Outcome")
struct OutcomeConformance {
    @Test("the answers, the level range and the lean, from four posteriors")
    func outcomes() throws {
        let file = try Fixtures.load("outcome.json")
        let grid = try decideGrid()
        var byName = try posteriorsByName(Fixtures.list("decide.json", "posteriors"))
        for (name, post) in try posteriorsByName(file.rows("posteriors")) { byName[name] = post }
        for (i, row) in try file.rows("cases").enumerated() {
            let post = try #require(byName[row.str("posterior")], "case \(i): no posterior")
            let target = try row.num("logNominalTarget")
            for at in try row.rows("at") {
                let t = try at.num("t")
                try expectJSON(predictOutcome(post, grid, t, target), at["outcome"], "case \(i) (\(row.str("note"))) at \(t)")
            }
        }
    }

    @Test("the lean, at the ratio's edge")
    func leans() throws {
        for row in try Fixtures.list("outcome.json", "leans") {
            let lean = try leanOf(row.num("pTooSoft"), row.num("pTooFirm"))
            #expect(try lean.rawValue == row.str("lean"), "\(row)")
        }
    }
}
