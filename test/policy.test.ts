/**
 * The policy layer: the decisions that turn a Solution into a cook.
 *
 * These are the tests the review found missing. Every one of them names an
 * invariant that a hand-transliterated copy in `ios/App/Kitchen.swift` used to
 * be free to break, because nothing checked either side.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LIMITS, clamp, isWithin, SLIDER_STEPS, snapUp, snapDown, anchorNear,
  targetPeakYolk_C, verdictFor, textureFor, calibrationGrid, DEFAULTS,
  DEFAULT_EGG_MASS_KG, DEFAULT_TIME_TO_BOIL_S, START_TEMP_PRESETS_C, ambientFor,
  rememberBoil, estimateTimeToBoil, hasBoilMemory, volumeKey, BoilMemory,
} from '../src/core/policy.js';
import { DONENESS_ANCHORS, Solution, CookResult } from '../src/core/solve.js';
import { SIZE_CLASSES } from '../src/core/geometry.js';
import { T_ROOM_C } from '../src/core/constants.js';

// --------------------------------------------------------------------------
// shared fixtures
// --------------------------------------------------------------------------

const NO_RESULT: CookResult = {
  cookTime_s: 0, peakYolk_C: 0, peakYolkTime_s: 0, yolkAtPull_C: 0,
  yolkDose_min: 0, whiteDose_min: 0, peakWhite_C: 0,
};

function solutionOf(over: Partial<Solution>): Solution {
  const base: Solution = {
    result: NO_RESULT,
    reachable: true,
    minCookTime_s: 300,
    softestLevel: 0,
    hardestLevel: 1,
    whiteSets: true,
  };
  return { ...base, ...over };
}

// --------------------------------------------------------------------------
// 1. Snapping
// --------------------------------------------------------------------------

test('1. snapping lands on the slider grid and never leaves the track', () => {
  for (let i = 0; i <= 200; i++) {
    const level = i / 200;
    for (const snapped of [snapUp(level), snapDown(level)]) {
      assert.ok(snapped >= 0 && snapped <= 1, `${snapped} off the track from ${level}`);
      const steps = snapped * SLIDER_STEPS;
      assert.ok(
        Math.abs(steps - Math.round(steps)) < 1e-9,
        `${snapped} is not a position the thumb can sit on`,
      );
    }
  }
});

test('1b. snapping rounds away from the unreachable side', () => {
  assert.equal(snapUp(0.413), 0.42);
  assert.equal(snapDown(0.417), 0.41);
  // Bracketing, which is the property the refusal path depends on.
  for (let i = 0; i <= 100; i++) {
    const level = i / 137;
    assert.ok(snapUp(level) >= level - 1e-9, `snapUp went down from ${level}`);
    assert.ok(snapDown(level) <= level + 1e-9, `snapDown went up from ${level}`);
  }
});

test('1c. a level already on the grid is left alone by both', () => {
  // The 1e-9 nudge exists for exactly this: 0.41*100 is 41.000000000000006.
  for (let i = 0; i <= SLIDER_STEPS; i++) {
    const level = i / SLIDER_STEPS;
    close(snapUp(level), level, 1e-12, `snapUp(${level})`);
    close(snapDown(level), level, 1e-12, `snapDown(${level})`);
  }
});

// --------------------------------------------------------------------------
// 2. Anchors
// --------------------------------------------------------------------------

test('2. every anchor is its own nearest anchor', () => {
  for (const anchor of DONENESS_ANCHORS) {
    assert.equal(anchorNear(anchor.level).label, anchor.label);
  }
});

test('2b. anchorNear breaks an exact tie toward the softer anchor', () => {
  // 0.11 is exactly equidistant from Runny (0.00) and Soft (0.22) - one of the
  // few midpoints that is a true tie in binary floating point rather than a
  // near-miss. The rule is "first in the table wins", and it is pinned here
  // because the Swift port has to make the same choice.
  assert.equal(anchorNear(0.11).label, 'Runny');
});

test('2c. anchorNear really is the nearest anchor, everywhere', () => {
  // Brute force against the definition. This is what stops a port's loop
  // bounds or comparison from quietly relabelling part of the track.
  for (let i = 0; i <= 1000; i++) {
    const level = i / 1000;
    let expected = DONENESS_ANCHORS[0];
    for (const anchor of DONENESS_ANCHORS) {
      if (Math.abs(anchor.level - level) < Math.abs(expected.level - level)) expected = anchor;
    }
    assert.equal(anchorNear(level).label, expected.label, `nearest anchor at ${level}`);
  }
});

test('2d. the target temperature is monotonic and hits the anchors exactly', () => {
  for (const anchor of DONENESS_ANCHORS) {
    close(
      targetPeakYolk_C(anchor.level), anchor.approxPeakYolk_C, 1e-12,
      `target at ${anchor.label}`,
    );
  }
  let previous = -Infinity;
  for (let i = 0; i <= 200; i++) {
    const t = targetPeakYolk_C(i / 200);
    assert.ok(t >= previous - 1e-12, `target fell at level ${i / 200}`);
    previous = t;
  }
});

// --------------------------------------------------------------------------
// 3. The verdict
// --------------------------------------------------------------------------

test('3. a reachable solution refuses nothing and moves nothing', () => {
  const v = verdictFor(solutionOf({ reachable: true }), 0.41);
  assert.equal(v.kind, 'none');
  assert.equal(v.snapTo, null);
  assert.equal(v.worthSaying, false);
});

test('3b. too soft for the white snaps UP, past the softest reachable level', () => {
  const v = verdictFor(
    solutionOf({ reachable: false, softestLevel: 0.608 }), 0.22,
  );
  assert.equal(v.kind, 'tooSoftForWhite');
  assert.ok(v.snapTo !== null && v.snapTo >= 0.608, 'snapped short of the softest cook');
  assert.equal(v.limit.label, 'Fudgy');
  assert.equal(v.worthSaying, true);
});

test('3c. harder than the pan reaches snaps DOWN, and never past the limit', () => {
  const v = verdictFor(
    solutionOf({ reachable: false, hardestLevel: 0.735 }), 1.0,
  );
  assert.equal(v.kind, 'harderThanPanReaches');
  assert.ok(v.snapTo !== null && v.snapTo <= 0.735, 'snapped past what the pan can do');
  assert.equal(v.worthSaying, true);
});

test('3d. a white that never sets offers nowhere to snap to', () => {
  const v = verdictFor(
    solutionOf({ reachable: false, whiteSets: false, softestLevel: 1, hardestLevel: 0 }), 0.41,
  );
  assert.equal(v.kind, 'whiteNeverSets');
  assert.equal(v.snapTo, null, 'there is no cook on offer, so there is nothing to snap to');
  assert.equal(v.worthSaying, true, 'the one refusal always worth a sentence');
});

test('3e. a sliver of unreachable track is not worth a sentence', () => {
  // Asking for Jammy when the softest is a hair softer than Jammy: the labels
  // agree, so there is nothing a cook could taste and nothing to explain.
  const v = verdictFor(
    solutionOf({ reachable: false, softestLevel: 0.415 }), 0.41,
  );
  assert.equal(v.kind, 'tooSoftForWhite');
  assert.equal(v.worthSaying, false);
  assert.notEqual(v.snapTo, null, 'the slider still moves; only the sentence is suppressed');
});

test('3f. the verdict never snaps the slider backwards', () => {
  for (let i = 0; i <= 100; i++) {
    const level = i / 100;
    const soft = verdictFor(solutionOf({ reachable: false, softestLevel: 0.5 }), level);
    if (soft.snapTo !== null) {
      assert.ok(soft.snapTo > level, `tooSoft moved ${level} down to ${soft.snapTo}`);
    }
    const hard = verdictFor(solutionOf({ reachable: false, hardestLevel: 0.5 }), level);
    if (hard.snapTo !== null) {
      assert.ok(hard.snapTo < level, `tooHard moved ${level} up to ${hard.snapTo}`);
    }
  }
});

// --------------------------------------------------------------------------
// 4. Texture
// --------------------------------------------------------------------------

test('4. texture bands are ordered and half-open at the stated thresholds', () => {
  assert.deepEqual(textureFor(57.9, 70.9), { white: 'justSet', yolk: 'liquid' });
  assert.deepEqual(textureFor(58.0, 71.0), { white: 'set', yolk: 'soft' });
  assert.deepEqual(textureFor(65.0, 81.9), { white: 'set', yolk: 'jammy' });
  assert.deepEqual(textureFor(68.0, 82.0), { white: 'firm', yolk: 'fudgy' });
  assert.deepEqual(textureFor(73.0, 90.0), { white: 'firm', yolk: 'set' });
});

test('4b. the jammy band contains the default slider position', () => {
  // DEFAULTS.doneness is meant to be Jammy; if the anchors or the bands move,
  // this is what notices.
  assert.equal(anchorNear(DEFAULTS.doneness).label, 'Jammy');
  assert.equal(textureFor(targetPeakYolk_C(DEFAULTS.doneness), 85).yolk, 'jammy');
});

// --------------------------------------------------------------------------
// 5. The calibration grid — the bounds that decide the posterior
// --------------------------------------------------------------------------

test('5. the grid brackets the cook that was actually performed', () => {
  const g = calibrationGrid(1.4e-7, 441);
  assert.ok(g.alphaMin < 1.4e-7 && g.alphaMax > 1.4e-7, 'grid does not contain its centre');
  assert.ok(g.timeMin_s < 441 && g.timeMax_s > 441, 'grid does not contain the cook');
  assert.equal(g.alphaCount, 21);
  assert.equal(g.timeCount, 32);
});

test('5b. a very short cook still gets a grid with a floor on it', () => {
  // 0.35 * 60 is 21 s, which is not a cook. The floor is what stops the
  // interpolation domain collapsing on a fast egg.
  const g = calibrationGrid(1.4e-7, 60);
  assert.ok(g.timeMin_s >= 60, `time floor collapsed to ${g.timeMin_s}`);
  assert.ok(g.timeMax_s > g.timeMin_s, 'grid has no width');
});

test('5c. the grid scales with the cook rather than sitting at fixed seconds', () => {
  const short = calibrationGrid(1.4e-7, 400);
  const long = calibrationGrid(1.4e-7, 800);
  assert.ok(long.timeMax_s > short.timeMax_s, 'grid did not follow the cook');
  close(long.timeMax_s / short.timeMax_s, 2, 1e-12, 'grid scaling');
});

// --------------------------------------------------------------------------
// 6. Bounds and defaults
// --------------------------------------------------------------------------

test('6. every limit is non-empty and every default sits inside its limit', () => {
  for (const [name, limit] of Object.entries(LIMITS)) {
    assert.ok(limit.lo < limit.hi, `${name} has an empty range`);
  }
  assert.ok(isWithin(DEFAULTS.waterLitres, LIMITS.waterLitres));
  assert.ok(isWithin(DEFAULTS.eggCount, LIMITS.eggCount));
  assert.ok(isWithin(DEFAULTS.doneness, LIMITS.doneness));
  assert.ok(isWithin(DEFAULTS.altitude_m, LIMITS.altitude_m));
  assert.ok(isWithin(DEFAULTS.customMinor_mm, LIMITS.minor_mm));
  assert.ok(isWithin(DEFAULTS.customStart_C, LIMITS.eggTemp_C));
  assert.ok(isWithin(DEFAULT_TIME_TO_BOIL_S, LIMITS.timeToBoil_s));
  assert.ok(isWithin(DEFAULTS.sizeIndex, LIMITS.sizeIndex));
});

test('6b. the default mass is the default size class, not a second opinion', () => {
  assert.equal(DEFAULT_EGG_MASS_KG, SIZE_CLASSES[DEFAULTS.sizeIndex].mass_kg);
  assert.ok(isWithin(DEFAULT_EGG_MASS_KG * 1000, LIMITS.mass_g));
});

test('6c. clamp pins to the bounds and refuses to pass a non-number through', () => {
  assert.equal(clamp(5, LIMITS.eggCount), 5);
  assert.equal(clamp(0, LIMITS.eggCount), LIMITS.eggCount.lo);
  assert.equal(clamp(99, LIMITS.eggCount), LIMITS.eggCount.hi);
  assert.equal(clamp(NaN, LIMITS.eggCount), LIMITS.eggCount.lo);
  assert.equal(clamp(Infinity, LIMITS.eggCount), LIMITS.eggCount.lo);
});

test('6d. the room follows the egg only once the egg says something about it', () => {
  assert.equal(ambientFor(START_TEMP_PRESETS_C.fridge), T_ROOM_C, 'a fridge egg says nothing');
  assert.equal(ambientFor(START_TEMP_PRESETS_C.room), T_ROOM_C);
  assert.equal(ambientFor(26), 26, 'an egg left out in a hot kitchen IS the kitchen');
});

// --------------------------------------------------------------------------
// 7. Boil memory
// --------------------------------------------------------------------------

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
  // Insertion order used to decide this on the web and Dictionary order on
  // iOS, so the same two pans could give the two apps different answers.
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
