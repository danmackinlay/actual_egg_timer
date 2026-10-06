/**
 * fixtures/certainty.json: how sure the timer is, in words (DECISIONS.md 93).
 */

import {
  CERTAINTY_MASS, TIME_RANGE_HIGH_Q, TIME_RANGE_LOW_Q, askedWord, certaintyAt, wordCertainty,
} from '../../src/core/certainty.js';
import { decideAt, decisionApplies } from '../../src/core/decide.js';
import { logYolkTarget } from '../../src/core/solve.js';

import { DECIDE_GRID, meanSolve } from './decide.js';
import { outcomePosteriors } from './outcome.js';

/* Three parts. The word asked at every slider position, and at each place
 * the word changes. The class, the interval and the most likely word from
 * spreads written by hand, so that every edge is hit exactly: each class's
 * boundary from both sides, the ends (Runny and Hard have one neighbour),
 * the interval's tie-breaks, and a spread no run short of all five holds.
 * And the whole reading from real posteriors - decide.json's surface and its
 * three, and outcome.json's fourth, none written out again - at the time
 * decided: a fresh install at each word, and cooks that have learned. */

const LEVELS: number[] = [];
for (let k = 0; k <= 100; k++) LEVELS.push(k / 100);
for (const mid of [0.11, 0.315, 0.515, 0.81]) LEVELS.push(mid - 1e-6, mid, mid + 1e-6);

const SPREADS: { note: string; p: number[]; asked: number }[] = [
  { note: 'very certain, exactly at 0.9', p: [0.025, 0.025, 0.9, 0.025, 0.025], asked: 2 },
  { note: 'just under very certain: a ballpark', p: [0.025, 0.025, 0.8999, 0.0251, 0.025], asked: 2 },
  { note: 'a ballpark, the word and its neighbours exactly at 0.9', p: [0.05, 0.25, 0.4, 0.25, 0.05], asked: 2 },
  { note: 'the same three at 0.3 each sum one ulp under 0.9: a wild guess', p: [0.05, 0.3, 0.3, 0.3, 0.05], asked: 2 },
  { note: 'just under a ballpark: a wild guess', p: [0.0501, 0.25, 0.4, 0.2499, 0.05], asked: 2 },
  { note: 'Runny asked: Soft is its only neighbour, a ballpark', p: [0.5, 0.42, 0.06, 0.01, 0.01], asked: 0 },
  { note: 'Runny asked, Runny and Soft under 0.9: a wild guess, though Soft with its neighbours holds more', p: [0.45, 0.4, 0.13, 0.01, 0.01], asked: 0 },
  { note: 'Hard asked: Fudgy is its only neighbour, a ballpark', p: [0.01, 0.01, 0.06, 0.42, 0.5], asked: 4 },
  { note: 'Hard asked, very certain', p: [0.01, 0.01, 0.01, 0.01, 0.96], asked: 4 },
  { note: 'two runs of four tie exactly (dyadic): the softer', p: [0.0625, 0.25, 0.375, 0.25, 0.0625], asked: 2 },
  { note: 'two runs of three both over 0.9: the one holding more, here the firmer', p: [0.02, 0.43, 0.45, 0.06, 0.04], asked: 1 },
  { note: 'two words equally likely: the softer is the most likely', p: [0.3, 0.3, 0.2, 0.1, 0.1], asked: 2 },
  { note: 'the interval need not hold the word asked', p: [0.01, 0.02, 0.45, 0.5, 0.02], asked: 1 },
  { note: 'even: all five', p: [0.2, 0.2, 0.2, 0.2, 0.2], asked: 2 },
  { note: 'a spread short of 0.9 in all, which rounding alone could make: all five', p: [0.1, 0.1, 0.1, 0.1, 0.1], asked: 3 },
];

const CASES: { posterior: string; level: number; note: string }[] = [
  { posterior: 'prior', level: 0.0, note: 'fresh install, runny' },
  { posterior: 'prior', level: 0.22, note: 'fresh install, soft' },
  { posterior: 'prior', level: 0.41, note: 'fresh install, jammy' },
  { posterior: 'prior', level: 0.62, note: 'fresh install, fudgy' },
  { posterior: 'prior', level: 1.0, note: 'fresh install, hard' },
  { posterior: 'learned', level: 0.22, note: 'a runny white at soft' },
  { posterior: 'learned', level: 0.41, note: 'the same cook at jammy' },
  { posterior: 'consistent', level: 0.41, note: 'three jammy eggs just right' },
  { posterior: 'consistent', level: 0.47, note: 'the same cook between the words: Jammy asked' },
  { posterior: 'consistent', level: 0.62, note: 'the same cook at fudgy' },
  { posterior: 'firmer', level: 0.41, note: 'a cook the model knows, who likes a firmer yolk' },
  { posterior: 'firmer', level: 0.62, note: 'the same cook at fudgy' },
  { posterior: 'firmer', level: 1.0, note: 'the same cook at hard' },
];

export const certaintyFixture = {
  about: 'How sure the timer is, in words: the word asked, the class, the 90% interval and the time range. src/core/certainty.ts. Surface and posteriors are decide.json\'s, and outcome.json\'s consistent.',
  constants: { certaintyMass: CERTAINTY_MASS, timeRangeLowQ: TIME_RANGE_LOW_Q, timeRangeHighQ: TIME_RANGE_HIGH_Q },
  asked: LEVELS.map((level) => ({ level: level, asked: askedWord(level) })),
  spreads: SPREADS.map((s) => ({ ...s, words: wordCertainty(s.p, s.asked) })),
  cases: CASES.map((c) => {
    const pz = outcomePosteriors.find((x) => x.name === c.posterior);
    if (pz === undefined) throw new Error(c.posterior);
    const target = logYolkTarget(c.level);
    const sol = meanSolve(pz, c.level);
    const d = decideAt(pz.post, pz.eggsLogged, DECIDE_GRID, sol.result.cookTime_s, decisionApplies(sol), target);
    return {
      posterior: c.posterior,
      note: c.note,
      level: c.level,
      cookTime_s: d.cookTime_s,
      reading: certaintyAt(pz.post, DECIDE_GRID, d.cookTime_s, c.level),
    };
  }),
};
