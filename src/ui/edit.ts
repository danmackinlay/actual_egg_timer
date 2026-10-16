/**
 * The page's gestures as the correction in hand's events (core hand.ts):
 * the group of the cook's choices a field's change makes (`groupOf`), the
 * control a finger comes down on (`touchOf`), the finger lifted, the page
 * hidden or gone; and the start's − and +. When a change is committed, and
 * what counts as another control or as leaving, is core's.
 */

import type { HandControl, HandGroup } from '../core/hand.ts';
import { page, radioValue } from './dom.ts';
import { send } from './send.ts';
import { pageModel } from './cook.ts';
import { pressAndHold } from './stepper.ts';

/** The group each field's change makes, by its id, or a radio's by its
 *  name. The cooling water's is the cooling's: running water or the bowl. */
const FIELD_GROUPS: Record<string, HandGroup> = {
  size: 'mass', measureMass: 'mass', measureGirth: 'mass', measureMinor: 'mass', startTemp: 'eggFrom',
  customTemp: 'customStart', roomTemp: 'room', roomTempFrom: 'room', startMode: 'startMode', afterBoil: 'afterBoil',
  cooling: 'cooling', bowlLitres: 'bowlLitres', litres: 'waterLitres', eggCount: 'eggCount', altitude: 'altitude',
  doneness: 'level', startedAt: 'startedAt',
};

/** The group of the cook's choices a change to `field` makes; null for a
 *  field of none (the thermometer, the units, the language, the sound). */
export function groupOf(field: EventTarget | null): HandGroup | null {
  if (!(field instanceof HTMLElement)) return null;
  if (field.id === 'coolingWater') return radioValue('cooling', 'ice') === 'tap' ? 'tapWater' : 'bowlWater';
  const key = field instanceof HTMLInputElement && field.type === 'radio' ? field.name : field.id;
  return FIELD_GROUPS[key] ?? null;
}

/** The page's controls, for a finger down: the slider, a number with its −
 *  and +, a radio group, a menu, a clause, a switch, and the buttons. */
const CONTROLS = '.slider, .unit, .seg, select, .clause, .check, #primary, #secondary, #stillOut';

/** What a finger down on `target` touched: a control of a group, another
 *  control (core `HandControl`), or none. */
export function touchOf(target: EventTarget | null): { group: HandGroup } | { control: HandControl } | null {
  if (!(target instanceof Element)) return null;
  const at = target.closest(CONTROLS);
  if (at === null) return null;
  if (at.id === 'primary') return { control: 'primary' };
  if (at.id === 'secondary') return { control: 'cancel' };
  if (at.id === 'stillOut') return { control: 'stillInWater' };
  if (at.classList.contains('clause')) return { control: 'clause' };
  const field = at.matches('input, select') ? at : at.querySelector('input, select, output');
  const group = groupOf(field);
  if (group !== null) return { group: group };
  return { control: field !== null && field.id === 'probeReading' ? 'probe' : 'setting' };
}

/** The gestures' clock, s: the page's, which no clock change moves. */
export function gestureNow_s(): number {
  return performance.now() / 1000;
}

/** The gestures, watched on the whole page, once at boot; and the page
 *  going: `pagehide`, or hidden. */
export function wireEdits(): void {
  document.addEventListener('pointerdown', (event) => {
    const touch = touchOf(event.target);
    if (touch === null) return;
    const at_s = gestureNow_s();
    send({
      kind: 'hand',
      event: 'group' in touch ? { kind: 'down', at_s: at_s, group: touch.group } : { kind: 'moveOn', at_s: at_s, control: touch.control },
    });
  }, true);
  const up = (): void => send({ kind: 'hand', event: { kind: 'up', at_s: gestureNow_s() } });
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
  const going = (): void => send({ kind: 'hand', event: { kind: 'leave', at_s: gestureNow_s() } });
  window.addEventListener('pagehide', going);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') going();
  });
}

/** The start's − and +, once at boot: whether a press moved it. */
export function wireStartTime(): void {
  const step = (up: boolean): boolean => {
    const from = pageModel().controlsStart_s;
    send({ kind: 'startStep', up: up, at_s: gestureNow_s() });
    return pageModel().controlsStart_s !== from;
  };
  pressAndHold(page().startedAtLess, () => step(false));
  pressAndHold(page().startedAtMore, () => step(true));
}
