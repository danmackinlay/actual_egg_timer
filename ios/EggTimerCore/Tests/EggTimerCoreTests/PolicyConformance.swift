import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/policy.json`, generated from `src/core/policy.ts`.
///
/// This suite exists because the review found that everything it covers used to
/// live twice - here and in `src/ui/app.ts` - copied by hand. The apps had
/// already drifted: 4 eggs in the pan against 2, a 62.3 g default egg against
/// 68 g, and preset temperatures written out three separate times on this side.
/// The calibration grid had not drifted yet, which was luck rather than design:
/// its six numbers decide what the particle filter can see, so two apps with
/// different grids learn different things from the same egg.
///
/// Same rule as the rest of the port: the fixtures are never regenerated to
/// make this pass. If a NUMBER is wrong it is wrong in the TypeScript first,
/// and `npm test` is what should catch it.
private let tolerance = 1e-12

private func expectClose(
    _ actual: Double, _ expected: Double, _ what: String,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    let scale = max(abs(expected), 1.0)
    let error = abs(actual - expected) / scale
    #expect(
        error <= tolerance,
        "\(what): expected \(expected), got \(actual) (relative error \(error))",
        sourceLocation: sourceLocation
    )
}

@Suite("Snapping and the labels match the reference implementation")
struct SliderConformance {
    @Test("the slider grid is the same grid")
    func steps() {
        let slider = Fixtures.policyObject("slider")
        expectClose(sliderSteps, slider.num("steps"), "sliderSteps")
    }

    @Test("snapUp, snapDown, anchorNear and the target temperature, every case")
    func cases() {
        for c in Fixtures.policyCases("slider.cases") {
            let level = c.num("level")
            expectClose(snapUp(level), c.num("snapUp"), "snapUp(\(level))")
            expectClose(snapDown(level), c.num("snapDown"), "snapDown(\(level))")
            expectClose(
                targetPeakYolkC(level), c.num("targetPeakYolk_C"), "targetPeakYolkC(\(level))"
            )
            #expect(
                anchorNear(level).label == c.str("anchor"),
                "anchorNear(\(level)): expected \(c.str("anchor")), got \(anchorNear(level).label)"
            )
        }
    }
}

@Suite("The refusal verdict matches the reference implementation")
struct VerdictConformance {
    /// A Solution carrying only the fields the verdict reads. The fixture cases
    /// are synthetic for the same reason they are on the TypeScript side: the
    /// point is to pin the DECISION, not to re-test the solver, and a synthetic
    /// solution can sit exactly on boundaries a real one reaches by accident.
    private func solution(
        reachable: Bool, whiteSets: Bool, softestLevel: Double, hardestLevel: Double
    ) -> Solution {
        Solution(
            result: CookResult(
                cookTimeS: 0, peakYolkC: 0, peakYolkTimeS: 0, yolkAtPullC: 0,
                yolkDoseMin: 0, whiteDoseMin: 0, peakWhiteC: 0
            ),
            reachable: reachable,
            minCookTimeS: 0,
            softestLevel: softestLevel,
            hardestLevel: hardestLevel,
            whiteSets: whiteSets
        )
    }

    @Test("kind, labels, snap target and whether it is worth saying")
    func cases() {
        for c in Fixtures.policyCases("verdict") {
            let level = c.num("level")
            let sol = solution(
                reachable: c.flag("reachable"),
                whiteSets: c.flag("whiteSets"),
                softestLevel: c.num("softestLevel"),
                hardestLevel: c.num("hardestLevel")
            )
            let v = verdictFor(sol, level: level)
            let what = "verdict(level \(level), reachable \(c.flag("reachable")),"
                + " whiteSets \(c.flag("whiteSets")), softest \(c.num("softestLevel")),"
                + " hardest \(c.num("hardestLevel")))"

            #expect(v.kind.rawValue == c.str("kind"), "\(what) kind")
            #expect(v.wanted.label == c.str("wanted"), "\(what) wanted")
            #expect(v.limit.label == c.str("limit"), "\(what) limit")
            #expect(v.worthSaying == c.flag("worthSaying"), "\(what) worthSaying")

            switch (v.snapTo, c.optionalNum("snapTo")) {
            case (nil, nil):
                break
            case let (actual?, expected?):
                expectClose(actual, expected, "\(what) snapTo")
            case let (actual, expected):
                Issue.record("\(what) snapTo: expected \(String(describing: expected)), got \(String(describing: actual))")
            }
        }
    }
}

@Suite("Texture bands match the reference implementation")
struct TextureConformance {
    @Test("every band boundary, from both sides")
    func cases() {
        for c in Fixtures.policyCases("texture") {
            let yolk = c.num("peakYolk_C")
            let white = c.num("peakWhite_C")
            let t = textureFor(peakYolkC: yolk, peakWhiteC: white)
            #expect(t.white.rawValue == c.str("white"), "white band at \(white) C")
            #expect(t.yolk.rawValue == c.str("yolk"), "yolk band at \(yolk) C")
        }
    }
}

@Suite("The calibration grid matches the reference implementation")
struct CalibrationGridConformance {
    /// The one that matters most: these six numbers are handed to
    /// `buildDoseGrid`, so they decide what the filter can see and therefore
    /// what the posterior becomes.
    @Test("extent and resolution, including the floor on a short cook")
    func cases() {
        for c in Fixtures.policyCases("calibrationGrid") {
            let g = calibrationGrid(
                alphaCentre: c.num("alphaCentre"), cookTimeS: c.num("cookTime_s")
            )
            let what = "grid(alpha \(c.num("alphaCentre")), cook \(c.num("cookTime_s")))"
            expectClose(g.alphaMin, c.num("alphaMin"), "\(what) alphaMin")
            expectClose(g.alphaMax, c.num("alphaMax"), "\(what) alphaMax")
            expectClose(Double(g.alphaCount), c.num("alphaCount"), "\(what) alphaCount")
            expectClose(g.timeMinS, c.num("timeMin_s"), "\(what) timeMinS")
            expectClose(g.timeMaxS, c.num("timeMax_s"), "\(what) timeMaxS")
            expectClose(Double(g.timeCount), c.num("timeCount"), "\(what) timeCount")
        }
    }

    @Test("the particle count and seed are the same kitchen")
    func particles() {
        let calibration = Fixtures.policyObject("calibration")
        expectClose(Double(particleCount), calibration.num("particles"), "particleCount")
        expectClose(Double(calibrationSeed), calibration.num("seed"), "calibrationSeed")
    }
}

@Suite("Boil memory matches the reference implementation")
struct BoilMemoryConformance {
    @Test("a first measurement is whole, a second is blended")
    func blend() {
        let blend = Fixtures.policyCases("boilMemory.blend")
        let first = rememberBoil([:], litres: 2, seconds: blend[0].num("measured"))
        expectClose(estimateTimeToBoil(first, litres: 2), blend[0].num("result"), "first measurement")
        let second = rememberBoil(first, litres: 2, seconds: blend[1].num("measured"))
        expectClose(estimateTimeToBoil(second, litres: 2), blend[1].num("result"), "blended")
    }

    @Test("an incredible measurement is refused rather than remembered")
    func refused() {
        for c in Fixtures.policyCases("boilMemory.refused") {
            let memory = rememberBoil([:], litres: 2, seconds: c.num("seconds"))
            #expect(
                hasBoilMemory(memory) == c.flag("remembered"),
                "a \(c.num("seconds")) s tap should\(c.flag("remembered") ? "" : " not") be remembered"
            )
        }
    }

    /// The fixture remembers the same two pans in both orders. This Dictionary
    /// has no order of its own, which is exactly how the two apps could once
    /// give different answers for the same two equidistant pans.
    @Test("the nearest remembered volume does not depend on insertion order")
    func estimate() {
        let forward = rememberBoil(rememberBoil([:], litres: 1, seconds: 300), litres: 3, seconds: 900)
        let backward = rememberBoil(rememberBoil([:], litres: 3, seconds: 900), litres: 1, seconds: 300)
        for c in Fixtures.policyCases("boilMemory.estimate") {
            let litres = c.num("litres")
            expectClose(
                estimateTimeToBoil(forward, litres: litres), c.num("forward"),
                "estimate at \(litres) L, remembered small-first"
            )
            expectClose(
                estimateTimeToBoil(backward, litres: litres), c.num("backward"),
                "estimate at \(litres) L, remembered large-first"
            )
        }
    }

    @Test("the fallback is the same fallback")
    func fallback() {
        let memory = Fixtures.policyObject("boilMemory")
        expectClose(defaultTimeToBoilS, memory.num("defaultSeconds"), "defaultTimeToBoilS")
    }
}

@Suite("Defaults and bounds match the reference implementation")
struct DefaultsConformance {
    /// The drift the review actually caught: this app opened on 4 eggs of
    /// 62.3 g where the web opened on 2 of 68 g.
    @Test("a fresh install starts from the same kitchen")
    func defaults() {
        let d = Fixtures.policyObject("defaults")
        expectClose(Double(Defaults.sizeIndex), d.num("sizeIndex"), "sizeIndex")
        expectClose(Defaults.customMinorMM, d.num("customMinor_mm"), "customMinor_mm")
        expectClose(Defaults.customStartC, d.num("customStart_C"), "customStart_C")
        expectClose(Defaults.altitudeM, d.num("altitude_m"), "altitude_m")
        expectClose(Defaults.waterLitres, d.num("waterLitres"), "waterLitres")
        expectClose(Double(Defaults.eggCount), d.num("eggCount"), "eggCount")
        expectClose(Defaults.doneness, d.num("doneness"), "doneness")
        expectClose(Defaults.eggMassKg, d.num("eggMass_kg"), "eggMass_kg")
        expectClose(StartTempPresets.fridgeC, d.num("fridge_C"), "fridge preset")
        expectClose(StartTempPresets.roomC, d.num("room_C"), "room preset")
    }

    @Test("the room follows the egg at the same threshold")
    func ambient() {
        for c in Fixtures.policyCases("ambient") {
            let start = c.num("eggStart_C")
            expectClose(ambientFor(eggStartC: start), c.num("ambient_C"), "ambient for \(start) C")
        }
    }

    @Test("every bound is the same bound")
    func limits() {
        let limits = Fixtures.policyObject("limits")
        let pairs: [(String, ClosedRange<Double>)] = [
            ("mass_g", Limits.massG),
            ("girth_mm", Limits.girthMM),
            ("minor_mm", Limits.minorMM),
            ("eggTemp_C", Limits.eggTempC),
            ("altitude_m", Limits.altitudeM),
            ("waterLitres", Limits.waterLitres),
            ("eggCount", Limits.eggCount),
            ("doneness", Limits.doneness),
            ("timeToBoil_s", Limits.timeToBoilS),
        ]
        for (name, range) in pairs {
            guard let bounds = limits[name] as? [String: Any] else {
                Issue.record("fixtures/policy.json has no limit \(name)")
                continue
            }
            expectClose(range.lowerBound, bounds.num("lo"), "\(name) lower bound")
            expectClose(range.upperBound, bounds.num("hi"), "\(name) upper bound")
        }
    }
}
