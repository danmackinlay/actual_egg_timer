/**
 * fixtures/running.json: a running cook - its egg and pot, how each thing the
 * cook does moves it, and how a stored one is read (src/core/running.ts).
 */

import { SIZE_CLASSES, US_SIZE_CLASSES } from '../../src/core/geometry.js';
import {
  PULL_GRACE_SECONDS, SLOW_HOB_EVERY_S, SLOW_HOB_EXTRA_S, SLOW_HOB_WHEN_LEFT_S,
} from '../../src/core/policy.js';
import { oddsProfile } from '../../src/core/reach.js';
import { WhiteReport, YolkWord } from '../../src/core/infer.js';
import { LITERATURE_POPULATION } from '../../src/core/infer.js';
import { ProbeReading, recordFor } from '../../src/core/record.js';
import {
  CookChoices, CookPlan, CookSurface, RecordContext, RunningCook, SLOW_HOB_MAX_STEPS, boilToRemember,
  cookEnding, cookFactsFor, cookSetupOf, corrected, eventsDue, latestStart_s, readRunningCook, replan, startCook,
  startCorrected, withBoil, withOut,
} from '../../src/core/running.js';

import { calibrationOf, coarseDecisionGrid, decidePosteriors } from './decide.js';

/* The egg and the pot (`cookSetupOf`) for choices across every branch: a
 * class off each carton and a measured egg, each egg start with and without
 * a measured room, both starts, both burners, each cooling, at sea level and
 * up a mountain. The moves (`startCook`, `withBoil`, `corrected`,
 * `startCorrected`) from cooks at each stage, taken and refused. The reads
 * (`readRunningCook`): a cook at each stage, written and read back, and every
 * way a stored one is refused. */

/** The cook of these fixtures: a 68 g EU Large from the fridge into 2 L of
 *  cold water at sea level, the heat held, then ice, jammy. */
export const BASE_CHOICES: CookChoices = {
  mass_kg: SIZE_CLASSES[2].mass_kg, massFrom: 'class', sizeTable: 'eu', eggFrom: 'fridge', customStart_C: 12,
  room_C: null, startMode: 'cold', afterBoil: 'hold', cooling: 'ice', waterLitres: 2, eggCount: 2,
  altitude_m: 0, level: 0.41,
};

/** 7 October 2026, 09:00 UTC, in ms: when the fixtures' cooks start. */
export const START_MS = 1791363600000;
export const START_S = START_MS / 1000;

export const MEMORY = { '2.0': 480, '3.0': 610 };

export function cookOf(over: Partial<CookChoices> = {}, nudge_s = 0): RunningCook {
  return startCook(START_MS, { ...BASE_CHOICES, ...over }, nudge_s, MEMORY, 'metric', 'en');
}

const setupChoices: CookChoices[] = [];
{
  const eggs: Partial<CookChoices>[] = [
    { mass_kg: SIZE_CLASSES[0].mass_kg, massFrom: 'class', sizeTable: 'eu' },
    { mass_kg: US_SIZE_CLASSES[4].mass_kg, massFrom: 'class', sizeTable: 'us' },
    { mass_kg: 0.0637, massFrom: 'scale', sizeTable: null },
    { mass_kg: 0.05123456789, massFrom: 'width', sizeTable: null },
  ];
  const starts: Partial<CookChoices>[] = [
    { eggFrom: 'fridge', room_C: null }, { eggFrom: 'fridge', room_C: 27 },
    { eggFrom: 'room', room_C: null }, { eggFrom: 'room', room_C: 9.5 },
    { eggFrom: 'custom', customStart_C: 17, room_C: null }, { eggFrom: 'custom', customStart_C: 8, room_C: null },
    { eggFrom: 'custom', customStart_C: 31, room_C: 22 },
  ];
  const pots: Partial<CookChoices>[] = [
    {},
    { startMode: 'hot', afterBoil: 'off', cooling: 'counter', waterLitres: 0.25, eggCount: 24, altitude_m: 2400 },
    { startMode: 'hot', cooling: 'tap', waterLitres: 12, eggCount: 1, altitude_m: -400 },
  ];
  let k = 0;
  for (const egg of eggs) {
    for (const start of starts) {
      setupChoices.push({ ...BASE_CHOICES, ...egg, ...start, ...pots[k % pots.length] });
      k += 1;
    }
  }
}

const setups = setupChoices.map((choices, i) => {
  const timeToBoil_s = [480, 30, 7200, 611.25][i % 4];
  const pot = cookSetupOf(choices, timeToBoil_s);
  return { choices: choices, timeToBoil_s: timeToBoil_s, egg: pot.egg, setup: pot.setup };
});

/* ---------------------------------------------------------------- moves */

const cold = cookOf();
const hot = cookOf({ startMode: 'hot' }, -7);
const tapped = withBoil(cold, START_S + 532.5);
const pulled: RunningCook = {
  ...tapped,
  events: { ...tapped.events, pulled: { due_s: START_S + 851.2, out_s: START_S + 858.9, by: 'cook' } },
};
const cooled: RunningCook = { ...pulled, events: { ...pulled.events, cooledAt_s: START_S + 1031.9 } };
const hotTapped = withBoil(corrected(hot, { ...hot.choices, startMode: 'cold' }, START_S + 100), START_S + 500);

type Move =
  | { boil: number }
  | { correct: CookChoices; now: number }
  | { start: number; now: number };

const MOVES: { note: string; cook: RunningCook; move: Move }[] = [
  { note: 'the boil, tapped on a cold start', cook: cold, move: { boil: START_S + 532.5 } },
  { note: 'a second tap is not taken', cook: tapped, move: { boil: START_S + 540 } },
  { note: 'no boil to tap on a hot start', cook: hot, move: { boil: START_S + 60 } },
  { note: 'no boil to tap after the pull', cook: { ...cold, events: pulled.events }, move: { boil: START_S + 900 } },
  { note: 'no tap before the start', cook: cold, move: { boil: START_S - 1 } },
  { note: 'boiling corrected to cold: cold from now', cook: hot, move: { correct: { ...hot.choices, startMode: 'cold' }, now: START_S + 240 } },
  { note: 'cold corrected to boiling: no longer cold', cook: tapped, move: { correct: { ...tapped.choices, startMode: 'hot' }, now: START_S + 600 } },
  { note: 'cold kept cold, a heavier egg: cold since the start still', cook: tapped, move: { correct: { ...tapped.choices, mass_kg: 0.076 }, now: START_S + 600 } },
  { note: 'corrected back to cold: cold from the second correction', cook: corrected(tapped, { ...tapped.choices, startMode: 'hot' }, START_S + 600), move: { correct: tapped.choices, now: START_S + 610 } },
  { note: 'a correction after the cooling ended keeps every event', cook: cooled, move: { correct: { ...cooled.choices, level: 0.62, cooling: 'tap' }, now: START_S + 1100 } },
  { note: 'the start two minutes earlier', cook: cold, move: { start: START_S - 120, now: START_S + 200 } },
  { note: 'the start later, to now', cook: cold, move: { start: START_S + 200, now: START_S + 200 } },
  { note: 'the start after now: refused', cook: cold, move: { start: START_S + 200.5, now: START_S + 200 } },
  { note: 'the start to the boil tap itself', cook: tapped, move: { start: START_S + 532.5, now: START_S + 700 } },
  { note: 'the start after the boil tap: refused', cook: tapped, move: { start: START_S + 533, now: START_S + 700 } },
  { note: 'the start after a tap a correction to boiling left unread: refused', cook: corrected(tapped, { ...tapped.choices, startMode: 'hot' }, START_S + 600), move: { start: START_S + 540, now: START_S + 700 } },
  { note: 'the start after the pull was due: refused', cook: { ...hot, events: { ...hot.events, pulled: { due_s: START_S + 380, out_s: START_S + 400, by: 'timeout' } } }, move: { start: START_S + 390, now: START_S + 500 } },
  { note: 'the start earlier, after the cooling ended', cook: cooled, move: { start: START_S - 30, now: START_S + 1200 } },
  { note: 'a start that is not a time: refused', cook: cold, move: { start: Number.NaN, now: START_S + 200 } },
  { note: 'the boil tapped on a cook corrected to cold', cook: corrected(hot, { ...hot.choices, startMode: 'cold' }, START_S + 100), move: { boil: START_S + 500 } },
];

/** NaN as JSON has it: null. */
function timeJson(t: number): number | null {
  return Number.isFinite(t) ? t : null;
}

const moves = MOVES.map((m) => {
  const move = m.move;
  if ('boil' in move) return { note: m.note, cook: m.cook, move: { boil: move.boil }, after: withBoil(m.cook, move.boil) };
  if ('correct' in move) {
    return { note: m.note, cook: m.cook, move: { correct: move.correct, now: move.now }, after: corrected(m.cook, move.correct, move.now) };
  }
  return {
    note: m.note, cook: m.cook, move: { start: timeJson(move.start), now: move.now },
    latest_s: latestStart_s(m.cook, move.now), after: startCorrected(m.cook, move.start, move.now),
  };
});

/* ---------------------------------------------------------------- reads */

/** A copy of `raw` with the value at `path` replaced, or removed when
 *  `value` is undefined. */
function withAt(raw: unknown, path: string[], value: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  let node: Record<string, unknown> = copy;
  for (let i = 0; i < path.length - 1; i++) node = node[path[i]] as Record<string, unknown>;
  const last = path[path.length - 1];
  if (value === undefined) delete node[last];
  else node[last] = value;
  return copy;
}

const READ_COOKS: { note: string; cook: RunningCook }[] = [
  { note: 'just started, cold', cook: cold },
  { note: 'hot, nudged, imperial, in the English of 1750', cook: { ...hot, units: 'imperial', lang: 'en-x-1750' } },
  { note: 'tapped', cook: tapped },
  { note: 'pulled by the cook', cook: pulled },
  { note: 'cooled', cook: cooled },
  { note: 'pulled when the grace ran out, on the counter', cook: { ...hot, choices: { ...hot.choices, cooling: 'counter' }, events: { boilAt_s: null, pulled: { due_s: START_S + 380, out_s: START_S + 400, by: 'timeout' }, cooledAt_s: null } } },
  { note: 'a measured egg and a measured room, no pans remembered', cook: { ...startCook(START_MS, { ...BASE_CHOICES, mass_kg: 0.0612, massFrom: 'girth', sizeTable: null, room_C: 23.5, eggFrom: 'room' }, 3, {}, 'metric', 'cs'), boilRemembered: false } },
  { note: 'a tap kept unread on a cook corrected to boiling', cook: corrected(tapped, { ...tapped.choices, startMode: 'hot' }, START_S + 600) },
  { note: 'corrected to cold after the start', cook: hotTapped },
];

const base = JSON.parse(JSON.stringify(pulled)) as unknown;
const REFUSED: { note: string; path: string[]; value: unknown }[] = [
  { note: 'no id', path: ['id_ms'], value: undefined },
  { note: 'an id that is not a number', path: ['id_ms'], value: '1791363600000' },
  { note: 'a start of zero', path: ['startedAt_s'], value: 0 },
  { note: 'no choices', path: ['choices'], value: undefined },
  { note: 'choices that are a list', path: ['choices'], value: [] },
  { note: 'no mass', path: ['choices', 'mass_kg'], value: undefined },
  { note: 'a mass of zero', path: ['choices', 'mass_kg'], value: 0 },
  { note: 'a mass that is true', path: ['choices', 'mass_kg'], value: true },
  { note: 'an unknown mass source', path: ['choices', 'massFrom'], value: 'guess' },
  { note: 'a class with no carton', path: ['choices', 'sizeTable'], value: null },
  { note: 'an unknown carton', path: ['choices', 'sizeTable'], value: 'uk' },
  { note: 'an unknown egg source', path: ['choices', 'eggFrom'], value: 'counter' },
  { note: 'no egg temperature of its own', path: ['choices', 'customStart_C'], value: null },
  { note: 'a room that is a string', path: ['choices', 'room_C'], value: '20' },
  { note: 'no room at all', path: ['choices', 'room_C'], value: undefined },
  { note: 'sous-vide', path: ['choices', 'startMode'], value: 'sous' },
  { note: 'an unknown burner', path: ['choices', 'afterBoil'], value: 'low' },
  { note: 'no burner', path: ['choices', 'afterBoil'], value: undefined },
  { note: 'an unknown cooling', path: ['choices', 'cooling'], value: 'fridge' },
  { note: 'no water', path: ['choices', 'waterLitres'], value: 0 },
  { note: 'no eggs', path: ['choices', 'eggCount'], value: 0 },
  { note: 'no altitude', path: ['choices', 'altitude_m'], value: null },
  { note: 'a level past hard', path: ['choices', 'level'], value: 1.01 },
  { note: 'a level under runny', path: ['choices', 'level'], value: -0.01 },
  { note: 'no events', path: ['events'], value: undefined },
  { note: 'a boil before the start', path: ['events', 'boilAt_s'], value: START_S - 1 },
  { note: 'a boil that is a string', path: ['events', 'boilAt_s'], value: 'soon' },
  { note: 'no boil field', path: ['events', 'boilAt_s'], value: undefined },
  { note: 'a pull that is a list', path: ['events', 'pulled'], value: [] },
  { note: 'a pull due before the start', path: ['events', 'pulled', 'due_s'], value: START_S - 5 },
  { note: 'out before it was due', path: ['events', 'pulled', 'out_s'], value: START_S + 851 },
  { note: 'pulled by nobody', path: ['events', 'pulled', 'by'], value: null },
  { note: 'no pull field', path: ['events', 'pulled'], value: undefined },
  { note: 'cooled without a pull', path: ['events', 'pulled'], value: null, },
  { note: 'cooled before the egg came out', path: ['events', 'cooledAt_s'], value: START_S + 858 },
  { note: 'a nudge that is not a number', path: ['nudge_s'], value: null },
  { note: 'pans that are a list', path: ['boilMemory'], value: [480] },
  { note: 'a pan that is not a time', path: ['boilMemory', '2.0'], value: 'slow' },
  { note: 'a pan of no time', path: ['boilMemory', '2.0'], value: 0 },
  { note: 'unknown units', path: ['units'], value: 'si' },
  { note: 'no language', path: ['lang'], value: '' },
  { note: 'remembered as a number', path: ['boilRemembered'], value: 1 },
  { note: 'no cold-since field', path: ['coldSince_s'], value: undefined },
  { note: 'cold since a string', path: ['coldSince_s'], value: 'start' },
  { note: 'no corrected field', path: ['correctedAt_s'], value: undefined },
  { note: 'corrected before the start', path: ['correctedAt_s'], value: START_S - 1 },
];

const rawReads: { note: string; raw: unknown }[] = [
  ...READ_COOKS.map((r) => ({ note: r.note, raw: JSON.parse(JSON.stringify(r.cook)) as unknown })),
  { note: 'null', raw: null },
  { note: 'a list', raw: [base] },
  { note: 'a number', raw: 7 },
  ...REFUSED.map((r) => {
    // "Cooled without a pull" is the cooled cook's, with its pull taken away.
    const from = r.note === 'cooled without a pull' ? JSON.parse(JSON.stringify(cooled)) as unknown : base;
    return { note: r.note, raw: withAt(from, r.path, r.value) };
  }),
  { note: 'extra fields are ignored', raw: { ...(base as object), ticket: { old: true } } },
];
const reads = rawReads.map((r) => ({ note: r.note, raw: r.raw, cook: readRunningCook(r.raw) }));

/* ----------------------------------------------------------------- plans */

/* The plan (`replan`) across a cook's phases, cold and hot, each kind of
 * correction, and the moves that need one (`withOut`, `eventsDue`). A plan
 * on a surface is planned twice, as an app plans: once with none, which says
 * which surface it wants (`inputs`), and once on that surface, built coarse
 * as decide.json's is. A surface for another pot - the start's, after the
 * boil tap made a new one - is passed as the other cook whose pot it is, and
 * must not be read. The posteriors are decide.json's. */

type SurfaceAsk = 'none' | 'own' | 'profile' | { of: RunningCook; now_s: number };

interface PlanCase {
  note: string;
  posterior: string;
  cook: RunningCook;
  leanHint_s: number;
  now_s: number;
  surface: SurfaceAsk;
  outs?: number[];
  dues?: number[];
}

function named(posterior: string) {
  const pz = decidePosteriors.find((x) => x.name === posterior);
  if (pz === undefined) throw new Error(posterior);
  return pz;
}

function surfaceFor(posterior: string, of: RunningCook, hint: number, now_s: number, profile: boolean): CookSurface {
  const c = calibrationOf(named(posterior));
  const inputs = replan(of, c, null, hint, now_s).inputs;
  if (inputs === null) throw new Error('a lengthened plan has no surface');
  const g = coarseDecisionGrid(inputs);
  return {
    inputs: inputs, grid: g.grid,
    profile: profile ? oddsProfile(c, inputs.egg, inputs.setup, g.grid) : null,
  };
}

function planJson(p: CookPlan) {
  const d = p.decided;
  return {
    egg: { mass_kg: p.egg.mass_kg }, setup: p.setup, provisional: p.provisional, lengthened: p.lengthened,
    inputs: p.inputs === null ? null : { params: p.inputs.params, whiteDose_min: p.inputs.whiteDose_min },
    answer: {
      level: p.answer.level, kind: p.answer.verdict.kind, snapTo: p.answer.verdict.snapTo,
      lowOdds: p.answer.lowOdds, cookTime_s: p.answer.solution.result.cookTime_s,
    },
    level: p.level,
    solution: {
      reachable: p.solution.reachable, whiteSets: p.solution.whiteSets, cookTime_s: p.solution.result.cookTime_s,
      peakYolk_C: p.solution.result.peakYolk_C, peakYolkTime_s: p.solution.result.peakYolkTime_s,
    },
    decided: d === null ? null : {
      level: d.level, cookTime_s: d.solution.result.cookTime_s, decision: d.decision, nudge_s: d.nudge_s,
      adviceWanted: d.adviceWanted,
    },
    lean_s: p.lean_s, nudge_s: p.nudge_s, cookTime_s: p.cookTime_s, overdue: p.overdue, cool_s: p.cool_s,
    probeMoment: p.probeMoment, deadlines: p.deadlines, slowHobAt_s: p.slowHobAt_s,
    certainty: p.certainty, forecast: p.forecast,
  };
}

const plans: unknown[] = [];

/* The record of each plan's egg (`cookFactsFor`, then `recordFor`), by each
 * app in turn, with no answer, both answers, or both and a probe reading. */
const ANSWERS: { yolkWord: YolkWord | null; white: WhiteReport | null; probe: ProbeReading | null }[] = [
  { yolkWord: null, white: null, probe: null },
  { yolkWord: 'jammy', white: 'firm', probe: null },
  { yolkWord: 'fudgy', white: 'tender', probe: { centre_C: 66.4, after_s: 180 } },
];

function contextFor(cook: RunningCook, i: number): RecordContext {
  const web = i % 2 === 0;
  return {
    app: web ? 'web' : 'ios', appVersion: '0.5.0-alpha.1', prior: LITERATURE_POPULATION.id, day: '2026-10-07',
    id: web ? cook.id_ms : null,
  };
}

/** Plan a case and write it down; its plan, for the cases after it. */
function plan(pc: PlanCase): CookPlan {
  const c = calibrationOf(named(pc.posterior));
  const ask = pc.surface;
  let surface: CookSurface | null = null;
  if (ask === 'own' || ask === 'profile') {
    surface = surfaceFor(pc.posterior, pc.cook, pc.leanHint_s, pc.now_s, ask === 'profile');
  } else if (ask !== 'none') {
    surface = surfaceFor(pc.posterior, ask.of, pc.leanHint_s, ask.now_s, false);
  }
  const p = replan(pc.cook, c, surface, pc.leanHint_s, pc.now_s);
  const g = surface === null ? null : coarseDecisionGrid(surface.inputs);
  plans.push({
    note: pc.note, posterior: pc.posterior, eggsLogged: c.eggsLogged, cook: pc.cook,
    leanHint_s: pc.leanHint_s, now_s: pc.now_s,
    surface: surface === null || g === null ? null : {
      of: typeof ask === 'object' ? { cook: ask.of, now_s: ask.now_s } : null,
      grid: { tauAirScale: g.tauAirScale, ...g.spec },
      profile: surface.profile,
    },
    plan: planJson(p),
    outs: (pc.outs ?? []).map((t) => ({ now_s: t, events: withOut(pc.cook, p, t).events })),
    dues: (pc.dues ?? []).map((t) => ({ now_s: t, events: eventsDue(pc.cook, p, t) })),
    ...recordOf(pc.cook, p, pc.now_s, plans.length),
  });
  return p;
}

/** The record of a plan's egg, the boil it remembers, and how it ends. */
function recordOf(cook: RunningCook, p: CookPlan, now_s: number, i: number) {
  const ctx = contextFor(cook, i);
  const a = ANSWERS[i % ANSWERS.length];
  return {
    context: ctx, answers: a,
    record: recordFor(cookFactsFor(cook, p, ctx, a.yolkWord, a.white, a.probe)),
    boil: boilToRemember(cook),
    ending: cookEnding(cook, p, now_s),
  };
}

/** The cook with these events written down. */
function withEvents(cook: RunningCook, events: RunningCook['events']): RunningCook {
  return { ...cook, events: events };
}

const S = START_S;
{
  // A cold start, through every phase, with its surfaces as they land.
  const c0 = cookOf({}, 6);
  plan({ note: 'cold, heating, before any egg, no surface yet', posterior: 'prior', cook: c0, leanHint_s: 0, now_s: S + 60, surface: 'none' });
  const heating = plan({ note: 'cold, heating, on its surface', posterior: 'learned', cook: c0, leanHint_s: 0, now_s: S + 60, surface: 'own' });
  const hint = heating.lean_s;
  const hinted = plan({ note: 'cold, heating, the hint carried before the surface lands', posterior: 'learned', cook: c0, leanHint_s: hint, now_s: S + 60, surface: 'none', dues: [S + 2000] });
  const hob = hinted.slowHobAt_s as number;
  plan({ note: 'cold, heating, just before the slow hob fires', posterior: 'learned', cook: c0, leanHint_s: hint, now_s: hob - 0.5, surface: 'own' });
  const once = plan({
    note: 'cold, heating, the slow hob lengthens the guess once: the surface is not its pot\'s', posterior: 'learned',
    cook: c0, leanHint_s: hint, now_s: hob + 1, surface: { of: c0, now_s: S + 60 },
  });
  plan({ note: 'cold, heating, a slow hob over and over', posterior: 'learned', cook: c0, leanHint_s: hint, now_s: (once.slowHobAt_s as number) + 700, surface: 'none' });

  const tapped = withBoil(c0, S + 532.5);
  plan({ note: "cold, tapped, cooking: the start's surface is not this pot's", posterior: 'learned', cook: tapped, leanHint_s: hint, now_s: S + 600, surface: { of: c0, now_s: S + 60 } });
  const cooking = plan({ note: 'cold, tapped, cooking on its own surface', posterior: 'learned', cook: tapped, leanHint_s: hint, now_s: S + 600, surface: 'own' });
  const end = cooking.deadlines.cookEnd_s;
  const inPull = plan({
    note: "cold, in the pull's grace", posterior: 'learned', cook: tapped, leanHint_s: hint, now_s: end + 5, surface: 'own',
    outs: [end - 1, end + 8, end + PULL_GRACE_SECONDS + 1],
    dues: [end + 5, end + PULL_GRACE_SECONDS - 0.001, end + PULL_GRACE_SECONDS, end + 2000],
  });
  const outByCook = withEvents(tapped, withOut(tapped, inPull, end + 8).events);
  const cooling = plan({ note: 'cold, out by the cook, cooling', posterior: 'learned', cook: outByCook, leanHint_s: hint, now_s: end + 40, surface: 'own', outs: [end + 41], dues: [end + 40, end + 400] });
  const coolEnd = cooling.deadlines.coolEnd_s as number;
  const done = withEvents(outByCook, eventsDue(outByCook, cooling, coolEnd + 1));
  plan({ note: 'cold, done', posterior: 'learned', cook: done, leanHint_s: hint, now_s: coolEnd + 60, surface: 'own' });
  const timedOut = withEvents(tapped, eventsDue(tapped, inPull, end + PULL_GRACE_SECONDS));
  plan({ note: 'cold, out when the grace ran out, cooling', posterior: 'learned', cook: timedOut, leanHint_s: hint, now_s: end + 30, surface: 'own' });

  // An earlier start, with the tap: the measured ramp grows.
  const earlier = startCorrected(tapped, S - 120, S + 600) as RunningCook;
  plan({ note: 'the start corrected two minutes earlier, after the tap', posterior: 'learned', cook: earlier, leanHint_s: hint, now_s: S + 600, surface: 'own' });

  // Corrections of the egg, mid-cook.
  plan({ note: 'a heavier egg, after the tap', posterior: 'learned', cook: corrected(tapped, { ...tapped.choices, mass_kg: 0.076 }, S + 600), leanHint_s: hint, now_s: S + 600, surface: 'own' });
  // Cold to hot after the tap: the tap is unread, and the hot egg is overdue.
  const toHot = corrected(tapped, { ...tapped.choices, startMode: 'hot' }, S + 600);
  const overdueHot = plan({ note: 'cold corrected to boiling after the tap: overdue, the pull is now', posterior: 'learned', cook: toHot, leanHint_s: hint, now_s: S + 600, surface: 'own', dues: [S + 619, S + 620] });
  const pulledNow = withEvents(toHot, eventsDue(toHot, overdueHot, S + 620));
  plan({ note: 'the overdue pull ran out its grace', posterior: 'learned', cook: pulledNow, leanHint_s: hint, now_s: S + 625, surface: 'own' });
  plan({ note: 'and back to cold: the tap read again, the pull kept', posterior: 'learned', cook: corrected(pulledNow, tapped.choices, S + 630), leanHint_s: hint, now_s: S + 630, surface: 'own' });
  // Cold to hot before the tap: heating ends at once.
  plan({ note: 'cold corrected to boiling before the tap', posterior: 'learned', cook: corrected(c0, { ...c0.choices, startMode: 'hot' }, S + 200), leanHint_s: hint, now_s: S + 200, surface: 'own' });

  // A correction while the egg cools: the cook time stands, the cooling moves.
  plan({ note: 'a lighter egg while it cools', posterior: 'learned', cook: corrected(outByCook, { ...outByCook.choices, mass_kg: 0.048 }, end + 40), leanHint_s: hint, now_s: end + 40, surface: 'own' });
  plan({ note: 'a lighter egg late in the cooling: it ends now', posterior: 'learned', cook: corrected(outByCook, { ...outByCook.choices, mass_kg: 0.048 }, coolEnd - 2), leanHint_s: hint, now_s: coolEnd - 2, surface: 'own' });
  plan({ note: 'ice corrected to the counter while it cools: done', posterior: 'learned', cook: corrected(outByCook, { ...outByCook.choices, cooling: 'counter' }, end + 40), leanHint_s: hint, now_s: end + 40, surface: 'own', dues: [end + 41] });
  // After Done: the record changes, the times do not.
  plan({ note: 'firmer wanted, after Done', posterior: 'learned', cook: corrected(done, { ...done.choices, level: 0.62 }, end + 600), leanHint_s: hint, now_s: end + 600, surface: 'own' });
  const counterDone = corrected(done, { ...done.choices, cooling: 'counter' }, end + 600);
  plan({ note: 'the counter, after Done: the cooling kept, unread', posterior: 'learned', cook: counterDone, leanHint_s: hint, now_s: end + 600, surface: 'own' });
  plan({ note: 'and back to ice: the cooling read again', posterior: 'learned', cook: corrected(counterDone, done.choices, end + 610), leanHint_s: hint, now_s: end + 610, surface: 'own' });
}
{
  // A hot start, nudged, with its odds profile.
  const h0 = cookOf({ startMode: 'hot' }, -7);
  const cooking = plan({ note: 'hot, cooking, on its surface and profile', posterior: 'learned', cook: h0, leanHint_s: 0, now_s: S + 60, surface: 'profile' });
  const end = cooking.deadlines.cookEnd_s;
  const hint = cooking.lean_s;
  plan({ note: 'hot, cooking, before any egg', posterior: 'prior', cook: h0, leanHint_s: 0, now_s: S + 60, surface: 'own' });
  const pull = plan({ note: "hot, in the pull's grace", posterior: 'learned', cook: h0, leanHint_s: hint, now_s: end + 3, surface: 'own', outs: [end + 3] });
  const out = withEvents(h0, withOut(h0, pull, end + 3).events);
  const cooling = plan({ note: 'hot, out at once, cooling', posterior: 'learned', cook: out, leanHint_s: hint, now_s: end + 10, surface: 'own' });
  plan({ note: 'hot, done', posterior: 'learned', cook: withEvents(out, eventsDue(out, cooling, cooling.deadlines.coolEnd_s as number)), leanHint_s: hint, now_s: end + 400, surface: 'own' });

  // The owner's case: boiling corrected to cold after the start.
  const owner = corrected(h0, { ...h0.choices, startMode: 'cold' }, S + 240);
  plan({ note: "the owner's case: boiling corrected to cold, back to heating", posterior: 'learned', cook: owner, leanHint_s: hint, now_s: S + 240, surface: 'own' });
  plan({ note: "the owner's case, then the tap", posterior: 'learned', cook: withBoil(owner, S + 560), leanHint_s: hint, now_s: S + 560, surface: 'own' });

  // A lighter egg makes it overdue; back within the grace, and it is not.
  const lighter = corrected(h0, { ...h0.choices, mass_kg: 0.048 }, end - 20);
  const overdue = plan({ note: 'a lighter egg: overdue, the pull is now', posterior: 'learned', cook: lighter, leanHint_s: hint, now_s: end - 20, surface: 'own', dues: [end - 1, end] });
  plan({ note: 'the lighter egg undone within the grace: cooking again', posterior: 'learned', cook: corrected(lighter, h0.choices, end - 10), leanHint_s: hint, now_s: end - 10, surface: 'own' });
  const ranOut = withEvents(lighter, eventsDue(lighter, overdue, end));
  plan({ note: 'the lighter egg undone after the grace ran out: the pull stands', posterior: 'learned', cook: corrected(ranOut, h0.choices, end + 5), leanHint_s: hint, now_s: end + 5, surface: 'own' });

  // On the counter: nothing counted, done at the out.
  const counter = cookOf({ startMode: 'hot', cooling: 'counter' });
  const cp = plan({ note: 'hot, on the counter, cooking', posterior: 'learned', cook: counter, leanHint_s: 0, now_s: S + 60, surface: 'own' });
  const cEnd = cp.deadlines.cookEnd_s;
  plan({ note: 'hot, on the counter, out: done', posterior: 'learned', cook: withEvents(counter, withOut(counter, cp, cEnd + 4).events), leanHint_s: 0, now_s: cEnd + 30, surface: 'own', dues: [cEnd + 30] });
}
{
  // A pot whose white never sets: the heat off under a quarter litre and
  // twelve eggs. The longest this pan gives, and nothing to choose.
  const never = cookOf({ startMode: 'hot', afterBoil: 'off', waterLitres: 0.25, eggCount: 12 }, 5);
  plan({ note: 'the heat off, a white that never sets', posterior: 'learned', cook: never, leanHint_s: 3, now_s: S + 30, surface: 'own' });
  plan({ note: 'the same, before its surface', posterior: 'learned', cook: never, leanHint_s: 3, now_s: S + 30, surface: 'none' });
  // The heat off, cold, tapped early: hard is out of reach, and the level
  // snaps down as it would at setup.
  const offHard = withBoil(cookOf({ afterBoil: 'off', level: 0.95 }), S + 250);
  plan({ note: 'the heat off, a quick boil: hard out of reach, the level snapped down', posterior: 'learned', cook: offHard, leanHint_s: 0, now_s: S + 300, surface: 'own' });
  // A runny egg on a very slow hob: done before the water boils, so the
  // guess creeps with the clock.
  const creep = cookOf({ mass_kg: 0.048, level: 0 });
  plan({ note: 'a small runny egg on a slow hob: the guess creeps', posterior: 'learned', cook: creep, leanHint_s: 0, now_s: S + 1234.5, surface: 'none' });
  // The cap on lengthenings.
  plan({ note: 'heating for six hours', posterior: 'prior', cook: cookOf({ level: 0.62 }), leanHint_s: 0, now_s: S + 6 * 3600, surface: 'none' });
}

/* What the boil memory learns (`boilToRemember`): a tap the cook watched for,
 * and one told to watch for too late to trust. */
const remembers: { note: string; cook: RunningCook }[] = [];
{
  const cold = cookOf();
  const hot = cookOf({ startMode: 'hot' });
  const remember = (note: string, cook: RunningCook): void => { remembers.push({ note: note, cook: cook }); };
  remember('no tap', cold);
  remember('a tap on a cook begun cold', withBoil(cold, S + 512));
  remember('a tap, the water corrected after it', withBoil(corrected(cold, { ...cold.choices, waterLitres: 3 }, S + 100), S + 600));
  remember('a boiling start: nothing timed', hot);
  remember('boiling corrected to cold before the water could have boiled, then a tap', withBoil(corrected(hot, { ...hot.choices, startMode: 'cold' }, S + 240), S + 520));
  remember('boiling corrected to cold at the time this water takes, then a tap', withBoil(corrected(hot, { ...hot.choices, startMode: 'cold' }, S + 480), S + 700));
  remember('boiling corrected to cold after it, then a tap: used, not remembered', withBoil(corrected(hot, { ...hot.choices, startMode: 'cold' }, S + 480.5), S + 700));
  remember('a tap, then corrected to boiling: unread, not remembered', corrected(withBoil(cold, S + 512), { ...cold.choices, startMode: 'hot' }, S + 600));
  remember('the start corrected four minutes earlier, then a tap', withBoil(startCorrected(cold, S - 240, S + 10) as RunningCook, S + 500));
  remember('the start corrected ten minutes earlier, then a tap: not remembered', withBoil(startCorrected(cold, S - 600, S + 10) as RunningCook, S + 500));
  remember('no pans remembered: the default time', withBoil(corrected(startCook(START_MS, { ...BASE_CHOICES, startMode: 'hot' }, 0, {}, 'metric', 'en'), BASE_CHOICES, S + 470), S + 900));
}

export const runningFixture = {
  about: 'A running cook: its egg and pot, the moves the cook makes, a stored cook read back, and the plan derived from it. src/core/running.ts.',
  constants: {
    slowHobWhenLeft_s: SLOW_HOB_WHEN_LEFT_S, slowHobExtra_s: SLOW_HOB_EXTRA_S, slowHobEvery_s: SLOW_HOB_EVERY_S,
    slowHobMaxSteps: SLOW_HOB_MAX_STEPS, pullGrace_s: PULL_GRACE_SECONDS,
  },
  setups: setups,
  moves: moves,
  reads: reads,
  plans: plans,
  remembers: remembers.map((r) => ({ note: r.note, cook: r.cook, boil: boilToRemember(r.cook) })),
};
