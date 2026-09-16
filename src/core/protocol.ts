/**
 * The water temperature schedule the egg's surface actually sees, across every
 * phase of the cook: pan ramp, boil, and cooling.
 */

import {
  RAMP_R, TAU_AIR, T_ICE_BATH_C, T_COLD_TAP_C, T_ROOM_C,
  TAU_DIP_RECOVERY, C_WATER, C_EGG, TAU_PLUNGE,
} from './constants.js';

/** Cold start: eggs go in the cold pan and heat with the water. Hot start:
 *  eggs are lowered into water already boiling - peels far better, and the
 *  ramp becomes irrelevant. */
export type StartMode = 'cold' | 'hot';

/** What happens after the egg comes out. This is not a detail: it changes the
 *  peak yolk temperature by ~20 C. */
export type Cooling = 'ice' | 'tap' | 'counter';

export interface CookSetup {
  startMode: StartMode;
  /** Egg temperature when it goes in, C (fridge ~4, room ~20). */
  eggStart_C: number;
  /** Room air temperature, C - the pan starts here on a cold start. */
  ambient_C: number;
  /** Boiling point at the user's altitude, C. */
  boiling_C: number;
  /** Measured time for the pan to reach a full rolling boil, s. Cold start only. */
  timeToBoil_s: number;
  cooling: Cooling;
  /** Water volume, litres - sets how far the water dips when eggs go in. */
  waterLitres: number;
  eggCount: number;
  eggMass_kg: number;
}

/**
 * Pan heating ramp. Constant power into a lumped water mass with Newtonian
 * losses gives an exponential approach to a steady state the pan never
 * reaches, because boiling clamps it:
 *
 *   T(t) = Tamb + r*(Tboil - Tamb)*(1 - exp(-t/tau))
 *
 * The overshoot ratio r = P/(U*dT) has a directly observable meaning: 1/r is
 * the fraction of full burner power needed to HOLD a boil, which measured
 * cooktop studies put near 1/3. One user measurement (time to boil) plus that
 * one shape constant determines the whole curve:
 *
 *   tau = t_boil / ln(r/(r-1))
 *
 * A linear ramp is the r -> infinity limit; at r = 3 the two differ by about
 * 4 C at the midpoint, worth ~30 s of cook time on a 10-minute ramp.
 */
export function rampTemperature(
  t_s: number, timeToBoil_s: number, ambient_C: number, boiling_C: number,
): number {
  if (t_s >= timeToBoil_s) return boiling_C;
  const tau = timeToBoil_s / Math.log(RAMP_R / (RAMP_R - 1.0));
  const t = ambient_C + RAMP_R * (boiling_C - ambient_C) * (1.0 - Math.exp(-t_s / tau));
  return t > boiling_C ? boiling_C : t;
}

/**
 * How far the water temperature drops when cold eggs are dropped into boiling
 * water, C. Straight energy balance over water + eggs. Four 60 g fridge eggs
 * into 2 L drops it ~8 C; into 1 L, ~14 C. Worth modelling - it is why the
 * same recipe fails in a small pan.
 */
export function dipMagnitude(setup: CookSetup): number {
  const waterCapacity = setup.waterLitres * C_WATER;
  const eggCapacity = setup.eggCount * setup.eggMass_kg * C_EGG;
  const total = waterCapacity + eggCapacity;
  if (total <= 0.0) return 0.0;
  return eggCapacity * (setup.boiling_C - setup.eggStart_C) / total;
}

/**
 * Surface temperature during cooling.
 *
 * Ice water and a cold tap are effectively Dirichlet - the surface goes to the
 * bath temperature and stays there. Still air is not: the egg is nearly lumped
 * (Bi ~ 0.4) and cools with a time constant of ~34 minutes, which is about 7x
 * SLOWER than it equilibrates internally (~4.5 min). So a rested egg carries
 * over almost adiabatically, and its surface tracks its own bulk temperature
 * decaying toward the room.
 *
 * `startFrom_C` is the egg's VOLUME-AVERAGE temperature at the moment it left
 * the water, not the water temperature. A lumped body relaxes from its own
 * bulk temperature; using the water's would keep a briefly-cooked egg near
 * boiling in open air, which is badly wrong for short cooks.
 *
 * `tauAirScale` is a calibration multiplier on that decay - this is the
 * least-verified part of the model, so it is learned rather than asserted.
 */
export function coolingTemperature(
  cooling: Cooling, elapsedSincePull_s: number,
  waterAtPull_C: number, meanAtPull_C: number, tauAirScale: number,
): number {
  let target: number;
  if (cooling === 'ice') {
    target = T_ICE_BATH_C;
  } else if (cooling === 'tap') {
    target = T_COLD_TAP_C;
  } else {
    const tau = TAU_AIR * tauAirScale;
    target = T_ROOM_C + (meanAtPull_C - T_ROOM_C) * Math.exp(-elapsedSincePull_s / tau);
  }
  // Blend out of the water temperature rather than jumping, so the surface is
  // continuous at the moment of pulling. See TAU_PLUNGE.
  return target + (waterAtPull_C - target) * Math.exp(-elapsedSincePull_s / TAU_PLUNGE);
}

/**
 * The full schedule: surface temperature at time t_s, where t = 0 is when the
 * egg enters the pan and `cookEnd_s` is when it comes out.
 */
export function surfaceTemperature(
  setup: CookSetup, t_s: number, cookEnd_s: number, tauAirScale: number,
  meanAtPull_C: number, waterAtPull_C: number,
): number {
  if (t_s >= cookEnd_s) {
    return coolingTemperature(
      setup.cooling, t_s - cookEnd_s, waterAtPull_C, meanAtPull_C, tauAirScale,
    );
  }
  if (setup.startMode === 'cold') {
    return rampTemperature(t_s, setup.timeToBoil_s, setup.ambient_C, setup.boiling_C);
  }
  // Hot start: the water is already boiling but dips when the eggs go in, then
  // the burner pulls it back over roughly a minute.
  const dip = dipMagnitude(setup);
  return setup.boiling_C - dip * Math.exp(-t_s / TAU_DIP_RECOVERY);
}

/** Water temperature at the moment the egg goes in - the sphere's initial
 *  surface condition. */
export function initialSurfaceTemperature(setup: CookSetup): number {
  return surfaceTemperature(setup, 0.0, Number.POSITIVE_INFINITY, 1.0, 0.0, 0.0);
}
