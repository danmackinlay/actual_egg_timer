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
 * TWO CHANNELS. The yolk answer ("too soft / just right / too hard") is scored
 * against the yolk dose the user asked for; the white answer ("runny / set") is
 * scored against the fixed WHITE_DOSE_TARGET. They are two observations of two
 * different quantities, sampled at two different radii - the yolk at the centre,
 * the white at YOLK_RADIUS_FRAC - so they respond differently to alpha and are
 * not redundant. The white was computed for every grid cell and thrown away
 * until September 2026; see the caveat below for what it costs to read it.
 *
 * IDENTIFIABILITY - stated honestly:
 *  - Ordinal feedback is worth 1-2 bits per egg. The posterior on alpha
 *    plateaus around 3%: repeated "just right" answers are consistent with a
 *    range, so learning correctly stops rather than falsely converging.
 *  - alpha and the taste offset are confounded at a fixed protocol IN THE YOLK
 *    CHANNEL: the offset is free to absorb any shift in alpha, so only the
 *    combination is identified. Separating them needs variation - different egg
 *    sizes or cooling methods - or an observable the offset cannot absorb.
 *  - The white channel is meant to be that observable. `logDoseOffset` is
 *    defined on the yolk axis only, so scoring the white against its fixed
 *    target constrains alpha with no free parameter in the way. Whether this
 *    breaks the confound in practice is an empirical question that wants real
 *    eggs: it is the reason for the channel, not a measured result.
 *  - CAVEAT, and it is not small. The white is sampled much nearer the surface
 *    than the yolk centre, so it is the more sensitive of the two to error in
 *    H_EFF - which README 11.2 records as about twice the only published
 *    measurement. A white answer therefore partly measures that error and
 *    attributes it to alpha. The channel is down-weighted for exactly this
 *    reason (see P_WHITE_AGREE); down-weighting bounds the damage rather than
 *    removing it.
 *  - tauAirScale is only identifiable if the user actually varies the cooling
 *    protocol. Otherwise it stays at its prior, which is the correct behaviour.
 */

import { ALPHA_DEFAULT, ALPHA_REL_SD } from './constants.js';
import { ModelParams, WHITE_DOSE_TARGET } from './solve.js';
import {
  DoseGrid, lookupLogYolkDose, lookupLogWhiteDose, cookTimeForLogYolkDose,
} from './doseGrid.js';

/** What the user reports about the YOLK after eating the egg. */
export type Feedback = -1 | 0 | 1; // too soft | just right | too hard

/**
 * What the user reports about the WHITE, when asked.
 *
 * Two answers and not three, because the white's criterion is a THRESHOLD and
 * not a band: WHITE_DOSE_TARGET is the dose at which the innermost white has
 * set, and the model carries no ceiling above which a white is overdone. A third
 * "rubbery" answer would need such a ceiling, and inventing one would put an
 * unmeasured constant into the likelihood, so the question stops at the
 * distinction the model can actually score.
 *
 * There is deliberately NO per-user offset on this channel, and that is the
 * point of it. "Runny or set" is a statement about the egg rather than about
 * anyone's taste, so the white is scored against the fixed target with no free
 * parameter to absorb the discrepancy - which is what lets it say something
 * about alpha that the yolk channel cannot.
 */
export type WhiteReport = 'runny' | 'set';

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

/** Half-width of the zone around the white's threshold in which either answer
 *  is plausible, log10 dose units.
 *
 *  This is the same 1.3 C of peak temperature as FEEDBACK_BAND, converted
 *  through Z_WHITE instead of Z_YOLK: 0.28 * 4.65 / 4.97 = 0.262. Matched in
 *  degrees rather than in decades, because degrees are what a person is judging.
 *  Two effects argue in opposite directions about tuning it further - "runny or
 *  set" is a sharper distinction than a yolk doneness gradation, which would
 *  narrow it, while WHITE_DOSE_TARGET's own position is calibrated rather than
 *  measured, which would widen it - so it is left at the temperature-matched
 *  value rather than nudged to a preference. */
export const WHITE_FEEDBACK_BAND = 0.26;

/** log10 of the dose at which the innermost white is set. The white has one
 *  target for everybody, unlike the yolk, whose target moves with the slider and
 *  then again with the user's own taste. */
const LOG_WHITE_TARGET = Math.log10(WHITE_DOSE_TARGET);

/** The white answer is binary, so these are a proper pair over the two answers
 *  rather than the yolk's three-way split.
 *
 *  The contrast is deliberately far weaker than the yolk's 0.8 / 0.1: a
 *  likelihood ratio of 1.9 against the yolk's 8, so one white answer carries
 *  about a third of the evidence of one yolk answer. That discount is the H_EFF
 *  caveat in the header made arithmetic - the white is the channel more likely
 *  to be measuring the wrong thing, so it is allowed to move the posterior more
 *  slowly. The size of the discount is a judgement, not a measurement, and it is
 *  the number in this file most likely to want revisiting once real eggs have
 *  gone through both channels. */
const P_WHITE_AGREE = 0.65;
const P_WHITE_DISAGREE = 0.35;
/** A particle whose predicted white sits inside the band predicts neither
 *  answer, and scores the average of the two - exactly the likelihood of a
 *  particle that calls the answer a coin flip. So hedging cannot beat being
 *  right and cannot be beaten by being wrong. Scoring it as agreement instead
 *  would make the filter quietly prefer particles sitting on the boundary, which
 *  is a preference nobody has a reason to hold. */
const P_WHITE_EITHER = 0.5;

/**
 * How much doubt is worth a second question.
 *
 * 0.1 was a judgement, and it was too high. The argument for it - that a model
 * sure of the answer cannot learn from it - is exactly true at P = 0 and P = 1
 * and not before, and the measurement says so. Folding a "runny" report that
 * the gate would have suppressed, against a fresh prior, 68 g, hot start, ice:
 *
 *     level  P(runny)   alpha if "runny"   if "set"
 *      0.22   0.12950            -1.699%    +1.081%
 *      0.30   0.06700            -1.071%    +0.629%
 *      0.35   0.04150            -0.735%    +0.418%
 *      0.41   0.02300            -0.446%    +0.247%
 *      0.50   0.00750            -0.163%    +0.089%
 *      0.62   0.00000            -0.000%    -0.000%
 *
 * The information decays smoothly and hits exactly zero only where every
 * particle agrees. 0.02 keeps the question while an answer can still move alpha
 * by about 0.4%, which is a fifth of the ~2% the posterior can resolve, and
 * drops it below that, where the move is a twentieth and not worth a tap.
 *
 * The cost is real and worth stating: at 0.02 the default jammy slider position
 * (P = 0.023) is inside the gate, so the common path is two questions rather
 * than one. That is the trade - the old threshold bought a shorter path by
 * discarding most of the evidence in exactly the case a cook notices and
 * reports, which is a model that is confidently wrong about the white.
 */
export const WHITE_ASK_MIN_P = 0.02;

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

/** What this particle predicts the user would have said about the YOLK. */
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
 * Fold in one YOLK observation: the user cooked for `cookTime_s` aiming at a
 * nominal yolk dose of 10^`logNominalTarget`, and reported `feedback`.
 * Reweights, then resamples with jitter if the particle set has degenerated.
 *
 * What the user said about the white, if they were asked, goes in separately
 * through `updateWhite` - it is scored against a different target at a different
 * radius, and it arrives at a different moment.
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

/* ---- the white channel ---- */

/** What this particle predicts the user would have said about the WHITE, or
 *  `either` when its predicted dose sits close enough to the threshold that both
 *  answers are consistent with it. */
type WhitePrediction = 'runny' | 'set' | 'either';

function predictedWhite(grid: DoseGrid, p: Particle, cookTime_s: number): WhitePrediction {
  const delivered = lookupLogWhiteDose(grid, p.alpha_m2s, cookTime_s);
  if (delivered < LOG_WHITE_TARGET - WHITE_FEEDBACK_BAND) return 'runny';
  if (delivered > LOG_WHITE_TARGET + WHITE_FEEDBACK_BAND) return 'set';
  return 'either';
}

/**
 * Fold in one answer about the white of the egg cooked for `cookTime_s`.
 *
 * A second fold rather than a sixth argument to `updatePosterior`, because the
 * two answers arrive at two different moments: the yolk answer is folded the
 * instant it is given, and the white is only asked about afterwards, once the
 * model has decided the answer would move something. Folding them jointly would
 * mean holding the yolk answer unrecorded until the second tap, and then an egg
 * abandoned between the two taps would teach nothing at all.
 *
 * Statistically they are one observation each of two different quantities, so
 * folding them in sequence multiplies the same two likelihoods; the only
 * difference is that a resample may fall between them, which is what this filter
 * does between eggs in any case.
 */
export function updateWhite(
  post: Posterior, grid: DoseGrid, cookTime_s: number, white: WhiteReport,
): void {
  const n = post.particles.length;
  let total = 0.0;
  for (let i = 0; i < n; i++) {
    const pred = predictedWhite(grid, post.particles[i], cookTime_s);
    const p = pred === 'either' ? P_WHITE_EITHER
      : pred === white ? P_WHITE_AGREE : P_WHITE_DISAGREE;
    post.weights[i] *= p;
    total += post.weights[i];
  }
  if (total <= 0.0) {
    // Cannot happen from this channel alone, since the smallest factor above is
    // 0.35 - but the guard matches `updatePosterior`, because what must never
    // happen here is a NaN weight reaching a solve.
    for (let i = 0; i < n; i++) post.weights[i] = 1.0 / n;
    return;
  }
  for (let i = 0; i < n; i++) post.weights[i] /= total;
  if (effectiveSampleSize(post) < n / 2.0) resample(post);
}

/** Posterior predictive probability that this cook's white came out runny. A
 *  particle inside the band counts a half, which is the same coin flip that
 *  P_WHITE_EITHER scores it at. */
export function whiteRunnyProbability(
  post: Posterior, grid: DoseGrid, cookTime_s: number,
): number {
  let p = 0.0;
  let total = 0.0;
  for (let i = 0; i < post.particles.length; i++) {
    const pred = predictedWhite(grid, post.particles[i], cookTime_s);
    p += post.weights[i] * (pred === 'runny' ? 1.0 : pred === 'either' ? 0.5 : 0.0);
    total += post.weights[i];
  }
  return total <= 0.0 ? 0.0 : p / total;
}

/**
 * Whether asking about the white can teach anything about this egg.
 *
 * The question is worth asking exactly when the particles DISAGREE about the
 * answer, and that is not a heuristic. If every particle predicts the same
 * thing, then whichever answer comes back multiplies every weight by the same
 * factor, and normalising restores the posterior unchanged: a unanimous model
 * learns nothing from either answer, so asking would spend a tap for nothing.
 * Two taps at breakfast is a real cost, so the second question appears only when
 * there is something behind it.
 *
 * THIS DOES NOT BIAS THE POSTERIOR, which is the non-obvious part and the reason
 * it is spelled out here. The decision reads only the posterior, the grid and the
 * cook time - all of them known before the answer exists - so the probability of
 * having asked is the same for every particle and cancels in the normalisation.
 * Deciding from the answer itself, or from anything that depends on it, would
 * not be safe: it would make the likelihood conditional on the selection, and
 * the filter has no term for that.
 */
export function shouldAskAboutWhite(
  post: Posterior, grid: DoseGrid, cookTime_s: number,
): boolean {
  const p = whiteRunnyProbability(post, grid, cookTime_s);
  return p >= WHITE_ASK_MIN_P && p <= 1.0 - WHITE_ASK_MIN_P;
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
