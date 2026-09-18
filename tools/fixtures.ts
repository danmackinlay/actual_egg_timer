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
 *                           grid's geometry, the bounds and the defaults. These
 *                           used to be transliterated by hand in both apps
 */

import { writeFileSync, mkdirSync } from 'node:fs';

import {
  MODE_COUNT, ALPHA_DEFAULT, ALPHA_REL_SD, YOLK_RADIUS_FRAC, Z_YOLK, TREF_YOLK_C, Z_WHITE,
  TREF_WHITE_C, H_EFF, K_EGG, RAMP_R, TAU_STANDING_SCALE, TAU_AIR, T_ICE_BATH_C,
  T_COLD_TAP_C, T_ROOM_C, TAU_PLUNGE, TAU_DIP_RECOVERY, C_WATER, C_EGG, RHO_EGG,
  EGG_VOLUME_COEFF, EGG_LENGTH_RATIO, DT_SIM, CARRYOVER_WINDOW,
} from '../src/core/constants.js';
import {
  eggFromMass, eggFromMinorDiameter, diffusionTime, eggVolumeFromMinorDiameter,
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
  Feedback, FEEDBACK_BAND, createPrior, updatePosterior, posteriorParams,
  posteriorMeanOffset, posteriorAlphaRelSd, predictCookTime, effectiveSampleSize,
} from '../src/core/infer.js';
import {
  createSphere, stepSphere, temperatureAt, centreTemperature, meanTemperature,
  seriesTheta, erfcTheta, oneTermTheta, biotNumber, erfc,
} from '../src/core/sphere.js';
import { CookSetup } from '../src/core/protocol.js';
import {
  simulate, solveCookTime, donenessFromSlider, DEFAULT_PARAMS, Solution,
} from '../src/core/solve.js';
import {
  LIMITS, SLIDER_STEPS, PARTICLE_COUNT as POLICY_PARTICLES, CALIBRATION_SEED,
  DEFAULTS, DEFAULT_EGG_MASS_KG, DEFAULT_TIME_TO_BOIL_S, START_TEMP_PRESETS_C,
  BoilMemory, COOLING_SECONDS, PULL_GRACE_SECONDS, ambientFor, anchorNear,
  calibrationGrid, estimateTimeToBoil, phaseAt, rememberBoil, snapDown, snapUp,
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
    TREF_WHITE_C, H_EFF, K_EGG, RAMP_R, TAU_STANDING_SCALE, TAU_AIR,
    T_ICE_BATH_C, T_COLD_TAP_C, T_ROOM_C, TAU_PLUNGE, TAU_DIP_RECOVERY,
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
  { name: 'standing, 4 min boil (white never sets)', setup: setupOf({ startMode: 'cold', afterBoil: 'off', timeToBoil_s: 240 }), level: 0.41 },
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
const FEEDBACK_SEQUENCE: Feedback[] = [-1, -1, 0, 1, 0, -1, -1];

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

const COOK_TIMES_S = [420, 450, 470, 500, 480, 460, 440];
const updates = FEEDBACK_SEQUENCE.map((feedback, i) => {
  const cookTime_s = COOK_TIMES_S[i];
  updatePosterior(posterior, CALIB_GRID, cookTime_s, NOMINAL_TARGET, feedback);
  return {
    cookTime_s: cookTime_s,
    logNominalTarget: round(NOMINAL_TARGET),
    feedback: feedback,
    after: readout(posterior),
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

const policy = {
  slider: {
    steps: SLIDER_STEPS,
    cases: SNAP_LEVELS.map((level) => ({
      level: round(level),
      snapUp: round(snapUp(level)),
      snapDown: round(snapDown(level)),
      anchor: anchorNear(level).label,
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
      wanted: v.wanted.label,
      limit: v.limit.label,
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

/* ------------------------------------------------------------------ write */

mkdirSync('fixtures', { recursive: true });
writeFileSync('fixtures/core.json', `${JSON.stringify(core, null, 2)}\n`);
writeFileSync('fixtures/scenarios.json', `${JSON.stringify(scenarios, null, 2)}\n`);
writeFileSync('fixtures/calibration.json', `${JSON.stringify(calibration, null, 2)}\n`);
writeFileSync('fixtures/policy.json', `${JSON.stringify(policy, null, 2)}\n`);

const counts = [
  `${core.sphere.seriesTheta.length} seriesTheta`,
  `${core.sphere.stepResponse.length} step samples`,
  `${core.sphere.rampResponse.length} ramp samples`,
  `${core.geometry.fromMass.length + core.geometry.fromMinorDiameter.length} geometry`,
  `${core.thermo.boilingPointAtAltitude.length} altitudes`,
  `${scenarios.cases.length} scenarios`,
  `${calibration.grid.logYolk.length} grid cells`,
  `${calibration.updates.length} calibration updates`,
  `${policy.slider.cases.length} snap`,
  `${policy.verdict.length} verdicts`,
  `${policy.texture.length} textures`,
];
console.log(`fixtures/*.json written: ${counts.join(', ')}`);
