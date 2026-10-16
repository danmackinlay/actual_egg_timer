/**
 * The record: the pull, and the rest of the record, from a running cook.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CALIBRATION_SEED, type EggRecord, MODEL_ID, PARTICLE_COUNT, freshCalibration, parseRecord, recordCookTime_s, replay,
} from '../src/core/record.ts';
import type { WhiteReport, YolkWord } from '../src/core/infer.ts';
import type { BoilMemory } from '../src/core/boil.ts';
import {
  type CookChoices, type CookPlan, PULL_GRACE_SECONDS, type RunningCook, cookTooOld, eventsDue, phaseAt, replan,
  startCook, withBoil, withOut, writeEvents,
} from '../src/core/running.ts';
import { cookEnding } from '../src/core/asRan.ts';
import { readRunningCook } from '../src/ui/storedCook.ts';
import { type Learner, openLearner } from '../src/ui/calibration.ts';
import { gridFor, knowing, webRecordFor } from '../tools/common.ts';
import { assertIdentical, storage } from './records.ts';

/** The page under test, as boot() opens it: opened again for a reload. */
let cal: Learner;

// --------------------------------------------------------------------------
// 4. The pull, and the rest of the record, from a running cook
// --------------------------------------------------------------------------

const T0 = 1_750_000_000_000;
const S0 = T0 / 1000;
const C4 = knowing({ particles: 200, eggsLogged: 0 });
const CHOICES: CookChoices = {
  mass_kg: 0.062, massFrom: 'scale', sizeTable: null, eggFrom: 'fridge', customStart_C: 12, room_C: null,
  startMode: 'hot', afterBoil: 'hold', cooling: 'ice', tapWater_C: null, bowlLitres: 2, bowlWater_C: null, waterLitres: 2, eggCount: 2, altitude_m: 0, level: 0.4,
};

function cookOf(over: Partial<CookChoices> = {}, nudge_s = 0, memory: BoilMemory = {}): RunningCook {
  return startCook(T0 / 1000, { ...CHOICES, ...over }, nudge_s, memory, 'metric', 'en');
}

/** The plan on its pot's surface, as an app makes it once the surface is in:
 *  a record is never made from a plan with no surface. */
function onSurface(cook: RunningCook, now_s: number): CookPlan {
  const first = replan(cook, C4, null, 0, now_s);
  const inputs = first.inputs;
  if (inputs === null) return first;
  return replan(cook, C4, { inputs: inputs, grid: gridFor(C4, inputs.egg, inputs.setup), profile: null }, 0, now_s);
}

/** The record, which a plan on its surface always makes. */
function rec(
  cook: RunningCook, plan: CookPlan, yolk: YolkWord | null, white: WhiteReport | null = null,
): EggRecord {
  const r = webRecordFor(cook, plan, yolk, white);
  assert.ok(r !== null, 'a record');
  return r;
}

/** The cook planned at `now_s`, with what the clock decided by then. */
function ranTo(cook: RunningCook, now_s: number): { cook: RunningCook; plan: CookPlan } {
  const plan = onSurface(cook, now_s);
  const next = writeEvents(cook, eventsDue(cook, plan, now_s));
  return { cook: next, plan: onSurface(next, now_s) };
}

test('4a. the cook\'s tap out of PULL is recorded as a measured pull', () => {
  const cook = cookOf();
  const plan = onSurface(cook, S0);
  const pull = plan.deadlines.cookEnd_s;
  const tapped = withOut(cook, plan, pull + 9.5);
  assert.equal(tapped.events.pulled?.by, 'cook');
  const r = rec(tapped, onSurface(tapped, pull + 9.5), 'jammy');
  assert.ok(Math.abs(r.pulled_s - (plan.cookTime_s + 9.5)) < 1e-6);
  assert.equal(r.pulledBy, 'cook');
  assert.ok(Math.abs(r.recommended_s - plan.cookTime_s) < 0.06);
  assert.equal(r.id, T0, 'the record\'s id is when Start was pressed');
  // The yolk the cook got.
  assert.equal(r.yolkWord, 'jammy');
  assert.notEqual(parseRecord(r), null);
});

test('4b. a pull nobody confirmed is recorded as assumed, at the scheduled time', () => {
  const cook = cookOf({ cooling: 'counter', level: 0.6 });
  const plan = onSurface(cook, S0);
  const after = ranTo(cook, plan.deadlines.cookEnd_s + PULL_GRACE_SECONDS);
  assert.equal(phaseAt(after.plan.deadlines, plan.deadlines.cookEnd_s + PULL_GRACE_SECONDS), 'DONE');
  const r = rec(after.cook, after.plan, null);
  assert.equal(r.pulledBy, 'timeout');
  assert.ok(Math.abs(r.pulled_s - plan.cookTime_s) < 0.06);
  assert.equal(r.cooled_s, 0);
});

test('4b2. a class names its carton, and a weighed egg names none', () => {
  const us = cookOf({ mass_kg: 0.0602, massFrom: 'class', sizeTable: 'us' });
  const r = rec(us, onSurface(us, S0), 'jammy');
  assert.equal(r.egg.sizeTable, 'us');
  assert.equal(r.egg.mass_g, 60.2);
  assert.notEqual(parseRecord(r), null);
  const weighed = cookOf({ sizeTable: 'us' });
  assert.equal(rec(weighed, onSurface(weighed, S0), 'jammy').egg.sizeTable, null,
    'a scale has no carton, whatever the region');
  assert.equal(parseRecord({ ...r, egg: { ...r.egg, sizeTable: null } }), null);
});

test('4b3. the time to boil says whether this cook measured it', () => {
  const plain = cookOf();
  assert.equal(rec(plain, onSurface(plain, S0), 'jammy').setup.timeToBoilFrom, 'default');
  const known = cookOf({}, 0, { '2.0': 450 });
  assert.equal(rec(known, onSurface(known, S0), 'jammy').setup.timeToBoilFrom, 'remembered');
  const cold = withBoil(cookOf({ startMode: 'cold' }), S0 + 431.5);
  const r = rec(cold, onSurface(cold, S0 + 431.5), 'jammy');
  assert.equal(r.setup.timeToBoilFrom, 'measured');
  assert.equal(r.setup.timeToBoil_s, 431.5);
});

test('4b4. a nudged cook is recorded as the time recommended and the nudge, apart', () => {
  // The plan runs the nudged time; the record splits it, and scores an egg
  // nobody pulled at the time that actually ran.
  const cook = cookOf({}, -7);
  const plan = onSurface(cook, S0);
  const r = rec(cook, plan, 'jammy');
  assert.equal(r.nudge_s, -7);
  assert.ok(Math.abs(recordCookTime_s(r) - plan.cookTime_s) < 0.06);
  assert.ok(Math.abs(r.recommended_s - (plan.cookTime_s + 7)) < 0.06);
  assert.notEqual(parseRecord(r), null);
});

test('4b5. the record keeps what the app said for the cook that ran, and names the model that said it', () => {
  const cook = cookOf();
  const interim = replan(cook, C4, null, 0, S0);
  assert.equal(webRecordFor(cook, interim, 'jammy'), null, 'no surface in, nothing said: no record');
  const inputs = interim.inputs;
  assert.ok(inputs !== null);
  const surface = { inputs: inputs, grid: gridFor(C4, inputs.egg, inputs.setup), profile: null };
  const plan = replan(cook, C4, surface, 0, S0);
  const r = rec(cook, plan, 'jammy');
  assert.ok(plan.forecast !== null);
  assert.deepEqual(r.forecast, plan.forecast);
  assert.equal(r.model, MODEL_ID);
  assert.deepEqual(parseRecord(JSON.parse(JSON.stringify(r))), r);
});

test('4c. a stored cook keeps who pulled it: read back, the same record', () => {
  const cook = cookOf();
  const plan = onSurface(cook, S0);
  const out = withOut(cook, plan, plan.deadlines.cookEnd_s + 5);
  const back = readRunningCook(JSON.parse(JSON.stringify(out)));
  assert.ok(back !== null);
  const later = plan.deadlines.cookEnd_s + 60;
  assert.deepEqual(
    rec(back, onSurface(back, later), null), rec(out, onSurface(out, later), null),
  );
});

test('4d. a cook too old to pick back up is still an egg: run on to DONE, by the clock', () => {
  const later = S0 + 3 * 3600;
  const stale = ranTo(cookOf(), later);
  assert.equal(cookTooOld(stale.plan, later), true, 'not picked back up');
  assert.equal(cookEnding(stale.cook, stale.plan, later).finished, true);
  const r = rec(stale.cook, stale.plan, null);
  assert.equal(r.pulledBy, 'timeout');
  assert.ok(Math.abs(r.pulled_s - stale.plan.cookTime_s) < 0.06);
  assert.equal(r.yolkWord, null);
  assert.notEqual(parseRecord(r), null);
  // A cold start nobody said was boiling never cooked anything it could time.
  const heating = ranTo(cookOf({ startMode: 'cold' }), later);
  assert.equal(phaseAt(heating.plan.deadlines, later), 'HEATING');
  assert.equal(cookEnding(heating.cook, heating.plan, later).finished, false);
});

test('4e. the same egg logged again keeps its facts as last corrected, and the answers already given', async () => {
  storage.clear();
  cal = openLearner();
  const cook = cookOf();
  const plan = onSurface(cook, S0);
  const first = rec(cook, plan, 'jammy');
  assert.equal(cal.logEgg(first), 0);
  // The same cook, its record made again from a later plan: another
  // forecast, no answer. The answer stays; the rest is the newer record.
  const again = { ...rec(cook, plan, null), cooled_s: first.cooled_s + 10 };
  assert.equal(cal.logEgg(again), 0);
  const kept = cal.keptState().log;
  assert.equal(kept.length, 1);
  assert.equal(kept[0].yolkWord, 'jammy');
  assert.equal(kept[0].cooled_s, again.cooled_s);
  assert.equal(cal.logEgg(again), 0, 'once kept, nothing changes');
  // One already folded is folded again, from the prior: the posterior is the
  // log's replay.
  await cal.learn();
  assert.equal(cal.keptState().folded, 1);
  const corrected = { ...again, cooled_s: again.cooled_s + 30 };
  cal.logEgg(corrected);
  assert.equal(cal.keptState().folded, 0, 'to be folded again');
  await cal.learn();
  assert.equal(cal.keptState().folded, 1);
  assertIdentical(cal.keptState().calibration, replay(freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED), cal.keptState().log),
    'the corrected egg, folded once');
});
