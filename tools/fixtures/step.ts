/**
 * fixtures/step.json: the running cook as one state machine (src/core/step.ts),
 * as traces. Each trace is a cook from Start to wherever it ends: a list of
 * events, each with what the app had built for it by then, and what `step`
 * made of it - the cook's log as it grew, the plan's deadlines, what it still
 * needs, the effects, and the readout at that moment (src/core/readout.ts).
 *
 * The traces cover what the two apps' end-to-end suites drive that the cook
 * decides, and each of the cook's behaviours no scenario drives on its own;
 * each trace's note says what it holds.
 *
 * What the app builds is given by the step that lands it: the surface the
 * last step needed, coarse as decide.json's (its extent written, so Swift
 * builds the same one for its own pot), the calibration before this egg, or a
 * surface on it. A reload keeps the cook as it stood, which each app stores
 * and reads back as its own (tested in each app's suite), and starts with no
 * plan and nothing built. Events are written at their times; a time read off a
 * plan is a few seconds clear of any deadline, so the two cores' last bits
 * never change a phase.
 */

import type { DecisionInputs } from '../../src/core/decide.ts';
import { LITERATURE_POPULATION } from '../../src/core/infer.ts';
import { oddsProfile } from '../../src/core/reach.ts';
import type { Calibration } from '../../src/core/record.ts';
import {
  type CookChoices, type CookPlan, type CookSurface, PULL_GRACE_SECONDS, type RunningCook, endedAt_s, phaseAt,
} from '../../src/core/running.ts';
import { type Readout, type ReadoutProbe, readoutAt } from '../../src/core/readout.ts';
import { type CookEnv, type CookEvent, type CookState, type CookStep, step } from '../../src/core/step.ts';

import { calibrationOf, coarseDecisionGrid, decidePosteriors } from './decide.ts';
import { BASE_CHOICES, MEMORY, START_S } from './shared.ts';

const S = START_S;

function posterior(name: string): Calibration {
  const pz = decidePosteriors.find((x) => x.name === name);
  if (pz === undefined) throw new Error(name);
  return calibrationOf(pz);
}

/** What one step of a trace does: the event, and before it what the app
 *  built (`land`: whatever the last step needed), a reload, or the
 *  calibration moved by an egg folded (`posterior`). */
interface StepIn {
  event: CookEvent;
  land?: boolean;
  /** With the surface, its odds profile. */
  profile?: boolean;
  reload?: boolean;
  posterior?: string;
  /** For the readout: the cook's probe asked for, and given. */
  probe?: ReadoutProbe | undefined;
}

/** What a step of a trace sees of the trace so far. */
interface Seen {
  last: CookStep | null;
  plan: CookPlan;
  cook: RunningCook;
}

type StepDef = (t: Seen) => StepIn;

interface TraceDef {
  note: string;
  app: 'web' | 'ios';
  posterior: string;
  /** The calibration before this egg, when a step asks for it. */
  before: string;
  steps: StepDef[];
}

/** An event at `now_s`. */
function at(kind: 'boil' | 'out' | 'stillIn' | 'pullStands' | 'tick' | 'surfaceLanded' | 'startAgain', now_s: number): CookEvent {
  return { kind: kind, now_s: now_s };
}

function start(over: Partial<CookChoices>, now_s = S, nudge_s = 0): StepDef {
  return () => ({
    event: {
      kind: 'start', now_s: now_s, choices: { ...BASE_CHOICES, ...over }, nudge_s: nudge_s, boilMemory: MEMORY,
      units: 'metric', lang: 'en', leanHint_s: 0,
    },
  });
}

/** The surface (and whatever else) the last step needed, landed at `dt` s
 *  after `now`. */
function land(now: (t: Seen) => number, profile = false): StepDef {
  return (t) => ({ event: at('surfaceLanded', now(t)), land: true, profile: profile });
}

function tick(now: (t: Seen) => number, probe?: ReadoutProbe): StepDef {
  return (t) => ({ event: at('tick', now(t)), probe: probe });
}

function correct(now: (t: Seen) => number, over: Partial<CookChoices>): StepDef {
  return (t) => ({ event: { kind: 'correct', now_s: now(t), choices: { ...t.cook.choices, ...over } } });
}

function answer(now: (t: Seen) => number, yolk: 'runny' | 'jammy' | null, white: 'firm' | null = null): StepDef {
  return (t) => ({ event: { kind: 'answered', now_s: now(t), yolkWord: yolk, white: white, probe: null } });
}

const pull = (dt: number) => (t: Seen): number => t.plan.deadlines.cookEnd_s + dt;
const cooled = (dt: number) => (t: Seen): number => (t.plan.deadlines.coolEnd_s ?? t.plan.deadlines.cookEnd_s) + dt;
const after = (dt: number) => (t: Seen): number => (t.last === null ? S : lastNow) + dt;
const clock = (s: number) => (): number => S + s;

/** The moment of the last step. */
let lastNow = S;

/** A hot cook on its surface, pulled by the cook 3 s into the pull, and its
 *  counted cooling run out: Done. */
const HOT_TO_DONE: StepDef[] = [
  start({ startMode: 'hot' }), land(clock(1)), tick(pull(1)), (t) => ({ event: at('out', pull(3)(t)) }),
  tick(cooled(1)),
];

const TRACES: TraceDef[] = [
  {
    note: 'a cold cook to Done: boil, the surface for the measured pot, the pull rung, out, cooled, Jammy, a firm white, Start again',
    app: 'web', posterior: 'learned', before: 'learned',
    steps: [
      start({}), land(clock(2), true), tick(clock(60)), () => ({ event: at('boil', S + 480) }), land(clock(482)),
      tick(pull(-30)), tick(pull(2)), (t) => ({ event: at('out', pull(6)(t)) }), tick(cooled(-10), { wanted: true, pending: false }),
      tick(cooled(1), { wanted: true, pending: true }), answer(cooled(20), 'jammy'), answer(cooled(30), null, 'firm'),
      (t) => ({ event: at('startAgain', cooled(60)(t)) }),
    ],
  },
  {
    note: 'a hot start: the pull rings, the grace runs out, the cooling ends, and Start again logs the egg unanswered',
    app: 'ios', posterior: 'learned', before: 'learned',
    steps: [
      start({ startMode: 'hot' }, S, -7), land(clock(1)), tick(pull(1)), tick(pull(PULL_GRACE_SECONDS + 1)),
      tick(cooled(1)), (t) => ({ event: at('startAgain', cooled(30)(t)) }),
    ],
  },
  {
    note: 'a bowl of water: out at the pull, the cooling counted in a bowl that warms, then answered',
    app: 'web', posterior: 'learned', before: 'learned',
    steps: [
      start({ startMode: 'hot', cooling: 'bowl', bowlLitres: 1, bowlWater_C: 13, eggCount: 3 }, S, 4), land(clock(1)),
      tick(pull(1)), (t) => ({ event: at('out', pull(3)(t)) }), tick(cooled(1)), answer(cooled(15), 'jammy', 'firm'),
    ],
  },
  {
    note: 'Cancel while heating: nothing logged, nothing remembered, the alarms gone',
    app: 'ios', posterior: 'learned', before: 'learned',
    steps: [start({}), land(clock(1)), () => ({ event: at('startAgain', S + 120) })],
  },
  {
    note: "the owner's case: boiling corrected to cold after Start, back to heating, the pull later; then the tap",
    app: 'web', posterior: 'learned', before: 'learned',
    steps: [
      start({ startMode: 'hot' }), land(clock(1)), correct(clock(240), { startMode: 'cold' }), land(clock(242)),
      tick(clock(400)), () => ({ event: at('boil', S + 560) }), land(clock(562)), tick(pull(2)),
    ],
  },
  {
    note: 'boiling corrected to cold after the water could have boiled, then a tap: the remembered time to boil, and the tap not remembered',
    app: 'web', posterior: 'learned', before: 'learned',
    steps: [
      start({ startMode: 'hot' }), land(clock(1)), correct(clock(500), { startMode: 'cold' }),
      () => ({ event: at('boil', S + 600) }), land(clock(602)), () => ({ event: at('startAgain', S + 610) }),
    ],
  },
  {
    note: 'cold corrected to boiling after the tap: the tap kept unread, the egg overdue, the pull now',
    app: 'ios', posterior: 'learned', before: 'learned',
    steps: [
      start({}), land(clock(1)), () => ({ event: at('boil', S + 480) }), land(clock(482)),
      correct(clock(600), { startMode: 'hot' }), tick(clock(605)), tick(clock(625)),
    ],
  },
  {
    note: 'a heavier egg pulls later, a lighter sooner, and back gives back the first pull exactly',
    app: 'web', posterior: 'learned', before: 'learned',
    steps: [
      start({ startMode: 'hot' }), land(clock(1)), correct(clock(60), { mass_kg: 0.076 }), land(clock(62)),
      correct(clock(90), { mass_kg: 0.048 }), land(clock(92)), correct(clock(120), { mass_kg: BASE_CHOICES.mass_kg }),
    ],
  },
  {
    note: 'a lighter egg late makes it overdue: it rings at once; changed back within the grace, the ring stops and the pull is later',
    app: 'ios', posterior: 'learned', before: 'learned',
    steps: [
      start({ startMode: 'hot' }), land(clock(1)), correct(pull(-20), { mass_kg: 0.048 }), land(after(1)),
      correct(after(9), { mass_kg: BASE_CHOICES.mass_kg }), tick(after(1)), tick(pull(1)),
    ],
  },
  {
    note: 'the start corrected: two minutes earlier; refused after now, after the tap, and more than two hours before Start',
    app: 'web', posterior: 'learned', before: 'learned',
    steps: [
      start({}), land(clock(1)), () => ({ event: { kind: 'correctStart', now_s: S + 60, startedAt_s: S - 120 } }),
      () => ({ event: { kind: 'correctStart', now_s: S + 70, startedAt_s: S + 71 } }),
      () => ({ event: at('boil', S + 400) }),
      () => ({ event: { kind: 'correctStart', now_s: S + 500, startedAt_s: S + 401 } }),
      () => ({ event: { kind: 'correctStart', now_s: S + 510, startedAt_s: S - 7200 } }),
      () => ({ event: { kind: 'correctStart', now_s: S + 520, startedAt_s: S - 7201 } }),
    ],
  },
  {
    note: "Settings' water mid-cook corrects the cook",
    app: 'ios', posterior: 'learned', before: 'learned',
    steps: [start({}), land(clock(1)), correct(clock(100), { waterLitres: 1 }), land(clock(102)), tick(clock(200))],
  },
  {
    note: 'a correction at Done after an answer: the record planned on the calibration before this egg, logged in place of the first; back, and the first again',
    app: 'web', posterior: 'learned', before: 'learned',
    steps: [
      ...HOT_TO_DONE, answer(after(10), 'jammy'),
      (t) => ({ event: { kind: 'correct', now_s: lastNow + 20, choices: { ...t.cook.choices, mass_kg: 0.076 } }, posterior: 'prior' }),
      land(after(1)), land(after(1)), correct(after(10), { mass_kg: BASE_CHOICES.mass_kg }), land(after(1)),
    ],
  },
  {
    note: 'after the pull the slider only previews: a level alone corrects nothing, and with another choice the level stays the cook\'s',
    app: 'ios', posterior: 'learned', before: 'learned',
    steps: [...HOT_TO_DONE, correct(after(10), { level: 0.9 }), correct(after(10), { level: 0.9, eggCount: 3 }), land(after(1))],
  },
  {
    note: 'the grace ran out asleep, then corrected to cold: the app asks whether the egg is still in, nothing passes the question; still in: heating again',
    app: 'web', posterior: 'learned', before: 'learned',
    steps: [
      start({ startMode: 'hot' }), land(clock(1)), tick(pull(25)), correct(after(5), { startMode: 'cold' }), land(after(1)),
      tick(after(400)), () => ({ event: at('stillIn', lastNow + 5) }), tick(after(30)),
    ],
  },
  {
    note: 'the same question answered no: the pull stands, confirmed, the cooling runs, Done for cold water',
    app: 'ios', posterior: 'learned', before: 'learned',
    steps: [
      start({ startMode: 'hot' }), land(clock(1)), tick(pull(25)), correct(after(5), { startMode: 'cold' }), land(after(1)),
      () => ({ event: at('pullStands', lastNow + 5) }), tick(after(600)),
    ],
  },
  {
    note: 'a pull the clock assumed, Jammy at Done, then cold water: the pull confirmed, nothing asked, still Done',
    app: 'ios', posterior: 'learned', before: 'learned',
    steps: [
      start({ startMode: 'hot' }), land(clock(1)), tick(pull(25)), tick(cooled(1)), answer(after(5), 'jammy'),
      correct(after(5), { startMode: 'cold' }), land(after(1)), land(after(1)),
    ],
  },
  {
    note: 'a slow hob: the guess lengthens, the clock counts the time heated up, and at two hours the cook is ended, nothing logged',
    app: 'web', posterior: 'learned', before: 'learned',
    steps: [
      start({}), land(clock(1)), tick((t) => (t.plan.slowHobAt_s ?? S) + 1), tick(clock(1000)), tick(clock(1200)),
      tick(clock(7000)), tick(clock(7300)),
    ],
  },
  {
    note: 'a correction the white never sets in: the longest time the pan gives, and the slot says so',
    app: 'ios', posterior: 'learned', before: 'learned',
    steps: [
      start({ startMode: 'hot' }), land(clock(1)), correct(clock(30), { afterBoil: 'off', waterLitres: 0.25, eggCount: 12 }),
      land(clock(32)),
    ],
  },
  {
    note: 'Jammy at Done, then a correction and Start again at once: the corrected egg logged in place of the first, then forgotten',
    app: 'web', posterior: 'learned', before: 'learned',
    steps: [
      ...HOT_TO_DONE, answer(after(10), 'jammy'), correct(after(10), { mass_kg: 0.076 }),
      () => ({ event: at('startAgain', lastNow + 1) }), land(after(1)), land(after(1)),
    ],
  },
  {
    note: 'Done, corrected, Jammy held for the record, Start again: the egg logged with Jammy',
    app: 'ios', posterior: 'learned', before: 'learned',
    steps: [
      ...HOT_TO_DONE, correct(after(10), { mass_kg: 0.076 }), answer(after(5), 'jammy'),
      () => ({ event: at('startAgain', lastNow + 5) }), land(after(1)), land(after(1)),
    ],
  },
  {
    note: 'relaunched three hours after an answered egg was corrected: too old, the corrected egg logged',
    app: 'ios', posterior: 'learned', before: 'learned',
    steps: [
      ...HOT_TO_DONE, answer(after(10), 'jammy'), correct(after(10), { mass_kg: 0.076 }),
      () => ({ event: at('tick', S + 3 * 3600), reload: true }), land(after(1)), land(after(1)),
    ],
  },
  {
    note: 'on the counter: Done at the out, Jammy, then the cooling corrected to ice: still Done, nothing rung, no alarm back',
    app: 'web', posterior: 'learned', before: 'learned',
    steps: [
      start({ startMode: 'hot', cooling: 'counter' }), land(clock(1)), tick(pull(1)), (t) => ({ event: at('out', pull(3)(t)) }),
      answer(after(10), 'jammy'), correct(after(60), { cooling: 'ice' }), land(after(1)), land(after(1)), tick(after(900)),
    ],
  },
  {
    note: 'Runny at Done, an egg folded, relaunched: Done shows the cook as it ran, and nothing is logged again',
    app: 'ios', posterior: 'learned', before: 'learned',
    steps: [
      ...HOT_TO_DONE, answer(after(10), 'runny'),
      () => ({ event: at('tick', lastNow + 60), reload: true, posterior: 'prior' }), land(after(1)),
    ],
  },
  {
    note: 'a lighter egg 15 s into the pull: the pull that rang held, its grace kept, nothing rung again',
    app: 'web', posterior: 'learned', before: 'learned',
    steps: [
      start({ startMode: 'hot' }, S, -7), land(clock(1)), tick(pull(1)), correct(pull(15), { mass_kg: 0.048 }), land(after(1)),
      tick((t) => (t.cook.events.rangAt_s ?? 0) + PULL_GRACE_SECONDS + 1),
    ],
  },
  {
    note: 'a page woken 25 s past the pull rings the pull; one woken past the cooling rings the pull, not Done',
    app: 'web', posterior: 'learned', before: 'learned',
    steps: [start({ startMode: 'hot' }), land(clock(1)), tick(clock(60)), tick(cooled(5))],
  },
  {
    note: 'relaunched at each phase: the same deadlines and alarms, the pull rung once',
    app: 'ios', posterior: 'learned', before: 'learned',
    steps: [
      start({}), land(clock(1)), () => ({ event: at('tick', S + 60), reload: true }), land(after(1)),
      () => ({ event: at('boil', S + 480) }), land(clock(482)), () => ({ event: at('tick', S + 600), reload: true }), land(after(1)),
      (t) => ({ event: at('tick', pull(4)(t)), reload: true }), (t) => ({ event: at('out', pull(14)(t)) }),
      (t) => ({ event: at('tick', cooled(-20)(t)), reload: true }), (t) => ({ event: at('tick', cooled(10)(t)), reload: true }),
    ],
  },
  {
    note: 'relaunched while heating past the guess: the slow hob lengthens it, and the pending pull moves',
    app: 'ios', posterior: 'learned', before: 'learned',
    steps: [start({}), land(clock(1)), () => ({ event: at('tick', S + 700), reload: true })],
  },
  {
    note: 'relaunched three hours on: ended, and its finished egg logged unanswered on its pot\'s surface, built for it',
    app: 'ios', posterior: 'learned', before: 'learned',
    steps: [start({ startMode: 'hot' }), land(clock(1)), tick(pull(1)), () => ({ event: at('tick', S + 3 * 3600), reload: true }), land(after(1))],
  },
  {
    note: 'Done, relaunched near the hour, then past it: ended at the hour, a later answer not taken',
    app: 'web', posterior: 'learned', before: 'learned',
    steps: [
      ...HOT_TO_DONE, (t) => ({ event: at('tick', cooled(3500)(t)), reload: true }), land(after(1)),
      () => ({ event: at('tick', lastNow + 200) }), answer(after(5), 'jammy'),
    ],
  },
  {
    note: 'the grace ran out on the interim plan, the cooling ended, Jammy before the surface: held, and logged when it lands',
    app: 'web', posterior: 'learned', before: 'learned',
    steps: [
      start({ startMode: 'hot' }), tick(pull(2)), tick(pull(PULL_GRACE_SECONDS + 1)), tick(cooled(1)),
      answer(after(5), 'jammy'), land(after(1)),
    ],
  },
  {
    note: 'the pull rings on the interim plan; its surface lands in the grace: the pull held, nothing rung again',
    app: 'ios', posterior: 'learned', before: 'learned',
    steps: [start({ startMode: 'hot' }), tick(pull(2)), land(after(1)), tick(after(5))],
  },
  {
    note: 'a tap, then a stray cold -> hot -> cold: the tap still remembered at the end',
    app: 'web', posterior: 'learned', before: 'learned',
    steps: [
      start({}), land(clock(1)), () => ({ event: at('boil', S + 500) }), correct(clock(600), { startMode: 'hot' }),
      correct(clock(610), { startMode: 'cold' }), () => ({ event: at('startAgain', S + 620) }),
    ],
  },
];

/* ------------------------------------------------------------- the run */

/** A surface as an app builds one, coarse, and how the fixture writes it. */
function build(c: Calibration, inputs: DecisionInputs, profile: boolean): { surface: CookSurface; json: unknown } {
  const g = coarseDecisionGrid(inputs);
  const p = profile ? oddsProfile(c, inputs.egg, inputs.setup, g.grid) : null;
  return {
    surface: { inputs: inputs, grid: g.grid, profile: p },
    json: { grid: g.spec, profile: p },
  };
}

function planJson(p: CookPlan, now_s: number) {
  return {
    phase: phaseAt(p.deadlines, now_s), cookTime_s: p.cookTime_s, timeToBoil_s: p.setup.timeToBoil_s,
    deadlines: p.deadlines, decided: p.decided !== null, lengthened: p.inputs === null, lean_s: p.lean_s,
    level: p.answer.level, verdict: p.answer.verdict.kind, overdue: p.overdue,
    slowHobAt_s: p.slowHobAt_s, tooOldAt_s: p.tooOldAt_s,
    certainty: p.certainty === null ? null : {
      certainty: p.certainty.words.certainty, from: p.certainty.words.from, to: p.certainty.words.to,
      low_s: p.certainty.time.low_s, high_s: p.certainty.time.high_s,
    },
  };
}

function cookJson(cook: RunningCook | null, was: RunningCook | null) {
  if (cook === null) return null;
  const from = was !== null && was.id_ms === cook.id_ms && cook.log.length >= was.log.length ? was.log.length : 0;
  return {
    id_ms: cook.id_ms, logLength: cook.log.length, added: cook.log.slice(from), startedAt_s: cook.startedAt_s,
    events: cook.events, correctedAt_s: cook.correctedAt_s, endedAt_s: endedAt_s(cook),
  };
}

function readoutJson(r: Readout) {
  return r;
}

function run(def: TraceDef) {
  let state: CookState = { cook: null, plan: null, leanHint_s: 0 };
  const env: CookEnv = {
    calibration: posterior(def.posterior), surfaces: [], before: null, app: def.app, appVersion: '0.5.0-alpha.1',
    prior: LITERATURE_POPULATION.id, day: '2026-10-07',
  };
  let last: CookStep | null = null;
  lastNow = S;
  const steps: unknown[] = [];
  for (const d of def.steps) {
    const seen: Seen = { last: last, plan: state.plan as CookPlan, cook: state.cook as RunningCook };
    const s = d(seen);
    if (s.posterior !== undefined) env.calibration = posterior(s.posterior);
    if (s.reload === true) {
      state = { cook: state.cook, plan: null, leanHint_s: state.leanHint_s };
      env.surfaces = [];
      env.before = null;
    }
    const landed: unknown[] = [];
    if (s.land === true && last !== null) {
      const need = last.need;
      if (need.surface !== null) {
        const b = build(env.calibration, need.surface, s.profile === true);
        env.surfaces = [...env.surfaces, b.surface];
        landed.push({ on: 'now', ...(b.json as object) });
      }
      if (need.before && env.before === null) {
        env.before = { calibration: posterior(def.before), surfaces: [] };
        landed.push({ on: 'calibrationBefore' });
      }
      if (need.beforeSurface !== null && env.before !== null) {
        const b = build(env.before.calibration, need.beforeSurface, false);
        env.before = { ...env.before, surfaces: [...env.before.surfaces, b.surface] };
        landed.push({ on: 'before', ...(b.json as object) });
      }
    }
    const was = state.cook;
    const out = step(state, s.event, env);
    const now = s.event.now_s;
    steps.push({
      event: s.event,
      ...(s.reload === true ? { reload: true } : {}),
      ...(s.posterior !== undefined ? { posterior: s.posterior } : {}),
      ...(landed.length > 0 ? { landed: landed } : {}),
      ...(s.probe !== undefined ? { probe: s.probe } : {}),
      cook: cookJson(out.cook, was),
      plan: out.plan === null ? null : planJson(out.plan, now),
      leanHint_s: out.leanHint_s,
      need: {
        surface: out.need.surface !== null, before: out.need.before, beforeSurface: out.need.beforeSurface !== null,
        wakeAt_s: out.need.wakeAt_s,
      },
      effects: out.effects,
      readout: out.cook === null || out.plan === null ? null : readoutJson(readoutAt(out.cook, out.plan, now, s.probe)),
    });
    state = { cook: out.cook, plan: out.plan, leanHint_s: out.leanHint_s };
    last = out;
    lastNow = now;
  }
  return { note: def.note, app: def.app, posterior: def.posterior, before: def.before, steps: steps };
}

export const stepFixture = {
  about: 'The running cook as one state machine (src/core/step.ts): traces of events, each with what the app had built and what step made of it, and the readout at each (src/core/readout.ts).',
  traces: TRACES.map(run),
};
