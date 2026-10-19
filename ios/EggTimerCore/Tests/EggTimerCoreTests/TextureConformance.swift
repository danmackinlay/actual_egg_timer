import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/texture.json`, generated from
/// `src/core/texture.ts`: every band boundary from both sides, and the keys
/// the texture note is said in.

@Suite("Texture bands match the reference implementation")
struct TextureConformance {
    @Test("every band boundary, from both sides, and a white that never sets")
    func cases() throws {
        var runny = 0
        for c in try Fixtures.list("texture.json", "cases") {
            let yolk = try c.num("yolkDose_min")
            let white = try c.num("peakWhite_C")
            let sets = try c.flag("whiteSets")
            let t = textureFor(yolkDoseMin: yolk, peakWhiteC: white, whiteSets: sets)
            expectJSON(t, c["texture"], "\(yolk) min / \(white) C, sets \(sets)")
            expectJSON(textureNoteKeys(t), c["note"], "the note at \(yolk) min / \(white) C, sets \(sets)")
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
        let t = textureFor(yolkDoseMin: 1e-4, peakWhiteC: 51, whiteSets: false)
        #expect(t.white == .runny)
        #expect(textureNoteKeys(t) == TextureNote(key: .`texture.white.runny`, parts: [:]))
    }
}
