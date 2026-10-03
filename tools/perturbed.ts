/**
 * One cook, with the constants the repo holds fixed made movable.
 *
 * Shared by `tools/rank.ts` and `tools/probe.ts`. Both ask what a quantity the
 * model treats as a constant would do to something a cook can observe, and
 * `simulate` cannot answer that: Z_YOLK, Z_WHITE and YOLK_RADIUS_FRAC are module
 * constants, read inside its loop. So the loop is restated here with every one
 * of them as an argument, and each tool cross-checks it against `simulate` at
 * the defaults before believing anything it prints.
 *
 * Read-only. Nothing in src/ is touched, and nothing in src/ imports this.
 *
 * No early termination, unlike `simulate`: that cut-off is tuned to the yolk
 * dose rate at the default z, and a tool that moves z should not inherit it.
 */

import {
  ALPHA_DEFAULT, Z_YOLK, TREF_YOLK_C, Z_WHITE, TREF_WHITE_C,
  YOLK_RADIUS_FRAC, DT_SIM, CARRYOVER_WINDOW,
} from '../src/core/constants.js';
import {
  createSphere, stepSphere, temperatureAt, centreTemperature,
} from '../src/core/sphere.js';
import {
  CookSetup, bathTemperature, coolingTemperature, initialSurfaceTemperature,
} from '../src/core/protocol.js';
import { Egg, eggFromMass } from '../src/core/geometry.js';
import { DEFAULT_EGG_MASS_KG } from '../src/core/policy.js';

export interface Theta {
  /** ln(alpha). The time-scale, and everything that behaves like one. */
  logAlpha: number;
  /** ln(tauAirScale). */
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

export function eggFor(mass_kg: number, th: Theta): Egg {
  const base = eggFromMass(mass_kg);
  const scale = Math.pow(mass_kg / DEFAULT_EGG_MASS_KG, th.sizeExponent);
  return {
    radius_m: base.radius_m * scale, minorDiameter_m: base.minorDiameter_m,
    mass_kg: base.mass_kg, volume_m3: base.volume_m3,
  };
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
      next = coolingTemperature(sphere, egg, setup, tNext - cook_s, DT_SIM, waterAtPull, tauAirScale);
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
