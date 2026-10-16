/**
 * fixtures/calibration.json: the particle filter, particle by particle.
 */

import { eggFromMass } from '../../src/core/geometry.ts';
import { type GridSpec, buildRequestedGrid, cookTimeForLogYolkDose, lookupLogWhiteDose, lookupLogYolkDose } from '../../src/core/doseGrid.ts';
import {
  type Posterior, type WhiteReport, type YolkWord, answerLikelihood, createPrior,
  effectiveSampleSize, posteriorMeanWhiteOffset, posteriorParams, predictCookTime, updatePosterior,
  yolkWordProbabilities, yolkWordProbit,
} from '../../src/core/infer.ts';
import type { CookSetup } from '../../src/core/protocol.ts';

import { referenceSetup } from '../common.ts';

/* The calibration is the one part of the core with STATE and a random number
 * generator, so conformance needs more than a few scalars: a divergence in the
 * RNG produces a different but entirely plausible posterior, which no summary
 * statistic would flag. Every particle is therefore written out, before and
 * after every update.
 *
 * The grid here is deliberately smaller than the app's 21 x 32 - it costs one
 * simulation per cell in both implementations, and 9 x 12 exercises every path
 * through the interpolation while keeping `swift test` quick. */

/* The egg, the pot, the surface, the lookups and the prior are exported:
 * probe.json reads the same ones, so its peak cells sit beside the dose cells
 * here. */

export const CALIB_EGG = eggFromMass(0.062);
export const CALIB_SETUP: CookSetup = referenceSetup({});
export const CALIB_GRID_SPEC: GridSpec = {
  alphaMin: 1.2e-7, alphaMax: 2.4e-7, alphaCount: 9, timeMin_s: 240, timeMax_s: 900, timeCount: 12,
};
export const CALIB_GRID = buildRequestedGrid({
  egg: CALIB_EGG, setup: CALIB_SETUP, spec: CALIB_GRID_SPEC,
});

/* Includes points outside the grid on both axes, because the clamp is where an
 * off-by-one in the interpolation would hide. */
export const LOOKUP_CASES: { alpha_m2s: number; cookTime_s: number }[] = [
  { alpha_m2s: 1.70e-7, cookTime_s: 444 },
  { alpha_m2s: 1.20e-7, cookTime_s: 240 },
  { alpha_m2s: 2.40e-7, cookTime_s: 900 },
  { alpha_m2s: 1.55e-7, cookTime_s: 317.5 },
  { alpha_m2s: 2.01e-7, cookTime_s: 623.25 },
  { alpha_m2s: 0.90e-7, cookTime_s: 100 },
  { alpha_m2s: 3.10e-7, cookTime_s: 1200 },
];

const INVERSE_CASES: { alpha_m2s: number; logDose: number }[] = [
  { alpha_m2s: 1.70e-7, logDose: 0.0 },
  { alpha_m2s: 1.70e-7, logDose: 1.5 },
  { alpha_m2s: 1.40e-7, logDose: 0.5 },
  { alpha_m2s: 2.20e-7, logDose: -0.5 },
];

export const PARTICLE_COUNT = 64;
export const PRIOR_SEED = 20260917;
export const NOMINAL_TARGET = Math.log10(6.0);

/** A posterior as it stands, every particle, weight and the RNG's state, and
 *  what is read off it. */
function readout(post: Posterior) {
  return {
    posterior: structuredClone(post),
    ess: effectiveSampleSize(post),
    alpha_m2s: posteriorParams(post).alpha_m2s,
    meanWhiteOffset: posteriorMeanWhiteOffset(post),
    predict: predictCookTime(post, CALIB_GRID, NOMINAL_TARGET),
  };
}

const prior = readout(createPrior(PARTICLE_COUNT, PRIOR_SEED));

/* The filter, from the prior, told the yolk the cook got in five words and
 * the white: every word, both ends, a word with no
 * white and a white with no word, all three whites, at times from runny to
 * past hard on this surface, so each band is scored where it is likely and
 * where it is not. Each step writes the first particle's likelihood, its
 * five probabilities and the posterior predictive of the five, before the
 * fold. */
const WORD_SEQUENCE: (YolkWord | null)[] = ['soft', 'jammy', 'runny', 'fudgy', 'jammy', null, 'hard', 'soft', 'jammy'];
const WORD_WHITES: (WhiteReport | null)[] = ['tender', 'firm', 'runny', 'firm', null, 'tender', 'firm', null, 'firm'];
const WORD_TIMES_S = [360, 420, 330, 520, 410, 380, 640, 350, 430];
const wordPosterior = createPrior(PARTICLE_COUNT, PRIOR_SEED);
const wordUpdates = WORD_SEQUENCE.map((word, i) => {
  const cookTime_s = WORD_TIMES_S[i];
  const white = WORD_WHITES[i];
  const firstProbit = yolkWordProbit(CALIB_GRID, wordPosterior.particles[0], cookTime_s);
  const predictive = yolkWordProbabilities(wordPosterior, CALIB_GRID, cookTime_s);
  const firstLikelihood = answerLikelihood(CALIB_GRID, wordPosterior.particles[0], cookTime_s, word, white);
  updatePosterior(wordPosterior, CALIB_GRID, cookTime_s, word, white);
  return {
    cookTime_s: cookTime_s,
    yolkWord: word,
    white: white,
    firstProbit: firstProbit,
    predictive: predictive,
    firstLikelihood: firstLikelihood,
    after: readout(wordPosterior),
  };
});

/* One more fold, from a deliberately degenerate particle set, so that the
 * resample after a WHITE-ONLY answer is executed from a known starting point,
 * rather than only wherever the sequence above happens to cross the threshold.
 *
 * The input posterior is therefore synthetic: the particles are the real ones
 * from the end of the word sequence above, with their weights raised to a power,
 * from flat upwards, until the effective sample size sits just over the
 * threshold. It is written out in full, so the port reads the same starting
 * point rather than reproducing the sharpening - the same reason the policy
 * verdicts are built from synthetic Solutions. What is being pinned is the
 * branch, not the road to it. */
const WHITE_RESAMPLE_CASE = (() => {
  const posterior = wordPosterior;
  const n = posterior.particles.length;
  const base = posterior.weights.slice();
  let exponent = 0.0;
  let weights = base.slice();
  for (let step = 0; step < 400; step++) {
    exponent += 0.05;
    let total = 0.0;
    for (let i = 0; i < n; i++) { weights[i] = Math.pow(base[i], exponent); total += weights[i]; }
    for (let i = 0; i < n; i++) weights[i] /= total;
    const probe = { particles: posterior.particles, weights: weights, rng: posterior.rng };
    // Just above the threshold, so the white answer is what pushes it under.
    if (effectiveSampleSize(probe) < n / 2.0 + 2.0) break;
  }
  const before = {
    posterior: { particles: structuredClone(posterior.particles), weights: weights.slice(), rng: posterior.rng },
    ess: effectiveSampleSize({ particles: posterior.particles, weights: weights, rng: posterior.rng }),
  };
  const post = {
    particles: posterior.particles.map((p) => ({ ...p })),
    weights: weights.slice(),
    rng: posterior.rng,
  };
  const cookTime_s = 365;
  const white: WhiteReport = 'runny';
  updatePosterior(post, CALIB_GRID, cookTime_s, null, white);
  return {
    cookTime_s: cookTime_s,
    white: white,
    before: before,
    after: readout(post),
  };
})();

export const calibrationFixture = {
  about: 'The particle filter, particle by particle: the surface, its lookups, the likelihood and a sequence of folds. src/core/infer.ts, doseGrid.ts.',
  egg: CALIB_EGG,
  setup: CALIB_SETUP,
  grid: { spec: CALIB_GRID_SPEC, surface: CALIB_GRID },
  lookups: LOOKUP_CASES.map((c) => ({
    alpha_m2s: c.alpha_m2s,
    cookTime_s: c.cookTime_s,
    logYolk: lookupLogYolkDose(CALIB_GRID, c.alpha_m2s, c.cookTime_s),
    logWhite: lookupLogWhiteDose(CALIB_GRID, c.alpha_m2s, c.cookTime_s),
  })),
  inverse: INVERSE_CASES.map((c) => ({
    alpha_m2s: c.alpha_m2s,
    logDose: c.logDose,
    cookTime_s: cookTimeForLogYolkDose(CALIB_GRID, c.alpha_m2s, c.logDose),
  })),
  whiteResample: WHITE_RESAMPLE_CASE,
  // The target every readout's `predict` is made for.
  logNominalTarget: NOMINAL_TARGET,
  prior: {
    count: PARTICLE_COUNT,
    seed: PRIOR_SEED,
    ...prior,
  },
  wordUpdates: wordUpdates,
};
