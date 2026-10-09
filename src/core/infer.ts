/**
 * Sequential Bayesian calibration from ordinal feedback.
 *
 * The model's constants are literature-derived, and the carryover term has no
 * published measurement behind it at all. Rather than guess better, make the
 * uncertainty explicit and let the cook's own eggs resolve it: after each cook
 * they may say how the yolk was (runny, soft, jammy, fudgy or hard) and how
 * the white next to it was (runny, tender or firm), and we update a posterior.
 *
 * METHOD: sequential Monte Carlo (a particle filter), NOT variational
 * inference. VI buys scalability in high dimensions at the cost of gradients,
 * an optimiser, and an approximation gap. There are five uncertain scalars
 * here and a cached forward model, so particles give the exact posterior
 * predictive with none of that machinery, in a few hundred lines of array
 * arithmetic that port to Swift unchanged.
 *
 * There is also a structural reason no approximation of the temperature FIELD
 * is needed: the modal scheme represents it as mode amplitudes whose dynamics
 * are linear, so conditional on the parameters the field is exact. All the
 * uncertainty lives in the parameters. The spread across particles is the
 * posterior over egg temperature.
 *
 * THE LIKELIHOOD (INFERENCE.md section 3) is an ordered probit. For the
 * yolk, since DECISIONS.md 92, the cook names the yolk they got in the
 * slider's own five words, and the latent is the delivered log10 dose less
 * the cook's taste offset; the answer says which of five bands it fell in,
 * cut where the slider's word changes (`YOLK_WORD_CUTS`). It is seen
 * through a Gaussian whose sd is the cook's own `noise`. A particle
 * just outside the band is then a little wrong rather than exactly as wrong as
 * one a decade away - more information per answer, and no cliff for the filter
 * to fall over. A small `UNRELATED` share of every answer is uniform over the
 * answers: somebody tapped the wrong button, or answered about yesterday's egg.
 *
 * TWO CHANNELS. The white is judged at YOLK_RADIUS_FRAC, the innermost white,
 * against two cutpoints of its own: runny | tender at WHITE_DOSE_TARGET shifted
 * by the particle's `whiteOffset`, and tender | firm a learned `whiteFirmGap`
 * above that. On one phone the white offset is the white's lag and the cook's
 * idea of "runny" together - a single cook cannot tell them apart (INFERENCE.md
 * section 2) - and it is the second-strongest direction in the data, so it is
 * learned rather than held constant.
 *
 * IDENTIFIABILITY - stated honestly:
 *  - Ordinal feedback is worth 1-2 bits per egg. The posterior on alpha
 *    plateaus around 3%: repeated "just right" answers are consistent with a
 *    range, so learning correctly stops rather than falsely converging.
 *  - alpha and the taste offset are confounded at a fixed protocol in the yolk
 *    channel, and alpha and the white offset in the white channel. Only the
 *    combinations are identified for one cook. What separates them is the
 *    geometry - alpha moves the yolk and the white together, in the physics
 *    ratio, where each offset moves one - and, once there is pooled data,
 *    other cooks.
 *  - The white is the channel most exposed to the H_EFF error README 11.2
 *    records. Scored against a FIXED target it would push that error into
 *    alpha; with the white offset, whatever the white does that alpha cannot
 *    explain has somewhere to go.
 *  - The counter's carryover (`tauAirScale`, the multiplier on its time
 *    constant) is not learned: it is held at 1.0 (DECISIONS.md 95). Only
 *    counter-rested cooks could inform it, every dose grid is built at one
 *    value of it, and their answers mostly teach alpha and the taste offset.
 *  - The noise scale is learned from how consistent a cook's answers are, which
 *    takes many eggs. Until then it sits near its prior, which is chosen (see
 *    NOISE_MEDIAN) so that one answer near the band carries what a hard
 *    0.8 / 0.1 band would.
 */

import { ALPHA_DEFAULT, ALPHA_REL_SD, Z_WHITE, Z_YOLK } from './constants.js';
import { DEFAULT_PARAMS, ModelParams, WHITE_DOSE_TARGET } from './solve.js';
import { erfc, normalCdf } from './sphere.js';
import {
  DoseGrid, lookupLogYolkDose, lookupLogWhiteDose, lookupPeakYolk_C, cookTimeForLogYolkDose,
  cookTimeForLogWhiteDose,
} from './doseGrid.js';

/**
 * What the cook reports about the YOLK after eating the egg (DECISIONS.md
 * 92): the yolk they got, in the slider's own words, whatever they asked
 * for. Each is the doneness anchor of the same place in `DONENESS_ANCHORS`
 * (`doneness.runny` ... `doneness.hard`), and covers the levels that
 * anchor's word names.
 */
export type YolkWord = 'runny' | 'soft' | 'jammy' | 'fudgy' | 'hard';

/** The five, softest first: the order of `DONENESS_ANCHORS`. */
export const YOLK_WORDS: YolkWord[] = ['runny', 'soft', 'jammy', 'fudgy', 'hard'];

/** A yolk word's place, 0 (runny) to 4 (hard). */
export function yolkWordIndex(w: YolkWord): number {
  return w === 'runny' ? 0 : w === 'soft' ? 1 : w === 'jammy' ? 2 : w === 'fudgy' ? 3 : 4;
}

/**
 * What the cook reports about the WHITE.
 *
 * Three answers: runny, tender, firm. The third needs a ceiling, and that is a
 * learned cutpoint like any other (`whiteFirmGap`).
 */
export type WhiteReport = 'runny' | 'tender' | 'firm';

export interface Particle {
  alpha_m2s: number;
  /** The cook's taste relative to the nominal doneness scale, in log10 dose
   *  units. Stored as an OFFSET rather than an absolute target so it carries
   *  across different slider positions. */
  logDoseOffset: number;
  /** The sd of the Gaussian every yolk answer is seen through, log10 yolk dose
   *  units: how sharply this cook tells one yolk from the next. The white's is
   *  the same scale in degrees (`WHITE_NOISE_PER_YOLK`). */
  noise: number;
  /** Additive shift on the white's runny | tender cutpoint, log10 white dose
   *  units. Positive means the white needs more than the model thinks: it sets
   *  later, or this cook calls a tender white runny, which on one phone are the
   *  same number. */
  whiteOffset: number;
  /** How far the tender | firm cutpoint sits above the runny | tender one, log10
   *  white dose units. Always positive, so the cutpoints stay in order. */
  whiteFirmGap: number;
}

export interface Posterior {
  particles: Particle[];
  weights: number[];
  rng: number;
}

/** Half-width of the "just right" band, log10 dose units. 0.28 decades is
 *  about 1.3 C of peak yolk temperature - roughly the finest distinction
 *  anyone can actually make by eating an egg. The decision's miss around the
 *  level asked for (`yolkProbit`) cuts at -+ this, so a particle that
 *  delivered exactly what was wanted expects "just right". */
export const FEEDBACK_BAND = 0.28;

/** The share of answers that have nothing to do with the egg, spread evenly
 *  over the answers. It bounds how hard any one answer can hit a particle -
 *  no likelihood falls below UNRELATED / 3 - so a single stray tap cannot kill
 *  an otherwise good particle. It stands in for nothing else: the noise scale
 *  does the work of ordinary disagreement. */
export const UNRELATED = 0.05;

/** One answer's probability `p` with the unrelated share mixed in: the chance
 *  the cook gives that answer, whatever the egg did. */
export function withUnrelated(p: number): number {
  return (1.0 - UNRELATED) * p + UNRELATED / 3.0;
}

/** The same for one of the five yolk words: the unrelated share spread
 *  evenly over five answers, so that the five still sum to one. No yolk word
 *  scores below UNRELATED / 5. */
export function withUnrelatedWord(p: number): number {
  return (1.0 - UNRELATED) * p + UNRELATED / 5.0;
}

/**
 * The four cutpoints between the five yolk words, log10 nominal yolk dose,
 * softest first: where the slider's word changes, which is the midpoint
 * between two adjacent anchors (`anchorNear`). The slider is linear in log
 * dose, so that is also the midpoint of their log doses. Nothing new is
 * chosen here: the words, their places and the dose scale are the slider's
 * own (solve.ts). Soft and Jammy are each about 0.93 decades wide and Fudgy
 * 1.36, against the 0.56 of the old "just right".
 *
 * FROZEN, as literals: every stored yolk word is scored against these, so
 * they are what a word MEANT when the cook tapped it. They are today's
 * anchors' midpoints to the last bit, and a test holds them there (test
 * 1h in test/infer.test.ts), so moving an anchor in `DONENESS_ANCHORS`
 * fails it rather than silently rescoring every word already given. Whoever
 * moves one decides then: keep these and let the slider's words and the
 * answers' bands part, or move these too and bump `MODEL_ID` so the stored
 * words are refolded under the new meaning.
 */
export const YOLK_WORD_CUTS: number[] = [
  -0.7948033966179053, 0.1486189016043269, 1.0690308998699196, 2.4266385973116686,
];

/**
 * The noise scale's prior: lognormal, median NOISE_MEDIAN decades of yolk dose.
 *
 * Chosen so that the probit is as confident as a hard band scoring 0.8 / 0.1
 * (the first filter's likelihood) where that band describes a typical egg - a
 * cook the model already roughly knows, whose particles sit around the band:
 *
 *                                         hard   probit, 0.20    at 0.207
 *   P(just right | delivered = wanted)    0.80        0.813        0.799
 *   P(just right | one band-width out)    0.10        0.093        0.100
 *   ratio                                 8.0         8.7          8.0
 *
 * 0.207 matches both exactly; 0.20 is the round number beside it, and the
 * difference is a tenth of a likelihood ratio. Where the two likelihoods
 * DISAGREE is far from the band: a particle a decade from what the cook said
 * now scores UNRELATED / 3 = 0.017, not 0.1. That is the point of the change,
 * not extra confidence, but it is worth stating what it costs. On the very
 * first egg from a fresh prior - where most particles are far from the band -
 * one yolk answer carries 0.96 bits against the hard band's 0.63. To carry only
 * 0.63 there the median would have to be about 0.48, which would make every
 * later egg, near the band, carry half of what it does. The recovery
 * experiment is the check that the first-egg sharpness does no harm
 * (test/infer.test.ts).
 *
 * The log sd is wide on purpose: a cook who answers at random should be able
 * to reach a scale of a decade in a few eggs, and one who can taste a degree
 * should be able to reach 0.1.
 */
export const NOISE_MEDIAN = 0.2;
export const NOISE_LOG_SD = 0.5;

/** The white offset's prior sd, decades of white dose. Wide: half a decade is
 *  about 2.5 C of inner white, and both real eggs in LOGBOOK.md say a constant
 *  white target was wrong. */
export const WHITE_OFFSET_SD = 0.5;

/**
 * The tender | firm cutpoint's prior: lognormal, median WHITE_FIRM_GAP_MEDIAN
 * decades above the runny | tender one.
 *
 * From README section 4's anchors, for the reference egg (68 g, fridge, boiling
 * water, ice) at the literature values: the inner white peaks at 77.9 C with a
 * soft yolk, where its log10 dose is -0.51, and at 80.6 C with a jammy one, at
 * +0.06. The midpoint, -0.22, is 1.08 decades above the runny | tender cutpoint
 * (log10 0.05 = -1.30). So a Soft white sits a fifth of a decade under the cut,
 * "tender", and Jammy and above sit over it, "firm", which is where a cook would
 * put them. The same midpoint over a 58 g egg, a cold start, a tap and a
 * counter-warm egg lands between 0.98 and 1.14 decades.
 *
 * Wide, because nobody has asked a cook yet: a log sd of 0.4 puts the 95%
 * range at 0.5 to 2.4 decades.
 */
export const WHITE_FIRM_GAP_MEDIAN = 1.08;
export const WHITE_FIRM_GAP_LOG_SD = 0.4;

/* ---- the thermometer (INFERENCE.md section 5) ---- */

/**
 * A probe reading at the centre, taken when the centre peaks, is the peak yolk
 * temperature plus two errors, and the likelihood is the density of their sum:
 *
 *   reading = peakYolk + e - h,   e ~ N(0, PROBE_INSTRUMENT_SD_C^2),
 *                                 h ~ Exponential(mean PROBE_HANDLING_MEAN_C)
 *
 * `e` is the thermometer: symmetric, about a degree for anything worth owning
 * (studies/probe.ts). `h` is the handling, and it is ONE-SIDED, and COLD. At the
 * moment the centre peaks it is the warmest point in the egg, in space and in
 * time: `npm run probe` has a probe 3 mm off reading 0.03 C low, 15 s late
 * 0.14 C low, 30 s late 0.6 C low, and a probe that has not finished
 * climbing from room temperature reads low by however far it has to go. The
 * stem, running out through a cold white into a cold room, draws heat off the
 * tip. There is no handling error that reads hot there. (At the PULL every
 * error reads hot, which is what INFERENCE.md section 3 first had in mind, and
 * why the reading is not taken at the pull.) So the sum is an exponentially
 * modified Gaussian with its tail on the cold side: a reading well under a
 * particle's peak costs it less than one the same distance over.
 *
 * The handling mean is 0.4 C: a probe a few millimetres off and a reading a
 * quarter to half a minute late cost 0.2 to 0.8 C together. The total sd is
 * sqrt(1.0^2 + 0.4^2) = 1.08 C, where INFERENCE.md sketched "about 1.5": the
 * handling error at the peak is measured, and it is small, so the thermometer
 * is what is left. What one reading teaches, measured in test/probe.test.ts
 * on the default egg at jammy in ice: the time-scale's sd goes from the
 * prior's 12.5% to 2.7-2.8% in the weights (a 1.0 C Gaussian alone would give
 * 2.45%; the handling tail costs the rest), and the filter keeps 2.6-2.8%
 * once it has resampled, because the resample's kernel keeps the posterior's
 * spread (`resample`; a fixed 2% jitter on alpha kept 3.3-3.5%). A 1.5 C Gaussian
 * would give about 3.7% in the weights.
 *
 * A PROBE_UNRELATED share of readings has nothing to do with the egg - a probe
 * in the white, the wrong egg - and is uniform over PROBE_UNRELATED_SPAN_C, so
 * no particle scores below PROBE_UNRELATED / PROBE_UNRELATED_SPAN_C per degree.
 * It is smaller than the answers' UNRELATED because the apps refuse, before it
 * is ever folded, a reading no believable kitchen could make
 * (`plausibleProbeRange_C` in policy.ts), and because every per cent of it is
 * a fat tail that one reading has to fight: at 5% over 40 C the same reading
 * would leave about 3.1% in the weights rather than 2.8%.
 */
export const PROBE_INSTRUMENT_SD_C = 1.0;
export const PROBE_HANDLING_MEAN_C = 0.4;
export const PROBE_UNRELATED = 0.02;
export const PROBE_UNRELATED_SPAN_C = 60.0;

/** The density of `predicted - reading`: how far the reading fell short of
 *  the peak, C. An exponentially modified Gaussian; see above. Computed with
 *  the erfc inside the exponent so that a reading far over the peak - huge
 *  exp, vanishing erfc - comes out as a small number rather than as
 *  Infinity * 0. */
export function probeShortfallDensity(shortfall_C: number): number {
  const sigma = PROBE_INSTRUMENT_SD_C;
  const rate = 1.0 / PROBE_HANDLING_MEAN_C;
  const tail = erfc((rate * sigma * sigma - shortfall_C) / (Math.SQRT2 * sigma));
  if (!(tail > 0.0)) return 0.0;
  return 0.5 * rate
    * Math.exp(0.5 * rate * rate * sigma * sigma - rate * shortfall_C + Math.log(tail));
}

/** The likelihood of a probe reading under one particle: the reading against
 *  the particle's own peak yolk temperature for this cook, off the grid. */
export function probeLikelihood(
  grid: DoseGrid, p: Particle, cookTime_s: number, reading_C: number,
): number {
  const predicted = lookupPeakYolk_C(grid, p.alpha_m2s, cookTime_s);
  return (1.0 - PROBE_UNRELATED) * probeShortfallDensity(predicted - reading_C)
    + PROBE_UNRELATED / PROBE_UNRELATED_SPAN_C;
}

/** log10 of the dose at which the innermost white is set: the runny | tender
 *  cutpoint before any offset. */
const LOG_WHITE_TARGET = Math.log10(WHITE_DOSE_TARGET);

/** The white's noise, from the yolk's: the same degrees of peak temperature,
 *  converted through Z_WHITE instead of Z_YOLK. Degrees are what a person is
 *  judging. */
const WHITE_NOISE_PER_YOLK = Z_YOLK / Z_WHITE;

const PRIOR_OFFSET_SD = 0.22;

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

/* ---- the population ---- */

/** A lognormal spread: its median, and the sd of its natural log. */
export interface LogNormal {
  median: number;
  logSd: number;
}

/** A normal spread. */
export interface Normal {
  mean: number;
  sd: number;
}

/**
 * What a new cook's prior is drawn from: one spread per particle dimension
 * (INFERENCE.md section 9, E7). The literature's is the one below, every
 * number README section 6 documents; a fit of everyone's shared eggs
 * publishes another (`fixtures/population.json`), which both apps read, and
 * the record names it (`prior`). A posterior drawn from one population is
 * replayed from the next when a release ships it.
 *
 * Independent dimensions, as the prior has always been: the fit's posterior
 * covariance is kept in the file for the record, and not used here.
 */
export interface Population {
  id: string;
  alpha_m2s: LogNormal;
  logDoseOffset: Normal;
  noise: LogNormal;
  whiteOffset: Normal;
  whiteFirmGap: LogNormal;
}

/** The literature's population: the prior every cook drew from before E7,
 *  number for number, less the carryover, which left the particle in 0.5
 *  (DECISIONS.md 95; a prior drawn from it is not the old one, and
 *  `MODEL_ID` says so). '2026-09' is the id E1's records gave it. */
export const LITERATURE_POPULATION: Population = {
  id: '2026-09',
  alpha_m2s: { median: ALPHA_DEFAULT, logSd: ALPHA_REL_SD },
  logDoseOffset: { mean: 0.0, sd: PRIOR_OFFSET_SD },
  noise: { median: NOISE_MEDIAN, logSd: NOISE_LOG_SD },
  whiteOffset: { mean: 0.0, sd: WHITE_OFFSET_SD },
  whiteFirmGap: { median: WHITE_FIRM_GAP_MEDIAN, logSd: WHITE_FIRM_GAP_LOG_SD },
};

/* ---- prior ---- */

/** Five draws per particle, always in this order, in the prior and in every
 *  resample: alpha, taste offset, noise, white offset, firm gap. From the
 *  literature's population unless another is given. */
export function createPrior(count: number, seed: number, pop: Population = LITERATURE_POPULATION): Posterior {
  const particles: Particle[] = new Array<Particle>(count);
  const weights: number[] = new Array<number>(count);
  let state = seed | 0;
  if (state === 0) state = 1;
  for (let i = 0; i < count; i++) {
    const a = gaussian(state); state = a.state;
    const b = gaussian(state); state = b.state;
    const c = gaussian(state); state = c.state;
    const d = gaussian(state); state = d.state;
    const e = gaussian(state); state = e.state;
    particles[i] = {
      alpha_m2s: pop.alpha_m2s.median * Math.exp(pop.alpha_m2s.logSd * a.value),
      logDoseOffset: pop.logDoseOffset.mean + pop.logDoseOffset.sd * b.value,
      noise: pop.noise.median * Math.exp(pop.noise.logSd * c.value),
      whiteOffset: pop.whiteOffset.mean + pop.whiteOffset.sd * d.value,
      whiteFirmGap: pop.whiteFirmGap.median * Math.exp(pop.whiteFirmGap.logSd * e.value),
    };
    weights[i] = 1.0 / count;
  }
  return { particles: particles, weights: weights, rng: state };
}

/* ---- the likelihood ---- */

/** Probabilities of too soft, just right and too firm, against the level the
 *  cook asked for, for one particle - before the unrelated share: the miss
 *  the decision (decide.ts) scores candidate times on, and the forecast's
 *  three. */
export function yolkProbit(
  grid: DoseGrid, p: Particle, cookTime_s: number, logNominalTarget: number,
): [number, number, number] {
  const latent = lookupLogYolkDose(grid, p.alpha_m2s, cookTime_s)
    - (logNominalTarget + p.logDoseOffset);
  const soft = normalCdf((-FEEDBACK_BAND - latent) / p.noise);
  const firm = normalCdf((latent - FEEDBACK_BAND) / p.noise);
  const right = 1.0 - soft - firm;
  return [soft, right > 0.0 ? right : 0.0, firm];
}

/** Probabilities of the five yolk words, runny to hard, for one particle,
 *  before the unrelated share: the delivered log dose, less the particle's
 *  taste offset, against `YOLK_WORD_CUTS`, through its noise. The offset
 *  moves the cook's words as it moved their "just right": a cook with a
 *  positive offset likes a firmer yolk, and calls a given yolk softer. */
export function yolkWordProbit(grid: DoseGrid, p: Particle, cookTime_s: number): number[] {
  return yolkWordBands(lookupLogYolkDose(grid, p.alpha_m2s, cookTime_s) - p.logDoseOffset, p.noise);
}

/** The ordered probit itself: the five yolk words' probabilities, runny to
 *  hard, for a latent log dose (delivered, less the taste offset) seen
 *  through a Gaussian of sd `noise`, against `YOLK_WORD_CUTS`. The filter
 *  scores with it, and the simulated cooks (tools/eggs.ts) answer with it. */
export function yolkWordBands(latent: number, noise: number): number[] {
  const out: number[] = new Array<number>(5);
  let below = 0.0;
  for (let k = 0; k < 4; k++) {
    const upTo = normalCdf((YOLK_WORD_CUTS[k] - latent) / noise);
    const pk = upTo - below;
    out[k] = pk > 0.0 ? pk : 0.0;
    below = upTo;
  }
  out[4] = normalCdf((latent - YOLK_WORD_CUTS[3]) / noise);
  return out;
}

/** Probabilities of runny, tender and firm for one particle, before the
 *  unrelated share. */
export function whiteProbit(grid: DoseGrid, p: Particle, cookTime_s: number): [number, number, number] {
  const latent = lookupLogWhiteDose(grid, p.alpha_m2s, cookTime_s)
    - (LOG_WHITE_TARGET + p.whiteOffset);
  const sd = p.noise * WHITE_NOISE_PER_YOLK;
  const runny = normalCdf(-latent / sd);
  const firm = normalCdf((latent - p.whiteFirmGap) / sd);
  const tender = 1.0 - runny - firm;
  return [runny, tender > 0.0 ? tender : 0.0, firm];
}

/**
 * The likelihood of one egg's answers under one particle: the product of the
 * yolk's, the white's and the thermometer's, any of which may be missing. A
 * missing answer contributes 1 - it says nothing - and a skip is not scored as
 * anything else (INFERENCE.md section 3 says why a skip is still RECORDED).
 * The yolk and white are probabilities and the reading is a density, per
 * degree; each particle is scored on the same reading, so the units cancel in
 * the normalisation. The yolk is the yolk the cook got, in the slider's five
 * words (DECISIONS.md 92).
 */
export function answerLikelihood(
  grid: DoseGrid, p: Particle, cookTime_s: number,
  yolkWord: YolkWord | null, white: WhiteReport | null, probe_C: number | null = null,
): number {
  let l = 1.0;
  if (probe_C !== null) l *= probeLikelihood(grid, p, cookTime_s, probe_C);
  if (yolkWord !== null) {
    const probs = yolkWordProbit(grid, p, cookTime_s);
    l *= withUnrelatedWord(probs[yolkWordIndex(yolkWord)]);
  }
  if (white !== null) {
    const probs = whiteProbit(grid, p, cookTime_s);
    const k = white === 'runny' ? 0 : white === 'tender' ? 1 : 2;
    l *= withUnrelated(probs[k]);
  }
  return l;
}

export function effectiveSampleSize(post: Posterior): number {
  let s = 0.0;
  for (let i = 0; i < post.weights.length; i++) s += post.weights[i] * post.weights[i];
  return s <= 0.0 ? 0.0 : 1.0 / s;
}

/**
 * Fold in one egg: cooked for `cookTime_s`, with whatever the cook said about
 * the yolk and the white, and a probe reading at the centre's peak if they
 * took one - any of them may be null. Reweights by the joint likelihood, then resamples
 * through Liu and West's kernel if the particle set has degenerated.
 *
 * ONE fold per egg, not one per answer. The two answers can arrive in either
 * order, or minutes apart; folding them jointly means the posterior depends on
 * what was said and not on the order it was tapped in, which is what lets a
 * replay of the log match the app bit for bit. An app that hears the second
 * answer after folding the first folds the egg again, from the posterior as it
 * stood before the egg (record.ts, `foldRecord`).
 */
export function updatePosterior(
  post: Posterior, grid: DoseGrid, cookTime_s: number,
  yolkWord: YolkWord | null, white: WhiteReport | null, probe_C: number | null = null,
): void {
  if (white === null && probe_C === null && yolkWord === null) return;
  const n = post.particles.length;
  let total = 0.0;
  for (let i = 0; i < n; i++) {
    post.weights[i] *= answerLikelihood(grid, post.particles[i], cookTime_s, yolkWord, white, probe_C);
    total += post.weights[i];
  }
  if (total <= 0.0) {
    // Cannot happen - the unrelated shares keep every factor above zero - but
    // what must never happen is a NaN weight reaching a solve, so the guard
    // stays: a uniform reweight keeps the prior rather than inventing one.
    for (let i = 0; i < n; i++) post.weights[i] = 1.0 / n;
    return;
  }
  for (let i = 0; i < n; i++) post.weights[i] /= total;
  if (effectiveSampleSize(post) < n / 2.0) resample(post);
}

/* ---- the predictive ---- */

/** Posterior predictive probabilities of too soft, just right and too firm
 *  for a cook of `cookTime_s` at this target, unrelated share included: the
 *  forecast's three, and the miss the decision is made on (`yolkProbit`). */
export function yolkAnswerProbabilities(
  post: Posterior, grid: DoseGrid, cookTime_s: number, logNominalTarget: number,
): [number, number, number] {
  const out: [number, number, number] = [0.0, 0.0, 0.0];
  let total = 0.0;
  for (let i = 0; i < post.particles.length; i++) {
    const probs = yolkProbit(grid, post.particles[i], cookTime_s, logNominalTarget);
    const w = post.weights[i];
    for (let k = 0; k < 3; k++) out[k] += w * withUnrelated(probs[k]);
    total += w;
  }
  for (let k = 0; k < 3; k++) out[k] = total <= 0.0 ? 1.0 / 3.0 : out[k] / total;
  return out;
}

/** Posterior predictive probabilities of the five yolk words, runny to hard,
 *  unrelated share included: what the cook will say the yolk was. */
export function yolkWordProbabilities(post: Posterior, grid: DoseGrid, cookTime_s: number): number[] {
  const out: number[] = [0.0, 0.0, 0.0, 0.0, 0.0];
  let total = 0.0;
  for (let i = 0; i < post.particles.length; i++) {
    const probs = yolkWordProbit(grid, post.particles[i], cookTime_s);
    const w = post.weights[i];
    for (let k = 0; k < 5; k++) out[k] += w * withUnrelatedWord(probs[k]);
    total += w;
  }
  for (let k = 0; k < 5; k++) out[k] = total <= 0.0 ? 1.0 / 5.0 : out[k] / total;
  return out;
}

/** Posterior predictive probabilities of runny, tender and firm. */
export function whiteAnswerProbabilities(
  post: Posterior, grid: DoseGrid, cookTime_s: number,
): [number, number, number] {
  const out: [number, number, number] = [0.0, 0.0, 0.0];
  let total = 0.0;
  for (let i = 0; i < post.particles.length; i++) {
    const probs = whiteProbit(grid, post.particles[i], cookTime_s);
    const w = post.weights[i];
    for (let k = 0; k < 3; k++) out[k] += w * withUnrelated(probs[k]);
    total += w;
  }
  for (let k = 0; k < 3; k++) out[k] = total <= 0.0 ? 1.0 / 3.0 : out[k] / total;
  return out;
}

/**
 * The resample's kernel: Liu and West's shrinkage (2001), with discount
 * KERNEL_DISCOUNT.
 *
 * Why not a FIXED jitter - say 2% on alpha, 0.015 decades on the offsets, 3%
 * on the rest - whatever the posterior looks like? Every resample would then
 * add the same spread, in every direction independently, and three things
 * follow (they did, in this filter's first version). The time-scale cannot be
 * held tighter than about 3% (3.3% after one probe reading whose weights said
 * 2.7%). The one combination a cook's answers DO pin - the time-scale and the
 * taste together, which move a yolk in opposite directions - is pulled apart
 * at every resample, so the spread of the right cook time climbs back after
 * every second or third egg (a sawtooth: +-8 s at jammy, then +-15 s, then
 * +-8 s again, on a cook who never changed). And odds read off that inflated
 * posterior under-state the hits by 4-6 points from the fourth egg
 * (INFERENCE.md section 8).
 *
 * Liu and West's kernel keeps the posterior's mean and covariance through the
 * resample. In coordinates where every dimension is additive - log alpha, the
 * taste offset, log noise, the white offset, log firm gap -
 * each resampled particle is shrunk toward the weighted mean by KERNEL_SHRINK
 * and moved by a draw from the weighted covariance, scaled by KERNEL_SPREAD, so
 * that a^2 + h^2 = 1 and nothing is added or lost. The draw is correlated as
 * the posterior is, through its Cholesky factor, so the combination the answers
 * pinned stays pinned. One normal draw per dimension per particle, in the
 * prior's order.
 */
export const KERNEL_DISCOUNT = 0.98;
const KERNEL_SHRINK = (3.0 * KERNEL_DISCOUNT - 1.0) / (2.0 * KERNEL_DISCOUNT);
const KERNEL_SPREAD = Math.sqrt(1.0 - KERNEL_SHRINK * KERNEL_SHRINK);

const KERNEL_DIMS = 5;

/** A particle in the kernel's coordinates: every dimension additive. */
function kernelCoords(p: Particle): number[] {
  return [
    Math.log(p.alpha_m2s), p.logDoseOffset, Math.log(p.noise), p.whiteOffset, Math.log(p.whiteFirmGap),
  ];
}

/** Lower-triangular Cholesky factor of a symmetric matrix, row-major. A pivot
 *  that is not positive - a direction the posterior has no spread in - gets a
 *  zero column: the kernel adds nothing there, rather than a NaN. */
function cholesky(cov: number[][]): number[][] {
  const L: number[][] = [];
  for (let k = 0; k < KERNEL_DIMS; k++) L.push(new Array<number>(KERNEL_DIMS).fill(0.0));
  for (let k = 0; k < KERNEL_DIMS; k++) {
    for (let l = 0; l <= k; l++) {
      let s = cov[k][l];
      for (let m = 0; m < l; m++) s -= L[k][m] * L[l][m];
      if (k === l) {
        L[k][k] = s > 0.0 ? Math.sqrt(s) : 0.0;
      } else {
        L[k][l] = L[l][l] > 0.0 ? s / L[l][l] : 0.0;
      }
    }
  }
  return L;
}

/** Systematic resampling - lower variance than multinomial and O(n) - then
 *  Liu and West's kernel (above), so the set does not collapse to duplicates
 *  and the posterior keeps its shape. */
function resample(post: Posterior): void {
  const n = post.particles.length;
  const cumulative: number[] = new Array<number>(n);
  let acc = 0.0;
  for (let i = 0; i < n; i++) { acc += post.weights[i]; cumulative[i] = acc; }

  // The weighted mean and covariance, before anything moves.
  const x: number[][] = new Array<number[]>(n);
  for (let i = 0; i < n; i++) x[i] = kernelCoords(post.particles[i]);
  const mean: number[] = new Array<number>(KERNEL_DIMS).fill(0.0);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < KERNEL_DIMS; k++) mean[k] += post.weights[i] * x[i][k];
  }
  for (let k = 0; k < KERNEL_DIMS; k++) mean[k] /= acc;
  const cov: number[][] = [];
  for (let k = 0; k < KERNEL_DIMS; k++) cov.push(new Array<number>(KERNEL_DIMS).fill(0.0));
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < KERNEL_DIMS; k++) {
      const dk = x[i][k] - mean[k];
      for (let l = 0; l <= k; l++) cov[k][l] += post.weights[i] * dk * (x[i][l] - mean[l]);
    }
  }
  for (let k = 0; k < KERNEL_DIMS; k++) {
    for (let l = 0; l <= k; l++) {
      cov[k][l] /= acc;
      cov[l][k] = cov[k][l];
    }
  }
  const L = cholesky(cov);

  let state = nextUniform(post.rng);
  const start = toUnit(state) / n;
  const picked: number[] = new Array<number>(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const u = start + i / n;
    while (j < n - 1 && cumulative[j] < u) j++;
    picked[i] = j;
  }
  const z: number[] = new Array<number>(KERNEL_DIMS);
  const y: number[] = new Array<number>(KERNEL_DIMS);
  const next: Particle[] = new Array<Particle>(n);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < KERNEL_DIMS; k++) {
      const g = gaussian(state);
      state = g.state;
      z[k] = g.value;
    }
    const q = x[picked[i]];
    for (let k = 0; k < KERNEL_DIMS; k++) {
      let noise = 0.0;
      for (let l = 0; l <= k; l++) noise += L[k][l] * z[l];
      y[k] = KERNEL_SHRINK * q[k] + (1.0 - KERNEL_SHRINK) * mean[k] + KERNEL_SPREAD * noise;
    }
    next[i] = {
      alpha_m2s: Math.exp(y[0]),
      logDoseOffset: y[1],
      noise: Math.exp(y[2]),
      whiteOffset: y[3],
      whiteFirmGap: Math.exp(y[4]),
    };
  }
  for (let i = 0; i < n; i++) {
    post.particles[i] = next[i];
    post.weights[i] = 1.0 / n;
  }
  post.rng = state;
}

/* ---- readout ---- */

/** The parameters to solve with: the posterior mean time-scale, and the
 *  counter's carryover at the physics (DECISIONS.md 95). */
export function posteriorParams(post: Posterior): ModelParams {
  let alpha = 0.0;
  for (let i = 0; i < post.particles.length; i++) {
    alpha += post.weights[i] * post.particles[i].alpha_m2s;
  }
  return { alpha_m2s: alpha, tauAirScale: DEFAULT_PARAMS.tauAirScale };
}

export function posteriorMeanOffset(post: Posterior): number {
  let v = 0.0;
  for (let i = 0; i < post.particles.length; i++) {
    v += post.weights[i] * post.particles[i].logDoseOffset;
  }
  return v;
}

/** The posterior mean of the white offset: where the white's runny | tender
 *  cutpoint now sits, in decades above WHITE_DOSE_TARGET. */
export function posteriorMeanWhiteOffset(post: Posterior): number {
  let v = 0.0;
  for (let i = 0; i < post.particles.length; i++) {
    v += post.weights[i] * post.particles[i].whiteOffset;
  }
  return v;
}

/** Standard deviation of alpha, as a fraction of its mean - the honest measure
 *  of how much the cook's eggs have actually taught us. */
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
 * The posterior over the right cook time for a nominal doneness, as a median
 * and an 80% credible interval: for each particle, the time it would call
 * right, weighted.
 *
 * A particle's right time is the LATER of two: the time
 * its yolk reaches the middle of "just right" - the nominal target moved by its
 * taste offset, where the probit's two cutpoints are equidistant - and the time
 * its white reaches its own runny | tender cutpoint, which is where the white
 * stops being more likely runny than not. On most cooks the yolk's is later,
 * and this is the yolk's interval; where the white binds,
 * as it does at the soft end once a cook has reported runny whites, the white's
 * uncertainty is what widens it.
 *
 * The spread comes from the posterior alone: the noise scale, which no number
 * of eggs narrows, plays no part. That makes the width the measure of what is
 * still being learned. No screen shows it; a deliberate nudge on the
 * recommendation, if one is built, would read it here (decide.ts). Times are
 * found on the grid, so they are clamped to its span.
 *
 * `lowQ` and `highQ` move the interval's ends: the certainty's likely time
 * range reads a 90% interval here (certainty.ts).
 */
export function predictCookTime(
  post: Posterior, grid: DoseGrid, logNominalTarget: number, lowQ = 0.1, highQ = 0.9,
): CookTimePrediction {
  const n = post.particles.length;
  const rows: { t: number; w: number }[] = new Array<{ t: number; w: number }>(n);
  for (let i = 0; i < n; i++) {
    const p = post.particles[i];
    const yolk = cookTimeForLogYolkDose(grid, p.alpha_m2s, logNominalTarget + p.logDoseOffset);
    const white = cookTimeForLogWhiteDose(grid, p.alpha_m2s, LOG_WHITE_TARGET + p.whiteOffset);
    rows[i] = { t: yolk > white ? yolk : white, w: post.weights[i] };
  }
  rows.sort((a, b) => a.t - b.t);
  return {
    low_s: weightedQuantile(rows, lowQ),
    median_s: weightedQuantile(rows, 0.5),
    high_s: weightedQuantile(rows, highQ),
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
