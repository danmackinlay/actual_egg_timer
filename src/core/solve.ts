/**
 * Putting it together: simulate a cook, and invert for the cook time that hits
 * a doneness target.
 */

import {
  ALPHA_DEFAULT, YOLK_RADIUS_FRAC, Z_YOLK, TREF_YOLK_C, Z_WHITE, TREF_WHITE_C,
  DT_SIM, CARRYOVER_WINDOW,
} from './constants.js';
import { Egg } from './geometry.js';
import { CookSetup, surfaceTemperature, initialSurfaceTemperature } from './protocol.js';
import {
  createSphere, stepSphere, temperatureAt, centreTemperature, meanTemperature,
} from './sphere.js';
import { Dose, createDose, accumulateDose } from './kinetics.js';

/** The calibratable parameters. Everything else is fixed physics. */
export interface ModelParams {
  /** Thermal diffusivity, m^2/s. Absorbs all geometry/property model error,
   *  since only tau = R^2/alpha is identifiable. */
  alpha_m2s: number;
  /** Multiplier on the still-air cooling time constant. Only identifiable if
   *  the user actually varies the cooling protocol. */
  tauAirScale: number;
}

export const DEFAULT_PARAMS: ModelParams = {
  alpha_m2s: ALPHA_DEFAULT,
  tauAirScale: 1.0,
};

/** Dose target for the white, equivalent minutes at 80 C. The binding white
 *  constraint is at the yolk boundary - the innermost white is the last to
 *  set, which is exactly the radius Williams' 0.76 encodes.
 *
 *  Calibrated so the shortest white-setting cook is ~5.8 min for a fridge-cold
 *  large egg dropped into boiling water, giving a peak inner-white temperature
 *  near 74 C. That is genuinely set but still tender: ovotransferrin (62 C) and
 *  lysozyme (~70 C) have denatured, ovalbumin (80 C) has not. Demanding full
 *  ovalbumin set instead would forbid the classic soft-boiled egg, which
 *  plainly exists. */
export const WHITE_DOSE_TARGET = 0.05;

/** Yolk dose targets at the ends of the slider, equivalent minutes at 63 C.
 *  Interpolated logarithmically, which - because dose goes as 10^(T/z) - is
 *  equivalent to interpolating PEAK YOLK TEMPERATURE linearly. So the slider is
 *  perceptually even, spanning roughly 56 C (runny) to 77 C (hard). */
export const YOLK_DOSE_RUNNY = 0.05;
export const YOLK_DOSE_HARD = 2000.0;

export interface Doneness {
  /** Slider position in [0, 1]: 0 = runny, 1 = hard. */
  level: number;
  yolkDose_min: number;
  whiteDose_min: number;
}

/** Map the single slider to a yolk dose target. */
export function donenessFromSlider(level: number): Doneness {
  const clamped = level < 0.0 ? 0.0 : level > 1.0 ? 1.0 : level;
  const lo = Math.log10(YOLK_DOSE_RUNNY);
  const hi = Math.log10(YOLK_DOSE_HARD);
  return {
    level: clamped,
    yolkDose_min: Math.pow(10.0, lo + (hi - lo) * clamped),
    whiteDose_min: WHITE_DOSE_TARGET,
  };
}

/** Inverse of the above - which slider position corresponds to a given dose. */
export function sliderFromYolkDose(yolkDose_min: number): number {
  const lo = Math.log10(YOLK_DOSE_RUNNY);
  const hi = Math.log10(YOLK_DOSE_HARD);
  const level = (Math.log10(yolkDose_min) - lo) / (hi - lo);
  return level < 0.0 ? 0.0 : level > 1.0 ? 1.0 : level;
}

/** Slider positions worth labelling, for the UI. Positions follow from the
 *  dose scale above; the temperatures are what the model actually predicts. */
export interface DonenessAnchor {
  label: string;
  level: number;
  approxPeakYolk_C: number;
}

export const DONENESS_ANCHORS: DonenessAnchor[] = [
  { label: 'Runny', level: 0.00, approxPeakYolk_C: 56 },
  { label: 'Soft', level: 0.22, approxPeakYolk_C: 61 },
  { label: 'Jammy', level: 0.41, approxPeakYolk_C: 65 },
  { label: 'Fudgy', level: 0.62, approxPeakYolk_C: 70 },
  { label: 'Hard', level: 1.00, approxPeakYolk_C: 77 },
];

export interface CookResult {
  cookTime_s: number;
  /** Highest temperature the yolk centre ever reaches, including carryover. */
  peakYolk_C: number;
  peakYolkTime_s: number;
  /** Yolk centre temperature at the moment the egg leaves the water. */
  yolkAtPull_C: number;
  yolkDose_min: number;
  whiteDose_min: number;
  peakWhite_C: number;
}

/** Run one cook and report what it does to the egg. */
export function simulate(
  egg: Egg, setup: CookSetup, params: ModelParams, cookTime_s: number,
): CookResult {
  const sphere = createSphere(
    egg.radius_m, params.alpha_m2s, setup.eggStart_C, initialSurfaceTemperature(setup),
  );
  const yolkDose: Dose = createDose(Z_YOLK, TREF_YOLK_C);
  const whiteDose: Dose = createDose(Z_WHITE, TREF_WHITE_C);

  let t = 0.0;
  let peakYolk = setup.eggStart_C;
  let peakYolkTime = 0.0;
  let peakWhite = setup.eggStart_C;
  let yolkAtPull = setup.eggStart_C;
  let pullRecorded = false;
  let prevYolk = setup.eggStart_C;
  let peakDoseRate = 0.0;
  // Captured when the egg leaves the water: a lumped egg in air relaxes from
  // its own volume-average temperature, which is also the ceiling on carryover.
  let meanAtPull = setup.eggStart_C;
  let waterAtPull = initialSurfaceTemperature(setup);

  const endTime = cookTime_s + CARRYOVER_WINDOW;
  while (t < endTime) {
    if (!pullRecorded && t + DT_SIM >= cookTime_s) {
      meanAtPull = meanTemperature(sphere);
      waterAtPull = sphere.surface_C;
    }
    const next = surfaceTemperature(
      setup, t + DT_SIM, cookTime_s, params.tauAirScale, meanAtPull, waterAtPull,
    );
    stepSphere(sphere, DT_SIM, next);
    t += DT_SIM;

    const yolkCentre = centreTemperature(sphere);
    const whiteInner = temperatureAt(sphere, YOLK_RADIUS_FRAC);
    accumulateDose(yolkDose, yolkCentre, DT_SIM);
    accumulateDose(whiteDose, whiteInner, DT_SIM);

    if (yolkCentre > peakYolk) {
      peakYolk = yolkCentre;
      peakYolkTime = t;
    }
    if (whiteInner > peakWhite) peakWhite = whiteInner;
    if (!pullRecorded && t >= cookTime_s) {
      yolkAtPull = yolkCentre;
      pullRecorded = true;
    }

    // Stop once the egg is past its peak and cooling, and the remaining dose
    // rate is a millionth of the peak rate - further integration cannot change
    // the answer. Because z ~ 4.65 K the rate collapses fast, so this typically
    // cuts an ice-bath simulation in half.
    const rate = Math.pow(10.0, (yolkCentre - TREF_YOLK_C) / Z_YOLK);
    if (rate > peakDoseRate) peakDoseRate = rate;
    if (t > cookTime_s && yolkCentre < prevYolk && rate < 1e-6 * peakDoseRate) break;
    prevYolk = yolkCentre;
  }

  return {
    cookTime_s: cookTime_s,
    peakYolk_C: peakYolk,
    peakYolkTime_s: peakYolkTime,
    yolkAtPull_C: yolkAtPull,
    yolkDose_min: yolkDose.minutes,
    whiteDose_min: whiteDose.minutes,
    peakWhite_C: peakWhite,
  };
}

const SOLVE_LO_S = 20.0;
const SOLVE_HI_S = 3600.0;
const SOLVE_TOL_S = 1.0;

/** Bisect for the cook time at which `metric` reaches `target`. Both doses are
 *  monotonically increasing in cook time, so bisection is safe. */
function bisect(
  egg: Egg, setup: CookSetup, params: ModelParams,
  target: number, metric: (r: CookResult) => number,
): number {
  let lo = SOLVE_LO_S;
  let hi = SOLVE_HI_S;
  while (hi - lo > SOLVE_TOL_S) {
    const mid = 0.5 * (lo + hi);
    if (metric(simulate(egg, setup, params, mid)) < target) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export interface Solution {
  result: CookResult;
  /** False when the requested yolk doneness cannot be reached without leaving
   *  the white undercooked - the classic case being a rested egg, where
   *  carryover drives the yolk past soft no matter how short the cook. */
  reachable: boolean;
  /** Shortest cook that still sets the white. */
  minCookTime_s: number;
  /** Softest yolk doneness achievable with this setup, as a slider position. */
  softestLevel: number;
}

/** Solve for the cook time that delivers the requested doneness. */
export function solveCookTime(
  egg: Egg, setup: CookSetup, params: ModelParams, doneness: Doneness,
): Solution {
  const minCook = bisect(egg, setup, params, doneness.whiteDose_min, (r) => r.whiteDose_min);
  const atMin = simulate(egg, setup, params, minCook);
  const softestLevel = sliderFromYolkDose(atMin.yolkDose_min);

  if (atMin.yolkDose_min >= doneness.yolkDose_min) {
    // Even the shortest white-setting cook overcooks the yolk past the target.
    return {
      result: atMin, reachable: false,
      minCookTime_s: minCook, softestLevel: softestLevel,
    };
  }
  const cook = bisect(egg, setup, params, doneness.yolkDose_min, (r) => r.yolkDose_min);
  return {
    result: simulate(egg, setup, params, cook), reachable: true,
    minCookTime_s: minCook, softestLevel: softestLevel,
  };
}
