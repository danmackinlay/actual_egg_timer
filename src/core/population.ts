/**
 * The population a cook's prior is drawn from (INFERENCE.md section 9):
 * reading the published one, and what it says before any egg.
 *
 * `fixtures/population.json` is what both apps draw a new cook's prior from.
 * The literature's (`LITERATURE_POPULATION`, infer.ts) is written there until
 * a fit of everyone's shared eggs publishes another; the web app fetches the
 * file at boot beside its words, and the iOS app bundles it. Every field
 * this needs is checked here, and anything else in the file - the fit's
 * summary, its covariance, when and from what it was made - is the fit's
 * own record and ignored, so the fit can say more without a change here.
 *
 * BEFORE ANY EGG the app solves at the population's own centre: its median
 * time-scale and its mean white offset (`PriorStart`). For the literature
 * that is exactly the literature's values; for a fitted population it is
 * where everyone's eggs put a new cook, which is the point of pooling them. A
 * calibration carries it from the prior it was drawn from (recordFold.ts).
 */

import { LITERATURE_POPULATION, type LogNormal, type Normal, type Population } from './infer.ts';

export { LITERATURE_POPULATION } from './infer.ts';
export type { Population } from './infer.ts';

/** What ends the id of a population whose sampler failed its checks and was
 *  published all the same (fit/eggfit/__main__.py writes it). */
export const FORCED_ID_SUFFIX = '-forced';

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

function sameLogNormal(a: LogNormal, b: LogNormal): boolean {
  return a.median === b.median && a.logSd === b.logSd;
}

function sameNormal(a: Normal, b: Normal): boolean {
  return a.mean === b.mean && a.sd === b.sd;
}

/** Whether `p` is the literature's population, number for number. */
function isLiterature(p: Population): boolean {
  const l = LITERATURE_POPULATION;
  return p.id === l.id && sameLogNormal(p.alpha_m2s, l.alpha_m2s) && sameNormal(p.logDoseOffset, l.logDoseOffset)
    && sameLogNormal(p.noise, l.noise) && sameNormal(p.whiteOffset, l.whiteOffset)
    && sameLogNormal(p.whiteFirmGap, l.whiteFirmGap);
}

/** Whether the file's `diagnostics` let `p` be drawn from: a fit that passed;
 *  one that failed, forced, under an id that says so; or no diagnostics, for
 *  the literature's alone. */
function vouched(diagnostics: unknown, p: Population): boolean {
  if (diagnostics === undefined || diagnostics === null) return isLiterature(p);
  if (!isObject(diagnostics)) return false;
  const ok = diagnostics['ok'];
  const forced = diagnostics['forced'];
  if (typeof ok !== 'boolean' || typeof forced !== 'boolean') return false;
  if (ok) return !forced;
  return forced && p.id.endsWith(FORCED_ID_SUFFIX);
}

/** A population as the file holds it under `prior`, or null if any part of
 *  it cannot be trusted - a fresh object with exactly the known fields - or
 *  its diagnostics do not vouch for it. */
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
  const p: Population = {
    id: id, alpha_m2s: alpha, logDoseOffset: taste, noise: noise, whiteOffset: white, whiteFirmGap: gap,
  };
  return vouched(raw['diagnostics'], p) ? p : null;
}
