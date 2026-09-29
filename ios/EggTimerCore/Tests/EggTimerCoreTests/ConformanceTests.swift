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
/// The tolerance, and why it is 1e-12, is `conformanceTolerance` in Support.swift.

@Suite("Constants match the reference implementation")
struct ConstantsConformance {
    @Test("every constant the fixtures carry")
    func constants() throws {
        try expectClose(Double(Constants.modeCount), Fixtures.constant("MODE_COUNT"), "MODE_COUNT")
        try expectClose(Constants.alphaDefault, Fixtures.constant("ALPHA_DEFAULT"), "ALPHA_DEFAULT")
        try expectClose(Constants.alphaRelSD, Fixtures.constant("ALPHA_REL_SD"), "ALPHA_REL_SD")
        try expectClose(Constants.yolkRadiusFrac, Fixtures.constant("YOLK_RADIUS_FRAC"), "YOLK_RADIUS_FRAC")
        try expectClose(Constants.zYolk, Fixtures.constant("Z_YOLK"), "Z_YOLK")
        try expectClose(Constants.tRefYolkC, Fixtures.constant("TREF_YOLK_C"), "TREF_YOLK_C")
        try expectClose(Constants.zWhite, Fixtures.constant("Z_WHITE"), "Z_WHITE")
        try expectClose(Constants.tRefWhiteC, Fixtures.constant("TREF_WHITE_C"), "TREF_WHITE_C")
        try expectClose(Constants.hEff, Fixtures.constant("H_EFF"), "H_EFF")
        try expectClose(Constants.kEgg, Fixtures.constant("K_EGG"), "K_EGG")
        try expectClose(Constants.rampR, Fixtures.constant("RAMP_R"), "RAMP_R")
        try expectClose(Constants.tauStandingScale, Fixtures.constant("TAU_STANDING_SCALE"), "TAU_STANDING_SCALE")
        try expectClose(Constants.tauStandingRefS, Fixtures.constant("TAU_STANDING_REF_S"), "TAU_STANDING_REF_S")
        try expectClose(Constants.standingRefLitres, Fixtures.constant("STANDING_REF_LITRES"), "STANDING_REF_LITRES")
        try expectClose(
            Constants.standingVolumeExponent, Fixtures.constant("STANDING_VOLUME_EXPONENT"),
            "STANDING_VOLUME_EXPONENT"
        )
        try expectClose(Constants.tauAir, Fixtures.constant("TAU_AIR"), "TAU_AIR")
        try expectClose(Constants.tIceBathC, Fixtures.constant("T_ICE_BATH_C"), "T_ICE_BATH_C")
        try expectClose(Constants.tColdTapC, Fixtures.constant("T_COLD_TAP_C"), "T_COLD_TAP_C")
        try expectClose(Constants.tRoomC, Fixtures.constant("T_ROOM_C"), "T_ROOM_C")
        try expectClose(Constants.tauPlunge, Fixtures.constant("TAU_PLUNGE"), "TAU_PLUNGE")
        try expectClose(Constants.tauDipRecovery, Fixtures.constant("TAU_DIP_RECOVERY"), "TAU_DIP_RECOVERY")
        try expectClose(Constants.cWater, Fixtures.constant("C_WATER"), "C_WATER")
        try expectClose(Constants.cEgg, Fixtures.constant("C_EGG"), "C_EGG")
        try expectClose(Constants.rhoEgg, Fixtures.constant("RHO_EGG"), "RHO_EGG")
        try expectClose(Constants.eggVolumeCoeff, Fixtures.constant("EGG_VOLUME_COEFF"), "EGG_VOLUME_COEFF")
        try expectClose(Constants.eggLengthRatio, Fixtures.constant("EGG_LENGTH_RATIO"), "EGG_LENGTH_RATIO")
        try expectClose(Constants.dtSim, Fixtures.constant("DT_SIM"), "DT_SIM")
        try expectClose(Constants.carryoverWindow, Fixtures.constant("CARRYOVER_WINDOW"), "CARRYOVER_WINDOW")
    }
}

@Suite("Sphere")
struct SphereConformance {
    @Test("eigenfunction series")
    func seriesTheta() throws {
        for c in try Fixtures.cases("sphere", "seriesTheta") {
            try expectClose(
                Sphere.seriesTheta(x: c.num("x"), fourier: c.num("fourier")), c.num("value"),
                "seriesTheta(x: \(c.num("x")), Fo: \(c.num("fourier")))"
            )
        }
    }

    @Test("complementary error function")
    func erfc() throws {
        for c in try Fixtures.cases("sphere", "erfc") {
            try expectClose(Sphere.complementaryError(c.num("x")), c.num("value"), "erfc(\(c.num("x")))")
        }
    }

    @Test("integrator against a held surface")
    func stepResponse() throws {
        var sphere = SphereState(
            radiusM: 0.0238, alphaM2s: Constants.alphaDefault, initialC: 4.0, surfaceC: 100.0
        )
        for c in try Fixtures.cases("sphere", "stepResponse") {
            sphere.step(dtS: 10.0, nextSurfaceC: 100.0)
            let at = try "t = \(c.num("t_s")) s"
            try expectClose(sphere.centreTemperature, c.num("centre_C"), "centre, \(at)")
            try expectClose(
                sphere.temperature(atX: Constants.yolkRadiusFrac), c.num("yolkBoundary_C"),
                "yolk boundary, \(at)"
            )
            try expectClose(sphere.meanTemperature, c.num("mean_C"), "mean, \(at)")
        }
    }

    @Test("integrator against a moving surface")
    func rampResponse() throws {
        // The case the Duhamel coupling exists for. A step-only test would not
        // catch a sign error in the drive term.
        var sphere = SphereState(
            radiusM: 0.0238, alphaM2s: Constants.alphaDefault, initialC: 4.0, surfaceC: 20.0
        )
        for c in try Fixtures.cases("sphere", "rampResponse") {
            try sphere.step(dtS: 15.0, nextSurfaceC: c.num("surface_C"))
            let at = try "t = \(c.num("t_s")) s"
            try expectClose(sphere.centreTemperature, c.num("centre_C"), "centre, \(at)")
            try expectClose(sphere.meanTemperature, c.num("mean_C"), "mean, \(at)")
        }
    }
}

@Suite("Geometry")
struct GeometryConformance {
    @Test("from mass")
    func fromMass() throws {
        for c in try Fixtures.cases("geometry", "fromMass") {
            let egg = try Geometry.eggFromMass(c.num("mass_g") / 1000.0)
            let at = try "\(c.num("mass_g")) g"
            try expectClose(egg.radiusM, c.num("radius_m"), "radius, \(at)")
            try expectClose(egg.minorDiameterM, c.num("minorDiameter_m"), "minor diameter, \(at)")
            try expectClose(egg.volumeM3, c.num("volume_m3"), "volume, \(at)")
        }
    }

}

@Suite("Thermo")
struct ThermoConformance {
    @Test("pressure against altitude")
    func pressure() throws {
        for c in try Fixtures.cases("thermo", "pressureAtAltitude") {
            try expectClose(
                Thermo.pressureAtAltitude(c.num("altitude_m")), c.num("value"),
                "pressure at \(c.num("altitude_m")) m"
            )
        }
    }

    @Test("boiling point against altitude and pressure")
    func boiling() throws {
        for c in try Fixtures.cases("thermo", "boilingPointAtAltitude") {
            try expectClose(
                Thermo.boilingPointAtAltitude(c.num("altitude_m")), c.num("value"),
                "boiling point at \(c.num("altitude_m")) m"
            )
        }
        for c in try Fixtures.cases("thermo", "boilingPointAtPressure") {
            try expectClose(
                Thermo.boilingPointAtPressure(c.num("pressure_Pa")), c.num("value"),
                "boiling point at \(c.num("pressure_Pa")) Pa"
            )
        }
    }
}

@Suite("Kinetics")
struct KineticsConformance {
    @Test("hold time for a dose")
    func holdTime() throws {
        for c in try Fixtures.cases("kinetics", "holdTimeForDose") {
            let dose = try Dose(zK: c.num("z_K"), trefC: c.num("tref_C"))
            try expectClose(
                dose.holdTime(doseMinutes: c.num("doseMinutes"), heldC: c.num("held_C")),
                c.num("value"), "hold at \(c.num("held_C")) C"
            )
        }
    }

    @Test("dose accumulates the same way")
    func accumulation() throws {
        var dose = Dose(zK: Constants.zYolk, trefC: Constants.tRefYolkC)
        for c in try Fixtures.cases("kinetics", "accumulateDose") {
            try dose.accumulate(temperatureC: c.num("temperature_C"), dtS: c.num("dt_s"))
            try expectClose(dose.minutes, c.num("minutes"), "dose after step \(c.num("step"))")
        }
    }
}
