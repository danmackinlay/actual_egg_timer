/**
 * fixtures/decide.json: decision surfaces and the time chosen on one.
 */

import { ALPHA_DEFAULT, ALPHA_REL_SD } from '../../src/core/constants.js';
import { eggFromMass } from '../../src/core/geometry.js';
import { DoseGrid } from '../../src/core/doseGrid.js';
import { Posterior, createPrior, updatePosterior } from '../../src/core/infer.js';
import { CookSetup } from '../../src/core/protocol.js';
import {
  Calibration, buildRequestedGrid, calibrationDoneness, calibrationParams,
} from '../../src/core/record.js';
import {
  DECISION_ALPHA_COUNT, DECISION_ALPHA_HI, DECISION_ALPHA_LO, DECISION_TIME_STEP_S, DECISION_WINDOW_S,
  DecisionInputs, LEAN_COST_PER_S, RUNNY_WHITE_LOSS, carriedSolution, chooseCookTime, decideAt,
  decidedSolution, decisionApplies, decisionGridSpec, expectedLoss, hitOdds, oddsInTenths,
} from '../../src/core/decide.js';
import { solveCookTime, DEFAULT_PARAMS, Solution } from '../../src/core/solve.js';
import { GridSpec } from '../../src/core/policy.js';

import { particleRows } from './shared.js';
import { logTarget, referenceSetup } from '../common.js';

/* E5: the time is CHOSEN from the whole posterior, and the two apps must choose
 * the same time for the same posterior and pot. Three things are pinned: where
 * each pot's decision surface goes (`decisionGridSpec`, which runs a solve), a
 * surface itself, and the choice made on it from three posteriors - the prior,
 * one that has learned from some eggs, and one that knows its cook likes a
 * firmer yolk. Every particle is written out, as calibration.json does.
 *
 * The surface is coarser than the app's (7 rows, 20 s columns, where the app
 * has 13 and 10 s) so that `swift test` rebuilds it in a moment; the spec is
 * the production one, and the surface is only the arithmetic's input. */

export const DECIDE_EGG = eggFromMass(0.068);
export const DECIDE_SETUP: CookSetup = referenceSetup({ timeToBoil_s: 480, eggCount: 2 });

function decisionInputsRow(i: DecisionInputs) {
  return {
    egg: { mass_kg: i.egg.mass_kg },
    setup: i.setup,
    params: { alpha_m2s: i.params.alpha_m2s, tauAirScale: i.params.tauAirScale },
    whiteDose_min: i.whiteDose_min,
  };
}

const DECIDE_SPEC_INPUTS: DecisionInputs[] = [
  { egg: DECIDE_EGG, setup: DECIDE_SETUP, params: DEFAULT_PARAMS, whiteDose_min: 0.05 },
  { egg: eggFromMass(0.05), setup: DECIDE_SETUP, params: { alpha_m2s: 1.62e-7, tauAirScale: 1.08 }, whiteDose_min: 0.11 },
  { egg: DECIDE_EGG, setup: referenceSetup({ startMode: 'cold', timeToBoil_s: 540 }), params: DEFAULT_PARAMS, whiteDose_min: 0.05 },
  { egg: DECIDE_EGG, setup: referenceSetup({ cooling: 'counter' }), params: DEFAULT_PARAMS, whiteDose_min: 0.05 },
  { egg: DECIDE_EGG, setup: referenceSetup({ afterBoil: 'off', waterLitres: 4 }), params: DEFAULT_PARAMS, whiteDose_min: 0.05 },
];

const decideSpecs = DECIDE_SPEC_INPUTS.map((inputs) => ({
  inputs: decisionInputsRow(inputs),
  spec: decisionGridSpec(inputs),
}));

/** A pot's decision surface as the fixtures build it: where the production
 *  spec puts it, at 7 rows and 20 s columns, the last column on or past the
 *  spec's end. reach.json builds one per pot the same way. */
export function coarseDecisionGrid(inputs: DecisionInputs): { spec: GridSpec; tauAirScale: number; grid: DoseGrid } {
  const full = decisionGridSpec(inputs);
  const count = Math.ceil((full.timeMax_s - full.timeMin_s) / 20) + 1;
  const spec: GridSpec = { ...full, alphaCount: 7, timeMax_s: full.timeMin_s + 20 * (count - 1), timeCount: count };
  const tauAirScale = inputs.params.tauAirScale;
  const grid = buildRequestedGrid({ egg: inputs.egg, setup: inputs.setup, tauAirScale: tauAirScale, spec: spec });
  return { spec: spec, tauAirScale: tauAirScale, grid: grid };
}

const DECIDE_SURFACE = coarseDecisionGrid(DECIDE_SPEC_INPUTS[0]);
const DECIDE_GRID_SPEC = DECIDE_SURFACE.spec;
export const DECIDE_GRID = DECIDE_SURFACE.grid;

export const DECIDE_PARTICLES = 200;
export const DECIDE_SEED = 20260928;

/** A posterior as the fixtures name it, and the eggs it has learned from. */
export interface NamedPosterior { name: string; eggsLogged: number; post: Posterior }

export function calibrationOf(pz: NamedPosterior): Calibration {
  return { posterior: pz.post, eggsLogged: pz.eggsLogged };
}

/** The mean solve, as the apps make it: the posterior's parameters and
 *  doneness. */
export function meanSolve(pz: NamedPosterior, level: number, setup: CookSetup = DECIDE_SETUP): Solution {
  const c = calibrationOf(pz);
  return solveCookTime(DECIDE_EGG, setup, calibrationParams(c), calibrationDoneness(c, level));
}

export const decidePosteriors: NamedPosterior[] = (() => {
  const prior = createPrior(DECIDE_PARTICLES, DECIDE_SEED);
  const learned = createPrior(DECIDE_PARTICLES, DECIDE_SEED);
  // Three eggs: jammy just right with a firm white, soft with a runny white,
  // and jammy again, the yolk alone.
  updatePosterior(learned, DECIDE_GRID, 464, logTarget(0.41), 0, 'firm');
  updatePosterior(learned, DECIDE_GRID, 419, logTarget(0.22), null, 'runny');
  updatePosterior(learned, DECIDE_GRID, 470, logTarget(0.41), 0, null);
  // A cook the model knows well, who likes a yolk a fifth of a decade firmer.
  const firmer = createPrior(DECIDE_PARTICLES, DECIDE_SEED);
  for (let i = 0; i < firmer.particles.length; i++) {
    const p = firmer.particles[i];
    firmer.particles[i] = {
      ...p,
      alpha_m2s: ALPHA_DEFAULT * Math.exp(0.02 * Math.log(p.alpha_m2s / ALPHA_DEFAULT) / ALPHA_REL_SD),
      logDoseOffset: 0.2 + 0.1 * p.logDoseOffset,
      whiteOffset: 0.1 * p.whiteOffset,
    };
  }
  return [
    { name: 'prior', eggsLogged: 0, post: prior },
    { name: 'learned', eggsLogged: 3, post: learned },
    { name: 'firmer', eggsLogged: 6, post: firmer },
  ];
})();

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
function decideSolutionRow(sol: Solution) {
  return {
    reachable: sol.reachable, cookTime_s: sol.result.cookTime_s, peakYolk_C: sol.result.peakYolk_C,
    yolkDose_min: sol.result.yolkDose_min, whiteDose_min: sol.result.whiteDose_min,
  };
}
// The second pot rests on the counter, where the softest yolk leaves the white
// unset: no cook to choose for, so the lean is not carried.
const DECIDE_CARRIED = [
  { level: 0.41, setup: DECIDE_SETUP },
  { level: 0, setup: referenceSetup({ timeToBoil_s: 480, eggCount: 2, cooling: 'counter' }) },
].flatMap((pot) => [0, -12, 18].map((lean_s) => {
  const pz = decidePosteriors[1];
  const params = calibrationParams(calibrationOf(pz));
  const sol = meanSolve(pz, pot.level, pot.setup);
  return {
    posterior: pz.name, level: pot.level, setup: pot.setup, lean_s: lean_s,
    carried: decideSolutionRow(carriedSolution(DECIDE_EGG, pot.setup, params, sol, lean_s)),
  };
}));

export const decideFixture = {
  about: 'E5: decision surfaces, and the time chosen on one from three posteriors. src/core/decide.ts.',
  constants: {
    runnyWhiteLoss: RUNNY_WHITE_LOSS,
    leanCostPerS: LEAN_COST_PER_S,
    decisionAlphaLo: DECISION_ALPHA_LO,
    decisionAlphaHi: DECISION_ALPHA_HI,
    decisionAlphaCount: DECISION_ALPHA_COUNT,
    decisionTimeStep_s: DECISION_TIME_STEP_S,
    decisionWindow_s: DECISION_WINDOW_S,
  },
  specs: decideSpecs,
  grid: {
    egg: { mass_kg: DECIDE_EGG.mass_kg },
    setup: DECIDE_SETUP,
    tauAirScale: DECIDE_SURFACE.tauAirScale,
    ...DECIDE_GRID_SPEC,
    logYolk: DECIDE_GRID.logYolk,
    logWhite: DECIDE_GRID.logWhite,
  },
  posteriors: decidePosteriors.map((pz) => ({
    name: pz.name,
    eggsLogged: pz.eggsLogged,
    weights: pz.post.weights,
    particles: particleRows(pz.post),
  })),
  cases: DECIDE_CASES.map((c) => {
    const pz = decidePosteriors.find((x) => x.name === c.posterior);
    if (pz === undefined) throw new Error(c.posterior);
    const target = logTarget(c.level);
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
      // The mean solve at this level, moved to the decided time.
      level: c.level,
      decided: decideSolutionRow(decidedSolution(
        DECIDE_EGG, DECIDE_SETUP, calibrationParams(calibrationOf(pz)), meanSolve(pz, c.level), d,
      )),
    };
  }),
  carried: DECIDE_CARRIED,
  tenths: [0, 0.049, 0.05, 0.051, 0.349, 0.35, 0.649, 0.65, 0.951, 1].map((p) => ({ odds: p, tenths: oddsInTenths(p) })),
};
