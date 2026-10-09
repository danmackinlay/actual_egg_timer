/**
 * What the readout says in each phase, as text. While a cook runs, the words
 * and their numbers are core's (`readoutAt`, src/core/readout.ts, iOS's
 * too), rendered here with this app's clock and units; idle, the words
 * `phaseKeys` chooses for the controls. Pure: it reads the running cook, its
 * plan and the clock it is given, and writes nothing, so a test can ask it
 * what any moment of a cook says.
 */

import { CopyArgs } from '../core/copy.js';
import { CookPlan, RunningCook } from '../core/running.js';
import { ReadoutLine, Spoken, readoutAt } from '../core/readout.js';
import { Cooling, HeatAfterBoil } from '../core/protocol.js';
import { phaseKeys } from '../core/wording.js';
import { t } from './copy.js';
import { formatClock, spokenClock } from './countdown.js';
import { UiStartMode } from './store.js';
import { show } from './units.js';

export { coolingStartsIn_s } from '../core/readout.js';

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
  /** The plan asks whether the egg is still in the water (`deadlines.asking`):
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
  if (cook !== null && plan !== null) {
    const r = readoutAt(cook, plan, now_ms / 1000, { wanted: facts.probeWanted, pending: facts.probePending });
    return {
      label: t(r.label),
      digits: `${r.sign}${formatClock(r.clock_s)}`,
      subline: line(r.subline),
      spoken: r.spoken.say === 'subline' ? line({ key: r.subline.key, args: r.spoken.args })
        : line({ key: SPOKEN[r.spoken.say], args: r.spoken.args }),
      primary: r.primary === null ? null : t(r.primary),
      primaryDisabled: false,
      hint: r.hint === null ? '' : line(r.hint),
      secondaryVisible: r.cancel,
      asking: r.asking,
    };
  }
  // Idle: the controls' pot, in the words `phaseKeys` chooses.
  const c = facts.controls;
  const cookTime_s = facts.cookTime_s;
  const boil_s = c.startMode !== 'cold' ? 0 : c.timeToBoil_s;
  const keys = phaseKeys({
    phase: 'IDLE', startMode: c.startMode === 'cold' ? 'cold' : 'hot', afterBoil: c.afterBoil, cooling: c.cooling,
    whiteSets: facts.whiteSets, boilKnown: facts.boilKnown, probeWanted: facts.probeWanted,
  });
  return {
    label: t(keys.label),
    digits: formatClock(cookTime_s),
    subline: t(keys.subline, { boil: formatClock(boil_s), water: show('water', c.waterLitres) }),
    spoken: t('spoken.total', { time: spokenClock(cookTime_s) }),
    primary: keys.action === null ? null : t(keys.action),
    primaryDisabled: !facts.whiteSets,
    hint: keys.hint === null ? '' : t(keys.hint, { time: formatClock(cookTime_s) }),
    secondaryVisible: false,
    asking: false,
  };
}

/** What a screen reader hears for the clock, by what core says to say. */
const SPOKEN: Record<Exclude<Spoken['say'], 'subline'>, string> = {
  heating: 'spoken.heating', cooking: 'spoken.cooking', pull: 'spoken.pull', cooling: 'spoken.cooling',
  done: 'spoken.done', probe: 'spoken.probe', stillIn: 'spoken.stillIn',
};

/** One of core's lines in words: each number by its name, `time` spoken,
 *  `boiling` a temperature, `seconds` as it is, the rest a clock. */
function line(l: ReadoutLine): string {
  const args: Record<string, string | number> = {};
  for (const name of Object.keys(l.args)) {
    const v = l.args[name];
    args[name] = name === 'time' ? spokenClock(v) : name === 'boiling' ? show('temperature', v)
      : name === 'seconds' ? v : formatClock(v);
  }
  return t(l.key, args as CopyArgs);
}
