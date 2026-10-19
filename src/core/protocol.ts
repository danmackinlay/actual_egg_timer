/**
 * The water temperature schedule the egg's surface actually sees, across every
 * phase of the cook: pan ramp, boil, and cooling.
 */

import {
  RAMP_R, H_AIR, WET_SHELL_KG_M2, LATENT_HEAT_WATER, T_ICE_BATH_C, T_COLD_TAP_C,
  TAU_DIP_RECOVERY, TAU_STANDING_SCALE, TAU_STANDING_REF_S, STANDING_REF_LITRES,
  STANDING_VOLUME_EXPONENT, C_WATER, C_EGG, TAU_PLUNGE, CARRYOVER_WINDOW, EGG_CUP_OPENED_S,
} from './constants.ts';
import type { Egg } from './geometry.ts';
import { type SphereState, meanTemperature, robinSurface } from './sphere.ts';

/** Cold start: eggs go in the cold pan and heat with the water. Hot start:
 *  eggs are lowered into water already boiling - peels far better, and the
 *  ramp becomes irrelevant. */
export type StartMode = 'cold' | 'hot';

/** What happens after the egg comes out. This is not a detail: it changes the
 *  peak yolk temperature by ~20 C. 'bowl' is a bowl of still water the eggs
 *  are put into and left in, which they warm (`bowlTemperature`). 'counter'
 *  is the egg left whole in the air until it is cool; 'eggCup' is the same
 *  egg in the air, eaten warm from an egg cup, opened EGG_CUP_OPENED_S after
 *  the pull (`carryoverWindow_s`). */
export type Cooling = 'ice' | 'tap' | 'bowl' | 'counter' | 'eggCup';

/** Whether the egg rests in the air after the pull, on the counter or in an
 *  egg cup: its shell cools by Newton's law (`coolingTemperature`). The
 *  physics' question; whether the cook waits for an end is `countsDown`. */
export function restsInAir(cooling: Cooling): boolean {
  return cooling === 'counter' || cooling === 'eggCup';
}

/** Whether the cook's flow counts down from the pull to an end: a cooling in
 *  water to the yolk's peak, and an egg cup to its opening, EGG_CUP_OPENED_S
 *  after the pull (`countedCooling_s` in running.ts). Not the counter, whose
 *  egg is left until it is cool: nothing ends there on its own, and Done
 *  comes at the pull. */
export function countsDown(cooling: Cooling): boolean {
  return cooling !== 'counter';
}

/** How long after the pull the doses count, s: the whole carryover
 *  (CARRYOVER_WINDOW), or until an egg cup is opened (EGG_CUP_OPENED_S), when
 *  the yolk starts to be eaten and what it reaches after is not what the cook
 *  tastes. */
export function carryoverWindow_s(cooling: Cooling): number {
  return cooling === 'eggCup' ? EGG_CUP_OPENED_S : CARRYOVER_WINDOW;
}

/** What happens to the burner once the water boils. 'hold' keeps the water at
 *  its boiling point, which is what every recipe silently assumes. 'off' is the
 *  standing method - cover the pan, kill the heat, and let a falling water
 *  temperature finish the egg. */
export type HeatAfterBoil = 'hold' | 'off';

export interface CookSetup {
  startMode: StartMode;
  /** Egg temperature when it goes in, C (fridge ~4, room ~20). */
  eggStart_C: number;
  /** Room air temperature, C. The water decays toward it with the heat off,
   *  and an egg resting on the counter cools toward it. One room, one number.
   *  A cold pan starts here only when `panStart_C` is absent. */
  ambient_C: number;
  /** Boiling point at the user's altitude, C. */
  boiling_C: number;
  /** Measured time for the pan to reach a full rolling boil, s. On a cold
   *  start it is how long the ramp lasts, and that is all it is used for. A hot
   *  start carries the remembered value (the record says where it came from)
   *  but nothing in the physics reads it. It does not set the heat-off pan's
   *  loss time constant: that would measure the hob, not the pan, so it comes
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
  /** The water the eggs cool in, C, as the cook gave it: running water's, or
   *  the bowl's as the eggs go in. Absent when the cook gave none, and then
   *  assumed (`coolingMedium_C`): running water at T_COLD_TAP_C, a bowl at
   *  the room. Read only for 'tap' and 'bowl'. */
  coolingWater_C?: number;
  /** The water in the bowl, litres. Present for a bowl, and read only there. */
  bowlLitres?: number;
  /** The water a cold pan starts at, C: what it was filled with, from the
   *  cold tap. Read only on a cold start, where the ramp starts at it.
   *  Absent, the pan starts at `ambient_C`, as every setup did before the
   *  field, so a record without it replays as it was cooked. */
  panStart_C?: number;
}

/* The egg's MASS is not here. It was, and it duplicated `Egg.mass_kg` - so
 * `simulate(egg, setup, ...)` took the same number twice and every caller had
 * to keep the two in step by hand. The validation had to remember an
 * override in its size sweep or it would silently have modelled four different
 * eggs against one fixed water dip. The setup is the POT; the egg is the egg. */

/**
 * Pan heating ramp. Constant power into a lumped water mass with Newtonian
 * losses gives an exponential approach to a steady state the pan never
 * reaches, because boiling clamps it. From the water's start T0:
 *
 *   T(t) = T0 + r*(Tboil - T0)*(1 - exp(-t/tau))
 *
 * T0 is the water the pan was filled with (`CookSetup.panStart_C`), or the
 * room. The losses are taken toward T0 rather than toward the room, so r
 * is the overshoot over the start's own gap to the boil. Losses toward the
 * room are as closed a form, and move the cook by under 2 s for a tap 5 C
 * below the room and by 4.4 s at most for one 15 C below (8.4 s with the
 * heat off near fudgy on a four-minute ramp): inside what r itself is
 * uncertain by, which is worth about 30 s on a ten-minute ramp.
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
  t_s: number, timeToBoil_s: number, start_C: number, boiling_C: number,
): number {
  if (t_s >= timeToBoil_s) return boiling_C;
  const tau = timeToBoil_s / Math.log(RAMP_R / (RAMP_R - 1.0));
  const t = start_C + RAMP_R * (boiling_C - start_C) * (1.0 - Math.exp(-t_s / tau));
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
 * through as V^(2/3) for similar-shaped pans. The reference is pinned to
 * Williams' 17-minute method in 2 L (see TAU_STANDING_REF_S).
 *
 * Why not the time to boil over ln(r/(r-1))? That is the same tau only if the
 * hob's overshoot ratio r is known, and r is the HOB, not the pan: a strong
 * hob would read as a pan that cooled about 2.2 times too fast. And a hot
 * start, which never times the boil, would cool at the rate of whatever pan
 * was remembered. So the time to boil shapes the cold-start ramp and nothing
 * else. See constants.ts for what is judgement.
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

/** What the cooling reads of a pot: the method, the room, and the water the
 *  cook gave. A `CookSetup` is one, and so is a record's setup. */
interface CoolingFacts {
  cooling: Cooling;
  ambient_C: number;
  coolingWater_C?: number;
}

/** What the egg cools in as it goes in, C: the ice bath, running water, the
 *  bowl's water, or in the air the room. Running water and the bowl take
 *  the cook's number when they gave one. Without it, mains water is NOT room
 *  temperature: it arrives at something closer to ground temperature, usually
 *  below the room and occasionally - a long run of pipe in a hot summer - well
 *  above it, so it has its own constant. A bowl is taken to have stood at the
 *  room's, as the cook was told. The bowl then warms (`bowlTemperature`); this
 *  is where it starts, and the coldest it is. */
export function coolingMedium_C(s: CoolingFacts): number {
  if (s.cooling === 'ice') return T_ICE_BATH_C;
  if (restsInAir(s.cooling)) return s.ambient_C;
  if (s.coolingWater_C !== undefined) return s.coolingWater_C;
  return s.cooling === 'tap' ? T_COLD_TAP_C : s.ambient_C;
}

/** What a pot says of everything the egg touched: its start, the pan's
 *  water, the room and the cooling. A `CookSetup` is one, and so is a
 *  record's setup. */
interface TouchedFacts extends CoolingFacts {
  startMode: StartMode;
  eggStart_C: number;
  panStart_C?: number;
}

/** The water a cold pan starts at, C: the cook's or the tap's when the
 *  setup says (`panStart_C`), and the room otherwise. */
export function panStartOf(s: TouchedFacts): number {
  return s.panStart_C !== undefined ? s.panStart_C : s.ambient_C;
}

/** The coldest thing the egg touched, C: the fridge or wherever it came
 *  from, a cold pan's water, the room and what it cooled in. No centre
 *  reading can be colder. */
export function coldestTouched_C(s: TouchedFacts): number {
  const floor = Math.min(s.eggStart_C, s.ambient_C, coolingMedium_C(s));
  return s.startMode === 'cold' ? Math.min(floor, panStartOf(s)) : floor;
}

/**
 * The bowl's water now, C: what it started at, plus what the eggs have given
 * it since the pull over the water's heat capacity (a litre is a kilogram, as
 * `dipMagnitude` has it). Each of the `eggCount` eggs is the egg modelled, so
 * the heat given is N times one egg's heat capacity times the fall in its
 * mean temperature since the pull: exactly what the eggs lose, from the modal
 * state itself.
 *
 * Well mixed, with no heat to the room or into the bowl itself: over the few
 * minutes that decide the yolk, the room's exchange (a time constant near two
 * hours at 2 L) and a ceramic bowl's own heat capacity are each worth under a
 * second of cook, and eggs lying still in water that has not mixed are worth
 * one (README.md section 2.4). A bowl with no water given is no bowl: the
 * water never warms, as running water at its temperature.
 */
export function bowlTemperature(egg: Egg, setup: CookSetup, meanAtPull_C: number, mean_C: number): number {
  const start = coolingMedium_C(setup);
  const litres = setup.bowlLitres;
  if (litres === undefined || !(litres > 0.0)) return start;
  const given = setup.eggCount * egg.mass_kg * C_EGG * (meanAtPull_C - mean_C);
  return start + given / (litres * C_WATER);
}

/**
 * The egg's Newtonian cooling time constant on the counter, s: m*c/(h*A) over
 * the equal-volume sphere, with h = H_AIR. 1860 s for a 62 g egg; it goes as
 * the radius (heat held as R^3, shell as R^2), so a 76 g egg holds its heat
 * 7% longer and a 48 g one 8% shorter.
 */
export function airTimeConstant(egg: Egg): number {
  return egg.mass_kg * C_EGG / (H_AIR * 4.0 * Math.PI * egg.radius_m * egg.radius_m);
}

/**
 * What drying off costs the egg, as a fall in its mean temperature, C: the
 * latent heat of the film it carries out of the pan (WET_SHELL_KG_M2) over its
 * heat capacity. 1.2 C for a 62 g egg, and like the area over the mass it
 * goes as 1/R.
 */
export function wetShellDrop_C(egg: Egg): number {
  const area = 4.0 * Math.PI * egg.radius_m * egg.radius_m;
  return WET_SHELL_KG_M2 * area * LATENT_HEAT_WATER / (egg.mass_kg * C_EGG);
}

/**
 * Surface temperature during cooling, for the step of `dt_s` that ends
 * `elapsedSincePull_s` after the pull and starts from `sphere` as it stands.
 *
 * Ice water and a cold tap are effectively Dirichlet - the surface goes to the
 * bath temperature and stays there. A bowl of still water is the same with a
 * target that moves: the bowl warms by what the eggs give up
 * (`bowlTemperature`, from the egg's mean now against `meanAtPull_C`, its mean
 * as it left the pan), and the surface follows it. Clamped, like the ice bath,
 * though free convection in still water is not quite a clamp: the time-scale
 * learned from the cook's answers absorbs that for every water cooling alike
 * (README.md section 2.4).
 *
 * Still air, on the counter or in an egg cup, is not: Bi ~ 0.6, so the shell
 * is neither held at the room's temperature nor at the egg's mean, and it
 * loses heat by Newton's law at whatever temperature it has reached - hot at
 * first, while the heat of the outer white is still arriving, then below the
 * mean as the egg empties (robinSurface). The time constant is the egg's own (airTimeConstant), about
 * 5.5 times the slowest internal mode, so the egg evens out while it cools;
 * but by the time the yolk peaks, the counter has taken 7-9 C off what an
 * insulated egg would reach. It is cooling, slow beside water, not a lid.
 *
 * The water on the shell evaporates in seconds and takes its latent heat
 * (wetShellDrop_C) out of the egg on the way, withdrawn over TAU_PLUNGE so the
 * drive stays continuous.
 */
export function coolingTemperature(
  sphere: SphereState, egg: Egg, setup: CookSetup, elapsedSincePull_s: number, dt_s: number,
  waterAtPull_C: number, meanAtPull_C: number,
): number {
  if (restsInAir(setup.cooling)) {
    const before = elapsedSincePull_s > dt_s ? elapsedSincePull_s - dt_s : 0.0;
    const drying = wetShellDrop_C(egg)
      * (Math.exp(-before / TAU_PLUNGE) - Math.exp(-elapsedSincePull_s / TAU_PLUNGE));
    const tau = airTimeConstant(egg);
    if (elapsedSincePull_s >= dt_s) return robinSurface(sphere, dt_s, setup.ambient_C, tau, drying);
    // The step that straddles the pull spends only `out` of itself on the
    // counter and the rest in the water. The heat a step moves is linear in the
    // surface temperature it ends at, so splitting the step between the two
    // is splitting that temperature - the water's at the pull itself, the
    // counter's a whole step later - with the drying it holds delivered whole.
    const out = elapsedSincePull_s / dt_s;
    if (!(out > 0.0)) return waterAtPull_C;
    const counter = robinSurface(sphere, dt_s, setup.ambient_C, tau, drying / out);
    return waterAtPull_C + (counter - waterAtPull_C) * out;
  }
  const target = setup.cooling === 'bowl'
    ? bowlTemperature(egg, setup, meanAtPull_C, meanTemperature(sphere))
    : coolingMedium_C(setup);
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
      return rampTemperature(t_s, setup.timeToBoil_s, panStartOf(setup), setup.boiling_C);
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
