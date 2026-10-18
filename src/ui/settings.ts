/**
 * The settings as the web keeps them (`aet.settings`): one value, and the
 * one reader of a stored copy (`readSettings`), which checks every field and
 * takes the default for anything missing or malformed. Among them the
 * measured egg (`customMinor_mm`, `measuredBy`), the mute, the alarm's sound
 * and the language, which the iPhone keeps its own way
 * (`EggTimerApp/Settings.swift`).
 *
 * Pure: no storage, no DOM, no clock. What is stored is the page's JSON,
 * parsed; this reads it, and store.ts reads and writes it.
 */

import type { SizeClass } from '../core/geometry.ts';
import { DEFAULTS, LIMITS, type Limit, clamp } from '../core/inputs.ts';
import { DEFAULT_LANGUAGE, PERIOD_LANGUAGE, isPeriod } from '../core/copy.ts';
import { languageOf } from '../core/format.ts';
import type { Cooling, HeatAfterBoil, StartMode } from '../core/protocol.ts';
import type { EggFrom } from '../core/record.ts';
import type { AlarmSound } from '../core/sounds.ts';
import type { UnitSystem, UnitsFlip } from '../core/units.ts';

/** Which of the web's three measurement boxes a measured egg came from: one
 *  number in three units, and a weighed egg and a ruler-measured one are not
 *  equally sure (the record's `massFrom`). */
type MeasuredBy = 'scale' | 'girth' | 'width';

export interface Settings {
  /** Index into the region's size classes, or -1 for an egg measured.
   *  Stored without the region: see `carrySizeIndex`. */
  sizeIndex: number;
  /** The measured egg: its minor diameter, mm, and the box it was typed
   *  in. */
  customMinor_mm: number;
  measuredBy: MeasuredBy;
  /** Where the egg comes from, and its temperature when it is `custom`. */
  startTempMode: EggFrom;
  customStart_C: number;
  altitude_m: number;
  /** A pan: a sous-vide is never stored, so it never comes back. */
  startMode: StartMode;
  afterBoil: HeatAfterBoil;
  cooling: Cooling;
  /** Running water's temperature as the cook gave it, C, or null to assume
   *  mains water (T_COLD_TAP_C). */
  tapWater_C: number | null;
  /** The bowl's water, litres, and its temperature as the cook gave it, C,
   *  or null to assume the room. Kept while another cooling is chosen, so
   *  that choosing the bowl again goes back to them. */
  bowlLitres: number;
  bowlWater_C: number | null;
  waterLitres: number;
  /** A whole number. */
  eggCount: number;
  /** Doneness slider position, [0, 1]. */
  doneness: number;
  /** No alarm, no blips. The countdown still runs. */
  muted: boolean;
  /** Which sound the alarm makes (`ALARM_SOUNDS`). */
  alarm: AlarmSound;
  /** Metric or Imperial as the cook chose it, or null if they never have:
   *  not the system on screen, which falls back to the region's
   *  (`effectiveUnits`), so a default is never stored as a choice. */
  unitsChosen: UnitSystem | null;
  /** The language the cook chose, or the units switch put on screen, or
   *  null for the default (`LanguageState`). */
  language: LanguageState;
  /** "I have a probe thermometer": ask for a reading at the middle of the
   *  egg when the cooling ends. Off until the cook says so. */
  probe: boolean;
  /** The room as the cook gave it, C, or null to assume one
   *  (`roomInUse`). */
  room_C: number | null;
  /** What the egg in cross-section shows: how set each layer is, or how hot
   *  (`DECISIONS.md` 52). A tap on the egg turns it over, and it stays so
   *  from cook to cook. */
  eggView: EggView;
}

/** The egg's two pictures. */
export type EggView = 'set' | 'heat';

/* ---------------------------------------- what only the settings read */

/** The alarm sounds the cook can choose, in the order the picker lists
 *  them, and the one a fresh install rings with: the wind-up timer, which is
 *  what anyone expects an egg timer to sound like. */
export const ALARM_SOUNDS: AlarmSound[] = ['timer', 'cuckoo', 'hen'];
export const DEFAULT_ALARM_SOUND: AlarmSound = 'timer';

/** A stored choice, or the default for anything that is not one: absence, a
 *  sound a later version offers and this one does not, a sound since
 *  retired. */
export function readAlarmSound(raw: unknown): AlarmSound {
  for (let i = 0; i < ALARM_SOUNDS.length; i++) {
    if (raw === ALARM_SOUNDS[i]) return ALARM_SOUNDS[i];
  }
  return DEFAULT_ALARM_SOUND;
}

/** Which catalogue the cook reads: `chosen` is the cook's pick, or 1750 put
 *  there by the units switch (`languageAfterFlip`), or null for the default,
 *  kept apart from it as the units are. */
export interface LanguageState {
  chosen: string | null;
}

/** Every catalogue the picker offers, in its order, and the state of a
 *  cook who never chose one. */
export const LANGUAGES: readonly string[] = [DEFAULT_LANGUAGE, PERIOD_LANGUAGE];

export const FRESH_LANGUAGE: LanguageState = { chosen: null };

/** The catalogue on screen. */
export function effectiveLanguage(state: LanguageState): string {
  return state.chosen ?? DEFAULT_LANGUAGE;
}

/** The language after the cook's own switch of units (LANGUAGE.md section
 *  6): metric to Imperial in modern English goes into 1750. Anything else -
 *  back to metric, another language, 1750 already - leaves it, and the cook
 *  leaves 1750 with the picker. */
export function languageAfterFlip(state: LanguageState, flip: UnitsFlip): LanguageState {
  const tag = effectiveLanguage(state);
  if (flip !== 'metricToImperial' || languageOf(tag) !== 'en' || isPeriod(tag)) return state;
  return { chosen: PERIOD_LANGUAGE };
}

/** A stored state, read defensively: anything malformed is the fresh one. A
 *  tag is kept only if it is one of `known`, so a catalogue that has gone
 *  cannot be asked for. Any other field, such as the retired `flippedFrom`,
 *  is ignored. */
export function readLanguageState(raw: unknown, known: readonly string[]): LanguageState {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return FRESH_LANGUAGE;
  const chosen = (raw as Record<string, unknown>)['chosen'];
  return { chosen: typeof chosen === 'string' && known.includes(chosen) ? chosen : null };
}

/**
 * A stored size index, read against the table in use now.
 *
 * An index means something only inside one table, and the table can change
 * underneath a stored record: the phone's region is changed, the browser's
 * language is, or - the case that matters - a record saved before there were
 * two tables is read by an American. The rule is that the index keeps its
 * NAME. A cook who picked Large picked the word on their carton, and the
 * region says whose carton it is, so a Large stays a Large and cooks at the
 * new table's mass. Keeping the mass instead would leave every American who
 * never touched the control on the EU Large this table exists to replace.
 *
 * Both tables hold the same names at the same indices as far as the shorter
 * goes, so keeping the name is keeping the index. A Jumbo read outside the US
 * becomes the largest class there is, Extra large. A measured egg (-1) is
 * measured in any region. Nothing is stored about the region, so there is no
 * second record to disagree with the first.
 */
export function carrySizeIndex(stored: number, classes: SizeClass[]): number {
  if (!Number.isFinite(stored)) return DEFAULTS.sizeIndex;
  // Negatives first: any is a measured egg, and -0.5 never reaches
  // Math.round, which would make it the first class.
  if (stored < 0) return -1;
  return Math.min(Math.round(stored), classes.length - 1);
}

/** A stored choice, or null for none: anything else in storage is not one. */
export function readChosenUnits(raw: unknown): UnitSystem | null {
  return raw === 'metric' || raw === 'imperial' ? raw : null;
}

/** What a fresh install starts from: the numbers are `DEFAULTS`'. */
export const DEFAULT_SETTINGS: Settings = {
  sizeIndex: DEFAULTS.sizeIndex,
  customMinor_mm: DEFAULTS.customMinor_mm,
  // Read only for a measured egg, and set by whichever box is typed in. The
  // first, the scale, is the likely one for a record that never said.
  measuredBy: 'scale',
  startTempMode: 'fridge',
  customStart_C: DEFAULTS.customStart_C,
  altitude_m: DEFAULTS.altitude_m,
  startMode: 'cold',
  afterBoil: 'hold',
  cooling: 'ice',
  tapWater_C: null,
  bowlLitres: DEFAULTS.bowlLitres,
  bowlWater_C: null,
  waterLitres: DEFAULTS.waterLitres,
  eggCount: DEFAULTS.eggCount,
  doneness: DEFAULTS.doneness,
  muted: false,
  alarm: DEFAULT_ALARM_SOUND,
  unitsChosen: null,
  language: FRESH_LANGUAGE,
  probe: false,
  room_C: null,
  eggView: 'set',
};

/** A stored number within `limit`, or `fallback` for anything that is not a
 *  finite number. */
function storedNumber(value: unknown, limit: Limit, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, limit) : fallback;
}

/** A stored number within `limit`, or null for anything that is not a
 *  finite number: an optional number left blank. */
function storedOptional(value: unknown, limit: Limit): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, limit) : null;
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
    startTempMode: oneOf(r['startTempMode'], ['fridge', 'room', 'custom'] as const, d.startTempMode),
    customStart_C: storedNumber(r['customStart_C'], LIMITS.eggTemp_C, d.customStart_C),
    altitude_m: storedNumber(r['altitude_m'], LIMITS.altitude_m, d.altitude_m),
    startMode: oneOf(r['startMode'], ['cold', 'hot'] as const, d.startMode),
    afterBoil: oneOf(r['afterBoil'], ['hold', 'off'] as const, d.afterBoil),
    cooling: oneOf(r['cooling'], ['ice', 'tap', 'bowl', 'counter', 'eggCup'] as const, d.cooling),
    tapWater_C: storedOptional(r['tapWater_C'], LIMITS.coolingWater_C),
    bowlLitres: storedNumber(r['bowlLitres'], LIMITS.bowlLitres, d.bowlLitres),
    bowlWater_C: storedOptional(r['bowlWater_C'], LIMITS.coolingWater_C),
    waterLitres: storedNumber(r['waterLitres'], LIMITS.waterLitres, d.waterLitres),
    eggCount: Math.round(storedNumber(r['eggCount'], LIMITS.eggCount, d.eggCount)),
    doneness: storedNumber(r['doneness'], LIMITS.doneness, d.doneness),
    muted: r['muted'] === true,
    alarm: readAlarmSound(r['alarm']),
    unitsChosen: readChosenUnits(r['unitsChosen']),
    language: readLanguageState(r['language'], LANGUAGES),
    probe: r['probe'] === true,
    room_C: storedOptional(r['room_C'], LIMITS.room_C),
    eggView: oneOf(r['eggView'], ['set', 'heat'] as const, d.eggView),
  };
}
