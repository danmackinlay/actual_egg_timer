/**
 * The answer for the pot on screen: the solve (core `answerAt`), the time
 * decided on the pot's decision surface (core `decideAnswer`), the nudge,
 * and asking the worker for the surfaces and odds profiles the screen wants -
 * the idle pot's, and the one a running cook's plan wants (`replan`, in
 * core, re-plans a cook under way; cook.ts).
 *
 * Deciding and acting are two steps: nothing here moves the controls or
 * draws anything. Taking an answer up is update.ts's.
 */

import { DecisionInputs, decisionInputs, nudgeSeconds } from '../core/decide.js';
import { DecidedAnswer, LevelAnswer, OddsProfile, answerAt, decideAnswer, pricedChanges } from '../core/reach.js';
import { CookSurface, sameDecisionInputs } from '../core/running.js';
import {
  cachedDecisionGrid, cachedOddsProfile, decisionGrid, decisionKey, oddsProfileFor, profileKey,
} from './decisionGrids.js';
import { cancelSoon, soon } from './idle.js';
import { random } from './now.js';
import { shareState } from './share.js';
import { idlePot, isSousVide, state, timeToBoil_s } from './state.js';

/** What is waiting on the worker, and what to do when it lands. */
const asking = {
  /** A decision surface waiting for the inputs to settle before it is asked for. */
  decisionHandle: 0,
  /** Profiles asked for and not yet in, by key, so each lands once. */
  profiles: new Set<string>(),
  /** Re-solve the idle page (`recompute`, update.ts), which solves with this
   *  module and so is handed in by `boot()` rather than imported. */
  landed: (): void => {},
  /** Plan the running cook again (cook.ts), when a surface or a profile its
   *  plan wants lands. */
  cookLanded: (): void => {},
};

/** What to do when a surface or a profile the idle screen still wants
 *  lands. */
export function whenAnswerLands(recompute: () => void): void {
  asking.landed = recompute;
}

/** What to do when a surface or a profile the running cook's plan wants
 *  lands. */
export function whenCookSurfaceLands(replanCook: () => void): void {
  asking.cookLanded = replanCook;
}

/* --------------------------------------------------------------- solving */

/** Solve for the given inputs (core `answerAt`). Pure apart from reading
 *  `settings`: it moves nothing and writes nothing. Deciding and acting are
 *  two steps, and only the idle path takes the second. */
export function answerFor(timeToBoil_s: number, level: number, odds: OddsProfile | null): LevelAnswer {
  const pot = idlePot(timeToBoil_s);
  return answerAt(state.calib, pot.egg, pot.setup, level, odds, true);
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
  const { egg, setup } = idlePot(timeToBoil_s);
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
 *  -10 to +10, drawn when the page boots and again after each cook, so the
 *  time on screen holds still while the cook looks at it. Drawn by `boot()`
 *  (app.ts), not as this module loads, so a script's seed (now.ts) is in
 *  place for the first draw. */
const nudge = { draw: 0 };

/** A new page or a new cook, a new nudge. */
export function drawNudge(): void {
  nudge.draw = nudgeSeconds(random());
}

/** The nudge the time takes now: the draw while sharing is on, and none
 *  while it is off - the consent covers it, and nothing else does. A cook
 *  started now keeps it (`startCook`). */
export function nudgeNow(): number {
  return shareState().on ? nudge.draw : 0;
}

/** How long the inputs must sit still before a decision surface is asked for,
 *  ms, on top of the solve's own coalescing. A surface is a second of the
 *  worker's time; a pot typed digit by digit should not queue one per digit. */
const DECISION_SETTLE_MS = 300;

/** Ask the worker for this pot's surface once the inputs have settled, and
 *  re-solve when it lands if the pot on screen is still the one it was for. */
function askForDecision(inputs: DecisionInputs): void {
  cancelSoon(asking.decisionHandle);
  asking.decisionHandle = soon(() => {
    asking.decisionHandle = 0;
    const key = decisionKey(inputs);
    decisionGrid(inputs).then(() => {
      if (state.cook !== null || isSousVide()) return;
      if (decisionKey(currentInputs(timeToBoil_s())) === key) asking.landed();
    }, (error: unknown) => console.warn('decision surface failed', error));
  }, DECISION_SETTLE_MS);
}

/** The pot on screen as a decision's inputs: what its surface and its odds
 *  profile are keyed by. */
export function currentInputs(timeToBoil_s: number): DecisionInputs {
  const { egg, setup } = idlePot(timeToBoil_s);
  return decisionInputs(state.calib, egg, setup);
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
    if (cookWants(inputs)) {
      asking.cookLanded();
      return;
    }
    if (state.cook !== null || isSousVide()) return;
    if (wantedProfileKeys().has(key)) asking.landed();
  }, (error: unknown) => {
    asking.profiles.delete(key);
    console.warn('odds profile failed', error);
  });
}

/* ------------------------------------------------------- a cook under way */

/** Whether the running cook's plan reads the surface for `inputs`. */
function cookWants(inputs: DecisionInputs): boolean {
  const wanted = state.plan === null ? null : state.plan.inputs;
  return wanted !== null && sameDecisionInputs(wanted, inputs);
}

/** The surface for `inputs` as far as it is in: the grid, with the odds
 *  profile if that is in too; null until the grid is. */
export function surfaceFor(inputs: DecisionInputs | null): CookSurface | null {
  if (inputs === null) return null;
  const grid = cachedDecisionGrid(inputs);
  if (grid === null) return null;
  return { inputs: inputs, grid: grid, profile: cachedOddsProfile(inputs, state.calib) };
}

/** Ask the worker for what the running cook's plan wants and has not got -
 *  its pot's surface, then the odds profile on it - and plan the cook again
 *  as each lands, if it still wants it. A new pot mid-cook (the boil tapped)
 *  is asked for at once: the egg is already in the water. */
export function askForCookSurface(inputs: DecisionInputs): void {
  if (cachedDecisionGrid(inputs) === null) {
    decisionGrid(inputs).then(() => {
      if (cookWants(inputs)) asking.cookLanded();
    }, (error: unknown) => console.warn('decision surface failed', error));
    return;
  }
  if (cachedOddsProfile(inputs, state.calib) === null) askForProfile(inputs);
}
