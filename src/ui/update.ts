/**
 * Taking a change up: the idle page solved again and its answer taken up
 * (`recompute`), the settings saved, a new language, another tab's writes,
 * and "Forget everything". Each ends in the page drawn again (render.ts).
 */

import { Solution } from '../core/solve.js';
import { anchorNear } from '../core/policy.js';
import { LevelAnswer } from '../core/reach.js';
import { warningKey } from '../core/wording.js';
import { midSentence } from '../core/copy.js';
import { LanguageState, effectiveLanguage } from '../core/language.js';
import { answerFor, currentInputs, decided } from './answer.js';
import {
  calibrationStoredElsewhere, clearCalibration, eggsBehind, keptState, learn,
} from './calibration.js';
import { applyLanguageToDom, applySettingsToDom, applyUnitsToDom } from './controls.js';
import { activeLocale, applyCopy, loadCopy, t, tRef } from './copy.js';
import { cachedOddsProfile } from './decisionGrids.js';
import { page } from './dom.js';
import { answeredElsewhere, answersNow } from './feedback.js';
import { labelInfoButtons } from './info.js';
import { renderCalibNote, renderLearned } from './learned.js';
import { forgetDrawnWords, render, renderMute, renderVersion } from './render.js';
import { forgetShare, shareState, shareStoredElsewhere } from './share.js';
import { renderShare } from './shareView.js';
import { labelTicks } from './slider.js';
import { isSousVide, learning, state, timeToBoil_s } from './state.js';
import { labelSteppers } from './stepper.js';
import {
  Settings, boilStoredElsewhere, clearBoilMemory, cookStoredElsewhere, saveSettings, settingsStoredElsewhere,
  storedCookAnswered,
} from './store.js';
import { setMuted } from './clock.js';
import { show, useUnits } from './units.js';

/** The writes and solves waiting to coalesce, and the language last asked for. */
const pending = {
  solveHandle: 0,
  saveHandle: 0,
  /** Which language changes went in last, so two quick changes land in order. */
  languageAsked: 0,
};

/* ------------------------------------------------------------------ copy */

/** The warning line, in words: a refusal, or the level's low odds. Which,
 *  and which words say it, are core's (`answerAt`, `warningKey`); the
 *  arguments are this app's. The low odds name the level the slider rests
 *  on, a word standing alone before the colon. */
function warningText(answer: LevelAnswer): string {
  const v = answer.verdict;
  const ref = warningKey(v, answer.lowOdds, state.settings.cooling);
  if (ref === null) return '';
  return tRef(ref, {
    limit: midSentence(t(v.limit.key), activeLocale()), water: show('water', state.settings.waterLitres),
    doneness: t(anchorNear(answer.level).key),
  });
}

/* -------------------------------------------------------------- recompute */

/** Take the answer up: show its warning, and move the slider if the answer
 *  says it must (only out of the stripes). Idle only - once the egg is in the water the controls are
 *  gone and there is nothing to snap, so a call mid-cook takes nothing up:
 *  it neither moves `settings.doneness` nor writes it. */
export function applyAnswer(answer: LevelAnswer): Solution {
  if (state.machine.phase !== 'IDLE') return answer.solution;
  state.idleWarning = warningText(answer);
  const snapTo = answer.verdict.snapTo;
  if (snapTo !== null && snapTo !== state.settings.doneness) {
    state.settings.doneness = snapTo;
    page().doneness.value = String(snapTo);
    saveNow();
  }
  return answer.solution;
}

/** Solve for what is on screen and take the answer up. Idle only: mid-cook
 *  it only redraws, since the controls describe the next cook, not this one
 *  (a second tab may have changed them). Every mid-cook solve goes through
 *  `resolveDuring` instead, which keeps the ticket's pot and the target the
 *  cook was started at. */
export function recompute(): void {
  if (state.machine.phase !== 'IDLE') {
    render(Date.now());
    return;
  }
  // No pan, no solve. The sous-vide answer comes from src/core/sousvide.ts and
  // needs none of this.
  if (isSousVide()) {
    state.idleWarning = '';
    state.chosen = null;
    state.decision = null;
    state.outcome = null;
    state.profile = null;
    render(Date.now());
    return;
  }
  const boil = timeToBoil_s();
  state.profile = cachedOddsProfile(currentInputs(boil), state.calib);
  const answer = answerFor(boil, state.settings.doneness, state.profile);
  applyAnswer(answer);
  state.chosen = decided(answer, boil);
  state.solution = state.chosen?.solution ?? answer.solution;
  state.decision = state.chosen?.decision ?? null;
  state.outcome = state.chosen?.outcome ?? null;
  render(Date.now());
}

/** Coalesce solves: a solve is tens of milliseconds, which is too long to run
 *  on every pixel of a slider drag. */
export function scheduleSolve(): void {
  if (pending.solveHandle !== 0) return;
  pending.solveHandle = window.setTimeout(() => {
    pending.solveHandle = 0;
    recompute();
  }, 90);
}

/* -------------------------------------------------------------- settings */

/** Coalesce writes for the same reason. A drag fires `input` per pixel, and
 *  every one of those was a JSON.stringify and a localStorage write for a
 *  settings object nobody had finished changing. */
export function scheduleSave(): void {
  if (pending.saveHandle !== 0) return;
  pending.saveHandle = window.setTimeout(() => {
    pending.saveHandle = 0;
    writeSettings();
  }, 250);
}

/** Write the settings, with whatever another tab wrote since taken up
 *  first (store.ts), and show what was taken up. */
export function writeSettings(): void {
  const next = saveSettings(state.settings);
  if (next !== state.settings) takeUpSettings(next);
}

/** Settings another tab changed, taken up: the controls, the units, the
 *  sound and the words follow, and an idle page is solved again. A cook
 *  under way is described by its ticket, never by the controls. */
function takeUpSettings(next: Settings): void {
  const settings = state.settings;
  const before = effectiveLanguage(settings.language);
  Object.assign(settings, next);
  useUnits(settings.unitsChosen);
  setMuted(settings.muted);
  applySettingsToDom();
  renderMute();
  const tag = effectiveLanguage(settings.language);
  if (tag !== before || tag !== activeLocale()) {
    const asked = ++pending.languageAsked;
    void loadCopy(tag).then(() => {
      if (asked === pending.languageAsked) relabel();
    });
  }
  if (state.machine.phase === 'IDLE') recompute();
}

/** Write now, for the paths that must not lose the setting: starting a cook,
 *  and the snap that moves the slider out from under the user. */
export function saveNow(): void {
  if (pending.saveHandle !== 0) {
    window.clearTimeout(pending.saveHandle);
    pending.saveHandle = 0;
  }
  writeSettings();
}

/* -------------------------------------------------------------- language */

/**
 * Take up a new language state: store it, and if the catalogue on screen
 * changes, fetch the new one and redraw every word in place. Nothing about the
 * egg changes, and the units are never touched from here: that rule runs one
 * way (LANGUAGE.md section 6). Only reachable while idle, since Settings is.
 */
export function setLanguage(next: LanguageState): void {
  const before = effectiveLanguage(state.settings.language);
  state.settings.language = next;
  saveNow();
  const tag = effectiveLanguage(next);
  if (tag === before && tag === activeLocale()) {
    applyLanguageToDom();
    return;
  }
  const asked = ++pending.languageAsked;
  void loadCopy(tag).then(() => {
    if (asked === pending.languageAsked) relabel();
  });
}

/** Every word on the page again, in the catalogue now active: the marked-up
 *  ones (`applyCopy`), and each one the code drew. */
function relabel(): void {
  applyCopy(document);
  labelInfoButtons();
  labelSteppers();
  labelTicks();
  renderMute();
  renderVersion();
  applyUnitsToDom();
  applyLanguageToDom();
  // Drawn only when what they say changes, so they are told it has.
  forgetDrawnWords();
  renderCalibNote(learning());
  if (state.machine.phase === 'IDLE') recompute();
  else render(Date.now());
}

/* ------------------------------------------------------------ calibration */

/** Take it all back: the posterior and the pan. */
export function forgetAll(): void {
  state.calib = clearCalibration();
  // The next egg is a new cook's, under a new id (share.ts).
  forgetShare();
  state.boilMemory = {};
  clearBoilMemory();
  renderCalibNote(learning());
  recompute();
}

/* ---------------------------------------------------------------- sharing */

/** How many of the log's eggs are final: all of them, unless the last is the
 *  egg on screen, whose answers may still come (share.ts). */
export function finalEggs(): number {
  return keptState().log.length - (answersNow().kind === 'live' ? 1 : 0);
}

/** The Settings section, with how many final eggs are still to go. */
export function drawShare(): void {
  renderShare(Math.max(0, finalEggs() - shareState().sent));
}

/**
 * Another tab wrote the log or the sharing state (the `storage` event): this
 * page takes it up at once rather than writing back what it loaded, which
 * would undo it. Eggs the other tab logged are folded here too, if it has
 * not folded them, and the time on screen moves with what was learned.
 */
export function storedElsewhere(key: string | null): void {
  // The egg on screen answered about in another tab showing the same cook:
  // that tab wrote it down, so this one asks no more about it.
  if (cookStoredElsewhere(key) && state.machine.phase === 'DONE' && storedCookAnswered(state.machine.startedAt_ms)
    && answeredElsewhere()) {
    render(Date.now());
  }
  const nextSettings = settingsStoredElsewhere(key, state.settings);
  if (nextSettings !== null) takeUpSettings(nextSettings);
  // The pans: another tab's measured boil, or its "Forget everything".
  const pans = boilStoredElsewhere(key);
  if (pans !== null) {
    state.boilMemory = pans;
    renderLearned(learning());
    if (state.machine.phase === 'IDLE') recompute();
  }
  const calibration = calibrationStoredElsewhere(key);
  const sharing = shareStoredElsewhere(key);
  if (!calibration && !sharing) return;
  renderCalibNote(learning());
  drawShare();
  if (state.machine.phase === 'IDLE') recompute();
  if (calibration && eggsBehind() > 0) {
    void learn().then(() => {
      renderCalibNote(learning());
      if (state.machine.phase === 'IDLE') recompute();
    });
  }
}
