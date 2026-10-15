import EggTimerCore
import Foundation
import Observation

/// The alarm's sound, as the cook chose it in Settings, kept. The sounds and
/// their order are the core's (`AlarmSound`), as the web's are; a fresh
/// install rings the wind-up timer, which is what anyone expects an egg
/// timer to sound like, and a stored value that is not a sound reads as it
/// (`readAlarmSound`).
///
/// The notification and the in-app ring both read it when they sound, so a
/// change reaches the next alarm scheduled. One already scheduled for a
/// running cook keeps the sound it was scheduled with.
@MainActor
@Observable
public final class AlarmSoundChoice: AlarmSoundChoosing {
    public static let shared = AlarmSoundChoice()

    /// Under its own key, as the language is (`LanguageChoice`).
    private static let key = Stores.key(StoreRegistry.alarmSound)

    public private(set) var sound: AlarmSound

    private init() {
        sound = readAlarmSound(Stores.store.string(forKey: Self.key))
    }

    /// The cook's pick, kept through the guard (`Stores`), and played once
    /// so they hear what they chose.
    public func pick(_ next: AlarmSound) {
        sound = next
        Stores.set(next.rawValue, forKey: Self.key)
        Services.ringer.preview(next)
    }

    /// The file a sound rings from at a moment, in the bundle: rendered by
    /// `npm run sounds` (tools/sounds.ts), with its extension.
    public static func file(_ sound: AlarmSound, _ moment: RingDeadline) -> String {
        "alarm-\(sound.rawValue)-\(moment.rawValue).caf"
    }
}

/// The sound a fresh install rings with.
public let defaultAlarmSound = AlarmSound.timer

/// A stored choice, or the default for anything that is not one: absence, a
/// sound a later version offers and this one does not, a sound since
/// retired.
func readAlarmSound(_ raw: Any?) -> AlarmSound {
    guard let tag = raw as? String, let sound = AlarmSound(rawValue: tag) else { return defaultAlarmSound }
    return sound
}
