/**
 * The dose surfaces, built off the main thread.
 *
 * A surface is several hundred whole simulations, about a second, and a replay
 * of the log builds one per egg: on the page, twenty eggs would be forty
 * seconds of a page that does not scroll. So the arithmetic is here.
 *
 * Two kinds are built. A fold's surface (`request`) is described in full by the
 * page. A decision's surface (`decision`) is described by the pot, the egg
 * and where the posterior stands, and its extent takes two solves to find, so
 * those run here too rather than on the page (`decisionGridRequest`). And the
 * odds at every level on a decision's surface (`oddsProfile`, reach.ts), a
 * solve and a decision per level: most of a second, and never on the page.
 *
 * Zero dependencies and no bundler: this is compiled by the same `tsc` as
 * everything else, lands beside `offThread.js` in `dist/src/ui/`, and is
 * started by it as a module worker, so it imports the core exactly as the page does.
 * The request is plain data and so is the surface, so both cross by structured
 * clone, which copies doubles bit for bit: a surface built here is the surface
 * the page would have built.
 */

import { Job, runJob } from './runJob.js';

/** A job, and the number its answer is posted back under. */
interface Request extends Job {
  id: number;
}

/** The worker's global, typed as what it is. The project compiles against the
 *  DOM library, where `self` is a Window; declaring the worker library as well
 *  would conflict with it, and this is the only file that needs it. */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown): void;
};

scope.onmessage = (event: MessageEvent<Request>): void => {
  const { id, ...job } = event.data;
  try {
    const built = runJob(job);
    scope.postMessage(job.profile !== undefined ? { id: id, profile: built } : { id: id, grid: built });
  } catch (error) {
    scope.postMessage({ id: id, error: String(error) });
  }
};
