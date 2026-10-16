import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/inputs.json`, generated from
/// `src/core/inputs.ts`.
///
/// Everything it covers is a decision both apps make, so a copy that drifts
/// shows on screen: the room the model is told about, the egg-temperature
/// buttons, and the size classes a region gets. The defaults, the bounds and
/// the tables themselves are constants, the TypeScript's
/// (Constants.generated.swift).

@Suite("The room and the presets match the reference implementation")
struct DefaultsConformance {
    @Test("the room follows the egg at the same threshold, and a measured room wins")
    func ambient() throws {
        for c in try Fixtures.list("inputs.json", "ambient") {
            let start = try c.num("eggStart_C")
            let room = try c.optionalNum("room_C")
            try expectClose(
                ambientFor(eggStartC: start, roomC: room), c.num("ambient_C"),
                "ambient for \(start) C in a room of \(String(describing: room))"
            )
        }
    }

    @Test("a room given counts, clamped, and moves only the Room button")
    func measuredRoom() throws {
        for c in try Fixtures.list("inputs.json", "roomInUse") {
            let room = try c.optionalNum("room_C")
            let got = roomInUse(roomC: room)
            let want = try c.optionalNum("inUse_C")
            #expect(got == want, "room \(String(describing: room))")
        }
        for c in try Fixtures.list("inputs.json", "startTempPresets") {
            let preset = try c.value(StartTempPreset.self, "preset")
            let room = try c.optionalNum("room_C")
            try expectClose(startTempPresetC(preset, roomC: room), c.num("eggStart_C"), "\(preset) preset")
        }
    }
}

@Suite("Size classes by region match the reference implementation")
struct SizeClassConformance {
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
}
