/**
 * The cooks the running tests share (test/running*.test.ts): the cook they
 * start from, a calibration that knows it a little, and planning on a surface
 * as an app does.
 */

import assert from 'node:assert/strict';

import { SIZE_CLASSES } from '../src/core/geometry.ts';
import type { CookFacts, ProbeReading } from '../src/core/record.ts';
import type { WhiteReport, YolkWord } from '../src/core/infer.ts';
import {
  type CookChoices, type CookPlan, type CookSurface, type RunningCook, replan, startCook,
} from '../src/core/running.ts';
import { type RecordContext, asRanCorrected, cookFactsFor } from '../src/core/asRan.ts';
import { gridFor, knowing } from '../tools/common.ts';

export const START_MS = 1791363600000;
export const S = START_MS / 1000;

export const CHOICES: CookChoices = {
  mass_kg: SIZE_CLASSES[2].mass_kg, massFrom: 'class', sizeTable: 'eu', eggFrom: 'fridge', customStart_C: 12,
  room_C: null, startMode: 'cold', afterBoil: 'hold', cooling: 'ice', tapWater_C: null, bowlLitres: 2, bowlWater_C: null, waterLitres: 2, eggCount: 2,
  altitude_m: 0, level: 0.41,
};

export function cookOf(over: Partial<CookChoices> = {}, nudge_s = 0): RunningCook {
  return startCook(S, { ...CHOICES, ...over }, nudge_s, { '2.0': 480 }, 'metric', 'en');
}

/** A cook the model knows a little: four eggs, a taste a tenth firmer. */
export const C = knowing({ particles: 200, eggsLogged: 4, taste: 0.1 });

/** The surface for the pot a plan wants, as an app would build it. */
export function surfaceFor(plan: CookPlan): CookSurface {
  if (plan.inputs === null) throw new Error('no surface wanted');
  return { inputs: plan.inputs, grid: gridFor(C, plan.inputs.egg, plan.inputs.setup), profile: null };
}

/** The plan, on its own surface. */
export function planned(cook: RunningCook, now_s: number, hint = 0): CookPlan {
  const first = replan(cook, C, null, hint, now_s);
  return first.inputs === null ? first : replan(cook, C, surfaceFor(first), hint, now_s);
}

/** The facts, which core must not refuse here. */
export function factsOf(
  cook: RunningCook, plan: CookPlan, ctx: RecordContext, yolk: YolkWord | null, white: WhiteReport | null,
  probe: ProbeReading | null,
): CookFacts {
  const made = cookFactsFor(cook, plan, ctx, yolk, white, probe);
  assert.ok(made.facts !== null && made.refused === null, `refused: ${made.refused}`);
  return made.facts;
}

/** A correction after the pull, planned again on the calibration before this
 *  egg (here, the one calibration), on that calibration's surface. */
export function asRanAgain(cook: RunningCook, now_s: number): RunningCook {
  assert.equal(asRanCorrected(cook, C, null, now_s), null, 'not without the surface');
  const again = asRanCorrected(cook, C, surfaceFor(replan(cook, C, null, 0, now_s)), now_s);
  assert.ok(again !== null);
  return again;
}

/** The context the web's record is made in. */
export const CTX: RecordContext = { app: 'web', appVersion: '0.5.0-alpha.1', prior: '2026-09', day: '2026-10-07', id: START_MS };
