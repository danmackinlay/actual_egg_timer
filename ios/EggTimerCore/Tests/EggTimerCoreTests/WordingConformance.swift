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

        #expect(try whiteRisk == c.num("whiteRisk"))
    }

    @Test("the warning line's key: a refusal, or a wild guess")
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

    @Test("the outcome's white line")
    func outcome() throws {
        for row in try Fixtures.list("wording.json", "outcome") {
            let o = try Outcome(
                pTooSoft: 0, pJustRight: 0, pTooFirm: 0, pWhiteRunny: row.num("pWhiteRunny"),
                pWhiteTender: 1 - row.num("pWhiteRunny"), pWhiteFirm: 0, pYolkWord: nil,
                levelLow: 0.2, levelMedian: 0.2, levelHigh: 0.7, lean: .balanced
            )
            #expect(try whiteAtRisk(o) == row.flag("whiteAtRisk"), "\(o.pWhiteRunny) white")
            let f = forecastOf(o, cookS: 400)
            #expect(try forecastWhiteAtRisk(f) == row.flag("forecastWhiteAtRisk"), "\(o.pWhiteRunny) as ran")
        }
    }

    @Test("the bracket in words: the certainty's interval")
    func range() throws {
        for row in try Fixtures.list("wording.json", "range") {
            let w = try wordCertainty(row.numbers("p"), asked: Int(row.num("asked")))
            let range = try row.object("range")
            let args = try #require(range["args"] as? [String: String], "range \(row)")
            let r = rangeWords(w)
            #expect(try r.key == range.str("key"), "\(w.from)-\(w.to) range key")
            #expect(r.args == args, "\(w.from)-\(w.to) range args")
        }
    }

    @Test("the line under the time, and what pressing it opens")
    func certainty() throws {
        let c = try Fixtures.object("wording.json", "certainty")
        for row in try c.rows("keys") {
            #expect(try certaintyKey(row.value(Certainty.self, "certainty")) == row.str("key"), "\(row)")
        }
        for row in try c.rows("words") {
            let p = try #require(row["p"] as? [NSNumber], "p in \(row)").map(\.doubleValue)
            let asked = try Int(row.num("asked"))
            let w = wordCertainty(p, asked: asked)
            let label = "\(p) asked \(asked)"
            #expect(try w.certainty.rawValue == row.str("certainty"), "\(label) class")
            #expect(try certaintyKey(w.certainty) == row.str("key"), "\(label) key")
            for (name, got) in [("interval", intervalWords(w)), ("mostLikely", mostLikelyWords(w))] {
                let e = try row.object(name)
                #expect(try got.key == e.str("key"), "\(label) \(name) key")
                let args = (e["args"] as? [String: NSNumber])?.mapValues(\.doubleValue) ?? [:]
                #expect(got.args == args, "\(label) \(name) args")
                #expect(got.words == (e["words"] as? [String: String]), "\(label) \(name) words")
            }
            #expect(try mostLikelyShown(w) == row.flag("mostLikelyShown"), "\(label) shown")
            #expect(try mostLikelyOpened(w) == row.flag("mostLikelyOpened"), "\(label) opened")
        }
    }

    @Test("the likely time range in the clock's own terms")
    func timeRange() throws {
        for row in try Fixtures.list("wording.json", "timeRange") {
            let note = try row.str("note")
            let t = try row.object("time")
            let p = try #require(row["p"] as? [NSNumber], "\(note): p").map(\.doubleValue)
            let sure = try CertaintyReading(
                words: wordCertainty(p, asked: Int(row.num("asked"))),
                time: TimeRange(lowS: t.num("low_s"), highS: t.num("high_s")), atS: row.num("at_s")
            )
            let running = row["running"] as? [String: Any]
            let w = try timeRangeWords(
                sure, startedAtS: running?.num("startedAt_s"), cookTimeS: running?.num("cookTime_s") ?? 0
            )
            let e = try row.object("words")
            #expect(try w.key == e.str("key"), "\(note): key")
            #expect(try w.lowS == e.num("low_s") && w.highS == e.num("high_s"), "\(note): \(w.lowS)-\(w.highS)")
            #expect(try w.ofDay == e.flag("ofDay"), "\(note): of day")
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
