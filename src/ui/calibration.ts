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
 * likelihood replays the eggs instead of discarding what they taught. The
 * stored posterior is a cache of that replay: `folded` says how many records it
 * has absorbed, and anything past it is folded again on load.
 *
 * The dose surface costs about two seconds to build and is built once per
 * logged egg, in a Web Worker (`gridWorker.ts`), so the page stays live while it
 * runs. If a worker cannot be had, the build falls back to this thread, behind a
 * yield so the "learning" note paints first - which is what it always did.
 */

import { Egg, SizeTable } from '../core/geometry.js';
import { CookSetup } from '../core/protocol.js';
import { ModelParams } from '../core/solve.js';
import { DoseGrid } from '../core/doseGrid.js';
import { Feedback, Particle, WhiteReport, posteriorAlphaRelSd } from '../core/infer.js';
import { CALIBRATION_SEED, PARTICLE_COUNT, calibrationGrid } from '../core/policy.js';
import {
  Calibration, EggFrom, EggRecord, GridRequest, MassFrom, PRIOR_ID, RECORD_VERSION,
  buildRequestedGrid, calibrationParams as paramsOf, copyCalibration, foldWhite, foldYolk,
  freshCalibration as freshFrom, gridRequestFor, parseLog, recordMass_g, recordTeaches,
} from '../core/record.js';
import { UnitSystem } from '../core/units.js';
import { COOLING_SECONDS, Machine } from './machine.js';
import { readStorage, writeStorage, removeStorage } from './store.js';

export type { Calibration } from '../core/record.js';

/** Same number as package.json and the iOS MARKETING_VERSION; a test holds the
 *  first pair together. Carried on every record, because the web app deploys on
 *  push and the iOS app ships later, and the fit has to know which was which. */
export const APP_VERSION = '0.2.0';

/** The posterior, the frozen base under it, and the log. */
const KEY = 'aet.calibration.v3';

/** The posterior E1 replaces - read ONCE, and kept as the frozen base.
 *
 *  Unlike v1 below, this one is kept. It was learned from real eggs under the
 *  likelihood that is still in force, so it is as good as it was yesterday; what
 *  it lacks is the eggs themselves, which were never written down. So it becomes
 *  the BASE: the posterior replays start from instead of the prior, with the log
 *  folded on top of it.
 *
 *  A base cannot be replayed, and so it cannot survive a change to the
 *  likelihood. It is dropped at the next one (E2), which starts again from the
 *  prior and replays the log alone. That is the price of the eggs before E1 not
 *  having been kept, and it is paid once.
 *
 *  Removed once a v3 has been written. An old tab still open across the deploy
 *  can write this key again; a v3 already present wins, and the stray is
 *  deleted, which loses that one egg rather than inventing a merge. */
const BASE_KEY = 'aet.calibration.v2';

/** The posterior v2 replaced, deleted rather than read.
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

/** Everything that is kept, and the one invariant that holds it together:
 *  `calibration` is `replay(base ?? prior, log.slice(0, folded))`. */
export interface Kept {
  /** The frozen v2 posterior this phone migrated with, or null. */
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

/** Spread of the posterior on alpha, as a percentage. Plateaus near 3%: ordinal
 *  feedback carries 1-2 bits per egg, so learning correctly stops rather than
 *  falsely converging. */
export function calibrationSpread(c: Calibration): number {
  if (c.eggsLogged === 0) return 0;
  return 100 * posteriorAlphaRelSd(c.posterior);
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
 * ran it.
 *
 * `pulled_s` is the cook's own tap out of PULL when there was one. When the
 * grace ran out instead, nobody said when the egg came out, and the record says
 * so: `pulledBy: 'timeout'`, with the scheduled time standing in as an
 * assumption.
 */
export function eggRecordFor(c: Cooked, m: Machine, yolk: Feedback | null): EggRecord {
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
    cooled_s: m.cooling === 'counter' ? 0 : COOLING_SECONDS,
    yolk: yolk,
    white: null,
    whiteOffered: false,
    probe: null,
    lang: 'en',
    register: 'modern',
    units: c.units,
  };
}

/* ------------------------------------------------------------- persistence */

/** Column-wise. The current posterior is written at full precision: it is a
 *  cache of a replay, and a cache that rounds is one a replay can never match.
 *  JSON.stringify writes the shortest string that reads back as the same
 *  double, so full precision is exact, and about 90 KB. A migrated base keeps
 *  the five figures it was stored at in v2. */
interface StoredPosterior {
  n: number;
  a: number[];
  o: number[];
  t: number[];
  w: number[];
  rng: number;
}

interface StoredV3 {
  v: 3;
  base: StoredPosterior | null;
  cal: StoredPosterior;
  folded: number;
  log: EggRecord[];
}

function storedPosterior(c: Calibration): StoredPosterior {
  const p = c.posterior.particles;
  const s: StoredPosterior = { n: c.eggsLogged, rng: c.posterior.rng, a: [], o: [], t: [], w: [] };
  for (let i = 0; i < p.length; i++) {
    s.a.push(p[i].alpha_m2s);
    s.o.push(p[i].logDoseOffset);
    s.t.push(p[i].tauAirScale);
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
 *  poison every solve. The rules are the same for v2 and v3. */
function readPosterior(raw: unknown): Calibration | null {
  if (raw === null || typeof raw !== 'object') return null;
  const s = raw as Partial<StoredPosterior>;
  if (!Array.isArray(s.a) || s.a.length === 0) return null;
  const n = s.a.length;
  // alpha and tauAirScale are strictly positive; a weight may be zero but
  // never negative; the taste offset is a log-dose shift and may be anything
  // finite. Same rules as ios/App/Calibration.swift.
  if (
    !numberArray(s.a, n, 0, true) || !numberArray(s.o, n, -Infinity, false)
    || !numberArray(s.t, n, 0, true) || !numberArray(s.w, n, 0, false)
  ) {
    return null;
  }
  if (typeof s.n !== 'number' || !Number.isInteger(s.n) || s.n < 0) return null;
  if (typeof s.rng !== 'number' || !Number.isInteger(s.rng)) return null;
  const particles: Particle[] = new Array<Particle>(n);
  const weights: number[] = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    particles[i] = { alpha_m2s: s.a[i], logDoseOffset: s.o[i], tauAirScale: s.t[i] };
    weights[i] = s.w[i];
  }
  return { posterior: { particles: particles, weights: weights, rng: s.rng }, eggsLogged: s.n };
}

export function encodeKept(k: Kept): string {
  const stored: StoredV3 = {
    v: 3,
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
  | 'fresh' | 'loaded' | 'migrated' | 'rebased' | 'rebuild';

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
 *  - no v3, a good v2: `migrated`. The v2 posterior becomes the frozen base.
 *  - no v3, no usable v2: `fresh`, the prior.
 *  - the posterior damaged, the log good: `rebuild`. The log is the truth, so
 *    the posterior is set back to its start and every record is folded again.
 *  - the log damaged: `rebased`. The records cannot be folded, but what they
 *    taught is in the posterior, which is sound - so it becomes the new frozen
 *    base, and the log starts again empty. What is lost is the ability to
 *    replay those eggs, not what they taught.
 *  - a posterior that has absorbed more records than the log holds: also
 *    `rebased`, for the same reason.
 *  - a base that is damaged: dropped, and the log replayed from the prior.
 *
 * Pure, so the tests can walk every path without a browser.
 */
export function decodeKept(v3raw: string | null, v2raw: string | null): Decoded {
  const obj = parseJSON(v3raw);
  if (obj === null || typeof obj !== 'object' || (obj as { v?: unknown }).v !== 3) {
    const v2 = parseJSON(v2raw);
    const base = v2 !== null && typeof v2 === 'object' && (v2 as { v?: unknown }).v === 2
      ? readPosterior(v2) : null;
    if (base === null) return { kept: freshKept(), path: 'fresh' };
    return {
      kept: { base: base, calibration: copyCalibration(base), folded: 0, log: [] },
      path: 'migrated',
    };
  }
  const s = obj as Partial<Record<keyof StoredV3, unknown>>;
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
/** The record whose cook is on screen waiting to hear whether to ask about the
 *  white. Every other record is folded quietly. */
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
  // Whatever v1 left behind goes now, rather than sitting in storage being
  // neither read nor collected.
  removeStorage(SUPERSEDED_KEY);
  const decoded = decodeKept(readStorage(KEY), readStorage(BASE_KEY));
  kept = decoded.kept;
  if (decoded.path !== 'loaded') save();
  // The v2 key is the only copy of a base until a v3 holding it is written, and
  // storage can refuse the write.
  if (readStorage(KEY) !== null) removeStorage(BASE_KEY);
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

/** What folding one live egg leaves behind: the surface its yolk answer was
 *  scored against, and whether the white is worth a second question. */
export interface Outcome {
  index: number;
  record: EggRecord;
  /** Kept so the white answer can be folded without paying for the surface
   *  twice. Not persisted: a reload drops a pending white question rather than
   *  rebuilding two seconds of arithmetic to ask again. */
  grid: DoseGrid;
  askWhite: boolean;
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
    const ask = foldYolk(k.calibration, r, grid);
    // A record that already carries a white answer - one caught up after a
    // reload - folds it here, against the same surface, as a replay would.
    foldWhite(k.calibration, r, grid);
    k.folded += 1;
    if (index === live) {
      // Written down with the fold, in the same save: a reload after this
      // point finds a question that was offered, which is the truth.
      r.whiteOffered = ask;
      live = -1;
      last = { index: index, record: r, grid: grid, askWhite: ask };
    }
    save();
  }
}

/** Fold the answer about the white of the same egg, against the surface its
 *  yolk answer was scored on. Refused unless that egg is still the last one
 *  folded - folding it later, after another egg, would be a different posterior
 *  from the one the log replays to. Not a second egg, so the count does not
 *  move. */
export function recordWhite(o: Outcome, white: WhiteReport): void {
  if (kept.log[o.index] !== o.record || kept.folded !== o.index + 1) return;
  if (!o.record.whiteOffered || o.record.white !== null) return;
  o.record.white = white;
  foldWhite(kept.calibration, o.record, o.grid);
  save();
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
  removeStorage(BASE_KEY);
  removeStorage(SUPERSEDED_KEY);
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
