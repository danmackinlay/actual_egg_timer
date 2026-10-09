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
 * the language, the sound, another tab's settings, a pan measured, an egg
 * learned, everything forgotten: each a message, the page solved again after
 * it (`solve`). While a cook runs the controls are its own choices, never
 * the settings, which another tab may have changed since (DECISIONS.md 97);
 * correcting it is edit.ts's.
 *
 * The cook is core's `CookState` (src/core/step.ts): `update` hands it to
 * `step` with each thing that happened. What is the web's own, around it:
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

import type { AlarmMoment, AlarmSound } from '../core/sounds.js';
import type { BoilMemory } from '../core/boil.js';
import type { Decision, DecisionInputs } from '../core/decide.js';
import type { DecidedAnswer, LevelAnswer, OddsProfile } from '../core/reach.js';
import type { Outcome } from '../core/outcome.js';
import type { Solution } from '../core/solve.js';
import type { CertaintyReading } from '../core/certainty.js';
import { CARRYOVER_WINDOW } from '../core/constants.js';
import { EggSection, SectionView, advanceSection, createSection } from '../core/section.js';
import type { WhiteReport, YolkWord } from '../core/infer.js';
import type { Calibration, EggRecord, ProbeReading, Units } from '../core/record.js';
import type { BoilToRemember, CookChoices, CookSurface, RunningCook } from '../core/running.js';
import {
  answered, answersOf, asRanCurrent, asRanShown, asksIfStillIn, cookFactsFor, cookStillOpen, endedAt_s, phaseAt,
  plausibleProbeRange_C, takeUpEvents,
} from '../core/running.js';
import { calibrationParams, probeReadingFor, recordCookTime_s, recordFor } from '../core/record.js';
import type { CookBefore, CookEnv, CookEvent, CookNeed, CookState, CookStep } from '../core/step.js';
import { step } from '../core/step.js';
import type { UnitSystem } from '../core/units.js';
import { chooseUnits } from '../core/units.js';
import type { LanguageState } from '../core/language.js';
import { effectiveLanguage, languageAfterFlip } from '../core/language.js';
import { PotOdds, nudgeNow, solveIdle } from './answer.js';
import { inputsKey } from '../core/decide.js';
import { NO_NEED, idleChoices, isSousVide, settingsOfChoices, sizeClasses } from './state.js';
import type { KeptAnswers, Settings, StoredCook } from './store.js';
import { REGIONAL_UNITS } from './units.js';

export { NO_NEED } from './state.js';

/** A correction in hand: the slider's reading for it, the plan's solve,
 *  and the egg it aims for, once planned. */
export interface Aim {
  level: number;
  peakYolk_C: number;
  solution: Solution | null;
  section: SectionView | null;
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
export interface Ending extends CookState {
  need: CookNeed;
}

/** What the page holds. The running cook is core's `CookState`: `cook`, its
 *  `plan` and the lean (`leanHint_s`), all null and 0 while idle. */
export interface Model extends CookState {
  /** The settings: the next cook's choices, and the page's own (the units,
   *  the language, the sound). Replaced, never changed in place. */
  settings: Settings;
  /** What the controls show: a copy of the settings while idle; while a
   *  cook runs, its own choices over a copy of them (`settingsOfChoices`),
   *  with a correction in hand on them, never the settings, which another
   *  tab may have changed since. */
  controls: Settings;
  boilMemory: BoilMemory;
  /** The posterior over the model's uncertain constants, folded IN PLACE as
   *  eggs are learned (calibration.ts). */
  calib: Calibration;
  /** Whether sharing is on (the nudge, the Learning mark), and whether a
   *  newer build's stores are left alone (store.ts): the runner's view of
   *  those stores, taken before each message. */
  sharing: boolean;
  readOnly: boolean;
  /** The stored cook's id as this tab reads it, for whether its egg is
   *  still open (this cook's own when storage does not work): the runner's
   *  view, taken before each message while a cook runs. */
  storedId_ms: number | null;
  /** A deletion of what was shared, asked for on this page, confirmed: said
   *  under the switch until sharing is turned on again. */
  deletedHere: boolean;
  /** The odds profiles built on the calibration as it stands, for any pot:
   *  the runner's view of its caches, like `surfaces`. */
  profiles: PotOdds[];
  /** The idle screen's answer: the answer at the level asked (its verdict
   *  is the warning line), the solve behind the time on screen, the choice
   *  and the outcome at it, and the whole of it as core decided it
   *  (`decideAnswer`); the last three null until the pot's surface is in,
   *  and on the sous-vide screen. */
  idleAnswer: LevelAnswer | null;
  solution: Solution | null;
  decision: Decision | null;
  outcome: Outcome | null;
  chosen: DecidedAnswer | null;
  /** The odds at every level for the idle pot and the posterior as it
   *  stands; null until worked out. */
  profile: OddsProfile | null;
  /** The controls changed since the idle page was last solved: the slider's
   *  reading is the level's own until the solve lands. */
  unsolved: boolean;
  /** While a correction is in hand mid-cook (edit.ts), the slider's reading
   *  for it, from a plan of the cook as it would be, and the egg it aims for
   *  (`previewSection`), once planned; null otherwise. */
  aim: Aim | null;
  /** When the eggs went in, as the controls show it while a cook runs; null
   *  while idle. */
  controlsStart_s: number | null;
  /** This page's nudge (E8): drawn at boot and after each cook. */
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

  /** This tab's cook as written down: as this tab last read or wrote it
   *  (JSON), so it is written only when it changed (`update` sets it with
   *  each write it asks for); whether the last write read back, as the
   *  runner says (`persisted`); and whether the egg is final here
   *  (`closed`): nothing more is written or logged for it. */
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
  | { kind: 'elsewhere'; theirs: StoredCook | null }
  /** A probe reading typed at Done, C; null for what is not a number. */
  | { kind: 'probe'; reading_C: number | null }
  | { kind: 'restore'; stored: StoredCook }
  /** A correction in hand, planned or let go (edit.ts); `level`, the slider
   *  back at the cook's own after a level only previewed. */
  | { kind: 'aim'; aim: Aim | null; level: number | null }
  /** When the eggs went in, as the start's − and + have it (edit.ts), or as
   *  the cook has it again. */
  | { kind: 'startInHand'; at_s: number | null }
  /** The egg of the cook `id_ms` kept in the log, or not (`keepRecord`). */
  | { kind: 'kept'; id_ms: number | null; kept: boolean }
  /* The page. */
  /** Start, on the idle page: the cook the settings describe, at the time
   *  on screen, in these units and words. */
  | { kind: 'begin'; units: Units; lang: string }
  /** The controls as the page now shows them (input.ts). */
  | { kind: 'controls'; controls: Settings }
  /** Fields of the settings a correction changed, for the next cook. */
  | { kind: 'touched'; fields: Partial<Settings> }
  | { kind: 'units'; system: UnitSystem }
  | { kind: 'language'; next: LanguageState }
  | { kind: 'mute' }
  | { kind: 'alarm'; sound: AlarmSound }
  /** The settings with another tab's write taken up (store.ts). */
  | { kind: 'settingsTaken'; settings: Settings }
  /** The pans remembered: a boil this page measured (`quiet`), or another
   *  tab's. */
  | { kind: 'pans'; boilMemory: BoilMemory; quiet: boolean }
  /** A new posterior, everything forgotten, and the pans with it. */
  | { kind: 'calibration'; calib: Calibration; boilMemory: BoilMemory }
  /** Eggs folded: the idle page solved again, and what is said of what has
   *  been learned drawn again. */
  | { kind: 'learned' }
  /** Every word on the page in a new language: as `learned`, and the words
   *  drawn only when they change drawn again. */
  | { kind: 'relabelled' }
  /** What another store holds changed - another tab's log or sharing,
   *  sharing turned on or off, a newer build's mark: as `learned`, and the
   *  sharing section drawn again. */
  | { kind: 'stores' }
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
  | { kind: 'thanks' }
  | { kind: 'learning' }
  /** An answer taken: its row settles on the button pressed. */
  | { kind: 'answerTaken'; yolkWord: YolkWord | null; white: WhiteReport | null }
  /** A probe reading refused, with the range it should be in, C; or taken. */
  | { kind: 'probeRefused'; low_C: number; high_C: number }
  | { kind: 'probeTaken'; reading_C: number }
  /** A cook begun or ended: its correction's bookkeeping (edit.ts). */
  | { kind: 'editsStart' }
  | { kind: 'editsEnd' }
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
  /** The controls written from the model: all of them, every field with a
   *  unit, the slider, the alarm's choice. */
  | { kind: 'controlsDrawn' }
  | { kind: 'unitsDrawn' }
  | { kind: 'donenessDrawn' }
  | { kind: 'alarmDrawn' }
  | { kind: 'previewAlarm' }
  /** The words drawn only when they change, forgotten: a new language. */
  | { kind: 'wordsForgotten' }
  /** What is said of what has been learned (the note over the questions
   *  and in Settings, or Settings' alone), and the sharing section. */
  | { kind: 'notesDrawn' }
  | { kind: 'learnedDrawn' }
  | { kind: 'shareDrawn' }
  /** A new nudge to draw; everything learned to forget. */
  | { kind: 'drawNudge' }
  | { kind: 'forgetAll' }
  /** The results file saved; sharing turned on or off; what was shared
   *  deleted. */
  | { kind: 'export' }
  | { kind: 'setSharing'; on: boolean }
  | { kind: 'deleteShared' };

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
function stillOpen(m: Model, now_s: number): boolean {
  return m.cook !== null && m.plan !== null && !m.closed && cookStillOpen(m.cook, m.plan, m.storedId_ms, now_s);
}

/**
 * A probe reading typed at Done. Scored against the egg's record as core
 * makes it (`cookFactsFor`, `recordFor`: the record a step logs, with the
 * same context): refused, with the range it should be in, when no
 * believable kitchen could have made it for this cook
 * (`plausibleProbeRange_C`), bounded by the model the cook ran under, not
 * one that has since folded this egg's own answer (review 2.4); otherwise
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
  if (made.facts === null) return [{ ...m, probeHeld: true }, [{ kind: 'learning' }]];
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

/** How many answers a cook's log holds. */
function answersGiven(cook: RunningCook): number {
  return cook.log.filter((e) => e.kind === 'answered').length;
}

/** The egg final here: its questions go, and nothing more is written or
 *  logged for it. */
function close(m: Model): Model {
  return { ...m, closed: true, questions: 'away' };
}

/** What `msg` does to the model at `now_ms`, and what the page must do. */
export function update(m: Model, msg: Msg, now_ms: number): [Model, Effect[]] {
  const now_s = now_ms / 1000;
  const [next, effects] = written(...updateAny(m, msg, now_s));
  return [shown(next, now_s), effects];
}

/**
 * The cook on screen written only when it changed - something it was told
 * or saw, never a plan alone, which would write a copy lacking what another
 * tab on the same cook saw since: otherwise only the lean beside it. What it
 * is written as is what this tab has seen (`written`).
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
  if (page !== null) return page;
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
  if (inputs === null) return null;
  const key = inputsKey(inputs);
  for (const s of m.surfaces) if (inputsKey(s.inputs) === key) return s.profile;
  return null;
}

/**
 * The egg in the water now, carried forward a tick at a time (core
 * `advanceSection`) and replayed from raw when the cook's pot or start
 * changes, on through the cooling: at the posterior mean, the same egg the
 * countdown times, in the pot its plan has now; once the egg is out, with
 * the model's parameters it ran under, so a fold of this egg's own answer
 * does not redraw it (review 2.4). Not while a correction's aim is drawn in
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
 * choices, never the settings (review 2.5) - at the start, where they are the
 * same, and after a reload, where another tab may have changed the settings
 * since. Ended: they show the settings again (another tab may have changed
 * them meanwhile), the alarm stops, the questions start empty, a new cook
 * gets a new nudge (and the idle page is solved again with it), and the egg
 * just finished is final once it is forgotten: no answer can be added to
 * it.
 */
function around(was: Model, m: Model, effects: Effect[]): [Model, Effect[]] {
  if (was.cook === null && m.cook !== null) {
    const next: Model = {
      ...m, controls: settingsOfChoices(m.settings, m.cook.choices, sizeClasses), controlsStart_s: m.cook.startedAt_s,
    };
    return [next, [...effects, { kind: 'controlsDrawn' }, { kind: 'editsStart' }]];
  }
  if (was.cook !== null && m.cook === null) {
    const next: Model = { ...m, controls: { ...m.settings }, controlsStart_s: null, aim: null };
    return [next, [
      ...effects, { kind: 'editsEnd' }, { kind: 'silence' }, { kind: 'questionsReset' }, { kind: 'controlsDrawn' },
      { kind: 'drawNudge' }, { kind: 'shareDrawn' },
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
  if (isSousVide(m)) {
    return [{ ...m, idleAnswer: null, chosen: null, decision: null, outcome: null, profile: null, unsolved: false }, []];
  }
  const s = solveIdle(m);
  const effects: Effect[] = [];
  let settings = m.settings;
  let controls = m.controls;
  const snapTo = s.answer.verdict.snapTo;
  if (snapTo !== null && snapTo !== settings.doneness) {
    settings = { ...settings, doneness: snapTo };
    controls = { ...controls, doneness: snapTo };
    effects.push({ kind: 'donenessDrawn' }, { kind: 'save', soon: false });
  }
  if (s.surface !== null) effects.push({ kind: 'askSurface', inputs: s.surface });
  for (const inputs of s.profiles) effects.push({ kind: 'askProfile', inputs: inputs });
  const chosen = s.chosen;
  return [{
    ...m, settings: settings, controls: controls, idleAnswer: s.answer, profile: s.profile, chosen: chosen,
    solution: chosen?.solution ?? s.answer.solution, decision: chosen?.decision ?? null,
    outcome: chosen?.outcome ?? null, unsolved: false,
  }, effects];
}

/** `m` with these settings: the controls a copy of them while idle; while a
 *  cook runs, only what the cook does not hold - the units, the language,
 *  the sound and which sound. */
function withSettings(m: Model, settings: Settings): Model {
  const c = m.controls;
  const controls = m.cook === null ? { ...settings } : {
    ...c, unitsChosen: settings.unitsChosen, language: settings.language, muted: settings.muted, alarm: settings.alarm,
  };
  return { ...m, settings: settings, controls: controls };
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
      const chosen = at.chosen;
      const [next, more] = updateCook(at, {
        kind: 'start', choices: idleChoices(at), nudge_s: nudgeNow(at), units: msg.units, lang: msg.lang,
        leanHint_s: chosen === null ? 0 : chosen.decision.cookTime_s - chosen.decision.meanCookTime_s,
      }, now_s);
      return around(m, next, [...effects, ...more]);
    }
    case 'controls': {
      // While a cook runs the controls are its correction in hand, written
      // to the settings when it is committed (edit.ts), not before.
      if (m.cook !== null) return [{ ...m, controls: msg.controls }, []];
      return [
        { ...m, controls: msg.controls, settings: { ...msg.controls }, unsolved: true },
        [{ kind: 'save', soon: true }, { kind: 'solveSoon' }],
      ];
    }
    case 'touched':
      return [{ ...m, settings: { ...m.settings, ...msg.fields } }, [{ kind: 'save', soon: false }]];
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
      effects.push({ kind: 'save', soon: false }, { kind: 'unitsDrawn' });
      const next = m.cook === null ? withSettings(m, settings) : { ...m, settings: settings };
      return solved(next, effects);
    }
    case 'language': {
      // Nothing about the egg changes, and the units are never touched from
      // here: that rule runs one way (LANGUAGE.md section 6).
      const before = effectiveLanguage(m.settings.language);
      const settings = { ...m.settings, language: msg.next };
      const next = m.cook === null ? withSettings(m, settings) : { ...m, settings: settings };
      return [next, [{ kind: 'save', soon: false }, { kind: 'language', before: before }]];
    }
    case 'mute': {
      // Sound is a setting, not a phase: the toggle works mid-cook.
      const settings = { ...m.settings, muted: !m.settings.muted };
      return [m.cook === null ? withSettings(m, settings) : { ...m, settings: settings }, [{ kind: 'save', soon: false }]];
    }
    case 'alarm': {
      // Like the sound itself, a setting about the kitchen, not the egg, so
      // it holds mid-cook; heard as it is picked.
      const settings = { ...m.settings, alarm: msg.sound };
      return [
        { ...m, settings: settings, controls: { ...m.controls, alarm: msg.sound } },
        [{ kind: 'previewAlarm' }, { kind: 'save', soon: false }],
      ];
    }
    case 'settingsTaken': {
      // Another tab's settings: the units, the sound and the words follow,
      // and an idle page's controls follow and it is solved again. A cook
      // under way is described by its own choices, never by the settings
      // (DECISIONS.md 97; review 2.5).
      const before = effectiveLanguage(m.settings.language);
      const next = withSettings(m, msg.settings);
      const effects: Effect[] = m.cook === null ? [{ kind: 'controlsDrawn' }] : [{ kind: 'alarmDrawn' }];
      if (m.cook !== null && msg.settings.unitsChosen !== m.settings.unitsChosen) effects.push({ kind: 'unitsDrawn' });
      effects.push({ kind: 'language', before: before });
      return solved(next, effects);
    }
    case 'pans':
      return msg.quiet ? [{ ...m, boilMemory: msg.boilMemory }, []]
        : solved({ ...m, boilMemory: msg.boilMemory }, [{ kind: 'learnedDrawn' }]);
    case 'calibration':
      return solved({ ...m, calib: msg.calib, boilMemory: msg.boilMemory }, [{ kind: 'notesDrawn' }]);
    case 'learned':
      return solved(m, [{ kind: 'notesDrawn' }]);
    case 'relabelled':
      return solved(m, [{ kind: 'wordsForgotten' }, { kind: 'notesDrawn' }]);
    case 'startInHand':
      return [{ ...m, controlsStart_s: msg.at_s }, []];
    case 'persisted':
      return [{ ...m, works: msg.works }, []];
    case 'stores':
      return solved(m, [{ kind: 'notesDrawn' }, { kind: 'shareDrawn' }]);
    case 'forget':
      return [m, [{ kind: 'forgetAll' }]];
    case 'export':
      return [m, [{ kind: 'export' }]];
    case 'shareOn':
      return [{ ...m, deletedHere: false }, [{ kind: 'setSharing', on: msg.on }]];
    case 'shareDelete':
      return [m, [{ kind: 'deleteShared' }]];
    case 'shareDeleted':
      return solved({ ...m, deletedHere: msg.confirmed }, [{ kind: 'shareDrawn' }]);
    case 'shared':
      // Turning sharing on or off moves the time by the nudge.
      return solved(m, [{ kind: 'shareDrawn' }]);
    case 'nudge':
      return solve({ ...m, nudgeDraw: msg.draw });
    case 'aim': {
      // A level the slider only previewed after the pull goes back to the
      // cook's own as the aim goes.
      if (msg.level === null) return [{ ...m, aim: msg.aim }, []];
      return [{ ...m, aim: msg.aim, controls: { ...m.controls, doneness: msg.level } }, [{ kind: 'donenessDrawn' }]];
    }
    case 'kept': {
      // The egg kept and learned from: if its cook is still on screen at
      // Done, thanked for, or, if it could not be kept, its questions put
      // away, since no more could be kept either.
      const cook = m.cook;
      const here = cook !== null && cook.id_ms === msg.id_ms && m.plan !== null && phaseAt(m.plan.deadlines, now_s) === 'DONE';
      const effects: Effect[] = here && msg.kept && cook !== null && answered(cook) ? [{ kind: 'thanks' }] : [];
      effects.push({ kind: 'learnedDrawn' });
      return [here && !msg.kept ? { ...m, questions: 'away' } : m, effects];
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
      return [next, [...effects, { kind: 'answerTaken', yolkWord: msg.yolkWord, white: msg.white }, { kind: 'learning' }]];
    }
    case 'probe':
      return probeRead(m, msg.reading_C, now_s);
    case 'elsewhere': {
      if (m.cook === null || m.plan === null || m.closed) return [m, []];
      if (phaseOf(m, now_s) === 'DONE' && !stillOpen(m, now_s)) return [close(m), []];
      return msg.theirs === null ? [m, []] : takeUp(m, msg.theirs, now_s);
    }
    default:
      return [m, []];
  }
}
