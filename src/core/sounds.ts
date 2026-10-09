/**
 * The alarm sounds a cook can choose in Settings (DECISIONS.md 101), in the
 * order both pickers list them; the one a fresh install rings with; a stored
 * choice read back; and each sound's timing. Both apps ring the same patterns
 * for the same time. The wind-up timer is the default because it is what
 * anyone expects an egg timer to sound like; the cuckoo clock and the hen are
 * a choice away.
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

export const ALARM_SOUNDS: AlarmSound[] = ['timer', 'cuckoo', 'hen'];
export const DEFAULT_ALARM_SOUND: AlarmSound = 'timer';

/** A stored choice, or the default for anything that is not one: absence, a
 *  sound a later version offers and this one does not, a sound since
 *  retired. */
export function readAlarmSound(raw: unknown): AlarmSound {
  for (let i = 0; i < ALARM_SOUNDS.length; i++) {
    if (raw === ALARM_SOUNDS[i]) return ALARM_SOUNDS[i];
  }
  return DEFAULT_ALARM_SOUND;
}

/** One period of a sound's pattern, s: the pattern sounds once at its start
 *  and the period repeats it. The cuckoo calls twice when cooled and three
 *  times at the pull, and the timer's bell rings longer at the pull, both in
 *  the same period; the hen's two calls are two recordings of different
 *  lengths. */
export function alarmPeriod_s(sound: AlarmSound, moment: AlarmMoment): number {
  if (sound === 'timer') return 2.6;
  if (sound === 'cuckoo') return 2.2;
  return moment === 'pull' ? 1.6 : 4.4;
}

/** How long an alarm the app sounds itself rings, s, unless the cook stops
 *  it first: long enough for a cook across the room to hear it and walk
 *  over, short enough not to ring for ever in an empty kitchen. The beeps
 *  before these sounds rang 25 periods of 1.6 s. */
export const ALARM_RING_S = 40;

/** How many periods of the pattern an alarm the app sounds itself rings: as
 *  many as come nearest `ALARM_RING_S`. */
export function alarmRepeats(sound: AlarmSound, moment: AlarmMoment): number {
  return Math.round(ALARM_RING_S / alarmPeriod_s(sound, moment));
}
