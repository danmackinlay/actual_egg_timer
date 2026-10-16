/**
 * The cook as it ran: the plan kept from the pull on (`CookAsRan`), what Done
 * shows from it, the facts the record is made of, and what a cook leaves when
 * it ends. A running cook and its plan are running.ts's; this reads them, and
 * changes the cook only by an entry in its log (`appendEntry`).
 *
 * Pure, like the rest of `src/core/`, and `AsRan.swift` is held to it by
 * `fixtures/running.json` and `fixtures/step.json`.
 */

import { type ModelParams, type Solution, simulate } from './solve.ts';
import type { WhiteReport, YolkWord } from './infer.ts';
import type { AppName, Calibration, CookFacts, Forecast, ProbeReading } from './record.ts';
import {
  type BoilToRemember, type CookPlan, type CookSurface, type RunningCook, appendEntry, asksIfStillIn, boilRemembered,
  boilTapCounts, boilToRemember, phaseAt, replan,
} from './running.ts';

/**
 * The plan as the cook ran: what the record says was said for this egg, and
 * what Done shows, kept with the cook so that no later plan moves them - a
 * reload with no surface yet, or a posterior that has since folded this egg's
 * own answer. Taken from the first plan on the pot's surface made once the
 * egg is pulled (`keepAsRan`), and replaced only by a correction, planned on
 * the calibration before this egg (`asRanCorrected`). Never
 * taken from a plan with no surface. The rest of the record (the pot, the
 * pull, the cooling) does not depend on the calibration once the egg is out,
 * and is the plan's.
 */
export interface CookAsRan {
  /** The cook's `correctedAt_s` when it was taken: one taken before the last
   *  correction, of the start or the choices, is stale (`asRanCurrent`). */
  correctedAt_s: number | null;
  /** The level it ran at, its cook time and the nudge in it, and what the
   *  app said for it: the record's `level`, `recommended_s`, `nudge_s` and
   *  `forecast`. */
  level: number;
  cook_s: number;
  nudge_s: number;
  forecast: Forecast;
  /** The peak yolk shown ("You asked for: jammy, peak yolk 65 C"), and
   *  whether the cooling ends at it, which offers the probe at Done. */
  peakYolk_C: number;
  probeMoment: boolean;
  /** The model's parameters it was planned under, so Done draws the egg, and
   *  bounds a probe reading, as it ran (`createSection`,
   *  `plausibleProbeRange_C`). */
  params: ModelParams;
}

/** The plan as it ran, from `plan`: null unless the cook is pulled, `plan`
 *  is on its pot's surface (`decided`), and it is a plan of the cook as
 *  pulled, its cook time the pull's to the bit - as every plan made after the
 *  pull is, and the one that rang, made before it, is not quite. */
function asRanOf(cook: RunningCook, plan: CookPlan): CookAsRan | null {
  const pulled = cook.events.pulled;
  if (pulled === null || plan.decided === null || plan.forecast === null || plan.inputs === null) return null;
  if (plan.cookTime_s !== pulled.due_s - cook.startedAt_s) return null;
  return {
    correctedAt_s: cook.correctedAt_s, level: plan.answer.level, cook_s: plan.cookTime_s, nudge_s: plan.nudge_s,
    forecast: plan.forecast, peakYolk_C: plan.solution.result.peakYolk_C, probeMoment: plan.probeMoment,
    params: plan.inputs.params,
  };
}

/**
 * The cook with the plan as it ran kept: taken from `plan` the first time
 * the cook is pulled and `plan`, a plan of the cook as pulled, is on the
 * pot's surface. The app passes every plan it takes up through this (the
 * plan after `eventsDue` or the cook's tap writes the pull, after a surface
 * lands, at a reload) and writes the cook down when it comes back changed (a
 * new object). Otherwise - not pulled, no surface yet, or already kept - the
 * cook as it was: a kept one is replaced only by `asRanCorrected`.
 *
 * Kept before any answer is folded, it is planned on the calibration before
 * this egg; an app must not keep one, or make a record, from a plan made
 * after this egg's own answer was folded, which would score the model
 * against what it already learned from the egg: it holds the answer until the surface lands.
 */
export function keepAsRan(cook: RunningCook, plan: CookPlan): RunningCook {
  if (cook.asRan !== null || cook.events.pulled === null) return cook;
  const asRan = asRanOf(cook, plan);
  return asRan === null ? cook : appendEntry(cook, { kind: 'ran', asRan: asRan });
}

/** Whether the cook's plan as it ran is kept and still its own: taken since
 *  the last correction of its start or choices (each stamps `correctedAt_s`
 *  with its own moment). */
export function asRanCurrent(cook: RunningCook): boolean {
  return cook.asRan !== null && cook.events.pulled !== null && cook.asRan.correctedAt_s === cook.correctedAt_s;
}

/**
 * What Done shows for the cook: the plan as it ran, kept with the cook, so a
 * relaunch, a surface landing or this egg's own answer folded never moves
 * "You asked for", the peak yolk, the egg drawn or the probe's field; until
 * it is kept, the same from `plan` when that is on its surface; otherwise
 * null, and Done shows `plan` as it is - no surface yet, or a correction
 * since, until `asRanCorrected` has planned it.
 */
export function asRanShown(cook: RunningCook, plan: CookPlan): CookAsRan | null {
  if (cook.asRan !== null) return asRanCurrent(cook) ? cook.asRan : null;
  return asRanOf(cook, plan);
}

/**
 * The solve as the cook ran, for what Done says of the egg beside the peak
 * (the texture note under the slider): the plan's egg and pot at the cook
 * time that ran, on the model's parameters it ran under (`ran`,
 * `asRanShown`'s), so a plan made since on a posterior that has folded this
 * egg's own answer never moves it. `plan.solution` itself when the plan is
 * on those parameters at that time, as before any fold; otherwise one
 * simulation. Its peak yolk is `ran.peakYolk_C` to the bit.
 */
export function solutionAsRan(plan: CookPlan, ran: CookAsRan): Solution {
  const p = plan.inputs === null ? null : plan.inputs.params;
  if (p !== null && p.alpha_m2s === ran.params.alpha_m2s && plan.cookTime_s === ran.cook_s) {
    return plan.solution;
  }
  return { ...plan.solution, result: simulate(plan.egg, plan.setup, ran.params, ran.cook_s) };
}

/**
 * A correction after the pull, as it ran, never from its own outcome: the
 * corrected cook planned on
 * `before`, the calibration before this egg - the fold's own starting point
 * once the egg is answered, the calibration as it stands while it is not -
 * on `surface`, that calibration's surface for the corrected pot, and its
 * plan as it ran kept in place of the stale one. Null while `surface` is not
 * that pot's: the app plans `replan(cook, before, null, 0, now_s)`, builds
 * the surface its `inputs` ask for on `before`, and asks again. Before the
 * pull, the cook as it was: nothing has run yet.
 */
export function asRanCorrected(
  cook: RunningCook, before: Calibration, surface: CookSurface | null, now_s: number,
): RunningCook | null {
  if (cook.events.pulled === null) return cook;
  const asRan = asRanOf(cook, replan(cook, before, surface, 0, now_s));
  return asRan === null ? null : appendEntry(cook, { kind: 'ran', asRan: asRan });
}

/* ------------------------------------------------------------ the record */

/** What an app adds to a cook's facts: which app and build wrote the
 *  record, the population the prior came from, the local day the cook
 *  started (`startedAt_s`, as corrected, in the app's time zone) and the
 *  record's id - the web's `id_ms`, none on iOS. */
export interface RecordContext {
  app: AppName;
  appVersion: string;
  prior: string;
  day: string;
  id: number | null;
}

/** Why `cookFactsFor` made no facts:
 *  - 'noSurface': no plan as it ran is kept and `plan` is not on its pot's
 *    surface, so nothing says what the app said for this egg. The app plans
 *    on the surface `plan.inputs` asks for - building it if it must, as at a
 *    reload, or for a cook dropped too old before its pull ever planned on
 *    one - passes that plan through `keepAsRan`, and asks again; an answer
 *    is held meanwhile. `plan.inputs` is null only for a guess the slow hob
 *    lengthened, a cook still heating, which is never logged.
 *  - 'stale': the plan as it ran was kept before a correction since: the app
 *    plans the corrected cook on the calibration before this egg
 *    (`asRanCorrected`) and asks again. */
type FactsRefused = 'noSurface' | 'stale';

/** The facts, or why there are none: exactly one of the two is null. */
interface CookFactsResult {
  facts: CookFacts | null;
  refused: FactsRefused | null;
}

/**
 * The facts `recordFor` makes the record of, from the cook as last corrected
 * and its plan, with whichever answers have been given:
 * the egg, the pot with the time to boil in force, the level it ran at, the
 * cook time that ran and the nudge in it, the pull the cook tapped, the
 * cooling as it ran, and what the app said for that cook at that time.
 *
 * The level, cook time, nudge and forecast are the plan as it ran when the
 * cook keeps one (`asRan`), whatever `plan` reads now; otherwise `plan`'s,
 * when it is on its pot's surface. Never from a plan with no surface: no
 * record is made with no forecast, and the result says why (`FactsRefused`)
 * for the app to put right and ask again.
 */
export function cookFactsFor(
  cook: RunningCook, plan: CookPlan, ctx: RecordContext, yolkWord: YolkWord | null, white: WhiteReport | null,
  probe: ProbeReading | null,
): CookFactsResult {
  const kept = cook.asRan;
  if (kept !== null && !asRanCurrent(cook)) return { facts: null, refused: 'stale' };
  let level: number;
  let cook_s: number;
  let nudge_s: number;
  let forecast: Forecast;
  if (kept !== null) {
    level = kept.level;
    cook_s = kept.cook_s;
    nudge_s = kept.nudge_s;
    forecast = kept.forecast;
  } else if (plan.decided !== null && plan.forecast !== null) {
    level = plan.answer.level;
    cook_s = plan.cookTime_s;
    nudge_s = plan.nudge_s;
    forecast = plan.forecast;
  } else {
    return { facts: null, refused: 'noSurface' };
  }
  const pulled = cook.events.pulled;
  return {
    facts: {
      app: ctx.app,
      appVersion: ctx.appVersion,
      prior: ctx.prior,
      day: ctx.day,
      id: ctx.id,
      mass_kg: plan.egg.mass_kg,
      massFrom: cook.choices.massFrom,
      sizeTable: cook.choices.sizeTable,
      setup: plan.setup,
      eggFrom: cook.choices.eggFrom,
      boilRemembered: boilRemembered(cook),
      boilTapped: boilTapCounts(cook),
      level: level,
      cook_s: cook_s,
      nudge_s: nudge_s,
      out_s: pulled !== null && pulled.by === 'cook' ? pulled.out_s - cook.startedAt_s : null,
      cool_s: plan.cool_s,
      yolkWord: yolkWord,
      white: white,
      probe: probe,
      forecast: forecast,
      lang: cook.lang,
      units: cook.units,
    },
    refused: null,
  };
}

/** What a cook leaves when it ends, by Cancel or by Start again: the boil to
 *  remember; whether it was cooked through - Done by `plan` at `now_s`, and
 *  not while the plan asks whether the egg is still in the water - and so is
 *  an egg to log if no answer has logged it; and whether its record must be
 *  made again first: corrected after the pull, its plan as it ran not yet
 *  planned again (`asRanCurrent`), so the egg logged, or the one about to be,
 *  is the uncorrected one. The app makes it (`asRanCorrected` on the
 *  calibration before this egg), logs it in place of any logged under its
 *  id, and only then forgets the cook: the egg is final, and may be sent,
 *  once the cook is forgotten. */
interface CookEnding {
  boil: BoilToRemember | null;
  finished: boolean;
  remake: boolean;
}

export function cookEnding(cook: RunningCook, plan: CookPlan, now_s: number): CookEnding {
  return {
    boil: boilToRemember(cook),
    finished: !asksIfStillIn(plan) && phaseAt(plan.deadlines, now_s) === 'DONE',
    remake: cook.events.pulled !== null && cook.asRan !== null && !asRanCurrent(cook),
  };
}
