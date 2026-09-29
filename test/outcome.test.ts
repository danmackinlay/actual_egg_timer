/**
 * The predicted outcome at the chosen time (src/core/outcome.ts): the three
 * yolk answers, a runny white, the level range and the lean.
 *
 * What is checked here is the reasoning - the answers are the ones the model
 * already predicts, the range leaves the taste offset out and keeps the noise
 * in, the clamps say what they mean - and, on simulated cooks, that the range
 * holds the egg about four times in five and the answers are calibrated.
 * `fixtures/outcome.json` pins the arithmetic for the Swift port; `npm run
 * decide -- outcome` prints the larger run and the cost.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { decideAt } from '../src/core/decide.js';
import {
  buildDoseGrid, cookTimeForLogWhiteDose, cookTimeForLogYolkDose, lookupLogYolkDose,
} from '../src/core/doseGrid.js';
import {
  FEEDBACK_BAND, Feedback, Particle, Posterior, UNRELATED, WhiteReport, answerLikelihood,
  createPrior, updatePosterior, whiteAnswerProbabilities, yolkAnswerProbabilities,
} from '../src/core/infer.js';
import { LEAN_RATIO, Outcome, leanOf, predictOutcome } from '../src/core/outcome.js';
import { ALPHA_DEFAULT } from '../src/core/constants.js';
import { eggFromMass } from '../src/core/geometry.js';
import { logYolkTarget, sliderFromYolkDose } from '../src/core/solve.js';
import { Calibration, calibrationDoneness, calibrationParams } from '../src/core/record.js';
import { appSetup, draw, rng } from '../tools/common.js';

const EGG = eggFromMass(0.068);
const SETUP = appSetup();
const GRID = buildDoseGrid(EGG, SETUP, 1, { alphaMin: ALPHA_DEFAULT * 0.55, alphaMax: ALPHA_DEFAULT * 1.8, alphaCount: 17, timeMin_s: 200, timeMax_s: 900, timeCount: 71 });
const JAMMY = logYolkTarget(0.41);

function learned(): Posterior {
  const post = createPrior(400, 777);
  for (const t of [464, 462, 463]) updatePosterior(post, GRID, t, JAMMY, 0, 'firm');
  return post;
}

test('the answers are the model\'s own: the same as the predictive, summing to one', () => {
  for (const post of [createPrior(400, 777), learned()]) {
    for (const t of [380, 430, 464, 520, 640]) {
      const o = predictOutcome(post, GRID, t, JAMMY);
      const yolk = yolkAnswerProbabilities(post, GRID, t, JAMMY);
      const white = whiteAnswerProbabilities(post, GRID, t);
      assert.ok(Math.abs(o.pTooSoft - yolk[0]) < 1e-12);
      assert.ok(Math.abs(o.pJustRight - yolk[1]) < 1e-12);
      assert.ok(Math.abs(o.pTooFirm - yolk[2]) < 1e-12);
      assert.ok(Math.abs(o.pWhiteRunny - white[0]) < 1e-12);
      assert.ok(Math.abs(o.pTooSoft + o.pJustRight + o.pTooFirm - 1) < 1e-12);
      assert.ok(o.levelLow <= o.levelMedian && o.levelMedian <= o.levelHigh);
      assert.ok(o.levelLow >= 0 && o.levelHigh <= 1);
    }
  }
});

test('the level range leaves the taste offset out: a cook\'s taste moves the answers, not the egg', () => {
  const post = learned();
  const firmer: Posterior = {
    ...post,
    particles: post.particles.map((p) => ({ ...p, logDoseOffset: p.logDoseOffset + 0.2 })),
  };
  const a = predictOutcome(post, GRID, 470, JAMMY);
  const b = predictOutcome(firmer, GRID, 470, JAMMY);
  assert.equal(b.levelLow, a.levelLow);
  assert.equal(b.levelMedian, a.levelMedian);
  assert.equal(b.levelHigh, a.levelHigh);
  // The same egg is now more often too soft for this cook.
  assert.ok(b.pTooSoft > a.pTooSoft + 0.05, `${a.pTooSoft} -> ${b.pTooSoft}`);
});

test('the level range keeps the noise: it is wider than the particles alone, and shrinks to them without it', () => {
  const post = learned();
  const t = 464;
  const o = predictOutcome(post, GRID, t, JAMMY);
  // The particles' own spread, by the weighted quantile of their delivered
  // levels.
  const rows = post.particles
    .map((p, i) => ({ t: sliderFromYolkDose(10 ** lookupLogYolkDose(GRID, p.alpha_m2s, t)), w: post.weights[i] }))
    .sort((x, y) => x.t - y.t);
  const q = (x: number): number => {
    let acc = 0;
    for (const r of rows) { acc += r.w; if (acc >= x) return r.t; }
    return rows[rows.length - 1].t;
  };
  assert.ok(o.levelHigh - o.levelLow > 1.2 * (q(0.9) - q(0.1)), `${o.levelLow}-${o.levelHigh} against ${q(0.1)}-${q(0.9)}`);
  // With next to no noise the mixture is the particles, and its points are
  // theirs, to within the step between neighbouring particles.
  const quiet: Posterior = { ...post, particles: post.particles.map((p) => ({ ...p, noise: 1e-6 })) };
  const s = predictOutcome(quiet, GRID, t, JAMMY);
  assert.ok(Math.abs(s.levelLow - q(0.1)) < 2e-3, `${s.levelLow} against ${q(0.1)}`);
  assert.ok(Math.abs(s.levelMedian - q(0.5)) < 2e-3, `${s.levelMedian} against ${q(0.5)}`);
  assert.ok(Math.abs(s.levelHigh - q(0.9)) < 2e-3, `${s.levelHigh} against ${q(0.9)}`);
});

test('the clamps: under the runny end reads 0, past the hard end reads 1', () => {
  const post = learned();
  const early = predictOutcome(post, GRID, 250, JAMMY);
  assert.equal(early.levelLow, 0);
  assert.equal(early.levelMedian, 0);
  const late = predictOutcome(post, GRID, 900, JAMMY);
  assert.equal(late.levelHigh, 1);
  assert.equal(late.levelMedian, 1);
});

test('the lean: three misses in five one way, and nothing on the line', () => {
  assert.equal(LEAN_RATIO, 1.5);
  assert.equal(leanOf(0.375, 0.25), 'balanced');
  assert.equal(leanOf(0.376, 0.25), 'soft');
  assert.equal(leanOf(0.25, 0.376), 'firm');
  assert.equal(leanOf(UNRELATED / 3, UNRELATED / 3), 'balanced');
  const post = learned();
  assert.equal(predictOutcome(post, GRID, 430, JAMMY).lean, 'soft');
  assert.equal(predictOutcome(post, GRID, 500, JAMMY).lean, 'firm');
});

/* ------------------------------------------------------ simulated cooks */

function normal(random: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(2 * Math.PI * random());
}

/** One egg from the truth: the delivered log yolk dose - the time-scale's,
 *  and a draw of the cook's own noise - and the yolk answer it earns, through
 *  the same cutpoints the probit has, unrelated share and all. */
function egg(truth: Particle, t: number, target: number, random: () => number): { dose: number; yolk: number } {
  const dose = lookupLogYolkDose(GRID, truth.alpha_m2s, t) + truth.noise * normal(random);
  const latent = dose - (target + truth.logDoseOffset);
  const yolk = random() < UNRELATED
    ? Math.min(2, Math.floor(3 * random()))
    : latent < -FEEDBACK_BAND ? 0 : latent > FEEDBACK_BAND ? 2 : 1;
  return { dose: dose, yolk: yolk };
}

interface Tally { n: number; inside: number; under: number; over: number }

test('on simulated cooks the level range holds the egg about four times in five, and the answers are calibrated', () => {
  // As test/decideOdds.test.ts: each cook's truth a draw from the prior, every
  // egg at the time the app would choose, the answers the truth's own. Here
  // the egg is drawn first - a delivered dose, the truth's time-scale plus its
  // noise - and the yolk answer read off it, so the range can be checked
  // against the egg and the probabilities against the answer.
  const random = rng(20260927);
  const truths = createPrior(150, 5151).particles;
  const levels = [0.22, 0.41, 0.62];
  const range: Tally = { n: 0, inside: 0, under: 0, over: 0 };
  const BINS = 10;
  const bins = ['soft', 'right', 'firm', 'runny'].map(() => ({
    p: new Array<number>(BINS).fill(0), o: new Array<number>(BINS).fill(0), n: new Array<number>(BINS).fill(0),
  }));
  const tally = (k: number, p: number, hit: boolean): void => {
    const b = Math.min(BINS - 1, Math.floor(p * BINS));
    bins[k].p[b] += p; bins[k].o[b] += hit ? 1 : 0; bins[k].n[b] += 1;
  };
  for (let c = 0; c < truths.length; c++) {
    const truth = truths[c];
    const cal: Calibration = { posterior: createPrior(250, 1 + Math.floor(random() * 2147483646)), eggsLogged: 0 };
    const level = levels[c % levels.length];
    const target = logYolkTarget(level);
    for (let k = 0; k < 6; k++) {
      const params = calibrationParams(cal);
      const whiteTarget = Math.log10(calibrationDoneness(cal, level).whiteDose_min);
      const mean = Math.max(
        cookTimeForLogYolkDose(GRID, params.alpha_m2s, target),
        cookTimeForLogWhiteDose(GRID, params.alpha_m2s, whiteTarget),
      );
      const t = decideAt(cal.posterior, cal.eggsLogged, GRID, mean, true, target).cookTime_s;
      const o: Outcome = predictOutcome(cal.posterior, GRID, t, target);
      const e = egg(truth, t, target, random);
      const tw = (['runny', 'tender', 'firm'] as WhiteReport[]).map((w) => answerLikelihood(GRID, truth, t, target, null, w));
      const w = draw(tw, random());
      const delivered = sliderFromYolkDose(10 ** e.dose);
      range.n += 1;
      if (delivered < o.levelLow) range.under += 1;
      else if (delivered > o.levelHigh) range.over += 1;
      else range.inside += 1;
      tally(0, o.pTooSoft, e.yolk === 0);
      tally(1, o.pJustRight, e.yolk === 1);
      tally(2, o.pTooFirm, e.yolk === 2);
      tally(3, o.pWhiteRunny, w === 0);
      updatePosterior(cal.posterior, GRID, t, target, (e.yolk - 1) as Feedback, (['runny', 'tender', 'firm'] as WhiteReport[])[w]);
      cal.eggsLogged += 1;
    }
  }
  const share = (x: number): string => `${(100 * x / range.n).toFixed(1)}%`;
  const eces = bins.map((b) => {
    let ece = 0;
    let total = 0;
    for (let i = 0; i < BINS; i++) {
      if (b.n[i] === 0) continue;
      ece += Math.abs(b.p[i] - b.o[i]);
      total += b.n[i];
    }
    return ece / total;
  });
  console.log(`# outcome, ${range.n} eggs: inside the range ${share(range.inside)}, under ${share(range.under)}, over ${share(range.over)}; `
    + `ECE too soft ${eces[0].toFixed(4)}, just right ${eces[1].toFixed(4)}, too firm ${eces[2].toFixed(4)}, runny ${eces[3].toFixed(4)}`);
  const inside = range.inside / range.n;
  assert.ok(Math.abs(inside - 0.8) < 0.05, `inside ${inside}`);
  assert.ok(range.under / range.n > 0.05 && range.under / range.n < 0.15, `under ${range.under}`);
  assert.ok(range.over / range.n > 0.05 && range.over / range.n < 0.15, `over ${range.over}`);
  for (const ece of eces) assert.ok(ece < 0.06, `ECE ${eces.join(', ')}`);
});
