/**
 * The cooking state machine, and the phase rule it has to agree with.
 *
 * `machine.ts` drives a cook by advancing through states and firing events at
 * the boundaries; `phaseAt` in the core states the same timeline as a pure
 * function of the clock, and the iOS app derives its phase from that. Those are
 * two descriptions of one cook, and the tests below are what stops them being
 * two different cooks.
 *
 * The counter-rest case is the regression: iOS checked for a cooling deadline
 * before checking the pull grace, so a cook with no cooling step fell from
 * COOKING straight to DONE. "Out of the water — now" never appeared, the grace
 * never ran, and the pull notification still fired at a screen that already
 * said Done.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Machine, Phase, advance, beginCooling, idleMachine, recordBoil, restoreMachine,
  reviseProvisional, secondsAfterBoil, secondsToPull, startCold, startHot,
  COOLING_SECONDS, PULL_GRACE_SECONDS, RESTORE_WINDOW_MS,
} from '../src/ui/machine.js';
import {
  COOLING_SECONDS as CORE_COOLING, PULL_GRACE_SECONDS as CORE_GRACE, phaseAt,
} from '../src/core/policy.js';
import { Cooling } from '../src/core/protocol.js';

const T0 = 1_700_000_000_000;
const COOK_S = 600;

/** Walk the machine forward to `now_ms`, applying every transition it asks for
 *  along the way - which is what the ticker does. */
function walk(start: Machine, now_ms: number): Machine {
  let m = start;
  for (let i = 0; i < 16; i++) {
    const step = advance(m, now_ms);
    if (step.machine === m) return m;
    m = step.machine;
  }
  throw new Error('machine did not settle');
}

/** The same cook as the core sees it. */
function corePhase(m: Machine, now_ms: number): Phase {
  const coolEnd_s = m.cooling === 'counter'
    ? null
    : (m.cookEnd_ms / 1000) + PULL_GRACE_SECONDS + COOLING_SECONDS;
  return phaseAt(
    { cookEnd_s: m.cookEnd_ms / 1000, coolEnd_s: coolEnd_s, provisional: m.provisional },
    now_ms / 1000,
  ) as Phase;
}

// --------------------------------------------------------------------------
// 1. The constants are one set of constants
// --------------------------------------------------------------------------

test('1. the cooling step and the pull grace come from the core', () => {
  assert.equal(COOLING_SECONDS, CORE_COOLING);
  assert.equal(PULL_GRACE_SECONDS, CORE_GRACE);
});

// --------------------------------------------------------------------------
// 2. The timeline, against the rule the iOS app derives from
// --------------------------------------------------------------------------

for (const cooling of ['ice', 'tap', 'counter'] as Cooling[]) {
  test(`2. advancing a ${cooling} cook walks the phases the core rule states`, () => {
    const start = startHot(T0, COOK_S, cooling, 0.41);
    const offsets = [
      0, 1, 599, 599.999, 600, 600.001, 619, 619.999, 620, 620.001,
      700, 799, 799.999, 800, 800.001, 10000,
    ];
    for (const offset of offsets) {
      const now = T0 + offset * 1000;
      const m = walk(start, now);
      assert.equal(
        m.phase, corePhase(m, now),
        `${cooling} at +${offset}s: machine says ${m.phase}, the core rule says ${corePhase(m, now)}`,
      );
    }
  });
}

test('2b. every cook passes through PULL, cooling step or not', () => {
  // The bug, stated as an invariant. A counter rest has no cooling deadline,
  // and that is not a reason to skip telling someone to take the eggs out.
  for (const cooling of ['ice', 'tap', 'counter'] as Cooling[]) {
    const start = startHot(T0, COOK_S, cooling, 0.41);
    const atPull = walk(start, T0 + COOK_S * 1000);
    assert.equal(atPull.phase, 'PULL', `${cooling} skipped the pull`);

    // And it lasts the whole grace period rather than being a single instant.
    const nearlyOver = walk(start, T0 + (COOK_S + PULL_GRACE_SECONDS - 0.001) * 1000);
    assert.equal(nearlyOver.phase, 'PULL', `${cooling} left PULL early`);
  }
});

test('2c. a counter rest finishes at the pull; the others cool first', () => {
  const afterGrace = (cooling: Cooling): Phase =>
    walk(startHot(T0, COOK_S, cooling, 0.41), T0 + (COOK_S + PULL_GRACE_SECONDS) * 1000).phase;
  assert.equal(afterGrace('counter'), 'DONE', 'there is no cooling step to time on the counter');
  assert.equal(afterGrace('ice'), 'COOLING');
  assert.equal(afterGrace('tap'), 'COOLING');
});

test('2d. the pull and the done events each fire exactly once', () => {
  for (const cooling of ['ice', 'counter'] as Cooling[]) {
    let m = startHot(T0, COOK_S, cooling, 0.41);
    const events: string[] = [];
    for (let t = 0; t <= 900; t += 1) {
      const step = advance(m, T0 + t * 1000);
      m = step.machine;
      if (step.event !== 'none') events.push(step.event);
    }
    assert.deepEqual(
      events, ['pull', 'done'],
      `${cooling} fired ${JSON.stringify(events)}`,
    );
  }
});

// --------------------------------------------------------------------------
// 3. A cold start's provisional deadline
// --------------------------------------------------------------------------

test('3. a cold start is HEATING until the boil is tapped, however long that takes', () => {
  const m = startCold(T0, COOK_S, 480, 'ice', 0.41);
  assert.equal(m.phase, 'HEATING');
  // Well past the provisional deadline: still heating, because the deadline was
  // a guess and nothing has measured the pan yet.
  assert.equal(walk(m, T0 + 5000 * 1000).phase, 'HEATING');
});

test('3b. tapping the boil fixes the deadline from the original start', () => {
  const started = startCold(T0, COOK_S, 480, 'ice', 0.41);
  const measured = 520;
  const resolved = 640;
  const m = recordBoil(started, T0 + measured * 1000, resolved);
  assert.equal(m.phase, 'COOKING');
  assert.equal(m.provisional, false);
  assert.equal(m.assumedBoil_s, measured);
  // The deadline runs from eggs-in, not from the tap: t = 0 is the same t = 0
  // the physics uses, so the ramp is already inside cookTime_s.
  assert.equal(m.cookEnd_ms, T0 + resolved * 1000);
  assert.equal(secondsAfterBoil(m), resolved - measured);
});

test('3c. revising a slow hob moves the deadline and nothing else', () => {
  const started = startCold(T0, COOK_S, 480, 'ice', 0.41);
  const m = reviseProvisional(started, 700, 560);
  assert.equal(m.phase, 'HEATING');
  assert.equal(m.provisional, true, 'a revision is still a guess');
  assert.equal(m.targetLevel, started.targetLevel, 'a revision may not move the target');
  assert.equal(secondsToPull(m, T0), 700);
});

test('3d. the target a cook is run at is fixed when it starts', () => {
  // Everything that can happen to a cook in flight, and none of it may change
  // what the cook is for.
  const started = startCold(T0, COOK_S, 480, 'ice', 0.62);
  const revised = reviseProvisional(started, 700, 560);
  const boiled = recordBoil(revised, T0 + 560 * 1000, 720);
  const pulled = walk(boiled, T0 + 720 * 1000);
  const cooled = beginCooling(pulled, T0 + 740 * 1000);
  for (const m of [revised, boiled, pulled, cooled]) {
    assert.equal(m.targetLevel, 0.62);
  }
});

// --------------------------------------------------------------------------
// 4. Transitions refuse to fire out of order
// --------------------------------------------------------------------------

test('4. the transitions are no-ops from the wrong phase', () => {
  const idle = idleMachine('ice');
  assert.equal(recordBoil(idle, T0, 600), idle, 'nothing to record a boil against');
  assert.equal(reviseProvisional(idle, 600, 500), idle);
  assert.equal(beginCooling(idle, T0), idle);

  const cooking = startHot(T0, COOK_S, 'ice', 0.41);
  assert.equal(recordBoil(cooking, T0, 600), cooking, 'a hot start has no boil to tap');
  assert.equal(beginCooling(cooking, T0), cooking, 'the egg is still in the water');
});

// --------------------------------------------------------------------------
// 5. Restoring a cook
// --------------------------------------------------------------------------

test('5. a cook survives the round trip through storage', () => {
  const m = startCold(T0, COOK_S, 480, 'tap', 0.62);
  const back = restoreMachine(JSON.parse(JSON.stringify(m)), T0 + 60_000);
  assert.deepEqual(back, m);
});

test('5b. a half-written record restores as nothing at all', () => {
  const m = startHot(T0, COOK_S, 'ice', 0.41);
  const now = T0 + 60_000;
  assert.equal(restoreMachine(null, now), null);
  assert.equal(restoreMachine('a cook', now), null);
  assert.equal(restoreMachine({}, now), null);
  assert.equal(restoreMachine(idleMachine('ice'), now), null, 'an idle machine is not a cook');
  // A deadline with no start is the shape that used to resurrect a cancelled
  // timer: it reads as running without ever having been started.
  assert.equal(restoreMachine({ ...m, startedAt_ms: 0 }, now), null);
  assert.equal(restoreMachine({ ...m, cookEnd_ms: 0 }, now), null);
  assert.equal(restoreMachine({ ...m, phase: 'BOILING' }, now), null);
  assert.equal(restoreMachine({ ...m, cooling: 'freezer' }, now), null);
  assert.equal(restoreMachine({ ...m, cookTime_s: 'ages' }, now), null);
  assert.equal(restoreMachine({ ...m, targetLevel: NaN }, now), null);
});

test('5c. a cook nobody came back to is not restored', () => {
  const m = startHot(T0, COOK_S, 'ice', 0.41);
  const ends = m.cookEnd_ms + (PULL_GRACE_SECONDS + COOLING_SECONDS) * 1000;
  const cooled = walk(m, ends);
  const stored = JSON.parse(JSON.stringify(cooled));
  assert.notEqual(restoreMachine(stored, ends + RESTORE_WINDOW_MS - 1000), null);
  assert.equal(
    restoreMachine(stored, ends + RESTORE_WINDOW_MS + 1000), null,
    'an egg an hour past its cooling step has been eaten or thrown out',
  );
});
