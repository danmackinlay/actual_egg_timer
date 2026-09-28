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
  Measure, Quantity, UnitSystem, effectiveUnits, measureFor, quantityText,
  regionalUnits,
} from '../core/units.js';
import { REGION, t } from './copy.js';

/** The browser's region, from `copy.ts`, where it also picks how numbers and
 *  times are written. It decides which carton's size classes to offer, which
 *  system a cook starts in, and which Imperial unit water is in. */
export { REGION };

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

