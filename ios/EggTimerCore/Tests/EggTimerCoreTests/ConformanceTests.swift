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
/// The constants are not compared: they are the TypeScript's, written into
/// Constants.generated.swift by `npm run swift:constants`.

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

    /// Each sample as the fixture writes it: the time and what the sphere
    /// reads then.
    @Test("integrator against a held surface")
    func stepResponse() throws {
        var sphere = SphereState(radiusM: 0.0238, alphaM2s: Constants.alphaDefault, initialC: 4.0, surfaceC: 100.0)
        for (i, c) in try Fixtures.list("core.json", "sphere.stepResponse").enumerated() {
            sphere.step(dtS: 10.0, nextSurfaceC: 100.0)
            let row = [
                "t_s": Double(i + 1) * 10, "centre_C": sphere.centreTemperature,
                "yolkBoundary_C": sphere.temperature(atX: Constants.yolkRadiusFrac), "mean_C": sphere.meanTemperature,
            ]
            expectJSON(row, c, "step \(i)")
        }
    }

    /// The case the Duhamel coupling exists for. A step-only test would not
    /// catch a sign error in the drive term.
    @Test("integrator against a moving surface")
    func rampResponse() throws {
        var sphere = SphereState(radiusM: 0.0238, alphaM2s: Constants.alphaDefault, initialC: 4.0, surfaceC: 20.0)
        for (i, c) in try Fixtures.list("core.json", "sphere.rampResponse").enumerated() {
            let surface = try c.num("surface_C")
            sphere.step(dtS: 15.0, nextSurfaceC: surface)
            let row = [
                "t_s": Double(i + 1) * 15, "surface_C": surface, "centre_C": sphere.centreTemperature,
                "mean_C": sphere.meanTemperature,
            ]
            expectJSON(row, c, "step \(i)")
        }
    }
}

@Suite("Geometry")
struct GeometryConformance {
    @Test("from mass")
    func fromMass() throws {
        for c in try Fixtures.list("core.json", "geometry.fromMass") {
            let g = try c.num("mass_g")
            expectJSON(Geometry.eggFromMass(g / 1000.0), c["egg"], "\(g) g")
        }
    }
}

@Suite("Thermo")
struct ThermoConformance {
    @Test("pressure against altitude")
    func pressure() throws {
        for c in try Fixtures.list("core.json", "thermo.pressureAtAltitude") {
            try expectClose(
                Thermo.pressureAtAltitude(c.num("altitude_m")), c.num("value"), "pressure at \(c.num("altitude_m")) m"
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

@Suite("What the egg cools in")
struct CoolingConformance {
    @Test("each cooling starts where the web says, given a temperature or not")
    func medium() throws {
        let rows = try Fixtures.list("core.json", "protocol.coolingMedium")
        #expect(rows.count >= 8)
        for c in rows {
            let setup = try decoded(CookSetup.self, c["setup"])
            try expectClose(coolingMediumC(setup), c.num("value"), "\(setup.cooling) starts")
        }
    }

    @Test("the coldest thing the egg touched takes a cold pan's water, and only a cold one's")
    func coldest() throws {
        let rows = try Fixtures.list("core.json", "protocol.coldestTouched")
        #expect(rows.count >= 6)
        for c in rows {
            let setup = try decoded(CookSetup.self, c["setup"])
            try expectClose(coldestTouchedC(setup), c.num("value"), "\(setup.startMode) from \(setup.panStartC ?? .nan)")
        }
    }

    @Test("a bowl warms by what the eggs give up")
    func bowl() throws {
        let rows = try Fixtures.list("core.json", "protocol.bowlTemperature")
        #expect(rows.count >= 30)
        for c in rows {
            let setup = try decoded(CookSetup.self, c["setup"])
            let egg = Geometry.eggFromMass(try c.num("mass_g") / 1000)
            try expectClose(
                Protocols.bowlTemperature(egg, setup, meanAtPullC: c.num("meanAtPull_C"), meanC: c.num("mean_C")),
                c.num("value"), "\(setup.cooling) at \(try c.num("mean_C")) C"
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
                dose.holdTimeForDose(doseMinutes: c.num("doseMinutes"), heldC: c.num("held_C")), c.num("value"),
                "hold at \(c.num("held_C")) C"
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
