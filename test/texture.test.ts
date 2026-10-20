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
import { WHITE_FIRM_GAP_MEDIAN, YOLK_WORDS } from '../src/core/infer.ts';
import { DEFAULTS } from '../src/core/inputs.ts';
import { SLIDER_STEPS, anchorNear, verdictFor } from '../src/core/slider.ts';
import { textureFor, textureNoteKeys } from '../src/core/texture.ts';
import { DEFAULT_PARAMS, WHITE_DOSE_TARGET, donenessFromSlider, solveCookTime } from '../src/core/solve.ts';
import type { CookSetup } from '../src/core/protocol.ts';
import { eggFromMass } from '../src/core/geometry.ts';
import { parseCatalogue } from '../src/core/copy.ts';

const EN = parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8')));

/** The yolk dose the slider asks for at `level`, equivalent minutes. */
function doseAt(level: number): number {
  return donenessFromSlider(level).yolkDose_min;
}

/** A white dose `decades` above the white's target, equivalent minutes. */
function whiteAt(decades: number): number {
  return WHITE_DOSE_TARGET * Math.pow(10, decades);
}

test('a white that sets is set up to the firm gap above its target, and firm past it', () => {
  // A hair under the target still sets when the solver says so: a solve
  // lands its white either side of the target.
  assert.equal(textureFor(doseAt(0.41), whiteAt(-0.01), true).white, 'set');
  assert.equal(textureFor(doseAt(0.41), whiteAt(0), true).white, 'set');
  assert.equal(textureFor(doseAt(0.41), whiteAt(WHITE_FIRM_GAP_MEDIAN - 0.01), true).white, 'set');
  assert.equal(textureFor(doseAt(0.41), whiteAt(WHITE_FIRM_GAP_MEDIAN + 0.01), true).white, 'firm');
  assert.equal(textureFor(doseAt(0.41), whiteAt(4), true).white, 'firm');
});

test('the white\'s firm is where a fresh cook most likely calls it firm', () => {
  // The firm gap is the prior's median: a white on it is as likely called
  // tender as firm by the median cook, so past it firm is the likelier word.
  // A Jammy egg cooled in ice is past it, though its inner white peaks
  // under 82 C.
  const setup: CookSetup = {
    startMode: 'hot', eggStart_C: 4, ambient_C: 20, boiling_C: 100, timeToBoil_s: 480,
    cooling: 'ice', waterLitres: 2, eggCount: 2,
  };
  const sol = solveCookTime(eggFromMass(0.068), setup, DEFAULT_PARAMS, donenessFromSlider(0.41));
  assert.ok(sol.result.peakWhite_C < 82);
  assert.equal(textureFor(sol.result.yolkDose_min, sol.result.whiteDose_min, sol.whiteSets).white, 'firm');
});

test('the yolk is the slider\'s word for its dose, at every position the slider can rest on', () => {
  for (let p = 0; p <= SLIDER_STEPS; p++) {
    const level = p / SLIDER_STEPS;
    assert.equal(textureFor(doseAt(level), whiteAt(0.5), true).yolk, YOLK_WORDS[askedWord(level)], `level ${level}`);
  }
  // 0.11 is the edge between Runny and Soft, and the slider calls it Runny:
  // a solve that lands a hair above its dose is still the egg at 0.11.
  assert.equal(askedWord(0.11), 0);
  assert.equal(textureFor(doseAt(0.11) * (1 + 1e-9), whiteAt(0.5), true).yolk, 'runny');
  // Between two positions, the nearer one's word.
  assert.equal(textureFor(doseAt(0.114), whiteAt(0.5), true).yolk, 'runny');
  assert.equal(textureFor(doseAt(0.116), whiteAt(0.5), true).yolk, 'soft');
  // Past either end of the track, the word at that end.
  assert.equal(textureFor(1e-6, whiteAt(0.5), true).yolk, 'runny');
  assert.equal(textureFor(1e6, whiteAt(0.5), true).yolk, 'hard');
});

test('the jammy band contains the default slider position', () => {
  // DEFAULTS.doneness is meant to be Jammy; if the anchors or the bands move,
  // this is what notices.
  assert.equal(anchorNear(DEFAULTS.doneness).key, 'doneness.jammy');
  assert.equal(textureFor(doseAt(DEFAULTS.doneness), whiteAt(0.5), true).yolk, 'jammy');
});

type TextureNote = ReturnType<typeof textureNoteKeys>;
/** The note's keys, not its words: the words are copy/en.json's, so a change
 *  of wording moves no test. */
function noteOf(yolkDose_min: number, whiteDose_min: number, whiteSets: boolean): TextureNote {
  return textureNoteKeys(textureFor(yolkDose_min, whiteDose_min, whiteSets));
}
const note = (white: TextureNote["key"], yolk: TextureNote["key"]): TextureNote => ({ key: 'texture.note', parts: { white: white, yolk: yolk } });
const WHITE_RUNNY: TextureNote = { key: 'texture.white.runny', parts: {} };

test('a white the pan never sets is runny whatever its dose, and is the whole note', () => {
  for (const decades of [-2, -0.01, 0.5, 4]) {
    assert.equal(textureFor(doseAt(0.41), whiteAt(decades), false).white, 'runny', `${decades} decades`);
    assert.deepEqual(noteOf(doseAt(0.41), whiteAt(decades), false), WHITE_RUNNY);
  }
  assert.deepEqual(noteOf(doseAt(0.41), whiteAt(0.5), true), note('texture.white.set', 'texture.yolk.jammy'));
  assert.deepEqual(noteOf(doseAt(0), whiteAt(2), true), note('texture.white.firm', 'texture.yolk.liquid'));
  assert.deepEqual(noteOf(doseAt(0.22), whiteAt(0.5), true), note('texture.white.set', 'texture.yolk.soft'));
  assert.deepEqual(noteOf(doseAt(1), whiteAt(3), true), note('texture.white.firm', 'texture.yolk.set'));
  // Every key a note names renders.
  for (const n of [WHITE_RUNNY, note('texture.white.firm', 'texture.yolk.set')]) {
    assert.ok(EN.messages.has(n.key) && Object.values(n.parts).every((k) => EN.messages.has(k)));
  }
});

test('heat off, too little water: the solver\'s white never sets, and the note says so', () => {
  const setup: CookSetup = {
    startMode: 'hot', eggStart_C: 4, ambient_C: 20, boiling_C: 100, timeToBoil_s: 480,
    cooling: 'ice', afterBoil: 'off', waterLitres: 0.5, eggCount: 2,
  };
  const sol = solveCookTime(eggFromMass(0.068), setup, DEFAULT_PARAMS, donenessFromSlider(DEFAULTS.doneness));
  assert.equal(sol.whiteSets, false);
  assert.equal(verdictFor(sol, DEFAULTS.doneness).kind, 'whiteNeverSets');
  assert.deepEqual(noteOf(sol.result.yolkDose_min, sol.result.whiteDose_min, sol.whiteSets), WHITE_RUNNY);
});
