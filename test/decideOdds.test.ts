/**
 * E5's odds, "7/10 eggs hit the mark", held to simulated cooks: when the app
 * says seven in ten, seven in ten hit it. E2's calibration test, for the joint
 * answer the odds are about. In a file of its own so that it runs beside
 * test/decide.test.ts rather than after it.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { decideAt } from '../src/core/decide.js';
import { buildDoseGrid, cookTimeForLogWhiteDose, cookTimeForLogYolkDose } from '../src/core/doseGrid.js';
import {
  Feedback, Particle, WhiteReport, answerLikelihood, createPrior, updatePosterior,
} from '../src/core/infer.js';
import { ALPHA_DEFAULT } from '../src/core/constants.js';
import { eggFromMass } from '../src/core/geometry.js';
import { logYolkTarget } from '../src/core/solve.js';
import { Calibration, calibrationDoneness, calibrationParams } from '../src/core/record.js';
import { appSetup, draw, rng } from '../tools/common.js';

const EGG = eggFromMass(0.068);
const SETUP = appSetup();

test('"7/10 eggs hit the mark" is calibrated: simulated cooks hit it as often as they are told', () => {
  // Each cook's truth is a draw from the prior. Every egg is cooked at the time
  // the app would choose - the literature's before the first answer, the choice
  // after - and before it the model says how likely a hit is. The answers are
  // drawn from the truth's own probit, unrelated share and all, and folded. A
  // hit is a white not answered runny and a yolk answered just right. One
  // fixed surface, for speed.
  //
  // Measured on 28 September with `npm run decide -- odds` (400 cooks, six eggs
  // each, 1000 particles): expected calibration error 3.8%; the first three
  // eggs within a point (21% -> 21%, 36% -> 37%, 48% -> 49%), and from the
  // fourth the odds UNDER-state the hits by 4-6 points (60% -> 66% at egg six).
  // This smaller run has the same shape, and the bounds below allow it; the
  // gap is written up in PLAN.md (E5) rather than hidden in a tolerance.
  const grid = buildDoseGrid(EGG, SETUP, 1, { alphaMin: ALPHA_DEFAULT * 0.55, alphaMax: ALPHA_DEFAULT * 1.8, alphaCount: 17, timeMin_s: 200, timeMax_s: 900, timeCount: 71 });
  const levels = [0.22, 0.41, 0.62];
  const random = rng(20260928);
  const truths = createPrior(150, 4242).particles;
  const BINS = 10;
  const predicted = new Array<number>(BINS).fill(0);
  const observed = new Array<number>(BINS).fill(0);
  const counts = new Array<number>(BINS).fill(0);
  for (let c = 0; c < truths.length; c++) {
    const truth: Particle = truths[c];
    const cal: Calibration = { posterior: createPrior(250, 1 + Math.floor(random() * 2147483646)), eggsLogged: 0 };
    const level = levels[c % levels.length];
    const target = logYolkTarget(level);
    for (let egg = 0; egg < 6; egg++) {
      // The mean solve, read off the surface rather than solved: the later of
      // the yolk's time at the posterior mean and the white's. It is where the
      // choice starts from, and a real solve per egg would be most of this
      // test's time; before any egg it is the literature's, as the app's is.
      const params = calibrationParams(cal);
      const whiteTarget = Math.log10(calibrationDoneness(cal, level).whiteDose_min);
      const mean = Math.max(
        cookTimeForLogYolkDose(grid, params.alpha_m2s, target),
        cookTimeForLogWhiteDose(grid, params.alpha_m2s, whiteTarget),
      );
      const d = decideAt(cal.posterior, cal.eggsLogged, grid, mean, true, target);
      const t = d.cookTime_s;
      const ty = ([-1, 0, 1] as Feedback[]).map((y) => answerLikelihood(grid, truth, t, target, y, null));
      const tw = (['runny', 'tender', 'firm'] as WhiteReport[]).map((w) => answerLikelihood(grid, truth, t, target, null, w));
      const y = draw(ty, random());
      const w = draw(tw, random());
      const b = Math.min(BINS - 1, Math.floor(d.odds * BINS));
      predicted[b] += d.odds;
      observed[b] += y === 1 && w !== 0 ? 1 : 0;
      counts[b] += 1;
      updatePosterior(cal.posterior, grid, t, target, (y - 1) as Feedback, (['runny', 'tender', 'firm'] as WhiteReport[])[w]);
      cal.eggsLogged += 1;
    }
  }
  let ece = 0;
  let total = 0;
  const rows: string[] = [];
  for (let b = 0; b < BINS; b++) {
    if (counts[b] === 0) continue;
    const p = predicted[b] / counts[b];
    const o = observed[b] / counts[b];
    rows.push(`${(100 * p).toFixed(0)}% -> ${(100 * o).toFixed(0)}% (${counts[b]})`);
    ece += Math.abs(p - o) * counts[b];
    total += counts[b];
  }
  ece /= total;
  console.log(`# odds calibration, ${total} eggs: ECE ${ece.toFixed(4)}; ${rows.join('; ')}`);
  for (let b = 0; b < BINS; b++) {
    if (counts[b] < 40) continue;
    const p = predicted[b] / counts[b];
    const o = observed[b] / counts[b];
    const se = Math.sqrt(Math.max(p * (1 - p), 0.01) / counts[b]);
    assert.ok(Math.abs(p - o) <= 3 * se + 0.03, `bin ${b}: ${rows.join('; ')}`);
  }
  assert.ok(ece < 0.06, `expected calibration error ${ece.toFixed(4)}: ${rows.join('; ')}`);
});
