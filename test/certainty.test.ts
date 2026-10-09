/**
 * How sure the timer is, in words (src/core/certainty.ts, DECISIONS.md 93).
 *
 * What is checked here is the definition: the word asked is the slider's
 * word and the band its nominal dose falls in; the classes are what they say
 * at their edges; the interval is the narrowest run holding 0.9, with its
 * tie-breaks; the bracket under the slider is that interval, from the outer
 * edge of its first word's band to the outer edge of its last's, marked at
 * the most likely word; the reading is read off the model's own predictive and
 * `predictCookTime`, not computed again. `fixtures/certainty.json` pins the
 * arithmetic for the Swift port; `npm run decide -- certainty` prints what a
 * cook is told and how well calibrated it is.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CERTAINTY_MASS, TIME_RANGE_HIGH_Q, TIME_RANGE_LOW_Q, askedWord, certaintyAt, wordBandHigh, wordBandLow,
  wordBracket, wordCertainty,
} from '../src/core/certainty.js';
import { buildDoseGrid } from '../src/core/doseGrid.js';
import {
  YOLK_WORD_CUTS, createPrior, predictCookTime, updatePosterior, yolkWordProbabilities,
} from '../src/core/infer.js';
import { anchorNear } from '../src/core/slider.js';
import { ALPHA_DEFAULT } from '../src/core/constants.js';
import { eggFromMass } from '../src/core/geometry.js';
import { DONENESS_ANCHORS, logYolkTarget } from '../src/core/solve.js';
import { timeRangeWords } from '../src/core/wording.js';
import { appSetup, rng } from '../tools/common.js';

const EGG = eggFromMass(0.068);
const GRID = buildDoseGrid(EGG, appSetup(), { alphaMin: ALPHA_DEFAULT * 0.55, alphaMax: ALPHA_DEFAULT * 1.8, alphaCount: 17, timeMin_s: 200, timeMax_s: 900, timeCount: 71 });

test('the word asked is the slider\'s word, and the band its nominal dose falls in', () => {
  for (let k = 0; k <= 100; k++) {
    const level = k / 100;
    const asked = askedWord(level);
    assert.equal(DONENESS_ANCHORS[asked].key, anchorNear(level).key, `level ${level}`);
    // Away from the cuts, the band of the level's own dose: the cuts are the
    // anchors' midpoints, so the two definitions are one.
    const x = logYolkTarget(level);
    if (YOLK_WORD_CUTS.some((c) => Math.abs(c - x) < 1e-9)) continue;
    let band = 0;
    while (band < YOLK_WORD_CUTS.length && x > YOLK_WORD_CUTS[band]) band += 1;
    assert.equal(asked, band, `level ${level}`);
  }
  // The slider's two positions on a cut: 0.11 is an exact tie and goes
  // softer; 0.81's gaps differ in the last bit and it reads Hard.
  assert.equal(askedWord(0.11), 0);
  assert.equal(askedWord(0.81), 4);
});

test('the classes, at their edges', () => {
  assert.equal(wordCertainty([0.025, 0.025, 0.9, 0.025, 0.025], 2).certainty, 'veryCertain');
  assert.equal(wordCertainty([0.025, 0.025, 0.8999, 0.0251, 0.025], 2).certainty, 'ballpark');
  assert.equal(wordCertainty([0.05, 0.25, 0.4, 0.25, 0.05], 2).certainty, 'ballpark');
  assert.equal(wordCertainty([0.0501, 0.25, 0.4, 0.2499, 0.05], 2).certainty, 'wildGuess');
  // The same spread, asked a word further off: a wild guess.
  assert.equal(wordCertainty([0.025, 0.025, 0.9, 0.025, 0.025], 0).certainty, 'wildGuess');
  assert.equal(wordCertainty([0.025, 0.025, 0.9, 0.025, 0.025], 1).certainty, 'ballpark');
});

test('at the ends there is one neighbour', () => {
  const runny = wordCertainty([0.5, 0.42, 0.06, 0.01, 0.01], 0);
  assert.ok(Math.abs(runny.pNear - 0.92) < 1e-12);
  assert.equal(runny.certainty, 'ballpark');
  const hard = wordCertainty([0.01, 0.01, 0.06, 0.42, 0.5], 4);
  assert.ok(Math.abs(hard.pNear - 0.92) < 1e-12);
  assert.equal(hard.certainty, 'ballpark');
  assert.equal(wordCertainty([0.45, 0.4, 0.13, 0.01, 0.01], 0).certainty, 'wildGuess');
});

test('the interval: the narrowest run holding 0.9, then the most mass, then the softer', () => {
  const tie = wordCertainty([0.0625, 0.25, 0.375, 0.25, 0.0625], 2);
  assert.deepEqual([tie.from, tie.to, tie.pInterval], [0, 3, 0.9375]);
  const heavier = wordCertainty([0.02, 0.43, 0.45, 0.06, 0.04], 1);
  assert.deepEqual([heavier.from, heavier.to], [1, 3]);
  const elsewhere = wordCertainty([0.01, 0.02, 0.45, 0.5, 0.02], 1);
  assert.deepEqual([elsewhere.from, elsewhere.to, elsewhere.mostLikely, elsewhere.certainty], [2, 3, 3, 'wildGuess']);
  assert.equal(wordCertainty([0.3, 0.3, 0.2, 0.1, 0.1], 2).mostLikely, 0);
  const short = wordCertainty([0.1, 0.1, 0.1, 0.1, 0.1], 3);
  assert.deepEqual([short.from, short.to], [0, 4]);

  // Against brute force, on random spreads.
  const random = rng(20261006);
  for (let n = 0; n < 2000; n++) {
    const raw = [0, 1, 2, 3, 4].map(() => random() ** 3);
    const sum = raw.reduce((a, b) => a + b, 0);
    const p = raw.map((x) => x / sum);
    const asked = Math.floor(random() * 5);
    const w = wordCertainty(p, asked);
    let width = 6;
    let best = -1;
    let from = -1;
    for (let len = 1; len <= 5 && width === 6; len++) {
      for (let a = 0; a + len <= 5; a++) {
        let m = 0;
        for (let k = a; k < a + len; k++) m += p[k];
        if (m >= CERTAINTY_MASS && m > best) {
          best = m;
          from = a;
          width = len;
        }
      }
    }
    assert.deepEqual([w.from, w.to], [from, from + width - 1]);
    assert.ok(w.pInterval >= CERTAINTY_MASS);
    const lo = Math.max(0, asked - 1);
    const hi = Math.min(4, asked + 1);
    const near = p.slice(lo, hi + 1).reduce((a, b) => a + b, 0);
    const expected = p[asked] >= CERTAINTY_MASS ? 'veryCertain' : near >= CERTAINTY_MASS ? 'ballpark' : 'wildGuess';
    assert.equal(w.certainty, expected);
    // Very certain is a one-word interval on the word asked.
    if (w.certainty === 'veryCertain') assert.deepEqual([w.from, w.to], [asked, asked]);
    assert.ok(p.every((x) => x <= p[w.mostLikely]));
  }
});

test('the bracket is the interval: its words\' outer edges on the slider, marked at the most likely', () => {
  // The bands tile the track, and their edges are where the slider's word
  // changes: the anchors' midpoints, as anchorNear has them.
  assert.equal(wordBandLow(0), 0);
  assert.equal(wordBandHigh(DONENESS_ANCHORS.length - 1), 1);
  for (let k = 1; k < DONENESS_ANCHORS.length; k++) {
    assert.equal(wordBandLow(k), wordBandHigh(k - 1));
    assert.equal(askedWord(wordBandLow(k) + 1e-6), k);
    assert.equal(askedWord(wordBandLow(k) - 1e-6), k - 1);
  }
  assert.deepEqual([1, 2, 3, 4].map(wordBandLow), [0.11, 0.315, 0.515, 0.81]);
  // Soft to Fudgy, Jammy most likely.
  assert.deepEqual(wordBracket(wordCertainty([0.05, 0.25, 0.4, 0.25, 0.05], 2)), { low: 0.11, mark: 0.41, high: 0.81 });
  // One word: its own band.
  assert.deepEqual(wordBracket(wordCertainty([0.025, 0.025, 0.9, 0.025, 0.025], 2)), { low: 0.315, mark: 0.41, high: 0.515 });
  // The ends run to the track's ends, and the mark can sit on one.
  assert.deepEqual(wordBracket(wordCertainty([0.5, 0.42, 0.06, 0.01, 0.01], 0)), { low: 0, mark: 0, high: 0.315 });
  assert.deepEqual(wordBracket(wordCertainty([0.01, 0.01, 0.06, 0.42, 0.5], 4)), { low: 0.515, mark: 1, high: 1 });
  // The most likely word is always inside the interval, whatever is asked.
  const draw = rng(97);
  for (let n = 0; n < 2000; n++) {
    const raw = [draw(), draw(), draw(), draw(), draw()].map((x) => x ** 3);
    const sum = raw.reduce((a, b) => a + b, 0);
    const w = wordCertainty(raw.map((x) => x / sum), Math.floor(draw() * 5));
    const b = wordBracket(w);
    assert.ok(w.from <= w.mostLikely && w.mostLikely <= w.to, `${raw}`);
    assert.ok(b.low <= b.mark && b.mark <= b.high && b.low < b.high);
  }
});

test('the reading is the model\'s own predictive and its right-time interval at 90%', () => {
  const learned = createPrior(400, 777);
  for (const t of [464, 462, 463]) updatePosterior(learned, GRID, t, 'jammy', 'firm');
  for (const post of [createPrior(400, 777), learned]) {
    for (const level of [0, 0.22, 0.41, 0.47, 0.62, 1]) {
      for (const t of [380, 464, 560]) {
        const r = certaintyAt(post, GRID, t, level);
        assert.deepEqual(r.words, wordCertainty(yolkWordProbabilities(post, GRID, t), askedWord(level)));
        const ci = predictCookTime(post, GRID, logYolkTarget(level), TIME_RANGE_LOW_Q, TIME_RANGE_HIGH_Q);
        assert.deepEqual(r.time, { low_s: ci.low_s, high_s: ci.high_s });
        // Wider than "still learning"'s 80%.
        const eighty = predictCookTime(post, GRID, logYolkTarget(level));
        assert.ok(r.time.low_s <= eighty.low_s && r.time.high_s >= eighty.high_s);
      }
    }
  }
  // Three jammy eggs called Jammy: very certain at jammy, and the time range
  // narrower than a fresh install's.
  const fresh = certaintyAt(createPrior(400, 777), GRID, 464, 0.41);
  const after = certaintyAt(learned, GRID, 464, 0.41);
  assert.equal(fresh.words.certainty, 'wildGuess');
  assert.notEqual(after.words.certainty, 'wildGuess');
  assert.ok(after.time.high_s - after.time.low_s < (fresh.time.high_s - fresh.time.low_s) / 2);
});

test('the time range in the clock\'s own terms: whole times idle, when to take them out once cooking (onescreen review 2.3)', () => {
  const sure = {
    words: wordCertainty([0.01, 0.01, 0.94, 0.03, 0.01], 2), time: { low_s: 384, high_s: 561 }, at_s: 452,
  };
  assert.deepEqual(timeRangeWords(sure, null), { key: 'certainty.time', low_s: 384, high_s: 561, ofDay: false });
  const start = 1791363600;
  // On the plan it was read on: the start plus the range.
  assert.deepEqual(timeRangeWords(sure, { startedAt_s: start, cookTime_s: 452 }),
    { key: 'certainty.timeOut', low_s: start + 384, high_s: start + 561, ofDay: true });
  // Held over a slow hob's lengthened guess: it moves with the guess.
  assert.deepEqual(timeRangeWords(sure, { startedAt_s: start, cookTime_s: 1000 }),
    { key: 'certainty.timeOut', low_s: start + 932, high_s: start + 1109, ofDay: true });
});
