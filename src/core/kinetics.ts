/**
 * Doneness as accumulated thermal dose, not peak temperature.
 *
 * Protein denaturation is an irreversible first-order process with a very
 * large activation energy (Ea ~ 470 kJ/mol for yolk gelation, Vega &
 * Mercade-Prieto 2011). Converting to a decimal-reduction slope,
 *
 *   z = ln(10) * R_gas * T^2 / Ea
 *
 * gives z ~ 4.65 K for yolk: +4.7 C makes it TEN TIMES faster. Cooking is not
 * isothermal, and the egg keeps cooking after it leaves the water, so the
 * honest criterion is the integral
 *
 *   Phi(t) = integral of 10^((T(tau) - Tref)/z) dtau
 *
 * read as "equivalent minutes at Tref". A peak-temperature threshold gets the
 * ranking roughly right because z is so small, but the integral is ~5 lines
 * and handles carryover correctly, which a threshold cannot.
 *
 * WARNING: the standard food-engineering cook value C100 uses z = 33.1 K.
 * That is 7x too shallow for egg protein and will give badly wrong answers.
 */

export interface Dose {
  z_K: number;
  tref_C: number;
  /** Accumulated equivalent minutes at tref_C. */
  minutes: number;
}

export function createDose(z_K: number, tref_C: number): Dose {
  return { z_K: z_K, tref_C: tref_C, minutes: 0.0 };
}

/** Accumulate dt seconds at temperature_C. Mutates `d`. */
export function accumulateDose(d: Dose, temperature_C: number, dt_s: number): void {
  d.minutes += Math.pow(10.0, (temperature_C - d.tref_C) / d.z_K) * dt_s / 60.0;
}

/** Equivalent minutes at tref needed to reach the same dose at a held
 *  temperature. Useful for expressing a dose target as a sous-vide time. */
export function holdTimeForDose(d: Dose, doseMinutes: number, held_C: number): number {
  return doseMinutes / Math.pow(10.0, (held_C - d.tref_C) / d.z_K);
}

/** Convert an activation energy in J/mol to a z-value in K at temperature T.
 *  Documents where Z_YOLK and Z_WHITE come from. */
export function zFromActivationEnergy(ea_Jmol: number, temperature_K: number): number {
  const R_GAS = 8.314;
  return Math.LN10 * R_GAS * temperature_K * temperature_K / ea_Jmol;
}
