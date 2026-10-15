import Foundation

/// The alarm sounds a cook can choose in Settings, in the order the picker
/// lists them, and each sound's timing. Transliterated from
/// `src/core/sounds.ts`, and held to it by `fixtures/sounds.json`. Which one
/// a fresh install rings with, and the stored choice, are the app's
/// (`AlarmSoundChoice`). The files the app plays are rendered from the
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
