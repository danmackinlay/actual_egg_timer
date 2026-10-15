/**
 * What the reach tests share (test/reach*.test.ts): the egg and its pots,
 * what the app does at a level, profile points, and two calibrations.
 */

import assert from 'node:assert/strict';

import type { DoseGrid } from '../src/core/doseGrid.ts';
import { createPrior } from '../src/core/infer.ts';
import { eggFromMass } from '../src/core/geometry.ts';
import type { CookSetup } from '../src/core/protocol.ts';
import { CALIBRATION_SEED, type Calibration } from '../src/core/record.ts';
import { type LevelOdds, type OddsProfile, answerAt, decideAnswer } from '../src/core/reach.ts';
import { appSetup, knowing } from '../tools/common.ts';

export const EGG = eggFromMass(0.068);

export const SETUP = appSetup();
export const COUNTER = appSetup({ cooling: 'counter' });
export const PARTICLES = 400;

/** What the app does at a level, verdict and snap and warning and all, with
 *  the profile or without it: the time held by the profile's envelope, as the
 *  apps hold it (`decideAnswer`, with no nudge). */
export function appAt(c: Calibration, grid: DoseGrid, setup: CookSetup, level: number, profile: OddsProfile | null) {
  const a = answerAt(c, EGG, setup, level, profile);
  return {
    verdict: a.verdict, level: a.level, lowOdds: a.lowOdds,
    decision: decideAnswer(c, EGG, setup, grid, a.solution, a.level, profile, 0).decision,
  };
}

/** A point made by hand: its odds, and a class and a chance of the word asked
 *  that the hand-made tests below do not read. */
export function point(level: number, cookTime_s: number, odds: number, pAsked = 0.5): LevelOdds {
  return { level: level, cookTime_s: cookTime_s, odds: odds, pAsked: pAsked, certainty: 'ballpark' };
}

/** The profile point at a level, which a bisection put there or the grid did. */
export function pointAt(p: OddsProfile, level: number): LevelOdds {
  const found = p.points.find((q) => Math.abs(q.level - level) < 1e-9);
  assert.ok(found !== undefined, `no point at ${level}`);
  return found;
}

export const FRESH: Calibration = { posterior: createPrior(PARTICLES, CALIBRATION_SEED), eggsLogged: 0 };
/** A cook whose white needs 0.4 decades more than the literature's: the soft
 *  end is white-bound and its odds fall. */
export const WHITE_BOUND = knowing({ particles: PARTICLES, eggsLogged: 4, white: 0.4 });
