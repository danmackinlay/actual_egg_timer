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
import { Lean, Outcome, WHITE_RISK } from './outcome.js';
import { Phase, Verdict, anchorNear } from './policy.js';
import { Cooling, HeatAfterBoil, StartMode } from './protocol.js';
import { EggFrom } from './record.js';
import { REACH_ODDS } from './reach.js';

/* ----------------------------------------------------------- the refusal */

/**
 * The refusal's sentence, or null when there is nothing worth saying. The app
 * adds `limit` (the doneness word the slider stops at) and, for
 * `refusal.harderThanPan`, `water`.
 *
 * The DECISION (which refusal, where the slider goes, whether the gap is
 * worth a sentence) is `verdictWithOdds`; this is only which words teach it.
 * A yolk too soft for the white is blamed on the cooling the cook chose.
 */
export function refusalKey(v: Verdict, cooling: Cooling): CopyRef | null {
  if (!v.worthSaying) return null;
  switch (v.kind) {
    case 'none': return null;
    case 'whiteNeverSets': return { key: 'refusal.whiteNeverSets', args: {} };
    case 'harderThanPanReaches': return { key: 'refusal.harderThanPan', args: {} };
    // The pan could, but the odds say it would rarely come out right.
    case 'unlikelySoft':
    case 'unlikelyHard':
      return {
        key: v.kind === 'unlikelySoft' ? 'refusal.unlikelySoft' : 'refusal.unlikelyHard',
        args: { hits: Math.round(REACH_ODDS * 10), of: 10 },
      };
    case 'tooSoftForWhite':
      return { key: cooling === 'counter' ? 'refusal.counter' : cooling === 'tap' ? 'refusal.tap' : 'refusal.ice', args: {} };
  }
}

/* ------------------------------------------------------------ the outcome */

/**
 * THE DIRECTION. "Probably just right" when the yolk is answered just right
 * at least half the time: "probably" means more likely than not, and nothing
 * less. Then a lean, when core gives one, as a second sentence of the same
 * message. Under half, the sentence leads with the miss, or says it cannot
 * call it when neither way is likelier (core's lean is 'balanced': a miss one
 * way less than three times in five). On the reference pot that is a fresh
 * install at every level (just right 0.21-0.30, balanced), and "probably just
 * right" from the first egg that taught something (0.56-0.58 after one egg
 * just right, 0.77 after three).
 *
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
export function pulledKey(cooling: Cooling): string {
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
