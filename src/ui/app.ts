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
import { resolveDuring, whenAnswerLands } from './answer.js';
import { eggsBehind, exportResults, keptState, learn, loadCalibration } from './calibration.js';
import { setMuted } from './clock.js';
import { applyConstantsToDom, applySettingsToDom, buildSizeOptions } from './controls.js';
import { onPrimary, persistCook, reset, restoreCook } from './cook.js';
import { bindDom, el, page } from './dom.js';
import { wireFeedback } from './feedback.js';
import { wireInfoButtons } from './info.js';
import { onInput, onToggleMute } from './input.js';
import { renderCalibNote, renderLearned, wireExport, wireForget } from './learned.js';
import { idleMachine } from './machine.js';
import { startOffline } from './offline.js';
import { render, renderMute, renderVersion } from './render.js';
import { buildClauses } from './sentence.js';
import { loadShare, retryDeletes, sendFinal, shareState } from './share.js';
import { wireShare } from './shareView.js';
import { buildTicks } from './slider.js';
import { learning, sizeClasses, state } from './state.js';
import { setStepRule, wireSteppers } from './stepper.js';
import { loadBoilMemory, loadSettings } from './store.js';
import { measure, useUnits } from './units.js';
import { drawShare, finalEggs, forgetAll, recompute, storedElsewhere } from './update.js';
import { wireViews } from './views.js';

export function boot(): void {
  bindDom();
  state.settings = loadSettings(sizeClasses);
  useUnits(state.settings.unitsChosen);
  state.boilMemory = loadBoilMemory();
  state.calib = loadCalibration();
  state.machine = idleMachine(state.settings.cooling);
  // A surface or a profile the screen wants, landed: the idle page is
  // solved again with it.
  whenAnswerLands(recompute);

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

  page().primary.addEventListener('click', onPrimary);
  page().secondary.addEventListener('click', reset);
  page().mute.addEventListener('click', onToggleMute);
  wireForget(forgetAll);
  wireExport(() => exportResults(shareState().uid, Date.now()));
  // Every (i) opens in place. They are buttons, so the keyboard reaches and
  // works them, and aria-expanded says which way they stand.
  wireInfoButtons();
  wireSteppers();
  setStepRule(page().roomTemp, (value, up) => stepPast(measure('roomTemp'), value, up));
  wireViews();
  setMuted(state.settings.muted);
  renderMute();
  renderVersion();

  wireFeedback({
    machine: () => state.machine,
    ticket: () => state.ticket,
    calib: () => state.calib,
    persist: persistCook,
    learned: () => renderLearned(learning()),
    redraw: () => render(Date.now()),
  });

  renderCalibNote(learning());
  restoreCook();
  // Sharing, if the cook turned it on: every egg in the log is final but the
  // one on screen, whose answers may still come. A deletion not yet confirmed
  // is asked again first.
  // Turning sharing on or off moves the time by the nudge, so the egg page
  // is solved again with the section redrawn.
  wireShare(() => { drawShare(); recompute(); });
  loadShare({ log: () => keptState().log, finalCount: finalEggs, changed: drawShare });
  drawShare();
  void retryDeletes().then(sendFinal);
  window.addEventListener('online', () => { void retryDeletes().then(sendFinal); });
  window.addEventListener('storage', (event) => { storedElsewhere(event.key); });
  // A cook picked back up is described by its ticket, never by the
  // controls, which another tab may have changed since "Eggs in".
  if (state.machine.phase === 'IDLE') recompute();
  else if (state.ticket !== null) {
    state.solution = resolveDuring(state.ticket, state.ticket.setup.timeToBoil_s);
    render(Date.now());
  }
  // Eggs written down but not yet folded - a reload mid-fold, or a posterior
  // that had to be rebuilt from the log - are folded now, off the main thread.
  // The app runs on what it had until they land.
  if (eggsBehind() > 0) {
    void learn().then(() => {
      renderCalibNote(learning());
      if (state.machine.phase === 'IDLE') recompute();
    });
  }
  // The app opens with no signal, from the last build it kept; a newer one
  // takes over only between cooks (offline.ts).
  startOffline(() => state.machine.phase === 'IDLE');
}
