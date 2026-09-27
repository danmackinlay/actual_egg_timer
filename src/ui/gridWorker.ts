/**
 * The dose surfaces, built off the main thread.
 *
 * A surface is several hundred whole simulations, about a second, and until E1
 * the page sat frozen behind a `setTimeout(30)` while one was built after each
 * egg. That was one surface per answer, and tolerable. A replay of the log
 * builds one per egg - twenty eggs would have been forty seconds of a page that
 * does not scroll - so the arithmetic moved here.
 *
 * Two kinds are built. A fold's surface (`request`) is described in full by the
 * page. A decision's surface (`decision`, E5) is described by the pot, the egg
 * and where the posterior stands, and its extent takes two solves to find, so
 * those run here too rather than on the page (`decisionGridRequest`). And the
 * odds at every level on a decision's surface (`oddsProfile`, reach.ts), a
 * solve and a decision per level: most of a second, and never on the page;
 * and, the same way, the play-safe levels for the level on screen
 * (`saferLevels`).
 *
 * Zero dependencies and no bundler: this is compiled by the same `tsc` as
 * everything else, lands beside `calibration.js` in `dist/src/ui/`, and is
 * started as a module worker, so it imports the core exactly as the page does.
 * The request is plain data and so is the surface, so both cross by structured
 * clone, which copies doubles bit for bit: a surface built here is the surface
 * the page would have built.
 */

import { GridRequest, buildRequestedGrid } from '../core/record.js';
import { DecisionInputs, decisionGridRequest } from '../core/decide.js';
import { oddsProfile, saferLevels } from '../core/reach.js';
import type { ProfileJob, SaferJob } from './calibration.js';

interface Request {
  id: number;
  request?: GridRequest;
  decision?: DecisionInputs;
  /** The odds at every level (reach.ts): a solve and a decision per level, on
   *  a decision surface the page already has. */
  profile?: ProfileJob;
  /** The play-safe levels for one level (reach.ts): a dozen or so solves and
   *  decisions on the same surface. */
  safer?: SaferJob;
}

/** The worker's global, typed as what it is. The project compiles against the
 *  DOM library, where `self` is a Window; declaring the worker library as well
 *  would conflict with it, and this is the only file that needs it. */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown): void;
};

scope.onmessage = (event: MessageEvent<Request>): void => {
  const { id, request, decision, profile, safer } = event.data;
  try {
    if (safer !== undefined) {
      scope.postMessage({
        id: id,
        safer: saferLevels(safer.calibration, safer.egg, safer.setup, safer.grid, safer.profile, safer.level),
      });
      return;
    }
    if (profile !== undefined) {
      scope.postMessage({
        id: id, profile: oddsProfile(profile.calibration, profile.egg, profile.setup, profile.grid),
      });
      return;
    }
    const q = request ?? (decision !== undefined ? decisionGridRequest(decision) : undefined);
    if (q === undefined) throw new Error('nothing to build');
    scope.postMessage({ id: id, grid: buildRequestedGrid(q) });
  } catch (error) {
    scope.postMessage({ id: id, error: String(error) });
  }
};
