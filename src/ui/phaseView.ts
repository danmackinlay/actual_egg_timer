/**
 * What the readout says in each phase, as text: the words `phaseKeys` chooses
 * (src/core/wording.ts), rendered with this app's arguments - its clock, its
 * units. Pure: it reads the machine, the ticket and the clock it is given,
 * and writes nothing, so a test can ask it what any moment of a cook says.
 */

import { Cooling, HeatAfterBoil } from '../core/protocol.js';
import { phaseKeys } from '../core/wording.js';
import { t } from './copy.js';
import { formatClock, spokenClock } from './countdown.js';
import {
  Machine, coolingStartsIn_s, secondsAfterBoil, secondsHeating, secondsToCool, secondsToPull,
} from './machine.js';
import { UiStartMode } from './store.js';
import { Ticket } from './ticket.js';
import { show } from './units.js';

/** What the readout needs besides the machine, the ticket and the clock. */
export interface ReadoutFacts {
  /** The solve on screen: its time, which is the one shown while idle, and
   *  whether the white sets at all, so there is a cook to start. */
  cookTime_s: number;
  whiteSets: boolean;
  /** The pot on the controls. Read only while idle, or for anything the
   *  running cook's ticket does not say. */
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
}

/** The readout at `now_ms`. While a cook runs, everything describes the
 *  ticket's pot and the machine's cooling, not the controls: a second tab may
 *  have changed those. */
export function phaseView(
  machine: Machine, ticket: Ticket | null, now_ms: number, facts: ReadoutFacts,
): PhaseView {
  const idle = machine.phase === 'IDLE';
  const running = !idle && ticket !== null ? ticket.setup : null;
  const startMode = running?.startMode ?? facts.controls.startMode;
  const boiling_C = running?.boiling_C ?? facts.controls.boiling_C;
  const standing = (running === null ? facts.controls.afterBoil : running.afterBoil) === 'off';
  const cookTime_s = idle ? facts.cookTime_s : machine.cookTime_s;
  // How much of the clock the ramp takes: all of the time to boil on a cold
  // start, none of it otherwise. Once a cold start is under way the machine
  // carries the time to boil: the guess, the revision, the measurement.
  const boil_s = startMode !== 'cold' ? 0 : idle ? facts.controls.timeToBoil_s : machine.assumedBoil_s;

  // Which words: core's (`phaseKeys`). The arguments are this app's.
  const keys = phaseKeys({
    phase: machine.phase, startMode: startMode === 'cold' ? 'cold' : 'hot',
    afterBoil: standing ? 'off' : 'hold',
    cooling: idle ? facts.controls.cooling : machine.cooling,
    whiteSets: facts.whiteSets, boilKnown: facts.boilKnown, probeWanted: facts.probeWanted,
  });
  let digits = '';
  let subline = '';
  let spoken = '';
  let hintArgs = {};

  if (machine.phase === 'IDLE') {
    digits = formatClock(cookTime_s);
    subline = t(keys.subline, { boil: formatClock(boil_s), water: show('water', facts.controls.waterLitres) });
    spoken = t('spoken.total', { time: spokenClock(cookTime_s) });
    hintArgs = { time: formatClock(cookTime_s) };
  } else if (machine.phase === 'HEATING') {
    digits = formatClock(secondsToPull(machine, now_ms));
    subline = t(keys.subline, {
      elapsed: formatClock(secondsHeating(machine, now_ms)), boil: formatClock(machine.assumedBoil_s),
    });
    spoken = t('spoken.heating', { time: spokenClock(secondsToPull(machine, now_ms)) });
  } else if (machine.phase === 'COOKING') {
    digits = formatClock(secondsToPull(machine, now_ms));
    subline = t(keys.subline, {
      boil: formatClock(machine.assumedBoil_s), after: formatClock(secondsAfterBoil(machine)),
    });
    spoken = t('spoken.cooking', { time: spokenClock(secondsToPull(machine, now_ms)) });
    hintArgs = { boiling: show('temperature', boiling_C) };
  } else if (machine.phase === 'PULL') {
    digits = `+${formatClock((now_ms - machine.pulledAt_ms) / 1000)}`;
    subline = t(keys.subline);
    spoken = t('spoken.pull');
    hintArgs = { seconds: coolingStartsIn_s(machine, now_ms) ?? 0 };
  } else if (machine.phase === 'COOLING') {
    digits = formatClock(secondsToCool(machine, now_ms));
    subline = t(keys.subline);
    spoken = t('spoken.cooling', { time: spokenClock(secondsToCool(machine, now_ms)) });
  } else {
    digits = formatClock(cookTime_s);
    subline = t(keys.subline, { boil: formatClock(boil_s), cooking: formatClock(cookTime_s - boil_s) });
    spoken = t(facts.probePending ? 'spoken.probe' : 'spoken.done');
  }
  return {
    label: t(keys.label),
    digits: digits,
    subline: subline,
    spoken: spoken,
    primary: keys.action === null ? null : t(keys.action),
    primaryDisabled: idle && !facts.whiteSets,
    hint: keys.hint === null ? '' : t(keys.hint, hintArgs),
    secondaryVisible: !idle && machine.phase !== 'DONE',
  };
}
