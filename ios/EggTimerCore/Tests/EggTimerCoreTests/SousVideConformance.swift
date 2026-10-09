import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/sousvide.json`, generated from
/// `src/core/sousvide.ts`.
///
/// This module was the last thing in `src/core/` with no port, on the grounds
/// recorded in `ios/README.md` that it was "a joke and can wait forever". It is
/// not a joke - it is the same dose machinery as every other answer in this app
/// with the surface temperature held constant, and the caveats in its doc
/// comment are the careful part. What made it look like one is that the answer
/// it gives for a 58 C bath is a start time in the past, which is the module
/// reporting a real conclusion rather than declining to work.
///
/// Same rule as the rest of the port: the fixtures are never regenerated to
/// make this pass. If a NUMBER is wrong it is wrong in the TypeScript first,
/// and `npm test` is what should catch it.

@Suite("The isothermal limit matches the reference implementation")
struct SousVideConformance {
    @Test("the bath the app offers is the same bath")
    func bath() throws {
        try expectClose(sousVideBathC, Fixtures.number("sousvide.json", "bath_C"), "sousVideBathC")
        try expectClose(sousVideModelFloorC, Fixtures.number("sousvide.json", "modelFloor_C"), "sousVideModelFloorC")
    }

    /// The bisection is the only iteration in this module, and the fixture
    /// carries its answer with the R^2/alpha scaling divided out - so a bracket
    /// a port narrowed, or a comparison it flipped, fails here on a bare number
    /// instead of hiding inside an egg-sized time.
    @Test("the Fourier number the bisection converges on")
    func fourierNumber() throws {
        try expectClose(
            equilibrationTime(radiusM: 1.0, alphaM2s: 1.0),
            Fixtures.number("sousvide.json", "fourierNumber"),
            "equilibrationTime(1 m, 1 m^2/s)"
        )
    }

    /// Every output of every case: the equilibration, both holds, the total and
    /// - the one the app actually puts a sentence on - which hold binds.
    ///
    /// The dose targets come from the fixture rather than from
    /// `donenessFromSlider` here on purpose. The slider is already pinned by
    /// `fixtures/slider.json`, and reading it again would make a failure in that
    /// mapping surface as a sous-vide failure as well.
    @Test("equilibration, both hold times, the total and which one binds")
    func cases() throws {
        for c in try Fixtures.list("sousvide.json", "cases") {
            let est = try sousVideEstimate(
                radiusM: c.num("radius_m"),
                alphaM2s: c.num("alpha_m2s"),
                bathC: c.num("bath_C"),
                yolkDoseMin: c.num("yolkDose_min"),
                whiteDoseMin: c.num("whiteDose_min")
            )
            let what = try "\(c.str("what")): \(c.num("mass_g")) g,"
                + " alpha \(c.num("alpha_m2s")), \(c.num("bath_C")) C,"
                + " level \(c.num("level"))"

            try expectClose(est.bathC, c.num("bath_C"), "\(what) bathC")
            try expectClose(est.equilibrateS, c.num("equilibrate_s"), "\(what) equilibrateS")
            try expectClose(est.yolkHoldS, c.num("yolkHold_s"), "\(what) yolkHoldS")
            try expectClose(est.whiteHoldS, c.num("whiteHold_s"), "\(what) whiteHoldS")
            try expectClose(est.totalS, c.num("total_s"), "\(what) totalS")
            let whiteBound = try c.flag("whiteBound")
            #expect(
                est.whiteBound == whiteBound,
                "\(what) whiteBound: expected \(whiteBound), got \(est.whiteBound)"
            )
        }
    }

    /// The equilibration is the only output that depends on the egg, and the
    /// only one that depends on alpha. Stated as a property rather than left
    /// implicit in the case list, because it is what lets the sous-vide readout
    /// ignore the pan entirely: nothing about the bath's answer moves when the
    /// water volume, the altitude or the hob does.
    @Test("the holds depend on the bath and the targets, and on nothing else")
    func holdsIgnoreTheEgg() {
        let doneness = donenessFromSlider(0.41)
        let small = sousVideEstimate(
            radiusM: 0.020, alphaM2s: 1.2e-7, bathC: sousVideBathC,
            yolkDoseMin: doneness.yolkDoseMin, whiteDoseMin: doneness.whiteDoseMin
        )
        let large = sousVideEstimate(
            radiusM: 0.027, alphaM2s: 2.4e-7, bathC: sousVideBathC,
            yolkDoseMin: doneness.yolkDoseMin, whiteDoseMin: doneness.whiteDoseMin
        )
        expectClose(small.yolkHoldS, large.yolkHoldS, "yolk hold across eggs")
        expectClose(small.whiteHoldS, large.whiteHoldS, "white hold across eggs")
        #expect(small.equilibrateS != large.equilibrateS, "equilibration should move with the egg")
    }
}
