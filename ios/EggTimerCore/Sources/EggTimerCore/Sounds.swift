import Foundation

/// The alarm sounds a cook can choose in Settings, in the order the picker
/// lists them, and each sound's timing, `src/core/sounds.ts`'s: its periods
/// are its data, written here by `npm run swift:constants`. Which one
/// a fresh install rings with, and the stored choice, are the app's
/// (`AlarmSoundChoice`). The files the app plays are rendered from the
/// web's `src/ui/alarmSounds.ts` by `npm run sounds`, one per sound and
/// moment.

/// A moment the cook is told about (`AlarmMoment`). The probe moment is not a
/// third one: it is the end of the counted cooling, and only its words differ.
public enum RingDeadline: String, Sendable, Hashable, CaseIterable, Codable {
    /// Out of the water, now.
    case pull
    /// The counted cooling is over - or, with a probe, the moment to read it.
    case cooled
}

/// The sounds, in the order the picker lists them (`ALARM_SOUNDS`).
public enum AlarmSound: String, Sendable, Hashable, CaseIterable {
    case timer, cuckoo, hen
}

/// One period of a sound's pattern, s (`AlarmPeriodS`).
public func alarmPeriodS(_ sound: AlarmSound, _ moment: RingDeadline) -> Double {
    switch (sound, moment) {
    case (.timer, .pull): AlarmPeriodS.timerPull
    case (.timer, .cooled): AlarmPeriodS.timerCooled
    case (.cuckoo, .pull): AlarmPeriodS.cuckooPull
    case (.cuckoo, .cooled): AlarmPeriodS.cuckooCooled
    case (.hen, .pull): AlarmPeriodS.henPull
    case (.hen, .cooled): AlarmPeriodS.henCooled
    }
}

/// How many periods an alarm the app sounds itself rings.
public func alarmRepeats(_ sound: AlarmSound, _ moment: RingDeadline) -> Int {
    Int((alarmRingS / alarmPeriodS(sound, moment)).rounded())
}
