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
        let fixture = try Fixtures.object("core.json", "constants")
        let swift: [(name: String, value: Double)] = [
            ("MODE_COUNT", Double(Constants.modeCount)),
            ("ALPHA_DEFAULT", Constants.alphaDefault),
            ("ALPHA_REL_SD", Constants.alphaRelSD),
            ("YOLK_RADIUS_FRAC", Constants.yolkRadiusFrac),
            ("Z_YOLK", Constants.zYolk),
            ("TREF_YOLK_C", Constants.tRefYolkC),
            ("Z_WHITE", Constants.zWhite),
            ("TREF_WHITE_C", Constants.tRefWhiteC),
            ("H_EFF", Constants.hEff),
            ("K_EGG", Constants.kEgg),
            ("RAMP_R", Constants.rampR),
            ("TAU_STANDING_SCALE", Constants.tauStandingScale),
            ("TAU_STANDING_REF_S", Constants.tauStandingRefS),
            ("STANDING_REF_LITRES", Constants.standingRefLitres),
            ("STANDING_VOLUME_EXPONENT", Constants.standingVolumeExponent),
            ("H_AIR", Constants.hAir),
            ("WET_SHELL_KG_M2", Constants.wetShellKgM2),
            ("LATENT_HEAT_WATER", Constants.latentHeatWater),
            ("T_ICE_BATH_C", Constants.tIceBathC),
            ("T_COLD_TAP_C", Constants.tColdTapC),
            ("T_ROOM_C", Constants.tRoomC),
            ("TAU_PLUNGE", Constants.tauPlunge),
            ("TAU_DIP_RECOVERY", Constants.tauDipRecovery),
            ("C_WATER", Constants.cWater),
            ("C_EGG", Constants.cEgg),
            ("RHO_EGG", Constants.rhoEgg),
            ("EGG_VOLUME_COEFF", Constants.eggVolumeCoeff),
            ("EGG_LENGTH_RATIO", Constants.eggLengthRatio),
            ("DT_SIM", Constants.dtSim),
            ("CARRYOVER_WINDOW", Constants.carryoverWindow),
        ]
        for constant in swift {
            try expectClose(constant.value, fixture.num(constant.name), constant.name)
        }
    }
}

@Suite("Sphere")
struct SphereConformance {
    @Test("eigenfunction series")
    func seriesTheta() throws {
        for c in try Fixtures.list("core.json", "sphere.seriesTheta") {
            try expectClose(
                Sphere.seriesTheta(x: c.num("x"), fourier: c.num("fourier")), c.num("value"),
                "seriesTheta(x: \(c.num("x")), Fo: \(c.num("fourier")))"
            )
        }
    }

    @Test("complementary error function")
    func erfc() throws {
        for c in try Fixtures.list("core.json", "sphere.erfc") {
            try expectClose(Sphere.complementaryError(c.num("x")), c.num("value"), "erfc(\(c.num("x")))")
        }
    }

    @Test("integrator against a held surface")
    func stepResponse() throws {
        var sphere = SphereState(
            radiusM: 0.0238, alphaM2s: Constants.alphaDefault, initialC: 4.0, surfaceC: 100.0
        )
        for c in try Fixtures.list("core.json", "sphere.stepResponse") {
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
        for c in try Fixtures.list("core.json", "sphere.rampResponse") {
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
        for c in try Fixtures.list("core.json", "geometry.fromMass") {
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
        for c in try Fixtures.list("core.json", "thermo.pressureAtAltitude") {
            try expectClose(
                Thermo.pressureAtAltitude(c.num("altitude_m")), c.num("value"),
                "pressure at \(c.num("altitude_m")) m"
            )
        }
    }

    @Test("boiling point against altitude and pressure")
    func boiling() throws {
        for c in try Fixtures.list("core.json", "thermo.boilingPointAtAltitude") {
            try expectClose(
                Thermo.boilingPointAtAltitude(c.num("altitude_m")), c.num("value"),
                "boiling point at \(c.num("altitude_m")) m"
            )
        }
        for c in try Fixtures.list("core.json", "thermo.boilingPointAtPressure") {
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
    func holdTimeForDose() throws {
        for c in try Fixtures.list("core.json", "kinetics.holdTimeForDose") {
            let dose = try Dose(zK: c.num("z_K"), trefC: c.num("tref_C"))
            try expectClose(
                dose.holdTimeForDose(doseMinutes: c.num("doseMinutes"), heldC: c.num("held_C")),
                c.num("value"), "hold at \(c.num("held_C")) C"
            )
        }
    }

    @Test("dose accumulates the same way")
    func accumulation() throws {
        var dose = Dose(zK: Constants.zYolk, trefC: Constants.tRefYolkC)
        for c in try Fixtures.list("core.json", "kinetics.accumulateDose") {
            try dose.accumulate(temperatureC: c.num("temperature_C"), dtS: c.num("dt_s"))
            try expectClose(dose.minutes, c.num("minutes"), "dose after step \(c.num("step"))")
        }
    }
}
