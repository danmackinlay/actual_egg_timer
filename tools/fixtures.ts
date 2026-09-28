/**
 * Golden fixtures: the TypeScript core's answers, written out so another
 * implementation can be held to them.
 *
 * This is the contract for the Swift port (`ios/`). The rule is that the
 * fixtures are generated ONLY from this implementation, and the port never
 * regenerates them to make itself pass - if a number here is wrong, it is wrong
 * in `src/core/` first, and `npm test` should be what catches it.
 *
 * Run: npm run fixtures
 *
 * One file per part of the core, each held by a Swift suite of the same name:
 *
 *   fixtures/core.json         pure functions: the sphere, geometry, boiling
 *   fixtures/scenarios.json    whole cooks, solved end to end
 *   fixtures/policy.json       the decisions above the physics - snapping, the
 *                              refusal verdict, texture bands, the calibration
 *                              grid's geometry, the bounds and defaults, both
 *                              size-class tables, the phase rule
 *   fixtures/sousvide.json     the isothermal limit: no pan, no ramp, no
 *                              cooling, and an answer in hours
 *   fixtures/sousvideCopy.json which words say the sous-vide answer
 *   fixtures/calibration.json  the particle filter, particle by particle
 *   fixtures/record.json       the record (INFERENCE.md section 4): which records
 *                              a loader trusts, and a replayed log
 *   fixtures/decide.json       decision surfaces and the time chosen on one
 *   fixtures/outcome.json      the predicted outcome at the chosen time
 *   fixtures/reach.json        the odds at every level, the verdict with them,
 *                              the answer at a level, the shading, the advice
 *   fixtures/wording.json      which key each part of the screen says
 *                              (tools/wordingFixture.ts)
 *   fixtures/copy.json         the catalogues rendered, and the plural rule of
 *                              every language at its edges
 *   fixtures/units.json        Metric and Imperial (tools/unitsFixture.ts)
 *   fixtures/format.json       numbers and times of day in every formatting
 *                              locale, and a pseudo-Czech catalogue in cs-CZ
 *   fixtures/probe.json        the probe reading (tools/probeFixture.ts)
 *   fixtures/language.json     the switch into the English of 1750 and out
 *                              (tools/languageFixture.ts)
 */

import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';

import {
  MODE_COUNT, ALPHA_DEFAULT, ALPHA_REL_SD, YOLK_RADIUS_FRAC, Z_YOLK, TREF_YOLK_C, Z_WHITE,
  TREF_WHITE_C, H_EFF, K_EGG, RAMP_R, TAU_STANDING_SCALE, TAU_STANDING_REF_S,
  STANDING_REF_LITRES, STANDING_VOLUME_EXPONENT, TAU_AIR, T_ICE_BATH_C, T_COLD_TAP_C, T_ROOM_C, TAU_PLUNGE, TAU_DIP_RECOVERY, C_WATER, C_EGG, RHO_EGG,
  EGG_VOLUME_COEFF, EGG_LENGTH_RATIO, DT_SIM, CARRYOVER_WINDOW,
} from '../src/core/constants.js';
import {
  eggFromMass, eggFromMinorDiameter,
  SIZE_CLASSES, US_SIZE_CLASSES, SizeClass, sizeTableFor,
} from '../src/core/geometry.js';
import { pressureAtAltitude, boilingPointAtPressure, boilingPointAtAltitude } from '../src/core/thermo.js';
import { createDose, accumulateDose, holdTimeForDose } from '../src/core/kinetics.js';
import { buildDoseGrid, lookupLogYolkDose, lookupLogWhiteDose, cookTimeForLogYolkDose } from '../src/core/doseGrid.js';
import {
  Feedback, FEEDBACK_BAND, KERNEL_DISCOUNT, NOISE_LOG_SD, NOISE_MEDIAN, UNRELATED, WHITE_FIRM_GAP_LOG_SD,
  WHITE_FIRM_GAP_MEDIAN, WHITE_OFFSET_SD, WhiteReport, answerLikelihood, createPrior,
  effectiveSampleSize, posteriorMeanWhiteOffset, posteriorParams, predictCookTime, updatePosterior,
} from '../src/core/infer.js';
import {
  createSphere, stepSphere, temperatureAt, centreTemperature, meanTemperature,
  seriesTheta, erfc,
} from '../src/core/sphere.js';
import { CookSetup } from '../src/core/protocol.js';
import {
  Catalogue, CopyArg, CopyArgs, PLURAL_CATEGORIES, formatArg, parseCatalogue, pluralCategory, render,
  renderRef,
} from '../src/core/copy.js';
import {
  Calibration, EggRecord, PRIOR_ID, RECORD_VERSION, buildRequestedGrid, calibrationDoneness, calibrationParams,
  copyCalibration, foldRecord, freshCalibration, gridRequestFor, parseRecord, recordCookTime_s,
  recordMass_g, recordProbe_C, recordTeaches, replay,
} from '../src/core/record.js';
import { longDuration, startPhrase, weekdayKey } from '../src/core/sousvide.js';
import {
  DECISION_ALPHA_COUNT, DECISION_ALPHA_HI, DECISION_ALPHA_LO, DECISION_TIME_STEP_S,
  DECISION_WINDOW_S, DecisionInputs, LEAN_COST_PER_S, RUNNY_WHITE_LOSS,
  carriedSolution, chooseCookTime,
  decideAt, decidedSolution, decisionApplies, decisionGridSpec, decisionInputs, expectedLoss, hitOdds, oddsInTenths,
} from '../src/core/decide.js';
import { LEAN_RATIO, LEVEL_HIGH_Q, LEVEL_LOW_Q, leanOf, predictOutcome } from '../src/core/outcome.js';
import {
  ADVICE_BELOW_TENTHS, ADVICE_GAIN, ADVICE_MARGIN_TENTHS, OddsProfile, PROFILE_STEP, REACH_ODDS, SHADE_BEST_MIN,
  adviceWanted, answerAt, oddsNear, oddsProfile, pricedChanges, protocolAdvice, shadingOf, unpricedAdvice,
  verdictWithOdds,
} from '../src/core/reach.js';
import {
  Fixed, HourCycle, countDecimals, formatCount, formatNumber, formatTimeOfDay, formattingLocale,
  normaliseTime, roundTo, unpadHour,
} from '../src/core/format.js';
import { QUANTITIES, UNIT_SYSTEMS, measureFor, quantityText } from '../src/core/units.js';
import { unitsFixture } from './unitsFixture.js';
import { probeFixture } from './probeFixture.js';
import { languageFixture } from './languageFixture.js';
import { wordingFixture } from './wordingFixture.js';
import {
  SOUS_VIDE_BATH_C, SOUS_VIDE_MODEL_FLOOR_C, equilibrationTime, sousVideEstimate,
} from '../src/core/sousvide.js';
import {
  simulate, solveCookTime, donenessFromSlider, DEFAULT_PARAMS, Solution,
} from '../src/core/solve.js';
import {
  LIMITS, SLIDER_STEPS, PARTICLE_COUNT as POLICY_PARTICLES, CALIBRATION_SEED,
  DEFAULTS, DEFAULT_EGG_MASS_KG, DEFAULT_TIME_TO_BOIL_S, START_TEMP_PRESETS_C,
  BoilMemory, CALIBRATION_ALPHA_HIGH, CALIBRATION_ALPHA_LOW, COOLING_SECONDS, GridSpec, PULL_GRACE_SECONDS,
  ROOM_EGG_FROM_C, SLOW_HOB_EVERY_S, SLOW_HOB_EXTRA_S, SLOW_HOB_WHEN_LEFT_S, WHITE_BAND_BELOW_C, YOLK_BAND_BELOW_C,
  ambientFor, anchorNear, coolingSecondsFor,
  calibrationGrid, carrySizeIndex, estimateTimeToBoil, phaseAt, rememberBoil, snapDown, snapUp,
  targetPeakYolk_C, textureFor, textureNoteKeys, verdictFor,
} from '../src/core/policy.js';

/* ------------------------------------------------------------------ cases */

/** Sample points chosen to sit where the model actually lives, plus the edges
 *  that break naive implementations: x = 0 (the sinc singularity), tiny Fo
 *  (slow convergence), large Fo (everything underflows). */
const THETA_CASES: Array<[number, number]> = [];
for (const x of [0.0, 0.1, 0.35, 0.693, 0.9, 1.0]) {
  for (const fo of [0.01, 0.0688, 0.07434, 0.15, 0.229, 0.5, 1.0]) {
    THETA_CASES.push([x, fo]);
  }
}

const ERFC_CASES = [-3.0, -1.0, -0.25, 0.0, 1e-9, 0.25, 0.5, 1.0, 2.0, 3.5, 6.0];
const MASS_CASES_G = [40, 48, 53, 58, 62.3, 68, 76, 90];
const ALTITUDE_CASES_M = [-400, 0, 500, 1000, 1609, 2000, 3000, 4000, 5000];
const PRESSURE_CASES_PA = [101325, 95000, 89870, 79500, 70110, 54020];

function round(value: number): number {
  // JSON.stringify already emits the shortest round-tripping form of a double,
  // so nothing is lost here. This only exists to keep the file readable.
  return value;
}

/* ------------------------------------------------------------- core.json */

const sphereStep = (() => {
  // A short, fully specified integration: the exact arithmetic the port has to
  // reproduce, including the mode coupling and the exponential decay.
  const s = createSphere(0.0238, ALPHA_DEFAULT, 4.0, 100.0);
  const samples: Array<Record<string, number>> = [];
  let t = 0;
  for (let i = 0; i < 40; i++) {
    stepSphere(s, 10.0, 100.0);
    t += 10;
    samples.push({
      t_s: t,
      centre_C: round(centreTemperature(s)),
      yolkBoundary_C: round(temperatureAt(s, YOLK_RADIUS_FRAC)),
      mean_C: round(meanTemperature(s)),
    });
  }
  return samples;
})();

const rampedStep = (() => {
  // The same integrator driven by a MOVING surface, which is the case the
  // Duhamel coupling exists for. A step-only test would not catch a sign error
  // in the drive term.
  const s = createSphere(0.0238, ALPHA_DEFAULT, 4.0, 20.0);
  const samples: Array<Record<string, number>> = [];
  for (let i = 1; i <= 30; i++) {
    const surface = 20.0 + i * 2.5;
    stepSphere(s, 15.0, surface);
    samples.push({
      t_s: i * 15,
      surface_C: surface,
      centre_C: round(centreTemperature(s)),
      mean_C: round(meanTemperature(s)),
    });
  }
  return samples;
})();

const core = {
  $comment: 'Generated by tools/fixtures.ts from src/core/. Do not hand-edit.',
  generator: 'npm run fixtures',
  constants: {
    MODE_COUNT, ALPHA_DEFAULT, ALPHA_REL_SD, YOLK_RADIUS_FRAC, Z_YOLK, TREF_YOLK_C, Z_WHITE,
    TREF_WHITE_C, H_EFF, K_EGG, RAMP_R, TAU_STANDING_SCALE, TAU_STANDING_REF_S,
    STANDING_REF_LITRES, STANDING_VOLUME_EXPONENT, TAU_AIR, T_ICE_BATH_C, T_COLD_TAP_C, T_ROOM_C, TAU_PLUNGE, TAU_DIP_RECOVERY,
    C_WATER, C_EGG, RHO_EGG, EGG_VOLUME_COEFF, EGG_LENGTH_RATIO, DT_SIM,
    CARRYOVER_WINDOW,
  },
  sphere: {
    seriesTheta: THETA_CASES.map(([x, fo]) => ({ x: x, fourier: fo, value: round(seriesTheta(x, fo)) })),
    erfc: ERFC_CASES.map((x) => ({ x: x, value: round(erfc(x)) })),
    stepResponse: sphereStep,
    rampResponse: rampedStep,
  },
  geometry: {
    fromMass: MASS_CASES_G.map((g) => {
      const egg = eggFromMass(g / 1000);
      return {
        mass_g: g,
        radius_m: round(egg.radius_m),
        minorDiameter_m: round(egg.minorDiameter_m),
        volume_m3: round(egg.volume_m3),
      };
    }),
  },
  thermo: {
    pressureAtAltitude: ALTITUDE_CASES_M.map((h) => ({ altitude_m: h, value: round(pressureAtAltitude(h)) })),
    boilingPointAtAltitude: ALTITUDE_CASES_M.map((h) => ({ altitude_m: h, value: round(boilingPointAtAltitude(h)) })),
    boilingPointAtPressure: PRESSURE_CASES_PA.map((p) => ({ pressure_Pa: p, value: round(boilingPointAtPressure(p)) })),
  },
  kinetics: {
    holdTimeForDose: [55, 60, 63, 65, 70, 80].map((held) => ({
      z_K: Z_YOLK, tref_C: TREF_YOLK_C, doseMinutes: 10.0, held_C: held,
      value: round(holdTimeForDose(createDose(Z_YOLK, TREF_YOLK_C), 10.0, held)),
    })),
    accumulateDose: (() => {
      // A ten-minute ramp from 50 to 80 C, integrated at the model's own step.
      const d = createDose(Z_YOLK, TREF_YOLK_C);
      const out: Array<Record<string, number>> = [];
      for (let i = 1; i <= 20; i++) {
        const temp = 50.0 + i * 1.5;
        accumulateDose(d, temp, 30.0);
        out.push({ step: i, temperature_C: temp, dt_s: 30.0, minutes: round(d.minutes) });
      }
      return out;
    })(),
  },
};

/* --------------------------------------------------------- scenarios.json */

/** The reference egg of the validation and the scenarios: 43.5 mm across,
 *  about 62.3 g - not the app's 68 g EU Large. Built from its mass: the iOS
 *  core, which only weighs eggs, builds it the same way (D4). */
const REFERENCE_EGG = eggFromMass(eggFromMinorDiameter(0.0435).mass_kg);

function setupOf(over: Partial<CookSetup>): CookSetup {
  const base: CookSetup = {
    startMode: 'hot',
    eggStart_C: 4,
    ambient_C: 20,
    boiling_C: 100,
    timeToBoil_s: 0,
    cooling: 'ice',
    waterLitres: 2,
    eggCount: 4,
  };
  return { ...base, ...over };
}

interface Scenario {
  name: string;
  setup: CookSetup;
  level: number;
}

const SCENARIOS: Scenario[] = [
  { name: 'jammy, fridge, sea level, ice', setup: setupOf({}), level: 0.41 },
  { name: 'jammy, room temp', setup: setupOf({ eggStart_C: 21, ambient_C: 21 }), level: 0.41 },
  { name: 'jammy, 2000 m', setup: setupOf({ boiling_C: boilingPointAtAltitude(2000) }), level: 0.41 },
  { name: 'runny', setup: setupOf({}), level: 0.0 },
  { name: 'hard', setup: setupOf({}), level: 1.0 },
  { name: 'cold start, 8 min ramp', setup: setupOf({ startMode: 'cold', timeToBoil_s: 480 }), level: 0.41 },
  { name: 'cold start, 12 min ramp', setup: setupOf({ startMode: 'cold', timeToBoil_s: 720 }), level: 0.41 },
  { name: 'counter rested', setup: setupOf({ cooling: 'counter' }), level: 0.41 },
  { name: 'cold tap', setup: setupOf({ cooling: 'tap' }), level: 0.41 },
  { name: 'eight eggs in 0.75 L', setup: setupOf({ eggCount: 8, waterLitres: 0.75 }), level: 0.41 },
  { name: 'standing, 8 min boil', setup: setupOf({ startMode: 'cold', afterBoil: 'off', timeToBoil_s: 480 }), level: 0.41 },
  { name: 'standing, 10 min boil, hard', setup: setupOf({ startMode: 'cold', afterBoil: 'off', timeToBoil_s: 600 }), level: 1.0 },
  { name: 'standing, 4 min boil: a fast hob is not a small pan', setup: setupOf({ startMode: 'cold', afterBoil: 'off', timeToBoil_s: 240 }), level: 0.41 },
  { name: 'standing, 1 L, hard (out of reach)', setup: setupOf({ startMode: 'cold', afterBoil: 'off', timeToBoil_s: 240, waterLitres: 1 }), level: 1.0 },
  { name: 'standing, 4 L, 16 min boil, hard', setup: setupOf({ startMode: 'cold', afterBoil: 'off', timeToBoil_s: 960, waterLitres: 4 }), level: 1.0 },
  { name: 'standing, hot start, 1 L (white never sets)', setup: setupOf({ afterBoil: 'off', timeToBoil_s: 480, waterLitres: 1 }), level: 0.41 },
  { name: 'standing, hot start, 6 L, two eggs', setup: setupOf({ afterBoil: 'off', timeToBoil_s: 480, waterLitres: 6, eggCount: 2 }), level: 0.41 },
];

const scenarios = {
  $comment: 'Generated by tools/fixtures.ts. Whole cooks, solved end to end.',
  generator: 'npm run fixtures',
  egg: {
    mass_kg: REFERENCE_EGG.mass_kg,
    radius_m: REFERENCE_EGG.radius_m,
  },
  params: DEFAULT_PARAMS,
  cases: SCENARIOS.map((s) => {
    const sol = solveCookTime(REFERENCE_EGG, s.setup, DEFAULT_PARAMS, donenessFromSlider(s.level));
    const fixed = simulate(REFERENCE_EGG, s.setup, DEFAULT_PARAMS, 7.4 * 60);
    return {
      name: s.name,
      level: s.level,
      setup: s.setup,
      solution: {
        reachable: sol.reachable,
        whiteSets: sol.whiteSets,
        softestLevel: round(sol.softestLevel),
        hardestLevel: round(sol.hardestLevel),
        minCookTime_s: round(sol.minCookTime_s),
        cookTime_s: round(sol.result.cookTime_s),
        peakYolk_C: round(sol.result.peakYolk_C),
        peakWhite_C: round(sol.result.peakWhite_C),
        yolkAtPull_C: round(sol.result.yolkAtPull_C),
        yolkDose_min: round(sol.result.yolkDose_min),
        whiteDose_min: round(sol.result.whiteDose_min),
      },
      atFixed444s: {
        peakYolk_C: round(fixed.peakYolk_C),
        yolkDose_min: round(fixed.yolkDose_min),
        whiteDose_min: round(fixed.whiteDose_min),
      },
    };
  }),
};

/* ------------------------------------------------------- calibration.json */

/* The calibration is the one part of the core with STATE and a random number
 * generator, so conformance needs more than a few scalars: a divergence in the
 * RNG produces a different but entirely plausible posterior, which no summary
 * statistic would flag. Every particle is therefore written out, before and
 * after every update.
 *
 * The grid here is deliberately smaller than the app's 21 x 32 - it costs one
 * simulation per cell in both implementations, and 9 x 12 exercises every path
 * through the interpolation while keeping `swift test` quick. */

const CALIB_EGG = eggFromMass(0.062);
const CALIB_SETUP: CookSetup = setupOf({});
const CALIB_ALPHA_MIN = 1.2e-7;
const CALIB_ALPHA_MAX = 2.4e-7;
const CALIB_ALPHA_COUNT = 9;
const CALIB_TIME_MIN_S = 240;
const CALIB_TIME_MAX_S = 900;
const CALIB_TIME_COUNT = 12;

const CALIB_GRID = buildDoseGrid(
  CALIB_EGG, CALIB_SETUP, 1.0,
  CALIB_ALPHA_MIN, CALIB_ALPHA_MAX, CALIB_ALPHA_COUNT,
  CALIB_TIME_MIN_S, CALIB_TIME_MAX_S, CALIB_TIME_COUNT,
);

/* Includes points outside the grid on both axes, because the clamp is where an
 * off-by-one in the interpolation would hide. */
const LOOKUP_CASES: { alpha_m2s: number; cookTime_s: number }[] = [
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

const PARTICLE_COUNT = 64;
const PRIOR_SEED = 20260917;
const NOMINAL_TARGET = Math.log10(6.0);

/* What the cook said about each egg: the yolk and the white, either of which
 * may be missing, folded jointly (E2). A sequence with a repeat, a reversal,
 * both answers, each alone, E1's two-level "set", and enough agreement to drive
 * the effective sample size below n/2 and trigger a resample - which is the only
 * part of the filter that consumes the RNG after the prior.
 *
 * The cook times straddle the white's threshold on this surface: around
 * 340-380 s the particles disagree about the white, and 440-500 s puts it past
 * setting, so every answer is scored where it is likely and where it is not. */
const FEEDBACK_SEQUENCE: (Feedback | null)[] = [-1, 0, -1, 1, 0, null, -1, 0, -1, 1, 1];
const WHITE_SEQUENCE: (WhiteReport | null)[] = [
  'runny', 'tender', 'runny', null, 'firm', 'runny', 'firm', 'tender', null, 'firm', 'runny',
];

function particleRows(post: ReturnType<typeof createPrior>) {
  return post.particles.map((p) => ({
    alpha_m2s: round(p.alpha_m2s),
    logDoseOffset: round(p.logDoseOffset),
    tauAirScale: round(p.tauAirScale),
    noise: round(p.noise),
    whiteOffset: round(p.whiteOffset),
    whiteFirmGap: round(p.whiteFirmGap),
  }));
}

function readout(post: ReturnType<typeof createPrior>) {
  const params = posteriorParams(post);
  const predicted = predictCookTime(post, CALIB_GRID, NOMINAL_TARGET);
  return {
    rng: post.rng,
    ess: round(effectiveSampleSize(post)),
    alpha_m2s: round(params.alpha_m2s),
    tauAirScale: round(params.tauAirScale),
    meanWhiteOffset: round(posteriorMeanWhiteOffset(post)),
    predict: {
      low_s: round(predicted.low_s),
      median_s: round(predicted.median_s),
      high_s: round(predicted.high_s),
    },
    weights: post.weights.map(round),
    particles: particleRows(post),
  };
}

const posterior = createPrior(PARTICLE_COUNT, PRIOR_SEED);
const prior = readout(posterior);

const COOK_TIMES_S = [360, 340, 380, 500, 355, 460, 345, 370, 440, 350, 365];
const updates = FEEDBACK_SEQUENCE.map((feedback, i) => {
  const cookTime_s = COOK_TIMES_S[i];
  const white = WHITE_SEQUENCE[i];
  // One particle's likelihood, the first, so a port that gets the probit wrong
  // is told where before it is told that the whole set moved.
  const firstLikelihood = round(answerLikelihood(
    CALIB_GRID, posterior.particles[0], cookTime_s, NOMINAL_TARGET, feedback, white,
  ));
  updatePosterior(posterior, CALIB_GRID, cookTime_s, NOMINAL_TARGET, feedback, white);
  return {
    cookTime_s: cookTime_s,
    logNominalTarget: round(NOMINAL_TARGET),
    feedback: feedback,
    white: white,
    firstLikelihood: firstLikelihood,
    after: readout(posterior),
  };
});

/* One more fold, from a deliberately degenerate particle set, so that the
 * resample after a WHITE-ONLY answer is executed from a known starting point,
 * rather than only wherever the sequence above happens to cross the threshold.
 *
 * The input posterior is therefore synthetic: the particles are the real ones
 * from the end of the sequence above, with their weights sharpened by a power
 * until the effective sample size sits just over the threshold. It is written out
 * in full, so the port reads the same starting point rather than reproducing the
 * sharpening - the same reason the policy verdicts are built from synthetic
 * Solutions. What is being pinned is the branch, not the road to it. */
const WHITE_RESAMPLE_CASE = (() => {
  const n = posterior.particles.length;
  const base = posterior.weights.slice();
  let exponent = 1.0;
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
    particles: particleRows(posterior),
    weights: weights.map(round),
    rng: posterior.rng,
    ess: round(effectiveSampleSize({ particles: posterior.particles, weights: weights, rng: posterior.rng })),
  };
  const post = {
    particles: posterior.particles.map((p) => ({ ...p })),
    weights: weights.slice(),
    rng: posterior.rng,
  };
  const cookTime_s = 365;
  const white: WhiteReport = 'runny';
  updatePosterior(post, CALIB_GRID, cookTime_s, NOMINAL_TARGET, null, white);
  return {
    cookTime_s: cookTime_s,
    white: white,
    before: before,
    after: readout(post),
  };
})();

const calibration = {
  $comment: 'Generated by tools/fixtures.ts from src/core/. Do not hand-edit.',
  generator: 'npm run fixtures',
  egg: {
    mass_kg: round(CALIB_EGG.mass_kg),
    radius_m: round(CALIB_EGG.radius_m),
    minorDiameter_m: round(CALIB_EGG.minorDiameter_m),
  },
  setup: CALIB_SETUP,
  grid: {
    tauAirScale: 1.0,
    alphaMin: CALIB_ALPHA_MIN,
    alphaMax: CALIB_ALPHA_MAX,
    alphaCount: CALIB_ALPHA_COUNT,
    timeMin_s: CALIB_TIME_MIN_S,
    timeMax_s: CALIB_TIME_MAX_S,
    timeCount: CALIB_TIME_COUNT,
    logAlphaMin: round(CALIB_GRID.logAlphaMin),
    logAlphaStep: round(CALIB_GRID.logAlphaStep),
    timeStep_s: round(CALIB_GRID.timeStep_s),
    logYolk: CALIB_GRID.logYolk.map(round),
    logWhite: CALIB_GRID.logWhite.map(round),
  },
  lookups: LOOKUP_CASES.map((c) => ({
    alpha_m2s: c.alpha_m2s,
    cookTime_s: c.cookTime_s,
    logYolk: round(lookupLogYolkDose(CALIB_GRID, c.alpha_m2s, c.cookTime_s)),
    logWhite: round(lookupLogWhiteDose(CALIB_GRID, c.alpha_m2s, c.cookTime_s)),
  })),
  inverse: INVERSE_CASES.map((c) => ({
    alpha_m2s: c.alpha_m2s,
    logDose: c.logDose,
    cookTime_s: round(cookTimeForLogYolkDose(CALIB_GRID, c.alpha_m2s, c.logDose)),
  })),
  likelihood: {
    feedbackBand: FEEDBACK_BAND,
    unrelated: UNRELATED,
    noiseMedian: NOISE_MEDIAN,
    noiseLogSd: NOISE_LOG_SD,
    whiteOffsetSd: WHITE_OFFSET_SD,
    whiteFirmGapMedian: WHITE_FIRM_GAP_MEDIAN,
    whiteFirmGapLogSd: WHITE_FIRM_GAP_LOG_SD,
    kernelDiscount: KERNEL_DISCOUNT,
  },
  whiteResample: WHITE_RESAMPLE_CASE,
  prior: {
    count: PARTICLE_COUNT,
    seed: PRIOR_SEED,
    ...prior,
  },
  updates: updates,
};

/* ------------------------------------------------------------ policy.json */

/* The layer the review found unguarded. None of it is expensive, so the cases
 * are dense rather than representative: an off-by-one in a port's loop or a
 * flipped comparison should have nowhere to hide.
 *
 * The verdict cases are built from SYNTHETIC Solutions rather than from solved
 * cooks. That is deliberate - the point is to pin the decision, not to re-test
 * the solver, and a synthetic solution can sit exactly on the boundaries that
 * a real one reaches only by accident. */

const SNAP_LEVELS: number[] = [];
for (let i = 0; i <= 40; i++) SNAP_LEVELS.push(i / 40);
for (const awkward of [0.41, 0.2199999, 0.615, 0.0001, 0.9999, 0.11, 1 / 3]) {
  SNAP_LEVELS.push(awkward);
}

/** A Solution with only the fields the verdict reads. */
function verdictCase(
  reachable: boolean, whiteSets: boolean, softestLevel: number, hardestLevel: number,
): Solution {
  return {
    result: {
      cookTime_s: 0, peakYolk_C: 0, peakYolkTime_s: 0, yolkAtPull_C: 0,
      yolkDose_min: 0, whiteDose_min: 0, peakWhite_C: 0,
    },
    reachable: reachable,
    minCookTime_s: 0,
    softestLevel: softestLevel,
    hardestLevel: hardestLevel,
    whiteSets: whiteSets,
  };
}

const VERDICT_CASES: { reachable: boolean; whiteSets: boolean; softest: number; hardest: number; level: number }[] = [];
for (const level of [0.0, 0.22, 0.41, 0.5, 0.62, 0.9, 1.0]) {
  VERDICT_CASES.push({ reachable: true, whiteSets: true, softest: 0, hardest: 1, level: level });
  VERDICT_CASES.push({ reachable: false, whiteSets: false, softest: 1, hardest: 0, level: level });
  for (const softest of [0.0, 0.415, 0.608, 0.73]) {
    VERDICT_CASES.push({ reachable: false, whiteSets: true, softest: softest, hardest: 1, level: level });
  }
  for (const hardest of [0.735, 0.42, 0.405]) {
    VERDICT_CASES.push({ reachable: false, whiteSets: true, softest: 0, hardest: hardest, level: level });
  }
}

/* Every boundary with the white setting, and a few without: a white the pan
 * never sets is runny whatever its peak, even one hot enough to read "firm". */
const TEXTURE_CASES: [number, number, boolean][] = [];
for (const yolk of [50, 57.9, 58, 62.9, 63, 67.9, 68, 72.9, 73, 85]) {
  for (const white of [60, 70.9, 71, 81.9, 82, 95]) TEXTURE_CASES.push([yolk, white, true]);
}
for (const [yolk, white] of [[50, 60], [57.9, 70.9], [65, 71], [73, 95]]) {
  TEXTURE_CASES.push([yolk, white, false]);
}

/* Two pans remembered in both orders, so a port that iterates an unordered map
 * is caught rather than merely lucky. */
const BOIL_MEMORY_FORWARD: BoilMemory = rememberBoil(rememberBoil({}, 1, 300), 3, 900);
const BOIL_MEMORY_BACKWARD: BoilMemory = rememberBoil(rememberBoil({}, 3, 900), 1, 300);
const BOIL_QUERY_LITRES = [0.5, 1, 1.5, 2, 2.5, 3, 4, 12];

/** A size class as the fixture states it: the key and the mass the model
 *  cooks. What its label shows, in either system, is in units.json. */
function sizeClassRow(c: SizeClass): { key: string; mass_kg: number } {
  return { key: c.key, mass_kg: c.mass_kg };
}

const policy = {
  slider: {
    steps: SLIDER_STEPS,
    cases: SNAP_LEVELS.map((level) => ({
      level: round(level),
      snapUp: round(snapUp(level)),
      snapDown: round(snapDown(level)),
      anchor: anchorNear(level).key,
      targetPeakYolk_C: round(targetPeakYolk_C(level)),
    })),
  },
  verdict: VERDICT_CASES.map((c) => {
    const v = verdictFor(verdictCase(c.reachable, c.whiteSets, c.softest, c.hardest), c.level);
    return {
      reachable: c.reachable,
      whiteSets: c.whiteSets,
      softestLevel: round(c.softest),
      hardestLevel: round(c.hardest),
      level: round(c.level),
      kind: v.kind,
      wanted: v.wanted.key,
      limit: v.limit.key,
      snapTo: v.snapTo === null ? null : round(v.snapTo),
      worthSaying: v.worthSaying,
    };
  }),
  // The texture bands' edges, the room egg's and the calibration grid's
  // alpha factors, by name; the cases below pin how each is used.
  edges: {
    whiteBandBelow_C: WHITE_BAND_BELOW_C,
    yolkBandBelow_C: YOLK_BAND_BELOW_C,
    roomEggFrom_C: ROOM_EGG_FROM_C,
    calibrationAlphaLow: CALIBRATION_ALPHA_LOW,
    calibrationAlphaHigh: CALIBRATION_ALPHA_HIGH,
  },
  texture: TEXTURE_CASES.map(([yolk, white, whiteSets]) => {
    const t = textureFor(yolk, white, whiteSets);
    const note = textureNoteKeys(t);
    return {
      peakYolk_C: yolk, peakWhite_C: white, whiteSets: whiteSets, white: t.white, yolk: t.yolk,
      noteKey: note.key, noteWhite: note.parts['white'] ?? null, noteYolk: note.parts['yolk'] ?? null,
    };
  }),
  calibrationGrid: [
    { alphaCentre: 1.4e-7, cookTime_s: 441 },
    { alphaCentre: 1.4e-7, cookTime_s: 60 },
    { alphaCentre: 1.4e-7, cookTime_s: 120 },
    { alphaCentre: 2.0e-7, cookTime_s: 800 },
  ].map((c) => {
    const g = calibrationGrid(c.alphaCentre, c.cookTime_s);
    return {
      alphaCentre: c.alphaCentre,
      cookTime_s: c.cookTime_s,
      alphaMin: round(g.alphaMin),
      alphaMax: round(g.alphaMax),
      alphaCount: g.alphaCount,
      timeMin_s: round(g.timeMin_s),
      timeMax_s: round(g.timeMax_s),
      timeCount: g.timeCount,
    };
  }),
  boilMemory: {
    blend: [
      { previous: null, measured: 480, result: round(estimateTimeToBoil(rememberBoil({}, 2, 480), 2)) },
      {
        previous: 480, measured: 600,
        result: round(estimateTimeToBoil(rememberBoil(rememberBoil({}, 2, 480), 2, 600), 2)),
      },
    ],
    refused: [3, 99999].map((seconds) => ({
      seconds: seconds,
      remembered: Object.keys(rememberBoil({}, 2, seconds)).length > 0,
    })),
    estimate: BOIL_QUERY_LITRES.map((litres) => ({
      litres: litres,
      forward: round(estimateTimeToBoil(BOIL_MEMORY_FORWARD, litres)),
      backward: round(estimateTimeToBoil(BOIL_MEMORY_BACKWARD, litres)),
    })),
    defaultSeconds: DEFAULT_TIME_TO_BOIL_S,
  },
  defaults: {
    ...DEFAULTS,
    eggMass_kg: DEFAULT_EGG_MASS_KG,
    fridge_C: START_TEMP_PRESETS_C.fridge,
    room_C: START_TEMP_PRESETS_C.room,
  },
  /* Both tables whole, which region gets which, and what a stored index
   * becomes under each. The regions include the near misses a port might
   * accept - lower case is the same region, `USA` is not a region code at all,
   * and null is a language tag that names no region. The carry cases straddle
   * every edge: below -1, the -0.5 tie that the two languages round in
   * opposite directions, halves, and past the end of both tables. */
  sizeClasses: {
    eu: SIZE_CLASSES.map(sizeClassRow),
    us: US_SIZE_CLASSES.map(sizeClassRow),
    regions: ['US', 'us', 'GB', 'CZ', 'CA', 'USA', '', null].map((region) => ({
      region: region,
      table: sizeTableFor(region),
    })),
    carry: [-3, -1, -0.5, -0.4, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 7].map((stored) => ({
      stored: stored,
      eu: carrySizeIndex(stored, SIZE_CLASSES),
      us: carrySizeIndex(stored, US_SIZE_CLASSES),
    })),
  },
  ambient: [0, 4, 14.9, 15, 20, 26].map((eggStart_C) => ({
    eggStart_C: eggStart_C,
    ambient_C: round(ambientFor(eggStart_C)),
  })),
  limits: LIMITS,
  calibration: { particles: POLICY_PARTICLES, seed: CALIBRATION_SEED },
  phase: {
    coolingSeconds: COOLING_SECONDS,
    pullGraceSeconds: PULL_GRACE_SECONDS,
    slowHob: { whenLeft_s: SLOW_HOB_WHEN_LEFT_S, extra_s: SLOW_HOB_EXTRA_S, every_s: SLOW_HOB_EVERY_S },
    /* Two timelines from the same cook, differing only in whether there is a
     * cooling step to time. The counter one is the bug: with no cooling
     * deadline, the iOS app used to fall from COOKING straight to DONE and
     * never show the pull at all. Sampled either side of every boundary. */
    timelines: [
      { name: 'ice bath', cookEnd_s: 600, coolEnd_s: 600 + PULL_GRACE_SECONDS + COOLING_SECONDS, outAt_s: null },
      { name: 'counter rest', cookEnd_s: 600, coolEnd_s: null, outAt_s: null },
      // The cook tapped the eggs out 5 s into the grace: the cooling is timed
      // from the tap.
      { name: 'ice bath, out at the tap', cookEnd_s: 600, coolEnd_s: 605 + COOLING_SECONDS, outAt_s: 605 },
      { name: 'counter rest, out at the tap', cookEnd_s: 600, coolEnd_s: null, outAt_s: 605 },
    ].map((t) => ({
      name: t.name,
      cookEnd_s: t.cookEnd_s,
      coolEnd_s: t.coolEnd_s,
      outAt_s: t.outAt_s,
      samples: [
        0, 1, 599, 599.999, 600, 600.001, 604.999, 605, 605.001, 619, 619.999, 620, 620.001,
        700, 784.999, 785, 799, 799.999, 800, 800.001, 10000,
      ].map((now_s) => ({
        now_s: now_s,
        provisional: phaseAt(
          { cookEnd_s: t.cookEnd_s, coolEnd_s: t.coolEnd_s, provisional: true, outAt_s: t.outAt_s }, now_s,
        ),
        phase: phaseAt(
          { cookEnd_s: t.cookEnd_s, coolEnd_s: t.coolEnd_s, provisional: false, outAt_s: t.outAt_s }, now_s,
        ),
      })),
    })),
  },
};

/* ---------------------------------------------------------- sousvide.json */

/* The isothermal limit. Cheap - no integration at all - so the cases are dense
 * enough that the three things a port could get wrong each have their own
 * witness:
 *
 *   the BISECTION on the Fourier number, which is the only iteration here;
 *   WHICH hold binds, which is what the app puts on screen; and
 *   the hold times themselves, which span eight orders of magnitude and are
 *   therefore where a z-value or a reference temperature swapped between the
 *   yolk and the white shows up as an obviously different answer rather than a
 *   subtly wrong one. */

const SOUS_VIDE_EGGS_G = [48.3, 62, 68, 90];
/* The calibration's own range on alpha, so a port is held across everything the
 * particle filter can hand this function rather than at the literature value. */
const SOUS_VIDE_ALPHAS = [1.2e-7, ALPHA_DEFAULT, 2.4e-7];
const SOUS_VIDE_LEVELS = [0.0, 0.22, 0.41, 0.62, 1.0];

interface SousVideCase {
  mass_g: number;
  alpha_m2s: number;
  bath_C: number;
  level: number;
  /** Why this case is here, carried into the fixture so a failure says what it
   *  was covering rather than only which numbers disagreed. */
  what: string;
}

const SOUS_VIDE_CASES: SousVideCase[] = [];

/* The shipped bath, across the slider. The white's hold does not move at all -
 * its target is fixed - so this sweep is the yolk's hold climbing past it, and
 * the hard end is the one case where the YOLK binds at 58 C. That flips
 * `whiteBound`, and with it the sentence the app prints. */
for (const level of SOUS_VIDE_LEVELS) {
  SOUS_VIDE_CASES.push({
    mass_g: 68, alpha_m2s: ALPHA_DEFAULT, bath_C: SOUS_VIDE_BATH_C, level: level,
    what: 'shipped bath, slider sweep',
  });
}

/* Either side of 60 C, which is the temperature this module's own caveat is
 * about: below it the white never sets and the conduction model is out of its
 * depth. 50 C is the absurd end - the white's target takes over a month - and
 * 85 C is the other, where both holds fall to seconds and the equilibration is
 * the whole answer. */
for (const bath_C of [50, 55, 57.9, SOUS_VIDE_BATH_C, 59.9, 60, 60.1, 63, 65, 70, 75, 85]) {
  SOUS_VIDE_CASES.push({
    mass_g: 68, alpha_m2s: ALPHA_DEFAULT, bath_C: bath_C, level: 0.41,
    what: 'bath sweep either side of 60 C',
  });
}

/* A hard yolk in a hot bath, where the yolk's hold is the binding one. Without
 * these every case in the file agrees that the white binds, and a port that
 * simply returned `true` would pass. */
for (const bath_C of [65, 70, 75, 80, 85]) {
  SOUS_VIDE_CASES.push({
    mass_g: 68, alpha_m2s: ALPHA_DEFAULT, bath_C: bath_C, level: 1.0,
    what: 'hard yolk, yolk-bound',
  });
}

/* Every egg and every alpha, at the bath the app actually offers. Only
 * `equilibrate_s` moves across these, which is the point: it is the one output
 * that depends on the egg at all. */
for (const mass_g of SOUS_VIDE_EGGS_G) {
  for (const alpha_m2s of SOUS_VIDE_ALPHAS) {
    SOUS_VIDE_CASES.push({
      mass_g: mass_g, alpha_m2s: alpha_m2s, bath_C: SOUS_VIDE_BATH_C, level: 0.41,
      what: 'egg and alpha sweep',
    });
  }
}

const sousvide = {
  bath_C: SOUS_VIDE_BATH_C,
  modelFloor_C: SOUS_VIDE_MODEL_FLOOR_C,
  /* The bisection's answer stripped of its scaling: at R = 1 m and
   * alpha = 1 m^2/s the return value IS the Fourier number it converged on.
   * Every other equilibration number in this file is that one times R^2/alpha,
   * so a port with a narrower bracket or a flipped comparison is caught here
   * rather than being absorbed into an egg-sized answer. */
  fourierNumber: round(equilibrationTime(1.0, 1.0)),
  cases: SOUS_VIDE_CASES.map((c) => {
    const egg = eggFromMass(c.mass_g / 1000);
    const doneness = donenessFromSlider(c.level);
    const est = sousVideEstimate(
      egg.radius_m, c.alpha_m2s, c.bath_C, doneness.yolkDose_min, doneness.whiteDose_min,
    );
    return {
      what: c.what,
      mass_g: c.mass_g,
      radius_m: round(egg.radius_m),
      alpha_m2s: c.alpha_m2s,
      level: round(c.level),
      yolkDose_min: round(doneness.yolkDose_min),
      whiteDose_min: round(doneness.whiteDose_min),
      bath_C: round(est.bath_C),
      equilibrate_s: round(est.equilibrate_s),
      yolkHold_s: round(est.yolkHold_s),
      whiteHold_s: round(est.whiteHold_s),
      total_s: round(est.total_s),
      whiteBound: est.whiteBound,
    };
  }),
};

/* ------------------------------------------------------------ record.json */

/* The record (INFERENCE.md section 4) and the replay built on it.
 *
 * Two things are pinned. First, which records a loader TRUSTS: a canonical
 * record, the variations version skew allows, and one breakage per rule, so a
 * port that forgets a check - or adds one - disagrees on a named case. Second,
 * the replay: a log of eight eggs from both apps - E1's, with their two-level
 * white, and E2's, answered either way or not at all - folded from a fresh prior
 * under E2's likelihood with every particle and weight written out after each
 * egg, and the tail of the same log folded again from the state after the second
 * egg, which is what a phone whose damaged log was dropped starts from.
 *
 * The grid is coarser than the app's: `calibrationGrid`'s BOUNDS, which are what
 * decide what the filter sees, at 7 x 9 instead of 21 x 32. The counts are
 * written out; a port rebuilds the same policy from them. The production grid's
 * geometry is pinned separately in policy.json. */

const REPLAY_GRID_ALPHA = 7;
const REPLAY_GRID_TIME = 9;
function replayGrid(alphaCentre: number, cookTime_s: number): GridSpec {
  const g = calibrationGrid(alphaCentre, cookTime_s);
  return { ...g, alphaCount: REPLAY_GRID_ALPHA, timeCount: REPLAY_GRID_TIME };
}

const REPLAY_PARTICLES = 64;
const REPLAY_SEED = 20260926;

interface EggSpec {
  app: 'web' | 'ios';
  mass_g: number;
  massFrom: EggRecord['egg']['massFrom'];
  sizeTable?: EggRecord['egg']['sizeTable'];
  boilFrom?: EggRecord['setup']['timeToBoilFrom'];
  eggFrom: EggRecord['setup']['eggFrom'];
  over: Partial<CookSetup>;
  level: number;
  pulledBy: EggRecord['pulledBy'];
  late_s: number;
  yolk: EggRecord['yolk'];
  white: EggRecord['white'];
  /** A probe reading (E4), as degrees off the peak the literature values
   *  predict for this cook, so the fixture reads where a real one would. */
  probeOff_C?: number;
}

/* Realistic cooks: each recommended time is what the solver says for that egg
 * and pan at the literature values, so the surfaces sit where real ones would. */
function recordOf(e: EggSpec): EggRecord {
  const egg = eggFromMass(e.mass_g / 1000);
  const setup = setupOf(e.over);
  const solved = solveCookTime(egg, setup, DEFAULT_PARAMS, donenessFromSlider(e.level)).result;
  const recommended = solved.cookTime_s;
  const probe = e.probeOff_C === undefined ? null : {
    centre_C: simulate(egg, setup, DEFAULT_PARAMS, recommended + e.late_s).peakYolk_C + e.probeOff_C,
    after_s: coolingSecondsFor(solved),
  };
  return {
    v: 1,
    uid: null,
    day: '2026-09-26',
    app: e.app,
    appVersion: '0.2.0',
    prior: PRIOR_ID,
    egg: {
      mass_g: recordMass_g(egg.mass_kg), massFrom: e.massFrom,
      sizeTable: e.massFrom === 'class' ? e.sizeTable ?? 'eu' : null,
    },
    setup: {
      startMode: setup.startMode,
      eggStart_C: setup.eggStart_C,
      eggFrom: e.eggFrom,
      ambient_C: setup.ambient_C,
      boiling_C: setup.boiling_C,
      timeToBoil_s: setup.timeToBoil_s,
      timeToBoilFrom: setup.startMode === 'cold' ? 'measured' : e.boilFrom ?? 'remembered',
      cooling: setup.cooling,
      afterBoil: setup.afterBoil ?? 'hold',
      waterLitres: setup.waterLitres,
      eggCount: setup.eggCount,
    },
    level: e.level,
    recommended_s: recommended,
    nudge_s: 0,
    pulled_s: recommended + e.late_s,
    pulledBy: e.pulledBy,
    cooled_s: setup.cooling === 'counter' ? 0 : probe !== null ? coolingSecondsFor(solved) : COOLING_SECONDS,
    yolk: e.yolk,
    white: e.white,
    probe: probe,
    lang: 'en',
    register: 'modern',
    units: 'metric',
  };
}

const REPLAY_LOG: EggRecord[] = [
  // Soft, too soft, and the white was runny: both channels, from the prior.
  recordOf({
    app: 'web', mass_g: 62, massFrom: 'class', eggFrom: 'fridge', over: {},
    level: 0.3, pulledBy: 'cook', late_s: 7.25, yolk: -1, white: 'runny',
  }),
  // A cold start with a measured ramp; the white skipped.
  recordOf({
    app: 'ios', mass_g: 68.5, massFrom: 'scale', eggFrom: 'fridge',
    over: { startMode: 'cold', timeToBoil_s: 512.4 },
    level: 0.45, pulledBy: 'timeout', late_s: 0, yolk: 0, white: null,
  }),
  // Nobody answered. Still a record; it folds nothing and builds no surface.
  // Nor had anybody ever timed the pan.
  recordOf({
    app: 'web', mass_g: 58, massFrom: 'class', eggFrom: 'room', over: { eggStart_C: 20 },
    boilFrom: 'default',
    level: 0.5, pulledBy: 'timeout', late_s: 0, yolk: null, white: null,
  }),
  // Asked about the white, and skipped it.
  recordOf({
    app: 'web', mass_g: 55.3, massFrom: 'girth', eggFrom: 'custom',
    over: { eggStart_C: 8, cooling: 'tap' },
    level: 0.4, pulledBy: 'cook', late_s: 31.5, yolk: 1, white: null,
  }),
  // Rested on the counter, the only cook that reaches tauAirScale.
  recordOf({
    app: 'ios', mass_g: 67.3, massFrom: 'class', sizeTable: 'us', eggFrom: 'room',
    over: { eggStart_C: 20, cooling: 'counter' },
    level: 0.62, pulledBy: 'timeout', late_s: 0, yolk: 0, white: null,
  }),
  // The standing method, from a cold start, and a tender white.
  recordOf({
    app: 'web', mass_g: 60.2, massFrom: 'width', eggFrom: 'fridge',
    over: { startMode: 'cold', timeToBoil_s: 430, afterBoil: 'off', waterLitres: 1.5, eggCount: 2 },
    level: 0.5, pulledBy: 'cook', late_s: 2, yolk: -1, white: 'tender',
  }),
  // E2's: the white alone, tender, pulled late by the cook's own tap - scored
  // at the tap, 40 s after the alarm.
  recordOf({
    app: 'ios', mass_g: 68, massFrom: 'class', eggFrom: 'fridge', over: {},
    level: 0.22, pulledBy: 'cook', late_s: 40, yolk: null, white: 'tender',
  }),
  // Both, and a firm white at fudgy.
  recordOf({
    app: 'web', mass_g: 63, massFrom: 'scale', eggFrom: 'fridge', over: {},
    level: 0.62, pulledBy: 'cook', late_s: 5, yolk: 1, white: 'firm',
  }),
  // E4's: a probe reading a degree hot, with the yolk "just right".
  recordOf({
    app: 'ios', mass_g: 68, massFrom: 'scale', eggFrom: 'fridge', over: {},
    level: 0.41, pulledBy: 'cook', late_s: 3, yolk: 0, white: null, probeOff_C: 1.0,
  }),
  // And a reading alone, under a tap, cold - nothing else answered.
  recordOf({
    app: 'web', mass_g: 58, massFrom: 'class', eggFrom: 'fridge', over: { cooling: 'tap' },
    level: 0.3, pulledBy: 'timeout', late_s: 0, yolk: null, white: null, probeOff_C: -1.5,
  }),
];

function calibrationRows(c: Calibration) {
  return {
    eggsLogged: c.eggsLogged,
    rng: c.posterior.rng,
    weights: c.posterior.weights.map(round),
    particles: particleRows(c.posterior),
  };
}

/* Egg by egg, the way an app folds them: a surface, then both answers. After
 * each, the white target the next soft cook would be solved for (E3). */
const replayStart = freshCalibration(REPLAY_PARTICLES, REPLAY_SEED);
const replayState = copyCalibration(replayStart);
const replaySnapshots: Calibration[] = [];
const replaySteps = REPLAY_LOG.map((r) => {
  let spec: GridSpec | null = null;
  if (recordTeaches(r)) {
    const q = gridRequestFor(replayState, r, replayGrid);
    spec = q.spec;
    foldRecord(replayState, r, buildRequestedGrid(q));
  }
  replaySnapshots.push(copyCalibration(replayState));
  return {
    spec: spec,
    cookTime_s: recordCookTime_s(r),
    whiteDoseAtSoft: round(calibrationDoneness(replayState, 0.22).whiteDose_min),
    after: calibrationRows(replayState),
  };
});
const REPLAY_BASE_AFTER = 2;
const replayBase = replaySnapshots[REPLAY_BASE_AFTER - 1];
const replayed = replay(replayStart, REPLAY_LOG, replayGrid);
const fromBase = replay(replayBase, REPLAY_LOG.slice(REPLAY_BASE_AFTER), replayGrid);
// The fixture is only worth writing if the loop above IS the replay.
for (let i = 0; i < replayState.posterior.weights.length; i++) {
  const a = replayState.posterior.particles[i];
  for (const other of [replayed, fromBase]) {
    const b = other.posterior.particles[i];
    if (other.posterior.weights[i] !== replayState.posterior.weights[i]
      || b.alpha_m2s !== a.alpha_m2s || b.logDoseOffset !== a.logDoseOffset
      || b.tauAirScale !== a.tauAirScale || b.noise !== a.noise
      || b.whiteOffset !== a.whiteOffset || b.whiteFirmGap !== a.whiteFirmGap
      || other.posterior.rng !== replayState.posterior.rng) {
      throw new Error('replay disagrees with the egg-by-egg fold');
    }
  }
}

/* One breakage per rule, each a mutation of the first record. */
const CANONICAL = REPLAY_LOG[0];
type Mutation = (r: Record<string, unknown>) => void;
function mutated(fn: Mutation): Record<string, unknown> {
  const r = JSON.parse(JSON.stringify(CANONICAL)) as Record<string, unknown>;
  fn(r);
  return r;
}
const eggPart = (r: Record<string, unknown>) => r['egg'] as Record<string, unknown>;
const setupPart = (r: Record<string, unknown>) => r['setup'] as Record<string, unknown>;

const RECORD_CASES: { why: string; mutate: Mutation }[] = [
  { why: 'canonical', mutate: () => {} },
  { why: 'an older app version, same schema', mutate: (r) => { r['appVersion'] = '0.1.0'; } },
  { why: 'from iOS, read in imperial', mutate: (r) => { r['app'] = 'ios'; r['units'] = 'imperial'; } },
  {
    why: 'fields from a later v1 are ignored',
    mutate: (r) => { r['futureField'] = 3; eggPart(r)['shell'] = 'brown'; },
  },
  {
    why: 'nullable fields may be absent',
    mutate: (r) => { delete r['uid']; delete r['probe']; delete r['yolk']; delete r['white']; },
  },
  { why: 'a uid, once E6 mints one', mutate: (r) => { r['uid'] = '6f1c2a9e-2b1d-4c1e-9d6b-1a2b3c4d5e6f'; } },
  { why: 'an unanswered egg', mutate: (r) => { r['yolk'] = null; r['white'] = null; } },
  { why: 'the white offered and skipped', mutate: (r) => { r['white'] = null; } },
  { why: 'a tender white (E2)', mutate: (r) => { r['white'] = 'tender'; } },
  { why: 'a firm white (E2)', mutate: (r) => { r['white'] = 'firm'; } },
  {
    why: 'a weighed egg names no carton',
    mutate: (r) => { eggPart(r)['massFrom'] = 'scale'; eggPart(r)['sizeTable'] = null; },
  },
  { why: 'an American Large', mutate: (r) => { eggPart(r)['mass_g'] = 60.2; eggPart(r)['sizeTable'] = 'us'; } },
  { why: 'a nudge that leaves a cook', mutate: (r) => { r['nudge_s'] = -10; } },
  { why: 'another schema version', mutate: (r) => { r['v'] = 2; } },
  { why: 'no schema version', mutate: (r) => { delete r['v']; } },
  { why: 'an empty uid', mutate: (r) => { r['uid'] = ''; } },
  { why: 'a day that is not YYYY-MM-DD', mutate: (r) => { r['day'] = '2026-9-26'; } },
  { why: 'a timestamp, not a day', mutate: (r) => { r['day'] = '2026-09-26T07:30'; } },
  { why: 'a pan nobody timed', mutate: (r) => { setupPart(r)['timeToBoilFrom'] = 'default'; } },
  { why: 'an unknown boil source', mutate: (r) => { setupPart(r)['timeToBoilFrom'] = 'guessed'; } },
  { why: 'no boil source', mutate: (r) => { delete setupPart(r)['timeToBoilFrom']; } },
  { why: 'an unknown app', mutate: (r) => { r['app'] = 'android'; } },
  { why: 'an empty app version', mutate: (r) => { r['appVersion'] = ''; } },
  { why: 'no prior', mutate: (r) => { delete r['prior']; } },
  { why: 'a massless egg', mutate: (r) => { eggPart(r)['mass_g'] = 0; } },
  { why: 'a mass as a string', mutate: (r) => { eggPart(r)['mass_g'] = '62'; } },
  { why: 'a mass as null', mutate: (r) => { eggPart(r)['mass_g'] = null; } },
  { why: 'an unknown mass source', mutate: (r) => { eggPart(r)['massFrom'] = 'guess'; } },
  { why: 'a class with no carton', mutate: (r) => { delete eggPart(r)['sizeTable']; } },
  { why: 'a carton nobody has', mutate: (r) => { eggPart(r)['sizeTable'] = 'uk'; } },
  {
    why: 'a carton on a weighed egg',
    mutate: (r) => { eggPart(r)['massFrom'] = 'scale'; eggPart(r)['sizeTable'] = 'eu'; },
  },
  { why: 'no setup', mutate: (r) => { delete r['setup']; } },
  { why: 'an unknown start', mutate: (r) => { setupPart(r)['startMode'] = 'warm'; } },
  { why: 'an unknown egg source', mutate: (r) => { setupPart(r)['eggFrom'] = 'freezer'; } },
  { why: 'no ambient', mutate: (r) => { delete setupPart(r)['ambient_C']; } },
  { why: 'a boiling point of zero', mutate: (r) => { setupPart(r)['boiling_C'] = 0; } },
  { why: 'a negative time to boil', mutate: (r) => { setupPart(r)['timeToBoil_s'] = -1; } },
  { why: 'no water', mutate: (r) => { setupPart(r)['waterLitres'] = 0; } },
  { why: 'no eggs in the pan', mutate: (r) => { setupPart(r)['eggCount'] = 0; } },
  { why: 'an unknown cooling', mutate: (r) => { setupPart(r)['cooling'] = 'snow'; } },
  { why: 'an unknown burner', mutate: (r) => { setupPart(r)['afterBoil'] = 'simmer'; } },
  { why: 'a level past hard', mutate: (r) => { r['level'] = 1.5; } },
  { why: 'a level as a boolean', mutate: (r) => { r['level'] = true; } },
  { why: 'no recommendation', mutate: (r) => { r['recommended_s'] = 0; } },
  {
    why: 'a nudge that cancels the cook',
    mutate: (r) => { r['nudge_s'] = -(r['recommended_s'] as number); },
  },
  { why: 'a pull at zero', mutate: (r) => { r['pulled_s'] = 0; } },
  { why: 'an unknown puller', mutate: (r) => { r['pulledBy'] = 'alarm'; } },
  { why: 'negative cooling', mutate: (r) => { r['cooled_s'] = -1; } },
  { why: 'a yolk answer out of range', mutate: (r) => { r['yolk'] = 2; } },
  { why: 'a yolk answer as a word', mutate: (r) => { r['yolk'] = 'soft'; } },
  { why: 'a white answer nobody offers', mutate: (r) => { r['white'] = 'rubbery'; } },
  { why: 'the two-level white E1 logged, gone with D1', mutate: (r) => { r['white'] = 'set'; } },
  { why: 'a probe reading (E4)', mutate: (r) => { r['probe'] = { centre_C: 61.3, after_s: 187 }; } },
  { why: 'a probe reading, when unknown', mutate: (r) => { r['probe'] = { centre_C: 61.3, after_s: null }; } },
  { why: 'a probe reading, when absent', mutate: (r) => { r['probe'] = { centre_C: 61.3 }; } },
  { why: 'a probe reading as cold as the ice', mutate: (r) => { r['probe'] = { centre_C: 2 }; } },
  { why: 'a probe reading at the boil', mutate: (r) => { r['probe'] = { centre_C: 100 }; } },
  { why: 'a probe reading colder than the ice', mutate: (r) => { r['probe'] = { centre_C: 1.9 }; } },
  { why: 'a probe reading past the boil', mutate: (r) => { r['probe'] = { centre_C: 100.01 }; } },
  { why: 'a bare number for a probe', mutate: (r) => { r['probe'] = 64.5; } },
  { why: 'a probe with no reading', mutate: (r) => { r['probe'] = {}; } },
  { why: 'a probe reading as a string', mutate: (r) => { r['probe'] = { centre_C: '61.3' }; } },
  { why: 'a probe asked for before the pull', mutate: (r) => { r['probe'] = { centre_C: 61.3, after_s: -1 }; } },
  { why: 'no language', mutate: (r) => { r['lang'] = ''; } },
  { why: 'an unknown unit system', mutate: (r) => { r['units'] = 'kelvin'; } },
];

const recordCases = RECORD_CASES.map((c) => {
  const record = mutated(c.mutate);
  const parsed = parseRecord(record);
  return {
    why: c.why,
    record: record,
    valid: parsed !== null,
    yolk: parsed === null ? null : parsed.yolk,
    white: parsed === null ? null : parsed.white,
    probe: parsed === null ? null : parsed.probe,
  };
});
// A log is all or nothing: one bad record refuses the lot.
recordCases.push({
  why: 'not an object',
  record: [CANONICAL] as unknown as Record<string, unknown>,
  valid: parseRecord([CANONICAL]) !== null,
  yolk: null,
  white: null,
  probe: null,
});

const recordFixture = {
  $comment: 'Generated by tools/fixtures.ts from src/core/. Do not hand-edit.',
  generator: 'npm run fixtures',
  version: RECORD_VERSION,
  prior: PRIOR_ID,
  cases: recordCases,
  massRounding: [0.048, 0.058, 0.068, 0.076, 0.0553017, 0.06849999, 0.0624449999].map((kg) => ({
    mass_kg: kg, mass_g: recordMass_g(kg),
  })),
  // A probe reading, typed in F and carried in C (E4).
  probeRounding: [147.2, 147.3, 150.1, 139.9, 180.5, 212].map((f) => (f - 32) * 5 / 9)
    .concat([64.005, 58.8849999, 61.3]).map((c) => ({ centre_C: c, record_C: recordProbe_C(c) })),
  replay: {
    grid: { alphaCount: REPLAY_GRID_ALPHA, timeCount: REPLAY_GRID_TIME },
    start: { count: REPLAY_PARTICLES, seed: REPLAY_SEED },
    log: REPLAY_LOG,
    steps: replaySteps,
    // The tail of the log folded again from the state after egg 2, standing in
    // for a migrated phone's frozen base.
    fromBase: {
      after: REPLAY_BASE_AFTER,
      base: calibrationRows(replayBase),
      final: calibrationRows(fromBase),
    },
  },
};

writeFileSync('fixtures/record.json', `${JSON.stringify(recordFixture, null, 2)}\n`);

/* ------------------------------------------------------------- decide.json */

/* E5: the time is CHOSEN from the whole posterior, and the two apps must choose
 * the same time for the same posterior and pot. Three things are pinned: where
 * each pot's decision surface goes (`decisionGridSpec`, which runs a solve), a
 * surface itself, and the choice made on it from three posteriors - the prior,
 * one that has learned from some eggs, and one that knows its cook likes a
 * firmer yolk. Every particle is written out, as calibration.json does.
 *
 * The surface is coarser than the app's (7 rows, 20 s columns, where the app
 * has 13 and 10 s) so that `swift test` rebuilds it in a moment; the spec is
 * the production one, and the surface is only the arithmetic's input. */

const DECIDE_EGG = eggFromMass(0.068);
const DECIDE_SETUP: CookSetup = setupOf({ timeToBoil_s: 480, eggCount: 2 });

function decisionInputsRow(i: DecisionInputs) {
  return {
    egg: { mass_kg: i.egg.mass_kg },
    setup: i.setup,
    params: { alpha_m2s: i.params.alpha_m2s, tauAirScale: i.params.tauAirScale },
    whiteDose_min: i.whiteDose_min,
  };
}

const DECIDE_SPEC_INPUTS: DecisionInputs[] = [
  { egg: DECIDE_EGG, setup: DECIDE_SETUP, params: DEFAULT_PARAMS, whiteDose_min: 0.05 },
  { egg: eggFromMass(0.05), setup: DECIDE_SETUP, params: { alpha_m2s: 1.62e-7, tauAirScale: 1.08 }, whiteDose_min: 0.11 },
  { egg: DECIDE_EGG, setup: setupOf({ startMode: 'cold', timeToBoil_s: 540 }), params: DEFAULT_PARAMS, whiteDose_min: 0.05 },
  { egg: DECIDE_EGG, setup: setupOf({ cooling: 'counter' }), params: DEFAULT_PARAMS, whiteDose_min: 0.05 },
  { egg: DECIDE_EGG, setup: setupOf({ afterBoil: 'off', waterLitres: 4 }), params: DEFAULT_PARAMS, whiteDose_min: 0.05 },
];

const decideSpecs = DECIDE_SPEC_INPUTS.map((inputs) => ({
  inputs: decisionInputsRow(inputs),
  spec: decisionGridSpec(inputs),
}));

const DECIDE_GRID_SPEC: GridSpec = (() => {
  const full = decisionGridSpec(DECIDE_SPEC_INPUTS[0]);
  const count = Math.ceil((full.timeMax_s - full.timeMin_s) / 20) + 1;
  return { ...full, alphaCount: 7, timeMax_s: full.timeMin_s + 20 * (count - 1), timeCount: count };
})();
const DECIDE_GRID = buildDoseGrid(
  DECIDE_EGG, DECIDE_SETUP, 1.0,
  DECIDE_GRID_SPEC.alphaMin, DECIDE_GRID_SPEC.alphaMax, DECIDE_GRID_SPEC.alphaCount,
  DECIDE_GRID_SPEC.timeMin_s, DECIDE_GRID_SPEC.timeMax_s, DECIDE_GRID_SPEC.timeCount,
);

const DECIDE_PARTICLES = 200;
const DECIDE_SEED = 20260928;

function levelTarget(level: number): number {
  return Math.log10(donenessFromSlider(level).yolkDose_min);
}

const decidePosteriors: { name: string; eggsLogged: number; post: ReturnType<typeof createPrior> }[] = (() => {
  const prior = createPrior(DECIDE_PARTICLES, DECIDE_SEED);
  const learned = createPrior(DECIDE_PARTICLES, DECIDE_SEED);
  // Three eggs: jammy just right with a firm white, soft with a runny white,
  // and jammy again, the yolk alone.
  updatePosterior(learned, DECIDE_GRID, 464, levelTarget(0.41), 0, 'firm');
  updatePosterior(learned, DECIDE_GRID, 419, levelTarget(0.22), null, 'runny');
  updatePosterior(learned, DECIDE_GRID, 470, levelTarget(0.41), 0, null);
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

const DECIDE_CASES: { posterior: string; level: number; meanCookTime_s: number; applies: boolean }[] = [];
for (const pz of decidePosteriors) {
  for (const level of [0.22, 0.41, 0.62, 1.0]) {
    const params = pz.eggsLogged === 0 ? DEFAULT_PARAMS : posteriorParams(pz.post);
    const white = pz.eggsLogged === 0 ? 0.05 : 0.05 * 10 ** posteriorMeanWhiteOffset(pz.post);
    const sol = solveCookTime(DECIDE_EGG, DECIDE_SETUP, params, { ...donenessFromSlider(level), whiteDose_min: white });
    DECIDE_CASES.push({ posterior: pz.name, level: level, meanCookTime_s: sol.result.cookTime_s, applies: decisionApplies(sol) });
  }
}
// A solve with nothing to choose, and one whose window runs off the surface.
DECIDE_CASES.push({ posterior: 'learned', level: 0.0, meanCookTime_s: 372, applies: false });
DECIDE_CASES.push({ posterior: 'learned', level: 1.0, meanCookTime_s: DECIDE_GRID_SPEC.timeMax_s - 30, applies: true });

/* The solution at the chosen time (`decidedSolution`), and a cook re-solved
 * mid-cook with the lean it chose at "Eggs in" carried (`carriedSolution`).
 * The mean solve is the app's: the posterior's parameters and doneness. */
function decideSolutionRow(sol: Solution) {
  return {
    reachable: sol.reachable, cookTime_s: sol.result.cookTime_s, peakYolk_C: sol.result.peakYolk_C,
    yolkDose_min: sol.result.yolkDose_min, whiteDose_min: sol.result.whiteDose_min,
  };
}
function decideMeanSolve(posterior: string, level: number, setup: CookSetup = DECIDE_SETUP): Solution {
  const pz = decidePosteriors.find((x) => x.name === posterior);
  if (pz === undefined) throw new Error(posterior);
  const c: Calibration = { posterior: pz.post, eggsLogged: pz.eggsLogged };
  return solveCookTime(DECIDE_EGG, setup, calibrationParams(c), calibrationDoneness(c, level));
}
// The second pot rests on the counter, where the softest yolk leaves the white
// unset: no cook to choose for, so the lean is not carried.
const DECIDE_CARRIED = [
  { level: 0.41, setup: DECIDE_SETUP },
  { level: 0, setup: setupOf({ timeToBoil_s: 480, eggCount: 2, cooling: 'counter' }) },
].flatMap((pot) => [0, -12, 18].map((lean_s) => {
  const pz = decidePosteriors[1];
  const params = calibrationParams({ posterior: pz.post, eggsLogged: pz.eggsLogged });
  const sol = decideMeanSolve(pz.name, pot.level, pot.setup);
  return {
    posterior: pz.name, level: pot.level, setup: pot.setup, lean_s: lean_s,
    carried: decideSolutionRow(carriedSolution(DECIDE_EGG, pot.setup, params, sol, lean_s)),
  };
}));

const decideFixture = {
  about: 'E5: decision surfaces, and the time chosen on one from three posteriors. src/core/decide.ts.',
  constants: {
    runnyWhiteLoss: RUNNY_WHITE_LOSS,
    leanCostPerS: LEAN_COST_PER_S,
    decisionAlphaLo: DECISION_ALPHA_LO,
    decisionAlphaHi: DECISION_ALPHA_HI,
    decisionAlphaCount: DECISION_ALPHA_COUNT,
    decisionTimeStep_s: DECISION_TIME_STEP_S,
    decisionWindow_s: DECISION_WINDOW_S,
  },
  specs: decideSpecs,
  grid: {
    egg: { mass_kg: DECIDE_EGG.mass_kg },
    setup: DECIDE_SETUP,
    tauAirScale: 1.0,
    ...DECIDE_GRID_SPEC,
    logYolk: DECIDE_GRID.logYolk,
    logWhite: DECIDE_GRID.logWhite,
  },
  posteriors: decidePosteriors.map((pz) => ({
    name: pz.name,
    eggsLogged: pz.eggsLogged,
    weights: pz.post.weights,
    particles: particleRows(pz.post),
  })),
  cases: DECIDE_CASES.map((c) => {
    const pz = decidePosteriors.find((x) => x.name === c.posterior);
    if (pz === undefined) throw new Error(c.posterior);
    const logTarget = levelTarget(c.level);
    const d = decideAt(pz.post, pz.eggsLogged, DECIDE_GRID, c.meanCookTime_s, c.applies, logTarget);
    const probes = [c.meanCookTime_s - 40, c.meanCookTime_s, c.meanCookTime_s + 25];
    return {
      posterior: c.posterior,
      eggsLogged: pz.eggsLogged,
      logNominalTarget: logTarget,
      meanCookTime_s: c.meanCookTime_s,
      applies: c.applies,
      loss: probes.map((t) => ({ t: t, loss: expectedLoss(pz.post, DECIDE_GRID, t, logTarget) })),
      odds: probes.map((t) => ({ t: t, odds: hitOdds(pz.post, DECIDE_GRID, t, logTarget) })),
      // As if an egg had taught something: the choice itself, whatever the count.
      chosen_s: chooseCookTime(pz.post, DECIDE_GRID, logTarget, c.meanCookTime_s),
      decision: d,
      // The mean solve at this level, moved to the decided time.
      level: c.level,
      decided: decideSolutionRow(decidedSolution(
        DECIDE_EGG, DECIDE_SETUP, calibrationParams({ posterior: pz.post, eggsLogged: pz.eggsLogged }),
        decideMeanSolve(c.posterior, c.level), d,
      )),
    };
  }),
  carried: DECIDE_CARRIED,
  tenths: [0, 0.049, 0.05, 0.051, 0.349, 0.35, 0.649, 0.65, 0.951, 1].map((p) => ({ odds: p, tenths: oddsInTenths(p) })),
};

writeFileSync('fixtures/decide.json', `${JSON.stringify(decideFixture, null, 2)}\n`);

/* ------------------------------------------------------------ outcome.json */

/* What the egg at the chosen time will be like (src/core/outcome.ts): the
 * three yolk answers, a runny white, the level range and the lean. On
 * decide.json's surface and its three posteriors, which are not written out
 * again, and one more written out here: a cook whose three jammy eggs all came
 * out just right with a firm white. Each case is read at the time decided,
 * and 40 s either side of the mean solve, so that both leans and a balance
 * are pinned. */

const outcomeConsistent = createPrior(DECIDE_PARTICLES, DECIDE_SEED);
for (const t of [464, 462, 463]) updatePosterior(outcomeConsistent, DECIDE_GRID, t, levelTarget(0.41), 0, 'firm');
const outcomePosteriors = [...decidePosteriors, { name: 'consistent', eggsLogged: 3, post: outcomeConsistent }];

const OUTCOME_CASES: { posterior: string; level: number; note: string }[] = [
  { posterior: 'prior', level: 0.41, note: 'fresh install, jammy' },
  { posterior: 'prior', level: 0.22, note: 'fresh install, soft: the range runs off the bottom' },
  { posterior: 'prior', level: 1.0, note: 'fresh install, hard: the range runs off the top' },
  { posterior: 'consistent', level: 0.41, note: 'three jammy eggs just right' },
  { posterior: 'consistent', level: 0.62, note: 'the same cook at fudgy' },
  { posterior: 'firmer', level: 0.41, note: 'a cook who likes a firmer yolk: the median sits above the slider' },
  { posterior: 'firmer', level: 0.22, note: 'the same cook at soft' },
  { posterior: 'learned', level: 0.22, note: 'white-bound: a runny white at soft' },
  { posterior: 'learned', level: 0.41, note: 'the same cook at jammy' },
];

const outcomeFixture = {
  about: 'The predicted outcome at the chosen time: answers, level range and lean. src/core/outcome.ts. Surface and posteriors prior, learned and firmer are decide.json\'s.',
  constants: { leanRatio: LEAN_RATIO, levelLowQ: LEVEL_LOW_Q, levelHighQ: LEVEL_HIGH_Q },
  posteriors: [{
    name: 'consistent',
    eggsLogged: 3,
    weights: outcomeConsistent.weights,
    particles: particleRows(outcomeConsistent),
  }],
  cases: OUTCOME_CASES.map((c) => {
    const pz = outcomePosteriors.find((x) => x.name === c.posterior);
    if (pz === undefined) throw new Error(c.posterior);
    const logTarget = levelTarget(c.level);
    const params = pz.eggsLogged === 0 ? DEFAULT_PARAMS : posteriorParams(pz.post);
    const white = pz.eggsLogged === 0 ? 0.05 : 0.05 * 10 ** posteriorMeanWhiteOffset(pz.post);
    const sol = solveCookTime(DECIDE_EGG, DECIDE_SETUP, params, { ...donenessFromSlider(c.level), whiteDose_min: white });
    const mean = sol.result.cookTime_s;
    const d = decideAt(pz.post, pz.eggsLogged, DECIDE_GRID, mean, decisionApplies(sol), logTarget);
    return {
      posterior: c.posterior,
      note: c.note,
      level: c.level,
      logNominalTarget: logTarget,
      meanCookTime_s: mean,
      at: [d.cookTime_s, mean - 40, mean + 40].map((t) => ({
        t: t,
        outcome: predictOutcome(pz.post, DECIDE_GRID, t, logTarget),
      })),
    };
  }),
  // 0.375 is exactly 1.5 x 0.25, so the first two sit on the line, which is
  // not a lean.
  leans: [[0.375, 0.25], [0.25, 0.375], [0.376, 0.25], [0.25, 0.376], [0.25, 0.25], [UNRELATED / 3, UNRELATED / 3], [0.9, 0.0], [0.0, 0.9]]
    .map(([soft, firm]) => ({ pTooSoft: soft, pTooFirm: firm, lean: leanOf(soft, firm) })),
};

writeFileSync('fixtures/outcome.json', `${JSON.stringify(outcomeFixture, null, 2)}\n`);

/* -------------------------------------------------------------- reach.json */

/* The odds at every level, the range they allow, the verdict with that range,
 * the shading and the advice (src/core/reach.ts). A profile is a solve and a
 * decision per level, so both apps must walk the same levels in the same
 * order and land on the same ends. The surfaces are coarse, as decide.json's
 * is, and built per pot from the production spec; the posteriors are
 * decide.json's. */

function coarseDecisionGrid(c: Calibration, egg: ReturnType<typeof eggFromMass>, setup: CookSetup) {
  const full = decisionGridSpec(decisionInputs(c, egg, setup));
  const count = Math.ceil((full.timeMax_s - full.timeMin_s) / 20) + 1;
  const spec: GridSpec = { ...full, alphaCount: 7, timeMax_s: full.timeMin_s + 20 * (count - 1), timeCount: count };
  const tauAirScale = calibrationParams(c).tauAirScale;
  const grid = buildDoseGrid(
    egg, setup, tauAirScale, spec.alphaMin, spec.alphaMax, spec.alphaCount,
    spec.timeMin_s, spec.timeMax_s, spec.timeCount,
  );
  return { spec: spec, tauAirScale: tauAirScale, grid: grid };
}

const REACH_CASES: { posterior: string; setup: CookSetup }[] = [
  { posterior: 'prior', setup: DECIDE_SETUP },
  { posterior: 'learned', setup: DECIDE_SETUP },
  { posterior: 'learned', setup: setupOf({ timeToBoil_s: 480, eggCount: 2, cooling: 'counter' }) },
];

/* The answer at a level (`answerAt`): the solve, the verdict, and the retry
 * at the level it snaps to. Each profile's pot is asked at levels inside and
 * outside its range, with and without its odds, and with the retry on and off. */
const reachAnswers: unknown[] = [];

const reachProfiles = REACH_CASES.map((rc, index) => {
  const pz = decidePosteriors.find((x) => x.name === rc.posterior);
  if (pz === undefined) throw new Error(rc.posterior);
  const c: Calibration = { posterior: pz.post, eggsLogged: pz.eggsLogged };
  const g = coarseDecisionGrid(c, DECIDE_EGG, rc.setup);
  const profile = oddsProfile(c, DECIDE_EGG, rc.setup, g.grid);
  for (const withOdds of [false, true]) {
    for (const level of [0, 0.05, 0.41, 0.95, 1]) {
      for (const snapRetry of [true, false]) {
        const a = answerAt(c, DECIDE_EGG, rc.setup, level, withOdds ? profile : null, snapRetry);
        reachAnswers.push({
          profile: index, withOdds: withOdds, level: level, snapRetry: snapRetry,
          kind: a.verdict.kind, snapTo: a.verdict.snapTo, answeredLevel: a.level,
          reachable: a.solution.reachable, cookTime_s: a.solution.result.cookTime_s,
        });
      }
    }
  }
  return {
    posterior: rc.posterior,
    eggsLogged: pz.eggsLogged,
    egg: { mass_kg: DECIDE_EGG.mass_kg },
    setup: rc.setup,
    grid: { tauAirScale: g.tauAirScale, ...g.spec },
    profile: profile,
    shading: shadingOf(profile),
    near: [0, 0.13, 0.41, 0.625, 0.99, 1].map((level) => ({ level: level, odds: oddsNear(profile, level) })),
  };
});

const REACH_VERDICT_SOLUTIONS: { name: string; sol: Solution }[] = (() => {
  const result = {
    cookTime_s: 400, peakYolk_C: 65, peakYolkTime_s: 500, yolkAtPull_C: 60, yolkDose_min: 1,
    whiteDose_min: 1, peakWhite_C: 80,
  };
  const base = { result: result, minCookTime_s: 300, softestLevel: 0.1, hardestLevel: 0.9 };
  return [
    { name: 'reachable', sol: { ...base, reachable: true, whiteSets: true } },
    { name: 'tooSoft', sol: { ...base, reachable: false, whiteSets: true } },
    { name: 'never', sol: { ...base, reachable: false, whiteSets: false } },
  ];
})();
const REACH_RANGES: ({ softest: number | null; hardest: number | null } | null)[] = [
  null, { softest: null, hardest: null }, { softest: 0.3, hardest: 0.8 }, { softest: 0.1, hardest: 0.9 },
  { softest: 0.23, hardest: 0.63 },
];
const reachVerdicts: unknown[] = [];
for (const s of REACH_VERDICT_SOLUTIONS) {
  for (const range of REACH_RANGES) {
    for (const level of [0, 0.05, 0.2, 0.3, 0.5, 0.8, 0.85, 0.95, 1]) {
      const profile: OddsProfile | null = range === null ? null : {
        points: [], best: 0.6, physicalSoftest: 0.1, physicalHardest: 0.9,
        softest: range.softest, hardest: range.hardest,
      };
      const v = verdictWithOdds(s.sol, level, profile);
      reachVerdicts.push({
        solution: s.name, range: range, level: level,
        kind: v.kind, wanted: v.wanted.key, limit: v.limit.key, snapTo: v.snapTo, worthSaying: v.worthSaying,
      });
    }
  }
}

const ADVICE_SETUPS: { setup: CookSetup; eggFromClass: boolean; startAssumed: boolean }[] = [
  { setup: DECIDE_SETUP, eggFromClass: false, startAssumed: false },
  { setup: DECIDE_SETUP, eggFromClass: true, startAssumed: false },
  { setup: setupOf({ eggStart_C: 20, cooling: 'counter', afterBoil: 'off', waterLitres: 3 }), eggFromClass: true, startAssumed: true },
  { setup: setupOf({ eggStart_C: 20, cooling: 'tap' }), eggFromClass: false, startAssumed: false },
  { setup: setupOf({ eggStart_C: 5, afterBoil: 'off', waterLitres: 8 }), eggFromClass: false, startAssumed: true },
  { setup: setupOf({ afterBoil: 'off', waterLitres: 12 }), eggFromClass: false, startAssumed: true },
];
const ADVICE_PROFILE: OddsProfile = {
  points: [{ level: 0, odds: 0.5 }, { level: 0.5, odds: 0.7 }, { level: 1, odds: 0.3 }],
  best: 0.7, physicalSoftest: 0, physicalHardest: 1, softest: 0, hardest: 1,
};

const reachFixture = {
  about: 'The odds at every level, the range they allow, the verdict with it, the shading and the advice. src/core/reach.ts.',
  constants: {
    reachOdds: REACH_ODDS,
    profileStep: PROFILE_STEP,
    adviceBelowTenths: ADVICE_BELOW_TENTHS,
    adviceMarginTenths: ADVICE_MARGIN_TENTHS,
    adviceGain: ADVICE_GAIN,
    shadeBestMin: SHADE_BEST_MIN,
  },
  profiles: reachProfiles,
  // The shading either side of SHADE_BEST_MIN: none below it.
  shading: [SHADE_BEST_MIN - 0.001, SHADE_BEST_MIN, 0.3].map((best) => {
    const profile: OddsProfile = {
      points: [{ level: 0, odds: best / 2 }, { level: 0.5, odds: best }, { level: 1, odds: 0 }],
      best: best, physicalSoftest: 0, physicalHardest: 1, softest: null, hardest: null,
    };
    return { profile: profile, shading: shadingOf(profile) };
  }),
  answers: reachAnswers,
  verdicts: reachVerdicts,
  adviceWanted: [0, 3, 4, 5, 6, 7, 8].flatMap((tenths) => [null, 0.62, 0.8, 0.84].map((best) => ({
    tenths: tenths, best: best,
    wanted: adviceWanted(tenths, best === null ? null : { ...ADVICE_PROFILE, best: best }),
  }))),
  advice: ADVICE_SETUPS.map((a) => {
    const facts = { eggFromClass: a.eggFromClass, startAssumed: a.startAssumed };
    const priced = pricedChanges(a.setup);
    return {
      setup: a.setup, ...facts,
      unpriced: unpricedAdvice(a.setup, facts),
      priced: priced,
      shown: [0.25, 0.9].map((level) => [0.2, 0.62].map((odds) => ({
        level: level, odds: odds,
        keys: protocolAdvice(a.setup, facts, level, odds, priced.map((c) => ({ key: c.key, profile: ADVICE_PROFILE }))),
      }))).flat(),
    };
  }),
  adviceProfile: ADVICE_PROFILE,
};

writeFileSync('fixtures/reach.json', `${JSON.stringify(reachFixture, null, 2)}\n`);


type CatalogueJson = { locale: string; messages: Record<string, Record<string, unknown>> };

/* ------------------------------------------------------------------ write */

mkdirSync('fixtures', { recursive: true });
writeFileSync('fixtures/core.json', `${JSON.stringify(core, null, 2)}\n`);
writeFileSync('fixtures/scenarios.json', `${JSON.stringify(scenarios, null, 2)}\n`);
writeFileSync('fixtures/calibration.json', `${JSON.stringify(calibration, null, 2)}\n`);
writeFileSync('fixtures/policy.json', `${JSON.stringify(policy, null, 2)}\n`);
/* The two unit choices, which at a 58 C bath reach only two of their six
 * branches in normal use. Every boundary, from both sides, because four of
 * these were ported by hand and never once executed in either language. Each
 * row is the bucket core picks - a key and its numbers - and the English it
 * renders to, which is what this file held before core stopped speaking
 * English, and is unchanged. */
const englishJson = JSON.parse(readFileSync('copy/en.json', 'utf8')) as CatalogueJson;
const english = parseCatalogue(englishJson);

const sousVideCopy = {
  duration: [
    0, 1, 59, 60, 89 * 60, 90 * 60, 91 * 60, 120 * 60,
    2 * 3600, 2.5 * 3600, 47 * 3600, 47.5 * 3600, 48 * 3600, 49 * 3600,
    13 * 86400, 14 * 86400, 20 * 86400, 60 * 86400, 200 * 86400,
    81760.26, 1428737.1,
  ].map((seconds) => {
    const ref = longDuration(seconds);
    return { seconds: seconds, key: ref.key, args: ref.args, text: renderRef(english, ref) };
  }),
  startPhrase: [0, 1, 2, 3, 6, 7, 8, 13, 14, 20, 40, 59, 60, 90, 200, 400]
    .map((daysAgo) => {
      const ref = startPhrase(daysAgo);
      return {
        daysAgo: daysAgo,
        key: ref.key,
        args: ref.args,
        // A fixed weekday, so the branch is pinned without dragging a locale
        // into the fixture. Which weekday each app supplies is its own business.
        text: renderRef(english, ref, { weekday: 'Tuesday' }),
      };
    }),
  // The weekday's catalogue key, by Date.getDay() numbering, and what either
  // app's arithmetic might hand it past the ends of the week.
  weekday: [-8, -1, 0, 1, 2, 3, 4, 5, 6, 7, 13].map((day) => ({
    day: day, key: weekdayKey(day), text: render(english, weekdayKey(day)),
  })),
};

writeFileSync('fixtures/sousvideCopy.json', `${JSON.stringify(sousVideCopy, null, 2)}\n`);
writeFileSync('fixtures/sousvide.json', `${JSON.stringify(sousvide, null, 2)}\n`);

/* ------------------------------------------------------------------ copy */

/* Every key of every catalogue, rendered with the arguments its English entry
 * gives as an example, and every plural message again at each count below, so
 * that each form is reached. Then the plural rule of every language on its
 * own, at every edge CLDR has: Czech's `many` is for fractions, and 21 and 22
 * are `other`, not `one` and `few` as they would be in Russian or Polish.
 *
 * Then a probe: a small catalogue that exists only here, which the apps never
 * ship. It is in Czech's plural rule with one form per category, so that each
 * category is seen to pick its own template end to end, and it falls back to
 * English, so that the fallback is seen to work, and it carries the malformed
 * braces and the missing argument, so that both renderers fail the same way. */
const COPY_COUNTS = [0, 1, 2, 3, 4, 5, 11, 21, 22, 1.5, 2.5, 0.5];
const PLURAL_LOCALES = ['en', 'en-GB-x-1750', 'cs', 'cs-CZ', 'de'];
const PLURAL_NUMBERS = [0, 1, 2, 3, 4, 5, 10, 11, 21, 22, 100, 101, 1.5, 2.5, 0.5, 1.25, -1, -2];

interface CopyRow { locale: string; key: string; args: CopyArgs; text: string }

// A catalogue's tag may carry digits (`en-x-1750`); a file with a second dot
// (`en-x-1750.spelling.json`) is a test's data, not a catalogue.
const copyFiles = readdirSync('copy').filter((f) => /^[a-zA-Z0-9-]+\.json$/.test(f)).sort();
const catalogueJson = new Map<string, CatalogueJson>();
for (const file of copyFiles) {
  if (file === 'surfaces.json') continue;
  catalogueJson.set(file.replace(/\.json$/, ''), JSON.parse(readFileSync(`copy/${file}`, 'utf8')) as CatalogueJson);
}

function copyRows(locale: string, catalogue: Catalogue): CopyRow[] {
  const rows: CopyRow[] = [];
  for (const key of Object.keys(englishJson.messages)) {
    const entry = englishJson.messages[key];
    const example = (entry['example'] ?? {}) as Record<string, string | number>;
    rows.push({ locale: locale, key: key, args: example, text: render(catalogue, key, example) });
    const count = entry['count'];
    if (typeof count === 'string') {
      for (const n of COPY_COUNTS) {
        const args = { ...example, [count]: n };
        rows.push({ locale: locale, key: key, args: args, text: render(catalogue, key, args) });
      }
    }
  }
  return rows;
}

const probeJson = {
  locale: 'cs',
  messages: {
    'probe.eggs': {
      count: 'n', one: '{n} one', few: '{n} few', many: '{n} many', other: '{n} other',
    },
    'probe.sparse': { count: 'n', one: 'just {n}', other: '{n} of them' },
    'probe.braces': { text: '{} {1x} {x y} {{ok}} {ok} {ok_2} {Ok} { ok} {ok' },
    'probe.unicode': { text: 'žluťoučký {ok} — ±{n}%' },
  },
};
const probe = parseCatalogue(probeJson, english);
const probeCases: { key: string; args: CopyArgs }[] = [
  ...PLURAL_NUMBERS.map((n) => ({ key: 'probe.eggs', args: { n: n } })),
  ...[0, 1, 2, 5, 1.5].map((n) => ({ key: 'probe.sparse', args: { n: n } })),
  { key: 'probe.eggs', args: {} },
  { key: 'probe.eggs', args: { n: '3' } },
  { key: 'probe.braces', args: { ok: 'OK', ok_2: 2, Ok: 'capital' } },
  { key: 'probe.braces', args: {} },
  { key: 'probe.unicode', args: { ok: 'kůň', n: 4 } },
  { key: 'learned.tuned', args: { eggs: 2 } },
  { key: 'learned.tuned', args: { eggs: 1.5 } },
  { key: 'no.such.key', args: { n: 1 } },
];

const copy = {
  locales: [...catalogueJson.keys()],
  render: [...catalogueJson.entries()].flatMap(([locale, json]) => copyRows(
    locale, locale === 'en' ? english : parseCatalogue(json, english),
  )),
  plural: PLURAL_LOCALES.flatMap((locale) => PLURAL_NUMBERS.map((n) => ({
    locale: locale, n: n, category: pluralCategory(locale, n),
  }))),
  categories: PLURAL_CATEGORIES,
  // An argument as text: a string as it is, a count with its own decimals, a
  // measurement with exactly its own, in English and in Czech formatting.
  formatArg: ['en', 'cs-CZ'].flatMap((locale) => ([
    0, 1, 3, -3, 21, 1234567, 1.5, 2.5, 0.25, -0.5, 1e15, 'text', '', '4,5',
    { value: 2, decimals: 2 }, { value: 1234.5, decimals: 1 }, { value: -0.001, decimals: 2 },
  ] as CopyArg[]).map((value) => ({ locale: locale, value: value, text: formatArg(value, locale) }))),
  probe: {
    catalogue: probeJson,
    cases: probeCases.map((c) => ({ ...c, text: render(probe, c.key, c.args) })),
  },
};

writeFileSync('fixtures/copy.json', `${JSON.stringify(copy, null, 2)}\n`);

/* ----------------------------------------------------------------- format */

/* Numbers and times of day as each supported formatting locale writes them,
 * through `Intl` here and Foundation in Swift. SUPPORTED are the locales the
 * apps are promised to agree in; ALSO are more that were measured to agree
 * and are pinned so that a platform update which changes them is noticed. The
 * disagreements found while choosing these are in LANGUAGE.md §2.
 *
 * Then the pseudo-Czech catalogue in test/pseudo-cs.json - Czech's plural rule
 * and no Czech words - rendered in cs-CZ, which is the machinery F5 will use,
 * end to end, before there is a word of Czech to use it with. */
const FORMAT_SUPPORTED = ['en-US', 'en-GB', 'cs-CZ'];
const FORMAT_ALSO = ['en', 'en-AU', 'en-DE', 'en-CZ', 'cs', 'en-US-u-hc-h23', 'en-GB-u-hc-h12'];
const FORMAT_LOCALES = [...FORMAT_SUPPORTED, ...FORMAT_ALSO];

const FORMAT_NUMBERS: [number, number][] = [
  [0, 0], [-0, 0], [-0.4, 0], [-0.004, 2], [1, 0], [2.4, 1], [2.45, 1], [2.55, 1], [2.675, 2], [-2.5, 0],
  [0.25, 2], [2, 2], [12.5, 2], [99.95, 1], [212, 1], [999, 0], [1000, 0], [1234.5, 1], [-1300, 0],
  [16400, 0], [12345678.9, 1], [1.72, 2], [0.02, 2], [1e15, 0],
];
const FORMAT_COUNTS = [0, 1, 2, 5, 17, 45, 1.5, 2.25, 0.125, 1.0004, 2.9996, 1234, 1234567, -3];
const FORMAT_TIMES: [number, boolean][] = [
  [0, false], [5 * 60, false], [9 * 3600 + 5 * 60, false], [12 * 3600, false], [12 * 3600 + 30 * 60, false],
  [15 * 3600 + 5 * 60, false], [23 * 3600 + 59 * 60, false], [8 * 3600 + 47 * 60 + 59, false],
  [7 * 3600 + 41 * 60 + 12, true], [15 * 3600 + 5 * 60 + 9, true], [0, true],
  [86400 + 3600, false], [-60, false],
];

const pseudoJson = JSON.parse(readFileSync('test/pseudo-cs.json', 'utf8')) as CatalogueJson;
const pseudo = parseCatalogue(pseudoJson, english);
const fixed = (value: number, decimals: number): Fixed => ({ value: value, decimals: decimals });
const pseudoCases: { key: string; args: CopyArgs }[] = [
  ...[0, 1, 2, 4, 5, 21, 22, 59].map((n) => ({ key: 'spoken.seconds', args: { seconds: n } })),
  ...[1, 3, 11].map((n) => ({ key: 'spoken.minutes', args: { minutes: n } })),
  ...[[1, 0], [2, 0], [5, 0], [1.5, 1], [1.5, 2], [2, 2], [1, 2], [0.5, 2], [21, 0], [12.5, 2]].map(
    ([v, d]) => ({ key: 'format.litres', args: { value: fixed(v, d) } }),
  ),
  ...[[1250, 0], [16400, 0], [-400, 0], [950, 0]].map(([v, d]) => ({ key: 'format.metres', args: { value: fixed(v, d) } })),
  { key: 'format.celsius', args: { value: fixed(99.7, 1) } },
  { key: 'format.fahrenheit', args: { value: fixed(211.5, 1) } },
  { key: 'format.ounces', args: { value: fixed(2.4, 1) } },
  { key: 'format.inches', args: { value: fixed(1.72, 2) } },
  ...[1, 3, 6, 13, 1234].map((n) => ({ key: 'duration.days', args: { days: n } })),
  { key: 'duration.hoursMinutes', args: { hours: 22, minutes: 43 } },
  ...[1, 2, 5, 1.5].map((n) => ({ key: 'learned.tuned', args: { eggs: n } })),
  {
    key: 'sousvide.subline',
    args: { clock: formatTimeOfDay('cs-CZ', 8 * 3600 + 47 * 60, false), duration: '22 h 43 min', bath: '58 °C' },
  },
  { key: 'sousvide.start.lastWeekday', args: { weekday: render(pseudo, weekdayKey(3)) } },
  { key: 'spoken.minutesSeconds', args: { minutes: render(pseudo, 'spoken.minutes', { minutes: 1 }, 'cs-CZ'), seconds: render(pseudo, 'spoken.seconds', { seconds: 1 }, 'cs-CZ') } },
];

const HOUR_CYCLES: (HourCycle | null)[] = [null, 'h23', 'h12'];
const format = {
  supported: FORMAT_SUPPORTED,
  locales: FORMAT_LOCALES,
  roundTo: FORMAT_NUMBERS.map(([value, decimals]) => ({ value: value, decimals: decimals, result: roundTo(value, decimals) })),
  countDecimals: FORMAT_COUNTS.map((value) => ({ value: value, decimals: countDecimals(value) })),
  numbers: FORMAT_LOCALES.flatMap((locale) => FORMAT_NUMBERS.map(([value, decimals]) => ({
    locale: locale, value: value, decimals: decimals, text: formatNumber(locale, value, decimals),
  }))),
  counts: FORMAT_LOCALES.flatMap((locale) => FORMAT_COUNTS.map((value) => ({
    locale: locale, value: value, text: formatCount(locale, value),
  }))),
  times: FORMAT_LOCALES.flatMap((locale) => FORMAT_TIMES.map(([seconds, withSeconds]) => ({
    locale: locale, seconds: seconds, withSeconds: withSeconds, text: formatTimeOfDay(locale, seconds, withSeconds),
  }))),
  normaliseTime: ['3:05 PM', '3:05\u00a0PM', '3:05\u202fPM', '15:05', 'a b\u00a0c'].map((text) => ({
    text: text, normalised: normaliseTime(text),
  })),
  unpadHour: [
    '09:05', '00:05', '0:05', '9:05', '12:05', '15:05', '09:05:09', 'a\u202f09:05', '09:05\u202fPM', '0', '09', '',
    'PM', '10:05', '\u0660\u0669:\u0660\u0665',
  ].map((text) => ({ text: text, unpadded: unpadHour(text) })),
  // The whole path, from what each app knows - the UI's language, the
  // device's region, the device's own clock setting - to the bytes a cook
  // reads: the owner's rules of 27 September, end to end.
  derived: ([
    ['en', 'GB', null], ['en', 'US', null], ['cs', 'CZ', null], ['en', 'CZ', null], ['cs', 'US', null],
    ['cs', 'GB', null], ['cs', 'DE', null], ['cs', null, null], ['en', 'DE', null], ['en', 'US', 'h23'],
    ['en', 'GB', 'h12'], ['en', 'AU', 'h23'],
  ] as [string, string | null, HourCycle | null][]).map(([ui, region, hc]) => {
    const tag = formattingLocale(ui, region, hc);
    return {
      uiLanguage: ui, region: region, hourCycle: hc, tag: tag,
      number: formatNumber(tag, 1234.5, 1), decimal: formatNumber(tag, 2.4, 1),
      morning: formatTimeOfDay(tag, 9 * 3600 + 5 * 60, false), midnight: formatTimeOfDay(tag, 5 * 60, false),
      afternoon: formatTimeOfDay(tag, 15 * 3600 + 5 * 60, false),
      withSeconds: formatTimeOfDay(tag, 9 * 3600 + 5 * 60 + 9, true),
    };
  }),
  formattingLocale: ['en', 'cs', 'en-x-1750', 'en-GB-x-1750', 'CS', '', 'english'].flatMap((ui) =>
    ['US', 'GB', 'CZ', 'DE', 'gb', '150', null, 'GBR', 'U1'].flatMap((region) =>
      HOUR_CYCLES.map((hc) => ({
        uiLanguage: ui, region: region, hourCycle: hc, tag: formattingLocale(ui, region, hc),
      })))),
  plural: ['en', 'cs'].flatMap((locale) => [
    [1, 0], [1, 1], [1, 2], [2, 0], [2, 2], [5, 0], [1.5, 1], [1.5, 2], [0, 0], [0, 2], [21, 0],
  ].map(([n, v]) => ({ locale: locale, n: n, fractionDigits: v, category: pluralCategory(locale, n, v) }))),
  // Every quantity a cook reads, in both systems, in every supported locale:
  // the key and the words, through the English catalogue.
  // Not the girth or the width: the iOS core measures neither (D4).
  measures: FORMAT_SUPPORTED.flatMap((locale) => QUANTITIES.filter((q) => q !== 'girth' && q !== 'width').flatMap((q) => UNIT_SYSTEMS.flatMap((system) =>
    [0.5, 2.4, 63.5, 1500, 16400].map((si) => {
      const m = measureFor(q, system, locale.slice(-2));
      const text = quantityText(m, si);
      return {
        locale: locale, quantity: q, system: system, region: locale.slice(-2), si: si,
        key: text.key, value: text.value, text: render(english, text.key, { value: text.value }, locale),
      };
    })))),
  pseudo: {
    catalogue: pseudoJson,
    formatLocale: 'cs-CZ',
    cases: pseudoCases.map((c) => ({ ...c, text: render(pseudo, c.key, c.args, 'cs-CZ') })),
  },
};

writeFileSync('fixtures/format.json', `${JSON.stringify(format, null, 2)}\n`);

/* ------------------------------------------------------------------ units */

const units = unitsFixture(english);
writeFileSync('fixtures/units.json', `${JSON.stringify(units, null, 2)}\n`);

/* ------------------------------------------------------------------ probe */

const thermometer = probeFixture();
writeFileSync('fixtures/probe.json', `${JSON.stringify(thermometer, null, 2)}\n`);

/* --------------------------------------------------------------- language */

const language = languageFixture();
writeFileSync('fixtures/language.json', `${JSON.stringify(language, null, 2)}\n`);

/* ---------------------------------------------------------------- wording */

const wording = wordingFixture();
writeFileSync('fixtures/wording.json', `${JSON.stringify(wording, null, 2)}\n`);

const counts = [
  `${core.sphere.seriesTheta.length} seriesTheta`,
  `${core.sphere.stepResponse.length} step samples`,
  `${core.sphere.rampResponse.length} ramp samples`,
  `${core.geometry.fromMass.length} geometry`,
  `${core.thermo.boilingPointAtAltitude.length} altitudes`,
  `${scenarios.cases.length} scenarios`,
  `${calibration.grid.logYolk.length} grid cells`,
  `${calibration.updates.length} calibration updates`,
  `${calibration.updates.filter((u) => u.white !== null).length} white answers`,
  `${policy.slider.cases.length} snap`,
  `${policy.verdict.length} verdicts`,
  `${policy.texture.length} textures`,
  `${sousvide.cases.length} sous-vide`,
  `${sousVideCopy.duration.length + sousVideCopy.startPhrase.length} sous-vide copy`,
  `${copy.render.length} copy renders`,
  `${copy.plural.length} plural rules`,
  `${copy.probe.cases.length} copy probes`,
  `${format.numbers.length + format.counts.length + format.times.length} formatted numbers and times`,
  `${format.pseudo.cases.length} pseudo-Czech renders`,
  `${(units['measures'] as { roundTrip: unknown[] }[]).reduce((n, m) => n + m.roundTrip.length, 0)} unit round trips`,
  `${recordFixture.cases.length} records`,
  `${recordFixture.replay.log.length} replayed eggs`,
  `${decideFixture.specs.length} decision surfaces and ${decideFixture.cases.length} decisions`,
  `${outcomeFixture.cases.reduce((n, c) => n + c.at.length, 0)} outcomes`,
  `${reachFixture.profiles.length} odds profiles, ${reachFixture.verdicts.length} verdicts with odds and ${reachFixture.advice.length} advice setups`,
  `${(thermometer['updates'] as unknown[]).length} probe folds`,
  `${(thermometer['solved'] as unknown[]).length} probe cooks`,
  `${(language['transitions'] as unknown[]).length} language moves`,
];
console.log(`fixtures/*.json written: ${counts.join(', ')}`);
