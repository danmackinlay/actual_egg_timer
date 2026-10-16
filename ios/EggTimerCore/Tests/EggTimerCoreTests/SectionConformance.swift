import Testing
import Foundation
@testable import EggTimerCore

/// The egg in cross-section, against `fixtures/section.json`: a cook carried
/// forward tick by tick - the section whole at every tick, the sphere's modes,
/// the moment out, what the egg was as it left and every ring's dose, and the
/// view of it against two white targets - in the water, out of it, and in
/// each thing it cools in; and the egg the settings aim for.
@Suite("Section")
struct SectionConformance {
    @Test("a cook, tick by tick, from the rings it starts with")
    func ticks() throws {
        let file = try Fixtures.load("section.json")
        let egg = try decoded(Egg.self, file["egg"])
        let params = try decoded(ModelParams.self, file["params"])
        let targets = try file.numbers("whiteTargets")
        for c in try file.rows("cases") {
            let name = try c.str("name")
            let setup = try decoded(CookSetup.self, c["setup"])
            var section = EggSection(egg: egg, setup: setup, params: params)
            expectJSON(section, c["start"], "\(name) at the start")
            for tick in try c.rows("ticks") {
                let at = "\(name) at \(try tick.num("to_s")) s"
                section.advance(egg: egg, setup: setup, toS: try tick.num("to_s"), outAtS: try tick.optionalNum("givenOut_s"))
                expectJSON(section, tick["section"], at)
                expectJSON(targets.map { section.view(whiteTargetMin: $0) }, tick["views"], "\(at): the views")
            }
        }
    }

    @Test("the egg the settings aim for, as eaten")
    func previews() throws {
        let file = try Fixtures.load("section.json")
        let egg = try decoded(Egg.self, file["egg"])
        let params = try decoded(ModelParams.self, file["params"])
        let rows = try file.rows("previews")
        #expect(rows.count >= 4)
        for p in rows {
            let view = try previewSection(
                egg: egg, setup: decoded(CookSetup.self, p["setup"]), params: params, cookTimeS: p.num("cookTime_s"),
                whiteTargetMin: p.num("whiteTarget_min")
            )
            try expectJSON(view, p["view"], p.str("name"))
        }
    }
}
