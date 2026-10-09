/**
 * Work sent off the main thread: to the grid worker (`gridWorker.ts`) when
 * one can be had, and on this thread, behind a yield, when it cannot. The
 * page asks for three kinds of job (`runJob.ts`): a fold's surface, a
 * decision's surface and an odds profile.
 */

import { DoseGrid, GridRequest } from '../core/doseGrid.js';
import { OddsProfile } from '../core/reach.js';
import { job as inHand } from './idle.js';
import { Job, runJob } from './runJob.js';

interface Waiting {
  job: Job;
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
}

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const waiting = new Map<number, Waiting>();

/** Build on this thread, after yielding once so whatever the caller just put on
 *  screen paints before the build blocks it. The fallback, and the path the
 *  tests take, since Node has no Web Worker. */
function onThisThread(job: Job): Promise<unknown> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(runJob(job));
      } catch (error) {
        reject(error);
      }
    }, 30);
  });
}

/** Give up on the worker and finish whatever it was holding here instead. */
function abandonWorker(): void {
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
    worker = new Worker(new URL('./gridWorker.js', import.meta.url), { type: 'module' });
  } catch {
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
    if (result !== undefined) w.resolve(result);
    else onThisThread(w.job).then(w.resolve, w.reject);
  };
  // A browser without module workers, or a worker file that did not ship,
  // lands here. The fold still happens; it just blocks the page while it runs.
  worker.onerror = () => abandonWorker();
  return worker;
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
