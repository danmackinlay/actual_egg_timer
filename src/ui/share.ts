/**
 * Sharing (E6; INFERENCE.md section 7, COLLECTIVE.md section 1): a cook who
 * turns it on sends every egg in the log to the collection endpoint
 * (`server/eggs.ts`), the ones from before it was on included (DECISIONS.md
 * 54), and can delete everything this browser has sent.
 *
 * WHAT IS KEPT, in `aet.share.v1`, beside the log rather than in it:
 *
 * - `on`: off until the cook turns it on.
 * - `uid`: the cook's id, a random version 4 UUID made here and derived from
 *   nothing. Made the first time sharing is turned on, kept while it is
 *   turned off and on again, and replaced when the cook forgets everything,
 *   whose new log is a new cook (INFERENCE.md section 7). Every copy sent
 *   carries it; the log itself keeps none.
 * - `sent`: how many of the log's eggs have gone, in order; `seq`, the next
 *   number the server files one under. They part when a damaged log is
 *   dropped (`reconciled`): the log starts again, the numbers carry on.
 * - `uids`: every id this browser has used, so that "Delete what I've sent"
 *   reaches what was sent before a forget, under an id the page no longer
 *   holds. `deleting`: ids whose deletion the server has not yet confirmed,
 *   asked again at every load until it does.
 *
 * WHEN AN EGG GOES: once it is final - when the cook has moved on from it,
 * so no answer can be added - one at a time, in order. A refused egg (400,
 * 413) is passed over, since it will never be taken; anything else stops the
 * run until the next one (a load, a new egg, sharing turned on, the browser
 * back online).
 *
 * The states are pure functions of the last (`turnedOn` and the rest), for
 * the tests; the module keeps the current one and writes it through.
 */

import { EggRecord, sharedRecord } from '../core/record.js';
import { readStorage, writeStorage } from './store.js';

const KEY = 'aet.share.v1';

export interface ShareState {
  on: boolean;
  uid: string | null;
  sent: number;
  seq: number;
  uids: string[];
  deleting: string[];
}

export const FRESH_SHARE: ShareState = { on: false, uid: null, sent: 0, seq: 0, uids: [], deleting: [] };

/** How the page reaches the endpoint: a status for each call, or a throw
 *  when the network does not answer. */
export interface Transport {
  post(body: string): Promise<number>;
  remove(uid: string): Promise<number>;
}

export const fetchTransport: Transport = {
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
  f: (url: string, init: RequestInit) => Promise<Response> = (u, i) => fetch(u, i),
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

const UID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

/* --------------------------------------------------------------- states */

function count(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;
}

function ids(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && UID.test(x)) : [];
}

/** What storage holds, read defensively: anything damaged reads as off, and
 *  every id that can be read is kept, so a deletion can still reach it. */
export function readShare(raw: string | null): ShareState {
  let o: unknown = null;
  try {
    o = raw === null ? null : JSON.parse(raw) as unknown;
  } catch {
    o = null;
  }
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return { ...FRESH_SHARE };
  const r = o as Record<string, unknown>;
  const uid = typeof r['uid'] === 'string' && UID.test(r['uid']) ? r['uid'] : null;
  const uids = ids(r['uids']);
  if (uid !== null && !uids.includes(uid)) uids.push(uid);
  return {
    on: r['on'] === true && uid !== null,
    uid: uid,
    sent: uid === null ? 0 : count(r['sent']),
    seq: uid === null ? 0 : count(r['seq']),
    uids: uids,
    deleting: ids(r['deleting']),
  };
}

/** Sharing turned on: the id made now if there is none. */
export function turnedOn(s: ShareState, mint: () => string = newUid): ShareState {
  if (s.uid !== null) return { ...s, on: true };
  const uid = mint();
  return { ...s, on: true, uid: uid, sent: 0, seq: 0, uids: [...s.uids, uid] };
}

/** Sharing turned off: nothing is deleted; that is the other button. */
export function turnedOff(s: ShareState): ShareState {
  return { ...s, on: false };
}

/** The cook forgot everything: the log is empty, and the next egg is a new
 *  cook's, under a new id. The old id stays in `uids` for deletion. */
export function forgotten(s: ShareState, mint: () => string = newUid): ShareState {
  if (!s.on) return { ...s, uid: null, sent: 0, seq: 0 };
  const uid = mint();
  return { ...s, uid: uid, sent: 0, seq: 0, uids: [...s.uids, uid] };
}

/** "Delete what I've sent": sharing goes off, every id this browser has used
 *  is to be deleted, and none is kept. */
export function deletionAsked(s: ShareState): ShareState {
  const deleting = [...s.deleting];
  for (const uid of s.uids) if (!deleting.includes(uid)) deleting.push(uid);
  return { on: false, uid: null, sent: 0, seq: 0, uids: [], deleting: deleting };
}

/** A log shorter than what was sent has been dropped and begun again (a
 *  damaged log, `decodeKept`): what it holds now is new. */
export function reconciled(s: ShareState, logLength: number): ShareState {
  return s.sent > logLength ? { ...s, sent: 0 } : s;
}

/** Whether the endpoint's answer moves the cursor on: kept (201), already
 *  kept (200), or refused for good (400, 413). */
export function advances(status: number): boolean {
  return status === 200 || status === 201 || status === 400 || status === 413;
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
export function loadShare(h: ShareHost, t: Transport = fetchTransport): ShareState {
  host = h;
  transport = t;
  seen = readStorage(KEY);
  state = reconciled(readShare(seen), h.log().length);
  return state;
}

/** Sharing on or off. On sends the log so far; the promise is that run. */
export function setSharing(on: boolean): Promise<void> {
  if (on === current().on) return Promise.resolve();
  generation += 1;
  save(on ? turnedOn(state) : turnedOff(state));
  return on ? sendFinal() : Promise.resolve();
}

/** Forget everything: paired with the calibration's reset. */
export function forgetShare(): void {
  generation += 1;
  save(forgotten(current()));
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
  if (h === null) return false;
  const s = current();
  const log = h.log();
  const final = Math.min(h.finalCount(), log.length);
  if (!s.on || s.uid === null || s.sent >= final) return false;
  const gen = generation;
  const body = JSON.stringify({ seq: s.seq, record: sharedRecord(log[s.sent], s.uid) });
  let status: number;
  try {
    status = await transport.post(body);
  } catch {
    return false;
  }
  const now = current();
  if (gen !== generation || !advances(status)) return false;
  // Another tab may have sent the same egg meanwhile and moved on: then
  // there is nothing to move, and the next is looked at afresh.
  if (now.sent === s.sent && now.seq === s.seq) save({ ...now, sent: now.sent + 1, seq: now.seq + 1 });
  return true;
}

/** "Delete what I've sent", confirmed: off, and every id asked for - after
 *  any egg already on its way has landed, so that it cannot arrive after the
 *  deletion and outlive it. */
export async function deleteSent(): Promise<void> {
  generation += 1;
  save(deletionAsked(current()));
  if (pumping !== null) await pumping;
  await retryDeletes();
}

/** Ask the server to delete every id it has not yet confirmed. At every
 *  load, and after the cook asks. */
export function retryDeletes(): Promise<void> {
  return exclusive(async () => {
    for (const uid of [...current().deleting]) {
      let status: number;
      try {
        status = await transport.remove(uid);
      } catch {
        return;
      }
      // 400 is an id the server will never hold: as done as a 200.
      if (status === 200 || status === 400) {
        const now = current();
        save({ ...now, deleting: now.deleting.filter((x) => x !== uid) });
      }
    }
  });
}
