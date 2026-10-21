/**
 * fixtures/decide.json: decision surfaces and the time chosen on one.
 */

import { eggFromMass } from '../../src/core/geometry.ts';
import { calibrationParams } from '../../src/core/record.ts';
import {
  type DecisionInputs, carriedSolution, chooseCookTime, decideAt,
  decidedSolution, decisionApplies, decisionGridSpec, expectedLoss, hitOdds, nudgeSeconds,
  oddsInTenths,
} from '../../src/core/decide.ts';
import { DEFAULT_PARAMS, logYolkTarget } from '../../src/core/solve.ts';

import { particleRows } from './shared.ts';
import {
  DECIDE_EGG, DECIDE_GRID, DECIDE_GRID_SPEC, DECIDE_INPUTS, DECIDE_PARTICLES, DECIDE_SEED, DECIDE_SETUP,
  calibrationOf, decidePosteriors, meanSolve,
} from './posteriors.ts';
import { referenceSetup } from '../common.ts';

/* The time is CHOSEN from the whole posterior, and the two apps must choose
 * the same time for the same posterior and pot. Three things are pinned: where
 * each pot's decision surface goes (`decisionGridSpec`, which runs a solve), a
 * surface itself, and the choice made on it from three posteriors - the prior,
 * one that has learned from some eggs, and one that knows its cook likes a
 * firmer yolk.
 *
 * The surface is coarser than the app's (7 rows, 20 s columns) so that
 * `swift test` rebuilds it in a moment; the spec is
 * the production one, and the surface is only the arithmetic's input. */

const DECIDE_SPEC_INPUTS: DecisionInputs[] = [
  DECIDE_INPUTS,
  { egg: eggFromMass(0.05), setup: DECIDE_SETUP, params: { alpha_m2s: 1.62e-7 }, whiteDose_min: 0.11 },
  { egg: DECIDE_EGG, setup: referenceSetup({ startMode: 'cold', timeToBoil_s: 540 }), params: DEFAULT_PARAMS, whiteDose_min: 0.05 },
  { egg: DECIDE_EGG, setup: referenceSetup({ cooling: 'counter' }), params: DEFAULT_PARAMS, whiteDose_min: 0.05 },
  { egg: DECIDE_EGG, setup: referenceSetup({ cooling: 'eggCup' }), params: DEFAULT_PARAMS, whiteDose_min: 0.05 },
  { egg: DECIDE_EGG, setup: referenceSetup({ afterBoil: 'off', waterLitres: 4 }), params: DEFAULT_PARAMS, whiteDose_min: 0.05 },
  { egg: DECIDE_EGG, setup: referenceSetup({ cooling: 'bowl', bowlLitres: 1, coolingWater_C: 9 }), params: DEFAULT_PARAMS, whiteDose_min: 0.05 },
  { egg: DECIDE_EGG, setup: referenceSetup({ cooling: 'tap', coolingWater_C: 24 }), params: DEFAULT_PARAMS, whiteDose_min: 0.05 },
];

const decideSpecs = DECIDE_SPEC_INPUTS.map((inputs) => ({ inputs: inputs, spec: decisionGridSpec(inputs) }));

const DECIDE_CASES: { posterior: string; level: number; meanCookTime_s: number; applies: boolean }[] = [];
for (const pz of decidePosteriors) {
  for (const level of [0.22, 0.41, 0.62, 1.0]) {
    const sol = meanSolve(pz, level);
    DECIDE_CASES.push({ posterior: pz.name, level: level, meanCookTime_s: sol.result.cookTime_s, applies: decisionApplies(sol) });
  }
}
// A solve with nothing to choose, and one whose window runs off the surface.
DECIDE_CASES.push({ posterior: 'learned', level: 0.0, meanCookTime_s: 372, applies: false });
DECIDE_CASES.push({ posterior: 'learned', level: 1.0, meanCookTime_s: DECIDE_GRID_SPEC.timeMax_s - 30, applies: true });

/* The solution at the chosen time (`decidedSolution`), and a cook re-solved
 * mid-cook with the lean it chose at "Eggs in" carried (`carriedSolution`). */
// The second pot rests on the counter, where the softest yolk leaves the white
// unset: no cook to choose for, so the lean is not carried. The third is eaten
// warm from an egg cup, at soft.
const DECIDE_CARRIED = [
  { level: 0.41, setup: DECIDE_SETUP },
  { level: 0, setup: referenceSetup({ timeToBoil_s: 480, eggCount: 2, cooling: 'counter' }) },
  { level: 0.22, setup: referenceSetup({ timeToBoil_s: 480, eggCount: 2, cooling: 'eggCup' }) },
].flatMap((pot) => [0, -12, 18].map((lean_s) => {
  const pz = decidePosteriors[1];
  const params = calibrationParams(calibrationOf(pz));
  const sol = meanSolve(pz, pot.level, pot.setup);
  return {
    posterior: pz.name, level: pot.level, setup: pot.setup, lean_s: lean_s,
    carried: carriedSolution(DECIDE_EGG, pot.setup, params, sol, lean_s),
  };
}));

export const decideFixture = {
  about: 'The choice from the posterior: decision surfaces, and the time chosen on one from three posteriors. src/core/decide.ts.',
  specs: decideSpecs,
  grid: { egg: DECIDE_EGG, setup: DECIDE_SETUP, spec: DECIDE_GRID_SPEC, surface: DECIDE_GRID },
  // The prior as its count and seed: createPrior is pinned particle by
  // particle in calibration.json, so 200 more of its particles pin nothing.
  posteriors: decidePosteriors.map((pz) => (pz.name === 'prior'
    ? { name: pz.name, eggsLogged: pz.eggsLogged, count: DECIDE_PARTICLES, seed: DECIDE_SEED }
    : { name: pz.name, eggsLogged: pz.eggsLogged, weights: pz.post.weights, particles: particleRows(pz.post) })),
  cases: DECIDE_CASES.map((c) => {
    const pz = decidePosteriors.find((x) => x.name === c.posterior);
    if (pz === undefined) throw new Error(c.posterior);
    const target = logYolkTarget(c.level);
    const d = decideAt(pz.post, pz.eggsLogged, DECIDE_GRID, c.meanCookTime_s, c.applies, target);
    const probes = [c.meanCookTime_s - 40, c.meanCookTime_s, c.meanCookTime_s + 25];
    return {
      posterior: c.posterior,
      eggsLogged: pz.eggsLogged,
      logNominalTarget: target,
      meanCookTime_s: c.meanCookTime_s,
      applies: c.applies,
      loss: probes.map((t) => ({ t: t, loss: expectedLoss(pz.post, DECIDE_GRID, t, target) })),
      odds: probes.map((t) => ({ t: t, odds: hitOdds(pz.post, DECIDE_GRID, t, target) })),
      // As if an egg had taught something: the choice itself, whatever the count.
      chosen_s: chooseCookTime(pz.post, DECIDE_GRID, target, c.meanCookTime_s),
      decision: d,
      // The same, held under a time sooner than its choice and over one later
      // (the envelope's bounds, reach.ts): held where a time is chosen, and
      // not where the mean solve's stands.
      held: [
        { lo_s: 0, hi_s: d.cookTime_s - 15 }, { lo_s: d.cookTime_s + 15, hi_s: d.cookTime_s + 40 },
      ].map((bounds) => {
        return { bounds: bounds, decision: decideAt(pz.post, pz.eggsLogged, DECIDE_GRID, c.meanCookTime_s, c.applies, target, bounds) };
      }),
      // The mean solve at this level, moved to the decided time.
      level: c.level,
      decided: decidedSolution(DECIDE_EGG, DECIDE_SETUP, calibrationParams(calibrationOf(pz)), meanSolve(pz, c.level), d),
      // The same, nudged seven seconds short: moved where a time is
      // chosen, and not where the solver's answer stands.
      nudged: decidedSolution(DECIDE_EGG, DECIDE_SETUP, calibrationParams(calibrationOf(pz)), meanSolve(pz, c.level), d, -7),
    };
  }),
  carried: DECIDE_CARRIED,
  tenths: [0, 0.049, 0.05, 0.051, 0.349, 0.35, 0.649, 0.65, 0.951, 1].map((p) => ({ odds: p, tenths: oddsInTenths(p) })),
  // The nudge from a uniform draw: every whole second from -10 to +10, the
  // edges of each, and a draw past either end.
  nudges: [0, 0.0476, 0.0477, 0.5, 0.52, 0.9523, 0.9524, 0.99999, -0.1, 1, 1.5]
    .map((u) => ({ u: u, nudge_s: nudgeSeconds(u) })),
};
