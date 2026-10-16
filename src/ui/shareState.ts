/**
 * The share queue's state (INFERENCE.md section 7): what this browser keeps
 * beside its log while it shares, how each thing the cook does or the
 * server answers moves it, and how a stored copy is read. share.ts holds
 * it, writes it through and does the talking; what the server takes and
 * what its answers mean is core's (`src/core/share.ts`).
 *
 * WHAT IS KEPT:
 *
 * - `on`: off until the cook turns it on.
 * - `uid`: the cook's id, a random version 4 UUID made by the app and derived
 *   from nothing. Made the first time sharing is turned on, kept while it is
 *   turned off and on again, and replaced when the cook forgets everything,
 *   whose new log is a new cook (INFERENCE.md section 7). Every copy sent
 *   carries it; the log itself keeps none.
 * - `sent`: how many of the log's eggs have gone, in order; `seq`, the
 *   number the server files the next one under (core's `nextSeq`). They
 *   part when a damaged log is dropped (`reconciled`): the log starts again,
 *   the numbers carry on.
 * - `uids`: every id this browser has used, so that "Delete what I've sent"
 *   reaches what was sent before a forget, under an id the app no longer
 *   holds. `deleting`: ids whose deletion the server has not yet confirmed,
 *   asked again at every load until it does.
 * - `busy`: how many busy answers the egg at `sent` has had, and
 *   `busySince_s`, when the first came (epoch s; null when none has).
 *   Stored as epoch ms (share.ts, `storedShare`).
 *
 * WHEN AN EGG GOES: once it is final - when the cook has moved on from it, so
 * no answer can be added - one at a time, in order (`nextToSend`). What the
 * server's answer does to this state is `answered`; how long a busy one is
 * waited on, `shareGivesUp`.
 *
 * No I/O, no clock, no randomness: a new id and the time are the caller's,
 * passed in.
 */

import { FIRST_SEQ, isUid, nextSeq, shareReply } from '../core/share.ts';

export interface ShareState {
  on: boolean;
  uid: string | null;
  sent: number;
  seq: number;
  uids: string[];
  deleting: string[];
  busy: number;
  busySince_s: number | null;
}

export const FRESH_SHARE: ShareState = {
  on: false, uid: null, sent: 0, seq: FIRST_SEQ, uids: [], deleting: [], busy: 0, busySince_s: null,
};

/**
 * How long a step waits on busy answers before it gives up: a result is then
 * passed over, as if refused. So nothing waits for good.
 *
 * Both bounds must be met. Three days outlasts the outages that pass - a
 * deploy gone wrong, a provider's bad day - including one that waits a
 * weekend for the owner to fix it. Five busy answers, each from its own run,
 * keep a page opened once in a while from giving up on the first busy answer
 * after days away. Only busy answers count (no answer does not), and the
 * count starts again for each result.
 */
export const SHARE_WAIT_TRIES = 5;
export const SHARE_WAIT_S = 3 * 24 * 60 * 60;

/** Whether a step that has had `tries` busy answers, the first `waited_s`
 *  ago, stops waiting. A negative wait is a clock set back since: the start
 *  cannot be trusted, and the tries alone decide. */
export function shareGivesUp(tries: number, waited_s: number): boolean {
  return tries >= SHARE_WAIT_TRIES && (waited_s >= SHARE_WAIT_S || waited_s < 0);
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

/** A stored state, parsed from its JSON, in this shape (`busySince_s` in
 *  epoch s), and read defensively: anything damaged reads as off, and every
 *  id that can be read is kept, so a deletion can still reach it. Without an
 *  id there is nothing sent to count. */
export function readShareState(raw: unknown): ShareState {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...FRESH_SHARE, uids: [], deleting: [] };
  }
  const r = raw as Record<string, unknown>;
  const uid = isUid(r['uid']) ? r['uid'] : null;
  const uids = ids(r['uids']);
  if (uid !== null && !uids.includes(uid)) uids.push(uid);
  const since = r['busySince_s'];
  return {
    on: r['on'] === true && uid !== null,
    uid: uid,
    sent: uid === null ? 0 : count(r['sent']),
    seq: uid === null ? FIRST_SEQ : count(r['seq']),
    uids: uids,
    deleting: ids(r['deleting']),
    busy: uid === null ? 0 : count(r['busy']),
    busySince_s: uid !== null && typeof since === 'number' && Number.isFinite(since) ? since : null,
  };
}

/* ---------------------------------------------------------- transitions */

/** Sharing turned on: `fresh`, a newly made id, becomes the cook's if there
 *  is none; otherwise it is not used. */
export function turnedOn(s: ShareState, fresh: string): ShareState {
  if (s.uid !== null) return { ...s, on: true };
  return { ...s, on: true, uid: fresh, sent: 0, seq: FIRST_SEQ, uids: [...s.uids, fresh], busy: 0, busySince_s: null };
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
  if (!s.on) return { ...s, uid: null, sent: 0, seq: FIRST_SEQ, busy: 0, busySince_s: null };
  return { ...s, uid: fresh, sent: 0, seq: FIRST_SEQ, uids: [...s.uids, fresh], busy: 0, busySince_s: null };
}

/** "Delete what I've sent": sharing goes off, every id this browser has used
 *  is to be deleted, and none is kept. */
export function deletionAsked(s: ShareState): ShareState {
  const deleting = [...s.deleting];
  for (const uid of s.uids) if (!deleting.includes(uid)) deleting.push(uid);
  return { ...FRESH_SHARE, uids: [], deleting: deleting };
}

/** A log shorter than what was sent, or one that no longer holds the egg
 *  waiting on a busy answer, has been dropped and begun again (a damaged log,
 *  `decodeKept`): what it holds now is new. The waiting egg was sent at
 *  `seq`, and the server may have kept it there, so the new log's first egg
 *  goes at the number after; the server takes a gap. */
export function reconciled(s: ShareState, logLength: number): ShareState {
  const dropped = s.sent > logLength || (s.busy > 0 && s.sent >= logLength);
  if (!dropped) return s;
  return { ...s, sent: 0, seq: s.busy > 0 ? nextSeq(s.seq) : s.seq, busy: 0, busySince_s: null };
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

interface ShareAnswered {
  next: ShareState;
  /** Whether the cursor moved on, so the run goes on to the next egg. */
  moved: boolean;
}

/** The egg at the cursor answered `status`: whether the cursor moves on, and
 *  the state with it. Kept or refused, it does; busy, it waits - counted,
 *  unless it has waited long enough, when it is passed over as if refused,
 *  so that one egg cannot hold up the rest for good. No answer at all is not
 *  an answer: the caller leaves the state as it is. `now_s` is epoch s. */
export function answered(s: ShareState, status: number, now_s: number): ShareAnswered {
  if (shareReply(status) === 'busy') {
    const since = s.busySince_s ?? now_s;
    const busy = s.busy + 1;
    if (!shareGivesUp(busy, now_s - since)) {
      return { next: { ...s, busy: busy, busySince_s: since }, moved: false };
    }
  }
  return { next: { ...s, sent: s.sent + 1, seq: nextSeq(s.seq), busy: 0, busySince_s: null }, moved: true };
}

/** The server confirmed `uid` deleted: it is no longer asked for. */
export function deletionConfirmed(s: ShareState, uid: string): ShareState {
  return { ...s, deleting: s.deleting.filter((x) => x !== uid) };
}
