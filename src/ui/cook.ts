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
 * The pull's alarm is scheduled ahead on the audio clock for the pull the
 * plan sets (`setPullAlarm`), except while the time to boil is a guess, and
 * rung when a step writes the pull ringing. The ticker runs, and the screen
 * is kept awake, while a cook is short of Done; at Done the page wakes when
 * the plan says something is next decided (`wakeAt_s`), and when looked at.
 */

import { nudgeSeconds } from '../core/decide.ts';
import type { BoilMemory } from '../core/boil.ts';
import { answered } from '../core/running.ts';
import { phaseNow } from './state.ts';
import { type EditTimer, type Effect, type Model, type Msg, update } from './model.ts';
import type { Learner } from './calibration.ts';
import {
  type Ticker, clockMoved, keepScreenAwake, blip, previewAlarm, primeAudio, pullSounding, releaseScreen, ringAlarm,
  setAlarmSound, setMuted, setPullAlarm, startTicker, stopAlarm,
} from './clock.ts';
import { activeLocale } from './copy.ts';
import { builtFor } from './decisionGrids.ts';
import { cancelSoon, nextFrame, soon } from './idle.ts';
import { answerTaken, probeRefused, probeTaken, resetFeedback, retryProbe } from './feedback.ts';
import { saveResults } from './learned.ts';
import { draw, drawnNothing, showStartLimit } from './render.ts';
import { view, viewMemo } from './view.ts';
import { send, sendTo } from './send.ts';
import type { Sharing } from './share.ts';
import type { CookStore, PansStore, SettingsStore } from './store.ts';
import { unitSystem, useUnits } from './units.ts';
import {
  dropPending, finalEggs, followLanguage, forgetAll, saveNow, saveSoon, solveSoon,
} from './effects.ts';
import { showEgg } from './views.ts';
import { type Builds, type Needs, openNeeds, workerBuilds } from './needs.ts';
import { clockSpeed, nowMs, onClockChange, random } from './now.ts';
import { ownsApp } from './owner.ts';

/** The page's model: what `update` last made of it. Kept here only. */
let model!: Model;

/** The model as it stands, for what reads the page between messages: the
 *  test API's snapshot (dev/test.ts), the start's − and + (edit.ts). */
export function pageModel(): Model {
  return model;
}

/** Whether no cook runs: a newer build takes over only then (offline.ts). */
export function betweenCooks(): boolean {
  return model.cook === null;
}

/** How many of the log's eggs are final, for sharing (share.ts). */
export function finalNow(): number {
  return finalEggs(stores, model);
}

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

/** What the page waits for, asked for once each (needs.ts). */
let needs!: Needs;

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
  draw(view(model, nowMs(), memo), drawn);
}

/** A frame asked for and not yet drawn, drawn now: a script reads the page
 *  as the model stands, not a frame behind it (dev/test.ts). */
export function flushDraw(): void {
  if (framed) drawNow();
}

/* ------------------------------------------------------------ messages */

/** Take up what `msg` did, and do what it asks: the runner's view of its
 *  caches and the stores handed in with it, and the units and the sound
 *  kept with the settings before the effects. */
function apply(msg: Msg, now: number): void {
  const built = builtFor(model.calib);
  const share = stores.sharing.state();
  const [next, effects] = update(model, msg, now, {
    surfaces: built.surfaces, profiles: built.profiles, sharing: share.on,
    share: { state: share, final: finalEggs(stores, model) },
  });
  model = next;
  useUnits(model.settings.unitsChosen);
  if (muted !== model.settings.muted) {
    muted = model.settings.muted;
    setMuted(muted);
  }
  setAlarmSound(model.settings.alarm);
  perform(effects);
}

/**
 * One thing that happened, at the page's time now. Then what the page waits
 * for is asked for, the ticker and the alarm follow the plan, and the page
 * is drawn. A message sent while one is taken up waits for it.
 */
export function dispatch(msg: Msg): void {
  // A page that lost the app to another tab (owner.ts) takes nothing up.
  if (!ownsApp()) return;
  queue.push(msg);
  if (busy) return;
  busy = true;
  try {
    while (queue.length > 0) apply(queue.shift()!, nowMs());
  } finally {
    busy = false;
  }
  needs.follow();
  keepTime();
  requestDraw();
}

/** The runner, with the stores it holds and the model as boot read it,
 *  plugged in for `send` and for the development clock's moves, and the
 *  sound as the settings have it: once, at boot. */
export function startRunner(s: Stores, initial: Model, builds: Builds = workerBuilds(s.learner)): void {
  stores = s;
  model = initial;
  needs = openNeeds(builds, () => model, dispatch);
  sendTo(dispatch);
  onClockChange(clockMoved);
  muted = model.settings.muted;
  setMuted(muted);
  setAlarmSound(model.settings.alarm);
}

/** The page no longer owns the app (owner.ts): every message is refused
 *  from now on (`dispatch`), and what would still write or sound stopped -
 *  the ticker and the screen kept awake, the page's wake, a correction's
 *  timers, the saves and solves waiting to coalesce, the folds and the
 *  sharing. The alarm and the worker are app.ts's to stop. */
export function stopRunner(): void {
  if (clock.ticker !== null) clock.ticker.stop();
  clock.ticker = null;
  releaseScreen();
  window.clearTimeout(clock.wake);
  clock.wake = 0;
  for (const timer of EDIT_TIMERS) editTimer(timer, null);
  dropPending();
  stores.learner.close();
  stores.sharing.close();
}

/* ------------------------------------------------------------- effects */

function perform(effects: Effect[]): void {
  for (const e of effects) {
    if (e.kind === 'sendFinal') {
      // What is final may have moved: sharing read again, and drawn, after
      // the page has booted, since this can come of a restore.
      queueMicrotask(() => send({ kind: 'shared' }));
    }
    if (performStored(e, stores, model.boilMemory, send)) continue;
    switch (e.kind) {
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
      case 'blip':
        blip();
        break;
      case 'questionsReset':
        resetFeedback();
        break;
      case 'answerTaken':
        answerTaken(e.yolkWord, e.white);
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
        if (e.soon) saveSoon(stores.settings, () => model.settings);
        else saveNow(stores.settings, model.settings);
        break;
      case 'solveSoon':
        solveSoon();
        break;
      case 'askSurface':
        needs.askSurface(e.inputs);
        break;
      case 'askProfile':
        needs.askProfile(e.inputs);
        break;
      case 'retryProbe':
        retryProbe();
        break;
      case 'language':
        followLanguage(e.before, model.settings.language);
        break;
      case 'previewAlarm':
        previewAlarm();
        break;
      case 'drawNudge':
        // A new page or a new cook, a new nudge: a whole number of seconds
        // from -10 to +10, drawn when the page boots and again after each
        // cook, so the time on screen holds still while the cook looks at it.
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
  const plan = model.plan;
  setPullAlarm(plan === null || plan.deadlines.provisional || model.pull_s === null ? null : model.pull_s * 1000);
}

/**
 * What a message asks of the stores, carried out: the cook written down,
 * the lean beside it, an ended cook over its own copy; a measured boil
 * remembered (`boilMemory`, the pans the page holds); the egg's record kept
 * and learned from, the page told whether it was; the cook forgotten; what
 * is final sent. Whether `e` was one of these. A test hands in its own
 * stores and `send`.
 */
export function performStored(e: Effect, s: Stores, boilMemory: BoilMemory, send: (msg: Msg) => void): boolean {
  switch (e.kind) {
    case 'persist':
      // The page is told when whether a write reads back changes.
      send({ kind: 'persisted', works: s.cooks.save(e.cook, e.answers, e.leanHint_s) !== null });
      return true;
    case 'persistLean':
      s.cooks.saveLeanHint(e.id_ms, e.leanHint_s);
      return true;
    case 'persistEnded':
      if (s.cooks.load()?.cook.id_ms === e.cook.id_ms) s.cooks.save(e.cook, answered(e.cook) ? 'beforeReload' : 'none', e.leanHint_s);
      return true;
    case 'rememberBoil':
      send({ kind: 'pans', boilMemory: s.pans.remember(boilMemory, e.boil.litres, e.boil.seconds) });
      return true;
    case 'log': {
      const id = e.record.id ?? null;
      void s.learner.keepRecord(e.record).then((kept) => send({ kind: 'kept', id_ms: id, kept: kept }));
      return true;
    }
    case 'forget':
      s.cooks.clear(e.id_ms);
      return true;
    case 'sendFinal':
      // After the page has booted, since this can come of a restore.
      queueMicrotask(() => { void s.sharing.sendFinal(); });
      return true;
    default:
      return false;
  }
}

/* ------------------------------------------------------------ the needs */

/** The ticker and the screen kept awake while the running cook is short of
 *  Done; at Done, a wake when its plan next decides something. */
function keepTime(): void {
  const running = model.cook !== null && phaseNow(model, nowMs()) !== 'DONE';
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
  const at = model.need.wakeAt_s;
  if (clock.ticker !== null || model.cook === null || at === null) return;
  const ms = Math.min(2 ** 31 - 1, Math.max(0, (at * 1000 - nowMs()) / clockSpeed()) + 50);
  clock.wake = window.setTimeout(() => {
    clock.wake = 0;
    dispatch({ kind: 'tick' });
  }, ms);
}

/* ------------------------------------------------------------ the page */

/** The primary button, in every phase. */
export function onPrimary(): void {
  if (model.cook === null) {
    startCookNow();
    return;
  }
  dispatch({ kind: 'primary' });
}

/** Start. */
function startCookNow(): void {
  // The audio context must be created inside a user gesture or the alarm is
  // silently blocked later, when it matters.
  primeAudio();
  stopAlarm();
  resetFeedback();
  dispatch({ kind: 'begin', units: unitSystem(), lang: activeLocale() });
}

/** Cancel: a correction still settling is committed first (`update`). */
export function reset(): void {
  stopAlarm();
  if (model.cook !== null) dispatch({ kind: 'cancel' });
}

/** "Still in the water?" No: the egg came out when the clock assumed. */
export function onStillOut(): void {
  stopAlarm();
  dispatch({ kind: 'stillOut' });
}

/** The page is looked at again (shown, focused): the ticker, which stops at
 *  Done, is not there to see a cook at Done become too old. */
export function lookAgain(): void {
  if (model.cook !== null) dispatch({ kind: 'tick' });
}

/**
 * Pick a cook back up after a reload, or in a tab the app was moved to
 * (`reloaded` false): a tick of the stored cook with no plan yet. The cook
 * is clock times, so the countdown resumes at the right number rather than
 * restarting. After a reload the alarm does NOT come back: it lived in the
 * old page's audio context, and a new one cannot sound before a gesture, so
 * a restored cook says so rather than letting someone walk away trusting a
 * noise that will not happen. A tab the app was moved to was pressed, which
 * primed its audio, so its alarm is armed again and a pull it finds due
 * rings. One too old to pick back up ends as Start again would end it, and
 * the page opens idle; one under the current key that does not read is
 * dropped.
 */
export function restoreCook(reloaded: boolean): void {
  const stored = stores.cooks.load();
  if (stored === null) {
    if (stores.cooks.text() !== null) stores.cooks.remove();
    return;
  }
  dispatch({ kind: 'restore', stored: stored, reloaded: reloaded });
}
