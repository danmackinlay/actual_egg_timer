import Testing
import Foundation
@testable import EggTimerCore

/// The egg in cross-section, against `fixtures/section.json`: the rings, and a
/// cook carried forward tick by tick - every ring's dose, temperature and how
/// set, the moment out and what the egg was as it left - in the water, out of
/// it, and in each thing it cools in.
@Suite("Section")
struct SectionConformance {
    @Test("the rings: where each sample is, which is yolk, and each outer edge")
    func rings() throws {
        let file = try Fixtures.load("section.json")
        let samples = try file.object("samples")
        #expect(try Double(Section.yolkSamples) == samples.num("yolk"))
        #expect(try Double(Section.whiteSamples) == samples.num("white"))
        let rings = try file.object("rings")
        let section = EggSection(
            egg: Geometry.eggFromMass(0.060), setup: try cookSetup(file.rows("cases")[0].object("setup")),
            params: .default
        )
        let x = try rings.numbers("x")
        let outer = try rings.numbers("outer")
        let yolk = try #require(rings["yolk"] as? [Bool], "rings.yolk")
        #expect(section.x.count == x.count)
        #expect(section.yolk == yolk)
        for i in 0..<x.count {
            expectClose(section.x[i], x[i], "x[\(i)]")
            expectClose(section.outer[i], outer[i], "outer[\(i)]")
        }
    }

    @Test("a cook, tick by tick")
    func ticks() throws {
        let file = try Fixtures.load("section.json")
        let egg = try Geometry.eggFromMass(file.object("egg").num("mass_kg"))
        let paramsJSON = try file.object("params")
        let params = try ModelParams(
            alphaM2s: paramsJSON.num("alpha_m2s"), tauAirScale: paramsJSON.num("tauAirScale")
        )
        let targets = try file.numbers("whiteTargets")
        for c in try file.rows("cases") {
            let name = try c.str("name")
            let setup = try cookSetup(c.object("setup"))
            var section = EggSection(egg: egg, setup: setup, params: params)
            for tick in try c.rows("ticks") {
                let at = "\(name) at \(try tick.num("to_s")) s"
                section.advance(
                    egg: egg, setup: setup, params: params,
                    toS: try tick.num("to_s"), outAtS: try tick.optionalNum("givenOut_s")
                )
                expectClose(section.tS, try tick.num("t_s"), "t, \(at)")
                let out = try tick.optionalNum("outAt_s")
                #expect((section.outAtS == nil) == (out == nil), "out or not, \(at)")
                if let out, let swiftOut = section.outAtS { expectClose(swiftOut, out, "out at, \(at)") }
                expectClose(section.waterAtPullC, try tick.num("waterAtPull_C"), "water at pull, \(at)")
                expectClose(section.sphere.surfaceC, try tick.num("surface_C"), "surface, \(at)")
                let dose = try tick.numbers("dose_min")
                for i in 0..<dose.count {
                    expectClose(section.dose[i].minutes, dose[i], "dose[\(i)], \(at)")
                }
                let views = try tick.rows("views")
                #expect(views.count == targets.count)
                for (k, target) in targets.enumerated() {
                    let view = section.view(whiteTargetMin: target)
                    let temperature = try views[k].numbers("temperature_C")
                    let set = try views[k].numbers("set")
                    for i in 0..<temperature.count {
                        expectClose(view.temperatureC[i], temperature[i], "temperature[\(i)], \(at)")
                        expectClose(view.set[i], set[i], "set[\(i)] against \(target), \(at)")
                    }
                }
            }
        }
    }

    @Test("the egg the settings aim for, as eaten")
    func previews() throws {
        let file = try Fixtures.load("section.json")
        let egg = try Geometry.eggFromMass(file.object("egg").num("mass_kg"))
        let paramsJSON = try file.object("params")
        let params = try ModelParams(
            alphaM2s: paramsJSON.num("alpha_m2s"), tauAirScale: paramsJSON.num("tauAirScale")
        )
        let rows = try file.rows("previews")
        #expect(rows.count >= 4)
        for p in rows {
            let name = try p.str("name")
            let view = try previewSection(
                egg: egg, setup: cookSetup(p.object("setup")), params: params, cookTimeS: p.num("cookTime_s"),
                whiteTargetMin: p.num("whiteTarget_min")
            )
            let temperature = try p.numbers("temperature_C")
            let set = try p.numbers("set")
            #expect(view.temperatureC.count == temperature.count, "\(name)")
            for i in 0..<temperature.count {
                expectClose(view.temperatureC[i], temperature[i], "\(name): temperature[\(i)]")
                expectClose(view.set[i], set[i], "\(name): set[\(i)]")
            }
        }
    }
}
