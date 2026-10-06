/**
 * The cook itself: the primary button through every phase (`onPrimary`),
 * the ticker and its alarms (`onTick`), Cancel and "Start again" (`reset`),
 * the machine written down with every step (`setMachine`), and a cook picked
 * back up after a reload (`restoreCook`).
 */

import { logYolkTarget } from '../core/solve.js';
import {
  SLOW_HOB_EVERY_S, SLOW_HOB_EXTRA_S, SLOW_HOB_WHEN_LEFT_S, coolingSecondsFor, probeMomentFor,
} from '../core/policy.js';
import { forecastOf } from '../core/record.js';
import { answerFor, currentInputs, decided, drawNudge, retime } from './answer.js';
import { learn, logEgg } from './calibration.js';
import { keepUnreadCook } from './calibrationStore.js';
import {
  Ticker, blip, keepScreenAwake, primeAudio, releaseScreen, ringAlarm, startTicker, stopAlarm,
} from './clock.js';
import { activeLocale } from './copy.js';
import { cachedOddsProfile } from './decisionGrids.js';
import { eggRecordFor } from './eggRecord.js';
import { answersNow, forgetAnswers, keptAnswers, resumeAnswers } from './feedback.js';
import {
  Machine, advance, beginCooling, idleMachine, recordBoil, restoreMachine, staleMachine,
  reviseProvisional, secondsHeating, secondsToPull, startCold, startHot,
} from './machine.js';
import { render } from './render.js';
import { sendFinal } from './share.js';
import { buildSetup, currentEgg, massFrom, sizeTable, state, timeToBoil_s } from './state.js';
import {
  clearCook, hasBoilMemory, loadCook, rememberTimeToBoil, saveCook, storedCookText,
} from './store.js';
import { restoreTicket } from './ticket.js';
import { unitSystem } from './units.js';
import { applyAnswer, drawShare, recompute } from './update.js';

/** The ticker, while a cook runs, and when the slow hob was last allowed for. */
const clock = {
  ticker: null as Ticker | null,
  lastRevise_ms: 0,
};

/** Assign the machine and write the cook down in one step, so there is no path
 *  that advances a cook without persisting it. */
function setMachine(next: Machine): void {
  state.machine = next;
  persistCook();
}

export function persistCook(): void {
  if (state.machine.phase === 'IDLE') {
    clearCook();
    return;
  }
  saveCook(state.machine, state.ticket, keptAnswers());
}

function onTick(): void {
  const now = Date.now();

  if (state.machine.phase === 'HEATING' && state.ticket !== null && secondsToPull(state.machine, now) < SLOW_HOB_WHEN_LEFT_S
      && now - clock.lastRevise_ms > SLOW_HOB_EVERY_S * 1000) {
    // The hob is slower than we assumed. Push the estimate out rather than
    // count down to an alarm for an egg that has not begun cooking.
    clock.lastRevise_ms = now;
    const assumed = secondsHeating(state.machine, now) + SLOW_HOB_EXTRA_S;
    const sol = retime(state.ticket, assumed);
    setMachine(reviseProvisional(state.machine, sol.result.cookTime_s, assumed, coolingSecondsFor(sol.result)));
  }

  const step = advance(state.machine, now);
  if (step.machine !== state.machine) {
    setMachine(step.machine);
    if (step.event === 'pull') ringAlarm(true);
    if (step.event === 'done') finishCook();
  }
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

/** Cancel, and "Start again" at DONE. */
export function reset(): void {
  stopAlarm();
  stopTicking();
  releaseScreen();
  // An egg finished and never answered about is still an egg: the cook, the
  // recommendation and the pull are data for the fit. It folds nothing.
  if (state.machine.phase === 'DONE' && answersNow().kind === 'none' && state.ticket !== null) {
    logEgg(eggRecordFor(state.ticket, state.machine, null));
    void learn();
  }
  forgetAnswers();
  state.ticket = null;
  state.machine = idleMachine(state.settings.cooling);
  clearCook();
  // A new cook, a new nudge.
  drawNudge();
  recompute();
  // The egg just finished is final now: no answer can be added to it.
  drawShare();
  void sendFinal();
}

export function onPrimary(): void {
  const now = Date.now();
  stopAlarm();
  const settings = state.settings;

  if (state.machine.phase === 'IDLE') {
    // The audio context must be created inside a user gesture or the alarm is
    // silently blocked later, when it matters.
    primeAudio();
    keepScreenAwake();
    const boil = timeToBoil_s();
    // Take the answer up one last time while the controls are still live: the
    // level this returns is the one the cook is run at, and it does not move
    // again until the cook is over.
    state.profile = cachedOddsProfile(currentInputs(boil), state.calib);
    const answer = answerFor(boil, settings.doneness, state.profile);
    applyAnswer(answer);
    // The time on screen is the one started: the chosen one if this pot's
    // surface is in, and the mean solve's if the cook was quicker than it.
    const chosen = decided(answer, boil);
    state.chosen = chosen;
    const solution = chosen?.solution ?? answer.solution;
    state.solution = solution;
    const decision = chosen?.decision ?? null;
    state.decision = decision;
    const outcome = chosen?.outcome ?? null;
    state.outcome = outcome;
    const target = settings.doneness;
    const cook = solution.result.cookTime_s;
    // A cook started here is this tab's own, whatever happened before it.
    forgetAnswers();
    state.ticket = {
      egg: currentEgg(),
      massFrom: massFrom(),
      sizeTable: massFrom() === 'class' ? sizeTable : null,
      boilRemembered: hasBoilMemory(state.boilMemory),
      eggFrom: settings.startTempMode,
      setup: buildSetup(boil),
      logNominalTarget: logYolkTarget(target),
      units: unitSystem(),
      lang: activeLocale(),
      lean_s: decision === null ? 0 : decision.cookTime_s - decision.meanCookTime_s,
      nudge_s: chosen?.nudge_s ?? 0,
      outcome: decision === null ? null : outcome,
      // What the app says now, as the record keeps it (DECISIONS.md 37).
      forecast: decision === null || outcome === null ? null : forecastOf(outcome, cook),
      peakYolk_C: solution.result.peakYolk_C,
      probeMoment: probeMomentFor(solution.result, settings.cooling),
    };
    // The cooling counts to the yolk's peak for this cook.
    const cool = coolingSecondsFor(solution.result);
    setMachine(settings.startMode === 'cold'
      ? startCold(now, cook, boil, settings.cooling, target, cool)
      : startHot(now, cook, settings.cooling, target, cool));
    clock.lastRevise_ms = now;
    startTicking();
    blip();
    render(now);
    return;
  }

  if (state.machine.phase === 'HEATING' && state.ticket !== null) {
    const measured = secondsHeating(state.machine, now);
    state.boilMemory = rememberTimeToBoil(state.boilMemory, state.ticket.setup.waterLitres, measured);
    const sol = retime(state.ticket, measured);
    setMachine(recordBoil(state.machine, now, sol.result.cookTime_s, coolingSecondsFor(sol.result)));
    blip();
    onTick();
    return;
  }

  if (state.machine.phase === 'PULL') {
    const next = beginCooling(state.machine, now);
    setMachine(next);
    if (next.phase === 'DONE') finishCook();
    render(now);
    return;
  }

  if (state.machine.phase === 'DONE') reset();
}

/**
 * Pick a cook back up after a reload.
 *
 * The deadlines are absolute, so the countdown resumes at the right number
 * rather than restarting - which is the whole reason the machine was built this
 * way. What does NOT come back is the alarm: it lives in this tab's audio
 * context and died with the old page, so a restored cook says so rather than
 * letting someone walk away trusting a noise that will not happen.
 */
export function restoreCook(): void {
  const text = storedCookText();
  const stored = loadCook();
  if (stored === null) {
    // Another build's cook, most likely: kept aside, as stored, and exported
    // with the results (DECISIONS.md 81). Its egg may be one nothing else holds.
    if (text !== null) keepUnreadCook(text);
    clearCook();
    return;
  }

  // A running cook is described by its ticket alone, so one that cannot be
  // read is dropped rather than shown against the controls - and kept aside.
  const now = Date.now();
  const backTicket = restoreTicket(stored.ticket);
  const back = restoreMachine(stored.machine, now);
  if (back === null || backTicket === null) {
    const stale = staleMachine(stored.machine, now);
    if (backTicket === null || stale === null) {
      if (text !== null) keepUnreadCook(text);
    } else if (stale.phase === 'DONE' && stored.answers === 'none') {
      // Too old to pick back up, but finished and never answered about: still
      // an egg, logged as "Start again" would have logged it.
      logEgg(eggRecordFor(backTicket, stale, null));
      void learn();
    }
    clearCook();
    return;
  }
  state.machine = back;
  state.ticket = backTicket;
  resumeAnswers(stored.answers);

  const step = advance(state.machine, now);
  state.machine = step.machine;
  persistCook();

  if (state.machine.phase !== 'DONE') {
    keepScreenAwake();
    startTicking();
  }
}
