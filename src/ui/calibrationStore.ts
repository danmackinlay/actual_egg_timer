/**
 * The calibration's store: what is kept (`Kept`), its format in storage (v5),
 * reading it apart and writing it. What to keep of a store is core's
 * (`loadDecision`, src/core/record.ts); the state that holds what is kept, and
 * folds it, is calibration.ts.
 *
 * Pure apart from the storage it names, so the tests can walk every path
 * without a browser.
 */

import { Particle, Population } from '../core/infer.js';
import { priorStart } from '../core/population.js';
import { CALIBRATION_SEED, PARTICLE_COUNT } from '../core/policy.js';
import {
  Calibration, EggRecord, LoadPath, MODEL_ID, copyCalibration, freshCalibration as freshFrom, loadDecision,
  parseLog,
} from '../core/record.js';
import { activePopulation } from './population.js';
import { readStorage, writeStorage, removeStorage } from './store.js';

/** The posterior, the base under it, and the log: a particle of six numbers,
 *  and records of today's shape only. v5: the log started fresh in 0.5, and
 *  0.3's v4 is never read (DECISIONS.md 107). */
const KEY = 'aet.calibration.v5';

/** Every store before this one, deleted rather than read: the v1 and v2
 *  posteriors, which have no log behind them (v2 is what the live site of 19
 *  September writes), and v3, a three-number particle that only the owner's
 *  devices ever held. */
const SUPERSEDED_KEYS = ['aet.calibration.v3', 'aet.calibration.v2', 'aet.calibration.v1'];

/** Everything that is kept, and the one invariant that holds it together:
 *  `calibration` is `replay(base ?? prior, log.slice(0, folded))`. */
export interface Kept {
  /** Where the replay starts when it is not the prior: only ever the posterior
   *  of a log that was damaged and had to be dropped (`rebased`). Null on every
   *  healthy phone. */
  base: Calibration | null;
  calibration: Calibration;
  /** How many records `calibration` has absorbed. Behind the log only between
   *  an answer being written down and its surface being built. */
  folded: number;
  log: EggRecord[];
}

/** A fresh prior, from the population this page read (population.ts). */
function freshCalibration(pop: Population = activePopulation()): Calibration {
  return freshFrom(PARTICLE_COUNT, CALIBRATION_SEED, pop);
}

export function freshKept(pop: Population = activePopulation()): Kept {
  return { base: null, calibration: freshCalibration(pop), folded: 0, log: [] };
}

/** Where a replay starts: the base if there is one, the prior if not. */
export function startOf(base: Calibration | null, pop: Population = activePopulation()): Calibration {
  return base === null ? freshCalibration(pop) : copyCalibration(base);
}

/* ------------------------------------------------------------- the format */

/** Column-wise, one column per particle field. The current posterior is
 *  written at full precision: it is a cache of a replay, and a cache that
 *  rounds is one a replay can never match. JSON.stringify writes the shortest
 *  string that reads back as the same double, so full precision is exact, and
 *  about 180 KB. */
interface StoredPosterior {
  n: number;
  a: number[];
  o: number[];
  /** The noise scale, the white offset and the tender | firm gap. */
  sd: number[];
  wo: number[];
  wg: number[];
  w: number[];
  rng: number;
}

interface StoredV5 {
  v: 5;
  /** The population the posterior was drawn from. */
  p: string;
  /** The `MODEL_ID` the posterior was folded under. */
  m: string;
  base: StoredPosterior | null;
  cal: StoredPosterior;
  folded: number;
  log: EggRecord[];
}

function storedPosterior(c: Calibration): StoredPosterior {
  const p = c.posterior.particles;
  const s: StoredPosterior = {
    n: c.eggsLogged, rng: c.posterior.rng, a: [], o: [], sd: [], wo: [], wg: [], w: [],
  };
  for (let i = 0; i < p.length; i++) {
    s.a.push(p[i].alpha_m2s);
    s.o.push(p[i].logDoseOffset);
    s.sd.push(p[i].noise);
    s.wo.push(p[i].whiteOffset);
    s.wg.push(p[i].whiteFirmGap);
    s.w.push(c.posterior.weights[i]);
  }
  return s;
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

/** A posterior in the stored column shape, or null if any part of it is
 *  damaged. A half-valid posterior is worse than none: a single NaN weight would
 *  poison every solve. */
function readPosterior(raw: unknown): Calibration | null {
  if (raw === null || typeof raw !== 'object') return null;
  const s = raw as Partial<StoredPosterior>;
  if (!Array.isArray(s.a) || s.a.length === 0) return null;
  const n = s.a.length;
  // alpha, the noise scale and the firm gap are strictly positive - a zero
  // noise divides by zero in the probit; a weight may be zero but never
  // negative; the two offsets are log-dose shifts and may be anything finite.
  // Same rules as ios/App/Calibration.swift.
  if (
    !numberArray(s.a, n, 0, true) || !numberArray(s.o, n, -Infinity, false)
    || !numberArray(s.sd, n, 0, true)
    || !numberArray(s.wo, n, -Infinity, false) || !numberArray(s.wg, n, 0, true)
    || !numberArray(s.w, n, 0, false)
  ) {
    return null;
  }
  if (typeof s.n !== 'number' || !Number.isInteger(s.n) || s.n < 0) return null;
  if (typeof s.rng !== 'number' || !Number.isInteger(s.rng)) return null;
  const particles: Particle[] = new Array<Particle>(n);
  const weights: number[] = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    particles[i] = {
      alpha_m2s: s.a[i], logDoseOffset: s.o[i],
      noise: s.sd[i], whiteOffset: s.wo[i], whiteFirmGap: s.wg[i],
    };
    weights[i] = s.w[i];
  }
  return { posterior: { particles: particles, weights: weights, rng: s.rng }, eggsLogged: s.n };
}

export function encodeKept(k: Kept, pop: Population = activePopulation(), model = MODEL_ID): string {
  const stored: StoredV5 = {
    v: 5,
    p: pop.id,
    m: model,
    base: k.base === null ? null : storedPosterior(k.base),
    cal: storedPosterior(k.calibration),
    folded: k.folded,
    log: k.log,
  };
  return JSON.stringify(stored);
}

/** What loading found, for the caller that has to write it back and for the
 *  tests that check each path. */
export interface Decoded {
  kept: Kept;
  path: LoadPath;
}

function parseJSON(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * What is in storage, made safe to fold on top of.
 *
 * The store is read apart here, part by part; what to keep of it is core's
 * `loadDecision` (src/core/record.ts), iOS's too, whose header has every path:
 * `fresh`, `rebuild`, `rebased` or `loaded`. Every damaged part is refused,
 * never read around: a store that cannot be read is dropped, a log with a
 * record that does not read is dropped with what it taught kept as the base,
 * and a posterior drawn from another population than `pop` or folded under
 * another model is replayed.
 *
 * The calibration and the base come back starting at `pop`'s centre
 * (`priorStart`): the start is not stored, since it is the population's.
 *
 * Pure, so the tests can walk every path without a browser.
 */
export function decodeKept(
  raw: string | null, pop: Population = activePopulation(), model = MODEL_ID,
): Decoded {
  const decoded = decodeParts(raw, pop, model);
  const start = priorStart(pop);
  decoded.kept.calibration.start = { ...start };
  if (decoded.kept.base !== null) decoded.kept.base.start = { ...start };
  return decoded;
}

function decodeParts(raw: string | null, pop: Population, model: string): Decoded {
  const obj = parseJSON(raw);
  const readable = obj !== null && typeof obj === 'object' && (obj as { v?: unknown }).v === 5;
  const s = (readable ? obj : {}) as Partial<Record<keyof StoredV5, unknown>>;
  // A base the store leaves out is read as a damaged one; this app always
  // writes one, null when there is none.
  const base = readable && s.base !== null ? readPosterior(s.base) : null;
  const cal = readable ? readPosterior(s.cal) : null;
  const log = readable ? parseLog(s.log) : null;
  const folded = s.folded;
  const d = loadDecision({
    readable: readable,
    base: !readable || s.base === null ? null : base === null ? 'damaged' : 'sound',
    posterior: cal !== null,
    folded: typeof folded === 'number' && Number.isInteger(folded) && folded >= 0 ? folded : null,
    records: log === null ? null : log.length,
    population: typeof s.p === 'string' ? s.p : null,
    model: typeof s.m === 'string' ? s.m : null,
  }, pop.id, model);
  const keptBase = d.base === 'stored' ? base : d.base === 'posterior' ? cal : null;
  return {
    kept: {
      base: keptBase,
      calibration: d.calibration === 'posterior' && cal !== null ? cal : startOf(keptBase, pop),
      folded: d.folded,
      log: d.log && log !== null ? log : [],
    },
    path: d.path,
  };
}

/* ------------------------------------------------------------- the storage */

/** The store's text as it is now, or null when there is none. */
export function readKeptText(): string | null {
  return readStorage(KEY);
}

export function writeKeptText(text: string): void {
  writeStorage(KEY, text);
}

/** Whether a change to storage under `key` (the `storage` event's, null
 *  when a tab cleared it all) can have touched the store. */
export function touchesKept(key: string | null): boolean {
  return key === null || key === KEY;
}

/** Whatever came before the log goes, rather than sitting in storage being
 *  neither read nor collected. */
export function removeSuperseded(): void {
  for (const key of SUPERSEDED_KEYS) removeStorage(key);
}

/** The store, gone. */
export function removeEverything(): void {
  removeStorage(KEY);
  removeSuperseded();
}
