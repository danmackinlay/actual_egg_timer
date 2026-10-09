import Foundation

/// The alarm sounds a cook can choose in Settings (DECISIONS.md 101), in the
/// order the picker lists them; the one a fresh install rings with; a stored
/// choice read back; and each sound's timing. Transliterated from
/// `src/core/sounds.ts`, whose comment has the reasons, and held to it by
/// `fixtures/sounds.json`. The files the app plays are rendered from the
/// web's `src/ui/alarmSounds.ts` by `npm run sounds`, one per sound and
/// moment.

/// A moment the cook is told about (`AlarmMoment`). The probe moment is not a
/// third one: it is the end of the counted cooling, and only its words differ.
public enum RingDeadline: String, Sendable, Hashable, CaseIterable {
    /// Out of the water, now.
    case pull
    /// The counted cooling is over - or, with a probe, the moment to read it.
    case cooled
}

/// The sounds, in the order the picker lists them (`ALARM_SOUNDS`).
public enum AlarmSound: String, Sendable, Hashable, CaseIterable {
    case timer, cuckoo, hen
}

public let defaultAlarmSound = AlarmSound.timer

/// A stored choice, or the default for anything that is not one.
public func readAlarmSound(_ raw: Any?) -> AlarmSound {
    guard let tag = raw as? String, let sound = AlarmSound(rawValue: tag) else { return defaultAlarmSound }
    return sound
}

/// One period of a sound's pattern, s: it sounds once at the start of each.
public func alarmPeriodS(_ sound: AlarmSound, _ moment: RingDeadline) -> Double {
    switch sound {
    case .timer: return 2.6
    case .cuckoo: return 2.2
    case .hen: return moment == .pull ? 1.6 : 4.4
    }
}

/// How long an alarm the app sounds itself rings, s, unless the cook stops it.
public let alarmRingS = 40.0

/// How many periods an alarm the app sounds itself rings.
public func alarmRepeats(_ sound: AlarmSound, _ moment: RingDeadline) -> Int {
    Int((alarmRingS / alarmPeriodS(sound, moment)).rounded())
}

/// iOS plays the default sound instead of a notification sound this long or
/// longer, s.
public let notificationSoundMaxS = 30.0

/// How many whole periods the notification's sound holds, a second under the
/// limit.
public func notificationRepeats(_ sound: AlarmSound, _ moment: RingDeadline) -> Int {
    Int(((notificationSoundMaxS - 1) / alarmPeriodS(sound, moment)).rounded(.down))
}
