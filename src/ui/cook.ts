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
 * read from the plan and the clock (`phaseAt`) every tick. The pull's alarm
 * is scheduled ahead on the audio clock by every plan (`setPullAlarm`), and
 * rung by the tick on any move out of Heating or Cooking past the pull that
 * this tab has not rung (`notice`).
 */

import { Phase } from '../core/policy.js';
import { WhiteReport, YolkWord } from '../core/infer.js';
import {
  CookChoices, CookPlan, RunningCook, asRanCorrected, asRanCurrent, asksIfStillIn, cookEnding, cookStillOpen,
  cookTooOld, corrected, eventsDue, keepAsRan, pullStands, replan, sameChoices, sameEvents, slowHobDue, startCook,
  startCorrected, stillIn, withAsRan, withBoil, withOut, writeEvents,
} from '../core/running.js';
import { answerFor, askForCookSurface, currentInputs, decided, drawNudge, nudgeNow, surfaceFor } from './answer.js';
import { calibrationBefore, eggLogged, learn, logEgg } from './calibration.js';
import {
  Ticker, blip, keepScreenAwake, primeAudio, pullSounding, releaseScreen, ringAlarm, setPullAlarm, startTicker,
  stopAlarm,
} from './clock.js';
import { applySettingsToDom } from './controls.js';
import { commitEdit, endEdits, startEdits } from './edit.js';
import { activeLocale } from './copy.js';
import { cachedOddsProfile, decisionGrid, oddsProfileFor } from './decisionGrids.js';
import { eggRecordFor } from './eggRecord.js';
import {
  answeredElsewhere, answersNow, forgetAnswers, heldAnswers, keptAnswers, putAway, resumeAnswers, retryHeld,
} from './feedback.js';
import { render } from './render.js';
import { sendFinal } from './share.js';
import { idleChoices, phaseNow, settingsOfChoices, sizeClasses, state, timeToBoil_s } from './state.js';
import {
  clearCook, cookStoredElsewhere, correctedLater, dropStoredCook, loadCook, readStoredCook, rememberTimeToBoil, saveCook,
  saveLeanHint, storedCookText, takeUpEvents,
} from './store.js';
import { unitSystem } from './units.js';
import { applyAnswer, drawShare, recompute } from './update.js';
import { showEgg } from './views.js';
import { nowMs } from './now.js';

/** The ticker, while a cook runs, and the phase it last saw, so the alarm
 *  rings once as the cook passes the pull, and the cook finishes once; and
 *  whether this tab has rung the pull for this cook. */
const clock = {
  ticker: null as Ticker | null,
  phase: 'IDLE' as Phase,
  pullRung: false,
};

/**
 * This tab's cook as written down (running-cook review 1.2, 2.3).
 *
 * - `text`: the stored cook's text as this tab last read or wrote it; any
 *   other text there is another tab's write, taken up before this tab plans
 *   or writes (`takeUpStored`).
 * - `cook`: this cook as stored then, as JSON. A tab writes its cook only
 *   when it differs - something this cook was told or saw: a tap, an event
 *   the clock decided, the plan as it ran kept, an answer - never after a
 *   plan alone (a surface landing, the slow hob's moment), which would write
 *   a copy lacking what another tab on the same cook saw since.
 * - `closed`: the egg is final - by the clock, or another tab ended it or
 *   stored another - and nothing more is written or logged for it (2.3).
 * - `works`: whether a write reads back, which storage that is off or full
 *   does not, so the stored cook can say nothing about this one.
 */
const written = {
  text: null as string | null,
  cook: null as string | null,
  closed: false,
  works: true,
};

/** Write the cook down as it is now, after taking up what another tab wrote
 *  for it since, so nothing it saw is written over. Never once it is closed.
 *  A copy of this cook another tab corrected later than this one stays the
 *  copy stored (onescreen review 1.1), so a reload restores the latest
 *  correction: what this tab saw in the pan is written into it instead
 *  (`takeUpEvents`), and this tab runs on as it is (DECISIONS.md 97). */
export function persistCook(): void {
  if (state.cook === null || written.closed) return;
  // Taken up here too: a write from the answers comes between plans. The
  // plan follows at once.
  if (takeUpStored()) queueMicrotask(replanCook);
  const stored = readStoredCook(storedCookText());
  if (stored !== null && stored.cook.id_ms === state.cook.id_ms && correctedLater(stored.cook, state.cook)) {
    const answers = stored.answers === 'beforeReload' ? stored.answers : keptAnswers();
    saveCook(takeUpEvents(stored.cook, state.cook), answers, stored.leanHint_s);
  } else {
    saveCook(state.cook, keptAnswers(), state.leanHint_s);
  }
  written.text = storedCookText();
  written.cook = JSON.stringify(state.cook);
  written.works = written.text !== null;
}

/** This tab's own cook again, written down from scratch: a cook started, or
 *  one picked back up, `text` as stored with `cook` read from it. */
function freshWrites(text: string | null, cook: RunningCook | null): void {
  written.text = text;
  written.cook = cook === null ? null : JSON.stringify(cook);
  written.closed = false;
  written.works = true;
}

/**
 * What another tab wrote for this cook since this tab last read or wrote it,
 * taken up (`takeUpEvents`, review 1.2): the boil it saw tapped, the egg out,
 * the cooling ended, the plan as it ran, and an answer that logged the egg
 * (`beforeReload` never goes back to `none`). Another cook, or none, is left
 * alone (DECISIONS.md 97). Whether this tab's cook changed, to be planned again.
 */
function takeUpStored(): boolean {
  const cook = state.cook;
  if (cook === null || written.closed) return false;
  const text = storedCookText();
  if (text === written.text) return false;
  written.text = text;
  const stored = readStoredCook(text);
  if (stored === null || stored.cook.id_ms !== cook.id_ms) return false;
  written.cook = JSON.stringify(stored.cook);
  // That tab wrote the egg down with an answer: this one asks no more.
  if (stored.answers === 'beforeReload') answeredElsewhere();
  const next = takeUpEvents(cook, stored.cook);
  if (next === cook) return false;
  state.cook = next;
  return true;
}

/**
 * Whether the egg on screen is still open to answers (core `cookStillOpen`,
 * running-cook review 2.3): it is the stored cook, and not too old. When it
 * is not - Start again or Cancel in another tab, another cook stored, an hour
 * past its end - it is final, maybe sent: the questions go, as after a
 * reload, and nothing more is logged or written for it. Asked before any
 * answer is taken, and when another tab writes the cook.
 */
export function cookOpen(): boolean {
  const cook = state.cook;
  const plan = state.plan;
  if (cook === null || plan === null || written.closed) return false;
  const storedId = written.works ? (loadCook()?.cook.id_ms ?? null) : cook.id_ms;
  if (cookStillOpen(cook, plan, storedId, nowMs() / 1000)) return true;
  written.closed = true;
  putAway();
  return false;
}

/** Another tab changed storage (the `storage` event; a null key cleared it
 *  all). At DONE, whether this egg is still open: if not, its questions go.
 *  Otherwise what that tab saw of this cook is taken up at once, so a tab
 *  leaves Heating when another taps the boil (review 1.2). */
export function cookElsewhere(key: string | null): void {
  if (!cookStoredElsewhere(key) || state.cook === null) return;
  const now = nowMs();
  if (phaseNow(now) === 'DONE' && !written.closed && !cookOpen()) {
    render(now);
    return;
  }
  if (takeUpStored()) {
    planNow(now / 1000);
    notice(now);
  }
  render(now);
}

/**
 * Plan `cook` at `now_s` on the surface its pot wants, as far as it is in:
 * planned once on the surface the last plan wanted, and again if this one
 * wants another that is already built (a pot is known only once planned,
 * since the slow hob's ramp is found by solving). Whatever it wants and has
 * not got is asked for, and lands through `replanCook`. The slow hob's rule
 * starts where the last plan got to (`before.slowHob`, running-cook review
 * 2.1), which core takes only when it fits, so a creeping plan is one solve.
 */
function planFor(cook: RunningCook, leanHint_s: number, now_s: number, before: CookPlan | null): CookPlan {
  const guess = before === null ? null : before.inputs;
  const hint = before === null ? null : before.memo;
  let plan = replan(cook, state.calib, surfaceFor(guess), leanHint_s, now_s, hint);
  if (plan.inputs !== null && plan.decided === null) {
    const s = surfaceFor(plan.inputs);
    if (s !== null) plan = replan(cook, state.calib, s, leanHint_s, now_s, hint);
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
  const next = writeEvents(cook, due);
  return { cook: next, plan: planFor(next, leanHint_s, now_s, plan) };
}

/** Take up a cook and its plan: the plan as it ran kept, from the first plan
 *  on the pot's surface once the egg is out (`keepAsRan`, running-cook review
 *  1.3, 2.4), which the record and Done read from then on; the lean it
 *  decided, kept as the interim for the next pot; the surface it wants and
 *  has not got, asked for; and the cook written down if it changed, or else
 *  only the lean beside it (`written`). */
function takeUp(cook: RunningCook, plan: CookPlan): void {
  state.cook = keepAsRan(cook, plan);
  state.plan = plan;
  const lean = plan.decided !== null ? plan.lean_s : state.leanHint_s;
  const leanMoved = lean !== state.leanHint_s;
  state.leanHint_s = lean;
  if (plan.inputs !== null && (plan.decided === null || surfaceFor(plan.inputs)?.profile === null)) {
    askForCookSurface(plan.inputs);
  }
  // The pull's beeps, ahead on the audio clock, for the pull this plan sets:
  // none while the time to boil is a guess (the plan reads Heating whatever
  // it says), once the egg is out or the pull has rung here, or while the
  // plan asks whether the egg is still in.
  armPullFor(state.cook, plan);
  if (JSON.stringify(state.cook) !== written.cook) {
    persistCook();
  } else if (leanMoved && !written.closed) {
    saveLeanHint(state.cook.id_ms, lean);
    written.text = storedCookText();
  }
}

/** The pull's beeps, ahead on the audio clock, for the pull `plan` sets:
 *  none while the time to boil is a guess (the plan reads Heating whatever it
 *  says), once the egg is out or the pull has rung here, or while the plan
 *  asks whether the egg is still in. */
function armPullFor(cook: RunningCook, plan: CookPlan): void {
  const d = plan.deadlines;
  const pullDue = !d.provisional && cook.events.pulled === null && !asksIfStillIn(plan) && !clock.pullRung;
  setPullAlarm(pullDue ? d.cookEnd_s * 1000 : null);
}

/**
 * A correction committed (edit.ts; DECISIONS.md 96 to 98): the start (when the
 * eggs went in) and the cook's choices replaced (`startCorrected`,
 * `corrected`), and the cook planned again from its start, written
 * down, and drawn. Overdue is decided here, by the plan of the corrected cook:
 * a pull now in the past is the moment of the correction, and rings now
 * (`notice`). A correction that puts the pull back in the future before the
 * egg was seen to come out - changed back within the grace - cancels it:
 * nothing was observed, so the alarm stops, and the new pull will ring.
 */
export function correctCook(choices: CookChoices, startedAt_s: number | null): void {
  if (state.cook === null || written.closed) return;
  const now = nowMs();
  const now_s = now / 1000;
  takeUpStored();
  let cook = state.cook;
  // The start, when the eggs went in, as told (`startCorrected`): refused,
  // and the cook as it was, outside the limits the start's panel shows.
  if (startedAt_s !== null && startedAt_s !== cook.startedAt_s) cook = startCorrected(cook, startedAt_s, now_s) ?? cook;
  if (!sameChoices(choices, cook.choices)) cook = corrected(cook, choices, now_s);
  if (cook === state.cook) return;
  // An egg answered about came out: a pull the clock assumed stands, so a
  // correction at Done never asks whether it is still in the water, nor
  // puts the questions away (onescreen review 2.1).
  if (answersNow().kind !== 'none') cook = pullStands(cook);
  state.cook = cook;
  afterCorrection(now);
}

/** The cook was corrected: plan it, ring or stop as its pull says, and keep
 *  the clock going if it is not Done. */
function afterCorrection(now: number): void {
  const cook = state.cook;
  if (cook === null) return;
  planNow(now / 1000);
  const phase = phaseNow(now);
  if ((phase === 'HEATING' || phase === 'COOKING') && clock.pullRung) {
    clock.pullRung = false;
    stopAlarm();
    if (state.cook !== null && state.plan !== null) armPullFor(state.cook, state.plan);
  }
  notice(now);
  if (phase !== 'DONE' && clock.ticker === null) {
    keepScreenAwake();
    startTicking();
  }
  render(now);
  refreshAsRan();
}

/**
 * A correction after the pull corrects the record (DECISIONS.md 96, 98): the
 * plan as it ran is made again for the corrected cook, on the calibration
 * before this egg (`calibrationBefore`, core `asRanCorrected`), never on one
 * that has folded this egg's own answer (design/one-screen.md section 4,
 * "Never from its own outcome"), on that calibration's surface and odds for
 * the corrected pot, built off the main thread. Done shows it once it is in.
 * An egg already logged has its record replaced from the same plan, its
 * answers kept, and the log folded again from where it starts (`logEgg`); an
 * answer held meanwhile (the record refused as stale) is made then. Dropped
 * if the cook has been corrected again, or has ended, before it lands.
 */
function refreshAsRan(): void {
  const cook = state.cook;
  if (cook === null || cook.events.pulled === null || cook.asRan === null || asRanCurrent(cook) || written.closed) return;
  const id = cook.id_ms;
  const stamp = cook.correctedAt_s;
  const stillThis = (): boolean => state.cook !== null && state.cook.id_ms === id && state.cook.correctedAt_s === stamp;
  correctedAsRan(cook, nowMs() / 1000).then((r) => {
    if (r === null || !stillThis() || state.cook === null) return;
    state.cook = withAsRan(state.cook, r.cook.asRan);
    persistCook();
    relogCorrected(state.cook, r.plan);
    retryHeld();
    render(nowMs());
  }, (error: unknown) => console.warn('the corrected egg’s record failed', error));
}

/** The egg's record made again from `plan`, its plan as it ran corrected,
 *  in place of the one logged under its id, its answers kept, and the log
 *  folded again from where it starts (`logEgg`); nothing if it is not
 *  logged. */
function relogCorrected(cook: RunningCook, plan: CookPlan): void {
  if (eggLogged(cook.id_ms) < 0) return;
  const record = eggRecordFor(cook, plan, null, null, null);
  if (record === null) return;
  logEgg(record);
  void learn();
}

/** The cook corrected after its pull, its plan as it ran made again on the
 *  calibration before this egg (`calibrationBefore`, `asRanCorrected`), with
 *  that plan, for its record; null when there is no surface to make it on. */
async function correctedAsRan(cook: RunningCook, now_s: number): Promise<{ cook: RunningCook; plan: CookPlan } | null> {
  const before = await calibrationBefore(cook.id_ms);
  const inputs = replan(cook, before, null, 0, now_s).inputs;
  if (inputs === null) return null;
  const grid = await decisionGrid(inputs);
  const profile = await oddsProfileFor(inputs, before);
  const surface = { inputs: inputs, grid: grid, profile: profile };
  const next = asRanCorrected(cook, before, surface, now_s);
  return next === null ? null : { cook: next, plan: replan(next, before, surface, 0, now_s) };
}

/** "Still in the water?" No: the egg came out when the clock assumed. The
 *  pull stands, confirmed, the correction applies to the record, and the plan
 *  does not ask again (`pullStands`). */
export function onStillOut(): void {
  const cook = state.cook;
  const plan = state.plan;
  if (cook === null || plan === null || !asksIfStillIn(plan)) return;
  stopAlarm();
  state.cook = pullStands(cook);
  afterCorrection(nowMs());
}

/** Plan the running cook again, now, with what another tab saw of it. */
function planNow(now_s: number): void {
  if (state.cook === null) return;
  takeUpStored();
  const next = plannedWithEvents(state.cook, state.leanHint_s, now_s, state.plan);
  takeUp(next.cook, next.plan);
}

/** A surface or a profile the running cook's plan wanted, landed: an answer
 *  held for want of it is made now. */
export function replanCook(): void {
  if (state.cook === null) return;
  const now = nowMs();
  planNow(now / 1000);
  notice(now);
  retryHeld();
  render(now);
}

/**
 * Ring the pull on any move from Heating or Cooking past it - to Pull, or
 * straight to Cooling or Done, as a tab woken after the grace finds it
 * (running-cook review 1.1) - that this tab has not rung, unless the cook
 * tapped the egg out (another tab's tap, taken up); and finish the cook as it
 * enters Done, whatever brought it there: the clock, a plan, a tap. Nothing
 * rings while the plan asks whether the egg is still in the water.
 */
function notice(now_ms: number): void {
  const phase = phaseNow(now_ms);
  const was = clock.phase;
  clock.phase = phase;
  if (phase === was || state.cook === null || state.plan === null || asksIfStillIn(state.plan)) return;
  const passed = (was === 'HEATING' || was === 'COOKING')
    && (phase === 'PULL' || phase === 'COOLING' || phase === 'DONE');
  const out = state.cook.events.pulled;
  let rang = false;
  if (passed && !clock.pullRung && (out === null || out.by === 'timeout')) {
    clock.pullRung = true;
    rang = true;
    // Already sounding if it was scheduled ahead and its time has come on
    // the audio clock; otherwise now.
    if (!pullSounding()) ringAlarm(true);
    // The button that answers it is on the egg's page.
    showEgg();
  }
  // Done rings too, unless the pull has only just: the egg may still be in.
  if (phase === 'DONE') finishCook(!rang);
}

function onTick(): void {
  const now = nowMs();
  const now_s = now / 1000;
  const plan = state.plan;
  if (state.cook !== null && plan !== null) {
    // What another tab saw of this cook, if its storage event has not come
    // (a tab woken from a freeze), the slow hob's moment, or an event the
    // clock has decided: plan again.
    const theirs = takeUpStored();
    const cook = state.cook;
    if (theirs || slowHobDue(plan, now_s) || !sameEvents(eventsDue(cook, plan, now_s), cook.events)) planNow(now_s);
    // Too old to pick back up (a pan heated for two hours and never tapped,
    // or an hour past the end): it ends as Cancel ends it, with its events
    // written first, as a reload would (running-cook review 2.2).
    if (endIfTooOld(now_s)) return;
  }
  notice(now);
  render(now);
}

/** End the cook on screen as Cancel does if it is too old (`cookTooOld`), by
 *  the plan the page holds; whether it did. */
function endIfTooOld(now_s: number): boolean {
  if (state.plan === null || !cookTooOld(state.plan, now_s)) return false;
  reset();
  return true;
}

/** The page is looked at again (shown, focused): the ticker, which stops at
 *  DONE, is not there to see a cook at DONE become too old. */
export function lookAgain(): void {
  endIfTooOld(nowMs() / 1000);
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
function finishCook(ring: boolean): void {
  if (ring) ringAlarm(false);
  stopTicking();
  releaseScreen();
}

/** How many times a record waiting on its pot's surface asks for one: the
 *  posterior can move while it is built (another egg folded), and the plan
 *  then wants another. */
const RECORD_TRIES = 3;

/**
 * What a cook leaves when it ends (`cookEnding`): the time to boil it
 * measured, remembered now that the cook is as last corrected; and its egg,
 * if it was cooked through and nothing has logged it, with any answer held
 * for it (feedback.ts, `held`). Then `ended`, once the egg is logged or
 * there is none: the stored cook is forgotten only then, so a page closed
 * while the record waits on its surface picks the egg back up at the next
 * load rather than losing it.
 */
function endCook(cook: RunningCook, plan: CookPlan, now_s: number, answered: boolean, ended: () => void): void {
  const ending = cookEnding(cook, plan, now_s);
  if (ending.boil !== null) {
    state.boilMemory = rememberTimeToBoil(state.boilMemory, ending.boil.litres, ending.boil.seconds);
  }
  // Answered, then corrected after the pull, and its record not made again
  // yet (onescreen review 1.2): made now and logged in place of the egg
  // logged, before the cook is forgotten and the egg becomes final, so the
  // egg kept and sent is the corrected one.
  if (answered && ending.remake) {
    remakeThenEnd(cook, now_s, ended, RECORD_TRIES);
    return;
  }
  // An egg finished and never answered about is still an egg: the cook, the
  // recommendation and the pull are data for the fit.
  if (!ending.finished || answered) {
    ended();
    return;
  }
  const held = heldAnswers();
  logFinished(cook, plan, now_s, held.yolk, held.white, ended, RECORD_TRIES);
}

/**
 * Log a finished egg from its plan as it ran, or from a plan on its pot's
 * surface (running-cook review 1.3): never from a plan with no surface, which
 * would write no forecast, and never dropped for want of one. A cook ended
 * before its surface is in - a reload at DONE, or one dropped as too old -
 * asks the worker for the surface its plan wants, plans on it, keeps the
 * plan as it ran and logs. The calibration it is planned on is the one
 * before this egg: nothing of this egg has been folded.
 */
function logFinished(
  cook: RunningCook, plan: CookPlan, now_s: number, yolk: YolkWord | null, white: WhiteReport | null,
  ended: () => void, tries: number,
): void {
  const ran = keepAsRan(cook, plan);
  const record = eggRecordFor(ran, plan, yolk, white);
  if (record !== null) {
    logEgg(record);
    void learn();
    ended();
    return;
  }
  const inputs = plan.inputs;
  // Left stored, for the next load to log, if the surface cannot be had.
  if (inputs === null || tries <= 0) return;
  // Corrected after the pull, and its plan as it ran not yet made again:
  // made now, on the calibration before this egg.
  if (cook.asRan !== null && !asRanCurrent(cook)) {
    correctedAsRan(cook, now_s).then((r) => {
      if (r !== null) logFinished(r.cook, r.plan, now_s, yolk, white, ended, tries - 1);
    }, (error: unknown) => console.warn('the corrected egg’s record failed', error));
    return;
  }
  decisionGrid(inputs).then(() => {
    const onIt = replan(cook, state.calib, surfaceFor(inputs), 0, now_s);
    logFinished(cook, onIt, now_s, yolk, white, ended, tries - 1);
  }, (error: unknown) => console.warn('the surface for an egg’s record failed', error));
}

/** An answered egg's record made again for its correction (`correctedAsRan`,
 *  on the calibration before it) and logged in its place, then `ended`. Left
 *  stored, for the next load to make, if it cannot be. */
function remakeThenEnd(cook: RunningCook, now_s: number, ended: () => void, tries: number): void {
  correctedAsRan(cook, now_s).then((r) => {
    if (r === null) {
      if (tries > 0) remakeThenEnd(cook, now_s, ended, tries - 1);
      return;
    }
    relogCorrected(r.cook, r.plan);
    ended();
  }, (error: unknown) => console.warn('the corrected egg’s record failed', error));
}

/** The cook started at `id_ms` has ended and its egg, if any, is logged:
 *  forget it, and send what is now final. After the page has booted, since
 *  this can run inside `restoreCook`. */
function forgetEnded(id_ms: number): void {
  clearCook(id_ms);
  queueMicrotask(() => {
    drawShare();
    void sendFinal();
  });
}

/** The controls show the running cook's own choices, never the settings
 *  (review 2.5): at the start, where they are the same, and after a reload,
 *  where another tab may have changed the settings since. */
function showCookControls(): void {
  if (state.cook === null) return;
  state.controls = settingsOfChoices(state.settings, state.cook.choices, sizeClasses);
  applySettingsToDom();
  startEdits();
}

/** Cancel, and "Start again" at DONE. */
export function reset(): void {
  endEdits();
  stopAlarm();
  stopTicking();
  releaseScreen();
  const cook = state.cook;
  const plan = state.plan;
  if (cook !== null && plan !== null) {
    const id = cook.id_ms;
    endCook(cook, plan, nowMs() / 1000, answersNow().kind !== 'none', () => forgetEnded(id));
  }
  forgetAnswers();
  state.cook = null;
  state.plan = null;
  state.leanHint_s = 0;
  clock.phase = 'IDLE';
  clock.pullRung = false;
  setPullAlarm(null);
  // The controls showed the cook's own choices while it ran (another tab may
  // have changed the settings meanwhile): they show the settings again.
  state.controls = state.settings;
  applySettingsToDom();
  // A new cook, a new nudge.
  drawNudge();
  recompute();
  // The egg just finished is final once it is forgotten (`forgetEnded`): no
  // answer can be added to it.
  drawShare();
}

export function onPrimary(): void {
  // A correction still settling is committed first: the button acts on the
  // cook as the controls say it is.
  if (state.cook !== null) commitEdit();
  const now = nowMs();
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
    freshWrites(null, null);
    clock.pullRung = false;
    state.cook = startCook(now_s, idleChoices(), nudgeNow(), { ...state.boilMemory }, unitSystem(), activeLocale());
    showCookControls();
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

  // "Still in the water?" Yes: the pull the clock assumed is dropped, and
  // the cook planned again as told now; a pull already past is now, and
  // rings, as if the egg had never been taken out.
  if (asksIfStillIn(plan)) {
    state.cook = stillIn(cook, now_s);
    clock.pullRung = false;
    clock.phase = 'COOKING';
    afterCorrection(now);
    return;
  }

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
 * A cook under the current key that does not read is dropped, and the page
 * opens idle. One too old to pick back up (`cookTooOld`) ends as Start again
 * would end it, and the page opens idle.
 */
export function restoreCook(): void {
  const text = storedCookText();
  const stored = loadCook();
  if (stored === null) {
    if (text !== null) dropStoredCook();
    return;
  }

  const now = nowMs();
  const now_s = now / 1000;
  const back = plannedWithEvents(stored.cook, stored.leanHint_s, now_s, null);
  if (cookTooOld(back.plan, now_s)) {
    // Its egg, if finished and unanswered, is logged on its pot's surface,
    // built first: nothing of the surface survives a reload (review 1.3).
    const id = back.cook.id_ms;
    endCook(back.cook, back.plan, now_s, stored.answers !== 'none', () => forgetEnded(id));
    return;
  }
  state.leanHint_s = stored.leanHint_s;
  resumeAnswers(stored.answers);
  freshWrites(text, stored.cook);
  clock.pullRung = false;
  takeUp(back.cook, back.plan);
  showCookControls();
  // A correction after the pull whose record was not yet made again when
  // the page went: made now.
  refreshAsRan();
  clock.phase = phaseNow(now);
  if (clock.phase !== 'DONE') {
    keepScreenAwake();
    startTicking();
  }
}
