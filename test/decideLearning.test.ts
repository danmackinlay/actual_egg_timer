/**
 * Choosing the time under uncertainty (src/core/decide.ts): how fast the
 * posterior narrows, and what the choice does with two runny whites at soft.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DECISION_WINDOW_S } from '../src/core/decide.ts';
import { buildRequestedGrid } from '../src/core/doseGrid.ts';
import {
  type CookTimePrediction, YOLK_WORDS, type YolkWord, predictCookTime, whiteProbit, yolkWordProbit,
} from '../src/core/infer.ts';
import { ALPHA_DEFAULT } from '../src/core/constants.ts';
import { logYolkTarget } from '../src/core/solve.ts';
import { type EggRecord, copyCalibration, foldRecord, gridRequestFor, replay } from '../src/core/record.ts';
import { gridFor, recordAt } from '../tools/common.ts';
import { COARSE, EGG, PRIOR, PRIOR_GRID, SETUP, decideFor } from './decisions.ts';

// --------------------------------------------------------------------------
// 5. How fast the posterior narrows
// --------------------------------------------------------------------------

/** The owner's "still learning" rule:
 *  the 80% interval of the right cook time wider than +-15 s. No screen shows
 *  it and `Decision` does not carry it; this computes it on demand, from
 *  `predictCookTime`. */
function stillLearning(interval: CookTimePrediction): boolean {
  return 0.5 * (interval.high_s - interval.low_s) > 15;
}

test('the interval narrows below +-15 s after a few consistent eggs, stays there, and a forget widens it', () => {
  // A kitchen that is exactly the literature's, cooked at jammy at the times
  // the app chooses, answering as the truth would without noise. Measured on
  // 28 September on the app's surfaces: the interval is +-72 s before any
  // egg, +-22 after one, +-13 after two, and narrows egg by egg from there;
  // under a fixed resample jitter it would rise again at every resample. An
  // egg nobody answered about teaches nothing and moves nothing.
  const truth = { alpha_m2s: ALPHA_DEFAULT, logDoseOffset: 0, noise: 1e-6, whiteOffset: 0, whiteFirmGap: 1.08 };
  const flags: boolean[] = [];
  const widths: string[] = [];
  const c = copyCalibration(PRIOR);
  for (let egg = 0; egg <= 8; egg++) {
    const grid = gridFor(c, EGG, SETUP);
    const d = decideFor(c, grid, 0.41);
    const interval = predictCookTime(c.posterior, grid, logYolkTarget(0.41));
    flags.push(stillLearning(interval));
    widths.push((0.5 * (interval.high_s - interval.low_s)).toFixed(1));
    const t = d.cookTime_s;
    const truthGrid = buildRequestedGrid({ egg: EGG, setup: SETUP, spec: COARSE(ALPHA_DEFAULT, t) });
    const y = yolkWordProbit(truthGrid, truth, t);
    const w = whiteProbit(truthGrid, truth, t);
    const r = recordAt(0.41, t, YOLK_WORDS[y.indexOf(Math.max(...y))], w[0] > 0.5 ? 'runny' : w[2] > 0.5 ? 'firm' : 'tender');
    foldRecord(c, r, buildRequestedGrid(gridRequestFor(c, r, COARSE)));
    const unanswered = recordAt(0.41, t, null, null);
    const before = JSON.stringify(c);
    foldRecord(c, unanswered, buildRequestedGrid(gridRequestFor(c, unanswered, COARSE)));
    assert.equal(JSON.stringify(c), before, 'an unanswered egg moves nothing');
  }
  console.log(`# still learning at jammy, a consistent cook: +-${widths.join(', ')} s`);
  const off = flags.indexOf(false);
  assert.ok(off >= 2 && off <= 5, `first quiet after egg ${off}: +-${widths.join(', ')} s`);
  assert.ok(flags.slice(off).every((f) => !f), `came back: +-${widths.join(', ')} s`);
  // "Forget what it learned" is a fresh calibration: learning again.
  assert.equal(stillLearning(predictCookTime(PRIOR.posterior, PRIOR_GRID, logYolkTarget(0.41))), true);
});

// --------------------------------------------------------------------------
// 7. Two runny whites at soft, under the choice
// --------------------------------------------------------------------------

test('two runny whites at soft: what the choice does at soft and at jammy', () => {
  // Two eggs at soft, the white runny - alone, or with the yolk just right -
  // built two ways. 'mean' cooks each at the time the MEAN solve recommends
  // (test/infer.test.ts), so it shows what the choice makes of the same
  // evidence; 'chosen' cooks the second egg at the time the choice made after
  // the first. The known limit stands (INFERENCE.md section 3): a runny white
  // is blamed on the time-scale about 2:1, so jammy moves too, and the choice
  // does not try to fix that. The full numbers are `npm run decide --
  // runny`, on the app's surfaces; these are coarser, and within a few
  // seconds of them.
  const rows: string[] = [];
  const before = [decideFor(PRIOR, PRIOR_GRID, 0.22), decideFor(PRIOR, PRIOR_GRID, 0.41)];
  for (const sequence of ['mean', 'chosen'] as const) {
    for (const yolk of [null, 'soft'] as (YolkWord | null)[]) {
      let cal = PRIOR;
      const log: EggRecord[] = [];
      for (let i = 0; i < 2; i++) {
        const d = decideFor(cal, gridFor(cal, EGG, SETUP), 0.22);
        log.push(recordAt(0.22, sequence === 'mean' ? d.meanCookTime_s : d.cookTime_s, yolk, 'runny'));
        cal = replay(PRIOR, log, COARSE);
      }
      const grid = gridFor(cal, EGG, SETUP);
      const after = [decideFor(cal, grid, 0.22), decideFor(cal, grid, 0.41)];
      rows.push(`${sequence}, ${yolk === null ? 'white only' : 'yolk soft too'}, cooked at ${log.map((r) => r.recommended_s.toFixed(0)).join(' and ')}: `
        + `soft ${before[0].cookTime_s.toFixed(0)} -> mean ${after[0].meanCookTime_s.toFixed(0)}, chosen ${after[0].cookTime_s.toFixed(0)} (${after[0].oddsTenths}/10); `
        + `jammy ${before[1].cookTime_s.toFixed(0)} -> mean ${after[1].meanCookTime_s.toFixed(0)}, chosen ${after[1].cookTime_s.toFixed(0)} (${after[1].oddsTenths}/10)`);
      assert.ok(after[0].cookTime_s > before[0].cookTime_s + 15, rows.join('\n'));
      // Where the white binds, the choice leans later than the mean solve, never
      // earlier: the mean solve times the white at its median, a coin flip on
      // runny, and a runny white costs three.
      assert.ok(after[0].cookTime_s >= after[0].meanCookTime_s - 1, rows.join('\n'));
      assert.ok(Math.abs(after[0].cookTime_s - after[0].meanCookTime_s) <= DECISION_WINDOW_S + 1e-9);
    }
  }
  console.log(`# ${rows.join('\n# ')}`);
});
