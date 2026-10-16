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
 * calibrationStore.ts; the record of one egg is core's, made by `step`.
 */

import type { Doneness, ModelParams } from '../core/solve.ts';
import type { DoseGrid } from '../core/doseGrid.ts';
import type { WhiteReport, YolkWord } from '../core/infer.ts';
import {
  type Calibration, type EggRecord, LIKELIHOOD_ID, type ProbeReading, calibrationDoneness as donenessOf, calibrationGrid,
  calibrationParams as paramsOf, copyCalibration, foldRecord, gridRequestFor, recordTeaches, resultsFile,
  resultsFileName,
} from '../core/record.ts';
import { type Kept, encodeKept, freshKept, keptStore, startOf } from './calibrationStore.ts';
import { localDay } from './model.ts';
import { buildOffThread } from './offThread.ts';
import { activePopulation } from './population.ts';
import { APP_VERSION } from './version.ts';

export type { Calibration } from '../core/record.ts';

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

/* ------------------------------------------------------------- the store */

/** What a page has learned, and how it learns more (`openLearner`). */
export type Learner = ReturnType<typeof openLearner>;

/**
 * The page's store of what it has learned, opened from whatever is in
 * storage, made safe (see `decodeKept`): the store, the log and the
 * posterior folded from it, and the folds under way. One per page, opened
 * at boot (app.ts) and held by the runner (cook.ts); a test opens one for
 * each page it plays. The posterior (`calibration`) is the one the app
 * solves with, and it is folded into IN PLACE as eggs are learned, so the
 * caller's reference stays current. If it is behind the log, `learn()`
 * catches it up. It folds under `likelihood`: `LIKELIHOOD_ID`, unless a test
 * opens a page as another build would be.
 */
export function openLearner(likelihood = LIKELIHOOD_ID) {
  const store = keptStore(() => likelihood);
  const decoded = store.load();
  let kept: Kept = decoded.kept;
  /** Bumped by "forget everything", so a fold whose surface was still being built
   *  when the button was pressed lands on nothing rather than on the fresh prior. */
  let generation = 0;
  let draining: Promise<void> | null = null;
  /** Whether the page has stopped owning the app (`close`): nothing more is
   *  folded. */
  let closed = false;
  /** The record whose cook is on screen, whose second answer may still come.
   *  Every other record is folded quietly. */
  let live = -1;
  let last: LiveFold | null = null;
  function save(): void {
    store.write(encodeKept(kept, activePopulation(), likelihood));
  }

  /**
   * The results file (`resultsFile` in core): the store exactly as stored, and
   * the sharing ID if there is one. Its name is the local day. Null when there
   * is no egg to export.
   */
  function exportResults(uid: string | null, now_ms: number): { name: string; text: string } | null {
    if (kept.log.length === 0) return null;
    const text = resultsFile({
      app: 'web', appVersion: APP_VERSION, exported: new Date(now_ms).toISOString(),
      population: activePopulation().id, uid: uid,
    }, store.text());
    return { name: resultsFileName(localDay(now_ms)), text: text };
  }

  /** How many eggs are written down and not yet folded. */
  function eggsBehind(): number {
    return kept.log.length - kept.folded;
  }

  /** Everything kept, for tests and for anyone reading the log back. */
  function keptState(): Kept {
    return kept;
  }

  /**
   * Write one egg down, before anything is learned from it: a reload between the
   * answer and the fold then refolds it on load rather than losing it or folding
   * it twice. Returns its index in the log.
   *
   * An egg already written down - the same cook, by `id` - is not written
   * twice. The record given is the cook as last corrected, so its facts
   * replace the ones logged (a correction after the egg was logged), with
   * the answers already in the log kept as they are; an answer given with
   * it is a later answer to that egg (`recordSecondAnswer`). When that changes an egg already folded, the
   * posterior no longer holds the log, and the log is folded again from where
   * it starts (`base`, or the prior), the path a model change takes; the caller
   * then `learn`s, as after any egg logged.
   */
  function logEgg(r: EggRecord): number {
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

  /** Where the cook that started at `id` is in the log; -1 if it is not
   *  there, or has no id. */
  function eggLogged(id: number | null): number {
    if (id === null) return -1;
    for (let i = kept.log.length - 1; i >= 0; i--) {
      if (idOf(kept.log[i]) === id) return i;
    }
    return -1;
  }

  /**
   * The calibration before the egg of the cook `id`, for a correction made
   * after its pull, never from its own outcome (core `asRanCorrected`): a plan made for that cook on a posterior
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
  async function calibrationBefore(id: number): Promise<Calibration> {
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

  /**
   * Fold every egg not yet folded, one surface at a time, off the main thread.
   *
   * Pass the index `logEgg` returned for the egg on screen, so a second answer
   * to it can be folded again (`recordSecondAnswer`); with no index, this only
   * catches the posterior up with the log. Calls made while a fold is
   * running join it, and it runs until the log is empty of unfolded eggs, so
   * nothing written down is ever left behind.
   */
  async function learn(index = -1): Promise<void> {
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
      if (closed) return;
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
      let grid: DoseGrid;
      try {
        grid = await buildOffThread(gridRequestFor(k.calibration, r, calibrationGrid));
      } catch (error: unknown) {
        // The page stood down while the surface was built (`close`).
        if (closed) return;
        throw error;
      }
      // Everything forgotten, or the log refolded, while the surface was
      // being built: folded again from where it stands.
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
   * reloaded since. Writing an answer the posterior does not hold would break
   * the one invariant the log exists for.
   *
   * Returns whether the answer was taken; the caller says nothing was kept
   * when it was not.
   */
  async function recordSecondAnswer(
    index: number, answer: { yolkWord?: YolkWord; white?: WhiteReport; probe?: ProbeReading },
  ): Promise<boolean> {
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
   * log folded again from where it starts. Whether it was kept.
   */
  async function keepRecord(r: EggRecord): Promise<boolean> {
    const at = eggLogged(idOf(r));
    if (at < 0) {
      const index = logEgg(r);
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
  function clear(): Calibration {
    generation += 1;
    live = -1;
    last = null;
    store.remove();
    kept = freshKept();
    return kept.calibration;
  }

  /** The page no longer owns the app (owner.ts): the drain stops, and a
   *  fold under way lands on nothing. */
  function close(): void {
    closed = true;
    generation += 1;
  }

  if (decoded.path !== 'loaded') save();

  return {
    calibration: (): Calibration => kept.calibration,
    keptState, exportResults, eggsBehind, logEgg, eggLogged, calibrationBefore, learn,
    recordSecondAnswer, keepRecord, clear, close,
  };
}

function sameRecord(a: EggRecord | undefined, b: EggRecord | undefined): boolean {
  return a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b);
}

/** The cook a record is of, or null for one without an id. */
function idOf(r: EggRecord): number | null {
  return r.id ?? null;
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

/** Copy one calibration into another IN PLACE, so every holder of the app's
 *  reference sees it. */
function assign(into: Calibration, from: Calibration): void {
  into.posterior.particles = from.posterior.particles;
  into.posterior.weights = from.posterior.weights;
  into.posterior.rng = from.posterior.rng;
  into.eggsLogged = from.eggsLogged;
  if (from.start !== undefined) into.start = from.start;
}
