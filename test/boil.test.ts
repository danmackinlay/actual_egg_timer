/**
 * Boil memory (`src/core/boil.ts`).
 *
 * Every test names an invariant both apps depend on; the Swift twin is held
 * to the same answers by `fixtures/boil.json`.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { LIMITS, isWithin } from '../src/core/inputs.js';
import {
  BoilMemory, DEFAULT_TIME_TO_BOIL_S, estimateTimeToBoil, hasBoilMemory, rememberBoil, volumeKey,
} from '../src/core/boil.js';

test('7. a first measurement is taken whole; a second is blended half and half', () => {
  let m: BoilMemory = {};
  m = rememberBoil(m, 2, 480);
  assert.equal(estimateTimeToBoil(m, 2), 480);
  m = rememberBoil(m, 2, 600);
  assert.equal(estimateTimeToBoil(m, 2), 540, 'one odd run should not dominate');
});

test('7b. an incredible measurement is refused rather than remembered', () => {
  const m = rememberBoil({}, 2, 3);
  assert.equal(hasBoilMemory(m), false, 'a 3 s tap is a double tap, not a boil');
  assert.equal(estimateTimeToBoil(m, 2), DEFAULT_TIME_TO_BOIL_S);
  assert.equal(hasBoilMemory(rememberBoil({}, 2, 99999)), false, 'a tab left open');
});

test('7c. an unmeasured volume scales from the nearest measured one', () => {
  const m = rememberBoil({}, 2, 480);
  // Twice the water, roughly twice the energy, so roughly twice the time.
  close(estimateTimeToBoil(m, 4), 960, 1e-9, 'scaled estimate');
  close(estimateTimeToBoil(m, 1), 240, 1e-9, 'scaled estimate');
});

test('7d. equidistant volumes resolve the same way every time', () => {
  // Neither insertion order (the web) nor Dictionary order (iOS) may decide
  // this, or the same two pans could give the two apps different answers.
  const forwards = rememberBoil(rememberBoil({}, 1, 300), 3, 900);
  const backwards = rememberBoil(rememberBoil({}, 3, 900), 1, 300);
  assert.equal(estimateTimeToBoil(forwards, 2), estimateTimeToBoil(backwards, 2));
  // Ties go to the smaller volume: 1 L at 300 s, scaled to 2 L.
  close(estimateTimeToBoil(forwards, 2), 600, 1e-9, 'tie-break');
});

test('7e. a scaled estimate is still held to the credible range', () => {
  const m = rememberBoil({}, 0.5, 40);
  assert.ok(
    isWithin(estimateTimeToBoil(m, 12), LIMITS.timeToBoil_s),
    'extrapolating to a stockpot escaped the bounds',
  );
});

test('7f. the volume key is stable to one decimal place', () => {
  assert.equal(volumeKey(2), volumeKey(2.04), 'a wobble in litres is the same pan');
  assert.notEqual(volumeKey(2), volumeKey(2.5));
});

function close(actual: number, expected: number, tol: number, what: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${what}: expected ${expected} +/- ${tol}, got ${actual} (delta ${actual - expected})`,
  );
}
