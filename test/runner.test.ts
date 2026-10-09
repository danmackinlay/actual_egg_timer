/**
 * The runner's work on the stores and the worker (src/ui/cook.ts,
 * `performStored`; src/ui/needs.ts): what `update` asks of them carried out
 * against a page's own stores over a storage in memory, a sharing endpoint
 * that answers here, and builds this test holds back and lets land. The
 * effects are the ones `update` returns for the cook, so the order tested is
 * the order the page runs them in.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CookSurface } from '../src/core/running.js';
import { DecisionInputs } from '../src/core/decide.js';
import { DoseGrid } from '../src/core/doseGrid.js';
import { Calibration } from '../src/core/record.js';
import { Stores, performStored } from '../src/ui/cook.js';
import { openLearner } from '../src/ui/calibration.js';
import { Effect, Model, Msg, update } from '../src/ui/model.js';
import { Builds, openNeeds } from '../src/ui/needs.js';
import { openSharing } from '../src/ui/share.js';
import { emptyModel } from '../src/ui/state.js';
import { DEFAULT_SETTINGS, openCooks, openPans, openSettings } from '../src/ui/store.js';
import { sizeClassesFor } from '../src/core/geometry.js';
import { gridFor, knowing } from '../tools/common.js';

/** localStorage, in memory, and the page's timers, as a browser runs them. */
const storage = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); },
    removeItem: (k: string) => { storage.delete(k); },
  },
  setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
  clearTimeout: (h: number) => clearTimeout(h),
};

const S = 1791363600;
const C = knowing({ particles: 200, eggsLogged: 4, taste: 0.1 });

/** A page's stores, opened as boot() opens them, sending to a sharing
 *  endpoint that takes every egg and keeps what it was sent. */
function page(): { stores: Stores; posted: unknown[] } {
  const posted: unknown[] = [];
  const learner = openLearner();
  const stores: Stores = {
    settings: openSettings(sizeClassesFor('eu')), pans: openPans(), cooks: openCooks(), learner: learner,
    sharing: openSharing({ log: () => learner.keptState().log, finalCount: () => learner.keptState().log.length }, {
      post: async (body) => { posted.push(JSON.parse(body)); return 201; },
      remove: async () => 200,
    }),
  };
  return { stores: stores, posted: posted };
}

function go(m: Model, msg: Msg, now_s: number): [Model, Effect[]] {
  return update(m, msg, now_s * 1000);
}

/** The cook's own surfaces, built. */
function surfaced(m: Model, now_s: number): Model {
  let next = m;
  for (let i = 0; i < 4 && next.need.surface !== null; i++) {
    const inputs = next.need.surface;
    const surface: CookSurface = { inputs: inputs, grid: gridFor(C, inputs.egg, inputs.setup), profile: null };
    next = go({ ...next, surfaces: [...next.surfaces, surface] }, { kind: 'landed' }, now_s)[0];
  }
  return next;
}

/** A cook begun on the defaults, hot, and carried to Done, unanswered, with
 *  every write the page made on the way carried out. */
function atDone(stores: Stores): Model {
  const settings = { ...DEFAULT_SETTINGS, startMode: 'hot' as const };
  const idle: Model = {
    ...emptyModel(), settings: settings, controls: { ...settings }, boilMemory: {}, calib: C, appVersion: '0.5.0-alpha.1',
    prior: 'test',
  };
  let [m, effects] = go(idle, { kind: 'begin', units: 'metric', lang: 'en' }, S);
  carryOut(effects, stores, m);
  m = surfaced(m, S + 1);
  const pull = m.plan!.deadlines.cookEnd_s;
  [m, effects] = go(m, { kind: 'tick' }, pull + 25);
  carryOut(effects, stores, m);
  [m, effects] = go(m, { kind: 'tick' }, m.plan!.deadlines.coolEnd_s! + 1);
  carryOut(effects, stores, m);
  return m;
}

function carryOut(effects: Effect[], stores: Stores, m: Model, send: (msg: Msg) => void = () => undefined): void {
  for (const e of effects) performStored(e, stores, m.boilMemory, send);
}

/** Every timer and microtask due now, run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('the egg\'s record is in the log before the cook is forgotten', async () => {
  storage.clear();
  const { stores } = page();
  const m = atDone(stores);
  assert.notEqual(stores.cooks.peek(), null, 'written down while it ran');
  const [, effects] = go(m, { kind: 'primary' }, m.plan!.deadlines.coolEnd_s! + 10);
  assert.ok(effects.findIndex((e) => e.kind === 'log') < effects.findIndex((e) => e.kind === 'forget'));
  const order: string[] = [];
  const clear = stores.cooks.clear;
  stores.cooks.clear = (id) => {
    order.push(`forget, the log holding ${stores.learner.keptState().log.length}`);
    clear(id);
  };
  carryOut(effects, stores, m);
  assert.deepEqual(order, ['forget, the log holding 1']);
  assert.equal(stores.cooks.peek(), null);
  await settle();
});

test('what is final is sent only once the egg is in the log', async () => {
  storage.clear();
  const { stores, posted } = page();
  await stores.sharing.setSharing(true);
  assert.equal(posted.length, 0, 'nothing in the log yet');
  const m = atDone(stores);
  const [, effects] = go(m, { kind: 'primary' }, m.plan!.deadlines.coolEnd_s! + 10);
  carryOut(effects, stores, m);
  await settle();
  await settle();
  assert.equal(posted.length, 1, 'the egg just logged, sent');
  assert.equal(stores.sharing.state().sent, 1);
});

test('a cook ended before its record can be made stays stored until it is logged', async () => {
  storage.clear();
  const { stores } = page();
  const settings = { ...DEFAULT_SETTINGS, startMode: 'hot' as const };
  const idle: Model = {
    ...emptyModel(), settings: settings, controls: { ...settings }, boilMemory: {}, calib: C, appVersion: '0.5.0-alpha.1',
    prior: 'test',
  };
  // No surface ever comes on this page: the cook runs to Done on the interim
  // time, and Start again ends it before its record can be made.
  let [m, effects] = go(idle, { kind: 'begin', units: 'metric', lang: 'en' }, S);
  carryOut(effects, stores, m);
  const pull = m.plan!.deadlines.cookEnd_s;
  [m, effects] = go(m, { kind: 'tick' }, pull + 25);
  carryOut(effects, stores, m);
  [m, effects] = go(m, { kind: 'tick' }, m.plan!.deadlines.coolEnd_s! + 1);
  carryOut(effects, stores, m);
  const id = m.cook!.id_ms;
  [m, effects] = go(m, { kind: 'primary' }, m.plan!.deadlines.coolEnd_s! + 10);
  carryOut(effects, stores, m);
  assert.equal(m.cook, null, 'off the screen');
  assert.equal(m.ending.length, 1, 'waiting on its record');
  assert.equal(stores.cooks.peek()?.cook.id_ms, id, 'and still stored');
  assert.equal(stores.learner.keptState().log.length, 0);
  // Its surface lands: logged, then forgotten.
  const inputs = m.ending[0].need.surface!;
  const surface: CookSurface = { inputs: inputs, grid: gridFor(C, inputs.egg, inputs.setup), profile: null };
  [m, effects] = go({ ...m, surfaces: [...m.surfaces, surface] }, { kind: 'landed' }, m.ending[0].plan!.deadlines.coolEnd_s! + 20);
  carryOut(effects, stores, m);
  assert.equal(stores.learner.keptState().log.length, 1);
  assert.equal(stores.cooks.peek(), null);
  await settle();
});

/** Builds this test holds back, counting what was asked of them. */
function heldBuilds(): Builds & { asked: string[]; land(): void } {
  const waiting: (() => void)[] = [];
  const grids = new Set<string>();
  const hold = <T>(name: string, value: () => T): Promise<T> => new Promise((resolve) => {
    waiting.push(() => resolve(value()));
    b.asked.push(name);
  });
  const b = {
    asked: [] as string[],
    grid: (inputs: DecisionInputs) => hold('grid', () => {
      grids.add(JSON.stringify(inputs));
      return gridFor(C, inputs.egg, inputs.setup) as DoseGrid;
    }),
    profile: () => hold('profile', () => { throw new Error('no profile in this test'); }),
    hasGrid: (inputs: DecisionInputs) => grids.has(JSON.stringify(inputs)),
    hasProfile: () => false,
    before: () => hold('before', () => C as Calibration),
    land(): void {
      for (const f of waiting.splice(0)) f();
    },
  };
  return b;
}

test('a cook\'s surface is asked for once, however many messages ask while it is built', async () => {
  const settings = { ...DEFAULT_SETTINGS, startMode: 'hot' as const };
  const idle: Model = {
    ...emptyModel(), settings: settings, controls: { ...settings }, boilMemory: {}, calib: C, appVersion: '0.5.0-alpha.1',
    prior: 'test',
  };
  let m = go(idle, { kind: 'begin', units: 'metric', lang: 'en' }, S)[0];
  const builds = heldBuilds();
  const sent: Msg[] = [];
  const needs = openNeeds(builds, () => m, (msg) => sent.push(msg));
  for (let tick = 0; tick < 5; tick++) {
    needs.follow();
    m = go(m, { kind: 'tick' }, S + tick)[0];
  }
  assert.deepEqual(builds.asked, ['grid'], 'one ask for five messages');
  builds.land();
  await settle();
  assert.deepEqual(sent.map((s) => s.kind), ['landed'], 'and the cook told once it is in');
});
