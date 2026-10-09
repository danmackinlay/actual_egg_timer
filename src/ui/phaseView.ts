/**
 * What the readout says in each phase, as text: the words `phaseKeys` chooses
 * (src/core/wording.ts), rendered with this app's arguments - its clock, its
 * units. Pure: it reads the running cook, its plan and the clock it is
 * given, and writes nothing, so a test can ask it what any moment of a cook
 * says.
 */

import { Cooling, HeatAfterBoil } from '../core/protocol.js';
import { Deadlines, PULL_GRACE_SECONDS, phaseAt } from '../core/policy.js';
import { CookPlan, RunningCook } from '../core/running.js';
import { phaseKeys } from '../core/wording.js';
import { t } from './copy.js';
import { formatClock, spokenClock } from './countdown.js';
import { UiStartMode } from './store.js';
import { show } from './units.js';

/** What the readout needs besides the cook, its plan and the clock. */
export interface ReadoutFacts {
  /** The solve on screen: its time, which is the one shown while idle, and
   *  whether the white sets at all, so there is a cook to start. */
  cookTime_s: number;
  whiteSets: boolean;
  /** The pot on the controls. Read only while idle, or for anything the
   *  running cook does not say. */
  controls: {
    startMode: UiStartMode;
    afterBoil: HeatAfterBoil;
    cooling: Cooling;
    waterLitres: number;
    /** Where water boils at the controls' altitude, C. */
    boiling_C: number;
    /** The controls' pot's time to a rolling boil, remembered or guessed, s. */
    timeToBoil_s: number;
  };
  /** Whether this pan's time to boil is remembered, not guessed. */
  boilKnown: boolean;
  /** Whether this cook asks for a probe reading when its cooling ends. */
  probeWanted: boolean;
  /** Whether it is asking for one now. */
  probePending: boolean;
}

/** The readout's words and the buttons under it. */
export interface PhaseView {
  /** Above the clock. */
  label: string;
  /** The clock. */
  digits: string;
  /** Under the clock. */
  subline: string;
  /** What a screen reader hears for the clock. */
  spoken: string;
  /** The primary button's label, or null when the phase has none. */
  primary: string | null;
  /** Whether the primary button is shown but cannot be pressed: idle with no
   *  cook on offer at all. */
  primaryDisabled: boolean;
  /** The line beside the primary button; empty when there is nothing true to
   *  add. */
  hint: string;
  /** Cancel is reachable in every phase of a cook under way, including one a
   *  reload lands in: a cook picked back up must be one you can put down. */
  secondaryVisible: boolean;
  /** The plan asks whether the egg is still in the water (`askIfStillIn`):
   *  the primary button says yes, and a second button no. */
  asking: boolean;
}

/** The readout at `now_ms`, for the running cook `cook` with its `plan`, or
 *  the controls while both are null. While a cook runs, everything describes
 *  its own choices and its plan's pot, not the controls: a second tab may
 *  have changed those. */
export function phaseView(
  cook: RunningCook | null, plan: CookPlan | null, now_ms: number, facts: ReadoutFacts,
): PhaseView {
  const now_s = now_ms / 1000;
  const run = cook !== null && plan !== null ? { cook: cook, plan: plan } : null;
  const phase = run === null ? 'IDLE' : phaseAt(run.plan.deadlines, now_s);
  const idle = run === null;
  const startMode = run?.cook.choices.startMode ?? facts.controls.startMode;
  const boiling_C = run?.plan.setup.boiling_C ?? facts.controls.boiling_C;
  const standing = (run === null ? facts.controls.afterBoil : run.cook.choices.afterBoil) === 'off';
  const cooling = run === null ? facts.controls.cooling : run.cook.choices.cooling;
  const cookTime_s = run === null ? facts.cookTime_s : run.plan.cookTime_s;
  // How much of the clock the ramp takes: all of the time to boil on a cold
  // start, none of it otherwise. Once a cold start is under way its plan
  // carries the time to boil: the guess, the slow hob's, the measurement.
  const boil_s = startMode !== 'cold' ? 0 : run === null ? facts.controls.timeToBoil_s : run.plan.setup.timeToBoil_s;
  const toPull = run === null ? 0 : run.plan.deadlines.cookEnd_s - now_s;

  // Which words: core's (`phaseKeys`). The arguments are this app's.
  const keys = phaseKeys({
    phase: phase, startMode: startMode === 'cold' ? 'cold' : 'hot',
    afterBoil: standing ? 'off' : 'hold',
    cooling: cooling,
    whiteSets: facts.whiteSets, boilKnown: facts.boilKnown, probeWanted: facts.probeWanted,
  });
  let digits = '';
  let subline = '';
  let spoken = '';
  let hintArgs = {};

  if (run === null) {
    digits = formatClock(cookTime_s);
    subline = t(keys.subline, { boil: formatClock(boil_s), water: show('water', facts.controls.waterLitres) });
    spoken = t('spoken.total', { time: spokenClock(cookTime_s) });
    hintArgs = { time: formatClock(cookTime_s) };
  } else if (phase === 'HEATING') {
    const heated = formatClock(now_s - run.cook.startedAt_s);
    subline = t(keys.subline, { elapsed: heated, boil: formatClock(boil_s) });
    if (run.plan.lengthened) {
      // The slow hob has lengthened the guess: the pull moves with the clock,
      // so no time left is shown from it (it would read 0:00 while still
      // heating, running-cook review 3), but the time heated, counting up.
      digits = heated;
      spoken = subline;
    } else {
      digits = formatClock(toPull);
      spoken = t('spoken.heating', { time: spokenClock(toPull) });
    }
  } else if (phase === 'COOKING') {
    digits = formatClock(toPull);
    subline = t(keys.subline, { boil: formatClock(boil_s), after: formatClock(cookTime_s - boil_s) });
    spoken = t('spoken.cooking', { time: spokenClock(toPull) });
    hintArgs = { boiling: show('temperature', boiling_C) };
  } else if (phase === 'PULL') {
    digits = `+${formatClock(-toPull)}`;
    subline = t(keys.subline);
    spoken = t('spoken.pull');
    hintArgs = { seconds: coolingStartsIn_s(run.plan.deadlines, cooling, now_s) ?? 0 };
  } else if (phase === 'COOLING') {
    // Never past its end: a plan that asks whether the egg is still in holds
    // Cooling there (running-cook review 3).
    const toCool = Math.max(0, (run.plan.deadlines.coolEnd_s ?? now_s) - now_s);
    digits = formatClock(toCool);
    subline = t(keys.subline);
    spoken = t('spoken.cooling', { time: spokenClock(toCool) });
  } else {
    digits = formatClock(cookTime_s);
    subline = t(keys.subline, { boil: formatClock(boil_s), cooking: formatClock(cookTime_s - boil_s) });
    spoken = t(facts.probePending ? 'spoken.probe' : 'spoken.done');
  }
  // A pull the clock assumed (the grace ran out), and a correction since
  // that would pull later or heat again: the plan asks whether the egg is
  // still in the water (DECISIONS.md 98, review 1.1), and nothing past the
  // question is shown until it is answered (running-cook review 3): not the
  // cooling, nor Done. The time is how long since the egg was due out.
  if (run !== null && run.plan.askIfStillIn) {
    const since = Math.max(0, now_s - run.plan.deadlines.cookEnd_s);
    return {
      label: t('ask.stillIn'),
      digits: `+${formatClock(since)}`,
      subline: t('readout.sub.stillIn'),
      spoken: t('spoken.stillIn', { time: spokenClock(since) }),
      primary: t('ask.stillIn.yes'),
      primaryDisabled: false,
      hint: '',
      secondaryVisible: true,
      asking: true,
    };
  }
  return {
    label: t(keys.label),
    digits: digits,
    subline: subline,
    spoken: spoken,
    primary: keys.action === null ? null : t(keys.action),
    primaryDisabled: idle && !facts.whiteSets,
    hint: keys.hint === null ? '' : t(keys.hint, hintArgs),
    secondaryVisible: !idle && phase !== 'DONE',
    asking: false,
  };
}

/** Whole seconds until the counted cooling starts without the cook, if they
 *  do not tap first; null outside PULL, and null on a counter rest, where
 *  nothing starts - the grace runs out into DONE, so a counter rest must not
 *  promise that cooling starts on its own. */
export function coolingStartsIn_s(d: Deadlines, cooling: Cooling, now_s: number): number | null {
  if (phaseAt(d, now_s) !== 'PULL' || cooling === 'counter') return null;
  return Math.max(0, Math.ceil(PULL_GRACE_SECONDS - (now_s - d.cookEnd_s)));
}
