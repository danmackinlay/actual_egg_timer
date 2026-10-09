/**
 * The thermometer: a probe reading at the centre of the egg, taken when
 * the model has the centre peaking, folded as a third observation beside the
 * yolk and the white.
 *
 * The claims are INFERENCE.md section 5's: that the error
 * model is a density, skewed the way the handling errors at the peak go (cold);
 * that one reading good to a degree pins the time-scale to about 2.5%; that a
 * hot reading shortens the next cook and a cold one lengthens it; that it folds
 * through the one-fold-per-egg path, so a replay is still bit-identical; that
 * the record carries it and refuses what cannot be; and that the cooling
 * countdown ends when the yolk peaks, which is when the reading is asked for.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROBE_HANDLING_MEAN_C, PROBE_INSTRUMENT_SD_C, PROBE_UNRELATED, PROBE_UNRELATED_SPAN_C,
  answerLikelihood, createPrior, posteriorAlphaRelSd, posteriorParams, probeLikelihood,
  probeShortfallDensity, updatePosterior,
} from '../src/core/infer.js';
import { buildDoseGrid, buildRequestedGrid, lookupPeakYolk_C } from '../src/core/doseGrid.js';
import {
  CookResult, DEFAULT_PARAMS, donenessFromSlider, simulate, solveCookTime,
} from '../src/core/solve.js';
import { eggFromMass } from '../src/core/geometry.js';
import { CookSetup } from '../src/core/protocol.js';
import {
  CALIBRATION_SEED, COOLING_MIN_SECONDS, COOLING_SECONDS, PARTICLE_COUNT, calibrationGrid,
  coolingSecondsFor, plausibleProbeRange_C, probeMomentFor,
} from '../src/core/policy.js';
import {
  EggRecord, MODEL_ID, calibrationDoneness, calibrationParams, copyCalibration, foldRecord,
  freshCalibration, gridRequestFor, parseRecord, recordProbe_C, recordTeaches, replay,
} from '../src/core/record.js';
import { LITERATURE_POPULATION } from '../src/core/infer.js';
import { PULL_GRACE_SECONDS } from '../src/core/policy.js';
import { RunningCook, eventsDue, replan, startCook, withBoil, withOut } from '../src/core/running.js';
import { appSetup, knowing } from '../tools/common.js';

// --------------------------------------------------------------------------
// shared
// --------------------------------------------------------------------------

const EGG = eggFromMass(0.068);

const JAMMY = 0.41;
const COOK = solveCookTime(EGG, appSetup(), DEFAULT_PARAMS, donenessFromSlider(JAMMY));
const COOK_S = COOK.result.cookTime_s;

/** The peak a probe would see if the kitchen's time-scale were `factor` times
 *  the literature's. */
function truePeak(factor: number, cooling: CookSetup['cooling'] = 'ice'): number {
  return simulate(
    EGG, appSetup({ cooling: cooling }), { alpha_m2s: DEFAULT_PARAMS.alpha_m2s * factor },
    COOK_S,
  ).peakYolk_C;
}

function recordWith(probe_C: number | null, over: Partial<EggRecord> = {}): EggRecord {
  return {
    v: 1, uid: null, day: '2026-09-27', app: 'web', appVersion: '0.2.0', prior: LITERATURE_POPULATION.id, model: MODEL_ID,
    egg: { mass_g: 68, massFrom: 'scale', sizeTable: null },
    setup: {
      startMode: 'hot', eggStart_C: 4, eggFrom: 'fridge', ambient_C: 20, boiling_C: 100,
      timeToBoil_s: 480, timeToBoilFrom: 'default', cooling: 'ice', afterBoil: 'hold',
      waterLitres: 2, eggCount: 2,
    },
    level: JAMMY, recommended_s: COOK_S, nudge_s: 0, pulled_s: COOK_S, pulledBy: 'timeout',
    cooled_s: coolingSecondsFor(COOK.result), yolkWord: null, white: null,
    probe: probe_C === null ? null : { centre_C: probe_C, after_s: coolingSecondsFor(COOK.result) },
    forecast: null,
    lang: 'en', register: 'modern', units: 'metric',
    ...over,
  };
}

function nextCook(cal: ReturnType<typeof freshCalibration>): number {
  return solveCookTime(EGG, appSetup(), calibrationParams(cal), calibrationDoneness(cal, JAMMY))
    .result.cookTime_s;
}

// --------------------------------------------------------------------------
// 1. the error model
// --------------------------------------------------------------------------

test('1a. the shortfall density is a density, its mean is the handling error, and its sd about a degree', () => {
  let mass = 0.0;
  let mean = 0.0;
  let second = 0.0;
  const step = 0.005;
  for (let d = -20; d <= 30; d += step) {
    const f = probeShortfallDensity(d) * step;
    mass += f;
    mean += f * d;
    second += f * d * d;
  }
  const sd = Math.sqrt(second - mean * mean);
  assert.ok(Math.abs(mass - 1) < 1e-4, `integrates to ${mass}`);
  assert.ok(Math.abs(mean - PROBE_HANDLING_MEAN_C) < 1e-3, `mean shortfall ${mean}`);
  const expected = Math.hypot(PROBE_INSTRUMENT_SD_C, PROBE_HANDLING_MEAN_C);
  assert.ok(Math.abs(sd - expected) < 1e-3, `sd ${sd} against ${expected}`);
});

test('1b. the skew is COLD: a reading under the peak costs less than one the same distance over', () => {
  // At the moment the centre peaks it is the warmest point in the egg, in space
  // and in time, so every handling error - a probe off-centre, a reading late,
  // a probe still climbing - reads low. None reads high.
  for (const d of [0.5, 1, 2, 3, 5]) {
    assert.ok(probeShortfallDensity(d) > probeShortfallDensity(-d), `at ${d} C`);
  }
  // What the argument rests on: the centre peaks after the pull, so at the
  // moment it is read, the temperature is at a maximum in time.
  const at = COOK.result;
  assert.ok(at.peakYolkTime_s > at.cookTime_s, 'the centre peaks after the pull');
});

test('1c. no reading can kill a particle, and none makes a NaN', () => {
  const grid = buildDoseGrid(
    EGG, appSetup(), {
      alphaMin: DEFAULT_PARAMS.alpha_m2s * 0.55,
      alphaMax: DEFAULT_PARAMS.alpha_m2s * 1.8,
      alphaCount: 7,
      timeMin_s: COOK_S * 0.35,
      timeMax_s: COOK_S * 2.4,
      timeCount: 9,
    },
  );
  const p = {
    alpha_m2s: DEFAULT_PARAMS.alpha_m2s, logDoseOffset: 0, noise: 0.2,
    whiteOffset: 0, whiteFirmGap: 1.08,
  };
  const floor = PROBE_UNRELATED / PROBE_UNRELATED_SPAN_C;
  for (const reading of [-40, 0, 2, 30, 60, 64, 70, 100, 150, 1000]) {
    const l = probeLikelihood(grid, p, COOK_S, reading);
    assert.ok(Number.isFinite(l) && l >= floor * 0.999999, `${reading} C: ${l}`);
  }
});

test('1d. the grid carries the peak, and interpolates it to within a tenth of a degree', () => {
  const spec = calibrationGrid(DEFAULT_PARAMS.alpha_m2s, COOK_S);
  const grid = buildDoseGrid(EGG, appSetup(), spec);
  assert.equal(grid.peakYolk_C.length, spec.alphaCount * spec.timeCount);
  for (const factor of [0.7, 0.9, 1.0, 1.13, 1.4]) {
    const alpha = DEFAULT_PARAMS.alpha_m2s * factor;
    const exact = simulate(EGG, appSetup(), { alpha_m2s: alpha }, COOK_S).peakYolk_C;
    const looked = lookupPeakYolk_C(grid, alpha, COOK_S);
    assert.ok(Math.abs(looked - exact) < 0.1, `x${factor}: ${looked.toFixed(3)} against ${exact.toFixed(3)}`);
  }
});

// --------------------------------------------------------------------------
// 2. One reading at +-1 C
// --------------------------------------------------------------------------

/** One probe-only egg folded from the prior on the app's own grid, and what the
 *  reading taught BEFORE the filter resampled - the weights - beside what the
 *  filter keeps after its resample. */
function oneReading(reading_C: number): {
  weighted: number; kept: number; meanFactor: number; next_s: number;
} {
  const start = freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED);
  const rec = recordWith(reading_C);
  const grid = buildRequestedGrid(gridRequestFor(start, rec, calibrationGrid));
  const post = start.posterior;
  const w = post.particles.map((p, i) => post.weights[i]
    * answerLikelihood(grid, p, COOK_S, null, null, reading_C));
  const total = w.reduce((a, b) => a + b, 0);
  let mean = 0.0;
  for (let i = 0; i < w.length; i++) mean += (w[i] / total) * post.particles[i].alpha_m2s;
  let v = 0.0;
  for (let i = 0; i < w.length; i++) v += (w[i] / total) * (post.particles[i].alpha_m2s - mean) ** 2;
  const after = replay(start, [rec]);
  return {
    weighted: Math.sqrt(v) / mean,
    kept: posteriorAlphaRelSd(after.posterior),
    meanFactor: posteriorParams(after.posterior).alpha_m2s / DEFAULT_PARAMS.alpha_m2s,
    next_s: nextCook(after),
  };
}

const READINGS = [-1, 0, 1].map((off) => ({ off: off, ...oneReading(truePeak(1.0) + off) }));

test('2a. one reading at +-1 C takes the time-scale sd from 11.9% to about 2.5%', (t) => {
  const prior = posteriorAlphaRelSd(createPrior(PARTICLE_COUNT, CALIBRATION_SEED));
  t.diagnostic(`prior ${(100 * prior).toFixed(2)}%`);
  for (const r of READINGS) {
    t.diagnostic(
      `reading ${r.off >= 0 ? '+' : ''}${r.off} C: sd ${(100 * r.weighted).toFixed(2)}% in the weights, `
      + `${(100 * r.kept).toFixed(2)}% after the resample; alpha x${r.meanFactor.toFixed(3)}`,
    );
    // What the reading teaches: the weights. The information bound for a
    // 1.0 C Gaussian at 0.40 C per 1% is 2.45%; the handling tail costs a
    // little of it.
    assert.ok(r.weighted < 0.030, `weights: ${(100 * r.weighted).toFixed(2)}%`);
    // What the filter keeps. Liu and West's kernel keeps the posterior's
    // spread through the resample: 2.60 / 2.61 / 2.81% on 28 September, within
    // resampling noise of the weights. A fixed 2% jitter on alpha would sit
    // above the weights' by about that in quadrature (3.28 / 3.33 / 3.52%).
    assert.ok(r.kept < 0.031, `kept: ${(100 * r.kept).toFixed(2)}%`);
    assert.ok(r.kept < prior / 3, 'at least a third of the prior');
  }
});

test('2b. a hot reading says the egg heats fast, so the next cook is shorter; a cold one, longer', (t) => {
  const byOff = new Map(READINGS.map((r) => [r.off, r]));
  const hot = byOff.get(1)!;
  const cold = byOff.get(-1)!;
  t.diagnostic(`this cook ${COOK_S.toFixed(1)} s; next after -1 C ${cold.next_s.toFixed(1)} s, after +1 C ${hot.next_s.toFixed(1)} s`);
  assert.ok(hot.meanFactor > 1.0, 'hot: alpha up');
  assert.ok(hot.next_s < COOK_S - 5, `hot: ${hot.next_s.toFixed(1)} s`);
  assert.ok(cold.meanFactor < 1.0, 'cold: alpha down');
  assert.ok(cold.next_s > COOK_S + 2, `cold: ${cold.next_s.toFixed(1)} s`);
  // And a kitchen whose eggs really do heat 10% faster is found by one reading.
  const fast = oneReading(truePeak(1.1));
  assert.ok(Math.abs(fast.meanFactor - 1.1) < 0.04, `found x${fast.meanFactor.toFixed(3)} of x1.100`);
});

// --------------------------------------------------------------------------
// 3. one fold per egg, and the record
// --------------------------------------------------------------------------

test('3a. the reading multiplies into the answers: one fold, whatever arrived first', () => {
  const grid = buildDoseGrid(
    EGG, appSetup(), {
      alphaMin: DEFAULT_PARAMS.alpha_m2s * 0.55,
      alphaMax: DEFAULT_PARAMS.alpha_m2s * 1.8,
      alphaCount: 7,
      timeMin_s: COOK_S * 0.35,
      timeMax_s: COOK_S * 2.4,
      timeCount: 9,
    },
  );
  const prior = createPrior(40, 7);
  for (const p of prior.particles) {
    const both = answerLikelihood(grid, p, COOK_S, 'jammy', 'firm', 64.0);
    const apart = answerLikelihood(grid, p, COOK_S, 'jammy', 'firm')
      * answerLikelihood(grid, p, COOK_S, null, null, 64.0);
    assert.ok(Math.abs(both - apart) <= 1e-15 * Math.abs(both));
  }
  // A null reading is no reading: bit-identical to a fold without one.
  const a = createPrior(200, 11);
  const b = createPrior(200, 11);
  updatePosterior(a, grid, COOK_S, 'fudgy', 'tender');
  updatePosterior(b, grid, COOK_S, 'fudgy', 'tender', null);
  assert.deepEqual(a, b);
});

test('3b. a probe-only record teaches, and its replay is the app\'s fold, bit for bit', () => {
  const rec = recordWith(truePeak(1.0) + 0.5);
  assert.ok(recordTeaches(rec));
  assert.ok(!recordTeaches(recordWith(null)));
  const start = freshCalibration(300, CALIBRATION_SEED);
  const coarse = (alpha: number, cook: number) => ({ ...calibrationGrid(alpha, cook), alphaCount: 7, timeCount: 9 });
  const byHand = copyCalibration(start);
  foldRecord(byHand, rec, buildRequestedGrid(gridRequestFor(byHand, rec, coarse)));
  const replayed = replay(start, [rec], coarse);
  assert.deepEqual(replayed, byHand);
  assert.equal(replayed.eggsLogged, 1);
  // And through JSON, as the log is stored.
  const back = parseRecord(JSON.parse(JSON.stringify(rec)));
  assert.deepEqual(back, rec);
  assert.deepEqual(replay(start, [back as EggRecord], coarse), byHand);
});

test('3c. the loader takes a reading the egg could have been, and refuses one it could not', () => {
  const ok = (probe: unknown, over: Partial<EggRecord> = {}): boolean =>
    parseRecord({ ...recordWith(null, over), probe: probe }) !== null;
  assert.ok(ok(null));
  assert.ok(ok({ centre_C: 64.2, after_s: 183 }));
  assert.ok(!ok({ centre_C: 64.2 }), 'when it was asked is always written, null or not');
  assert.ok(ok({ centre_C: 64.2, after_s: null }));
  assert.ok(ok({ centre_C: 2.0, after_s: null }), 'as cold as the ice');
  assert.ok(ok({ centre_C: 100, after_s: null }), 'as hot as the boil');
  assert.ok(!ok({ centre_C: 1.9, after_s: null }), 'colder than anything the egg touched');
  assert.ok(!ok({ centre_C: 100.1, after_s: null }), 'hotter than the water boiled');
  assert.ok(!ok({ centre_C: 94, after_s: null }, {
    setup: { ...recordWith(null).setup, boiling_C: 93.5 },
  }), 'hotter than the water boiled, up a mountain');
  assert.ok(!ok({ centre_C: 14, after_s: null }, { setup: { ...recordWith(null).setup, cooling: 'tap', eggStart_C: 20, ambient_C: 20 } }),
    'colder than the tap, the room and the egg');
  assert.ok(!ok(64.5), 'a bare number');
  assert.ok(!ok({ after_s: null }), 'no reading');
  assert.ok(!ok({ centre_C: '64', after_s: null }));
  assert.ok(!ok({ centre_C: Number.NaN, after_s: null }));
  assert.ok(!ok({ centre_C: 64, after_s: -1 }));
  assert.ok(!ok({ centre_C: 64, after_s: '183' }));
  // Typed in F, carried in C to a hundredth: 147.2 F is 64 C, not 63.99999999999999.
  assert.equal(recordProbe_C((147.2 - 32) * 5 / 9), 64);
  assert.equal(recordProbe_C((147.3 - 32) * 5 / 9), 64.06);
  // A record always says whether there was a reading.
  const raw = { ...recordWith(null) } as Record<string, unknown>;
  delete raw['probe'];
  assert.equal(parseRecord(raw), null);
});

// --------------------------------------------------------------------------
// 4. the moment, and the range the apps take at entry
// --------------------------------------------------------------------------

test('4a. the cooling countdown runs to the peak, for the cooling actually used', (t) => {
  const ice = coolingSecondsFor(COOK.result);
  const tapSol = solveCookTime(EGG, appSetup({ cooling: 'tap' }), DEFAULT_PARAMS, donenessFromSlider(JAMMY));
  const tap = coolingSecondsFor(tapSol.result);
  t.diagnostic(`68 g jammy: ice ${ice} s, tap ${tap} s, against the flat ${COOLING_SECONDS} s`);
  assert.equal(ice, Math.round(COOK.result.peakYolkTime_s - COOK.result.cookTime_s));
  assert.ok(ice > 150 && ice < 220, `ice ${ice}`);
  assert.ok(tap > ice, 'a tap cools slower, so the peak comes later');
  assert.ok(probeMomentFor(COOK.result, 'ice'));
  assert.ok(probeMomentFor(tapSol.result, 'tap'));
  assert.ok(!probeMomentFor(COOK.result, 'counter'), 'nothing is counted on the counter');
});

test('4b. no peak after the pull, no probe, and the flat three minutes', () => {
  const before: CookResult = { ...COOK.result, peakYolkTime_s: COOK.result.cookTime_s - 200 };
  assert.equal(coolingSecondsFor(before), COOLING_SECONDS);
  assert.ok(!probeMomentFor(before, 'ice'));
  const soon: CookResult = { ...COOK.result, peakYolkTime_s: COOK.result.cookTime_s + 20 };
  assert.equal(coolingSecondsFor(soon), COOLING_MIN_SECONDS);
  assert.ok(!probeMomentFor(soon, 'ice'));
});

test('4c. the entry range holds every reading a kitchen could make, and not a typo', (t) => {
  const [lo, hi] = plausibleProbeRange_C(EGG, appSetup(), DEFAULT_PARAMS, COOK_S);
  t.diagnostic(`68 g jammy in ice, peak ${truePeak(1.0).toFixed(1)} C: takes ${lo.toFixed(1)} to ${hi.toFixed(1)} C`);
  for (const factor of [0.72, 1.0, 1.4]) {
    const peak = truePeak(factor);
    assert.ok(peak > lo && peak < hi, `x${factor}: ${peak.toFixed(1)} in [${lo.toFixed(1)}, ${hi.toFixed(1)}]`);
  }
  // 64.7, with its digits swapped either way, or a finger slipped to the next row.
  for (const typo of [46.7, 94.7, 34.7]) assert.ok(typo < lo || typo > hi, `${typo} refused`);
  assert.ok(lo >= 2.0 && hi <= 100);
});

// --------------------------------------------------------------------------
// 5. the machine counts to the peak
// --------------------------------------------------------------------------

/** A cook as the app runs one (src/core/running.ts), on a 68 g egg. */
function runningCook(startMode: 'cold' | 'hot', cooling: 'ice' | 'tap'): RunningCook {
  return startCook(1_000_000, {
    mass_kg: 0.068, massFrom: 'class', sizeTable: 'eu', eggFrom: 'fridge', customStart_C: 12, room_C: null,
    startMode: startMode, afterBoil: 'hold', cooling: cooling, waterLitres: 2, eggCount: 2, altitude_m: 0,
    level: JAMMY,
  }, 0, { '2.0': 480 }, 'metric', 'en');
}

test('5a. the cooling counts to the peak of the time that ran, from the egg out, and the boil moves it', () => {
  const c = knowing({ particles: 50, eggsLogged: 0 });
  const hot = runningCook('hot', 'ice');
  const plan = replan(hot, c, null, 0, 1000);
  assert.equal(plan.cool_s, coolingSecondsFor(plan.solution.result));
  const pull = plan.deadlines.cookEnd_s;
  const out = withOut(hot, plan, pull + 5);
  assert.equal(replan(out, c, null, 0, pull + 5).deadlines.coolEnd_s, pull + 5 + plan.cool_s);
  // Timed out rather than tapped: the same length from the end of the grace.
  const late = pull + PULL_GRACE_SECONDS;
  const timedOut = { ...hot, events: eventsDue(hot, plan, late) };
  assert.equal(timedOut.events.pulled?.by, 'timeout');
  assert.equal(replan(timedOut, c, null, 0, late).deadlines.coolEnd_s, late + plan.cool_s);
  // A cold start's tap re-solves the cook, and the peak, and the cooling with it.
  const cold = runningCook('cold', 'tap');
  const tapped = replan(withBoil(cold, 1000 + 700), c, null, 0, 1700);
  assert.equal(tapped.cool_s, coolingSecondsFor(tapped.solution.result));
  assert.notEqual(tapped.cool_s, replan(cold, c, null, 0, 1000).cool_s);
});

test('5b. a cooling that has ended is kept as it ran', () => {
  const c = knowing({ particles: 50, eggsLogged: 0 });
  const hot = runningCook('hot', 'ice');
  const plan = replan(hot, c, null, 0, 1000);
  const pull = plan.deadlines.cookEnd_s;
  const out = withOut(hot, plan, pull + 5);
  const ended = { ...out, events: { ...out.events, cooledAt_s: pull + 5 + 150 } };
  assert.equal(replan(ended, c, null, 0, pull + 400).cool_s, 150);
});
