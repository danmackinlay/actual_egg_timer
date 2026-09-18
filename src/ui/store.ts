/**
 * Persistence: localStorage in, localStorage out.
 *
 * Everything here must survive localStorage being absent, disabled, full, or
 * throwing (Safari private mode throws on setItem).
 *
 * The BOUNDS and the DEFAULTS used to live here too. They now live in
 * `src/core/policy.ts`, because iOS had its own hand-copied set and the two
 * drifted - different eggs in the pan, a different default egg, preset
 * temperatures written out three times. This module still applies them; it no
 * longer decides them.
 */

import { StartMode, Cooling, HeatAfterBoil } from '../core/protocol.js';
import {
  BoilMemory, DEFAULTS, LIMITS, Limit, clamp, isWithin, rememberBoil,
} from '../core/policy.js';

export {
  BoilMemory, LIMITS, Limit, DEFAULT_TIME_TO_BOIL_S, START_TEMP_PRESETS_C,
  estimateTimeToBoil, hasBoilMemory,
} from '../core/policy.js';

const SETTINGS_KEY = 'aet.settings.v1';
const COOK_KEY = 'aet.cook.v1';
const BOIL_KEY = 'aet.boil.v1';

export type StartTempMode = 'fridge' | 'room' | 'custom';

/** The Start control offers one more option than the solver understands.
 *  'sous' never reaches core: see buildSetup in app.ts. */
export type UiStartMode = StartMode | 'sous';

export interface Settings {
  /** Index into SIZE_CLASSES, or -1 for a custom measured diameter. */
  sizeIndex: number;
  customMinor_mm: number;
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
}

/** The numbers a fresh install starts from come from core; the three settings
 *  that are purely a web-UI state - which temperature button is selected, which
 *  start mode, whether sound is off - are decided here. */
export const DEFAULT_SETTINGS: Settings = {
  sizeIndex: DEFAULTS.sizeIndex,
  customMinor_mm: DEFAULTS.customMinor_mm,
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

export function loadSettings(): Settings {
  const raw = parseObject(readStorage(SETTINGS_KEY));
  if (raw === null) return { ...DEFAULT_SETTINGS };
  const d = DEFAULT_SETTINGS;
  return {
    sizeIndex: Math.round(clampNumber(raw['sizeIndex'], LIMITS.sizeIndex, d.sizeIndex)),
    customMinor_mm: clampNumber(raw['customMinor_mm'], LIMITS.minor_mm, d.customMinor_mm),
    startTempMode: oneOf(raw['startTempMode'], ['fridge', 'room', 'custom'] as const, d.startTempMode),
    customStart_C: clampNumber(raw['customStart_C'], LIMITS.eggTemp_C, d.customStart_C),
    altitude_m: clampNumber(raw['altitude_m'], LIMITS.altitude_m, d.altitude_m),
    startMode: oneOf(raw['startMode'], ['cold', 'hot', 'sous'] as const, d.startMode),
    afterBoil: oneOf(raw['afterBoil'], ['hold', 'off'] as const, d.afterBoil),
    cooling: oneOf(raw['cooling'], ['ice', 'tap', 'counter'] as const, d.cooling),
    waterLitres: clampNumber(raw['waterLitres'], LIMITS.waterLitres, d.waterLitres),
    eggCount: Math.round(clampNumber(raw['eggCount'], LIMITS.eggCount, d.eggCount)),
    doneness: clampNumber(raw['doneness'], LIMITS.doneness, d.doneness),
    muted: raw['muted'] === true,
  };
}

export function saveSettings(settings: Settings): void {
  writeStorage(SETTINGS_KEY, JSON.stringify(settings));
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
 * The machine is already built out of absolute epoch deadlines - that is what
 * its own header means by surviving a reload - but nothing was writing it
 * down, so boot() started clean every time. The comment there promised the app
 * would "say so"; it said nothing at all.
 *
 * The alarm is a timer in this tab and dies with it, so unlike iOS there is no
 * notification still counting down to contradict. What is restored is the
 * state and the ticket; whether it is still worth restoring is
 * `isStaleCook`'s business.
 */
export interface StoredCook {
  machine: unknown;
  ticket: unknown;
  feedbackGiven: boolean;
}

export function saveCook(machine: unknown, ticket: unknown, feedbackGiven: boolean): void {
  writeStorage(COOK_KEY, JSON.stringify({
    machine: machine, ticket: ticket, feedbackGiven: feedbackGiven,
  }));
}

export function loadCook(): StoredCook | null {
  const raw = parseObject(readStorage(COOK_KEY));
  if (raw === null) return null;
  const machine = raw['machine'];
  if (machine === null || typeof machine !== 'object') return null;
  return {
    machine: machine,
    ticket: raw['ticket'] ?? null,
    feedbackGiven: raw['feedbackGiven'] === true,
  };
}

export function clearCook(): void {
  removeStorage(COOK_KEY);
}
