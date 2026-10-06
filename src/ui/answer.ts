/**
 * The answer for the pot on screen: the solve (core `answerAt`), the time
 * decided on the pot's decision surface (core `decideAnswer`), the nudge,
 * and asking the worker for the surfaces and odds profiles the screen wants.
 * And the re-solve of a cook already under way, for a corrected time to boil.
 *
 * Deciding and acting are two steps: nothing here moves the controls or
 * draws anything. Taking an answer up is update.ts's.
 */

import { Solution } from '../core/solve.js';
import { probeMomentFor } from '../core/policy.js';
import {
  DecisionInputs, carriedSolution, decisionApplies, decisionInputs, nudgeSeconds,
} from '../core/decide.js';
import { DecidedAnswer, LevelAnswer, OddsProfile, answerAt, decideAnswer, pricedChanges } from '../core/reach.js';
import { calibrationParams } from './calibration.js';
import {
  cachedDecisionGrid, cachedOddsProfile, decisionGrid, decisionKey, oddsProfileFor, profileKey,
} from './decisionGrids.js';
import { shareState } from './share.js';
import { buildSetup, currentEgg, isSousVide, state, timeToBoil_s } from './state.js';
import { Ticket, withTimeToBoil } from './ticket.js';

/** What is waiting on the worker, and what to do when it lands. */
const asking = {
  /** A decision surface waiting for the inputs to settle before it is asked for. */
  decisionHandle: 0,
  /** Profiles asked for and not yet in, by key, so each lands once. */
  profiles: new Set<string>(),
  /** Re-solve the idle page (`recompute`, update.ts), which solves with this
   *  module and so is handed in by `boot()` rather than imported. */
  landed: (): void => {},
};

/** What to do when a surface or a profile the screen still wants lands. */
export function whenAnswerLands(recompute: () => void): void {
  asking.landed = recompute;
}

/* --------------------------------------------------------------- solving */

/** Solve for the given inputs (core `answerAt`). Pure apart from reading
 *  `settings`: it moves nothing and writes nothing. Deciding and acting are
 *  two steps, and only the idle path takes the second, so a slow hob cannot
 *  move the user's doneness mid-cook. */
export function answerFor(timeToBoil_s: number, level: number, odds: OddsProfile | null): LevelAnswer {
  return answerAt(state.calib, currentEgg(), buildSetup(timeToBoil_s), level, odds, true);
}

/**
 * The answer with its time decided (core `decideAnswer`), if this pot's
 * decision surface has been built - and if it has not, null, so the mean
 * solve's time stands, with the surface asked for once the inputs settle.
 *
 * The surface does not depend on the slider, so a drag is answered from the one
 * already built, and the time never jumps between the mean solve's and the
 * chosen one mid-drag. It changes once, when a new pot's surface lands.
 *
 * Once the pot's odds profile is in too, the time is held by it, so a softer
 * level never gets a later time than a firmer one (`envelopeBounds`,
 * DECISIONS.md 84). Until then a level has its own choice, and the time can
 * move once more when the profile lands.
 */
export function decided(answer: LevelAnswer, timeToBoil_s: number): DecidedAnswer | null {
  const egg = currentEgg();
  const setup = buildSetup(timeToBoil_s);
  const inputs = decisionInputs(state.calib, egg, setup);
  const grid = cachedDecisionGrid(inputs);
  if (grid === null) {
    askForDecision(inputs);
    return null;
  }
  // The odds at every level follow the surface, in the worker.
  const odds = cachedOddsProfile(inputs, state.calib);
  if (odds === null) askForProfile(inputs);
  // The nudge moves the chosen time, where one is chosen, for a cook who is
  // sharing (E8). The outcome is read on the same surface: about 2 ms beside
  // the decision's 13-16, so it runs here with it rather than in the worker.
  return decideAnswer(state.calib, egg, setup, grid, answer.solution, answer.level, odds, nudgeNow());
}

/* -------------------------------------------------------------- the nudge */

/** This page's nudge (E8, DECISIONS.md 61): a whole number of seconds from
 *  -10 to +10, drawn when the page loads and again after each cook, so the
 *  time on screen holds still while the cook looks at it. */
const nudge = { draw: nudgeSeconds(Math.random()) };

/** A new cook, a new nudge. */
export function drawNudge(): void {
  nudge.draw = nudgeSeconds(Math.random());
}

/** The nudge the time takes now: the draw while sharing is on, and none
 *  while it is off - the consent covers it, and nothing else does. */
function nudgeNow(): number {
  return shareState().on ? nudge.draw : 0;
}

/** How long the inputs must sit still before a decision surface is asked for,
 *  ms, on top of the solve's own coalescing. A surface is a second of the
 *  worker's time; a pot typed digit by digit should not queue one per digit. */
const DECISION_SETTLE_MS = 300;

/** Ask the worker for this pot's surface once the inputs have settled, and
 *  re-solve when it lands if the pot on screen is still the one it was for. */
function askForDecision(inputs: DecisionInputs): void {
  if (asking.decisionHandle !== 0) window.clearTimeout(asking.decisionHandle);
  asking.decisionHandle = window.setTimeout(() => {
    asking.decisionHandle = 0;
    const key = decisionKey(inputs);
    decisionGrid(inputs).then(() => {
      if (state.machine.phase !== 'IDLE' || isSousVide()) return;
      const now = decisionKey(decisionInputs(state.calib, currentEgg(), buildSetup(timeToBoil_s())));
      if (now === key) asking.landed();
    }, (error: unknown) => console.warn('decision surface failed', error));
  }, DECISION_SETTLE_MS);
}

/** The pot on screen as a decision's inputs: what its surface and its odds
 *  profile are keyed by. */
export function currentInputs(timeToBoil_s: number): DecisionInputs {
  return decisionInputs(state.calib, currentEgg(), buildSetup(timeToBoil_s));
}

/** The profiles the screen wants now: this pot's, and those of the changes
 *  the advice would price (`pricedChanges`). */
function wantedProfileKeys(): Set<string> {
  const inputs = currentInputs(timeToBoil_s());
  const keys = new Set<string>([profileKey(inputs, state.calib)]);
  for (const change of pricedChanges(inputs.setup)) {
    keys.add(profileKey(decisionInputs(state.calib, inputs.egg, change.setup), state.calib));
  }
  return keys;
}

/** Ask the worker for the odds at every level for these inputs - after their
 *  surface, which it builds first if need be - and take them up when they land,
 *  if the screen still wants them. */
export function askForProfile(inputs: DecisionInputs): void {
  const key = profileKey(inputs, state.calib);
  if (asking.profiles.has(key)) return;
  asking.profiles.add(key);
  // The key is cleared whether the profile lands or fails, so a failed one
  // is asked for again the next time the screen wants it.
  oddsProfileFor(inputs, state.calib).then(() => {
    asking.profiles.delete(key);
    if (state.machine.phase !== 'IDLE' || isSousVide()) return;
    if (wantedProfileKeys().has(key)) asking.landed();
  }, (error: unknown) => {
    asking.profiles.delete(key);
    console.warn('odds profile failed', error);
  });
}

/* ------------------------------------------------------- a cook under way */

/** Re-solve a cook already under way, for a corrected time to boil.
 *
 *  The doneness is whatever the cook was STARTED at, and nothing here moves it
 *  - not the slider, and not the answer. The egg is in the water and the
 *  controls are gone, so a snapped re-solve would describe a cook nobody is
 *  having; an unreachable target answers with the furthest this pan goes, which
 *  is the only cook on offer. The refusal is left alone for the same reason:
 *  it is advice about a control the user cannot reach. */
export function resolveDuring(t: Ticket, timeToBoil_s: number): Solution {
  // The ticket's egg and pot, never the controls': a second tab may have
  // changed those since "Eggs in".
  const { egg, setup } = withTimeToBoil(t, timeToBoil_s);
  // Through `answerAt`, as every solve is, with no snap retry: the target is
  // frozen, so a retry would answer for an egg nobody is cooking. iOS's
  // `cookResult` asks the same.
  const mean = answerAt(state.calib, egg, setup, state.machine.targetLevel, null, false).solution;
  // Leaned as far as the choice leaned at "Eggs in": the new ramp is a new pot,
  // whose surface is a second away with the egg already in (`carriedSolution`).
  // The nudge is carried with it, so the egg comes out when the record says.
  return carriedSolution(egg, setup, calibrationParams(state.calib), mean, t.lean_s + t.nudge_s);
}

/** Take a new time to boil into the cook under way - the slow hob's guess, or
 *  the boil the cook tapped: re-solve it (`resolveDuring`), and patch the ramp
 *  into the frozen ticket rather than rebuilding it from the live controls,
 *  which another tab may have changed. Whether the cook has a moment to probe
 *  at moves with the solve. Returns the solve, for the machine's deadlines. */
export function retime(k: Ticket, boil_s: number): Solution {
  const sol = resolveDuring(k, boil_s);
  const moved = withTimeToBoil(k, boil_s);
  state.solution = sol;
  // Where the new ramp leaves no time to choose, neither the lean nor the
  // nudge was carried (`carriedSolution`), and the record must not say it was.
  const carried = decisionApplies(sol) ? moved.nudge_s : 0;
  state.ticket = { ...moved, nudge_s: carried, probeMoment: probeMomentFor(sol.result, moved.setup.cooling) };
  return sol;
}
