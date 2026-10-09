/**
 * The application: inputs -> solver -> readout, and the cook itself, put
 * together. `boot()` reads the state from storage, draws the page and wires
 * every event; what each part holds and does is its own module:
 *
 * - state.ts: the page's state, and the egg, the pot and the time to boil
 *   it derives;
 * - answer.ts: the solve, the decided time, the nudge, and the worker's
 *   surfaces and profiles asked for;
 * - update.ts: a change taken up - the idle page solved again, the settings
 *   saved, a new language, another tab's writes;
 * - render.ts: the egg page drawn from the state;
 * - controls.ts and input.ts: the controls written from the settings, and
 *   read back into them;
 * - cook.ts: the cook under way, its ticker and alarms, and one picked back
 *   up after a reload.
 */

import { stepPast } from '../core/units.js';
import { drawNudge, whenAnswerLands, whenCookSurfaceLands } from './answer.js';
import { eggsBehind, exportResults, keptState, learn, loadCalibration } from './calibration.js';
import { setAlarmSound, setMuted } from './clock.js';
import { applyConstantsToDom, applySettingsToDom, buildSizeOptions } from './controls.js';
import {
  cookElsewhere, cookOpen, correctCook, lookAgain, onPrimary, onStillOut, persistCook, replanCook, reset,
  restoreCook,
} from './cook.js';
import { bindDom, el, page } from './dom.js';
import { wireFeedback } from './feedback.js';
import { wireInfoButtons } from './info.js';
import { onInput, onToggleMute } from './input.js';
import { renderCalibNote, renderLearned, wireExport, wireForget } from './learned.js';
import { startOffline } from './offline.js';
import { render, renderMute, renderVersion } from './render.js';
import { buildClauses } from './sentence.js';
import { loadShare, retryDeletes, sendFinal, shareState } from './share.js';
import { wireShare } from './shareView.js';
import { buildTicks } from './slider.js';
import { learning, phaseNow, sizeClasses, state } from './state.js';
import { setStepRule, wireSteppers } from './stepper.js';
import { claimStorage, loadBoilMemory, loadSettings, newerStoredElsewhere, storageReadOnly } from './store.js';
import { APP_VERSION } from './version.js';
import { measure, useUnits } from './units.js';
import { drawShare, finalEggs, forgetAll, recompute, storedElsewhere } from './update.js';
import { wireViews } from './views.js';
import { wireEdits, wireStartTime } from './edit.js';
import { markDevClockUse, nowMs } from './now.js';

export function boot(): void {
  bindDom();
  // Before anything is written: whether a newer build has run here, and the
  // mark brought up to this one if not (DECISIONS.md 100), and then the keys
  // no build reads any more deleted.
  claimStorage(APP_VERSION, leaveStoresAlone);
  page().newerNote.hidden = !storageReadOnly();
  // The development clock's mark, for a clock set as the page loaded.
  markDevClockUse();
  state.settings = loadSettings(sizeClasses);
  state.controls = state.settings;
  useUnits(state.settings.unitsChosen);
  state.boilMemory = loadBoilMemory();
  state.calib = loadCalibration();
  // This page's nudge, drawn now rather than as answer.ts loads, so a
  // script's seed (now.ts) is in place for it.
  drawNudge();
  // A surface or a profile the screen wants, landed: the idle page is
  // solved again with it, or the running cook planned again.
  whenAnswerLands(recompute);
  whenCookSurfaceLands(replanCook);

  buildSizeOptions();
  buildTicks();
  buildClauses();
  applyConstantsToDom();
  applySettingsToDom();

  // The egg's two controls and its sentence, and the Settings page's, are
  // read the same way: every input goes through readInputs.
  for (const id of ['controls', 'settingsForm']) {
    const form = el<HTMLFormElement>(id);
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
    form.addEventListener('submit', (event) => event.preventDefault());
  }

  // Corrections mid-cook: when a change in hand is committed (edit.ts).
  wireEdits(correctCook);
  wireStartTime();
  page().primary.addEventListener('click', onPrimary);
  page().secondary.addEventListener('click', reset);
  page().stillOut.addEventListener('click', onStillOut);
  page().mute.addEventListener('click', onToggleMute);
  wireForget(forgetAll);
  wireExport(() => exportResults(shareState().uid, nowMs()));
  // Every (i) opens in place. They are buttons, so the keyboard reaches and
  // works them, and aria-expanded says which way they stand.
  wireInfoButtons();
  wireSteppers();
  setStepRule(page().roomTemp, (value, up) => stepPast(measure('roomTemp'), value, up));
  wireViews();
  setMuted(state.settings.muted);
  setAlarmSound(state.settings.alarm);
  renderMute();
  renderVersion();

  wireFeedback({
    cook: () => state.cook,
    plan: () => state.plan,
    phase: () => phaseNow(nowMs()),
    calib: () => state.calib,
    persist: persistCook,
    learned: () => renderLearned(learning()),
    redraw: () => render(nowMs()),
    open: cookOpen,
  });

  renderCalibNote(learning());
  restoreCook();
  // Sharing, if the cook turned it on: every egg in the log is final but the
  // stored running cook's, which may still be answered or corrected
  // (`finalEggs`). A deletion not yet confirmed is asked again first.
  // Turning sharing on or off moves the time by the nudge, so the egg page
  // is solved again with the section redrawn.
  wireShare(() => { drawShare(); recompute(); });
  loadShare({ log: () => keptState().log, finalCount: finalEggs, changed: drawShare });
  drawShare();
  void retryDeletes().then(sendFinal);
  window.addEventListener('online', () => { void retryDeletes().then(sendFinal); });
  window.addEventListener('storage', (event) => {
    // A newer build's tab has run: this page writes nothing from now on
    // (`claimStorage`), and takes up nothing more either.
    newerStoredElsewhere(event.key);
    if (storageReadOnly()) return;
    storedElsewhere(event.key);
    cookElsewhere(event.key);
  });
  // A cook left at DONE an hour or more ends when the page is next looked at.
  document.addEventListener('visibilitychange', lookAgain);
  window.addEventListener('focus', lookAgain);
  window.addEventListener('pageshow', lookAgain);
  // A cook picked back up is described by its own choices and its plan,
  // never by the controls, which another tab may have changed since.
  if (state.cook === null) recompute();
  else render(nowMs());
  // Eggs written down but not yet folded - a reload mid-fold, or a posterior
  // that had to be rebuilt from the log - are folded now, off the main thread.
  // The app runs on what it had until they land.
  if (eggsBehind() > 0) {
    void learn().then(() => {
      renderCalibNote(learning());
      if (state.cook === null) recompute();
    });
  }
  // The app opens with no signal, from the last build it kept; a newer one
  // takes over only between cooks (offline.ts).
  startOffline(() => state.cook === null);
  booted = true;
}

/** Whether `boot` has drawn the page, so a redraw has something to draw. */
let booted = false;

/**
 * A newer build has run in this browser, found at boot or told of later:
 * what this page stores is left alone from now on (store.ts). The line at
 * the top of every view says so. The timer runs as before; the questions
 * after an egg, sharing and "Start learning again" go, since nothing they do
 * could be kept.
 */
function leaveStoresAlone(): void {
  if (!booted) return;
  page().newerNote.hidden = false;
  render(nowMs());
  drawShare();
  renderCalibNote(learning());
}
