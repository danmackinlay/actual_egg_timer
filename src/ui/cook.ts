/**
 * The cook itself, as an effect runner over core's `step` (model.ts,
 * `update`): each thing that happens is a message (`dispatch`), the model
 * takes what `update` returns, and this module does what it asks - writes
 * the cook down, schedules and rings the alarm, remembers the boil, logs the
 * egg's record, forgets the cook and sends what is final - builds what the
 * cook waits for (its pot's surface, the calibration before this egg and a
 * surface on it) off the main thread, and draws the page.
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

import { DecisionInputs, inputsKey } from '../core/decide.js';
import { WhiteReport, YolkWord } from '../core/infer.js';
import { EggRecord, ProbeReading } from '../core/record.js';
import { CookChoices, RunningCook, answered } from '../core/running.js';
import { idleChoices, learning, phaseNow, settingsOfChoices, sizeClasses, state, timeToBoil_s } from './state.js';
import { Effect, Msg, update } from './model.js';
import { answerFor, askForCookSurface, currentInputs, decided, drawNudge, nudgeNow } from './answer.js';
import { calibrationBefore, keepRecord } from './calibration.js';
import {
  Ticker, keepScreenAwake, blip, primeAudio, pullSounding, releaseScreen, ringAlarm, setPullAlarm, startTicker,
  stopAlarm,
} from './clock.js';
import { applySettingsToDom } from './controls.js';
import { activeLocale, t } from './copy.js';
import { cachedOddsProfile, cookSurfaces, decisionGrid, oddsProfileFor } from './decisionGrids.js';
import { page } from './dom.js';
import { commitEdit, endEdits, startEdits } from './edit.js';
import { resetFeedback, retryProbe } from './feedback.js';
import { renderLearned } from './learned.js';
import { render } from './render.js';
import { sendFinal } from './share.js';
import { clearCook, cookStore, correctedLater, rememberTimeToBoil, saveCook, saveLeanHint, takeUpEvents } from './store.js';
import { unitSystem } from './units.js';
import { applyAnswer, drawShare, recompute } from './update.js';
import { showEgg } from './views.js';
import { clockSpeed, nowMs } from './now.js';

/** The ticker while a cook short of Done runs, and the page's wake at Done. */
const clock = {
  ticker: null as Ticker | null,
  wake: 0,
};

/** What is being built for a cook, by key, so each is asked for once. */
const building = new Set<string>();

/* ------------------------------------------------------------ messages */

/** The stored cook's id as this tab reads it, for whether its egg is still
 *  open: its own when storage does not work. */
function storedId(): number | null {
  if (!state.works) return state.cook === null ? null : state.cook.id_ms;
  return cookStore.peek()?.cook.id_ms ?? null;
}

/** Take up what `msg` did, and do what it asks. */
function apply(msg: Msg, now: number): void {
  state.surfaces = cookSurfaces(state.calib);
  const [next, effects] = update(state, msg, now);
  Object.assign(state, next);
  perform(effects);
}

/**
 * One thing that happened, at the page's time now. What another tab wrote
 * for the running cook since is taken up first. Then the controls follow a
 * cook begun or ended, what the cook waits for is asked for, the ticker and
 * the alarm follow the plan, and the page is drawn.
 */
export function dispatch(msg: Msg): void {
  const now = nowMs();
  const was = state.cook;
  if (was !== null && msg.kind !== 'elsewhere') {
    const taken = cookStore.takeUp();
    if (taken !== null) apply({ kind: 'elsewhere', theirs: taken.theirs, storedId_ms: storedId() }, now);
  }
  apply(msg, now);
  if (was === null && state.cook !== null) showCookControls();
  if (was !== null && state.cook === null) leaveCook();
  follow();
  render(now);
}

/* ------------------------------------------------------------- effects */

function perform(effects: Effect[]): void {
  for (const e of effects) {
    switch (e.kind) {
      case 'persist':
        persist(e.cook, e.leanHint_s, e.onScreen);
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
        state.boilMemory = rememberTimeToBoil(state.boilMemory, e.boil.litres, e.boil.seconds);
        break;
      case 'log':
        logRecord(e.record);
        break;
      case 'forget':
        clearCook(e.id_ms);
        break;
      case 'sendFinal':
        // After the page has booted, since this can come of a restore.
        queueMicrotask(() => {
          drawShare();
          void sendFinal();
        });
        break;
      case 'blip':
        blip();
        break;
    }
  }
  // The pull's beeps, ahead on the audio clock, for the pull the plan sets:
  // none while the time to boil is a guess (the plan reads Heating whatever
  // it says).
  const plan = state.plan;
  setPullAlarm(plan === null || plan.deadlines.provisional || state.pull_s === null ? null : state.pull_s * 1000);
}

/** Whether the egg is in the log as an answer would put it, as the stored
 *  cook keeps it: answered, or its questions put away. */
function keptAnswers(): 'none' | 'beforeReload' {
  return state.questions === 'away' || (state.cook !== null && answered(state.cook)) ? 'beforeReload' : 'none';
}

/**
 * Write a cook down. The one on screen only when it changed - something it
 * was told or saw, never a plan alone, which would write a copy lacking
 * what another tab on the same cook saw since: then only the lean beside it.
 * A copy of this cook another tab corrected later stays the copy stored
 * (onescreen review 1.1), so a reload restores the latest correction: what
 * this tab saw in the pan is written into it instead (`takeUpEvents`), and
 * this tab runs on as it is (DECISIONS.md 97). A cook ended, waiting on its
 * record, is written over its own copy only.
 */
function persist(cook: RunningCook, leanHint_s: number, onScreen: boolean): void {
  const stored = cookStore.peek();
  const same = stored !== null && stored.cook.id_ms === cook.id_ms;
  if (!onScreen) {
    if (same) saveCook(cook, answered(cook) ? 'beforeReload' : 'none', leanHint_s);
    return;
  }
  const text = JSON.stringify(cook);
  if (text === state.written) {
    saveLeanHint(cook.id_ms, leanHint_s);
    return;
  }
  let written: string | null;
  if (same && correctedLater(stored.cook, cook)) {
    const answers = stored.answers === 'beforeReload' ? stored.answers : keptAnswers();
    written = saveCook(takeUpEvents(stored.cook, cook), answers, stored.leanHint_s);
  } else {
    written = saveCook(cook, keptAnswers(), leanHint_s);
  }
  state.written = text;
  state.works = written !== null;
}

/** The egg's record kept and learned from (`keepRecord`); then, if the cook
 *  is still on screen at Done, thanked for, or, if it could not be kept, its
 *  questions put away, since no more could be kept either. */
function logRecord(record: EggRecord): void {
  const id = record.id ?? null;
  void keepRecord(record).then((kept) => {
    const cook = state.cook;
    const here = cook !== null && cook.id_ms === id && phaseNow(nowMs()) === 'DONE';
    if (here && kept && answered(cook)) page().calibNote.textContent = t('feedback.thanks');
    if (here && !kept) {
      state.questions = 'away';
      render(nowMs());
    }
    renderLearned(learning());
  });
}

/* ------------------------------------------------------------ the needs */

/** Whether a cook wants the surface for `inputs`: the running cook's plan
 *  reads it, or a cook waits on it. */
export function cookWants(inputs: DecisionInputs): boolean {
  const key = inputsKey(inputs);
  const wanted = (i: DecisionInputs | null): boolean => i !== null && inputsKey(i) === key;
  if (state.plan !== null && wanted(state.plan.inputs)) return true;
  return wanted(state.need.surface) || state.ending.some((e) => wanted(e.need.surface));
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
  calibrationBefore(id).then((calibration) => {
    building.delete(key);
    if (!waitsOn(id)) return;
    state.before = [...state.before.filter((b) => b.id_ms !== id), { id_ms: id, before: { calibration: calibration, surfaces: [] } }];
    dispatch({ kind: 'landed' });
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
    const now = state.before.find((b) => b.id_ms === id);
    if (now === undefined || now.before.calibration !== calibration) return;
    const surface = { inputs: inputs, grid: grid, profile: profile };
    state.before = state.before.map((b) => (b !== now ? b
      : { id_ms: id, before: { calibration: calibration, surfaces: [...now.before.surfaces, surface] } }));
    dispatch({ kind: 'landed' });
  }, (error: unknown) => {
    building.delete(key);
    console.warn('the corrected egg’s surface failed', error);
  });
}

/** Whether a cook started at `id` is still on screen or waiting. */
function waitsOn(id: number): boolean {
  return state.cook?.id_ms === id || state.ending.some((e) => e.cook?.id_ms === id);
}

/** The ticker and the screen kept awake while the running cook is short of
 *  Done; at Done, a wake when its plan next decides something. */
function keepTime(): void {
  const running = state.cook !== null && phaseNow(nowMs()) !== 'DONE';
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

/* ------------------------------------------------- the controls follow */

/** The controls show the running cook's own choices, never the settings
 *  (review 2.5): at the start, where they are the same, and after a reload,
 *  where another tab may have changed the settings since. */
function showCookControls(): void {
  if (state.cook === null) return;
  state.controls = settingsOfChoices(state.settings, state.cook.choices, sizeClasses);
  applySettingsToDom();
  startEdits();
}

/** The cook has ended: the controls show the settings again (another tab may
 *  have changed them meanwhile), a new cook gets a new nudge, the questions
 *  start empty, and the idle page is solved again. */
function leaveCook(): void {
  endEdits();
  stopAlarm();
  resetFeedback();
  state.controls = state.settings;
  applySettingsToDom();
  drawNudge();
  recompute();
  // The egg just finished is final once it is forgotten: no answer can be
  // added to it.
  drawShare();
}

/* ------------------------------------------------------------ the page */

/** The primary button, in every phase. */
export function onPrimary(): void {
  if (state.cook === null) {
    startCookNow();
    return;
  }
  // A correction still settling is committed first: the button acts on the
  // cook as the controls say it is.
  commitEdit();
  stopAlarm();
  dispatch({ kind: 'primary' });
}

/** Start: the answer on screen taken up one last time while the controls
 *  are still live - the level it snaps to is the one the cook starts at -
 *  and the cook started on it, with the lean the time on screen took. */
function startCookNow(): void {
  // The audio context must be created inside a user gesture or the alarm is
  // silently blocked later, when it matters.
  primeAudio();
  stopAlarm();
  const boil = timeToBoil_s();
  state.profile = cachedOddsProfile(currentInputs(boil), state.calib);
  const answer = answerFor(boil, state.settings.doneness, state.profile);
  applyAnswer(answer);
  const chosen = decided(answer, boil);
  // A cook started here is this tab's own, whatever happened before it.
  resetFeedback();
  cookStore.load();
  dispatch({
    kind: 'start', choices: idleChoices(), nudge_s: nudgeNow(), units: unitSystem(), lang: activeLocale(),
    leanHint_s: chosen === null ? 0 : chosen.decision.cookTime_s - chosen.decision.meanCookTime_s,
  });
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

/** A correction committed (edit.ts): the start and the choices replaced. */
export function correctCook(choices: CookChoices, startedAt_s: number | null): void {
  dispatch({ kind: 'correct', choices: choices, startedAt_s: startedAt_s });
}

/** An answer at Done (feedback.ts): whether the cook took it. */
export function answerCook(yolk: YolkWord | null, white: WhiteReport | null, probe: ProbeReading | null): boolean {
  if (state.cook === null) return false;
  const said = answersGiven(state.cook);
  dispatch({ kind: 'answered', yolkWord: yolk, white: white, probe: probe, storedId_ms: storedId() });
  return state.cook !== null && !state.closed && answersGiven(state.cook) > said;
}

/** How many answers a cook's log holds. */
function answersGiven(cook: RunningCook): number {
  return cook.log.filter((e) => e.kind === 'answered').length;
}

/** A surface, a profile or a calibration a cook wanted, landed. */
export function cookLanded(): void {
  dispatch({ kind: 'landed' });
  retryProbe();
}

/** Another tab changed storage (the `storage` event; a null key cleared it
 *  all): what it wrote for this cook taken up at once, so a tab leaves
 *  Heating when another taps the boil (review 1.2); at Done, whether this
 *  egg is still open, its questions going if not. */
export function cookElsewhere(key: string | null): void {
  if (!cookStore.touches(key) || state.cook === null) return;
  const id = storedId();
  dispatch({ kind: 'elsewhere', theirs: cookStore.takeUp()?.theirs ?? null, storedId_ms: id });
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
  const stored = cookStore.load();
  if (stored === null) {
    if (cookStore.text() !== null) cookStore.remove();
    return;
  }
  dispatch({ kind: 'restore', stored: stored });
}
