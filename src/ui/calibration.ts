/**
 * Bridges the particle filter in src/core/ to the app, and keeps the record.
 *
 * The model's constants come from the literature, and the carryover term has no
 * published measurement behind it at all. Rather than pretend otherwise, the app
 * asks how each egg turned out and folds the answer into a posterior. After
 * about three eggs the suggested time stops moving.
 *
 * The answer is not thrown away once folded. Each egg is kept as a
 * record (INFERENCE.md section 4) in a log beside the posterior, and the
 * posterior is what `replay` makes of that log - so a later change to the
 * likelihood replays the eggs instead of discarding what they taught. The
 * stored posterior is a cache of that replay: `folded` says how many records it
 * has absorbed, and anything past it is folded again on load.
 *
 * The dose surface costs about two seconds to build and is built once per
 * logged egg, in a Web Worker (`gridWorker.ts`), so the page stays live while it
 * runs. If a worker cannot be had, the build falls back to this thread, behind a
 * yield so the "learning" note paints first.
 */

import { Egg, SizeTable } from '../core/geometry.js';
import { CookSetup } from '../core/protocol.js';
import { Doneness, ModelParams } from '../core/solve.js';
import { DoseGrid, GridRequest } from '../core/doseGrid.js';
import { Feedback, LITERATURE_POPULATION, Particle, Population, WhiteReport } from '../core/infer.js';
import { priorStart } from '../core/population.js';
import { DecisionInputs } from '../core/decide.js';
import { OddsProfile } from '../core/reach.js';
import { CALIBRATION_SEED, PARTICLE_COUNT, calibrationGrid } from '../core/policy.js';
import {
  Calibration, EggFrom, EggRecord, Forecast, MODEL_ID, MassFrom, ProbeReading, RECORD_VERSION,
  calibrationDoneness as donenessOf, calibrationParams as paramsOf, copyCalibration, foldRecord,
  freshCalibration as freshFrom, gridRequestFor, parseRecord, recordMass_g, recordTeaches,
  resultsFile, resultsFileName,
} from '../core/record.js';
import { UnitSystem } from '../core/units.js';
import { registerOf } from '../core/language.js';
import { Machine } from './machine.js';
import { Job, runJob } from './runJob.js';
import { activePopulation } from './population.js';
import { readStorage, writeStorage, removeStorage } from './store.js';

export type { Calibration } from '../core/record.js';

/** Same number as package.json and the iOS MARKETING_VERSION; a test holds the
 *  first pair together. Carried on every record, because the web app deploys on
 *  push and the iOS app ships later, and the fit has to know which was which. */
export const APP_VERSION = '0.4.0-alpha.1';

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
}

/** A record this build cannot read, and its place in the whole log: `at` is
 *  its index among every record, readable or not, so a build that can read it
 *  puts it back where it was. */
export interface Unread {
  at: number;
  record: unknown;
}

/** A fresh prior, from the population this page read (population.ts). */
export function freshCalibration(pop: Population = activePopulation()): Calibration {
  return freshFrom(PARTICLE_COUNT, CALIBRATION_SEED, pop);
}

function freshKept(pop: Population = activePopulation()): Kept {
  return { base: null, calibration: freshCalibration(pop), folded: 0, log: [] };
}

/** Where a replay starts: the base if there is one, the prior if not. */
function startOf(base: Calibration | null, pop: Population = activePopulation()): Calibration {
  return base === null ? freshCalibration(pop) : copyCalibration(base);
}

/** Parameters to solve with. Before any feedback this is the literature values,
 *  so the app is fully useful on day one and calibration is purely additive. */
export function calibrationParams(c: Calibration): ModelParams {
  return paramsOf(c);
}

/** The doneness to solve for at a slider level: the white's target moves with
 *  what the eggs said about the white. See `calibrationDoneness` in core. */
export function calibrationDoneness(c: Calibration, level: number): Doneness {
  return donenessOf(c, level);
}

/* ------------------------------------------------------------- the record */

/** What a cook was, frozen at "Eggs in" - the fields of the ticket
 *  (ticket.ts) that a record needs. */
export interface Cooked {
  egg: Egg;
  massFrom: MassFrom;
  sizeTable: SizeTable | null;
  setup: CookSetup;
  /** Whether a measured pan was on file at "Eggs in". Read only on a hot start,
   *  which never times its own pan; a finished cold start always has. */
  boilRemembered: boolean;
  eggFrom: EggFrom;
  /** The system the cook was reading at "Eggs in". The record stays SI; this
   *  says only what was on screen, so the fit can look for rounding at input. */
  units: UnitSystem;
  /** The language the cook was reading at "Eggs in": the UI's, a catalogue
   *  tag such as `en`, or `en-x-1750` for the English of 1750, whose
   *  record also says `register: '1750'` (`registerOf`). */
  lang: string;
  /** What the app said at "Eggs in", for the record; null when the time was
   *  started before the odds were known. */
  forecast: Forecast | null;
  /** The nudge in the time that ran (E8), which the record keeps apart from
   *  what was recommended. */
  nudge_s: number;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** The LOCAL date a cook started on. A day, not a timestamp. */
function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * The record of one egg, from the cook that was started and the machine that
 * ran it, with whichever answers have been given so far, and the probe reading
 * if there is one.
 *
 * `pulled_s` is the cook's own tap out of PULL when there was one. When the
 * grace ran out instead, nobody said when the egg came out, and the record says
 * so: `pulledBy: 'timeout'`, with the scheduled time standing in as an
 * assumption.
 */
export function eggRecordFor(
  c: Cooked, m: Machine, yolk: Feedback | null, white: WhiteReport | null = null,
  probe: ProbeReading | null = null,
): EggRecord {
  const measured = m.pulledBy === 'cook' && m.outAt_ms > m.startedAt_ms;
  return {
    v: RECORD_VERSION,
    uid: null,
    day: localDay(m.startedAt_ms),
    app: 'web',
    appVersion: APP_VERSION,
    prior: activePopulation().id,
    model: MODEL_ID,
    egg: {
      mass_g: recordMass_g(c.egg.mass_kg),
      massFrom: c.massFrom,
      sizeTable: c.massFrom === 'class' ? c.sizeTable ?? 'eu' : null,
    },
    setup: {
      startMode: c.setup.startMode,
      eggStart_C: c.setup.eggStart_C,
      eggFrom: c.eggFrom,
      ambient_C: c.setup.ambient_C,
      boiling_C: c.setup.boiling_C,
      timeToBoil_s: c.setup.timeToBoil_s,
      timeToBoilFrom: c.setup.startMode === 'cold' ? 'measured'
        : c.boilRemembered ? 'remembered' : 'default',
      cooling: c.setup.cooling,
      afterBoil: c.setup.afterBoil ?? 'hold',
      waterLitres: c.setup.waterLitres,
      eggCount: c.setup.eggCount,
    },
    level: m.targetLevel,
    // The machine ran the nudged time; the record splits it into what was
    // recommended and what was added on purpose (INFERENCE.md section 4).
    recommended_s: m.cookTime_s - c.nudge_s,
    nudge_s: c.nudge_s,
    pulled_s: measured ? (m.outAt_ms - m.startedAt_ms) / 1000 : m.cookTime_s,
    pulledBy: measured ? 'cook' : 'timeout',
    cooled_s: m.cooling === 'counter' ? 0 : m.cool_s,
    yolk: yolk,
    white: white,
    probe: probe,
    forecast: c.forecast,
    lang: c.lang,
    register: registerOf(c.lang),
    units: c.units,
  };
}

/* ------------------------------------------------------------- persistence */

/** Column-wise, one column per particle field. The current posterior is
 *  written at full precision: it is a cache of a replay, and a cache that
 *  rounds is one a replay can never match. JSON.stringify writes the shortest
 *  string that reads back as the same double, so full precision is exact, and
 *  about 180 KB. */
interface StoredPosterior {
  n: number;
  a: number[];
  o: number[];
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
  log: EggRecord[];
  /** Absent when there are none. */
  unread?: Unread[];
}

function storedPosterior(c: Calibration): StoredPosterior {
  const p = c.posterior.particles;
  const s: StoredPosterior = {
    n: c.eggsLogged, rng: c.posterior.rng, a: [], o: [], t: [], sd: [], wo: [], wg: [], w: [],
  };
  for (let i = 0; i < p.length; i++) {
    s.a.push(p[i].alpha_m2s);
    s.o.push(p[i].logDoseOffset);
    s.t.push(p[i].tauAirScale);
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
  // alpha, tauAirScale, the noise scale and the firm gap are strictly
  // positive - a zero noise divides by zero in the probit; a weight may be zero
  // but never negative; the two offsets are log-dose shifts and may be anything
  // finite. Same rules as ios/App/Calibration.swift.
  if (
    !numberArray(s.a, n, 0, true) || !numberArray(s.o, n, -Infinity, false)
    || !numberArray(s.t, n, 0, true) || !numberArray(s.sd, n, 0, true)
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
      alpha_m2s: s.a[i], logDoseOffset: s.o[i], tauAirScale: s.t[i],
      noise: s.sd[i], whiteOffset: s.wo[i], whiteFirmGap: s.wg[i],
    };
    weights[i] = s.w[i];
  }
  return { posterior: { particles: particles, weights: weights, rng: s.rng }, eggsLogged: s.n };
}

export function encodeKept(k: Kept, pop: Population = activePopulation()): string {
  const stored: StoredV4 = {
    v: 4,
    p: pop.id,
    m: MODEL_ID,
    base: k.base === null ? null : storedPosterior(k.base),
    cal: storedPosterior(k.calibration),
    folded: k.folded,
    log: k.log,
  };
  if (k.unread !== undefined && k.unread.length > 0) stored.unread = k.unread;
  return JSON.stringify(stored);
}

/** What loading found, for the caller that has to write it back and for the
 *  tests that check each path. */
type LoadPath =
  | 'fresh' | 'loaded' | 'rebased' | 'rebuild';

interface Decoded {
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
function readLog(rawLog: unknown, rawUnread: unknown): { log: EggRecord[]; unread: Unread[]; moved: boolean } | null {
  if (!Array.isArray(rawLog)) return null;
  const listed = rawLog as unknown[];
  const held = readUnread(rawUnread);
  const log: EggRecord[] = [];
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
      if (fromHeld) moved = true;
    } else {
      unread.push({ at: at, record: raw });
      if (!fromHeld) moved = true;
    }
  }
  return { log: log, unread: unread, moved: moved };
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
 * Every damaged part is refused, never read around, and what is refused depends
 * on what can still be trusted:
 *
 *  - no v4 that can be read: `fresh`, the prior.
 *  - the posterior damaged, the log good: `rebuild`. The log is the truth, so
 *    the posterior is set back to its start and every record is folded again.
 *  - a record that does not read (a newer build's, most likely): skipped and
 *    kept, in its place (`readLog`), and the rest replayed - `rebuild` - if
 *    that changed what the posterior should hold.
 *  - the log not a list at all: `rebased`. Its records cannot be folded, but
 *    what they taught is in the posterior, which is sound - so it becomes the
 *    base, and the log starts again empty.
 *  - a posterior that has absorbed more records than the log holds: also
 *    `rebased`, for the same reason.
 *  - a base that is damaged: dropped, and the log replayed from the prior.
 *  - a posterior drawn from another population than `pop` (E7: a release
 *    shipped a new one), or folded under another model (`MODEL_ID`, the
 *    store's `m`): `rebuild`, from a prior drawn from `pop` - "a model change
 *    is a replay" (INFERENCE.md section 4). A base cannot be replayed, so one
 *    stays as it is.
 *
 * `fresh` from a store that held something, and `rebased`, say `loses`: the
 * caller keeps the stored text aside before writing over it, so nothing a
 * build cannot read is ever lost (DECISIONS.md 81).
 *
 * The calibration and the base come back starting at `pop`'s centre
 * (`priorStart`): the start is not stored, since it is the population's.
 *
 * Pure, so the tests can walk every path without a browser.
 */
export function decodeKept(v4raw: string | null, pop: Population = activePopulation()): Decoded {
  const decoded = decodeParts(v4raw, pop);
  const start = priorStart(pop);
  decoded.kept.calibration.start = { ...start };
  if (decoded.kept.base !== null) decoded.kept.base.start = { ...start };
  return decoded;
}

function decodeParts(v4raw: string | null, pop: Population): Decoded {
  const obj = parseJSON(v4raw);
  if (obj === null || typeof obj !== 'object' || (obj as { v?: unknown }).v !== 4) {
    return { kept: freshKept(pop), path: 'fresh', loses: v4raw !== null && v4raw !== '' };
  }
  const s = obj as Partial<Record<keyof StoredV4, unknown>>;
  const drawnFrom = typeof s.p === 'string' ? s.p : LITERATURE_POPULATION.id;
  const foldedUnder = typeof s.m === 'string' ? s.m : null;
  let base: Calibration | null = null;
  let baseLost = false;
  if (s.base !== null) {
    base = readPosterior(s.base);
    baseLost = base === null;
  }
  const cal = readPosterior(s.cal);
  const read = readLog(s.log, s.unread);
  const folded = s.folded;
  const foldedOk = typeof folded === 'number' && Number.isInteger(folded) && folded >= 0;

  if (read === null) {
    const sound = cal ?? base;
    return {
      kept: { base: sound, calibration: startOf(sound, pop), folded: 0, log: [] },
      path: 'rebased',
      loses: true,
    };
  }
  const { log, unread } = read;
  if (baseLost || cal === null || !foldedOk || drawnFrom !== pop.id || foldedUnder !== MODEL_ID || read.moved) {
    return {
      kept: { base: base, calibration: startOf(base, pop), folded: 0, log: log, unread: unread },
      path: 'rebuild',
      loses: false,
    };
  }
  if ((folded as number) > log.length) {
    return {
      kept: { base: cal, calibration: copyCalibration(cal), folded: 0, log: [] },
      path: 'rebased',
      loses: true,
    };
  }
  return {
    kept: { base: base, calibration: cal, folded: folded as number, log: log, unread: unread },
    path: 'loaded',
    loses: false,
  };
}

/* ------------------------------------------------------------- the state */

let kept: Kept = freshKept();
/** Bumped by "forget everything", so a fold whose surface was still being built
 *  when the button was pressed lands on nothing rather than on the fresh prior. */
let generation = 0;
let draining: Promise<void> | null = null;
/** The record whose cook is on screen, whose second answer may still come.
 *  Every other record is folded quietly. */
let live = -1;
let last: LiveFold | null = null;
/** The text this page last read from `KEY` or wrote there. Anything else
 *  found there was written by another tab, and is taken up before this one
 *  writes (`current`): every tab writes the whole store, so a tab that wrote
 *  back what it loaded would undo every egg another tab logged since. */
let seen: string | null = null;

function save(): void {
  writeStorage(KEY, encodeKept(kept));
  // Read back rather than assumed: a write that failed (no room, no storage)
  // leaves the store as it was, which is then not another tab's.
  seen = readStorage(KEY);
}

/** Take up what another tab wrote, if it wrote anything since this one last
 *  read or wrote: before every change, so a change lands on the store as it
 *  is now. Says whether there was anything to take up. */
function current(): boolean {
  const raw = readStorage(KEY);
  if (raw === seen) return false;
  adopt(raw);
  return true;
}

/**
 * Another tab's store, read as a load reads one (`decodeKept`), into the
 * calibration the page already holds, so every holder of the reference sees
 * it. A fold under way lands on nothing, and the drain goes round again on
 * what is there now. The egg on screen keeps its chance of a second answer
 * only if the other tab left the log exactly as this one had it.
 */
function adopt(raw: string | null): void {
  const decoded = decodeKept(raw);
  if (decoded.loses && raw !== null) keepUnread(raw);
  const had = kept;
  assign(had.calibration, decoded.kept.calibration);
  kept = { ...decoded.kept, calibration: had.calibration };
  generation += 1;
  if (live >= 0 && !sameRecord(kept.log[live], had.log[live])) live = -1;
  if (last !== null) {
    const r = kept.log[last.index];
    last = r !== undefined && sameRecord(r, last.record)
      && kept.log.length === last.index + 1 && kept.folded === last.index + 1
      ? { ...last, record: r } : null;
  }
  seen = raw;
  if (decoded.path !== 'loaded') save();
}

function sameRecord(a: EggRecord | undefined, b: EggRecord | undefined): boolean {
  return a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b);
}

/** Another tab changed storage (the page's `storage` event, whose key is
 *  null when a tab cleared it all): taken up now, if it touched the store.
 *  Says whether it did, so the page can redraw and fold what is behind. */
export function calibrationStoredElsewhere(key: string | null): boolean {
  if (key !== null && key !== KEY) return false;
  return current();
}

/** Whatever is in storage, made safe (see `decodeKept`). The posterior it
 *  returns is the one the app solves with, and it is folded into IN PLACE as
 *  eggs are learned, so the caller's reference stays current. If the posterior
 *  is behind the log, call `learn()` to catch it up. */
export function loadCalibration(): Calibration {
  // Whatever came before the log goes now, rather than sitting in storage
  // being neither read nor collected.
  for (const key of SUPERSEDED_KEYS) removeStorage(key);
  const raw = readStorage(KEY);
  const decoded = decodeKept(raw);
  // Kept aside BEFORE anything is written over it.
  if (decoded.loses && raw !== null) keepUnread(raw);
  kept = decoded.kept;
  seen = raw;
  if (decoded.path !== 'loaded') save();
  return kept.calibration;
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
function keepUnread(raw: string): void {
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
function keptAside(): string[] {
  const cook = readStorage(UNREAD_COOK_KEY);
  return cook === null ? unreadCopies() : [...unreadCopies(), cook];
}

/** How many results there are to export: every record, read or not, and
 *  every copy kept aside. */
export function resultsKept(): number {
  return kept.log.length + (kept.unread?.length ?? 0) + keptAside().length;
}

/**
 * The results file (`resultsFile` in core): the store exactly as stored,
 * the copies kept aside, and the sharing ID if there is one. Its name is the
 * local day. Null when there is nothing in it to export.
 */
export function exportResults(uid: string | null, now_ms: number): { name: string; text: string } | null {
  if (resultsKept() === 0) return null;
  const text = resultsFile({
    app: 'web', appVersion: APP_VERSION, exported: new Date(now_ms).toISOString(),
    population: activePopulation().id, uid: uid,
  }, readStorage(KEY), keptAside());
  return { name: resultsFileName(localDay(now_ms)), text: text };
}

/** How many eggs are written down and not yet folded. */
export function eggsBehind(): number {
  return kept.log.length - kept.folded;
}

/** Everything kept, for tests and for anyone reading the log back. */
export function keptState(): Kept {
  return kept;
}

/** Write one egg down, before anything is learned from it: a reload between the
 *  answer and the fold then refolds it on load rather than losing it or folding
 *  it twice. Returns its index in the log. */
export function logEgg(r: EggRecord): number {
  current();
  kept.log.push(r);
  save();
  return kept.log.length - 1;
}

/** What folding the live egg leaves behind: the surface its answers were
 *  scored against and the calibration as it stood before them, so that a
 *  second answer can fold the egg again rather than on top of itself. */
interface LiveFold {
  index: number;
  record: EggRecord;
  /** Not persisted: a reload drops the chance of a second answer rather than
   *  rebuilding two seconds of arithmetic to offer it. */
  grid: DoseGrid;
  before: Calibration;
}

/**
 * Fold every egg not yet folded, one surface at a time, off the main thread.
 *
 * Pass the index `logEgg` returned for the egg on screen, so a second answer
 * to it can be folded again (`recordSecondAnswer`); with no index, this only
 * catches the posterior up with the log. Calls made while a fold is
 * running join it, and it runs until the log is empty of unfolded eggs, so
 * nothing written down is ever left behind.
 */
export async function learn(index = -1): Promise<void> {
  if (index >= 0) live = index;
  await drain();
}

function drain(): Promise<void> {
  if (draining === null) {
    draining = drainLog().finally(() => { draining = null; });
  }
  return draining;
}

async function drainLog(): Promise<void> {
  for (;;) {
    current();
    if (kept.folded >= kept.log.length) return;
    const k = kept;
    const gen = generation;
    const index = k.folded;
    const r = k.log[index];
    if (!recordTeaches(r)) {
      k.folded += 1;
      save();
      continue;
    }
    // The surface is centred where the posterior stands BEFORE this egg - see
    // `gridRequestFor` - and nothing folds in between, because this loop is the
    // only thing that folds.
    const grid = await buildOffThread(gridRequestFor(k.calibration, r, calibrationGrid));
    // Another tab's store, written while the surface was being built, is
    // taken up instead, and folded from where it stands.
    if (current() || gen !== generation) continue;
    const before = index === live ? copyCalibration(k.calibration) : null;
    // Whatever answers the record holds NOW: one that arrived while the surface
    // was being built is folded with the first, as a replay would fold them.
    foldRecord(k.calibration, r, grid);
    k.folded += 1;
    if (before !== null) {
      live = -1;
      last = { index: index, record: r, grid: grid, before: before };
    }
    save();
  }
}

/** Copy one calibration into another IN PLACE, so every holder of the app's
 *  reference sees it. */
function assign(into: Calibration, from: Calibration): void {
  into.posterior.particles = from.posterior.particles;
  into.posterior.weights = from.posterior.weights;
  into.posterior.rng = from.posterior.rng;
  into.eggsLogged = from.eggsLogged;
  if (from.start !== undefined) into.start = from.start;
}

/**
 * The cook's second answer about an egg already written down - the yolk after
 * the white, the white after the yolk, or a probe reading before or after
 * either. "Second" means any answer after the first: each one refolds
 * the egg with everything it now holds.
 *
 * If the egg has not been folded yet (its surface is still being built), the
 * answer is simply written into its record, and the fold picks up both. If it
 * has, the egg is folded AGAIN from the calibration as it stood before it,
 * against the same surface - so the posterior is what a replay of the log will
 * make, whichever order the answers came in. Refused, and nothing is written,
 * when that is no longer possible: another egg has been logged since, or the
 * page was reloaded and the surface is gone. Writing an answer the posterior
 * does not hold would break the one invariant the log exists for.
 *
 * Returns whether the answer was taken.
 */
export async function recordSecondAnswer(
  index: number, answer: { yolk?: Feedback; white?: WhiteReport; probe?: ProbeReading },
): Promise<boolean> {
  const had = kept.log[index];
  // Another tab's store first: the answer is written only to the egg it was
  // given for, and only if no other egg has been logged since.
  if (current() && !sameRecord(kept.log[index], had)) return false;
  const r = kept.log[index];
  if (r === undefined || index !== kept.log.length - 1) return false;
  if (answer.yolk !== undefined && r.yolk !== null) return false;
  if (answer.white !== undefined && r.white !== null) return false;
  if (answer.probe !== undefined && r.probe !== null) return false;
  if (kept.folded <= index) {
    if (answer.yolk !== undefined) r.yolk = answer.yolk;
    if (answer.white !== undefined) r.white = answer.white;
    if (answer.probe !== undefined) r.probe = answer.probe;
    save();
    await learn(index);
    return true;
  }
  const o = last;
  if (o === null || o.index !== index || o.record !== r || kept.folded !== index + 1) return false;
  if (answer.yolk !== undefined) r.yolk = answer.yolk;
  if (answer.white !== undefined) r.white = answer.white;
  if (answer.probe !== undefined) r.probe = answer.probe;
  const again = copyCalibration(o.before);
  foldRecord(again, r, o.grid);
  assign(kept.calibration, again);
  save();
  return true;
}

/** Forget every egg: the posterior, the base under it, the log and every copy
 *  kept aside - the cook asked for it, and confirmed. A run of
 *  wrong answers about how an egg was is otherwise undone only by clearing the
 *  site's storage, and the honest thing is to let someone take it back. The iOS
 *  app has the same. */
export function clearCalibration(): Calibration {
  generation += 1;
  live = -1;
  last = null;
  removeStorage(KEY);
  seen = null;
  removeStorage(UNREAD_KEY);
  removeStorage(UNREAD_COOK_KEY);
  for (const key of SUPERSEDED_KEYS) removeStorage(key);
  kept = freshKept();
  return kept.calibration;
}

/* ------------------------------------------------------ the dose surface */

interface Waiting {
  job: Job;
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
}

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const waiting = new Map<number, Waiting>();

/** Build on this thread, after yielding once so whatever the caller just put on
 *  screen paints before the build blocks it. The fallback, and the path the
 *  tests take, since Node has no Web Worker. */
function onThisThread(job: Job): Promise<unknown> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(runJob(job));
      } catch (error) {
        reject(error);
      }
    }, 30);
  });
}

/** Give up on the worker and finish whatever it was holding here instead. */
function abandonWorker(): void {
  workerFailed = true;
  if (worker !== null) worker.terminate();
  worker = null;
  const held = Array.from(waiting.values());
  waiting.clear();
  for (const w of held) onThisThread(w.job).then(w.resolve, w.reject);
}

function gridWorker(): Worker | null {
  if (worker !== null) return worker;
  if (workerFailed || typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./gridWorker.js', import.meta.url), { type: 'module' });
  } catch {
    workerFailed = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<{
    id: number; grid?: DoseGrid; profile?: OddsProfile;
  }>) => {
    const w = waiting.get(event.data.id);
    if (w === undefined) return;
    waiting.delete(event.data.id);
    const result = event.data.grid ?? event.data.profile;
    if (result !== undefined) w.resolve(result);
    else onThisThread(w.job).then(w.resolve, w.reject);
  };
  // A browser without module workers, or a worker file that did not ship,
  // lands here. The fold still happens; it just blocks the page while it runs.
  worker.onerror = () => abandonWorker();
  return worker;
}

function offThread(job: Job): Promise<unknown> {
  const w = gridWorker();
  if (w === null) return onThisThread(job);
  return new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { job: job, resolve: resolve, reject: reject });
    w.postMessage({ id: id, ...job });
  });
}

function buildOffThread(request: GridRequest): Promise<DoseGrid> {
  return offThread({ request: request }) as Promise<DoseGrid>;
}

/* ---------------------------------------------------- the decision's surface */

/** Decision surfaces by what they were built from. One per setup: the
 *  slider is not part of the key, so dragging it never waits for one. A handful
 *  is plenty - the pot on screen, the one before, and a cold start's measured
 *  ramp - and the oldest goes first. */
const decisionGrids = new Map<string, DoseGrid>();
const decisionBuilds = new Map<string, Promise<DoseGrid>>();
const DECISION_GRIDS_KEPT = 6;

export function decisionKey(inputs: DecisionInputs): string {
  return JSON.stringify(inputs);
}

/** The surface for these inputs if it has been built, or null. */
export function cachedDecisionGrid(inputs: DecisionInputs): DoseGrid | null {
  return decisionGrids.get(decisionKey(inputs)) ?? null;
}

/** The surface for these inputs, built in the worker if it has not been. Two
 *  asks for the same inputs share one build. */
export function decisionGrid(inputs: DecisionInputs): Promise<DoseGrid> {
  const key = decisionKey(inputs);
  const done = decisionGrids.get(key);
  if (done !== undefined) return Promise.resolve(done);
  const running = decisionBuilds.get(key);
  if (running !== undefined) return running;
  // A build that fails leaves no trace, so the next ask starts a fresh one.
  const build = (offThread({ decision: inputs }) as Promise<DoseGrid>).then((grid) => {
    decisionGrids.set(key, grid);
    while (decisionGrids.size > DECISION_GRIDS_KEPT) {
      const oldest = decisionGrids.keys().next().value;
      if (oldest === undefined) break;
      decisionGrids.delete(oldest);
    }
    return grid;
  }).finally(() => decisionBuilds.delete(key));
  decisionBuilds.set(key, build);
  return build;
}

/* ------------------------------------------------- the odds at every level */

/** Odds profiles, by pot AND posterior: unlike the surface, a profile reads
 *  every particle, so an egg folded - or a second answer refolded, which keeps
 *  the count - makes a new one. Kept like the surfaces, a handful at a time. */
const profiles = new Map<string, OddsProfile>();
const profileBuilds = new Map<string, Promise<OddsProfile>>();
const PROFILES_KEPT = 8;

/** A cheap summary of where the posterior stands: the count, the resampler's
 *  state and the weighted sums of every dimension. Any fold moves at least
 *  one of them. */
function posteriorPrint(c: Calibration): string {
  const post = c.posterior;
  let a = 0;
  let b = 0;
  let d = 0;
  let e = 0;
  for (let i = 0; i < post.particles.length; i++) {
    const p = post.particles[i];
    const w = post.weights[i];
    a += w * p.alpha_m2s;
    b += w * p.logDoseOffset;
    d += w * (p.noise + p.tauAirScale);
    e += w * (p.whiteOffset + p.whiteFirmGap);
  }
  return `${c.eggsLogged}|${post.rng}|${post.particles.length}|${a}|${b}|${d}|${e}`;
}

export function profileKey(inputs: DecisionInputs, c: Calibration): string {
  return `${decisionKey(inputs)}#${posteriorPrint(c)}`;
}

/** The profile for this pot and posterior if it has been computed, or null. */
export function cachedOddsProfile(inputs: DecisionInputs, c: Calibration): OddsProfile | null {
  return profiles.get(profileKey(inputs, c)) ?? null;
}

/**
 * The odds at every level for this pot and posterior, computed in the worker
 * on the pot's decision surface, which is built first if it has not been. A
 * profile is a couple of dozen solves and decisions, 0.3-1 s in the worker
 * (`npm run decide -- reach`). The posterior is copied as it stands now, so a
 * fold landing meanwhile cannot change what the profile is of.
 */
export function oddsProfileFor(inputs: DecisionInputs, c: Calibration): Promise<OddsProfile> {
  const key = profileKey(inputs, c);
  const done = profiles.get(key);
  if (done !== undefined) return Promise.resolve(done);
  const running = profileBuilds.get(key);
  if (running !== undefined) return running;
  const snapshot = copyCalibration(c);
  const build = decisionGrid(inputs)
    .then((grid) => offThread({
      profile: { calibration: snapshot, egg: inputs.egg, setup: inputs.setup, grid: grid },
    }) as Promise<OddsProfile>)
    .then((profile) => {
      profiles.set(key, profile);
      while (profiles.size > PROFILES_KEPT) {
        const oldest = profiles.keys().next().value;
        if (oldest === undefined) break;
        profiles.delete(oldest);
      }
      return profile;
    })
    .finally(() => profileBuilds.delete(key));
  profileBuilds.set(key, build);
  return build;
}
