/**
 * A running cook (src/core/running.ts): the open question about the pull, and
 * the cook as it ran.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { calibrationGrid, copyCalibration, foldRecord, gridRequestFor, recordFor } from '../src/core/record.ts';
import { type GridSpec, buildRequestedGrid } from '../src/core/doseGrid.ts';
import {
  PULL_GRACE_SECONDS, RESTORE_WINDOW_S, cookTooOld, coolingSecondsFor, corrected, eventsDue, openEggId, phaseAt,
  pullStands, replan, stillIn, withOut, writeEvents,
} from '../src/core/running.ts';
import {
  asRanCurrent, asRanShown, cookEnding, cookFactsFor, keepAsRan, solutionAsRan, withAsRan,
} from '../src/core/asRan.ts';
import { readRunningCook } from '../src/ui/storedCook.ts';
import { gridFor } from '../tools/common.ts';
import { S, CHOICES, C, CTX, asRanAgain, cookOf, factsOf, planned } from './cooks.ts';

test('nothing passes an open question about the pull', () => {
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

test('a record is never made from a plan with no surface; the cook as it ran is kept from the pull', () => {
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

test('Done and the record show the cook as it ran, whatever a later posterior plans', () => {
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
  // What Done says beside the peak reads the cook as it ran too, and an
  // ending with a stale record makes it again first.
  const sol = solutionAsRan(after, ran);
  assert.equal(sol.result.peakYolk_C, ran.peakYolk_C, 'the solve as it ran peaks where the cook did');
  assert.notEqual(sol.result.peakYolk_C, after.solution.result.peakYolk_C);
  assert.equal(solutionAsRan(planned(done, due + 1000), ran).result.peakYolk_C, ran.peakYolk_C);
  assert.equal(cookEnding(corr, after, due + 1200).remake, true);
  assert.equal(cookEnding(fixed, after, due + 1200).remake, false);
  assert.equal(cookEnding(done, after, due + 1200).remake, false);
});

test('a cook too old ends from the tick; a screen knows its egg is no longer open', () => {
  // A cold start never tapped, the clock moved on. The plan the
  // tick holds (made early) says too old at two hours, as a fresh one does.
  const cold = cookOf();
  const held = replan(cold, C, null, 0, S + 60);
  for (const at of [7100, 7300, 14400]) {
    assert.equal(cookTooOld(held, S + at), cookTooOld(replan(cold, C, null, 0, S + at), S + at), `${at} s`);
  }
  assert.deepEqual([cookTooOld(held, S + 7199), cookTooOld(held, S + 7201)], [false, true]);
  // At Done, answered; three hours on, the egg is final, and the
  // screen holding it can tell without planning the stored cook.
  const hot = cookOf({ startMode: 'hot' });
  const p = planned(hot, S + 1);
  const done = p.tooOldAt_s - 1;
  assert.equal(cookTooOld(p, done), false);
  assert.equal(cookTooOld(p, S + 3 * 3600), true, 'too old: final');
  assert.equal(!cookTooOld(p, done), openEggId(hot, p, done) === hot.id_ms, 'as openEggId says');
});

test('a correction after Done keeps it Done, and corrects only the record', () => {
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
