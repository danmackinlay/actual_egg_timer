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

import { askedWord } from '../src/core/certainty.ts';
import { YOLK_WORDS } from '../src/core/infer.ts';
import { DEFAULTS } from '../src/core/inputs.ts';
import { SLIDER_STEPS, anchorNear, verdictFor } from '../src/core/slider.ts';
import { textureFor, textureNoteKeys } from '../src/core/texture.ts';
import { DEFAULT_PARAMS, donenessFromSlider, solveCookTime } from '../src/core/solve.ts';
import type { CookSetup } from '../src/core/protocol.ts';
import { eggFromMass } from '../src/core/geometry.ts';
import { parseCatalogue, render } from '../src/core/copy.ts';

const EN = parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8')));

/** The yolk dose the slider asks for at `level`, equivalent minutes. */
function doseAt(level: number): number {
  return donenessFromSlider(level).yolkDose_min;
}

test('the white\'s bands are ordered and half-open at the stated thresholds', () => {
  assert.equal(textureFor(doseAt(0.41), 70.9, true).white, 'justSet');
  assert.equal(textureFor(doseAt(0.41), 71.0, true).white, 'set');
  assert.equal(textureFor(doseAt(0.41), 81.9, true).white, 'set');
  assert.equal(textureFor(doseAt(0.41), 82.0, true).white, 'firm');
});

test('the yolk is the slider\'s word for its dose, at every position the slider can rest on', () => {
  for (let p = 0; p <= SLIDER_STEPS; p++) {
    const level = p / SLIDER_STEPS;
    assert.equal(textureFor(doseAt(level), 75, true).yolk, YOLK_WORDS[askedWord(level)], `level ${level}`);
  }
  // 0.11 is the edge between Runny and Soft, and the slider calls it Runny:
  // a solve that lands a hair above its dose is still the egg at 0.11.
  assert.equal(askedWord(0.11), 0);
  assert.equal(textureFor(doseAt(0.11) * (1 + 1e-9), 75, true).yolk, 'runny');
  // Between two positions, the nearer one's word.
  assert.equal(textureFor(doseAt(0.114), 75, true).yolk, 'runny');
  assert.equal(textureFor(doseAt(0.116), 75, true).yolk, 'soft');
  // Past either end of the track, the word at that end.
  assert.equal(textureFor(1e-6, 75, true).yolk, 'runny');
  assert.equal(textureFor(1e6, 75, true).yolk, 'hard');
});

test('the jammy band contains the default slider position', () => {
  // DEFAULTS.doneness is meant to be Jammy; if the anchors or the bands move,
  // this is what notices.
  assert.equal(anchorNear(DEFAULTS.doneness).key, 'doneness.jammy');
  assert.equal(textureFor(doseAt(DEFAULTS.doneness), 75, true).yolk, 'jammy');
});

function noteText(yolkDose_min: number, peakWhite_C: number, whiteSets: boolean): string {
  const note = textureNoteKeys(textureFor(yolkDose_min, peakWhite_C, whiteSets));
  const parts: Record<string, string> = {};
  for (const [name, key] of Object.entries(note.parts)) parts[name] = render(EN, key);
  return render(EN, note.key, parts);
}

test('a white the pan never sets is runny whatever its peak, and is the whole note', () => {
  // The peak-temperature scale's softest word is "white just set", so reading
  // the peak alone said that of a white that stays runny. iOS did, until the
  // decision moved here.
  for (const peakWhite of [40, 60, 70.9, 75, 95]) {
    assert.equal(textureFor(doseAt(0.41), peakWhite, false).white, 'runny', `peak white ${peakWhite} C`);
    assert.deepEqual(textureNoteKeys(textureFor(doseAt(0.41), peakWhite, false)),
      { key: 'texture.white.runny', parts: {} });
    assert.equal(noteText(doseAt(0.41), peakWhite, false), 'white stays runny');
  }
  assert.equal(noteText(doseAt(0.41), 60, true), 'white just set, yolk jammy');
  assert.equal(noteText(doseAt(0), 90, true), 'white firm, yolk liquid');
  assert.equal(noteText(doseAt(0.22), 75, true), 'white set, yolk soft, barely thickened');
  assert.equal(noteText(doseAt(1), 90, true), 'white firm, yolk fully set');
});

test('heat off, too little water: the solver\'s white never sets, and the note does not say "just set"', () => {
  const setup: CookSetup = {
    startMode: 'hot', eggStart_C: 4, ambient_C: 20, boiling_C: 100, timeToBoil_s: 480,
    cooling: 'ice', afterBoil: 'off', waterLitres: 0.5, eggCount: 2,
  };
  const sol = solveCookTime(eggFromMass(0.068), setup, DEFAULT_PARAMS, donenessFromSlider(DEFAULTS.doneness));
  assert.equal(sol.whiteSets, false);
  assert.equal(verdictFor(sol, DEFAULTS.doneness).kind, 'whiteNeverSets');
  assert.ok(sol.result.peakWhite_C < 71, 'its peak alone would read "white just set"');
  assert.equal(noteText(sol.result.yolkDose_min, sol.result.peakWhite_C, sol.whiteSets), 'white stays runny');
});
