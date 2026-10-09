/**
 * The texture bands and the note's keys (`src/core/texture.ts`).
 *
 * Every test names an invariant both apps depend on; the Swift twin is held
 * to the same answers by `fixtures/texture.json`.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DEFAULTS } from '../src/core/inputs.js';
import { anchorNear, targetPeakYolk_C, verdictFor } from '../src/core/slider.js';
import { textureFor, textureNoteKeys } from '../src/core/texture.js';
import { DEFAULT_PARAMS, donenessFromSlider, solveCookTime } from '../src/core/solve.js';
import { CookSetup } from '../src/core/protocol.js';
import { eggFromMass } from '../src/core/geometry.js';
import { parseCatalogue, render } from '../src/core/copy.js';

const EN = parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8')));

test('4. texture bands are ordered and half-open at the stated thresholds', () => {
  assert.deepEqual(textureFor(57.9, 70.9, true), { white: 'justSet', yolk: 'liquid' });
  assert.deepEqual(textureFor(58.0, 71.0, true), { white: 'set', yolk: 'soft' });
  assert.deepEqual(textureFor(65.0, 81.9, true), { white: 'set', yolk: 'jammy' });
  assert.deepEqual(textureFor(68.0, 82.0, true), { white: 'firm', yolk: 'fudgy' });
  assert.deepEqual(textureFor(73.0, 90.0, true), { white: 'firm', yolk: 'set' });
});

test('4b. the jammy band contains the default slider position', () => {
  // DEFAULTS.doneness is meant to be Jammy; if the anchors or the bands move,
  // this is what notices.
  assert.equal(anchorNear(DEFAULTS.doneness).key, 'doneness.jammy');
  assert.equal(textureFor(targetPeakYolk_C(DEFAULTS.doneness), 85, true).yolk, 'jammy');
});

function noteText(peakYolk_C: number, peakWhite_C: number, whiteSets: boolean): string {
  const note = textureNoteKeys(textureFor(peakYolk_C, peakWhite_C, whiteSets));
  const parts: Record<string, string> = {};
  for (const [name, key] of Object.entries(note.parts)) parts[name] = render(EN, key);
  return render(EN, note.key, parts);
}

test('4c. a white the pan never sets is runny whatever its peak, and is the whole note', () => {
  // The peak-temperature scale's softest word is "white just set", so reading
  // the peak alone said that of a white that stays runny. iOS did, until the
  // decision moved here.
  for (const peakWhite of [40, 60, 70.9, 75, 95]) {
    assert.equal(textureFor(65, peakWhite, false).white, 'runny', `peak white ${peakWhite} C`);
    assert.deepEqual(textureNoteKeys(textureFor(65, peakWhite, false)),
      { key: 'texture.white.runny', parts: {} });
    assert.equal(noteText(65, peakWhite, false), 'white stays runny');
  }
  assert.equal(noteText(65, 60, true), 'white just set, yolk jammy');
  assert.equal(noteText(50, 90, true), 'white firm, yolk liquid');
});

test('4d. heat off, too little water: the solver\'s white never sets, and the note does not say "just set"', () => {
  const setup: CookSetup = {
    startMode: 'hot', eggStart_C: 4, ambient_C: 20, boiling_C: 100, timeToBoil_s: 480,
    cooling: 'ice', afterBoil: 'off', waterLitres: 0.5, eggCount: 2,
  };
  const sol = solveCookTime(eggFromMass(0.068), setup, DEFAULT_PARAMS, donenessFromSlider(DEFAULTS.doneness));
  assert.equal(sol.whiteSets, false);
  assert.equal(verdictFor(sol, DEFAULTS.doneness).kind, 'whiteNeverSets');
  assert.ok(sol.result.peakWhite_C < 71, 'its peak alone would read "white just set"');
  assert.equal(noteText(sol.result.peakYolk_C, sol.result.peakWhite_C, sol.whiteSets), 'white stays runny');
});
