import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/sounds.json`, generated from
/// `src/core/sounds.ts`.

@Suite("The alarm sounds match the reference implementation")
struct SoundsConformance {
    @Test("the alarm sounds: the order, the default, a stored value read, and the timing")
    func alarmSounds() throws {
        let a = try Fixtures.load("sounds.json")
        #expect(AlarmSound.allCases.map(\.rawValue) == a["sounds"] as? [String])
        #expect(try defaultAlarmSound.rawValue == a.str("default"))
        try expectClose(alarmRingS, a.num("ring_s"), "ring_s")
        for c in try Fixtures.list("sounds.json", "read") {
            #expect(try readAlarmSound(c["stored"]).rawValue == c.str("sound"), "\(String(describing: c["stored"]))")
        }
        for c in try Fixtures.list("sounds.json", "timing") {
            let sound = try #require(AlarmSound(rawValue: c.str("sound")))
            let moment = try #require(RingDeadline(rawValue: c.str("moment")))
            try expectClose(alarmPeriodS(sound, moment), c.num("period_s"), "\(sound) \(moment) period")
            #expect(try Double(alarmRepeats(sound, moment)) == c.num("repeats"), "\(sound) \(moment) repeats")
        }
    }
}
