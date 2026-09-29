/**
 * fixtures/sousvide.json: the isothermal limit: no pan, no ramp, no cooling,
 * and an answer in hours.
 */

import { ALPHA_DEFAULT } from '../../src/core/constants.js';
import { eggFromMass } from '../../src/core/geometry.js';
import {
  SOUS_VIDE_BATH_C, SOUS_VIDE_MODEL_FLOOR_C, equilibrationTime, sousVideEstimate,
} from '../../src/core/sousvide.js';
import { donenessFromSlider } from '../../src/core/solve.js';

/* The isothermal limit. Cheap - no integration at all - so the cases are dense
 * enough that the three things a port could get wrong each have their own
 * witness:
 *
 *   the BISECTION on the Fourier number, which is the only iteration here;
 *   WHICH hold binds, which is what the app puts on screen; and
 *   the hold times themselves, which span eight orders of magnitude and are
 *   therefore where a z-value or a reference temperature swapped between the
 *   yolk and the white shows up as an obviously different answer rather than a
 *   subtly wrong one. */

const SOUS_VIDE_EGGS_G = [48.3, 62, 68, 90];
/* The calibration's own range on alpha, so a port is held across everything the
 * particle filter can hand this function rather than at the literature value. */
const SOUS_VIDE_ALPHAS = [1.2e-7, ALPHA_DEFAULT, 2.4e-7];
const SOUS_VIDE_LEVELS = [0.0, 0.22, 0.41, 0.62, 1.0];

interface SousVideCase {
  mass_g: number;
  alpha_m2s: number;
  bath_C: number;
  level: number;
  /** Why this case is here, carried into the fixture so a failure says what it
   *  was covering rather than only which numbers disagreed. */
  what: string;
}

const SOUS_VIDE_CASES: SousVideCase[] = [];

/* The shipped bath, across the slider. The white's hold does not move at all -
 * its target is fixed - so this sweep is the yolk's hold climbing past it, and
 * the hard end is the one case where the YOLK binds at 58 C. That flips
 * `whiteBound`, and with it the sentence the app prints. */
for (const level of SOUS_VIDE_LEVELS) {
  SOUS_VIDE_CASES.push({
    mass_g: 68, alpha_m2s: ALPHA_DEFAULT, bath_C: SOUS_VIDE_BATH_C, level: level,
    what: 'shipped bath, slider sweep',
  });
}

/* Either side of 60 C, which is the temperature this module's own caveat is
 * about: below it the white never sets and the conduction model is out of its
 * depth. 50 C is the absurd end - the white's target takes over a month - and
 * 85 C is the other, where both holds fall to seconds and the equilibration is
 * the whole answer. */
for (const bath_C of [50, 55, 57.9, SOUS_VIDE_BATH_C, 59.9, 60, 60.1, 63, 65, 70, 75, 85]) {
  SOUS_VIDE_CASES.push({
    mass_g: 68, alpha_m2s: ALPHA_DEFAULT, bath_C: bath_C, level: 0.41,
    what: 'bath sweep either side of 60 C',
  });
}

/* A hard yolk in a hot bath, where the yolk's hold is the binding one. Without
 * these every case in the file agrees that the white binds, and a port that
 * simply returned `true` would pass. */
for (const bath_C of [65, 70, 75, 80, 85]) {
  SOUS_VIDE_CASES.push({
    mass_g: 68, alpha_m2s: ALPHA_DEFAULT, bath_C: bath_C, level: 1.0,
    what: 'hard yolk, yolk-bound',
  });
}

/* Every egg and every alpha, at the bath the app actually offers. Only
 * `equilibrate_s` moves across these, which is the point: it is the one output
 * that depends on the egg at all. */
for (const mass_g of SOUS_VIDE_EGGS_G) {
  for (const alpha_m2s of SOUS_VIDE_ALPHAS) {
    SOUS_VIDE_CASES.push({
      mass_g: mass_g, alpha_m2s: alpha_m2s, bath_C: SOUS_VIDE_BATH_C, level: 0.41,
      what: 'egg and alpha sweep',
    });
  }
}

export const sousvideFixture = {
  about: 'The isothermal limit: no pan, no ramp, no cooling, and an answer in hours. src/core/sousvide.ts.',
  bath_C: SOUS_VIDE_BATH_C,
  modelFloor_C: SOUS_VIDE_MODEL_FLOOR_C,
  /* The bisection's answer stripped of its scaling: at R = 1 m and
   * alpha = 1 m^2/s the return value IS the Fourier number it converged on.
   * Every other equilibration number in this file is that one times R^2/alpha,
   * so a port with a narrower bracket or a flipped comparison is caught here
   * rather than being absorbed into an egg-sized answer. */
  fourierNumber: equilibrationTime(1.0, 1.0),
  cases: SOUS_VIDE_CASES.map((c) => {
    const egg = eggFromMass(c.mass_g / 1000);
    const doneness = donenessFromSlider(c.level);
    const est = sousVideEstimate(
      egg.radius_m, c.alpha_m2s, c.bath_C, doneness.yolkDose_min, doneness.whiteDose_min,
    );
    return {
      what: c.what,
      mass_g: c.mass_g,
      radius_m: egg.radius_m,
      alpha_m2s: c.alpha_m2s,
      level: c.level,
      yolkDose_min: doneness.yolkDose_min,
      whiteDose_min: doneness.whiteDose_min,
      bath_C: est.bath_C,
      equilibrate_s: est.equilibrate_s,
      yolkHold_s: est.yolkHold_s,
      whiteHold_s: est.whiteHold_s,
      total_s: est.total_s,
      whiteBound: est.whiteBound,
    };
  }),
};
