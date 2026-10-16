import Testing
import Foundation
@testable import EggTimerCore

/// How sure the timer is, in words, against `fixtures/certainty.json`: the
/// word asked at every slider position, each word's band on the slider, the
/// class, the interval and the bracket from spreads written to hit every
/// edge, and the whole reading and its bracket from real posteriors at the
/// time decided. The surface and three posteriors are decide.json's; the
/// fourth is outcome.json's.
@Suite("Certainty")
struct CertaintyConformance {
    @Test("the word asked, at every slider position and where the word changes")
    func asked() throws {
        for row in try Fixtures.list("certainty.json", "asked") {
            let level = try row.num("level")
            #expect(try askedWord(level) == Int(row.num("asked")), "level \(level)")
        }
    }

    @Test("each word's band on the slider")
    func bands() throws {
        for row in try Fixtures.list("certainty.json", "bands") {
            let k = try Int(row.num("word"))
            expectJSON(["word": Double(k), "low": wordBandLow(k), "high": wordBandHigh(k)], row, "word \(k)")
        }
    }

    @Test("the class, the interval, the most likely word and the bracket, at every edge")
    func spreads() throws {
        for row in try Fixtures.list("certainty.json", "spreads") {
            let w = try wordCertainty(row.numbers("p"), asked: Int(row.num("asked")))
            let note = try row.str("note")
            expectJSON(w, row["words"], note)
            expectJSON(wordBracket(w), row["bracket"], "\(note): the bracket")
        }
    }

    @Test("the reading at the time decided, from four posteriors")
    func readings() throws {
        let grid = try decideGrid()
        var byName = try posteriorsByName(Fixtures.list("decide.json", "posteriors"))
        for (name, post) in try posteriorsByName(Fixtures.list("outcome.json", "posteriors")) {
            byName[name] = post
        }
        for (i, row) in try Fixtures.list("certainty.json", "cases").enumerated() {
            let post = try #require(byName[row.str("posterior")], "case \(i): no posterior")
            let label = try "case \(i) (\(row.str("note")))"
            let r = try certaintyAt(post, grid, row.num("cookTime_s"), level: row.num("level"))
            expectJSON(r, row["reading"], label)
            expectJSON(wordBracket(r.words), row["bracket"], "\(label): the bracket")
        }
    }
}
