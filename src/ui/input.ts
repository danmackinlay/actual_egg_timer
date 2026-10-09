/**
 * What the cook does to the controls and the Settings form, read as
 * messages (model.ts): every input and change (`onInput`), what the controls
 * now say; the units, the language, the alarm's sound,
 * and the mute. What follows - the settings written, the page solved again,
 * a correction in hand - is `update`'s.
 */

import { eggFromMass } from '../core/geometry.js';
import { Cooling } from '../core/protocol.js';
import { Quantity, parse } from '../core/units.js';
import { ALARM_SOUNDS, readAlarmSound } from '../core/sounds.js';
import { DEFAULTS } from '../core/inputs.js';
import { LANGUAGES } from '../core/language.js';
import { page, radioValue } from './dom.js';
import { groupOf } from './edit.js';
import { send } from './send.js';
import { LIMITS, Settings, UiStartMode, clampNumber } from './store.js';
import { measure } from './units.js';

/** The three ways a person can measure an egg are one number in three units.
 *  The model egg's equator is a circle, so girth = pi * B exactly; mass goes
 *  through the same ovoid volume the solver uses (V = k_v * ratio * B^3), so
 *  nothing here is a second opinion about the geometry. */
function minorFromGirth_mm(girth_mm: number): number {
  return girth_mm / Math.PI;
}

function minorFromMass_mm(mass_g: number): number {
  return eggFromMass(mass_g / 1000).minorDiameter_m * 1000;
}

/** What a field says, in SI and clamped, or null while it holds no number.
 *  Only ever called for the field the cook is editing: re-reading a field
 *  nobody touched would re-parse a rounded display back over the stored
 *  value, and that is the drift the round trip exists to prevent. */
function readField(input: HTMLInputElement, q: Quantity): number | null {
  if (input.value.trim() === '') return null;
  return parse(measure(q), Number(input.value));
}

/** Sound is a setting, not a phase: the toggle works mid-cook, and muting
 *  while the alarm is going stops it. */
export function onToggleMute(): void {
  send({ kind: 'mute' });
}

/** What the controls now say, read back as far as they say it: the choices,
 *  and, of the fields with a unit, only `source`, the one being edited (see
 *  `readField`). A field that holds no number says nothing, and the
 *  controls keep what they had (`update`). */
function readInputs(source: EventTarget | null): Partial<Settings> {
  const read: Partial<Settings> = {};
  const sizeIndex = Number(page().size.value);
  read.sizeIndex = Number.isFinite(sizeIndex) ? sizeIndex : DEFAULTS.sizeIndex;

  // Measuring the egg any of the three ways overrides the size class, because
  // a measured egg is better information than a box label. A box cleared, or
  // holding something that is not a number, measures nothing: the egg stays.
  let measured_mm: number | null = null;
  if (source === page().measureMass) {
    const mass_g = readField(page().measureMass, 'mass');
    measured_mm = mass_g === null ? null : minorFromMass_mm(mass_g);
  } else if (source === page().measureGirth) {
    const girth_mm = readField(page().measureGirth, 'girth');
    measured_mm = girth_mm === null ? null : minorFromGirth_mm(girth_mm);
  } else if (source === page().measureMinor) {
    measured_mm = readField(page().measureMinor, 'width');
  }
  if (measured_mm !== null && measured_mm > 0) {
    read.measuredBy = source === page().measureMass ? 'scale'
      : source === page().measureGirth ? 'girth' : 'width';
    read.customMinor_mm = clampNumber(measured_mm, LIMITS.minor_mm, measured_mm);
    read.sizeIndex = -1;
  }
  read.startTempMode = radioValue('startTemp', 'fridge') as Settings['startTempMode'];
  // The fields with a unit are read only when they are the one being
  // edited, like the measurements above: see `readField`.
  const field = (input: HTMLInputElement, q: Quantity): number | null => (source === input ? readField(input, q) : null);
  const egg_C = field(page().customTemp, 'eggTemp');
  if (egg_C !== null) read.customStart_C = egg_C;
  const altitude_m = field(page().altitude, 'altitude');
  if (altitude_m !== null) read.altitude_m = altitude_m;
  read.startMode = radioValue('startMode', 'cold') as UiStartMode;
  read.afterBoil = radioValue('afterBoil', 'hold') as Settings['afterBoil'];
  read.cooling = radioValue('cooling', 'ice') as Cooling;
  const litres = field(page().litres, 'water');
  if (litres !== null) read.waterLitres = litres;
  const eggCount = clampNumber(page().eggCount.value, LIMITS.eggCount, NaN);
  if (!Number.isNaN(eggCount)) read.eggCount = Math.round(eggCount);
  const doneness = clampNumber(page().doneness.value, LIMITS.doneness, NaN);
  if (!Number.isNaN(doneness)) read.doneness = doneness;
  read.probe = page().probeSetting.checked;
  // The room, measured: an emptied field is "not measured", and the room is
  // assumed again. Read only when it is the one being edited (`readField`).
  if (source === page().roomTemp) {
    if (page().roomTemp.value.trim() === '') read.room_C = null;
    else {
      const room = readField(page().roomTemp, 'roomTemp');
      if (room !== null) read.room_C = room;
    }
  }
  return read;
}

/** Every input and change on the egg's controls, its sentence and the
 *  Settings form. */
export function onInput(event: Event): void {
  // The units are a setting about the screen, not about the egg, and have
  // their own path.
  const target = event.target;
  if (target instanceof HTMLInputElement && target.name === 'units') {
    if (event.type === 'change') send({ kind: 'units', system: target.value === 'imperial' ? 'imperial' : 'metric' });
    return;
  }
  // So is the language, which changes every word and no number.
  if (target instanceof HTMLInputElement && target.name === 'language') {
    if (event.type === 'change' && LANGUAGES.includes(target.value)) {
      send({ kind: 'language', pick: target.value });
    }
    return;
  }
  if (target instanceof HTMLInputElement && target.name === 'alarm') {
    // The cook picks an alarm sound, and hears it: the pick is the moment
    // they want to know what they chose.
    if (event.type === 'change' && (ALARM_SOUNDS as string[]).includes(target.value)) {
      send({ kind: 'alarm', sound: readAlarmSound(target.value) });
    }
    return;
  }
  // While a cook runs, a correction in hand on the control it came from.
  const source = target instanceof HTMLElement && target.id !== '' ? target.id : null;
  send({ kind: 'controls', read: readInputs(target), source: source, group: groupOf(target), real_ms: performance.now() });
}
