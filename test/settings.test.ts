/**
 * The settings both apps keep (`src/core/settings.ts`): the one reader of a
 * stored copy. The Swift twin is held to the same answers by
 * `fixtures/settings.json`.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { SIZE_CLASSES, US_SIZE_CLASSES } from '../src/core/geometry.js';
import { DEFAULTS, LIMITS } from '../src/core/inputs.js';
import { DEFAULT_SETTINGS, readSettings } from '../src/core/settings.js';

test('nothing stored, or not an object: the defaults, a copy each time', () => {
  for (const raw of [null, undefined, 'x', 3, [1], true]) {
    const s = readSettings(raw, SIZE_CLASSES);
    assert.deepEqual(s, DEFAULT_SETTINGS);
    assert.notEqual(s, DEFAULT_SETTINGS);
  }
});

test('what an app writes reads back the same', () => {
  const written = {
    ...DEFAULT_SETTINGS, sizeIndex: 4, weighedMass_g: 71.25, startMode: 'hot', afterBoil: 'off', eggCount: 6,
    unitsChosen: 'imperial', language: { chosen: 'en-x-1750' }, probe: true, room_C: 23.5,
  };
  assert.deepEqual(readSettings(JSON.parse(JSON.stringify(written)), US_SIZE_CLASSES), written);
});

test('every number clamped; anything not a finite number is the default', () => {
  const low = readSettings({ waterLitres: 0, doneness: -1, weighedMass_g: 3 }, SIZE_CLASSES);
  assert.equal(low.waterLitres, LIMITS.waterLitres.lo);
  assert.equal(low.doneness, 0);
  assert.equal(low.weighedMass_g, LIMITS.mass_g.lo);
  const text = readSettings({ waterLitres: '1', eggCount: '4', doneness: true, room_C: '20' }, SIZE_CLASSES);
  assert.equal(text.waterLitres, DEFAULTS.waterLitres);
  assert.equal(text.eggCount, DEFAULTS.eggCount);
  assert.equal(text.doneness, DEFAULTS.doneness);
  assert.equal(text.room_C, null);
});

test('a stored sous-vide is the default pan; a Jumbo outside the US is Extra large', () => {
  assert.equal(readSettings({ startMode: 'sous' }, SIZE_CLASSES).startMode, 'cold');
  assert.equal(readSettings({ sizeIndex: 4 }, SIZE_CLASSES).sizeIndex, SIZE_CLASSES.length - 1);
  assert.equal(readSettings({ sizeIndex: 4 }, US_SIZE_CLASSES).sizeIndex, 4);
});
