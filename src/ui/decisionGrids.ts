/**
 * The decision surfaces and the odds profiles the page asks for, built off
 * the main thread (`offThread.ts`) and kept, a handful at a time. Two asks
 * for the same thing share one build. iOS keeps the same caches
 * (`DecisionGrids.swift`).
 */

import { DoseGrid } from '../core/doseGrid.js';
import { DecisionInputs, inputsKey } from '../core/decide.js';
import { OddsProfile } from '../core/reach.js';
import { Calibration, copyCalibration } from '../core/record.js';
import { offThread } from './offThread.js';

/* ---------------------------------------------------- the decision's surface */

/** Decision surfaces by what they were built from. One per setup: the
 *  slider is not part of the key, so dragging it never waits for one. A handful
 *  is plenty - the pot on screen, the one before, and a cold start's measured
 *  ramp - and the oldest goes first. */
const decisionGrids = new Map<string, DoseGrid>();
const decisionBuilds = new Map<string, Promise<DoseGrid>>();
const DECISION_GRIDS_KEPT = 6;

/** A surface's key: core's (`inputsKey`), which iOS's caches and the plan use too. */
export function decisionKey(inputs: DecisionInputs): string {
  return inputsKey(inputs);
}

/** The surface for these inputs if it has been built, or null. */
export function cachedDecisionGrid(inputs: DecisionInputs): DoseGrid | null {
  return decisionGrids.get(decisionKey(inputs)) ?? null;
}

/** The surface for these inputs, built in the worker if it has not been. Two
 *  asks for the same inputs share one build. */
export function decisionGrid(inputs: DecisionInputs): Promise<DoseGrid> {
  // A pot that cannot even be keyed cannot be built: rejected, as a build that throws is.
  let key: string;
  try {
    key = decisionKey(inputs);
  } catch (error: unknown) {
    return Promise.reject(error);
  }
  const done = decisionGrids.get(key);
  if (done !== undefined) return Promise.resolve(done);
  const running = decisionBuilds.get(key);
  if (running !== undefined) return running;
  // A build that fails leaves no trace, so the next ask starts a fresh one.
  const build = (offThread({ decision: inputs }) as Promise<DoseGrid>).then((grid) => {
    decisionGrids.set(key, grid);
    while (decisionGrids.size > DECISION_GRIDS_KEPT) {
      const oldest = decisionGrids.keys().next().value;
      if (oldest === undefined) break;
      decisionGrids.delete(oldest);
    }
    return grid;
  }).finally(() => decisionBuilds.delete(key));
  decisionBuilds.set(key, build);
  return build;
}

/* ------------------------------------------------- the odds at every level */

/** Odds profiles, by pot AND posterior: unlike the surface, a profile reads
 *  every particle, so an egg folded - or a second answer refolded, which keeps
 *  the count - makes a new one. Kept like the surfaces, a handful at a time. */
const profiles = new Map<string, OddsProfile>();
const profileBuilds = new Map<string, Promise<OddsProfile>>();
const PROFILES_KEPT = 8;

/** A cheap summary of where the posterior stands: the count, the resampler's
 *  state and the weighted sums of every dimension. Any fold moves at least
 *  one of them. */
function posteriorPrint(c: Calibration): string {
  const post = c.posterior;
  let a = 0;
  let b = 0;
  let d = 0;
  let e = 0;
  for (let i = 0; i < post.particles.length; i++) {
    const p = post.particles[i];
    const w = post.weights[i];
    a += w * p.alpha_m2s;
    b += w * p.logDoseOffset;
    d += w * p.noise;
    e += w * (p.whiteOffset + p.whiteFirmGap);
  }
  return `${c.eggsLogged}|${post.rng}|${post.particles.length}|${a}|${b}|${d}|${e}`;
}

export function profileKey(inputs: DecisionInputs, c: Calibration): string {
  return `${decisionKey(inputs)}#${posteriorPrint(c)}`;
}

/** The profile for this pot and posterior if it has been computed, or null. */
export function cachedOddsProfile(inputs: DecisionInputs, c: Calibration): OddsProfile | null {
  return profiles.get(profileKey(inputs, c)) ?? null;
}

/**
 * The odds at every level for this pot and posterior, computed in the worker
 * on the pot's decision surface, which is built first if it has not been. A
 * profile is a couple of dozen solves and decisions, 0.3-1 s in the worker
 * (`npm run decide -- reach`). The posterior is copied as it stands now, so a
 * fold landing meanwhile cannot change what the profile is of.
 */
export function oddsProfileFor(inputs: DecisionInputs, c: Calibration): Promise<OddsProfile> {
  let key: string;
  try {
    key = profileKey(inputs, c);
  } catch (error: unknown) {
    return Promise.reject(error);
  }
  const done = profiles.get(key);
  if (done !== undefined) return Promise.resolve(done);
  const running = profileBuilds.get(key);
  if (running !== undefined) return running;
  const snapshot = copyCalibration(c);
  const build = decisionGrid(inputs)
    .then((grid) => offThread({
      profile: { calibration: snapshot, egg: inputs.egg, setup: inputs.setup, grid: grid },
    }) as Promise<OddsProfile>)
    .then((profile) => {
      profiles.set(key, profile);
      while (profiles.size > PROFILES_KEPT) {
        const oldest = profiles.keys().next().value;
        if (oldest === undefined) break;
        profiles.delete(oldest);
      }
      return profile;
    })
    .finally(() => profileBuilds.delete(key));
  profileBuilds.set(key, build);
  return build;
}
