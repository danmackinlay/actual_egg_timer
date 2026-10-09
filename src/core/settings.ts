/**
 * The settings, as both apps keep them: one value, and the one reader of a
 * stored copy (`readSettings`), which checks every field and takes the
 * default for anything missing or malformed.
 *
 * The value holds what either app keeps. Most is the same control in both;
 * a few fields are one app's alone and the other carries them untouched:
 * the web's measured egg (`customMinor_mm`, `measuredBy`) and its mute, and
 * iOS's weighed egg (`weighedMass_g`). iOS keeps the language and the alarm's
 * sound under keys of their own and reads them from there.
 *
 * Pure, like the rest of `src/core/`: no storage, no DOM, no clock. What is
 * stored is the app's JSON, parsed; this reads it.
 */

import { SizeClass } from './geometry.js';
import { DEFAULTS, DEFAULT_EGG_MASS_KG, LIMITS, Limit, carrySizeIndex, clamp } from './inputs.js';
import { FRESH_LANGUAGE, LANGUAGES, LanguageState, readLanguageState } from './language.js';
import { Cooling, HeatAfterBoil, StartMode } from './protocol.js';
import type { EggFrom } from './record.js';
import { AlarmSound, DEFAULT_ALARM_SOUND, readAlarmSound } from './sounds.js';
import { UnitSystem, readChosenUnits } from './units.js';

/** Which of the web's three measurement boxes a measured egg came from: one
 *  number in three units, and a weighed egg and a ruler-measured one are not
 *  equally sure (the record's `massFrom`). */
export type MeasuredBy = 'scale' | 'girth' | 'width';

export interface Settings {
  /** Index into the region's size classes, or -1 for an egg measured (the
   *  web) or weighed (iOS). Stored without the region: see `carrySizeIndex`. */
  sizeIndex: number;
  /** The web's measured egg: its minor diameter, mm, and the box it was
   *  typed in. */
  customMinor_mm: number;
  measuredBy: MeasuredBy;
  /** iOS's weighed egg, g: what the mass slider says, kept while a class is
   *  chosen, so that choosing Weighed again goes back to it. */
  weighedMass_g: number;
  /** Where the egg comes from, and its temperature when it is `custom`. */
  startTempMode: EggFrom;
  customStart_C: number;
  altitude_m: number;
  /** A pan: a sous-vide is never stored, so it never comes back. */
  startMode: StartMode;
  afterBoil: HeatAfterBoil;
  cooling: Cooling;
  waterLitres: number;
  /** A whole number. */
  eggCount: number;
  /** Doneness slider position, [0, 1]. */
  doneness: number;
  /** The web's: no alarm, no blips. The countdown still runs. */
  muted: boolean;
  /** Which sound the alarm makes (`ALARM_SOUNDS`). */
  alarm: AlarmSound;
  /** Metric or Imperial as the cook chose it, or null if they never have:
   *  not the system on screen, which falls back to the region's
   *  (`effectiveUnits`), so a default is never stored as a choice. */
  unitsChosen: UnitSystem | null;
  /** The language the cook chose, or the units switch put on screen, or
   *  null for the default (`src/core/language.ts`). */
  language: LanguageState;
  /** "I have a probe thermometer": ask for a reading at the middle of the
   *  egg when the cooling ends. Off until the cook says so. */
  probe: boolean;
  /** The room as the cook measured it, C, or null for not measured.
   *  Counted only while `probe` is on (`roomInUse`). */
  room_C: number | null;
}

/** What a fresh install starts from: the numbers are `DEFAULTS`'. */
export const DEFAULT_SETTINGS: Settings = {
  sizeIndex: DEFAULTS.sizeIndex,
  customMinor_mm: DEFAULTS.customMinor_mm,
  // Read only for a measured egg, and set by whichever box is typed in. The
  // first, the scale, is the likely one for a record that never said.
  measuredBy: 'scale',
  weighedMass_g: DEFAULT_EGG_MASS_KG * 1000,
  startTempMode: 'fridge',
  customStart_C: DEFAULTS.customStart_C,
  altitude_m: DEFAULTS.altitude_m,
  startMode: 'cold',
  afterBoil: 'hold',
  cooling: 'ice',
  waterLitres: DEFAULTS.waterLitres,
  eggCount: DEFAULTS.eggCount,
  doneness: DEFAULTS.doneness,
  muted: false,
  alarm: DEFAULT_ALARM_SOUND,
  unitsChosen: null,
  language: FRESH_LANGUAGE,
  probe: false,
  room_C: null,
};

/** A stored number within `limit`, or `fallback` for anything that is not a
 *  finite number. */
function storedNumber(value: unknown, limit: Limit, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, limit) : fallback;
}

/** A stored value that is one of `allowed`, or `fallback`. */
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  for (let i = 0; i < allowed.length; i += 1) {
    if (value === allowed[i]) return allowed[i];
  }
  return fallback;
}

/**
 * The settings as stored, read against `classes`, the size table in use now
 * (which need not be the one they were saved against): each field checked,
 * a number clamped to its bounds, and the default for anything missing or
 * not what it should be. A stored `'sous'`, from before a sous-vide stopped
 * being saved, is the default pan, since nothing recorded the pan before it.
 */
export function readSettings(raw: unknown, classes: SizeClass[]): Settings {
  const d = DEFAULT_SETTINGS;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ...d };
  const r = raw as Record<string, unknown>;
  return {
    sizeIndex: carrySizeIndex(storedNumber(r['sizeIndex'], LIMITS.sizeIndex, d.sizeIndex), classes),
    customMinor_mm: storedNumber(r['customMinor_mm'], LIMITS.minor_mm, d.customMinor_mm),
    measuredBy: oneOf(r['measuredBy'], ['scale', 'girth', 'width'] as const, d.measuredBy),
    weighedMass_g: storedNumber(r['weighedMass_g'], LIMITS.mass_g, d.weighedMass_g),
    startTempMode: oneOf(r['startTempMode'], ['fridge', 'room', 'custom'] as const, d.startTempMode),
    customStart_C: storedNumber(r['customStart_C'], LIMITS.eggTemp_C, d.customStart_C),
    altitude_m: storedNumber(r['altitude_m'], LIMITS.altitude_m, d.altitude_m),
    startMode: oneOf(r['startMode'], ['cold', 'hot'] as const, d.startMode),
    afterBoil: oneOf(r['afterBoil'], ['hold', 'off'] as const, d.afterBoil),
    cooling: oneOf(r['cooling'], ['ice', 'tap', 'counter'] as const, d.cooling),
    waterLitres: storedNumber(r['waterLitres'], LIMITS.waterLitres, d.waterLitres),
    eggCount: Math.round(storedNumber(r['eggCount'], LIMITS.eggCount, d.eggCount)),
    doneness: storedNumber(r['doneness'], LIMITS.doneness, d.doneness),
    muted: r['muted'] === true,
    alarm: readAlarmSound(r['alarm']),
    unitsChosen: readChosenUnits(r['unitsChosen']),
    language: readLanguageState(r['language'], LANGUAGES),
    probe: r['probe'] === true,
    room_C: typeof r['room_C'] === 'number' && Number.isFinite(r['room_C']) ? clamp(r['room_C'], LIMITS.room_C) : null,
  };
}
