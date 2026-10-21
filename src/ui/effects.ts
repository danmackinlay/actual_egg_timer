/**
 * The page's effects that are not the cook's, as the runner (cook.ts)
 * carries them out for `update` (model.ts): the settings written, coalesced
 * or at once; the idle page solved again once the controls settle; the words
 * in a new language; everything forgotten; and how many of the log's eggs
 * are final, for sharing.
 */

import { type LanguageState, effectiveLanguage } from './settings.ts';
import { openEggs } from '../core/cooks.ts';
import type { Learner } from './calibration.ts';
import type { Stores } from './cook.ts';
import { type Model, cooksOf } from './model.ts';
import { applyLanguageToDom } from './controls.ts';
import { activeLocale, applyCopy, loadCopy } from './copy.ts';
import { cancelSoon, soon } from './idle.ts';
import { labelInfoButtons } from './info.ts';
import { renderVersion } from './render.ts';
import { send } from './send.ts';
import { labelTicks } from './slider.ts';
import { labelSteppers } from './stepper.ts';
import type { Settings, SettingsStore } from './store.ts';
import { nowMs } from './now.ts';

/** The writes and solves waiting to coalesce, and the language last asked for. */
const pending = {
  solveHandle: 0,
  saveHandle: 0,
  /** Which language changes went in last, so two quick changes land in order. */
  languageAsked: 0,
};

/* -------------------------------------------------------------- solving */

/** Coalesce solves: a solve (`npm run decide -- cost` times one) is too
 *  long to run on every pixel of a slider drag. */
export function solveSoon(): void {
  if (pending.solveHandle !== 0) return;
  pending.solveHandle = soon(() => {
    pending.solveHandle = 0;
    send({ kind: 'solve' });
  }, 90);
}

/* -------------------------------------------------------------- settings */

/** Coalesce writes for the same reason. A drag fires `input` per pixel, and
 *  each would be a JSON.stringify and a localStorage write for a settings
 *  object nobody has finished changing. */
export function saveSoon(store: SettingsStore, settings: () => Settings): void {
  if (pending.saveHandle !== 0) return;
  pending.saveHandle = soon(() => {
    pending.saveHandle = 0;
    store.save(settings());
  }, 250);
}

/** Write now, for the paths that must not lose the setting: starting a cook,
 *  and the snap that moves the slider out from under the user. */
export function saveNow(store: SettingsStore, settings: Settings): void {
  cancelSoon(pending.saveHandle);
  pending.saveHandle = 0;
  store.save(settings);
}

/** The page no longer owns the app (owner.ts): a save or a solve still
 *  waiting to coalesce is dropped. */
export function dropPending(): void {
  cancelSoon(pending.solveHandle);
  cancelSoon(pending.saveHandle);
  pending.solveHandle = 0;
  pending.saveHandle = 0;
}

/* -------------------------------------------------------------- language */

/**
 * The words follow the settings' language, `before` the one they were in:
 * if the catalogue on screen changes, the new one fetched and every word
 * drawn again in place; otherwise only the picker. Settings is reachable in
 * every phase, so it may come while a cook runs: its words are drawn again
 * with the rest.
 */
export function followLanguage(before: string, language: LanguageState): void {
  const tag = effectiveLanguage(language);
  if (tag === before && tag === activeLocale()) {
    applyLanguageToDom();
    return;
  }
  const asked = ++pending.languageAsked;
  void loadCopy(tag).then(() => {
    if (asked === pending.languageAsked) relabel();
  });
}

/** Every word on the page again, in the catalogue now active: the marked-up
 *  ones (`applyCopy`), and each one the code drew. */
function relabel(): void {
  applyCopy(document);
  labelInfoButtons();
  labelSteppers();
  labelTicks();
  renderVersion();
  applyLanguageToDom();
  // The rest the page draws, drawn again with the page solved again.
  send({ kind: 'relabelled' });
}

/* ------------------------------------------------------------ calibration */

/** Take it all back: the posterior and the pan. */
export function forgetAll(s: Stores): void {
  const calib = s.learner.clear();
  s.pans.clear();
  send({ kind: 'calibration', calib: calib, boilMemory: {} });
  // The next egg is a new cook's, under a new id (share.ts).
  s.sharing.forget();
}

/** Eggs written down but not yet folded, folded off the main thread, and the
 *  page told when they are in. */
export function learnBehind(learner: Learner): void {
  if (learner.eggsBehind() > 0) void learner.learn().then(() => send({ kind: 'learned' }));
}

/* ---------------------------------------------------------------- sharing */

/** How many of the log's eggs are final, from its start (share.ts): all of
 *  them up to the first still open (core `openEggs`): the egg on screen,
 *  which can still be answered and corrected until Start again or until it
 *  is too old, and one ended whose record is to be made again. The cooks are
 *  this page's: a page picks the stored cook back up before it first sends. */
export function finalEggs(s: Stores, m: Model): number {
  const log = s.learner.keptState().log;
  const open = openEggs(cooksOf(m), nowMs() / 1000);
  const at = log.findIndex((r) => r.id !== null && r.id !== undefined && open.includes(r.id));
  return at < 0 ? log.length : at;
}
