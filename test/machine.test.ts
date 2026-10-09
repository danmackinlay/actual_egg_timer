/**
 * A cook as `step`'s tick runs it (src/core/step.ts): core's running cook planned at
 * the start, planned again only when something new is known - an event the
 * clock decided (`eventsDue`), the slow hob's moment, the boil tapped, the egg
 * out - and its phase read from the plan and the clock (`phaseAt`) on every
 * tick, the alarm ringing as it enters Pull. `tick` below is that loop, without
 * the page; what is checked is the timeline it walks.
 *
 * The counter-rest case is the old regression: iOS checked for a cooling
 * deadline before checking the pull grace, so a cook with no cooling step fell
 * from COOKING straight to DONE. "Out of the water — now" never appeared, the
 * grace never ran, and the pull notification still fired at a screen that
 * already said Done.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { SIZE_CLASSES } from '../src/core/geometry.js';
import { PULL_GRACE_SECONDS, Phase, phaseAt } from '../src/core/policy.js';
import { Cooling, StartMode } from '../src/core/protocol.js';
import {
  CookChoices, CookPlan, RunningCook, eventsDue, guessLengthened, replan, startCook, withBoil, withOut, writeEvents,
} from '../src/core/running.js';
import { coolingStartsIn_s } from '../src/ui/phaseView.js';
import { knowing } from '../tools/common.js';

const C = knowing({ particles: 200, eggsLogged: 0 });
const T0 = 1_791_363_600_000;
const S = T0 / 1000;

const CHOICES: CookChoices = {
  mass_kg: SIZE_CLASSES[2].mass_kg, massFrom: 'class', sizeTable: 'eu', eggFrom: 'fridge', customStart_C: 12,
  room_C: null, startMode: 'hot', afterBoil: 'hold', cooling: 'ice', waterLitres: 2, eggCount: 2,
  altitude_m: 0, level: 0.41,
};

function cookOf(startMode: StartMode, cooling: Cooling): RunningCook {
  return startCook(T0 / 1000, { ...CHOICES, startMode: startMode, cooling: cooling }, 0, { '2.0': 480 }, 'metric', 'en');
}

/** A cook under way, as the page holds it, and what it has rung for. */
interface Running {
  cook: RunningCook;
  plan: CookPlan;
  phase: Phase;
  rang: Phase[];
  plans: number;
}

function begin(cook: RunningCook, now_s: number): Running {
  const plan = replan(cook, C, null, 0, now_s);
  return { cook: cook, plan: plan, phase: phaseAt(plan.deadlines, now_s), rang: [], plans: 1 };
}

/** Plan again, now, with the events the clock has decided written down. */
function planNow(r: Running, now_s: number): void {
  r.plan = replan(r.cook, C, null, 0, now_s);
  r.plans += 1;
  const due = eventsDue(r.cook, r.plan, now_s);
  if (JSON.stringify(due) !== JSON.stringify(r.cook.events)) {
    r.cook = writeEvents(r.cook, due);
    r.plan = replan(r.cook, C, null, 0, now_s);
    r.plans += 1;
  }
}

/** One tick of the page's ticker (`onTick` and `notice`, cook.ts). */
function tick(r: Running, now_s: number): void {
  const slow = r.plan.slowHobAt_s !== null && now_s >= r.plan.slowHobAt_s;
  if (slow || JSON.stringify(eventsDue(r.cook, r.plan, now_s)) !== JSON.stringify(r.cook.events)) planNow(r, now_s);
  const phase = phaseAt(r.plan.deadlines, now_s);
  if (phase !== r.phase && (phase === 'PULL' || phase === 'DONE')) r.rang.push(phase);
  r.phase = phase;
}

/** Run `r` to `until_s`, a tick a second. */
function runTo(r: Running, from_s: number, until_s: number): Running {
  for (let t = from_s; t <= until_s; t += 1) tick(r, t);
  return r;
}

// --------------------------------------------------------------------------
// 1. The timeline
// --------------------------------------------------------------------------

for (const cooling of ['ice', 'tap', 'counter'] as Cooling[]) {
  test(`1. a ${cooling} cook passes through PULL for the whole grace, and rings once for it and once at Done`, () => {
    const r = begin(cookOf('hot', cooling), S);
    assert.equal(r.phase, 'COOKING');
    const pull = r.plan.deadlines.cookEnd_s;
    runTo(r, S, Math.ceil(pull));
    assert.equal(r.phase, 'PULL', `${cooling} skipped the pull`);
    runTo(r, Math.ceil(pull) + 1, Math.ceil(pull + PULL_GRACE_SECONDS) - 1);
    assert.equal(r.phase, 'PULL', `${cooling} left PULL early`);
    runTo(r, Math.ceil(pull + PULL_GRACE_SECONDS), Math.ceil(pull + PULL_GRACE_SECONDS));
    assert.equal(r.phase, cooling === 'counter' ? 'DONE' : 'COOLING', 'the grace runs out into the cooling, or Done');
    assert.equal(r.cook.events.pulled?.by, 'timeout', 'nobody said: the clock assumed the pull');
    runTo(r, Math.ceil(pull + PULL_GRACE_SECONDS) + 1, S + 3600);
    assert.equal(r.phase, 'DONE');
    assert.deepEqual(r.rang, ['PULL', 'DONE']);
    assert.ok(r.plans <= 8, `planned ${r.plans} times in an hour of ticks, never every tick`);
    if (cooling !== 'counter') assert.notEqual(r.cook.events.cooledAt_s, null, 'the cooling ended, written down');
  });
}

test('1b. the cook\'s tap out of PULL starts the cooling from the tap', () => {
  const r = begin(cookOf('hot', 'ice'), S);
  const pull = r.plan.deadlines.cookEnd_s;
  runTo(r, S, Math.ceil(pull) + 4);
  const out = Math.ceil(pull) + 5;
  r.cook = withOut(r.cook, r.plan, out);
  planNow(r, out);
  tick(r, out);
  assert.equal(r.phase, 'COOLING');
  assert.equal(r.cook.events.pulled?.by, 'cook');
  assert.equal(r.plan.deadlines.coolEnd_s, out + r.plan.cool_s);
  const counter = begin(cookOf('hot', 'counter'), S);
  runTo(counter, S, Math.ceil(pull) + 4);
  counter.cook = withOut(counter.cook, counter.plan, out);
  planNow(counter, out);
  tick(counter, out);
  assert.equal(counter.phase, 'DONE', 'on the counter, out is Done');
  assert.deepEqual(counter.rang, ['PULL', 'DONE']);
});

test('1c. "cooling starts on its own" is promised only where the grace runs out into COOLING', () => {
  for (const cooling of ['ice', 'tap', 'counter'] as Cooling[]) {
    const r = begin(cookOf('hot', cooling), S);
    const d = r.plan.deadlines;
    const promised = coolingStartsIn_s(d, cooling, d.cookEnd_s + 5.5);
    if (cooling === 'counter') assert.equal(promised, null, 'a counter rest has no cooling to start');
    else assert.equal(promised, Math.ceil(PULL_GRACE_SECONDS - 5.5), `${cooling}: whole seconds left`);
    assert.equal(coolingStartsIn_s(d, cooling, d.cookEnd_s - 1), null, 'only in PULL');
    assert.equal(coolingStartsIn_s(d, cooling, d.cookEnd_s + PULL_GRACE_SECONDS + 3), null, 'not once it has');
  }
});

// --------------------------------------------------------------------------
// 2. A cold start
// --------------------------------------------------------------------------

test('2. a cold start is HEATING until the boil is tapped, however slow the hob, and rings nothing', () => {
  const r = begin(cookOf('cold', 'ice'), S);
  assert.equal(r.phase, 'HEATING');
  const guessed = r.plan.deadlines.cookEnd_s;
  runTo(r, S, S + 1500);
  assert.equal(r.phase, 'HEATING');
  assert.deepEqual(r.rang, []);
  assert.ok(guessLengthened(r.plan), 'the slow hob lengthened the guess');
  assert.ok(r.plan.deadlines.cookEnd_s > guessed);
  assert.ok(r.plans < 150, `planned ${r.plans} times in 1500 ticks: at the slow hob's moments, not every tick`);
});

test('2b. the tap fixes the time to boil from the start; a tap after the plan\'s pull pulls at once', () => {
  const r = begin(cookOf('cold', 'ice'), S);
  runTo(r, S, S + 420);
  r.cook = withBoil(r.cook, S + 420);
  planNow(r, S + 420);
  tick(r, S + 420);
  assert.equal(r.phase, 'COOKING');
  assert.equal(r.plan.setup.timeToBoil_s, 420, 'the ramp is the tap less the start');
  assert.equal(r.plan.deadlines.provisional, false);

  // A hob so slow the egg would be done before it boiled: the tap comes after
  // the pull the measured ramp gives, so the pull is the tap, with its grace.
  const slow = begin(cookOf('cold', 'ice'), S);
  runTo(slow, S, S + 1400);
  slow.cook = withBoil(slow.cook, S + 1400);
  planNow(slow, S + 1400);
  tick(slow, S + 1400);
  assert.equal(slow.phase, 'PULL');
  assert.equal(slow.plan.deadlines.cookEnd_s, S + 1400);
  assert.deepEqual(slow.rang, ['PULL'], 'and it rings');
});
