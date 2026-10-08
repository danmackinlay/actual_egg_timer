/**
 * Corrections mid-cook (DECISIONS.md 96 to 98; design/one-screen.md sections
 * 3 to 5): every control on the one screen stays open after Start, and a
 * change to one is a correction, "it was always like this" - the cook's
 * choices replaced (core `corrected`) and the whole cook planned again from
 * its start.
 *
 * A change is not committed at every step (review 2.4): each would stamp the
 * cook, plan again, write it and the settings, and a drag through an overdue
 * level would ring mid-drag. While the cook's finger is on a control the
 * change is in hand: the controls and the sentence show it, and the egg in
 * cross-section shows the egg it aims for, from a plan of the cook as it
 * would be that stores nothing and rings nothing. It is committed
 *
 * - on release, for the slider, and for a − or + held long enough to repeat;
 * - after a tap's settle (`SETTLE_MS`, about 1.5 s, design section 5) for
 *   anything else - a choice in a clause's panel, a − or + pressed once, a
 *   number typed - the settle starting again with each change;
 * - at once when another control is touched, or the primary button pressed:
 *   the change in hand alone, as it was before the other control's, whether a
 *   finger or the keyboard moves on (onescreen review 3);
 * - and when the page is hidden or goes (`pagehide`, `visibilitychange`), so
 *   a reload or a closed tab inside the settle loses nothing.
 *
 * Overdue is decided only on commit, by the plan of the committed cook
 * (cook.ts, `correctCook`). The aimed-for egg stays for a settle after the
 * last change, then the live egg comes back.
 *
 * A running cook's controls read its own choices (review 2.5): what they show
 * is `state.controls`, drawn from the cook (`settingsOfChoices`), and a
 * correction is the fields the cook changed on them, laid over the cook's own
 * choices, so a field nobody touched keeps the cook's value to the bit and
 * changing a setting back gives back the old plan exactly. The same fields
 * are written to the settings, for the next cook (design section 7, 22).
 */

import {
  CookChoices, RunningCook, corrected, earliestStart_s, latestStart_s, replan, sameChoices, startCorrected,
} from '../core/running.js';
import { targetPeakYolk_C } from '../core/policy.js';
import { surfaceFor } from './answer.js';
import { calibrationParams } from './calibration.js';
import { correctCook } from './cook.js';
import { t, timeOfDay } from './copy.js';
import { cookShown } from './feedback.js';
import { page } from './dom.js';
import { nowMs } from './now.js';
import { aimedEgg, holdAim } from './render.js';
import { choicesOf, state } from './state.js';
import { Settings } from './store.js';
import { REGION } from './units.js';
import { saveNow } from './update.js';
import { pressAndHold } from './stepper.js';

/** How long a tap's change settles before it is committed, and how long the
 *  aimed-for egg stays after the last change, ms (design section 5). */
export const SETTLE_MS = 1500;
/** A − or + pressed this long has begun to repeat (stepper.ts): a hold, so
 *  it commits on release. */
const HELD_MS = 400;
/** How long a burst of changes waits before the aimed-for egg is planned,
 *  ms: a plan is tens of milliseconds, too long for every pixel of a drag. */
const PREVIEW_MS = 90;

/** The settings a cook's choices are made of, and the choice each makes. */
const FIELDS: { settings: (keyof Settings)[]; choices: (keyof CookChoices)[] }[] = [
  { settings: ['sizeIndex', 'customMinor_mm', 'measuredBy'], choices: ['mass_kg', 'massFrom', 'sizeTable'] },
  { settings: ['startTempMode'], choices: ['eggFrom'] },
  { settings: ['customStart_C'], choices: ['customStart_C'] },
  { settings: ['probe', 'room_C'], choices: ['room_C'] },
  { settings: ['startMode'], choices: ['startMode'] },
  { settings: ['afterBoil'], choices: ['afterBoil'] },
  { settings: ['cooling'], choices: ['cooling'] },
  { settings: ['waterLitres'], choices: ['waterLitres'] },
  { settings: ['eggCount'], choices: ['eggCount'] },
  { settings: ['altitude_m'], choices: ['altitude_m'] },
  { settings: ['doneness'], choices: ['level'] },
];

/** The controls and the start as the change in hand left them: what is
 *  committed, without it, when another control's change comes. */
interface InHand {
  controls: Settings;
  start: number | null;
}

/** The correction in hand, and the gesture making it. */
const edit = {
  /** The controls as last drawn from the cook, or committed: a field that
   *  differs from this is one the cook changed. Null while idle. */
  base: null as Settings | null,
  /** Whether the controls hold a change not yet committed. */
  pending: false,
  /** The control the change in hand came from, so touching another commits
   *  it. */
  group: null as Element | null,
  /** The controls as the change in hand left them, before another's. */
  inHand: null as InHand | null,
  /** A finger down on a control: when (real ms), on which, and whether it
   *  is the slider. */
  down: null as { at: number; group: Element; slider: boolean } | null,
  /** When the last change came, real ms. */
  changed: 0,
  /** The slider moved after the pull, previewed and not corrected: it goes
   *  back to the cook's level when the aimed-for egg goes. */
  previewedLevel: false,
  settle: 0,
  preview: 0,
  release: 0,
};

/** The cook's controls are drawn from it afresh (a start, a reload, a
 *  correction committed): nothing is in hand. */
export function startEdits(): void {
  clearTimers();
  edit.previewedLevel = false;
  edit.base = { ...state.controls };
  state.controlsStart_s = state.cook === null ? null : state.cook.startedAt_s;
  showStartLimit(null);
  edit.pending = false;
  edit.group = null;
  edit.inHand = null;
  dropAim();
}

/** The cook has ended: whatever was in hand goes with it. */
export function endEdits(): void {
  clearTimers();
  edit.previewedLevel = false;
  edit.base = null;
  state.controlsStart_s = null;
  showStartLimit(null);
  edit.pending = false;
  edit.group = null;
  edit.inHand = null;
  edit.down = null;
  dropAim();
}

function clearTimers(): void {
  for (const handle of [edit.settle, edit.preview, edit.release]) if (handle !== 0) window.clearTimeout(handle);
  edit.settle = 0;
  edit.preview = 0;
  edit.release = 0;
}

/** The control an element belongs to, for "another control touched": the
 *  slider, a number with its − and +, a radio group, a menu, a clause; null
 *  for anything else. */
function groupOf(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  return target.closest('.slider, .unit, .seg, select, .clause, .check, #primary, #secondary');
}

/** A control's value changed while a cook runs (input.ts, after the controls
 *  have taken it in): the change is in hand until it is committed. */
export function cookControlsChanged(source: EventTarget | null): void {
  if (state.cook === null || edit.base === null) return;
  const group = groupOf(source);
  // Another control's change, with no finger down to have committed the one
  // in hand first (the keyboard): that one is committed as it was, without
  // this, which then settles in its turn.
  if (edit.pending && edit.group !== null && group !== null && group !== edit.group) commitEdit(edit.inHand);
  edit.pending = true;
  edit.group = group;
  edit.inHand = { controls: { ...state.controls }, start: state.controlsStart_s };
  edit.changed = performance.now();
  if (edit.release !== 0) {
    window.clearTimeout(edit.release);
    edit.release = 0;
  }
  // At once, the slider's own reading; the plan's follows.
  const level = state.controls.doneness;
  state.aim = { level: level, peakYolk_C: targetPeakYolk_C(level), solution: null };
  if (edit.preview === 0) edit.preview = window.setTimeout(previewNow, PREVIEW_MS);
  if (edit.down === null) settleThenCommit();
}

function settleThenCommit(): void {
  if (edit.settle !== 0) window.clearTimeout(edit.settle);
  edit.settle = window.setTimeout(() => {
    edit.settle = 0;
    commitEdit();
  }, SETTLE_MS);
}

/** The choices `controls` say (the controls on screen, unless given), laid
 *  over the cook's own: each field the cook changed (against `base`), and the
 *  cook's for the rest. */
function choicesInHand(
  cook: RunningCook, base: Settings, controls: Settings = state.controls,
): { choices: CookChoices; touched: (keyof Settings)[] } {
  const now = choicesOf(controls, REGION);
  const next: CookChoices = { ...cook.choices };
  const into = next as unknown as Record<string, unknown>;
  const touched: (keyof Settings)[] = [];
  for (const f of FIELDS) {
    if (f.settings.every((k) => controls[k] === base[k])) continue;
    touched.push(...f.settings);
    for (const c of f.choices) into[c] = now[c];
  }
  return { choices: next, touched: touched };
}

/** The cook as the change in hand would make it, for its preview: a
 *  correction; but after the pull a new level only previews (DECISIONS.md
 *  98), the egg that level aims for in this pot, so it is planned as if not
 *  yet pulled. */
function cookInHand(cook: RunningCook, choices: CookChoices, now_s: number): RunningCook {
  const start = state.controlsStart_s;
  if (start !== null && start !== cook.startedAt_s) cook = startCorrected(cook, start, now_s) ?? cook;
  if (cook.events.pulled !== null && choices.level !== cook.choices.level) {
    return {
      ...cook, choices: choices, correctedAt_s: null,
      events: { ...cook.events, pulled: null, cooledAt_s: null, rangAt_s: null },
    };
  }
  return corrected(cook, choices, now_s);
}

/** The egg the change in hand aims for, and the slider's reading for it:
 *  planned, held on the drawing, stored nowhere. */
function previewNow(): void {
  edit.preview = 0;
  const cook = state.cook;
  const base = edit.base;
  if (cook === null || base === null || !(edit.pending || edit.down !== null)) return;
  const now_s = nowMs() / 1000;
  const hand = cookInHand(cook, choicesInHand(cook, base).choices, now_s);
  const plan = replan(hand, state.calib, surfaceFor(state.plan?.inputs ?? null), state.leanHint_s, now_s);
  const pulled = hand.events.pulled;
  const params = pulled !== null && state.plan !== null
    ? cookShown(cook, state.plan)?.params ?? calibrationParams(state.calib)
    : calibrationParams(state.calib);
  const time_s = pulled === null ? plan.cookTime_s : pulled.out_s - hand.startedAt_s;
  state.aim = { level: plan.level, peakYolk_C: plan.solution.result.peakYolk_C, solution: plan.solution };
  holdAim(aimedEgg(plan.egg, plan.setup, params, time_s, plan.level));
}

/**
 * Commit the change in hand: the cook corrected (`correctCook`), and the
 * fields it changed written to the settings for the next cook. After the
 * pull the level is not corrected (DECISIONS.md 98): the slider only
 * previewed, and goes back to the level the egg was pulled at; nothing is
 * written for it. The aimed-for egg stays until a settle after the last
 * change. `upTo`, the controls as the change in hand left them, commits that
 * change alone when another control's has already come (the keyboard), so
 * two changes are two commits however they are made.
 */
export function commitEdit(upTo: InHand | null = null): void {
  if (edit.settle !== 0) {
    window.clearTimeout(edit.settle);
    edit.settle = 0;
  }
  const cook = state.cook;
  const base = edit.base;
  if (!edit.pending || cook === null || base === null) return;
  edit.pending = false;
  edit.group = null;
  edit.inHand = null;
  const controls = upTo === null ? state.controls : upTo.controls;
  const startInHand = upTo === null ? state.controlsStart_s : upTo.start;
  let { choices, touched } = choicesInHand(cook, base, controls);
  edit.base = { ...controls };
  if (cook.events.pulled !== null && choices.level !== cook.choices.level) {
    choices = { ...choices, level: cook.choices.level };
    touched = touched.filter((k) => k !== 'doneness');
    edit.base.doneness = base.doneness;
    edit.previewedLevel = true;
  }
  const start = startInHand !== null && startInHand !== cook.startedAt_s ? startInHand : null;
  if (start !== null || !sameChoices(choices, cook.choices)) correctCook(choices, start);
  // The start as the cook now has it: a correction refused leaves the cook's.
  // Unless the change come since is the start's own.
  if (upTo === null || state.controlsStart_s === upTo.start) {
    state.controlsStart_s = state.cook === null ? null : state.cook.startedAt_s;
  }
  if (touched.length > 0) {
    const settings = state.settings as unknown as Record<string, unknown>;
    for (const k of touched) settings[k] = controls[k];
    saveNow();
  }
  letAimGo();
}

/** The aimed-for egg goes a settle after the last change, unless a finger
 *  is down or another change is in hand by then. */
function letAimGo(): void {
  if (edit.release !== 0) window.clearTimeout(edit.release);
  const left = Math.max(0, edit.changed + SETTLE_MS - performance.now());
  edit.release = window.setTimeout(() => {
    edit.release = 0;
    if (edit.pending || edit.down !== null) return;
    dropAim();
  }, left);
}

/** The aimed-for egg goes, and a level the slider only previewed after the
 *  pull goes back to the cook's. */
function dropAim(): void {
  if (edit.previewedLevel && edit.base !== null && !edit.pending) {
    edit.previewedLevel = false;
    state.controls.doneness = edit.base.doneness;
    page().doneness.value = String(edit.base.doneness);
  }
  if (state.aim === null) return;
  state.aim = null;
  holdAim(null);
}

/** Where a finger comes down: another control than the one with a change in
 *  hand commits it; on a control, the gesture begins. */
function onPointerDown(event: PointerEvent): void {
  if (state.cook === null || edit.base === null) return;
  const group = groupOf(event.target);
  if (group === null) return;
  if (edit.pending && group !== edit.group) commitEdit();
  const slider = event.target instanceof Element && event.target.closest('.slider') !== null;
  edit.down = { at: performance.now(), group: group, slider: slider };
}

/** The finger lifts: a drag of the slider, or a − or + held, commits now;
 *  a tap settles first. */
function onPointerUp(): void {
  const down = edit.down;
  edit.down = null;
  if (down === null || !edit.pending) return;
  if (down.slider || performance.now() - down.at >= HELD_MS) commitEdit();
  else settleThenCommit();
}

/** The gestures, watched on the whole page, once at boot; and the page
 *  going, which commits a change still settling (onescreen review 3). */
export function wireEdits(): void {
  document.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);
  window.addEventListener('pagehide', () => commitEdit());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') commitEdit();
  });
}

/* ------------------------------------------------------------- the start */

/** Where the start's − and + stopped, for the line under them. */
type StartLimit = 'now' | 'boil' | 'pull' | 'earliest';

/** Which of the cook's limits `latest` is: the boil pressed, the pull, or
 *  now (`latestStart_s`). */
function latestLimit(cook: RunningCook, latest: number): StartLimit {
  const e = cook.events;
  if (e.boilAt_s !== null && e.boilAt_s === latest) return 'boil';
  if ((e.pulled !== null && e.pulled.due_s === latest) || (e.cooledAt_s !== null && e.cooledAt_s === latest)) return 'pull';
  return 'now';
}

/** The line under the start's time: why a press went no further, or nothing. */
function showStartLimit(limit: { kind: StartLimit; at_s: number } | null): void {
  const line = page().startedAtLimit;
  line.hidden = limit === null;
  if (limit === null) {
    line.textContent = '';
    return;
  }
  const time = timeOfDay(limit.at_s * 1000);
  const key = limit.kind === 'earliest' ? 'controls.startedAt.earliest'
    : limit.kind === 'boil' ? 'controls.startedAt.latestBoil'
      : limit.kind === 'pull' ? 'controls.startedAt.latestPull' : 'controls.startedAt.latestNow';
  line.textContent = t(key, { time: time });
}

/** The start a minute earlier or later, as far as the cook allows (core
 *  `earliestStart_s`, `latestStart_s`): a correction in hand like any other,
 *  and committed the same way. Whether it moved. */
function stepStart(up: boolean): boolean {
  const cook = state.cook;
  const from = state.controlsStart_s;
  if (cook === null || edit.base === null || from === null) return false;
  const now_s = nowMs() / 1000;
  const earliest = earliestStart_s(cook);
  const latest = latestStart_s(cook, now_s);
  let next = from + (up ? 60 : -60);
  let limit: { kind: StartLimit; at_s: number } | null = null;
  if (next >= latest) {
    next = latest;
    limit = { kind: latestLimit(cook, latest), at_s: latest };
  }
  if (next <= earliest) {
    next = earliest;
    limit = { kind: 'earliest', at_s: earliest };
  }
  showStartLimit(limit);
  if (next === from) return false;
  state.controlsStart_s = next;
  page().startedAt.textContent = timeOfDay(next * 1000);
  cookControlsChanged(page().startedAt);
  return true;
}

/** The start's − and +, once at boot. */
export function wireStartTime(): void {
  pressAndHold(page().startedAtLess, () => stepStart(false));
  pressAndHold(page().startedAtMore, () => stepStart(true));
}
