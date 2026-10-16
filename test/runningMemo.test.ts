/**
 * A running cook (src/core/running.ts): the slow hob's memo.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

import { LIMITS } from '../src/core/inputs.ts';
import {
  type CookPlan, type RunningCook, SLOW_HOB_MAX_STEPS, type SlowHobPlace, corrected, guessLengthened, replan, slowHobDue,
  startCorrected, withBoil,
} from '../src/core/running.ts';
import { knowing, rng } from '../tools/common.ts';
import { S, C, cookOf } from './cooks.ts';

test("the slow hob's memo: a plan made with any memo is the plan from the start, and its next moment comes only strictly past it", () => {
  // A cold start never tapped, planned as the app plans it, at twelve
  // moments over the two hours drawn with a fixed seed: ten in the first half
  // hour, where the guess lengthens before it creeps, and two in the last
  // quarter, on a slow hob and on a small runny egg's creeping guess. At each, the last plan's memo is taken, and the plan is
  // the one from the start. The memo offered to anything else the rule reads
  // is ignored, and offered to what it does not read is taken: the plan from
  // the start either way. And at each plan's own next moment (`slowHobDue`)
  // nothing is due, and a plan made then has the same moment, so a clock
  // stopped there plans nothing more; a millisecond past it, it is due and
  // moves on.
  const random = rng(20261010);
  // Whether a plan takes a memo: one made wrong on purpose - its guess a
  // minute on, and at the most lengthenings, so the plan stops there -
  // changes the plan from the start, `start`, only if it is read.
  const takes = (
    memo: SlowHobPlace, k: RunningCook, c: typeof C, lean: number, now: number, start: CookPlan,
  ): boolean => {
    const wrong: SlowHobPlace = { ...memo, steps: SLOW_HOB_MAX_STEPS, ramp_s: memo.ramp_s + 60 };
    return !isDeepStrictEqual(replan(k, c, null, lean, now, wrong), start);
  };
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
  // Twenty slots, early ones shorter; between the tenth and the last two the
  // memo's place does not move (below), so those slots are left out.
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 18, 19]) {
    const t = S + 7140 * ((i + random()) / 20) ** 2;
    const j = i % 2;
    const k = cooks[j];
    const tag = `cook ${j} at ${(t - S).toFixed(1)} s`;
    const fresh = replan(k, C, null, 0, t);
    assert.equal(takes(last[j].memo as SlowHobPlace, k, C, 0, t, fresh), true, `${tag}: the last plan's memo taken`);
    assert.deepEqual(replan(k, C, null, 0, t, last[j].memo), fresh, tag);
    const place = fresh.memo as SlowHobPlace;
    // Offered elsewhere at the first ten moments: the place a memo keeps is
    // the last lengthening that did not creep, so once the guess creeps, a
    // quarter of an hour in, it is the same place at every later moment.
    if (i < elsewhere.length) {
      const [name, offer] = elsewhere[i];
      const [ck, cc, lean, now, fits] = offer(k, t, place);
      const start = replan(ck, cc, null, lean, now);
      assert.equal(takes(place, ck, cc, lean, now, start), fits, `${tag}, ${name}`);
      assert.deepEqual(replan(ck, cc, null, lean, now, place), start, `${tag}, ${name}`);
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
