/**
 * Simulation-based calibration of the filter, small enough for every run
 * (tools/posterior.ts, `sbc`; `npm run sbc` is the full one).
 *
 * Cooks are drawn from the prior, answer a few eggs through the model's own
 * likelihood, and the filter - PARTICLE_COUNT particles, `updatePosterior`
 * and its resample, as the apps run it - learns from the answers. Where each
 * cook's true values fall in the posterior is uniform over cooks when the
 * filter samples the true posterior. Checked per quantity, with a fixed
 * seed: the share in the outer tenth (too narrow a posterior puts more
 * there), the share in the middle half (too wide puts more there), and the
 * mean (a bias moves it).
 *
 * The bounds are wide enough for what the filter does now - measured over
 * twelve seeds, the outer tenth held 6.5 to 19% and the middle half 39 to
 * 57%, because a thousand particles carry Monte Carlo error that SBC counts
 * as overconfidence (`npm run sbc` puts it at 12-13% in the outer tenth) -
 * and narrow enough to fail on a likelihood raised to the power 1.6
 * (outer tenth to 27%) or 0.5 (middle half to 64%).
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { PARTICLE_COUNT } from '../src/core/policy.js';
import { SBC_QUANTITIES, SBC_SCENARIOS, outerShare, sbc } from '../tools/posterior.js';

for (const [i, cooks] of [[0, 300], [1, 200]] as const) {
  const scenario = SBC_SCENARIOS[i];
  test(`${i + 1}. calibrated: ${scenario.name}, ${cooks} cooks`, () => {
    const r = sbc(scenario, cooks, PARTICLE_COUNT, 0x5bc, false);
    for (const q of SBC_QUANTITIES) {
      const u = r.filter[q];
      assert.equal(u.length, cooks);
      const outer = outerShare(u);
      const middle = u.filter((x) => x > 0.25 && x < 0.75).length / u.length;
      const mean = u.reduce((s, x) => s + x, 0) / u.length;
      assert.ok(outer >= 0.04 && outer <= 0.22, `${q}: ${(100 * outer).toFixed(1)}% in the outer tenth`);
      assert.ok(middle >= 0.36 && middle <= 0.62, `${q}: ${(100 * middle).toFixed(1)}% in the middle half`);
      assert.ok(Math.abs(mean - 0.5) <= 0.08, `${q}: mean ${mean.toFixed(3)}`);
    }
  });
}
