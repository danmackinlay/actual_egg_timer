/**
 * fixtures/core.json: pure functions: the sphere, geometry, boiling.
 */

import {
  MODE_COUNT, ALPHA_DEFAULT, ALPHA_REL_SD, YOLK_RADIUS_FRAC, Z_YOLK, TREF_YOLK_C, Z_WHITE, TREF_WHITE_C,
  H_EFF, K_EGG, RAMP_R, TAU_STANDING_SCALE, TAU_STANDING_REF_S, STANDING_REF_LITRES,
  STANDING_VOLUME_EXPONENT, H_AIR, WET_SHELL_KG_M2, LATENT_HEAT_WATER, T_ICE_BATH_C, T_COLD_TAP_C, T_ROOM_C, TAU_PLUNGE, TAU_DIP_RECOVERY,
  C_WATER, C_EGG, RHO_EGG, EGG_VOLUME_COEFF, EGG_LENGTH_RATIO, DT_SIM, CARRYOVER_WINDOW,
} from '../../src/core/constants.ts';
import { eggFromMass } from '../../src/core/geometry.ts';
import { pressureAtAltitude, boilingPointAtPressure, boilingPointAtAltitude } from '../../src/core/thermo.ts';
import { createDose, accumulateDose, holdTimeForDose } from '../../src/core/kinetics.ts';
import {
  createSphere, stepSphere, temperatureAt, centreTemperature, meanTemperature, seriesTheta, erfc,
} from '../../src/core/sphere.ts';
import { type CookSetup, bowlTemperature, coolingMedium_C } from '../../src/core/protocol.ts';
import { appSetup } from '../common.ts';

/** Sample points chosen to sit where the model actually lives, plus the edges
 *  that break naive implementations: x = 0 (the sinc singularity), tiny Fo
 *  (slow convergence), large Fo (everything underflows). */
const THETA_CASES: Array<[number, number]> = [];
for (const x of [0.0, 0.1, 0.35, 0.693, 0.9, 1.0]) {
  for (const fo of [0.01, 0.0688, 0.07434, 0.15, 0.229, 0.5, 1.0]) {
    THETA_CASES.push([x, fo]);
  }
}

const ERFC_CASES = [-3.0, -1.0, -0.25, 0.0, 1e-9, 0.25, 0.5, 1.0, 2.0, 3.5, 6.0];
const MASS_CASES_G = [40, 48, 53, 58, 62.3, 68, 76, 90];
const ALTITUDE_CASES_M = [-400, 0, 500, 1000, 1609, 2000, 3000, 4000, 5000];
const PRESSURE_CASES_PA = [101325, 95000, 89870, 79500, 70110, 54020];

/* ------------------------------------------------------------- core.json */

const sphereStep = (() => {
  // A short, fully specified integration: the exact arithmetic the port has to
  // reproduce, including the mode coupling and the exponential decay.
  const s = createSphere(0.0238, ALPHA_DEFAULT, 4.0, 100.0);
  const samples: Array<Record<string, number>> = [];
  let t = 0;
  for (let i = 0; i < 40; i++) {
    stepSphere(s, 10.0, 100.0);
    t += 10;
    samples.push({
      t_s: t,
      centre_C: centreTemperature(s),
      yolkBoundary_C: temperatureAt(s, YOLK_RADIUS_FRAC),
      mean_C: meanTemperature(s),
    });
  }
  return samples;
})();

const rampedStep = (() => {
  // The same integrator driven by a MOVING surface, which is the case the
  // Duhamel coupling exists for. A step-only test would not catch a sign error
  // in the drive term.
  const s = createSphere(0.0238, ALPHA_DEFAULT, 4.0, 20.0);
  const samples: Array<Record<string, number>> = [];
  for (let i = 1; i <= 30; i++) {
    const surface = 20.0 + i * 2.5;
    stepSphere(s, 15.0, surface);
    samples.push({
      t_s: i * 15,
      surface_C: surface,
      centre_C: centreTemperature(s),
      mean_C: meanTemperature(s),
    });
  }
  return samples;
})();

/** What each cooling starts at, and a bowl as it warms: the cook's water or
 *  the one assumed, an ice bath and the air, and a bowl with no water. */
const COOLING_SETUPS: CookSetup[] = [
  appSetup(), appSetup({ cooling: 'counter', ambient_C: 26 }), appSetup({ cooling: 'tap' }),
  appSetup({ cooling: 'tap', coolingWater_C: 24 }), appSetup({ cooling: 'bowl', bowlLitres: 2 }),
  appSetup({ cooling: 'bowl', bowlLitres: 2, ambient_C: 27 }), appSetup({ cooling: 'bowl', bowlLitres: 0.5, coolingWater_C: 9, eggCount: 6 }),
  appSetup({ cooling: 'bowl', bowlLitres: 4, coolingWater_C: 31, eggCount: 1 }), appSetup({ cooling: 'bowl' }),
];
const BOWL_MEANS: Array<[number, number, number]> = [[68, 83.1, 83.1], [68, 83.1, 61.4], [53, 79.6, 40.2], [76, 85, 20]];

export const coreFixture = {
  about: 'Pure functions: the sphere, geometry, boiling, what the egg cools in and the dose, with the constants they use. src/core/sphere.ts, geometry.ts, thermo.ts, protocol.ts, kinetics.ts.',
  constants: {
    MODE_COUNT, ALPHA_DEFAULT, ALPHA_REL_SD, YOLK_RADIUS_FRAC, Z_YOLK, TREF_YOLK_C, Z_WHITE,
    TREF_WHITE_C, H_EFF, K_EGG, RAMP_R, TAU_STANDING_SCALE, TAU_STANDING_REF_S,
    STANDING_REF_LITRES, STANDING_VOLUME_EXPONENT, H_AIR, WET_SHELL_KG_M2, LATENT_HEAT_WATER, T_ICE_BATH_C, T_COLD_TAP_C, T_ROOM_C, TAU_PLUNGE, TAU_DIP_RECOVERY,
    C_WATER, C_EGG, RHO_EGG, EGG_VOLUME_COEFF, EGG_LENGTH_RATIO, DT_SIM,
    CARRYOVER_WINDOW,
  },
  sphere: {
    seriesTheta: THETA_CASES.map(([x, fo]) => ({ x: x, fourier: fo, value: seriesTheta(x, fo) })),
    erfc: ERFC_CASES.map((x) => ({ x: x, value: erfc(x) })),
    stepResponse: sphereStep,
    rampResponse: rampedStep,
  },
  geometry: {
    fromMass: MASS_CASES_G.map((g) => {
      const egg = eggFromMass(g / 1000);
      return {
        mass_g: g,
        radius_m: egg.radius_m,
        minorDiameter_m: egg.minorDiameter_m,
        volume_m3: egg.volume_m3,
      };
    }),
  },
  thermo: {
    pressureAtAltitude: ALTITUDE_CASES_M.map((h) => ({ altitude_m: h, value: pressureAtAltitude(h) })),
    boilingPointAtAltitude: ALTITUDE_CASES_M.map((h) => ({ altitude_m: h, value: boilingPointAtAltitude(h) })),
    boilingPointAtPressure: PRESSURE_CASES_PA.map((p) => ({ pressure_Pa: p, value: boilingPointAtPressure(p) })),
  },
  protocol: {
    coolingMedium: COOLING_SETUPS.map((setup) => ({ setup: setup, value: coolingMedium_C(setup) })),
    bowlTemperature: COOLING_SETUPS.flatMap((setup) => BOWL_MEANS.map(([g, atPull, now]) => ({
      setup: setup, mass_g: g, meanAtPull_C: atPull, mean_C: now,
      value: bowlTemperature(eggFromMass(g / 1000), setup, atPull, now),
    }))),
  },
  kinetics: {
    holdTimeForDose: [55, 60, 63, 65, 70, 80].map((held) => ({
      z_K: Z_YOLK, tref_C: TREF_YOLK_C, doseMinutes: 10.0, held_C: held,
      value: holdTimeForDose(createDose(Z_YOLK, TREF_YOLK_C), 10.0, held),
    })),
    accumulateDose: (() => {
      // A ten-minute ramp from 50 to 80 C, integrated at the model's own step.
      const d = createDose(Z_YOLK, TREF_YOLK_C);
      const out: Array<Record<string, number>> = [];
      for (let i = 1; i <= 20; i++) {
        const temp = 50.0 + i * 1.5;
        accumulateDose(d, temp, 30.0);
        out.push({ step: i, temperature_C: temp, dt_s: 30.0, minutes: d.minutes });
      }
      return out;
    })(),
  },
};
