/**
 * The web app's surface and odds builds (`src/ui/decisionGrids.ts`): the key an
 * odds profile is cached by, and what happens when a build throws. A build that throws must reject, not hang, and
 * must leave no trace, so the same pot can be asked again. A throw on the
 * main thread once left the promise pending and the key in
 * `decisionBuilds` / `profileBuilds`, and that pot never got a direction.
 *
 * Node has no Web Worker, so these run the main-thread fallback, which is the
 * path that hung.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { decisionInputs, type DecisionInputs } from '../src/core/decide.ts';
import { CALIBRATION_SEED, PARTICLE_COUNT, freshCalibration } from '../src/core/record.ts';
import { decisionGrid, oddsProfileFor, profileKey } from '../src/ui/decisionGrids.ts';
import { eggFromMass } from '../src/core/geometry.ts';
import { appSetup } from '../tools/common.ts';

/** A pot that cannot be built: no parameters to key or build the surface
 *  with, a null `params`. */
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

test('two posteriors whose white shifts cancel are cached under different keys', () => {
  const c = freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED);
  // Every particle's white cutpoint offset and gap swapped: each moves, their
  // sum stays the same to the bit, and so does every other dimension.
  const swapped = {
    ...c,
    posterior: {
      ...c.posterior,
      particles: c.posterior.particles.map((p) => ({ ...p, whiteOffset: p.whiteFirmGap, whiteFirmGap: p.whiteOffset })),
    },
  };
  const inputs = decisionInputs(c, eggFromMass(0.06), appSetup());
  assert.notEqual(profileKey(inputs, swapped), profileKey(inputs, c));
});
