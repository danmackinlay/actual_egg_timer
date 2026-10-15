/**
 * fixtures/running.json: a running cook - its egg and pot, how each thing the
 * cook does moves it, how a stored one is read, and which phase it is in at
 * every boundary (src/core/running.ts).
 */

import { SIZE_CLASSES, US_SIZE_CLASSES } from '../../src/core/geometry.js';
import { oddsProfile } from '../../src/core/reach.js';
import { decisionInputs, inputsKey } from '../../src/core/decide.js';
import type { GridSpec } from '../../src/core/doseGrid.js';
import type { WhiteReport, YolkWord } from '../../src/core/infer.js';
import { LITERATURE_POPULATION } from '../../src/core/infer.js';
import { type Calibration, type ProbeReading, recordFor } from '../../src/core/record.js';
import {
  COOLING_SECONDS, type CookChoices, type CookPlan, type CookSurface, PULL_GRACE_SECONDS, RESTORE_WINDOW_S, type RecordContext, type RunningCook,
  SLOW_HOB_EVERY_S, SLOW_HOB_EXTRA_S, SLOW_HOB_MAX_STEPS, SLOW_HOB_WHEN_LEFT_S, type SlowHobMemo, type SlowHobPlace,
  asRanCorrected, asRanCurrent, asRanShown, boilToRemember, cookEnding, cookFactsFor, cookSetupOf,
  corrected, earliestStart_s, eventsDue, keepAsRan, latestStart_s, openEggId, phaseAt, pullStands,
  replan, slowHobDue, solutionAsRan, startCook, startCorrected, stillIn, withBoil,
  withOut, writeEvents,
} from '../../src/core/running.js';

import { calibrationOf, coarseDecisionGrid, decidePosteriors } from './decide.js';
import { BASE_CHOICES, MEMORY, START_S } from './shared.js';

/* The egg and the pot (`cookSetupOf`) for choices across every branch: a
 * class off each carton and a measured egg, each egg start with and without
 * a measured room, both starts, both burners, each cooling, at sea level and
 * up a mountain. The moves (`startCook`, `withBoil`, `corrected`,
 * `startCorrected`) from cooks at each stage, taken and refused. */

export function cookOf(over: Partial<CookChoices> = {}, nudge_s = 0): RunningCook {
  return startCook(START_S, { ...BASE_CHOICES, ...over }, nudge_s, MEMORY, 'metric', 'en');
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
    { cooling: 'bowl', bowlLitres: 1.25, bowlWater_C: 13, tapWater_C: 9, eggCount: 6 },
    { startMode: 'hot', cooling: 'bowl', bowlLitres: 3, bowlWater_C: null },
    { startMode: 'hot', cooling: 'tap', tapWater_C: 23.5, bowlWater_C: 30 },
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
  const inputs = decisionInputs(calibrationOf(named('learned')), pot.egg, pot.setup);
  return {
    choices: choices, timeToBoil_s: timeToBoil_s, egg: pot.egg, setup: pot.setup,
    // The key's numbers in its order, as text that every reader parses to
    // the bit (a JSON reader may read a 17-digit number an ulp off).
    keyNumbers: [
      pot.egg.radius_m, pot.egg.minorDiameter_m, pot.egg.mass_kg, pot.egg.volume_m3, pot.setup.eggStart_C,
      pot.setup.ambient_C, pot.setup.boiling_C, pot.setup.timeToBoil_s, pot.setup.waterLitres, pot.setup.eggCount,
      inputs.params.alpha_m2s, inputs.whiteDose_min,
    ].map(String),
    inputsKey: inputsKey(inputs),
  };
});

/* ---------------------------------------------------------------- moves */

const cold = cookOf();
const hot = cookOf({ startMode: 'hot' }, -7);
const tapped = withBoil(cold, START_S + 532.5);
const pulled = writeEvents(tapped, { ...tapped.events, pulled: { due_s: START_S + 851.2, out_s: START_S + 858.9, by: 'cook', confirmed: true } });
const cooled = writeEvents(pulled, { ...pulled.events, cooledAt_s: START_S + 1031.9 });
/** The grace ran out on a hot start, and the counted cooling ended. */
const timedOut = writeEvents(hot, {
  boilAt_s: null, pulled: { due_s: START_S + 380, out_s: START_S + 400, by: 'timeout', confirmed: false },
  cooledAt_s: START_S + 590, rangAt_s: START_S + 380,
});
/** The pull rang, the egg still in. */
const rung = writeEvents(hot, { ...hot.events, rangAt_s: START_S + 380 });

type Move =
  | { boil: number }
  | { correct: CookChoices; now: number }
  | { start: number; now: number }
  | { stillIn: number }
  | { stands: true };

const MOVES: { note: string; cook: RunningCook; move: Move }[] = [
  { note: 'the boil, tapped on a cold start', cook: cold, move: { boil: START_S + 532.5 } },
  { note: 'a second tap is not taken', cook: tapped, move: { boil: START_S + 540 } },
  { note: 'no boil to tap on a hot start', cook: hot, move: { boil: START_S + 60 } },
  { note: 'no boil to tap after the pull', cook: writeEvents(cold, pulled.events), move: { boil: START_S + 900 } },
  { note: 'no tap before the start', cook: cold, move: { boil: START_S - 1 } },
  { note: 'boiling corrected to cold: cold from now', cook: hot, move: { correct: { ...hot.choices, startMode: 'cold' }, now: START_S + 240 } },
  { note: 'cold corrected to boiling: no longer cold', cook: tapped, move: { correct: { ...tapped.choices, startMode: 'hot' }, now: START_S + 600 } },
  { note: 'cold kept cold, a heavier egg: cold since the start still', cook: tapped, move: { correct: { ...tapped.choices, mass_kg: 0.076 }, now: START_S + 600 } },
  { note: 'corrected back to cold: cold from the second correction', cook: corrected(tapped, { ...tapped.choices, startMode: 'hot' }, START_S + 600), move: { correct: tapped.choices, now: START_S + 610 } },
  { note: 'boiling a second time: first said boiling at the first', cook: corrected(corrected(tapped, { ...tapped.choices, startMode: 'hot' }, START_S + 600), tapped.choices, START_S + 610), move: { correct: { ...tapped.choices, startMode: 'hot' }, now: START_S + 620 } },
  { note: 'a correction after the cooling ended keeps every event, and the level the egg was pulled at', cook: cooled, move: { correct: { ...cooled.choices, level: 0.62, cooling: 'tap' }, now: START_S + 1100 } },
  { note: 'corrected to a bowl of water after the cooling ended', cook: cooled, move: { correct: { ...cooled.choices, cooling: 'bowl', bowlLitres: 1, bowlWater_C: 14 }, now: START_S + 1100 } },
  { note: 'done on the counter, corrected to ice: the cooling ended by the correction at the latest', cook: writeEvents(cookOf({ cooling: 'counter' }), pulled.events), move: { correct: { ...cooled.choices, cooling: 'ice' }, now: START_S + 900 } },
  { note: 'done on the counter, another correction: nothing ended', cook: writeEvents(cookOf({ cooling: 'counter' }), pulled.events), move: { correct: { ...cooled.choices, cooling: 'counter', mass_kg: 0.076 }, now: START_S + 900 } },
  { note: 'the level, before the pull: corrected', cook: tapped, move: { correct: { ...tapped.choices, level: 0.62 }, now: START_S + 600 } },
  { note: 'a correction after the pull rang: planned afresh', cook: rung, move: { correct: { ...hot.choices, mass_kg: 0.076 }, now: START_S + 385 } },
  { note: 'the start corrected after the pull rang: planned afresh', cook: rung, move: { start: START_S - 60, now: START_S + 385 } },
  { note: 'still in the water: the pull the clock assumed dropped, with its cooling', cook: corrected(timedOut, { ...hot.choices, startMode: 'cold' }, START_S + 700), move: { stillIn: START_S + 703 } },
  { note: 'still in, after the cook tapped out: kept', cook: cooled, move: { stillIn: START_S + 1100 } },
  { note: 'still in, nothing pulled: kept', cook: tapped, move: { stillIn: START_S + 600 } },
  { note: 'the pull the clock assumed stands', cook: timedOut, move: { stands: true } },
  { note: 'still in, after the pull was said to stand: kept', cook: pullStands(timedOut), move: { stillIn: START_S + 700 } },
  { note: 'the pull stands, the cook tapped out: kept', cook: cooled, move: { stands: true } },
  { note: 'the start two minutes earlier', cook: cold, move: { start: START_S - 120, now: START_S + 200 } },
  { note: 'the start later, to now', cook: cold, move: { start: START_S + 200, now: START_S + 200 } },
  { note: 'the start after now: refused', cook: cold, move: { start: START_S + 200.5, now: START_S + 200 } },
  { note: 'the start to the boil tap itself', cook: tapped, move: { start: START_S + 532.5, now: START_S + 700 } },
  { note: 'the start after the boil tap: refused', cook: tapped, move: { start: START_S + 533, now: START_S + 700 } },
  { note: 'the start after a tap a correction to boiling left unread: refused', cook: corrected(tapped, { ...tapped.choices, startMode: 'hot' }, START_S + 600), move: { start: START_S + 540, now: START_S + 700 } },
  { note: 'the start after the pull was due: refused', cook: writeEvents(hot, { ...hot.events, pulled: { due_s: START_S + 380, out_s: START_S + 400, by: 'timeout', confirmed: false } }), move: { start: START_S + 390, now: START_S + 500 } },
  { note: 'the start earlier, after the cooling ended', cook: cooled, move: { start: START_S - 30, now: START_S + 1200 } },
  { note: 'a start that is not a time: refused', cook: cold, move: { start: Number.NaN, now: START_S + 200 } },
  { note: 'the start two hours before Start was pressed: the earliest taken', cook: cold, move: { start: START_S - 7200, now: START_S + 200 } },
  { note: 'the start before that: refused', cook: cold, move: { start: START_S - 7200.5, now: START_S + 200 } },
  { note: 'the start in 1970: refused', cook: cold, move: { start: 1, now: START_S + 10 } },
  { note: 'the earliest fixed at the press, after an earlier start', cook: startCorrected(cold, START_S - 3600, START_S + 10) as RunningCook, move: { start: START_S - 7300, now: START_S + 200 } },
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
  if ('stillIn' in move) return { note: m.note, cook: m.cook, move: { stillIn: move.stillIn }, after: stillIn(m.cook, move.stillIn) };
  if ('stands' in move) return { note: m.note, cook: m.cook, move: { stands: true }, after: pullStands(m.cook) };
  return {
    note: m.note, cook: m.cook, move: { start: timeJson(move.start), now: move.now },
    latest_s: latestStart_s(m.cook, move.now), earliest_s: earliestStart_s(m.cook), after: startCorrected(m.cook, move.start, move.now),
  };
});

/** `cook` with the plan as it ran kept, from its plan at `now_s` on the
 *  learned posterior's coarse surface. */
function keptOf(cook: RunningCook, now_s: number): RunningCook {
  const c = calibrationOf(named('learned'));
  const inputs = replan(cook, c, null, 0, now_s).inputs;
  if (inputs === null) throw new Error('no surface wanted');
  const kept = keepAsRan(cook, replan(cook, c, { inputs: inputs, grid: coarseDecisionGrid(inputs).grid, profile: null }, 0, now_s));
  if (kept.asRan === null) throw new Error('nothing kept');
  return kept;
}

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
  /** The slow hob's hint handed to the plan. */
  hint?: SlowHobMemo | null;
  /** Moments to ask whether the slow hob's moment has come (`slowHobDue`). */
  hobDue?: number[];
}

function named(posterior: string) {
  const pz = decidePosteriors.find((x) => x.name === posterior);
  if (pz === undefined) throw new Error(posterior);
  return pz;
}

/** The surface a plan wants, and the spec it was built to. */
function surfaceFor(
  posterior: string, of: RunningCook, hint: number, now_s: number, profile: boolean,
): { surface: CookSurface; spec: GridSpec } {
  const c = calibrationOf(named(posterior));
  const inputs = replan(of, c, null, hint, now_s).inputs;
  if (inputs === null) throw new Error('a lengthened plan has no surface');
  const g = coarseDecisionGrid(inputs);
  return {
    surface: {
      inputs: inputs, grid: g.grid,
      profile: profile ? oddsProfile(c, inputs.egg, inputs.setup, g.grid) : null,
    },
    spec: g.spec,
  };
}

/** The slow hob's memo as the fixtures write it: where the rule got to, and
 *  the key of what it read, which a core whose numbers differ in their last
 *  bits makes otherwise, and then works the rule from the start: the same
 *  plan. */
function memoJson(m: SlowHobMemo | null) {
  if (m === null) return null;
  const p = m as SlowHobPlace;
  return { key: p.key, steps: p.steps, last_s: p.last_s, ramp_s: p.ramp_s, carried_s: p.carried_s };
}

function planJson(p: CookPlan) {
  const d = p.decided;
  return {
    egg: { mass_kg: p.egg.mass_kg }, setup: p.setup,
    inputs: p.inputs === null ? null : { params: p.inputs.params, whiteDose_min: p.inputs.whiteDose_min },
    answer: {
      level: p.answer.level, kind: p.answer.verdict.kind, snapTo: p.answer.verdict.snapTo,
      lowOdds: p.answer.lowOdds, cookTime_s: p.answer.solution.result.cookTime_s,
    },
    solution: {
      reachable: p.solution.reachable, whiteSets: p.solution.whiteSets, cookTime_s: p.solution.result.cookTime_s,
      peakYolk_C: p.solution.result.peakYolk_C, peakYolkTime_s: p.solution.result.peakYolkTime_s,
    },
    decided: d === null ? null : {
      level: d.level, cookTime_s: d.solution.result.cookTime_s, decision: d.decision, nudge_s: d.nudge_s,
      adviceWanted: d.adviceWanted,
    },
    lean_s: p.lean_s, nudge_s: p.nudge_s, cookTime_s: p.cookTime_s, overdue: p.overdue, cool_s: p.cool_s,
    probeMoment: p.probeMoment, deadlines: p.deadlines, slowHobAt_s: p.slowHobAt_s, memo: memoJson(p.memo),
    tooOldAt_s: p.tooOldAt_s,
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
  let built: { surface: CookSurface; spec: GridSpec } | null = null;
  if (ask === 'own' || ask === 'profile') {
    built = surfaceFor(pc.posterior, pc.cook, pc.leanHint_s, pc.now_s, ask === 'profile');
  } else if (ask !== 'none') {
    built = surfaceFor(pc.posterior, ask.of, pc.leanHint_s, ask.now_s, false);
  }
  const surface = built === null ? null : built.surface;
  const hint = pc.hint ?? null;
  const p = replan(pc.cook, c, surface, pc.leanHint_s, pc.now_s, hint);
  if (hint !== null && JSON.stringify(p) !== JSON.stringify(replan(pc.cook, c, surface, pc.leanHint_s, pc.now_s))) {
    throw new Error(`${pc.note}: the hint moved the plan`);
  }
  plans.push({
    note: pc.note, posterior: pc.posterior, eggsLogged: c.eggsLogged, cook: pc.cook,
    leanHint_s: pc.leanHint_s, now_s: pc.now_s, hint: memoJson(hint),
    surface: built === null ? null : {
      of: typeof ask === 'object' ? { cook: ask.of, now_s: ask.now_s } : null,
      grid: built.spec,
      profile: built.surface.profile,
    },
    plan: planJson(p),
    outs: (pc.outs ?? []).map((t) => ({ now_s: t, events: withOut(pc.cook, p, t).events })),
    dues: (pc.dues ?? []).map((t) => ({ now_s: t, events: eventsDue(pc.cook, p, t) })),
    ...(pc.hobDue === undefined ? {} : { hobDue: pc.hobDue.map((t) => ({ now_s: t, due: slowHobDue(p, t) })) }),
    open: openEggId(pc.cook, p, pc.now_s),
    asRan: {
      current: asRanCurrent(pc.cook), kept: keepAsRan(pc.cook, p).asRan, shown: asRanShown(pc.cook, p),
      corrected: correctedAsRan(pc.cook, c, surface, pc.now_s),
      solution: solutionShown(pc.cook, p),
    },
    ...recordOf(pc.cook, p, pc.now_s, plans.length),
  });
  return p;
}

/** The solve as it ran (`solutionAsRan`) of what Done shows, where it shows
 *  one: the peaks and whether the white sets, which the texture note reads. */
function solutionShown(cook: RunningCook, p: CookPlan) {
  const ran = asRanShown(cook, p);
  if (ran === null) return null;
  const sol = solutionAsRan(p, ran);
  return { peakYolk_C: sol.result.peakYolk_C, peakWhite_C: sol.result.peakWhite_C, whiteSets: sol.whiteSets };
}

/** `asRanCorrected` on the plan's calibration and surface: its plan as it
 *  ran, or null when refused for want of the surface. */
function correctedAsRan(cook: RunningCook, c: Calibration, surface: CookSurface | null, now_s: number) {
  const r = asRanCorrected(cook, c, surface, now_s);
  return r === null ? null : { asRan: r.asRan };
}

/** The record of a plan's egg (or why core refused it), the boil it
 *  remembers, and how it ends. */
function recordOf(cook: RunningCook, p: CookPlan, now_s: number, i: number) {
  const ctx = contextFor(cook, i);
  const a = ANSWERS[i % ANSWERS.length];
  const made = cookFactsFor(cook, p, ctx, a.yolkWord, a.white, a.probe);
  return {
    context: ctx, answers: a,
    record: made.facts === null ? null : recordFor(made.facts),
    refused: made.refused,
    boil: boilToRemember(cook),
    ending: cookEnding(cook, p, now_s),
  };
}

/** The cook with these events written down. */
function withEvents(cook: RunningCook, events: RunningCook['events']): RunningCook {
  return writeEvents(cook, events);
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
  plan({ note: 'and back to cold: the tap read again, the pull kept, and the app asks whether it is still in', posterior: 'learned', cook: corrected(pulledNow, tapped.choices, S + 630), leanHint_s: hint, now_s: S + 630, surface: 'own' });
  // Cold to hot before the tap: heating ends at once.
  plan({ note: 'cold corrected to boiling before the tap', posterior: 'learned', cook: corrected(c0, { ...c0.choices, startMode: 'hot' }, S + 200), leanHint_s: hint, now_s: S + 200, surface: 'own' });

  // A correction while the egg cools: the cook time stands, the cooling moves.
  plan({ note: 'a lighter egg while it cools', posterior: 'learned', cook: corrected(outByCook, { ...outByCook.choices, mass_kg: 0.048 }, end + 40), leanHint_s: hint, now_s: end + 40, surface: 'own' });
  plan({ note: 'a lighter egg late in the cooling: its counted end passed, so Done at once', posterior: 'learned', cook: corrected(outByCook, { ...outByCook.choices, mass_kg: 0.048 }, coolEnd - 2), leanHint_s: hint, now_s: coolEnd - 2, surface: 'own' });
  plan({ note: 'ice corrected to the counter while it cools: done', posterior: 'learned', cook: corrected(outByCook, { ...outByCook.choices, cooling: 'counter' }, end + 40), leanHint_s: hint, now_s: end + 40, surface: 'own', dues: [end + 41] });
  // After Done: the record changes, the times do not.
  plan({ note: 'firmer wanted after Done: the level the egg was pulled at kept', posterior: 'learned', cook: corrected(done, { ...done.choices, level: 0.62 }, end + 600), leanHint_s: hint, now_s: end + 600, surface: 'own' });
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
  // Corrected to cold later than this water takes to boil: the
  // tap may be long after the boil, so the remembered time is the ramp.
  const lateCold = corrected(h0, { ...h0.choices, startMode: 'cold' }, S + 500);
  plan({ note: 'boiling corrected to cold after the water could have boiled, then a tap: the remembered time', posterior: 'learned', cook: withBoil(lateCold, S + 600), leanHint_s: hint, now_s: S + 600, surface: 'own' });
  plan({ note: 'the same, tapped after the pull the remembered time gives: the pull at the tap', posterior: 'learned', cook: withBoil(lateCold, S + 720), leanHint_s: hint, now_s: S + 720, surface: 'own' });

  // A lighter egg makes it overdue; back within the grace, and it is not.
  const lighter = corrected(h0, { ...h0.choices, mass_kg: 0.048 }, end - 20);
  const overdue = plan({ note: 'a lighter egg: overdue, the pull is now', posterior: 'learned', cook: lighter, leanHint_s: hint, now_s: end - 20, surface: 'own', dues: [end - 1, end] });
  plan({ note: 'the lighter egg undone within the grace: cooking again', posterior: 'learned', cook: corrected(lighter, h0.choices, end - 10), leanHint_s: hint, now_s: end - 10, surface: 'own' });
  const ranOut = withEvents(lighter, eventsDue(lighter, overdue, end));
  plan({ note: 'the lighter egg undone after the grace ran out and after its first pull: the pull stands, nothing to ask', posterior: 'learned', cook: corrected(ranOut, h0.choices, end + 5), leanHint_s: hint, now_s: end + 5, surface: 'own' });

  // On the counter: nothing counted, done at the out.
  const counter = cookOf({ startMode: 'hot', cooling: 'counter' });
  const cp = plan({ note: 'hot, on the counter, cooking', posterior: 'learned', cook: counter, leanHint_s: 0, now_s: S + 60, surface: 'own' });
  const cEnd = cp.deadlines.cookEnd_s;
  const counterOut = withEvents(counter, withOut(counter, cp, cEnd + 4).events);
  plan({ note: 'hot, on the counter, out: done', posterior: 'learned', cook: counterOut, leanHint_s: 0, now_s: cEnd + 30, surface: 'own', dues: [cEnd + 30] });
  // Corrected to ice ten minutes later: the counted cooling, long ended, so
  // Done at once.
  plan({ note: 'the counter corrected to ice ten minutes after the out: the counted time, Done at once', posterior: 'learned', cook: corrected(counterOut, h0.choices, cEnd + 604), leanHint_s: 0, now_s: cEnd + 604, surface: 'own', dues: [cEnd + 605] });

  // The grace runs out, then the owner's case: the pull stands
  // until the cook says whether the egg is still in the water.
  const timedOut = withEvents(h0, eventsDue(h0, pull, end + 21));
  const asked = corrected(timedOut, { ...h0.choices, startMode: 'cold' }, end + 30);
  plan({ note: "the grace ran out, then the owner's case: the app asks whether it is still in", posterior: 'learned', cook: asked, leanHint_s: hint, now_s: end + 30, surface: 'own', dues: [end + 31] });
  plan({ note: 'still in the water: heating again', posterior: 'learned', cook: stillIn(asked, end + 33), leanHint_s: hint, now_s: end + 33, surface: 'own' });
  plan({ note: 'out when the clock said: the pull stands, corrected to cold', posterior: 'learned', cook: pullStands(asked), leanHint_s: hint, now_s: end + 33, surface: 'own' });
  const heavier = corrected(timedOut, { ...h0.choices, mass_kg: 0.076 }, end + 30);
  plan({ note: 'the grace ran out, then a heavier egg: the app asks', posterior: 'learned', cook: heavier, leanHint_s: hint, now_s: end + 30, surface: 'own' });
  plan({ note: 'still in, the heavier egg: its pull later', posterior: 'learned', cook: stillIn(heavier, end + 33), leanHint_s: hint, now_s: end + 33, surface: 'own', dues: [end + 34] });
  plan({ note: 'the grace ran out, then a lighter egg: nothing asked', posterior: 'learned', cook: corrected(timedOut, { ...h0.choices, mass_kg: 0.048 }, end + 30), leanHint_s: hint, now_s: end + 30, surface: 'own' });

  // The pull rings on the interim plan, before the surface lands; the
  // surface lands in the grace and does not move it.
  const interim = plan({ note: 'hot, the interim plan, before its surface', posterior: 'learned', cook: h0, leanHint_s: 0, now_s: S + 1, surface: 'none' });
  const iEnd = interim.deadlines.cookEnd_s;
  const rang = withEvents(h0, eventsDue(h0, interim, iEnd + 2));
  plan({ note: 'the pull rang on the interim plan, then its surface landed: the pull held', posterior: 'learned', cook: rang, leanHint_s: 0, now_s: iEnd + 3, surface: 'own', outs: [iEnd + 4], dues: [iEnd + 5, iEnd + PULL_GRACE_SECONDS] });
  plan({ note: 'the pull rang, then a correction: planned afresh', posterior: 'learned', cook: corrected(rang, { ...h0.choices, mass_kg: 0.076 }, iEnd + 4), leanHint_s: 0, now_s: iEnd + 4, surface: 'own' });
}
{
  // A pot whose white never sets: the heat off under a quarter litre and
  // twelve eggs. The longest this pan gives, and nothing to choose.
  // Four eggs into a bowl of a litre and a half from a cold tap: the
  // cooling counted to the yolk's peak in a bowl that warms.
  const bowl = cookOf({ startMode: 'hot', cooling: 'bowl', bowlLitres: 1.5, bowlWater_C: 12, eggCount: 4 }, 2);
  plan({ note: 'a bowl of water, its cooling counted to the peak', posterior: 'learned', cook: bowl, leanHint_s: 0, now_s: S + 30, surface: 'own' });
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
  plan({ note: 'heating for six hours: the guess at the most, nothing more to lengthen, abandoned', posterior: 'prior', cook: cookOf({ level: 0.62 }), leanHint_s: 0, now_s: S + 6 * 3600, surface: 'none' });
  // Review 1.3's call: a cold start never tapped, twelve hours on; and just
  // short of the most, where the guess reaches it.
  plan({ note: 'a cold start never tapped, twelve hours on: abandoned', posterior: 'learned', cook: cookOf(), leanHint_s: 0, now_s: S + 12 * 3600, surface: 'none' });
  plan({ note: 'heating just short of two hours: the guess at the most, not yet abandoned', posterior: 'learned', cook: cookOf(), leanHint_s: 0, now_s: S + 7170, surface: 'none' });
  plan({ note: 'heating a little before that: still lengthening', posterior: 'learned', cook: cookOf(), leanHint_s: 0, now_s: S + 7100, surface: 'none' });
  // A cook done long ago: too old, so its egg is final.
  const longAgo = cookOf({ startMode: 'hot', cooling: 'tap' });
  const lp = replan(longAgo, calibrationOf(named('learned')), null, 0, S + 1);
  const ranOut = withEvents(longAgo, eventsDue(longAgo, lp, S + 5 * 3600));
  plan({ note: 'a cook left at Done for five hours: too old, its egg final', posterior: 'learned', cook: ranOut, leanHint_s: 0, now_s: S + 5 * 3600, surface: 'none' });

  // A small correction after the grace ran out moves the pull a little,
  // still before the correction: nothing to ask, the pull stands. A much
  // heavier egg leaves it still to cook: ask. Last, so no case before them
  // moves.
  const late = cookOf({ startMode: 'hot' }, -7);
  const lateEnd = replan(late, calibrationOf(named('learned')), null, 0, S + 1).deadlines.cookEnd_s;
  const lateOut = withEvents(late, eventsDue(late, replan(late, calibrationOf(named('learned')), null, 0, lateEnd + 21), lateEnd + 21));
  plan({ note: 'the grace ran out, then ice corrected to tap water: nothing to ask', posterior: 'learned', cook: corrected(lateOut, { ...late.choices, cooling: 'tap' }, lateEnd + 30), leanHint_s: 0, now_s: lateEnd + 30, surface: 'own' });
  plan({ note: 'the grace ran out, then a much heavier egg: the app asks', posterior: 'learned', cook: corrected(lateOut, { ...late.choices, mass_kg: late.choices.mass_kg + 0.02 }, lateEnd + 30), leanHint_s: 0, now_s: lateEnd + 30, surface: 'own' });
}

{
  // The slow hob's hint: a plan started where the last one got
  // to is the plan from the start; one made under anything else is ignored.
  // Last, so no case before them moves.
  const learned = calibrationOf(named('learned'));
  const slow = cookOf();
  const at = S + 1000;
  const before = replan(slow, learned, null, 0, at);
  const hint = before.memo;
  plan({ note: 'a slow hob, the last plan\'s hint: the plan from the start', posterior: 'learned', cook: slow, leanHint_s: 0, now_s: at + 15, surface: 'none', hint: hint });
  const next = replan(slow, learned, null, 0, at + 15, hint);
  plan({ note: 'and the plan after it, with its hint', posterior: 'learned', cook: slow, leanHint_s: 0, now_s: at + 400, surface: 'none', hint: next.memo });
  plan({ note: 'the hint at the moment it was made: nothing more to lengthen', posterior: 'learned', cook: slow, leanHint_s: 0, now_s: at, surface: 'none', hint: hint });
  plan({ note: 'a hint for a lighter egg: ignored', posterior: 'learned', cook: corrected(slow, { ...slow.choices, mass_kg: 0.076 }, at + 10), leanHint_s: 0, now_s: at + 15, surface: 'none', hint: hint });
  plan({ note: 'a hint made under another lean: ignored', posterior: 'learned', cook: slow, leanHint_s: 2, now_s: at + 15, surface: 'none', hint: hint });
  plan({ note: 'a hint made under another calibration: ignored', posterior: 'prior', cook: slow, leanHint_s: 0, now_s: at + 15, surface: 'none', hint: hint });
  plan({ note: 'a hint kept past the moment: ignored', posterior: 'learned', cook: slow, leanHint_s: 0, now_s: S + (hint as SlowHobPlace).last_s - 1, surface: 'none', hint: hint });
  plan({ note: 'a hint, the boil tapped since: ignored', posterior: 'learned', cook: withBoil(slow, at + 5), leanHint_s: 0, now_s: at + 15, surface: 'none', hint: hint });
}

{
  // Review 3's call: a question left open through the counted cooling. The
  // clock writes nothing under it, the phase stays short of Done, and the
  // egg is not finished. Last, so no case before them moves.
  const learned = calibrationOf(named('learned'));
  const hot = cookOf({ startMode: 'hot' });
  const p = replan(hot, learned, null, 0, S + 1);
  const due = p.deadlines.cookEnd_s;
  const out = withEvents(hot, eventsDue(hot, p, due + 60));
  const asked = corrected(out, { ...hot.choices, startMode: 'cold' }, due + 60);
  const q = replan(asked, learned, null, 0, due + 60);
  const end = q.deadlines.coolEnd_s as number;
  plan({ note: 'a question left open past the counted cooling: nothing written, not Done', posterior: 'learned', cook: asked, leanHint_s: 0, now_s: end + 5, surface: 'own', dues: [end + 5, end + 4000] });
  // Asked at Done: the cooling had ended, and the question still holds Done back.
  const cooled = withEvents(out, eventsDue(out, replan(out, learned, null, 0, due + 60), due + 900));
  plan({ note: 'a question asked after Done: Done held back until it is answered', posterior: 'learned', cook: corrected(cooled, { ...hot.choices, startMode: 'cold' }, due + 900), leanHint_s: 0, now_s: due + 901, surface: 'none', dues: [due + 902] });
}

{
  // The cook as it ran: the pull written on the interim
  // plan, no surface yet; kept when the surface lands; a relaunch three hours
  // on with no surface; a correction at Done, stale until planned again on
  // the calibration before this egg. Last, so no case before them moves.
  const learned = calibrationOf(named('learned'));
  const hot = cookOf({ startMode: 'hot' }, -7);
  const interim = replan(hot, learned, null, 0, S + 1);
  const due = interim.deadlines.cookEnd_s;
  const out = withEvents(hot, eventsDue(hot, interim, due + PULL_GRACE_SECONDS));
  plan({ note: 'the grace ran out on the interim plan, then a reload with no surface: no record, nothing kept', posterior: 'learned', cook: out, leanHint_s: 0, now_s: due + 30, surface: 'none' });
  plan({ note: 'its surface landed: the plan as it ran is kept from it', posterior: 'learned', cook: out, leanHint_s: 0, now_s: due + 31, surface: 'own' });
  const kept = keptOf(out, due + 31);
  const done = withEvents(kept, eventsDue(kept, replan(kept, learned, null, 0, due + 31), due + 900));
  plan({ note: 'kept, relaunched three hours on with no surface: too old, its record from the cook as it ran', posterior: 'learned', cook: done, leanHint_s: 0, now_s: S + 3 * 3600, surface: 'none' });
  plan({ note: 'kept, on another posterior: the cook as it ran all the same', posterior: 'prior', cook: done, leanHint_s: 0, now_s: due + 1000, surface: 'own' });
  const corr = corrected(done, { ...done.choices, mass_kg: 0.062 }, due + 1000);
  plan({ note: 'kept, then corrected at Done: stale, no record until planned again', posterior: 'learned', cook: corr, leanHint_s: 0, now_s: due + 1001, surface: 'own' });
  plan({ note: 'kept, corrected, and no surface for the corrected pot', posterior: 'learned', cook: corr, leanHint_s: 0, now_s: due + 1001, surface: 'none' });
  const again = asRanCorrected(corr, learned, surfaceFor('learned', corr, 0, due + 1001, false).surface, due + 1001);
  if (again === null) throw new Error('not planned again');
  plan({ note: 'corrected, planned again on the calibration before this egg: its record from that', posterior: 'learned', cook: again, leanHint_s: 0, now_s: due + 1002, surface: 'none' });
}

{
  // Corrections at Done and in the grace. Last, so no case before them moves.
  const learned = calibrationOf(named('learned'));
  // Done on the counter, then the cooling corrected to ice a minute on:
  // Done kept, the ice bath ended by the correction; ten minutes on, the
  // counted time.
  const counter = cookOf({ startMode: 'hot', cooling: 'counter' });
  const cp = replan(counter, learned, null, 0, S + 1);
  const cEnd = cp.deadlines.cookEnd_s;
  const out = withEvents(counter, withOut(counter, cp, cEnd + 2).events);
  plan({ note: 'done on the counter, then ice a minute after the out: Done kept, the ice bath to the correction', posterior: 'learned', cook: corrected(out, { ...counter.choices, cooling: 'ice' }, cEnd + 62), leanHint_s: 0, now_s: cEnd + 63, surface: 'own', dues: [cEnd + 64, cEnd + 900] });
  plan({ note: 'done on the counter, then running water ten minutes on: the counted time, written down', posterior: 'learned', cook: corrected(out, { ...counter.choices, cooling: 'tap' }, cEnd + 602), leanHint_s: 0, now_s: cEnd + 603, surface: 'own', dues: [cEnd + 603] });
  // An ended ice bath, then a lighter egg: never longer than counted.
  const ice = cookOf({ startMode: 'hot' });
  const ip = replan(ice, learned, null, 0, S + 1);
  const iOut = withEvents(ice, withOut(ice, ip, ip.deadlines.cookEnd_s + 2).events);
  const iCool = replan(iOut, learned, null, 0, ip.deadlines.cookEnd_s + 3);
  const iDone = withEvents(iOut, eventsDue(iOut, iCool, (iCool.deadlines.coolEnd_s as number) + 1));
  plan({ note: 'the ice bath ended, then a much lighter egg: the cooling as it ran', posterior: 'learned', cook: corrected(iDone, { ...ice.choices, mass_kg: 0.04 }, (iCool.deadlines.coolEnd_s as number) + 30), leanHint_s: 0, now_s: (iCool.deadlines.coolEnd_s as number) + 31, surface: 'own' });
  // A correction in the grace. A lighter egg leaves the pull due:
  // the pull that rang, held, its grace's end kept. A heavier one moves it
  // past the correction: the ring undone. Back to cold, unwatched: heating.
  const h = cookOf({ startMode: 'hot' }, -7);
  const hp = replan(h, learned, null, 0, S + 1);
  const hEnd = hp.deadlines.cookEnd_s;
  const rung = withEvents(h, eventsDue(h, hp, hEnd + 1));
  plan({ note: 'the pull rang, then a lighter egg in the grace: the pull held, its grace kept', posterior: 'learned', cook: corrected(rung, { ...h.choices, mass_kg: 0.048 }, hEnd + 15), leanHint_s: 0, now_s: hEnd + 15, surface: 'own', dues: [hEnd + 16, hEnd + PULL_GRACE_SECONDS] });
  plan({ note: 'the pull rang, then a heavier egg in the grace: the ring undone, the pull later', posterior: 'learned', cook: corrected(rung, { ...h.choices, mass_kg: 0.076 }, hEnd + 15), leanHint_s: 0, now_s: hEnd + 15, surface: 'own', dues: [hEnd + 16] });
  plan({ note: 'the pull rang, then corrected to cold: heating, the ring undone', posterior: 'learned', cook: corrected(rung, { ...h.choices, startMode: 'cold' }, hEnd + 15), leanHint_s: 0, now_s: hEnd + 15, surface: 'own', dues: [hEnd + 16] });
  plan({ note: 'the pull rang, then the start a minute earlier: still due, the pull held', posterior: 'learned', cook: startCorrected(rung, S - 60, hEnd + 10) as RunningCook, leanHint_s: 0, now_s: hEnd + 10, surface: 'own', dues: [hEnd + 11] });
}

{
  // The slow hob's moment, as both apps' tick reads it (`slowHobDue`): due
  // only once the clock is past it. After every case above, so none moves.
  // At the moment itself the plan is the one already made; that is held by
  // each core's own tests, since the two cores' moments may differ in the
  // last bits.
  const learned = calibrationOf(named('learned'));
  const c0 = cookOf({}, 6);
  const at = replan(c0, learned, null, 0, S + 60).slowHobAt_s as number;
  const next = replan(c0, learned, null, 0, at + 1).slowHobAt_s as number;
  plan({ note: 'cold, heating: the slow hob\'s moment not yet come, then past', posterior: 'learned', cook: c0, leanHint_s: 0, now_s: S + 60, surface: 'none', hobDue: [S + 61, at - 0.5, at + 0.5, at + 3000] });
  plan({ note: 'cold, heating, a second past the slow hob\'s moment: lengthened, and its next moment not yet come, then past', posterior: 'learned', cook: c0, leanHint_s: 0, now_s: at + 1, surface: 'none', hobDue: [at + 1, next - 0.5, next + 0.5] });
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
  remember('no pans remembered: the default time', withBoil(corrected(startCook(START_S, { ...BASE_CHOICES, startMode: 'hot' }, 0, {}, 'metric', 'en'), BASE_CHOICES, S + 470), S + 900));
  const t = withBoil(cold, S + 500);
  const stray = corrected(corrected(t, { ...cold.choices, startMode: 'hot' }, S + 600), cold.choices, S + 610);
  remember('a tap, then a stray cold -> hot -> cold: still remembered', stray);
  remember('a stray cold -> hot -> cold past the time this water takes, then a tap: not remembered', withBoil(corrected(corrected(cold, { ...cold.choices, startMode: 'hot' }, S + 500), cold.choices, S + 510), S + 600));
  remember('the start corrected ten minutes earlier, a tap, then a stray: not remembered', corrected(corrected(withBoil(startCorrected(cold, S - 600, S + 10) as RunningCook, S + 500), { ...cold.choices, startMode: 'hot' }, S + 600), cold.choices, S + 610));
}

/** Every running cook in the fixture as the apps store it: what was fixed at
 *  the press, the start and the log. The cook as it stands is the log
 *  folded, and a reader folds it again (`foldCook`). */
function stored(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stored);
  if (node === null || typeof node !== 'object') return node;
  const o = node as Record<string, unknown>;
  const isCook = 'id_ms' in o && 'start' in o && 'log' in o;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (isCook && (k === 'startedAt_s' || k === 'choices' || k === 'events' || k === 'correctedAt_s' || k === 'asRan')) continue;
    out[k] = stored(v);
  }
  return out;
}

export const runningFixture = stored({
  about: 'A running cook: its egg and pot, the moves the cook makes, the plan derived from it, and the phase at every boundary. src/core/running.ts.',
  constants: {
    slowHobWhenLeft_s: SLOW_HOB_WHEN_LEFT_S, slowHobExtra_s: SLOW_HOB_EXTRA_S, slowHobEvery_s: SLOW_HOB_EVERY_S,
    slowHobMaxSteps: SLOW_HOB_MAX_STEPS, pullGrace_s: PULL_GRACE_SECONDS, restoreWindow_s: RESTORE_WINDOW_S,
  },
  setups: setups,
  moves: moves,
  plans: plans,
  remembers: remembers.map((r) => ({ note: r.note, cook: r.cook, boil: boilToRemember(r.cook) })),
  phase: {
    coolingSeconds: COOLING_SECONDS,
    pullGraceSeconds: PULL_GRACE_SECONDS,
    slowHob: { whenLeft_s: SLOW_HOB_WHEN_LEFT_S, extra_s: SLOW_HOB_EXTRA_S, every_s: SLOW_HOB_EVERY_S },
    /* Two timelines from the same cook, differing only in whether there is a
     * cooling step to time. The counter one matters most: with no cooling
     * deadline, a port could fall from COOKING straight to DONE and never show
     * the pull at all. Sampled either side of every boundary. */
    timelines: [
      { name: 'ice bath', cookEnd_s: 600, coolEnd_s: 600 + PULL_GRACE_SECONDS + COOLING_SECONDS, outAt_s: null },
      { name: 'counter rest', cookEnd_s: 600, coolEnd_s: null, outAt_s: null },
      // The cook tapped the eggs out 5 s into the grace: the cooling is timed
      // from the tap.
      { name: 'ice bath, out at the tap', cookEnd_s: 600, coolEnd_s: 605 + COOLING_SECONDS, outAt_s: 605 },
      { name: 'counter rest, out at the tap', cookEnd_s: 600, coolEnd_s: null, outAt_s: 605 },
    ].map((t) => ({
      name: t.name,
      cookEnd_s: t.cookEnd_s,
      coolEnd_s: t.coolEnd_s,
      outAt_s: t.outAt_s,
      samples: [
        0, 1, 599, 599.999, 600, 600.001, 604.999, 605, 605.001, 619, 619.999, 620, 620.001,
        700, 784.999, 785, 799, 799.999, 800, 800.001, 10000,
      ].map((now_s) => ({
        now_s: now_s,
        provisional: phaseAt(
          { cookEnd_s: t.cookEnd_s, coolEnd_s: t.coolEnd_s, provisional: true, outAt_s: t.outAt_s }, now_s,
        ),
        phase: phaseAt(
          { cookEnd_s: t.cookEnd_s, coolEnd_s: t.coolEnd_s, provisional: false, outAt_s: t.outAt_s }, now_s,
        ),
        // A question open about a pull the clock assumed: never Done.
        asking: phaseAt(
          { cookEnd_s: t.cookEnd_s, coolEnd_s: t.coolEnd_s, provisional: false, outAt_s: t.outAt_s, asking: true },
          now_s,
        ),
      })),
    })),
  },
}) as Record<string, unknown[]> & { setups: unknown[]; moves: unknown[] };
