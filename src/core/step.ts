/**
 * The running cook as one state machine: `step` takes a cook, one thing that
 * happened to it, and what the app holds, and returns the cook as it now
 * stands, its plan, what it is waiting for, and what the app must do.
 *
 * Each app is then an effect runner: it keeps the state `step` returns, hands
 * it back with the next event, and does the effects - writes the cook down,
 * sets the alarms, rings, logs the egg's record, forgets the cook, sends what
 * is final - and builds what the state needs (a decision surface, the
 * calibration before this egg) off the main thread, telling `step` when it
 * lands. Nothing about the cook is decided anywhere else, so the two apps
 * cannot string the pieces together in different orders.
 *
 * What a step does, whatever the event:
 *
 * 1. THE EVENT. What the cook told the app is checked and logged (running.ts:
 *    `withBoil`, `corrected`, `startCorrected`, `withOut`, `stillIn`,
 *    `pullStands`, an answer, the end); one that does not apply now - the
 *    boil outside Heating, an answer before Done - changes nothing.
 * 2. THE PLAN. The cook is planned (`replan`) on the surface its pot wants,
 *    when the app has it; the events the clock has decided by now are
 *    written (`eventsDue`) and the cook planned again with them; the plan as
 *    it ran is kept once the egg is out and a plan is on its surface
 *    (`keepAsRan`). A tick plans only when something is due: the slow hob's
 *    moment, an event, the cook too old. A plan costs tens of milliseconds.
 * 3. THE RECORD. Once something has been said about the egg, its record is
 *    made (`cookFactsFor`) and logged, and made again when more is said or a
 *    correction after the pull changes it; an answer the record cannot yet
 *    be made for is held in the log until the surface or the calibration
 *    before this egg lands.
 * 4. THE END. Start again, Cancel or too old: the boil to remember, the
 *    alarms cancelled, and the cook kept, ended, until its egg is logged (a
 *    finished egg nobody answered about is still logged, and an answered one
 *    corrected after the pull is logged again first); then it is forgotten,
 *    and what is now final may be sent.
 *
 * The ring follows the log: the pull rings when this step wrote the pull
 * ringing (`rangAt_s`, the first time the clock passed it, or again after the
 * cook said the egg was still in); Done rings when this step finished the egg
 * - the counted cooling written ended, or the egg out on the counter - unless
 * the pull rang in the same step (a phone woken past the cooling rings the
 * pull, not Done). The ring stops when the cook took the egg out, said the
 * pull stands, or a correction undid the ring.
 *
 * Pure, like the rest of `src/core/`: times are the events' own, epoch
 * seconds. `Step.swift` is held to it by the traces in `fixtures/step.json`.
 */

import { AlarmMoment } from './sounds.js';
import { BoilMemory } from './boil.js';
import { DecisionInputs, inputsKey } from './decide.js';
import { WhiteReport, YolkWord } from './infer.js';
import { AppName, Calibration, EggRecord, ProbeReading, Units, recordFor } from './record.js';
import {
  BoilToRemember, CookChoices, CookEntry, CookPlan, CookSurface, PULL_GRACE_SECONDS, RunningCook, answered,
  answersLogged, answersOf, appendEntry, asRanCorrected, asRanCurrent, asksIfStillIn, cookEnding, cookFactsFor,
  cookTooOld, corrected, endedAt_s, eventsDue, keepAsRan, phaseAt, pullStands, replan, sameChoices, sameEvents,
  slowHobDue, startCook, startCorrected, stillIn, withBoil, withOut, writeEvents,
} from './running.js';

/** What happened to the cook, at `now_s`. Cancel is `startAgain`. A reload
 *  or a relaunch is a `tick` on a stored cook with no plan yet. */
export type CookEvent =
  | {
    kind: 'start'; now_s: number; choices: CookChoices; nudge_s: number; boilMemory: BoilMemory; units: Units;
    lang: string; leanHint_s: number;
  }
  | { kind: 'boil'; now_s: number }
  | { kind: 'correct'; now_s: number; choices: CookChoices }
  | { kind: 'correctStart'; now_s: number; startedAt_s: number }
  | { kind: 'out'; now_s: number }
  | { kind: 'stillIn'; now_s: number }
  | { kind: 'pullStands'; now_s: number }
  | { kind: 'tick'; now_s: number }
  | { kind: 'surfaceLanded'; now_s: number }
  | { kind: 'answered'; now_s: number; yolkWord: YolkWord | null; white: WhiteReport | null; probe: ProbeReading | null }
  | { kind: 'startAgain'; now_s: number };

/** What the app keeps between steps, and stores (the cook and the lean). */
export interface CookState {
  /** The running cook, or one ended whose egg is not yet logged; null while
   *  idle. */
  cook: RunningCook | null;
  /** Its plan, as the last step made it; null before the first. */
  plan: CookPlan | null;
  /** The lean last decided, s: the interim time's lean while a new pot's
   *  surface is built. A cache, never truth. */
  leanHint_s: number;
}

/** The calibration before this egg, and the surfaces built on it: what a
 *  record corrected after the pull is planned on, never a posterior that has
 *  folded this egg's own answer. */
export interface CookBefore {
  calibration: Calibration;
  surfaces: CookSurface[];
}

/** What the app holds for a step. */
export interface CookEnv {
  /** The calibration as it stands, and the surfaces built on it, any pots:
   *  the plan reads the one for its pot. */
  calibration: Calibration;
  surfaces: CookSurface[];
  /** The calibration before this egg, once `need.before` has asked for it. */
  before: CookBefore | null;
  /** For the record: which app and build, the population of the prior, and
   *  the local day the cook started (as corrected) in the app's time zone.
   *  The web's record carries the cook's id, iOS's none. */
  app: AppName;
  appVersion: string;
  prior: string;
  day: string;
}

/** What the state is waiting for. */
export interface CookNeed {
  /** The surface the plan's pot wants, with its odds profile, on the
   *  calibration as it stands: built, then `surfaceLanded`. */
  surface: DecisionInputs | null;
  /** The calibration before this egg: given in `env.before` from then on. */
  before: boolean;
  /** The surface on the calibration before this egg for the corrected pot:
   *  built, then `surfaceLanded`. */
  beforeSurface: DecisionInputs | null;
  /** The next moment the clock decides something - the slow hob, the pull,
   *  the grace's end, the cooling's end, too old - so the app ticks then at
   *  the latest; null when nothing is to come. */
  wakeAt_s: number | null;
}

/** What the app must do. */
export type CookEffect =
  /** Write the cook and the lean down. */
  | { kind: 'persist' }
  /** Hold these alarms and no others: the pull's and the cooling's end, each
   *  null for none. */
  | { kind: 'alarms'; pull_s: number | null; cooled_s: number | null }
  /** Ring now. */
  | { kind: 'ring'; moment: AlarmMoment }
  /** Stop a ring sounding. */
  | { kind: 'silence' }
  /** Teach the boil memory this pan's time to a rolling boil. */
  | { kind: 'rememberBoil'; boil: BoilToRemember }
  /** Log the egg's record, in place of any logged under its id when
   *  `replaces`, and learn from it. */
  | { kind: 'log'; record: EggRecord; replaces: boolean }
  /** Forget the stored cook: its egg is final. */
  | { kind: 'forget' }
  /** Send what is now final, if sharing is on. */
  | { kind: 'sendFinal' };

/** What a step returns: the state to keep, and to hand to the next. */
export interface CookStep extends CookState {
  need: CookNeed;
  effects: CookEffect[];
}

const NO_NEED: CookNeed = { surface: null, before: false, beforeSurface: null, wakeAt_s: null };

/** The surface in `surfaces` for these inputs, or null. */
export function surfaceFor(surfaces: CookSurface[], inputs: DecisionInputs | null): CookSurface | null {
  if (inputs === null) return null;
  const key = inputsKey(inputs);
  for (let i = 0; i < surfaces.length; i++) if (inputsKey(surfaces[i].inputs) === key) return surfaces[i];
  return null;
}

/** The cook planned at `now_s` on the surface its pot wants, as far as the
 *  app has it: on the one the last plan wanted, and again on another if this
 *  plan wants one that is in (a pot is known only once planned, since the
 *  slow hob's ramp is found by solving). The slow hob's rule starts where
 *  the last plan got to. */
function planOn(
  cook: RunningCook, c: Calibration, surfaces: CookSurface[], lean: number, now_s: number, last: CookPlan | null,
): CookPlan {
  const memo = last === null ? null : last.memo;
  let plan = replan(cook, c, surfaceFor(surfaces, last === null ? null : last.inputs), lean, now_s, memo);
  if (plan.inputs !== null && plan.decided === null) {
    const s = surfaceFor(surfaces, plan.inputs);
    if (s !== null) plan = replan(cook, c, s, lean, now_s, memo);
  }
  return plan;
}

/** The alarms a cook's plan sets: the pull while it is still to ring, and
 *  the cooling's end while it is still to come; none while the plan asks
 *  whether the egg is still in, nor once the cook has ended. */
function alarmsOf(cook: RunningCook | null, plan: CookPlan | null): Alarms {
  if (cook === null || plan === null || endedAt_s(cook) !== null || asksIfStillIn(plan)) {
    return { pull_s: null, cooled_s: null };
  }
  const e = cook.events;
  const d = plan.deadlines;
  return {
    pull_s: e.pulled === null && e.rangAt_s === null ? d.cookEnd_s : null,
    cooled_s: e.cooledAt_s === null && d.coolEnd_s !== null ? d.coolEnd_s : null,
  };
}

/** Whether the cook is Done by its events: out, and on the counter or its
 *  counted cooling ended. */
function doneByEvents(cook: RunningCook): boolean {
  const e = cook.events;
  return e.pulled !== null && (cook.choices.cooling === 'counter' || e.cooledAt_s !== null);
}

/** The next moment the clock decides something for this cook, after
 *  `now_s`, or null. */
function wakeAt(cook: RunningCook, plan: CookPlan, now_s: number): number | null {
  const times: number[] = [plan.tooOldAt_s];
  if (plan.slowHobAt_s !== null) times.push(plan.slowHobAt_s);
  const e = cook.events;
  const d = plan.deadlines;
  if (!asksIfStillIn(plan)) {
    if (!d.provisional && e.pulled === null) {
      if (e.rangAt_s === null) times.push(d.cookEnd_s);
      times.push(d.cookEnd_s + PULL_GRACE_SECONDS);
    }
    if (e.cooledAt_s === null && d.coolEnd_s !== null) times.push(d.coolEnd_s);
  }
  let next: number | null = null;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (t > now_s && (next === null || t < next)) next = t;
  }
  return next;
}

/** The last place in the log an entry of `kind` is, or -1. */
function lastIndexOf(cook: RunningCook, kind: CookEntry['kind']): number {
  for (let i = cook.log.length - 1; i >= 0; i--) if (cook.log[i].kind === kind) return i;
  return -1;
}

/** Whether the egg's record is to be logged now: something has been said
 *  about it, or it finished unanswered (`unanswered`), and it has not been
 *  logged; or since it was logged, more was said or the plan as it ran was
 *  made again for a correction. */
function recordDue(cook: RunningCook, unanswered: boolean): boolean {
  const logged = lastIndexOf(cook, 'logged');
  if (logged < 0) return answered(cook) || unanswered;
  return lastIndexOf(cook, 'answered') > logged || lastIndexOf(cook, 'ran') > logged;
}

/** Whether the plan as it ran is kept but stale: corrected after the pull,
 *  and not yet made again (`asRanCorrected`). */
function asRanStale(cook: RunningCook): boolean {
  return cook.events.pulled !== null && cook.asRan !== null && !asRanCurrent(cook);
}

/** Where a step has got to: the cook, its plan, what it wants and what it
 *  has asked the app to do. `plannedFor` is the cook `plan` was made for at
 *  this step's moment on these surfaces, so it need not be made again. */
interface Work {
  cook: RunningCook;
  plan: CookPlan;
  plannedFor: RunningCook | null;
  lean: number;
  need: CookNeed;
  effects: CookEffect[];
}

/**
 * The plan as it ran made again for a correction after the pull, on the
 * calibration before this egg, when it is in (`asRanCorrected`). Until then,
 * what is wanted for it.
 */
function remakeAsRan(w: Work, env: CookEnv, now_s: number): void {
  const cook = w.cook;
  if (!asRanStale(cook)) return;
  if (env.before === null) {
    w.need = { ...w.need, before: true };
    return;
  }
  const inputs = replan(cook, env.before.calibration, null, 0, now_s).inputs;
  const s = surfaceFor(env.before.surfaces, inputs);
  const next = s === null ? null : asRanCorrected(cook, env.before.calibration, s, now_s);
  if (next === null) {
    w.need = { ...w.need, beforeSurface: inputs };
    return;
  }
  w.cook = next;
}

/**
 * The egg's record, logged when it is due (`recordDue`): made from the plan
 * as it ran, or a plan on the pot's surface, with everything said so far.
 * When it cannot be made yet, what it waits for is wanted, and the answers
 * stay in the log until it lands. Whether nothing is left to log.
 */
function logRecord(w: Work, env: CookEnv, now_s: number, unanswered: boolean): boolean {
  remakeAsRan(w, env, now_s);
  if (asRanStale(w.cook)) return false;
  if (!recordDue(w.cook, unanswered)) return true;
  const said = answersOf(w.cook);
  const ctx = {
    app: env.app, appVersion: env.appVersion, prior: env.prior, day: env.day,
    id: env.app === 'web' ? w.cook.id_ms : null,
  };
  const made = cookFactsFor(w.cook, w.plan, ctx, said.yolkWord, said.white, said.probe);
  if (made.facts === null) {
    if (w.plan.inputs !== null) w.need = { ...w.need, surface: w.plan.inputs };
    return false;
  }
  w.effects.push({ kind: 'log', record: recordFor(made.facts), replaces: answersLogged(w.cook) !== null });
  w.cook = appendEntry(w.cook, { kind: 'logged', at_s: now_s });
  return true;
}

/** Whether a tick at `now_s` has anything to decide for a running cook with
 *  this plan: an event the clock writes, the slow hob's next lengthening, or
 *  the cook too old. A tick when it has not leaves the state as it is; an app
 *  may ask first, and not step at all. */
export function tickDue(cook: RunningCook, plan: CookPlan, now_s: number): boolean {
  return slowHobDue(plan, now_s) || cookTooOld(plan, now_s) || !sameEvents(eventsDue(cook, plan, now_s), cook.events);
}

/** Whether `b` is the cook `a` was: a cook moves only by an entry appended
 *  to its log (`appendEntry`), so the same log length is the same cook, and a
 *  move that changes nothing appends nothing. */
function sameCook(a: RunningCook | null, b: RunningCook): boolean {
  return a !== null && a.log.length === b.log.length;
}

/** Plan the cook at `now_s`, write what the clock decided, keep the plan as
 *  it ran, and carry the lean it decided. */
function settle(w: Work, env: CookEnv, now_s: number, last: CookPlan | null): void {
  let plan = sameCook(w.plannedFor, w.cook) ? w.plan : planOn(w.cook, env.calibration, env.surfaces, w.lean, now_s, last);
  if (endedAt_s(w.cook) === null) {
    const due = eventsDue(w.cook, plan, now_s);
    if (!sameEvents(due, w.cook.events)) {
      w.cook = writeEvents(w.cook, due);
      plan = planOn(w.cook, env.calibration, env.surfaces, w.lean, now_s, plan);
    }
  }
  w.cook = keepAsRan(w.cook, plan);
  w.plan = plan;
  w.plannedFor = null;
  if (plan.decided !== null) w.lean = plan.lean_s;
  const s = surfaceFor(env.surfaces, plan.inputs);
  if (plan.inputs !== null && (s === null || s.profile === null)) w.need = { ...w.need, surface: plan.inputs };
}

/** The cook ended at `now_s`: the boil to remember, a ring stopped, and the
 *  end logged, the egg's record to come. */
function endCook(w: Work, now_s: number): void {
  const ending = cookEnding(w.cook, w.plan, now_s);
  if (ending.boil !== null) w.effects.push({ kind: 'rememberBoil', boil: ending.boil });
  w.effects.push({ kind: 'silence' });
  w.cook = appendEntry(w.cook, { kind: 'ended', at_s: now_s });
}

/** An ended cook: its egg logged if it was finished, or logged again if it
 *  was answered and corrected after the pull; then forgotten. Whether it
 *  is. */
function finishEnded(w: Work, env: CookEnv, now_s: number): boolean {
  const at = endedAt_s(w.cook);
  if (at === null) return false;
  const finished = cookEnding(w.cook, w.plan, at).finished;
  if (answersLogged(w.cook) !== null || finished) {
    if (!logRecord(w, env, now_s, finished)) return false;
  }
  w.effects.push({ kind: 'forget' });
  w.effects.push({ kind: 'sendFinal' });
  return true;
}

/** The alarms a cook's plan sets. */
interface Alarms {
  pull_s: number | null;
  cooled_s: number | null;
}

/** Whether two sets of alarms are the same. */
function sameAlarms(a: Alarms, b: Alarms): boolean {
  return a.pull_s === b.pull_s && a.cooled_s === b.cooled_s;
}

/** The state unchanged, with what it still needs. */
function quiet(state: CookState, env: CookEnv, now_s: number): CookStep {
  if (state.cook === null || state.plan === null) return { ...state, need: NO_NEED, effects: [] };
  const s = surfaceFor(env.surfaces, state.plan.inputs);
  const surface = state.plan.inputs !== null && (s === null || s.profile === null) ? state.plan.inputs : null;
  const wake = endedAt_s(state.cook) === null ? wakeAt(state.cook, state.plan, now_s) : null;
  return { ...state, need: { ...NO_NEED, surface: surface, wakeAt_s: wake }, effects: [] };
}

/**
 * One step of a cook (above). `state` is what the last step returned, or, at
 * a reload, the stored cook and lean with no plan. A `start` while a cook is
 * held changes nothing: an ended cook still waiting on its record is a state
 * of its own, which the app may keep stepping beside a new one.
 */
export function step(state: CookState, event: CookEvent, env: CookEnv): CookStep {
  const now_s = event.now_s;
  if (event.kind === 'start') {
    if (state.cook !== null) return quiet(state, env, now_s);
    const cook = startCook(now_s, event.choices, event.nudge_s, event.boilMemory, event.units, event.lang);
    const first = planOn(cook, env.calibration, env.surfaces, event.leanHint_s, now_s, null);
    const w: Work = { cook: cook, plan: first, plannedFor: cook, lean: event.leanHint_s, need: NO_NEED, effects: [] };
    return finish({ cook: null, plan: null, leanHint_s: event.leanHint_s }, w, env, now_s);
  }
  const held = state.cook;
  if (held === null) return quiet(state, env, now_s);
  const last = state.plan;
  const plan = last !== null ? last : planOn(held, env.calibration, env.surfaces, state.leanHint_s, now_s, null);
  const w: Work = {
    cook: held, plan: plan, plannedFor: last === null ? held : null, lean: state.leanHint_s, need: NO_NEED,
    effects: [],
  };
  const ended = endedAt_s(held) !== null;
  const phase = asksIfStillIn(plan) ? 'ASKING' : phaseAt(plan.deadlines, now_s);

  switch (event.kind) {
    case 'tick':
      // Nothing due: the plan stands.
      if (last !== null && (ended || !tickDue(held, last, now_s))) {
        return quiet(state, env, now_s);
      }
      break;
    case 'surfaceLanded':
      break;
    case 'boil':
      if (!ended && phase === 'HEATING') w.cook = withBoil(held, now_s);
      break;
    case 'correct':
      // After the pull the yolk wanted only previews (DECISIONS.md 98): a
      // change of it alone corrects nothing.
      if (!ended && !sameChoices(event.choices, held.choices)
        && !(held.events.pulled !== null && sameChoices({ ...event.choices, level: held.choices.level }, held.choices))) {
        w.cook = corrected(held, event.choices, now_s);
        // An egg answered about came out: a pull the clock assumed stands.
        if (answered(held)) w.cook = pullStands(w.cook);
      }
      break;
    case 'correctStart':
      if (!ended && event.startedAt_s !== held.startedAt_s) {
        w.cook = startCorrected(held, event.startedAt_s, now_s) ?? held;
        if (!sameCook(held, w.cook) && answered(held)) w.cook = pullStands(w.cook);
      }
      break;
    case 'out':
      if (!ended) {
        w.cook = withOut(held, plan, now_s);
        if (!sameCook(held, w.cook)) w.effects.push({ kind: 'silence' });
      }
      break;
    case 'stillIn':
      if (!ended && phase === 'ASKING') w.cook = stillIn(held, now_s);
      break;
    case 'pullStands':
      if (!ended && phase === 'ASKING') {
        w.cook = pullStands(held);
        w.effects.push({ kind: 'silence' });
      }
      break;
    case 'answered': {
      if (ended || phase !== 'DONE') return quiet(state, env, now_s);
      // Each question is answered once: the first word given is the one kept.
      const said = answersOf(held);
      const yolk = said.yolkWord === null ? event.yolkWord : null;
      const white = said.white === null ? event.white : null;
      const probe = said.probe === null ? event.probe : null;
      if (yolk === null && white === null && probe === null) return quiet(state, env, now_s);
      w.cook = appendEntry(held, { kind: 'answered', at_s: now_s, yolkWord: yolk, white: white, probe: probe });
      break;
    }
    case 'startAgain':
      if (!ended) endCook(w, now_s);
      break;
  }
  return finish(state, w, env, now_s);
}

/** The step's work settled: the plan, the record, the end, the ring and the
 *  alarms, and what the cook is waiting for. */
function finish(state: CookState, w: Work, env: CookEnv, now_s: number): CookStep {
  const was = state.cook;
  let alarmsBefore = state.plan === null ? null : alarmsOf(was, state.plan);
  settle(w, env, now_s, state.plan ?? w.plan);
  if (endedAt_s(w.cook) === null && cookTooOld(w.plan, now_s)) endCook(w, now_s);

  if (endedAt_s(w.cook) !== null) {
    // Ended: no alarm is left, whatever the record still waits for.
    if (alarmsBefore === null || alarmsBefore.pull_s !== null || alarmsBefore.cooled_s !== null) {
      w.effects.push({ kind: 'alarms', pull_s: null, cooled_s: null });
    }
    alarmsBefore = { pull_s: null, cooled_s: null };
    if (finishEnded(w, env, now_s)) return { cook: null, plan: null, leanHint_s: 0, need: NO_NEED, effects: w.effects };
  } else {
    // A correction after the pull: the plan as it ran made again on the
    // calibration before this egg, and the record with it if it is logged.
    remakeAsRan(w, env, now_s);
    if (recordDue(w.cook, false)) logRecord(w, env, now_s, false);

    // The ring, from what this step wrote.
    const before = was === null ? null : was.events;
    const after = w.cook.events;
    const asking = asksIfStillIn(w.plan);
    const rangNow = !asking && after.rangAt_s !== null && (before === null || before.rangAt_s !== after.rangAt_s)
      && (after.pulled === null || after.pulled.by === 'timeout');
    if (rangNow) w.effects.push({ kind: 'ring', moment: 'pull' });
    if (!rangNow && !asking && doneByEvents(w.cook) && (was === null || !doneByEvents(was))) {
      w.effects.push({ kind: 'ring', moment: 'cooled' });
    }
    if (before !== null && before.rangAt_s !== null && after.rangAt_s === null && after.pulled === null) {
      w.effects.push({ kind: 'silence' });
    }
  }

  const alarms = alarmsOf(w.cook, w.plan);
  if (alarmsBefore === null || !sameAlarms(alarms, alarmsBefore)) {
    w.effects.push({ kind: 'alarms', pull_s: alarms.pull_s, cooled_s: alarms.cooled_s });
  }
  const changed = was === null || w.cook.log.length !== was.log.length || w.lean !== state.leanHint_s;
  if (changed) w.effects.unshift({ kind: 'persist' });
  return {
    cook: w.cook, plan: w.plan, leanHint_s: w.lean,
    need: { ...w.need, wakeAt_s: endedAt_s(w.cook) === null ? wakeAt(w.cook, w.plan, now_s) : null },
    effects: w.effects,
  };
}
