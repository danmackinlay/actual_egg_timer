/**
 * The calibration fold (src/core/record.ts): the filter's particles and its
 * grid, a posterior and the eggs that taught it, and folding a record into
 * it, one egg or a whole log.
 */

import { type Egg, eggFromMass } from './geometry.ts';
import type { CookSetup } from './protocol.ts';
import { DEFAULT_PARAMS, type Doneness, type ModelParams, WHITE_DOSE_TARGET, donenessFromSlider } from './solve.ts';
import { type DoseGrid, type GridPolicy, type GridRequest, type GridSpec, buildRequestedGrid } from './doseGrid.ts';
import {
  LITERATURE_POPULATION, type Particle, type Population, type Posterior, createPrior, posteriorMeanWhiteOffset,
  posteriorParams, updatePosterior,
} from './infer.ts';
import { type PriorStart, priorStart } from './population.ts';
import type { EggRecord } from './recordSchema.ts';

/* ------------------------------------------------------- the calibration */

/** Particles in the filter, and the seed they start from. Both apps must agree
 *  or two identical kitchens learn two different things from the same egg. */
export const PARTICLE_COUNT = 1000;
export const CALIBRATION_SEED = 0x5eed1e;

/** The calibration grid's alpha bounds, as factors of the posterior's centre. */
export const CALIBRATION_ALPHA_LOW = 0.55;
export const CALIBRATION_ALPHA_HIGH = 1.8;

/**
 * Where to build the dose surface for one logged outcome.
 *
 * The most consequential choice in the calibration. The grid is handed
 * to `buildDoseGrid` by the CALLER, so its bounds decide what the particle
 * filter can see and therefore what the posterior becomes: two apps with
 * different grids learn different things from the same egg. It was duplicated
 * by hand in both apps, agreeing only by luck of maintenance.
 *
 * The bounds bracket the plausible answer rather than the whole domain: alpha
 * within a factor of ~2 of where the posterior currently sits, and cook times
 * from a third of what was cooked to a bit over double it.
 */
export function calibrationGrid(alphaCentre: number, cookTime_s: number): GridSpec {
  return {
    alphaMin: alphaCentre * CALIBRATION_ALPHA_LOW,
    alphaMax: alphaCentre * CALIBRATION_ALPHA_HIGH,
    alphaCount: 21,
    timeMin_s: Math.max(60, cookTime_s * 0.35),
    timeMax_s: cookTime_s * 2.4,
    timeCount: 32,
  };
}

/* ------------------------------------------------------------------- fold */

/** A posterior and the number of eggs that taught it. The count is part of the
 *  state, not a statistic: while it is zero the app solves with the literature
 *  values, and the first egg's grid is centred on them rather than on the
 *  prior's mean - so a replay has to carry it exactly as the app does. */
export interface Calibration {
  posterior: Posterior;
  eggsLogged: number;
  /** Where to solve while no egg has taught anything: the centre of the
   *  population the prior was drawn from (population.ts). The literature's
   *  values when absent, as they always were. */
  start?: PriorStart;
}

/** A prior of `count` particles from `seed`, drawn from a population - the
 *  literature's unless another is given - and starting at its centre. */
export function freshCalibration(
  count: number, seed: number, pop: Population = LITERATURE_POPULATION,
): Calibration {
  return { posterior: createPrior(count, seed, pop), eggsLogged: 0, start: priorStart(pop) };
}

/** A deep copy, so a replay never moves the base it started from. */
export function copyCalibration(c: Calibration): Calibration {
  const n = c.posterior.particles.length;
  const particles: Particle[] = new Array<Particle>(n);
  const weights: number[] = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const p = c.posterior.particles[i];
    particles[i] = {
      alpha_m2s: p.alpha_m2s, logDoseOffset: p.logDoseOffset,
      noise: p.noise, whiteOffset: p.whiteOffset, whiteFirmGap: p.whiteFirmGap,
    };
    weights[i] = c.posterior.weights[i];
  }
  const copy: Calibration = {
    posterior: { particles: particles, weights: weights, rng: c.posterior.rng },
    eggsLogged: c.eggsLogged,
  };
  if (c.start !== undefined) copy.start = { ...c.start };
  return copy;
}

/** Parameters to solve with. Before any egg this is the prior's centre - the
 *  population's median time-scale, which for the literature is the
 *  literature value - so calibration is purely additive. */
export function calibrationParams(c: Calibration): ModelParams {
  if (c.eggsLogged === 0) {
    if (c.start === undefined) return DEFAULT_PARAMS;
    return { alpha_m2s: c.start.alpha_m2s };
  }
  return posteriorParams(c.posterior);
}

/**
 * The doneness to solve for: the slider's yolk target, and the white's target
 * moved by what the eggs have said about the white.
 *
 * The solver's white constraint IS the runny | tender cutpoint, so a cook
 * whose whites come out runny moves it up, and the shortest cook that sets the
 * white moves later. Where that is still short of the yolk's own time - a jammy
 * egg, usually - nothing changes; where it is not - a soft one - the soft time
 * gets later, or the slider is refused and snapped up, as any unreachable
 * doneness is. Before any egg it is the literature target exactly.
 */
export function calibrationDoneness(c: Calibration, level: number): Doneness {
  const d = donenessFromSlider(level);
  // Before any egg, the population's mean white offset: none for the
  // literature, which is the literature target exactly.
  const offset = c.eggsLogged > 0 ? posteriorMeanWhiteOffset(c.posterior)
    : c.start === undefined ? 0.0 : c.start.whiteOffset;
  if (c.eggsLogged === 0 && offset === 0.0) return d;
  return {
    level: d.level,
    yolkDose_min: d.yolkDose_min,
    whiteDose_min: WHITE_DOSE_TARGET * Math.pow(10.0, offset),
  };
}

/** Whether a record has anything to fold: an answer, or a probe reading. An
 *  egg nobody answered about is still
 *  a record - the cook, the recommendation and the pull are data for the fit -
 *  but it moves no particle and does not count as an egg the model learned from. */
export function recordTeaches(r: EggRecord): boolean {
  return r.yolkWord !== null || r.white !== null || r.probe !== null;
}

/** The egg the fold sees. */
function recordEggOf(r: EggRecord): Egg {
  return eggFromMass(r.egg.mass_g / 1000);
}

function recordSetupOf(r: EggRecord): CookSetup {
  return {
    startMode: r.setup.startMode,
    eggStart_C: r.setup.eggStart_C,
    ambient_C: r.setup.ambient_C,
    boiling_C: r.setup.boiling_C,
    timeToBoil_s: r.setup.timeToBoil_s,
    cooling: r.setup.cooling,
    afterBoil: r.setup.afterBoil,
    waterLitres: r.setup.waterLitres,
    eggCount: r.setup.eggCount,
    ...(r.setup.coolingWater_C === undefined ? {} : { coolingWater_C: r.setup.coolingWater_C }),
    ...(r.setup.bowlLitres === undefined ? {} : { bowlLitres: r.setup.bowlLitres }),
    ...(r.setup.panStart_C === undefined ? {} : { panStart_C: r.setup.panStart_C }),
  };
}

/** The cook time the likelihood is scored at: when the cook said the egg came
 *  out, if they said, and the schedule if they did not. See the header. */
export function recordCookTime_s(r: EggRecord): number {
  return r.pulledBy === 'cook' ? r.pulled_s : r.recommended_s + r.nudge_s;
}

/** The surface this record is scored on, centred where the posterior stands
 *  NOW - before the egg is folded. */
export function gridRequestFor(c: Calibration, r: EggRecord, grid: GridPolicy): GridRequest {
  const params = calibrationParams(c);
  return {
    egg: recordEggOf(r),
    setup: recordSetupOf(r),
    spec: grid(params.alpha_m2s, recordCookTime_s(r)),
  };
}

/**
 * Fold one record - its answers and its probe reading, whichever it has -
 * against the
 * surface `gridRequestFor` described, and count the egg if it teaches anything.
 *
 * One fold per egg (see `updatePosterior`). An app that folds the first answer
 * and then hears the second folds the egg AGAIN, from a copy of the calibration
 * as it stood before the egg and against the same surface, so what it holds is
 * exactly what a replay of the log will make.
 *
 * Mutates `c`, like `updatePosterior`.
 */
export function foldRecord(c: Calibration, r: EggRecord, grid: DoseGrid): void {
  if (!recordTeaches(r)) return;
  updatePosterior(c.posterior, grid, recordCookTime_s(r), r.yolkWord, r.white, r.probe === null ? null : r.probe.centre_C);
  c.eggsLogged += 1;
}

/**
 * Rebuild a posterior from a starting point and a log.
 *
 * The start is the prior (`freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED)`)
 * or, where a damaged log had to be dropped, the posterior that log had taught
 * (the apps' `rebased` path). It is copied, never moved.
 *
 * Each egg is exactly what the app did when it was answered: a surface centred
 * on the posterior as it then stood, and both answers folded against it. An egg
 * with no answer is skipped, and builds no surface.
 */
export function replay(
  start: Calibration, records: EggRecord[], grid: GridPolicy = calibrationGrid,
): Calibration {
  const c = copyCalibration(start);
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!recordTeaches(r)) continue;
    foldRecord(c, r, buildRequestedGrid(gridRequestFor(c, r, grid)));
  }
  return c;
}
