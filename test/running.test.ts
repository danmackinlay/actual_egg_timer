/**
 * A running cook (src/core/running.ts):
 * a cook is its start, its choices and what it observed, and everything else
 * is derived. fixtures/running.json holds iOS to the same arithmetic; what is
 * checked here is the reasoning. Here, the cook and its moves, and the plan;
 * runningLate, runningMemo and runningAsRan.test.ts hold the rest, and
 * test/cooks.ts the cooks they share.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { SIZE_CLASSES } from '../src/core/geometry.ts';
import { START_TEMP_PRESETS_C } from '../src/core/inputs.ts';
import { T_ROOM_C } from '../src/core/constants.ts';
import { decisionInputs } from '../src/core/decide.ts';
import { recordFor } from '../src/core/record.ts';
import {
  PULL_GRACE_SECONDS, type RunningCook, SLOW_HOB_EXTRA_S, boilToRemember, cookSetupOf, corrected, eventsDue,
  guessLengthened, latestStart_s, phaseAt, replan, startCorrected, withBoil, withOut, writeEvents,
} from '../src/core/running.ts';
import { type RecordContext, cookEnding, cookFactsFor, keepAsRan } from '../src/core/asRan.ts';
import { readRunningCook } from '../src/ui/storedCook.ts';
import { START_MS, S, CHOICES, C, asRanAgain, cookOf, factsOf, planned, surfaceFor } from './cooks.ts';

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
  const out = writeEvents(cold, { ...cold.events, pulled: { due_s: S + 800, out_s: S + 805, by: 'cook' as const, confirmed: true } });
  assert.equal(withBoil(out, S + 900), out);
});

test('3. a correction keeps the start and the events; the tap is read by when the cook was told cold', () => {
  const tapped = withBoil(cookOf(), S + 500);
  const remembered = { litres: 2, seconds: 500 };
  assert.deepEqual(boilToRemember(tapped), remembered, 'cold from the start: the tap is the boil');
  const heavier = corrected(tapped, { ...CHOICES, mass_kg: 0.076 }, S + 600);
  assert.deepEqual([heavier.startedAt_s, heavier.events, boilToRemember(heavier)], [S, tapped.events, remembered]);
  const boiling = corrected(tapped, { ...CHOICES, startMode: 'hot' }, S + 600);
  assert.equal(boiling.events.boilAt_s, S + 500, 'the tap is kept, unread');
  assert.equal(boilToRemember(boiling), null, 'said boiling: nothing to remember');
  const back = corrected(boiling, CHOICES, S + 610);
  assert.equal(back.events.boilAt_s, S + 500);
  assert.deepEqual(boilToRemember(back), remembered, 'told cold again, but the tap came before the choices first said boiling');
  assert.deepEqual(
    boilToRemember(corrected(corrected(back, { ...CHOICES, startMode: 'hot' }, S + 620), CHOICES, S + 630)), remembered,
    'only the first boiling counts',
  );
  // The owner's case: begun boiling, corrected to cold at 240 s, tapped at 600 s.
  const owner = withBoil(corrected(cookOf({ startMode: 'hot' }), CHOICES, S + 240), S + 600);
  assert.deepEqual(boilToRemember(owner), { litres: 2, seconds: 600 }, 'watched from the correction to cold');
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
    writeEvents(tapped, { ...tapped.events, pulled: { due_s: S + 850, out_s: S + 858, by: 'cook', confirmed: true }, cooledAt_s: S + 1030 }),
    corrected(tapped, { ...CHOICES, startMode: 'hot', massFrom: 'scale', sizeTable: null, room_C: 22 }, S + 600),
  ];
  for (const cook of stages) {
    assert.deepEqual(readRunningCook(JSON.parse(JSON.stringify(cook))), cook);
  }
  // What is read is the press, the start and the log; the cook as it stood
  // is the log folded again, whatever was written beside it.
  const raw = JSON.parse(JSON.stringify(stages[2])) as Record<string, unknown>;
  for (const key of ['id_ms', 'nudge_s', 'boilMemory', 'units', 'lang', 'start', 'log']) {
    const damaged = { ...raw };
    delete damaged[key];
    assert.equal(readRunningCook(damaged), null, `without ${key}`);
  }
  for (const key of ['startedAt_s', 'choices', 'events', 'correctedAt_s', 'asRan']) {
    const without = { ...raw };
    delete without[key];
    assert.deepEqual(readRunningCook(without), stages[2], `${key} is the log's`);
  }
  // The 0.4 cook (`aet.cook.v2`'s machine and ticket) is not a running cook,
  // nor is 0.5's before the log (`aet.cook.v4`).
  assert.equal(readRunningCook({ machine: { phase: 'COOKING' }, ticket: {}, answers: 'none' }), null);
  const { start: _start, log: _log, ...unlogged } = tapped;
  assert.equal(readRunningCook(JSON.parse(JSON.stringify(unlogged))), null);
  const early = JSON.parse(JSON.stringify(tapped)) as RunningCook;
  early.log[0] = { kind: 'boil', at_s: S - 1 };
  assert.equal(readRunningCook(early), null, 'a boil before the start');
  const unknown = JSON.parse(JSON.stringify(tapped)) as { log: unknown[] };
  unknown.log.push({ kind: 'later', at_s: S + 600 });
  assert.equal(readRunningCook(unknown), null, 'an entry this build does not know');
});

/* ---------------------------------------------------------------- the plan */

test('6. with nothing corrected, a plan is the cook it started: its time decided on its own surface', () => {
  const hot = cookOf({ startMode: 'hot' }, 4);
  const interim = replan(hot, C, null, 0, S + 30);
  assert.equal(interim.decided, null, 'no surface, nothing decided');
  assert.deepEqual(interim.inputs, decisionInputs(C, interim.egg, interim.setup));
  const p = replan(hot, C, surfaceFor(interim), 0, S + 30);
  assert.ok(p.decided !== null);
  assert.equal(p.cookTime_s, p.decided.solution.result.cookTime_s);
  assert.equal(p.nudge_s, 4);
  assert.ok(p.certainty !== null && p.forecast !== null);
  assert.equal(p.forecast.cook_s, p.cookTime_s);
  assert.equal(phaseAt(p.deadlines, S + 30), 'COOKING');
  // Until the surface lands, the lean carried: the time the app was showing.
  const carried = replan(hot, C, null, p.lean_s, S + 30);
  assert.ok(Math.abs(carried.cookTime_s - p.cookTime_s) < 1e-9);
  // Another pot's surface is not read.
  const other = surfaceFor(replan(cookOf({ startMode: 'hot', mass_kg: 0.058 }), C, null, 0, S));
  assert.equal(replan(hot, C, other, 0, S + 30).decided, null);
});

test('7. changing a setting back gives back the old plan exactly', () => {
  const tapped = withBoil(cookOf(), S + 500);
  const p = planned(tapped, S + 600);
  const heavier = corrected(tapped, { ...CHOICES, mass_kg: 0.076 }, S + 600);
  assert.ok(planned(heavier, S + 600).cookTime_s > p.cookTime_s, 'a heavier egg takes longer');
  const back = corrected(heavier, CHOICES, S + 610);
  assert.deepEqual(planned(back, S + 610), p);
  const boiling = corrected(tapped, { ...CHOICES, startMode: 'hot' }, S + 620);
  assert.equal(planned(boiling, S + 620).setup.startMode, 'hot');
  assert.deepEqual(planned(corrected(boiling, CHOICES, S + 630), S + 630), p, 'the tap read again');
});

test("8. the owner's case: boiling corrected to cold goes back to heating, later than before", () => {
  const hot = cookOf({ startMode: 'hot' });
  const before = planned(hot, S + 240);
  const cold = corrected(hot, CHOICES, S + 240);
  const after = planned(cold, S + 240);
  assert.equal(phaseAt(after.deadlines, S + 240), 'HEATING');
  assert.ok(after.deadlines.provisional && after.deadlines.cookEnd_s > before.deadlines.cookEnd_s);
  assert.equal(phaseAt(planned(withBoil(cold, S + 500), S + 500).deadlines, S + 500), 'COOKING');
});

test('9. a correction that makes the egg overdue pulls it then; back within the grace, and it cooks on', () => {
  const hot = cookOf({ startMode: 'hot' });
  const p = planned(hot, S + 60);
  const end = p.deadlines.cookEnd_s;
  const lighter = corrected(hot, { ...CHOICES, startMode: 'hot', mass_kg: 0.048 }, end - 20);
  const overdue = planned(lighter, end - 20);
  assert.equal(overdue.overdue, true);
  assert.equal(overdue.deadlines.cookEnd_s, end - 20, 'the pull is the moment of the correction');
  assert.equal(phaseAt(overdue.deadlines, end - 20), 'PULL');
  // Planned again later in the grace - a reload, a surface landing - it is
  // the same pull, not one at the later moment.
  assert.equal(planned(lighter, end - 12).deadlines.cookEnd_s, end - 20);
  const undone = planned(corrected(lighter, { ...CHOICES, startMode: 'hot' }, end - 10), end - 10);
  assert.equal(undone.overdue, false);
  assert.equal(phaseAt(undone.deadlines, end - 10), 'COOKING');
  assert.ok(Math.abs(undone.deadlines.cookEnd_s - end) < 1e-6);
  // Left alone, the grace runs out and the pull is written where it rang.
  const due = eventsDue(lighter, overdue, end - 20 + PULL_GRACE_SECONDS);
  assert.deepEqual(due.pulled, { due_s: end - 20, out_s: end - 20 + PULL_GRACE_SECONDS, by: 'timeout', confirmed: false });
});

test('10. an ordinary pull, planned again after its grace ran out, is where it was', () => {
  const hot = cookOf({ startMode: 'hot' });
  const p = planned(hot, S + 60);
  const end = p.deadlines.cookEnd_s;
  // A phone asleep through the pull plans again on waking.
  const late = planned(hot, end + 3600);
  assert.equal(late.overdue, false);
  assert.equal(late.deadlines.cookEnd_s, end);
  const events = eventsDue(hot, late, end + 3600);
  assert.deepEqual(events.pulled, { due_s: end, out_s: end + PULL_GRACE_SECONDS, by: 'timeout', confirmed: false });
  assert.equal(events.cooledAt_s, late.deadlines.coolEnd_s);
  // The cook's own tap, only in the pull.
  assert.equal(withOut(hot, p, end - 1), hot);
  assert.deepEqual(withOut(hot, p, end + 5).events.pulled, { due_s: end, out_s: end + 5, by: 'cook', confirmed: true });
});

test("11. the slow hob's rule, a function of how long the pan has heated", () => {
  const cold = cookOf();
  const p = replan(cold, C, null, 0, S + 60);
  const at = p.slowHobAt_s as number;
  assert.ok(Math.abs(at - (p.deadlines.cookEnd_s - 45)) < 1e-6, 'when the pull would come within 45 s');
  assert.equal(guessLengthened(replan(cold, C, null, 0, at - 0.1)), false);
  const longer = replan(cold, C, null, 0, at + 0.1);
  assert.equal(guessLengthened(longer), true);
  assert.equal(longer.inputs, null, 'a guess that moves asks for no surface');
  assert.ok(Math.abs(longer.setup.timeToBoil_s - (at - S + SLOW_HOB_EXTRA_S)) < 1e-6);
  assert.ok(longer.deadlines.cookEnd_s > at + 45, 'the pull is pushed out');
  // The tap ends the guess.
  assert.equal(replan(withBoil(cold, at + 1), C, null, 0, at + 1).deadlines.provisional, false);
  // A hot start has no ramp to guess.
  assert.equal(replan(cookOf({ startMode: 'hot' }), C, null, 0, S + 3000).slowHobAt_s, null);
});

test('12. after the pull, a correction changes what the time did to the egg, not the time', () => {
  const hot = cookOf({ startMode: 'hot' });
  const p = planned(hot, S + 60);
  const end = p.deadlines.cookEnd_s;
  const out = withOut(hot, p, end + 4);
  const cooling = planned(out, end + 30);
  const lighter = corrected(out, { ...CHOICES, startMode: 'hot', mass_kg: 0.048 }, end + 30);
  const q = planned(lighter, end + 30);
  assert.equal(q.cookTime_s, cooling.cookTime_s);
  assert.ok(q.cool_s < cooling.cool_s, 'a smaller egg peaks sooner');
  assert.equal(q.deadlines.coolEnd_s, end + 4 + q.cool_s);
  // Corrected so late that its counted end has passed: Done at once, with the
  // counted time, not a cooling stretched to the correction.
  const lateAt = end + 4 + q.cool_s + 10;
  const late = planned(corrected(out, { ...CHOICES, startMode: 'hot', mass_kg: 0.048 }, lateAt), lateAt);
  assert.deepEqual([late.deadlines.coolEnd_s, late.cool_s], [end + 4 + q.cool_s, q.cool_s]);
  assert.equal(phaseAt(late.deadlines, lateAt), 'DONE');
  // On the counter nothing is counted, and the cooling ended is kept, unread.
  const done = writeEvents(out, eventsDue(out, cooling, end + 1000));
  const counter = corrected(done, { ...CHOICES, startMode: 'hot', cooling: 'counter' }, end + 1000);
  assert.equal(planned(counter, end + 1000).deadlines.coolEnd_s, null);
  assert.equal(eventsDue(counter, planned(counter, end + 1000), end + 2000).cooledAt_s, done.events.cooledAt_s);
});

test('13. the record is the cook as last corrected, at the time that ran', () => {
  const ctx: RecordContext = { app: 'web', appVersion: '0.5.0-alpha.1', prior: '2026-09', day: '2026-10-07', id: START_MS };
  const tapped = withBoil(cookOf({}, 5), S + 500);
  const p = planned(tapped, S + 600);
  const end = p.deadlines.cookEnd_s;
  const tappedOut = withOut(tapped, p, end + 6);
  const outPlan = planned(tappedOut, end + 6);
  const out = keepAsRan(tappedOut, outPlan);
  const cooled = writeEvents(out, eventsDue(out, outPlan, end + 1000));
  const stale = corrected(cooled, { ...CHOICES, level: 0.62 }, end + 1000);
  const q = planned(stale, end + 1000);
  // The plan as it ran, kept at the tap out, is the uncorrected cook's: no
  // facts until the correction is planned on the calibration before this egg.
  assert.deepEqual(cookFactsFor(stale, q, ctx, 'fudgy', 'firm', null), { facts: null, refused: 'stale' });
  const firmer = asRanAgain(stale, end + 1000);
  const r = recordFor(factsOf(firmer, q, ctx, 'fudgy', 'firm', null));
  assert.equal(r.level, 0.41, 'the level the egg was pulled at: after the pull the slider only previews');
  assert.equal(r.setup.cooling, 'ice');
  assert.ok(Math.abs(r.recommended_s + r.nudge_s - (end - S)) < 1e-6, 'the time that ran, not re-solved');
  assert.equal(r.nudge_s, 5);
  assert.deepEqual([r.pulledBy, r.pulled_s], ['cook', end + 6 - S]);
  assert.equal(r.setup.timeToBoil_s, 500, 'the measured ramp');
  assert.equal(r.setup.timeToBoilFrom, 'measured');
  assert.ok(r.forecast !== null && r.forecast.cook_s === q.cookTime_s, 'the forecast for this cook at that time');
  assert.equal(r.cooled_s, (cooled.events.cooledAt_s as number) - (end + 6));
  assert.equal(r.id, START_MS);
  // On iOS, no id.
  assert.equal('id' in recordFor(factsOf(firmer, q, { ...ctx, app: 'ios', id: null }, null, null, null)), false);
  // Ended: the boil it measured, and an egg to log.
  assert.deepEqual(cookEnding(firmer, q, end + 1000), { boil: { litres: 2, seconds: 500 }, finished: true, remake: false });
  assert.equal(cookEnding(tapped, p, S + 600).finished, false, 'cancelled while it cooks');
});

test('14. the boil memory learns the tap the cook was watching for, and only that', () => {
  const cold = cookOf();
  assert.deepEqual(boilToRemember(withBoil(cold, S + 512)), { litres: 2, seconds: 512 });
  assert.equal(boilToRemember(cold), null);
  const hot = cookOf({ startMode: 'hot' });
  assert.equal(boilToRemember(hot), null);
  const early = withBoil(corrected(hot, CHOICES, S + 300), S + 520);
  assert.deepEqual(boilToRemember(early), { litres: 2, seconds: 520 }, 'told cold before it could have boiled');
  const late = withBoil(corrected(hot, CHOICES, S + 481), S + 700);
  assert.equal(boilToRemember(late), null, 'told cold after the 480 s this water takes: used, not remembered');
  assert.equal(planned(late, S + 700).setup.timeToBoil_s, 480, 'and the cook runs on the remembered time');
  assert.equal(planned(early, S + 520).setup.timeToBoil_s, 520, 'a tap the cook watched for is the ramp');
  const unread = corrected(withBoil(cold, S + 512), { ...CHOICES, startMode: 'hot' }, S + 600);
  assert.equal(boilToRemember(unread), null);
});
