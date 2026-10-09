/**
 * The gestures of a correction mid-cook, as messages: which control a change
 * came from (`groupOf`), a finger down on one and lifted, the page hidden or
 * gone (which commits a change still settling, onescreen review 3), and the
 * start's − and +; and the line under the start's time. What a correction in
 * hand is, and when it is committed, is `update`'s (model.ts, "A correction
 * in hand").
 */

import type { StartLimit } from './model.js';
import { t, timeOfDay } from './copy.js';
import { page } from './dom.js';
import { send } from './send.js';
import { state } from './state.js';
import { pressAndHold } from './stepper.js';

/** The controls, for "another control touched": the slider, a number with
 *  its − and +, a radio group, a menu, a clause. */
const GROUPS = '.slider, .unit, .seg, select, .clause, .check, #primary, #secondary';

/** The control an element belongs to, by its place among them on the page;
 *  null for anything else. */
export function groupOf(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;
  const group = target.closest(GROUPS);
  if (group === null) return null;
  return Array.prototype.indexOf.call(document.querySelectorAll(GROUPS), group) as number;
}

/** The gestures, watched on the whole page, once at boot; and the page
 *  going. */
export function wireEdits(): void {
  document.addEventListener('pointerdown', (event) => {
    if (state.cook === null) return;
    const group = groupOf(event.target);
    if (group === null) return;
    const slider = event.target instanceof Element && event.target.closest('.slider') !== null;
    send({ kind: 'fingerDown', group: group, slider: slider, real_ms: performance.now() });
  }, true);
  const up = (): void => {
    if (state.edit !== null && state.edit.down !== null) send({ kind: 'fingerUp', real_ms: performance.now() });
  };
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
  const going = (): void => {
    if (state.edit?.pending === true) send({ kind: 'commit' });
  };
  window.addEventListener('pagehide', going);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') going();
  });
}

/** The start's − and +, once at boot: whether a press moved it. */
export function wireStartTime(): void {
  const step = (up: boolean): boolean => {
    const from = state.controlsStart_s;
    send({ kind: 'startStep', up: up, group: groupOf(page().startedAt), real_ms: performance.now() });
    return state.controlsStart_s !== from;
  };
  pressAndHold(page().startedAtLess, () => step(false));
  pressAndHold(page().startedAtMore, () => step(true));
}

/** The line under the start's time: why a press went no further, or nothing. */
export function showStartLimit(limit: StartLimit | null): void {
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
