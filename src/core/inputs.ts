/**
 * What a cook types, drags or picks before a cook, and what a fresh install
 * starts from: the bounds on every number, the defaults, what the
 * egg-temperature buttons mean, the room the model is told about, and a
 * stored size read against the table in use.
 *
 * In core so that the two apps cannot disagree: two apps that answer
 * differently out of the box are two answers to the same question.
 *
 * Pure, like the rest of `src/core/`: no storage, no DOM, no clock.
 */

import { SIZE_CLASSES, US_SIZE_CLASSES } from './geometry.ts';
import { T_ROOM_C } from './constants.ts';

/* ------------------------------------------------------------------ bounds */

/** Inclusive bounds on a number. */
export interface Limit {
  lo: number;
  hi: number;
}

/** Bounds on every number a user can type or drag, in one place. They go onto
 *  the input elements, onto what is typed, and onto what comes back out of
 *  storage, so the three cannot drift apart - and now they cannot drift
 *  between the two apps either. */
export const LIMITS = {
  // Hens' eggs: an EU XL is 73 g and up, most under 80; above 90 is a
  // double-yolker or another bird, which this model does not describe.
  mass_g: { lo: 25, hi: 90 },
  girth_mm: { lo: 90, hi: 200 },
  minor_mm: { lo: 30, hi: 60 },
  eggTemp_C: { lo: -2, hi: 40 },
  /** A kitchen's air (the room setting): colder than 5 C is a cellar,
   *  hotter than 40 C a kitchen nobody cooks in. */
  room_C: { lo: 5, hi: 40 },
  altitude_m: { lo: -400, hi: 5000 },
  waterLitres: { lo: 0.25, hi: 12 },
  /** A bowl of water to cool the eggs in: half a litre covers two eggs in a
   *  cereal bowl; eight is a washing-up bowl. */
  bowlLitres: { lo: 0.5, hi: 8 },
  /** The water the eggs cool in, running or in a bowl: just above freezing to
   *  a warm summer's tap. */
  coolingWater_C: { lo: 1, hi: 40 },
  eggCount: { lo: 1, hi: 24 },
  doneness: { lo: 0, hi: 1 },
  /** Across every table. The table in use is shorter than this outside the
   *  US, so a stored index also goes through `carrySizeIndex`. */
  sizeIndex: { lo: -1, hi: Math.max(SIZE_CLASSES.length, US_SIZE_CLASSES.length) - 1 },
  /** A tap under half a minute is a double tap, not a boil; over two hours is
   *  an app left open. */
  timeToBoil_s: { lo: 30, hi: 7200 },
};

/** Clamp a number that is already a number. The apps wrap this with their own
 *  parsing - a blank input field is "not yet typed", not zero - but the bounds
 *  themselves are decided here. */
export function clamp(value: number, limit: Limit): number {
  if (!Number.isFinite(value)) return limit.lo;
  if (value < limit.lo) return limit.lo;
  if (value > limit.hi) return limit.hi;
  return value;
}

export function isWithin(value: number, limit: Limit): boolean {
  return Number.isFinite(value) && value >= limit.lo && value <= limit.hi;
}

/* ----------------------------------------------------------------- defaults */

/** What the two named egg-temperature buttons mean, C, when the room has not
 *  been measured. Both platforms label the buttons from `startTempPreset_C`,
 *  so a button cannot say one thing and the model another. */
export const START_TEMP_PRESETS_C: Record<'fridge' | 'room', number> = {
  fridge: 4,
  room: T_ROOM_C,
};

/** What an egg-temperature button means, C, given the room as measured, or
 *  null when it has not been (`roomInUse`). An egg that has been sitting out
 *  is at the room's temperature, so a measured room moves the Room button with
 *  it; a fridge is a fridge. */
export function startTempPreset_C(preset: 'fridge' | 'room', room_C: number | null): number {
  if (preset === 'room' && room_C !== null) return room_C;
  return START_TEMP_PRESETS_C[preset];
}

/** The room the model is told about, C, or null to assume one: the cook's
 *  own, as they gave it beside "at room temperature" or in Settings, with or
 *  without a probe thermometer. It once counted only with the probe on; it
 *  moves the right time by about 5 s a degree for eggs left out, as much as
 *  a size class across a kitchen's 15-30 C, so it is offered where it is
 *  used. Clamped, like everything typed or
 *  stored. */
export function roomInUse(room_C: number | null): number | null {
  if (room_C === null || !Number.isFinite(room_C)) return null;
  return clamp(room_C, LIMITS.room_C);
}

/** The room, as far as the model is concerned, given the egg's start and the
 *  room as measured (`roomInUse`), or null.
 *
 * A measured room is the room. Without one: on the default path - eggs into
 * boiling water, straight into an ice bath - the room is worth nothing at
 * all, and on a cold start about two seconds per degree. It earns its keep
 * resting on the counter and standing with the heat off, and in both the user
 * has usually already said: an egg that has been sitting out IS at room
 * temperature. A fridge egg says nothing about the room, so that case keeps
 * the default. */
export function ambientFor(eggStart_C: number, room_C: number | null): number {
  if (room_C !== null) return room_C;
  return eggStart_C >= ROOM_EGG_FROM_C ? eggStart_C : T_ROOM_C;
}

/** An egg at or above this, C, has been sitting out, and is the room's
 *  temperature; below it, it is a fridge egg and says nothing about the room. */
export const ROOM_EGG_FROM_C = 15;

/** The inputs a fresh install starts from. Both apps read these, because two
 *  apps that answer differently out of the box are two different answers to
 *  the same question. */
export const DEFAULTS = {
  /** Index into the region's size classes - 'Large' in both tables, 68 g in
   *  the EU one and 60.2 g on an American carton. */
  sizeIndex: 2,
  customMinor_mm: 44,
  customStart_C: 12,
  altitude_m: 0,
  waterLitres: 2,
  /** A mixing bowl: within 3 s of any other volume for one to six eggs
   *  (design/bowl.md section 2.7). */
  bowlLitres: 2,
  eggCount: 2,
  doneness: 0.41,
};

/** The reference egg, kg: an EU Large. It is what the tools model and what a
 *  fresh install cooks outside the US; the apps take theirs from the region's
 *  table, `sizeClassesFor(region)[DEFAULTS.sizeIndex]`. Derived rather than
 *  restated, so the size class and the number can never disagree. */
export const DEFAULT_EGG_MASS_KG = SIZE_CLASSES[DEFAULTS.sizeIndex].mass_kg;

