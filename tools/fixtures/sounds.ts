/**
 * fixtures/sounds.json: the alarm sounds (src/core/sounds.ts) - the
 * pickers' order, the default, what a stored value reads as (a near miss in
 * case, a retired sound, not a string, absent), and each sound's timing at
 * both moments.
 */

import {
  ALARM_RING_S, ALARM_SOUNDS, AlarmMoment, DEFAULT_ALARM_SOUND, NOTIFICATION_SOUND_MAX_S, alarmPeriod_s, alarmRepeats,
  notificationRepeats, readAlarmSound,
} from '../../src/core/sounds.js';

export const soundsFixture = {
  about: 'The alarm sounds: the order, the default, a stored value read back, and each sound\'s timing. src/core/sounds.ts.',
  sounds: ALARM_SOUNDS,
  default: DEFAULT_ALARM_SOUND,
  ring_s: ALARM_RING_S,
  notificationMax_s: NOTIFICATION_SOUND_MAX_S,
  read: ['timer', 'cuckoo', 'hen', 'Hen', 'beeps', '', 3, true, null].map((stored) => ({
    stored: stored,
    sound: readAlarmSound(stored),
  })),
  timing: ALARM_SOUNDS.flatMap((sound) => (['pull', 'cooled'] as AlarmMoment[]).map((moment) => ({
    sound: sound,
    moment: moment,
    period_s: alarmPeriod_s(sound, moment),
    repeats: alarmRepeats(sound, moment),
    notificationRepeats: notificationRepeats(sound, moment),
  }))),
};
