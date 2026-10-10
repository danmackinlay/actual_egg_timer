/**
 * Sharing (E6; INFERENCE.md section 7, COLLECTIVE.md section 1): a cook who
 * turns it on sends every egg in the log to the collection endpoint
 * (`server/eggs.ts`), the ones from before it was on included, and can
 * delete everything this browser has sent.
 *
 * What is kept, in `aet.share.v1` beside the log rather than in it, and how
 * each step moves it - turned on and off, forgotten, deletion asked, an
 * answer from the server - is core's (`src/core/share.ts`), which iOS moves
 * alike. A page's sharing (`openSharing`) holds the current state and writes
 * it through, takes up what another tab wrote before acting, and does the
 * talking: each final egg in turn, in order. No answer, or a busy one
 * (`answered`), stops the run until the next (a load, a new egg, sharing
 * turned on, the browser back online).
 */

import { EggRecord, sharedRecord } from '../core/record.js';
import {
  ShareState, answered, deletionAsked, deletionConfirmed, deletionDone, forgotten, nextToSend,
  readShareState, reconciled, turnedOff, turnedOn,
} from '../core/share.js';
import { request } from './idle.js';
import { send } from './send.js';
import { STORES } from '../core/stores.js';
import { Taken, storageReadOnly, syncedKey } from './store.js';
import { devClockUsed, nowMs } from './now.js';

/** Now, epoch s, as core counts it. */
const nowS = (): number => nowMs() / 1000;

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
 *  is not JSON reads as nothing stored. Stored, `busySince` is epoch ms. */
export function readShare(raw: string | null): ShareState {
  let o: unknown = null;
  try {
    o = raw === null ? null : JSON.parse(raw) as unknown;
  } catch {
    o = null;
  }
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return readShareState(o);
  const { busySince: ms, ...rest } = o as Record<string, unknown>;
  return readShareState({ ...rest, busySince_s: typeof ms === 'number' ? ms / 1000 : null });
}

/** The state as storage holds it: `busySince` in whole epoch ms. */
export function storedShare(s: ShareState): string {
  const { busySince_s: since, ...rest } = s;
  return JSON.stringify({ ...rest, busySince: since === null ? null : Math.round(since * 1000) });
}

/* ---------------------------------------------------------------- state */

/** What sharing needs of the page, read when it needs it. */
export interface ShareHost {
  log(): readonly EggRecord[];
  /** How many of the log's eggs are final: all, unless the last is the egg
   *  on screen, whose answers may still come. */
  finalCount(): number;
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

/** A page's sharing (`openSharing`). */
export type Sharing = ReturnType<typeof openSharing>;

/**
 * A page's sharing: what is stored, read against the log as it now is, and
 * who to ask. One per page, opened at boot (app.ts), after the calibration,
 * and held by the runner (cook.ts). Every change is told to the page (the
 * `shared` message).
 */
export function openSharing(host: ShareHost, transport: Transport = fetchTransport, clock: () => number = nowS) {
  /** The state as stored: another tab's write is taken up before this one
   *  acts (`current`). A tab loaded yesterday must not send under an id
   *  another tab has since deleted, nor write back the deletions it never
   *  saw. */
  const store = syncedKey(STORES.share.web, readShare);
  let state: ShareState = reconciled(store.load(), host.log().length);
  /** Bumped by every change of id, so a send in flight for an old one lands
   *  on nothing. */
  let generation = 0;
  let pumping: Promise<void> | null = null;
  let again = false;

  function save(next: ShareState): void {
    state = next;
    store.write(storedShare(state));
    send({ kind: 'shared' });
  }

  /** Another tab's state, taken up: whether there was one. A change of id or
   *  of on and off is a new generation, so a send in flight under the old one
   *  lands on nothing. */
  function takeUp(taken: Taken<ShareState> | null): boolean {
    if (taken === null) return false;
    const next = reconciled(taken.theirs, host.log().length);
    if (next.uid !== state.uid || next.on !== state.on) generation += 1;
    state = next;
    return true;
  }

  /** The state, with whatever another tab wrote since this one last looked
   *  taken up first. */
  function current(): ShareState {
    takeUp(store.takeUp());
    return state;
  }

  /** Another tab changed storage (the page's `storage` event; a null key is a
   *  tab that cleared it all): taken up now, if it touched sharing. Says
   *  whether it did. */
  function storedElsewhere(key: string | null): boolean {
    return takeUp(store.elsewhere(key));
  }

  /** Sharing on or off. On sends the log so far; the promise is that run. */
  function setSharing(on: boolean): Promise<void> {
    if (storageReadOnly() || on === current().on) return Promise.resolve();
    generation += 1;
    save(on ? turnedOn(state, newUid()) : turnedOff(state));
    return on ? sendFinal() : Promise.resolve();
  }

  /** Forget everything: paired with the calibration's reset. */
  function forget(): void {
    generation += 1;
    save(forgotten(current(), newUid()));
  }

  /**
   * Send every final egg not yet sent, one at a time. A call while a run is
   * going asks it to go round again, so an egg made final meanwhile is not
   * left until the next load.
   */
  function sendFinal(): Promise<void> {
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
    // Never an egg cooked on the development clock, which runs only on this
    // machine (dev/clock.ts): nothing goes from a log that may hold one. Nor
    // anything while a newer build's results are left alone (store.ts).
    if (devClockUsed() || storageReadOnly()) return false;
    const s = current();
    const log = host.log();
    const at = nextToSend(s, host.finalCount(), log.length);
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
  async function deleteSent(): Promise<void> {
    if (storageReadOnly()) return;
    generation += 1;
    save(deletionAsked(current()));
    if (pumping !== null) await pumping;
    await retryDeletes();
  }

  /** Ask the server to delete every id it has not yet confirmed. At every
   *  load, and after the cook asks. */
  function retryDeletes(): Promise<void> {
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

  return {
    /** The state, with another tab's write taken up first. */
    state: (): Readonly<ShareState> => current(),
    storedElsewhere, setSharing, forget, sendFinal, deleteSent, retryDeletes,
  };
}
