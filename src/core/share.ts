/**
 * Sharing's contract with the server (INFERENCE.md section 7): what both
 * apps send and the collection endpoint (`server/eggs.ts`) takes, and what
 * its answers mean. A cook's id (`isUid`), which the server takes as the
 * apps make it; the number each egg is filed under (`FIRST_SEQ`,
 * `nextSeq`); what an answer to a sent egg or an attestation means
 * (`shareReply`); and when a deletion is done (`deletionDone`).
 *
 * The queue that sends the log, one final egg at a time, and the state it
 * keeps beside the log are each app's: the web's `src/ui/shareState.ts`,
 * iOS's `ShareQueue.swift`. Both move the egg's number only as below.
 *
 * No I/O, no clock, no randomness.
 */

/* ------------------------------------------------------------------- ids */

/** A cook's id as both apps make it and the server takes it: a version 4
 *  UUID, in lower case. */
const UID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUid(v: unknown): v is string {
  return typeof v === 'string' && UID.test(v);
}

/* ------------------------------------------------------- the egg's number */

/**
 * The server keeps an egg at `records/<tier>/<uid>/<seq>`, written only if
 * that key is new: an egg sent again at its number is taken as a retry and
 * dropped. So under one id a number is never used for a second egg, or that
 * egg is lost without a word. The numbers start at `FIRST_SEQ` only under an
 * id never used before; an egg passed - kept, refused, or given up on - is
 * followed by `nextSeq`'s, whatever the answer, since a refused or a busy
 * egg may have been kept all the same; and nothing else moves them. A log
 * dropped and begun again keeps counting under its id, since its eggs are
 * new, and sharing turned off and on again carries on where it was.
 */
export const FIRST_SEQ = 0;

/** The number the egg after one filed at `seq` goes under, the same id. */
export function nextSeq(seq: number): number {
  return seq + 1;
}

/* ------------------------------------------------- the server's answers */

/**
 * What an answer from the collection endpoint means to the app that sent a
 * result or an attestation (`src/ui/share.ts`, iOS's `Sharing.swift`):
 *
 * - `kept`: 201 kept, 200 already kept.
 * - `busy`: 403, 404, 408, 429 or any 5xx - an answer about the way to the
 *   server, not about what was sent. The server is overloaded, limited or
 *   down, or a bad deploy, a firewall or a proxy is in the way (403, 404),
 *   and the same request may well be taken once that is put right. Wait,
 *   and ask again on a later run; each app bounds how long, so an answer
 *   that never changes cannot stop its queue for good.
 * - `refused`: anything else, for good: an answer about the request itself.
 *   400 (not a record; an attestation refused), 409 (another key for this
 *   id), 413 (too big), 415 (not JSON), 422, and any other 4xx; and anything
 *   that is neither kept nor an error (a 1xx, another 2xx, a 3xx). The same
 *   request would be refused again, so the result is passed over at once,
 *   and an attestation given up (the phone sends open), and the rest of the
 *   queue moves.
 *
 * No answer at all - offline, a timeout - is the caller's, and is not one of
 * these: it waits, and is not counted, since nothing else can get through
 * either, and nothing was learned.
 */
type ShareReply = 'kept' | 'busy' | 'refused';

export function shareReply(status: number): ShareReply {
  if (status === 200 || status === 201) return 'kept';
  if (status === 403 || status === 404 || status === 408 || status === 429 || (status >= 500 && status <= 599)) {
    return 'busy';
  }
  return 'refused';
}

/** Whether a deletion the server answered `status` is done: 200, or 400, an
 *  id the server will never hold. Anything else is asked again. */
export function deletionDone(status: number): boolean {
  return status === 200 || status === 400;
}
