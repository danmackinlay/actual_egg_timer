import Testing
import Foundation
@testable import EggTimerCore

/// The predicted outcome at the chosen time, against `fixtures/outcome.json`:
/// the three yolk answers, a runny white, the level range and the lean. The
/// surface and three of the posteriors are decide.json's; a fourth, a cook
/// whose three jammy eggs were all just right, is outcome.json's own.

private func decideGrid() throws -> DoseGrid {
    let g = try Fixtures.object("decide.json", "grid")
    return try doseGrid(
        g, egg: Geometry.eggFromMass(g.object("egg").num("mass_kg")), setup: cookSetup(g.object("setup"))
    )
}

@Suite("Outcome")
struct OutcomeConformance {
    @Test("the constants")
    func constants() throws {
        let c = try Fixtures.object("outcome.json", "constants")
        #expect(try leanRatio == c.num("leanRatio"))
        #expect(try levelLowQ == c.num("levelLowQ"))
        #expect(try levelHighQ == c.num("levelHighQ"))
    }

    @Test("the answers, the level range and the lean, from four posteriors")
    func outcomes() throws {
        let file = try Fixtures.load("outcome.json")
        let grid = try decideGrid()
        var byName = try posteriorsByName(Fixtures.list("decide.json", "posteriors"))
        for (name, post) in try posteriorsByName(file.rows("posteriors")) { byName[name] = post }
        for (i, row) in try file.rows("cases").enumerated() {
            let post = try #require(byName[row.str("posterior")], "case \(i): no posterior")
            let target = try row.num("logNominalTarget")
            let note = try row.str("note")
            for at in try row.rows("at") {
                let t = try at.num("t")
                let label = "case \(i) (\(note)) at \(t)"
                let o = predictOutcome(post, grid, t, target)
                let expected = try at.object("outcome")
                try expectClose(o.pTooSoft, expected.num("pTooSoft"), "\(label) too soft")
                try expectClose(o.pJustRight, expected.num("pJustRight"), "\(label) just right")
                try expectClose(o.pTooFirm, expected.num("pTooFirm"), "\(label) too firm")
                try expectClose(o.pWhiteRunny, expected.num("pWhiteRunny"), "\(label) runny")
                try expectClose(o.pWhiteTender, expected.num("pWhiteTender"), "\(label) tender")
                try expectClose(o.pWhiteFirm, expected.num("pWhiteFirm"), "\(label) white firm")
                try expectClose(o.levelLow, expected.num("levelLow"), "\(label) level low")
                try expectClose(o.levelMedian, expected.num("levelMedian"), "\(label) level median")
                try expectClose(o.levelHigh, expected.num("levelHigh"), "\(label) level high")
                #expect(try o.lean.rawValue == expected.str("lean"), "\(label) lean")
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
