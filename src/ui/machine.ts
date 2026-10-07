/**
 * What the readout needs of a running cook that core does not say.
 *
 *   IDLE -> HEATING -> COOKING -> PULL -> COOLING -> DONE
 *
 * The cook itself is core's (src/core/running.ts): its start, its choices and
 * what it observed, with the deadlines derived by `replan` and the phase read
 * from them by `phaseAt`, a pure function of the clock. That is what lets a
 * cook survive the tab being backgrounded, suspended or reloaded. The one
 * thing left here is a promise the PULL hint makes.
 */

import { Cooling } from '../core/protocol.js';
import { Deadlines, PULL_GRACE_SECONDS, phaseAt } from '../core/policy.js';

/** Whole seconds until the counted cooling starts without the cook, if they
 *  do not tap first; null outside PULL, and null on a counter rest, where
 *  nothing starts - the grace runs out into DONE, so a counter rest must not
 *  promise that cooling starts on its own. */
export function coolingStartsIn_s(d: Deadlines, cooling: Cooling, now_s: number): number | null {
  if (phaseAt(d, now_s) !== 'PULL' || cooling === 'counter') return null;
  return Math.max(0, Math.ceil(PULL_GRACE_SECONDS - (now_s - d.cookEnd_s)));
}
