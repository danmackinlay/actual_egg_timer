/**
 * Bridges the particle filter in src/core/ to the app, and keeps the record.
 *
 * The model's constants come from the literature, and the carryover term has no
 * published measurement behind it at all. Rather than pretend otherwise, the app
 * asks how each egg turned out and folds the answer into a posterior. After
 * about three eggs the suggested time stops moving.
 *
 * Since E1 the answer is not thrown away once folded. Each egg is kept as a
 * record (INFERENCE.md section 4) in a log beside the posterior, and the
 * posterior is what `replay` makes of that log - so a later change to the
 * likelihood replays the eggs instead of discarding what they taught. E2 was
 * the first such change: on first load it reads E1's log and folds it again,
 * from the prior, under the new likelihood. The stored posterior is a cache of
 * that replay: `folded` says how many records it has absorbed, and anything past
 * it is folded again on load.
 *
 * The dose surface costs about two seconds to build and is built once per
 * logged egg, in a Web Worker (`gridWorker.ts`), so the page stays live while it
 * runs. If a worker cannot be had, the build falls back to this thread, behind a
 * yield so the "learning" note paints first - which is what it always did.
 */

import { Egg, SizeTable } from '../core/geometry.js';
import { CookSetup } from '../core/protocol.js';
import { Doneness, ModelParams } from '../core/solve.js';
import { DoseGrid } from '../core/doseGrid.js';
import { Feedback, Particle, WhiteReport } from '../core/infer.js';
import { CALIBRATION_SEED, PARTICLE_COUNT, calibrationGrid } from '../core/policy.js';
import {
  Calibration, EggFrom, EggRecord, GridRequest, MassFrom, PRIOR_ID, ProbeReading, RECORD_VERSION,
  buildRequestedGrid, calibrationDoneness as donenessOf, calibrationParams as paramsOf,
  copyCalibration, foldRecord, freshCalibration as freshFrom, gridRequestFor, parseLog,
  recordMass_g, recordTeaches,
} from '../core/record.js';
import { UnitSystem } from '../core/units.js';
import { Machine } from './machine.js';
import { readStorage, writeStorage, removeStorage } from './store.js';

export type { Calibration } from '../core/record.js';

/** Same number as package.json and the iOS MARKETING_VERSION; a test holds the
 *  first pair together. Carried on every record, because the web app deploys on
 *  push and the iOS app ships later, and the fit has to know which was which. */
export const APP_VERSION = '0.2.0';

/** The posterior, the base under it, and the log. v4 since E2, whose particle
 *  has six numbers where E1's had three. */
const KEY = 'aet.calibration.v4';

/** E1's store: the log, a posterior folded under the first likelihood, and the
 *  frozen v2 base under it. Read ONCE, for its log.
 *
 *  The posterior and the base go. Both were folded under the likelihood E2
 *  replaced, and a base cannot be replayed at all: it is what the owner's eggs
 *  from before E1 taught, and those eggs were never written down. The owner
 *  decided on 26 September to drop them here rather than carry a posterior
 *  nothing can reproduce (INFERENCE.md section 11, item 6). The log is kept and
 *  folded again, from the prior, under the new likelihood - which is what the
 *  log was for.
 *
 *  Removed once a v4 has been written. */
const E1_KEY = 'aet.calibration.v3';

/** Every store before the log: the v2 posterior E1 froze as a base, and the v1
 *  one v2 replaced. Neither has a log behind it, so neither can be replayed
 *  under E2's likelihood, and both are deleted rather than read. A phone that
 *  still has a v2 and no v3 never ran E1, and starts from the prior. */
const SUPERSEDED_KEYS = ['aet.calibration.v2', 'aet.calibration.v1'];

/** Everything that is kept, and the one invariant that holds it together:
 *  `calibration` is `replay(base ?? prior, log.slice(0, folded))`. */
export interface Kept {
  /** Where the replay starts when it is not the prior: only ever the posterior
   *  of a log that was damaged and had to be dropped (`rebased`). Null on every
   *  healthy phone since E2 dropped E1's frozen base. */
  base: Calibration | null;
  calibration: Calibration;
  /** How many records `calibration` has absorbed. Behind the log only between
   *  an answer being written down and its surface being built. */
  folded: number;
  log: EggRecord[];
}

export function freshCalibration(): Calibration {
  return freshFrom(PARTICLE_COUNT, CALIBRATION_SEED);
}

function freshKept(): Kept {
  return { base: null, calibration: freshCalibration(), folded: 0, log: [] };
}

/** Where a replay starts: the base if there is one, the prior if not. */
function startOf(base: Calibration | null): Calibration {
  return base === null ? freshCalibration() : copyCalibration(base);
}

/** Parameters to solve with. Before any feedback this is the literature values,
 *  so the app is fully useful on day one and calibration is purely additive. */
export function calibrationParams(c: Calibration): ModelParams {
  return paramsOf(c);
}

/** The doneness to solve for at a slider level: the white's target moves with
 *  what the eggs said about the white (E3). See `calibrationDoneness` in core. */
export function calibrationDoneness(c: Calibration, level: number): Doneness {
  return donenessOf(c, level);
}

/* ------------------------------------------------------------- the record */

/** What a cook was, frozen at "Eggs in" - the fields of app.ts's ticket that a
 *  record needs. */
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
   *  tag such as `en`. */
  lang: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** The LOCAL date a cook started on. A day, not a timestamp. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * The record of one egg, from the cook that was started and the machine that
 * ran it, with whichever answers have been given so far, and the probe reading
 * if there is one (E4). The white is always offered since E2, so
 * `whiteOffered` is always true.
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
    prior: PRIOR_ID,
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
    recommended_s: m.cookTime_s,
    nudge_s: 0,
    pulled_s: measured ? (m.outAt_ms - m.startedAt_ms) / 1000 : m.cookTime_s,
    pulledBy: measured ? 'cook' : 'timeout',
    cooled_s: m.cooling === 'counter' ? 0 : m.cool_s,
    yolk: yolk,
    white: white,
    whiteOffered: true,
    probe: probe,
    lang: c.lang,
    register: 'modern',
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
  /** The noise scale, the white offset and the tender | firm gap (E2, E3). */
  sd: number[];
  wo: number[];
  wg: number[];
  w: number[];
  rng: number;
}

interface StoredV4 {
  v: 4;
  base: StoredPosterior | null;
  cal: StoredPosterior;
  folded: number;
  log: EggRecord[];
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

export function encodeKept(k: Kept): string {
  const stored: StoredV4 = {
    v: 4,
    base: k.base === null ? null : storedPosterior(k.base),
    cal: storedPosterior(k.calibration),
    folded: k.folded,
    log: k.log,
  };
  return JSON.stringify(stored);
}

/** What loading found, for the caller that has to write it back and for the
 *  tests that check each path. */
export type LoadPath =
  | 'fresh' | 'loaded' | 'replayed' | 'rebased' | 'rebuild';

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
 * Every damaged part is refused, never read around, and what is refused depends
 * on what can still be trusted:
 *
 *  - no v4, an E1 store (v3) with a good log: `replayed`. Its posterior and its
 *    frozen base are dropped, and the log is folded again from the prior under
 *    E2's likelihood. The records need no change: E2's schema is E1's, with
 *    three more white answers a loader accepts.
 *  - no v4, and no v3 log that can be read: `fresh`, the prior.
 *  - the posterior damaged, the log good: `rebuild`. The log is the truth, so
 *    the posterior is set back to its start and every record is folded again.
 *  - the log damaged: `rebased`. The records cannot be folded, but what they
 *    taught is in the posterior, which is sound - so it becomes the base, and
 *    the log starts again empty. What is lost is the ability to replay those
 *    eggs, not what they taught.
 *  - a posterior that has absorbed more records than the log holds: also
 *    `rebased`, for the same reason.
 *  - a base that is damaged: dropped, and the log replayed from the prior.
 *
 * Pure, so the tests can walk every path without a browser.
 */
export function decodeKept(v4raw: string | null, v3raw: string | null): Decoded {
  const obj = parseJSON(v4raw);
  if (obj === null || typeof obj !== 'object' || (obj as { v?: unknown }).v !== 4) {
    const v3 = parseJSON(v3raw);
    const log = v3 !== null && typeof v3 === 'object' && (v3 as { v?: unknown }).v === 3
      ? parseLog((v3 as { log?: unknown }).log) : null;
    if (log === null) return { kept: freshKept(), path: 'fresh' };
    return {
      kept: { base: null, calibration: freshCalibration(), folded: 0, log: log },
      path: 'replayed',
    };
  }
  const s = obj as Partial<Record<keyof StoredV4, unknown>>;
  let base: Calibration | null = null;
  let baseLost = false;
  if (s.base !== null) {
    base = readPosterior(s.base);
    baseLost = base === null;
  }
  const cal = readPosterior(s.cal);
  const log = parseLog(s.log);
  const folded = s.folded;
  const foldedOk = typeof folded === 'number' && Number.isInteger(folded) && folded >= 0;

  if (log === null) {
    const sound = cal ?? base;
    return {
      kept: { base: sound, calibration: startOf(sound), folded: 0, log: [] },
      path: 'rebased',
    };
  }
  if (baseLost || cal === null || !foldedOk) {
    return { kept: { base: base, calibration: startOf(base), folded: 0, log: log }, path: 'rebuild' };
  }
  if ((folded as number) > log.length) {
    return { kept: { base: cal, calibration: copyCalibration(cal), folded: 0, log: [] }, path: 'rebased' };
  }
  return { kept: { base: base, calibration: cal, folded: folded as number, log: log }, path: 'loaded' };
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
let last: Outcome | null = null;

function save(): void {
  writeStorage(KEY, encodeKept(kept));
}

/** Whatever is in storage, made safe (see `decodeKept`). The posterior it
 *  returns is the one the app solves with, and it is folded into IN PLACE as
 *  eggs are learned, so the caller's reference stays current. If the posterior
 *  is behind the log, call `learn()` to catch it up. */
export function loadCalibration(): Calibration {
  // Whatever came before the log goes now, rather than sitting in storage
  // being neither read nor collected.
  for (const key of SUPERSEDED_KEYS) removeStorage(key);
  const decoded = decodeKept(readStorage(KEY), readStorage(E1_KEY));
  kept = decoded.kept;
  if (decoded.path !== 'loaded') save();
  // The v3 key is the only copy of E1's log until a v4 holding it is written,
  // and storage can refuse the write.
  if (readStorage(KEY) !== null) removeStorage(E1_KEY);
  return kept.calibration;
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
  kept.log.push(r);
  save();
  return kept.log.length - 1;
}

/** What folding the live egg leaves behind: the surface its answers were
 *  scored against and the calibration as it stood before them, so that a
 *  second answer can fold the egg again rather than on top of itself. */
export interface Outcome {
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
 * Pass the index `logEgg` returned to hear back about that egg; with no index,
 * this only catches the posterior up with the log. Calls made while a fold is
 * running join it, and it runs until the log is empty of unfolded eggs, so
 * nothing written down is ever left behind.
 */
export async function learn(index = -1): Promise<Outcome | null> {
  if (index >= 0) live = index;
  await drain();
  return last !== null && last.index === index && index >= 0 ? last : null;
}

function drain(): Promise<void> {
  if (draining === null) {
    draining = drainLog().finally(() => { draining = null; });
  }
  return draining;
}

async function drainLog(): Promise<void> {
  while (kept.folded < kept.log.length) {
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
    if (gen !== generation) continue;
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
}

/**
 * The cook's second answer about an egg already written down - the yolk after
 * the white, the white after the yolk, or a probe reading before or after
 * either (E4). "Second" means any answer after the first: each one refolds
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

/** Forget every egg: the posterior, the base under it and the log. A run of
 *  wrong answers about how an egg was is otherwise undone only by clearing the
 *  site's storage, and the honest thing is to let someone take it back. The iOS
 *  app has had this since it shipped. */
export function clearCalibration(): Calibration {
  generation += 1;
  live = -1;
  last = null;
  removeStorage(KEY);
  removeStorage(E1_KEY);
  for (const key of SUPERSEDED_KEYS) removeStorage(key);
  kept = freshKept();
  return kept.calibration;
}

/* ------------------------------------------------------ the dose surface */

interface Waiting {
  request: GridRequest;
  resolve: (grid: DoseGrid) => void;
}

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const waiting = new Map<number, Waiting>();

/** Build on this thread, after yielding once so whatever the caller just put on
 *  screen paints before the build blocks it. The fallback, and the path the
 *  tests take, since Node has no Web Worker. */
function onThisThread(request: GridRequest): Promise<DoseGrid> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(buildRequestedGrid(request)), 30);
  });
}

/** Give up on the worker and finish whatever it was holding here instead. */
function abandonWorker(): void {
  workerFailed = true;
  if (worker !== null) worker.terminate();
  worker = null;
  const held = Array.from(waiting.values());
  waiting.clear();
  for (const w of held) void onThisThread(w.request).then(w.resolve);
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
  worker.onmessage = (event: MessageEvent<{ id: number; grid?: DoseGrid }>) => {
    const w = waiting.get(event.data.id);
    if (w === undefined) return;
    waiting.delete(event.data.id);
    if (event.data.grid !== undefined) w.resolve(event.data.grid);
    else void onThisThread(w.request).then(w.resolve);
  };
  // A browser without module workers, or a worker file that did not ship,
  // lands here. The fold still happens; it just blocks the page as it used to.
  worker.onerror = () => abandonWorker();
  return worker;
}

function buildOffThread(request: GridRequest): Promise<DoseGrid> {
  const w = gridWorker();
  if (w === null) return onThisThread(request);
  return new Promise((resolve) => {
    const id = nextId++;
    waiting.set(id, { request: request, resolve: resolve });
    w.postMessage({ id: id, request: request });
  });
}
