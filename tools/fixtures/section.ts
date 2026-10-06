/**
 * fixtures/section.json: the egg in cross-section, carried forward a tick at
 * a time.
 */

import { eggFromMass } from '../../src/core/geometry.js';
import { CookSetup } from '../../src/core/protocol.js';
import { DEFAULT_PARAMS, WHITE_DOSE_TARGET, donenessFromSlider, solveCookTime } from '../../src/core/solve.js';
import {
  SECTION_WHITE_SAMPLES, SECTION_YOLK_SAMPLES, advanceSection, createSection, previewSection, sectionView,
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

/* The egg the settings aim for (`previewSection`): the solve's time and peak,
 * at the levels across the slider, in each thing it cools in, and a heat-off
 * pan whose centre peaks before the egg comes out. */
const PREVIEWS: { name: string; setup: CookSetup; level: number }[] = [
  { name: 'hot start, ice bath, jammy', setup: appSetup(), level: 0.41 },
  { name: 'hot start, ice bath, runny', setup: appSetup(), level: 0.05 },
  { name: 'cold start, cold tap, fudgy', setup: appSetup({ startMode: 'cold', cooling: 'tap' }), level: 0.62 },
  { name: 'hot start, on the counter, hard', setup: appSetup({ cooling: 'counter' }), level: 1 },
  { name: 'heat off, little water, many eggs', setup: appSetup({ afterBoil: 'off', waterLitres: 0.5, eggCount: 8 }), level: 1 },
];

export const sectionFixture = {
  about: 'The egg in cross-section, carried forward a tick at a time: each ring\'s temperature, dose and how set, at each tick; and the egg the settings aim for. src/core/section.ts.',
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
  previews: PREVIEWS.map((p, i) => {
    const sol = solveCookTime(EGG, p.setup, DEFAULT_PARAMS, donenessFromSlider(p.level));
    const target = i % 2 === 0 ? WHITE_DOSE_TARGET : MOVED_WHITE_TARGET;
    const view = previewSection(
      EGG, p.setup, DEFAULT_PARAMS, sol.result.cookTime_s, sol.result.peakYolkTime_s, target,
    );
    return {
      name: p.name, setup: p.setup, cookTime_s: sol.result.cookTime_s, peakYolkTime_s: sol.result.peakYolkTime_s,
      peakYolk_C: sol.result.peakYolk_C, whiteTarget_min: target,
      temperature_C: view.temperature_C, set: view.set,
    };
  }),
};
