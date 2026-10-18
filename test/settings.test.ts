/**
 * The settings as the web keeps them (`src/ui/settings.ts`): the one reader
 * of a stored copy, every field checked. The iPhone tests its own
 * (EggTimerAppTests).
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { SIZE_CLASSES, US_SIZE_CLASSES } from '../src/core/geometry.ts';
import { DEFAULTS, LIMITS } from '../src/core/inputs.ts';
import { DEFAULT_SETTINGS, carrySizeIndex, readChosenUnits, readSettings } from '../src/ui/settings.ts';

test('nothing stored, or not an object: the defaults, a copy each time', () => {
  for (const raw of [null, undefined, 'x', 3, [1], true]) {
    const s = readSettings(raw, SIZE_CLASSES);
    assert.deepEqual(s, DEFAULT_SETTINGS);
    assert.notEqual(s, DEFAULT_SETTINGS);
  }
});

test('what an app writes reads back the same', () => {
  const written = {
    ...DEFAULT_SETTINGS, sizeIndex: 4, customMinor_mm: 47.5, measuredBy: 'girth', startMode: 'hot', afterBoil: 'off', eggCount: 6,
    unitsChosen: 'imperial', language: { chosen: 'en-x-1750' }, probe: true, room_C: 23.5, eggView: 'heat',
  };
  assert.deepEqual(readSettings(JSON.parse(JSON.stringify(written)), US_SIZE_CLASSES), written);
});

test('every number clamped; anything not a finite number is the default', () => {
  const low = readSettings({ waterLitres: 0, doneness: -1, customMinor_mm: 1 }, SIZE_CLASSES);
  assert.equal(low.waterLitres, LIMITS.waterLitres.lo);
  assert.equal(low.doneness, 0);
  assert.equal(low.customMinor_mm, LIMITS.minor_mm.lo);
  const text = readSettings({ waterLitres: '1', eggCount: '4', doneness: true, room_C: '20' }, SIZE_CLASSES);
  assert.equal(text.waterLitres, DEFAULTS.waterLitres);
  assert.equal(text.eggCount, DEFAULTS.eggCount);
  assert.equal(text.doneness, DEFAULTS.doneness);
  assert.equal(text.room_C, null);
});

test('the egg shows how set unless how hot was stored', () => {
  assert.equal(readSettings({}, SIZE_CLASSES).eggView, 'set');
  assert.equal(readSettings({ eggView: 'heat' }, SIZE_CLASSES).eggView, 'heat');
  assert.equal(readSettings({ eggView: 'warm' }, SIZE_CLASSES).eggView, 'set');
});

test('a stored sous-vide is the default pan; a Jumbo outside the US is Extra large', () => {
  assert.equal(readSettings({ startMode: 'sous' }, SIZE_CLASSES).startMode, 'cold');
  assert.equal(readSettings({ sizeIndex: 4 }, SIZE_CLASSES).sizeIndex, SIZE_CLASSES.length - 1);
  assert.equal(readSettings({ sizeIndex: 4 }, US_SIZE_CLASSES).sizeIndex, 4);
});

test('a stored size keeps its name when the table changes, and a Jumbo shrinks to fit', () => {
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

test('a stored choice of units is one of the two, or none', () => {
  for (const raw of ['Imperial', 'kelvin', '', 0, true, null, undefined]) {
    assert.equal(readChosenUnits(raw), null, String(raw));
  }
  assert.equal(readChosenUnits('imperial'), 'imperial');
  assert.equal(readSettings({ unitsChosen: 'Metric' }, SIZE_CLASSES).unitsChosen, null);
});

test('the iPhone\'s weighed egg is not the web\'s: a stored one is not read, and none is written', () => {
  const read = readSettings({ weighedMass_g: 71.25, sizeIndex: -1 }, SIZE_CLASSES) as unknown as Record<string, unknown>;
  assert.equal('weighedMass_g' in read, false);
  assert.equal('weighedMass_g' in DEFAULT_SETTINGS, false);
});
