import EggTimerCore
import Foundation
import Observation

/// The alarm's sound, as the cook chose it in Settings (DECISIONS.md 101),
/// kept. The sounds, their order and the default are the core's
/// (`AlarmSound`), as the web's are; what a stored value reads as is
/// `readAlarmSound`, held to the web's by `fixtures/sounds.json`.
///
/// The notification and the in-app ring both read it when they sound, so a
/// change reaches the next alarm scheduled. One already scheduled for a
/// running cook keeps the sound it was scheduled with.
@MainActor
@Observable
final class AlarmSoundChoice {
    static let shared = AlarmSoundChoice()

    /// Under its own key, as the language is (`LanguageChoice`).
    private static let key = "alarmSound"

    private(set) var sound: AlarmSound

    private init() {
        sound = readAlarmSound(UserDefaults.standard.string(forKey: Self.key))
    }

    /// The cook's pick, kept through the guard (`Stores`), and played once
    /// so they hear what they chose.
    func pick(_ next: AlarmSound) {
        sound = next
        Stores.set(next.rawValue, forKey: Self.key)
        Ringer.shared.preview(next)
    }

    /// The file a sound rings from at a moment, in the bundle: rendered by
    /// `npm run sounds` (tools/sounds.ts), with its extension.
    static func file(_ sound: AlarmSound, _ moment: RingDeadline) -> String {
        "alarm-\(sound.rawValue)-\(moment.rawValue).caf"
    }
}
