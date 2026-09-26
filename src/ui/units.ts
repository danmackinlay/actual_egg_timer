/**
 * The web app's units: which system is on screen, and the two calls every
 * number with a unit goes through - `measure` for an input, `show` for a
 * readout.
 *
 * The rules - conversions, steps, bounds, the round trip, the regional
 * default - are `src/core/units.ts`, held to the iOS app by
 * `fixtures/units.json`. What is left here is the platform's half: the region
 * the browser reports, which system the cook is in right now, and the event a
 * cook's own switch raises.
 */

import {
  Measure, Quantity, UnitSystem, UnitsFlip, effectiveUnits, measureFor, quantityText,
  regionalUnits,
} from '../core/units.js';
import { t } from './copy.js';

/** The region in the browser's language tag - the `US` in `en-US` - or null
 *  when the tag names none. It decides which carton's size classes to offer,
 *  which system a cook starts in, and which Imperial unit water is in. */
function browserRegion(): string | null {
  try {
    return new Intl.Locale(navigator.language).region ?? null;
  } catch {
    return null;
  }
}

/** Fixed for the life of the page. */
export const REGION = browserRegion();

/** The system this region starts in: Imperial in the US, metric everywhere
 *  else. A browser reports no measurement system and no temperature
 *  preference, so the region is all there is. */
export const REGIONAL_UNITS: UnitSystem = regionalUnits({ region: REGION });

let system: UnitSystem = REGIONAL_UNITS;

/** Put the cook's stored choice, or the lack of one, on screen. */
export function useUnits(chosen: UnitSystem | null): void {
  system = effectiveUnits(chosen, REGIONAL_UNITS);
}

export function unitSystem(): UnitSystem {
  return system;
}

/** One quantity in the system on screen. */
export function measure(q: Quantity): Measure {
  return measureFor(q, system, REGION);
}

/** A value stored in SI, as the cook reads it: "4 °C", "39 °F", "2.4 oz". */
export function show(q: Quantity, si: number): string {
  const text = quantityText(measure(q), si);
  return t(text.key, { value: text.value });
}

/**
 * The event a cook's own switch of system raises on `document`, with
 * `detail.flip` saying which way. A regional default never raises it, and
 * neither does choosing the system already on screen.
 *
 * Nothing listens yet. It is the hook F6 needs: an English UI switched from
 * metric to Imperial goes into the English of 1750 (LANGUAGE.md §6).
 */
export const UNITS_FLIP_EVENT = 'aet:unitsflip';

export interface UnitsFlipDetail {
  flip: UnitsFlip;
}

export function announceFlip(flip: UnitsFlip): void {
  document.dispatchEvent(new CustomEvent<UnitsFlipDetail>(UNITS_FLIP_EVENT, { detail: { flip: flip } }));
}
