/**
 * The web's model over core's `step` (src/ui/model.ts, `update`): what the
 * web adds around the running cook - the primary button by phase, another
 * tab's copy taken up, the egg final here, a reload, and a cook that ends
 * before its record can be made. `step` itself is test/step.test.ts's.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { SIZE_CLASSES } from '../src/core/geometry.js';
import { CookChoices, CookSurface, endedAt_s } from '../src/core/running.js';
import { Effect, Model, Msg, update } from '../src/ui/model.js';
import { emptyModel } from '../src/ui/state.js';
import { DEFAULT_SETTINGS } from '../src/ui/store.js';
import { gridFor, knowing } from '../tools/common.js';

const S = 1791363600;
const C = knowing({ particles: 200, eggsLogged: 4, taste: 0.1 });

const CHOICES: CookChoices = {
  mass_kg: SIZE_CLASSES[2].mass_kg, massFrom: 'class', sizeTable: 'eu', eggFrom: 'fridge', customStart_C: 12,
  room_C: null, startMode: 'hot', afterBoil: 'hold', cooling: 'ice', waterLitres: 2, eggCount: 2,
  altitude_m: 0, level: 0.41,
};

function idleModel(): Model {
  return {
    ...emptyModel(), settings: { ...DEFAULT_SETTINGS }, controls: { ...DEFAULT_SETTINGS }, boilMemory: { '2.0': 480 },
    calib: C, appVersion: '0.5.0-alpha.1', prior: 'test',
  };
}

/** A page driven as cook.ts drives it: each message's model kept, and the
 *  surfaces a cook wants built at once when asked. */
class Page {
  m = idleModel();
  effects: Effect[] = [];

  go(msg: Msg, now_s: number): Effect[] {
    const [next, effects] = update(this.m, msg, now_s * 1000);
    this.m = next;
    this.effects.push(...effects);
    return effects;
  }

  /** Build every surface a cook wants, and land them. */
  land(now_s: number): void {
    for (let i = 0; i < 4; i++) {
      const wanted = [this.m.need.surface, ...this.m.ending.map((e) => e.need.surface)];
      const fresh = wanted.filter((w) => w !== null);
      if (fresh.length === 0) return;
      for (const inputs of fresh) this.m.surfaces.push(surface(inputs));
      this.go({ kind: 'landed' }, now_s);
    }
  }

  get pull(): number {
    return (this.m.plan as NonNullable<Model['plan']>).deadlines.cookEnd_s;
  }

  get coolEnd(): number {
    return (this.m.plan as NonNullable<Model['plan']>).deadlines.coolEnd_s as number;
  }
}

function surface(inputs: CookSurface['inputs']): CookSurface {
  return { inputs: inputs, grid: gridFor(C, inputs.egg, inputs.setup), profile: null };
}

function started(over: Partial<CookChoices> = {}): Page {
  const p = new Page();
  p.go({ kind: 'start', choices: { ...CHOICES, ...over }, nudge_s: 0, units: 'metric', lang: 'en', leanHint_s: 0 }, S);
  p.land(S + 1);
  return p;
}

function kinds(effects: Effect[]): string[] {
  return effects.map((e) => (e.kind === 'ring' ? `ring:${e.moment}` : e.kind));
}

test('1. the primary button by phase: the boil, the egg out, Start again; the pull alarm the plan sets', () => {
  const p = started({ startMode: 'cold' });
  assert.ok(kinds(p.effects).includes('blip'), 'Start blips');
  assert.ok(p.m.pull_s !== null, 'an alarm for the pull');
  assert.ok(kinds(p.go({ kind: 'primary' }, S + 400)).includes('blip'), 'the boil tapped');
  assert.equal(p.m.cook?.events.boilAt_s, S + 400);
  p.land(S + 401);
  assert.deepEqual(kinds(p.go({ kind: 'tick' }, p.pull + 1)), ['persist', 'ring:pull']);
  assert.equal(p.m.pull_s, null, 'rung: no alarm left');
  assert.deepEqual(kinds(p.go({ kind: 'primary' }, p.pull + 3)), ['persist', 'silence'], 'the egg out');
  p.go({ kind: 'tick' }, p.coolEnd + 1);
  const end = p.go({ kind: 'primary' }, p.coolEnd + 10);
  assert.equal(p.m.cook, null, 'Start again at Done');
  assert.deepEqual(kinds(end).slice(0, 5), ['rememberBoil', 'silence', 'log', 'forget', 'sendFinal'], 'a finished egg is logged');
  assert.deepEqual(kinds(end).slice(5), [
    'editsEnd', 'silence', 'questionsReset', 'controlsDrawn', 'drawNudge', 'shareDrawn',
  ], 'and the page goes back to the settings, with a new nudge');
  assert.deepEqual(p.m.controls, p.m.settings, 'the controls show the settings again');
  assert.notEqual(p.m.controls, p.m.settings, 'a copy of them');
});

test('2. an answer to an egg no longer open closes it here: nothing stepped, nothing written or logged', () => {
  const p = started();
  p.go({ kind: 'tick' }, p.pull + 25);
  p.go({ kind: 'tick' }, p.coolEnd + 1);
  const id = (p.m.cook as NonNullable<Model['cook']>).id_ms;
  const refused = p.go({ kind: 'answered', yolkWord: 'jammy', white: null, probe: null, storedId_ms: id + 1 }, p.coolEnd + 5);
  assert.deepEqual(refused, []);
  assert.equal(p.m.closed, true);
  assert.equal(p.m.questions, 'away');
  const end = p.go({ kind: 'cancel' }, p.coolEnd + 9);
  assert.deepEqual(kinds(end).filter((k) => k === 'log' || k === 'persist'), [], 'final here: nothing logged');
  assert.equal(p.m.cook, null);
  assert.equal(p.m.ending.length, 0);
});

test('3. another tab\'s tap is taken up, and the pull this tab never rang rings here', () => {
  const a = started({ startMode: 'cold' });
  const b = new Page();
  b.m = { ...a.m };
  a.go({ kind: 'primary' }, S + 400);
  const theirs = { cook: a.m.cook as NonNullable<Model['cook']>, answers: 'none' as const, leanHint_s: 0 };
  b.go({ kind: 'elsewhere', theirs: theirs, storedId_ms: theirs.cook.id_ms }, S + 401);
  assert.equal(b.m.cook?.events.boilAt_s, S + 400, 'B has A\'s tap');
  assert.equal(b.m.written, JSON.stringify(theirs.cook), 'B has seen A\'s write');
  a.land(S + 402);
  b.land(S + 402);
  a.go({ kind: 'tick' }, a.pull + 1);
  const rang = { cook: a.m.cook as NonNullable<Model['cook']>, answers: 'none' as const, leanHint_s: 0 };
  assert.deepEqual(kinds(b.go({ kind: 'elsewhere', theirs: rang, storedId_ms: rang.cook.id_ms }, a.pull + 2)), ['ring:pull']);
});

test('4. a reload rings nothing, and an answer given before it puts the questions away', () => {
  const p = started();
  p.go({ kind: 'tick' }, p.pull + 25);
  p.go({ kind: 'tick' }, p.coolEnd + 1);
  const id = (p.m.cook as NonNullable<Model['cook']>).id_ms;
  p.go({ kind: 'answered', yolkWord: 'jammy', white: null, probe: null, storedId_ms: id }, p.coolEnd + 5);
  const stored = { cook: p.m.cook as NonNullable<Model['cook']>, answers: 'beforeReload' as const, leanHint_s: p.m.leanHint_s };
  const q = new Page();
  q.m.surfaces = p.m.surfaces;
  const back = q.go({ kind: 'restore', stored: stored }, p.coolEnd + 30);
  assert.ok(!kinds(back).some((k) => k.startsWith('ring')), 'no ring');
  assert.equal(q.m.reloaded, true);
  assert.equal(q.m.questions, 'away');

  const early = new Page();
  const fresh = started();
  const past = { cook: fresh.m.cook as NonNullable<Model['cook']>, answers: 'none' as const, leanHint_s: 0 };
  assert.ok(!kinds(early.go({ kind: 'restore', stored: past }, fresh.pull + 5)).some((k) => k.startsWith('ring')),
    'a reload past the pull writes it rung, and rings nothing');
});

test('5. a cook ended before its surface is in waits off screen, and is logged and forgotten when it lands', () => {
  // A page whose surface never came: the egg out and Done on the interim
  // time, with no plan as it ran kept.
  const p = new Page();
  p.go({ kind: 'start', choices: CHOICES, nudge_s: 0, units: 'metric', lang: 'en', leanHint_s: 0 }, S);
  p.go({ kind: 'tick' }, p.pull + 25);
  p.go({ kind: 'tick' }, p.coolEnd + 1);
  assert.equal(p.m.cook?.asRan, null);
  const stored = { cook: p.m.cook as NonNullable<Model['cook']>, answers: 'none' as const, leanHint_s: p.m.leanHint_s };
  // A reload, two hours on: too old, and no surface built on this page.
  const q = new Page();
  q.go({ kind: 'restore', stored: stored }, p.coolEnd + 7200);
  assert.equal(q.m.cook, null, 'the page opens idle');
  assert.equal(q.m.ending.length, 1);
  const waiting = q.m.ending[0];
  assert.ok(waiting.cook !== null && endedAt_s(waiting.cook) !== null && waiting.need.surface !== null);
  q.m.surfaces.push(surface(waiting.need.surface));
  const landed = q.go({ kind: 'landed' }, p.coolEnd + 7210);
  assert.deepEqual(kinds(landed), ['log', 'forget', 'sendFinal']);
  assert.equal(q.m.ending.length, 0);
});
