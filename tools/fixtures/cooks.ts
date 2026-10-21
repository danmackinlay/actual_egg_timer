/**
 * fixtures/cooks.json: the cooks an app holds (src/core/cooks.ts), as traces.
 * Each step of a trace is an event for the cook on screen, something built
 * landing for every cook that waited on it, or a stored cook picked back up
 * after a relaunch; and what it made: the cook on screen (its id, phase and
 * how long its log is), each ended one waiting (its id, log and what it
 * waits for), the effects tagged with whose cook they are, the eggs still
 * open (`openEggs`) and the cooks whose calibration before their egg is
 * still wanted (`beforeWanted`).
 *
 * What the app builds is built as step.json's is (tools/fixtures/step.ts):
 * the surface each waiting cook needs, coarse, its extent written so Swift
 * builds the same; the calibration before a cook's egg; a surface on it.
 * Small, on the posterior step.json's traces start from.
 */

import type { DecisionInputs } from '../../src/core/decide.ts';
import { inputsKey } from '../../src/core/decide.ts';
import { LITERATURE_POPULATION } from '../../src/core/infer.ts';
import type { Calibration } from '../../src/core/record.ts';
import { type CookChoices, type CookPlan, type CookSurface, phaseAt } from '../../src/core/running.ts';
import type { CookBefore, CookEvent } from '../../src/core/step.ts';
import {
  type CookAt, type Cooks, type CooksEnv, type CooksStep, beforeWanted, cooksLanded, cooksRestore, cooksStep,
  cooksWaiting, noCooks, openEggs,
} from '../../src/core/cooks.ts';

import { BASE_CHOICES, MEMORY, START_S } from './shared.ts';

type Posteriors = typeof import('./posteriors.ts');

const S = START_S;
const DAY = '2026-10-07';

/** What a step of a trace sees: the plan on screen, or the last one there. */
interface Seen {
  plan: CookPlan;
  choices: CookChoices;
  now_s: number;
}

/** One step: an event for the cook on screen, what was built landing, or the
 *  cook on screen as stored, picked back up by a relaunch with nothing
 *  built. */
type StepIn = { event: CookEvent } | { land: number } | { restore: number };
type StepDef = (t: Seen) => StepIn;

interface TraceDef {
  note: string;
  app: 'web' | 'ios';
  steps: StepDef[];
}

function start(over: Partial<CookChoices>, at: (t: Seen) => number = () => S): StepDef {
  return (t) => ({
    event: {
      kind: 'start', now_s: at(t), choices: { ...BASE_CHOICES, ...over }, nudge_s: 0, boilMemory: MEMORY,
      units: 'metric', lang: 'en', leanHint_s: 0,
    },
  });
}

function at(kind: 'out' | 'tick' | 'startAgain', now: (t: Seen) => number): StepDef {
  return (t) => ({ event: { kind: kind, now_s: now(t) } });
}

function answer(now: (t: Seen) => number): StepDef {
  return (t) => ({ event: { kind: 'answered', now_s: now(t), yolkWord: 'jammy', white: null, probe: null } });
}

function heavier(now: (t: Seen) => number): StepDef {
  return (t) => ({ event: { kind: 'correct', now_s: now(t), choices: { ...t.choices, mass_kg: 0.076 } } });
}

const land = (now: (t: Seen) => number): StepDef => (t) => ({ land: now(t) });
const pull = (dt: number) => (t: Seen): number => t.plan.deadlines.cookEnd_s + dt;
const cooled = (dt: number) => (t: Seen): number => (t.plan.deadlines.coolEnd_s ?? t.plan.deadlines.cookEnd_s) + dt;
const tooOld = (dt: number) => (t: Seen): number => t.plan.tooOldAt_s + dt;
const after = (dt: number) => (t: Seen): number => t.now_s + dt;

/** A hot cook on its surface, out 3 s into the pull, its cooling run out:
 *  Done. */
const HOT_TO_DONE: StepDef[] = [
  start({ startMode: 'hot' }), land(() => S + 1), at('tick', pull(1)), at('out', pull(3)), at('tick', cooled(1)),
];

export const TRACES: TraceDef[] = [
  {
    note: 'relaunched three hours on with nothing built: too old, ended, waiting on its surface; landed: logged unanswered, forgotten, sent',
    app: 'ios',
    steps: [
      start({ startMode: 'hot' }), land(() => S + 1), at('tick', pull(1)), () => ({ restore: S + 3 * 3600 }),
      land(after(1)),
    ],
  },
  {
    note: 'Jammy at Done, corrected, Start again: ended, open, waiting on the calibration before its egg; a second cook beside it; its surface landed: written over its own copy only; the surface before landed: logged again, forgotten, sent',
    app: 'web',
    steps: [
      ...HOT_TO_DONE, answer(after(10)), heavier(after(10)), at('startAgain', after(5)), start({}, after(5)),
      land(after(1)), land(after(1)),
    ],
  },
  {
    note: 'Done, and an answer after the egg is too old: the tick ends it first, its egg logged unanswered; the answer not taken',
    app: 'ios',
    steps: [...HOT_TO_DONE, answer(tooOld(5)), answer(after(5))],
  },
  {
    note: 'Jammy at Done, then a correction after the egg is too old: the tick ends it first; nothing logged again',
    app: 'web',
    steps: [...HOT_TO_DONE, answer(after(10)), heavier(tooOld(5))],
  },
];

/* ------------------------------------------------------------- the run */

function posterior(p: Posteriors, name: string): Calibration {
  const pz = p.decidePosteriors.find((x) => x.name === name);
  if (pz === undefined) throw new Error(name);
  return p.calibrationOf(pz);
}

/** A surface as an app builds one, coarse, with no odds profile. */
function build(p: Posteriors, inputs: DecisionInputs): { surface: CookSurface; json: unknown } {
  const g = p.coarseDecisionGrid(inputs);
  return { surface: { inputs: inputs, grid: g.grid, profile: null }, json: { grid: g.spec } };
}

function needRow(n: Cooks['need']) {
  return { surface: n.surface !== null, before: n.before, beforeSurface: n.beforeSurface !== null, wakeAt_s: n.wakeAt_s };
}

/** What the cooks are, at `now_s`. */
function cooksRow(q: Cooks, now_s: number) {
  const s = q.screen;
  return {
    screen: s.cook === null || s.plan === null ? null : {
      id_ms: s.cook.id_ms, phase: phaseAt(s.plan.deadlines, now_s), logLength: s.cook.log.length,
    },
    ending: q.ending.map((e) => ({
      id_ms: e.cook === null ? null : e.cook.id_ms, logLength: e.cook === null ? 0 : e.cook.log.length,
      need: needRow(e.need),
    })),
  };
}

function run(p: Posteriors, def: TraceDef) {
  const calibration = posterior(p, 'learned');
  let surfaces: CookSurface[] = [];
  let befores: { id_ms: number; before: CookBefore }[] = [];
  let q: Cooks = noCooks();
  let seen: Seen = { plan: null as unknown as CookPlan, choices: BASE_CHOICES, now_s: S };
  const steps: unknown[] = [];
  const envAt = (q: Cooks): CooksEnv => {
    const at: CookAt[] = [];
    for (const w of cooksWaiting(q)) {
      const b = befores.find((x) => x.id_ms === w.cook.id_ms);
      at.push({ id_ms: w.cook.id_ms, before: b === undefined ? null : b.before, day: DAY });
    }
    return {
      calibration: calibration, surfaces: surfaces, app: def.app, appVersion: '0.5.0-alpha.1',
      prior: LITERATURE_POPULATION.id, day: DAY, at: at,
    };
  };
  for (const d of def.steps) {
    const s = d(seen);
    let out: CooksStep;
    let now: number;
    const input: Record<string, unknown> = {};
    if ('event' in s) {
      now = s.event.now_s;
      input['event'] = s.event;
      out = cooksStep(q, s.event, envAt(q));
    } else if ('restore' in s) {
      now = s.restore;
      const screen = q.screen;
      if (screen.cook === null) throw new Error(`${def.note}: nothing to restore`);
      input['restore'] = { now_s: now };
      surfaces = [];
      befores = [];
      out = cooksRestore(noCooks(), { cook: screen.cook, leanHint_s: screen.leanHint_s }, now, envAt(q));
    } else {
      now = s.land;
      const landed: unknown[] = [];
      for (const w of cooksWaiting(q)) {
        const id = w.cook.id_ms;
        const inputs = w.need.surface;
        if (inputs !== null && !surfaces.some((x) => inputsKey(x.inputs) === inputsKey(inputs))) {
          const b = build(p, inputs);
          surfaces = [...surfaces, b.surface];
          landed.push({ on: 'now', id_ms: id, ...(b.json as object) });
        }
        const held = befores.find((x) => x.id_ms === id);
        if (w.need.before && held === undefined) {
          befores = [...befores, { id_ms: id, before: { calibration: posterior(p, 'learned'), surfaces: [] } }];
          landed.push({ on: 'calibrationBefore', id_ms: id });
        }
        const on = w.need.beforeSurface;
        if (on !== null && held !== undefined) {
          const b = build(p, on);
          befores = befores.map((x) => (x !== held ? x : { id_ms: id, before: { ...held.before, surfaces: [...held.before.surfaces, b.surface] } }));
          landed.push({ on: 'before', id_ms: id, ...(b.json as object) });
        }
      }
      input['land'] = { now_s: now, landed: landed };
      out = cooksLanded(q, now, envAt(q));
    }
    q = out.cooks;
    steps.push({
      ...input,
      cooks: cooksRow(q, now), effects: out.effects, openEggs: openEggs(q, now), beforeWanted: beforeWanted(q),
    });
    const plan = q.screen.plan ?? seen.plan;
    seen = { plan: plan, choices: q.screen.cook?.choices ?? seen.choices, now_s: now };
  }
  return { note: def.note, app: def.app, posterior: 'learned', before: 'learned', steps: steps };
}

/** The fixture. */
export async function cooksFixture() {
  const p = await import('./posteriors.ts');
  return {
    about: 'The cooks an app holds (src/core/cooks.ts): traces of events, builds landing and relaunches, each with the cooks it left, the effects tagged with whose cook, the eggs still open and the calibrations before still wanted.',
    traces: TRACES.map((def) => run(p, def)),
  };
}
