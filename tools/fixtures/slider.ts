/**
 * fixtures/slider.json: the doneness slider (src/core/slider.ts) - snapping
 * onto its grid, the nearest labelled position, the yolk temperature a level
 * asks for, which tick words can be reached, and the refusal verdict.
 *
 * None of it is expensive, so the cases are dense rather than
 * representative: an off-by-one in a port's loop or a flipped comparison
 * should have nowhere to hide. The verdict cases are built from SYNTHETIC
 * Solutions rather than from solved cooks: the point is to pin the decision,
 * not to re-test the solver, and a synthetic solution can sit exactly on the
 * boundaries that a real one reaches only by accident.
 */

import { DONENESS_ANCHORS, Solution } from '../../src/core/solve.js';
import {
  SLIDER_STEPS, anchorNear, anchorReachable, snapDown, snapUp, targetPeakYolk_C, verdictFor,
} from '../../src/core/slider.js';

const SNAP_LEVELS: number[] = [];
for (let i = 0; i <= 40; i++) SNAP_LEVELS.push(i / 40);
for (const awkward of [0.41, 0.2199999, 0.615, 0.0001, 0.9999, 0.11, 1 / 3]) {
  SNAP_LEVELS.push(awkward);
}

/** A Solution with only the fields the verdict reads. */
function verdictCase(
  reachable: boolean, whiteSets: boolean, softestLevel: number, hardestLevel: number,
): Solution {
  return {
    result: {
      cookTime_s: 0, peakYolk_C: 0, peakYolkTime_s: 0, yolkAtPull_C: 0,
      yolkDose_min: 0, whiteDose_min: 0, peakWhite_C: 0,
    },
    reachable: reachable,
    minCookTime_s: 0,
    softestLevel: softestLevel,
    hardestLevel: hardestLevel,
    whiteSets: whiteSets,
  };
}

const VERDICT_CASES: { reachable: boolean; whiteSets: boolean; softest: number; hardest: number; level: number }[] = [];
for (const level of [0.0, 0.22, 0.41, 0.5, 0.62, 0.9, 1.0]) {
  VERDICT_CASES.push({ reachable: true, whiteSets: true, softest: 0, hardest: 1, level: level });
  VERDICT_CASES.push({ reachable: false, whiteSets: false, softest: 1, hardest: 0, level: level });
  for (const softest of [0.0, 0.415, 0.608, 0.73]) {
    VERDICT_CASES.push({ reachable: false, whiteSets: true, softest: softest, hardest: 1, level: level });
  }
  for (const hardest of [0.735, 0.42, 0.405]) {
    VERDICT_CASES.push({ reachable: false, whiteSets: true, softest: 0, hardest: hardest, level: level });
  }
}

export const sliderFixture = {
  about: 'The doneness slider: snapping, the nearest label, the target temperature, which tick words can be reached, and the refusal verdict. src/core/slider.ts.',
  steps: SLIDER_STEPS,
  cases: SNAP_LEVELS.map((level) => ({
    level: level,
    snapUp: snapUp(level),
    snapDown: snapDown(level),
    anchor: anchorNear(level).key,
    targetPeakYolk_C: targetPeakYolk_C(level),
  })),
  /* Which tick words can be reached between a softest and a hardest level:
   * the soft end after a runny white (a floor at 0.05-0.09, still Runny), each
   * word's edges - 0.11 is Runny's last position and 0.12 Soft's first, 0.80
   * Fudgy's last and 0.81 Hard's first - and
   * a pan whose white never sets (softest 1, hardest 0). */
  reachableWords: [
    [0, 1], [0.05, 1], [0.09, 1], [0.11, 1], [0.1100001, 1], [0.12, 1], [0.3, 1], [0.315, 1], [0.32, 1],
    [0.52, 1], [0.8, 1], [0.81, 1], [0.82, 1], [1, 1], [0, 0.82], [0, 0.81], [0, 0.8], [0, 0.515],
    [0.42, 0.5], [0.2, 0.25], [1, 0],
  ].map(([softest, hardest]) => ({
    softest: softest,
    hardest: hardest,
    reachable: DONENESS_ANCHORS.map((_, i) => anchorReachable(i, softest, hardest)),
  })),
  verdict: VERDICT_CASES.map((c) => {
    const v = verdictFor(verdictCase(c.reachable, c.whiteSets, c.softest, c.hardest), c.level);
    return {
      reachable: c.reachable,
      whiteSets: c.whiteSets,
      softestLevel: c.softest,
      hardestLevel: c.hardest,
      level: c.level,
      kind: v.kind,
      wanted: v.wanted.key,
      limit: v.limit.key,
      snapTo: v.snapTo === null ? null : v.snapTo,
      worthSaying: v.worthSaying,
    };
  }),
};
