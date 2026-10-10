/**
 * The running cook as one state machine (src/core/step.ts), its readout
 * (src/core/readout.ts) and the key of a decision surface (`inputsKey`,
 * src/core/decide.ts). fixtures/step.json holds iOS to the same traces; what
 * is checked here is the reasoning.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { SIZE_CLASSES } from '../src/core/geometry.js';
import { Cooling } from '../src/core/protocol.js';
import { decisionInputs, inputsKey, numberKey } from '../src/core/decide.js';
import { EggRecord } from '../src/core/record.js';
import {
  CookChoices, CookSurface, PULL_GRACE_SECONDS, Phase, cookSetupOf, guessLengthened, phaseAt, readRunningCook,
  sameDecisionInputs,
} from '../src/core/running.js';
import { coolingStartsIn_s, readoutAt } from '../src/core/readout.js';
import { CookEffect, CookEnv, CookEvent, CookState, CookStep, step, surfaceFor } from '../src/core/step.js';
import { gridFor, knowing } from '../tools/common.js';

const S = 1791363600;
const C = knowing({ particles: 200, eggsLogged: 4, taste: 0.1 });

const CHOICES: CookChoices = {
  mass_kg: SIZE_CLASSES[2].mass_kg, massFrom: 'class', sizeTable: 'eu', eggFrom: 'fridge', customStart_C: 12,
  room_C: null, startMode: 'hot', afterBoil: 'hold', cooling: 'ice', waterLitres: 2, eggCount: 2,
  altitude_m: 0, level: 0.41,
};

function envOf(): CookEnv {
  return {
    calibration: C, surfaces: [], before: null, app: 'web', appVersion: '0.5.0-alpha.1', prior: 'test',
    day: '2026-10-07',
  };
}

/** A cook driven as an app drives one: each step's state handed to the
 *  next, and whatever it needs built at once, and landed. */
class Driver {
  state: CookState = { cook: null, plan: null, leanHint_s: 0 };
  env = envOf();
  last: CookStep | null = null;
  effects: CookEffect[] = [];
  /** The calibration before this egg: here no egg is folded, so the one as it stands. */
  before = C;

  go(event: CookEvent): CookStep {
    const out = step(this.state, event, this.env);
    this.state = { cook: out.cook, plan: out.plan, leanHint_s: out.leanHint_s };
    this.last = out;
    this.effects.push(...out.effects);
    return out;
  }

  /** Build what the last step needed and is not yet built, and land it. */
  land(now_s: number): CookStep {
    const need = (this.last as CookStep).need;
    if (need.surface !== null && surfaceFor(this.env.surfaces, need.surface) === null) {
      this.env.surfaces.push(surface(this.env.calibration, need.surface));
    }
    if (need.before && this.env.before === null) this.env.before = { calibration: this.before, surfaces: [] };
    const before = this.env.before;
    if (need.beforeSurface !== null && before !== null && surfaceFor(before.surfaces, need.beforeSurface) === null) {
      before.surfaces.push(surface(before.calibration, need.beforeSurface));
    }
    return this.go({ kind: 'surfaceLanded', now_s: now_s });
  }

  /** Whether the last step wants something not yet built. Here no odds
   *  profile is built, so a step goes on asking for a surface it has. */
  wantsMore(): boolean {
    const need = (this.last as CookStep).need;
    const before = this.env.before;
    return (need.surface !== null && surfaceFor(this.env.surfaces, need.surface) === null)
      || (need.before && before === null)
      || (need.beforeSurface !== null && (before === null || surfaceFor(before.surfaces, need.beforeSurface) === null));
  }

  /** Land until nothing more is wanted that can be built. */
  settle(now_s: number): CookStep {
    for (let i = 0; i < 4 && this.wantsMore(); i++) this.land(now_s);
    return this.last as CookStep;
  }

  get pull(): number {
    return (this.state.plan as NonNullable<CookState['plan']>).deadlines.cookEnd_s;
  }

  get coolEnd(): number {
    return (this.state.plan as NonNullable<CookState['plan']>).deadlines.coolEnd_s as number;
  }
}

function surface(c: typeof C, inputs: CookSurface['inputs']): CookSurface {
  return { inputs: inputs, grid: gridFor(c, inputs.egg, inputs.setup), profile: null };
}

function start(over: Partial<CookChoices> = {}): Driver {
  const d = new Driver();
  d.go({
    kind: 'start', now_s: S, choices: { ...CHOICES, ...over }, nudge_s: 0, boilMemory: { '2.0': 480 }, units: 'metric',
    lang: 'en', leanHint_s: 0,
  });
  d.settle(S + 1);
  return d;
}

function kinds(effects: CookEffect[]): string[] {
  return effects.map((e) => (e.kind === 'ring' ? `ring:${e.moment}` : e.kind));
}

function logs(effects: CookEffect[]): EggRecord[] {
  const out: EggRecord[] = [];
  for (const e of effects) if (e.kind === 'log') out.push(e.record);
  return out;
}

test('1. a tick with nothing due is the state as it was: no plan, no effect', () => {
  const d = start();
  const plan = d.state.plan;
  const out = d.go({ kind: 'tick', now_s: S + 60 });
  assert.equal(out.plan, plan, 'the same plan, not planned again');
  assert.deepEqual(out.effects, []);
  assert.equal(out.need.wakeAt_s, d.pull, 'the next moment is the pull');
});

test('2. the pull rings once, the out silences it, Done rings, and Start again logs the egg, then forgets it', () => {
  const d = start();
  const pull = d.pull;
  assert.deepEqual(kinds(d.go({ kind: 'tick', now_s: pull + 1 }).effects), ['persist', 'ring:pull', 'alarms']);
  assert.deepEqual(kinds(d.go({ kind: 'tick', now_s: pull + 2 }).effects), [], 'rung once');
  assert.deepEqual(kinds(d.go({ kind: 'out', now_s: pull + 4 }).effects), ['persist', 'silence', 'alarms']);
  assert.deepEqual(kinds(d.go({ kind: 'tick', now_s: d.coolEnd + 1 }).effects), ['persist', 'ring:cooled', 'alarms']);
  const done = d.go({ kind: 'answered', now_s: d.coolEnd + 5, yolkWord: 'jammy', white: null, probe: null });
  assert.equal(logs(done.effects).length, 1);
  const end = d.go({ kind: 'startAgain', now_s: d.coolEnd + 9 });
  assert.equal(end.cook, null);
  assert.deepEqual(kinds(end.effects), ['silence', 'forget', 'sendFinal'], 'logged already: nothing more to log');
  assert.ok(!d.effects.slice(0, -2).some((e) => e.kind === 'sendFinal'), 'nothing final before Start again');
});

test('3. an answer is taken only at Done, once each, and the second logs in place of the first', () => {
  const d = start();
  const early = d.go({ kind: 'answered', now_s: S + 60, yolkWord: 'jammy', white: null, probe: null });
  assert.deepEqual(early.effects, [], 'not before Done');
  d.go({ kind: 'tick', now_s: d.pull + 25 });
  d.go({ kind: 'tick', now_s: d.coolEnd + 1 });
  const first = d.go({ kind: 'answered', now_s: d.coolEnd + 5, yolkWord: 'jammy', white: null, probe: null });
  const again = d.go({ kind: 'answered', now_s: d.coolEnd + 6, yolkWord: 'runny', white: null, probe: null });
  assert.deepEqual(again.effects, [], 'the yolk is answered once');
  const white = d.go({ kind: 'answered', now_s: d.coolEnd + 7, yolkWord: null, white: 'firm', probe: null });
  const [a] = logs(first.effects);
  const [b] = logs(white.effects);
  assert.ok(a !== undefined && b !== undefined);
  assert.equal(white.effects.find((e) => e.kind === 'log' && e.replaces) !== undefined, true);
  assert.deepEqual([a.yolkWord, b.yolkWord, b.white], ['jammy', 'jammy', 'firm']);
});

test('4. a correction at Done is logged on the calibration before this egg; changed back, the first record to the bit', () => {
  const d = start();
  d.go({ kind: 'tick', now_s: d.pull + 1 });
  d.go({ kind: 'out', now_s: d.pull + 3 });
  d.go({ kind: 'tick', now_s: d.coolEnd + 1 });
  const t = d.coolEnd;
  const [first] = logs(d.go({ kind: 'answered', now_s: t + 5, yolkWord: 'jammy', white: null, probe: null }).effects);
  const corrected = d.go({ kind: 'correct', now_s: t + 10, choices: { ...CHOICES, mass_kg: 0.076 } });
  assert.equal(corrected.need.before, true, 'the calibration before this egg is wanted');
  assert.equal(logs(corrected.effects).length, 0, 'not from the calibration as it stands');
  d.settle(t + 11);
  const heavier = logs(d.effects).at(-1) as EggRecord;
  assert.notDeepEqual(heavier, first);
  d.go({ kind: 'correct', now_s: t + 20, choices: CHOICES });
  d.settle(t + 21);
  const back = logs(d.effects).at(-1) as EggRecord;
  assert.deepEqual(back, first);
});

test('5. a stored cook read back at any step is the cook as it stood', () => {
  const d = start({ startMode: 'cold' });
  const at = [S + 300, S + 480];
  d.go({ kind: 'tick', now_s: at[0] });
  d.go({ kind: 'boil', now_s: at[1] });
  d.go({ kind: 'correct', now_s: at[1] + 20, choices: { ...CHOICES, startMode: 'cold', waterLitres: 3 } });
  d.go({ kind: 'tick', now_s: d.pull + 25 });
  d.go({ kind: 'tick', now_s: d.coolEnd + 1 });
  d.go({ kind: 'answered', now_s: d.coolEnd + 5, yolkWord: 'soft', white: 'tender', probe: { centre_C: 63.5, after_s: 0 } });
  const cook = d.state.cook;
  assert.ok(cook !== null && cook.log.length >= 6);
  assert.deepEqual(readRunningCook(JSON.parse(JSON.stringify(cook))), cook);
});

test('6. Cancel while heating: nothing remembered, nothing logged, the alarms gone', () => {
  const d = start({ startMode: 'cold' });
  const end = d.go({ kind: 'startAgain', now_s: S + 120 });
  assert.equal(end.cook, null);
  assert.deepEqual(kinds(end.effects), ['silence', 'alarms', 'forget', 'sendFinal']);
});

test('7. the readout: counting down, past the pull, and the question that holds Done back', () => {
  const d = start();
  const plan = d.state.plan;
  const cook = d.state.cook;
  assert.ok(plan !== null && cook !== null);
  const cooking = readoutAt(cook, plan, S + 60);
  assert.deepEqual([cooking.phase, cooking.label, cooking.sign, cooking.cancel], ['COOKING', 'readout.phase.cookingBoiling', '', true]);
  assert.ok(Math.abs(cooking.clock_s - (plan.deadlines.cookEnd_s - S - 60)) < 1e-9);
  assert.equal(cooking.hint?.args['boiling'], plan.setup.boiling_C);
  const pull = readoutAt(cook, plan, plan.deadlines.cookEnd_s + 4.5);
  assert.deepEqual([pull.sign, pull.clock_s, pull.hint?.args['seconds']], ['+', 4.5, 16]);
  // The grace runs out asleep, then the cook says the water was cold.
  d.go({ kind: 'tick', now_s: d.pull + 25 });
  const asked = d.go({ kind: 'correct', now_s: d.pull + 30, choices: { ...CHOICES, startMode: 'cold' } });
  assert.ok(asked.cook !== null && asked.plan !== null);
  const r = readoutAt(asked.cook, asked.plan, d.pull + 40);
  assert.deepEqual([r.asking, r.label, r.primary, r.secondary, r.hint, r.sign], [true, 'ask.stillIn', 'ask.stillIn.yes', 'ask.stillIn.no', null, '+']);
  assert.deepEqual(kinds(asked.effects).filter((k) => k === 'alarms'), ['alarms'], 'the alarms cancelled while it asks');
  // "Cooling starts on its own" counts down only in the pull, and only where
  // the grace runs out into a cooling: on the counter it runs out into Done.
  const d0 = plan.deadlines;
  for (const cooling of ['ice', 'tap', 'counter'] as Cooling[]) {
    const left = coolingStartsIn_s(d0, cooling, d0.cookEnd_s + 5.5);
    assert.equal(left, cooling === 'counter' ? null : Math.ceil(PULL_GRACE_SECONDS - 5.5), cooling);
    assert.equal(coolingStartsIn_s(d0, cooling, d0.cookEnd_s - 1), null, 'only in the pull');
    assert.equal(coolingStartsIn_s(d0, cooling, d0.cookEnd_s + PULL_GRACE_SECONDS + 3), null, 'not once it has');
  }
});

test('8. the surface key: equal exactly when the inputs are, numbers to the bit', () => {
  const pot = cookSetupOf(CHOICES, 480);
  const a = decisionInputs(C, pot.egg, pot.setup);
  assert.equal(inputsKey(a), inputsKey(JSON.parse(JSON.stringify(a)) as typeof a));
  const nudged = { ...a, setup: { ...a.setup, eggStart_C: a.setup.eggStart_C + 1e-12 } };
  assert.notEqual(inputsKey(nudged), inputsKey(a));
  assert.equal(sameDecisionInputs(nudged, a), false);
  const { afterBoil: _held, ...noBurner } = a.setup;
  assert.equal(inputsKey({ ...a, setup: noBurner }), inputsKey(a), 'no burner is the heat held');
  assert.equal(numberKey(0), numberKey(-0));
  assert.equal(numberKey(480), '407e000000000000');
  assert.equal(numberKey(0.1), '3fb999999999999a');
});

/* ------------------------------------------- a tick a second, as an app's */

/** What ticking a cook once a second showed: the phase after each tick, the
 *  moment of each ring, and how many plans were made. */
interface Trace {
  phases: Map<number, Phase>;
  rings: [number, string][];
  plans: number;
}

/** Tick `d` once a second from `from_s` to `until_s`, as an app's ticker
 *  does, landing whatever a step wants built. */
function tickEach(d: Driver, from_s: number, until_s: number): Trace {
  const t: Trace = { phases: new Map(), rings: [], plans: 0 };
  for (let now = from_s; now <= until_s; now++) {
    const before = d.state.plan;
    const seen = d.effects.length;
    d.go({ kind: 'tick', now_s: now });
    d.settle(now);
    if (d.state.plan !== before) t.plans++;
    for (const k of kinds(d.effects.slice(seen))) if (k.startsWith('ring:')) t.rings.push([now, k]);
    const plan = d.state.plan;
    if (plan !== null) t.phases.set(now, phaseAt(plan.deadlines, now));
  }
  return t;
}

// The counter rest is the old regression: iOS looked for the cooling's end
// before the pull's grace, so a cook with no cooling fell from Cooking
// straight to Done, the pull never shown and its alarm ringing at Done.
for (const cooling of ['ice', 'tap', 'counter'] as Cooling[]) {
  test(`9. ${cooling}, ticked each second: the pull rings, holds for its whole grace, then the cooling or Done, which rings once`, () => {
    const d = start({ cooling: cooling });
    const pull = Math.ceil(d.pull);
    const graceEnd = Math.ceil(d.pull + PULL_GRACE_SECONDS);
    const t = tickEach(d, S + 2, S + 3600);
    assert.equal(t.phases.get(S + 2), 'COOKING');
    assert.equal(t.phases.get(pull - 1), 'COOKING');
    for (let now = pull; now < graceEnd; now++) assert.equal(t.phases.get(now), 'PULL', `${now - pull} s into the grace`);
    assert.equal(t.phases.get(graceEnd), cooling === 'counter' ? 'DONE' : 'COOLING', 'the grace runs out');
    assert.equal(t.phases.get(S + 3600), 'DONE');
    const cook = d.state.cook;
    assert.ok(cook !== null);
    assert.equal(cook.events.pulled?.by, 'timeout', 'nobody said: the clock assumed the pull');
    const done = cooling === 'counter' ? graceEnd : Math.ceil(d.coolEnd);
    assert.deepEqual(t.rings, [[pull, 'ring:pull'], [done, 'ring:cooled']]);
    if (cooling !== 'counter') assert.notEqual(cook.events.cooledAt_s, null, 'the cooling ended, written down');
    assert.ok(t.plans <= 8, `planned ${t.plans} times in an hour of ticks, never every tick`);
  });
}

test("10. the cook's tap out of the pull: the cooling counted from the tap, or Done on the counter", () => {
  for (const cooling of ['ice', 'counter'] as Cooling[]) {
    const d = start({ cooling: cooling });
    const t = tickEach(d, S + 2, Math.ceil(d.pull) + 4);
    const out = Math.ceil(d.pull) + 5;
    const step = d.go({ kind: 'out', now_s: out });
    const plan = d.state.plan;
    assert.ok(plan !== null && d.state.cook !== null);
    assert.equal(d.state.cook.events.pulled?.by, 'cook');
    assert.equal(phaseAt(plan.deadlines, out), cooling === 'counter' ? 'DONE' : 'COOLING');
    if (cooling === 'ice') assert.equal(plan.deadlines.coolEnd_s, out + plan.cool_s, 'counted from the tap');
    const rings = [...t.rings.map(([, k]) => k), ...kinds(step.effects).filter((k) => k.startsWith('ring:'))];
    assert.deepEqual(rings, cooling === 'counter' ? ['ring:pull', 'ring:cooled'] : ['ring:pull']);
  }
});

test('11. a cold start ticked each second heats until the boil is tapped, however slow the hob, and rings nothing', () => {
  const d = start({ startMode: 'cold' });
  const guessed = d.pull;
  const t = tickEach(d, S + 2, S + 1400);
  for (const [now, phase] of t.phases) assert.equal(phase, 'HEATING', `${now - S} s`);
  assert.deepEqual(t.rings, []);
  const plan = d.state.plan;
  assert.ok(plan !== null && guessLengthened(plan) && d.pull > guessed, 'the slow hob lengthened the guess');
  assert.ok(t.plans < 150, `planned ${t.plans} times in 1400 ticks: at the slow hob's moments, not every tick`);
  // So slow a hob that the egg would be done before the water boiled: the
  // tap comes after the pull the measured ramp gives, so it is the pull.
  const late = d.go({ kind: 'boil', now_s: S + 1400 });
  assert.equal(d.pull, S + 1400);
  assert.equal(phaseAt((d.state.plan as NonNullable<CookState['plan']>).deadlines, S + 1400), 'PULL');
  assert.ok(kinds(late.effects).includes('ring:pull'), 'and it rings');
  // An ordinary tap: the ramp is the tap less the start, the guess over.
  const e = start({ startMode: 'cold' });
  tickEach(e, S + 2, S + 420);
  e.go({ kind: 'boil', now_s: S + 420 });
  e.settle(S + 420);
  const tapped = e.state.plan as NonNullable<CookState['plan']>;
  assert.equal(phaseAt(tapped.deadlines, S + 420), 'COOKING');
  assert.equal(tapped.setup.timeToBoil_s, 420);
  assert.equal(tapped.deadlines.provisional, false);
});
