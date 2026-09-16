/**
 * Putting it together: simulate a cook, and invert for the cook time that hits
 * a doneness target.
 */

import {
  ALPHA_DEFAULT, YOLK_RADIUS_FRAC, Z_YOLK, TREF_YOLK_C, Z_WHITE, TREF_WHITE_C,
  DT_SIM, CARRYOVER_WINDOW,
} from './constants.js';
import { Egg } from './geometry.js';
import {
  CookSetup, bathTemperature, coolingTemperature, initialSurfaceTemperature,
} from './protocol.js';
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
  const initialSurface = initialSurfaceTemperature(setup);
  const sphere = createSphere(egg.radius_m, params.alpha_m2s, setup.eggStart_C, initialSurface);
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
  let waterAtPull = initialSurface;

  const endTime = cookTime_s + CARRYOVER_WINDOW;
  while (t < endTime) {
    const tNext = t + DT_SIM;
    let next: number;
    if (tNext < cookTime_s) {
      next = bathTemperature(setup, tNext);
    } else {
      if (!pullRecorded) {
        meanAtPull = meanTemperature(sphere);
        waterAtPull = sphere.surface_C;
      }
      next = coolingTemperature(
        setup, tNext - cookTime_s, waterAtPull, meanAtPull, params.tauAirScale,
      );
    }
    stepSphere(sphere, DT_SIM, next);
    t = tNext;

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

/* ------------------------------------------------------------------ search */

const SOLVE_LO_S = 20.0;
const SOLVE_HI_S = 3600.0;
const SOLVE_TOL_S = 1.0;

/** Which dose a search is looking at. */
type Metric = (r: CookResult) => number;

function yolkOf(r: CookResult): number { return r.yolkDose_min; }
function whiteOf(r: CookResult): number { return r.whiteDose_min; }

/** Cook time in [lo, hi] at which `metric` first reaches `target`, assuming
 *  the metric is monotonic across that bracket. Returns the upper end of the
 *  final bracket: the shortest cook KNOWN to meet the target, to within
 *  SOLVE_TOL_S. The midpoint would be as accurate, but could sit a hair short
 *  of the target, and callers compare the dose at the answer against it. */
function bisectBetween(
  egg: Egg, setup: CookSetup, params: ModelParams,
  target: number, metric: Metric, lo_s: number, hi_s: number,
): number {
  let lo = lo_s;
  let hi = hi_s;
  while (hi - lo > SOLVE_TOL_S) {
    const mid = 0.5 * (lo + hi);
    if (metric(simulate(egg, setup, params, mid)) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Bisect the whole search range. Both doses are monotonically increasing in
 *  cook time while the water is held at the boil (test 16a pins this), so
 *  bisection is exact there. See solveStanding for what happens when the heat
 *  goes off. */
function bisect(
  egg: Egg, setup: CookSetup, params: ModelParams, target: number, metric: Metric,
): number {
  return bisectBetween(egg, setup, params, target, metric, SOLVE_LO_S, SOLVE_HI_S);
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
  /** Hardest yolk doneness achievable, as a slider position. 1 whenever the
   *  water stays at the boil; less than 1 when the heat is off and the pan
   *  runs out of heat before the yolk gets there. */
  hardestLevel: number;
  /** False when the white never sets at all - only possible with the heat off,
   *  where the water can fall past the white's own target while the egg is
   *  still in it. There is no cook time to offer in that case, only the
   *  furthest this pan goes. */
  whiteSets: boolean;
}

function solutionOf(
  result: CookResult, reachable: boolean, minCookTime_s: number,
  softestLevel: number, hardestLevel: number, whiteSets: boolean,
): Solution {
  return {
    result: result, reachable: reachable, minCookTime_s: minCookTime_s,
    softestLevel: softestLevel, hardestLevel: hardestLevel, whiteSets: whiteSets,
  };
}

/** Solve for the cook time that delivers the requested doneness. */
export function solveCookTime(
  egg: Egg, setup: CookSetup, params: ModelParams, doneness: Doneness,
): Solution {
  if (setup.afterBoil === 'off') return solveStanding(egg, setup, params, doneness);

  const minCook = bisect(egg, setup, params, doneness.whiteDose_min, whiteOf);
  const atMin = simulate(egg, setup, params, minCook);
  const softestLevel = sliderFromYolkDose(atMin.yolkDose_min);
  const whiteSets = atMin.whiteDose_min >= doneness.whiteDose_min;

  if (atMin.yolkDose_min >= doneness.yolkDose_min) {
    // Even the shortest white-setting cook overcooks the yolk past the target.
    return solutionOf(atMin, false, minCook, softestLevel, 1.0, whiteSets);
  }

  const cook = bisect(egg, setup, params, doneness.yolkDose_min, yolkOf);
  return solutionOf(
    simulate(egg, setup, params, cook), true, minCook, softestLevel, 1.0, whiteSets,
  );
}

/* --------------------------------------------------------------- standing */

/** Fraction of the best available dose that counts as "as far as this pan
 *  goes". The maximum sits on a plateau - the last per cent of the dose can
 *  take another quarter of an hour and change the yolk by a tenth of a degree -
 *  so the time worth printing is the start of that plateau, not its peak. */
const STANDING_KNEE = 0.99;

/** How long past the boil it is worth looking, with the heat off. The water is
 *  falling; half an hour after the burner dies there is nothing left to give,
 *  and a longer search only costs simulations. */
const STANDING_HORIZON_S = 1800.0;

/** Coarse step for the standing scan, seconds. Fine enough that the bracket it
 *  hands to the bisection is locally monotonic; coarse enough to keep the scan
 *  to a few dozen simulations. */
const SCAN_STEP_S = 30.0;

/** Both doses sampled at every scan step, from the shortest cook to the
 *  horizon. One pass answers every question the standing solver has. */
interface DoseCurve {
  times_s: number[];
  yolk: number[];
  white: number[];
}

function scanStanding(
  egg: Egg, setup: CookSetup, params: ModelParams, horizon_s: number,
): DoseCurve {
  const times: number[] = [];
  const yolk: number[] = [];
  const white: number[] = [];
  for (let t = SOLVE_LO_S; t <= horizon_s; t += SCAN_STEP_S) {
    const r = simulate(egg, setup, params, t);
    times.push(t);
    yolk.push(r.yolkDose_min);
    white.push(r.whiteDose_min);
  }
  return { times_s: times, yolk: yolk, white: white };
}

/** Index of the largest sample. The curve is never empty: the horizon is at
 *  least STANDING_HORIZON_S past a non-negative time to boil. */
function indexOfMax(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[best]) best = i;
  }
  return best;
}

/**
 * First cook time at which a sampled dose reaches `target`, WITHOUT assuming
 * monotonicity - or -1 if it never does.
 *
 * Held at the boil, a longer cook always means more dose, and `bisect` is
 * exact. With the heat off that is false: pulling later means pulling from
 * cooler water, so the carryover that follows is smaller, and past a certain
 * point the total dose FALLS with a longer cook. Bisection on a non-monotonic
 * function does not merely lose accuracy - it lands anywhere, which showed up
 * as cook times jumping between 3 and 13 minutes for a 5 C change in room
 * temperature.
 *
 * So: walk the samples until the target is first met, then bisect inside that
 * one step, where the function is still rising.
 */
function firstCrossing(
  egg: Egg, setup: CookSetup, params: ModelParams,
  curve: DoseCurve, values: number[], target: number, metric: Metric,
): number {
  for (let i = 0; i < values.length; i++) {
    if (values[i] < target) continue;
    if (i === 0) return curve.times_s[0];
    return bisectBetween(
      egg, setup, params, target, metric, curve.times_s[i - 1], curve.times_s[i],
    );
  }
  return -1.0;
}

/**
 * The same question with the heat off, where neither dose is monotonic in cook
 * time and every shortcut above stops being valid.
 *
 * Scanning is unavoidable, but it is bounded: the water is falling, so past
 * roughly half an hour of standing nothing changes at all, and there is no
 * point looking further. The scan runs to the horizon regardless of where the
 * target is crossed, so `hardestLevel` is the true ceiling of this pan and
 * not merely "at least what was asked".
 */
function solveStanding(
  egg: Egg, setup: CookSetup, params: ModelParams, doneness: Doneness,
): Solution {
  const curve = scanStanding(egg, setup, params, setup.timeToBoil_s + STANDING_HORIZON_S);
  const whiteCook = firstCrossing(
    egg, setup, params, curve, curve.white, doneness.whiteDose_min, whiteOf,
  );
  const yolkCook = firstCrossing(
    egg, setup, params, curve, curve.yolk, doneness.yolkDose_min, yolkOf,
  );

  const peak = indexOfMax(curve.yolk);
  const maxDose = curve.yolk[peak];
  const maxAt = curve.times_s[peak];
  const hardestLevel = sliderFromYolkDose(maxDose);
  const whiteSets = whiteCook > 0;
  const minCook = whiteSets ? whiteCook : maxAt;
  const atMin = simulate(egg, setup, params, minCook);
  const softestLevel = sliderFromYolkDose(atMin.yolkDose_min);

  if (!whiteSets || yolkCook < 0) {
    // Either the water never gets the white where it needs to go, or it runs
    // out before the yolk does. Answer with the furthest this pan goes, rather
    // than with a time that does not deliver what was asked - but take the
    // START of the plateau, since waiting past it achieves nothing.
    const knee = firstCrossing(
      egg, setup, params, curve, curve.yolk, STANDING_KNEE * maxDose, yolkOf,
    );
    const at = knee > 0 ? knee : maxAt;
    return solutionOf(
      simulate(egg, setup, params, at), false, minCook, softestLevel, hardestLevel, whiteSets,
    );
  }

  if (atMin.yolkDose_min >= doneness.yolkDose_min) {
    return solutionOf(atMin, false, minCook, softestLevel, hardestLevel, whiteSets);
  }

  // Both constraints have to hold at the same pull, so take the later crossing.
  const cook = yolkCook > whiteCook ? yolkCook : whiteCook;
  return solutionOf(
    simulate(egg, setup, params, cook), true, minCook, softestLevel, hardestLevel, whiteSets,
  );
}
