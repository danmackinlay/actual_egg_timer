/**
 * Is the filter sampling the right posterior? (INFERENCE.md section 8, "the
 * resample"; test/record.test.ts 2a3; test/sbc.test.ts.)
 *
 * A particle filter is a random algorithm. Resampling and the kernel's draws
 * are discontinuous in the weights, so a last-bit difference in `exp` (Linux's
 * libm against macOS's) can send the particles down another path: an equally
 * good sample of the same posterior, and a different set of numbers. What can
 * be checked is the DISTRIBUTION the particles are drawn from, and this tool
 * measures it three ways.
 *
 *   npm run posterior -- noise [seeds] [particles]
 *       the spread across seeds of what the app would show after a realistic
 *       log - the old answers' log (test/data/old-answers.json) and ten eggs
 *       answered in the five yolk words - each replayed exactly as the app
 *       replays it (`replay`, `calibrationGrid`, PARTICLE_COUNT particles),
 *       then decided exactly as the web app decides: the decision surface,
 *       the odds profile, its envelope, the jammy time for a 58 g egg from
 *       the fridge into boiling water and then ice. 50 seeds by default;
 *       about 7 s a seed, nearly all of it building the dose surfaces.
 *   npm run posterior -- reference
 *       rewrites test/data/old-answers-posterior.json, which test 2a3 checks
 *       the filter against. See `writeReference`.
 *   npm run sbc [replications] [particles]
 *       simulation-based calibration (Talts et al. 2018). See `sbc`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { ALPHA_DEFAULT } from '../src/core/constants.js';
import { decide, decideAt, decisionGridRequest, decisionInputs } from '../src/core/decide.js';
import {
  DoseGrid, GridPolicy, buildRequestedGrid, lookupLogWhiteDose, lookupLogYolkDose, lookupPeakYolk_C,
} from '../src/core/doseGrid.js';
import { eggFromMass } from '../src/core/geometry.js';
import {
  Feedback, PROBE_HANDLING_MEAN_C, PROBE_INSTRUMENT_SD_C, PROBE_UNRELATED, PROBE_UNRELATED_SPAN_C, Particle,
  Posterior, WhiteReport, YOLK_WORDS, YolkWord, answerLikelihood, createPrior, whiteProbit,
  withUnrelated, withUnrelatedWord, yolkProbit, yolkWordProbit,
} from '../src/core/infer.js';
import { PARTICLE_COUNT, calibrationGrid } from '../src/core/policy.js';
import { answerAt, envelopeBounds, oddsProfile } from '../src/core/reach.js';
import {
  Calibration, EggRecord, copyCalibration, foldRecord, freshCalibration, gridRequestFor, parseLog,
  recordCookTime_s, recordMass_g, recordTeaches, replay,
} from '../src/core/record.js';
import { DEFAULT_PARAMS, donenessFromSlider, logYolkTarget, solveCookTime } from '../src/core/solve.js';
import { appSetup, draw, gridFor, rng } from './common.js';

/* ------------------------------------------------------------ the old log */

export const OLD_ANSWERS_FILE = 'test/data/old-answers.json';
export const OLD_POSTERIOR_FILE = 'test/data/old-answers-posterior.json';

/** The log answered the old way (too soft / just right / too firm), as the
 *  code before DECISIONS.md 92 wrote it. */
export function oldLog(): EggRecord[] {
  const raw = JSON.parse(readFileSync(OLD_ANSWERS_FILE, 'utf8')) as { log: unknown[] };
  const log = parseLog(raw.log);
  if (log === null) throw new Error(`${OLD_ANSWERS_FILE}: the log does not parse`);
  return log;
}

/** The surfaces the distributional checks score on: 7 x 9, as the old test
 *  had them. Coarse is fine: the filter and the reference score on the SAME
 *  surfaces, so what is compared is the sampler, not the physics. */
export const COARSE_GRID: GridPolicy = (alphaCentre, cookTime_s) => ({
  ...calibrationGrid(alphaCentre, cookTime_s), alphaCount: 7, timeCount: 9,
});

/** One surface per record that teaches (null for one that does not), each
 *  centred on the literature's time-scale - where a fresh calibration stands -
 *  rather than on the posterior as it stood before the egg, as `replay`
 *  centres it. Fixed surfaces make the posterior a fixed function of the log,
 *  prior times likelihood, which is what an exact reference needs; a replay's
 *  moving centre changes only where the interpolation is done. */
export function fixedSurfaces(log: EggRecord[], policy: GridPolicy = COARSE_GRID): (DoseGrid | null)[] {
  const fresh = freshCalibration(1, 1);
  return log.map((r) => (recordTeaches(r) ? buildRequestedGrid(gridRequestFor(fresh, r, policy)) : null));
}

/** The filter, folding the log egg by egg on fixed surfaces: `foldRecord`, as
 *  `replay` calls it. */
export function foldOnSurfaces(start: Calibration, log: EggRecord[], surfaces: (DoseGrid | null)[]): Calibration {
  const c = copyCalibration(start);
  for (let i = 0; i < log.length; i++) {
    const g = surfaces[i];
    if (g !== null) foldRecord(c, log[i], g);
  }
  return c;
}

/** Each particle's log likelihood of the whole log, on these surfaces. */
export function logLikelihoods(post: Posterior, log: EggRecord[], surfaces: (DoseGrid | null)[]): number[] {
  const out: number[] = new Array<number>(post.particles.length).fill(0.0);
  for (let k = 0; k < log.length; k++) {
    const g = surfaces[k];
    if (g === null) continue;
    const r = log[k];
    const t = recordCookTime_s(r);
    const target = logYolkTarget(r.level);
    const probe = r.probe === null ? null : r.probe.centre_C;
    for (let i = 0; i < post.particles.length; i++) {
      out[i] += Math.log(answerLikelihood(g, post.particles[i], t, target, r.yolk, r.white, probe, r.yolkWord));
    }
  }
  return out;
}

/** Weights from log weights, normalised, with the largest at exp(0) first so
 *  nothing underflows that matters. */
function normalise(logW: number[]): number[] {
  let max = Number.NEGATIVE_INFINITY;
  for (const l of logW) if (l > max) max = l;
  const w = logW.map((l) => Math.exp(l - max));
  let total = 0.0;
  for (const x of w) total += x;
  return w.map((x) => x / total);
}

/** The posterior with no filter at all: `count` draws from the prior, each
 *  weighted by the product of every egg's likelihood on the same surfaces.
 *  Exact up to Monte Carlo error, and that error is measured (`writeReference`). */
export function exactPosterior(count: number, seed: number, log: EggRecord[], surfaces: (DoseGrid | null)[]): Posterior {
  const post = createPrior(count, seed);
  post.weights = normalise(logLikelihoods(post, log, surfaces));
  return post;
}

/* ------------------------------------------------------------- summaries */

/** The egg the checks decide for: 58 g, from the fridge, into boiling water,
 *  then ice, at jammy. */
export const CHECK_EGG = eggFromMass(0.058);
export const CHECK_SETUP = appSetup();
export const CHECK_LEVEL = 0.41;

/** What is compared, for one posterior. The time-scale is a factor on the
 *  literature's; the taste and white offsets are in decades. `time_s` and
 *  `odds` are the jammy decision for CHECK_EGG on one fixed decision surface,
 *  leaning from the literature's time (`decisionFor`). */
export interface Summary {
  alphaMean: number;
  alphaQ10: number;
  alphaQ50: number;
  alphaQ90: number;
  offsetMean: number;
  offsetQ10: number;
  offsetQ50: number;
  offsetQ90: number;
  whiteMean: number;
  time_s: number;
  odds: number;
}

export const SUMMARY_KEYS: (keyof Summary)[] = [
  'alphaMean', 'alphaQ10', 'alphaQ50', 'alphaQ90', 'offsetMean', 'offsetQ10', 'offsetQ50', 'offsetQ90',
  'whiteMean', 'time_s', 'odds',
];

function weightedQuantiles(xs: number[], ws: number[], qs: number[]): number[] {
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  let total = 0.0;
  for (const w of ws) total += w;
  const out: number[] = [];
  let acc = 0.0;
  let j = 0;
  for (const q of qs) {
    while (j < idx.length - 1 && acc + ws[idx[j]] < q * total) { acc += ws[idx[j]]; j++; }
    out.push(xs[idx[j]]);
  }
  return out;
}

function weightedMean(xs: number[], ws: number[]): number {
  let s = 0.0;
  let t = 0.0;
  for (let i = 0; i < xs.length; i++) { s += ws[i] * xs[i]; t += ws[i]; }
  return s / t;
}

/** The fixed decision surface and the time the choice leans from. */
export interface DecisionSurface {
  grid: DoseGrid;
  around_s: number;
}

/** Built once, at the literature's values, as a fresh install builds it
 *  (`gridFor`'s cheap surface). The choice is then a function of the
 *  posterior alone. */
export function decisionSurface(): DecisionSurface {
  return {
    grid: gridFor(freshCalibration(1, 1), CHECK_EGG, CHECK_SETUP),
    around_s: solveCookTime(CHECK_EGG, CHECK_SETUP, DEFAULT_PARAMS, donenessFromSlider(CHECK_LEVEL)).result.cookTime_s,
  };
}

export function summarise(post: Posterior, ds: DecisionSurface): Summary {
  const w = post.weights;
  const alpha = post.particles.map((p) => p.alpha_m2s / ALPHA_DEFAULT);
  const offset = post.particles.map((p) => p.logDoseOffset);
  const [a10, a50, a90] = weightedQuantiles(alpha, w, [0.1, 0.5, 0.9]);
  const [o10, o50, o90] = weightedQuantiles(offset, w, [0.1, 0.5, 0.9]);
  const d = decideAt(post, 1, ds.grid, ds.around_s, true, logYolkTarget(CHECK_LEVEL));
  return {
    alphaMean: weightedMean(alpha, w), alphaQ10: a10, alphaQ50: a50, alphaQ90: a90,
    offsetMean: weightedMean(offset, w), offsetQ10: o10, offsetQ50: o50, offsetQ90: o90,
    whiteMean: weightedMean(post.particles.map((p) => p.whiteOffset), w),
    time_s: d.cookTime_s, odds: d.odds,
  };
}

/** Mean and sd of each summary over many. */
export function spread(rows: Summary[]): { mean: Summary; sd: Summary } {
  const mean = {} as Summary;
  const sd = {} as Summary;
  for (const k of SUMMARY_KEYS) {
    const xs = rows.map((r) => r[k]);
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    mean[k] = m;
    sd[k] = Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1));
  }
  return { mean, sd };
}

/** The seeds the checks use: far apart, and never CALIBRATION_SEED. */
export function seedOf(k: number): number {
  return (1000003 * (k + 1) + 17) | 0;
}

/* -------------------------------------------------------- the reference */

/** What test 2a3 reads. */
export interface PosteriorReference {
  about: string;
  surfaces: string;
  decision: string;
  /** The exact posterior: `exact.draws` prior draws weighted by the
   *  likelihood, in `exact.batches` batches; `se` is the batches' sd over
   *  the square root of their number. */
  exact: { draws: number; seed: number; batches: number; ess: number; value: Summary; se: Summary };
  /** The filter, PARTICLE_COUNT particles, over `filter.seeds` seeds
   *  (`seedOf`): the mean of each summary and its sd from seed to seed. */
  filter: { particles: number; seeds: number; mean: Summary; sd: Summary };
}

const EXACT_DRAWS = 2_000_000;
const EXACT_BATCHES = 20;
const EXACT_SEED = 0x0e9ac7;
const REFERENCE_SEEDS = 400;

/**
 * The reference for test 2a3: the old log's posterior, exactly (importance
 * sampling from the prior, no filter), and the filter's own distribution of
 * the same summaries over REFERENCE_SEEDS seeds. Regenerate it only on
 * purpose - when the likelihood, the prior, the decision or the filter is
 * MEANT to change - and say so in the commit: a reference regenerated to make
 * a test pass is a test thrown away.
 */
function writeReference(): void {
  const log = oldLog();
  const surfaces = fixedSurfaces(log);
  const ds = decisionSurface();
  const t0 = Date.now();

  const per = EXACT_DRAWS / EXACT_BATCHES;
  const batches: Summary[] = [];
  const all: Particle[] = [];
  const logW: number[] = [];
  for (let b = 0; b < EXACT_BATCHES; b++) {
    const post = createPrior(per, EXACT_SEED + b);
    const l = logLikelihoods(post, log, surfaces);
    batches.push(summarise({ ...post, weights: normalise(l) }, ds));
    for (let i = 0; i < per; i++) { all.push(post.particles[i]); logW.push(l[i]); }
  }
  // Pooled, without the draws whose weight is under 1e-15 of the largest:
  // they carry nothing a summary can see, and the decision is per particle.
  let max = Number.NEGATIVE_INFINITY;
  for (const l of logW) if (l > max) max = l;
  const kept: Particle[] = [];
  const keptLogW: number[] = [];
  for (let i = 0; i < all.length; i++) {
    if (logW[i] - max > -34.5) { kept.push(all[i]); keptLogW.push(logW[i]); }
  }
  const weights = normalise(keptLogW);
  let s2 = 0.0;
  for (const w of weights) s2 += w * w;
  const pooled: Posterior = { particles: kept, weights: weights, rng: 1 };
  const exact = summarise(pooled, ds);
  const se = spread(batches).sd;
  for (const k of SUMMARY_KEYS) se[k] /= Math.sqrt(EXACT_BATCHES);
  console.log(`exact: ${EXACT_DRAWS} draws, ESS ${(1 / s2).toFixed(0)}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const t1 = Date.now();
  const rows: Summary[] = [];
  for (let k = 0; k < REFERENCE_SEEDS; k++) {
    rows.push(summarise(foldOnSurfaces(freshCalibration(PARTICLE_COUNT, seedOf(k)), log, surfaces).posterior, ds));
  }
  const filter = spread(rows);
  console.log(`filter: ${REFERENCE_SEEDS} seeds x ${PARTICLE_COUNT}, ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  printComparison(exact, se, filter.mean, filter.sd, REFERENCE_SEEDS);

  const ref: PosteriorReference = {
    about: 'The posterior the old answers\' log (test/data/old-answers.json) makes, for test/record.test.ts 2a3. '
      + 'Written by `npm run posterior -- reference` (tools/posterior.ts), and rewritten only when the likelihood, '
      + 'the prior, the decision or the filter is meant to change.',
    surfaces: 'Each egg on calibrationGrid at 7 x 9, centred on the literature time-scale (tools/posterior.ts fixedSurfaces).',
    decision: 'Jammy (0.41), 58 g from the fridge into the default pot then ice, on gridFor\'s surface at the literature '
      + 'values, leaning from the literature solve (tools/posterior.ts decisionSurface).',
    exact: { draws: EXACT_DRAWS, seed: EXACT_SEED, batches: EXACT_BATCHES, ess: Math.round(1 / s2), value: exact, se: se },
    filter: { particles: PARTICLE_COUNT, seeds: REFERENCE_SEEDS, mean: filter.mean, sd: filter.sd },
  };
  writeFileSync(OLD_POSTERIOR_FILE, `${JSON.stringify(ref, null, 2)}\n`);
  console.log(`wrote ${OLD_POSTERIOR_FILE}`);
}

function printComparison(exact: Summary, se: Summary, mean: Summary, sd: Summary, seeds: number): void {
  console.log('                exact (+- se)            filter mean   seed sd     bias / filter se');
  for (const k of SUMMARY_KEYS) {
    const filterSe = sd[k] / Math.sqrt(seeds);
    const z = (mean[k] - exact[k]) / Math.sqrt(filterSe * filterSe + se[k] * se[k]);
    console.log(`  ${k.padEnd(11)} ${exact[k].toFixed(5).padStart(10)} +- ${se[k].toFixed(5)}   `
      + `${mean[k].toFixed(5).padStart(10)}   ${sd[k].toFixed(5)}   ${(mean[k] - exact[k]).toFixed(5)} (${z.toFixed(1)} se)`);
  }
}

/* ---------------------------------------------------- noise, as the app */

/** A record answered in the five words, cooked for the literature's time. */
export function wordRecord(
  level: number, mass_g: number, word: YolkWord | null, white: WhiteReport | null, over: { probe_C?: number } = {},
): EggRecord {
  const egg = eggFromMass(mass_g / 1000);
  const setup = appSetup();
  const t = solveCookTime(egg, setup, DEFAULT_PARAMS, donenessFromSlider(level)).result.cookTime_s;
  return {
    v: 1, uid: null, day: '2026-10-06', app: 'web', appVersion: '0.4.0', prior: '2026-09', model: null,
    egg: { mass_g: recordMass_g(egg.mass_kg), massFrom: 'class', sizeTable: 'eu' },
    setup: {
      startMode: setup.startMode, eggStart_C: setup.eggStart_C, eggFrom: 'fridge', ambient_C: setup.ambient_C,
      boiling_C: setup.boiling_C, timeToBoil_s: setup.timeToBoil_s, timeToBoilFrom: 'remembered',
      cooling: setup.cooling, afterBoil: 'hold', waterLitres: setup.waterLitres, eggCount: setup.eggCount,
    },
    level: level, recommended_s: t, nudge_s: 0, pulled_s: t + 3, pulledBy: 'cook', cooled_s: 180,
    yolk: null, yolkWord: word, white: white,
    probe: over.probe_C === undefined ? null : { centre_C: over.probe_C, after_s: 180 },
    forecast: null, lang: 'en', register: 'modern', units: 'metric',
  };
}

/** Ten eggs answered in the five words: a cook a little firmer than the
 *  literature, whose whites at soft come out runny. */
export function wordLog(): EggRecord[] {
  return [
    wordRecord(0.41, 62, 'jammy', 'firm'),
    wordRecord(0.22, 58, 'runny', 'runny'),
    wordRecord(0.41, 68, 'soft', 'tender'),
    wordRecord(0.5, 63, 'jammy', 'firm'),
    wordRecord(0.3, 55.3, 'soft', 'tender'),
    wordRecord(0.62, 68, 'fudgy', 'firm'),
    wordRecord(0.41, 60.2, 'jammy', null),
    wordRecord(0.22, 68, 'soft', 'runny'),
    wordRecord(0.41, 58, null, 'firm'),
    wordRecord(0.8, 63, 'fudgy', 'firm'),
  ];
}

/** What the web app shows at jammy for CHECK_EGG after this calibration: the
 *  decision surface, the odds profile and its envelope (src/ui/app.ts,
 *  `decided`). */
function appDecision(c: Calibration): { time_s: number; meanTime_s: number; odds: number; tenths: number } {
  const grid = buildRequestedGrid(decisionGridRequest(decisionInputs(c, CHECK_EGG, CHECK_SETUP)));
  const profile = oddsProfile(c, CHECK_EGG, CHECK_SETUP, grid);
  const a = answerAt(c, CHECK_EGG, CHECK_SETUP, CHECK_LEVEL, profile, true);
  const d = decide(c, grid, a.solution, logYolkTarget(a.level), envelopeBounds(profile, a.level));
  return { time_s: d.cookTime_s, meanTime_s: d.meanCookTime_s, odds: d.odds, tenths: d.oddsTenths };
}

function describe(xs: number[], digits: number): string {
  const n = xs.length;
  const m = xs.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (n - 1));
  const sorted = [...xs].sort((a, b) => a - b);
  const q = (f: number): number => sorted[Math.round(f * (n - 1))];
  return `mean ${m.toFixed(digits)}  sd ${sd.toFixed(digits)}  5-95% ${q(0.05).toFixed(digits)} .. ${q(0.95).toFixed(digits)}`
    + `  range ${sorted[0].toFixed(digits)} .. ${sorted[n - 1].toFixed(digits)}`;
}

function noise(seeds: number, particles: number): void {
  for (const [name, log] of [['the old answers (10 eggs)', oldLog()], ['ten eggs in the five words', wordLog()]] as const) {
    const t0 = Date.now();
    const rows: { alpha: number; offset: number; time: number; mean: number; odds: number; tenths: number }[] = [];
    for (let k = 0; k < seeds; k++) {
      const c = replay(freshCalibration(particles, seedOf(k)), log, calibrationGrid);
      const s = summarise(c.posterior, decisionSurface());
      const d = appDecision(c);
      rows.push({ alpha: s.alphaMean, offset: s.offsetMean, time: d.time_s, mean: d.meanTime_s, odds: d.odds, tenths: d.tenths });
    }
    console.log(`\n${name}: ${seeds} seeds x ${particles} particles, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    console.log(`  time-scale, x literature   ${describe(rows.map((r) => r.alpha), 4)}`);
    console.log(`  taste offset, decades      ${describe(rows.map((r) => r.offset), 4)}`);
    console.log(`  jammy time chosen, s       ${describe(rows.map((r) => r.time), 1)}`);
    console.log(`  jammy mean solve, s        ${describe(rows.map((r) => r.mean), 1)}`);
    console.log(`  odds                       ${describe(rows.map((r) => r.odds), 3)}`);
    const tenths = new Map<number, number>();
    for (const r of rows) tenths.set(r.tenths, (tenths.get(r.tenths) ?? 0) + 1);
    console.log(`  odds in tenths             ${[...tenths.entries()].sort((a, b) => a[0] - b[0]).map(([t, n]) => `${t}/10 x${n}`).join(', ')}`);
  }
}

/* ------------------------------------------------------------------ SBC */

/**
 * Simulation-based calibration (Talts, Betancourt, Simpson, Vehtari and
 * Gelman 2018). Draw a cook from the prior; cook a few eggs; let the cook
 * answer through the model's own likelihood, unrelated share and all; run the
 * filter on the answers; and ask where the true value falls in the
 * posterior: its posterior CDF, the weighted share of particles below it. If
 * the filter samples the true posterior, that number is uniform on [0, 1]
 * over replications, for every parameter and every function of them.
 * Too many near 0 and 1 is a posterior too narrow; a hump in the middle, too
 * wide; a slope, a bias.
 *
 * The exact posterior (`exactPosterior`, from SBC_EXACT_DRAWS prior draws) is
 * run beside the filter on the same answers, as the control: it is uniform by
 * construction, up to its own Monte Carlo error, so where it passes and the
 * filter does not, the filter is at fault and not the harness.
 */
export interface SbcScenario {
  name: string;
  eggs: { level: number; mass_g: number; kind: 'word' | 'old' | 'probe' }[];
}

export const SBC_SCENARIOS: SbcScenario[] = [
  {
    name: 'five eggs, yolk word and white',
    eggs: [
      { level: 0.41, mass_g: 62, kind: 'word' }, { level: 0.22, mass_g: 58, kind: 'word' },
      { level: 0.62, mass_g: 68, kind: 'word' }, { level: 0.41, mass_g: 55.3, kind: 'word' },
      { level: 0.3, mass_g: 63, kind: 'word' },
    ],
  },
  {
    name: 'three old answers and white, then a probe',
    eggs: [
      { level: 0.41, mass_g: 62, kind: 'old' }, { level: 0.22, mass_g: 68, kind: 'old' },
      { level: 0.62, mass_g: 58, kind: 'old' }, { level: 0.41, mass_g: 60.2, kind: 'probe' },
    ],
  },
];

/** What SBC ranks: the six particle dimensions and two combinations the
 *  answers pin harder than any one dimension - the yolk's and the white's
 *  latent at the first egg's time. */
export const SBC_QUANTITIES = [
  'alpha', 'taste', 'tauAir', 'noise', 'white', 'firmGap', 'yolkLatent', 'whiteLatent',
] as const;

type Quantity = typeof SBC_QUANTITIES[number];

function quantities(p: Particle, g: DoseGrid, t: number): Record<Quantity, number> {
  return {
    alpha: p.alpha_m2s, taste: p.logDoseOffset, tauAir: p.tauAirScale, noise: p.noise,
    white: p.whiteOffset, firmGap: p.whiteFirmGap,
    yolkLatent: lookupLogYolkDose(g, p.alpha_m2s, t) - p.logDoseOffset,
    whiteLatent: lookupLogWhiteDose(g, p.alpha_m2s, t) - p.whiteOffset,
  };
}

/** A standard normal from two uniforms. */
function normalOf(u: () => number): number {
  return Math.sqrt(-2.0 * Math.log(Math.max(u(), 1e-12))) * Math.cos(2.0 * Math.PI * u());
}

/** A probe reading as the likelihood says one is made: the peak, less an
 *  exponential handling error, plus the instrument's; or, PROBE_UNRELATED of
 *  the time, anything across PROBE_UNRELATED_SPAN_C around it. */
function probeReading(peak_C: number, u: () => number): number {
  if (u() < PROBE_UNRELATED) return peak_C + PROBE_UNRELATED_SPAN_C * (u() - 0.5);
  const h = -PROBE_HANDLING_MEAN_C * Math.log(Math.max(1.0 - u(), 1e-12));
  return peak_C - h + PROBE_INSTRUMENT_SD_C * normalOf(u);
}

const FEEDBACKS: Feedback[] = [-1, 0, 1];
const WHITES: WhiteReport[] = ['runny', 'tender', 'firm'];

/** The records a cook `truth` would make, answering through the model. */
function simulateAnswers(scenario: SbcScenario, base: EggRecord[], surfaces: DoseGrid[], truth: Particle, u: () => number): EggRecord[] {
  return base.map((r, k) => {
    const g = surfaces[k];
    const t = recordCookTime_s(r);
    const kind = scenario.eggs[k].kind;
    if (kind === 'probe') {
      return { ...r, white: null, probe: { centre_C: probeReading(lookupPeakYolk_C(g, truth.alpha_m2s, t), u), after_s: 180 } };
    }
    const white = WHITES[draw(whiteProbit(g, truth, t).map(withUnrelated), u())];
    if (kind === 'old') {
      const yolk = FEEDBACKS[draw(yolkProbit(g, truth, t, logYolkTarget(r.level)).map(withUnrelated), u())];
      return { ...r, yolk: yolk, yolkWord: null, white: white };
    }
    const word = YOLK_WORDS[draw(yolkWordProbit(g, truth, t).map(withUnrelatedWord), u())];
    return { ...r, yolk: null, yolkWord: word, white: white };
  });
}

/** The posterior CDF at `x` of quantity `q`: the weighted share below it. */
function cdfAt(post: Posterior, g: DoseGrid, t: number, q: Quantity, x: number): number {
  let below = 0.0;
  let total = 0.0;
  for (let i = 0; i < post.particles.length; i++) {
    const v = quantities(post.particles[i], g, t)[q];
    const w = post.weights[i];
    total += w;
    if (v < x) below += w;
    else if (v === x) below += 0.5 * w;
  }
  return below / total;
}

export interface SbcResult {
  scenario: string;
  replications: number;
  /** Per quantity: the posterior CDF at the truth, one per replication. */
  filter: Record<Quantity, number[]>;
  exact: Record<Quantity, number[]> | null;
}

export const SBC_EXACT_DRAWS = 20_000;

/** Run one scenario: `replications` cooks from `seed`, the filter at
 *  `particles`, and the exact posterior beside it unless `exact` is false. */
export function sbc(scenario: SbcScenario, replications: number, particles: number, seed: number, exact = true): SbcResult {
  const base = scenario.eggs.map((e) => wordRecord(e.level, e.mass_g, null, null));
  const fresh = freshCalibration(1, 1);
  const surfaces = base.map((r) => buildRequestedGrid(gridRequestFor(fresh, r, COARSE_GRID)));
  const t0 = recordCookTime_s(base[0]);
  const empty = (): Record<Quantity, number[]> => Object.fromEntries(SBC_QUANTITIES.map((q) => [q, [] as number[]])) as unknown as Record<Quantity, number[]>;
  const out: SbcResult = { scenario: scenario.name, replications: replications, filter: empty(), exact: exact ? empty() : null };
  const u = rng(seed);
  for (let n = 0; n < replications; n++) {
    const truth = createPrior(1, seedOf(3 * n) ^ seed).particles[0];
    const log = simulateAnswers(scenario, base, surfaces, truth, u);
    const c = foldOnSurfaces(freshCalibration(particles, seedOf(3 * n + 1) ^ seed), log, surfaces);
    const truthQ = quantities(truth, surfaces[0], t0);
    for (const q of SBC_QUANTITIES) out.filter[q].push(cdfAt(c.posterior, surfaces[0], t0, q, truthQ[q]));
    if (out.exact !== null) {
      const ex = exactPosterior(SBC_EXACT_DRAWS, seedOf(3 * n + 2) ^ seed, log, surfaces);
      for (const q of SBC_QUANTITIES) out.exact[q].push(cdfAt(ex, surfaces[0], t0, q, truthQ[q]));
    }
  }
  return out;
}

/* Uniformity. */

/** The regularised upper incomplete gamma Q(a, x), for the chi-square's p. */
function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  const lnGammaA = lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 500; n++) { term *= x / (a + n); sum += term; if (term < sum * 1e-15) break; }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - lnGammaA);
  }
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGammaA) * h;
}

function lnGamma(x: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const c of g) ser += c / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

export const SBC_BINS = 10;

/** Chi-square of the counts in SBC_BINS equal bins, and its p-value. */
export function chiSquare(us: number[]): { stat: number; p: number; counts: number[] } {
  const counts = new Array<number>(SBC_BINS).fill(0);
  for (const x of us) counts[Math.min(SBC_BINS - 1, Math.floor(x * SBC_BINS))]++;
  const e = us.length / SBC_BINS;
  let stat = 0;
  for (const o of counts) stat += (o - e) * (o - e) / e;
  return { stat: stat, p: gammaQ((SBC_BINS - 1) / 2, stat / 2), counts: counts };
}

/** Kolmogorov-Smirnov against the uniform, and its asymptotic p-value. */
export function ksUniform(us: number[]): { d: number; p: number } {
  const s = [...us].sort((a, b) => a - b);
  const n = s.length;
  let d = 0;
  for (let i = 0; i < n; i++) d = Math.max(d, (i + 1) / n - s[i], s[i] - i / n);
  const lambda = (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n)) * d;
  let p = 0;
  for (let k = 1; k <= 100; k++) p += 2 * (k % 2 === 1 ? 1 : -1) * Math.exp(-2 * k * k * lambda * lambda);
  return { d: d, p: Math.min(1, Math.max(0, p)) };
}

/** The share of posterior CDFs in the outer tenth (below 0.05 or above
 *  0.95): 0.10 when calibrated; more is too narrow, less too wide. */
export function outerShare(us: number[]): number {
  return us.filter((x) => x < 0.05 || x > 0.95).length / us.length;
}

function reportSbc(r: SbcResult): void {
  console.log(`\n${r.scenario}: ${r.replications} cooks`);
  console.log('  quantity      filter: chi2 p   KS p    outer  mean   counts by tenth          | exact: chi2 p  KS p   outer');
  for (const q of SBC_QUANTITIES) {
    const f = r.filter[q];
    const c = chiSquare(f);
    const k = ksUniform(f);
    const m = f.reduce((s, x) => s + x, 0) / f.length;
    let line = `  ${q.padEnd(12)}  ${c.p.toFixed(4).padStart(13)} ${k.p.toFixed(4).padStart(7)}  ${outerShare(f).toFixed(3)}  ${m.toFixed(3)}  ${c.counts.join(' ').padEnd(24)}`;
    if (r.exact !== null) {
      const e = r.exact[q];
      line += ` | ${chiSquare(e).p.toFixed(4).padStart(13)} ${ksUniform(e).p.toFixed(4).padStart(6)}  ${outerShare(e).toFixed(3)}`;
    }
    console.log(line);
  }
}

/* ------------------------------------------------------------------ main */

if (process.argv[1]?.endsWith('posterior.js')) {
  const [mode, a, b] = process.argv.slice(2);
  if (mode === 'noise') noise(Number(a ?? 50), Number(b ?? PARTICLE_COUNT));
  else if (mode === 'reference') writeReference();
  else if (mode === 'sbc') {
    const reps = Number(a ?? 1000);
    const particles = Number(b ?? PARTICLE_COUNT);
    for (const s of SBC_SCENARIOS) {
      const t0 = Date.now();
      reportSbc(sbc(s, reps, particles, 0x5bc));
      console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
  } else {
    console.error('usage: npm run posterior -- noise [seeds] [particles] | reference | sbc [replications] [particles]');
    process.exit(2);
  }
}
