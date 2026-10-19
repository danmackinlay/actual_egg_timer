/**
 * The texture note's yolk agrees with the slider (`src/core/texture.ts`).
 *
 * The slider names a yolk by its dose: the word whose band the level's
 * nominal yolk dose falls in (`YOLK_WORD_CUTS`, `askedWord`). The texture note
 * under it must name the same yolk for the cook the solver gives, whatever
 * the cooling. It once read the yolk's peak temperature instead, and in an
 * egg cup, where the yolk sits near its peak until it is opened, a Soft egg's
 * 64 °C read "yolk jammy" under a thumb on Soft.
 *
 * Over every cooling, three sizes of egg, a cold and a hot start, and the
 * five words: the level as asked, solved, and snapped as the app snaps it
 * (`verdictFor`), solved again.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { askedWord } from '../src/core/certainty.ts';
import { SIZE_CLASSES, eggFromMass } from '../src/core/geometry.ts';
import { DEFAULTS, START_TEMP_PRESETS_C } from '../src/core/inputs.ts';
import { YOLK_WORDS } from '../src/core/infer.ts';
import type { CookSetup, Cooling, StartMode } from '../src/core/protocol.ts';
import { verdictFor } from '../src/core/slider.ts';
import {
  DEFAULT_PARAMS, DONENESS_ANCHORS, type Solution, donenessFromSlider, solveCookTime,
} from '../src/core/solve.ts';
import { textureFor } from '../src/core/texture.ts';

const COOLINGS: Cooling[] = ['ice', 'tap', 'bowl', 'counter', 'eggCup'];
const MASSES_KG = [
  SIZE_CLASSES[0].mass_kg, SIZE_CLASSES[DEFAULTS.sizeIndex].mass_kg, SIZE_CLASSES[SIZE_CLASSES.length - 1].mass_kg,
];
const STARTS: StartMode[] = ['cold', 'hot'];

function setupFor(cooling: Cooling, start: StartMode): CookSetup {
  const setup: CookSetup = {
    startMode: start, eggStart_C: START_TEMP_PRESETS_C.fridge, ambient_C: 20, boiling_C: 100, timeToBoil_s: 480,
    cooling: cooling, waterLitres: DEFAULTS.waterLitres, eggCount: DEFAULTS.eggCount,
  };
  if (cooling === 'bowl') setup.bowlLitres = DEFAULTS.bowlLitres;
  return setup;
}

/** The texture note's yolk, as a place among the slider's words. */
function lineWord(sol: Solution): number {
  return YOLK_WORDS.indexOf(textureFor(sol.result.yolkDose_min, sol.result.peakWhite_C, sol.whiteSets).yolk);
}

interface Case { what: string; asked: number; sol: Solution; level: number; snapped: Solution }

const CASES: Case[] = [];
for (const cooling of COOLINGS) {
  for (const mass of MASSES_KG) {
    for (const start of STARTS) {
      for (const anchor of DONENESS_ANCHORS) {
        const egg = eggFromMass(mass);
        const setup = setupFor(cooling, start);
        const sol = solveCookTime(egg, setup, DEFAULT_PARAMS, donenessFromSlider(anchor.level));
        const snapTo = verdictFor(sol, anchor.level).snapTo;
        const level = snapTo ?? anchor.level;
        const snapped = snapTo === null ? sol : solveCookTime(egg, setup, DEFAULT_PARAMS, donenessFromSlider(level));
        CASES.push({
          what: `${cooling}, ${Math.round(mass * 1000)} g, ${start} start, ${anchor.key}`,
          asked: anchor.level, sol: sol, level: level, snapped: snapped,
        });
      }
    }
  }
}

test('the grid covers every cooling and refuses some levels', () => {
  assert.equal(CASES.length, COOLINGS.length * MASSES_KG.length * STARTS.length * DONENESS_ANCHORS.length);
  assert.ok(CASES.some((c) => c.level !== c.asked), 'no level was snapped: the refused case is untested');
});

test('the texture note names the slider\'s word for the cook it describes', () => {
  const wrong: string[] = [];
  for (const c of CASES) {
    const said = lineWord(c.snapped);
    const slider = askedWord(c.level);
    if (said !== slider) wrong.push(`${c.what} at ${c.level}: the slider says ${YOLK_WORDS[slider]}, the note ${YOLK_WORDS[said]}`);
  }
  assert.deepEqual(wrong, []);
});

test('the note never names a yolk outside the band of the level the pan can deliver', () => {
  // Before any snap: a level the pan delivers is named as asked, and one it
  // refuses as the verdict's limit, the nearest word it can deliver.
  const wrong: string[] = [];
  for (const c of CASES) {
    const v = verdictFor(c.sol, c.asked);
    const band = askedWord(v.kind === 'none' ? c.asked : c.sol.softestLevel);
    const said = lineWord(c.sol);
    if (said !== band) {
      wrong.push(`${c.what} (${v.kind}): ${YOLK_WORDS[said]} is ${said > band ? 'firmer' : 'softer'} than ${YOLK_WORDS[band]}`);
    }
  }
  assert.deepEqual(wrong, []);
});
