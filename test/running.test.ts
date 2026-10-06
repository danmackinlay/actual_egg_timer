/**
 * A running cook (src/core/running.ts; design/one-screen.md section 3 and 4):
 * a cook is its start, its choices and what it observed, and everything else
 * is derived. fixtures/running.json holds iOS to the same arithmetic; what is
 * checked here is the reasoning.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { SIZE_CLASSES } from '../src/core/geometry.js';
import { START_TEMP_PRESETS_C } from '../src/core/policy.js';
import { T_ROOM_C } from '../src/core/constants.js';
import {
  CookChoices, RunningCook, cookSetupOf, corrected, latestStart_s, readRunningCook, startCook, startCorrected,
  withBoil,
} from '../src/core/running.js';

const START_MS = 1791363600000;
const S = START_MS / 1000;

const CHOICES: CookChoices = {
  mass_kg: SIZE_CLASSES[2].mass_kg, massFrom: 'class', sizeTable: 'eu', eggFrom: 'fridge', customStart_C: 12,
  room_C: null, startMode: 'cold', afterBoil: 'hold', cooling: 'ice', waterLitres: 2, eggCount: 2,
  altitude_m: 0, level: 0.41,
};

function cookOf(over: Partial<CookChoices> = {}, nudge_s = 0): RunningCook {
  return startCook(START_MS, { ...CHOICES, ...over }, nudge_s, { '2.0': 480 }, 'metric', 'en');
}

test('1. the egg and the pot: the presets, a measured room, and the room an egg sitting out is', () => {
  const fridge = cookSetupOf(CHOICES, 480).setup;
  assert.equal(fridge.eggStart_C, START_TEMP_PRESETS_C.fridge);
  assert.equal(fridge.ambient_C, T_ROOM_C, 'a fridge egg says nothing about the room');
  assert.ok(Math.abs(fridge.boiling_C - 100) < 0.01, "sea level");
  assert.equal(fridge.timeToBoil_s, 480);
  const measured = cookSetupOf({ ...CHOICES, room_C: 26 }, 480).setup;
  assert.deepEqual([measured.eggStart_C, measured.ambient_C], [START_TEMP_PRESETS_C.fridge, 26]);
  const sittingOut = cookSetupOf({ ...CHOICES, eggFrom: 'room', room_C: 26 }, 480).setup;
  assert.deepEqual([sittingOut.eggStart_C, sittingOut.ambient_C], [26, 26]);
  const own = cookSetupOf({ ...CHOICES, eggFrom: 'custom', customStart_C: 17 }, 480).setup;
  assert.deepEqual([own.eggStart_C, own.ambient_C], [17, 17], 'an egg at 17 C has been sitting out');
  assert.ok(cookSetupOf({ ...CHOICES, altitude_m: 2400 }, 480).setup.boiling_C < 93);
  assert.equal(cookSetupOf(CHOICES, 480).egg.mass_kg, SIZE_CLASSES[2].mass_kg);
  assert.deepEqual(Object.keys(fridge), [
    'startMode', 'afterBoil', 'eggStart_C', 'ambient_C', 'boiling_C', 'timeToBoil_s', 'cooling', 'waterLitres', 'eggCount',
  ], 'in the order the web keys its decision surfaces by');
});

test('2. the boil is tapped once, on a cold start still heating, and not before the start', () => {
  const cold = cookOf();
  const tapped = withBoil(cold, S + 500);
  assert.equal(tapped.events.boilAt_s, S + 500);
  assert.equal(withBoil(tapped, S + 510), tapped, 'a second tap');
  const hot = cookOf({ startMode: 'hot' });
  assert.equal(withBoil(hot, S + 60), hot);
  assert.equal(withBoil(cold, S - 1), cold);
  const out = { ...cold, events: { ...cold.events, pulled: { due_s: S + 800, out_s: S + 805, by: 'cook' as const } } };
  assert.equal(withBoil(out, S + 900), out);
});

test('3. a correction keeps the start and the events, and says since when the cook was told cold', () => {
  const tapped = withBoil(cookOf(), S + 500);
  assert.equal(tapped.coldSince_s, S, 'cold from the start');
  const heavier = corrected(tapped, { ...CHOICES, mass_kg: 0.076 }, S + 600);
  assert.deepEqual([heavier.startedAt_s, heavier.events, heavier.coldSince_s], [S, tapped.events, S]);
  const boiling = corrected(tapped, { ...CHOICES, startMode: 'hot' }, S + 600);
  assert.equal(boiling.events.boilAt_s, S + 500, 'the tap is kept, unread');
  assert.equal(boiling.coldSince_s, null);
  const back = corrected(boiling, CHOICES, S + 610);
  assert.equal(back.events.boilAt_s, S + 500);
  assert.equal(back.coldSince_s, S + 610, 'told cold again only now');
  const owner = corrected(cookOf({ startMode: 'hot' }), CHOICES, S + 240);
  assert.equal(owner.coldSince_s, S + 240, "the owner's case: boiling corrected to cold");
});

test('4. the start is corrected to no later than now or the first event, an unread one included', () => {
  const cold = cookOf();
  assert.equal(latestStart_s(cold, S + 200), S + 200);
  assert.equal(startCorrected(cold, S - 120, S + 200)?.startedAt_s, S - 120);
  assert.equal(startCorrected(cold, S + 200, S + 200)?.startedAt_s, S + 200, 'to now itself');
  assert.equal(startCorrected(cold, S + 200.5, S + 200), null);
  assert.equal(startCorrected(cold, Number.NaN, S + 200), null);
  const tapped = withBoil(cold, S + 500);
  assert.equal(latestStart_s(tapped, S + 700), S + 500);
  assert.equal(startCorrected(tapped, S + 501, S + 700), null);
  const unread = corrected(tapped, { ...CHOICES, startMode: 'hot' }, S + 600);
  assert.equal(startCorrected(unread, S + 501, S + 700), null, 'changing back would read a tap before the start');
  const corrected2 = startCorrected(tapped, S - 60, S + 700);
  assert.equal(corrected2?.id_ms, START_MS, 'the id never moves');
});

test('5. a stored cook is read whole, or not at all', () => {
  const tapped = withBoil(cookOf({}, 4), S + 500);
  const stages: RunningCook[] = [
    cookOf(), tapped,
    { ...tapped, events: { ...tapped.events, pulled: { due_s: S + 850, out_s: S + 858, by: 'cook' }, cooledAt_s: S + 1030 } },
    corrected(tapped, { ...CHOICES, startMode: 'hot', massFrom: 'scale', sizeTable: null, room_C: 22 }, S + 600),
  ];
  for (const cook of stages) {
    assert.deepEqual(readRunningCook(JSON.parse(JSON.stringify(cook))), cook);
  }
  const raw = JSON.parse(JSON.stringify(stages[2])) as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    const damaged = { ...raw };
    delete damaged[key];
    assert.equal(readRunningCook(damaged), null, `without ${key}`);
  }
  // The 0.4 cook (`aet.cook.v2`'s machine and ticket) is not a running cook.
  assert.equal(readRunningCook({ machine: { phase: 'COOKING' }, ticket: {}, answers: 'none' }), null);
  const early = JSON.parse(JSON.stringify(tapped)) as RunningCook;
  early.events.boilAt_s = S - 1;
  assert.equal(readRunningCook(early), null, 'a boil before the start');
});
