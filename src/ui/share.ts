/**
 * Sharing (INFERENCE.md section 7): a cook who turns it on sends every egg
 * in the log to the collection endpoint (`server/eggs.ts`), the ones from
 * before it was on included, and can delete everything this browser has
 * sent. The endpoint is on the page's own site, which the CSP's
 * `connect-src 'self'` allows; it sends no CORS headers, so no other site's
 * page can post to it from a browser.
 *
 * What is kept, in `aet.share.v1` beside the log rather than in it, and how
 * each step moves it - turned on and off, forgotten, deletion asked, an
 * answer from the server - is `shareState.ts`'s; what the server takes and
 * what its answers mean, core's (`src/core/share.ts`). A page's sharing
 * (`openSharing`) holds the current state and writes it through, and does
 * the talking: each final egg in turn, in order. No answer, or a busy one
 * (`answered`), stops the run until the next (a load, a new egg, sharing
 * turned on, the browser back online).
 */

import { type EggRecord, sharedRecord } from '../core/record.ts';
import { deletionDone } from '../core/share.ts';
import {
  type ShareState, answered, deletionAsked, deletionConfirmed, forgotten, nextToSend, readShareState, reconciled, turnedOff,
  turnedOn,
} from './shareState.ts';
import { request } from './idle.ts';
import { send } from './send.ts';
import { STORES } from './stores.ts';
import { storedKey } from './store.ts';
import { nowMs } from './now.ts';

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

/** How long a send or a deletion waits for the server. A deletion waits
 *  for the send under way (`retryDeletes`), so a send that stalled would
 *  hold it up for as long as the browser left it hanging. A request given
 *  up is asked again at the next run, which the server takes once (a resent
 *  egg is a 200). */
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

/** What storage holds, read defensively (`readShareState`): text that
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

/** A page's sharing (`openSharing`). */
export type Sharing = ReturnType<typeof openSharing>;

/**
 * A page's sharing: what is stored, read against the log as it now is, and
 * who to ask. One per page, opened at boot (app.ts), after the calibration,
 * and held by the runner (cook.ts). Every change is told to the page (the
 * `shared` message).
 */
export function openSharing(host: ShareHost, transport: Transport = fetchTransport, clock: () => number = nowS) {
  const store = storedKey(STORES.share.key, readShare);
  let state: ShareState = reconciled(store.load(), host.log().length);
  /** Bumped by every change of id, so a send in flight for an old one lands
   *  on nothing. */
  let generation = 0;
  let pumping: Promise<void> | null = null;
  let again = false;
  /** Whether the page has stopped owning the app (`close`): nothing more is
   *  sent or asked. */
  let closed = false;

  function save(next: ShareState): void {
    state = next;
    store.write(storedShare(state));
    send({ kind: 'shared' });
  }

  /** Sharing on or off. On sends the log so far; the promise is that run. */
  function setSharing(on: boolean): Promise<void> {
    if (on === state.on) return Promise.resolve();
    generation += 1;
    save(on ? turnedOn(state, newUid()) : turnedOff(state));
    return on ? sendFinal() : Promise.resolve();
  }

  /** Forget everything: paired with the calibration's reset. */
  function forget(): void {
    generation += 1;
    save(forgotten(state, newUid()));
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
    while (await sendOne());
  }

  /** The next final egg, if there is one and sharing is on: whether to go on. */
  async function sendOne(): Promise<boolean> {
    if (closed) return false;
    const s = state;
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
    if (gen !== generation) return false;
    const { next, moved } = answered(state, status, clock());
    save(next);
    return moved;
  }

  /** "Delete what I've sent", confirmed: off, and every id asked for. */
  async function deleteSent(): Promise<void> {
    generation += 1;
    save(deletionAsked(state));
    await retryDeletes();
  }

  /** Ask the server to delete every id it has not yet confirmed, once any
   *  egg on its way has landed, so that it cannot arrive after the deletion
   *  and outlive it. At every load, and after the cook asks. */
  async function retryDeletes(): Promise<void> {
    if (pumping !== null) await pumping;
    for (const uid of [...state.deleting]) {
      if (closed) return;
      let status: number;
      try {
        status = await transport.remove(uid);
      } catch {
        return;
      }
      if (!closed && deletionDone(status)) save(deletionConfirmed(state, uid));
    }
  }

  /** The page no longer owns the app (owner.ts): nothing more is sent or
   *  asked, and an answer still to come lands on nothing. */
  function close(): void {
    closed = true;
    generation += 1;
  }

  return {
    state: (): Readonly<ShareState> => state,
    setSharing, forget, sendFinal, deleteSent, retryDeletes, close,
  };
}
