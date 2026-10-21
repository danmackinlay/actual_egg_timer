/**
 * The pot, the surface and the posteriors the decision fixtures share:
 * decide.json writes them, and outcome, certainty, cooks, reach, running and
 * step read them. Importing this module computes them and nothing else, so a
 * fixture that reads them does not make decide.json's or outcome.json's
 * cases too.
 */

import { ALPHA_DEFAULT, ALPHA_REL_SD } from '../../src/core/constants.ts';
import { eggFromMass } from '../../src/core/geometry.ts';
import { type DoseGrid, type GridSpec, buildRequestedGrid } from '../../src/core/doseGrid.ts';
import { type Posterior, createPrior, updatePosterior } from '../../src/core/infer.ts';
import type { CookSetup } from '../../src/core/protocol.ts';
import { type Calibration, calibrationDoneness, calibrationParams } from '../../src/core/record.ts';
import { type DecisionInputs, decisionGridSpec } from '../../src/core/decide.ts';
import { DEFAULT_PARAMS, type Solution, solveCookTime } from '../../src/core/solve.ts';

import { referenceSetup } from '../common.ts';

export const DECIDE_EGG = eggFromMass(0.068);
export const DECIDE_SETUP: CookSetup = referenceSetup({ timeToBoil_s: 480, eggCount: 2 });

/** The inputs decide.json's surface is built for. */
export const DECIDE_INPUTS: DecisionInputs = { egg: DECIDE_EGG, setup: DECIDE_SETUP, params: DEFAULT_PARAMS, whiteDose_min: 0.05 };

/** The surfaces built so far, and their specs, by the inputs they were
 *  built for: the fixtures ask for the same pots again and again, and a
 *  surface, and the solve its spec runs, are the slow part. */
const coarseGrids = new Map<string, { spec: GridSpec; grid: DoseGrid }>();

/** A pot's decision surface as the fixtures build it: where the production
 *  spec puts it, at 7 rows and 20 s columns, the last column on or past the
 *  spec's end. reach.json builds one per pot the same way. Each surface is
 *  built once and shared; nothing writes to one. */
export function coarseDecisionGrid(inputs: DecisionInputs): { spec: GridSpec; grid: DoseGrid } {
  const key = JSON.stringify(inputs);
  const built = coarseGrids.get(key);
  if (built !== undefined) return built;
  const full = decisionGridSpec(inputs);
  const count = Math.ceil((full.timeMax_s - full.timeMin_s) / 20) + 1;
  const spec: GridSpec = { ...full, alphaCount: 7, timeMax_s: full.timeMin_s + 20 * (count - 1), timeCount: count };
  const made = { spec: spec, grid: buildRequestedGrid({ egg: inputs.egg, setup: inputs.setup, spec: spec }) };
  coarseGrids.set(key, made);
  return made;
}

const DECIDE_SURFACE = coarseDecisionGrid(DECIDE_INPUTS);
export const DECIDE_GRID_SPEC = DECIDE_SURFACE.spec;
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
  // Three eggs: jammy called jammy with a firm white, a runny white alone at
  // soft, and jammy again, the yolk alone.
  updatePosterior(learned, DECIDE_GRID, 464, 'jammy', 'firm');
  updatePosterior(learned, DECIDE_GRID, 419, null, 'runny');
  updatePosterior(learned, DECIDE_GRID, 470, 'jammy', null);
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

/** outcome.json's fourth posterior, which certainty.json reads too: a cook
 *  whose three jammy eggs all came out jammy with a firm white. */
export const outcomeConsistent = createPrior(DECIDE_PARTICLES, DECIDE_SEED);
for (const t of [464, 462, 463]) updatePosterior(outcomeConsistent, DECIDE_GRID, t, 'jammy', 'firm');
export const outcomePosteriors = [...decidePosteriors, { name: 'consistent', eggsLogged: 3, post: outcomeConsistent }];
