import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/settings.json`, generated from
/// `src/core/settings.ts`.

@Suite("The settings match the reference implementation")
struct SettingsConformance {
    @Test("a fresh install's settings are the same settings")
    func defaults() throws {
        let want = try Fixtures.object("settings.json", "defaults")
        #expect(NSDictionary(dictionary: AppSettings.defaults.jsonObject).isEqual(to: want))
    }

    /// Every field, as JSON: each number to the bit, each choice, each absence.
    @Test("a stored copy reads back the same, against either table")
    func read() throws {
        for c in try Fixtures.list("settings.json", "read") {
            let about = "\(try c.str("about")) (\(try c.str("table")))"
            let table = try c.str("table") == "us" ? usSizeClasses : sizeClasses
            let stored = c["stored"] is NSNull ? nil : c["stored"]
            let got = readSettings(stored, classes: table).jsonObject
            let want = try c.object("settings")
            #expect(
                NSDictionary(dictionary: got).isEqual(to: want),
                "\(about): \(got) for \(want)"
            )
        }
    }

    /// What this app writes is what it reads.
    @Test("written and read back, the same settings")
    func roundTrip() throws {
        for c in try Fixtures.list("settings.json", "read") {
            let s = readSettings(c["stored"], classes: sizeClasses)
            let data = try JSONSerialization.data(withJSONObject: s.jsonObject)
            #expect(readSettings(try JSONSerialization.jsonObject(with: data), classes: sizeClasses) == s)
        }
    }
}
