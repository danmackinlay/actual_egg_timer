/**
 * What the decision tests share (test/decide*.test.ts): the egg and the pot,
 * the mean solve and the choice made on it as the apps make them, and the
 * prior with its surface.
 */

import { type Decision, decide } from '../src/core/decide.js';
import type { DoseGrid, GridSpec } from '../src/core/doseGrid.js';
import { eggFromMass } from '../src/core/geometry.js';
import { type Solution, logYolkTarget } from '../src/core/solve.js';
import {
  CALIBRATION_SEED, type Calibration, PARTICLE_COUNT, calibrationGrid, freshCalibration,
} from '../src/core/record.js';
import { answerAt } from '../src/core/reach.js';
import { appSetup, gridFor } from '../tools/common.js';

export const EGG = eggFromMass(0.068);

export const SETUP = appSetup();
export const LEVELS = [0.22, 0.41, 0.62, 0.85, 1.0];

/** What the apps do (`answerAt`): the mean solve, the verdict, a snap if
 *  there is one, and the level the solve is for. */
export function meanSolve(c: Calibration, level: number, setup = SETUP): { sol: Solution; level: number } {
  const a = answerAt(c, EGG, setup, level, null);
  return { sol: a.solution, level: a.level };
}

export function decideFor(c: Calibration, grid: DoseGrid, level: number, setup = SETUP): Decision {
  const m = meanSolve(c, level, setup);
  return decide(c, grid, m.sol, logYolkTarget(m.level));
}

/** The folds' surfaces, coarser than the app's for the same reason. */
export const COARSE = (alphaCentre: number, cookTime_s: number): GridSpec => ({
  ...calibrationGrid(alphaCentre, cookTime_s), alphaCount: 9, timeCount: 12,
});

export const PRIOR = freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED);
export const PRIOR_GRID = gridFor(PRIOR, EGG, SETUP);
