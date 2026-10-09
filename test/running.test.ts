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
import { LIMITS, START_TEMP_PRESETS_C } from '../src/core/inputs.js';
import { T_ROOM_C } from '../src/core/constants.js';
import { decisionInputs } from '../src/core/decide.js';
import {
  CookFacts, ProbeReading, calibrationGrid, copyCalibration, foldRecord, gridRequestFor, recordFor,
} from '../src/core/record.js';
import { GridSpec, buildRequestedGrid } from '../src/core/doseGrid.js';
import { WhiteReport, YolkWord } from '../src/core/infer.js';
import {
  CookChoices, CookPlan, CookSurface, PULL_GRACE_SECONDS, RESTORE_WINDOW_S, RecordContext, RunningCook,
  SLOW_HOB_EXTRA_S, SlowHobPlace, asRanCorrected, asRanCurrent, asRanShown, boilToRemember, coldHistory, cookEnding,
  cookFactsFor, cookSetupOf, cookStillOpen, cookTooOld, coolingSecondsFor, corrected, earliestStart_s, eventsDue,
  guessLengthened, keepAsRan, latestStart_s, openEggId, phaseAt, pullStands, readRunningCook, replan, slowHobDue,
  slowHobMemoFits, solutionAsRan, startCook, startCorrected, stillIn, withAsRan, withBoil, withOut, writeEvents,
} from '../src/core/running.js';
import { gridFor, knowing, rng } from '../tools/common.js';

const START_MS = 1791363600000;
const S = START_MS / 1000;

const CHOICES: CookChoices = {
  mass_kg: SIZE_CLASSES[2].mass_kg, massFrom: 'class', sizeTable: 'eu', eggFrom: 'fridge', customStart_C: 12,
  room_C: null, startMode: 'cold', afterBoil: 'hold', cooling: 'ice', waterLitres: 2, eggCount: 2,
  altitude_m: 0, level: 0.41,
};

function cookOf(over: Partial<CookChoices> = {}, nudge_s = 0): RunningCook {
  return startCook(S, { ...CHOICES, ...over }, nudge_s, { '2.0': 480 }, 'metric', 'en');
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
  const out = writeEvents(cold, { ...cold.events, pulled: { due_s: S + 800, out_s: S + 805, by: 'cook' as const, confirmed: true } });
  assert.equal(withBoil(out, S + 900), out);
});

test('3. a correction keeps the start and the events, and says since when the cook was told cold', () => {
  const tapped = withBoil(cookOf(), S + 500);
  assert.equal(coldHistory(tapped).coldSince_s, S, 'cold from the start');
  const heavier = corrected(tapped, { ...CHOICES, mass_kg: 0.076 }, S + 600);
  assert.deepEqual([heavier.startedAt_s, heavier.events, coldHistory(heavier).coldSince_s], [S, tapped.events, S]);
  assert.equal(coldHistory(tapped).firstHotAt_s, null, 'never said boiling');
  const boiling = corrected(tapped, { ...CHOICES, startMode: 'hot' }, S + 600);
  assert.equal(boiling.events.boilAt_s, S + 500, 'the tap is kept, unread');
  assert.equal(coldHistory(boiling).coldSince_s, null);
  assert.equal(coldHistory(boiling).firstHotAt_s, S + 600);
  const back = corrected(boiling, CHOICES, S + 610);
  assert.equal(back.events.boilAt_s, S + 500);
  assert.equal(coldHistory(back).coldSince_s, S + 610, 'told cold again only now');
  assert.equal(coldHistory(back).firstHotAt_s, S + 600, 'but the tap came before the choices first said boiling (review 2.2)');
  assert.deepEqual(boilToRemember(back), boilToRemember(tapped), 'so changing back gives back the boil memory too');
  assert.equal(coldHistory(corrected(corrected(back, { ...CHOICES, startMode: 'hot' }, S + 620), CHOICES, S + 630)).firstHotAt_s, S + 600);
  const owner = corrected(cookOf({ startMode: 'hot' }), CHOICES, S + 240);
  assert.equal(coldHistory(owner).coldSince_s, S + 240, "the owner's case: boiling corrected to cold");
  assert.equal(coldHistory(owner).firstHotAt_s, S, 'begun boiling');
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

/** A cook the model knows a little: four eggs, a taste a tenth firmer. */
const C = knowing({ particles: 200, eggsLogged: 4, taste: 0.1 });

/** The surface for the pot a plan wants, as an app would build it. */
function surfaceFor(plan: CookPlan): CookSurface {
  if (plan.inputs === null) throw new Error('no surface wanted');
  return { inputs: plan.inputs, grid: gridFor(C, plan.inputs.egg, plan.inputs.setup), profile: null };
}

/** The plan, on its own surface. */
function planned(cook: RunningCook, now_s: number, hint = 0): CookPlan {
  const first = replan(cook, C, null, hint, now_s);
  return first.inputs === null ? first : replan(cook, C, surfaceFor(first), hint, now_s);
}

/** The facts, which core must not refuse here. */
function factsOf(
  cook: RunningCook, plan: CookPlan, ctx: RecordContext, yolk: YolkWord | null, white: WhiteReport | null,
  probe: ProbeReading | null,
): CookFacts {
  const made = cookFactsFor(cook, plan, ctx, yolk, white, probe);
  assert.ok(made.facts !== null && made.refused === null, `refused: ${made.refused}`);
  return made.facts;
}

/** A correction after the pull, planned again on the calibration before this
 *  egg (here, the one calibration), on that calibration's surface. */
function asRanAgain(cook: RunningCook, now_s: number): RunningCook {
  assert.equal(asRanCorrected(cook, C, null, now_s), null, 'not without the surface');
  const again = asRanCorrected(cook, C, surfaceFor(replan(cook, C, null, 0, now_s)), now_s);
  assert.ok(again !== null);
  return again;
}

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
  assert.equal(planned(late, S + 700).setup.timeToBoil_s, 480, 'and the cook runs on the remembered time (review 1.2)');
  assert.equal(planned(early, S + 520).setup.timeToBoil_s, 520, 'a tap the cook watched for is the ramp');
  const unread = corrected(withBoil(cold, S + 512), { ...CHOICES, startMode: 'hot' }, S + 600);
  assert.equal(boilToRemember(unread), null);
});

/* ----------------------------- archive/design/one-screen-review.md's calls */

const CTX: RecordContext = { app: 'web', appVersion: '0.5.0-alpha.1', prior: '2026-09', day: '2026-10-07', id: START_MS };

test('15. review 1.1: a pull the clock assumed stays open, and a correction that would pull later asks', () => {
  const hot = cookOf({ startMode: 'hot' });
  const p = planned(hot, S + 1);
  const due = p.deadlines.cookEnd_s;
  const late = writeEvents(hot, eventsDue(hot, p, due + 21));
  assert.deepEqual(late.events.pulled, { due_s: due, out_s: due + PULL_GRACE_SECONDS, by: 'timeout', confirmed: false });
  // The owner's case, 30 s after the pull was due: not Cooling unasked.
  const owner = corrected(late, CHOICES, due + 30);
  const asked = planned(owner, due + 30);
  assert.equal(asked.deadlines.asking, true);
  assert.equal(asked.cookTime_s, due - S, 'until it is answered, the pull stands');
  // Still in the water: heating again, as for a correction before the pull.
  const inWater = stillIn(owner, due + 33);
  assert.deepEqual([inWater.events.pulled, inWater.events.cooledAt_s, inWater.events.rangAt_s], [null, null, null]);
  const heating = planned(inWater, due + 33);
  assert.equal(phaseAt(heating.deadlines, due + 33), 'HEATING');
  assert.equal(heating.deadlines.asking, false);
  // Out: the pull stands, the correction is the record's, and it is not asked again.
  const out = pullStands(owner);
  const stands = planned(out, due + 33);
  assert.deepEqual(
    [stands.deadlines.asking, phaseAt(stands.deadlines, due + 33), stands.setup.startMode], [false, 'COOLING', 'cold'],
  );
  assert.equal(planned(corrected(out, { ...CHOICES, mass_kg: 0.076 }, due + 40), due + 40).deadlines.asking, false);
  assert.equal(stillIn(out, due + 41), out, 'a pull said to stand is kept');
  // A heavier egg would pull later too; a lighter one earlier, and is not asked about.
  const heavier = corrected(late, { ...CHOICES, startMode: 'hot', mass_kg: 0.076 }, due + 30);
  assert.equal(planned(heavier, due + 30).deadlines.asking, true);
  const lighter = corrected(late, { ...CHOICES, startMode: 'hot', mass_kg: 0.048 }, due + 30);
  assert.equal(planned(lighter, due + 30).deadlines.asking, false);
  // Nothing corrected since the pull: nothing asked.
  assert.equal(planned(late, due + 30).deadlines.asking, false);
  // A cook's own tap is an observation: never asked about.
  const tapped = withOut(hot, p, due + 5);
  assert.equal(planned(corrected(tapped, CHOICES, due + 30), due + 30).deadlines.asking, false);
  assert.equal(stillIn(tapped, due + 30), tapped);
  // Before the pull, as before: back to heating.
  assert.equal(phaseAt(planned(corrected(hot, CHOICES, due - 5), due - 5).deadlines, due - 5), 'HEATING');
});

test('16. review 2.3: after the pull the level corrects nothing, and a cooling corrected past its end is Done', () => {
  const hot = cookOf({ startMode: 'hot' });
  const p = planned(hot, S + 1);
  const due = p.deadlines.cookEnd_s;
  const out = withOut(hot, p, due + 5);
  const done = writeEvents(out, eventsDue(out, planned(out, due + 10), due + 1000));
  const before = factsOf(done, planned(done, due + 1010), CTX, null, null, null);
  const softer = asRanAgain(corrected(done, { ...CHOICES, startMode: 'hot', level: 0.1 }, due + 1010), due + 1010);
  assert.equal(softer.choices.level, 0.41);
  assert.deepEqual(factsOf(softer, planned(softer, due + 1010), CTX, null, null, null), before, 'the record as it was');
  const early = corrected(hot, { ...CHOICES, startMode: 'hot', level: 0.1 }, S + 60);
  assert.equal(early.choices.level, 0.1, 'before the pull, a correction');
  // The counter corrected to ice ten minutes after the pull: the counted cooling, ended long ago.
  const counter = cookOf({ startMode: 'hot', cooling: 'counter' });
  const cp = planned(counter, S + 1);
  const ce = cp.deadlines.cookEnd_s;
  const o = withOut(counter, cp, ce + 5);
  const ice = planned(corrected(o, { ...CHOICES, startMode: 'hot' }, ce + 605), ce + 605);
  assert.equal(ice.cool_s, coolingSecondsFor(ice.solution.result));
  assert.ok(ice.cool_s < 300, `${ice.cool_s} s, not the ten minutes to the correction`);
  assert.equal(ice.deadlines.coolEnd_s, ce + 5 + ice.cool_s);
  assert.equal(phaseAt(ice.deadlines, ce + 605), 'DONE');
});

test('17. review 3: a plan the cook did not cause never moves a pull already due', () => {
  const hot = cookOf({ startMode: 'hot' });
  // The pull rings on the interim plan, before the surface is in.
  const interim = replan(hot, C, null, 0, S + 1);
  const at = interim.deadlines.cookEnd_s;
  const rung = writeEvents(hot, eventsDue(hot, interim, at + 2));
  assert.equal(rung.events.rangAt_s, at);
  assert.equal(rung.events.pulled, null);
  // The surface lands: without the ring the pull would move.
  assert.notEqual(planned(hot, at + 3).deadlines.cookEnd_s, at);
  const landed = planned(rung, at + 3);
  assert.deepEqual([landed.deadlines.cookEnd_s, phaseAt(landed.deadlines, at + 3)], [at, 'PULL']);
  assert.equal(landed.cookTime_s, at - S);
  // Written once, and the grace runs out on it.
  assert.equal(eventsDue(rung, landed, at + 5).rangAt_s, at);
  assert.equal(eventsDue(rung, landed, at + PULL_GRACE_SECONDS).pulled?.due_s, at);
  // What the cook says after it (onescreen review 3): the ring kept while
  // the corrected pull is still due, so the grace ends where it began;
  // undone, and cleared, when the pull moves past the correction.
  const lighter = corrected(rung, { ...hot.choices, mass_kg: 0.048 }, at + 4);
  assert.equal(lighter.events.rangAt_s, at);
  const held = planned(lighter, at + 4);
  assert.deepEqual([held.deadlines.cookEnd_s, phaseAt(held.deadlines, at + 4)], [at, 'PULL']);
  assert.equal(eventsDue(lighter, held, at + PULL_GRACE_SECONDS).pulled?.out_s, at + PULL_GRACE_SECONDS);
  assert.equal(startCorrected(rung, S - 10, at + 4)?.events.rangAt_s, at);
  const heavier = corrected(rung, { ...hot.choices, mass_kg: 0.076 }, at + 4);
  const later = planned(heavier, at + 4);
  assert.ok(later.deadlines.cookEnd_s > at + 4, 'a heavier egg: the pull later than the correction');
  assert.equal(phaseAt(later.deadlines, at + 4), 'COOKING');
  assert.equal(eventsDue(heavier, later, at + 5).rangAt_s, null, 'the ring cleared');
  const cold = corrected(rung, { ...hot.choices, startMode: 'cold' }, at + 4);
  assert.equal(eventsDue(cold, planned(cold, at + 4), at + 5).rangAt_s, null, 'heating again: the ring cleared');
});

test('18. review 1.2: a boil tapped after a late correction to cold runs on the remembered time', () => {
  // As the review ran it: a cold start tapped late runs on the tap, as ever.
  const plain = [480, 540, 600, 720].map((tap) => replan(withBoil(cookOf(), S + tap), C, null, 0, S + tap).cookTime_s);
  assert.ok(plain[0] < plain[1] && plain[1] < plain[2] && plain[2] < plain[3], `${plain.join(', ')}: later each time`);
  // The owner's case: boiling corrected to cold at 500 s, past the 480 s this
  // water takes; the water really boiled at 480 s. However late the tap, the
  // pull is where a tap at 480 s puts it.
  const hot = cookOf({ startMode: 'hot' });
  const owner = corrected(hot, CHOICES, S + 500);
  const at480 = plain[0];
  for (const tap of [540, 600, 640]) {
    const p = replan(withBoil(owner, S + tap), C, null, 0, S + tap);
    assert.equal(p.setup.timeToBoil_s, 480);
    assert.equal(p.cookTime_s, at480, `tapped at ${tap} s`);
    assert.equal(boilToRemember(withBoil(owner, S + tap)), null, 'and still not remembered');
  }
  // A tap after that pull pulls at the tap, with its grace.
  const veryLate = replan(withBoil(owner, S + 720), C, null, 0, S + 720);
  assert.deepEqual([veryLate.cookTime_s, veryLate.overdue], [720, true]);
  // Nothing remembered: the tap is all there is.
  const unknown = corrected(startCook(S, { ...CHOICES, startMode: 'hot' }, 0, {}, 'metric', 'en'), CHOICES, S + 2000);
  assert.equal(replan(withBoil(unknown, S + 2100), C, null, 0, S + 2100).setup.timeToBoil_s, 2100);
  // Corrected to cold in time: the tap is the measured ramp.
  assert.equal(replan(withBoil(corrected(hot, CHOICES, S + 240), S + 600), C, null, 0, S + 600).setup.timeToBoil_s, 600);
});

test('19. review 2.2: a tap made before a stray cold -> hot -> cold is still remembered', () => {
  const t = withBoil(cookOf(), S + 500);
  assert.deepEqual(boilToRemember(t), { litres: 2, seconds: 500 });
  const stray = corrected(corrected(t, { ...CHOICES, startMode: 'hot' }, S + 600), CHOICES, S + 610);
  assert.deepEqual(boilToRemember(stray), { litres: 2, seconds: 500 });
  assert.equal(planned(stray, S + 610).setup.timeToBoil_s, 500, 'and the cook runs on it');
  // A stray before the tap, made after the water could have boiled: as before.
  const before = withBoil(corrected(corrected(cookOf(), { ...CHOICES, startMode: 'hot' }, S + 500), CHOICES, S + 510), S + 600);
  assert.equal(boilToRemember(before), null);
  // The start corrected earlier than this water takes: not remembered, stray or not.
  const earlier = withBoil(startCorrected(cookOf(), S - 600, S + 10) as RunningCook, S + 500);
  assert.equal(boilToRemember(earlier), null);
  assert.equal(boilToRemember(corrected(corrected(earlier, { ...CHOICES, startMode: 'hot' }, S + 600), CHOICES, S + 610)), null);
});

test('20. review 1.3: a cook left heating stops lengthening, and is abandoned; the one rule for too old', () => {
  const most = LIMITS.timeToBoil_s.hi;
  const cold = cookOf();
  // The review's call: a cold start never tapped, twelve hours on.
  const q = replan(cold, C, null, 0, S + 12 * 3600);
  assert.equal(phaseAt(q.deadlines, S + 12 * 3600), 'HEATING', 'a plan is still a plan');
  assert.equal(q.setup.timeToBoil_s, most, 'not 43,252 s');
  assert.equal(q.slowHobAt_s, null, 'nothing more to lengthen');
  assert.equal(q.tooOldAt_s, S + most);
  assert.equal(cookTooOld(q, S + 12 * 3600), true);
  // On the way: lengthened up to the most, then no further.
  const before = replan(cold, C, null, 0, S + most - 100);
  assert.ok(before.setup.timeToBoil_s < most && before.slowHobAt_s !== null);
  const near = replan(cold, C, null, 0, S + most - 30);
  assert.deepEqual([near.setup.timeToBoil_s, near.slowHobAt_s], [most, null]);
  assert.equal(cookTooOld(near, S + most - 30), false);
  assert.equal(cookTooOld(near, S + most), false);
  assert.equal(cookTooOld(near, S + most + 1), true);
  // A cook that ran: too old an hour after its end - the cooling's, or the out's on the counter.
  const hot = cookOf({ startMode: 'hot' });
  const p = planned(hot, S + 1);
  assert.equal(p.tooOldAt_s, (p.deadlines.coolEnd_s as number) + RESTORE_WINDOW_S);
  const counter = cookOf({ startMode: 'hot', cooling: 'counter' });
  const cp = planned(counter, S + 1);
  assert.equal(cp.tooOldAt_s, cp.deadlines.cookEnd_s + PULL_GRACE_SECONDS + RESTORE_WINDOW_S);
  const out = withOut(counter, cp, cp.deadlines.cookEnd_s + 4);
  assert.equal(planned(out, cp.deadlines.cookEnd_s + 5).tooOldAt_s, cp.deadlines.cookEnd_s + 4 + RESTORE_WINDOW_S);
});

test('21. review 2.1: the open egg is the stored cook\'s, until Start again or it is too old', () => {
  const hot = cookOf({ startMode: 'hot' });
  const p = planned(hot, S + 1);
  assert.equal(openEggId(hot, p, S + 1), START_MS);
  assert.equal(openEggId(hot, p, p.tooOldAt_s), START_MS);
  assert.equal(openEggId(hot, p, p.tooOldAt_s + 1), null, 'too old: final');
  assert.equal(openEggId(null, null, S + 1), null, 'nothing stored: every egg final');
});

test('27. review 2.2 and 2.3: a cook too old ends from the tick; a screen knows its egg is no longer open', () => {
  // 2.2's call: a cold start never tapped, the clock moved on. The plan the
  // tick holds (made early) says too old at two hours, as a fresh one does.
  const cold = cookOf();
  const held = replan(cold, C, null, 0, S + 60);
  for (const at of [7100, 7300, 14400]) {
    assert.equal(cookTooOld(held, S + at), cookTooOld(replan(cold, C, null, 0, S + at), S + at), `${at} s`);
  }
  assert.deepEqual([cookTooOld(held, S + 7199), cookTooOld(held, S + 7201)], [false, true]);
  // 2.3's call: at Done, answered; three hours on, the egg is final, and the
  // screen holding it can tell without planning the stored cook.
  const hot = cookOf({ startMode: 'hot' });
  const p = planned(hot, S + 1);
  const done = p.tooOldAt_s - 1;
  assert.equal(cookStillOpen(hot, p, hot.id_ms, done), true);
  assert.equal(cookStillOpen(hot, p, hot.id_ms, S + 3 * 3600), false, 'too old: final');
  assert.equal(cookStillOpen(hot, p, null, done), false, 'Start again in another tab: nothing stored');
  assert.equal(cookStillOpen(hot, p, hot.id_ms + 60_000, done), false, 'another cook stored');
  assert.equal(cookStillOpen(hot, p, hot.id_ms, done), openEggId(hot, p, done) === hot.id_ms, 'as openEggId says');
});

test('22. review 3: the start has a lower bound, two hours before Start was pressed', () => {
  const cold = cookOf();
  assert.equal(earliestStart_s(cold), S - LIMITS.timeToBoil_s.hi);
  assert.equal(startCorrected(cold, 1, S + 10), null, 'the review\'s call: 1970 is refused');
  assert.equal(startCorrected(cold, S - LIMITS.timeToBoil_s.hi, S + 10)?.startedAt_s, S - LIMITS.timeToBoil_s.hi);
  assert.equal(startCorrected(cold, S - LIMITS.timeToBoil_s.hi - 0.5, S + 10), null);
  // Fixed at the press: a start already corrected does not move it.
  const earlier = startCorrected(cold, S - 3600, S + 10) as RunningCook;
  assert.equal(earliestStart_s(earlier), earliestStart_s(cold));
});

/* ---------------------------- archive/design/running-cook-review.md's calls */

test("23. the slow hob's memo: a plan made with any memo is the plan from the start, and its next moment comes only strictly past it", () => {
  // A cold start never tapped, planned as the app plans it, at twenty moments
  // over the two hours drawn with a fixed seed (denser early, where the guess
  // lengthens before it creeps), on a slow hob and on a small runny egg's
  // creeping guess. At each, the last plan's memo is taken, and the plan is
  // the one from the start. The memo offered to anything else the rule reads
  // is ignored, and offered to what it does not read is taken: the plan from
  // the start either way. And at each plan's own next moment (`slowHobDue`)
  // nothing is due, and a plan made then has the same moment, so a clock
  // stopped there plans nothing more; a millisecond past it, it is due and
  // moves on.
  const random = rng(20261010);
  const cooks = [cookOf(), cookOf({ mass_kg: 0.048, level: 0 })];
  const last = cooks.map((k) => replan(k, C, null, 0, S + 1));
  const other = knowing({ particles: 200, eggsLogged: 5, taste: 0.1, alphaFactor: 1.05 });
  const tasted = knowing({ particles: 200, eggsLogged: 5, taste: -0.1 });
  type Offered = [RunningCook, typeof C, number, number, boolean];
  const elsewhere: [string, (k: RunningCook, t: number, place: SlowHobPlace) => Offered][] = [
    ['another egg', (k, t) => [corrected(k, { ...k.choices, mass_kg: 0.076 }, t + 10), C, 0, t + 30, false]],
    ['the start corrected', (k, t) => [startCorrected(k, S - 60, t + 10) as RunningCook, C, 0, t + 30, false]],
    ['another lean', (k, t) => [k, C, 2, t + 30, false]],
    ['another nudge', (k, t) => [{ ...k, nudge_s: 3 }, C, 0, t + 30, false]],
    ['another pan remembered', (k, t) => [{ ...k, boilMemory: { '2.0': 500 } }, C, 0, t + 30, false]],
    ['another calibration', (k, t) => [k, other, 0, t + 30, false]],
    ['the boil tapped', (k, t) => [withBoil(k, t + 5), C, 0, t + 30, false]],
    ['a moment not past its place', (k, _t, p) => [k, C, 0, S + p.last_s, p.steps === 0]],
    // An egg folded that moved only the taste, which the rule never reads.
    ['the taste alone moved', (k, t) => [k, tasted, 0, t + 30, true]],
    ['a correction that changes nothing', (k, t) => [corrected(k, { ...k.choices }, t + 10), C, 0, t + 30, true]],
  ];
  for (let i = 0; i < 20; i++) {
    const t = S + 7140 * ((i + random()) / 20) ** 2;
    const j = i % 2;
    const k = cooks[j];
    const tag = `cook ${j} at ${(t - S).toFixed(1)} s`;
    const fresh = replan(k, C, null, 0, t);
    assert.equal(slowHobMemoFits(last[j].memo, k, C, 0, t), true, `${tag}: the last plan's memo taken`);
    assert.deepEqual(replan(k, C, null, 0, t, last[j].memo), fresh, tag);
    const place = fresh.memo as SlowHobPlace;
    // Offered elsewhere at the first ten moments: the place a memo keeps is
    // the last lengthening that did not creep, so once the guess creeps, a
    // quarter of an hour in, it is the same place at every later moment.
    if (i < elsewhere.length) {
      const [name, offer] = elsewhere[i];
      const [ck, cc, lean, now, fits] = offer(k, t, place);
      assert.equal(slowHobMemoFits(place, ck, cc, lean, now), fits, `${tag}, ${name}`);
      assert.deepEqual(replan(ck, cc, null, lean, now, place), replan(ck, cc, null, lean, now), `${tag}, ${name}`);
    }
    const at = fresh.slowHobAt_s as number;
    assert.ok(at > t, tag);
    assert.deepEqual(
      [slowHobDue(fresh, at - 0.001), slowHobDue(fresh, at), slowHobDue(fresh, at + 0.001)], [false, false, true], tag,
    );
    // Planned again at the moment and just past it while the guess still
    // lengthens, and at the last moments: from the memo, and from the start
    // early, where a plan from the start is a few solves, not dozens.
    if (at - S < 16 * 60 || i >= 18) {
      const agains = [replan(k, C, null, 0, at, place)];
      if (at - S < 16 * 60) agains.push(replan(k, C, null, 0, at));
      for (const again of agains) {
        assert.deepEqual(
          [again.slowHobAt_s, again.setup.timeToBoil_s], [at, fresh.setup.timeToBoil_s], `${tag}: planned at its moment`,
        );
      }
      const next = replan(k, C, null, 0, at + 0.001, place);
      assert.ok(next.slowHobAt_s === null || next.slowHobAt_s > at, `${tag}: moved on`);
    }
    last[j] = fresh;
  }
  for (const p of last) assert.ok(guessLengthened(p) && (p.memo as SlowHobPlace).steps > 0, 'lengthened on the way');
  // At the most the app takes for a time to boil the guess stops: nothing
  // more is due, and the memo still gives the plan from the start.
  for (const k of cooks) {
    const most = replan(k, C, null, 0, S + 7300);
    assert.deepEqual([most.setup.timeToBoil_s, most.slowHobAt_s], [LIMITS.timeToBoil_s.hi, null]);
    assert.equal(slowHobDue(most, S + 99999), false, 'never once the guess is the most');
    assert.deepEqual(replan(k, C, null, 0, S + 7301, most.memo), replan(k, C, null, 0, S + 7301));
  }
  // A hot start has no guess, and no memo.
  const hot = replan(cookOf({ startMode: 'hot' }), C, null, 0, S + 60);
  assert.equal(hot.memo, null);
  assert.equal(slowHobDue(hot, S + 3000), false);
});

test('25. review 3: nothing passes an open question about the pull', () => {
  // The review's call: a hot cook whose grace ran out while the phone
  // slept, corrected to cold on waking, the question left unanswered past
  // the counted cooling.
  let hot = cookOf({ startMode: 'hot' });
  const p = planned(hot, S + 1);
  const due = p.deadlines.cookEnd_s;
  hot = writeEvents(hot, eventsDue(hot, p, due + 60));
  const c = corrected(hot, CHOICES, due + 60);
  const q = planned(c, due + 60);
  assert.equal(q.deadlines.asking, true);
  assert.equal(q.deadlines.asking, true);
  assert.equal(phaseAt(q.deadlines, due + 60), 'COOLING');
  const end = q.deadlines.coolEnd_s as number;
  // Past the counted cooling: nothing written, no Done, not finished.
  assert.deepEqual(eventsDue(c, q, end + 5), c.events, 'no cooledAt_s');
  const r = planned(c, end + 5);
  assert.deepEqual([r.deadlines.asking, phaseAt(r.deadlines, end + 5)], [true, 'COOLING']);
  assert.equal(phaseAt(r.deadlines, end + 3 * 3600), 'COOLING', 'however long it is left');
  assert.equal(cookEnding(c, r, end + 5).finished, false, 'Start again logs nothing under it');
  // Too old an hour after the question, at the latest the hour after its end.
  assert.equal(r.tooOldAt_s, Math.max(end, due + 60) + RESTORE_WINDOW_S);
  // Answered: still in heats again; out, and the cooling runs to Done.
  assert.equal(phaseAt(planned(stillIn(c, end + 6), end + 6).deadlines, end + 6), 'HEATING');
  const stands = pullStands(c);
  const s = planned(stands, end + 6);
  assert.deepEqual([s.deadlines.asking, s.deadlines.asking, phaseAt(s.deadlines, end + 6)], [false, false, 'DONE']);
  assert.equal(eventsDue(stands, s, end + 6).cooledAt_s, end);
  // Asked after Done, the cooling ended: Done is held back until it is answered.
  const done = writeEvents(hot, eventsDue(hot, planned(hot, due + 60), due + 900));
  assert.ok(done.events.cooledAt_s !== null);
  const late = corrected(done, CHOICES, due + 900);
  const l = planned(late, due + 901);
  assert.deepEqual([l.deadlines.asking, phaseAt(l.deadlines, due + 901), cookEnding(late, l, due + 901).finished], [true, 'COOLING', false]);
  assert.equal(l.tooOldAt_s, due + 900 + RESTORE_WINDOW_S);
});

test('26. review 1.3: a record is never made from a plan with no surface; the cook as it ran is kept from the pull', () => {
  const hot = cookOf({ startMode: 'hot' });
  // The pull rang and its grace ran out on the interim plan, the surface not
  // yet in (a phone asleep through the pull, a reload in the grace).
  const interim = replan(hot, C, null, 0, S + 1);
  const due = interim.deadlines.cookEnd_s;
  const out = writeEvents(hot, eventsDue(hot, interim, due + PULL_GRACE_SECONDS));
  const bare = replan(out, C, null, 0, due + 30);
  assert.equal(keepAsRan(out, bare), out, 'no surface: nothing kept');
  assert.deepEqual(cookFactsFor(out, bare, CTX, null, null, null), { facts: null, refused: 'noSurface' });
  assert.equal(asRanShown(out, bare), null, 'Done shows the plan until the surface is in');
  // The surface lands: kept, from that plan, and only once.
  const onIt = planned(out, due + 30);
  const kept = keepAsRan(out, onIt);
  const ran = kept.asRan;
  assert.ok(ran !== null && asRanCurrent(kept));
  assert.deepEqual(
    [ran.level, ran.cook_s, ran.nudge_s, ran.forecast, ran.peakYolk_C, ran.probeMoment, ran.correctedAt_s],
    [onIt.answer.level, onIt.cookTime_s, onIt.nudge_s, onIt.forecast, onIt.solution.result.peakYolk_C, onIt.probeMoment, null],
  );
  assert.equal(keepAsRan(kept, planned(kept, due + 40)), kept, 'once');
  assert.deepEqual(readRunningCook(JSON.parse(JSON.stringify(kept))), kept, 'stored and read back');
  // The review's call: relaunched three hours on, the cook too old, planned
  // with no surface as both apps do. The egg logged keeps its forecast.
  const now = S + 3 * 3600;
  const relaunched = replan(kept, C, null, 0, now);
  assert.equal(cookTooOld(relaunched, now), true);
  const r = recordFor(factsOf(kept, relaunched, CTX, null, null, null));
  assert.deepEqual(r.forecast, ran.forecast, 'not null');
  assert.deepEqual(r.forecast, recordFor(factsOf(kept, onIt, CTX, null, null, null)).forecast);
  // After the cook's own tap out, from the plan after it: not the one that
  // rang, whose cook time is the pull's but for the last bits.
  const p = planned(hot, S + 1);
  const tapped = withOut(hot, p, p.deadlines.cookEnd_s + 5);
  assert.equal(tapped.asRan, null);
  assert.equal(keepAsRan(tapped, p).asRan, null, 'the plan that rang');
  assert.ok(keepAsRan(tapped, planned(tapped, p.deadlines.cookEnd_s + 6)).asRan !== null);
  // Not from a plan of another pull, and dropped with the pull it was of.
  assert.equal(keepAsRan(out, p).asRan, null, 'another pull');
  const asked = corrected(kept, CHOICES, due + 60);
  assert.equal(stillIn(asked, due + 61).asRan, null);
});

test('26b. review 2.4: Done and the record show the cook as it ran, whatever a later posterior plans', () => {
  // At Done, answered runny, and that answer folded: the plan made again on
  // the new posterior (a relaunch, a surface landing) moves the peak; what
  // Done shows and what the record keeps do not.
  const hot = cookOf({ startMode: 'hot' });
  const p = planned(hot, S + 1);
  const due = p.deadlines.cookEnd_s;
  const out = withOut(hot, p, due + 5);
  const cooling = planned(out, due + 6);
  const kept = keepAsRan(out, cooling);
  const done = writeEvents(kept, eventsDue(kept, cooling, due + 1000));
  const ran = done.asRan;
  assert.ok(ran !== null);
  const answered = recordFor(factsOf(done, planned(done, due + 1000), CTX, 'runny', null, null));
  const folded = copyCalibration(C);
  const coarse = (alpha: number, t: number): GridSpec => ({ ...calibrationGrid(alpha, t), alphaCount: 9, timeCount: 12 });
  foldRecord(folded, answered, buildRequestedGrid(gridRequestFor(folded, answered, coarse)));
  const first = replan(done, folded, null, 0, due + 1100);
  assert.ok(first.inputs !== null);
  const after = replan(done, folded, { inputs: first.inputs, grid: gridFor(folded, first.inputs.egg, first.inputs.setup), profile: null }, 0, due + 1100);
  assert.notEqual(after.solution.result.peakYolk_C, ran.peakYolk_C, 'the plan on the new posterior moved');
  assert.deepEqual(asRanShown(done, after), ran, 'Done shows the cook as it ran');
  assert.deepEqual(asRanShown(done, first), ran, 'with no surface too');
  const again = factsOf(done, after, CTX, 'runny', null, null);
  assert.deepEqual([again.level, again.cook_s, again.nudge_s, again.forecast], [ran.level, ran.cook_s, ran.nudge_s, ran.forecast]);
  // A correction at Done: stale until planned on the posterior before this
  // egg (here `C`, the fold's starting point), never on the folded one.
  const corr = corrected(done, { ...CHOICES, startMode: 'hot', mass_kg: 0.062 }, due + 1200);
  assert.equal(asRanCurrent(corr), false);
  assert.equal(asRanShown(corr, after), null);
  assert.equal(cookFactsFor(corr, after, CTX, 'runny', null, null).refused, 'stale');
  const fixed = asRanAgain(corr, due + 1200);
  assert.equal(asRanCurrent(fixed), true);
  assert.deepEqual(fixed.asRan, keepAsRan(withAsRan(corr, null), planned(corr, due + 1200)).asRan, 'planned on C');
  assert.notEqual(fixed.asRan?.peakYolk_C, ran.peakYolk_C, 'a lighter egg peaks lower');
  // What Done says beside the peak reads the cook as it ran too (onescreen
  // review 2.2), and an ending with a stale record makes it again first (1.2).
  const sol = solutionAsRan(after, ran);
  assert.equal(sol.result.peakYolk_C, ran.peakYolk_C, 'the solve as it ran peaks where the cook did');
  assert.notEqual(sol.result.peakYolk_C, after.solution.result.peakYolk_C);
  assert.equal(solutionAsRan(planned(done, due + 1000), ran).result.peakYolk_C, ran.peakYolk_C);
  assert.equal(cookEnding(corr, after, due + 1200).remake, true);
  assert.equal(cookEnding(fixed, after, due + 1200).remake, false);
  assert.equal(cookEnding(done, after, due + 1200).remake, false);
});

test('28. onescreen review 2.1: a correction after Done keeps it Done, and corrects only the record', () => {
  const counter = cookOf({ startMode: 'hot', cooling: 'counter' });
  const p = planned(counter, S + 1);
  const due = p.deadlines.cookEnd_s;
  const out = withOut(counter, p, due + 2);
  assert.equal(phaseAt(planned(out, due + 2).deadlines, due + 2), 'DONE', 'on the counter, Done at the out');
  // A minute on, the cooling corrected to ice: Done, with an ice bath to the
  // correction, not a cooling started again behind an answer.
  const ice = corrected(out, { ...counter.choices, cooling: 'ice' }, due + 62);
  assert.equal(ice.events.cooledAt_s, due + 62);
  const q = planned(ice, due + 63);
  assert.equal(phaseAt(q.deadlines, due + 63), 'DONE');
  assert.equal(q.cool_s, 60);
  assert.deepEqual(eventsDue(ice, q, due + 900), ice.events, 'nothing more written');
  // Ten minutes on: the counted time, written down as such.
  const late = corrected(out, { ...counter.choices, cooling: 'tap' }, due + 602);
  const r = planned(late, due + 603);
  assert.equal(phaseAt(r.deadlines, due + 603), 'DONE');
  assert.equal(r.cool_s, coolingSecondsFor(r.solution.result));
  const written = eventsDue(late, r, due + 603);
  assert.equal(written.cooledAt_s, (out.events.pulled?.out_s ?? 0) + r.cool_s);
  assert.equal(planned(writeEvents(late, written), due + 604).cool_s, r.cool_s, 'and planned again, the same');
  // A cooling that ended as counted stays as it ran.
  const hot = cookOf({ startMode: 'hot' });
  const hp = planned(hot, S + 1);
  const hOut = withOut(hot, hp, hp.deadlines.cookEnd_s + 2);
  const cooling = planned(hOut, hp.deadlines.cookEnd_s + 3);
  const done = writeEvents(hOut, eventsDue(hOut, cooling, (cooling.deadlines.coolEnd_s ?? 0) + 1));
  const lighter = corrected(done, { ...hot.choices, mass_kg: 0.048 }, (cooling.deadlines.coolEnd_s ?? 0) + 30);
  const lp = planned(lighter, (cooling.deadlines.coolEnd_s ?? 0) + 30);
  assert.equal(phaseAt(lp.deadlines, (cooling.deadlines.coolEnd_s ?? 0) + 30), 'DONE');
  assert.equal(lp.deadlines.coolEnd_s, done.events.cooledAt_s);
});
