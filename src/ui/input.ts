/**
 * What the cook does to the controls and the Settings form, read into the
 * settings: every input and change (`onInput`), the units, and the mute.
 * The full solve follows, coalesced (update.ts).
 */

import { eggFromMass } from '../core/geometry.js';
import { Cooling } from '../core/protocol.js';
import { SOUS_VIDE_BATH_C } from '../core/sousvide.js';
import { Quantity, UnitSystem, chooseUnits, parse } from '../core/units.js';
import { DEFAULTS, targetPeakYolk_C } from '../core/policy.js';
import { LANGUAGES, languageAfterFlip, languageAfterPick } from '../core/language.js';
import { setMuted } from './clock.js';
import { applyUnitsToDom, labelMeasuredOption, labelStartTemps, syncMeasurements } from './controls.js';
import { page, radioValue } from './dom.js';
import { renderMute } from './render.js';
import { liveSetupFacts, renderSentence } from './sentence.js';
import { renderDonenessReading } from './slider.js';
import { boilingPoint_C, currentEgg, isSousVide, sizeClasses, state } from './state.js';
import { LIMITS, START_TEMP_PRESETS_C, Settings, UiStartMode, clampNumber } from './store.js';
import { REGIONAL_UNITS, measure, show, useUnits } from './units.js';
import { recompute, saveNow, scheduleSave, scheduleSolve, setLanguage, writeSettings } from './update.js';

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

/** The cook picks a system, stored as their choice. A cook's own switch
 *  from metric to Imperial, in modern English, is also a switch into the
 *  English of 1750 (LANGUAGE.md section 6); the switch back to metric
 *  leaves the language alone. `setLanguage` saves for both. */
function onUnits(next: UnitSystem): void {
  const settings = state.settings;
  const choice = chooseUnits(settings.unitsChosen, REGIONAL_UNITS, next);
  settings.unitsChosen = choice.chosen;
  useUnits(settings.unitsChosen);
  if (choice.flip !== null) setLanguage(languageAfterFlip(settings.language, choice.flip));
  else saveNow();
  applyUnitsToDom();
  recompute();
}

/** Sound is a setting, not a phase: the toggle works mid-cook, and muting
 *  while the alarm is going stops it. */
export function onToggleMute(): void {
  state.settings.muted = !state.settings.muted;
  setMuted(state.settings.muted);
  writeSettings();
  renderMute();
}

/** The controls read back into what they show (`state.controls`): the
 *  settings while idle; while a cook runs, its correction in hand. */
function readInputs(source: EventTarget | null): void {
  const settings = state.controls;
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
    page().size.value = '-1';
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
  page().roomField.hidden = !settings.probe;
  labelStartTemps();

  page().customTempField.hidden = settings.startTempMode !== 'custom';
  syncMeasurements(source);
  labelMeasuredOption();
  scheduleSave();
}

/** Every input and change on the egg's controls, its sentence and the
 *  Settings form. */
export function onInput(event: Event): void {
  // The units are a setting about the screen, not about the egg, and have
  // their own path.
  const target = event.target;
  if (target instanceof HTMLInputElement && target.name === 'units') {
    if (event.type === 'change') onUnits(target.value === 'imperial' ? 'imperial' : 'metric');
    return;
  }
  // So is the language, which changes every word and no number.
  if (target instanceof HTMLInputElement && target.name === 'language') {
    if (event.type === 'change' && LANGUAGES.includes(target.value)) {
      setLanguage(languageAfterPick(state.settings.language, target.value));
    }
    return;
  }
  readInputs(target);
  // Instant feedback on what the eye is on while dragging or choosing - the
  // reading under the slider, the sentence, the boiling point beside the
  // altitude; the full solve (tens of milliseconds) follows and corrects them.
  const shown = state.controls;
  renderDonenessReading(shown.doneness, isSousVide() ? { bath_C: SOUS_VIDE_BATH_C } : { peakYolk_C: targetPeakYolk_C(shown.doneness) });
  page().statBoil.textContent = show('boilingPoint', boilingPoint_C());
  page().body.dataset['start'] = shown.startMode;
  renderSentence(liveSetupFacts(shown, sizeClasses, currentEgg()));
  scheduleSolve();
}
