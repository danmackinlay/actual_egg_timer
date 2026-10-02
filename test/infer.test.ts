/**
 * The particle filter under the ordered probit and the white offset.
 *
 * Claims in this repo get a test, and these are the claims INFERENCE.md
 * sections 2 and 3 make about the likelihood: that the probit keeps a hard
 * band's meaning and its confidence, that no answer can kill a particle, that
 * the white and the yolk are two observables, that an injected cook is
 * recovered no worse than under a hard band, that the predictive is calibrated
 * on simulated cooks, and what two runny whites at soft do to the next cook.
 * The conformance fixtures pin the arithmetic particle by particle; what is
 * checked here is the reasoning the arithmetic rests on.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FEEDBACK_BAND, NOISE_MEDIAN, UNRELATED, Feedback, Particle, Posterior, WhiteReport,
  answerLikelihood, createPrior, posteriorAlphaRelSd, posteriorMeanOffset,
  posteriorMeanWhiteOffset, posteriorParams, updatePosterior, whiteAnswerProbabilities,
  yolkAnswerProbabilities,
} from '../src/core/infer.js';
import { DoseGrid, buildDoseGrid, lookupLogWhiteDose, lookupLogYolkDose } from '../src/core/doseGrid.js';
import {
  DEFAULT_PARAMS, ModelParams, WHITE_DOSE_TARGET, donenessFromSlider, logYolkTarget, simulate,
  solveCookTime,
} from '../src/core/solve.js';
import { eggFromMass } from '../src/core/geometry.js';
import { Z_WHITE, Z_YOLK } from '../src/core/constants.js';
import { CALIBRATION_SEED, PARTICLE_COUNT, calibrationGrid } from '../src/core/policy.js';
import {
  Calibration, EggRecord, PRIOR_ID, calibrationDoneness, calibrationParams, freshCalibration, replay,
} from '../src/core/record.js';
import { appSetup, draw, rng } from '../tools/common.js';

// --------------------------------------------------------------------------
// shared fixtures
// --------------------------------------------------------------------------

const EGG = eggFromMass(0.068);

/** A cook at a slider level, and a surface around it. Deliberately coarser than
 *  the app's grid where the test is about what the filter DOES with a surface. */
function cookAt(level: number): { grid: DoseGrid; cookTime_s: number; logNominalTarget: number } {
  const setup = appSetup();
  const t = solveCookTime(EGG, setup, DEFAULT_PARAMS, donenessFromSlider(level)).result.cookTime_s;
  const grid = buildDoseGrid(
    EGG, setup, 1.0, {
      alphaMin: DEFAULT_PARAMS.alpha_m2s * 0.55,
      alphaMax: DEFAULT_PARAMS.alpha_m2s * 1.8,
      alphaCount: 9,
      timeMin_s: Math.max(60, t * 0.35),
      timeMax_s: t * 2.4,
      timeCount: 12,
    },
  );
  return { grid: grid, cookTime_s: t, logNominalTarget: logYolkTarget(level) };
}

function particle(over: Partial<Particle> = {}): Particle {
  return {
    alpha_m2s: DEFAULT_PARAMS.alpha_m2s, logDoseOffset: 0, tauAirScale: 1,
    noise: NOISE_MEDIAN, whiteOffset: 0, whiteFirmGap: 1.08, ...over,
  };
}

/** A particle whose yolk latent - delivered minus wanted - is exactly `d`. */
function particleAtYolk(c: ReturnType<typeof cookAt>, d: number, over: Partial<Particle> = {}): Particle {
  const delivered = lookupLogYolkDose(c.grid, DEFAULT_PARAMS.alpha_m2s, c.cookTime_s);
  return particle({ ...over, logDoseOffset: delivered - c.logNominalTarget - d });
}

/** A particle whose white latent - delivered minus the runny | tender cut - is `l`. */
function particleAtWhite(c: ReturnType<typeof cookAt>, l: number, over: Partial<Particle> = {}): Particle {
  const delivered = lookupLogWhiteDose(c.grid, DEFAULT_PARAMS.alpha_m2s, c.cookTime_s);
  return particle({ ...over, whiteOffset: delivered - Math.log10(WHITE_DOSE_TARGET) - l });
}

function yolkProbs(c: ReturnType<typeof cookAt>, p: Particle): number[] {
  return ([-1, 0, 1] as Feedback[]).map(
    (y) => answerLikelihood(c.grid, p, c.cookTime_s, c.logNominalTarget, y, null),
  );
}

function whiteProbs(c: ReturnType<typeof cookAt>, p: Particle): number[] {
  return (['runny', 'tender', 'firm'] as WhiteReport[]).map(
    (w) => answerLikelihood(c.grid, p, c.cookTime_s, c.logNominalTarget, null, w),
  );
}

// --------------------------------------------------------------------------
// 1. The probit
// --------------------------------------------------------------------------

test('1a. the answers are a distribution, for every particle, on both questions', () => {
  const c = cookAt(0.41);
  for (const d of [-2, -0.5, -0.28, 0, 0.1, 0.28, 0.9, 3]) {
    const s = yolkProbs(c, particleAtYolk(c, d)).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(s - 1) < 1e-12, `yolk at ${d}: ${s}`);
  }
  for (const l of [-2, -0.3, 0, 0.5, 1.08, 1.5, 4]) {
    const probs = whiteProbs(c, particleAtWhite(c, l));
    assert.ok(Math.abs(probs.reduce((a, b) => a + b, 0) - 1) < 1e-12, `white at ${l}`);
  }
});

test('1b. the cutpoints sit at -+FEEDBACK_BAND, so the old band keeps its meaning', () => {
  const c = cookAt(0.41);
  // Delivered exactly what was wanted: "just right" is the likeliest answer,
  // and the two wrong ones are equally likely.
  const centre = yolkProbs(c, particleAtYolk(c, 0));
  assert.ok(centre[1] > centre[0] && centre[1] > centre[2]);
  assert.ok(Math.abs(centre[0] - centre[2]) < 1e-9);
  // On a cutpoint, the two answers either side of it are a coin flip.
  const edge = yolkProbs(c, particleAtYolk(c, FEEDBACK_BAND));
  assert.ok(Math.abs(edge[1] - edge[2]) < 0.01, `at the upper cut: ${edge}`);
});

test('1c. at the prior median, as confident as the old 0.8 / 0.1 where that one described an egg', () => {
  // NOISE_MEDIAN's justification, executed: the probit gives "just right" 0.80
  // at the centre of the band and 0.10 one band-width outside it, as the fixed
  // likelihood it replaces did, to within the rounding of 0.207 to 0.20.
  const c = cookAt(0.41);
  const centre = yolkProbs(c, particleAtYolk(c, 0))[1];
  const out = yolkProbs(c, particleAtYolk(c, 2 * FEEDBACK_BAND))[1];
  assert.ok(Math.abs(centre - 0.8) < 0.02, `P(just right | centre) = ${centre}`);
  assert.ok(Math.abs(out - 0.1) < 0.01, `P(just right | one band out) = ${out}`);
  assert.ok(Math.abs(centre / out - 8) < 1, `ratio ${centre / out}`);
});

test('1d. no answer can kill a particle: every likelihood is at least the unrelated share', () => {
  const c = cookAt(0.22);
  const floor = UNRELATED / 3;
  for (const d of [-5, 5]) {
    for (const v of yolkProbs(c, particleAtYolk(c, d))) assert.ok(v >= floor - 1e-15);
  }
  for (const l of [-5, 5]) {
    for (const v of whiteProbs(c, particleAtWhite(c, l))) assert.ok(v >= floor - 1e-15);
  }
});

test('1f. the white\'s noise is the yolk\'s, in degrees', () => {
  // A white answer three quarters of the yolk's noise in decades is the same
  // peak temperature, because Z_WHITE > Z_YOLK: 50% of the way from runny to
  // tender takes the same fraction of a degree as from soft to just right.
  const c = cookAt(0.3);
  const width = (probs: (x: number) => number): number => {
    // the latent distance from a coin flip to 84% (one sd)
    let lo = 0;
    let hi = 3;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if (probs(mid) < 0.84) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  };
  // Strip the unrelated share: one answer's worth from "too firm", two from
  // "tender or firm".
  const yolkSd = width((x) => (yolkProbs(c, particleAtYolk(c, FEEDBACK_BAND + x))[2] - UNRELATED / 3) / (1 - UNRELATED));
  const whiteSd = width((x) => {
    const probs = whiteProbs(c, particleAtWhite(c, x));
    return (probs[1] + probs[2] - 2 * UNRELATED / 3) / (1 - UNRELATED);
  });
  assert.ok(Math.abs(yolkSd * Z_YOLK - whiteSd * Z_WHITE) < 0.01,
    `yolk ${yolkSd * Z_YOLK} C against white ${whiteSd * Z_WHITE} C`);
});

// --------------------------------------------------------------------------
// 2. Two observables
// --------------------------------------------------------------------------

test('2a. white and yolk dose respond differently to alpha, so the white is a second observable', () => {
  const c = cookAt(0.22);
  const lo = DEFAULT_PARAMS.alpha_m2s * 0.9;
  const hi = DEFAULT_PARAMS.alpha_m2s * 1.1;
  const dYolk = lookupLogYolkDose(c.grid, hi, c.cookTime_s) - lookupLogYolkDose(c.grid, lo, c.cookTime_s);
  const dWhite = lookupLogWhiteDose(c.grid, hi, c.cookTime_s) - lookupLogWhiteDose(c.grid, lo, c.cookTime_s);
  assert.ok(dYolk > 0 && dWhite > 0, `doses should rise with alpha: ${dYolk}, ${dWhite}`);
  assert.ok(dWhite / dYolk < 0.85, `the white responds ${(100 * dWhite / dYolk).toFixed(0)}% as strongly`);
});

test('2b. a runny white raises the white offset and lowers alpha; a firm one does the opposite', () => {
  const c = cookAt(0.22);
  const before = createPrior(600, 0x5eed1e);
  const moved: Record<string, Posterior> = {};
  for (const w of ['runny', 'firm'] as WhiteReport[]) {
    const post = createPrior(600, 0x5eed1e);
    updatePosterior(post, c.grid, c.cookTime_s, c.logNominalTarget, null, w);
    moved[w] = post;
  }
  const a0 = posteriorParams(before).alpha_m2s;
  const w0 = posteriorMeanWhiteOffset(before);
  assert.ok(posteriorMeanWhiteOffset(moved['runny']) > w0 + 0.1, 'runny: the white sets later');
  assert.ok(posteriorParams(moved['runny']).alpha_m2s < a0, 'runny: the heat got in slowly');
  assert.ok(posteriorMeanWhiteOffset(moved['firm']) < w0, 'firm: the white sets sooner');
  assert.ok(posteriorParams(moved['firm']).alpha_m2s > a0, 'firm: the heat got in fast');
});

test('2c. a white answer barely touches the yolk\'s taste offset', () => {
  // The taste offset is on the yolk's axis and does not enter the white's
  // likelihood, so only its correlation with alpha - none, in the prior - can
  // move it.
  const c = cookAt(0.22);
  const before = createPrior(600, 0x5eed1e);
  const after = createPrior(600, 0x5eed1e);
  updatePosterior(after, c.grid, c.cookTime_s, c.logNominalTarget, null, 'runny');
  const dOffset = Math.abs(posteriorMeanOffset(after) - posteriorMeanOffset(before));
  assert.ok(dOffset < 0.03, `the white moved the taste offset by ${dOffset}`);
});

test('2d. one fold per egg: the answers together are the product, whichever arrived first', () => {
  const c = cookAt(0.3);
  const together = createPrior(200, 11);
  updatePosterior(together, c.grid, c.cookTime_s, c.logNominalTarget, -1, 'runny');
  const expected = createPrior(200, 11);
  let total = 0;
  for (let i = 0; i < 200; i++) {
    const p = expected.particles[i];
    expected.weights[i] *= answerLikelihood(c.grid, p, c.cookTime_s, c.logNominalTarget, -1, null)
      * answerLikelihood(c.grid, p, c.cookTime_s, c.logNominalTarget, null, 'runny');
    total += expected.weights[i];
  }
  // Before any resample: compare on a set that cannot degenerate from one egg.
  if (together.weights.every((w) => w !== 1 / 200)) {
    for (let i = 0; i < 200; i++) {
      assert.ok(Math.abs(together.weights[i] - expected.weights[i] / total) < 1e-12, `weight ${i}`);
    }
  }
  // And no answers is no fold at all.
  const none = createPrior(200, 11);
  updatePosterior(none, c.grid, c.cookTime_s, c.logNominalTarget, null, null);
  assert.deepEqual(none, createPrior(200, 11));
});

// --------------------------------------------------------------------------
// 3. The recovery experiment
// --------------------------------------------------------------------------

test('3. an injected alpha and taste are recovered in no more eggs, to no worse an error', (t) => {
  // alpha = 1.535e-7 with a taste offset of +0.20 decades,
  // answers generated without noise from the truth. Each egg is cooked at the
  // model's own best guess of what this cook wants - the posterior mean alpha,
  // aimed at the nominal target moved by the posterior mean taste - and the
  // yolk answer is what the truth says about it. Measured 27 September on the
  // same egg (68 g, fridge, boiling water, ice, jammy): a hard 0.8 / 0.1 band
  // is within 15 s of the true optimum from egg 3, settled 14.0 s long, alpha
  // sd 2.9%; the probit within 15 s from egg 2, settled 12.2 s short, sd 3.0%.
  const truth: ModelParams = { alpha_m2s: 1.535e-7, tauAirScale: 1 };
  const TASTE = 0.2;
  const setup = appSetup();
  const d = donenessFromSlider(0.41);
  const target = Math.log10(d.yolkDose_min);
  const optimum = solveCookTime(EGG, setup, truth, { ...d, yolkDose_min: d.yolkDose_min * 10 ** TASTE }).result.cookTime_s;
  const post = createPrior(PARTICLE_COUNT, CALIBRATION_SEED);
  const errors: number[] = [];
  let sd = 0;
  for (let k = 0; k < 6; k++) {
    const alpha = k === 0 ? DEFAULT_PARAMS.alpha_m2s : posteriorParams(post).alpha_m2s;
    const taste = k === 0 ? 0 : posteriorMeanOffset(post);
    const t = solveCookTime(EGG, setup, { alpha_m2s: alpha, tauAirScale: 1 },
      { ...d, yolkDose_min: d.yolkDose_min * 10 ** taste }).result.cookTime_s;
    errors.push(t - optimum);
    const g = calibrationGrid(alpha, t);
    const grid = buildDoseGrid(EGG, setup, 1, g);
    const latent = Math.log10(simulate(EGG, setup, truth, t).yolkDose_min) - (target + TASTE);
    const yolk: Feedback = latent < -FEEDBACK_BAND ? -1 : latent > FEEDBACK_BAND ? 1 : 0;
    updatePosterior(post, grid, t, target, yolk, null);
    sd = posteriorAlphaRelSd(post);
  }
  const firstClose = errors.findIndex((_e, i) => errors.slice(i).every((x) => Math.abs(x) < 15));
  t.diagnostic(`errors ${errors.map((e) => e.toFixed(1)).join(', ')} s; alpha sd ${(100 * sd).toFixed(2)}%`);
  assert.ok(firstClose >= 0 && firstClose <= 2, `within 15 s from egg ${firstClose + 1}: ${errors.map((e) => e.toFixed(1))}`);
  assert.ok(Math.abs(errors[errors.length - 1]) <= 14.0, `settled ${errors[errors.length - 1].toFixed(1)} s off`);
  assert.ok(sd > 0.015 && sd < 0.05, `alpha sd ${sd}: plateaus, neither collapsing nor wandering`);
});

// --------------------------------------------------------------------------
// 4. The predictive is calibrated on simulated cooks
// --------------------------------------------------------------------------

test('4. P(answer) is calibrated: simulated cooks answer as often as the model says they will', (t) => {
  // Draw each cook's truth from the prior, cook them a few eggs at assorted
  // levels, and before each egg ask the model how likely each answer is. Then
  // draw the answers from the truth - the probit, the unrelated share and all -
  // and fold them. If the filter is doing its job, answers predicted at 30%
  // happen 30% of the time, at every stage of learning. Measured on 27
  // September: 200 cooks, 5 eggs each, 6000 predictions; expected calibration
  // error 1.4% on the yolk and 1.8% on the white, and 0.8% / 1.0% at 400 cooks.
  //
  // Each cook's truth is a draw from ONE long prior, not the first particle of
  // prior after prior from consecutive seeds: xorshift's first outputs from
  // nearby seeds are correlated, and that sample is not the prior - it showed
  // up here as a miscalibrated first egg before anything had been learned.
  const setup = appSetup();
  const levels = [0.1, 0.22, 0.3, 0.41, 0.5, 0.62, 0.75];
  const times = levels.map((l) => solveCookTime(EGG, setup, DEFAULT_PARAMS, donenessFromSlider(l)).result.cookTime_s);
  const grid = buildDoseGrid(
    EGG, setup, 1, {
      alphaMin: DEFAULT_PARAMS.alpha_m2s * 0.55,
      alphaMax: DEFAULT_PARAMS.alpha_m2s * 1.8,
      alphaCount: 21,
      timeMin_s: 200,
      timeMax_s: 900,
      timeCount: 32,
    },
  );
  const random = rng(20260927);
  const BINS = 10;
  const predicted = new Array<number>(BINS).fill(0);
  const observed = new Array<number>(BINS).fill(0);
  const counts = new Array<number>(BINS).fill(0);
  const note = (p: number, happened: boolean): void => {
    const b = Math.min(BINS - 1, Math.floor(p * BINS));
    predicted[b] += p;
    observed[b] += happened ? 1 : 0;
    counts[b] += 1;
  };
  const truths = createPrior(200, 777).particles;
  for (let cook = 0; cook < 200; cook++) {
    const truth = truths[cook];
    const post = createPrior(300, 1 + Math.floor(random() * 2147483646));
    for (let egg = 0; egg < 5; egg++) {
      const k = Math.floor(random() * levels.length);
      const t = times[k];
      const target = logYolkTarget(levels[k]);
      const py = yolkAnswerProbabilities(post, grid, t, target);
      const pw = whiteAnswerProbabilities(post, grid, t);
      const ty = ([-1, 0, 1] as Feedback[]).map((y) => answerLikelihood(grid, truth, t, target, y, null));
      const tw = (['runny', 'tender', 'firm'] as WhiteReport[]).map((w) => answerLikelihood(grid, truth, t, target, null, w));
      const y = draw(ty, random());
      const w = draw(tw, random());
      for (let j = 0; j < 3; j++) {
        note(py[j], j === y);
        note(pw[j], j === w);
      }
      updatePosterior(post, grid, t, target, (y - 1) as Feedback, (['runny', 'tender', 'firm'] as WhiteReport[])[w]);
    }
  }
  let ece = 0;
  let total = 0;
  const rows: string[] = [];
  for (let b = 0; b < BINS; b++) {
    if (counts[b] === 0) continue;
    const p = predicted[b] / counts[b];
    const o = observed[b] / counts[b];
    rows.push(`${(100 * p).toFixed(0)}% -> ${(100 * o).toFixed(0)}% (${counts[b]})`);
    ece += Math.abs(p - o) * counts[b];
    total += counts[b];
    if (counts[b] < 40) continue;
    const se = Math.sqrt(Math.max(p * (1 - p), 0.01) / counts[b]);
    assert.ok(Math.abs(p - o) <= 3 * se + 0.01, `bin ${b}: predicted ${p.toFixed(3)}, observed ${o.toFixed(3)}, n ${counts[b]}`);
  }
  ece /= total;
  t.diagnostic(`expected calibration error ${(100 * ece).toFixed(2)}%: ${rows.join('; ')}`);
  assert.ok(ece < 0.03, `expected calibration error ${ece.toFixed(4)}: ${rows.join('; ')}`);
});

// --------------------------------------------------------------------------
// 5. Two runny whites at soft
// --------------------------------------------------------------------------

function softRecord(cal: Calibration, level: number, yolk: Feedback | null, white: WhiteReport | null): EggRecord {
  const setup = appSetup();
  const t = solveCookTime(EGG, setup, calibrationParams(cal), calibrationDoneness(cal, level)).result.cookTime_s;
  return {
    v: 1, uid: null, day: '2026-09-27', app: 'web', appVersion: '0.2.0', prior: PRIOR_ID, model: null,
    egg: { mass_g: 68, massFrom: 'class', sizeTable: 'eu' },
    setup: {
      startMode: 'hot', eggStart_C: 4, eggFrom: 'fridge', ambient_C: 20, boiling_C: 100,
      timeToBoil_s: 480, timeToBoilFrom: 'default', cooling: 'ice', afterBoil: 'hold',
      waterLitres: 2, eggCount: 2,
    },
    level: level, recommended_s: t, nudge_s: 0, pulled_s: t, pulledBy: 'timeout', cooled_s: 180,
    yolk: yolk, white: white, probe: null, forecast: null, lang: 'en', register: 'modern', units: 'metric',
  };
}

function nextTimes(cal: Calibration): { soft: number; jammy: number; softWhiteBound: boolean } {
  const setup = appSetup();
  const soft = solveCookTime(EGG, setup, calibrationParams(cal), calibrationDoneness(cal, 0.22));
  const jammy = solveCookTime(EGG, setup, calibrationParams(cal), calibrationDoneness(cal, 0.41));
  return { soft: soft.result.cookTime_s, jammy: jammy.result.cookTime_s, softWhiteBound: !soft.reachable };
}

/** Two eggs at soft, white runny, from a fresh prior, on the app's own grid. */
const twoRunny = (() => {
  const start = freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED);
  const out: Record<'whiteOnly' | 'withYolk', { before: ReturnType<typeof nextTimes>; after: ReturnType<typeof nextTimes>; cal: Calibration }> =
    {} as never;
  for (const kind of ['whiteOnly', 'withYolk'] as const) {
    let cal = start;
    const log: EggRecord[] = [];
    for (let i = 0; i < 2; i++) {
      log.push(softRecord(cal, 0.22, kind === 'withYolk' ? 0 : null, 'runny'));
      cal = replay(start, log);
    }
    out[kind] = { before: nextTimes(start), after: nextTimes(cal), cal: cal };
  }
  return out;
})();

test('5a. two runny whites at soft move the next soft recommendation later', (t) => {
  for (const kind of ['whiteOnly', 'withYolk'] as const) {
    const r = twoRunny[kind];
    t.diagnostic(`${kind}: soft ${r.before.soft.toFixed(1)} -> ${r.after.soft.toFixed(1)}, jammy ${r.before.jammy.toFixed(1)} -> ${r.after.jammy.toFixed(1)}`);
    assert.ok(r.after.soft > r.before.soft + 15, `${kind}: soft ${r.before.soft.toFixed(1)} -> ${r.after.soft.toFixed(1)}`);
    assert.ok(posteriorMeanWhiteOffset(r.cal.posterior) > 0.4, `${kind}: the white offset took its share`);
  }
  // With the yolk answered "just right" the time-scale is held, and the soft
  // time is now the shortest cook that sets the white: the slider will be
  // refused at soft and offered the softest egg whose white sets.
  assert.ok(twoRunny.withYolk.after.softWhiteBound, 'soft is now bound by the white');
});

// Ideally a jammy recommendation would be left nearly alone. It is not: with
// these priors a runny white is blamed on the time-scale about
// 2:1 over the white offset (alpha's prior is 0.70 decades of white dose wide,
// the offset's 0.5), so jammy moves about as far as soft. The owner has left it
// so until a probe or pooling pins the time-scale (DECISIONS.md 18).
// This holds the limit as it stands, so a change
// that moves it - either way - is seen and has to be argued for.
test('5b. ...and, a known limit, move a jammy one about as far', (t) => {
  for (const kind of ['whiteOnly', 'withYolk'] as const) {
    const r = twoRunny[kind];
    const softMove = r.after.soft - r.before.soft;
    const jammyMove = r.after.jammy - r.before.jammy;
    t.diagnostic(`${kind}: soft moved ${softMove.toFixed(1)} s, jammy ${jammyMove.toFixed(1)} s`);
    assert.ok(jammyMove > 0.6 * softMove && jammyMove < 1.6 * softMove,
      `${kind}: soft moved ${softMove.toFixed(1)} s, jammy ${jammyMove.toFixed(1)} s`);
  }
});
