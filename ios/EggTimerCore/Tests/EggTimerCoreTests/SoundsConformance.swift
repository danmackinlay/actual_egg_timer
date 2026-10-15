import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/sounds.json`, generated from
/// `src/core/sounds.ts`.

@Suite("The alarm sounds match the reference implementation")
struct SoundsConformance {
    @Test("the alarm sounds, and each one's timing")
    func alarmSounds() throws {
        let a = try Fixtures.load("sounds.json")
        try expectClose(alarmRingS, a.num("ring_s"), "ring_s")
        let rows = try Fixtures.list("sounds.json", "timing")
        // Every sound, in the picker's order, as the rows first name them.
        var named: [String] = []
        for c in rows where !named.contains(try c.str("sound")) { named.append(try c.str("sound")) }
        #expect(AlarmSound.allCases.map(\.rawValue) == named)
        for c in rows {
            let sound = try #require(AlarmSound(rawValue: c.str("sound")))
            let moment = try #require(RingDeadline(rawValue: c.str("moment")))
            try expectClose(alarmPeriodS(sound, moment), c.num("period_s"), "\(sound) \(moment) period")
            #expect(try Double(alarmRepeats(sound, moment)) == c.num("repeats"), "\(sound) \(moment) repeats")
        }
    }
}
