/**
 * Which catalogue key each part of the screen says, from the facts of the
 * cook. Both apps render these keys and fill in their own arguments (a clock,
 * a quantity in the cook's units); the CHOICE of key is here, so the two apps
 * cannot choose differently, and `fixtures/wording.json` holds it for Swift
 * (`Wording.swift`). The iOS app has no test target, so this is the only way
 * its choices get tested.
 *
 * Nothing here renders text. A key's own arguments that core can answer (a
 * count) come back in a `CopyRef`; the rest the app supplies, and a template
 * that does not name an argument ignores it.
 */

import { CopyRef } from './copy.js';
import { CERTAINTY_MASS, Certainty, WordCertainty } from './certainty.js';
import { Lean, Outcome, WHITE_RISK } from './outcome.js';
import { Phase, Verdict, anchorNear } from './policy.js';
import { Cooling, HeatAfterBoil, StartMode } from './protocol.js';
import { EggFrom } from './record.js';
import { DONENESS_ANCHORS } from './solve.js';

/* ----------------------------------------------------------- the refusal */

/**
 * The refusal's sentence, or null when there is nothing worth saying. The app
 * adds `limit` (the doneness word the slider stops at) and, for
 * `refusal.harderThanPan`, `water`.
 *
 * The DECISION (which refusal, where the slider goes, whether the gap is
 * worth a sentence) is `verdictFor`; this is only which words teach it.
 * A yolk too soft for the white is blamed on the cooling the cook chose.
 */
export function refusalKey(v: Verdict, cooling: Cooling): CopyRef | null {
  if (!v.worthSaying) return null;
  switch (v.kind) {
    case 'none': return null;
    case 'whiteNeverSets': return { key: 'refusal.whiteNeverSets', args: {} };
    case 'harderThanPanReaches': return { key: 'refusal.harderThanPan', args: {} };
    case 'tooSoftForWhite':
      return { key: cooling === 'counter' ? 'refusal.counter' : cooling === 'tap' ? 'refusal.tap' : 'refusal.ice', args: {} };
  }
}

/**
 * The warning line while idle: the refusal, when there is one worth saying,
 * since it says what to change; otherwise, when the level on screen is a
 * dotted one (`lowOddsAt`, reach.ts: a wild guess, softer or firmer than
 * every level that is not), that it is a wild guess so far. The app adds
 * `doneness`, the word for the level on screen, which stands alone before
 * the colon (LANGUAGE.md section 5).
 *
 * One line, not two: a slider just moved out of the stripes onto a dotted
 * level says why it moved, and the dots under the thumb say the rest. The
 * next answer there, the slider no longer moving, carries the warning.
 */
export function warningKey(v: Verdict, lowOdds: boolean, cooling: Cooling): CopyRef | null {
  const refusal = refusalKey(v, cooling);
  if (refusal !== null) return refusal;
  if (!lowOdds) return null;
  return { key: 'warn.wildGuess', args: {} };
}

/* ---------------------------------------------------------- the certainty */

/**
 * HOW SURE, IN WORDS (DECISIONS.md 93 and 97; design/one-screen.md section 6).
 * Under the time, where the direction was until the `certainty` draft: the
 * class `certaintyAt` gives the time on screen, as a line the cook can
 * press. Pressing it opens, in place, the 90% interval in the slider's words,
 * the most likely word and the likely time range. "Most likely" also shows
 * under the line, unpressed, when it is not the word asked: that is the one
 * thing the class alone hides, a time that probably gives another yolk.
 *
 * The words of the interval and of the most likely word come back as
 * doneness keys, for the app to render; each stands alone after a colon
 * (LANGUAGE.md section 5). The interval's "9 times in 10" is CERTAINTY_MASS,
 * as `hits` in `of`, so the words cannot say a number the class was not
 * read at.
 */

/** The catalogue key of the line under the time. */
export function certaintyKey(c: Certainty): string {
  if (c === 'veryCertain') return 'certainty.veryCertain';
  if (c === 'ballpark') return 'certainty.ballpark';
  return 'certainty.wildGuess';
}

/** A key with its counts (`args`, as a `CopyRef`'s) and its inserted words
 *  (`words`, each itself a doneness key for the caller to render). */
export interface WordsRef {
  key: string;
  args: Readonly<Record<string, number>>;
  words: Readonly<Record<string, string>>;
}

/** The 90% interval in the slider's words: "9 times in 10: Soft to Fudgy.",
 *  or one word when one word holds it. `hits` in `of` is CERTAINTY_MASS. */
export function intervalWords(w: WordCertainty): WordsRef {
  const args = { hits: Math.round(CERTAINTY_MASS * 10), of: 10 };
  if (w.from === w.to) {
    return { key: 'certainty.interval.one', args: args, words: { word: DONENESS_ANCHORS[w.from].key } };
  }
  return {
    key: 'certainty.interval', args: args,
    words: { from: DONENESS_ANCHORS[w.from].key, to: DONENESS_ANCHORS[w.to].key },
  };
}

/** "Most likely: Fudgy." */
export function mostLikelyWords(w: WordCertainty): WordsRef {
  return { key: 'certainty.mostLikely', args: {}, words: { word: DONENESS_ANCHORS[w.mostLikely].key } };
}

/** Whether "Most likely" shows under the line before it is pressed: only
 *  when the most likely word is not the word asked. */
export function mostLikelyShown(w: WordCertainty): boolean {
  return w.mostLikely !== w.asked;
}

/* ------------------------------------------------------------ the outcome */

/**
 * THE WHITE. A line of its own when P(runny) is at least WHITE_RISK, one egg
 * in five. The chosen time already weighs a runny white three times a yolk
 * miss, so what is left above one in five is a white the time cannot fix
 * without overcooking the yolk: the softest levels, and the counter's softest
 * (0.36-0.45 on a fresh install, 0.21 at runny after three eggs just right).
 * Not 0.15: a fresh install at soft reads 0.17 on the reference pot, and that
 * is the width of the prior, which is wide so the filter can learn and not
 * because anyone believes it (decide.ts, "not before the first egg").
 *
 * THE RANGE. `levelLow` and `levelHigh` as the nearest doneness words, for a
 * screen reader: the bracket under the slider is drawn, and this is what it
 * says. The words stand alone after a colon (LANGUAGE.md section 5).
 *
 * The direction ("Probably just right. If not, a little firm.") and its lean
 * retired with the `certainty` draft (DECISIONS.md 97): the yolk is answered
 * in words since DECISIONS.md 92, and "just right" is no longer what the
 * cook is asked.
 */

/** P(just right) at or above which the yolk is "probably just right". */
export const DIRECTION_LIKELY = 0.5;

/** The catalogue key of the direction sentence. */
export function directionKey(o: Outcome): string {
  const lean: Lean = o.lean;
  if (o.pJustRight >= DIRECTION_LIKELY) {
    if (lean === 'firm') return 'outcome.likely.firm';
    if (lean === 'soft') return 'outcome.likely.soft';
    return 'outcome.likely';
  }
  if (lean === 'firm') return 'outcome.miss.firm';
  if (lean === 'soft') return 'outcome.miss.soft';
  return 'outcome.unsure';
}

/** Whether the white gets its line. */
export function whiteAtRisk(o: Outcome): boolean {
  return o.pWhiteRunny >= WHITE_RISK;
}

/** The range in the slider's words: a key and its arguments, each argument
 *  itself a doneness key for the caller to render. One word when both ends
 *  are nearest the same one. */
export function rangeWords(o: Outcome): { key: string; args: Record<string, string> } {
  const low = anchorNear(o.levelLow).key;
  const high = anchorNear(o.levelHigh).key;
  if (low === high) return { key: 'outcome.range.one', args: { level: low } };
  return { key: 'outcome.range', args: { low: low, high: high } };
}

/* -------------------------------------------------------------- the phase */

/** What the readout's words depend on. While a cook runs, every field is the
 *  cook's own (its ticket), never the controls'. */
export interface PhaseFacts {
  phase: Phase;
  startMode: StartMode;
  afterBoil: HeatAfterBoil;
  cooling: Cooling;
  /** Idle only: whether the white sets at all, so there is a cook to start. */
  whiteSets: boolean;
  /** Idle only: whether this pan's time to boil is remembered, not guessed. */
  boilKnown: boolean;
  /** Cooling only: whether the countdown ends in a probe reading. */
  probeWanted: boolean;
}

/** The readout's keys in one phase. The app supplies the arguments: `boil`,
 *  `water`, `time`, `elapsed`, `after`, `cooking`, `boiling`, `seconds`. */
export interface PhaseKeys {
  /** Above the clock. */
  label: string;
  /** Under the clock. */
  subline: string;
  /** The primary button, or null when the phase has none. */
  action: string | null;
  /** The line that says what the primary button (or, without one, the pan)
   *  asks of the cook, or null when there is nothing true to add. */
  hint: string | null;
}

/** Where the eggs go at the pull, as the button says it. */
function pulledKey(cooling: Cooling): string {
  return cooling === 'ice' ? 'action.pulled.ice' : cooling === 'tap' ? 'action.pulled.tap' : 'action.pulled.counter';
}

/**
 * The readout's keys. The one instruction the cook has to act on while it
 * cooks goes in the label, beside the clock: the model holds the water at the
 * boil for the whole cook, or with the heat off assumes it cools on its own,
 * and a pan taken off the heat when the model expected a boil under-cooks by
 * minutes. With the heat off, the idle subline names the water, the most
 * load-bearing number in that cook; on a hot start the time to boil plays no
 * part and is not mentioned. A counted cooling is the ice bath or the tap; a
 * counter rest has no cooling phase.
 */
export function phaseKeys(f: PhaseFacts): PhaseKeys {
  const cold = f.startMode === 'cold';
  const standing = f.afterBoil === 'off';
  switch (f.phase) {
    case 'IDLE':
      return {
        label: 'readout.phase.total',
        subline: cold
          ? f.boilKnown ? 'readout.sub.coldAssumes' : 'readout.sub.coldGuesses'
          : standing ? 'readout.sub.standing' : 'readout.sub.hot',
        action: cold ? 'action.startHeating' : 'action.eggsIn',
        hint: !f.whiteSets
          ? 'action.hint.whiteNeverSets'
          : cold ? 'action.hint.cold' : standing ? 'action.hint.hotStanding' : 'action.hint.hotBoiling',
      };
    case 'HEATING':
      return {
        label: 'readout.phase.heating',
        subline: 'readout.sub.heating',
        action: 'action.fullBoil',
        hint: standing ? 'action.hint.heatingStanding' : 'action.hint.heating',
      };
    case 'COOKING':
      return {
        label: standing ? 'readout.phase.cookingHeatOff' : 'readout.phase.cookingBoiling',
        subline: cold ? 'readout.sub.cookingCold' : 'readout.sub.cookingHot',
        action: null,
        hint: standing ? 'action.hint.cookingStanding' : 'action.hint.cookingBoiling',
      };
    case 'PULL':
      // On a counter rest nothing starts on its own: the grace runs out into
      // done, and the subline already says the yolk is still cooking.
      return {
        label: 'readout.phase.pull',
        subline: 'readout.sub.pull',
        action: pulledKey(f.cooling),
        hint: f.cooling === 'counter' ? null : 'action.hint.pull',
      };
    case 'COOLING':
      return {
        label: f.cooling === 'ice' ? 'readout.phase.coolingIce' : 'readout.phase.coolingTap',
        subline: f.probeWanted ? 'readout.sub.coolingProbe' : 'readout.sub.coolingPeak',
        action: null,
        hint: null,
      };
    case 'DONE':
      return {
        label: 'readout.phase.done',
        subline: cold ? 'readout.sub.doneCold' : 'readout.sub.doneHot',
        action: 'action.startAgain',
        hint: null,
      };
  }
}

/* ----------------------------------------------------------- the sentence */

/** One clause of the setup sentence: its words in the sentence, the name of
 *  the control it opens, and that control's value. A null `value` is the
 *  argument itself (the egg's mass, or the cook's own temperature). The app
 *  supplies `mass`, `temp` and `bath`. */
export interface ClauseKeys {
  text: string;
  label: string;
  value: string | null;
}

export type Clause = 'egg' | 'from' | 'start' | 'cooling';

/** What the setup sentence's clauses depend on. */
export interface ClauseFacts {
  eggFrom: EggFrom;
  startMode: StartMode;
  sousVide: boolean;
  afterBoil: HeatAfterBoil;
  cooling: Cooling;
}

/** The setup sentence's keys. The start clause carries the boil, and the
 *  standing when the heat goes off: "into cold water" alone reads as if the
 *  eggs never boil. */
export function clauseKeys(f: ClauseFacts): Record<Clause, ClauseKeys> {
  const standing = f.afterBoil === 'off';
  const from: ClauseKeys = f.eggFrom === 'fridge'
    ? { text: 'setup.from.fridge', label: 'controls.eggFrom', value: 'controls.eggFrom.fridge' }
    : f.eggFrom === 'room'
      ? { text: 'setup.from.room', label: 'controls.eggFrom', value: 'controls.eggFrom.room' }
      : { text: 'setup.from.custom', label: 'controls.eggFrom', value: null };
  const start: ClauseKeys = f.sousVide
    ? { text: 'setup.start.sous', label: 'controls.start', value: 'controls.start.sousVide' }
    : f.startMode === 'cold'
      ? { text: standing ? 'setup.start.coldStanding' : 'setup.start.cold', label: 'controls.start', value: 'controls.start.cold' }
      : { text: standing ? 'setup.start.hotStanding' : 'setup.start.hot', label: 'controls.start', value: 'controls.start.hot' };
  const cooling: ClauseKeys = f.cooling === 'ice'
    ? { text: 'setup.cooling.ice', label: 'controls.cooling', value: 'controls.cooling.ice' }
    : f.cooling === 'tap'
      ? { text: 'setup.cooling.tap', label: 'controls.cooling', value: 'controls.cooling.tap' }
      : { text: 'setup.cooling.counter', label: 'controls.cooling', value: 'controls.cooling.counter' };
  return {
    egg: { text: 'setup.egg', label: 'controls.egg', value: null },
    from: from,
    start: start,
    cooling: cooling,
  };
}

/* -------------------------------------------- the sous-vide clock's units */

/*
 * The sous-vide clock's two unit choices, here rather than in the apps or in
 * the physics (src/core/sousvide.ts, which says nothing).
 *
 * These are not sentences. They are UNIT CHOICES - when minutes stop being a
 * useful unit and become hours, when hours become days, when a date stops being
 * a weekday and becomes "N weeks ago". Both apps have to bucket an estimate
 * identically or the same number reads differently on each, and at a 58 C bath
 * only two of the six branches below are ever reached, so a copy kept by hand
 * in each app would go untested.
 *
 * They return a catalogue key and its numbers, not English. A number and its
 * unit are one thing, but "22 h 43 min" is English, and so is the order of the
 * words in "3 weeks ago". Core picks the bucket; the catalogue says it.
 */

/** 45 min, 22 h 43 min, 3 days, 5 weeks - as a key into the catalogue and the
 *  numbers it needs. Minutes and seconds stop being a useful unit somewhere
 *  around the point this app stops being useful. */
export function longDuration(seconds: number): CopyRef {
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return { key: 'duration.minutes', args: { minutes: minutes } };
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) {
    return rest === 0
      ? { key: 'duration.hours', args: { hours: hours } }
      : { key: 'duration.hoursMinutes', args: { hours: hours, minutes: rest } };
  }
  const days = Math.round(hours / 24);
  if (days < 14) return { key: 'duration.days', args: { days: days } };
  return { key: 'duration.weeks', args: { weeks: Math.round(days / 7) } };
}

/**
 * How long ago the cook should have started: today, yesterday, last Tuesday,
 * last week, 3 weeks ago, 4 months ago - as a key and its numbers.
 *
 * Takes the day count rather than a date, so it is pure and so the calendar
 * arithmetic stays where it belongs. Counting whole days across a local
 * midnight is a platform job - `Calendar` does it correctly on iOS, and the web
 * normalises to midnight and divides - and neither should be reimplemented
 * here. For the same reason `sousvide.start.lastWeekday` wants a `{weekday}`
 * that this does not supply: the app adds the name, from `weekdayKey`. Both
 * apps take it from the catalogue, not from a platform formatter
 * (LANGUAGE.md §2): the translator sees the names, and can give the form the
 * sentence needs, which in Czech is not the dictionary one.
 */
export function startPhrase(daysAgo: number): CopyRef {
  if (daysAgo <= 0) return { key: 'sousvide.start.today', args: {} };
  if (daysAgo === 1) return { key: 'sousvide.start.yesterday', args: {} };
  if (daysAgo < 7) return { key: 'sousvide.start.lastWeekday', args: {} };
  if (daysAgo < 14) return { key: 'sousvide.start.lastWeek', args: {} };
  if (daysAgo < 60) return { key: 'sousvide.start.weeksAgo', args: { weeks: Math.round(daysAgo / 7) } };
  return { key: 'sousvide.start.monthsAgo', args: { months: Math.round(daysAgo / 30) } };
}

/** The catalogue key of a weekday's name, by `Date.getDay()` numbering:
 *  0 is Sunday. Swift's `Calendar` counts from 1, and subtracts it. */
const WEEKDAY_KEYS: readonly string[] = [
  'weekday.sunday', 'weekday.monday', 'weekday.tuesday', 'weekday.wednesday',
  'weekday.thursday', 'weekday.friday', 'weekday.saturday',
];

export function weekdayKey(dayOfWeek: number): string {
  return WEEKDAY_KEYS[((Math.floor(dayOfWeek) % 7) + 7) % 7];
}
