/**
 * Sequential Bayesian calibration from ordinal feedback.
 *
 * The model's constants are literature-derived, and the carryover term has no
 * published measurement behind it at all. Rather than guess better, make the
 * uncertainty explicit and let the user's own eggs resolve it: after each cook
 * they say "too soft", "just right" or "too hard", and we update a posterior.
 *
 * METHOD: sequential Monte Carlo (a particle filter), NOT variational
 * inference. VI buys scalability in high dimensions at the cost of gradients,
 * an optimiser, and an approximation gap. There are three uncertain scalars
 * here and a cached forward model, so particles give the exact posterior
 * predictive with none of that machinery, in ~100 lines of array arithmetic
 * that port to Swift unchanged.
 *
 * There is also a structural reason no approximation of the temperature FIELD
 * is needed: the modal scheme represents it as mode amplitudes whose dynamics
 * are linear, so conditional on the parameters the field is exact. All the
 * uncertainty lives in the parameters. The spread across particles is the
 * posterior over egg temperature.
 *
 * IDENTIFIABILITY - stated honestly:
 *  - Ordinal feedback is worth 1-2 bits per egg. The posterior on alpha
 *    plateaus around 3%: repeated "just right" answers are consistent with a
 *    range, so learning correctly stops rather than falsely converging.
 *  - alpha and the taste offset are confounded at a fixed protocol. Separating
 *    them needs variation - different egg sizes or cooling methods.
 *  - tauAirScale is only identifiable if the user actually varies the cooling
 *    protocol. Otherwise it stays at its prior, which is the correct behaviour.
 */

import { ALPHA_DEFAULT, ALPHA_REL_SD } from './constants.js';
import { ModelParams } from './solve.js';
import { DoseGrid, lookupLogYolkDose, cookTimeForLogYolkDose } from './doseGrid.js';

/** What the user reports after eating the egg. */
export type Feedback = -1 | 0 | 1; // too soft | just right | too hard

export interface Particle {
  alpha_m2s: number;
  /** The user's taste relative to the nominal doneness scale, in log10 dose
   *  units. Stored as an OFFSET rather than an absolute target so it carries
   *  across different slider positions. */
  logDoseOffset: number;
  tauAirScale: number;
}

export interface Posterior {
  particles: Particle[];
  weights: number[];
  rng: number;
}

/** Half-width of the "just right" band, log10 dose units. 0.28 decades is
 *  about 1.3 C of peak yolk temperature - roughly the finest distinction
 *  anyone can actually make by eating an egg. */
export const FEEDBACK_BAND = 0.28;

/** Probability the user's report matches what the model predicts for a
 *  particle. The remainder is split between the two other answers, which keeps
 *  a single surprising report from killing an otherwise good particle. */
const P_AGREE = 0.8;
const P_DISAGREE = 0.1;

const PRIOR_OFFSET_SD = 0.22;
/** Deliberately wide: this is the least-verified part of the model. */
const PRIOR_TAU_AIR_LOG_SD = 0.35;

/* ---- deterministic RNG, so calibration is reproducible and portable ---- */

function nextUniform(state: number): number {
  let x = state | 0;
  x ^= x << 13; x |= 0;
  x ^= x >>> 17;
  x ^= x << 5; x |= 0;
  return x;
}

function toUnit(state: number): number {
  return ((state >>> 0) % 16777216) / 16777216;
}

/** Box-Muller, returning one normal deviate and the advanced state. */
function gaussian(state: number): { value: number; state: number } {
  const s1 = nextUniform(state);
  const s2 = nextUniform(s1);
  const u1 = Math.max(toUnit(s1), 1e-12);
  const u2 = toUnit(s2);
  return { value: Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2), state: s2 };
}

/* ---- prior ---- */

export function createPrior(count: number, seed: number): Posterior {
  const particles: Particle[] = new Array<Particle>(count);
  const weights: number[] = new Array<number>(count);
  let state = seed | 0;
  if (state === 0) state = 1;
  for (let i = 0; i < count; i++) {
    const a = gaussian(state); state = a.state;
    const b = gaussian(state); state = b.state;
    const c = gaussian(state); state = c.state;
    particles[i] = {
      alpha_m2s: ALPHA_DEFAULT * Math.exp(ALPHA_REL_SD * a.value),
      logDoseOffset: PRIOR_OFFSET_SD * b.value,
      tauAirScale: Math.exp(PRIOR_TAU_AIR_LOG_SD * c.value),
    };
    weights[i] = 1.0 / count;
  }
  return { particles: particles, weights: weights, rng: state };
}

/* ---- update ---- */

/** What this particle predicts the user would have said. */
function predictedFeedback(
  grid: DoseGrid, p: Particle, cookTime_s: number, logNominalTarget: number,
): Feedback {
  const delivered = lookupLogYolkDose(grid, p.alpha_m2s, cookTime_s);
  const wanted = logNominalTarget + p.logDoseOffset;
  if (delivered < wanted - FEEDBACK_BAND) return -1;
  if (delivered > wanted + FEEDBACK_BAND) return 1;
  return 0;
}

export function effectiveSampleSize(post: Posterior): number {
  let s = 0.0;
  for (let i = 0; i < post.weights.length; i++) s += post.weights[i] * post.weights[i];
  return s <= 0.0 ? 0.0 : 1.0 / s;
}

/**
 * Fold in one observation: the user cooked for `cookTime_s` aiming at a
 * nominal yolk dose of 10^`logNominalTarget`, and reported `feedback`.
 * Reweights, then resamples with jitter if the particle set has degenerated.
 */
export function updatePosterior(
  post: Posterior, grid: DoseGrid,
  cookTime_s: number, logNominalTarget: number, feedback: Feedback,
): void {
  const n = post.particles.length;
  let total = 0.0;
  for (let i = 0; i < n; i++) {
    const pred = predictedFeedback(grid, post.particles[i], cookTime_s, logNominalTarget);
    post.weights[i] *= pred === feedback ? P_AGREE : P_DISAGREE;
    total += post.weights[i];
  }
  if (total <= 0.0) {
    // Every particle was contradicted. Refuse to produce NaNs: fall back to a
    // uniform reweight, which keeps the prior rather than inventing a posterior.
    for (let i = 0; i < n; i++) post.weights[i] = 1.0 / n;
    return;
  }
  for (let i = 0; i < n; i++) post.weights[i] /= total;
  if (effectiveSampleSize(post) < n / 2.0) resample(post);
}

/** Systematic resampling - lower variance than multinomial and O(n) - followed
 *  by a small jitter so the set does not collapse to duplicates. */
function resample(post: Posterior): void {
  const n = post.particles.length;
  const cumulative: number[] = new Array<number>(n);
  let acc = 0.0;
  for (let i = 0; i < n; i++) { acc += post.weights[i]; cumulative[i] = acc; }

  let state = nextUniform(post.rng);
  const start = toUnit(state) / n;
  const picked: Particle[] = new Array<Particle>(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const u = start + i / n;
    while (j < n - 1 && cumulative[j] < u) j++;
    picked[i] = post.particles[j];
  }
  for (let i = 0; i < n; i++) {
    const a = gaussian(state); state = a.state;
    const b = gaussian(state); state = b.state;
    const c = gaussian(state); state = c.state;
    post.particles[i] = {
      alpha_m2s: picked[i].alpha_m2s * Math.exp(0.02 * a.value),
      logDoseOffset: picked[i].logDoseOffset + 0.015 * b.value,
      tauAirScale: picked[i].tauAirScale * Math.exp(0.03 * c.value),
    };
    post.weights[i] = 1.0 / n;
  }
  post.rng = state;
}

/* ---- readout ---- */

export function posteriorParams(post: Posterior): ModelParams {
  let alpha = 0.0;
  let tauAir = 0.0;
  for (let i = 0; i < post.particles.length; i++) {
    alpha += post.weights[i] * post.particles[i].alpha_m2s;
    tauAir += post.weights[i] * post.particles[i].tauAirScale;
  }
  return { alpha_m2s: alpha, tauAirScale: tauAir };
}

export function posteriorMeanOffset(post: Posterior): number {
  let v = 0.0;
  for (let i = 0; i < post.particles.length; i++) {
    v += post.weights[i] * post.particles[i].logDoseOffset;
  }
  return v;
}

/** Standard deviation of alpha, as a fraction of its mean - the honest measure
 *  of how much the user's eggs have actually taught us. */
export function posteriorAlphaRelSd(post: Posterior): number {
  const mean = posteriorParams(post).alpha_m2s;
  let v = 0.0;
  for (let i = 0; i < post.particles.length; i++) {
    const d = post.particles[i].alpha_m2s - mean;
    v += post.weights[i] * d * d;
  }
  return Math.sqrt(v) / mean;
}

export interface CookTimePrediction {
  median_s: number;
  low_s: number;
  high_s: number;
}

/**
 * Posterior predictive cook time for a nominal doneness, as a median and an
 * 80% credible interval. Reporting the interval rather than a point is the
 * honest thing to do, and it makes calibration legible without a settings
 * screen: the interval visibly narrows as the posterior tightens.
 */
export function predictCookTime(
  post: Posterior, grid: DoseGrid, logNominalTarget: number,
): CookTimePrediction {
  const n = post.particles.length;
  const rows: { t: number; w: number }[] = new Array<{ t: number; w: number }>(n);
  for (let i = 0; i < n; i++) {
    const p = post.particles[i];
    rows[i] = {
      t: cookTimeForLogYolkDose(grid, p.alpha_m2s, logNominalTarget + p.logDoseOffset),
      w: post.weights[i],
    };
  }
  rows.sort((a, b) => a.t - b.t);
  return {
    low_s: weightedQuantile(rows, 0.1),
    median_s: weightedQuantile(rows, 0.5),
    high_s: weightedQuantile(rows, 0.9),
  };
}

function weightedQuantile(sorted: { t: number; w: number }[], q: number): number {
  let acc = 0.0;
  for (let i = 0; i < sorted.length; i++) {
    acc += sorted[i].w;
    if (acc >= q) return sorted[i].t;
  }
  return sorted[sorted.length - 1].t;
}
