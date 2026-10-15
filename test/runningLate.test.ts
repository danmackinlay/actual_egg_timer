/**
 * A running cook (src/core/running.ts): late corrections, and the end of a
 * cook.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { LIMITS } from '../src/core/inputs.js';
import {
  PULL_GRACE_SECONDS, RESTORE_WINDOW_S, type RunningCook, boilToRemember, cookTooOld, coolingSecondsFor, corrected,
  earliestStart_s, eventsDue, openEggId, phaseAt, pullStands, replan, startCook, startCorrected, stillIn, withBoil,
  withOut, writeEvents,
} from '../src/core/running.js';
import { START_MS, S, CHOICES, C, CTX, asRanAgain, cookOf, factsOf, planned } from './cooks.js';

test('15. a pull the clock assumed stays open, and a correction that would pull later asks', () => {
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

test('16. after the pull the level corrects nothing, and a cooling corrected past its end is Done', () => {
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

test('17. a plan the cook did not cause never moves a pull already due', () => {
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
  // What the cook says after it: the ring kept while
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

test('18. a boil tapped after a late correction to cold runs on the remembered time', () => {
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

test('19. a tap made before a stray cold -> hot -> cold is still remembered', () => {
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

test('20. a cook left heating stops lengthening, and is abandoned; the one rule for too old', () => {
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

test('21. the open egg is the stored cook\'s, until Start again or it is too old', () => {
  const hot = cookOf({ startMode: 'hot' });
  const p = planned(hot, S + 1);
  assert.equal(openEggId(hot, p, S + 1), START_MS);
  assert.equal(openEggId(hot, p, p.tooOldAt_s), START_MS);
  assert.equal(openEggId(hot, p, p.tooOldAt_s + 1), null, 'too old: final');
  assert.equal(openEggId(null, null, S + 1), null, 'nothing stored: every egg final');
});

test('22. the start has a lower bound, two hours before Start was pressed', () => {
  const cold = cookOf();
  assert.equal(earliestStart_s(cold), S - LIMITS.timeToBoil_s.hi);
  assert.equal(startCorrected(cold, 1, S + 10), null, 'the review\'s call: 1970 is refused');
  assert.equal(startCorrected(cold, S - LIMITS.timeToBoil_s.hi, S + 10)?.startedAt_s, S - LIMITS.timeToBoil_s.hi);
  assert.equal(startCorrected(cold, S - LIMITS.timeToBoil_s.hi - 0.5, S + 10), null);
  // Fixed at the press: a start already corrected does not move it.
  const earlier = startCorrected(cold, S - 3600, S + 10) as RunningCook;
  assert.equal(earliestStart_s(earlier), earliestStart_s(cold));
});
