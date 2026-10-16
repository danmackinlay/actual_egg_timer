/**
 * fixtures/section.json: the egg in cross-section, carried forward a tick at
 * a time.
 */

import { eggFromMass } from '../../src/core/geometry.ts';
import type { CookSetup } from '../../src/core/protocol.ts';
import { DEFAULT_PARAMS, WHITE_DOSE_TARGET, donenessFromSlider, solveCookTime } from '../../src/core/solve.ts';
import {
  type EggSection, advanceSection, createSection, previewSection, sectionView,
} from '../../src/core/section.ts';
import { appSetup } from '../common.ts';

const EGG = eggFromMass(0.060);

/** The section as it stands, apart from the one `advanceSection` goes on to
 *  change in place. */
function copied(s: EggSection): EggSection {
  return structuredClone(s);
}

/** A white target the eggs have moved (`calibrationDoneness`), so the port's
 *  white is read against a target that is not the constant. */
const MOVED_WHITE_TARGET = WHITE_DOSE_TARGET * Math.pow(10.0, 0.3);

interface Case {
  name: string;
  setup: CookSetup;
  /** When the egg comes out, s, or null for one still in the water. */
  out_s: number | null;
  /** The clock at each tick a screen would draw, s: uneven on purpose, so a
   *  partial step is carried rather than taken; either side of the boil and
   *  of the moment out, and late in the cooling. */
  ticks: number[];
}

const CASES: Case[] = [
  {
    name: 'hot start, ice bath',
    setup: appSetup(),
    out_s: 400.3,
    ticks: [0.3, 1.2, 400, 400.4, 1300],
  },
  {
    name: 'cold start, heat off, on the counter',
    setup: appSetup({ startMode: 'cold', afterBoil: 'off', cooling: 'counter' }),
    out_s: 812.6,
    ticks: [5, 480, 811, 813, 1712.4],
  },
  {
    name: 'cold start under a cold tap, still in the water',
    setup: appSetup({ startMode: 'cold', cooling: 'tap', eggStart_C: 20 }),
    out_s: null,
    ticks: [333.3, 900],
  },
  {
    name: 'hot start, four eggs into a litre bowl at 12 C',
    setup: appSetup({ cooling: 'bowl', bowlLitres: 1, coolingWater_C: 12, eggCount: 4 }),
    out_s: 430.2,
    ticks: [200, 430, 431, 1200],
  },
];

/* The egg the settings aim for (`previewSection`): the solve's time, the egg
 * as eaten at the end of the cooling, at the levels across the slider, in
 * each thing it cools in, and a heat-off pan whose centre peaks before the
 * egg comes out. */
const PREVIEWS: { name: string; setup: CookSetup; level: number }[] = [
  { name: 'hot start, ice bath, jammy', setup: appSetup(), level: 0.41 },
  { name: 'hot start, ice bath, runny', setup: appSetup(), level: 0.05 },
  { name: 'cold start, cold tap, fudgy', setup: appSetup({ startMode: 'cold', cooling: 'tap' }), level: 0.62 },
  { name: 'hot start, on the counter, hard', setup: appSetup({ cooling: 'counter' }), level: 1 },
  { name: 'hot start, a bowl at the room, soft', setup: appSetup({ cooling: 'bowl', bowlLitres: 2 }), level: 0.22 },
  { name: 'heat off, little water, many eggs', setup: appSetup({ afterBoil: 'off', waterLitres: 0.5, eggCount: 8 }), level: 1 },
];

export const sectionFixture = {
  about: 'The egg in cross-section, carried forward a tick at a time: each ring\'s temperature, dose and how set, at each tick; and the egg the settings aim for. src/core/section.ts.',
  egg: EGG,
  params: DEFAULT_PARAMS,
  whiteTargets: [WHITE_DOSE_TARGET, MOVED_WHITE_TARGET],
  cases: CASES.map((c) => {
    const s = createSection(EGG, c.setup, DEFAULT_PARAMS);
    return {
      name: c.name,
      setup: c.setup,
      out_s: c.out_s,
      // The rings, the sphere and the doses before the first tick.
      start: copied(s),
      ticks: c.ticks.map((tick) => {
        // The time out is known only once the clock has reached it, as on a
        // screen: before then the egg is still in the water.
        const out = c.out_s !== null && tick >= c.out_s ? c.out_s : null;
        advanceSection(s, EGG, c.setup, tick, out);
        return {
          to_s: tick,
          givenOut_s: out,
          // The section as it stands at the tick, whole: the sphere's modes,
          // the moment out, each ring's dose.
          section: copied(s),
          views: [WHITE_DOSE_TARGET, MOVED_WHITE_TARGET].map((target) => sectionView(s, target)),
        };
      }),
    };
  }),
  previews: PREVIEWS.map((p, i) => {
    const sol = solveCookTime(EGG, p.setup, DEFAULT_PARAMS, donenessFromSlider(p.level));
    const target = i % 2 === 0 ? WHITE_DOSE_TARGET : MOVED_WHITE_TARGET;
    return {
      name: p.name, setup: p.setup, cookTime_s: sol.result.cookTime_s, level: p.level, whiteTarget_min: target,
      view: previewSection(EGG, p.setup, DEFAULT_PARAMS, sol.result.cookTime_s, target),
    };
  }),
};
