/**
 * fixtures/section.json: the egg in cross-section, carried forward a tick at
 * a time.
 */

import { eggFromMass } from '../../src/core/geometry.js';
import { CookSetup } from '../../src/core/protocol.js';
import { DEFAULT_PARAMS, WHITE_DOSE_TARGET } from '../../src/core/solve.js';
import {
  SECTION_WHITE_SAMPLES, SECTION_YOLK_SAMPLES, advanceSection, createSection, sectionView,
} from '../../src/core/section.js';
import { appSetup } from '../common.js';

const EGG = eggFromMass(0.060);

/** A white target the eggs have moved (`calibrationDoneness`), so the port's
 *  white is read against a target that is not the constant. */
const MOVED_WHITE_TARGET = WHITE_DOSE_TARGET * Math.pow(10.0, 0.3);

interface Case {
  name: string;
  setup: CookSetup;
  /** When the egg comes out, s, or null for one still in the water. */
  out_s: number | null;
  /** The clock at each tick a screen would draw, s: uneven on purpose, so a
   *  partial step is carried rather than taken. */
  ticks: number[];
}

const CASES: Case[] = [
  {
    name: 'hot start, ice bath',
    setup: appSetup(),
    out_s: 400.3,
    ticks: [0.3, 1.2, 37.9, 210, 400, 400.4, 431.7, 700, 1300],
  },
  {
    name: 'cold start, heat off, on the counter',
    setup: appSetup({ startMode: 'cold', afterBoil: 'off', cooling: 'counter' }),
    out_s: 812.6,
    ticks: [5, 300.2, 480, 811, 813, 1100, 1712.4],
  },
  {
    name: 'cold start under a cold tap, still in the water',
    setup: appSetup({ startMode: 'cold', cooling: 'tap', eggStart_C: 20 }),
    out_s: null,
    ticks: [100, 333.3, 600, 900],
  },
];

export const sectionFixture = {
  about: 'The egg in cross-section, carried forward a tick at a time: each ring\'s temperature, dose and how set, at each tick. src/core/section.ts.',
  egg: { mass_kg: EGG.mass_kg },
  params: DEFAULT_PARAMS,
  samples: { yolk: SECTION_YOLK_SAMPLES, white: SECTION_WHITE_SAMPLES },
  whiteTargets: [WHITE_DOSE_TARGET, MOVED_WHITE_TARGET],
  rings: (() => {
    const s = createSection(EGG, appSetup(), DEFAULT_PARAMS);
    return { x: s.x, yolk: s.yolk, outer: s.outer };
  })(),
  cases: CASES.map((c) => {
    const s = createSection(EGG, c.setup, DEFAULT_PARAMS);
    return {
      name: c.name,
      setup: c.setup,
      out_s: c.out_s,
      ticks: c.ticks.map((tick) => {
        // The time out is known only once the clock has reached it, as on a
        // screen: before then the egg is still in the water.
        const out = c.out_s !== null && tick >= c.out_s ? c.out_s : null;
        advanceSection(s, EGG, c.setup, DEFAULT_PARAMS, tick, out);
        return {
          to_s: tick,
          givenOut_s: out,
          t_s: s.t_s,
          outAt_s: s.outAt_s,
          meanAtPull_C: s.meanAtPull_C,
          waterAtPull_C: s.waterAtPull_C,
          surface_C: s.sphere.surface_C,
          dose_min: s.dose.map((d) => d.minutes),
          views: [WHITE_DOSE_TARGET, MOVED_WHITE_TARGET].map((target) => {
            const v = sectionView(s, target);
            return { temperature_C: v.temperature_C, set: v.set };
          }),
        };
      }),
    };
  }),
};
