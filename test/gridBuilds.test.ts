/**
 * The web app's surface and odds builds (`src/ui/decisionGrids.ts`) when a build
 * throws: WORKLIST 2.3's path. A build that throws must reject, not hang, and
 * must leave no trace, so the same pot can be asked again. Before 5005798 a
 * throw on the main thread left the promise pending and the key in
 * `decisionBuilds` / `profileBuilds`, and that pot never got a direction.
 *
 * Node has no Web Worker, so these run the main-thread fallback, which is the
 * path that hung.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DecisionInputs } from '../src/core/decide.js';
import { PARTICLE_COUNT, CALIBRATION_SEED } from '../src/core/policy.js';
import { freshCalibration } from '../src/core/record.js';
import { decisionGrid, oddsProfileFor } from '../src/ui/decisionGrids.js';
import { eggFromMass } from '../src/core/geometry.js';
import { appSetup } from '../tools/common.js';

/** A pot whose build throws: no parameters to build the surface with, so
 *  `decisionGridRequest` meets a null `params`. */
function brokenInputs(): DecisionInputs {
  return {
    egg: eggFromMass(0.06), setup: appSetup(), params: null,
  } as unknown as DecisionInputs;
}

test('a surface build that throws rejects, and the same pot can be asked again', async () => {
  const inputs = brokenInputs();
  const first = decisionGrid(inputs);
  await assert.rejects(first);
  // Had the key been kept, the second ask would be handed the first build.
  const second = decisionGrid(inputs);
  assert.notEqual(second, first, 'a fresh build, not the failed one');
  await assert.rejects(second);
});

test('an odds profile whose surface throws rejects, and can be asked again', async () => {
  const inputs = brokenInputs();
  const c = freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED);
  const first = oddsProfileFor(inputs, c);
  await assert.rejects(first);
  const second = oddsProfileFor(inputs, c);
  assert.notEqual(second, first, 'a fresh build, not the failed one');
  await assert.rejects(second);
});
