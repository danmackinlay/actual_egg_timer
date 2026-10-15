/**
 * fixtures/sounds.json: the alarm sounds' timing (src/core/sounds.ts) - each
 * sound's period and how many times it rings, at both moments.
 */

import { ALARM_RING_S, type AlarmMoment, type AlarmSound, alarmPeriod_s, alarmRepeats } from '../../src/core/sounds.ts';

const SOUNDS: AlarmSound[] = ['timer', 'cuckoo', 'hen'];

export const soundsFixture = {
  about: 'The alarm sounds\' timing: each sound\'s period and repeats at both moments. src/core/sounds.ts.',
  ring_s: ALARM_RING_S,
  timing: SOUNDS.flatMap((sound) => (['pull', 'cooled'] as AlarmMoment[]).map((moment) => ({
    sound: sound,
    moment: moment,
    period_s: alarmPeriod_s(sound, moment),
    repeats: alarmRepeats(sound, moment),
  }))),
};
