/**
 * Water boiling point from altitude or barometric pressure.
 *
 * Chain: ISA barometric formula (altitude -> pressure) then the Antoine
 * equation inverted (pressure -> boiling temperature).
 */

/** International Standard Atmosphere, troposphere (-500 m to 11000 m).
 *  P = P0 * (1 - L*h/T0)^(g*M/(R*L))
 *  The exponents are derived, not fitted: 2.25577e-5 = L/T0 = 0.0065/288.15,
 *  and 5.25588 = g*M/(R*L). Returns Pa. */
export function pressureAtAltitude(altitude_m: number): number {
  const h = altitude_m < -500.0 ? -500.0 : altitude_m > 11000.0 ? 11000.0 : altitude_m;
  return 101325.0 * Math.pow(1.0 - 2.25577e-5 * h, 5.25588);
}

/** Antoine equation for water, Stull (1947), 1-100 C range, inverted for
 *  temperature. Constants are for P in mmHg, T in C:
 *    log10(P_mmHg) = A - B/(C + T)
 *  Round-trips 101325 Pa -> 100.00 C to within 0.01 C.
 *  Accurate to ~0.02 C over 60-101 kPa, which covers 0-4500 m. */
export function boilingPointAtPressure(pressure_Pa: number): number {
  const A = 8.07131;
  const B = 1730.63;
  const C = 233.426;
  const mmHg = pressure_Pa / 133.322;
  return B / (A - Math.log10(mmHg)) - C;
}

/** Boiling point of water at a given altitude, in C. */
export function boilingPointAtAltitude(altitude_m: number): number {
  return boilingPointAtPressure(pressureAtAltitude(altitude_m));
}

/** The engineering one-liner, kept for documentation and cross-checking.
 *  Accurate to better than 0.03 C from 0 to 5000 m - pressure falls roughly
 *  exponentially while dT/dP rises as P falls, and the two nearly cancel.
 *  (The widely repeated "1 C per 285 m" rule is about 5% too steep.) */
export function boilingPointApprox(altitude_m: number): number {
  return 100.0 - altitude_m / 300.0;
}

/** Boiling-point elevation from dissolved salt, C.
 *  dT = i * Kb * molality, with Kb = 0.512 K kg/mol and i ~ 1.9 for NaCl.
 *  Included for completeness: a full tablespoon per litre is only +0.3 C,
 *  well inside the weather-driven variation, so the app ignores it. */
export function saltBoilingElevation(gramsSaltPerLitre: number): number {
  const molality = gramsSaltPerLitre / 58.44;
  return 1.9 * 0.512 * molality;
}
