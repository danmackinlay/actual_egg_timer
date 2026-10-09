/**
 * The population a cook's prior is drawn from (E7; INFERENCE.md section 9):
 * reading the published one, and what it says before any egg.
 *
 * `fixtures/population.json` is what both apps draw a new cook's prior from.
 * The literature's (`LITERATURE_POPULATION`, infer.ts) is written there until
 * a fit of everyone's shared eggs publishes another; the web app fetches the
 * file at boot beside its words, and the iOS app bundles it. Every field
 * this needs is checked here, and anything else in the file - the fit's
 * summary, its covariance, when and from what it was made - is the fit's
 * own record and ignored, so the fit can say more without a change here.
 * A file written before 0.5 has a spread for the carryover too
 * (`tauAirScale`), which is ignored like the rest.
 *
 * BEFORE ANY EGG the app solves at the population's own centre: its median
 * time-scale and its mean white offset (`PriorStart`), with the counter's
 * carryover at the physics, as always (DECISIONS.md 95).
 * For the literature that is exactly the literature's values, as it always
 * was; for a fitted population it is where everyone's eggs put a new cook,
 * which is the point of pooling them. A calibration carries it from the
 * prior it was drawn from (record.ts).
 *
 * Pure, like the rest of `src/core/`.
 */

import { LogNormal, Normal, Population } from './infer.js';

export { LITERATURE_POPULATION } from './infer.js';
export type { Population } from './infer.js';

/** Where a calibration that has learned nothing solves: the population's
 *  centre. */
export interface PriorStart {
  alpha_m2s: number;
  /** The white's runny | tender cutpoint, decades of white dose above
   *  `WHITE_DOSE_TARGET`. */
  whiteOffset: number;
}

export function priorStart(p: Population): PriorStart {
  return {
    alpha_m2s: p.alpha_m2s.median,
    whiteOffset: p.whiteOffset.mean,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** A lognormal with a positive median and a positive spread. A spread of zero
 *  would give every particle the same value, and nothing could move it. */
function logNormal(v: unknown): LogNormal | null {
  if (!isObject(v)) return null;
  const median = v['median'];
  const logSd = v['logSd'];
  if (!finite(median) || !(median > 0) || !finite(logSd) || !(logSd > 0)) return null;
  return { median: median, logSd: logSd };
}

function normal(v: unknown): Normal | null {
  if (!isObject(v)) return null;
  const mean = v['mean'];
  const sd = v['sd'];
  if (!finite(mean) || !finite(sd) || !(sd > 0)) return null;
  return { mean: mean, sd: sd };
}

/** A population as the file holds it under `prior`, or null if any part of
 *  it cannot be trusted - a fresh object with exactly the known fields. */
export function parsePopulation(raw: unknown): Population | null {
  if (!isObject(raw)) return null;
  const id = raw['id'];
  if (typeof id !== 'string' || id === '') return null;
  const prior = raw['prior'];
  if (!isObject(prior)) return null;
  const alpha = logNormal(prior['alpha_m2s']);
  const taste = normal(prior['logDoseOffset']);
  const noise = logNormal(prior['noise']);
  const white = normal(prior['whiteOffset']);
  const gap = logNormal(prior['whiteFirmGap']);
  if (alpha === null || taste === null || noise === null || white === null || gap === null) {
    return null;
  }
  return { id: id, alpha_m2s: alpha, logDoseOffset: taste, noise: noise, whiteOffset: white, whiteFirmGap: gap };
}
