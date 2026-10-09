/**
 * What a cook enters and a fresh install starts from (`src/core/inputs.ts`):
 * the bounds, the defaults, the size classes, the room and the buttons.
 *
 * Every test names an invariant both apps depend on; the Swift twin is held
 * to the same answers by `fixtures/inputs.json`.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DEFAULTS, DEFAULT_EGG_MASS_KG, LIMITS, START_TEMP_PRESETS_C, ambientFor, carrySizeIndex, clamp, isWithin, roomInUse,
  startTempPreset_C,
} from '../src/core/inputs.js';
import { DEFAULT_TIME_TO_BOIL_S } from '../src/core/boil.js';
import { SIZE_CLASSES, SizeClass, US_SIZE_CLASSES, sizeClassesFor } from '../src/core/geometry.js';
import { parseCatalogue, render } from '../src/core/copy.js';
import { sizeClassLabel } from '../src/core/units.js';
import { T_ROOM_C } from '../src/core/constants.js';

const EN = parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8')));

test('6. every limit is non-empty and every default sits inside its limit', () => {
  for (const [name, limit] of Object.entries(LIMITS)) {
    assert.ok(limit.lo < limit.hi, `${name} has an empty range`);
  }
  assert.ok(isWithin(DEFAULTS.waterLitres, LIMITS.waterLitres));
  assert.ok(isWithin(DEFAULTS.eggCount, LIMITS.eggCount));
  assert.ok(isWithin(DEFAULTS.doneness, LIMITS.doneness));
  assert.ok(isWithin(DEFAULTS.altitude_m, LIMITS.altitude_m));
  assert.ok(isWithin(DEFAULTS.customMinor_mm, LIMITS.minor_mm));
  assert.ok(isWithin(DEFAULTS.customStart_C, LIMITS.eggTemp_C));
  assert.ok(isWithin(DEFAULT_TIME_TO_BOIL_S, LIMITS.timeToBoil_s));
  assert.ok(isWithin(DEFAULTS.sizeIndex, LIMITS.sizeIndex));
});

test('6b. the default mass is the default size class, not a second opinion', () => {
  assert.equal(DEFAULT_EGG_MASS_KG, SIZE_CLASSES[DEFAULTS.sizeIndex].mass_kg);
  assert.ok(isWithin(DEFAULT_EGG_MASS_KG * 1000, LIMITS.mass_g));
});

function className(c: SizeClass): string {
  return c.key.split('.')[2];
}

function labelOf(c: SizeClass): string {
  const label = sizeClassLabel(c, 'metric');
  return render(EN, label.key, { mass: render(EN, label.mass.key, { value: label.mass.value }) });
}

test('6c. the default size is Large in both tables, and a shared index is a shared name', () => {
  assert.equal(className(SIZE_CLASSES[DEFAULTS.sizeIndex]), 'large');
  assert.equal(className(US_SIZE_CLASSES[DEFAULTS.sizeIndex]), 'large');
  const shared = Math.min(SIZE_CLASSES.length, US_SIZE_CLASSES.length);
  for (let i = 0; i < shared; i++) {
    assert.equal(className(SIZE_CLASSES[i]), className(US_SIZE_CLASSES[i]), `index ${i}`);
  }
  for (const table of [SIZE_CLASSES, US_SIZE_CLASSES]) {
    assert.ok(isWithin(table.length - 1, LIMITS.sizeIndex), 'every index is inside the stored bound');
    for (let i = 0; i < table.length; i++) {
      assert.ok(isWithin(table[i].mass_kg * 1000, LIMITS.mass_g), table[i].key);
      if (i > 0) assert.ok(table[i].mass_kg > table[i - 1].mass_kg, 'classes ascend');
      const grams = Number(labelOf(table[i]).match(/(\d+) g$/)?.[1]);
      assert.equal(grams, Math.round(table[i].mass_kg * 1000), `${labelOf(table[i])} says its mass`);
    }
  }
});

test('6d. an American class is the midpoint of its USDA range, per egg', () => {
  // USDA minimum net weight per dozen, oz: Small, Medium, Large, Extra large, Jumbo.
  const perDozen_oz = [18, 21, 24, 27, 30];
  const perEgg_g = (oz: number) => oz * 28.349523125 / 12;
  for (let i = 0; i < 4; i++) {
    const midpoint = 0.5 * (perEgg_g(perDozen_oz[i]) + perEgg_g(perDozen_oz[i + 1]));
    assert.ok(Math.abs(US_SIZE_CLASSES[i].mass_kg * 1000 - midpoint) < 0.05, US_SIZE_CLASSES[i].key);
  }
  // Jumbo has no ceiling; all that is checkable is that the guess is above its floor.
  assert.ok(US_SIZE_CLASSES[4].mass_kg * 1000 > perEgg_g(perDozen_oz[4]));
});

test('6e. region US, and only region US, gets the American carton', () => {
  assert.equal(sizeClassesFor('US'), US_SIZE_CLASSES);
  assert.equal(sizeClassesFor('us'), US_SIZE_CLASSES);
  for (const region of ['GB', 'CZ', 'CA', 'AU', '', 'USA', null, undefined]) {
    assert.equal(sizeClassesFor(region), SIZE_CLASSES, String(region));
  }
});

test('6f. a stored size keeps its name when the table changes, and a Jumbo shrinks to fit', () => {
  for (const table of [SIZE_CLASSES, US_SIZE_CLASSES]) {
    for (let i = 0; i < table.length; i++) assert.equal(carrySizeIndex(i, table), i);
    assert.equal(carrySizeIndex(-1, table), -1, 'a measured egg stays measured');
    assert.equal(carrySizeIndex(-0.4, table), -1);
    assert.equal(carrySizeIndex(NaN, table), DEFAULTS.sizeIndex);
    assert.equal(carrySizeIndex(1.5, table), 2);
  }
  assert.equal(carrySizeIndex(4, SIZE_CLASSES), 3, 'Jumbo outside the US is Extra large');
  assert.equal(carrySizeIndex(4, US_SIZE_CLASSES), 4);
  // The case the second table exists for: a record saved before it, on the
  // default egg, read in the US. It must cook the American Large.
  const carried = carrySizeIndex(DEFAULTS.sizeIndex, US_SIZE_CLASSES);
  assert.equal(US_SIZE_CLASSES[carried].mass_kg, 0.0602);
});

test('6g. clamp pins to the bounds and refuses to pass a non-number through', () => {
  assert.equal(clamp(5, LIMITS.eggCount), 5);
  assert.equal(clamp(0, LIMITS.eggCount), LIMITS.eggCount.lo);
  assert.equal(clamp(99, LIMITS.eggCount), LIMITS.eggCount.hi);
  assert.equal(clamp(NaN, LIMITS.eggCount), LIMITS.eggCount.lo);
  assert.equal(clamp(Infinity, LIMITS.eggCount), LIMITS.eggCount.lo);
});

test('6h. the room follows the egg only once the egg says something about it', () => {
  assert.equal(ambientFor(START_TEMP_PRESETS_C.fridge, null), T_ROOM_C, 'a fridge egg says nothing');
  assert.equal(ambientFor(START_TEMP_PRESETS_C.room, null), T_ROOM_C);
  assert.equal(ambientFor(26, null), 26, 'an egg left out in a hot kitchen IS the kitchen');
});

test('6i. a measured room is the room, and moves the Room button, only with a probe', () => {
  assert.equal(ambientFor(4, 27), 27, 'a fridge egg in a measured room');
  assert.equal(ambientFor(26, 22), 22, 'the room as measured beats the room as guessed');
  assert.equal(startTempPreset_C('room', 27), 27, 'an egg left out is at the room');
  assert.equal(startTempPreset_C('room', null), START_TEMP_PRESETS_C.room);
  assert.equal(startTempPreset_C('fridge', 27), START_TEMP_PRESETS_C.fridge, 'a fridge is a fridge');
  assert.equal(roomInUse(true, 23), 23);
  assert.equal(roomInUse(false, 23), null, 'a setting out of sight changes nothing');
  assert.equal(roomInUse(true, null), null);
  assert.equal(roomInUse(true, 99), LIMITS.room_C.hi, 'clamped like anything stored');
  assert.equal(roomInUse(true, Number.NaN), null);
});
