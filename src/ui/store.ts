/**
 * Persistence, and the bounds on what can be typed.
 *
 * Everything here must survive localStorage being absent, disabled, full, or
 * throwing (Safari private mode throws on setItem).
 */

import { T_ROOM_C } from '../core/constants.js';
import { SIZE_CLASSES } from '../core/geometry.js';
import { StartMode, Cooling, HeatAfterBoil } from '../core/protocol.js';

const SETTINGS_KEY = 'aet.settings.v1';
const BOIL_KEY = 'aet.boil.v1';

export type StartTempMode = 'fridge' | 'room' | 'custom';

/** What the two named egg-temperature buttons mean, C. Their labels are
 *  rendered from this, so the button cannot say one thing and the model
 *  another. */
export const START_TEMP_PRESETS_C: Record<'fridge' | 'room', number> = {
  fridge: 4,
  room: T_ROOM_C,
};

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

export const DEFAULT_SETTINGS: Settings = {
  sizeIndex: 2,
  customMinor_mm: 44,
  startTempMode: 'fridge',
  customStart_C: 12,
  altitude_m: 0,
  startMode: 'cold',
  afterBoil: 'hold',
  cooling: 'ice',
  waterLitres: 2,
  eggCount: 2,
  doneness: 0.41,
  muted: false,
};

/** Inclusive bounds on a number. */
export interface Limit {
  lo: number;
  hi: number;
}

/** Bounds on every number the user can type, in one place. They go onto the
 *  input elements, onto what is typed, and onto what comes back out of
 *  storage, so the three cannot drift apart. */
export const LIMITS = {
  mass_g: { lo: 25, hi: 120 },
  girth_mm: { lo: 90, hi: 200 },
  minor_mm: { lo: 30, hi: 60 },
  eggTemp_C: { lo: -2, hi: 40 },
  altitude_m: { lo: -400, hi: 5000 },
  waterLitres: { lo: 0.25, hi: 12 },
  eggCount: { lo: 1, hi: 24 },
  doneness: { lo: 0, hi: 1 },
  sizeIndex: { lo: -1, hi: SIZE_CLASSES.length - 1 },
  /** A tap under half a minute is a double tap, not a boil; over two hours is
   *  a tab left open. */
  timeToBoil_s: { lo: 30, hi: 7200 },
};

/** Remembered time to a rolling boil, seconds, keyed by water volume in
 *  litres (one decimal place). Same pan, same hob, same answer next time. */
export type BoilMemory = Record<string, number>;

/** Fallback when nothing has ever been measured. */
export const DEFAULT_TIME_TO_BOIL_S = 480;

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
  if (n < limit.lo) return limit.lo;
  if (n > limit.hi) return limit.hi;
  return n;
}

function isWithin(value: number, limit: Limit): boolean {
  return Number.isFinite(value) && value >= limit.lo && value <= limit.hi;
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

function volumeKey(litres: number): string {
  return clampNumber(litres, LIMITS.waterLitres, DEFAULT_SETTINGS.waterLitres).toFixed(1);
}

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

/** Record a measured boil, blended with whatever was already known for this
 *  volume so one odd run (lid off, pan half empty) does not dominate. Returns
 *  the updated memory, which is also written through. */
export function rememberTimeToBoil(
  memory: BoilMemory, litres: number, seconds: number,
): BoilMemory {
  if (!isWithin(seconds, LIMITS.timeToBoil_s)) return memory;
  const key = volumeKey(litres);
  const previous = memory[key];
  const updated: BoilMemory = { ...memory };
  updated[key] = previous === undefined ? seconds : 0.5 * previous + 0.5 * seconds;
  writeStorage(BOIL_KEY, JSON.stringify(updated));
  return updated;
}

/** Best guess at the time to a rolling boil for this volume: the exact
 *  remembered value, else the nearest remembered volume scaled by litres
 *  (energy is roughly proportional to mass), else the default. */
export function estimateTimeToBoil(memory: BoilMemory, litres: number): number {
  const key = volumeKey(litres);
  const exact = memory[key];
  if (exact !== undefined) return exact;

  let bestKey = '';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of Object.keys(memory)) {
    const distance = Math.abs(Number(candidate) - litres);
    if (Number.isFinite(distance) && distance < bestDistance) {
      bestDistance = distance;
      bestKey = candidate;
    }
  }
  if (bestKey === '') return DEFAULT_TIME_TO_BOIL_S;

  const nearLitres = Number(bestKey);
  const nearSeconds = memory[bestKey];
  if (nearSeconds === undefined || !(nearLitres > 0)) return DEFAULT_TIME_TO_BOIL_S;
  return clampNumber(nearSeconds * (litres / nearLitres), LIMITS.timeToBoil_s, DEFAULT_TIME_TO_BOIL_S);
}

/** True when the estimate is a real measurement rather than the default. */
export function hasBoilMemory(memory: BoilMemory): boolean {
  return Object.keys(memory).length > 0;
}
