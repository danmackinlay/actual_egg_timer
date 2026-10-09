/**
 * What the readout says while a cook runs: the words above, on and under the
 * clock, the buttons, and the numbers they take, for a cook and its plan at
 * one moment. Both apps draw it as given: the keys are the copy's, the
 * numbers are seconds (shown as a clock), degrees Celsius or whole seconds,
 * each by its argument's name, and the app renders them in its own units and
 * clock. The idle readout reads the controls, not a cook, and stays each
 * app's (`phaseKeys`).
 *
 * Pure: it reads the cook, its plan and the moment it is handed. Held in
 * Swift by `fixtures/step.json`, a readout for every step of every trace.
 */

import { Deadlines, Phase, PULL_GRACE_SECONDS, phaseAt } from './policy.js';
import { Cooling } from './protocol.js';
import { CookPlan, RunningCook, asksIfStillIn, guessLengthened } from './running.js';
import { phaseKeys } from './wording.js';

/** One line of words: a key, and the numbers it takes by name. `time`,
 *  `elapsed`, `boil`, `after` and `cooking` are seconds, shown as a clock
 *  (`time` spoken, where the key is a spoken one); `boiling` is degrees
 *  Celsius; `seconds` is a whole number of seconds. */
export interface ReadoutLine {
  key: string;
  args: Record<string, number>;
}

/** What a screen reader hears for the clock: which line to say (the web's
 *  `spoken.<say>` keys; iOS speaks none of them yet), or the line under the
 *  clock itself (`subline`), with the numbers it takes. */
export interface Spoken {
  say: 'heating' | 'cooking' | 'pull' | 'cooling' | 'done' | 'probe' | 'stillIn' | 'subline';
  args: Record<string, number>;
}

export interface Readout {
  /** The phase the clock reads (Cooling while the plan asks whether the egg
   *  is still in), and whether it asks. */
  phase: Phase;
  asking: boolean;
  /** Above the clock. */
  label: string;
  /** The clock, s, never below zero, and whether it counts on past the pull
   *  ('+'): in the pull's grace, and the time since the eggs were due out
   *  while the plan asks. While the slow hob has lengthened the guess, the
   *  time heated, counting up. */
  clock_s: number;
  sign: '' | '+';
  /** Under the clock. */
  subline: ReadoutLine;
  /** What a screen reader hears for the clock (`Spoken`). */
  spoken: Spoken;
  /** The primary button, or null when the phase has none; and the second,
   *  the "no" to "still in the water?". */
  primary: string | null;
  secondary: string | null;
  /** The line beside the primary button, or null when there is nothing true
   *  to add. */
  hint: ReadoutLine | null;
  /** Whether Cancel is offered: in every phase of a cook under way, a
   *  restored one included, but Done. */
  cancel: boolean;
}

/** What the readout needs of the cook's probe: whether its cooling ends in
 *  a reading asked for (the cook's probe setting, and a cooling that ends at
 *  the yolk's peak), and whether that reading is still to be given. */
export interface ReadoutProbe {
  wanted: boolean;
  pending: boolean;
}

/** Whole seconds until the counted cooling starts without the cook, if they
 *  do not tap first; null outside the pull, and on a counter rest, where
 *  nothing starts - the grace runs out into Done. */
export function coolingStartsIn_s(d: Deadlines, cooling: Cooling, now_s: number): number | null {
  if (phaseAt(d, now_s) !== 'PULL' || cooling === 'counter') return null;
  return Math.max(0, Math.ceil(PULL_GRACE_SECONDS - (now_s - d.cookEnd_s)));
}

/** The readout for `cook` with its `plan` at `now_s`. Everything describes
 *  the cook's own choices and its plan's pot, never the controls. */
export function readoutAt(
  cook: RunningCook, plan: CookPlan, now_s: number, probe: ReadoutProbe = { wanted: false, pending: false },
): Readout {
  const ch = cook.choices;
  const d = plan.deadlines;
  const phase = phaseAt(d, now_s);
  const cold = ch.startMode === 'cold';
  const cookTime = plan.cookTime_s;
  // How much of the clock the ramp takes: all of the time to boil on a cold
  // start (the guess, the slow hob's, the measurement), none otherwise.
  const boil = cold ? plan.setup.timeToBoil_s : 0;
  const toPull = d.cookEnd_s - now_s;

  // A pull the clock assumed, and a correction since that would pull later
  // or heat again: the plan asks whether the egg is still in the water, and
  // nothing past the question is shown until it is answered. The time is
  // how long since the egg was due out.
  if (asksIfStillIn(plan)) {
    const since = Math.max(0, now_s - d.cookEnd_s);
    return {
      phase: phase, asking: true, label: 'ask.stillIn', clock_s: since, sign: '+',
      subline: { key: 'readout.sub.stillIn', args: {} },
      spoken: { say: 'stillIn', args: { time: since } },
      primary: 'ask.stillIn.yes', secondary: 'ask.stillIn.no', hint: null, cancel: true,
    };
  }

  const keys = phaseKeys({
    phase: phase, startMode: cold ? 'cold' : 'hot', afterBoil: ch.afterBoil, cooling: ch.cooling,
    whiteSets: true, boilKnown: true, probeWanted: probe.wanted,
  });
  let clock = 0;
  let sign: '' | '+' = '';
  let subline: Record<string, number> = {};
  let spoken: Spoken = { say: 'done', args: {} };
  let hint: Record<string, number> = {};
  if (phase === 'HEATING') {
    const heated = now_s - cook.startedAt_s;
    subline = { elapsed: heated, boil: boil };
    if (guessLengthened(plan)) {
      // The slow hob has lengthened the guess: the pull moves with the clock,
      // so no time left is shown from it, but the time heated, counting up.
      clock = heated;
      spoken = { say: 'subline', args: subline };
    } else {
      clock = toPull;
      spoken = { say: 'heating', args: { time: toPull } };
    }
  } else if (phase === 'COOKING') {
    clock = toPull;
    subline = { boil: boil, after: cookTime - boil };
    spoken = { say: 'cooking', args: { time: toPull } };
    hint = { boiling: plan.setup.boiling_C };
  } else if (phase === 'PULL') {
    clock = -toPull;
    sign = '+';
    spoken = { say: 'pull', args: {} };
    hint = { seconds: coolingStartsIn_s(d, ch.cooling, now_s) ?? 0 };
  } else if (phase === 'COOLING') {
    // Never past its end.
    const toCool = Math.max(0, (d.coolEnd_s ?? now_s) - now_s);
    clock = toCool;
    spoken = { say: 'cooling', args: { time: toCool } };
  } else {
    clock = cookTime;
    subline = { boil: boil, cooking: cookTime - boil };
    spoken = { say: probe.pending ? 'probe' : 'done', args: {} };
  }
  return {
    phase: phase, asking: false, label: keys.label, clock_s: Math.max(0, clock), sign: sign,
    subline: { key: keys.subline, args: subline }, spoken: spoken,
    primary: keys.action, secondary: null,
    hint: keys.hint === null ? null : { key: keys.hint, args: hint },
    cancel: phase !== 'DONE',
  };
}
