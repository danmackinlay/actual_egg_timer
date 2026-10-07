/**
 * The cook itself: the primary button through every phase (`onPrimary`),
 * the ticker and its alarms (`onTick`), Cancel and "Start again" (`reset`),
 * the cook written down with every step (`persistCook`), and a cook picked
 * back up after a reload (`restoreCook`).
 *
 * A cook is core's `RunningCook` (src/core/running.ts): its start, its
 * choices and what it observed. Everything else is its plan (`replan`),
 * planned again only when something new is known - the boil tapped, the egg
 * out, an event the clock decided (`eventsDue`), a surface landing, the slow
 * hob's moment (`slowHobAt_s`), a reload - and never on every tick, since a
 * plan costs tens of milliseconds, and a slow hob's hundreds. The phase is
 * read from the plan and the clock (`phaseAt`) every tick, and the alarm
 * rings whenever it enters Pull.
 */

import { Phase } from '../core/policy.js';
import {
  CookEvents, CookPlan, RunningCook, cookEnding, cookTooOld, eventsDue, replan, startCook, withBoil, withOut,
} from '../core/running.js';
import { answerFor, askForCookSurface, currentInputs, decided, drawNudge, nudgeNow, surfaceFor } from './answer.js';
import { learn, logEgg } from './calibration.js';
import { keepUnreadCook } from './calibrationStore.js';
import {
  Ticker, blip, keepScreenAwake, primeAudio, releaseScreen, ringAlarm, startTicker, stopAlarm,
} from './clock.js';
import { applySettingsToDom } from './controls.js';
import { activeLocale } from './copy.js';
import { cachedOddsProfile } from './decisionGrids.js';
import { eggRecordFor } from './eggRecord.js';
import { answersNow, forgetAnswers, keptAnswers, resumeAnswers } from './feedback.js';
import { render } from './render.js';
import { sendFinal } from './share.js';
import { idleChoices, phaseNow, state, timeToBoil_s } from './state.js';
import {
  clearCook, dropStoredCook, loadCook, rememberTimeToBoil, saveCook, storedCookText, takeOldCook,
} from './store.js';
import { unitSystem } from './units.js';
import { applyAnswer, drawShare, recompute } from './update.js';

/** The ticker, while a cook runs, and the phase it last saw, so the alarm
 *  rings once as the cook enters Pull, and the cook finishes once. */
const clock = {
  ticker: null as Ticker | null,
  phase: 'IDLE' as Phase,
};

/** Write the cook down as it is now, or forget it once there is none. */
export function persistCook(): void {
  if (state.cook === null) return;
  saveCook(state.cook, keptAnswers(), state.leanHint_s);
}

/**
 * Plan `cook` at `now_s` on the surface its pot wants, as far as it is in:
 * planned once on the surface the last plan wanted, and again if this one
 * wants another that is already built (a pot is known only once planned,
 * since the slow hob's ramp is found by solving). Whatever it wants and has
 * not got is asked for, and lands through `replanCook`.
 */
function planFor(cook: RunningCook, leanHint_s: number, now_s: number, before: CookPlan | null): CookPlan {
  const guess = before === null ? null : before.inputs;
  let plan = replan(cook, state.calib, surfaceFor(guess), leanHint_s, now_s);
  if (plan.inputs !== null && plan.decided === null) {
    const s = surfaceFor(plan.inputs);
    if (s !== null) plan = replan(cook, state.calib, s, leanHint_s, now_s);
  }
  return plan;
}

/** `cook` planned at `now_s`, with the events the clock has decided by then
 *  written down - the first time they are seen, from the plan that rang - and
 *  planned again with them. */
function plannedWithEvents(
  cook: RunningCook, leanHint_s: number, now_s: number, before: CookPlan | null,
): { cook: RunningCook; plan: CookPlan } {
  const plan = planFor(cook, leanHint_s, now_s, before);
  const due = eventsDue(cook, plan, now_s);
  if (sameEvents(due, cook.events)) return { cook: cook, plan: plan };
  const next = { ...cook, events: due };
  return { cook: next, plan: planFor(next, leanHint_s, now_s, plan) };
}

/** Take up a cook and its plan: the lean it decided, kept as the interim for
 *  the next pot; the surface it wants and has not got, asked for; and the
 *  cook written down. */
function takeUp(cook: RunningCook, plan: CookPlan): void {
  state.cook = cook;
  state.plan = plan;
  if (plan.decided !== null) state.leanHint_s = plan.lean_s;
  if (plan.inputs !== null && (plan.decided === null || surfaceFor(plan.inputs)?.profile === null)) {
    askForCookSurface(plan.inputs);
  }
  persistCook();
}

/** Plan the running cook again, now. */
function planNow(now_s: number): void {
  if (state.cook === null) return;
  const next = plannedWithEvents(state.cook, state.leanHint_s, now_s, state.plan);
  takeUp(next.cook, next.plan);
}

function sameEvents(a: CookEvents, b: CookEvents): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A surface or a profile the running cook's plan wanted, landed. */
export function replanCook(): void {
  if (state.cook === null) return;
  const now = Date.now();
  planNow(now / 1000);
  notice(now);
  render(now);
}

/** Ring as the cook enters Pull, and finish it as it enters Done, whatever
 *  brought it there: the clock, a plan, a tap. */
function notice(now_ms: number): void {
  const phase = phaseNow(now_ms);
  const was = clock.phase;
  clock.phase = phase;
  if (phase === was) return;
  if (phase === 'PULL') ringAlarm(true);
  if (phase === 'DONE') finishCook();
}

function onTick(): void {
  const now = Date.now();
  const now_s = now / 1000;
  const cook = state.cook;
  const plan = state.plan;
  if (cook !== null && plan !== null) {
    // The slow hob's moment, or an event the clock has decided: plan again.
    const slow = plan.slowHobAt_s !== null && now_s >= plan.slowHobAt_s;
    if (slow || !sameEvents(eventsDue(cook, plan, now_s), cook.events)) planNow(now_s);
  }
  notice(now);
  render(now);
}

function startTicking(): void {
  if (clock.ticker === null) clock.ticker = startTicker(onTick);
}

function stopTicking(): void {
  if (clock.ticker !== null) {
    clock.ticker.stop();
    clock.ticker = null;
  }
}

/** The egg is done: ring, then stop repainting and let the screen sleep. */
function finishCook(): void {
  ringAlarm(false);
  stopTicking();
  releaseScreen();
}

/** What a cook leaves when it ends (`cookEnding`): the time to boil it
 *  measured, remembered now that the cook is as last corrected; and its egg,
 *  if it was cooked through and nothing has logged it. */
function endCook(cook: RunningCook, plan: CookPlan, now_s: number, answered: boolean): void {
  const ending = cookEnding(cook, plan, now_s);
  if (ending.boil !== null) {
    state.boilMemory = rememberTimeToBoil(state.boilMemory, ending.boil.litres, ending.boil.seconds);
  }
  // An egg finished and never answered about is still an egg: the cook, the
  // recommendation and the pull are data for the fit. It folds nothing.
  if (ending.finished && !answered) {
    logEgg(eggRecordFor(cook, plan, null));
    void learn();
  }
}

/** Cancel, and "Start again" at DONE. */
export function reset(): void {
  stopAlarm();
  stopTicking();
  releaseScreen();
  const cook = state.cook;
  const plan = state.plan;
  if (cook !== null && plan !== null) {
    endCook(cook, plan, Date.now() / 1000, answersNow().kind !== 'none');
    clearCook(cook.id_ms);
  }
  forgetAnswers();
  state.cook = null;
  state.plan = null;
  state.leanHint_s = 0;
  clock.phase = 'IDLE';
  // The controls were left alone while the cook ran (another tab may have
  // changed the settings meanwhile): they show the settings again.
  applySettingsToDom();
  // A new cook, a new nudge.
  drawNudge();
  recompute();
  // The egg just finished is final now: no answer can be added to it.
  drawShare();
  void sendFinal();
}

export function onPrimary(): void {
  const now = Date.now();
  const now_s = now / 1000;
  stopAlarm();
  const phase = phaseNow(now);

  if (phase === 'IDLE') {
    // The audio context must be created inside a user gesture or the alarm is
    // silently blocked later, when it matters.
    primeAudio();
    keepScreenAwake();
    const boil = timeToBoil_s();
    // Take the answer up one last time while the controls are still live:
    // the level it snaps to is the one the cook starts at.
    state.profile = cachedOddsProfile(currentInputs(boil), state.calib);
    const answer = answerFor(boil, state.settings.doneness, state.profile);
    applyAnswer(answer);
    const chosen = decided(answer, boil);
    // A cook started here is this tab's own, whatever happened before it.
    forgetAnswers();
    state.cook = startCook(now, idleChoices(), nudgeNow(), { ...state.boilMemory }, unitSystem(), activeLocale());
    // The lean the time on screen took, carried until the plan decides its
    // own: the plan on this pot's surface is the time that was on screen.
    state.leanHint_s = chosen === null ? 0 : chosen.decision.cookTime_s - chosen.decision.meanCookTime_s;
    state.plan = null;
    planNow(now_s);
    clock.phase = phaseNow(now);
    startTicking();
    blip();
    render(now);
    return;
  }

  const cook = state.cook;
  const plan = state.plan;
  if (cook === null || plan === null) return;

  if (phase === 'HEATING') {
    // The boil, observed. What it teaches the pan's memory is written when
    // the cook ends (`cookEnding`), as last corrected.
    state.cook = withBoil(cook, now_s);
    planNow(now_s);
    blip();
    onTick();
    return;
  }

  if (phase === 'PULL') {
    state.cook = withOut(cook, plan, now_s);
    planNow(now_s);
    notice(now);
    render(now);
    return;
  }

  if (phase === 'DONE') reset();
}

/**
 * Pick a cook back up after a reload.
 *
 * The cook is clock times, so the countdown resumes at the right number
 * rather than restarting. What does NOT come back is the alarm: it lives in
 * this tab's audio context and died with the old page, so a restored cook
 * says so rather than letting someone walk away trusting a noise that will
 * not happen.
 *
 * A cook 0.4 wrote (`aet.cook.v2`) is a shape this build does not read: it is
 * kept aside as stored and its key deleted, and the page opens idle
 * (DECISIONS.md 81, 97). So is a cook under the current key that does not
 * read. One too old to pick back up (`cookTooOld`) ends as Start again would
 * end it, and the page opens idle.
 */
export function restoreCook(): void {
  const old = takeOldCook();
  if (old !== null) keepUnreadCook(old);
  const text = storedCookText();
  const stored = loadCook();
  if (stored === null) {
    // Another build's cook, most likely: kept aside, as stored, and exported
    // with the results (DECISIONS.md 81). Its egg may be one nothing else holds.
    if (text !== null) {
      keepUnreadCook(text);
      dropStoredCook();
    }
    return;
  }

  const now = Date.now();
  const now_s = now / 1000;
  const back = plannedWithEvents(stored.cook, stored.leanHint_s, now_s, null);
  if (cookTooOld(back.plan, now_s)) {
    endCook(back.cook, back.plan, now_s, stored.answers !== 'none');
    clearCook(back.cook.id_ms);
    return;
  }
  state.leanHint_s = stored.leanHint_s;
  resumeAnswers(stored.answers);
  takeUp(back.cook, back.plan);
  clock.phase = phaseNow(now);
  if (clock.phase !== 'DONE') {
    keepScreenAwake();
    startTicking();
  }
}
