import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/texture.json`, generated from
/// `src/core/texture.ts`: the bands' edges, every boundary from both sides,
/// and the keys the texture note is said in.

@Suite("Texture bands match the reference implementation")
struct TextureConformance {
    @Test("the bands' edges")
    func edges() throws {
        let white = try Fixtures.object("texture.json", "whiteBandBelow_C")
        let yolk = try Fixtures.object("texture.json", "yolkBandBelow_C")
        #expect(try WhiteBandBelowC.justSet == white.num("justSet"))
        #expect(try WhiteBandBelowC.set == white.num("set"))
        #expect(try YolkBandBelowC.liquid == yolk.num("liquid"))
        #expect(try YolkBandBelowC.soft == yolk.num("soft"))
        #expect(try YolkBandBelowC.jammy == yolk.num("jammy"))
        #expect(try YolkBandBelowC.fudgy == yolk.num("fudgy"))
    }

    @Test("every band boundary, from both sides, and a white that never sets")
    func cases() throws {
        var runny = 0
        for c in try Fixtures.list("texture.json", "cases") {
            let yolk = try c.num("peakYolk_C")
            let white = try c.num("peakWhite_C")
            let sets = try c.flag("whiteSets")
            let t = textureFor(peakYolkC: yolk, peakWhiteC: white, whiteSets: sets)
            #expect(try t.white.rawValue == c.str("white"), "white band at \(white) C, sets \(sets)")
            #expect(try t.yolk.rawValue == c.str("yolk"), "yolk band at \(yolk) C")
            let note = textureNoteKeys(t)
            #expect(try note.key == c.str("noteKey"), "note at \(yolk) / \(white) C, sets \(sets)")
            #expect(note.parts["white"] == c["noteWhite"] as? String, "note's white at \(white) C")
            #expect(note.parts["yolk"] == c["noteYolk"] as? String, "note's yolk at \(yolk) C")
            if !sets { runny += 1 }
        }
        // The case the fixture exists for: without it, this suite would pass
        // on a port that never says "runny" at all.
        #expect(runny > 0, "the fixture has no white that never sets")
    }

    /// Not "white just set": the peak is on the lowest rung of the temperature
    /// scale, but the dose never gets there.
    @Test("a white the pan never sets is runny, not just set")
    func runnyWhite() {
        let t = textureFor(peakYolkC: 48, peakWhiteC: 51, whiteSets: false)
        #expect(t.white == .runny)
        #expect(textureNoteKeys(t) == TextureNote(key: "texture.white.runny", parts: [:]))
    }
}
