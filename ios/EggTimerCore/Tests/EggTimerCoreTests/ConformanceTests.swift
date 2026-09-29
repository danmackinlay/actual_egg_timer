import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/core.json`, generated from the TypeScript
/// implementation in `src/core/`.
///
/// These are not unit tests. They are the statement that two implementations of
/// the same physics agree, to a tolerance tight enough that a transliteration
/// slip cannot hide in it. A failure here means the Swift is wrong - the
/// fixtures are never regenerated to make this pass. If a NUMBER is wrong, it is
/// wrong in the TypeScript first, and `npm test` is what should catch it.
///
/// Tolerance is relative and tight: 1e-12 is a few ulps of a double, which is
/// all that differing libm implementations of exp/sin/log10 can cost. An
/// algebraic mistake is never that small.
private let tolerance = 1e-12

private func expectClose(
    _ actual: Double, _ expected: Double, _ what: String,
    tolerance: Double = tolerance, sourceLocation: SourceLocation = #_sourceLocation
) {
    let scale = max(abs(expected), 1.0)
    let error = abs(actual - expected) / scale
    #expect(
        error <= tolerance,
        "\(what): expected \(expected), got \(actual) (relative error \(error))",
        sourceLocation: sourceLocation
    )
}

@Suite("Constants match the reference implementation")
struct ConstantsConformance {
    @Test("every constant the fixtures carry")
    func constants() {
        expectClose(Double(Constants.modeCount), Fixtures.constant("MODE_COUNT"), "MODE_COUNT")
        expectClose(Constants.alphaDefault, Fixtures.constant("ALPHA_DEFAULT"), "ALPHA_DEFAULT")
        expectClose(Constants.alphaRelSD, Fixtures.constant("ALPHA_REL_SD"), "ALPHA_REL_SD")
        expectClose(Constants.yolkRadiusFrac, Fixtures.constant("YOLK_RADIUS_FRAC"), "YOLK_RADIUS_FRAC")
        expectClose(Constants.zYolk, Fixtures.constant("Z_YOLK"), "Z_YOLK")
        expectClose(Constants.tRefYolkC, Fixtures.constant("TREF_YOLK_C"), "TREF_YOLK_C")
        expectClose(Constants.zWhite, Fixtures.constant("Z_WHITE"), "Z_WHITE")
        expectClose(Constants.tRefWhiteC, Fixtures.constant("TREF_WHITE_C"), "TREF_WHITE_C")
        expectClose(Constants.hEff, Fixtures.constant("H_EFF"), "H_EFF")
        expectClose(Constants.kEgg, Fixtures.constant("K_EGG"), "K_EGG")
        expectClose(Constants.rampR, Fixtures.constant("RAMP_R"), "RAMP_R")
        expectClose(Constants.tauStandingScale, Fixtures.constant("TAU_STANDING_SCALE"), "TAU_STANDING_SCALE")
        expectClose(Constants.tauStandingRefS, Fixtures.constant("TAU_STANDING_REF_S"), "TAU_STANDING_REF_S")
        expectClose(Constants.standingRefLitres, Fixtures.constant("STANDING_REF_LITRES"), "STANDING_REF_LITRES")
        expectClose(
            Constants.standingVolumeExponent, Fixtures.constant("STANDING_VOLUME_EXPONENT"),
            "STANDING_VOLUME_EXPONENT"
        )
        expectClose(Constants.tauAir, Fixtures.constant("TAU_AIR"), "TAU_AIR")
        expectClose(Constants.tIceBathC, Fixtures.constant("T_ICE_BATH_C"), "T_ICE_BATH_C")
        expectClose(Constants.tColdTapC, Fixtures.constant("T_COLD_TAP_C"), "T_COLD_TAP_C")
        expectClose(Constants.tRoomC, Fixtures.constant("T_ROOM_C"), "T_ROOM_C")
        expectClose(Constants.tauPlunge, Fixtures.constant("TAU_PLUNGE"), "TAU_PLUNGE")
        expectClose(Constants.tauDipRecovery, Fixtures.constant("TAU_DIP_RECOVERY"), "TAU_DIP_RECOVERY")
        expectClose(Constants.cWater, Fixtures.constant("C_WATER"), "C_WATER")
        expectClose(Constants.cEgg, Fixtures.constant("C_EGG"), "C_EGG")
        expectClose(Constants.rhoEgg, Fixtures.constant("RHO_EGG"), "RHO_EGG")
        expectClose(Constants.eggVolumeCoeff, Fixtures.constant("EGG_VOLUME_COEFF"), "EGG_VOLUME_COEFF")
        expectClose(Constants.eggLengthRatio, Fixtures.constant("EGG_LENGTH_RATIO"), "EGG_LENGTH_RATIO")
        expectClose(Constants.dtSim, Fixtures.constant("DT_SIM"), "DT_SIM")
        expectClose(Constants.carryoverWindow, Fixtures.constant("CARRYOVER_WINDOW"), "CARRYOVER_WINDOW")
    }
}

@Suite("Sphere")
struct SphereConformance {
    @Test("eigenfunction series")
    func seriesTheta() {
        for c in Fixtures.cases("sphere", "seriesTheta") {
            expectClose(
                Sphere.seriesTheta(x: c.num("x"), fourier: c.num("fourier")), c.num("value"),
                "seriesTheta(x: \(c.num("x")), Fo: \(c.num("fourier")))"
            )
        }
    }

    @Test("complementary error function")
    func erfc() {
        for c in Fixtures.cases("sphere", "erfc") {
            expectClose(Sphere.complementaryError(c.num("x")), c.num("value"), "erfc(\(c.num("x")))")
        }
    }

    @Test("integrator against a held surface")
    func stepResponse() {
        var sphere = SphereState(
            radiusM: 0.0238, alphaM2s: Constants.alphaDefault, initialC: 4.0, surfaceC: 100.0
        )
        for c in Fixtures.cases("sphere", "stepResponse") {
            sphere.step(dtS: 10.0, nextSurfaceC: 100.0)
            let at = "t = \(c.num("t_s")) s"
            expectClose(sphere.centreTemperature, c.num("centre_C"), "centre, \(at)")
            expectClose(
                sphere.temperature(atX: Constants.yolkRadiusFrac), c.num("yolkBoundary_C"),
                "yolk boundary, \(at)"
            )
            expectClose(sphere.meanTemperature, c.num("mean_C"), "mean, \(at)")
        }
    }

    @Test("integrator against a moving surface")
    func rampResponse() {
        // The case the Duhamel coupling exists for. A step-only test would not
        // catch a sign error in the drive term.
        var sphere = SphereState(
            radiusM: 0.0238, alphaM2s: Constants.alphaDefault, initialC: 4.0, surfaceC: 20.0
        )
        for c in Fixtures.cases("sphere", "rampResponse") {
            sphere.step(dtS: 15.0, nextSurfaceC: c.num("surface_C"))
            let at = "t = \(c.num("t_s")) s"
            expectClose(sphere.centreTemperature, c.num("centre_C"), "centre, \(at)")
            expectClose(sphere.meanTemperature, c.num("mean_C"), "mean, \(at)")
        }
    }
}

@Suite("Geometry")
struct GeometryConformance {
    @Test("from mass")
    func fromMass() {
        for c in Fixtures.cases("geometry", "fromMass") {
            let egg = Geometry.eggFromMass(c.num("mass_g") / 1000.0)
            let at = "\(c.num("mass_g")) g"
            expectClose(egg.radiusM, c.num("radius_m"), "radius, \(at)")
            expectClose(egg.minorDiameterM, c.num("minorDiameter_m"), "minor diameter, \(at)")
            expectClose(egg.volumeM3, c.num("volume_m3"), "volume, \(at)")
        }
    }

}

@Suite("Thermo")
struct ThermoConformance {
    @Test("pressure against altitude")
    func pressure() {
        for c in Fixtures.cases("thermo", "pressureAtAltitude") {
            expectClose(
                Thermo.pressureAtAltitude(c.num("altitude_m")), c.num("value"),
                "pressure at \(c.num("altitude_m")) m"
            )
        }
    }

    @Test("boiling point against altitude and pressure")
    func boiling() {
        for c in Fixtures.cases("thermo", "boilingPointAtAltitude") {
            expectClose(
                Thermo.boilingPointAtAltitude(c.num("altitude_m")), c.num("value"),
                "boiling point at \(c.num("altitude_m")) m"
            )
        }
        for c in Fixtures.cases("thermo", "boilingPointAtPressure") {
            expectClose(
                Thermo.boilingPointAtPressure(c.num("pressure_Pa")), c.num("value"),
                "boiling point at \(c.num("pressure_Pa")) Pa"
            )
        }
    }
}

@Suite("Kinetics")
struct KineticsConformance {
    @Test("hold time for a dose")
    func holdTimeForDose() {
        for c in Fixtures.cases("kinetics", "holdTimeForDose") {
            let dose = Dose(zK: c.num("z_K"), trefC: c.num("tref_C"))
            expectClose(
                dose.holdTimeForDose(doseMinutes: c.num("doseMinutes"), heldC: c.num("held_C")),
                c.num("value"), "hold at \(c.num("held_C")) C"
            )
        }
    }

    @Test("dose accumulates the same way")
    func accumulation() {
        var dose = Dose(zK: Constants.zYolk, trefC: Constants.tRefYolkC)
        for c in Fixtures.cases("kinetics", "accumulateDose") {
            dose.accumulate(temperatureC: c.num("temperature_C"), dtS: c.num("dt_s"))
            expectClose(dose.minutes, c.num("minutes"), "dose after step \(c.num("step"))")
        }
    }
}
