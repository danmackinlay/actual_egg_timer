/**
 * One job for the grid worker, run wherever it is run: in the worker
 * (`gridWorker.ts`) or, when there is none, on the page (`offThread.ts`).
 * One function, so the two cannot build different things - and a job that
 * throws throws in both, for the caller to reject on.
 */

import type { Egg } from '../core/geometry.ts';
import type { CookSetup } from '../core/protocol.ts';
import type { DoseGrid } from '../core/doseGrid.ts';
import { type GridRequest, buildRequestedGrid } from '../core/doseGrid.ts';
import type { Calibration } from '../core/record.ts';
import { type DecisionInputs, decisionGridRequest } from '../core/decide.ts';
import { type OddsProfile, oddsProfile } from '../core/reach.ts';

/** What a profile is computed from. Plain data: it crosses to the worker by
 *  structured clone, which copies doubles bit for bit. */
export interface ProfileJob {
  calibration: Calibration;
  egg: Egg;
  setup: CookSetup;
  grid: DoseGrid;
}

/** One thing to build: a fold's surface, described in full; a decision's,
 *  described by the pot and the posterior (`decisionGridRequest`); or the
 *  odds at every level on a decision's surface (`oddsProfile`). */
export interface Job {
  request?: GridRequest;
  decision?: DecisionInputs;
  profile?: ProfileJob;
}

export function runJob(job: Job): DoseGrid | OddsProfile {
  if (job.profile !== undefined) {
    const p = job.profile;
    return oddsProfile(p.calibration, p.egg, p.setup, p.grid);
  }
  if (job.request !== undefined) return buildRequestedGrid(job.request);
  if (job.decision !== undefined) return buildRequestedGrid(decisionGridRequest(job.decision));
  throw new Error('nothing to build');
}
