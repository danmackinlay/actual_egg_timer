/**
 * The idle page's answer for the pot the settings describe: the solve (core
 * `answerAt`), the time decided on the pot's decision surface (core
 * `decideAnswer`) with the nudge, and the advice priced on the odds of the
 * changes it would make (`protocolAdvice`).
 *
 * Pure: the surfaces and the odds profiles built so far are in the model
 * (`surfaces`, `profiles`: the runner's view of its caches, decisionGrids.ts),
 * and what is missing is said (`IdleSolve.surface`, `.profiles`) for the
 * runner to ask the worker for, never fetched here.
 */

import { DecisionInputs, decisionInputs, inputsKey } from '../core/decide.js';
import { DoseGrid } from '../core/doseGrid.js';
import {
  DecidedAnswer, LevelAnswer, OddsProfile, answerAt, decideAnswer, pricedChanges, protocolAdvice,
} from '../core/reach.js';
import type { Model } from './model.js';
import { idleChoices, idlePot, isSousVide } from './state.js';

/** An odds profile built, and the pot it is for. */
export interface PotOdds {
  inputs: DecisionInputs;
  profile: OddsProfile;
}

/** The odds profile for `inputs` on the calibration as it stands, if it is
 *  in. */
export function oddsIn(m: Model, inputs: DecisionInputs): OddsProfile | null {
  const key = inputsKey(inputs);
  for (const p of m.profiles) if (inputsKey(p.inputs) === key) return p.profile;
  return null;
}

/** The decision surface for `inputs`, if it is built. */
function gridIn(m: Model, inputs: DecisionInputs): DoseGrid | null {
  const key = inputsKey(inputs);
  for (const s of m.surfaces) if (inputsKey(s.inputs) === key) return s.grid;
  return null;
}

/** The nudge the time takes now: the draw while sharing is on, and none
 *  while it is off - the consent covers it, and nothing else does. A cook
 *  started now keeps it (`startCook`). */
export function nudgeNow(m: Model): number {
  return m.sharing ? m.nudgeDraw : 0;
}

/** The pot the settings describe as a decision's inputs: what its surface
 *  and its odds profile are keyed by. */
export function currentInputs(m: Model): DecisionInputs {
  const { egg, setup } = idlePot(m);
  return decisionInputs(m.calib, egg, setup);
}

/** The profiles the idle page reads: this pot's, and those of the changes
 *  the advice would price (`pricedChanges`). */
export function wantedProfiles(m: Model): DecisionInputs[] {
  const inputs = currentInputs(m);
  const out = [inputs];
  for (const change of pricedChanges(inputs.setup)) out.push(decisionInputs(m.calib, inputs.egg, change.setup));
  return out;
}

/** The idle page solved: the answer at the level asked, the time decided if
 *  the pot's surface is in, the pot's odds, and what is still to be built
 *  for it - the surface (asked for once the inputs settle), and the odds
 *  profiles. */
export interface IdleSolve {
  answer: LevelAnswer;
  chosen: DecidedAnswer | null;
  profile: OddsProfile | null;
  surface: DecisionInputs | null;
  profiles: DecisionInputs[];
}

/**
 * The idle page's answer (core `answerAt`) with its time decided (core
 * `decideAnswer`) if this pot's decision surface has been built - and if it
 * has not, no decision, so the mean solve's time stands, with the surface
 * wanted.
 *
 * The surface does not depend on the slider, so a drag is answered from the
 * one already built, and the time never jumps between the mean solve's and
 * the chosen one mid-drag. It changes once, when a new pot's surface lands.
 *
 * Once the pot's odds profile is in too, the time is held by it, so a softer
 * level never gets a later time than a firmer one (`envelopeBounds`).
 * Until then a level has its own choice, and the time can
 * move once more when the profile lands. The nudge moves the chosen time,
 * where one is chosen, for a cook who is sharing. The outcome is read on
 * the same surface: about 2 ms beside the decision's 13-16, so it runs here
 * with it rather than in the worker.
 */
export function solveIdle(m: Model): IdleSolve {
  const inputs = currentInputs(m);
  const profile = oddsIn(m, inputs);
  const { egg, setup } = idlePot(m);
  const answer = answerAt(m.calib, egg, setup, m.settings.doneness, profile);
  const grid = gridIn(m, inputs);
  if (grid === null) return { answer: answer, chosen: null, profile: profile, surface: inputs, profiles: [] };
  const profiles = profile === null ? [inputs] : [];
  const chosen = decideAnswer(m.calib, egg, setup, grid, answer.solution, answer.level, profile, nudgeNow(m));
  // The advice prices a change on its own pot's odds, asked for here.
  if (m.cook === null && !isSousVide(m) && chosen.adviceWanted) {
    for (const change of pricedChanges(setup)) {
      const changed = decisionInputs(m.calib, egg, change.setup);
      if (oddsIn(m, changed) === null) profiles.push(changed);
    }
  }
  return { answer: answer, chosen: chosen, profile: profile, surface: null, profiles: profiles };
}

/** The way to Help under a wild guess (reach.ts, "when to advise"): the
 *  keys of what would help this setup, and whether a change the model can
 *  price makes the word asked surer. Idle only, and only once the time is
 *  decided; the priced changes count as their profiles land. */
export function adviceFor(m: Model): { keys: string[]; surer: boolean; wanted: boolean } {
  const chosen = m.chosen;
  const wanted = m.cook === null && !isSousVide(m) && chosen !== null && chosen.adviceWanted;
  if (!wanted || chosen === null) return { keys: [], surer: false, wanted: false };
  const inputs = currentInputs(m);
  const priced: { key: string; profile: OddsProfile }[] = [];
  for (const change of pricedChanges(inputs.setup)) {
    const p = oddsIn(m, decisionInputs(m.calib, inputs.egg, change.setup));
    if (p !== null) priced.push({ key: change.key, profile: p });
  }
  const advice = protocolAdvice(
    inputs.setup, { eggFromClass: idleChoices(m).massFrom === 'class', startAssumed: m.settings.startTempMode === 'room' },
    chosen.level, chosen.certainty.words.pAsked, priced,
  );
  return { keys: advice.keys, surer: advice.surer, wanted: true };
}
