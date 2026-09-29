/**
 * The water temperature schedule the egg's surface actually sees, across every
 * phase of the cook: pan ramp, boil, and cooling.
 */

import {
  RAMP_R, TAU_AIR, T_ICE_BATH_C, T_COLD_TAP_C,
  TAU_DIP_RECOVERY, TAU_STANDING_SCALE, TAU_STANDING_REF_S, STANDING_REF_LITRES,
  STANDING_VOLUME_EXPONENT, C_WATER, C_EGG, TAU_PLUNGE,
} from './constants.js';
import { Egg } from './geometry.js';

/** Cold start: eggs go in the cold pan and heat with the water. Hot start:
 *  eggs are lowered into water already boiling - peels far better, and the
 *  ramp becomes irrelevant. */
export type StartMode = 'cold' | 'hot';

/** What happens after the egg comes out. This is not a detail: it changes the
 *  peak yolk temperature by ~20 C. */
export type Cooling = 'ice' | 'tap' | 'counter';

/** What happens to the burner once the water boils. 'hold' keeps the water at
 *  its boiling point, which is what every recipe silently assumes. 'off' is the
 *  standing method - cover the pan, kill the heat, and let a falling water
 *  temperature finish the egg. */
export type HeatAfterBoil = 'hold' | 'off';

export interface CookSetup {
  startMode: StartMode;
  /** Egg temperature when it goes in, C (fridge ~4, room ~20). */
  eggStart_C: number;
  /** Room air temperature, C. The pan starts here on a cold start, the water
   *  decays toward it with the heat off, and an egg resting on the counter
   *  cools toward it. One room, one number. */
  ambient_C: number;
  /** Boiling point at the user's altitude, C. */
  boiling_C: number;
  /** Measured time for the pan to reach a full rolling boil, s. On a cold
   *  start it is how long the ramp lasts, and that is all it is used for. A hot
   *  start carries the remembered value (the record says where it came from)
   *  but nothing in the physics reads it. It used to set the heat-off pan's
   *  loss time constant too; that measured the hob, not the pan, and now comes
   *  from the water volume (see panTimeConstant). */
  timeToBoil_s: number;
  cooling: Cooling;
  /** Water volume, litres. Sets how far the water dips when eggs go in, and -
   *  with the heat off - how long the pan holds its temperature
   *  (see panTimeConstant). */
  waterLitres: number;
  /** Burner after the boil. Omitted means 'hold', which is what every recipe
   *  assumes without saying so. */
  afterBoil?: HeatAfterBoil;
  eggCount: number;
}

/* The egg's MASS is not here. It was, and it duplicated `Egg.mass_kg` - so
 * `simulate(egg, setup, ...)` took the same number twice and every caller had
 * to keep the two in step by hand. `tools/validate.ts` had to remember an
 * override in its size sweep or it would silently have modelled four different
 * eggs against one fixed water dip. The setup is the POT; the egg is the egg. */

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
function rampTemperature(
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
function dipMagnitude(egg: Egg, setup: CookSetup): number {
  const waterCapacity = setup.waterLitres * C_WATER;
  const eggCapacity = setup.eggCount * egg.mass_kg * C_EGG;
  const total = waterCapacity + eggCapacity;
  if (total <= 0.0) return 0.0;
  return eggCapacity * (setup.boiling_C - setup.eggStart_C) / total;
}

/**
 * The pan's Newtonian loss time constant with the heat off and the lid on,
 * seconds, from the water volume alone:
 *
 *   tau(V) = TAU_STANDING_SCALE * TAU_STANDING_REF_S * (V / 2 L)^(1/3)
 *
 * tau = m*c/(U*A): the heat held goes as the volume, the surface it leaks
 * through as V^(2/3) for similar-shaped pans. The reference is pinned so that
 * Williams' 17-minute method in 2 L is exactly what it was.
 *
 * It used to be the time to boil over ln(r/(r-1)). That is the same tau only
 * if the hob's overshoot ratio r is known, and r is the HOB, not the pan: a
 * strong hob read as a pan that cooled about 2.2 times too fast. It also meant
 * a hot start, which never times the boil, cooled at the rate of whatever pan
 * was remembered. Neither is true of this one; the time to boil now shapes the
 * cold-start ramp and nothing else. See constants.ts for what is judgement.
 */
export function panTimeConstant(waterLitres: number): number {
  if (!(waterLitres > 0.0)) return 0.0;
  return TAU_STANDING_SCALE * TAU_STANDING_REF_S
    * Math.pow(waterLitres / STANDING_REF_LITRES, STANDING_VOLUME_EXPONENT);
}

/**
 * Water temperature once the heat is off: Newtonian cooling of the pan toward
 * the room, starting from `from_C`.
 *
 * Nothing else in the cook phase changes. The modal solver is driven by an
 * arbitrary piecewise-linear surface temperature, so a falling bath costs no
 * more than a constant one - the egg simply sees a schedule that runs out of
 * heat instead of one that does not.
 */
function standingTemperature(
  elapsedSinceOff_s: number, from_C: number, ambient_C: number, waterLitres: number,
): number {
  const tau = panTimeConstant(waterLitres);
  if (!(tau > 0.0)) return from_C;
  return ambient_C + (from_C - ambient_C) * Math.exp(-elapsedSinceOff_s / tau);
}

/** What the egg cools in, C: the ice bath, the tap's water, or on the counter
 *  the room. Mains water is NOT room temperature: it arrives at something
 *  closer to ground temperature, usually below the room and occasionally - a
 *  long run of pipe in a hot summer - well above it, so it has its own
 *  constant. */
export function coolingMedium_C(cooling: Cooling, ambient_C: number): number {
  return cooling === 'ice' ? T_ICE_BATH_C : cooling === 'tap' ? T_COLD_TAP_C : ambient_C;
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
  setup: CookSetup, elapsedSincePull_s: number,
  waterAtPull_C: number, meanAtPull_C: number, tauAirScale: number,
): number {
  const target = setup.cooling === 'counter'
    ? setup.ambient_C + (meanAtPull_C - setup.ambient_C) * Math.exp(-elapsedSincePull_s / (TAU_AIR * tauAirScale))
    : coolingMedium_C(setup.cooling, setup.ambient_C);
  // Blend out of the water temperature rather than jumping, so the surface is
  // continuous at the moment of pulling. See TAU_PLUNGE.
  return target + (waterAtPull_C - target) * Math.exp(-elapsedSincePull_s / TAU_PLUNGE);
}

/**
 * Water temperature while the egg is still in the pan, at time t_s after it
 * went in. This is the whole in-water schedule - ramp, boil, dip, and with the
 * heat off the pan cooling toward the room. What happens after the pull is
 * coolingTemperature's business, and the two never need each other's inputs.
 */
export function bathTemperature(egg: Egg, setup: CookSetup, t_s: number): number {
  const standing = setup.afterBoil === 'off';
  if (setup.startMode === 'cold') {
    if (t_s < setup.timeToBoil_s) {
      return rampTemperature(t_s, setup.timeToBoil_s, setup.ambient_C, setup.boiling_C);
    }
    if (!standing) return setup.boiling_C;
    return standingTemperature(
      t_s - setup.timeToBoil_s, setup.boiling_C, setup.ambient_C, setup.waterLitres,
    );
  }
  // Hot start: the water is already boiling but dips when the eggs go in.
  const dip = dipMagnitude(egg, setup);
  // With the burner on it pulls the dip back over roughly a minute. With the
  // burner off nothing pulls it back: the dip is permanent, and the water falls
  // from there. This is why the standing method is so much more sensitive to
  // pan size than a boiling one - the same eggs take a bite out of the only
  // heat left in the room.
  if (!standing) return setup.boiling_C - dip * Math.exp(-t_s / TAU_DIP_RECOVERY);
  return standingTemperature(t_s, setup.boiling_C - dip, setup.ambient_C, setup.waterLitres);
}

/** Water temperature at the moment the egg goes in - the sphere's initial
 *  surface condition. */
export function initialSurfaceTemperature(egg: Egg, setup: CookSetup): number {
  return bathTemperature(egg, setup, 0.0);
}
