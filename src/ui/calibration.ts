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
import { buildDoseGrid, DoseGrid } from '../core/doseGrid.js';
import {
  Particle, Posterior, Feedback, WhiteReport, createPrior, updatePosterior, updateWhite,
  posteriorParams, posteriorAlphaRelSd, shouldAskAboutWhite,
} from '../core/infer.js';
import { PARTICLE_COUNT, CALIBRATION_SEED, calibrationGrid } from '../core/policy.js';
import { readStorage, writeStorage, removeStorage } from './store.js';

const KEY = 'aet.calibration.v2';

/** The posterior this version replaces, deleted rather than read.
 *
 *  The shape did not change when the white channel landed - no particle gained a
 *  field - so a v1 record could have been loaded verbatim. It is dropped anyway,
 *  because of what is IN it: every observation in a v1 posterior was folded under
 *  a likelihood that attributed the white's behaviour to the yolk, and at least
 *  one real one is known to have been a white complaint recorded on the yolk axis.
 *  Carrying that forward would import a miscoded observation into a model that now
 *  has somewhere correct to put it. A fresh prior is the literature values, which
 *  is a worse starting point than a good posterior and a better one than a
 *  confidently wrong posterior. */
const SUPERSEDED_KEY = 'aet.calibration.v1';

export interface Calibration {
  posterior: Posterior;
  eggsLogged: number;
}

export function freshCalibration(): Calibration {
  return { posterior: createPrior(PARTICLE_COUNT, CALIBRATION_SEED), eggsLogged: 0 };
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

/** What folding one yolk answer leaves behind: the surface it was scored
 *  against, and whether the white is worth a second question. */
export interface Outcome {
  /** Kept so the white answer can be folded without paying for the grid twice.
   *  It is not persisted, so a reload drops a pending white question rather than
   *  rebuilding two seconds of arithmetic to ask again. */
  grid: DoseGrid;
  askWhite: boolean;
}

/**
 * Fold in one outcome. Builds the dose surface for the cook that was actually
 * performed, then reweights. Synchronous and slow (~2 s) by design: it happens
 * once, after the egg is eaten, never while the user is adjusting anything.
 */
export function recordOutcome(
  c: Calibration, egg: Egg, setup: CookSetup,
  cookTime_s: number, logNominalTarget: number, feedback: Feedback,
): Outcome {
  const params = calibrationParams(c);
  // The grid's extent decides what the filter can see, and therefore what the
  // posterior becomes. It is core policy precisely so that the iOS app cannot
  // learn something different from the same egg.
  const g = calibrationGrid(params.alpha_m2s, cookTime_s);
  const grid = buildDoseGrid(
    egg, setup, params.tauAirScale,
    g.alphaMin, g.alphaMax, g.alphaCount,
    g.timeMin_s, g.timeMax_s, g.timeCount,
  );
  updatePosterior(c.posterior, grid, cookTime_s, logNominalTarget, feedback);
  c.eggsLogged += 1;
  // Asked AFTER the fold, because the yolk answer has just moved alpha and so
  // moved the predicted white with it: the question should be decided against
  // everything currently known. Which of the two it is asked against does not
  // affect whether the selection is ignorable - both are functions of data
  // already in hand - but the later one is better informed.
  return { grid: grid, askWhite: shouldAskAboutWhite(c.posterior, grid, cookTime_s) };
}

/** Fold in the answer about the white of the same egg, against the surface the
 *  yolk answer was already scored on. The white is not a second egg, so
 *  `eggsLogged` does not move. */
export function recordWhite(
  c: Calibration, grid: DoseGrid, cookTime_s: number, white: WhiteReport,
): void {
  updateWhite(c.posterior, grid, cookTime_s, white);
}

/* ------------------------------------------------------------- persistence */

/** Column-wise and rounded: a thousand particles at full precision is ~90 KB
 *  of JSON, and nothing downstream can tell the difference at five figures. */
interface StoredCalibration {
  v: 2;
  n: number;
  a: number[];
  o: number[];
  t: number[];
  w: number[];
  rng: number;
}

export function saveCalibration(c: Calibration): void {
  const p = c.posterior.particles;
  const stored: StoredCalibration = {
    v: 2, n: c.eggsLogged, rng: c.posterior.rng,
    a: [], o: [], t: [], w: [],
  };
  for (let i = 0; i < p.length; i++) {
    stored.a.push(Number(p[i].alpha_m2s.toPrecision(7)));
    stored.o.push(Number(p[i].logDoseOffset.toPrecision(5)));
    stored.t.push(Number(p[i].tauAirScale.toPrecision(5)));
    stored.w.push(Number(c.posterior.weights[i].toPrecision(5)));
  }
  writeStorage(KEY, JSON.stringify(stored));
}

/** Finite, the right length, and - where `floor` says so - above it.
 *
 *  Finiteness alone is not enough, which is what the iOS loader knew and this
 *  one did not. A stored `alpha_m2s` of zero or below is perfectly finite, and
 *  it reaches `createSphere` as a Fourier number of zero: non-finite
 *  temperatures, hence non-finite doses, hence exactly the poisoned posterior
 *  the comment below promises to refuse. */
function numberArray(
  value: unknown, length: number, floor: number, strict: boolean,
): value is number[] {
  if (!Array.isArray(value) || value.length !== length) return false;
  for (let i = 0; i < length; i++) {
    const n: unknown = value[i];
    if (typeof n !== 'number' || !Number.isFinite(n)) return false;
    if (strict ? !(n > floor) : !(n >= floor)) return false;
  }
  return true;
}

/** Whatever is in storage, or a fresh prior if it is missing, from another
 *  version, or damaged. A half-valid posterior is worse than none: a single
 *  NaN weight would poison every solve. */
export function loadCalibration(): Calibration {
  // Whatever a previous version left behind goes now, rather than sitting in
  // storage being neither read nor collected.
  removeStorage(SUPERSEDED_KEY);
  const raw = readStorage(KEY);
  if (raw === null) return freshCalibration();
  let s: Partial<StoredCalibration> | null;
  try {
    s = JSON.parse(raw) as Partial<StoredCalibration> | null;
  } catch {
    return freshCalibration();
  }
  if (s === null || typeof s !== 'object' || s.v !== 2) return freshCalibration();
  if (!Array.isArray(s.a) || s.a.length === 0) return freshCalibration();
  const n = s.a.length;
  // alpha and tauAirScale are strictly positive; a weight may be zero but
  // never negative; the taste offset is a log-dose shift and may be anything
  // finite. Same rules as ios/App/Calibration.swift.
  if (
    !numberArray(s.a, n, 0, true) || !numberArray(s.o, n, -Infinity, false)
    || !numberArray(s.t, n, 0, true) || !numberArray(s.w, n, 0, false)
  ) {
    return freshCalibration();
  }
  if (typeof s.n !== 'number' || !Number.isFinite(s.n) || s.n < 0) return freshCalibration();
  if (typeof s.rng !== 'number' || !Number.isFinite(s.rng)) return freshCalibration();
  const particles: Particle[] = new Array<Particle>(n);
  const weights: number[] = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    particles[i] = { alpha_m2s: s.a[i], logDoseOffset: s.o[i], tauAirScale: s.t[i] };
    weights[i] = s.w[i];
  }
  return {
    posterior: { particles: particles, weights: weights, rng: s.rng },
    eggsLogged: s.n,
  };
}

/** Forget every egg. A run of wrong answers about how an egg was is otherwise
 *  undone only by clearing the site's storage, and the honest thing is to let
 *  someone take it back. The iOS app has had this since it shipped; README
 *  11.5 has listed its absence here as a known gap. */
export function clearCalibration(): Calibration {
  removeStorage(KEY);
  return freshCalibration();
}
