/**
 * Cached dose surface, so Bayesian calibration is fast enough to run in a UI.
 *
 * The particle filter needs the delivered dose for every particle at the cook
 * time actually used. Calling simulate() per particle costs ~1.9 ms, so 2000
 * particles is ~3.4 s - far too slow. Precomputing log10(dose) on a grid over
 * (alpha, cook time) and interpolating bilinearly turns each particle lookup
 * into a handful of flops.
 *
 * Log dose rather than dose: it spans four orders of magnitude over three
 * minutes of cooking (z ~ 4.65 K makes the kinetics very sharp), so linear
 * interpolation of the raw value would be hopeless. In log space the surface is
 * close to linear, because log10(dose) is roughly T/z and T is smooth.
 */

import { Egg } from './geometry.js';
import { CookSetup } from './protocol.js';
import { simulate } from './solve.js';

export interface DoseGrid {
  logAlphaMin: number;
  logAlphaStep: number;
  alphaCount: number;
  timeMin_s: number;
  timeStep_s: number;
  timeCount: number;
  /** log10 equivalent-minutes, row-major [alphaIndex * timeCount + timeIndex]. */
  logYolk: number[];
  logWhite: number[];
}

const LOG_FLOOR = -12.0;

function safeLog10(v: number): number {
  return v <= 1e-12 ? LOG_FLOOR : Math.log10(v);
}

/** Build the surface. Cost is alphaCount * timeCount simulations, so ~1.5 s at
 *  the default 21 x 36. Rebuild only when the egg, setup or tauAirScale change,
 *  never on every keystroke. */
export function buildDoseGrid(
  egg: Egg, setup: CookSetup, tauAirScale: number,
  alphaMin: number, alphaMax: number, alphaCount: number,
  timeMin_s: number, timeMax_s: number, timeCount: number,
): DoseGrid {
  const logAlphaMin = Math.log(alphaMin);
  const logAlphaStep = (Math.log(alphaMax) - logAlphaMin) / (alphaCount - 1);
  const timeStep = (timeMax_s - timeMin_s) / (timeCount - 1);
  const logYolk: number[] = new Array<number>(alphaCount * timeCount);
  const logWhite: number[] = new Array<number>(alphaCount * timeCount);

  for (let ai = 0; ai < alphaCount; ai++) {
    const alpha = Math.exp(logAlphaMin + logAlphaStep * ai);
    for (let ti = 0; ti < timeCount; ti++) {
      const cook = timeMin_s + timeStep * ti;
      const r = simulate(egg, setup, { alpha_m2s: alpha, tauAirScale: tauAirScale }, cook);
      logYolk[ai * timeCount + ti] = safeLog10(r.yolkDose_min);
      logWhite[ai * timeCount + ti] = safeLog10(r.whiteDose_min);
    }
  }
  return {
    logAlphaMin: logAlphaMin, logAlphaStep: logAlphaStep, alphaCount: alphaCount,
    timeMin_s: timeMin_s, timeStep_s: timeStep, timeCount: timeCount,
    logYolk: logYolk, logWhite: logWhite,
  };
}

function interpolate(
  table: number[], g: DoseGrid, alpha_m2s: number, cookTime_s: number,
): number {
  let a = (Math.log(alpha_m2s) - g.logAlphaMin) / g.logAlphaStep;
  let t = (cookTime_s - g.timeMin_s) / g.timeStep_s;
  if (a < 0.0) a = 0.0;
  if (a > g.alphaCount - 1) a = g.alphaCount - 1;
  if (t < 0.0) t = 0.0;
  if (t > g.timeCount - 1) t = g.timeCount - 1;

  const ai = Math.min(Math.floor(a), g.alphaCount - 2);
  const ti = Math.min(Math.floor(t), g.timeCount - 2);
  const fa = a - ai;
  const ft = t - ti;

  const v00 = table[ai * g.timeCount + ti];
  const v01 = table[ai * g.timeCount + ti + 1];
  const v10 = table[(ai + 1) * g.timeCount + ti];
  const v11 = table[(ai + 1) * g.timeCount + ti + 1];
  return v00 * (1 - fa) * (1 - ft) + v10 * fa * (1 - ft)
       + v01 * (1 - fa) * ft + v11 * fa * ft;
}

/** log10 of the yolk dose delivered, equivalent minutes at 63 C. */
export function lookupLogYolkDose(g: DoseGrid, alpha_m2s: number, cookTime_s: number): number {
  return interpolate(g.logYolk, g, alpha_m2s, cookTime_s);
}

/** log10 of the white dose delivered, equivalent minutes at 80 C. */
export function lookupLogWhiteDose(g: DoseGrid, alpha_m2s: number, cookTime_s: number): number {
  return interpolate(g.logWhite, g, alpha_m2s, cookTime_s);
}

/** Invert the surface: the cook time delivering a given log10 yolk dose.
 *  Dose is monotonic in cook time, so bisection on the interpolant is safe. */
export function cookTimeForLogYolkDose(
  g: DoseGrid, alpha_m2s: number, logDose: number,
): number {
  let lo = g.timeMin_s;
  let hi = g.timeMin_s + g.timeStep_s * (g.timeCount - 1);
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    if (lookupLogYolkDose(g, alpha_m2s, mid) < logDose) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}
