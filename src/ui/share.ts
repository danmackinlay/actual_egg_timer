/**
 * Sharing (E6; INFERENCE.md section 7, COLLECTIVE.md section 1): a cook who
 * turns it on sends every egg in the log to the collection endpoint
 * (`server/eggs.ts`), the ones from before it was on included (DECISIONS.md
 * 54), and can delete everything this browser has sent.
 *
 * What is kept, in `aet.share.v1` beside the log rather than in it, and how
 * each step moves it - turned on and off, forgotten, deletion asked, an
 * answer from the server - is core's (`src/core/share.ts`), which iOS moves
 * alike. This module holds the current state and writes it through, takes up
 * what another tab wrote before acting, and does the talking: each final egg
 * in turn, in order. No answer, or a busy one (`answered`), stops the run
 * until the next (a load, a new egg, sharing turned on, the browser back
 * online).
 */

import { EggRecord, sharedRecord } from '../core/record.js';
import {
  ShareState, answered, deletionAsked, deletionConfirmed, deletionDone, FRESH_SHARE, forgotten, nextToSend,
  readShareState, reconciled, turnedOff, turnedOn,
} from '../core/share.js';
import { request } from './idle.js';
import { readStorage, storageReadOnly, writeStorage } from './store.js';
import { devClockUsed, nowMs } from './now.js';

const KEY = 'aet.share.v1';

/** How the page reaches the endpoint: a status for each call, or a throw
 *  when the network does not answer. */
export interface Transport {
  post(body: string): Promise<number>;
  remove(uid: string): Promise<number>;
}

const fetchTransport: Transport = {
  post: async (body) => (await fetchWithin('/api/eggs', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: body,
  })).status,
  remove: async (uid) => (await fetchWithin(`/api/eggs/${uid}`, { method: 'DELETE' })).status,
};

/** How long a send or a deletion waits for the server. Each holds the lock
 *  every tab's sends and deletions take turns under (`exclusive`), so one
 *  that stalled would hold up a deletion asked for in any tab for as long as
 *  the browser left it hanging. A request given up is asked again at the
 *  next run, which the server takes once (a resent egg is a 200). */
export const REQUEST_TIMEOUT_MS = 20000;

/** `fetch`, given up after `ms`: a throw then, as when the network does not
 *  answer. */
export async function fetchWithin(
  url: string, init: RequestInit, ms = REQUEST_TIMEOUT_MS,
  f: (url: string, init: RequestInit) => Promise<Response> = (u, i) => request(u, i),
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, ms);
  try {
    return await f(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ ids */

/** A random version 4 UUID, lower case, as the server takes it. From
 *  `getRandomValues`, which every browser has, secure context or not. */
export function newUid(fill: (bytes: Uint8Array) => void = (b) => { crypto.getRandomValues(b); }): string {
  const b = new Uint8Array(16);
  fill(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** What storage holds, read defensively (core's `readShareState`): text that
 *  is not JSON reads as nothing stored. */
export function readShare(raw: string | null): ShareState {
  let o: unknown = null;
  try {
    o = raw === null ? null : JSON.parse(raw) as unknown;
  } catch {
    o = null;
  }
  return readShareState(o);
}

/* ---------------------------------------------------------------- state */

/** What sharing needs of the page, read when it needs it. */
export interface ShareHost {
  log(): readonly EggRecord[];
  /** How many of the log's eggs are final: all, unless the last is the egg
   *  on screen, whose answers may still come. */
  finalCount(): number;
  /** Redraw what is said about sharing. */
  changed(): void;
}

let state: ShareState = { ...FRESH_SHARE };
let host: ShareHost | null = null;
let transport: Transport = fetchTransport;
let clock: () => number = nowMs;
/** Bumped by every change of id, so a send in flight for an old one lands
 *  on nothing. */
let generation = 0;
let pumping: Promise<void> | null = null;
let again = false;
/** The text this page last read from `KEY` or wrote there; anything else
 *  there is another tab's, and is taken up before this one acts (`current`).
 *  A tab loaded yesterday must not send under an id another tab has since
 *  deleted, nor write back the deletions it never saw. */
let seen: string | null = null;

function save(next: ShareState): void {
  state = next;
  writeStorage(KEY, JSON.stringify(state));
  // Read back: a write that failed leaves the store as it was, which is then
  // not another tab's.
  seen = readStorage(KEY);
  if (host !== null) host.changed();
}

/** The state, with whatever another tab wrote since this one last looked
 *  taken up first. A change of id or of on and off is a new generation, so
 *  a send in flight under the old one lands on nothing. */
function current(): ShareState {
  const raw = readStorage(KEY);
  if (raw === seen) return state;
  seen = raw;
  const next = reconciled(readShare(raw), host === null ? 0 : host.log().length);
  if (next.uid !== state.uid || next.on !== state.on) generation += 1;
  state = next;
  return state;
}

/** Another tab changed storage (the page's `storage` event; a null key is a
 *  tab that cleared it all): taken up now, if it touched sharing. Says
 *  whether it did. */
export function shareStoredElsewhere(key: string | null): boolean {
  if (key !== null && key !== KEY) return false;
  const was = seen;
  current();
  if (seen === was) return false;
  if (host !== null) host.changed();
  return true;
}

/**
 * One tab at a time, across every tab of the site, where the browser can say
 * so (`navigator.locks`): a send, and the asking for a deletion, each read
 * the state, talk to the server and write the state back, and another tab's
 * deletion must not land in the middle of a send and be outlived by it.
 */
function exclusive<T>(f: () => Promise<T>): Promise<T> {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  return locks === undefined ? f() : locks.request('aet.share', f) as Promise<T>;
}

export function shareState(): Readonly<ShareState> {
  return current();
}

/** Read what is stored, against the log as it now is, and remember who to
 *  ask. Once, at boot, after the calibration is loaded. */
export function loadShare(h: ShareHost, t: Transport = fetchTransport, now: () => number = nowMs): ShareState {
  host = h;
  transport = t;
  clock = now;
  seen = readStorage(KEY);
  state = reconciled(readShare(seen), h.log().length);
  return state;
}

/** Sharing on or off. On sends the log so far; the promise is that run. */
export function setSharing(on: boolean): Promise<void> {
  if (storageReadOnly() || on === current().on) return Promise.resolve();
  generation += 1;
  save(on ? turnedOn(state, newUid()) : turnedOff(state));
  return on ? sendFinal() : Promise.resolve();
}

/** Forget everything: paired with the calibration's reset. */
export function forgetShare(): void {
  generation += 1;
  save(forgotten(current(), newUid()));
}

/**
 * Send every final egg not yet sent, one at a time. A call while a run is
 * going asks it to go round again, so an egg made final meanwhile is not
 * left until the next load.
 */
export function sendFinal(): Promise<void> {
  if (pumping !== null) {
    again = true;
    return pumping;
  }
  pumping = (async () => {
    do {
      again = false;
      await sendRun();
    } while (again);
  })().finally(() => { pumping = null; });
  return pumping;
}

async function sendRun(): Promise<void> {
  while (await exclusive(sendOne));
}

/** The next final egg, if there is one and sharing is on: whether to go on. */
async function sendOne(): Promise<boolean> {
  const h = host;
  // Never an egg cooked on the development clock, which runs only on this
  // machine (dev/clock.ts): nothing goes from a log that may hold one. Nor
  // anything while a newer build's results are left alone (store.ts).
  if (h === null || devClockUsed() || storageReadOnly()) return false;
  const s = current();
  const log = h.log();
  const at = nextToSend(s, h.finalCount(), log.length);
  if (at === null) return false;
  const gen = generation;
  const body = JSON.stringify({ seq: s.seq, record: sharedRecord(log[at], s.uid) });
  let status: number;
  try {
    status = await transport.post(body);
  } catch {
    return false;
  }
  const now = current();
  if (gen !== generation) return false;
  // Another tab may have sent the same egg meanwhile and moved on: then
  // there is nothing to move, and the next is looked at afresh.
  if (now.sent !== s.sent || now.seq !== s.seq) return true;
  const { next, moved } = answered(now, status, clock());
  save(next);
  return moved;
}

/** "Delete what I've sent", confirmed: off, and every id asked for - after
 *  any egg already on its way has landed, so that it cannot arrive after the
 *  deletion and outlive it. */
export async function deleteSent(): Promise<void> {
  if (storageReadOnly()) return;
  generation += 1;
  save(deletionAsked(current()));
  if (pumping !== null) await pumping;
  await retryDeletes();
}

/** Ask the server to delete every id it has not yet confirmed. At every
 *  load, and after the cook asks. */
export function retryDeletes(): Promise<void> {
  if (storageReadOnly()) return Promise.resolve();
  return exclusive(async () => {
    for (const uid of [...current().deleting]) {
      let status: number;
      try {
        status = await transport.remove(uid);
      } catch {
        return;
      }
      if (deletionDone(status)) save(deletionConfirmed(current(), uid));
    }
  });
}
