/**
 * fixtures/inputs.json: what a cook enters and what a fresh install starts
 * from (src/core/inputs.ts) - which region gets which size-class table, the
 * room assumed from the egg and the room as measured, and the
 * egg-temperature buttons. The bounds, the defaults and the tables are
 * constants, which tools/swiftConstants.ts writes into the Swift.
 */

import { sizeTableFor } from '../../src/core/geometry.ts';
import { ambientFor, roomInUse, startTempPreset_C } from '../../src/core/inputs.ts';

export const inputsFixture = {
  about: 'What a cook enters and what a fresh install starts from: which region gets which size-class table, the room assumed and the room measured, the egg-temperature buttons. src/core/inputs.ts.',
  /* Which region gets which table. The regions include the near misses a
   * port might accept - lower case is the same region, `USA` is not a region
   * code at all, and null is a language tag that names no region. */
  sizeClasses: {
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
};
