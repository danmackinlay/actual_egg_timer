/**
 * Bridges the particle filter in src/core/infer.ts to the app.
 *
 * The model's constants come from the literature, and the carryover term has no
 * published measurement behind it at all. Rather than pretend otherwise, the app
 * asks how each egg turned out and folds the answer into a posterior. After
 * about three eggs the suggested time stops moving.
 *
 * The dose grid costs ~1.8 s to build, which is far too slow to sit in the
 * render path - so it is built once per logged outcome, not per keystroke.
 */

import { Egg } from '../core/geometry.js';
import { CookSetup } from '../core/protocol.js';
import { ModelParams, DEFAULT_PARAMS } from '../core/solve.js';
import { buildDoseGrid } from '../core/doseGrid.js';
import {
  Posterior, Feedback, createPrior, updatePosterior,
  posteriorParams, posteriorAlphaRelSd,
} from '../core/infer.js';

const KEY = 'aet.calibration.v1';
const PARTICLES = 1000;
const SEED = 0x5eed1e;

export interface Calibration {
  posterior: Posterior;
  eggsLogged: number;
}

export function freshCalibration(): Calibration {
  return { posterior: createPrior(PARTICLES, SEED), eggsLogged: 0 };
}

/** Parameters to solve with. Before any feedback this is the prior mean, which
 *  is identical to shipping the literature values - so the app is fully useful
 *  on day one and calibration is purely additive. */
export function calibrationParams(c: Calibration): ModelParams {
  if (c.eggsLogged === 0) return DEFAULT_PARAMS;
  return posteriorParams(c.posterior);
}

/** Spread of the posterior on alpha, as a percentage. Plateaus near 3%: ordinal
 *  feedback carries 1-2 bits per egg, so learning correctly stops rather than
 *  falsely converging. */
export function calibrationSpread(c: Calibration): number {
  if (c.eggsLogged === 0) return 0;
  return 100 * posteriorAlphaRelSd(c.posterior);
}

/**
 * Fold in one outcome. Builds the dose surface for the cook that was actually
 * performed, then reweights. Synchronous and slow (~2 s) by design: it happens
 * once, after the egg is eaten, never while the user is adjusting anything.
 */
export function recordOutcome(
  c: Calibration, egg: Egg, setup: CookSetup,
  cookTime_s: number, logNominalTarget: number, feedback: Feedback,
): void {
  const centre = calibrationParams(c).alpha_m2s;
  const grid = buildDoseGrid(
    egg, setup, calibrationParams(c).tauAirScale,
    centre * 0.55, centre * 1.8, 21,
    Math.max(60, cookTime_s * 0.35), cookTime_s * 2.4, 32,
  );
  updatePosterior(c.posterior, grid, cookTime_s, logNominalTarget, feedback);
  c.eggsLogged += 1;
}

/* ------------------------------------------------------------- persistence */

interface StoredCalibration {
  v: 1;
  n: number;
  a: number[];
  o: number[];
  t: number[];
  w: number[];
  rng: number;
}

export function saveCalibration(c: Calibration): void {
  try {
    const p = c.posterior.particles;
    const stored: StoredCalibration = {
      v: 1, n: c.eggsLogged, rng: c.posterior.rng,
      a: [], o: [], t: [], w: [],
    };
    for (let i = 0; i < p.length; i++) {
      stored.a.push(Number(p[i].alpha_m2s.toPrecision(7)));
      stored.o.push(Number(p[i].logDoseOffset.toPrecision(5)));
      stored.t.push(Number(p[i].tauAirScale.toPrecision(5)));
      stored.w.push(Number(c.posterior.weights[i].toPrecision(5)));
    }
    window.localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Private browsing, quota, or no storage at all. Calibration is a
    // convenience; the app must work without it.
  }
}

export function loadCalibration(): Calibration {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return freshCalibration();
    const s = JSON.parse(raw) as StoredCalibration;
    if (s.v !== 1 || !Array.isArray(s.a) || s.a.length === 0) return freshCalibration();
    const base = createPrior(s.a.length, SEED);
    for (let i = 0; i < s.a.length; i++) {
      base.particles[i] = {
        alpha_m2s: s.a[i], logDoseOffset: s.o[i], tauAirScale: s.t[i],
      };
      base.weights[i] = s.w[i];
    }
    base.rng = s.rng;
    return { posterior: base, eggsLogged: s.n };
  } catch {
    return freshCalibration();
  }
}

export function clearCalibration(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
