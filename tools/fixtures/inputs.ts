/**
 * fixtures/inputs.json: what a cook enters and what a fresh install starts
 * from (src/core/inputs.ts) - the bounds and defaults, both size-class
 * tables and a stored size carried into either, the room assumed from the
 * egg and the room as measured, and the egg-temperature buttons.
 */

import { SIZE_CLASSES, US_SIZE_CLASSES, SizeClass, sizeTableFor } from '../../src/core/geometry.js';
import {
  DEFAULTS, DEFAULT_EGG_MASS_KG, LIMITS, ROOM_EGG_FROM_C, START_TEMP_PRESETS_C, ambientFor, carrySizeIndex, roomInUse,
  startTempPreset_C,
} from '../../src/core/inputs.js';

/** A size class as the fixture states it: the key and the mass the model
 *  cooks. What its label shows, in either system, is in units.json. */
function sizeClassRow(c: SizeClass): { key: string; mass_kg: number } {
  return { key: c.key, mass_kg: c.mass_kg };
}

export const inputsFixture = {
  about: 'What a cook enters and what a fresh install starts from: the bounds and defaults, both size-class tables, the room assumed and the room measured, the egg-temperature buttons. src/core/inputs.ts.',
  defaults: {
    ...DEFAULTS,
    eggMass_kg: DEFAULT_EGG_MASS_KG,
    fridge_C: START_TEMP_PRESETS_C.fridge,
    room_C: START_TEMP_PRESETS_C.room,
  },
  /* Both tables whole, which region gets which, and what a stored index
   * becomes under each. The regions include the near misses a port might
   * accept - lower case is the same region, `USA` is not a region code at all,
   * and null is a language tag that names no region. The carry cases straddle
   * every edge: below -1, the -0.5 tie that the two languages round in
   * opposite directions, halves, and past the end of both tables. */
  sizeClasses: {
    eu: SIZE_CLASSES.map(sizeClassRow),
    us: US_SIZE_CLASSES.map(sizeClassRow),
    regions: ['US', 'us', 'GB', 'CZ', 'CA', 'USA', '', null].map((region) => ({
      region: region,
      table: sizeTableFor(region),
    })),
    carry: [-3, -1, -0.5, -0.4, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 7].map((stored) => ({
      stored: stored,
      eu: carrySizeIndex(stored, SIZE_CLASSES),
      us: carrySizeIndex(stored, US_SIZE_CLASSES),
    })),
  },
  // The room assumed from the egg, and the room as measured, which wins.
  ambient: [null, 12, 27].flatMap((room_C) => [0, 4, 14.9, 15, 20, 26].map((eggStart_C) => ({
    eggStart_C: eggStart_C,
    room_C: room_C,
    ambient_C: ambientFor(eggStart_C, room_C),
  }))),
  // The measured room counts only with a probe, clamped; and it moves the
  // Room button, never the Fridge.
  roomInUse: [true, false].flatMap((probe) => [null, 2, 5, 23.5, 40, 41].map((room_C) => ({
    probe: probe,
    room_C: room_C,
    inUse_C: roomInUse(probe, room_C),
  }))),
  startTempPresets: (['fridge', 'room'] as const).flatMap((preset) => [null, 12, 27].map((room_C) => ({
    preset: preset,
    room_C: room_C,
    eggStart_C: startTempPreset_C(preset, room_C),
  }))),
  limits: LIMITS,
  roomEggFrom_C: ROOM_EGG_FROM_C,
};
