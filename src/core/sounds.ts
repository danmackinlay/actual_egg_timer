/**
 * The alarm sounds a cook can choose in Settings, and each sound's timing:
 * both apps ring the same patterns for the same time. Which one a fresh
 * install rings with, and the stored choice, are each app's settings'.
 *
 * Each sound has two forms, one per moment the cook is told about: `pull`,
 * out of the water now, which is the urgent one, and `cooled`, the end of the
 * counted cooling. How each is made is `src/ui/alarmSounds.ts`; the files the
 * iOS app plays are rendered from it by `npm run sounds`.
 *
 * Pure, like the rest of `src/core/`: no storage, no DOM, no clock.
 */

export type AlarmSound = 'timer' | 'cuckoo' | 'hen';
export type AlarmMoment = 'pull' | 'cooled';

/** One period of each sound's pattern at each moment, s: the pattern sounds
 *  once at its start and the period repeats it. The cuckoo calls twice when
 *  cooled and three times at the pull, and the timer's bell rings longer at
 *  the pull, both in the same period; the hen's two calls are two recordings
 *  of different lengths. Data, so the Swift's copy is written from it
 *  (`npm run swift:constants`). */
export const ALARM_PERIOD_S: Record<AlarmSound, Record<AlarmMoment, number>> = {
  timer: { pull: 2.6, cooled: 2.6 },
  cuckoo: { pull: 2.2, cooled: 2.2 },
  hen: { pull: 1.6, cooled: 4.4 },
};

/** How long an alarm the app sounds itself rings, s, unless the cook stops
 *  it first: long enough for a cook across the room to hear it and walk
 *  over, short enough not to ring for ever in an empty kitchen. */
export const ALARM_RING_S = 40;

/** How many periods of the pattern an alarm the app sounds itself rings: as
 *  many as come nearest `ALARM_RING_S`. */
export function alarmRepeats(sound: AlarmSound, moment: AlarmMoment): number {
  return Math.round(ALARM_RING_S / ALARM_PERIOD_S[sound][moment]);
}
