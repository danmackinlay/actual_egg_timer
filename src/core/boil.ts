/**
 * Boil memory: the time to a rolling boil each volume of water took, kept
 * so that the same pan on the same hob gets the same answer next time, and
 * the best guess for a volume never measured. Storage is each app's; how the
 * numbers combine is decided here.
 *
 * Pure, like the rest of `src/core/`: no storage, no DOM, no clock.
 */

import { LIMITS, clamp, isWithin } from './inputs.js';

/** Fallback when no pan has ever been measured, s. */
export const DEFAULT_TIME_TO_BOIL_S = 480;

/** Remembered time to a rolling boil, seconds, keyed by water volume in litres
 *  to one decimal place. */
export type BoilMemory = Record<string, number>;

export function volumeKey(litres: number): string {
  return litres.toFixed(1);
}

/** Blend a new measurement with what was already known for this volume, so one
 *  odd run does not dominate. Returns the memory unchanged when the
 *  measurement is not credible. */
export function rememberBoil(memory: BoilMemory, litres: number, seconds: number): BoilMemory {
  if (!isWithin(seconds, LIMITS.timeToBoil_s)) return memory;
  const key = volumeKey(litres);
  const previous = memory[key];
  const updated: BoilMemory = { ...memory };
  updated[key] = previous === undefined ? seconds : 0.5 * previous + 0.5 * seconds;
  return updated;
}

/**
 * Best guess at the time to a rolling boil for this volume: the exact
 * remembered value, else the nearest remembered volume scaled by litres
 * (energy is roughly proportional to mass), else the default.
 *
 * The nearest volume is found over SORTED keys, and ties go to the smaller
 * volume. That is not fussiness: the web iterated insertion order and Swift
 * iterated a Dictionary's arbitrary order, so two equidistant pans could give
 * the two apps different answers.
 */
export function estimateTimeToBoil(memory: BoilMemory, litres: number): number {
  const exact = memory[volumeKey(litres)];
  if (exact !== undefined) return exact;

  const keys = Object.keys(memory).sort((a, b) => Number(a) - Number(b));
  let bestLitres = 0;
  let bestSeconds = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < keys.length; i++) {
    const candidate = Number(keys[i]);
    const seconds = memory[keys[i]];
    if (!Number.isFinite(candidate) || !(candidate > 0)) continue;
    const distance = Math.abs(candidate - litres);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestLitres = candidate;
      bestSeconds = seconds;
    }
  }
  if (!(bestLitres > 0)) return DEFAULT_TIME_TO_BOIL_S;
  return clamp(bestSeconds * (litres / bestLitres), LIMITS.timeToBoil_s);
}

export function hasBoilMemory(memory: BoilMemory): boolean {
  return Object.keys(memory).length > 0;
}
