/**
 * The controls and the Settings form, written from the settings: the size
 * menu, every field with a unit (its step, bounds, unit and contents), the
 * labels that carry a temperature or a mass, the radios and the language
 * picker. Reading them back is input.ts's.
 */

import { eggFromMinorDiameter } from '../core/geometry.js';
import { SOUS_VIDE_BATH_C, SOUS_VIDE_MODEL_FLOOR_C } from '../core/sousvide.js';
import { Measure, Quantity, displayText, nudgeFrom, sizeClassLabel } from '../core/units.js';
import { SLIDER_STEPS, startTempPreset_C } from '../core/policy.js';
import { languageOf } from '../core/format.js';
import { activeLocale, t } from './copy.js';
import { page, selectRadio } from './dom.js';
import { liveSetupFacts, redrawSentence, renderSentence } from './sentence.js';
import { currentEgg, room_C, sizeClasses, state } from './state.js';
import { LIMITS, Limit, START_TEMP_PRESETS_C } from './store.js';
import { measure, show, unitSystem } from './units.js';

/** Rewrite whichever measurement boxes the user is not currently typing in, so
 *  filling in one fills in the rest without the field fighting the cursor.
 *  That exception is half of the round trip: the box being typed in keeps what
 *  was typed, and the others show the stored egg rounded to their step. */
export function syncMeasurements(except: EventTarget | null): void {
  const egg = currentEgg(state);
  const minor_mm = egg.minorDiameter_m * 1000;
  if (except !== page().measureMass) page().measureMass.value = inputText('mass', egg.mass_kg * 1000);
  if (except !== page().measureGirth) page().measureGirth.value = inputText('girth', Math.PI * minor_mm);
  if (except !== page().measureMinor) page().measureMinor.value = inputText('width', minor_mm);
}

/** A stored SI value as an input's contents: the displayed number, without
 *  the trailing zeros a readout keeps ("2", not "2.00"). */
function inputText(q: Quantity, si: number): string {
  const text = displayText(measure(q), si);
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/** An input's step and bounds, in the units on screen. The bounds are the SI
 *  limits rounded inward to the step, so every value the input allows is one
 *  the model does too. */
function applyMeasure(input: HTMLInputElement, label: HTMLElement, m: Measure): void {
  input.step = String(m.step);
  if (m.bounds !== null) {
    input.min = String(m.bounds.lo);
    input.max = String(m.bounds.hi);
  }
  label.textContent = t(m.unitKey);
}

/** The picker, and the line under the Imperial option that says the English
 *  of 1750 is there, which only an English page shows. */
export function applyLanguageToDom(): void {
  selectRadio('language', activeLocale());
  page().unitsPeriod.hidden = languageOf(activeLocale()) !== 'en';
}

export function buildSizeOptions(): void {
  for (let i = 0; i < sizeClasses.length; i += 1) {
    const option = document.createElement('option');
    option.value = String(i);
    page().size.append(option);
  }
  const custom = document.createElement('option');
  custom.value = '-1';
  page().size.append(custom);
}

/** The classes' names, with their masses in the units on screen, and the
 *  measured egg's. */
function labelSizeOptions(): void {
  for (let i = 0; i < sizeClasses.length; i += 1) {
    const label = sizeClassLabel(sizeClasses[i], unitSystem());
    page().size.options[i].textContent = t(label.key, { mass: t(label.mass.key, { value: label.mass.value }) });
  }
  labelMeasuredOption();
}

/** The measured egg's option carries its mass, as iOS's does, so choosing it
 *  says which egg comes back (D6). */
export function labelMeasuredOption(): void {
  const measured = eggFromMinorDiameter(state.controls.customMinor_mm / 1000);
  page().size.options[sizeClasses.length].textContent = t('controls.size.measured', {
    mass: show('mass', measured.mass_kg * 1000),
  });
}

function applyLimit(input: HTMLInputElement, limit: Limit): void {
  input.min = String(limit.lo);
  input.max = String(limit.hi);
}

/** Everything the markup says about numbers comes from the same tables the
 *  model reads, so a bound or a preset changed in one place changes here too. */
export function applyConstantsToDom(): void {
  applyLimit(page().eggCount, LIMITS.eggCount);
  applyLimit(page().doneness, LIMITS.doneness);
  page().doneness.step = String(1 / SLIDER_STEPS);
}

/** Everything on the form that has a unit: each input's step, bounds, unit
 *  and contents, the preset labels, and the size menu. Run at boot and again
 *  whenever the cook changes system, from the stored SI values - so switching
 *  back and forth never moves the egg. The values are the controls' (a
 *  running cook's own, `state.controls`). */
export function applyUnitsToDom(): void {
  const settings = state.controls;
  applyMeasure(page().measureMass, page().unitMass, measure('mass'));
  applyMeasure(page().measureGirth, page().unitGirth, measure('girth'));
  applyMeasure(page().measureMinor, page().unitMinor, measure('width'));
  applyMeasure(page().customTemp, page().unitTemp, measure('eggTemp'));
  applyMeasure(page().altitude, page().unitAltitude, measure('altitude'));
  applyMeasure(page().litres, page().unitLitres, measure('water'));
  applyMeasure(page().probeReading, page().unitProbe, measure('probeTemp'));
  applyMeasure(page().roomTemp, page().unitRoom, measure('roomTemp'));
  syncMeasurements(null);
  page().customTemp.value = inputText('eggTemp', settings.customStart_C);
  page().litres.value = inputText('water', settings.waterLitres);
  page().altitude.value = inputText('altitude', settings.altitude_m);
  // Empty until measured, showing the room assumed, greyed: the − and + start
  // there.
  page().roomTemp.value = settings.room_C === null ? '' : inputText('roomTemp', settings.room_C);
  page().roomTemp.placeholder = String(nudgeFrom(measure('roomTemp'), START_TEMP_PRESETS_C.room));
  page().moreRoom.textContent = t('controls.room.more', {
    room: show('temperature', START_TEMP_PRESETS_C.room),
  });
  selectRadio('units', unitSystem());
  labelSizeOptions();
  labelStartTemps();
  page().startSousLabel.textContent = t('controls.start.sousVide', {
    bath: show('temperature', SOUS_VIDE_BATH_C),
  });
  page().helpSousVide.textContent = t('help.unsure.sousVide', {
    floor: show('temperature', SOUS_VIDE_MODEL_FLOOR_C),
  });
  // The sentence's masses and temperatures are in the units too.
  redrawSentence();
  renderSentence(liveSetupFacts(settings, sizeClasses, currentEgg(state)));
}

/** The presets are assumptions, and are labelled as such rather than baked
 *  into the buttons: a room is not necessarily 20 C, and Custom is there for
 *  anyone who knows better. A measured room is what the Room button means. */
export function labelStartTemps(): void {
  page().startTempHint.textContent = t('controls.eggFrom.hint', {
    fridge: show('temperature', startTempPreset_C('fridge', room_C(state))),
    room: show('temperature', startTempPreset_C('room', room_C(state))),
  });
}

/** Every control written from what the controls show (`state.controls`):
 *  the settings while idle, a running cook's own choices while one runs. */
export function applySettingsToDom(): void {
  const settings = state.controls;
  page().size.value = String(settings.sizeIndex);
  applyUnitsToDom();
  selectRadio('startTemp', settings.startTempMode);
  selectRadio('startMode', settings.startMode);
  selectRadio('afterBoil', settings.afterBoil);
  selectRadio('cooling', settings.cooling);
  selectRadio('alarm', settings.alarm);
  page().eggCount.value = String(settings.eggCount);
  page().doneness.value = String(settings.doneness);
  page().customTempField.hidden = settings.startTempMode !== 'custom';
  page().probeSetting.checked = settings.probe;
  page().roomField.hidden = !settings.probe;
  applyLanguageToDom();
}
