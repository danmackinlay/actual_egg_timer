/**
 * What the page has in hand: the timers of a person's span (a control's
 * settle, a solve or a write coalesced, a held key's repeat, a decision's
 * settle), the jobs sent off the main thread, and the requests out. The app
 * sets those timers and makes those requests through here, so a script can
 * wait for the page to have done what it will (`whenIdle`, dev/test.ts)
 * rather than for a fixed time, whatever the machine's speed. A timer that
 * is not such a span - a request's timeout, a download's cleanup - is a
 * plain `setTimeout`.
 *
 * On the live site nothing reads it; it is two counters and a set.
 */

const timers = new Set<number>();
let jobs = 0;
let requests = 0;

/** `f` after `ms`, counted until it has run or been cancelled. */
export function soon(f: () => void, ms: number): number {
  const handle = window.setTimeout(() => {
    timers.delete(handle);
    f();
  }, ms);
  timers.add(handle);
  return handle;
}

/** A timer from `soon` cancelled; 0, for none, is nothing. */
export function cancelSoon(handle: number): void {
  if (handle === 0) return;
  timers.delete(handle);
  window.clearTimeout(handle);
}

/** A job off the main thread (offThread.ts), counted until it is answered. */
export function job<T>(p: Promise<T>): Promise<T> {
  jobs += 1;
  return p.finally(() => { jobs -= 1; });
}

/** `fetch`, counted until it is answered or fails. */
export function request(input: string, init?: RequestInit): Promise<Response> {
  requests += 1;
  return fetch(input, init).finally(() => { requests -= 1; });
}

/** What is in hand now. */
export function inHand(): { timers: number; jobs: number; requests: number } {
  return { timers: timers.size, jobs: jobs, requests: requests };
}
