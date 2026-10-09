/**
 * The page's runner, over `update` (model.ts): each thing that happens is a
 * message (`dispatch`, or `send` from below), the model takes what `update`
 * returns, and this module does what it asks - writes the cook down,
 * schedules and rings the alarm, remembers the boil, logs the egg's record,
 * forgets the cook and sends what is final; writes the settings, solves the
 * idle page again once the controls settle, follows a new language, writes
 * the controls - builds what the page waits for (the idle pot's surface and
 * odds, a cook's pot's surface, the calibration before its egg and a surface
 * on it) off the main thread, and draws the page.
 *
 * Before any message about the running cook, what another tab wrote for it
 * since is taken up (`elsewhere`), so a tab never writes over what another
 * saw in the pan.
 *
 * The pull's alarm is scheduled ahead on the audio clock for the pull the
 * plan sets (`setPullAlarm`), except while the time to boil is a guess, and
 * rung when a step writes the pull ringing. The ticker runs, and the screen
 * is kept awake, while a cook is short of Done; at Done the page wakes when
 * the plan says something is next decided (`wakeAt_s`), and when looked at.
 */

import { DecisionInputs, inputsKey, nudgeSeconds } from '../core/decide.js';
import { EggRecord } from '../core/record.js';
import { RunningCook, answered } from '../core/running.js';
import { isSousVide, learning, phaseNow, state } from './state.js';
import { EditTimer, Effect, Msg, update } from './model.js';
import { currentInputs, wantedProfiles } from './answer.js';
import type { Learner } from './calibration.js';
import {
  Ticker, clockMoved, keepScreenAwake, blip, previewAlarm, primeAudio, pullSounding, releaseScreen, ringAlarm,
  setAlarmSound, setMuted, setPullAlarm, startTicker, stopAlarm,
} from './clock.js';
import { applySettingsToDom, applyUnitsToDom } from './controls.js';
import { activeLocale, t } from './copy.js';
import {
  builtFor, cachedDecisionGrid, cachedOddsProfile, decisionGrid, decisionKey, oddsProfileFor, profileKey,
} from './decisionGrids.js';
import { page, selectRadio } from './dom.js';
import { showStartLimit } from './edit.js';
import { cancelSoon, nextFrame, soon } from './idle.js';
import { answerTaken, probeRefused, probeTaken, resetFeedback, retryProbe } from './feedback.js';
import { renderCalibNote, renderLearned, saveResults } from './learned.js';
import { draw, drawnNothing, forgetDrawnWords } from './render.js';
import { view, viewMemo } from './view.js';
import { send, sendTo } from './send.js';
import type { Sharing } from './share.js';
import {
  CookStore, KeptAnswers, PansStore, SettingsStore, correctedLater, storageReadOnly, takeUpEvents,
} from './store.js';
import { unitSystem, useUnits } from './units.js';
import { drawShare, followLanguage, forgetAll, saveNow, saveSoon, solveSoon } from './effects.js';
import { showEgg } from './views.js';
import { clockSpeed, nowMs, onClockChange, random } from './now.js';

/** The stores this page keeps: opened at boot (app.ts), and held here. */
export interface Stores {
  settings: SettingsStore;
  pans: PansStore;
  cooks: CookStore;
  learner: Learner;
  sharing: Sharing;
}

let stores!: Stores;

/** The stores, for the test API's snapshot (dev/test.ts). */
export function pageStores(): Stores {
  return stores;
}

/** The ticker while a cook short of Done runs, and the page's wake at Done. */
const clock = {
  ticker: null as Ticker | null,
  wake: 0,
};

/** What is being built, by key, so each is asked for once: a cook's, and
 *  the idle page's profiles; and the idle pot's surface, asked for once its
 *  inputs settle. */
const building = new Set<string>();
const asking = { decisionHandle: 0, profiles: new Set<string>() };

/** The timers of a correction in hand, as set (model.ts, `EditTimer`). */
const EDIT_TIMERS: EditTimer[] = ['settle', 'preview', 'release'];
const editTimers: Record<EditTimer, number> = { settle: 0, preview: 0, release: 0 };

/** A correction's timer set for `at_ms`, real ms, or stopped: when it comes
 *  round, a message. */
function editTimer(timer: EditTimer, at_ms: number | null): void {
  cancelSoon(editTimers[timer]);
  editTimers[timer] = 0;
  if (at_ms === null) return;
  editTimers[timer] = soon(() => {
    editTimers[timer] = 0;
    dispatch({ kind: 'editTimer', timer: timer });
  }, Math.max(0, at_ms - performance.now()));
}

/** Messages sent while one is being taken up: taken up after it, in turn,
 *  before the page is drawn. */
const queue: Msg[] = [];
let busy = false;

/** The sound as last set on the audio clock (`setMuted`), so it is set only
 *  when the settings change it. */
let muted: boolean | null = null;

/** The page as drawn (render.ts), the egg previews the view keeps
 *  (view.ts), and whether a frame is asked for. */
const drawn = drawnNothing();
const memo = viewMemo();
let framed = false;

/** The page drawn at the next frame, once however many messages come
 *  before it. */
function requestDraw(): void {
  if (framed) return;
  framed = true;
  nextFrame(() => {
    if (framed) drawNow();
  });
}

function drawNow(): void {
  framed = false;
  draw(view(state, nowMs(), memo), drawn);
}

/** A frame asked for and not yet drawn, drawn now: a script reads the page
 *  as the model stands, not a frame behind it (dev/test.ts). */
export function flushDraw(): void {
  if (framed) drawNow();
}

/* ------------------------------------------------------------ messages */

/** The stored cook's id as this tab reads it, for whether its egg is still
 *  open: its own when storage does not work. */
function storedId(): number | null {
  if (!state.works) return state.cook === null ? null : state.cook.id_ms;
  return stores.cooks.peek()?.cook.id_ms ?? null;
}

/** The messages about the running cook, before which another tab's write
 *  for it is taken up. */
const ABOUT_THE_COOK = new Set<Msg['kind']>([
  'start', 'primary', 'cancel', 'stillOut', 'correct', 'tick', 'landed', 'before', 'answered', 'probe', 'restore',
]);

/** Take up what `msg` did, and do what it asks: the runner's view of its
 *  caches and the stores taken first, and the units and the sound kept
 *  with the settings before the effects. */
function apply(msg: Msg, now: number): void {
  const built = builtFor(state.calib);
  state.surfaces = built.surfaces;
  state.profiles = built.profiles;
  state.sharing = stores.sharing.state().on;
  state.readOnly = storageReadOnly();
  state.storedId_ms = state.cook === null ? null : storedId();
  const [next, effects] = update(state, msg, now);
  Object.assign(state, next);
  useUnits(state.settings.unitsChosen);
  if (muted !== state.settings.muted) {
    muted = state.settings.muted;
    setMuted(muted);
  }
  setAlarmSound(state.settings.alarm);
  perform(effects);
}

/**
 * One thing that happened, at the page's time now. What another tab wrote
 * for the running cook since is taken up first. Then what the page waits
 * for is asked for, the ticker and the alarm follow the plan, and the page
 * is drawn. A message sent while one is taken up waits for it.
 */
export function dispatch(msg: Msg): void {
  queue.push(msg);
  if (busy) return;
  busy = true;
  try {
    while (queue.length > 0) {
      const next = queue.shift()!;
      const now = nowMs();
      if (state.cook !== null && ABOUT_THE_COOK.has(next.kind)) {
        const taken = stores.cooks.takeUp();
        if (taken !== null) apply({ kind: 'elsewhere', theirs: taken.theirs }, now);
      }
      apply(next, now);
    }
  } finally {
    busy = false;
  }
  follow();
  requestDraw();
}

/** The runner, with the stores it holds, plugged in for `send` and for the
 *  development clock's moves, and the sound as the settings have it: once,
 *  at boot. */
export function startRunner(s: Stores): void {
  stores = s;
  sendTo(dispatch);
  onClockChange(clockMoved);
  muted = state.settings.muted;
  setMuted(muted);
  setAlarmSound(state.settings.alarm);
}

/* ------------------------------------------------------------- effects */

function perform(effects: Effect[]): void {
  for (const e of effects) {
    switch (e.kind) {
      case 'persist':
        persist(e.cook, e.answers, e.leanHint_s);
        break;
      case 'persistLean':
        stores.cooks.saveLeanHint(e.id_ms, e.leanHint_s);
        break;
      case 'persistEnded':
        if (stores.cooks.peek()?.cook.id_ms === e.cook.id_ms) stores.cooks.save(e.cook, answered(e.cook) ? 'beforeReload' : 'none', e.leanHint_s);
        break;
      case 'ring':
        if (e.moment === 'pull') {
          // Already sounding if it was scheduled ahead and its time has come
          // on the audio clock; otherwise now. The button that answers it is
          // on the egg's page.
          if (!pullSounding()) ringAlarm(true);
          showEgg();
        } else {
          ringAlarm(false);
        }
        break;
      case 'silence':
        stopAlarm();
        break;
      case 'rememberBoil':
        send({ kind: 'pans', boilMemory: stores.pans.remember(state.boilMemory, e.boil.litres, e.boil.seconds), quiet: true });
        break;
      case 'log':
        logRecord(e.record);
        break;
      case 'forget':
        stores.cooks.clear(e.id_ms);
        break;
      case 'sendFinal':
        // After the page has booted, since this can come of a restore.
        queueMicrotask(() => {
          drawShare(stores);
          void stores.sharing.sendFinal();
        });
        break;
      case 'blip':
        blip();
        break;
      case 'questionsReset':
        resetFeedback();
        break;
      case 'answerTaken':
        answerTaken(e.yolkWord, e.white);
        break;
      case 'thanks':
        page().calibNote.textContent = t('feedback.thanks');
        break;
      case 'learning':
        page().calibNote.textContent = t('feedback.learning');
        break;
      case 'probeRefused':
        probeRefused(e.low_C, e.high_C);
        break;
      case 'probeTaken':
        probeTaken(e.reading_C);
        break;
      case 'editTimer':
        editTimer(e.timer, e.at_ms);
        break;
      case 'editTimersOff':
        for (const timer of EDIT_TIMERS) editTimer(timer, null);
        break;
      case 'startLimit':
        showStartLimit(e.limit);
        break;
      case 'save':
        if (e.soon) saveSoon(stores.settings);
        else saveNow(stores.settings);
        break;
      case 'solveSoon':
        solveSoon();
        break;
      case 'askSurface':
        askForDecision(e.inputs);
        break;
      case 'askProfile':
        askForProfile(e.inputs);
        break;
      case 'language':
        followLanguage(e.before);
        break;
      case 'controlsDrawn':
        applySettingsToDom();
        break;
      case 'unitsDrawn':
        applyUnitsToDom();
        break;
      case 'donenessDrawn':
        page().doneness.value = String(state.controls.doneness);
        break;
      case 'alarmDrawn':
        selectRadio('alarm', state.settings.alarm);
        break;
      case 'previewAlarm':
        previewAlarm();
        break;
      case 'wordsForgotten':
        forgetDrawnWords(drawn);
        break;
      case 'notesDrawn':
        renderCalibNote(learning(state));
        break;
      case 'learnedDrawn':
        renderLearned(learning(state));
        break;
      case 'shareDrawn':
        drawShare(stores);
        break;
      case 'drawNudge':
        // A new page or a new cook, a new nudge (E8, DECISIONS.md 61): a
        // whole number of seconds from -10 to +10, drawn when the page boots
        // and again after each cook, so the time on screen holds still while
        // the cook looks at it.
        send({ kind: 'nudge', draw: nudgeSeconds(random()) });
        break;
      case 'forgetAll':
        forgetAll(stores);
        break;
      case 'export':
        saveResults(stores.learner.exportResults(stores.sharing.state().uid, nowMs()));
        break;
      case 'setSharing':
        // Drawn again at once, and again once what it sends has gone.
        void stores.sharing.setSharing(e.on).then(() => send({ kind: 'shared' }));
        send({ kind: 'shared' });
        break;
      case 'deleteShared':
        void stores.sharing.deleteSent().then(() => {
          send({ kind: 'shareDeleted', confirmed: stores.sharing.state().deleting.length === 0 });
        });
        send({ kind: 'shared' });
        break;
    }
  }
  // The pull's beeps, ahead on the audio clock, for the pull the plan sets:
  // none while the time to boil is a guess (the plan reads Heating whatever
  // it says).
  const plan = state.plan;
  setPullAlarm(plan === null || plan.deadlines.provisional || state.pull_s === null ? null : state.pull_s * 1000);
}

/**
 * Write the cook on screen down. A copy of this cook another tab corrected
 * later stays the copy stored (onescreen review 1.1), so a reload restores
 * the latest correction: what this tab saw in the pan is written into it
 * instead (`takeUpEvents`), and this tab runs on as it is (DECISIONS.md 97).
 * The page is told when whether a write reads back changes.
 */
function persist(cook: RunningCook, answers: KeptAnswers, leanHint_s: number): void {
  const stored = stores.cooks.peek();
  let written: string | null;
  if (stored !== null && stored.cook.id_ms === cook.id_ms && correctedLater(stored.cook, cook)) {
    const kept = stored.answers === 'beforeReload' ? stored.answers : answers;
    written = stores.cooks.save(takeUpEvents(stored.cook, cook), kept, stored.leanHint_s);
  } else {
    written = stores.cooks.save(cook, answers, leanHint_s);
  }
  if ((written !== null) !== state.works) send({ kind: 'persisted', works: written !== null });
}

/** The egg's record kept and learned from (`keepRecord`), and the page
 *  told whether it was. */
function logRecord(record: EggRecord): void {
  const id = record.id ?? null;
  void stores.learner.keepRecord(record).then((kept) => send({ kind: 'kept', id_ms: id, kept: kept }));
}

/* ------------------------------------------------------------ the needs */

/** Whether a cook wants the surface for `inputs`: the running cook's plan
 *  reads it, or a cook waits on it. */
function cookWants(inputs: DecisionInputs): boolean {
  const key = inputsKey(inputs);
  const wanted = (i: DecisionInputs | null): boolean => i !== null && inputsKey(i) === key;
  if (state.plan !== null && wanted(state.plan.inputs)) return true;
  return wanted(state.need.surface) || state.ending.some((e) => wanted(e.need.surface));
}

/** Whether the idle page is on screen with a pan to solve for. */
function idlePan(): boolean {
  return state.cook === null && !isSousVide(state);
}

/** How long the inputs must sit still before a decision surface is asked for,
 *  ms, on top of the solve's own coalescing. A surface is a second of the
 *  worker's time; a pot typed digit by digit should not queue one per digit. */
const DECISION_SETTLE_MS = 300;

/** Ask the worker for the idle pot's surface once the inputs have settled,
 *  and solve again when it lands if the pot on screen is still the one it
 *  was for. */
function askForDecision(inputs: DecisionInputs): void {
  cancelSoon(asking.decisionHandle);
  asking.decisionHandle = soon(() => {
    asking.decisionHandle = 0;
    const key = decisionKey(inputs);
    decisionGrid(inputs).then(() => {
      if (idlePan() && decisionKey(currentInputs(state)) === key) send({ kind: 'solve' });
    }, (error: unknown) => console.warn('decision surface failed', error));
  }, DECISION_SETTLE_MS);
}

/** Ask the worker for the odds at every level for these inputs - after their
 *  surface, which it builds first if need be - and take them up when they
 *  land, if a cook or the idle page still wants them. */
function askForProfile(inputs: DecisionInputs): void {
  const key = profileKey(inputs, state.calib);
  if (asking.profiles.has(key)) return;
  asking.profiles.add(key);
  // The key is cleared whether the profile lands or fails, so a failed one
  // is asked for again the next time the page wants it.
  oddsProfileFor(inputs, state.calib).then(() => {
    asking.profiles.delete(key);
    if (cookWants(inputs)) {
      cookLanded();
      return;
    }
    if (idlePan() && wantedProfiles(state).some((i) => profileKey(i, state.calib) === key)) send({ kind: 'solve' });
  }, (error: unknown) => {
    asking.profiles.delete(key);
    console.warn('odds profile failed', error);
  });
}

/** Ask the worker for what a cook wants and has not got - its pot's
 *  surface, then the odds profile on it - and step the cook as each lands,
 *  if it still wants it: once, however many messages ask while it is
 *  built. A new pot mid-cook (the boil tapped) is asked for at once: the egg
 *  is already in the water. */
function askForCookSurface(inputs: DecisionInputs): void {
  if (cachedDecisionGrid(inputs) === null) {
    const key = `surface|${inputsKey(inputs)}`;
    if (building.has(key)) return;
    building.add(key);
    decisionGrid(inputs).then(() => {
      building.delete(key);
      if (cookWants(inputs)) cookLanded();
    }, (error: unknown) => {
      building.delete(key);
      console.warn('decision surface failed', error);
    });
    return;
  }
  if (cachedOddsProfile(inputs, state.calib) === null) askForProfile(inputs);
}

/** Ask for what each cook waits for, and keep the page's clock with the
 *  running one's. */
function follow(): void {
  const waiting = [{ cook: state.cook, need: state.need }, ...state.ending];
  for (const w of waiting) {
    if (w.cook === null) continue;
    if (w.need.surface !== null) askForCookSurface(w.need.surface);
    if (w.need.before) askBefore(w.cook.id_ms);
    if (w.need.beforeSurface !== null) askBeforeSurface(w.cook.id_ms, w.need.beforeSurface);
  }
  keepTime();
}

/** The calibration before the egg of the cook `id` (`calibrationBefore`),
 *  built off the main thread, and the cook stepped when it is in. */
function askBefore(id: number): void {
  const key = `before|${id}`;
  if (building.has(key)) return;
  building.add(key);
  stores.learner.calibrationBefore(id).then((calibration) => {
    building.delete(key);
    dispatch({ kind: 'before', id_ms: id, calibration: calibration, surface: null });
  }, (error: unknown) => {
    building.delete(key);
    console.warn('the calibration before an egg failed', error);
  });
}

/** The surface and its odds for `inputs` on the calibration before the egg
 *  of the cook `id`, built off the main thread, and the cook stepped when
 *  they are in. */
function askBeforeSurface(id: number, inputs: DecisionInputs): void {
  const held = state.before.find((b) => b.id_ms === id);
  if (held === undefined) return;
  const key = `beforeSurface|${id}|${inputsKey(inputs)}`;
  if (building.has(key)) return;
  building.add(key);
  const calibration = held.before.calibration;
  Promise.all([decisionGrid(inputs), oddsProfileFor(inputs, calibration)]).then(([grid, profile]) => {
    building.delete(key);
    dispatch({ kind: 'before', id_ms: id, calibration: calibration, surface: { inputs: inputs, grid: grid, profile: profile } });
  }, (error: unknown) => {
    building.delete(key);
    console.warn('the corrected egg’s surface failed', error);
  });
}

/** The ticker and the screen kept awake while the running cook is short of
 *  Done; at Done, a wake when its plan next decides something. */
function keepTime(): void {
  const running = state.cook !== null && phaseNow(state, nowMs()) !== 'DONE';
  if (running && clock.ticker === null) {
    keepScreenAwake();
    clock.ticker = startTicker(() => dispatch({ kind: 'tick' }));
  } else if (!running && clock.ticker !== null) {
    clock.ticker.stop();
    clock.ticker = null;
    releaseScreen();
  }
  armWake();
}

function armWake(): void {
  window.clearTimeout(clock.wake);
  clock.wake = 0;
  const at = state.need.wakeAt_s;
  if (clock.ticker !== null || state.cook === null || at === null) return;
  const ms = Math.min(2 ** 31 - 1, Math.max(0, (at * 1000 - nowMs()) / clockSpeed()) + 50);
  clock.wake = window.setTimeout(() => {
    clock.wake = 0;
    dispatch({ kind: 'tick' });
  }, ms);
}

/* ------------------------------------------------------------ the page */

/** The primary button, in every phase. */
export function onPrimary(): void {
  if (state.cook === null) {
    startCookNow();
    return;
  }
  dispatch({ kind: 'primary' });
}

/** Start: a cook started here is this tab's own, whatever happened before
 *  it. */
function startCookNow(): void {
  // The audio context must be created inside a user gesture or the alarm is
  // silently blocked later, when it matters.
  primeAudio();
  stopAlarm();
  resetFeedback();
  stores.cooks.load();
  dispatch({ kind: 'begin', units: unitSystem(), lang: activeLocale() });
}

/** Cancel: a correction still settling goes with the cook. */
export function reset(): void {
  stopAlarm();
  if (state.cook !== null) dispatch({ kind: 'cancel' });
}

/** "Still in the water?" No: the egg came out when the clock assumed. */
export function onStillOut(): void {
  stopAlarm();
  dispatch({ kind: 'stillOut' });
}

/** A surface, a profile or a calibration a cook wanted, landed. */
function cookLanded(): void {
  dispatch({ kind: 'landed' });
  retryProbe();
}

/** Another tab changed storage (the `storage` event; a null key cleared it
 *  all): what it wrote for this cook taken up at once, so a tab leaves
 *  Heating when another taps the boil (review 1.2); at Done, whether this
 *  egg is still open, its questions going if not. */
export function cookElsewhere(key: string | null): void {
  if (!stores.cooks.touches(key) || state.cook === null) return;
  dispatch({ kind: 'elsewhere', theirs: stores.cooks.takeUp()?.theirs ?? null });
}

/** The page is looked at again (shown, focused): the ticker, which stops at
 *  Done, is not there to see a cook at Done become too old. */
export function lookAgain(): void {
  if (state.cook !== null) dispatch({ kind: 'tick' });
}

/**
 * Pick a cook back up after a reload: a tick of the stored cook with no plan
 * yet. The cook is clock times, so the countdown resumes at the right number
 * rather than restarting. What does NOT come back is the alarm: it lives in
 * this tab's audio context and died with the old page, so a restored cook
 * says so rather than letting someone walk away trusting a noise that will
 * not happen. One too old to pick back up ends as Start again would end it,
 * and the page opens idle; one under the current key that does not read is
 * dropped.
 */
export function restoreCook(): void {
  const stored = stores.cooks.load();
  if (stored === null) {
    if (stores.cooks.text() !== null) stores.cooks.remove();
    return;
  }
  dispatch({ kind: 'restore', stored: stored });
}
