/**
 * Persistence: localStorage in, localStorage out.
 *
 * Everything here must survive localStorage being absent, disabled, full, or
 * throwing (Safari private mode throws on setItem).
 *
 * The BOUNDS and the DEFAULTS are core policy (`src/core/policy.ts`), so the
 * two apps share one set. This module applies them; it does not decide them.
 */

import { SizeClass } from '../core/geometry.js';
import { UnitSystem, readChosenUnits } from '../core/units.js';
import { FRESH_LANGUAGE, LANGUAGES, LanguageState, readLanguageState } from '../core/language.js';
import { StartMode, Cooling, HeatAfterBoil } from '../core/protocol.js';
import {
  BoilMemory, DEFAULTS, LIMITS, Limit, carrySizeIndex, clamp, isWithin, rememberBoil,
} from '../core/policy.js';

export type { Limit } from '../core/policy.js';
export { LIMITS, START_TEMP_PRESETS_C, estimateTimeToBoil, hasBoilMemory } from '../core/policy.js';

const SETTINGS_KEY = 'aet.settings.v1';
const COOK_KEY = 'aet.cook.v2';
/** The cook as the live site of 19 September stores it: a shape the ticket
 *  does not read. Dropped, not migrated. */
const SUPERSEDED_COOK_KEY = 'aet.cook.v1';
const BOIL_KEY = 'aet.boil.v1';

type StartTempMode = 'fridge' | 'room' | 'custom';

/** The Start control offers one more option than the solver understands.
 *  'sous' never reaches core: see buildSetup in app.ts. */
export type UiStartMode = StartMode | 'sous';

export interface Settings {
  /** Index into the region's size classes, or -1 for a custom measured
   *  diameter. Stored without the region: see `carrySizeIndex`. */
  sizeIndex: number;
  customMinor_mm: number;
  /** Which of the three measurement boxes `customMinor_mm` came from. They are
   *  one number in three units, so nothing else remembers - and a weighed egg
   *  and a ruler-measured one are not equally sure (the record's `massFrom`). */
  measuredBy: 'scale' | 'girth' | 'width';
  startTempMode: StartTempMode;
  customStart_C: number;
  altitude_m: number;
  startMode: UiStartMode;
  afterBoil: HeatAfterBoil;
  cooling: Cooling;
  waterLitres: number;
  eggCount: number;
  /** Doneness slider position, [0, 1]. */
  doneness: number;
  /** No alarm, no blips. The countdown still runs. */
  muted: boolean;
  /** Metric or Imperial, as the COOK chose it, or null if they never have.
   *  Not the system on screen: that is this or, failing it, the region's
   *  default (`effectiveUnits`), and storing the result instead would turn a
   *  default into a choice the cook never made. */
  unitsChosen: UnitSystem | null;
  /** The language the cook chose, or the units switch put on screen, or
   *  null for the default (`src/core/language.ts`). Like the units, a
   *  choice is kept apart from the default it overrides. */
  language: LanguageState;
  /** "I have a probe thermometer": ask for a reading at the middle of
   *  the egg when the cooling ends. Off until the cook says so. */
  probe: boolean;
  /** Whether the once-only offer has been answered, either way. The setting
   *  itself stays in the controls; the offer does not come back. */
  probeAsked: boolean;
}

/** The numbers a fresh install starts from come from core; the three settings
 *  that are purely a web-UI state - which temperature button is selected, which
 *  start mode, whether sound is off - are decided here. */
export const DEFAULT_SETTINGS: Settings = {
  sizeIndex: DEFAULTS.sizeIndex,
  customMinor_mm: DEFAULTS.customMinor_mm,
  // Read only for a measured egg, and set by whichever box is typed in. A
  // settings record from the live site of 19 September has no field for it,
  // and its diameter was typed into one of the same three boxes: the first,
  // the scale, is the likely one and the one that is read. The record's
  // `massFrom` has no "unknown" (record v1 is frozen), so it is a guess
  // either way, and the likely one beats the literal one.
  measuredBy: 'scale',
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
  unitsChosen: null,
  language: FRESH_LANGUAGE,
  probe: false,
  probeAsked: false,
};

/* ------------------------------------------------------------- raw storage */

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode, quota, or no storage at all: carry on without memory. */
  }
}

export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing stored means nothing to remove. */
  }
}

function parseObject(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- numbers */

/** Clamp to a finite number in range, falling back when given junk or NaN.
 *  Nothing from an input element or from storage reaches the solver without
 *  passing through here. */
export function clampNumber(value: unknown, limit: Limit, fallback: number): number {
  // An empty or blank field is "not yet typed", not zero: Number('') is 0,
  // which would silently clamp to the minimum while the user is mid-edit.
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, limit);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  for (let i = 0; i < allowed.length; i += 1) {
    if (value === allowed[i]) return allowed[i];
  }
  return fallback;
}

/* -------------------------------------------------------------- settings */

/** The pan method last saved - what a save made in sous-vide writes in its
 *  place (`saveSettings`). Read with the settings, and kept up by every save
 *  of a pan, so a save need not read storage back to find it. */
let lastPanStart: StartMode = 'cold';

/** `classes` is the table the app is showing now, which need not be the one
 *  the record was saved against. */
export function loadSettings(classes: SizeClass[]): Settings {
  const raw = parseObject(readStorage(SETTINGS_KEY));
  lastPanStart = storedPanStart(raw);
  if (raw === null) return { ...DEFAULT_SETTINGS };
  const d = DEFAULT_SETTINGS;
  return {
    sizeIndex: carrySizeIndex(clampNumber(raw['sizeIndex'], LIMITS.sizeIndex, d.sizeIndex), classes),
    customMinor_mm: clampNumber(raw['customMinor_mm'], LIMITS.minor_mm, d.customMinor_mm),
    measuredBy: oneOf(raw['measuredBy'], ['scale', 'girth', 'width'] as const, d.measuredBy),
    startTempMode: oneOf(raw['startTempMode'], ['fridge', 'room', 'custom'] as const, d.startTempMode),
    customStart_C: clampNumber(raw['customStart_C'], LIMITS.eggTemp_C, d.customStart_C),
    altitude_m: clampNumber(raw['altitude_m'], LIMITS.altitude_m, d.altitude_m),
    // Only a pan comes back. A stored 'sous', from before it stopped being
    // saved, is read as the default, because nothing recorded the pan before it.
    startMode: lastPanStart,
    afterBoil: oneOf(raw['afterBoil'], ['hold', 'off'] as const, d.afterBoil),
    cooling: oneOf(raw['cooling'], ['ice', 'tap', 'counter'] as const, d.cooling),
    waterLitres: clampNumber(raw['waterLitres'], LIMITS.waterLitres, d.waterLitres),
    eggCount: Math.round(clampNumber(raw['eggCount'], LIMITS.eggCount, d.eggCount)),
    doneness: clampNumber(raw['doneness'], LIMITS.doneness, d.doneness),
    muted: raw['muted'] === true,
    unitsChosen: readChosenUnits(raw['unitsChosen']),
    language: readLanguageState(raw['language'], LANGUAGES),
    probe: raw['probe'] === true,
    probeAsked: raw['probeAsked'] === true,
  };
}

/** Only the language, for choosing a catalogue before anything else is read:
 *  the page paints nothing until its words are in. */
export function loadLanguage(): LanguageState {
  const raw = parseObject(readStorage(SETTINGS_KEY));
  return raw === null ? FRESH_LANGUAGE : readLanguageState(raw['language'], LANGUAGES);
}

/** Sous-vide is never remembered. Its answer is a start time in the past - a
 *  58 °C bath wants most of a day - so an app that reopened on it would greet
 *  the cook by telling them they are 22 hours late, which is a bad first
 *  choice. It is still a choice for as long as the page is open; what is saved
 *  in its place is whatever pan was saved before it, cold or hot, so a reload
 *  comes back to the last pan the cook used. `loadSettings` comes first. */
export function saveSettings(settings: Settings): void {
  if (settings.startMode !== 'sous') lastPanStart = settings.startMode;
  writeStorage(SETTINGS_KEY, JSON.stringify({ ...settings, startMode: lastPanStart }));
}

/** The pan method in a stored record: cold or hot, and cold for anything else,
 *  including a 'sous' and no record at all. */
function storedPanStart(raw: Record<string, unknown> | null): StartMode {
  return oneOf(raw === null ? undefined : raw['startMode'], ['cold', 'hot'] as const, 'cold');
}

/* ----------------------------------------------------------- boil memory */

/** How the numbers combine - the blend, the nearest-volume scaling, the key -
 *  is core policy, re-exported above. What is left here is getting them in and
 *  out of localStorage, and refusing to load a value that is not a boil. */

export function loadBoilMemory(): BoilMemory {
  const raw = parseObject(readStorage(BOIL_KEY));
  const out: BoilMemory = {};
  if (raw === null) return out;
  for (const key of Object.keys(raw)) {
    const seconds = Number(raw[key]);
    if (isWithin(seconds, LIMITS.timeToBoil_s)) out[key] = seconds;
  }
  return out;
}

/** Record a measured boil and write it through. The blend itself - so that one
 *  odd run (lid off, pan half empty) does not dominate - is `rememberBoil`. */
export function rememberTimeToBoil(
  memory: BoilMemory, litres: number, seconds: number,
): BoilMemory {
  const updated = rememberBoil(memory, clampLitres(litres), seconds);
  if (updated === memory) return memory;
  writeStorage(BOIL_KEY, JSON.stringify(updated));
  return updated;
}

/** Forget every measured pan. Paired with the calibration reset: someone
 *  taking their learning back usually means the whole kitchen. */
export function clearBoilMemory(): void {
  removeStorage(BOIL_KEY);
}

function clampLitres(litres: number): number {
  return clampNumber(litres, LIMITS.waterLitres, DEFAULT_SETTINGS.waterLitres);
}

/* ------------------------------------------------------------ the cook */

/**
 * A cook in progress, so a reload does not lose the egg.
 *
 * The machine is built out of absolute epoch deadlines, so writing it down is
 * all a reload needs.
 *
 * The alarm is a timer in this tab and dies with it, so unlike iOS there is no
 * notification still counting down to contradict. What is restored is the
 * state and the ticket; whether it is still worth restoring is
 * `restoreMachine`'s business (machine.ts).
 */
interface StoredCook {
  machine: unknown;
  ticket: unknown;
  answers: KeptAnswers;
}

/** Whether the egg has been written down with an answer, as a cook keeps it
 *  (src/ui/feedback.ts): an egg answered on the page that wrote it is kept as
 *  answered before a reload, which is what it is when it is read back. */
export type KeptAnswers = 'none' | 'beforeReload';

export function saveCook(machine: unknown, ticket: unknown, answers: KeptAnswers): void {
  writeStorage(COOK_KEY, JSON.stringify({ machine: machine, ticket: ticket, answers: answers }));
}

/** The cook written down, or null. One without a known `answers` is dropped
 *  rather than read as unanswered, which would log its egg a second time. */
export function loadCook(): StoredCook | null {
  removeStorage(SUPERSEDED_COOK_KEY);
  const raw = parseObject(readStorage(COOK_KEY));
  if (raw === null) return null;
  const machine = raw['machine'];
  if (machine === null || typeof machine !== 'object') return null;
  const answers = raw['answers'];
  if (answers !== 'none' && answers !== 'beforeReload') return null;
  return {
    machine: machine,
    ticket: raw['ticket'] ?? null,
    answers: answers,
  };
}

export function clearCook(): void {
  removeStorage(COOK_KEY);
}

/** The cook as stored, for keeping aside one this build cannot read. */
export function storedCookText(): string | null {
  return readStorage(COOK_KEY);
}
