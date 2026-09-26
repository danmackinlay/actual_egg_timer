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
 * Two files, because they have different lifetimes:
 *
 *   fixtures/core.json      pure functions - the port covers these today
 *   fixtures/scenarios.json whole cooks - the port covers these when the
 *                           solver lands, and they are generated now so the
 *                           target exists before the code does
 *   fixtures/policy.json    the decisions above the physics - snapping, the
 *                           refusal verdict, texture bands, the calibration
 *                           grid's geometry, the bounds and the defaults, and
 *                           both size-class tables. These used to be
 *                           transliterated by hand in both apps
 *   fixtures/sousvide.json  the isothermal limit. Separate because it answers a
 *                           question the solver never asks: no pan, no ramp, no
 *                           cooling, and an answer in hours rather than minutes
 *   fixtures/copy.json      every key of every catalogue in copy/, rendered, and
 *                           the plural rule of every language at its edges
 *   fixtures/record.json    the record (INFERENCE.md section 4): which records a
 *                           loader trusts, and a replay of a six-egg log pinned
 *                           particle by particle
 */

import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';

import {
  MODE_COUNT, ALPHA_DEFAULT, ALPHA_REL_SD, YOLK_RADIUS_FRAC, Z_YOLK, TREF_YOLK_C, Z_WHITE,
  TREF_WHITE_C, H_EFF, K_EGG, RAMP_R, TAU_STANDING_SCALE, TAU_STANDING_REF_S,
  STANDING_REF_LITRES, STANDING_VOLUME_EXPONENT, TAU_AIR, T_ICE_BATH_C, T_COLD_TAP_C, T_ROOM_C, TAU_PLUNGE, TAU_DIP_RECOVERY, C_WATER, C_EGG, RHO_EGG,
  EGG_VOLUME_COEFF, EGG_LENGTH_RATIO, DT_SIM, CARRYOVER_WINDOW,
} from '../src/core/constants.js';
import {
  eggFromMass, eggFromMinorDiameter, diffusionTime, eggVolumeFromMinorDiameter,
  SIZE_CLASSES, US_SIZE_CLASSES, SizeClass, sizeClassLabel, sizeTableFor,
} from '../src/core/geometry.js';
import {
  pressureAtAltitude, boilingPointAtPressure, boilingPointAtAltitude,
  boilingPointApprox, saltBoilingElevation,
} from '../src/core/thermo.js';
import {
  createDose, accumulateDose, holdTimeForDose, zFromActivationEnergy,
} from '../src/core/kinetics.js';
import { buildDoseGrid, lookupLogYolkDose, lookupLogWhiteDose, cookTimeForLogYolkDose } from '../src/core/doseGrid.js';
import {
  Feedback, FEEDBACK_BAND, WhiteReport, WHITE_FEEDBACK_BAND, WHITE_ASK_MIN_P,
  createPrior, updatePosterior, updateWhite, posteriorParams,
  posteriorMeanOffset, posteriorAlphaRelSd, predictCookTime, effectiveSampleSize,
  whiteRunnyProbability, shouldAskAboutWhite,
} from '../src/core/infer.js';
import {
  createSphere, stepSphere, temperatureAt, centreTemperature, meanTemperature,
  seriesTheta, erfcTheta, oneTermTheta, biotNumber, erfc,
} from '../src/core/sphere.js';
import { CookSetup } from '../src/core/protocol.js';
import {
  Catalogue, CopyArgs, PLURAL_CATEGORIES, formatArg, parseCatalogue, pluralCategory, render,
  renderRef,
} from '../src/core/copy.js';
import {
  Calibration, EggRecord, PRIOR_ID, RECORD_VERSION, buildRequestedGrid, copyCalibration,
  foldWhite, foldYolk, freshCalibration, gridRequestFor, parseRecord, recordMass_g,
  recordTeaches, replay,
} from '../src/core/record.js';
import { longDuration, startPhrase } from '../src/core/sousvide.js';
import {
  SOUS_VIDE_BATH_C, equilibrationTime, sousVideEstimate,
} from '../src/core/sousvide.js';
import {
  simulate, solveCookTime, donenessFromSlider, DEFAULT_PARAMS, Solution,
} from '../src/core/solve.js';
import {
  LIMITS, SLIDER_STEPS, PARTICLE_COUNT as POLICY_PARTICLES, CALIBRATION_SEED,
  DEFAULTS, DEFAULT_EGG_MASS_KG, DEFAULT_TIME_TO_BOIL_S, START_TEMP_PRESETS_C,
  BoilMemory, COOLING_SECONDS, GridSpec, PULL_GRACE_SECONDS, ambientFor, anchorNear,
  calibrationGrid, carrySizeIndex, estimateTimeToBoil, phaseAt, rememberBoil, snapDown, snapUp,
  targetPeakYolk_C, textureFor, verdictFor,
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
const MINOR_CASES_MM = [36, 40, 43.5, 44.8, 48, 52];
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
    erfcTheta: THETA_CASES.map(([x, fo]) => ({ x: x, fourier: fo, value: round(erfcTheta(x, fo)) })),
    oneTermTheta: THETA_CASES.map(([x, fo]) => ({ x: x, fourier: fo, value: round(oneTermTheta(x, fo)) })),
    erfc: ERFC_CASES.map((x) => ({ x: x, value: round(erfc(x)) })),
    biotNumber: [500, 850, 1100].map((h) => ({ h_Wm2K: h, radius_m: 0.0238, value: round(biotNumber(h, 0.0238)) })),
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
        tau_s: round(diffusionTime(egg, ALPHA_DEFAULT)),
      };
    }),
    fromMinorDiameter: MINOR_CASES_MM.map((mm) => {
      const egg = eggFromMinorDiameter(mm / 1000);
      return {
        minorDiameter_mm: mm,
        radius_m: round(egg.radius_m),
        mass_kg: round(egg.mass_kg),
        volume_m3: round(egg.volume_m3),
        volumeDirect_m3: round(eggVolumeFromMinorDiameter(mm / 1000)),
      };
    }),
  },
  thermo: {
    pressureAtAltitude: ALTITUDE_CASES_M.map((h) => ({ altitude_m: h, value: round(pressureAtAltitude(h)) })),
    boilingPointAtAltitude: ALTITUDE_CASES_M.map((h) => ({ altitude_m: h, value: round(boilingPointAtAltitude(h)) })),
    boilingPointAtPressure: PRESSURE_CASES_PA.map((p) => ({ pressure_Pa: p, value: round(boilingPointAtPressure(p)) })),
    boilingPointApprox: ALTITUDE_CASES_M.map((h) => ({ altitude_m: h, value: round(boilingPointApprox(h)) })),
    saltBoilingElevation: [0, 6, 18, 36].map((g) => ({ gramsPerLitre: g, value: round(saltBoilingElevation(g)) })),
  },
  kinetics: {
    zFromActivationEnergy: [
      { ea_Jmol: 469e3, temperature_K: 338.15 },
      { ea_Jmol: 480e3, temperature_K: 353.15 },
      { ea_Jmol: 470e3, temperature_K: 338.0 },
    ].map((c) => ({ ...c, value: round(zFromActivationEnergy(c.ea_Jmol, c.temperature_K)) })),
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

const EU_LARGE = eggFromMinorDiameter(0.0435);

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
  $comment: 'Generated by tools/fixtures.ts. The port covers these once solve.ts is ported.',
  generator: 'npm run fixtures',
  egg: {
    minorDiameter_m: EU_LARGE.minorDiameter_m,
    radius_m: EU_LARGE.radius_m,
    mass_kg: EU_LARGE.mass_kg,
  },
  params: DEFAULT_PARAMS,
  cases: SCENARIOS.map((s) => {
    const sol = solveCookTime(EU_LARGE, s.setup, DEFAULT_PARAMS, donenessFromSlider(s.level));
    const fixed = simulate(EU_LARGE, s.setup, DEFAULT_PARAMS, 7.4 * 60);
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
 * The grid here is deliberately smaller than the app's 21 x 36 - it costs one
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

/* A sequence with a repeat, a reversal and enough agreement to drive the
 * effective sample size below n/2 and trigger a resample - which is the only
 * part of the filter that consumes the RNG after the prior. */
const FEEDBACK_SEQUENCE: Feedback[] = [-1, 0, -1, 1, 0, -1, -1, 0, -1, 1, 1];

/* What the user said about the WHITE of the same egg, folded straight after the
 * yolk answer, or null for an egg they were not asked about.
 *
 * Folded here whether or not `shouldAskAboutWhite` would have asked: the two
 * implementations must agree on the arithmetic wherever it is performed, and the
 * decision about when to ASK is pinned separately below.
 *
 * The cook times were chosen to straddle the white's threshold on this surface.
 * Around 340-380 s the particles disagree about the white; 440-500 s puts it well
 * past setting and they are unanimous. So the sequence exercises all three
 * predictions a particle can make - runny, set, and the band where it predicts
 * neither - and both answers against each. */
const WHITE_SEQUENCE: (WhiteReport | null)[] = [
  'runny', 'set', 'runny', null, 'set', null, 'runny', 'set', null, 'set', 'runny',
];

function particleRows(post: ReturnType<typeof createPrior>) {
  return post.particles.map((p) => ({
    alpha_m2s: round(p.alpha_m2s),
    logDoseOffset: round(p.logDoseOffset),
    tauAirScale: round(p.tauAirScale),
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
    meanOffset: round(posteriorMeanOffset(post)),
    alphaRelSd: round(posteriorAlphaRelSd(post)),
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
  updatePosterior(posterior, CALIB_GRID, cookTime_s, NOMINAL_TARGET, feedback);
  // The ask decision is read AFTER the yolk fold, which is where both apps read
  // it: the yolk answer has just moved alpha, and so moved the predicted white.
  const after = readout(posterior);
  const askWhite = shouldAskAboutWhite(posterior, CALIB_GRID, cookTime_s);
  const whiteRunny = round(whiteRunnyProbability(posterior, CALIB_GRID, cookTime_s));
  const white = WHITE_SEQUENCE[i];
  if (white !== null) updateWhite(posterior, CALIB_GRID, cookTime_s, white);
  return {
    cookTime_s: cookTime_s,
    logNominalTarget: round(NOMINAL_TARGET),
    feedback: feedback,
    after: after,
    askWhite: askWhite,
    whiteRunny: whiteRunny,
    white: white,
    afterWhite: white === null ? null : readout(posterior),
  };
});

/* One more fold, from a deliberately degenerate particle set, so that the
 * resample inside `updateWhite` is EXECUTED rather than merely present.
 *
 * It cannot be reached any other way. The white channel is weak by design, and
 * the largest fall in effective sample size one binary 0.65 / 0.35 answer can
 * cause is about 6% - so no sequence of white answers alone will ever take a
 * healthy set of 64 particles below the n/2 threshold. A set that is already
 * close to it is the only route to that branch.
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
  updateWhite(post, CALIB_GRID, cookTime_s, white);
  return {
    cookTime_s: cookTime_s,
    white: white,
    before: before,
    after: readout(post),
  };
})();

/* The second question's selection rule, over a sweep of cook times on the same
 * surface and the same prior. Cheap - no state, no RNG - and dense, because this
 * is what decides whether a user is asked at all: a port that got it wrong would
 * ask on every egg or on none, and no posterior comparison would notice. */
const WHITE_ASK_CASES = [240, 270, 300, 340, 380, 420, 500, 650, 900].map((cookTime_s) => {
  const fresh = createPrior(PARTICLE_COUNT, PRIOR_SEED);
  return {
    cookTime_s: cookTime_s,
    whiteRunny: round(whiteRunnyProbability(fresh, CALIB_GRID, cookTime_s)),
    askWhite: shouldAskAboutWhite(fresh, CALIB_GRID, cookTime_s),
  };
});

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
  feedbackBand: FEEDBACK_BAND,
  whiteFeedbackBand: WHITE_FEEDBACK_BAND,
  whiteAskMinP: WHITE_ASK_MIN_P,
  whiteAsk: WHITE_ASK_CASES,
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

const TEXTURE_CASES: [number, number][] = [];
for (const yolk of [50, 57.9, 58, 62.9, 63, 67.9, 68, 72.9, 73, 85]) {
  for (const white of [60, 70.9, 71, 81.9, 82, 95]) TEXTURE_CASES.push([yolk, white]);
}

/* Two pans remembered in both orders, so a port that iterates an unordered map
 * is caught rather than merely lucky. */
const BOIL_MEMORY_FORWARD: BoilMemory = rememberBoil(rememberBoil({}, 1, 300), 3, 900);
const BOIL_MEMORY_BACKWARD: BoilMemory = rememberBoil(rememberBoil({}, 3, 900), 1, 300);
const BOIL_QUERY_LITRES = [0.5, 1, 1.5, 2, 2.5, 3, 4, 12];

/** A size class as the fixture states it: the key, the mass the model cooks,
 *  and the grams its label shows. */
function sizeClassRow(c: SizeClass): { key: string; mass_kg: number; grams: number } {
  return { key: c.key, mass_kg: c.mass_kg, grams: sizeClassLabel(c).args['grams'] as number };
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
  texture: TEXTURE_CASES.map(([yolk, white]) => {
    const t = textureFor(yolk, white);
    return { peakYolk_C: yolk, peakWhite_C: white, white: t.white, yolk: t.yolk };
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
    /* Two timelines from the same cook, differing only in whether there is a
     * cooling step to time. The counter one is the bug: with no cooling
     * deadline, the iOS app used to fall from COOKING straight to DONE and
     * never show the pull at all. Sampled either side of every boundary. */
    timelines: [
      { name: 'ice bath', cookEnd_s: 600, coolEnd_s: 600 + PULL_GRACE_SECONDS + COOLING_SECONDS },
      { name: 'counter rest', cookEnd_s: 600, coolEnd_s: null },
    ].map((t) => ({
      name: t.name,
      cookEnd_s: t.cookEnd_s,
      coolEnd_s: t.coolEnd_s,
      samples: [
        0, 1, 599, 599.999, 600, 600.001, 619, 619.999, 620, 620.001,
        700, 799, 799.999, 800, 800.001, 10000,
      ].map((now_s) => ({
        now_s: now_s,
        provisional: phaseAt(
          { cookEnd_s: t.cookEnd_s, coolEnd_s: t.coolEnd_s, provisional: true }, now_s,
        ),
        phase: phaseAt(
          { cookEnd_s: t.cookEnd_s, coolEnd_s: t.coolEnd_s, provisional: false }, now_s,
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
 * the replay: a log of six eggs from both apps, one of them unanswered, folded
 * from a fresh prior with every particle and weight written out after each egg,
 * and the tail of the same log folded again from the state after the second egg
 * - which is what a migrated phone does with its frozen base.
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
  whiteOffered: boolean;
}

/* Realistic cooks: each recommended time is what the solver says for that egg
 * and pan at the literature values, so the surfaces sit where real ones would. */
function recordOf(e: EggSpec): EggRecord {
  const egg = eggFromMass(e.mass_g / 1000);
  const setup = setupOf(e.over);
  const recommended = solveCookTime(
    egg, setup, DEFAULT_PARAMS, donenessFromSlider(e.level),
  ).result.cookTime_s;
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
    cooled_s: setup.cooling === 'counter' ? 0 : COOLING_SECONDS,
    yolk: e.yolk,
    white: e.white,
    whiteOffered: e.whiteOffered,
    probe: null,
    lang: 'en',
    register: 'modern',
    units: 'metric',
  };
}

const REPLAY_LOG: EggRecord[] = [
  // Soft, too soft, and the white was runny: both channels, from the prior.
  recordOf({
    app: 'web', mass_g: 62, massFrom: 'class', eggFrom: 'fridge', over: {},
    level: 0.3, pulledBy: 'cook', late_s: 7.25, yolk: -1, white: 'runny', whiteOffered: true,
  }),
  // A cold start with a measured ramp; not asked about the white.
  recordOf({
    app: 'ios', mass_g: 68.5, massFrom: 'scale', eggFrom: 'fridge',
    over: { startMode: 'cold', timeToBoil_s: 512.4 },
    level: 0.45, pulledBy: 'timeout', late_s: 0, yolk: 0, white: null, whiteOffered: false,
  }),
  // Nobody answered. Still a record; it folds nothing and builds no surface.
  // Nor had anybody ever timed the pan.
  recordOf({
    app: 'web', mass_g: 58, massFrom: 'class', eggFrom: 'room', over: { eggStart_C: 20 },
    boilFrom: 'default',
    level: 0.5, pulledBy: 'timeout', late_s: 0, yolk: null, white: null, whiteOffered: false,
  }),
  // Asked about the white, and skipped it.
  recordOf({
    app: 'web', mass_g: 55.3, massFrom: 'girth', eggFrom: 'custom',
    over: { eggStart_C: 8, cooling: 'tap' },
    level: 0.4, pulledBy: 'cook', late_s: 31.5, yolk: 1, white: null, whiteOffered: true,
  }),
  // Rested on the counter, the only cook that reaches tauAirScale.
  recordOf({
    app: 'ios', mass_g: 67.3, massFrom: 'class', sizeTable: 'us', eggFrom: 'room',
    over: { eggStart_C: 20, cooling: 'counter' },
    level: 0.62, pulledBy: 'timeout', late_s: 0, yolk: 0, white: null, whiteOffered: false,
  }),
  // The standing method, from a cold start, and a white that set.
  recordOf({
    app: 'web', mass_g: 60.2, massFrom: 'width', eggFrom: 'fridge',
    over: { startMode: 'cold', timeToBoil_s: 430, afterBoil: 'off', waterLitres: 1.5, eggCount: 2 },
    level: 0.5, pulledBy: 'cook', late_s: 2, yolk: -1, white: 'set', whiteOffered: true,
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

/* Egg by egg, the way an app folds them: surface, yolk, ask, white. */
const replayStart = freshCalibration(REPLAY_PARTICLES, REPLAY_SEED);
const replayState = copyCalibration(replayStart);
const replaySnapshots: Calibration[] = [];
const replaySteps = REPLAY_LOG.map((r) => {
  let askWhite: boolean | null = null;
  let spec: GridSpec | null = null;
  if (recordTeaches(r)) {
    const q = gridRequestFor(replayState, r, replayGrid);
    spec = q.spec;
    const surface = buildRequestedGrid(q);
    askWhite = foldYolk(replayState, r, surface);
    foldWhite(replayState, r, surface);
  }
  replaySnapshots.push(copyCalibration(replayState));
  return { spec: spec, askWhite: askWhite, after: calibrationRows(replayState) };
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
      || b.tauAirScale !== a.tauAirScale || other.posterior.rng !== replayState.posterior.rng) {
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
  { why: 'a white answer nobody offers', mutate: (r) => { r['white'] = 'firm'; } },
  { why: 'an answer to a question never asked', mutate: (r) => { r['whiteOffered'] = false; } },
  { why: 'offered as a number', mutate: (r) => { r['whiteOffered'] = 1; } },
  { why: 'offered missing', mutate: (r) => { delete r['whiteOffered']; } },
  { why: 'a probe reading before E4', mutate: (r) => { r['probe'] = 64.5; } },
  { why: 'a probe object before E4', mutate: (r) => { r['probe'] = {}; } },
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
  };
});
// A log is all or nothing: one bad record refuses the lot.
recordCases.push({
  why: 'not an object',
  record: [CANONICAL] as unknown as Record<string, unknown>,
  valid: parseRecord([CANONICAL]) !== null,
  yolk: null,
  white: null,
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

const copyFiles = readdirSync('copy').filter((f) => /^[a-zA-Z-]+\.json$/.test(f)).sort();
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
  { key: 'learned.tuned', args: { eggs: 2, spread: '9' } },
  { key: 'learned.tuned', args: { eggs: 1.5, spread: '9' } },
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
  formatArg: [0, 1, 3, -3, 21, 1234567, 1.5, 2.5, 0.25, -0.5, 1e15, 'text', '', '4,5'].map((value) => ({
    value: value, text: formatArg(value),
  })),
  probe: {
    catalogue: probeJson,
    cases: probeCases.map((c) => ({ ...c, text: render(probe, c.key, c.args) })),
  },
};

writeFileSync('fixtures/copy.json', `${JSON.stringify(copy, null, 2)}\n`);

const counts = [
  `${core.sphere.seriesTheta.length} seriesTheta`,
  `${core.sphere.stepResponse.length} step samples`,
  `${core.sphere.rampResponse.length} ramp samples`,
  `${core.geometry.fromMass.length + core.geometry.fromMinorDiameter.length} geometry`,
  `${core.thermo.boilingPointAtAltitude.length} altitudes`,
  `${scenarios.cases.length} scenarios`,
  `${calibration.grid.logYolk.length} grid cells`,
  `${calibration.updates.length} calibration updates`,
  `${calibration.updates.filter((u) => u.white !== null).length} white folds`,
  `${policy.slider.cases.length} snap`,
  `${policy.verdict.length} verdicts`,
  `${policy.texture.length} textures`,
  `${sousvide.cases.length} sous-vide`,
  `${sousVideCopy.duration.length + sousVideCopy.startPhrase.length} sous-vide copy`,
  `${copy.render.length} copy renders`,
  `${copy.plural.length} plural rules`,
  `${copy.probe.cases.length} copy probes`,
  `${recordFixture.cases.length} records`,
  `${recordFixture.replay.log.length} replayed eggs`,
];
console.log(`fixtures/*.json written: ${counts.join(', ')}`);
