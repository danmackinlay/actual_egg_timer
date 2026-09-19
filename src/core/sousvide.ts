/**
 * The isothermal limit: put the egg into a bath already at the target
 * temperature and wait.
 *
 * This needs no integration. The centre equilibrates on the sphere's own
 * timescale, and everything after that accumulates dose at a single constant
 * rate, so `holdTimeForDose` answers it directly. Two hold times come out, and
 * the interesting one is not the yolk's.
 *
 * READ THIS BEFORE BELIEVING THE OUTPUT. The model behind it is conduction
 * only. Below about 60 C the albumen never sets, stays liquid, and convects:
 * Denys et al. (2004) measure buoyancy-driven flow in liquid albumen strong
 * enough to move the cold spot, and Vega & Mercade-Prieto (2011) need
 * alpha > 2e-7 m^2/s to fit a 6X C cook with a conduction model. So
 * `equilibrate_s` below is too long, probably by a lot.
 *
 * The HOLD times are unaffected by any of that — they depend only on the bath
 * temperature and the dose targets — and they are the numbers that make the
 * answer what it is.
 */

import { Z_YOLK, TREF_YOLK_C, Z_WHITE, TREF_WHITE_C } from './constants.js';
import { createDose, holdTimeForDose } from './kinetics.js';
import { seriesTheta } from './sphere.js';

/** The bath temperature the app offers. 58 C is squarely inside the range the
 *  low-temperature literature argues about, which is the point. */
export const SOUS_VIDE_BATH_C = 58.0;

/** How close the centre must come to the bath before it counts as "at
 *  temperature": within 2% of the original gap. */
const EQUILIBRATION_GAP = 0.02;

export interface SousVideEstimate {
  bath_C: number;
  /** Time for the yolk centre to reach the bath temperature. */
  equilibrate_s: number;
  /** Hold at the bath temperature that the yolk dose target needs. */
  yolkHold_s: number;
  /** Hold that the white dose target needs. Usually the binding one, and
   *  usually by a factor of tens. */
  whiteHold_s: number;
  /** Equilibration plus whichever hold binds. */
  total_s: number;
  /** True when the white is what makes the answer absurd. */
  whiteBound: boolean;
}

/** Seconds for the centre of a sphere to close all but EQUILIBRATION_GAP of a
 *  step change at its surface. Bisection on the Fourier number. */
export function equilibrationTime(radius_m: number, alpha_m2s: number): number {
  let lo = 1e-4;
  let hi = 4.0;
  for (let i = 0; i < 120; i++) {
    const mid = 0.5 * (lo + hi);
    if (seriesTheta(0.0, mid) > EQUILIBRATION_GAP) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi) * radius_m * radius_m / alpha_m2s;
}

export function sousVideEstimate(
  radius_m: number,
  alpha_m2s: number,
  bath_C: number,
  yolkDose_min: number,
  whiteDose_min: number,
): SousVideEstimate {
  const equilibrate_s = equilibrationTime(radius_m, alpha_m2s);
  const yolkHold_s = holdTimeForDose(createDose(Z_YOLK, TREF_YOLK_C), yolkDose_min, bath_C) * 60;
  const whiteHold_s = holdTimeForDose(createDose(Z_WHITE, TREF_WHITE_C), whiteDose_min, bath_C) * 60;
  const bound_s = yolkHold_s > whiteHold_s ? yolkHold_s : whiteHold_s;
  return {
    bath_C: bath_C,
    equilibrate_s: equilibrate_s,
    yolkHold_s: yolkHold_s,
    whiteHold_s: whiteHold_s,
    total_s: equilibrate_s + bound_s,
    whiteBound: whiteHold_s >= yolkHold_s,
  };
}

/* ------------------------------------------------------------ the units */

/*
 * Two formatters, here rather than in the apps, and the distinction is worth
 * stating because this file is otherwise physics.
 *
 * These are not sentences. They are UNIT CHOICES - when minutes stop being a
 * useful unit and become hours, when hours become days, when a date stops being
 * a weekday and becomes "N weeks ago". Both apps have to bucket an estimate
 * identically or the same number reads differently on each, which is precisely
 * what happened: they were transliterated by hand and at a 58 C bath only two of
 * the six branches below are ever reached, so four of them were ported and never
 * once executed in either language.
 *
 * The words are here because a number and its unit are one thing. Splitting
 * "22 h 43 min" across two languages is the mistake, not the fix.
 */

/** "45 min", "22 h 43 min", "3 days", "5 weeks". Minutes and seconds stop being
 *  a useful unit somewhere around the point this app stops being useful. */
export function formatLongDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} days`;
  return `${Math.round(days / 7)} weeks`;
}

/**
 * How long ago the cook should have started, in words: "Today", "Yesterday",
 * "Last Tuesday", "Last week", "3 weeks ago", "4 months ago".
 *
 * Takes the day count and the weekday NAME rather than a date, so it is pure and
 * so the calendar arithmetic stays where it belongs. Counting whole days across
 * a local midnight is a platform job - `Calendar` does it correctly on iOS, and
 * the web normalises to midnight and divides - and neither should be reimplemented
 * here. Passing the weekday in also makes the one real difference between the
 * apps visible instead of hidden: iOS reads it from a locale-aware formatter and
 * the web from an English table, so a non-English phone says "Last mardi". That
 * is the better answer on iOS, and it is now a deliberate difference rather than
 * an accident.
 */
export function startPhrase(daysAgo: number, weekday: string): string {
  if (daysAgo <= 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo < 7) return `Last ${weekday}`;
  if (daysAgo < 14) return 'Last week';
  if (daysAgo < 60) return `${Math.round(daysAgo / 7)} weeks ago`;
  return `${Math.round(daysAgo / 30)} months ago`;
}
