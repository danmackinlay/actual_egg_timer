/**
 * What the page waits for, built off the main thread and asked for once
 * however many messages ask while it is built: the idle pot's surface, once
 * its inputs settle, and the odds profiles the idle page wants; a cook's
 * pot's surface and the profile on it; the calibration before a cook's egg,
 * and a surface on that. Each lands as a message, if the page still wants
 * it. What builds them is handed in (`Builds`: the worker's, decisionGrids.ts,
 * or a test's), and so is the model, read as it is when each lands.
 */

import type { DecisionInputs } from '../core/decide.js';
import { inputsKey } from '../core/decide.js';
import type { DoseGrid } from '../core/doseGrid.js';
import type { OddsProfile } from '../core/reach.js';
import type { Calibration } from '../core/record.js';
import { currentInputs, wantedProfiles } from './answer.js';
import { cachedDecisionGrid, cachedOddsProfile, decisionGrid, oddsProfileFor, profileKey } from './decisionGrids.js';
import type { Learner } from './calibration.js';
import { cancelSoon, soon } from './idle.js';
import type { Model, Msg } from './model.js';
import { isSousVide } from './state.js';

/** What builds what the page waits for. */
export interface Builds {
  /** The decision surface for a pot. */
  grid(inputs: DecisionInputs): Promise<DoseGrid>;
  /** The odds at every level for a pot and a posterior, on its surface. */
  profile(inputs: DecisionInputs, c: Calibration): Promise<OddsProfile>;
  /** Whether each is built already. */
  hasGrid(inputs: DecisionInputs): boolean;
  hasProfile(inputs: DecisionInputs, c: Calibration): boolean;
  /** The calibration before the egg of the cook started at `id`. */
  before(id: number): Promise<Calibration>;
}

/** What the page's worker builds (decisionGrids.ts), and the calibration
 *  before an egg, from the page's learner. */
export function workerBuilds(learner: Learner): Builds {
  return {
    grid: decisionGrid,
    profile: oddsProfileFor,
    hasGrid: (inputs) => cachedDecisionGrid(inputs) !== null,
    hasProfile: (inputs, c) => cachedOddsProfile(inputs, c) !== null,
    before: (id) => learner.calibrationBefore(id),
  };
}

/** How long the inputs must sit still before a decision surface is asked for,
 *  ms, on top of the solve's own coalescing. A surface is a second of the
 *  worker's time; a pot typed digit by digit should not queue one per digit. */
const DECISION_SETTLE_MS = 300;

/** A page's asks (`openNeeds`). */
export type Needs = ReturnType<typeof openNeeds>;

/** The asks of a page whose model is `model()`, built by `builds`, landing
 *  as messages to `send`. */
export function openNeeds(builds: Builds, model: () => Model, send: (msg: Msg) => void) {
  /** What is being built for a cook, by key; the profiles asked for; the
   *  idle pot's surface waiting for its inputs to settle. */
  const building = new Set<string>();
  const profiles = new Set<string>();
  let decisionHandle = 0;

  /** Whether a cook wants the surface for `inputs`: the running cook's plan
   *  reads it, or a cook waits on it. */
  function cookWants(inputs: DecisionInputs): boolean {
    const m = model();
    const key = inputsKey(inputs);
    const wanted = (i: DecisionInputs | null): boolean => i !== null && inputsKey(i) === key;
    if (m.plan !== null && wanted(m.plan.inputs)) return true;
    return wanted(m.need.surface) || m.ending.some((e) => wanted(e.need.surface));
  }

  /** Whether the idle page is on screen with a pan to solve for. */
  function idlePan(): boolean {
    const m = model();
    return m.cook === null && !isSousVide(m);
  }

  /** The idle pot's surface, once the inputs have settled; solved again when
   *  it lands if the pot on screen is still the one it was for. */
  function askSurface(inputs: DecisionInputs): void {
    cancelSoon(decisionHandle);
    decisionHandle = soon(() => {
      decisionHandle = 0;
      const key = inputsKey(inputs);
      builds.grid(inputs).then(() => {
        if (idlePan() && inputsKey(currentInputs(model())) === key) send({ kind: 'solve' });
      }, (error: unknown) => console.warn('decision surface failed', error));
    }, DECISION_SETTLE_MS);
  }

  /** The odds at every level for these inputs - after their surface, which
   *  is built first if need be - taken up when they land, if a cook or the
   *  idle page still wants them. */
  function askProfile(inputs: DecisionInputs): void {
    const calib = model().calib;
    const key = profileKey(inputs, calib);
    if (profiles.has(key)) return;
    profiles.add(key);
    // The key is cleared whether the profile lands or fails, so a failed one
    // is asked for again the next time the page wants it.
    builds.profile(inputs, calib).then(() => {
      profiles.delete(key);
      if (cookWants(inputs)) {
        send({ kind: 'landed' });
        return;
      }
      const m = model();
      if (idlePan() && wantedProfiles(m).some((i) => profileKey(i, m.calib) === key)) send({ kind: 'solve' });
    }, (error: unknown) => {
      profiles.delete(key);
      console.warn('odds profile failed', error);
    });
  }

  /** What a cook wants and has not got - its pot's surface, then the odds
   *  profile on it - and the cook stepped as each lands, if it still wants
   *  it. A new pot mid-cook (the boil tapped) is asked for at once: the egg
   *  is already in the water. */
  function cookSurface(inputs: DecisionInputs): void {
    if (builds.hasGrid(inputs)) {
      if (!builds.hasProfile(inputs, model().calib)) askProfile(inputs);
      return;
    }
    once(`surface|${inputsKey(inputs)}`, () => builds.grid(inputs), () => {
      if (cookWants(inputs)) send({ kind: 'landed' });
    }, 'decision surface failed');
  }

  /** `work`, under `key` until it lands or fails; `then` when it lands. */
  function once<T>(key: string, work: () => Promise<T>, then: (t: T) => void, failed: string): void {
    if (building.has(key)) return;
    building.add(key);
    work().then((t) => {
      building.delete(key);
      then(t);
    }, (error: unknown) => {
      building.delete(key);
      console.warn(failed, error);
    });
  }

  /** What each cook waits for, asked for. */
  function follow(): void {
    const m = model();
    for (const w of [{ cook: m.cook, need: m.need }, ...m.ending]) {
      if (w.cook === null) continue;
      const id = w.cook.id_ms;
      if (w.need.surface !== null) cookSurface(w.need.surface);
      if (w.need.before) {
        once(`before|${id}`, () => builds.before(id), (calibration) => {
          send({ kind: 'before', id_ms: id, calibration: calibration, surface: null });
        }, 'the calibration before an egg failed');
      }
      const inputs = w.need.beforeSurface;
      const held = m.before.find((b) => b.id_ms === id);
      if (inputs !== null && held !== undefined) {
        const calibration = held.before.calibration;
        once(`beforeSurface|${id}|${inputsKey(inputs)}`,
          () => Promise.all([builds.grid(inputs), builds.profile(inputs, calibration)]), ([grid, profile]) => {
            send({ kind: 'before', id_ms: id, calibration: calibration, surface: { inputs: inputs, grid: grid, profile: profile } });
          }, 'the corrected egg’s surface failed');
      }
    }
  }

  return { follow, askSurface, askProfile };
}
