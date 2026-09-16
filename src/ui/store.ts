/**
 * Persistence. Everything here must survive localStorage being absent,
 * disabled, full, or throwing (Safari private mode throws on setItem).
 */

import { StartMode, Cooling, HeatAfterBoil } from '../core/protocol.js';

const SETTINGS_KEY = 'aet.settings.v1';
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
};

/** Remembered time to a rolling boil, seconds, keyed by water volume in
 *  litres (one decimal place). Same pan, same hob, same answer next time. */
export type BoilMemory = Record<string, number>;

/** Fallback when nothing has ever been measured. */
export const DEFAULT_TIME_TO_BOIL_S = 480;

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
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

/** Clamp to a finite number in range, falling back when given junk or NaN.
 *  Nothing from an input element or from storage reaches the solver without
 *  passing through here. */
export function clampNumber(value: unknown, lo: number, hi: number, fallback: number): number {
  // An empty or blank field is "not yet typed", not zero: Number('') is 0,
  // which would silently clamp to the minimum while the user is mid-edit.
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  for (let i = 0; i < allowed.length; i += 1) {
    if (value === allowed[i]) return allowed[i];
  }
  return fallback;
}

export function loadSettings(): Settings {
  const raw = parseObject(readRaw(SETTINGS_KEY));
  if (raw === null) return { ...DEFAULT_SETTINGS };
  return {
    sizeIndex: Math.round(clampNumber(raw['sizeIndex'], -1, 32, DEFAULT_SETTINGS.sizeIndex)),
    customMinor_mm: clampNumber(raw['customMinor_mm'], 30, 60, DEFAULT_SETTINGS.customMinor_mm),
    startTempMode: oneOf(raw['startTempMode'], ['fridge', 'room', 'custom'] as const, 'fridge'),
    customStart_C: clampNumber(raw['customStart_C'], -2, 40, DEFAULT_SETTINGS.customStart_C),
    altitude_m: clampNumber(raw['altitude_m'], -400, 5000, 0),
    startMode: oneOf(raw['startMode'], ['cold', 'hot', 'sous'] as const, 'cold'),
    afterBoil: oneOf(raw['afterBoil'], ['hold', 'off'] as const, 'hold'),
    cooling: oneOf(raw['cooling'], ['ice', 'tap', 'counter'] as const, 'ice'),
    waterLitres: clampNumber(raw['waterLitres'], 0.25, 12, DEFAULT_SETTINGS.waterLitres),
    eggCount: Math.round(clampNumber(raw['eggCount'], 1, 24, DEFAULT_SETTINGS.eggCount)),
    doneness: clampNumber(raw['doneness'], 0, 1, DEFAULT_SETTINGS.doneness),
  };
}

export function saveSettings(settings: Settings): void {
  writeRaw(SETTINGS_KEY, JSON.stringify(settings));
}

function volumeKey(litres: number): string {
  return clampNumber(litres, 0.25, 12, 2).toFixed(1);
}

export function loadBoilMemory(): BoilMemory {
  const raw = parseObject(readRaw(BOIL_KEY));
  const out: BoilMemory = {};
  if (raw === null) return out;
  for (const key of Object.keys(raw)) {
    const seconds = Number(raw[key]);
    if (Number.isFinite(seconds) && seconds > 10 && seconds < 7200) out[key] = seconds;
  }
  return out;
}

/** Record a measured boil, blended with whatever we already knew for this
 *  volume so one odd run (lid off, pan half empty) does not dominate. */
export function rememberTimeToBoil(litres: number, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 10 || seconds > 7200) return;
  const memory = loadBoilMemory();
  const key = volumeKey(litres);
  const previous = memory[key];
  memory[key] = previous === undefined ? seconds : 0.5 * previous + 0.5 * seconds;
  writeRaw(BOIL_KEY, JSON.stringify(memory));
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
  return clampNumber(nearSeconds * (litres / nearLitres), 30, 7200, DEFAULT_TIME_TO_BOIL_S);
}

/** True when the estimate is a real measurement rather than the default. */
export function hasBoilMemory(memory: BoilMemory): boolean {
  return Object.keys(memory).length > 0;
}
