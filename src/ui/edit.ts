/**
 * The gestures of a correction mid-cook, as messages: which control a change
 * came from (`groupOf`), a finger down on one and lifted, the page hidden or
 * gone (which commits a change still settling), and the
 * start's − and +; and the line under the start's time. What a correction in
 * hand is, and when it is committed, is `update`'s (model.ts, "A correction
 * in hand").
 */

import { page } from './dom.js';
import { send } from './send.js';
import { pageModel } from './cook.js';
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
    const group = groupOf(event.target);
    if (group === null) return;
    const slider = event.target instanceof Element && event.target.closest('.slider') !== null;
    send({ kind: 'fingerDown', group: group, slider: slider, real_ms: performance.now() });
  }, true);
  const up = (): void => send({ kind: 'fingerUp', real_ms: performance.now() });
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
  const going = (): void => send({ kind: 'commit' });
  window.addEventListener('pagehide', going);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') going();
  });
}

/** The start's − and +, once at boot: whether a press moved it. */
export function wireStartTime(): void {
  const step = (up: boolean): boolean => {
    const from = pageModel().controlsStart_s;
    send({ kind: 'startStep', up: up, group: groupOf(page().startedAt), real_ms: performance.now() });
    return pageModel().controlsStart_s !== from;
  };
  pressAndHold(page().startedAtLess, () => step(false));
  pressAndHold(page().startedAtMore, () => step(true));
}
