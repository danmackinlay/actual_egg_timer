/**
 * fixtures/inputs.json: what a cook enters and what a fresh install starts
 * from (src/core/inputs.ts) - the bounds and defaults, both size-class
 * tables, the room assumed from the egg and the room as measured, and the
 * egg-temperature buttons.
 */

import { SIZE_CLASSES, US_SIZE_CLASSES, SizeClass, sizeTableFor } from '../../src/core/geometry.js';
import {
  DEFAULTS, DEFAULT_EGG_MASS_KG, LIMITS, ROOM_EGG_FROM_C, START_TEMP_PRESETS_C, ambientFor, roomInUse,
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
  /* Both tables whole, and which region gets which. The regions include the
   * near misses a port might accept - lower case is the same region, `USA`
   * is not a region code at all, and null is a language tag that names no
   * region. */
  sizeClasses: {
    eu: SIZE_CLASSES.map(sizeClassRow),
    us: US_SIZE_CLASSES.map(sizeClassRow),
    regions: ['US', 'us', 'GB', 'CZ', 'CA', 'USA', '', null].map((region) => ({
      region: region,
      table: sizeTableFor(region),
    })),
  },
  // The room assumed from the egg, and the room as measured, which wins.
  ambient: [null, 12, 27].flatMap((room_C) => [0, 4, 14.9, 15, 20, 26].map((eggStart_C) => ({
    eggStart_C: eggStart_C,
    room_C: room_C,
    ambient_C: ambientFor(eggStart_C, room_C),
  }))),
  // The room as given counts, clamped; and it moves the Room button, never
  // the Fridge.
  roomInUse: [null, 2, 5, 23.5, 40, 41].map((room_C) => ({
    room_C: room_C,
    inUse_C: roomInUse(room_C),
  })),
  startTempPresets: (['fridge', 'room'] as const).flatMap((preset) => [null, 12, 27].map((room_C) => ({
    preset: preset,
    room_C: room_C,
    eggStart_C: startTempPreset_C(preset, room_C),
  }))),
  limits: LIMITS,
  roomEggFrom_C: ROOM_EGG_FROM_C,
};
