/**
 * Helpers the tools and the tests share: the pots they cook in, the seeded
 * draws of their simulated cooks, a record, a posterior that knows its cook,
 * and a cheap decision surface. Each was copied between files before; a
 * change to one now reaches every user of it.
 *
 * Nothing here is the app's: the apps' own logic is in src/core/, and these
 * only build inputs for it.
 */

import { ALPHA_DEFAULT, ALPHA_REL_SD } from '../src/core/constants.js';
import { decisionGridRequest, decisionInputs } from '../src/core/decide.js';
import { DoseGrid, buildRequestedGrid } from '../src/core/doseGrid.js';
import { Egg } from '../src/core/geometry.js';
import { Feedback, WhiteReport, createPrior } from '../src/core/infer.js';
import { CALIBRATION_SEED } from '../src/core/policy.js';
import { CookSetup } from '../src/core/protocol.js';
import { Calibration, EggRecord, PRIOR_ID } from '../src/core/record.js';

/* ------------------------------------------------------------------ pots */

/* Two pots, and they differ: which one a file starts from is part of what its
 * numbers mean, so each has its own name rather than sharing one. */

/** The reference pot of the validation (tools/validate.ts): four eggs from
 *  the fridge dropped into 2 L already at a rolling boil at sea level, then an
 *  ice bath. No time to boil and no after-boil setting: the literature's
 *  protocol, not an app's. The validation, the fixtures and test/core.test.ts
 *  cook in it. */
export function referenceSetup(over: Partial<CookSetup> = {}): CookSetup {
  const base: CookSetup = {
    startMode: 'hot',
    eggStart_C: 4,
    ambient_C: 20,
    boiling_C: 100,
    timeToBoil_s: 0,
    cooling: 'ice',
    waterLitres: 2,
    eggCount: 4,
  };
  return { ...base, ...over };
}

/** The apps' default pot: two eggs from the fridge into 2 L that takes the
 *  default 480 s to boil, the heat held, then an ice bath. What a fresh
 *  install cooks, so what the decision tools and tests measure. */
export function appSetup(over: Partial<CookSetup> = {}): CookSetup {
  return {
    startMode: 'hot', eggStart_C: 4, ambient_C: 20, boiling_C: 100, timeToBoil_s: 480,
    cooling: 'ice', afterBoil: 'hold', waterLitres: 2, eggCount: 2, ...over,
  };
}

/* ------------------------------------------------------ simulated cooks */

/** xorshift, for the simulated cooks: seeded, so every run draws the same
 *  eggs. The same generator as src/core/infer.ts's, as a closure. */
export function rng(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5; s |= 0;
    return ((s >>> 0) % 16777216) / 16777216;
  };
}

/** The index a uniform `u` falls in, of categories with these probabilities. */
export function draw(probs: number[], u: number): number {
  let acc = 0;
  for (let k = 0; k < probs.length; k++) {
    acc += probs[k];
    if (u < acc) return k;
  }
  return probs.length - 1;
}

/** A record of a 68 g egg cooked for `t` s in `setup`, pulled by the alarm,
 *  with these answers. */
export function recordAt(
  level: number, t: number, yolk: Feedback | null, white: WhiteReport | null, setup = appSetup(),
): EggRecord {
  return {
    v: 1, uid: null, day: '2026-09-28', app: 'web', appVersion: '0.2.0', prior: PRIOR_ID, model: null,
    egg: { mass_g: 68, massFrom: 'class', sizeTable: 'eu' },
    setup: {
      startMode: setup.startMode, eggStart_C: setup.eggStart_C, eggFrom: 'fridge',
      ambient_C: setup.ambient_C, boiling_C: setup.boiling_C, timeToBoil_s: setup.timeToBoil_s,
      timeToBoilFrom: 'default', cooling: setup.cooling, afterBoil: setup.afterBoil ?? 'hold',
      waterLitres: setup.waterLitres, eggCount: setup.eggCount,
    },
    level: level, recommended_s: t, nudge_s: 0, pulled_s: t, pulledBy: 'timeout', cooled_s: 180,
    yolk: yolk, white: white, probe: null, forecast: null, lang: 'en', register: 'modern', units: 'metric',
  };
}

/** What a posterior that KNOWS its cook is built from. */
export interface Knowing {
  /** How many particles: the prior's, seeded with CALIBRATION_SEED. */
  particles: number;
  eggsLogged: number;
  /** Where the taste sits, in decades of yolk dose; 0 by default. */
  taste?: number;
  /** Where the white sits, in decades of white dose; 0 by default. */
  white?: number;
  /** The time-scale's centre, as a factor on the literature's; 1 by default. */
  alphaFactor?: number;
}

/** A posterior that KNOWS: the time-scale to 2%, the taste and the white to a
 *  twentieth of a decade, around the centres given. Built from a real prior
 *  so the noise and the firm gap are the prior's. */
export function knowing(k: Knowing): Calibration {
  const taste = k.taste ?? 0;
  const white = k.white ?? 0;
  const alphaFactor = k.alphaFactor ?? 1;
  const post = createPrior(k.particles, CALIBRATION_SEED);
  for (let i = 0; i < post.particles.length; i++) {
    const p = post.particles[i];
    const z = Math.log(p.alpha_m2s / ALPHA_DEFAULT) / ALPHA_REL_SD;
    post.particles[i] = {
      ...p,
      alpha_m2s: ALPHA_DEFAULT * alphaFactor * Math.exp(0.02 * z),
      logDoseOffset: taste + 0.05 * p.logDoseOffset / 0.22,
      whiteOffset: white + 0.05 * p.whiteOffset / 0.5,
    };
  }
  return { posterior: post, eggsLogged: k.eggsLogged };
}

/** A decision surface for this calibration and pot at a third of the
 *  production one's cost: its extent, at 9 rows and 20 s columns where the
 *  app has 13 and 10. What a test checks is what the choice does, which a
 *  second either way does not change; `npm run decide` measures the
 *  production surface against a fine one. */
export function gridFor(c: Calibration, egg: Egg, setup: CookSetup): DoseGrid {
  const q = decisionGridRequest(decisionInputs(c, egg, setup));
  const count = Math.ceil((q.spec.timeMax_s - q.spec.timeMin_s) / 20) + 1;
  return buildRequestedGrid({
    ...q, spec: { ...q.spec, alphaCount: 9, timeMax_s: q.spec.timeMin_s + 20 * (count - 1), timeCount: count },
  });
}
