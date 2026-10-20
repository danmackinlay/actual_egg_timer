/**
 * The cooks an app holds (src/core/cooks.ts): the one on screen and those
 * ended waiting on their records, the effects tagged with whose cook, an
 * event after the cook is too old, and the eggs still open.
 * fixtures/cooks.json holds iOS to the same; what is checked here is the
 * reasoning.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { inputsKey } from '../src/core/decide.ts';
import type { CookSurface } from '../src/core/running.ts';
import type { CookEvent } from '../src/core/step.ts';
import {
  type Cooks, type CooksEffect, type CooksEnv, cooksLanded, cooksStep, cooksWaiting, noCooks, openEggs,
} from '../src/core/cooks.ts';
import { C, CHOICES, S } from './cooks.ts';
import { gridFor } from '../tools/common.ts';

/** The cooks driven as an app drives them, every surface a cook wants built
 *  when asked, and the calibration before an egg held back until `before`. */
class Held {
  q: Cooks = noCooks();
  surfaces: CookSurface[] = [];
  before = false;
  effects: CooksEffect[] = [];

  env(): CooksEnv {
    return {
      calibration: C, surfaces: this.surfaces, app: 'web', appVersion: '0.5.0-alpha.1', prior: 'test', day: '2026-10-07',
      at: cooksWaiting(this.q).map((w) => ({
        id_ms: w.cook.id_ms, before: this.before ? { calibration: C, surfaces: this.surfaces } : null, day: '2026-10-07',
      })),
    };
  }

  go(event: CookEvent): CooksEffect[] {
    const out = cooksStep(this.q, event, this.env());
    this.q = out.cooks;
    this.effects.push(...out.effects);
    return out.effects;
  }

  /** Every surface wanted, built, and landed. */
  land(now_s: number): CooksEffect[] {
    for (const w of cooksWaiting(this.q)) {
      for (const inputs of [w.need.surface, w.need.beforeSurface]) {
        if (inputs !== null && !this.surfaces.some((s) => inputsKey(s.inputs) === inputsKey(inputs))) {
          this.surfaces.push({ inputs: inputs, grid: gridFor(C, inputs.egg, inputs.setup), profile: null });
        }
      }
    }
    const out = cooksLanded(this.q, now_s, this.env());
    this.q = out.cooks;
    this.effects.push(...out.effects);
    return out.effects;
  }

  get screenId(): number | null {
    return this.q.screen.cook?.id_ms ?? null;
  }

  get plan() {
    const p = this.q.screen.plan;
    if (p === null) throw new Error('no cook on screen');
    return p;
  }
}

function kinds(effects: CooksEffect[]): string[] {
  return effects.map((e) => e.effect.kind);
}

/** A hot cook to Done, on its surface. */
function done(): Held {
  const h = new Held();
  h.go({
    kind: 'start', now_s: S, choices: { ...CHOICES, startMode: 'hot' }, nudge_s: 0, boilMemory: { '2.0': 480 },
    units: 'metric', lang: 'en', leanHint_s: 0,
  });
  h.land(S + 1);
  h.go({ kind: 'tick', now_s: h.plan.deadlines.cookEnd_s + 1 });
  h.go({ kind: 'out', now_s: h.plan.deadlines.cookEnd_s + 3 });
  h.go({ kind: 'tick', now_s: (h.plan.deadlines.coolEnd_s as number) + 1 });
  return h;
}

test('an answer after the egg is too old comes after the tick that ends it: the egg logged unanswered, the answer not taken', () => {
  const h = done();
  const late = h.plan.tooOldAt_s + 5;
  const out = h.go({ kind: 'answered', now_s: late, yolkWord: 'jammy', white: null, probe: null });
  assert.deepEqual(kinds(out), ['silence', 'log', 'forget', 'sendFinal']);
  const log = out.find((e) => e.effect.kind === 'log');
  assert.ok(log !== undefined && log.effect.kind === 'log' && log.effect.record.yolkWord === null, 'unanswered');
  assert.ok(out.every((e) => e.onScreen && e.ended), 'the cook on screen, ended');
  assert.equal(h.q.screen.cook, null);
});

test('a correction after an answered egg is too old logs nothing again', () => {
  const h = done();
  h.go({ kind: 'answered', now_s: (h.plan.deadlines.coolEnd_s as number) + 10, yolkWord: 'jammy', white: null, probe: null });
  const late = h.plan.tooOldAt_s + 5;
  const out = h.go({ kind: 'correct', now_s: late, choices: { ...CHOICES, startMode: 'hot', mass_kg: 0.076 } });
  assert.deepEqual(kinds(out), ['silence', 'forget', 'sendFinal']);
});

test('a cook ended waiting on its calibration before is open beside the next; written only as ended; its alarms not the screen\'s', () => {
  const h = done();
  const cooled = h.plan.deadlines.coolEnd_s as number;
  h.go({ kind: 'answered', now_s: cooled + 10, yolkWord: 'jammy', white: null, probe: null });
  const first = h.q.screen.cook?.id_ms as number;
  assert.deepEqual(openEggs(h.q, cooled + 11), [first], 'logged and on screen: open');
  h.go({ kind: 'correct', now_s: cooled + 20, choices: { ...CHOICES, startMode: 'hot', mass_kg: 0.076 } });
  h.go({ kind: 'startAgain', now_s: cooled + 25 });
  assert.equal(h.screenId, null);
  assert.equal(h.q.ending.length, 1);
  h.go({
    kind: 'start', now_s: cooled + 30, choices: CHOICES, nudge_s: 0, boilMemory: { '2.0': 480 }, units: 'metric',
    lang: 'en', leanHint_s: 0,
  });
  const second = h.screenId;
  assert.deepEqual(openEggs(h.q, cooled + 31), [first], 'the next not yet logged; the ended one open');
  const landed = h.land(cooled + 32);
  const off = landed.filter((e) => e.id_ms === first);
  assert.ok(off.every((e) => !e.onScreen && e.ended), 'the ended cook\'s effects tagged so');
  assert.ok(!off.some((e) => ['alarms', 'ring', 'silence'].includes(e.effect.kind)), 'none of the screen\'s');
  assert.equal(h.screenId, second);
  h.before = true;
  const logged = h.land(cooled + 33);
  h.land(cooled + 34);
  assert.ok([...logged, ...h.effects].some((e) => e.id_ms === first && e.effect.kind === 'forget'));
  assert.equal(h.q.ending.length, 0);
  assert.deepEqual(openEggs(h.q, cooled + 35), []);
});
