/**
 * The egg in cross-section, while it cooks: the temperature and how far each
 * layer has set, from the centre of the yolk out to the shell, at the moment on
 * the clock rather than at the end of the cook.
 *
 * `simulate` (solve.ts) answers for a whole cook and keeps two points, the
 * yolk's centre and the innermost white. This runs the same loop step by step,
 * as the cook's clock moves, and keeps a dose at every sample radius, so a
 * screen can draw the whole egg. It is the same physics on the same grid:
 * advanced past the carryover, the centre and the innermost white come out at
 * exactly `simulate`'s doses (test/section.test.ts).
 *
 * The state is advanced in place, as `stepSphere` and `accumulateDose` are, so
 * a screen can carry one forward a tick at a time instead of replaying the cook.
 *
 * The egg is the model's equal-volume sphere. How a screen draws that sphere as
 * an egg is the screen's business; what it needs from here is a list of rings,
 * each with an outer edge, a temperature and how set it is.
 */

import {
  YOLK_RADIUS_FRAC, Z_YOLK, TREF_YOLK_C, Z_WHITE, TREF_WHITE_C, DT_SIM, CARRYOVER_WINDOW,
} from './constants.js';
import { Egg } from './geometry.js';
import {
  CookSetup, bathTemperature, coolingTemperature, initialSurfaceTemperature,
} from './protocol.js';
import {
  SphereState, createSphere, stepSphere, temperatureAt,
} from './sphere.js';
import { Dose, createDose, accumulateDose } from './kinetics.js';
import { ModelParams, sliderFromYolkDose } from './solve.js';

/** Samples across the yolk, from its centre (x = 0) to its edge (x =
 *  YOLK_RADIUS_FRAC), evenly in radius. */
export const SECTION_YOLK_SAMPLES = 17;
/** Samples across the white, from its inner edge (x = YOLK_RADIUS_FRAC) to the
 *  shell (x = 1). The yolk's edge is sampled twice, once as yolk and once as
 *  white: the two set at different rates (Z_YOLK, Z_WHITE), and the innermost
 *  white is the last of the white to set, which is what `simulate` watches. */
export const SECTION_WHITE_SAMPLES = 17;

/** How far short of its target a white dose still reads as wholly raw, in
 *  decades. Between this and the target the white goes from clear to opaque. */
const WHITE_SET_DECADES = 1.0;

export interface EggSection {
  sphere: SphereState;
  /** Seconds since t = 0 of the cook (protocol.ts), always a whole number of
   *  DT_SIM steps. */
  t_s: number;
  /** When the egg left the water, s since t = 0; null while it is in. Fixed
   *  the first time a step crosses it. */
  outAt_s: number | null;
  /** The water's temperature as the egg left it: an ice bath or a tap
   *  blends out of it. */
  waterAtPull_C: number;
  /** Sample radii, r/R: the yolk's first, from the centre out, then the
   *  white's. */
  x: number[];
  /** Whether each sample is yolk. */
  yolk: boolean[];
  /** Each ring's outer edge, r/R: halfway to the next sample of the same
   *  kind, the yolk's edge for the outermost yolk and the shell for the
   *  outermost white. A ring is everything between its own edge and the one
   *  inside it. */
  outer: number[];
  /** The thermal dose at each sample, at the yolk's or the white's z. */
  dose: Dose[];
}

/** An egg at the start of a cook, uniformly at its starting temperature. */
export function createSection(egg: Egg, setup: CookSetup, params: ModelParams): EggSection {
  const n = SECTION_YOLK_SAMPLES + SECTION_WHITE_SAMPLES;
  const x: number[] = new Array<number>(n);
  const yolk: boolean[] = new Array<boolean>(n);
  const outer: number[] = new Array<number>(n);
  const dose: Dose[] = new Array<Dose>(n);
  const yolkLast = SECTION_YOLK_SAMPLES - 1;
  const whiteLast = SECTION_WHITE_SAMPLES - 1;
  for (let i = 0; i < SECTION_YOLK_SAMPLES; i++) {
    x[i] = YOLK_RADIUS_FRAC * i / yolkLast;
    yolk[i] = true;
    outer[i] = i === yolkLast ? YOLK_RADIUS_FRAC : YOLK_RADIUS_FRAC * (i + 0.5) / yolkLast;
    dose[i] = createDose(Z_YOLK, TREF_YOLK_C);
  }
  for (let j = 0; j < SECTION_WHITE_SAMPLES; j++) {
    const k = SECTION_YOLK_SAMPLES + j;
    x[k] = YOLK_RADIUS_FRAC + (1.0 - YOLK_RADIUS_FRAC) * j / whiteLast;
    yolk[k] = false;
    outer[k] = j === whiteLast ? 1.0 : YOLK_RADIUS_FRAC + (1.0 - YOLK_RADIUS_FRAC) * (j + 0.5) / whiteLast;
    dose[k] = createDose(Z_WHITE, TREF_WHITE_C);
  }
  const surface = initialSurfaceTemperature(egg, setup);
  return {
    sphere: createSphere(egg.radius_m, params.alpha_m2s, setup.eggStart_C, surface),
    t_s: 0.0,
    outAt_s: null,
    waterAtPull_C: surface,
    x: x,
    yolk: yolk,
    outer: outer,
    dose: dose,
  };
}

/**
 * Carry the egg forward to `to_s`, in whole DT_SIM steps, exactly as
 * `simulate` does: in the water until `outAt_s`, then in whatever it cools in.
 * `outAt_s` is null while the egg is still in the water, however late that is;
 * once a step has crossed it, the section keeps the first value it was given.
 * Mutates `s`.
 */
export function advanceSection(
  s: EggSection, egg: Egg, setup: CookSetup, to_s: number, outAt_s: number | null,
): void {
  const n = s.x.length;
  while (s.t_s + DT_SIM <= to_s) {
    const tNext = s.t_s + DT_SIM;
    const out = s.outAt_s !== null ? s.outAt_s : outAt_s;
    let next: number;
    if (out === null || tNext < out) {
      next = bathTemperature(egg, setup, tNext);
    } else {
      if (s.outAt_s === null) {
        s.outAt_s = out;
        s.waterAtPull_C = s.sphere.surface_C;
      }
      next = coolingTemperature(s.sphere, egg, setup, tNext - out, DT_SIM, s.waterAtPull_C);
    }
    stepSphere(s.sphere, DT_SIM, next);
    s.t_s = tNext;
    for (let i = 0; i < n; i++) {
      accumulateDose(s.dose[i], temperatureAt(s.sphere, s.x[i]), DT_SIM);
    }
  }
}

/** What a screen draws: per ring, the temperature now and how far it has set,
 *  from 0 to 1. */
export interface SectionView {
  x: number[];
  yolk: boolean[];
  outer: number[];
  temperature_C: number[];
  /** The yolk on the doneness slider's own scale (0 runny, 1 hard), so a yolk
   *  that has reached the level the cook asked for is drawn as that level. The
   *  white from clear (a decade or more short of `whiteTarget_min`) to opaque
   *  (at it), evenly in log dose. Never falls: a set egg stays set. */
  set: number[];
}

/** The section as it stands. `whiteTarget_min` is the white's dose target
 *  for this cook (`calibrationDoneness`), so what the eggs have said about the
 *  white moves where it reads as set. */
export function sectionView(s: EggSection, whiteTarget_min: number): SectionView {
  const n = s.x.length;
  const temperature: number[] = new Array<number>(n);
  const set: number[] = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    temperature[i] = temperatureAt(s.sphere, s.x[i]);
    const minutes = s.dose[i].minutes;
    if (!(minutes > 0.0)) {
      set[i] = 0.0;
    } else if (s.yolk[i]) {
      set[i] = sliderFromYolkDose(minutes);
    } else {
      const f = 1.0 + Math.log10(minutes / whiteTarget_min) / WHITE_SET_DECADES;
      set[i] = f < 0.0 ? 0.0 : f > 1.0 ? 1.0 : f;
    }
  }
  return { x: s.x, yolk: s.yolk, outer: s.outer, temperature_C: temperature, set: set };
}

/**
 * The egg the settings aim for (design/one-screen.md section 5): one egg, at the posterior mean (`params`), cooked for `cookTime_s` and
 * shown at the end of the cooling, the egg as eaten: carried through the
 * whole carryover (`CARRYOVER_WINDOW`), as `simulate` counts it, so the yolk
 * reads the level the slider asked for. At the yolk centre's peak, which is
 * Done, the dose is not all in: a jammy (0.41) yolk read 0.34 there. About
 * 2,700 steps for a soft-boiled egg: once per solve, not per frame.
 */
export function previewSection(
  egg: Egg, setup: CookSetup, params: ModelParams, cookTime_s: number, whiteTarget_min: number,
): SectionView {
  const s = createSection(egg, setup, params);
  advanceSection(s, egg, setup, cookTime_s + CARRYOVER_WINDOW, cookTime_s);
  return sectionView(s, whiteTarget_min);
}
