/**
 * Sharing's state (E6; INFERENCE.md section 7, COLLECTIVE.md section 1): what
 * a device that shares keeps beside its log, how each thing the cook does or
 * the server answers moves it, and how a stored copy is read. Both apps keep
 * it, and must move it alike: the web in `src/ui/share.ts`, iOS in
 * `ios/App/Sharing.swift`, which hold it, write it through and do the talking.
 * The server takes an id by `isUid`, as the apps read one.
 *
 * WHAT IS KEPT:
 *
 * - `on`: off until the cook turns it on.
 * - `uid`: the cook's id, a random version 4 UUID made by the app and derived
 *   from nothing. Made the first time sharing is turned on, kept while it is
 *   turned off and on again, and replaced when the cook forgets everything,
 *   whose new log is a new cook (INFERENCE.md section 7). Every copy sent
 *   carries it; the log itself keeps none.
 * - `sent`: how many of the log's eggs have gone, in order; `seq`, the next
 *   number the server files one under. They part when a damaged log is
 *   dropped (`reconciled`): the log starts again, the numbers carry on.
 * - `uids`: every id this device has used, so that "Delete what I've sent"
 *   reaches what was sent before a forget, under an id the app no longer
 *   holds. `deleting`: ids whose deletion the server has not yet confirmed,
 *   asked again at every load until it does.
 * - `busy`: how many busy answers the egg at `sent` has had, and
 *   `busySince`, when the first came (epoch ms; null when none has).
 *
 * WHEN AN EGG GOES: once it is final - when the cook has moved on from it, so
 * no answer can be added - one at a time, in order (`nextToSend`). What the
 * server's answer means is `shareReply` in policy.ts, and how long a busy
 * one is waited on `shareGivesUp` there, since an iPhone's attestation is
 * answered by the same rules; what the answer does to this state is
 * `answered` here.
 *
 * No I/O, no clock, no randomness: a new id and the time are the caller's,
 * passed in.
 */

import { shareGivesUp, shareReply } from './policy.js';

export interface ShareState {
  on: boolean;
  uid: string | null;
  sent: number;
  seq: number;
  uids: string[];
  deleting: string[];
  busy: number;
  busySince: number | null;
}

export const FRESH_SHARE: ShareState = {
  on: false, uid: null, sent: 0, seq: 0, uids: [], deleting: [], busy: 0, busySince: null,
};

/** A cook's id as both apps make it and the server takes it: a version 4
 *  UUID, in lower case. */
const UID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUid(v: unknown): v is string {
  return typeof v === 'string' && UID.test(v);
}

/* ---------------------------------------------------------------- reads */

function count(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;
}

function ids(v: unknown): string[] {
  const out: string[] = [];
  if (!Array.isArray(v)) return out;
  for (const x of v) if (isUid(x)) out.push(x);
  return out;
}

/** A stored state, parsed from its JSON and read defensively: anything
 *  damaged reads as off, and every id that can be read is kept, so a deletion
 *  can still reach it. Without an id there is nothing sent to count. */
export function readShareState(raw: unknown): ShareState {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...FRESH_SHARE, uids: [], deleting: [] };
  }
  const r = raw as Record<string, unknown>;
  const uid = isUid(r['uid']) ? r['uid'] : null;
  const uids = ids(r['uids']);
  if (uid !== null && !uids.includes(uid)) uids.push(uid);
  const since = r['busySince'];
  return {
    on: r['on'] === true && uid !== null,
    uid: uid,
    sent: uid === null ? 0 : count(r['sent']),
    seq: uid === null ? 0 : count(r['seq']),
    uids: uids,
    deleting: ids(r['deleting']),
    busy: uid === null ? 0 : count(r['busy']),
    busySince: uid !== null && typeof since === 'number' && Number.isFinite(since) ? since : null,
  };
}

/* ---------------------------------------------------------- transitions */

/** Sharing turned on: `fresh`, a newly made id, becomes the cook's if there
 *  is none; otherwise it is not used. */
export function turnedOn(s: ShareState, fresh: string): ShareState {
  if (s.uid !== null) return { ...s, on: true };
  return { ...s, on: true, uid: fresh, sent: 0, seq: 0, uids: [...s.uids, fresh], busy: 0, busySince: null };
}

/** Sharing turned off: nothing is deleted; that is the other button. */
export function turnedOff(s: ShareState): ShareState {
  return { ...s, on: false };
}

/** The cook forgot everything: the log is empty, and the next egg is a new
 *  cook's, under `fresh`, a newly made id, if sharing is on, and under one
 *  made when it is turned on if not. The old id stays in `uids` for
 *  deletion. */
export function forgotten(s: ShareState, fresh: string): ShareState {
  if (!s.on) return { ...s, uid: null, sent: 0, seq: 0, busy: 0, busySince: null };
  return { ...s, uid: fresh, sent: 0, seq: 0, uids: [...s.uids, fresh], busy: 0, busySince: null };
}

/** "Delete what I've sent": sharing goes off, every id this device has used
 *  is to be deleted, and none is kept. */
export function deletionAsked(s: ShareState): ShareState {
  const deleting = [...s.deleting];
  for (const uid of s.uids) if (!deleting.includes(uid)) deleting.push(uid);
  return { ...FRESH_SHARE, uids: [], deleting: deleting };
}

/** A log shorter than what was sent has been dropped and begun again (a
 *  damaged log, `decodeKept`): what it holds now is new. */
export function reconciled(s: ShareState, logLength: number): ShareState {
  return s.sent > logLength ? { ...s, sent: 0, busy: 0, busySince: null } : s;
}

/** The index in the log of the next egg to send, or null when there is none
 *  to send: sharing off, no id, or every final egg gone. `finalCount` is how
 *  many of the log's eggs are final: all, unless the last is the egg on
 *  screen, whose answers may still come. */
export function nextToSend(s: ShareState, finalCount: number, logLength: number): number | null {
  const final = Math.min(finalCount, logLength);
  if (!s.on || s.uid === null || s.sent >= final) return null;
  return s.sent;
}

export interface ShareAnswered {
  next: ShareState;
  /** Whether the cursor moved on, so the run goes on to the next egg. */
  moved: boolean;
}

/** The egg at the cursor answered `status`: whether the cursor moves on, and
 *  the state with it. Kept or refused, it does; busy, it waits - counted,
 *  unless it has waited long enough, when it is passed over as if refused,
 *  so that one egg cannot hold up the rest for good. No answer at all is not
 *  an answer: the caller leaves the state as it is. `now` is epoch ms. */
export function answered(s: ShareState, status: number, now: number): ShareAnswered {
  if (shareReply(status) === 'busy') {
    const since = s.busySince ?? now;
    const busy = s.busy + 1;
    if (!shareGivesUp(busy, (now - since) / 1000)) {
      return { next: { ...s, busy: busy, busySince: since }, moved: false };
    }
  }
  return { next: { ...s, sent: s.sent + 1, seq: s.seq + 1, busy: 0, busySince: null }, moved: true };
}

/** Whether a deletion the server answered `status` is done: 200, or 400, an
 *  id the server will never hold. Anything else is asked again. */
export function deletionDone(status: number): boolean {
  return status === 200 || status === 400;
}

/** The server confirmed `uid` deleted: it is no longer asked for. */
export function deletionConfirmed(s: ShareState, uid: string): ShareState {
  return { ...s, deleting: s.deleting.filter((x) => x !== uid) };
}
