/**
 * The application: inputs -> solver -> readout, and the cook itself, put
 * together. `boot()` reads the state from storage, draws the page and wires
 * every event; what each part holds and does is its own module:
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
 *   coalesced, a new language, everything forgotten, another tab's writes
 *   taken up as messages;
 * - render.ts: the egg page drawn from the state;
 * - controls.ts and input.ts: the controls written from the model, and read
 *   back as messages.
 */

import { nudgeSeconds } from '../core/decide.js';
import { stepPast } from '../core/units.js';
import { openLearner } from './calibration.js';
import { applyConstantsToDom, applySettingsToDom, buildSizeOptions } from './controls.js';
import {
  Stores, cookElsewhere, dispatch, lookAgain, onPrimary, onStillOut, reset, restoreCook, startRunner,
} from './cook.js';
import { bindDom, el, page } from './dom.js';
import { wireFeedback } from './feedback.js';
import { wireInfoButtons } from './info.js';
import { onInput, onToggleMute } from './input.js';
import { renderCalibNote, wireExport, wireForget } from './learned.js';
import { startOffline } from './offline.js';
import { renderVersion } from './render.js';
import { buildClauses } from './sentence.js';
import { openSharing } from './share.js';
import { wireShare } from './shareView.js';
import { buildTicks } from './slider.js';
import { learning, sizeClasses, state } from './state.js';
import { activePopulation } from './population.js';
import { setStepRule, wireSteppers } from './stepper.js';
import { claimStorage, newerStoredElsewhere, openCooks, openPans, openSettings, storageReadOnly } from './store.js';
import { APP_VERSION } from './version.js';
import { measure, useUnits } from './units.js';
import { drawShare, finalEggs, learnBehind, storedElsewhere } from './effects.js';
import { wireViews } from './views.js';
import { wireEdits, wireStartTime } from './edit.js';
import { markDevClockUse, random } from './now.js';

export function boot(): void {
  bindDom();
  // Before anything is written: whether a newer build has run here, and the
  // mark brought up to this one if not, and then the keys
  // no build reads any more deleted.
  claimStorage(APP_VERSION);
  // The development clock's mark, for a clock set as the page loaded.
  markDevClockUse();
  // The stores, opened: the runner holds them (cook.ts). Sharing, if the
  // cook turned it on: every egg in the log is final but the stored running
  // cook's, which may still be answered or corrected (`finalEggs`).
  const learner = openLearner();
  const stores: Stores = {
    settings: openSettings(sizeClasses), pans: openPans(), cooks: openCooks(), learner: learner,
    sharing: openSharing({ log: () => learner.keptState().log, finalCount: () => finalEggs(stores) }),
  };
  state.settings = stores.settings.load();
  state.controls = { ...state.settings };
  useUnits(state.settings.unitsChosen);
  state.boilMemory = stores.pans.load();
  state.calib = learner.calibration();
  // This page's nudge, drawn at boot rather than as a module loads, so
  // a script's seed (now.ts) is in place for it.
  state.nudgeDraw = nudgeSeconds(random());
  // For the egg's record: this build, and the population of the prior.
  state.appVersion = APP_VERSION;
  state.prior = activePopulation().id;

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
  wireViews();
  // From here on every change to the page is a message (send.ts).
  startRunner(stores);
  renderVersion();

  wireFeedback();

  renderCalibNote(learning(state));
  restoreCook();
  // A deletion not yet confirmed is asked again before anything is sent.
  wireShare();
  drawShare(stores);
  const resend = (): void => { void stores.sharing.retryDeletes().then(stores.sharing.sendFinal); };
  resend();
  window.addEventListener('online', resend);
  window.addEventListener('storage', (event) => {
    // A newer build's tab has run: this page writes nothing from now on
    // (`claimStorage`), and takes up nothing more either.
    newerStoredElsewhere(event.key);
    if (storageReadOnly()) return;
    storedElsewhere(stores, event.key);
    cookElsewhere(event.key);
  });
  // A cook left at DONE an hour or more ends when the page is next looked at.
  document.addEventListener('visibilitychange', lookAgain);
  window.addEventListener('focus', lookAgain);
  window.addEventListener('pageshow', lookAgain);
  // The idle page solved; a cook picked back up is described by its own
  // choices and its plan, never by the settings, which another tab may have
  // changed since.
  dispatch({ kind: 'solve' });
  // Eggs written down but not yet folded - a reload mid-fold, or a posterior
  // that had to be rebuilt from the log - are folded now, off the main thread.
  // The app runs on what it had until they land.
  learnBehind(learner);
  // The app opens with no signal, from the last build it kept; a newer one
  // takes over only between cooks (offline.ts).
  startOffline(() => state.cook === null);
}
