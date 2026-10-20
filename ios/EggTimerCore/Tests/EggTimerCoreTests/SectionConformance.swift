import Testing
import Foundation
@testable import EggTimerCore

/// The egg in cross-section, against `fixtures/section.json`: a cook carried
/// forward tick by tick, and at every tick what is drawn of each ring - its
/// temperature, and how set against two white targets - in the water, out
/// of it, and in each thing it cools in; and the egg the settings aim for.
/// Where each ring is and which is yolk are the egg's, written once.

/// What a view draws of each ring, as the fixture writes it.
private struct Drawn: Encodable {
    let temperatureC: [Double]
    let set: [Double]

    enum CodingKeys: String, CodingKey {
        case temperatureC = "temperature_C", set
    }

    init(_ v: SectionView) {
        temperatureC = v.temperatureC
        set = v.set
    }
}

/// A tick's views, as the fixture writes them: the temperature once, and how
/// set against each white target.
private struct Tick: Encodable {
    let temperatureC: [Double]
    let set: [[Double]]

    enum CodingKeys: String, CodingKey {
        case temperatureC = "temperature_C", set
    }
}

/// The rings, as the fixture writes them.
private struct Rings: Encodable {
    let x: [Double]
    let yolk: [Bool]
    let outer: [Double]
}

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
            for tick in try c.rows("ticks") {
                let at = "\(name) at \(try tick.num("to_s")) s"
                section.advance(egg: egg, setup: setup, toS: try tick.num("to_s"), outAtS: try tick.optionalNum("givenOut_s"))
                let views = targets.map { section.view(whiteTargetMin: $0) }
                expectJSON(Rings(x: views[0].x, yolk: views[0].yolk, outer: views[0].outer), file["rings"], "\(at): the rings")
                expectJSON(Tick(temperatureC: views[0].temperatureC, set: views.map(\.set)), ["temperature_C": tick["temperature_C"] as Any, "set": tick["set"] as Any], at)
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
            expectJSON(Rings(x: view.x, yolk: view.yolk, outer: view.outer), file["rings"], "\(try p.str("name")): the rings")
            try expectJSON(Drawn(view), p["view"], p.str("name"))
        }
    }
}
