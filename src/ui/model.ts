/**
 * The page's model, and how a message moves it (`update`): the idle page -
 * the controls, the settings, the answer they give - and the running cook.
 *
 * `update` is pure: what it needs from storage, the clock and the worker
 * comes in the message or the model (`surfaces`, `profiles`, `sharing`: the
 * runner's view of its caches and stores, taken before each message), and
 * everything it changes is in what it returns, with what the page must do
 * (`Effect`). Carrying the effects out, building what the model waits for
 * and drawing the screen is cook.ts's.
 *
 * The idle page: a change to the controls is taken into the settings, saved
 * once the cook stops changing them, and answered once they settle (a solve
 * is tens of milliseconds, too long for every pixel of a drag); the units,
 * the language, the sound, a pan measured, an egg learned, everything
 * forgotten: each a message, the page solved again after it (`solve`). While
 * a cook runs the controls are its own choices, never the settings, which
 * describe the next cook: a change to them is a correction, held in hand
 * until it is committed (core hand.ts; the gestures are edit.ts's).
 *
 * The cook is core's `CookState` (src/core/step.ts): `update` hands it to
 * `step` with each thing that happened. What is the web's own, around it:
 *
 * - The primary button reads the phase: the boil at Heating, the egg out at
 *   Pull, "still in" while the plan asks, Start again at Done.
 * - Which egg is open (`stillOpen`): at Done, one too old to pick back up
 *   (core `cookTooOld`) is final. Its questions go, and nothing more is
 *   written or logged for it (`closed`).
 * - A cook that ends before its egg's record can be made - the surface or
 *   the calibration before this egg still to build - leaves the screen at
 *   once and waits in `ending`, stepped as each lands, until it is logged
 *   and forgotten.
 */

import type { AlarmMoment, AlarmSound } from '../core/sounds.ts';
import type { BoilMemory } from '../core/boil.ts';
import type { DecisionInputs } from '../core/decide.ts';
import type { OddsProfile } from '../core/reach.ts';
import type { Outcome } from '../core/outcome.ts';
import type { ShareState } from './shareState.ts';
import type { Solution } from '../core/solve.ts';
import type { CertaintyReading } from '../core/certainty.ts';
import { CARRYOVER_WINDOW } from '../core/constants.ts';
import { type EggSection, type SectionView, advanceSection, createSection, previewSection } from '../core/section.ts';
import type { WhiteReport, YolkWord } from '../core/infer.ts';
import type { Calibration, EggRecord, ProbeReading, Units } from '../core/record.ts';
import type { BoilToRemember, CookChoices, CookSurface, RunningCook } from '../core/running.ts';
import {
  answered, answersOf, asksIfStillIn, cookTooOld, endedAt_s, phaseAt, plausibleProbeRange_C, replan, sameValue,
} from '../core/running.ts';
import { asRanCurrent, asRanShown, cookFactsFor } from '../core/asRan.ts';
import {
  type HandEvent, type HandGroup, type HandState, type HandTimer, type StartLimit, handChoices, handStep, nothingInHand,
  previewCook, startStepped,
} from '../core/hand.ts';
import { calibrationDoneness, calibrationParams, probeReadingFor, recordCookTime_s, recordFor } from '../core/record.ts';
import type { CookBefore, CookEnv, CookEvent, CookNeed, CookState, CookStep } from '../core/step.ts';
import { step, surfaceFor } from '../core/step.ts';
import type { UnitSystem } from '../core/units.ts';
import { chooseUnits } from '../core/units.ts';
import { effectiveLanguage, languageAfterFlip } from './settings.ts';
import { type IdleAnswer, type PotOdds, nudgeNow, solveIdle } from './answer.ts';
import { targetPeakYolk_C } from '../core/slider.ts';
import { NO_NEED, choicesOf, controlsOf, idleChoices, isSousVide, settingsOfChoices, sizeClasses } from './state.ts';
import type { KeptAnswers, Settings, StoredCook } from './store.ts';
import { REGION, REGIONAL_UNITS } from './units.ts';

/** A correction in hand: the slider's reading for it, the plan's solve,
 *  and the egg it aims for, once planned. */
interface Aim {
  level: number;
  peakYolk_C: number;
  solution: Solution | null;
  section: SectionView | null;
}

/** Where the start's − and + stopped, for the line under them. */
export type { StartLimit };

/** The line over the questions, as last said: what has been learned, "thank
 *  you" for the egg kept, or "learning" for an answer taken; `rev` moves
 *  each time it is said. */
export interface Note {
  rev: number;
  say: 'learned' | 'thanks' | 'learning';
}

/** Sharing as the runner last read it: its state, and how many of the log's
 *  eggs are final. */
interface ShareSeen {
  state: ShareState;
  final: number;
}

/** What a running cook's plan last said of how sure, on its pot's
 *  surface: its outcome (null until decided), its certainty, and its pot's
 *  odds profile, for the cook started at `id_ms`. */
export interface Held {
  id_ms: number;
  outcome: Outcome | null;
  certainty: CertaintyReading | null;
  profile: OddsProfile | null;
}

/** A cook ended before its egg's record could be made, and what it waits
 *  for. */
interface Ending extends CookState {
  need: CookNeed;
}

/** What the page holds. The running cook is core's `CookState`: `cook`, its
 *  `plan` and the lean (`leanHint_s`), all null and 0 while idle. */
export interface Model extends CookState {
  /** The settings: the next cook's choices, and the page's own (the units,
   *  the language, the sound). Replaced, never changed in place. While idle
   *  they are what the controls show. */
  settings: Settings;
  /** While a cook runs, what the controls show of its choices: its own
   *  (`settingsOfChoices`), with a correction in hand on them, never the
   *  settings, which describe the next cook; null while idle. The controls
   *  are these over the settings (`controlsOf`). */
  cookControls: CookSettings | null;
  boilMemory: BoilMemory;
  /** The posterior over the model's uncertain constants, folded IN PLACE as
   *  eggs are learned (calibration.ts). */
  calib: Calibration;
  /** Whether sharing is on (the nudge, the Learning mark): the runner's view
   *  of its store, taken before each message. */
  sharing: boolean;
  /** A deletion of what was shared, asked for on this page, confirmed: said
   *  under the switch until sharing is turned on again. */
  deletedHere: boolean;
  /** Sharing as the runner read it before this message; null before boot. */
  share: ShareSeen | null;
  /** The line over the questions. */
  note: Note;
  /** The odds profiles built on the calibration as it stands, for any pot:
   *  the runner's view of its caches, like `surfaces`. */
  profiles: PotOdds[];
  /** The idle screen's answer as last solved (answer.ts, `IdleAnswer`);
   *  null before the first solve, and on the sous-vide screen. */
  solved: IdleAnswer | null;
  /** The controls changed since the idle page was last solved: the slider's
   *  reading is the level's own until the solve lands. */
  unsolved: boolean;
  /** While a correction is in hand mid-cook, the slider's reading for it,
   *  from a plan of the cook as it would be, and the egg it aims for
   *  (`previewSection`), once planned; null otherwise. */
  aim: Aim | null;
  /** The correction in hand and its gesture, while a cook runs (core
   *  hand.ts); null while idle. */
  hand: HandState | null;
  /** When the eggs went in, as the controls show it while a cook runs; null
   *  while idle. */
  controlsStart_s: number | null;
  /** This page's nudge: drawn at boot and after each cook. */
  nudgeDraw: number;

  /** What the running cook's plan last said of how sure, while it was on
   *  its pot's surface: held while a new pot's surface is on its way (the
   *  boil tapped, a correction), rather than blanking (view.ts). */
  held: Held | null;
  /** The egg in the water now, carried forward with the cook (core
   *  `advanceSection`), and what it was started from: the cook, its start,
   *  its pot and the model's parameters. */
  live: { key: string; section: EggSection } | null;

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

  /** The cook as this page last wrote it down (JSON), so it is written
   *  only when it changed (`update` sets it with
   *  each write it asks for); whether the last write read back, as the
   *  runner says (`persisted`); and whether the egg is final here
   *  (`closed`): nothing more is written or logged for it. */
  written: string | null;
  works: boolean;
  closed: boolean;
  /** The questions at Done: open, or put away - answered before a reload,
   *  or the egg final - when no more can be taken. */
  questions: 'open' | 'away';
  /** Whether the cook on screen was picked back up after a reload: its
   *  alarm died with the old page. Not in a tab the app was moved to by a
   *  press, whose alarm is armed again. */
  reloaded: boolean;
  /** A probe reading typed before the egg's record could be made: read
   *  again when a surface lands. */
  probeHeld: boolean;
}

/** What happened. */
export type Msg =
  /* The running cook. */
  | { kind: 'start'; choices: CookChoices; nudge_s: number; units: Units; lang: string; leanHint_s: number }
  | { kind: 'primary' }
  | { kind: 'cancel' }
  | { kind: 'stillOut' }
  | { kind: 'correct'; choices: CookChoices; startedAt_s: number | null }
  | { kind: 'tick' }
  | { kind: 'landed' }
  /** The calibration before the egg of the cook `id_ms`, built; or, with
   *  `surface`, a surface on it, built for that calibration. */
  | { kind: 'before'; id_ms: number; calibration: Calibration; surface: CookSurface | null }
  /** A write of the cook on screen: whether it read back. */
  | { kind: 'persisted'; works: boolean }
  | { kind: 'answered'; yolkWord: YolkWord | null; white: WhiteReport | null; probe: ProbeReading | null }
  /** A probe reading typed at Done, C; null for what is not a number. */
  | { kind: 'probe'; reading_C: number | null }
  /** The stored cook picked back up: after a reload, or in a tab the app
   *  was moved to by a press (`reloaded` false), whose alarm can sound. */
  | { kind: 'restore'; stored: StoredCook; reloaded: boolean }
  /** What the cook did to the controls mid-cook - a finger down or up, the
   *  page left, another control used - or a timer of the correction in hand
   *  come round (edit.ts, core hand.ts), at a time on the gestures' clock,
   *  s. */
  | { kind: 'hand'; event: HandEvent }
  /** The start's − or +: a minute earlier or later, as far as the cook
   *  allows, at `at_s` on the gestures' clock. */
  | { kind: 'startStep'; up: boolean; at_s: number }
  /** The egg of the cook `id_ms` kept in the log, or not (`keepRecord`). */
  | { kind: 'kept'; id_ms: number | null; kept: boolean }
  /* The page. */
  /** Start, on the idle page: the cook the settings describe, at the time
   *  on screen, in these units and words. */
  | { kind: 'begin'; units: Units; lang: string }
  /** What the controls now say (input.ts), as far as they say it, changed
   *  on a field of the cook's choices `group` makes or of none (edit.ts,
   *  `groupOf`), at `at_s` on the gestures' clock. */
  | { kind: 'controls'; read: Partial<Settings>; group: HandGroup | null; at_s: number }
  | { kind: 'units'; system: UnitSystem }
  /** A language picked in Settings. */
  | { kind: 'language'; pick: string }
  | { kind: 'mute' }
  | { kind: 'alarm'; sound: AlarmSound }
  /** The pans remembered: a boil measured. */
  | { kind: 'pans'; boilMemory: BoilMemory }
  /** A new posterior, everything forgotten, and the pans with it. */
  | { kind: 'calibration'; calib: Calibration; boilMemory: BoilMemory }
  /** Eggs folded: the idle page solved again, and what has been learned
   *  said again over the questions. */
  | { kind: 'learned' }
  /** Every word on the page in a new language: as `learned`. */
  | { kind: 'relabelled' }
  | { kind: 'forget' }
  /** "Export my results". */
  | { kind: 'export' }
  /** Sharing turned on or off, or what was shared asked to be deleted, in
   *  Settings; a deletion asked here, done (`confirmed`: every id); what
   *  sharing holds changed. */
  | { kind: 'shareOn'; on: boolean }
  | { kind: 'shareDelete' }
  | { kind: 'shareDeleted'; confirmed: boolean }
  | { kind: 'shared' }
  /** A new nudge drawn (`nudgeSeconds`), after a cook. */
  | { kind: 'nudge'; draw: number }
  /** The idle page solved again: the controls settled, a surface or a
   *  profile landed. */
  | { kind: 'solve' };

/** What the page must do: core's effects, each with the cook it is for, and
 *  the page's. */
export type Effect =
  /** The cook on screen written down, changed: with whether its egg is in
   *  the log as an answer would put it (`answers`). Unchanged, only the lean
   *  beside it (`persistLean`). A cook ended, waiting on its record, over
   *  its own copy only (`persistEnded`). */
  | { kind: 'persist'; cook: RunningCook; leanHint_s: number; answers: KeptAnswers }
  | { kind: 'persistLean'; id_ms: number; leanHint_s: number }
  | { kind: 'persistEnded'; cook: RunningCook; leanHint_s: number }
  | { kind: 'ring'; moment: AlarmMoment }
  | { kind: 'silence' }
  | { kind: 'rememberBoil'; boil: BoilToRemember }
  | { kind: 'log'; record: EggRecord }
  | { kind: 'forget'; id_ms: number }
  | { kind: 'sendFinal' }
  | { kind: 'blip' }
  /** The questions empty again, for the next egg; "thank you" for the egg
   *  kept; "learning" for an answer taken. */
  | { kind: 'questionsReset' }
  /** A surface landed: a probe reading held for want of the egg's record
   *  read again. */
  | { kind: 'retryProbe' }
  /** An answer taken: its row settles on the button pressed. */
  | { kind: 'answerTaken'; yolkWord: YolkWord | null; white: WhiteReport | null }
  /** A probe reading refused, with the range it should be in, C; or taken. */
  | { kind: 'probeRefused'; low_C: number; high_C: number }
  | { kind: 'probeTaken'; reading_C: number }
  /** A timer of the correction in hand set for `at_s` on the gestures'
   *  clock, or with null, stopped; the line under the start's time, why a
   *  press went no further, or nothing. */
  | { kind: 'handTimer'; timer: HandTimer; at_s: number | null }
  | { kind: 'startLimit'; limit: StartLimit | null }
  /** The settings written: coalesced (a drag), or now. */
  | { kind: 'save'; soon: boolean }
  /** The idle page solved again once the controls settle. */
  | { kind: 'solveSoon' }
  /** What the idle page wants built: the pot's surface, once the inputs
   *  settle, and an odds profile. */
  | { kind: 'askSurface'; inputs: DecisionInputs }
  | { kind: 'askProfile'; inputs: DecisionInputs }
  /** The words follow the settings' language; `before`, the one they were
   *  in. */
  | { kind: 'language'; before: string }
  /** The alarm's sound, heard as it is picked. */
  | { kind: 'previewAlarm' }
  /** A new nudge to draw; everything learned to forget. */
  | { kind: 'drawNudge' }
  | { kind: 'forgetAll' }
  /** The results file saved; sharing turned on or off; what was shared
   *  deleted. */
  | { kind: 'export' }
  | { kind: 'setSharing'; on: boolean }
  | { kind: 'deleteShared' };

/** `m` with the line over the questions saying `say`. */
function say(m: Model, say: Note['say']): Model {
  return { ...m, note: { rev: m.note.rev + 1, say: say } };
}

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

/** The model with the running cook gone: idle, and this page's bookkeeping
 *  for it cleared. */
function idle(m: Model): Model {
  return {
    ...m, cook: null, plan: null, leanHint_s: 0, need: NO_NEED, pull_s: null, written: null, works: true,
    closed: false, questions: 'open', reloaded: false, probeHeld: false,
  };
}

/** Core's effects for a step of `was`, the cook it was for: a write only
 *  while the egg is not final here (`closed`), nor a record; `forget` with
 *  its id. `questions`: the page's, for whether the egg is kept as
 *  answered. */
function effectsOf(was: RunningCook, s: CookStep, closed: boolean, questions: Model['questions']): Effect[] {
  const out: Effect[] = [];
  for (const e of s.effects) {
    switch (e.kind) {
      case 'persist':
        if (closed || s.cook === null) break;
        if (endedAt_s(s.cook) !== null) {
          out.push({ kind: 'persistEnded', cook: s.cook, leanHint_s: s.leanHint_s });
        } else {
          // In the log as an answer would put it: answered, or its questions
          // put away.
          const answers = questions === 'away' || answered(s.cook) ? 'beforeReload' : 'none';
          out.push({ kind: 'persist', cook: s.cook, leanHint_s: s.leanHint_s, answers: answers });
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
  const effects = effectsOf(was, s, m.closed, m.questions);
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
    effects.push(...effectsOf(e.cook, s, false, 'open'));
    if (s.cook !== null) left.push({ cook: s.cook, plan: s.plan, leanHint_s: s.leanHint_s, need: s.need });
  }
  return [{ ...m, ending: left }, effects];
}

/** A calibration before an egg, or a surface on it, taken in: the
 *  calibration only while its cook is on screen or waiting; the surface
 *  only on the calibration it was built for. */
function withBefore(m: Model, b: Extract<Msg, { kind: 'before' }>): Model {
  const id = b.id_ms;
  if (b.surface === null) {
    if (m.cook?.id_ms !== id && !m.ending.some((e) => e.cook?.id_ms === id)) return m;
    return { ...m, before: [...m.before.filter((x) => x.id_ms !== id), { id_ms: id, before: { calibration: b.calibration, surfaces: [] } }] };
  }
  const held = m.before.find((x) => x.id_ms === id);
  if (held === undefined || held.before.calibration !== b.calibration) return m;
  const surfaces = [...held.before.surfaces, b.surface];
  return { ...m, before: m.before.map((x) => (x !== held ? x : { id_ms: id, before: { calibration: b.calibration, surfaces: surfaces } })) };
}

/** The calibrations before an egg still wanted: a cook's whose plan as it
 *  ran is stale. */
function beforeKept(m: Model): Model {
  const stale = new Set<number>();
  for (const s of [m as CookState, ...m.ending]) if (s.cook !== null && asRanStale(s.cook)) stale.add(s.cook.id_ms);
  const kept = m.before.filter((b) => stale.has(b.id_ms));
  return kept.length === m.before.length ? m : { ...m, before: kept };
}

/** Whether the egg on screen is still the one open to answers and
 *  corrections; if not, it is final here. */
function stillOpen(m: Model, now_s: number): boolean {
  return m.cook !== null && m.plan !== null && !m.closed && !cookTooOld(m.plan, now_s);
}

/**
 * A probe reading typed at Done. Scored against the egg's record as core
 * makes it (`cookFactsFor`, `recordFor`: the record a step logs, with the
 * same context): refused, with the range it should be in, when no
 * believable kitchen could have made it for this cook
 * (`plausibleProbeRange_C`), bounded by the model the cook ran under, not
 * one that has since folded this egg's own answer; otherwise
 * an answer like the others. When the record cannot be made yet (no
 * surface), the reading is held, to be read again when one lands.
 */
function probeRead(m: Model, reading_C: number | null, now_s: number): [Model, Effect[]] {
  const cook = m.cook;
  const plan = m.plan;
  if (cook === null || plan === null) return [m, []];
  const free: Model = { ...m, probeHeld: false };
  if (answersOf(cook).probe !== null) return [free, []];
  const env = envFor(m, cook, now_s);
  const made = cookFactsFor(cook, plan, {
    app: env.app, appVersion: env.appVersion, prior: env.prior, day: env.day, id: cook.id_ms,
  }, null, null, null);
  if (made.facts === null) return [say({ ...m, probeHeld: true }, 'learning'), []];
  const record = recordFor(made.facts);
  const params = asRanShown(cook, plan)?.params ?? calibrationParams(m.calib);
  const [low, high] = plausibleProbeRange_C(plan.egg, plan.setup, params, recordCookTime_s(record));
  if (reading_C === null || reading_C < low || reading_C > high) {
    return [free, [{ kind: 'probeRefused', low_C: low, high_C: high }]];
  }
  // When it was asked for: the end of the counted cooling, from the moment
  // the record scores as the pull.
  const coolEnd = plan.deadlines.coolEnd_s;
  const probe = probeReadingFor(record, reading_C, coolEnd !== null ? coolEnd - cook.startedAt_s : null);
  const [next, effects] = updateCook(free, { kind: 'answered', yolkWord: null, white: null, probe: probe }, now_s);
  const taken = next.cook !== null && !next.closed && answersOf(next.cook).probe !== null;
  return [next, taken ? [...effects, { kind: 'probeTaken', reading_C: reading_C }] : effects];
}

/** The primary button, by the phase. */
function pressed(m: Model, now_s: number): [Model, Effect[]] {
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

/** How many answers a cook's log holds. */
function answersGiven(cook: RunningCook): number {
  return cook.log.filter((e) => e.kind === 'answered').length;
}

/** The egg final here: its questions go, and nothing more is written or
 *  logged for it. */
function close(m: Model): Model {
  return { ...m, closed: true, questions: 'away' };
}

/** The runner's view of its caches and its stores (cook.ts), taken before
 *  each message and handed in with it. */
export type Seen = Pick<Model, 'surfaces' | 'profiles' | 'sharing' | 'share'>;

/** What `msg` does to the model at `now_ms`, with the runner's view `seen`
 *  of its caches and stores if it has a new one, and what the page must
 *  do. */
export function update(m: Model, msg: Msg, now_ms: number, seen: Seen | null = null): [Model, Effect[]] {
  const now_s = now_ms / 1000;
  const at = seen === null ? m : { ...m, ...seen };
  const [next, effects] = written(...updateAny(at, msg, now_s));
  if (msg.kind === 'landed' && next.probeHeld) effects.push({ kind: 'retryProbe' });
  return [shown(next, now_s), effects];
}

/**
 * The cook on screen written only when it changed - something it was told
 * or saw, never a plan alone, which changes nothing stored: otherwise only
 * the lean beside it (`written`).
 */
function written(m: Model, effects: Effect[]): [Model, Effect[]] {
  let text = m.written;
  const out = effects.map((e): Effect => {
    if (e.kind !== 'persist') return e;
    const json = JSON.stringify(e.cook);
    if (json === text) return { kind: 'persistLean', id_ms: e.cook.id_ms, leanHint_s: e.leanHint_s };
    text = json;
    return e;
  });
  return [text === m.written ? m : { ...m, written: text }, out];
}

function updateAny(m: Model, msg: Msg, now_s: number): [Model, Effect[]] {
  const page = updatePage(m, msg, now_s);
  if (page !== null) return around(m, page[0], page[1]);
  if (msg.kind === 'before') {
    const next = withBefore(m, msg);
    return next === m ? [m, []] : updateAny(next, { kind: 'landed' }, now_s);
  }
  let [next, effects] = updateCook(m, msg, now_s);
  if (msg.kind === 'landed') {
    const [after, more] = stepEnding(next, now_s);
    next = after;
    effects = [...effects, ...more];
  }
  return around(m, beforeKept(next), effects);
}

/* ----------------------------------------------------------- what is shown */

/** The model with what the screen holds on to brought up to `now_s`: how
 *  sure the running cook's plan is (`held`), and the live egg. */
function shown(m: Model, now_s: number): Model {
  return liveEgg(holdReading(m), now_s);
}

/** What the running cook's plan says of how sure, held while a new pot's
 *  surface is on its way: taken up whenever the plan is decided on its
 *  surface, and when a new cook is on screen; the odds profile, which lands
 *  after the surface, when it does. */
function holdReading(m: Model): Model {
  const cook = m.cook;
  const plan = m.plan;
  if (cook === null || plan === null) return m;
  const decided = plan.decided === null ? null : plan.decided.outcome;
  let held = m.held;
  if (decided !== null || held === null || held.id_ms !== cook.id_ms) {
    held = { id_ms: cook.id_ms, outcome: decided, certainty: plan.certainty, profile: profileIn(m, plan.inputs) };
  }
  if (decided !== null && held.profile === null) held = { ...held, profile: profileIn(m, plan.inputs) };
  return held === m.held ? m : { ...m, held: held };
}

/** The odds profile of the surface built for `inputs`, if it is in. */
function profileIn(m: Model, inputs: DecisionInputs | null): OddsProfile | null {
  return surfaceFor(m.surfaces, inputs)?.profile ?? null;
}

/**
 * The egg in the water now, carried forward a tick at a time (core
 * `advanceSection`) and replayed from raw when the cook's pot or start
 * changes, on through the cooling: at the posterior mean, the same egg the
 * countdown times, in the pot its plan has now; once the egg is out, with
 * the model's parameters it ran under, so a fold of this egg's own answer
 * does not redraw it. Not while a correction's aim is drawn in
 * its place, nor at Done, where the egg as it ran is (view.ts).
 */
function liveEgg(m: Model, now_s: number): Model {
  const cook = m.cook;
  const plan = m.plan;
  if (cook === null || plan === null) return m.live === null ? m : { ...m, live: null };
  if (m.aim !== null && m.aim.section !== null) return m;
  const ran = asRanShown(cook, plan);
  const params = ran?.params ?? calibrationParams(m.calib);
  const pulled = cook.events.pulled;
  const out_s = pulled === null ? null : pulled.out_s - cook.startedAt_s;
  if (out_s !== null && phaseAt(plan.deadlines, now_s) === 'DONE') return m;
  const key = JSON.stringify([cook.id_ms, cook.startedAt_s, plan.egg, plan.setup, params]);
  const section = m.live === null || m.live.key !== key ? createSection(plan.egg, plan.setup, params) : copySection(m.live.section);
  const t_s = now_s - cook.startedAt_s;
  advanceSection(section, plan.egg, plan.setup, out_s === null ? t_s : Math.min(t_s, out_s + CARRYOVER_WINDOW), out_s);
  return { ...m, live: { key: key, section: section } };
}

/** A section to carry forward, apart from the one it is copied from. */
function copySection(s: EggSection): EggSection {
  return { ...s, sphere: { ...s.sphere, amp: s.sphere.amp.slice() }, dose: s.dose.map((d) => ({ ...d })) };
}

/**
 * The controls follow a cook begun or ended. Begun: they show its own
 * choices, never the settings, which describe the next cook, with nothing
 * in hand. Ended: by a button, whatever was in hand was committed first;
 * else it goes with the cook. They show the settings again, the alarm
 * stops, the questions start empty, a new cook gets a new nudge (and the
 * idle page is solved again with it), and the egg just finished is final
 * once it is forgotten: no answer can be added to it.
 */
function around(was: Model, m: Model, effects: Effect[]): [Model, Effect[]] {
  if (was.cook === null && m.cook !== null) {
    const shown = settingsOfChoices(m.settings, m.cook.choices, sizeClasses);
    const next: Model = { ...m, cookControls: shown, controlsStart_s: m.cook.startedAt_s, aim: null, hand: nothingInHand() };
    return [next, [...effects, ...handFresh(was), { kind: 'startLimit', limit: null }]];
  }
  if (was.cook !== null && m.cook === null) {
    const next: Model = { ...m, cookControls: null, controlsStart_s: null, aim: null, hand: null };
    return [next, [
      ...effects, ...handFresh(was), { kind: 'startLimit', limit: null }, { kind: 'silence' },
      { kind: 'questionsReset' }, { kind: 'drawNudge' },
    ]];
  }
  return [m, effects];
}

/* ---------------------------------------------------------- the idle page */

/**
 * The idle page solved again (answer.ts, `solveIdle`), and its answer taken
 * up: the slider moved if the answer says it must (only out of the
 * stripes), and the settings written at once for it, since the slider moved
 * out from under the cook; what is still to be built asked for. Idle only:
 * once the egg is in the water its plan is core's, from its own choices, and
 * a solve takes nothing up. No pan, no solve: the sous-vide answer comes
 * from src/core/sousvide.ts and needs none of this.
 */
function solve(m: Model): [Model, Effect[]] {
  if (m.cook !== null) return [m, []];
  if (isSousVide(m)) return [{ ...m, solved: null, unsolved: false }, []];
  const s = solveIdle(m);
  const effects: Effect[] = [];
  let at = m;
  const snapTo = s.answer.verdict.snapTo;
  if (snapTo !== null && snapTo !== m.settings.doneness) {
    at = { ...m, settings: { ...m.settings, doneness: snapTo } };
    effects.push({ kind: 'save', soon: false });
  }
  if (s.surface !== null) effects.push({ kind: 'askSurface', inputs: s.surface });
  for (const inputs of s.profiles) effects.push({ kind: 'askProfile', inputs: inputs });
  return [{ ...at, solved: { answer: s.answer, chosen: s.chosen, profile: s.profile }, unsolved: false }, effects];
}

/** Solved again after `effects`, idle. */
function solved(m: Model, effects: Effect[]): [Model, Effect[]] {
  const [next, more] = solve(m);
  return [next, [...effects, ...more]];
}

/** What a message about the page does; null for one about the cook. */
function updatePage(m: Model, msg: Msg, now_s: number): [Model, Effect[]] | null {
  switch (msg.kind) {
    case 'solve':
      return solve(m);
    case 'begin': {
      // The answer on screen taken up one last time while the controls are
      // still live - the level it snaps to is the one the cook starts at -
      // and the cook started on it, with the lean the time on screen took.
      if (m.cook !== null) return [m, []];
      const [at, effects] = solve(m);
      const chosen = at.solved?.chosen ?? null;
      const [next, more] = updateCook(at, {
        kind: 'start', choices: idleChoices(at), nudge_s: nudgeNow(at), units: msg.units, lang: msg.lang,
        leanHint_s: chosen === null ? 0 : chosen.decision.cookTime_s - chosen.decision.meanCookTime_s,
      }, now_s);
      return [next, [...effects, ...more]];
    }
    case 'controls': {
      // While a cook runs the controls are its correction in hand, written
      // to the settings when it is committed, not before.
      if (m.cook !== null) return handChanged(m, msg.group, msg.read, msg.at_s, now_s);
      return [
        { ...m, settings: { ...m.settings, ...msg.read }, unsolved: true },
        [{ kind: 'save', soon: true }, { kind: 'solveSoon' }],
      ];
    }
    case 'units': {
      // The cook picks a system, stored as their choice. A cook's own switch
      // from metric to Imperial, in modern English, is also a switch into
      // the English of 1750 (LANGUAGE.md section 6); the switch back to
      // metric leaves the language alone.
      const choice = chooseUnits(m.settings.unitsChosen, REGIONAL_UNITS, msg.system);
      let settings: Settings = { ...m.settings, unitsChosen: choice.chosen };
      const effects: Effect[] = [];
      if (choice.flip !== null) {
        effects.push({ kind: 'language', before: effectiveLanguage(settings.language) });
        settings = { ...settings, language: languageAfterFlip(settings.language, choice.flip) };
      }
      effects.push({ kind: 'save', soon: false });
      return solved({ ...m, settings: settings }, effects);
    }
    case 'language': {
      // Nothing about the egg changes, and the units are never touched from
      // here: that rule runs one way (LANGUAGE.md section 6).
      const before = effectiveLanguage(m.settings.language);
      const settings = { ...m.settings, language: { chosen: msg.pick } };
      return [{ ...m, settings: settings }, [{ kind: 'save', soon: false }, { kind: 'language', before: before }]];
    }
    case 'mute': {
      // Sound is a setting, not a phase: the toggle works mid-cook.
      return [{ ...m, settings: { ...m.settings, muted: !m.settings.muted } }, [{ kind: 'save', soon: false }]];
    }
    case 'alarm': {
      // Like the sound itself, a setting about the kitchen, not the egg, so
      // it holds mid-cook; heard as it is picked.
      return [{ ...m, settings: { ...m.settings, alarm: msg.sound } }, [{ kind: 'previewAlarm' }, { kind: 'save', soon: false }]];
    }
    case 'pans':
      return [{ ...m, boilMemory: msg.boilMemory }, []];
    case 'calibration':
      return solved(say({ ...m, calib: msg.calib, boilMemory: msg.boilMemory }, 'learned'), []);
    case 'learned':
    case 'relabelled':
      return solved(say(m, 'learned'), []);
    case 'hand':
      return handIn(m, msg.event, now_s);
    case 'startStep':
      return startStep(m, msg.up, msg.at_s, now_s);
    case 'persisted':
      return [{ ...m, works: msg.works }, []];
    case 'forget':
      return [m, [{ kind: 'forgetAll' }]];
    case 'export':
      return [m, [{ kind: 'export' }]];
    case 'shareOn':
      return [{ ...m, deletedHere: false }, [{ kind: 'setSharing', on: msg.on }]];
    case 'shareDelete':
      return [m, [{ kind: 'deleteShared' }]];
    case 'shareDeleted':
      return solved({ ...m, deletedHere: msg.confirmed }, []);
    case 'shared':
      // Turning sharing on or off moves the time by the nudge.
      return solve(m);
    case 'nudge':
      return solve({ ...m, nudgeDraw: msg.draw });
    case 'kept': {
      // The egg kept and learned from: if its cook is still on screen at
      // Done, thanked for, or, if it could not be kept, its questions put
      // away, since no more could be kept either.
      const cook = m.cook;
      const here = cook !== null && cook.id_ms === msg.id_ms && m.plan !== null && phaseAt(m.plan.deadlines, now_s) === 'DONE';
      const next = here && msg.kept && cook !== null && answered(cook) ? say(m, 'thanks') : m;
      return [here && !msg.kept ? { ...next, questions: 'away' } : next, []];
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------ the cook */

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
      return [next, [...effectsOf(s.cook, s, false, fresh.questions), { kind: 'blip' }]];
    }
    case 'restore': {
      const stored = msg.stored;
      const fresh: Model = {
        ...idle(m), written: JSON.stringify(stored.cook), reloaded: msg.reloaded,
        questions: stored.answers === 'beforeReload' || answered(stored.cook) ? 'away' : 'open',
      };
      const state: CookState = { cook: stored.cook, plan: null, leanHint_s: stored.leanHint_s };
      const [next, effects] = stepCook(fresh, { kind: 'tick', now_s: now_s }, now_s, state);
      // After a reload the alarm died with the old page, and cannot sound
      // before a gesture; a tab the app was moved to was pressed.
      return [next, msg.reloaded ? effects.filter((e) => e.kind !== 'ring') : effects];
    }
    case 'primary': {
      // A correction still settling is committed first: the button acts on
      // the cook as the controls say it is. The alarm stops.
      if (m.cook === null) return [m, []];
      const [at, first] = handIn(m, { kind: 'moveOn', at_s: lastGesture(m), control: 'primary' }, now_s);
      const [next, effects] = pressed(at, now_s);
      return [next, [...first, { kind: 'silence' }, ...effects]];
    }
    case 'cancel': {
      // A correction still settling is committed first, as for any button
      // that moves the cook on: after the pull, the egg Cancel logs has it.
      if (m.cook === null) return [m, []];
      const [at, first] = handIn(m, { kind: 'moveOn', at_s: lastGesture(m), control: 'cancel' }, now_s);
      const [next, effects] = stepCook(at, { kind: 'startAgain', now_s: now_s }, now_s);
      return [next, [...first, ...effects]];
    }
    case 'stillOut': {
      // "Still in the water?" No: the pull stands on the cook as the
      // controls say it is, a correction still settling committed first.
      if (m.cook === null) return [m, []];
      const [at, first] = handIn(m, { kind: 'moveOn', at_s: lastGesture(m), control: 'stillInWater' }, now_s);
      const [next, effects] = stepCook(at, { kind: 'pullStands', now_s: now_s }, now_s);
      return [next, [...first, ...effects]];
    }
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
      // A question answered once stays answered.
      const cook = m.cook;
      if (cook === null) return [m, []];
      const said = answersOf(cook);
      if ((msg.yolkWord !== null && said.yolkWord !== null) || (msg.white !== null && said.white !== null)) return [m, []];
      if (!stillOpen(m, now_s)) return [close(m), []];
      const [next, effects] = stepCook(m, {
        kind: 'answered', now_s: now_s, yolkWord: msg.yolkWord, white: msg.white, probe: msg.probe,
      }, now_s);
      const taken = next.cook !== null && !next.closed && answersGiven(next.cook) > answersGiven(cook);
      if (!taken || (msg.yolkWord === null && msg.white === null)) return [next, effects];
      return [say(next, 'learning'), [...effects, { kind: 'answerTaken', yolkWord: msg.yolkWord, white: msg.white }]];
    }
    case 'probe': {
      // A correction still settling is committed first, by keyboard too:
      // the reading is scored on the cook as the controls say it is.
      const [at, first] = handIn(m, { kind: 'moveOn', at_s: lastGesture(m), control: 'probe' }, now_s);
      const [next, effects] = probeRead(at, msg.reading_C, now_s);
      return [next, [...first, ...effects]];
    }
    default:
      return [m, []];
  }
}

/* ------------------------------------------------- a correction in hand */

/*
 * Corrections mid-cook: when a change is committed is core's (hand.ts,
 * `handStep`), fed here with each gesture and timer; what a commit makes of
 * the cook is core's too (`handChoices`, `previewCook`). What is the web's:
 * the controls the change is on, the settings each group writes, and the
 * egg the change aims for, drawn from a plan of the cook as it would be
 * (`preview`), stored nowhere and ringing nothing.
 *
 * A running cook's controls read its own choices: what they show is
 * `cookControls`, drawn from the cook (`settingsOfChoices`), and a commit lays
 * the group's choices, as the controls say them, over the cook's own, so a
 * field nobody touched keeps the cook's value to the bit and changing a
 * setting back gives back the old plan exactly. The same fields are written
 * to the settings, for the next cook (design section 7, 22).
 */

/** The settings each group of the cook's choices is made from. */
const GROUP_SETTINGS = {
  mass: ['sizeIndex', 'customMinor_mm', 'measuredBy'],
  eggFrom: ['startTempMode'],
  customStart: ['customStart_C'],
  room: ['room_C'],
  startMode: ['startMode'],
  afterBoil: ['afterBoil'],
  cooling: ['cooling'],
  tapWater: ['tapWater_C'],
  bowlLitres: ['bowlLitres'],
  bowlWater: ['bowlWater_C'],
  waterLitres: ['waterLitres'],
  eggCount: ['eggCount'],
  altitude: ['altitude_m'],
  level: ['doneness'],
  startedAt: [],
} as const satisfies Record<HandGroup, readonly (keyof Settings)[]>;

/** The settings a cook's choices make, as the controls show them while it
 *  runs; the rest - the units, the language, the sound and which sound, the
 *  probe - are the kitchen's, not the egg's. */
export type CookSettings = Pick<Settings, (typeof GROUP_SETTINGS)[HandGroup][number]>;

/** Whether a group of the cook's choices makes the setting `k`. */
function ofCook(k: keyof Settings): k is keyof CookSettings {
  for (const g of Object.keys(GROUP_SETTINGS) as HandGroup[]) {
    if ((GROUP_SETTINGS[g] as readonly (keyof Settings)[]).includes(k)) return true;
  }
  return false;
}

/** The last moment the correction in hand knows on the gestures' clock, for
 *  a button pressed: its last change. */
function lastGesture(m: Model): number {
  return m.hand === null || m.hand.changed_s === null ? 0 : m.hand.changed_s;
}

/** The timers of a correction in hand all stopped, for controls drawn afresh
 *  from a cook begun or ended. `fresh` reads no time. */
function handFresh(was: Model): Effect[] {
  return handStep(was.hand ?? nothingInHand(), { kind: 'fresh', at_s: 0 }).timers.map(
    (t): Effect => ({ kind: 'handTimer', timer: t.timer, at_s: t.at_s }),
  );
}

/**
 * `event` handed to the correction in hand, and what it says done: the
 * group it names committed, first; the aimed-for egg planned, or let go
 * with the slider back at the cook's level; its timers set or stopped.
 * Nothing while idle.
 */
function handIn(m: Model, event: HandEvent, now_s: number): [Model, Effect[]] {
  if (m.cook === null || m.hand === null) return [m, []];
  const out = handStep(m.hand, event);
  let next: Model = { ...m, hand: out.state };
  const effects: Effect[] = [];
  if (out.commit !== null) {
    const [after, more] = commit(next, out.commit, now_s);
    next = after;
    effects.push(...more);
  }
  if (out.aim === 'plan') next = preview(next, now_s);
  if (out.aim === 'letGo') next = letGo(next);
  for (const t of out.timers) effects.push({ kind: 'handTimer', timer: t.timer, at_s: t.at_s });
  return [next, effects];
}

/**
 * A control's value changed while a cook runs: what `read` says of the
 * cook's choices taken into the controls; of `group`, a change in hand, its
 * slider's reading drawn at once and the plan's to follow; of no group (the
 * thermometer switch), another control used, and what `read` says of the
 * settings no group makes written now, as the sound is.
 */
function handChanged(
  m: Model, group: HandGroup | null, read: Partial<Settings>, at_s: number, now_s: number,
): [Model, Effect[]] {
  // A cook's controls are set whenever a cook is (`around`). Without them
  // the change would be dropped unseen, a correction lost.
  if (m.cookControls === null) throw new Error('a control changed while a cook runs, and the cook has no controls to take it');
  const cook: Record<string, unknown> = {};
  const own: Record<string, unknown> = {};
  for (const k of Object.keys(read) as (keyof Settings)[]) (ofCook(k) ? cook : own)[k] = read[k];
  const taken: Model = { ...m, cookControls: { ...m.cookControls, ...(cook as Partial<CookSettings>) } };
  if (group === null) {
    const [next, effects] = handIn(taken, { kind: 'moveOn', at_s: at_s, control: 'setting' }, now_s);
    return [{ ...next, settings: { ...next.settings, ...(own as Partial<Settings>) } }, [...effects, { kind: 'save', soon: false }]];
  }
  const [next, effects] = handIn(taken, { kind: 'change', at_s: at_s, group: group }, now_s);
  const level = controlsOf(next).doneness;
  const section = next.aim === null ? null : next.aim.section;
  return [{ ...next, aim: { level: level, peakYolk_C: targetPeakYolk_C(level), solution: null, section: section } }, effects];
}

/** The egg the change in hand aims for, and the slider's reading for it:
 *  planned, held on the drawing, stored nowhere. */
function preview(m: Model, now_s: number): Model {
  const cook = m.cook;
  const group = m.hand === null ? null : m.hand.hand;
  if (cook === null || group === null) return m;
  const start = m.controlsStart_s === null ? cook.startedAt_s : m.controlsStart_s;
  const hand = previewCook(cook, choicesOf(controlsOf(m), REGION), group, start, now_s);
  const plan = replan(hand, m.calib, surfaceFor(m.surfaces, m.plan?.inputs ?? null), m.leanHint_s, now_s);
  const pulled = hand.events.pulled;
  const params = pulled !== null && m.plan !== null
    ? asRanShown(cook, m.plan)?.params ?? calibrationParams(m.calib)
    : calibrationParams(m.calib);
  const time_s = pulled === null ? plan.cookTime_s : pulled.out_s - hand.startedAt_s;
  const white = calibrationDoneness(m.calib, plan.answer.level).whiteDose_min;
  return {
    ...m, aim: {
      level: plan.answer.level, peakYolk_C: plan.solution.result.peakYolk_C, solution: plan.solution,
      section: previewSection(plan.egg, plan.setup, params, time_s, white),
    },
  };
}

/**
 * Commit `group`'s change: the cook corrected (`correct`), and the settings
 * the group makes written for the next cook. A change no correction can make
 * (the level after the pull, core `handChoices`) is neither; the slider goes
 * back to the cook's level when the aimed-for egg goes (`letGo`). The start
 * is the cook's own: a correction of it, and then the start as the cook has
 * it, so one refused leaves the cook's.
 */
function commit(m: Model, group: HandGroup, now_s: number): [Model, Effect[]] {
  const cook = m.cook;
  if (cook === null) return [m, []];
  if (group === 'startedAt') {
    const start = m.controlsStart_s;
    let next = m;
    let effects: Effect[] = [];
    if (start !== null && start !== cook.startedAt_s) {
      [next, effects] = updateCook(m, { kind: 'correct', choices: cook.choices, startedAt_s: start }, now_s);
    }
    return [{ ...next, controlsStart_s: next.cook === null ? null : next.cook.startedAt_s }, effects];
  }
  const controls = controlsOf(m);
  const choices = handChoices(cook, choicesOf(controls, REGION), group);
  if (choices === null) return [m, []];
  let next = m;
  const effects: Effect[] = [];
  if (!sameValue(choices, cook.choices)) {
    const [after, more] = updateCook(m, { kind: 'correct', choices: choices, startedAt_s: null }, now_s);
    next = after;
    effects.push(...more);
  }
  const fields: Record<string, unknown> = {};
  for (const k of GROUP_SETTINGS[group]) fields[k] = controls[k];
  next = { ...next, settings: { ...next.settings, ...(fields as Partial<Settings>) } };
  effects.push({ kind: 'save', soon: false });
  return [next, effects];
}

/** The aimed-for egg let go, and the slider back at the cook's level: one
 *  only previewed after the pull. */
function letGo(m: Model): Model {
  const cook = m.cook;
  const shown = m.cookControls;
  const next: Model = m.aim === null ? m : { ...m, aim: null };
  if (cook === null || shown === null || shown.doneness === cook.choices.level) return next;
  return { ...next, cookControls: { ...shown, doneness: cook.choices.level } };
}

/** The start a minute earlier or later, as far as the cook allows (core
 *  `startStepped`), and the line under it says why a press went no further:
 *  a correction in hand like any other, and committed the same way. */
function startStep(m: Model, up: boolean, at_s: number, now_s: number): [Model, Effect[]] {
  const cook = m.cook;
  const from = m.controlsStart_s;
  if (cook === null || m.hand === null || from === null) return [m, []];
  const stepped = startStepped(cook, from, up, now_s);
  const effects: Effect[] = [{ kind: 'startLimit', limit: stepped.limit }];
  if (stepped.start_s === from) return [m, effects];
  const [after, more] = handIn({ ...m, controlsStart_s: stepped.start_s }, { kind: 'change', at_s: at_s, group: 'startedAt' }, now_s);
  return [after, [...effects, ...more]];
}
