/**
 * The controls and the Settings form, as the view says them (`formView`,
 * plain data from the model) and written to the page each frame
 * (`drawForm`), where it says otherwise and never under the cook's typing:
 * the size menu, every field with a unit (its step, bounds, unit and
 * contents), the labels that carry a temperature or a mass, and the radios;
 * the language picker as the words on screen change. Reading them back is
 * input.ts's.
 */

import { eggFromMinorDiameter } from '../core/geometry.ts';
import { SOUS_VIDE_BATH_C, SOUS_VIDE_MODEL_FLOOR_C } from '../core/sousvide.ts';
import { type Measure, type Quantity, type UnitSystem, displayText, nudgeFrom, sizeClassLabel } from '../core/units.ts';
import { SLIDER_STEPS } from '../core/slider.ts';
import { startTempPreset_C } from '../core/inputs.ts';
import { languageOf } from '../core/format.ts';
import { activeLocale, t } from './copy.ts';
import { page, selectRadio, setText } from './dom.ts';
import type { Model } from './model.ts';
import { controlsOf, currentAmbient_C, currentEgg, room_C, sizeClasses } from './state.ts';
import { T_COLD_TAP_C } from '../core/constants.ts';
import { LIMITS, type Limit, START_TEMP_PRESETS_C, type Settings } from './store.ts';
import { measure, show, unitSystem } from './units.ts';

/** The fields with a unit, by the id of their input. */
const FIELDS = {
  measureMass: 'mass', measureGirth: 'girth', measureMinor: 'width', customTemp: 'eggTemp', altitude: 'altitude',
  litres: 'water', probeReading: 'probeTemp', roomTemp: 'roomTemp', roomTempFrom: 'roomTemp', bowlLitres: 'bowl',
  coolingWater: 'coolingWater',
} as const;
type Field = keyof typeof FIELDS;

/** The labels of each field's unit, by the id of its input. */
const UNIT_LABELS: Record<Field, string> = {
  measureMass: 'unitMass', measureGirth: 'unitGirth', measureMinor: 'unitMinor', customTemp: 'unitTemp',
  altitude: 'unitAltitude', litres: 'unitLitres', probeReading: 'unitProbe', roomTemp: 'unitRoom',
  roomTempFrom: 'unitRoomFrom', bowlLitres: 'unitBowl', coolingWater: 'unitCoolingWater',
};

/** The form as it should read: the controls (`controls`: the settings while
 *  idle, a running cook's own choices while one runs), in the units and the
 *  words on screen. */
export interface FormView {
  controls: Settings;
  /** The alarm's choice as the settings have it. */
  alarm: string;
  units: UnitSystem;
  measures: Record<Field, { step: string; min: string | null; max: string | null; unit: string }>;
  /** Each field's contents, from the stored SI value. */
  values: {
    measureMass: string; measureGirth: string; measureMinor: string; customTemp: string; litres: string; altitude: string;
    roomTemp: string; bowlLitres: string; coolingWater: string;
  };
  roomPlaceholder: string;
  moreRoom: string;
  /** The water the eggs cool in, for the cooling chosen: its temperature as
   *  assumed, for the empty field, and its (i). */
  coolingWaterPlaceholder: string;
  moreCoolingWater: string;
  sizeLabels: string[];
  measuredLabel: string;
  startTempHint: string;
  sousLabel: string;
  helpSous: string;
}

/** A stored SI value as an input's contents: the displayed number, without
 *  the trailing zeros a readout keeps ("2", not "2.00"). */
function inputText(q: Quantity, si: number): string {
  const text = displayText(measure(q), si);
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/** The form for the model `m`. */
export function formView(m: Model): FormView {
  const c = controlsOf(m);
  const egg = currentEgg(m);
  const minor_mm = egg.minorDiameter_m * 1000;
  const measures = {} as FormView['measures'];
  for (const id of Object.keys(FIELDS) as Field[]) {
    const ms: Measure = measure(FIELDS[id]);
    measures[id] = {
      step: String(ms.step), min: ms.bounds === null ? null : String(ms.bounds.lo),
      max: ms.bounds === null ? null : String(ms.bounds.hi), unit: t(ms.unitKey),
    };
  }
  const system = unitSystem();
  const room = room_C(m);
  // The water's temperature the model assumes when the field is empty:
  // mains water running, the room in a bowl (`coolingMedium_C`).
  const assumedWater_C = c.cooling === 'tap' ? T_COLD_TAP_C : currentAmbient_C(m);
  const givenWater_C = c.cooling === 'tap' ? c.tapWater_C : c.bowlWater_C;
  return {
    controls: c,
    alarm: m.settings.alarm,
    units: system,
    measures: measures,
    values: {
      measureMass: inputText('mass', egg.mass_kg * 1000),
      measureGirth: inputText('girth', Math.PI * minor_mm),
      measureMinor: inputText('width', minor_mm),
      customTemp: inputText('eggTemp', c.customStart_C),
      litres: inputText('water', c.waterLitres),
      altitude: inputText('altitude', c.altitude_m),
      // Empty until measured, showing the room assumed, greyed: the − and +
      // start there.
      roomTemp: c.room_C === null ? '' : inputText('roomTemp', c.room_C),
      bowlLitres: inputText('bowl', c.bowlLitres),
      coolingWater: givenWater_C === null ? '' : inputText('coolingWater', givenWater_C),
    },
    roomPlaceholder: String(nudgeFrom(measure('roomTemp'), START_TEMP_PRESETS_C.room)),
    moreRoom: t('controls.room.more', { room: show('temperature', START_TEMP_PRESETS_C.room) }),
    coolingWaterPlaceholder: String(nudgeFrom(measure('coolingWater'), assumedWater_C)),
    moreCoolingWater: c.cooling === 'tap'
      ? t('controls.coolingWater.tap.more', { water: show('temperature', assumedWater_C) })
      : t('controls.coolingWater.bowl.more', { room: show('temperature', assumedWater_C) }),
    sizeLabels: sizeClasses.map((sc) => {
      const label = sizeClassLabel(sc, system);
      return t(label.key, { mass: t(label.mass.key, { value: label.mass.value }) });
    }),
    // The measured egg's option carries its mass, as iOS's does, so choosing
    // it says which egg comes back.
    measuredLabel: t('controls.size.measured', { mass: show('mass', eggFromMinorDiameter(c.customMinor_mm / 1000).mass_kg * 1000) }),
    // The presets are assumptions, and are labelled as such rather than
    // baked into the buttons: a room is not necessarily 20 C, and Custom is
    // there for anyone who knows better. A measured room is what the Room
    // button means.
    startTempHint: t('controls.eggFrom.hint', {
      fridge: show('temperature', startTempPreset_C('fridge', room)),
      room: show('temperature', startTempPreset_C('room', room)),
    }),
    sousLabel: t('controls.start.sousVide', { bath: show('temperature', SOUS_VIDE_BATH_C) }),
    helpSous: t('help.unsure.sousVide', { floor: show('temperature', SOUS_VIDE_MODEL_FLOOR_C) }),
  };
}

/* ------------------------------------------------------------ the page */

/** A field's contents written where they say otherwise, but never under the
 *  cook typing in it, so the field never fights the cursor: it keeps what
 *  was typed, and shows the stored value, rounded to its step, once left. */
function setValue(input: HTMLInputElement | HTMLSelectElement, value: string): void {
  const typing = input === document.activeElement && input.type === 'number';
  if (input.value !== value && !typing) input.value = value;
}

/** An attribute written where it says otherwise. */
function setAttr(e: Element, name: string, value: string): void {
  if (e.getAttribute(name) !== value) e.setAttribute(name, value);
}

/** The form written from `f`, each frame, as far as the page says otherwise:
 *  every control, each field with a unit in the units on screen (its step,
 *  bounds, unit and contents, from the stored SI values, so switching back
 *  and forth never moves the egg), the labels that carry a temperature or a
 *  mass, and the fields a choice opens. The room is one setting in two
 *  fields, in Settings and beside "at room temperature". */
export function drawForm(f: FormView): void {
  const c = f.controls;
  for (const id of Object.keys(FIELDS) as Field[]) {
    const input = page()[id];
    const ms = f.measures[id];
    setAttr(input, 'step', ms.step);
    if (ms.min !== null && ms.max !== null) {
      setAttr(input, 'min', ms.min);
      setAttr(input, 'max', ms.max);
    }
    setText(page()[UNIT_LABELS[id] as 'unitMass'], ms.unit);
  }
  setValue(page().size, String(c.sizeIndex));
  for (let i = 0; i < f.sizeLabels.length; i += 1) setText(page().size.options[i], f.sizeLabels[i]);
  setText(page().size.options[sizeClasses.length], f.measuredLabel);
  for (const id of ['measureMass', 'measureGirth', 'measureMinor', 'customTemp', 'litres', 'altitude', 'bowlLitres'] as const) {
    setValue(page()[id], f.values[id]);
  }
  for (const input of [page().roomTemp, page().roomTempFrom]) {
    setValue(input, f.values.roomTemp);
    setAttr(input, 'placeholder', f.roomPlaceholder);
  }
  setValue(page().coolingWater, f.values.coolingWater);
  setAttr(page().coolingWater, 'placeholder', f.coolingWaterPlaceholder);
  setValue(page().eggCount, String(c.eggCount));
  // The slider is never typed in: a snap moves it out from under the cook.
  if (Number(page().doneness.value) !== c.doneness) page().doneness.value = String(c.doneness);
  selectRadio('units', f.units);
  selectRadio('startTemp', c.startTempMode);
  selectRadio('startMode', c.startMode);
  selectRadio('afterBoil', c.afterBoil);
  selectRadio('cooling', c.cooling);
  selectRadio('alarm', f.alarm);
  page().probeSetting.checked = c.probe;
  page().customTempField.hidden = c.startTempMode !== 'custom';
  page().roomFromField.hidden = c.startTempMode !== 'room';
  page().bowlFields.hidden = c.cooling !== 'bowl';
  page().coolingWaterField.hidden = c.cooling !== 'tap' && c.cooling !== 'bowl';
  setText(page().startTempHint, f.startTempHint);
  setText(page().moreRoom, f.moreRoom);
  setText(page().moreRoomFrom, f.moreRoom);
  setText(page().moreCoolingWater, f.moreCoolingWater);
  setText(page().startSousLabel, f.sousLabel);
  setText(page().helpSousVide, f.helpSous);
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
