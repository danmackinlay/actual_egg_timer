/**
 * The page's model, and how a message moves the running cook (`update`).
 *
 * The cook is core's `CookState` (src/core/step.ts): `update` hands it to
 * `step` with each thing that happened, and returns the model as it now
 * stands and what the page must do (`Effect`). It is pure: what it needs from
 * storage comes in the message, and everything it changes is in what it
 * returns. Carrying the effects out, building what `need` asks for and
 * drawing the screen is cook.ts's.
 *
 * What is the web's own, around `step`:
 *
 * - The primary button reads the phase: the boil at Heating, the egg out at
 *   Pull, "still in" while the plan asks, Start again at Done.
 * - Another tab's copy of this cook (`elsewhere`): what it saw in the pan
 *   taken up (`takeUpEvents`) and planned on, and the pull rung here if this
 *   tab never rang it. Never another cook (DECISIONS.md 97).
 * - Which egg is open (`cookStillOpen`): at Done, one another tab ended or
 *   stored another for, or an hour past its end, is final. Its questions go,
 *   and nothing more is written or logged for it (`closed`).
 * - A cook that ends before its egg's record can be made - the surface or
 *   the calibration before this egg still to build - leaves the screen at
 *   once and waits in `ending`, stepped as each lands, until it is logged
 *   and forgotten.
 */

import type { AlarmMoment, BoilMemory } from '../core/policy.js';
import { phaseAt } from '../core/policy.js';
import type { Decision } from '../core/decide.js';
import type { DecidedAnswer, OddsProfile } from '../core/reach.js';
import type { Outcome } from '../core/outcome.js';
import type { Solution } from '../core/solve.js';
import type { WhiteReport, YolkWord } from '../core/infer.js';
import type { Calibration, EggRecord, ProbeReading, Units } from '../core/record.js';
import type { BoilToRemember, CookChoices, CookSurface, RunningCook } from '../core/running.js';
import { answered, asRanCurrent, asksIfStillIn, cookStillOpen, endedAt_s, takeUpEvents } from '../core/running.js';
import type { CookBefore, CookEnv, CookEvent, CookNeed, CookState, CookStep } from '../core/step.js';
import { step } from '../core/step.js';
import type { Settings, StoredCook } from './store.js';

/** A cook ended before its egg's record could be made, and what it waits
 *  for. */
export interface Ending extends CookState {
  need: CookNeed;
}

/** What the page holds. The running cook is core's `CookState`: `cook`, its
 *  `plan` and the lean (`leanHint_s`), all null and 0 while idle. */
export interface Model extends CookState {
  settings: Settings;
  /** What the controls show and write: the settings themselves while idle,
   *  the same object; while a cook runs, its own choices over a copy of them
   *  (`settingsOfChoices`), never the settings, which another tab may have
   *  changed since. */
  controls: Settings;
  boilMemory: BoilMemory;
  /** The posterior over the model's uncertain constants, folded IN PLACE as
   *  eggs are learned (calibration.ts). */
  calib: Calibration;
  /** The idle screen's answer: the solve behind the time on screen, the
   *  choice and the outcome at it, and the whole of it as core decided it
   *  (`decideAnswer`); the last three null until the pot's surface is in,
   *  and on the sous-vide screen. */
  solution: Solution | null;
  decision: Decision | null;
  outcome: Outcome | null;
  chosen: DecidedAnswer | null;
  /** The odds at every level for the idle pot and the posterior as it
   *  stands; null until worked out. */
  profile: OddsProfile | null;
  /** The warning line while idle: a refusal or the level's low odds. */
  idleWarning: string;
  /** While a correction is in hand mid-cook (edit.ts), the slider's reading
   *  for it, from a plan of the cook as it would be; null otherwise. */
  aim: { level: number; peakYolk_C: number; solution: Solution | null } | null;
  /** When the eggs went in, as the controls show it while a cook runs; null
   *  while idle. */
  controlsStart_s: number | null;
  /** This page's nudge (E8): drawn at boot and after each cook. */
  nudgeDraw: number;

  /** What the running cook waits for (`step`'s `need`). */
  need: CookNeed;
  /** Cooks ended whose egg's record is still to be made. */
  ending: Ending[];
  /** The calibration before a cook's egg, and surfaces on it, once built:
   *  what a record corrected after the pull is planned on. Kept while the
   *  cook's plan as it ran is stale. */
  before: { id_ms: number; before: CookBefore }[];
  /** The surfaces built, as far as they are in, for the step: the runner's
   *  view of its caches, taken before each message. */
  surfaces: CookSurface[];
  /** For the egg's record: this build, and the population of the prior. */
  appVersion: string;
  prior: string;
  /** The pull's alarm as the last step set it, epoch s, or null. */
  pull_s: number | null;

  /** This tab's cook as written down: as this tab last read or wrote it
   *  (JSON), so it is written only when it changed; whether a write reads
   *  back; and whether the egg is final here (`closed`): nothing more is
   *  written or logged for it. */
  written: string | null;
  works: boolean;
  closed: boolean;
  /** The questions at Done: open, or put away - answered before a reload or
   *  in another tab, or the egg final - when no more can be taken. */
  questions: 'open' | 'away';
  /** Whether the cook on screen was picked back up after a reload: its
   *  alarm died with the old page. */
  reloaded: boolean;
  /** A probe reading typed before the egg's record could be made: read
   *  again when a surface lands. */
  probeHeld: boolean;
}

/** Nothing wanted. */
export const NO_NEED: CookNeed = { surface: null, before: false, beforeSurface: null, wakeAt_s: null };

/** What happened. `storedId_ms` is the stored cook's id as this tab reads
 *  it (this cook's own when storage does not work), for whether its egg is
 *  still open. */
export type Msg =
  | { kind: 'start'; choices: CookChoices; nudge_s: number; units: Units; lang: string; leanHint_s: number }
  | { kind: 'primary' }
  | { kind: 'cancel' }
  | { kind: 'stillOut' }
  | { kind: 'correct'; choices: CookChoices; startedAt_s: number | null }
  | { kind: 'tick' }
  | { kind: 'landed' }
  | {
    kind: 'answered'; yolkWord: YolkWord | null; white: WhiteReport | null; probe: ProbeReading | null;
    storedId_ms: number | null;
  }
  | { kind: 'elsewhere'; theirs: StoredCook | null; storedId_ms: number | null }
  | { kind: 'restore'; stored: StoredCook };

/** What the page must do: core's effects, each with the cook it is for. */
export type Effect =
  | { kind: 'persist'; cook: RunningCook; leanHint_s: number; onScreen: boolean }
  | { kind: 'ring'; moment: AlarmMoment }
  | { kind: 'silence' }
  | { kind: 'rememberBoil'; boil: BoilToRemember }
  | { kind: 'log'; record: EggRecord }
  | { kind: 'forget'; id_ms: number }
  | { kind: 'sendFinal' }
  | { kind: 'blip' };

/** The LOCAL date of a moment, ms. A day, not a timestamp. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** What the page holds for a step of `cook`. */
function envFor(m: Model, cook: RunningCook | null, now_s: number): CookEnv {
  const id = cook === null ? null : cook.id_ms;
  const b = m.before.find((x) => x.id_ms === id);
  return {
    calibration: m.calib, surfaces: m.surfaces, before: b === undefined ? null : b.before,
    app: 'web', appVersion: m.appVersion, prior: m.prior,
    day: localDay((cook === null ? now_s : cook.startedAt_s) * 1000),
  };
}

/** The phase of a plan at `now_s`, "still in the water?" its own. */
function phaseOf(m: CookState, now_s: number): string {
  if (m.plan === null) return 'IDLE';
  return asksIfStillIn(m.plan) ? 'ASKING' : phaseAt(m.plan.deadlines, now_s);
}

/** Whether a cook's plan as it ran waits to be made again for a correction
 *  after the pull. */
function asRanStale(cook: RunningCook): boolean {
  return cook.events.pulled !== null && cook.asRan !== null && !asRanCurrent(cook);
}

/** The model with the running cook gone: idle, and this tab's bookkeeping
 *  for it cleared. */
function idle(m: Model): Model {
  return {
    ...m, cook: null, plan: null, leanHint_s: 0, need: NO_NEED, pull_s: null, written: null, works: true,
    closed: false, questions: 'open', reloaded: false, probeHeld: false,
  };
}

/** Core's effects for a step of `was`, the cook it was for: a write only
 *  while the egg is not final here, nor a record; `forget` with its id. */
function effectsOf(was: RunningCook, s: CookStep, closed: boolean): Effect[] {
  const out: Effect[] = [];
  for (const e of s.effects) {
    switch (e.kind) {
      case 'persist':
        if (!closed && s.cook !== null) {
          out.push({ kind: 'persist', cook: s.cook, leanHint_s: s.leanHint_s, onScreen: endedAt_s(s.cook) === null });
        }
        break;
      case 'log':
        if (!closed) out.push({ kind: 'log', record: e.record });
        break;
      case 'forget':
        out.push({ kind: 'forget', id_ms: was.id_ms });
        break;
      case 'alarms':
        break;
      default:
        out.push(e);
    }
  }
  return out;
}

/** The pull's alarm a step set, or `held` if it set none. */
function pullOf(s: CookStep, held: number | null): number | null {
  let pull = held;
  for (const e of s.effects) if (e.kind === 'alarms') pull = e.pull_s;
  return pull;
}

/** The running cook stepped with `event`, from `state` (the model's own cook
 *  unless given), and the model as that leaves it: still running, waiting in
 *  `ending` for its record, or gone. A cook final here (`closed`) is not
 *  kept waiting: nothing more is logged for it. */
function stepCook(m: Model, event: CookEvent, now_s: number, state: CookState = m): [Model, Effect[]] {
  const was = state.cook;
  if (was === null) return [m, []];
  const s = step(state, event, envFor(m, was, now_s));
  const effects = effectsOf(was, s, m.closed);
  if (s.cook === null) return [idle(m), effects];
  if (endedAt_s(s.cook) !== null) {
    const waiting: Ending[] = m.closed ? [] : [{ cook: s.cook, plan: s.plan, leanHint_s: s.leanHint_s, need: s.need }];
    return [idle({ ...m, ending: [...m.ending, ...waiting] }), effects];
  }
  return [{ ...m, cook: s.cook, plan: s.plan, leanHint_s: s.leanHint_s, need: s.need, pull_s: pullOf(s, m.pull_s) }, effects];
}

/** Each ended cook stepped as something it waited for landed; those logged
 *  and forgotten gone. */
function stepEnding(m: Model, now_s: number): [Model, Effect[]] {
  const effects: Effect[] = [];
  const left: Ending[] = [];
  for (const e of m.ending) {
    if (e.cook === null) continue;
    const s = step(e, { kind: 'surfaceLanded', now_s: now_s }, envFor(m, e.cook, now_s));
    effects.push(...effectsOf(e.cook, s, false));
    if (s.cook !== null) left.push({ cook: s.cook, plan: s.plan, leanHint_s: s.leanHint_s, need: s.need });
  }
  return [{ ...m, ending: left }, effects];
}

/** The calibrations before an egg still wanted: a cook's whose plan as it
 *  ran is stale. */
function beforeKept(m: Model): Model {
  const stale = new Set<number>();
  for (const s of [m as CookState, ...m.ending]) if (s.cook !== null && asRanStale(s.cook)) stale.add(s.cook.id_ms);
  const kept = m.before.filter((b) => stale.has(b.id_ms));
  return kept.length === m.before.length ? m : { ...m, before: kept };
}

/**
 * Another tab's copy of this cook, taken up: what it saw in the pan, and an
 * answer that logged the egg (the questions go here, as after a reload),
 * planned on at once. The pull rung there, which this tab has not rung,
 * rings here too, as this tab's tick would have; Done rings if the egg is
 * now Done.
 */
function takeUp(m: Model, theirs: StoredCook, now_s: number): [Model, Effect[]] {
  const ours = m.cook;
  if (ours === null || m.plan === null || theirs.cook.id_ms !== ours.id_ms) return [m, []];
  let next: Model = { ...m, written: JSON.stringify(theirs.cook) };
  if (theirs.answers === 'beforeReload' && !answered(ours)) next = { ...next, questions: 'away' };
  const cook = takeUpEvents(ours, theirs.cook);
  if (cook === ours) return [next, []];
  const [after, effects] = stepCook(next, { kind: 'surfaceLanded', now_s: now_s }, now_s, { ...m, cook: cook });
  if (after.cook === null || after.plan === null || asksIfStillIn(after.plan) || effects.some((e) => e.kind === 'ring')) {
    return [after, effects];
  }
  const e = after.cook.events;
  if (ours.events.rangAt_s === null && e.rangAt_s !== null && (e.pulled === null || e.pulled.by === 'timeout')) {
    effects.push({ kind: 'ring', moment: 'pull' });
  } else if (!doneByEvents(ours) && doneByEvents(after.cook)) {
    effects.push({ kind: 'ring', moment: 'cooled' });
  }
  return [after, effects];
}

/** Whether a cook is Done by its events: out, and on the counter or its
 *  counted cooling ended. */
function doneByEvents(cook: RunningCook): boolean {
  const e = cook.events;
  return e.pulled !== null && (cook.choices.cooling === 'counter' || e.cooledAt_s !== null);
}

/** Whether the egg on screen is still the one open to answers and
 *  corrections; if not, it is final here. */
function stillOpen(m: Model, storedId_ms: number | null, now_s: number): boolean {
  return m.cook !== null && m.plan !== null && !m.closed && cookStillOpen(m.cook, m.plan, storedId_ms, now_s);
}

/** The egg final here: its questions go, and nothing more is written or
 *  logged for it. */
function close(m: Model): Model {
  return { ...m, closed: true, questions: 'away' };
}

/** What `msg` does to the model at `now_ms`, and what the page must do. */
export function update(m: Model, msg: Msg, now_ms: number): [Model, Effect[]] {
  const now_s = now_ms / 1000;
  let [next, effects] = updateCook(m, msg, now_s);
  if (msg.kind === 'landed') {
    const [after, more] = stepEnding(next, now_s);
    next = after;
    effects = [...effects, ...more];
  }
  return [beforeKept(next), effects];
}

function updateCook(m: Model, msg: Msg, now_s: number): [Model, Effect[]] {
  switch (msg.kind) {
    case 'start': {
      if (m.cook !== null) return [m, []];
      const fresh: Model = { ...idle(m), leanHint_s: msg.leanHint_s };
      const s = step(fresh, {
        kind: 'start', now_s: now_s, choices: msg.choices, nudge_s: msg.nudge_s, boilMemory: { ...m.boilMemory },
        units: msg.units, lang: msg.lang, leanHint_s: msg.leanHint_s,
      }, envFor(m, null, now_s));
      if (s.cook === null) return [m, []];
      const next: Model = { ...fresh, cook: s.cook, plan: s.plan, leanHint_s: s.leanHint_s, need: s.need, pull_s: pullOf(s, null) };
      return [next, [...effectsOf(s.cook, s, false), { kind: 'blip' }]];
    }
    case 'restore': {
      const stored = msg.stored;
      const fresh: Model = {
        ...idle(m), written: JSON.stringify(stored.cook), reloaded: true,
        questions: stored.answers === 'beforeReload' || answered(stored.cook) ? 'away' : 'open',
      };
      const state: CookState = { cook: stored.cook, plan: null, leanHint_s: stored.leanHint_s };
      const [next, effects] = stepCook(fresh, { kind: 'tick', now_s: now_s }, now_s, state);
      // The alarm died with the old page, and cannot sound before a gesture.
      return [next, effects.filter((e) => e.kind !== 'ring')];
    }
    case 'primary': {
      const phase = phaseOf(m, now_s);
      if (phase === 'ASKING') return stepCook(m, { kind: 'stillIn', now_s: now_s }, now_s);
      if (phase === 'HEATING') {
        const [next, effects] = stepCook(m, { kind: 'boil', now_s: now_s }, now_s);
        return [next, [...effects, { kind: 'blip' }]];
      }
      if (phase === 'PULL') return stepCook(m, { kind: 'out', now_s: now_s }, now_s);
      if (phase === 'DONE') return stepCook(m, { kind: 'startAgain', now_s: now_s }, now_s);
      return [m, []];
    }
    case 'cancel':
      return stepCook(m, { kind: 'startAgain', now_s: now_s }, now_s);
    case 'stillOut':
      return stepCook(m, { kind: 'pullStands', now_s: now_s }, now_s);
    case 'correct': {
      if (m.closed || m.cook === null) return [m, []];
      let next = m;
      let effects: Effect[] = [];
      if (msg.startedAt_s !== null) {
        [next, effects] = stepCook(next, { kind: 'correctStart', now_s: now_s, startedAt_s: msg.startedAt_s }, now_s);
      }
      const [after, more] = stepCook(next, { kind: 'correct', now_s: now_s, choices: msg.choices }, now_s);
      return [after, [...effects, ...more]];
    }
    case 'tick':
      return stepCook(m, { kind: 'tick', now_s: now_s }, now_s);
    case 'landed':
      return m.cook === null ? [m, []] : stepCook(m, { kind: 'surfaceLanded', now_s: now_s }, now_s);
    case 'answered': {
      if (m.cook === null) return [m, []];
      if (!stillOpen(m, msg.storedId_ms, now_s)) return [close(m), []];
      return stepCook(m, {
        kind: 'answered', now_s: now_s, yolkWord: msg.yolkWord, white: msg.white, probe: msg.probe,
      }, now_s);
    }
    case 'elsewhere': {
      if (m.cook === null || m.plan === null || m.closed) return [m, []];
      if (phaseOf(m, now_s) === 'DONE' && !stillOpen(m, msg.storedId_ms, now_s)) return [close(m), []];
      return msg.theirs === null ? [m, []] : takeUp(m, msg.theirs, now_s);
    }
  }
}
