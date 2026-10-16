/**
 * The application: inputs -> solver -> readout, and the cook itself, put
 * together. `boot()` asks whether this tab runs the app (owner.ts); if it
 * does, it reads the state from storage, draws the page and wires every
 * event, and if another tab does, it waits. What each part holds and does is
 * its own module:
 *
 * - model.ts: the page's model, and `update`, how a message moves it - the
 *   idle page, and the running cook over core's `step`;
 * - state.ts: the model's one instance, and the egg, the pot and the time to
 *   boil it derives;
 * - answer.ts: the idle page's solve, its decided time, the nudge and the
 *   advice, from what is built;
 * - cook.ts: the runner - each message through `update`, its effects
 *   carried out (the cook written down, its alarms, its record; the
 *   settings written; what the page waits for built), the ticker, a cook
 *   picked back up after a reload, and the page drawn; send.ts, the way in
 *   for the modules under it;
 * - effects.ts: the page's own effects - the settings written, the solve
 *   coalesced, a new language, everything forgotten;
 * - render.ts: the egg page drawn from the state;
 * - controls.ts and input.ts: the controls written from the model, and read
 *   back as messages.
 */

import { nudgeSeconds } from '../core/decide.ts';
import { stepPast } from '../core/units.ts';
import { openLearner } from './calibration.ts';
import { applyConstantsToDom, applyLanguageToDom, buildSizeOptions } from './controls.ts';
import {
  type Stores, betweenCooks, dispatch, finalNow, lookAgain, onPrimary, onStillOut, pageStores, reset, restoreCook,
  startRunner, stopRunner,
} from './cook.ts';
import { closeAudio, primeAudio } from './clock.ts';
import { bindDom, page } from './dom.ts';
import { wireFeedback } from './feedback.ts';
import { wireInfoButtons } from './info.ts';
import { onInput, onToggleMute } from './input.ts';
import { wireExport, wireForget } from './learned.ts';
import { startOffline } from './offline.ts';
import { stopWorker } from './offThread.ts';
import { claimApp, ownsApp } from './owner.ts';
import { renderVersion } from './render.ts';
import { buildClauses } from './sentence.ts';
import { openSharing } from './share.ts';
import { wireShare } from './shareView.ts';
import { buildTicks } from './slider.ts';
import { emptyModel, sizeClasses } from './state.ts';
import { activePopulation } from './population.ts';
import { setStepRule, wireSteppers } from './stepper.ts';
import { openCooks, openPans, openSettings, sweepStorage } from './store.ts';
import { APP_VERSION } from './version.ts';
import { measure, useUnits } from './units.ts';
import { learnBehind } from './effects.ts';
import type { Model } from './model.ts';
import { wireViews } from './views.ts';
import { wireEdits, wireStartTime } from './edit.ts';
import { random } from './now.ts';

/**
 * Boot: the page's elements found, then whether this tab runs the app or
 * another tab does (owner.ts), asked before anything is claimed or written.
 */
export async function boot(): Promise<void> {
  bindDom();
  page().useHere.addEventListener('click', takeOver);
  if (await claimApp(false, standDown)) own(true);
  else wait();
  // The app opens with no signal, from the last build it kept; a newer one
  // takes over only between cooks, and a tab waiting for the app reloads
  // into it (offline.ts).
  startOffline(() => ({ owner: ownsApp(), cookRunning: ownsApp() && !betweenCooks() }));
}

/** The app is open in another tab: this one shows only the note and its
 *  button, and writes, sounds and claims nothing. */
function wait(): void {
  page().body.dataset['tab'] = 'waiting';
  page().tabNote.hidden = false;
}

/** The button pressed: the app taken from the tab that has it. The press is
 *  a gesture, so the audio is primed for the alarm. */
function takeOver(): void {
  primeAudio();
  void claimApp(true, standDown).then((owned) => {
    if (owned) own(false);
  });
}

/** Another tab took the app: this one stops everything that writes or
 *  sounds, and waits. */
function standDown(): void {
  stopRunner();
  stopWorker();
  closeAudio();
  wait();
}

/** Whether the page's own events are wired: once, the first time it owns
 *  the app. */
let wired = false;

/**
 * This tab owns the app, at boot or taken over: every store read afresh, as
 * a reload reads it, and the cook picked back up - after a reload with its
 * alarm lost (`reloaded`), and taken over with it armed again.
 */
function own(reloaded: boolean): void {
  page().body.dataset['tab'] = 'owner';
  page().tabNote.hidden = true;
  // Before anything is written: the keys no build reads any more deleted.
  sweepStorage();
  // The stores, opened: the runner holds them (cook.ts). Sharing, if the
  // cook turned it on: every egg in the log is final but the stored running
  // cook's, which may still be answered or corrected (`finalEggs`).
  const learner = openLearner();
  const stores: Stores = {
    settings: openSettings(sizeClasses), pans: openPans(), cooks: openCooks(), learner: learner,
    sharing: openSharing({ log: () => learner.keptState().log, finalCount: finalNow }),
  };
  const settings = stores.settings.load();
  useUnits(settings.unitsChosen);
  // This page's nudge, drawn at boot rather than as a module loads, so
  // a script's seed (now.ts) is in place for it.
  // For the egg's record: this build, and the population of the prior.
  const initial: Model = {
    ...emptyModel(), settings: settings, boilMemory: stores.pans.load(),
    calib: learner.calibration(), nudgeDraw: nudgeSeconds(random()), appVersion: APP_VERSION,
    prior: activePopulation().id,
  };
  if (!wired) wire();
  wired = true;
  // The language picker follows the words on screen, not each frame: they
  // change only once a new catalogue is in (effects.ts, `followLanguage`).
  applyLanguageToDom();
  // From here on every change to the page is a message (send.ts).
  startRunner(stores, initial);
  restoreCook(reloaded);
  // A deletion not yet confirmed is asked again before anything is sent.
  resend();
  // The idle page solved; a cook picked back up is described by its own
  // choices and its plan, never by the settings.
  dispatch({ kind: 'solve' });
  // Eggs written down but not yet folded - a reload mid-fold, or a posterior
  // that had to be rebuilt from the log - are folded now, off the main thread.
  // The app runs on what it had until they land.
  learnBehind(learner);
}

/** What sharing has still to send or delete, sent, by the app's owner. */
function resend(): void {
  if (!ownsApp()) return;
  const sharing = pageStores().sharing;
  void sharing.retryDeletes().then(sharing.sendFinal);
}

/** The page's controls built, and its events wired: once. */
function wire(): void {
  buildSizeOptions();
  buildTicks();
  buildClauses();
  applyConstantsToDom();

  // The egg's two controls and its sentence, and the Settings page's, are
  // read the same way: every input goes through readInputs.
  for (const form of [page().controls, page().settingsForm]) {
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
    form.addEventListener('submit', (event) => event.preventDefault());
  }

  // Corrections mid-cook: when a change in hand is committed (edit.ts).
  wireEdits();
  wireStartTime();
  page().primary.addEventListener('click', onPrimary);
  page().secondary.addEventListener('click', reset);
  page().stillOut.addEventListener('click', onStillOut);
  page().mute.addEventListener('click', onToggleMute);
  wireForget();
  wireExport();
  // Every (i) opens in place. They are buttons, so the keyboard reaches and
  // works them, and aria-expanded says which way they stand.
  wireInfoButtons();
  wireSteppers();
  setStepRule(page().roomTemp, (value, up) => stepPast(measure('roomTemp'), value, up));
  setStepRule(page().roomTempFrom, (value, up) => stepPast(measure('roomTemp'), value, up));
  setStepRule(page().coolingWater, (value, up) => stepPast(measure('coolingWater'), value, up));
  wireViews();
  renderVersion();
  wireFeedback();
  wireShare();
  window.addEventListener('online', resend);
  // A cook left at DONE an hour or more ends when the page is next looked at.
  document.addEventListener('visibilitychange', lookAgain);
  window.addEventListener('focus', lookAgain);
  window.addEventListener('pageshow', lookAgain);
}
