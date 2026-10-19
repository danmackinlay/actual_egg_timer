/**
 * The correction in hand: when a change to the controls mid-cook is
 * committed. `handStep` takes what it holds, one thing the cook did to the
 * controls or one of its timers come round, and returns what it now holds,
 * the group to commit, what to do with the aimed-for egg, and the timers to
 * set or cancel. Beside `step` (step.ts), which a commit then feeds.
 *
 * While a cook runs every control stays open, and a change to one is a
 * correction, "it was always like this": the cook's choices replaced and the
 * whole cook planned again from its start. A commit at every step of a drag
 * would stamp the cook, plan again, write it and the settings, and ring
 * mid-drag through an overdue level. So the change is held in hand: the
 * controls and the sentence show it, and the egg in cross-section the egg it
 * aims for, from a plan that stores nothing and rings nothing. It is
 * committed
 *
 * - when the finger lifts, for a drag of the slider, and for a − or + held
 *   long enough to repeat (`HELD_S`), if a change came while it was down;
 * - a settle (`SETTLE_S`) after the last change, for anything else: a
 *   radio, a menu, a − or + pressed once, a number typed;
 * - at once when another control is touched or used, or the page or the app
 *   is left.
 *
 * Each app feeds it only while a cook runs, and keeps its state, its timers
 * and its controls; it holds no clock and no settings. Times are any one
 * clock the app keeps for the gestures, seconds, the same for every event.
 *
 * THE GROUPS. A change belongs to the group of the cook's choices it makes
 * (`HandGroup`), never to the element it came from: the size menu and the
 * weight typed are both the egg's mass; the room in the panels of where the
 * egg came from, the start and the cooling is the room in each. Each group makes these of `CookChoices`
 * (`takeGroup`):
 *
 *   mass         mass_kg, massFrom, sizeTable
 *   eggFrom      eggFrom
 *   customStart  customStart_C
 *   room         room_C
 *   startMode    startMode
 *   afterBoil    afterBoil
 *   cooling      cooling
 *   tapWater     tapWater_C
 *   bowlLitres   bowlLitres
 *   bowlWater    bowlWater_C
 *   waterLitres  waterLitres
 *   eggCount     eggCount
 *   altitude     altitude_m
 *   level        level: the slider
 *   startedAt    no choice: when the eggs went in, the start's − and +
 *
 * They partition the choices, so each app maps every setting it keeps onto
 * one group, or none (the units, the language, the sound and the alarm,
 * the thermometer, sharing: no choice of the cook's), and committing one
 * group from the controls as they stand never takes another's change.
 *
 * THE EVENTS, each at `at_s`:
 *
 * - `change`, `group`: a control's value changed, and the controls took it
 *   in. Another group's change in hand is committed first, as it was: no
 *   finger came down to commit it, so this came by the keyboard or
 *   VoiceOver. This group is then in hand. The hold stops (the aimed-for egg
 *   stays); the preview is set `PREVIEW_S` on, unless it already is, so a
 *   burst plans once and not at every pixel of a drag; the settle starts
 *   again, unless a finger is down on this group, whose lift then decides.
 * - `down`, `group`: a finger down on a control of `group`. Another group's
 *   change in hand is committed: another control touched. The press begins,
 *   and the settle stops, so a change on this group commits as the gesture
 *   under way does, never under the finger.
 * - `up`: the finger lifts, or the system takes the touch back. If the
 *   group in hand is the press's and a change came during the press, a
 *   press on the slider, or one down `HELD_S` or longer, commits now.
 *   Otherwise a change in hand settles from the lift: a long press on a
 *   radio changes nothing until the lift, and commits as a tap. With
 *   nothing in hand, an aimed-for egg still shown is held again.
 * - `leave`: the page or the app left, the last word the app is sure to have
 *   before it may be stopped. The change in hand is committed, and the press
 *   is gone with the page. The web leaves at `pagehide` and at
 *   `visibilitychange` to hidden; iOS whenever `scenePhase` stops being
 *   active, inactive as well as background, since a kill from the app
 *   switcher comes with no other word. So Control Centre pulled down inside
 *   a settle commits what was in hand, and a change after it is a new one.
 * - `moveOn`, `control`: a control used that makes no choice of the cook's,
 *   or a button that moves the cook on (`HandControl`). The change in hand is
 *   committed, before the app does what the control or button does. They
 *   are: `primary`, the primary button (the boil, the egg out, Start again);
 *   `cancel`; `stillInWater`, "Still in the water?" yes and no; `clause`, a
 *   clause of the sentence opened; `probe`, the thermometer's reading; and
 *   `setting`, any other control of no group - a Settings switch, the units,
 *   the language, the sound and the alarm, sharing. A finger down on one is
 *   using it; so is a button pressed by the keyboard or VoiceOver. A touch
 *   on no control (the page, the egg drawn, the clock, a scroll) is none of
 *   these, and the app sends nothing. The control is a label, for the
 *   fixtures and a reader: `handStep` commits alike whichever it is, and
 *   never reads it. Which of an app's controls is which is that app's
 *   mapping (the web's edit.ts, iOS's views), not core's.
 * - `timer`, `timer`: a timer this set come round. `settle`: the change in
 *   hand committed. `preview`: the aimed-for egg planned, if a change is in
 *   hand. `hold`: the aimed-for egg let go, unless a change is in hand or a
 *   finger down by then (the next commit or lift sets it again).
 * - `fresh`: the controls drawn afresh from a cook begun, picked back up or
 *   ended. Whatever is in hand is dropped (a button that ends a cook sends
 *   `moveOn` first), and every timer cancelled.
 *
 * A COMMIT names the group, takes it out of hand, stops the settle, and sets
 * the hold a settle after the last change: the aimed-for egg stays that long,
 * then the live egg comes back. At most one group is in hand, since a change
 * from another commits it, so an event commits at most one.
 *
 * THE STATE (`HandState`): the group in hand; the press, with when it came
 * down, on which group, and whether a change of that group came during it;
 * when the last change came; whether an aimed-for egg is shown; and whether
 * the preview is set and not yet come round. The settle and the hold are
 * not kept: cancelling a timer not set does nothing.
 *
 * THE OUTPUT (`HandStep`): the state; the group to commit, or null; `plan`
 * (plan the aimed-for egg for the change in hand now) or `letGo` (drop the
 * aimed-for egg and, while a cook runs, show its own level on the slider),
 * or null; and the timers, each at most once, set for `at_s` or cancelled
 * with null.
 *
 * WHAT THE APP DOES with a commit of `startedAt`: `correctStart` stepped with
 * the start it holds in hand, then the start shown as the cook has it, so a
 * correction refused leaves the cook's. The start's − and + move it a minute
 * at a time as far as the cook allows (`startStepped`), and say why a press
 * went no further. Of any other group: the group's choices, as its controls
 * say them, laid over the cook's own (`handChoices`), so a choice nobody
 * touched keeps the cook's value to the bit and changing a setting back
 * gives back the old plan exactly; `correct` stepped when they differ from
 * the cook's; and the group's settings written for the next cook. The app
 * commits before it steps the cook for whatever led to the commit (a
 * button's press). Overdue is decided only then, by `step`, on the plan of
 * the committed cook. With `plan`, the app plans `previewCook`, and drops a
 * plan that lands once nothing is in hand.
 *
 * THE LEVEL AFTER THE PULL. The egg came out at the level it was cooked for,
 * so once it is out the slider only previews the egg that level aims for in
 * this pot (`levelPreview`). That rule is `correctable`, beside `correct` in
 * step.ts, and nowhere else: `step`'s `correct` takes the choices through
 * it, `handChoices` returns null for a level it keeps (nothing stepped,
 * nothing written), and `previewCook` plans the level's preview. The
 * slider goes back to the cook's level when the aimed-for egg is let go.
 * `handStep` knows nothing of the cook.
 *
 * Pure, like the rest of `src/core/`. `Hand.swift` is held to it by
 * `fixtures/hand.json`: event sequences, the choices committed, the cook
 * previewed and the start's steps.
 */

import {
  type CookChoices, type RunningCook, corrected, earliestStart_s, latestStart_s, levelPreview, sameValue,
  startCorrected,
} from './running.ts';
import { correctable } from './step.ts';

/** How long a tap's change settles before it is committed, and how long the
 *  aimed-for egg stays after the last change, s. */
export const SETTLE_S = 1.5;
/** A − or + pressed this long has begun to repeat (the web's stepper.ts,
 *  iOS's Stepper): a hold, committed on the lift, s. */
export const HELD_S = 0.4;
/** How long a burst of changes waits before the aimed-for egg is planned, s:
 *  a plan is tens of milliseconds, too long for every pixel of a drag. */
export const PREVIEW_S = 0.09;

/** A group of the cook's choices a control makes, or the start's time. */
export type HandGroup =
  | 'mass' | 'eggFrom' | 'customStart' | 'room' | 'startMode' | 'afterBoil' | 'cooling' | 'tapWater' | 'bowlLitres'
  | 'bowlWater' | 'waterLitres' | 'eggCount' | 'altitude' | 'level' | 'startedAt';

/** A control that makes no choice of the cook's, or a button that moves the
 *  cook on: using one commits the change in hand. A label: core never reads
 *  it, and each app maps its own controls onto it. */
export type HandControl = 'primary' | 'cancel' | 'stillInWater' | 'clause' | 'probe' | 'setting';

/** The settle before a commit, the plan of the aimed-for egg, and the
 *  aimed-for egg held after the last change. */
export type HandTimer = 'settle' | 'preview' | 'hold';

/** What the cook did to the controls, or a timer come round, at `at_s`. */
export type HandEvent =
  | { kind: 'change'; at_s: number; group: HandGroup }
  | { kind: 'down'; at_s: number; group: HandGroup }
  | { kind: 'up'; at_s: number }
  | { kind: 'leave'; at_s: number }
  | { kind: 'moveOn'; at_s: number; control: HandControl }
  | { kind: 'timer'; at_s: number; timer: HandTimer }
  | { kind: 'fresh'; at_s: number };

/** A finger down on a control: when, on which group, and whether a change
 *  of that group came while it was down. */
export interface HandPress {
  at_s: number;
  group: HandGroup;
  changed: boolean;
}

/** What `handStep` holds between events. */
export interface HandState {
  /** The group whose change is in hand, not yet committed; null for none. */
  hand: HandGroup | null;
  /** The finger down on a control; null for none. */
  down: HandPress | null;
  /** When the last change came; null for none since the controls were
   *  drawn afresh. */
  changed_s: number | null;
  /** Whether an aimed-for egg is shown: from a change until it is let go. */
  aimed: boolean;
  /** Whether the preview is set and has not come round. */
  previewing: boolean;
}

/** A timer set for `at_s`, or cancelled with null. */
export interface HandTimerSet {
  timer: HandTimer;
  at_s: number | null;
}

/** What to do with the aimed-for egg: plan it for the change in hand, or let
 *  it go and show the cook's own level. */
export type HandAim = 'plan' | 'letGo';

/** What an event does. */
export interface HandStep {
  state: HandState;
  /** The group whose change to commit now, before anything else the event
   *  leads the app to do; null for none. */
  commit: HandGroup | null;
  aim: HandAim | null;
  timers: HandTimerSet[];
}

/** Nothing in hand, on controls drawn afresh. */
export function nothingInHand(): HandState {
  return { hand: null, down: null, changed_s: null, aimed: false, previewing: false };
}

/** `out` with `timer` set for `at_s`, or cancelled with null, in place of
 *  what this event said of it before. */
function setTimer(out: HandStep, timer: HandTimer, at_s: number | null): HandStep {
  const timers: HandTimerSet[] = [];
  for (let i = 0; i < out.timers.length; i++) if (out.timers[i].timer !== timer) timers.push(out.timers[i]);
  timers.push({ timer: timer, at_s: at_s });
  return { ...out, timers: timers };
}

/** When the aimed-for egg held in `s` goes, at `at_s` or after: a settle
 *  after the last change. */
function holdUntil(s: HandState, at_s: number): number {
  return s.changed_s === null ? at_s : Math.max(at_s, s.changed_s + SETTLE_S);
}

/** `out` with the change in hand committed, if there is one, and the
 *  aimed-for egg held. */
function commit(out: HandStep, at_s: number): HandStep {
  const s = out.state;
  if (s.hand === null) return out;
  const next: HandStep = { ...out, state: { ...s, hand: null }, commit: s.hand };
  return setTimer(setTimer(next, 'settle', null), 'hold', holdUntil(s, at_s));
}

/** `out` with the aimed-for egg held again, if one is shown: nothing in hand
 *  to hold it. */
function holdAgain(out: HandStep, at_s: number): HandStep {
  return out.state.aimed ? setTimer(out, 'hold', holdUntil(out.state, at_s)) : out;
}

/** What `event` does to `state`. */
export function handStep(state: HandState, event: HandEvent): HandStep {
  let out: HandStep = { state: state, commit: null, aim: null, timers: [] };
  const at = event.at_s;
  switch (event.kind) {
    case 'change': {
      const g = event.group;
      if (state.hand !== null && state.hand !== g) out = commit(out, at);
      const s = out.state;
      const down = s.down !== null && s.down.group === g ? { ...s.down, changed: true } : s.down;
      out = { ...out, state: { ...s, hand: g, down: down, changed_s: at, aimed: true, previewing: true } };
      out = setTimer(out, 'hold', null);
      if (!s.previewing) out = setTimer(out, 'preview', at + PREVIEW_S);
      if (down === null || down.group !== g) out = setTimer(out, 'settle', at + SETTLE_S);
      return out;
    }
    case 'down': {
      if (state.hand !== null && state.hand !== event.group) out = commit(out, at);
      out = { ...out, state: { ...out.state, down: { at_s: at, group: event.group, changed: false } } };
      return setTimer(out, 'settle', null);
    }
    case 'up': {
      const d = state.down;
      if (d === null) return out;
      out = { ...out, state: { ...state, down: null } };
      if (state.hand === null) return holdAgain(out, at);
      if (state.hand === d.group && d.changed && (d.group === 'level' || at - d.at_s >= HELD_S)) return commit(out, at);
      return setTimer(out, 'settle', at + SETTLE_S);
    }
    case 'leave':
      out = { ...out, state: { ...state, down: null } };
      return state.hand === null ? holdAgain(out, at) : commit(out, at);
    case 'moveOn':
      return commit(out, at);
    case 'timer':
      if (event.timer === 'settle') return state.down === null ? commit(out, at) : out;
      if (event.timer === 'preview') {
        return { ...out, state: { ...state, previewing: false }, aim: state.hand === null ? null : 'plan' };
      }
      if (state.hand !== null || state.down !== null || !state.aimed) return out;
      return { ...out, state: { ...state, aimed: false }, aim: 'letGo' };
    case 'fresh': {
      out = { ...out, state: nothingInHand(), aim: state.aimed ? 'letGo' : null };
      return setTimer(setTimer(setTimer(out, 'settle', null), 'preview', null), 'hold', null);
    }
  }
}

/** `choices` with `group`'s choices taken from `said`; the start's time
 *  takes none. */
export function takeGroup(choices: CookChoices, said: CookChoices, group: HandGroup): CookChoices {
  switch (group) {
    case 'mass': return { ...choices, mass_kg: said.mass_kg, massFrom: said.massFrom, sizeTable: said.sizeTable };
    case 'eggFrom': return { ...choices, eggFrom: said.eggFrom };
    case 'customStart': return { ...choices, customStart_C: said.customStart_C };
    case 'room': return { ...choices, room_C: said.room_C };
    case 'startMode': return { ...choices, startMode: said.startMode };
    case 'afterBoil': return { ...choices, afterBoil: said.afterBoil };
    case 'cooling': return { ...choices, cooling: said.cooling };
    case 'tapWater': return { ...choices, tapWater_C: said.tapWater_C };
    case 'bowlLitres': return { ...choices, bowlLitres: said.bowlLitres };
    case 'bowlWater': return { ...choices, bowlWater_C: said.bowlWater_C };
    case 'waterLitres': return { ...choices, waterLitres: said.waterLitres };
    case 'eggCount': return { ...choices, eggCount: said.eggCount };
    case 'altitude': return { ...choices, altitude_m: said.altitude_m };
    case 'level': return { ...choices, level: said.level };
    case 'startedAt': return choices;
  }
}

/** The choices a commit of `group` makes of `cook`, the controls saying
 *  `said`: the group's laid over the cook's own. Null for a change a
 *  correction cannot make (`correctable`: the level once the egg is out),
 *  which is stepped nowhere and written nowhere. */
export function handChoices(cook: RunningCook, said: CookChoices, group: HandGroup): CookChoices | null {
  const taken = takeGroup(cook.choices, said, group);
  return sameValue(correctable(cook, taken), taken) ? taken : null;
}

/** The cook as the change in hand would make it, for the aimed-for egg's
 *  plan: the start in hand (`start_s`) for `startedAt`; otherwise the
 *  group's choices from `said`, corrected, or after the pull a level's
 *  preview (`levelPreview`). Stored nowhere and stepped nowhere. */
export function previewCook(
  cook: RunningCook, said: CookChoices, group: HandGroup, start_s: number, now_s: number,
): RunningCook {
  if (group === 'startedAt') {
    return start_s === cook.startedAt_s ? cook : startCorrected(cook, start_s, now_s) ?? cook;
  }
  const taken = takeGroup(cook.choices, said, group);
  return handChoices(cook, said, group) === null ? levelPreview(cook, taken) : corrected(cook, taken, now_s);
}

/** Why the start's − or + went no further, and the time it stopped at: now,
 *  the boil pressed, the pull, or the earliest the cook allows. */
export interface StartLimit {
  kind: 'now' | 'boil' | 'pull' | 'earliest';
  at_s: number;
}

/** The start a minute earlier (`up` false) or later than `from_s`, as far as
 *  the cook allows at `now_s` (`earliestStart_s`, `latestStart_s`), and why
 *  it went no further, or null. */
export function startStepped(
  cook: RunningCook, from_s: number, up: boolean, now_s: number,
): { start_s: number; limit: StartLimit | null } {
  const earliest = earliestStart_s(cook);
  const latest = latestStart_s(cook, now_s);
  let next = from_s + (up ? 60 : -60);
  let limit: StartLimit | null = null;
  if (next >= latest) {
    next = latest;
    const e = cook.events;
    const kind = e.boilAt_s !== null && e.boilAt_s === latest ? 'boil'
      : (e.pulled !== null && e.pulled.due_s === latest) || (e.cooledAt_s !== null && e.cooledAt_s === latest) ? 'pull'
      : 'now';
    limit = { kind: kind, at_s: latest };
  }
  if (next <= earliest) {
    next = earliest;
    limit = { kind: 'earliest', at_s: earliest };
  }
  return { start_s: next, limit: limit };
}
