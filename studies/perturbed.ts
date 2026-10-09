/**
 * One cook, with the constants the repo holds fixed made movable.
 *
 * Shared by `studies/rank.ts` and `studies/probe.ts`. Both ask what a quantity the
 * model treats as a constant would do to something a cook can observe, and
 * `simulate` cannot answer that: Z_YOLK, Z_WHITE and YOLK_RADIUS_FRAC are module
 * constants, read inside its loop, and the counter's time constant is the
 * egg's own (`airTimeConstant`, held there by DECISIONS.md 95). So the loop,
 * and the counter's surface, are restated here with every one of them as an
 * argument, and each tool cross-checks it against `simulate` at
 * the defaults before believing anything it prints.
 *
 * Read-only. Nothing in src/ is touched, and nothing in src/ imports this.
 *
 * No early termination, unlike `simulate`: that cut-off is tuned to the yolk
 * dose rate at the default z, and a tool that moves z should not inherit it.
 */

import {
  ALPHA_DEFAULT, Z_YOLK, TREF_YOLK_C, Z_WHITE, TREF_WHITE_C,
  YOLK_RADIUS_FRAC, DT_SIM, CARRYOVER_WINDOW, TAU_PLUNGE,
} from '../src/core/constants.js';
import {
  SphereState, createSphere, stepSphere, temperatureAt, centreTemperature, robinSurface,
} from '../src/core/sphere.js';
import {
  CookSetup, airTimeConstant, bathTemperature, coolingTemperature, initialSurfaceTemperature,
  wetShellDrop_C,
} from '../src/core/protocol.js';
import { Egg, eggFromMass } from '../src/core/geometry.js';
import { DEFAULT_EGG_MASS_KG } from '../src/core/policy.js';

export interface Theta {
  /** ln(alpha). The time-scale, and everything that behaves like one. */
  logAlpha: number;
  /** ln of the multiplier on the counter's time constant: a draught, an egg
   *  cup, a stone counter, whatever is not still air. */
  logTauAir: number;
  zYolk_K: number;
  zWhite_K: number;
  /** Where the white criterion is sampled, as r/R. */
  whiteRadiusFrac: number;
  /** Departure from R ~ m^(1/3): the radius is scaled by (m/m_ref)^sizeExponent. */
  sizeExponent: number;
  /** Additive shifts on the two log10 doses - equivalently, on the two targets. */
  yolkOffset: number;
  whiteOffset: number;
  /** The egg was not at the temperature the cook said it was, C. */
  startBias_C: number;
  /** The water was not at the boiling point the app derived, C. */
  boilBias_C: number;
}

export const THETA0: Theta = {
  logAlpha: Math.log(ALPHA_DEFAULT), logTauAir: 0.0,
  zYolk_K: Z_YOLK, zWhite_K: Z_WHITE, whiteRadiusFrac: YOLK_RADIUS_FRAC,
  sizeExponent: 0.0, yolkOffset: 0.0, whiteOffset: 0.0,
  startBias_C: 0.0, boilBias_C: 0.0,
};

/** Where and when a thermometer goes in: r/R, and seconds after the pull. */
export interface Probe { x: number; after_s: number }

export const NO_PROBE: Probe = { x: 0.0, after_s: 0.0 };

export interface Run {
  logYolk: number;
  logWhite: number;
  /** Temperature at `probe.x`, `probe.after_s` after the egg left the water. */
  probe_C: number;
}

function eggFor(mass_kg: number, th: Theta): Egg {
  const base = eggFromMass(mass_kg);
  const scale = Math.pow(mass_kg / DEFAULT_EGG_MASS_KG, th.sizeExponent);
  return {
    radius_m: base.radius_m * scale, minorDiameter_m: base.minorDiameter_m,
    mass_kg: base.mass_kg, volume_m3: base.volume_m3,
  };
}

/** `coolingTemperature` (protocol.ts), its counter branch restated with the
 *  time constant scaled by `tauAirScale`. */
function cooling(
  sphere: SphereState, egg: Egg, setup: CookSetup, elapsed_s: number, dt_s: number,
  waterAtPull_C: number, tauAirScale: number,
): number {
  if (setup.cooling !== 'counter') {
    return coolingTemperature(sphere, egg, setup, elapsed_s, dt_s, waterAtPull_C);
  }
  const before = elapsed_s > dt_s ? elapsed_s - dt_s : 0.0;
  const drying = wetShellDrop_C(egg) * (Math.exp(-before / TAU_PLUNGE) - Math.exp(-elapsed_s / TAU_PLUNGE));
  const tau = airTimeConstant(egg) * tauAirScale;
  if (elapsed_s >= dt_s) return robinSurface(sphere, dt_s, setup.ambient_C, tau, drying);
  const out = elapsed_s / dt_s;
  if (!(out > 0.0)) return waterAtPull_C;
  const counter = robinSurface(sphere, dt_s, setup.ambient_C, tau, drying / out);
  return waterAtPull_C + (counter - waterAtPull_C) * out;
}

export function runPerturbed(
  mass_kg: number, setup0: CookSetup, th: Theta, cook_s: number, probe: Probe,
): Run {
  const egg = eggFor(mass_kg, th);
  const setup: CookSetup = {
    ...setup0,
    eggStart_C: setup0.eggStart_C + th.startBias_C,
    boiling_C: setup0.boiling_C + th.boilBias_C,
  };
  const tauAirScale = Math.exp(th.logTauAir);
  const sphere = createSphere(
    egg.radius_m, Math.exp(th.logAlpha), setup.eggStart_C,
    initialSurfaceTemperature(egg, setup),
  );

  let t = 0.0;
  let yolk = 0.0;
  let white = 0.0;
  let waterAtPull = sphere.surface_C;
  let pulled = false;
  let probe_C = Number.NaN;
  const probeAt = cook_s + probe.after_s;
  const end = cook_s + CARRYOVER_WINDOW;

  while (t < end) {
    const tNext = t + DT_SIM;
    let next: number;
    if (tNext < cook_s) {
      next = bathTemperature(egg, setup, tNext);
    } else {
      if (!pulled) {
        waterAtPull = sphere.surface_C;
        pulled = true;
      }
      next = cooling(sphere, egg, setup, tNext - cook_s, DT_SIM, waterAtPull, tauAirScale);
    }
    stepSphere(sphere, DT_SIM, next);
    t = tNext;

    yolk += Math.pow(10.0, (centreTemperature(sphere) - TREF_YOLK_C) / th.zYolk_K) * DT_SIM / 60.0;
    white += Math.pow(10.0, (temperatureAt(sphere, th.whiteRadiusFrac) - TREF_WHITE_C) / th.zWhite_K) * DT_SIM / 60.0;
    if (Number.isNaN(probe_C) && t >= probeAt) probe_C = temperatureAt(sphere, probe.x);
  }

  return {
    logYolk: Math.log10(yolk) + th.yolkOffset,
    logWhite: Math.log10(white) + th.whiteOffset,
    probe_C: probe_C,
  };
}
