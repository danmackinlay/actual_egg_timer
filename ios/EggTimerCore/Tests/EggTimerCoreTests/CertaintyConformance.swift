import Testing
import Foundation
@testable import EggTimerCore

/// How sure the timer is, in words, against `fixtures/certainty.json`: the
/// word asked at every slider position, the class and the interval from
/// spreads written to hit every edge, and the whole reading from real
/// posteriors at the time decided. The surface and three posteriors are
/// decide.json's; the fourth is outcome.json's.

private func expectWords(_ w: WordCertainty, _ json: [String: Any], _ label: String) throws {
    #expect(try w.asked == Int(json.num("asked")), "\(label) asked")
    #expect(try w.certainty.rawValue == json.str("certainty"), "\(label) certainty")
    try expectClose(w.pAsked, json.num("pAsked"), "\(label) pAsked")
    try expectClose(w.pNear, json.num("pNear"), "\(label) pNear")
    #expect(try w.from == Int(json.num("from")), "\(label) from")
    #expect(try w.to == Int(json.num("to")), "\(label) to")
    try expectClose(w.pInterval, json.num("pInterval"), "\(label) pInterval")
    #expect(try w.mostLikely == Int(json.num("mostLikely")), "\(label) most likely")
}

@Suite("Certainty")
struct CertaintyConformance {
    @Test("the constants")
    func constants() throws {
        let c = try Fixtures.object("certainty.json", "constants")
        #expect(try certaintyMass == c.num("certaintyMass"))
        #expect(try timeRangeLowQ == c.num("timeRangeLowQ"))
        #expect(try timeRangeHighQ == c.num("timeRangeHighQ"))
    }

    @Test("the word asked, at every slider position and where the word changes")
    func asked() throws {
        for row in try Fixtures.list("certainty.json", "asked") {
            let level = try row.num("level")
            #expect(try askedWord(level) == Int(row.num("asked")), "level \(level)")
        }
    }

    @Test("the class, the interval and the most likely word, at every edge")
    func spreads() throws {
        for row in try Fixtures.list("certainty.json", "spreads") {
            let w = try wordCertainty(row.numbers("p"), asked: Int(row.num("asked")))
            try expectWords(w, row.object("words"), try row.str("note"))
        }
    }

    @Test("the reading at the time decided, from four posteriors")
    func readings() throws {
        let g = try Fixtures.object("decide.json", "grid")
        let grid = try doseGrid(
            g, egg: Geometry.eggFromMass(g.object("egg").num("mass_kg")), setup: cookSetup(g.object("setup"))
        )
        var byName = try posteriorsByName(Fixtures.list("decide.json", "posteriors"))
        for (name, post) in try posteriorsByName(Fixtures.list("outcome.json", "posteriors")) {
            byName[name] = post
        }
        for (i, row) in try Fixtures.list("certainty.json", "cases").enumerated() {
            let post = try #require(byName[row.str("posterior")], "case \(i): no posterior")
            let label = try "case \(i) (\(row.str("note")))"
            let r = try certaintyAt(post, grid, row.num("cookTime_s"), level: row.num("level"))
            let expected = try row.object("reading")
            try expectWords(r.words, expected.object("words"), label)
            let time = try expected.object("time")
            try expectClose(r.time.lowS, time.num("low_s"), "\(label) time low")
            try expectClose(r.time.highS, time.num("high_s"), "\(label) time high")
        }
    }
}
