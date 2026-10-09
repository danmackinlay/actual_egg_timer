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
 * the settings, which another tab may have changed since:
 * a change to them is a correction, held in hand until it is committed
 * (`Edit`; the gestures are edit.ts's).
 *
 * The cook is core's `CookState` (src/core/step.ts): `update` hands it to
 * `step` with each thing that happened. What is the web's own, around it:
 *
 * - The primary button reads the phase: the boil at Heating, the egg out at
 *   Pull, "still in" while the plan asks, Start again at Done.
 * - Another tab's copy of this cook (`elsewhere`): what it saw in the pan
 *   taken up (`takeUpEvents`) and planned on, and the pull rung here if this
 *   tab never rang it. Never another cook.
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
import type { ShareState } from '../core/share.js';
import type { Solution } from '../core/solve.js';
import type { CertaintyReading } from '../core/certainty.js';
import { CARRYOVER_WINDOW } from '../core/constants.js';
import { EggSection, SectionView, advanceSection, createSection, previewSection } from '../core/section.js';
import type { WhiteReport, YolkWord } from '../core/infer.js';
import type { Calibration, EggRecord, ProbeReading, Units } from '../core/record.js';
import type { BoilToRemember, CookChoices, CookSurface, RunningCook } from '../core/running.js';
import {
  answered, answersOf, asRanCurrent, asRanShown, asksIfStillIn, cookFactsFor, cookStillOpen, corrected, earliestStart_s,
  endedAt_s, latestStart_s, levelPreview, phaseAt, plausibleProbeRange_C, replan, sameChoices, startCorrected,
  takeUpEvents,
} from '../core/running.js';
import { calibrationDoneness, calibrationParams, probeReadingFor, recordCookTime_s, recordFor } from '../core/record.js';
import type { CookBefore, CookEnv, CookEvent, CookNeed, CookState, CookStep } from '../core/step.js';
import { step, surfaceFor } from '../core/step.js';
import type { UnitSystem } from '../core/units.js';
import { chooseUnits } from '../core/units.js';
import { effectiveLanguage, languageAfterFlip, languageAfterPick } from '../core/language.js';
import { PotOdds, nudgeNow, solveIdle } from './answer.js';
import { inputsKey } from '../core/decide.js';
import { targetPeakYolk_C } from '../core/slider.js';
import { NO_NEED, choicesOf, idleChoices, isSousVide, settingsOfChoices, sizeClasses } from './state.js';
import type { KeptAnswers, Settings, StoredCook } from './store.js';
import { REGION, REGIONAL_UNITS } from './units.js';

export { NO_NEED } from './state.js';

/** A correction in hand: the slider's reading for it, the plan's solve,
 *  and the egg it aims for, once planned. */
export interface Aim {
  level: number;
  peakYolk_C: number;
  solution: Solution | null;
  section: SectionView | null;
}

/** A correction in hand mid-cook, and the gesture making it (design/one-
 *  screen.md sections 3 to 5): see "A correction in hand" below. */
export interface Edit {
  /** The controls as last drawn from the cook, or committed: a field that
   *  differs from this is one the cook changed. */
  base: Settings;
  /** Whether the controls hold a change not yet committed. */
  pending: boolean;
  /** The control the change in hand came from (edit.ts, `groupOf`), so
   *  touching another commits it. */
  group: number | null;
  /** The controls and the start as the change in hand left them: what is
   *  committed, without it, when another control's change comes. */
  inHand: InHand | null;
  /** A finger down on a control: when (real ms), on which, and whether it
   *  is the slider. */
  down: { at_ms: number; group: number; slider: boolean } | null;
  /** When the last change came, real ms. */
  changed_ms: number;
  /** The slider moved after the pull, previewed and not corrected: it goes
   *  back to the cook's level when the aimed-for egg goes. */
  previewedLevel: boolean;
  /** A plan of the aimed-for egg asked for and not yet made. */
  previewing: boolean;
}

interface InHand {
  controls: Settings;
  start: number | null;
}

/** The timers of a correction in hand: the settle before it is committed,
 *  the plan of the egg it aims for, and the aimed-for egg let go. */
export type EditTimer = 'settle' | 'preview' | 'release';

/** Where the start's − and + stopped, for the line under them. */
export type StartLimit = { kind: 'now' | 'boil' | 'pull' | 'earliest'; at_s: number };

/**
 * The parts of the page drawn again only when `update` says so, each a
 * count it bumps and the view draws the part when its count moves (view.ts,
 * render.ts): the controls written whole from the model (`controls`); every
 * field with a unit, in the units on screen (`units`); the slider
 * (`doneness`); the alarm's choice (`alarm`); the controls that follow a
 * change, but the field it came from (`echo`, `echoSource`); what is said of
 * what has been learned, in Settings (`learned`); the sharing section
 * (`share`); the words drawn only when they change, after a new language
 * (`words`). A field the cook is typing in is never written under them.
 */
export type Part = 'controls' | 'units' | 'doneness' | 'alarm' | 'echo' | 'learned' | 'share' | 'words';
export type Redraws = Record<Part, number>;

/** The line over the questions, as last said: what has been learned, "thank
 *  you" for the egg kept, or "learning" for an answer taken; `rev` moves
 *  each time it is said. */
export interface Note {
  rev: number;
  say: 'learned' | 'thanks' | 'learning';
}

/** Sharing as the runner last read it: its state, and how many of the log's
 *  eggs are final. */
export interface ShareSeen {
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
  /** Sharing as the runner read it before this message; null before boot. */
  share: ShareSeen | null;
  /** The parts drawn again only when they are asked for, and the line over
   *  the questions. */
  redraws: Redraws;
  echoSource: string | null;
  note: Note;
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
  /** While a correction is in hand mid-cook, the slider's reading for it,
   *  from a plan of the cook as it would be, and the egg it aims for
   *  (`previewSection`), once planned; null otherwise. */
  aim: Aim | null;
  /** The correction in hand and its gesture, while a cook runs; null while
   *  idle. */
  edit: Edit | null;
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
  /** A finger down on a control (edit.ts, `groupOf`), or lifted; the page
   *  hidden or gone, which commits a change still settling; a timer of the
   *  correction in hand come round. Real ms. */
  | { kind: 'fingerDown'; group: number; slider: boolean; real_ms: number }
  | { kind: 'fingerUp'; real_ms: number }
  | { kind: 'commit' }
  | { kind: 'editTimer'; timer: EditTimer }
  /** The start's − or +: a minute earlier or later, as far as the cook
   *  allows. */
  | { kind: 'startStep'; up: boolean; group: number | null; real_ms: number }
  /** The egg of the cook `id_ms` kept in the log, or not (`keepRecord`). */
  | { kind: 'kept'; id_ms: number | null; kept: boolean }
  /* The page. */
  /** Start, on the idle page: the cook the settings describe, at the time
   *  on screen, in these units and words. */
  | { kind: 'begin'; units: Units; lang: string }
  /** What the controls now say (input.ts), as far as they say it, changed
   *  on the field `source` of control `group` (edit.ts, `groupOf`) at
   *  `real_ms`. */
  | { kind: 'controls'; read: Partial<Settings>; source: string | null; group: number | null; real_ms: number }
  | { kind: 'units'; system: UnitSystem }
  /** A language picked in Settings. */
  | { kind: 'language'; pick: string }
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
  /** A surface landed: a probe reading held for want of the egg's record
   *  read again. */
  | { kind: 'retryProbe' }
  /** An answer taken: its row settles on the button pressed. */
  | { kind: 'answerTaken'; yolkWord: YolkWord | null; white: WhiteReport | null }
  /** A probe reading refused, with the range it should be in, C; or taken. */
  | { kind: 'probeRefused'; low_C: number; high_C: number }
  | { kind: 'probeTaken'; reading_C: number }
  /** A timer of the correction in hand set for `at_ms` (real), or with
   *  null, stopped; all of them stopped; the line under the start's time,
   *  why a press went no further, or nothing. */
  | { kind: 'editTimer'; timer: EditTimer; at_ms: number | null }
  | { kind: 'editTimersOff' }
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
  /** The controls written from the model: all of them, every field with a
   *  unit, the slider, the alarm's choice. */
  | { kind: 'previewAlarm' }
  /** The words drawn only when they change, forgotten: a new language. */
  /** What is said of what has been learned (the note over the questions
   *  and in Settings, or Settings' alone), and the sharing section. */
  /** A new nudge to draw; everything learned to forget. */
  | { kind: 'drawNudge' }
  | { kind: 'forgetAll' }
  /** The results file saved; sharing turned on or off; what was shared
   *  deleted. */
  | { kind: 'export' }
  | { kind: 'setSharing'; on: boolean }
  | { kind: 'deleteShared' };

/** `m` with these parts to be drawn again. */
function redraw(m: Model, ...parts: Part[]): Model {
  const r = { ...m.redraws };
  for (const p of parts) r[p] += 1;
  return { ...m, redraws: r };
}

/** `m` with the line over the questions saying `say`. */
function say(m: Model, say: Note['say']): Model {
  return { ...m, note: { rev: m.note.rev + 1, say: say } };
}

/** What has been learned said again: over the questions, and in Settings. */
function learnedSaid(m: Model): Model {
  return redraw(say(m, 'learned'), 'learned');
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
export type Seen = Pick<Model, 'surfaces' | 'profiles' | 'sharing' | 'readOnly' | 'storedId_ms' | 'share'>;

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
 * choices, never the settings - at the start, where they are the
 * same, and after a reload, where another tab may have changed the settings
 * since - with nothing in hand. Ended: whatever was in hand goes with it;
 * they show the settings again (another tab may have changed them
 * meanwhile), the alarm stops, the questions start empty, a new cook
 * gets a new nudge (and the idle page is solved again with it), and the egg
 * just finished is final once it is forgotten: no answer can be added to
 * it.
 */
function around(was: Model, m: Model, effects: Effect[]): [Model, Effect[]] {
  if (was.cook === null && m.cook !== null) {
    const controls = settingsOfChoices(m.settings, m.cook.choices, sizeClasses);
    const next: Model = { ...m, controls: controls, controlsStart_s: m.cook.startedAt_s, aim: null, edit: freshEdit(controls) };
    return [redraw(next, 'controls'), [...effects, { kind: 'editTimersOff' }, { kind: 'startLimit', limit: null }]];
  }
  if (was.cook !== null && m.cook === null) {
    const next: Model = { ...m, controls: { ...m.settings }, controlsStart_s: null, aim: null, edit: null };
    return [redraw(next, 'controls', 'share'), [
      ...effects, { kind: 'editTimersOff' }, { kind: 'startLimit', limit: null }, { kind: 'silence' },
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
  if (isSousVide(m)) {
    return [{ ...m, idleAnswer: null, chosen: null, decision: null, outcome: null, profile: null, unsolved: false }, []];
  }
  const s = solveIdle(m);
  const effects: Effect[] = [];
  let settings = m.settings;
  let controls = m.controls;
  let at = m;
  const snapTo = s.answer.verdict.snapTo;
  if (snapTo !== null && snapTo !== settings.doneness) {
    settings = { ...settings, doneness: snapTo };
    controls = { ...controls, doneness: snapTo };
    at = redraw(m, 'doneness');
    effects.push({ kind: 'save', soon: false });
  }
  if (s.surface !== null) effects.push({ kind: 'askSurface', inputs: s.surface });
  for (const inputs of s.profiles) effects.push({ kind: 'askProfile', inputs: inputs });
  const chosen = s.chosen;
  return [{
    ...at, settings: settings, controls: controls, idleAnswer: s.answer, profile: s.profile, chosen: chosen,
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
      return [next, [...effects, ...more]];
    }
    case 'controls': {
      // While a cook runs the controls are its correction in hand, written
      // to the settings when it is committed, not before. The controls that
      // follow it are drawn again, but the field it came from.
      const echoed: Model = { ...redraw(m, 'echo'), echoSource: msg.source };
      const controls = { ...m.controls, ...msg.read };
      if (m.cook !== null) return handChanged({ ...echoed, controls: controls }, msg.group, msg.real_ms, now_s);
      return [
        { ...echoed, controls: controls, settings: { ...controls }, unsolved: true },
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
      const next = m.cook === null ? withSettings(m, settings) : { ...m, settings: settings };
      return solved(redraw(next, 'units'), effects);
    }
    case 'language': {
      // Nothing about the egg changes, and the units are never touched from
      // here: that rule runs one way (LANGUAGE.md section 6).
      const before = effectiveLanguage(m.settings.language);
      const settings = { ...m.settings, language: languageAfterPick(m.settings.language, msg.pick) };
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
      // under way is described by its own choices, never by the settings.
      const before = effectiveLanguage(m.settings.language);
      let next = withSettings(m, msg.settings);
      if (m.cook === null) next = redraw(next, 'controls');
      else next = redraw(next, 'alarm');
      if (m.cook !== null && msg.settings.unitsChosen !== m.settings.unitsChosen) next = redraw(next, 'units');
      return solved(next, [{ kind: 'language', before: before }]);
    }
    case 'pans':
      return msg.quiet ? [{ ...m, boilMemory: msg.boilMemory }, []]
        : solved(redraw({ ...m, boilMemory: msg.boilMemory }, 'learned'), []);
    case 'calibration':
      return solved(learnedSaid({ ...m, calib: msg.calib, boilMemory: msg.boilMemory }), []);
    case 'learned':
      return solved(learnedSaid(m), []);
    case 'relabelled':
      // Every word again: the fields with a unit, those drawn only when they
      // change, and what is said of what has been learned.
      return solved(learnedSaid(redraw(m, 'units', 'words')), []);
    case 'fingerDown':
      return fingerDown(m, msg.group, msg.slider, msg.real_ms, now_s);
    case 'fingerUp':
      return fingerUp(m, msg.real_ms, now_s);
    case 'commit':
      return commit(m, null, now_s);
    case 'editTimer':
      return msg.timer === 'settle' ? commit(m, null, now_s) : msg.timer === 'preview' ? preview(m, now_s) : release(m);
    case 'startStep':
      return startStep(m, msg.up, msg.group, msg.real_ms, now_s);
    case 'persisted':
      return [{ ...m, works: msg.works }, []];
    case 'stores':
      return solved(redraw(learnedSaid(m), 'share'), []);
    case 'forget':
      return [m, [{ kind: 'forgetAll' }]];
    case 'export':
      return [m, [{ kind: 'export' }]];
    case 'shareOn':
      return [{ ...m, deletedHere: false }, [{ kind: 'setSharing', on: msg.on }]];
    case 'shareDelete':
      return [m, [{ kind: 'deleteShared' }]];
    case 'shareDeleted':
      return solved(redraw({ ...m, deletedHere: msg.confirmed }, 'share'), []);
    case 'shared':
      // Turning sharing on or off moves the time by the nudge.
      return solved(redraw(m, 'share'), []);
    case 'nudge':
      return solve({ ...m, nudgeDraw: msg.draw });
    case 'kept': {
      // The egg kept and learned from: if its cook is still on screen at
      // Done, thanked for, or, if it could not be kept, its questions put
      // away, since no more could be kept either.
      const cook = m.cook;
      const here = cook !== null && cook.id_ms === msg.id_ms && m.plan !== null && phaseAt(m.plan.deadlines, now_s) === 'DONE';
      const thanked = here && msg.kept && cook !== null && answered(cook) ? say(m, 'thanks') : m;
      const next = redraw(thanked, 'learned');
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
        ...idle(m), written: JSON.stringify(stored.cook), reloaded: true,
        questions: stored.answers === 'beforeReload' || answered(stored.cook) ? 'away' : 'open',
      };
      const state: CookState = { cook: stored.cook, plan: null, leanHint_s: stored.leanHint_s };
      const [next, effects] = stepCook(fresh, { kind: 'tick', now_s: now_s }, now_s, state);
      // The alarm died with the old page, and cannot sound before a gesture.
      return [next, effects.filter((e) => e.kind !== 'ring')];
    }
    case 'primary': {
      // A correction still settling is committed first: the button acts on
      // the cook as the controls say it is. The alarm stops.
      if (m.cook === null) return [m, []];
      const [at, first] = commit(m, null, now_s);
      const [next, effects] = pressed(at, now_s);
      return [next, [...first, { kind: 'silence' }, ...effects]];
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
      return [say(next, 'learning'), [...effects, { kind: 'answerTaken', yolkWord: msg.yolkWord, white: msg.white }]];
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

/* ------------------------------------------------- a correction in hand */

/*
 * Corrections mid-cook (design/one-screen.md sections
 * 3 to 5): every control on the one screen stays open after Start, and a
 * change to one is a correction, "it was always like this" - the cook's
 * choices replaced (core `corrected`) and the whole cook planned again from
 * its start.
 *
 * A change is not committed at every step: each would stamp the
 * cook, plan again, write it and the settings, and a drag through an overdue
 * level would ring mid-drag. While the cook's finger is on a control the
 * change is in hand: the controls and the sentence show it, and the egg in
 * cross-section shows the egg it aims for, from a plan of the cook as it
 * would be that stores nothing and rings nothing (`preview`). It is
 * committed
 *
 * - on release, for the slider, and for a − or + held long enough to repeat;
 * - after a tap's settle (`SETTLE_MS`, about 1.5 s, design section 5) for
 *   anything else - a choice in a clause's panel, a − or + pressed once, a
 *   number typed - the settle starting again with each change;
 * - at once when another control is touched, or the primary button pressed:
 *   the change in hand alone, as it was before the other control's, whether a
 *   finger or the keyboard moves on;
 * - and when the page is hidden or goes, so a reload or a closed tab inside
 *   the settle loses nothing.
 *
 * Overdue is decided only on commit, by the plan of the committed cook
 * (`correct`). The aimed-for egg stays for a settle after the last change,
 * then the live egg comes back.
 *
 * A running cook's controls read its own choices: what they show
 * is `controls`, drawn from the cook (`settingsOfChoices`), and a correction
 * is the fields the cook changed on them, laid over the cook's own choices,
 * so a field nobody touched keeps the cook's value to the bit and changing a
 * setting back gives back the old plan exactly. The same fields are written
 * to the settings, for the next cook (design section 7, 22).
 */

/** How long a tap's change settles before it is committed, and how long the
 *  aimed-for egg stays after the last change, ms (design section 5). */
const SETTLE_MS = 1500;
/** A − or + pressed this long has begun to repeat (stepper.ts): a hold, so
 *  it commits on release. */
const HELD_MS = 400;
/** How long a burst of changes waits before the aimed-for egg is planned,
 *  ms: a plan is tens of milliseconds, too long for every pixel of a drag. */
const PREVIEW_MS = 90;

/** The settings a cook's choices are made of, and the choice each makes. */
const FIELDS: { settings: (keyof Settings)[]; choices: (keyof CookChoices)[] }[] = [
  { settings: ['sizeIndex', 'customMinor_mm', 'measuredBy'], choices: ['mass_kg', 'massFrom', 'sizeTable'] },
  { settings: ['startTempMode'], choices: ['eggFrom'] },
  { settings: ['customStart_C'], choices: ['customStart_C'] },
  { settings: ['probe', 'room_C'], choices: ['room_C'] },
  { settings: ['startMode'], choices: ['startMode'] },
  { settings: ['afterBoil'], choices: ['afterBoil'] },
  { settings: ['cooling'], choices: ['cooling'] },
  { settings: ['waterLitres'], choices: ['waterLitres'] },
  { settings: ['eggCount'], choices: ['eggCount'] },
  { settings: ['altitude_m'], choices: ['altitude_m'] },
  { settings: ['doneness'], choices: ['level'] },
];

/** Nothing in hand, on controls drawn afresh from the cook. */
function freshEdit(controls: Settings): Edit {
  return {
    base: { ...controls }, pending: false, group: null, inHand: null, down: null, changed_ms: 0, previewedLevel: false,
    previewing: false,
  };
}

/** `m` with its correction's bookkeeping changed; nothing while idle. */
function withEdit(m: Model, f: (e: Edit) => Partial<Edit>): Model {
  return m.edit === null ? m : { ...m, edit: { ...m.edit, ...f(m.edit) } };
}

/**
 * A control's value changed while a cook runs, on `group`, the controls
 * having taken it in: the change is in hand until it is committed. Another
 * control's change, with no finger down to have committed the one in hand
 * first (the keyboard): that one is committed as it was, without this, which
 * then settles in its turn. The slider's own reading at once; the plan's
 * follows.
 */
function handChanged(m: Model, group: number | null, real_ms: number, now_s: number): [Model, Effect[]] {
  if (m.cook === null || m.edit === null) return [m, []];
  let next = m;
  let effects: Effect[] = [];
  const e = m.edit;
  if (e.pending && e.group !== null && group !== null && group !== e.group) [next, effects] = commit(m, e.inHand, now_s);
  const ed = next.edit;
  if (ed === null) return [next, effects];
  const level = next.controls.doneness;
  next = {
    ...next,
    edit: {
      ...ed, pending: true, group: group, inHand: { controls: { ...next.controls }, start: next.controlsStart_s },
      changed_ms: real_ms, previewing: true,
    },
    aim: { level: level, peakYolk_C: targetPeakYolk_C(level), solution: null, section: next.aim?.section ?? null },
  };
  effects.push({ kind: 'editTimer', timer: 'release', at_ms: null });
  if (!ed.previewing) effects.push({ kind: 'editTimer', timer: 'preview', at_ms: real_ms + PREVIEW_MS });
  if (ed.down === null) effects.push({ kind: 'editTimer', timer: 'settle', at_ms: real_ms + SETTLE_MS });
  return [next, effects];
}

/** The choices `controls` say, laid over the cook's own: each field the
 *  cook changed (against `base`), and the cook's for the rest. */
function choicesInHand(
  cook: RunningCook, base: Settings, controls: Settings,
): { choices: CookChoices; touched: (keyof Settings)[] } {
  const now = choicesOf(controls, REGION);
  const next: CookChoices = { ...cook.choices };
  const into = next as unknown as Record<string, unknown>;
  const touched: (keyof Settings)[] = [];
  for (const f of FIELDS) {
    if (f.settings.every((k) => controls[k] === base[k])) continue;
    touched.push(...f.settings);
    for (const c of f.choices) into[c] = now[c];
  }
  return { choices: next, touched: touched };
}

/** The cook as the change in hand would make it, for its preview: a
 *  correction; but after the pull a new level only previews, the egg that
 *  level aims for in this pot, so it is planned as if not
 *  yet pulled. */
function cookInHand(cook: RunningCook, choices: CookChoices, start: number | null, now_s: number): RunningCook {
  if (start !== null && start !== cook.startedAt_s) cook = startCorrected(cook, start, now_s) ?? cook;
  if (cook.events.pulled !== null && choices.level !== cook.choices.level) return levelPreview(cook, choices);
  return corrected(cook, choices, now_s);
}

/** The egg the change in hand aims for, and the slider's reading for it:
 *  planned, held on the drawing, stored nowhere. */
function preview(m: Model, now_s: number): [Model, Effect[]] {
  const at = withEdit(m, () => ({ previewing: false }));
  const e = at.edit;
  const cook = at.cook;
  if (cook === null || e === null || !(e.pending || e.down !== null)) return [at, []];
  const hand = cookInHand(cook, choicesInHand(cook, e.base, at.controls).choices, at.controlsStart_s, now_s);
  const plan = replan(hand, at.calib, surfaceFor(at.surfaces, at.plan?.inputs ?? null), at.leanHint_s, now_s);
  const pulled = hand.events.pulled;
  const params = pulled !== null && at.plan !== null
    ? asRanShown(cook, at.plan)?.params ?? calibrationParams(at.calib)
    : calibrationParams(at.calib);
  const time_s = pulled === null ? plan.cookTime_s : pulled.out_s - hand.startedAt_s;
  const white = calibrationDoneness(at.calib, plan.answer.level).whiteDose_min;
  return [{
    ...at, aim: {
      level: plan.answer.level, peakYolk_C: plan.solution.result.peakYolk_C, solution: plan.solution,
      section: previewSection(plan.egg, plan.setup, params, time_s, white),
    },
  }, []];
}

/**
 * Commit the change in hand: the cook corrected (`correct`), and the fields
 * it changed written to the settings for the next cook. After the pull the
 * level is not corrected (the egg came out at the level it was cooked for):
 * the slider only previewed, and
 * goes back to the level the egg was pulled at; nothing is written for it.
 * The aimed-for egg stays until a settle after the last change. `upTo`, the
 * controls as the change in hand left them, commits that change alone when
 * another control's has already come (the keyboard), so two changes are two
 * commits however they are made.
 */
function commit(m: Model, upTo: InHand | null, now_s: number): [Model, Effect[]] {
  const e = m.edit;
  const cook = m.cook;
  if (e === null || !e.pending || cook === null) return [m, []];
  const effects: Effect[] = [{ kind: 'editTimer', timer: 'settle', at_ms: null }];
  const controls = upTo === null ? m.controls : upTo.controls;
  const startInHand = upTo === null ? m.controlsStart_s : upTo.start;
  let { choices, touched } = choicesInHand(cook, e.base, controls);
  const base = { ...controls };
  let previewedLevel = e.previewedLevel;
  if (cook.events.pulled !== null && choices.level !== cook.choices.level) {
    choices = { ...choices, level: cook.choices.level };
    touched = touched.filter((k) => k !== 'doneness');
    base.doneness = e.base.doneness;
    previewedLevel = true;
  }
  let next: Model = { ...m, edit: { ...e, pending: false, group: null, inHand: null, base: base, previewedLevel: previewedLevel } };
  const start = startInHand !== null && startInHand !== cook.startedAt_s ? startInHand : null;
  if (start !== null || !sameChoices(choices, cook.choices)) {
    const [after, more] = updateCook(next, { kind: 'correct', choices: choices, startedAt_s: start }, now_s);
    next = after;
    effects.push(...more);
  }
  // The start as the cook now has it: a correction refused leaves the cook's.
  // Unless the change come since is the start's own.
  if (upTo === null || m.controlsStart_s === upTo.start) {
    next = { ...next, controlsStart_s: next.cook === null ? null : next.cook.startedAt_s };
  }
  if (touched.length > 0) {
    const fields: Record<string, unknown> = {};
    for (const k of touched) fields[k] = controls[k];
    next = { ...next, settings: { ...next.settings, ...(fields as Partial<Settings>) } };
    effects.push({ kind: 'save', soon: false });
  }
  // The aimed-for egg goes a settle after the last change.
  effects.push({ kind: 'editTimer', timer: 'release', at_ms: e.changed_ms + SETTLE_MS });
  return [next, effects];
}

/** The aimed-for egg let go, unless a finger is down or another change is
 *  in hand by then; and a level the slider only previewed after the pull
 *  back at the cook's. */
function release(m: Model): [Model, Effect[]] {
  const e = m.edit;
  if (e === null || e.pending || e.down !== null) return [m, []];
  if (!e.previewedLevel) return [m.aim === null ? m : { ...m, aim: null }, []];
  const next: Model = { ...m, aim: null, edit: { ...e, previewedLevel: false }, controls: { ...m.controls, doneness: e.base.doneness } };
  return [redraw(next, 'doneness'), []];
}

/** A finger down on a control: another than the one with a change in hand
 *  commits it; the gesture begins. */
function fingerDown(m: Model, group: number, slider: boolean, real_ms: number, now_s: number): [Model, Effect[]] {
  const e = m.edit;
  if (m.cook === null || e === null) return [m, []];
  const [next, effects] = e.pending && group !== e.group ? commit(m, null, now_s) : [m, []];
  return [withEdit(next, () => ({ down: { at_ms: real_ms, group: group, slider: slider } })), effects];
}

/** The finger lifts: a drag of the slider, or a − or + held, commits now;
 *  a tap settles first. */
function fingerUp(m: Model, real_ms: number, now_s: number): [Model, Effect[]] {
  const e = m.edit;
  if (e === null) return [m, []];
  const next = withEdit(m, () => ({ down: null }));
  const down = e.down;
  if (down === null || !e.pending) return [next, []];
  if (down.slider || real_ms - down.at_ms >= HELD_MS) return commit(next, null, now_s);
  return [next, [{ kind: 'editTimer', timer: 'settle', at_ms: real_ms + SETTLE_MS }]];
}

/** Which of the cook's limits `latest` is: the boil pressed, the pull, or
 *  now (`latestStart_s`). */
function latestLimit(cook: RunningCook, latest: number): StartLimit['kind'] {
  const e = cook.events;
  if (e.boilAt_s !== null && e.boilAt_s === latest) return 'boil';
  if ((e.pulled !== null && e.pulled.due_s === latest) || (e.cooledAt_s !== null && e.cooledAt_s === latest)) return 'pull';
  return 'now';
}

/** The start a minute earlier or later, as far as the cook allows (core
 *  `earliestStart_s`, `latestStart_s`), and the line under it says why a
 *  press went no further: a correction in hand like any other, and
 *  committed the same way. */
function startStep(m: Model, up: boolean, group: number | null, real_ms: number, now_s: number): [Model, Effect[]] {
  const cook = m.cook;
  const from = m.controlsStart_s;
  if (cook === null || m.edit === null || from === null) return [m, []];
  const earliest = earliestStart_s(cook);
  const latest = latestStart_s(cook, now_s);
  let next = from + (up ? 60 : -60);
  let limit: StartLimit | null = null;
  if (next >= latest) {
    next = latest;
    limit = { kind: latestLimit(cook, latest), at_s: latest };
  }
  if (next <= earliest) {
    next = earliest;
    limit = { kind: 'earliest', at_s: earliest };
  }
  const effects: Effect[] = [{ kind: 'startLimit', limit: limit }];
  if (next === from) return [m, effects];
  const [after, more] = handChanged({ ...m, controlsStart_s: next }, group, real_ms, now_s);
  return [after, [...effects, ...more]];
}
