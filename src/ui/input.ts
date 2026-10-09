/**
 * What the cook does to the controls and the Settings form, read as
 * messages (model.ts): every input and change (`onInput`), read into the
 * controls as they now stand; the units, the language, the alarm's sound,
 * and the mute. What follows - the settings written, the page solved again,
 * a correction in hand - is `update`'s.
 */

import { eggFromMass } from '../core/geometry.js';
import { Cooling } from '../core/protocol.js';
import { Quantity, parse } from '../core/units.js';
import { ALARM_SOUNDS, readAlarmSound } from '../core/sounds.js';
import { DEFAULTS } from '../core/inputs.js';
import { LANGUAGES, languageAfterPick } from '../core/language.js';
import { page, radioValue } from './dom.js';
import { groupOf } from './edit.js';
import { send } from './send.js';
import { state } from './state.js';
import { LIMITS, START_TEMP_PRESETS_C, Settings, UiStartMode, clampNumber } from './store.js';
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

/** What a field says, in SI and clamped, or `fallback` while it holds no
 *  number. Only ever called for the field the cook is editing: re-reading a
 *  field nobody touched would re-parse a rounded display back over the stored
 *  value, and that is the drift the round trip exists to prevent. */
function readField(input: HTMLInputElement, q: Quantity, fallback: number): number {
  if (input.value.trim() === '') return fallback;
  return parse(measure(q), Number(input.value)) ?? fallback;
}

/** Sound is a setting, not a phase: the toggle works mid-cook, and muting
 *  while the alarm is going stops it. */
export function onToggleMute(): void {
  send({ kind: 'mute' });
}

/** The controls as the page now shows them: what they showed
 *  (`state.controls`: the settings while idle; while a cook runs, its
 *  correction in hand), with what `source` changed read back over them. */
function readInputs(source: EventTarget | null): Settings {
  const settings: Settings = { ...state.controls };
  const sizeIndex = Number(page().size.value);
  settings.sizeIndex = Number.isFinite(sizeIndex) ? sizeIndex : DEFAULTS.sizeIndex;

  // Measuring the egg any of the three ways overrides the size class, because
  // a measured egg is better information than a box label. A box cleared, or
  // holding something that is not a number, measures nothing: the egg stays.
  let measured_mm = NaN;
  if (source === page().measureMass) {
    measured_mm = minorFromMass_mm(readField(page().measureMass, 'mass', NaN));
  } else if (source === page().measureGirth) {
    measured_mm = minorFromGirth_mm(readField(page().measureGirth, 'girth', NaN));
  } else if (source === page().measureMinor) {
    measured_mm = readField(page().measureMinor, 'width', NaN);
  }
  if (measured_mm > 0) {
    settings.measuredBy = source === page().measureMass ? 'scale'
      : source === page().measureGirth ? 'girth' : 'width';
    settings.customMinor_mm = clampNumber(measured_mm, LIMITS.minor_mm, settings.customMinor_mm);
    settings.sizeIndex = -1;
  }
  settings.startTempMode = radioValue('startTemp', 'fridge') as Settings['startTempMode'];
  // The three fields with a unit are read only when they are the one being
  // edited, like the measurements above: see `readField`.
  if (source === page().customTemp) {
    settings.customStart_C = readField(page().customTemp, 'eggTemp', settings.customStart_C);
  }
  if (source === page().altitude) {
    settings.altitude_m = readField(page().altitude, 'altitude', settings.altitude_m);
  }
  settings.startMode = radioValue('startMode', 'cold') as UiStartMode;
  settings.afterBoil = radioValue('afterBoil', 'hold') as Settings['afterBoil'];
  settings.cooling = radioValue('cooling', 'ice') as Cooling;
  if (source === page().litres) {
    settings.waterLitres = readField(page().litres, 'water', settings.waterLitres);
  }
  settings.eggCount = Math.round(clampNumber(page().eggCount.value, LIMITS.eggCount, settings.eggCount));
  settings.doneness = clampNumber(page().doneness.value, LIMITS.doneness, settings.doneness);
  settings.probe = page().probeSetting.checked;
  // The room, measured: an emptied field is "not measured", and the room is
  // assumed again. Read only when it is the one being edited (`readField`).
  if (source === page().roomTemp) {
    settings.room_C = page().roomTemp.value.trim() === ''
      ? null : readField(page().roomTemp, 'roomTemp', settings.room_C ?? START_TEMP_PRESETS_C.room);
  }
  return settings;
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
      send({ kind: 'language', next: languageAfterPick(state.settings.language, target.value) });
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
  send({ kind: 'controls', controls: readInputs(target), source: source, group: groupOf(target), real_ms: performance.now() });
}
