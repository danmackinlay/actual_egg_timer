/**
 * The doneness slider (`src/core/slider.ts`): snapping, the nearest label,
 * the target temperature, which words can be reached, and the refusal verdict.
 *
 * Every test names an invariant both apps depend on; the Swift twin is held
 * to the same answers by `fixtures/slider.json`.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SLIDER_STEPS, anchorNear, anchorReachable, snapDown, snapUp, targetPeakYolk_C, verdictFor,
} from '../src/core/slider.ts';
import { type CookResult, DONENESS_ANCHORS, type Solution } from '../src/core/solve.ts';

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

test('snapping lands on the slider grid and never leaves the track', () => {
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

test('snapping rounds away from the unreachable side', () => {
  assert.equal(snapUp(0.413), 0.42);
  assert.equal(snapDown(0.417), 0.41);
  // Bracketing, which is the property the refusal path depends on.
  for (let i = 0; i <= 100; i++) {
    const level = i / 137;
    assert.ok(snapUp(level) >= level - 1e-9, `snapUp went down from ${level}`);
    assert.ok(snapDown(level) <= level + 1e-9, `snapDown went up from ${level}`);
  }
});

test('a level already on the grid is left alone by both', () => {
  // The 1e-9 nudge exists for exactly this: 0.41*100 is 41.000000000000006.
  for (let i = 0; i <= SLIDER_STEPS; i++) {
    const level = i / SLIDER_STEPS;
    close(snapUp(level), level, 1e-12, `snapUp(${level})`);
    close(snapDown(level), level, 1e-12, `snapDown(${level})`);
  }
});

test('every anchor is its own nearest anchor', () => {
  for (const anchor of DONENESS_ANCHORS) {
    assert.equal(anchorNear(anchor.level).key, anchor.key);
  }
});

test('anchorNear breaks an exact tie toward the softer anchor', () => {
  // 0.11 is exactly equidistant from Runny (0.00) and Soft (0.22) - one of the
  // few midpoints that is a true tie in binary floating point rather than a
  // near-miss. The rule is "first in the table wins", and it is pinned here
  // because the Swift port has to make the same choice.
  assert.equal(anchorNear(0.11).key, 'doneness.runny');
});

test('anchorNear really is the nearest anchor, everywhere', () => {
  // Brute force against the definition. This is what stops a port's loop
  // bounds or comparison from quietly relabelling part of the track.
  for (let i = 0; i <= 1000; i++) {
    const level = i / 1000;
    let expected = DONENESS_ANCHORS[0];
    for (const anchor of DONENESS_ANCHORS) {
      if (Math.abs(anchor.level - level) < Math.abs(expected.level - level)) expected = anchor;
    }
    assert.equal(anchorNear(level).key, expected.key, `nearest anchor at ${level}`);
  }
});

test('the target temperature is monotonic and hits the anchors exactly', () => {
  for (const anchor of DONENESS_ANCHORS) {
    close(
      targetPeakYolk_C(anchor.level), anchor.approxPeakYolk_C, 1e-12,
      `target at ${anchor.key}`,
    );
  }
  let previous = -Infinity;
  for (let i = 0; i <= 200; i++) {
    const t = targetPeakYolk_C(i / 200);
    assert.ok(t >= previous - 1e-12, `target fell at level ${i / 200}`);
    previous = t;
  }
});

test('a reachable solution refuses nothing and moves nothing', () => {
  const v = verdictFor(solutionOf({ reachable: true }), 0.41);
  assert.equal(v.kind, 'none');
  assert.equal(v.snapTo, null);
  assert.equal(v.worthSaying, false);
});

test('too soft for the white snaps UP, past the softest reachable level', () => {
  const v = verdictFor(
    solutionOf({ reachable: false, softestLevel: 0.608 }), 0.22,
  );
  assert.equal(v.kind, 'tooSoftForWhite');
  assert.ok(v.snapTo !== null && v.snapTo >= 0.608, 'snapped short of the softest cook');
  assert.equal(v.limit.key, 'doneness.fudgy');
  assert.equal(v.worthSaying, true);
});

test('harder than the pan reaches snaps DOWN, and never past the limit', () => {
  const v = verdictFor(
    solutionOf({ reachable: false, hardestLevel: 0.735 }), 1.0,
  );
  assert.equal(v.kind, 'harderThanPanReaches');
  assert.ok(v.snapTo !== null && v.snapTo <= 0.735, 'snapped past what the pan can do');
  assert.equal(v.worthSaying, true);
});

test('a white that never sets offers nowhere to snap to', () => {
  const v = verdictFor(
    solutionOf({ reachable: false, whiteSets: false, softestLevel: 1, hardestLevel: 0 }), 0.41,
  );
  assert.equal(v.kind, 'whiteNeverSets');
  assert.equal(v.snapTo, null, 'there is no cook on offer, so there is nothing to snap to');
  assert.equal(v.worthSaying, true, 'the one refusal always worth a sentence');
});

test('a sliver of unreachable track is not worth a sentence', () => {
  // Asking for Jammy when the softest is a hair softer than Jammy: the labels
  // agree, so there is nothing a cook could taste and nothing to explain.
  const v = verdictFor(
    solutionOf({ reachable: false, softestLevel: 0.415 }), 0.41,
  );
  assert.equal(v.kind, 'tooSoftForWhite');
  assert.equal(v.worthSaying, false);
  assert.notEqual(v.snapTo, null, 'the slider still moves; only the sentence is suppressed');
});

test('the verdict never snaps the slider backwards', () => {
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

test('a tick word is struck through only when none of its positions can be reached', () => {
  const reach = (softest: number, hardest: number): boolean[] => DONENESS_ANCHORS.map(
    (_, i) => anchorReachable(i, softest, hardest),
  );
  // After a runny white the floor moves to 0.05-0.09, which is still Runny.
  assert.deepEqual(reach(0.07, 1), [true, true, true, true, true]);
  // Runny's last position is 0.11, the midpoint with Soft, where a tie goes
  // to the softer word; past it Runny is gone.
  assert.deepEqual(reach(0.11, 1), [true, true, true, true, true]);
  assert.deepEqual(reach(0.115, 1), [false, true, true, true, true]);
  // At the hard end the midpoint is 0.81, which in binary sits a hair
  // nearer Hard; 0.80 is Fudgy's last position.
  assert.deepEqual(reach(0, 0.80), [true, true, true, true, false]);
  assert.deepEqual(reach(0, 0.81), [true, true, true, true, true]);
  // A pan whose white never sets reaches nothing.
  assert.deepEqual(reach(1, 0), [false, false, false, false, false]);
  for (let p = 0; p <= SLIDER_STEPS; p++) {
    const level = p / SLIDER_STEPS;
    const named = DONENESS_ANCHORS.indexOf(anchorNear(level));
    assert.equal(anchorReachable(named, level, level), true, `the word at ${level} names it`);
  }
});

test('a refusal names the word the slider lands on, and that word is the end of what is not struck out', () => {
  // A fine sweep of the pan's limit, with every word's edge and a step to
  // either side of it: past an edge by less than a grid step, the snap
  // carries the slider into the next word, and the refusal must name that
  // one, not the word nearest the limit itself.
  const limits: number[] = [];
  for (let i = 0; i <= 2000; i++) limits.push(i / 2000);
  for (let i = 0; i + 1 < DONENESS_ANCHORS.length; i++) {
    const edge = (DONENESS_ANCHORS[i].level + DONENESS_ANCHORS[i + 1].level) / 2;
    for (const d of [-0.005, -0.001, -1e-6, 0, 1e-6, 0.001, 0.0025, 0.004, 0.005]) {
      limits.push(Math.min(1, Math.max(0, edge + d)));
    }
  }
  const struck = (softest: number, hardest: number): boolean[] =>
    DONENESS_ANCHORS.map((_, i) => !anchorReachable(i, softest, hardest));
  let refusals = 0;
  for (const limit of limits) {
    for (const asked of DONENESS_ANCHORS.map((a) => a.level)) {
      if (asked < limit) {
        const v = verdictFor(solutionOf({ reachable: false, softestLevel: limit, hardestLevel: 1 }), asked);
        assert.equal(v.kind, 'tooSoftForWhite');
        assert.notEqual(v.snapTo, null, `softest ${limit}, asked ${asked}: the slider moves`);
        const at = v.snapTo as number;
        const what = `softest ${limit}, asked ${asked}, lands ${at}`;
        assert.equal(v.limit.key, anchorNear(at).key, `${what}: the refusal names the word the slider shows`);
        const s = struck(limit, 1);
        const named = DONENESS_ANCHORS.indexOf(v.limit);
        assert.equal(s[named], false, `${what}: the word named is struck out`);
        assert.equal(s.indexOf(false), named, `${what}: a softer word than the one named is not struck out`);
        assert.equal(v.worthSaying, v.limit.key !== v.wanted.key, what);
        refusals++;
      }
      if (asked > limit) {
        const v = verdictFor(solutionOf({ reachable: false, softestLevel: 0, hardestLevel: limit }), asked);
        assert.equal(v.kind, 'harderThanPanReaches');
        assert.notEqual(v.snapTo, null, `hardest ${limit}, asked ${asked}: the slider moves`);
        const at = v.snapTo as number;
        const what = `hardest ${limit}, asked ${asked}, lands ${at}`;
        assert.equal(v.limit.key, anchorNear(at).key, `${what}: the refusal names the word the slider shows`);
        const s = struck(0, limit);
        const named = DONENESS_ANCHORS.indexOf(v.limit);
        assert.equal(s[named], false, `${what}: the word named is struck out`);
        assert.equal(s.lastIndexOf(false), named, `${what}: a firmer word than the one named is not struck out`);
        assert.equal(v.worthSaying, v.limit.key !== v.wanted.key, what);
        refusals++;
      }
    }
  }
  assert.ok(refusals > 8000, `${refusals} refusals swept`);
});

test('a limit just past a word\'s edge is named as the word past it', () => {
  // Softest 0.512 is nearer Jammy, but the slider can only rest at 0.52, Fudgy.
  const soft = verdictFor(solutionOf({ reachable: false, softestLevel: 0.512, hardestLevel: 1 }), 0.22);
  assert.equal(soft.snapTo, 0.52);
  assert.equal(soft.limit.key, 'doneness.fudgy');
  // Hardest 0.318 is nearer Jammy, but the slider can only rest at 0.31, Soft.
  const hard = verdictFor(solutionOf({ reachable: false, softestLevel: 0, hardestLevel: 0.318 }), 1);
  assert.equal(hard.snapTo, 0.31);
  assert.equal(hard.limit.key, 'doneness.soft');
});

function close(actual: number, expected: number, tol: number, what: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${what}: expected ${expected} +/- ${tol}, got ${actual} (delta ${actual - expected})`,
  );
}
