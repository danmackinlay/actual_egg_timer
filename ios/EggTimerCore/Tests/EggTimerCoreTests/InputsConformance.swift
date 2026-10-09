import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/inputs.json`, generated from
/// `src/core/inputs.ts`.
///
/// Everything it covers is a decision both apps make, so a copy that drifts
/// shows on screen: the eggs in the pan, the default egg, the presets, the
/// bounds on what a cook can enter.

@Suite("Defaults and bounds match the reference implementation")
struct DefaultsConformance {
    /// Both apps open on the same eggs in the pan and the same egg.
    @Test("a fresh install starts from the same kitchen")
    func defaults() throws {
        let d = try Fixtures.object("inputs.json", "defaults")
        try expectClose(Double(Defaults.sizeIndex), d.num("sizeIndex"), "sizeIndex")
        try expectClose(Defaults.customMinorMm, d.num("customMinor_mm"), "customMinor_mm")
        try expectClose(Defaults.customStartC, d.num("customStart_C"), "customStart_C")
        try expectClose(Defaults.altitudeM, d.num("altitude_m"), "altitude_m")
        try expectClose(Defaults.waterLitres, d.num("waterLitres"), "waterLitres")
        try expectClose(Double(Defaults.eggCount), d.num("eggCount"), "eggCount")
        try expectClose(Defaults.doneness, d.num("doneness"), "doneness")
        try expectClose(Defaults.eggMassKg, d.num("eggMass_kg"), "eggMass_kg")
        try expectClose(StartTempPresets.fridgeC, d.num("fridge_C"), "fridge preset")
        try expectClose(StartTempPresets.roomC, d.num("room_C"), "room preset")
    }

    @Test("the room follows the egg at the same threshold, and a measured room wins")
    func ambient() throws {
        try expectClose(roomEggFromC, Fixtures.number("inputs.json", "roomEggFrom_C"), "roomEggFromC")
        for c in try Fixtures.list("inputs.json", "ambient") {
            let start = try c.num("eggStart_C")
            let room = try c.optionalNum("room_C")
            try expectClose(
                ambientFor(eggStartC: start, roomC: room), c.num("ambient_C"),
                "ambient for \(start) C in a room of \(String(describing: room))"
            )
        }
    }

    @Test("a measured room counts only with a probe, and moves only the Room button")
    func measuredRoom() throws {
        for c in try Fixtures.list("inputs.json", "roomInUse") {
            let probe = try c.flag("probe")
            let room = try c.optionalNum("room_C")
            let got = roomInUse(probe: probe, roomC: room)
            let want = try c.optionalNum("inUse_C")
            #expect(got == want, "room \(String(describing: room)), probe \(probe)")
        }
        for c in try Fixtures.list("inputs.json", "startTempPresets") {
            let preset = try c.value(StartTempPreset.self, "preset")
            let room = try c.optionalNum("room_C")
            try expectClose(startTempPresetC(preset, roomC: room), c.num("eggStart_C"), "\(preset) preset")
        }
    }

    @Test("every bound is the same bound")
    func limits() throws {
        let limits = try Fixtures.object("inputs.json", "limits")
        let pairs: [(String, ClosedRange<Double>)] = [
            ("mass_g", Limits.massG),
            ("minor_mm", Limits.minorMm),
            ("eggTemp_C", Limits.eggTempC),
            ("room_C", Limits.roomC),
            ("altitude_m", Limits.altitudeM),
            ("waterLitres", Limits.waterLitres),
            ("eggCount", Limits.eggCount),
            ("doneness", Limits.doneness),
            ("sizeIndex", Limits.sizeIndex),
            ("timeToBoil_s", Limits.timeToBoilS),
        ]
        for (name, range) in pairs {
            guard let bounds = limits[name] as? [String: Any] else {
                Issue.record("fixtures/inputs.json has no limit \(name)")
                continue
            }
            try expectClose(range.lowerBound, bounds.num("lo"), "\(name) lower bound")
            try expectClose(range.upperBound, bounds.num("hi"), "\(name) upper bound")
        }
    }
}

@Suite("Size classes by region match the reference implementation")
struct SizeClassConformance {
    /// Every key and every mass, in order (what each label shows, in either
    /// system, is UnitsConformance's). A US Large 8 g lighter than an EU
    /// one is half a minute of cooking, so a table that differs by a row is a
    /// different egg on the default path.
    @Test("both tables are the same tables")
    func tables() throws {
        for (name, classes) in [("eu", sizeClasses), ("us", usSizeClasses)] {
            let expected = try Fixtures.list("inputs.json", "sizeClasses.\(name)")
            #expect(classes.count == expected.count, "\(name) table has \(classes.count) classes")
            for (actual, c) in zip(classes, expected) {
                #expect(try actual.key == c.str("key"), "\(name): \(actual.key)")
                try expectClose(actual.massKg, c.num("mass_kg"), "\(name) \(actual.key)")
            }
        }
    }

    @Test("the same regions get the American carton")
    func regions() throws {
        for c in try Fixtures.list("inputs.json", "sizeClasses.regions") {
            let region = c["region"] as? String
            let table = try c.str("table")
            let expected = table == "us" ? usSizeClasses : sizeClasses
            #expect(
                sizeClassesFor(region: region) == expected,
                "region \(region ?? "nil") should get the \(table) table"
            )
            #expect(
                sizeTableFor(region: region).rawValue == table,
                "region \(region ?? "nil") names the \(table) table"
            )
        }
    }

    /// The rule for a stored record meeting a changed region. The two apps
    /// store the same index, so they must read it back the same way.
    @Test("a stored size is carried into either table the same way")
    func carry() throws {
        for c in try Fixtures.list("inputs.json", "sizeClasses.carry") {
            let stored = try c.num("stored")
            #expect(
                try carrySizeIndex(stored, classes: sizeClasses) == Int(c.num("eu")),
                "stored \(stored) read against the EU table"
            )
            #expect(
                try carrySizeIndex(stored, classes: usSizeClasses) == Int(c.num("us")),
                "stored \(stored) read against the US table"
            )
        }
    }
}
