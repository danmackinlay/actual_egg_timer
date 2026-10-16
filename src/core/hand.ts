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
 *   long enough to repeat (`HELD_S`, 0.4 s), if a change came while it was
 *   down;
 * - a settle (`SETTLE_S`, 1.5 s) after the last change, for anything else: a
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
 * weight typed are both the egg's mass; the room in the "from" panel and in
 * Settings are both the room. Each group makes these of `CookChoices`:
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
 *   stays); the preview is set `PREVIEW_S` (0.09 s) on, unless it already
 *   is, so a burst plans once and not at every pixel of a drag; the settle
 *   starts again, unless a finger is down on this group, whose lift then
 *   decides.
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
 * - `moveOn`: a control used that makes no choice of the cook's, or a button
 *   that moves the cook on. The change in hand is committed, before the app
 *   does what the control or button does. These are: the primary button
 *   (the boil, the egg out, Start again), Cancel, "Still in the water?" yes
 *   and no; a clause of the sentence opened; and any control of no group -
 *   the thermometer's reading, a Settings switch, the units, the language,
 *   the sound and the alarm. A finger down on one is used; so is a button
 *   pressed by the keyboard or VoiceOver. A touch on no control (the page,
 *   the egg drawn, the clock, a scroll) is none of these.
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
 * aimed-for egg and show the cook's own level on the slider), or null; and
 * the timers, each at most once, set for `at_s` or cancelled with null.
 *
 * WHAT THE APP DOES with a commit of `startedAt`: `correctStart` stepped with
 * the start it holds in hand, then the start shown as the cook has it, so a
 * correction refused leaves the cook's. Of any other group: the group's
 * choices, as its controls say them, laid over the cook's own (`takeGroup`,
 * `handChoices`), so a choice nobody touched keeps the cook's value to the
 * bit and changing a setting back gives back the old plan exactly; `correct`
 * stepped when they differ from the cook's; and the group's settings written
 * for the next cook. Overdue is decided only then, by `step`, on the plan
 * of the committed cook. With `plan`, the app plans `previewCook`, and drops
 * a plan that lands once nothing is in hand.
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
 * Pure, like the rest of `src/core/`. `Hand.swift` is held to it by the
 * event sequences in `fixtures/hand.json`.
 */

/** A group of the cook's choices a control makes, or the start's time. */
export type HandGroup =
  | 'mass' | 'eggFrom' | 'customStart' | 'room' | 'startMode' | 'afterBoil' | 'cooling' | 'tapWater' | 'bowlLitres'
  | 'bowlWater' | 'waterLitres' | 'eggCount' | 'altitude' | 'level' | 'startedAt';

/** The settle before a commit, the plan of the aimed-for egg, and the
 *  aimed-for egg held after the last change. */
export type HandTimer = 'settle' | 'preview' | 'hold';

/** What the cook did to the controls, or a timer come round, at `at_s`. */
export type HandEvent =
  | { kind: 'change'; at_s: number; group: HandGroup }
  | { kind: 'down'; at_s: number; group: HandGroup }
  | { kind: 'up'; at_s: number }
  | { kind: 'leave'; at_s: number }
  | { kind: 'moveOn'; at_s: number }
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

/** What `event` does to `state`. */
export function handStep(state: HandState, _event: HandEvent): HandStep {
  return { state: state, commit: null, aim: null, timers: [] };
}
