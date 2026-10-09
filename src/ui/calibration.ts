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
 * logged egg, off the main thread (`offThread.ts`), so the page stays live
 * while it runs. What is kept, and its format in storage, is
 * calibrationStore.ts; the record of one egg is eggRecord.ts.
 */

import { Doneness, ModelParams } from '../core/solve.js';
import { DoseGrid } from '../core/doseGrid.js';
import { WhiteReport, YolkWord } from '../core/infer.js';
import { calibrationGrid } from '../core/policy.js';
import {
  Calibration, EggRecord, LIKELIHOOD_ID, ProbeReading,
  calibrationDoneness as donenessOf, calibrationParams as paramsOf, copyCalibration, foldRecord,
  gridRequestFor, recordTeaches, resultsFile, resultsFileName,
} from '../core/record.js';
import { Decoded, Kept, encodeKept, freshKept, keptStore, startOf } from './calibrationStore.js';
import { localDay } from './model.js';
import { buildOffThread } from './offThread.js';
import { activePopulation } from './population.js';
import { APP_VERSION } from './version.js';
import { storageReadOnly } from './store.js';

export type { Calibration } from '../core/record.js';

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
/** The likelihood this page folds under: `LIKELIHOOD_ID`, unless a test
 *  loads a second page as another build would be (`loadCalibration`). */
let likelihoodId = LIKELIHOOD_ID;
/** The store: another tab's write is taken up before this one writes
 *  (`current`), since every tab writes the whole store, and a tab that wrote
 *  back what it loaded would undo every egg another tab logged since. One
 *  this page would not have written is folded in memory and not written
 *  back until this page's own next change: an egg logged, an answer given,
 *  everything forgotten (`owns`). */
const store = keptStore(() => likelihoodId);
/**
 * The eggs another tab wrote down while this page was open, by `id`. Only
 * the page that wrote an egg down folds it while it is the newest in the
 * log: that page holds what a second answer to it needs (`last`), and a
 * page that folded it first would leave that answer nowhere to go. Once
 * another egg follows it, no second answer can come, and any page folds it.
 */
let elsewhere = new Set<number>();

function save(): void {
  store.write(encodeKept(kept, activePopulation(), likelihoodId));
}

/** Take up what another tab wrote, if it wrote anything since this one last
 *  read or wrote: before every change, so a change lands on the store as it
 *  is now. Says whether there was anything to take up. */
function current(): boolean {
  const taken = store.takeUp();
  if (taken === null) return false;
  adopt(taken.theirs);
  return true;
}

/**
 * Another tab's store, as a load reads one (`decodeKept`), into the
 * calibration the page already holds, so every holder of the reference sees
 * it. A fold under way lands on nothing, and the drain goes round again on
 * what is there now. The egg on screen keeps its chance of a second answer
 * only if the other tab left it where it was.
 *
 * Nothing is written back, whatever the store turned out to be: what this
 * page makes of it is written with its own next change, and not before. A
 * page that wrote back every store it could not use as it was would answer
 * another build's every write with one of its own, and the other build
 * would answer in kind, for as long as both were open.
 *
 * What this page has folded is kept, not replayed, when the store needs a
 * replay only because another build folded it (`rebuild`) and the eggs this
 * page folded are still the first in the log: its posterior is still this
 * build's replay of them, and only the eggs after need folding.
 */
function adopt(decoded: Decoded): void {
  const had = kept;
  const next = decoded.kept;
  if (keepsFolds(had, decoded)) {
    kept = { ...next, base: had.base, calibration: had.calibration, folded: had.folded };
  } else {
    assign(had.calibration, next.calibration);
    kept = { ...next, calibration: had.calibration };
  }
  generation += 1;
  const known = new Set<number>();
  for (const r of had.log) {
    const id = idOf(r);
    if (id !== null) known.add(id);
  }
  for (const r of kept.log) {
    const id = idOf(r);
    if (id !== null && !known.has(id)) elsewhere.add(id);
  }
  if (live >= 0 && !sameEgg(kept.log[live], had.log[live])) live = -1;
  if (last !== null) {
    const r = kept.log[last.index];
    last = r !== undefined && sameEgg(r, last.record)
      && kept.log.length === last.index + 1 && kept.folded === last.index + 1
      ? { ...last, record: r } : null;
  }
}

/** Whether a store taken up can keep what this page has folded: a store
 *  that would be replayed, or is behind this page, over the same eggs this
 *  page folded, from the prior. */
function keepsFolds(had: Kept, decoded: Decoded): boolean {
  const next = decoded.kept;
  if (decoded.path !== 'rebuild' && !(decoded.path === 'loaded' && next.folded < had.folded)) return false;
  if (had.base !== null || next.base !== null || next.log.length < had.folded) return false;
  for (let i = 0; i < had.folded; i++) {
    if (!sameRecord(next.log[i], had.log[i])) return false;
  }
  return true;
}

function sameRecord(a: EggRecord | undefined, b: EggRecord | undefined): boolean {
  return a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b);
}

/** The same egg: the same cook, by `id`, whatever answers another tab has
 *  added to it since; the same record, for one without an id. */
function sameEgg(a: EggRecord | undefined, b: EggRecord | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  const id = idOf(a);
  return id !== null && idOf(b) !== null ? id === idOf(b) : sameRecord(a, b);
}

/** The cook a record is of, or null for one without an id. */
function idOf(r: EggRecord): number | null {
  return r.id ?? null;
}

/** Another tab changed storage (the page's `storage` event, whose key is
 *  null when a tab cleared it all): taken up now, if it touched the store.
 *  Says whether it did, so the page can redraw and fold what is behind. */
export function calibrationStoredElsewhere(key: string | null): boolean {
  return store.touches(key) && current();
}

/** Whatever is in storage, made safe (see `decodeKept`). The posterior it
 *  returns is the one the app solves with, and it is folded into IN PLACE as
 *  eggs are learned, so the caller's reference stays current. If the posterior
 *  is behind the log, call `learn()` to catch it up. */
export function loadCalibration(likelihood = LIKELIHOOD_ID): Calibration {
  likelihoodId = likelihood;
  elsewhere = new Set<number>();
  const decoded = store.load();
  kept = decoded.kept;
  if (decoded.path !== 'loaded') save();
  return kept.calibration;
}

/**
 * The results file (`resultsFile` in core): the store exactly as stored, and
 * the sharing ID if there is one. Its name is the local day. Null when there
 * is no egg to export.
 */
export function exportResults(uid: string | null, now_ms: number): { name: string; text: string } | null {
  if (kept.log.length === 0) return null;
  const text = resultsFile({
    app: 'web', appVersion: APP_VERSION, exported: new Date(now_ms).toISOString(),
    population: activePopulation().id, uid: uid,
  }, store.text());
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

/**
 * Write one egg down, before anything is learned from it: a reload between the
 * answer and the fold then refolds it on load rather than losing it or folding
 * it twice. Returns its index in the log, or -1 while a newer build's
 * stores are left alone (store.ts): then nothing is written down, so
 * nothing is learned either.
 *
 * An egg already written down - the same cook, by `id`, from another tab or
 * from this one - is not written twice. The record given is the cook as last
 * corrected, so its facts replace the ones logged (review 2.5: two tabs can
 * run one id with different corrections), with the answers already in the
 * log kept as they are; an answer given with it is a later answer to that
 * egg (`recordSecondAnswer`). When that changes an egg already folded, the
 * posterior no longer holds the log, and the log is folded again from where
 * it starts (`base`, or the prior), the path a model change takes; the caller
 * then `learn`s, as after any egg logged.
 */
export function logEgg(r: EggRecord): number {
  if (storageReadOnly()) return -1;
  const at = eggLogged(idOf(r));
  if (at < 0) {
    kept.log.push(r);
    save();
    return kept.log.length - 1;
  }
  const had = kept.log[at];
  const next: EggRecord = { ...r, yolkWord: had.yolkWord, white: had.white, probe: had.probe };
  if (sameRecord(next, had)) return at;
  kept.log[at] = next;
  if (at < kept.folded) refoldFromStart();
  save();
  return at;
}

/** The posterior taken back to where the log's replay starts, with nothing
 *  folded, so the drain folds the whole log again. A fold under way lands on
 *  nothing, and no second answer can refold what it held. */
function refoldFromStart(): void {
  assign(kept.calibration, startOf(kept.base));
  kept.folded = 0;
  generation += 1;
  live = -1;
  last = null;
}

/** Where the cook that started at `id` is in the log, with whatever another
 *  tab wrote since taken up first; -1 if it is not there, or has no id. */
export function eggLogged(id: number | null): number {
  current();
  if (id === null) return -1;
  for (let i = kept.log.length - 1; i >= 0; i--) {
    if (idOf(kept.log[i]) === id) return i;
  }
  return -1;
}

/**
 * The calibration before the egg of the cook `id`, for a correction made
 * after its pull (design/one-screen.md section 4, "Never from its own
 * outcome"; core `asRanCorrected`): a plan made for that cook on a posterior
 * that has folded its own answer would score the model against what it
 * already learned from it. A copy, never the page's own.
 *
 * - Not in the log, or not folded yet: the calibration as it stands, which
 *   has learned nothing from it.
 * - Folded on this page, and the newest egg: the calibration this page held
 *   before folding it (`last.before`), as a second answer refolds from.
 * - Otherwise (a reload since, or another egg after it): the log replayed
 *   from where it starts up to this egg, a surface per egg built off the
 *   main thread, as a refold does.
 */
export async function calibrationBefore(id: number): Promise<Calibration> {
  const at = eggLogged(id);
  if (at < 0 || at >= kept.folded) return copyCalibration(kept.calibration);
  const o = last;
  if (o !== null && o.index === at && idOf(o.record) === id) return copyCalibration(o.before);
  const c = startOf(kept.base);
  const log = kept.log.slice(0, at);
  for (const r of log) {
    if (!recordTeaches(r)) continue;
    const grid = await buildOffThread(gridRequestFor(c, r, calibrationGrid));
    foldRecord(c, r, grid);
  }
  return c;
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
    // Another tab's newest egg is that tab's to fold (`elsewhere`).
    const id = idOf(r);
    if (index === k.log.length - 1 && id !== null && elsewhere.has(id)) return;
    if (!recordTeaches(r)) {
      k.folded += 1;
      if (store.owns()) save();
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
    if (store.owns()) save();
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
 * when that is no longer possible: another egg has been logged since, the
 * question was answered already, or the surface is gone - the page was
 * reloaded, or another tab wrote the egg down and folded it. Writing an
 * answer the posterior does not hold would break the one invariant the log
 * exists for.
 *
 * An egg another tab wrote down and has not yet folded takes the answer:
 * written into its record, and folded by that tab with the rest
 * (`elsewhere`).
 *
 * Returns whether the answer was taken; the caller says nothing was kept
 * when it was not.
 */
export async function recordSecondAnswer(
  index: number, answer: { yolkWord?: YolkWord; white?: WhiteReport; probe?: ProbeReading },
): Promise<boolean> {
  if (storageReadOnly()) return false;
  const had = kept.log[index];
  // Another tab's store first: the answer is written only to the egg it was
  // given for, and only if no other egg has been logged since.
  if (current() && !sameEgg(kept.log[index], had)) return false;
  const r = kept.log[index];
  if (r === undefined || index !== kept.log.length - 1) return false;
  if (answer.yolkWord !== undefined && r.yolkWord !== null) return false;
  if (answer.white !== undefined && r.white !== null) return false;
  if (answer.probe !== undefined && r.probe !== null) return false;
  if (kept.folded <= index) {
    if (answer.yolkWord !== undefined) r.yolkWord = answer.yolkWord;
    if (answer.white !== undefined) r.white = answer.white;
    if (answer.probe !== undefined) r.probe = answer.probe;
    save();
    await learn(index);
    return true;
  }
  const o = last;
  if (o === null || o.index !== index || o.record !== r || kept.folded !== index + 1) return false;
  if (answer.yolkWord !== undefined) r.yolkWord = answer.yolkWord;
  if (answer.white !== undefined) r.white = answer.white;
  if (answer.probe !== undefined) r.probe = answer.probe;
  const again = copyCalibration(o.before);
  foldRecord(again, r, o.grid);
  assign(kept.calibration, again);
  save();
  return true;
}

/**
 * A cook's record (core `step`'s `log`), kept and learned from: written down
 * and folded (`logEgg`, `learn`) if the egg is not in the log; otherwise the
 * one logged under its id made the record's, its first answers kept - its
 * facts replaced (`logEgg`), and each answer it adds folded as a later
 * answer (`recordSecondAnswer`), or, where that can no longer be done, the
 * log folded again from where it starts. Whether it was kept: never while a
 * newer build's stores are left alone.
 */
export async function keepRecord(r: EggRecord): Promise<boolean> {
  if (storageReadOnly()) return false;
  const at = eggLogged(idOf(r));
  if (at < 0) {
    const index = logEgg(r);
    if (index < 0) return false;
    await learn(index);
    return true;
  }
  const had = kept.log[at];
  const second: { yolkWord?: YolkWord; white?: WhiteReport; probe?: ProbeReading } = {};
  if (had.yolkWord === null && r.yolkWord !== null) second.yolkWord = r.yolkWord;
  if (had.white === null && r.white !== null) second.white = r.white;
  if (had.probe === null && r.probe !== null) second.probe = r.probe;
  logEgg(r);
  if (second.yolkWord === undefined && second.white === undefined && second.probe === undefined) {
    await learn();
    return true;
  }
  if (!(await recordSecondAnswer(at, second))) {
    const now = kept.log[at];
    if (now === undefined || idOf(now) !== idOf(r)) return false;
    Object.assign(now, second);
    if (at < kept.folded) refoldFromStart();
    save();
  }
  await learn();
  return true;
}

/** Forget every egg: the posterior, the base under it and the log - the cook
 *  asked for it, and confirmed. A run of
 *  wrong answers about how an egg was is otherwise undone only by clearing the
 *  site's storage, and the honest thing is to let someone take it back. The iOS
 *  app has the same. */
export function clearCalibration(): Calibration {
  generation += 1;
  live = -1;
  last = null;
  store.remove();
  elsewhere = new Set<number>();
  kept = freshKept();
  return kept.calibration;
}
