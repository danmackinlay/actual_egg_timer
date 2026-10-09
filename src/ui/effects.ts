/**
 * The page's effects that are not the cook's, as the runner (cook.ts)
 * carries them out for `update` (model.ts): the settings written, coalesced or at once, with
 * whatever another tab wrote since taken up; the idle page solved again once
 * the controls settle; the words in a new language; everything forgotten;
 * what another tab wrote, taken up as messages; and how many of the log's
 * eggs are final, for sharing.
 */

import { LanguageState, effectiveLanguage } from '../core/language.js';
import { CookPlan, openEggId, replan } from '../core/running.js';
import type { Learner } from './calibration.js';
import type { Stores } from './cook.js';
import type { Model } from './model.js';
import { applyLanguageToDom } from './controls.js';
import { activeLocale, applyCopy, loadCopy } from './copy.js';
import { cancelSoon, soon } from './idle.js';
import { labelInfoButtons } from './info.js';
import { renderVersion } from './render.js';
import { send } from './send.js';
import { labelTicks } from './slider.js';
import { labelSteppers } from './stepper.js';
import type { Settings, SettingsStore } from './store.js';
import { forgetDevClockUse, nowMs } from './now.js';

/** The writes and solves waiting to coalesce, and the language last asked for. */
const pending = {
  solveHandle: 0,
  saveHandle: 0,
  /** Which language changes went in last, so two quick changes land in order. */
  languageAsked: 0,
};

/* -------------------------------------------------------------- solving */

/** Coalesce solves: a solve is tens of milliseconds, which is too long to run
 *  on every pixel of a slider drag. */
export function solveSoon(): void {
  if (pending.solveHandle !== 0) return;
  pending.solveHandle = soon(() => {
    pending.solveHandle = 0;
    send({ kind: 'solve' });
  }, 90);
}

/* -------------------------------------------------------------- settings */

/** Coalesce writes for the same reason. A drag fires `input` per pixel, and
 *  every one of those was a JSON.stringify and a localStorage write for a
 *  settings object nobody had finished changing. */
export function saveSoon(store: SettingsStore, settings: () => Settings): void {
  if (pending.saveHandle !== 0) return;
  pending.saveHandle = soon(() => {
    pending.saveHandle = 0;
    writeSettings(store, settings());
  }, 250);
}

/** Write now, for the paths that must not lose the setting: starting a cook,
 *  and the snap that moves the slider out from under the user. */
export function saveNow(store: SettingsStore, settings: Settings): void {
  cancelSoon(pending.saveHandle);
  pending.saveHandle = 0;
  writeSettings(store, settings);
}

/** Write the settings, with whatever another tab wrote since taken up
 *  first (store.ts), and that taken up on the page. */
function writeSettings(store: SettingsStore, settings: Settings): void {
  const next = store.save(settings);
  if (next !== settings) send({ kind: 'settingsTaken', settings: next });
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
  // The fields with a unit, and the rest drawn only when asked, drawn again.
  send({ kind: 'relabelled' });
}

/* ------------------------------------------------------------ calibration */

/** Take it all back: the posterior and the pan. */
export function forgetAll(s: Stores): void {
  const calib = s.learner.clear();
  // The log is gone, and with it any egg cooked on the development clock.
  forgetDevClockUse();
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

/** The stored cook's plan, for whether it is too old: this tab's own, or
 *  one made for another tab's cook, kept for as long as the stored text is
 *  the same (how old a cook may get does not move with the clock). */
const storedPlan = { text: null as string | null, plan: null as CookPlan | null };

/** The egg still open to correction (core `openEggId`): the
 *  stored running cook's, whichever tab wrote it, until it is too old to
 *  pick back up; null when there is none. */
function openEgg(s: Stores, m: Model, now_s: number): number | null {
  const cook = s.cooks.peek()?.cook ?? null;
  if (cook === null) return null;
  let plan: CookPlan;
  if (m.cook !== null && m.plan !== null && m.cook.id_ms === cook.id_ms) {
    plan = m.plan;
  } else {
    const text = s.cooks.text();
    if (storedPlan.text !== text || storedPlan.plan === null) {
      storedPlan.text = text;
      storedPlan.plan = replan(cook, m.calib, null, 0, now_s);
    }
    plan = storedPlan.plan;
  }
  return openEggId(cook, plan, now_s);
}

/** How many of the log's eggs are final, from its start (share.ts): all of
 *  them but the stored running cook's, whichever tab asks, which can still be
 *  answered and corrected until Start again or until it is too old
 *  (`openEggId`, design/one-screen.md section 4, "Which eggs are final"). */
export function finalEggs(s: Stores, m: Model): number {
  const log = s.learner.keptState().log;
  const open = openEgg(s, m, nowMs() / 1000);
  if (open === null) return log.length;
  const at = log.findIndex((r) => (r.id ?? null) === open);
  return at < 0 ? log.length : at;
}


/**
 * Another tab wrote the settings, the pans, the log or the sharing state
 * (the `storage` event): this page takes it up at once rather than writing
 * back what it loaded, which would undo it. Eggs the other tab logged are
 * folded here too, if it has not folded them, and the time on screen moves
 * with what was learned. The cook in progress is cook.ts's
 * (`cookElsewhere`).
 */
export function storedElsewhere(s: Stores, key: string | null, settings: Settings): void {
  const nextSettings = s.settings.elsewhere(key, settings);
  if (nextSettings !== null) send({ kind: 'settingsTaken', settings: nextSettings });
  // The pans: another tab's measured boil, or its "Forget everything".
  const pans = s.pans.elsewhere(key);
  if (pans !== null) send({ kind: 'pans', boilMemory: pans, quiet: false });
  const calibration = s.learner.storedElsewhere(key);
  const sharing = s.sharing.storedElsewhere(key);
  if (!calibration && !sharing) return;
  send({ kind: 'stores' });
  if (calibration) learnBehind(s.learner);
}
