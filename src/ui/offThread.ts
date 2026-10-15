/**
 * Work sent off the main thread: to the grid worker (`gridWorker.ts`) when
 * one can be had, and on this thread, behind a yield, when it cannot. The
 * page asks for three kinds of job (`runJob.ts`): a fold's surface, a
 * decision's surface and an odds profile.
 */

import type { DoseGrid, GridRequest } from '../core/doseGrid.ts';
import type { OddsProfile } from '../core/reach.ts';
import { job as inHand } from './idle.ts';
import { type Job, runJob } from './runJob.ts';

interface Waiting {
  job: Job;
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
}

/** The grid worker's bundle, by its hashed name, beside the page's
 *  (tools/buildSite.mjs, through esbuild's `define`). */
declare const GRID_WORKER_FILE: string;

let worker: Worker | null = null;
let workerFailed = false;
/** Jobs answered by the worker, and on this thread. */
const answered = { offThread: 0, onThread: 0 };
let nextId = 1;
const waiting = new Map<number, Waiting>();
/** Moved on when the page stands down (`stopWorker`): a job asked for
 *  before it is never built. */
let epoch = 0;

/** Build on this thread, after yielding once so whatever the caller just put on
 *  screen paints before the build blocks it. The fallback, and the path the
 *  tests take, since Node has no Web Worker. */
function onThisThread(job: Job): Promise<unknown> {
  const asked = epoch;
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (asked !== epoch) {
        reject(new Error(STOOD_DOWN));
        return;
      }
      try {
        answered.onThread += 1;
        resolve(runJob(job));
      } catch (error) {
        reject(error);
      }
    }, 30);
  });
}

/** Give up on the worker and finish whatever it was holding here instead,
 *  saying so: the page still works, but blocks while it builds, and only
 *  this line tells that apart from a worker that ran (tools/harness.ts
 *  fails a scenario on it). */
function abandonWorker(): void {
  console.warn(WORKER_FAILED);
  workerFailed = true;
  if (worker !== null) worker.terminate();
  worker = null;
  const held = Array.from(waiting.values());
  waiting.clear();
  for (const w of held) onThisThread(w.job).then(w.resolve, w.reject);
}

function gridWorker(): Worker | null {
  if (worker !== null) return worker;
  if (workerFailed || typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL(GRID_WORKER_FILE, import.meta.url), { type: 'module' });
  } catch {
    console.warn(WORKER_FAILED);
    workerFailed = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<{
    id: number; grid?: DoseGrid; profile?: OddsProfile;
  }>) => {
    const w = waiting.get(event.data.id);
    if (w === undefined) return;
    waiting.delete(event.data.id);
    const result = event.data.grid ?? event.data.profile;
    if (result !== undefined) {
      answered.offThread += 1;
      w.resolve(result);
    } else {
      onThisThread(w.job).then(w.resolve, w.reject);
    }
  };
  // A browser without module workers, or a worker file that did not ship,
  // lands here. The fold still happens; it just blocks the page while it runs.
  worker.onerror = () => abandonWorker();
  return worker;
}

const STOOD_DOWN = 'this page no longer owns the app';

const WORKER_FAILED = 'the grid worker did not start: building on the page';

/** How many jobs the worker has answered, and how many were built on this
 *  thread, since the page loaded: for the test API (dev/test.ts). */
export function jobsAnswered(): { offThread: number; onThread: number } {
  return { ...answered };
}

/** The page no longer owns the app (owner.ts): the worker ended, and every
 *  job it holds refused, so nothing more is built and whatever waits on a
 *  job lets go of it. A page that takes the app back starts a new one. */
export function stopWorker(): void {
  epoch += 1;
  if (worker !== null) worker.terminate();
  worker = null;
  const held = Array.from(waiting.values());
  waiting.clear();
  for (const w of held) w.reject(new Error(STOOD_DOWN));
}

/** A job's answer, from the worker if there is one. */
export function offThread(job: Job): Promise<unknown> {
  const w = gridWorker();
  if (w === null) return inHand(onThisThread(job));
  return inHand(new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { job: job, resolve: resolve, reject: reject });
    w.postMessage({ id: id, ...job });
  }));
}

/** A fold's surface (calibration.ts). */
export function buildOffThread(request: GridRequest): Promise<DoseGrid> {
  return offThread({ request: request }) as Promise<DoseGrid>;
}
