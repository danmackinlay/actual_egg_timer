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
import {
  LIMITS, PULL_GRACE_SECONDS, SLOW_HOB_EXTRA_S, START_TEMP_PRESETS_C, coolingSecondsFor, phaseAt,
} from '../src/core/policy.js';
import { T_ROOM_C } from '../src/core/constants.js';
import { decisionInputs } from '../src/core/decide.js';
import { recordFor } from '../src/core/record.js';
import {
  CookChoices, CookPlan, CookSurface, RESTORE_WINDOW_S, RecordContext, RunningCook, boilToRemember, cookEnding,
  cookFactsFor, cookSetupOf, cookTooOld, corrected, earliestStart_s, eventsDue, latestStart_s, openEggId, pullStands,
  readRunningCook, replan, startCook, startCorrected, stillIn, withBoil, withOut,
} from '../src/core/running.js';
import { gridFor, knowing } from '../tools/common.js';

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
  const out = { ...cold, events: { ...cold.events, pulled: { due_s: S + 800, out_s: S + 805, by: 'cook' as const, confirmed: true } } };
  assert.equal(withBoil(out, S + 900), out);
});

test('3. a correction keeps the start and the events, and says since when the cook was told cold', () => {
  const tapped = withBoil(cookOf(), S + 500);
  assert.equal(tapped.coldSince_s, S, 'cold from the start');
  const heavier = corrected(tapped, { ...CHOICES, mass_kg: 0.076 }, S + 600);
  assert.deepEqual([heavier.startedAt_s, heavier.events, heavier.coldSince_s], [S, tapped.events, S]);
  assert.equal(tapped.firstHotAt_s, null, 'never said boiling');
  const boiling = corrected(tapped, { ...CHOICES, startMode: 'hot' }, S + 600);
  assert.equal(boiling.events.boilAt_s, S + 500, 'the tap is kept, unread');
  assert.equal(boiling.coldSince_s, null);
  assert.equal(boiling.firstHotAt_s, S + 600);
  const back = corrected(boiling, CHOICES, S + 610);
  assert.equal(back.events.boilAt_s, S + 500);
  assert.equal(back.coldSince_s, S + 610, 'told cold again only now');
  assert.equal(back.firstHotAt_s, S + 600, 'but the tap came before the choices first said boiling (review 2.2)');
  assert.deepEqual(boilToRemember(back), boilToRemember(tapped), 'so changing back gives back the boil memory too');
  assert.equal(corrected(corrected(back, { ...CHOICES, startMode: 'hot' }, S + 620), CHOICES, S + 630).firstHotAt_s, S + 600);
  const owner = corrected(cookOf({ startMode: 'hot' }), CHOICES, S + 240);
  assert.equal(owner.coldSince_s, S + 240, "the owner's case: boiling corrected to cold");
  assert.equal(owner.firstHotAt_s, S, 'begun boiling');
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
    { ...tapped, events: { ...tapped.events, pulled: { due_s: S + 850, out_s: S + 858, by: 'cook', confirmed: true }, cooledAt_s: S + 1030 } },
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
  assert.ok(after.provisional && after.deadlines.cookEnd_s > before.deadlines.cookEnd_s);
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
  assert.equal(replan(cold, C, null, 0, at - 0.1).lengthened, false);
  const longer = replan(cold, C, null, 0, at + 0.1);
  assert.equal(longer.lengthened, true);
  assert.equal(longer.inputs, null, 'a guess that moves asks for no surface');
  assert.ok(Math.abs(longer.setup.timeToBoil_s - (at - S + SLOW_HOB_EXTRA_S)) < 1e-6);
  assert.ok(longer.deadlines.cookEnd_s > at + 45, 'the pull is pushed out');
  // The tap ends the guess.
  assert.equal(replan(withBoil(cold, at + 1), C, null, 0, at + 1).provisional, false);
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
  const done = { ...out, events: eventsDue(out, cooling, end + 1000) };
  const counter = corrected(done, { ...CHOICES, startMode: 'hot', cooling: 'counter' }, end + 1000);
  assert.equal(planned(counter, end + 1000).deadlines.coolEnd_s, null);
  assert.equal(eventsDue(counter, planned(counter, end + 1000), end + 2000).cooledAt_s, done.events.cooledAt_s);
});

test('13. the record is the cook as last corrected, at the time that ran', () => {
  const ctx: RecordContext = { app: 'web', appVersion: '0.5.0-alpha.1', prior: '2026-09', day: '2026-10-07', id: START_MS };
  const tapped = withBoil(cookOf({}, 5), S + 500);
  const p = planned(tapped, S + 600);
  const end = p.deadlines.cookEnd_s;
  const out = withOut(tapped, p, end + 6);
  const cooled = { ...out, events: eventsDue(out, planned(out, end + 6), end + 1000) };
  const firmer = corrected(cooled, { ...CHOICES, level: 0.62 }, end + 1000);
  const q = planned(firmer, end + 1000);
  const r = recordFor(cookFactsFor(firmer, q, ctx, 'fudgy', 'firm', null));
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
  assert.equal('id' in recordFor(cookFactsFor(firmer, q, { ...ctx, app: 'ios', id: null }, null, null, null)), false);
  // Ended: the boil it measured, and an egg to log.
  assert.deepEqual(cookEnding(firmer, q, end + 1000), { boil: { litres: 2, seconds: 500 }, finished: true });
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

/* ------------------------------------- design/one-screen-review.md's calls */

const CTX: RecordContext = { app: 'web', appVersion: '0.5.0-alpha.1', prior: '2026-09', day: '2026-10-07', id: START_MS };

test('15. review 1.1: a pull the clock assumed stays open, and a correction that would pull later asks', () => {
  const hot = cookOf({ startMode: 'hot' });
  const p = planned(hot, S + 1);
  const due = p.deadlines.cookEnd_s;
  const late = { ...hot, events: eventsDue(hot, p, due + 21) };
  assert.deepEqual(late.events.pulled, { due_s: due, out_s: due + PULL_GRACE_SECONDS, by: 'timeout', confirmed: false });
  // The owner's case, 30 s after the pull was due: not Cooling unasked.
  const owner = corrected(late, CHOICES, due + 30);
  const asked = planned(owner, due + 30);
  assert.equal(asked.askIfStillIn, true);
  assert.equal(asked.cookTime_s, due - S, 'until it is answered, the pull stands');
  // Still in the water: heating again, as for a correction before the pull.
  const inWater = stillIn(owner, due + 33);
  assert.deepEqual([inWater.events.pulled, inWater.events.cooledAt_s, inWater.events.rangAt_s], [null, null, null]);
  const heating = planned(inWater, due + 33);
  assert.equal(phaseAt(heating.deadlines, due + 33), 'HEATING');
  assert.equal(heating.askIfStillIn, false);
  // Out: the pull stands, the correction is the record's, and it is not asked again.
  const out = pullStands(owner);
  const stands = planned(out, due + 33);
  assert.deepEqual(
    [stands.askIfStillIn, phaseAt(stands.deadlines, due + 33), stands.setup.startMode], [false, 'COOLING', 'cold'],
  );
  assert.equal(planned(corrected(out, { ...CHOICES, mass_kg: 0.076 }, due + 40), due + 40).askIfStillIn, false);
  assert.equal(stillIn(out, due + 41), out, 'a pull said to stand is kept');
  // A heavier egg would pull later too; a lighter one earlier, and is not asked about.
  const heavier = corrected(late, { ...CHOICES, startMode: 'hot', mass_kg: 0.076 }, due + 30);
  assert.equal(planned(heavier, due + 30).askIfStillIn, true);
  const lighter = corrected(late, { ...CHOICES, startMode: 'hot', mass_kg: 0.048 }, due + 30);
  assert.equal(planned(lighter, due + 30).askIfStillIn, false);
  // Nothing corrected since the pull: nothing asked.
  assert.equal(planned(late, due + 30).askIfStillIn, false);
  // A cook's own tap is an observation: never asked about.
  const tapped = withOut(hot, p, due + 5);
  assert.equal(planned(corrected(tapped, CHOICES, due + 30), due + 30).askIfStillIn, false);
  assert.equal(stillIn(tapped, due + 30), tapped);
  // Before the pull, as before: back to heating.
  assert.equal(phaseAt(planned(corrected(hot, CHOICES, due - 5), due - 5).deadlines, due - 5), 'HEATING');
});

test('16. review 2.3: after the pull the level corrects nothing, and a cooling corrected past its end is Done', () => {
  const hot = cookOf({ startMode: 'hot' });
  const p = planned(hot, S + 1);
  const due = p.deadlines.cookEnd_s;
  const out = withOut(hot, p, due + 5);
  const done = { ...out, events: eventsDue(out, planned(out, due + 10), due + 1000) };
  const before = cookFactsFor(done, planned(done, due + 1010), CTX, null, null, null);
  const softer = corrected(done, { ...CHOICES, startMode: 'hot', level: 0.1 }, due + 1010);
  assert.equal(softer.choices.level, 0.41);
  assert.deepEqual(cookFactsFor(softer, planned(softer, due + 1010), CTX, null, null, null), before, 'the record as it was');
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
  const rung = { ...hot, events: eventsDue(hot, interim, at + 2) };
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
  // What the cook says after it plans afresh.
  assert.equal(corrected(rung, hot.choices, at + 4).events.rangAt_s, null);
  assert.equal(startCorrected(rung, S - 10, at + 4)?.events.rangAt_s, null);
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
  const unknown = corrected(startCook(START_MS, { ...CHOICES, startMode: 'hot' }, 0, {}, 'metric', 'en'), CHOICES, S + 2000);
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
