/**
 * fixtures/outcome.json: the predicted outcome at the chosen time.
 */

import { UNRELATED, createPrior, updatePosterior } from '../../src/core/infer.js';
import { decideAt, decisionApplies } from '../../src/core/decide.js';
import { LEAN_RATIO, LEVEL_HIGH_Q, LEVEL_LOW_Q, leanOf, predictOutcome } from '../../src/core/outcome.js';

import { particleRows } from './shared.js';
import {
  DECIDE_GRID, DECIDE_PARTICLES, DECIDE_SEED, decidePosteriors, meanSolve,
} from './decide.js';
import { logYolkTarget } from '../../src/core/solve.js';

/* What the egg at the chosen time will be like (src/core/outcome.ts): the
 * three yolk answers, a runny white, the level range and the lean. On
 * decide.json's surface and its three posteriors, which are not written out
 * again, and one more written out here: a cook whose three jammy eggs all came
 * out just right with a firm white. Each case is read at the time decided,
 * and 40 s either side of the mean solve, so that both leans and a balance
 * are pinned. */

const outcomeConsistent = createPrior(DECIDE_PARTICLES, DECIDE_SEED);
for (const t of [464, 462, 463]) updatePosterior(outcomeConsistent, DECIDE_GRID, t, logYolkTarget(0.41), 0, 'firm');
export const outcomePosteriors = [...decidePosteriors, { name: 'consistent', eggsLogged: 3, post: outcomeConsistent }];

const OUTCOME_CASES: { posterior: string; level: number; note: string }[] = [
  { posterior: 'prior', level: 0.41, note: 'fresh install, jammy' },
  { posterior: 'prior', level: 0.22, note: 'fresh install, soft: the range runs off the bottom' },
  { posterior: 'prior', level: 1.0, note: 'fresh install, hard: the range runs off the top' },
  { posterior: 'consistent', level: 0.41, note: 'three jammy eggs just right' },
  { posterior: 'consistent', level: 0.62, note: 'the same cook at fudgy' },
  { posterior: 'firmer', level: 0.41, note: 'a cook who likes a firmer yolk: the median sits above the slider' },
  { posterior: 'firmer', level: 0.22, note: 'the same cook at soft' },
  { posterior: 'learned', level: 0.22, note: 'white-bound: a runny white at soft' },
  { posterior: 'learned', level: 0.41, note: 'the same cook at jammy' },
];

export const outcomeFixture = {
  about: 'The predicted outcome at the chosen time: answers, level range and lean. src/core/outcome.ts. Surface and posteriors prior, learned and firmer are decide.json\'s.',
  constants: { leanRatio: LEAN_RATIO, levelLowQ: LEVEL_LOW_Q, levelHighQ: LEVEL_HIGH_Q },
  posteriors: [{
    name: 'consistent',
    eggsLogged: 3,
    weights: outcomeConsistent.weights,
    particles: particleRows(outcomeConsistent),
  }],
  cases: OUTCOME_CASES.map((c) => {
    const pz = outcomePosteriors.find((x) => x.name === c.posterior);
    if (pz === undefined) throw new Error(c.posterior);
    const target = logYolkTarget(c.level);
    const sol = meanSolve(pz, c.level);
    const mean = sol.result.cookTime_s;
    const d = decideAt(pz.post, pz.eggsLogged, DECIDE_GRID, mean, decisionApplies(sol), target);
    return {
      posterior: c.posterior,
      note: c.note,
      level: c.level,
      logNominalTarget: target,
      meanCookTime_s: mean,
      at: [d.cookTime_s, mean - 40, mean + 40].map((t) => ({
        t: t,
        outcome: predictOutcome(pz.post, DECIDE_GRID, t, target),
      })),
    };
  }),
  // 0.375 is exactly 1.5 x 0.25, so the first two sit on the line, which is
  // not a lean.
  leans: [[0.375, 0.25], [0.25, 0.375], [0.376, 0.25], [0.25, 0.376], [0.25, 0.25], [UNRELATED / 3, UNRELATED / 3], [0.9, 0.0], [0.0, 0.9]]
    .map(([soft, firm]) => ({ pTooSoft: soft, pTooFirm: firm, lean: leanOf(soft, firm) })),
};
