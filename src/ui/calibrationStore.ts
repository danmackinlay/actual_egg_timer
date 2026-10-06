/**
 * The calibration's store: what is kept (`Kept`), its format in storage (v4),
 * reading it apart and writing it, and the copies kept aside of whatever this
 * build could not read. What to keep of a store is core's (`loadDecision`,
 * src/core/record.ts); the state that holds what is kept, and folds it, is
 * calibration.ts.
 *
 * Pure apart from the storage it names, so the tests can walk every path
 * without a browser.
 */

import { LITERATURE_POPULATION, Particle, Population } from '../core/infer.js';
import { priorStart } from '../core/population.js';
import { CALIBRATION_SEED, PARTICLE_COUNT } from '../core/policy.js';
import {
  Calibration, EggRecord, LoadPath, MODEL_ID, copyCalibration, freshCalibration as freshFrom, loadDecision,
  parseRecord,
} from '../core/record.js';
import { activePopulation } from './population.js';
import { readStorage, writeStorage, removeStorage } from './store.js';

/** The posterior, the base under it, and the log. v4: a particle of six
 *  numbers. The key and the record's format change only with a migration
 *  (DECISIONS.md 81, which amends 48 for this one store). */
const KEY = 'aet.calibration.v4';

/** Every stored copy this build could not read whole, as it was stored,
 *  newest last: kept before anything is written over it, so no build ever
 *  loses a log another wrote (DECISIONS.md 81). Exported with the results;
 *  "Start learning again" deletes it with them. */
const UNREAD_KEY = 'aet.calibration.v4.unread';
/** How many unread copies are kept. Each is the size of the store, about
 *  200 KB, and localStorage has about 5 MB. */
const UNREAD_KEPT = 3;

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
  /** Records this build cannot read - from a newer build, most likely - kept
   *  as they were stored and written back, where they sat in the log, and
   *  folded by nothing here. Absent when there are none. */
  unread?: Unread[];
  /** Each record of `log` as it was stored, by index, for the ones read from
   *  storage; a record made here has none. A record is written back as
   *  stored with what this build knows laid over it (`overlay`), so a field
   *  a later build added - "fields may be ADDED within v1" - is not lost
   *  when this one saves. Absent when there are none. */
  stored?: unknown[];
}

/** A record this build cannot read, and its place in the whole log: `at` is
 *  its index among every record, readable or not, so a build that can read it
 *  puts it back where it was. */
interface Unread {
  at: number;
  record: unknown;
}

/** A fresh prior, from the population this page read (population.ts). */
function freshCalibration(pop: Population = activePopulation()): Calibration {
  return freshFrom(PARTICLE_COUNT, CALIBRATION_SEED, pop);
}

export function freshKept(pop: Population = activePopulation()): Kept {
  return { base: null, calibration: freshCalibration(pop), folded: 0, log: [] };
}

/** Where a replay starts: the base if there is one, the prior if not. */
function startOf(base: Calibration | null, pop: Population = activePopulation()): Calibration {
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
  /** The counter's carryover, which left the particle in 0.5 (DECISIONS.md
   *  95): written as STORED_TAU_AIR for every particle and never read. */
  t: number[];
  /** The noise scale, the white offset and the tender | firm gap. */
  sd: number[];
  wo: number[];
  wg: number[];
  w: number[];
  rng: number;
}

interface StoredV4 {
  v: 4;
  /** The population the posterior was drawn from (E7). Absent in a store
   *  written before E7, every one of which was drawn from the literature. */
  p: string;
  /** The `MODEL_ID` the posterior was folded under. Absent in a store
   *  written before it was kept, which is replayed once. */
  m: string;
  base: StoredPosterior | null;
  cal: StoredPosterior;
  folded: number;
  log: unknown[];
  /** Absent when there are none. */
  unread?: Unread[];
}

/** What `t` holds. A build from before 0.5 refuses a posterior without the
 *  column, and with it reads this store as it always did, and replays it
 *  (its `MODEL_ID` is not this one's): so it is written, at the physics'
 *  value, and the store's format does not change (DECISIONS.md 81). */
const STORED_TAU_AIR = 1.0;

function storedPosterior(c: Calibration): StoredPosterior {
  const p = c.posterior.particles;
  const s: StoredPosterior = {
    n: c.eggsLogged, rng: c.posterior.rng, a: [], o: [], t: [], sd: [], wo: [], wg: [], w: [],
  };
  for (let i = 0; i < p.length; i++) {
    s.a.push(p[i].alpha_m2s);
    s.o.push(p[i].logDoseOffset);
    s.t.push(STORED_TAU_AIR);
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
  // `t` is not read (STORED_TAU_AIR). Same rules as ios/App/Calibration.swift.
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

/**
 * A value as stored with what this build knows laid over it: every field this
 * build reads comes from `known`, at every depth, and every field it does not
 * is kept from `stored`, where it was. `known` itself where either is not an
 * object.
 */
export function overlay(stored: unknown, known: unknown): unknown {
  if (!isPlainObject(stored) || !isPlainObject(known)) return known;
  const out: Record<string, unknown> = { ...stored };
  for (const key of Object.keys(known)) out[key] = overlay(stored[key], known[key]);
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function encodeKept(k: Kept, pop: Population = activePopulation(), model = MODEL_ID): string {
  const stored: StoredV4 = {
    v: 4,
    p: pop.id,
    m: model,
    base: k.base === null ? null : storedPosterior(k.base),
    cal: storedPosterior(k.calibration),
    folded: k.folded,
    log: k.stored === undefined ? k.log : k.log.map((r, i) => overlay(k.stored?.[i], r)),
  };
  if (k.unread !== undefined && k.unread.length > 0) stored.unread = k.unread;
  return JSON.stringify(stored);
}

/** What loading found, for the caller that has to write it back and for the
 *  tests that check each path. */
export interface Decoded {
  kept: Kept;
  path: LoadPath;
  /** Whether writing `kept` back would lose something the store held - a
   *  log, or a store this build cannot read at all - so the stored text has
   *  to be kept aside first (`UNREAD_KEY`). */
  loses: boolean;
}

/** The unread records as stored: each a place and a record, or nothing. A
 *  damaged list is read as far as its entries are sound. */
function readUnread(raw: unknown): Unread[] {
  if (!Array.isArray(raw)) return [];
  const out: Unread[] = [];
  for (const u of raw as unknown[]) {
    if (u === null || typeof u !== 'object') continue;
    const at = (u as { at?: unknown }).at;
    if (typeof at !== 'number' || !Number.isInteger(at) || at < 0) continue;
    out.push({ at: at, record: (u as { record?: unknown }).record ?? null });
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

/**
 * The log, read record by record: the stored log and the stored unread
 * records put back together in their places, then every record this build
 * can read in `log` and every one it cannot in `unread`, each with its place.
 *
 * A record that does not read is skipped and kept, not a reason to drop the
 * log: a newer build's record, read by this one, is set aside and written
 * back, and the next build that can read it puts it back where it was.
 * `moved` says whether the split differs from the stored one - a record has
 * become unreadable, or readable - in which case what the posterior absorbed
 * is no longer the log, and it is replayed. Null when the log is not a list.
 */
function readLog(
  rawLog: unknown, rawUnread: unknown,
): { log: EggRecord[]; stored: unknown[]; unread: Unread[]; moved: boolean } | null {
  if (!Array.isArray(rawLog)) return null;
  const listed = rawLog as unknown[];
  const held = readUnread(rawUnread);
  const log: EggRecord[] = [];
  const stored: unknown[] = [];
  const unread: Unread[] = [];
  let moved = false;
  let li = 0;
  let hi = 0;
  for (let at = 0; li < listed.length || hi < held.length; at++) {
    const fromHeld = hi < held.length && (held[hi].at <= at || li >= listed.length);
    const raw = fromHeld ? held[hi++].record : listed[li++];
    const r = parseRecord(raw);
    if (r !== null) {
      log.push(r);
      stored.push(raw);
      if (fromHeld) moved = true;
    } else {
      unread.push({ at: at, record: raw });
      if (!fromHeld) moved = true;
    }
  }
  return { log: log, stored: stored, unread: unread, moved: moved };
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
 * never read around; a record that does not read (a newer build's, most
 * likely) is skipped and kept, in its place (`readLog`); a posterior drawn
 * from another population than `pop` or folded under another model is
 * replayed. `loses` says the caller is to keep the stored text aside before
 * writing over it, so nothing a build cannot read is ever lost
 * (DECISIONS.md 81).
 *
 * The calibration and the base come back starting at `pop`'s centre
 * (`priorStart`): the start is not stored, since it is the population's.
 *
 * Pure, so the tests can walk every path without a browser.
 */
export function decodeKept(
  v4raw: string | null, pop: Population = activePopulation(), model = MODEL_ID,
): Decoded {
  const decoded = decodeParts(v4raw, pop, model);
  const start = priorStart(pop);
  decoded.kept.calibration.start = { ...start };
  if (decoded.kept.base !== null) decoded.kept.base.start = { ...start };
  return decoded;
}

function decodeParts(v4raw: string | null, pop: Population, model: string): Decoded {
  const obj = parseJSON(v4raw);
  const v4 = obj !== null && typeof obj === 'object' && (obj as { v?: unknown }).v === 4;
  const s = (v4 ? obj : {}) as Partial<Record<keyof StoredV4, unknown>>;
  // A base the store leaves out is read as a damaged one; this app always
  // writes one, null when there is none.
  const base = v4 && s.base !== null ? readPosterior(s.base) : null;
  const cal = v4 ? readPosterior(s.cal) : null;
  const read = v4 ? readLog(s.log, s.unread) : null;
  const folded = s.folded;
  const d = loadDecision({
    stored: v4raw !== null && v4raw !== '',
    v4: v4,
    base: !v4 || s.base === null ? null : base === null ? 'damaged' : 'sound',
    posterior: cal !== null,
    folded: typeof folded === 'number' && Number.isInteger(folded) && folded >= 0 ? folded : null,
    records: read === null ? null : read.log.length,
    moved: read !== null && read.moved,
    population: typeof s.p === 'string' ? s.p : LITERATURE_POPULATION.id,
    model: typeof s.m === 'string' ? s.m : null,
  }, pop.id, model);
  const keptBase = d.base === 'stored' ? base : d.base === 'posterior' ? cal : null;
  const kept: Kept = {
    base: keptBase,
    calibration: d.calibration === 'posterior' && cal !== null ? cal : startOf(keptBase, pop),
    folded: d.folded,
    log: [],
  };
  if (d.log && read !== null) {
    kept.log = read.log;
    kept.unread = read.unread;
    kept.stored = read.stored;
  }
  return { kept: kept, path: d.path, loses: d.loses };
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

/** The stored copies kept aside, oldest first. A side key that is itself
 *  not a list of texts is kept as one more text, not dropped. */
function unreadCopies(): string[] {
  const raw = readStorage(UNREAD_KEY);
  if (raw === null) return [];
  const list = parseJSON(raw);
  if (Array.isArray(list) && list.every((x) => typeof x === 'string')) return list as string[];
  return [raw];
}

/** Keep a stored text this build is about to write over, with the newest
 *  others: the same text twice is kept once. */
export function keepUnread(raw: string): void {
  const copies = unreadCopies().filter((c) => c !== raw);
  copies.push(raw);
  // The newest first to go in, should storage be short of room.
  for (let n = Math.min(copies.length, UNREAD_KEPT); n >= 1; n--) {
    writeStorage(UNREAD_KEY, JSON.stringify(copies.slice(copies.length - n)));
    const now = unreadCopies();
    if (now.length > 0 && now[now.length - 1] === raw) return;
  }
}

/** A cook in progress this build could not read (app.ts, `restoreCook`), the
 *  newest one, kept as stored: its egg may be one nothing else holds. */
const UNREAD_COOK_KEY = 'aet.cook.unread';

export function keepUnreadCook(text: string): void {
  writeStorage(UNREAD_COOK_KEY, text);
}

/** Every copy kept aside, the stores first, then the cook. */
export function keptAside(): string[] {
  const cook = readStorage(UNREAD_COOK_KEY);
  return cook === null ? unreadCopies() : [...unreadCopies(), cook];
}

/** The store and every copy kept aside, gone: the store first. */
export function removeEverything(): void {
  removeStorage(KEY);
  removeStorage(UNREAD_KEY);
  removeStorage(UNREAD_COOK_KEY);
  removeSuperseded();
}
