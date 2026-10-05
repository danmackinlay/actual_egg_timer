import Testing
import Foundation
@testable import EggTimerCore

/// Which catalogue key each part of the screen says, against
/// `fixtures/wording.json` (src/core/wording.ts).
@Suite("Wording")
struct WordingConformance {
    @Test("the constants")
    func constants() throws {
        let c = try Fixtures.object("wording.json", "constants")
        #expect(try directionLikely == c.num("directionLikely"))
        #expect(try whiteRisk == c.num("whiteRisk"))
    }

    @Test("the warning line's key: a refusal, or low odds")
    func warning() throws {
        for row in try Fixtures.list("wording.json", "warning") {
            let kind = try row.value(RefusalKind.self, "kind")
            let worthSaying = try row.flag("worthSaying")
            let lowOdds = try row.flag("lowOdds")
            let cooling = try row.value(Cooling.self, "cooling")
            let v = Verdict(
                kind: kind, wanted: anchorNear(0.4), limit: anchorNear(0.6), snapTo: nil,
                worthSaying: worthSaying
            )
            let ref = warningKey(v, lowOdds: lowOdds, cooling: cooling)
            let label = "\(kind) \(worthSaying) \(lowOdds) \(cooling.rawValue)"
            #expect(try ref?.key == row.optionalStr("key"), "\(label) key")
            let args = (row["args"] as? [String: NSNumber])?.mapValues(\.doubleValue)
            #expect(ref?.args == args, "\(label) args")
        }
    }

    @Test("the outcome's direction, white line and range")
    func outcome() throws {
        for row in try Fixtures.list("wording.json", "outcome") {
            let lean = try row.value(Lean.self, "lean")
            let o = try Outcome(
                pTooSoft: 0, pJustRight: row.num("pJustRight"), pTooFirm: 0, pWhiteRunny: row.num("pWhiteRunny"),
                pWhiteTender: 1 - row.num("pWhiteRunny"), pWhiteFirm: 0,
                levelLow: row.num("levelLow"), levelMedian: row.num("levelLow"), levelHigh: row.num("levelHigh"),
                lean: lean
            )
            let label = "\(o.pJustRight) \(lean) \(o.pWhiteRunny)"
            #expect(try directionKey(o) == row.str("direction"), "\(label) direction")
            #expect(try whiteAtRisk(o) == row.flag("whiteAtRisk"), "\(label) white")
            let range = try row.object("range")
            let args = try #require(range["args"] as? [String: String], "range \(row)")
            let r = rangeWords(o)
            #expect(try r.key == range.str("key"), "\(label) range key")
            #expect(r.args == args, "\(label) range args")
        }
    }

    @Test("the readout's keys in every phase")
    func phase() throws {
        for row in try Fixtures.list("wording.json", "phase") {
            let k = try phaseKeys(PhaseFacts(
                phase: row.value(Phase.self, "phase"), startMode: row.value(StartMode.self, "startMode"),
                afterBoil: row.value(HeatAfterBoil.self, "afterBoil"), cooling: row.value(Cooling.self, "cooling"),
                whiteSets: row.flag("whiteSets"), boilKnown: row.flag("boilKnown"), probeWanted: row.flag("probeWanted")
            ))
            let expected = try PhaseKeys(
                label: row.str("label"), subline: row.str("subline"),
                action: row.optionalStr("action"), hint: row.optionalStr("hint")
            )
            #expect(k == expected, "\(row)")
        }
    }

    @Test("the setup sentence's keys")
    func clauses() throws {
        for row in try Fixtures.list("wording.json", "clauses") {
            let keys = try #require(row["keys"] as? [String: [String: Any]], "clause \(row)")
            let k = try clauseKeys(ClauseFacts(
                eggFrom: row.value(EggFrom.self, "eggFrom"), startMode: row.value(StartMode.self, "startMode"),
                sousVide: row.flag("sousVide"),
                afterBoil: row.value(HeatAfterBoil.self, "afterBoil"), cooling: row.value(Cooling.self, "cooling")
            ))
            #expect(k.count == keys.count)
            for clause in Clause.allCases {
                let e = try #require(keys[clause.rawValue], "no \(clause)")
                let expected = try ClauseKeys(text: e.str("text"), label: e.str("label"), value: e.optionalStr("value"))
                #expect(k[clause] == expected, "\(clause) in \(row)")
            }
        }
    }
}
