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
export const FIELD_GROUPS: Readonly<Record<string, HandGroup | (() => HandGroup)>> = {
  size: 'mass', measureMass: 'mass', measureGirth: 'mass', measureMinor: 'mass', startTemp: 'eggFrom',
  customTemp: 'customStart', roomTempFrom: 'room', roomTempStart: 'room', roomTempCool: 'room', startMode: 'startMode',
  afterBoil: 'afterBoil', cooling: 'cooling', bowlLitres: 'bowlLitres', litres: 'waterLitres', eggCount: 'eggCount',
  altitude: 'altitude',
  doneness: 'level', startedAt: 'startedAt',
  coolingWater: () => (radioValue('cooling', 'ice') === 'tap' ? 'tapWater' : 'bowlWater'),
};

/** The fields that make no choice of the cook's, by id or a radio's name,
 *  and the control each is: the thermometer's reading, and the settings of
 *  the kitchen and the screen (the thermometer, the units, the language, the
 *  sound, sharing). A field in neither table throws: unmapped, a change to it
 *  mid-cook would be taken for a setting and the correction dropped. */
export const GROUPLESS: Readonly<Record<string, HandControl>> = {
  probeReading: 'probe', probeSetting: 'setting', units: 'setting', language: 'setting', alarm: 'setting',
  shareSetting: 'setting',
};

/** The buttons that move the cook on, and the thermometer's Save, by id. */
export const BUTTONS: Readonly<Record<string, HandControl>> = {
  primary: 'primary', secondary: 'cancel', stillOut: 'stillInWater', probeSave: 'probe',
};

/** A field's key in the tables: a radio's name, or its id. */
function keyOf(field: HTMLElement): string {
  return field instanceof HTMLInputElement && field.type === 'radio' ? field.name : field.id;
}

/** The group of the cook's choices a change to `field` makes; null for a
 *  field of none (`GROUPLESS`). */
export function groupOf(field: EventTarget | null): HandGroup | null {
  if (!(field instanceof HTMLElement)) return null;
  const key = keyOf(field);
  const group = FIELD_GROUPS[key];
  if (group !== undefined) return typeof group === 'function' ? group() : group;
  if (GROUPLESS[key] !== undefined) return null;
  throw new Error(`#${key} is in no group and not listed as groupless (src/ui/edit.ts)`);
}

/** The page's controls, for a finger down: the slider, a number with its −
 *  and +, a radio group, a menu, a clause, a switch, and the buttons. */
const CONTROLS = ['.slider', '.unit', '.seg', 'select', '.clause', '.check', ...Object.keys(BUTTONS).map((id) => `#${id}`)]
  .join(', ');

/** What a finger down on `target` touched: a control of a group, another
 *  control (core `HandControl`), or none. */
export function touchOf(target: EventTarget | null): { group: HandGroup } | { control: HandControl } | null {
  if (!(target instanceof Element)) return null;
  const at = target.closest(CONTROLS);
  if (at === null) return null;
  const button = BUTTONS[at.id];
  if (button !== undefined) return { control: button };
  if (at.classList.contains('clause')) return { control: 'clause' };
  const field = at.matches('input, select') ? at : at.querySelector('input, select, output');
  if (!(field instanceof HTMLElement)) throw new Error(`a control with no field: .${at.className}`);
  const group = groupOf(field);
  return group !== null ? { group: group } : { control: GROUPLESS[keyOf(field)] };
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
