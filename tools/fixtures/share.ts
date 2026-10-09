/**
 * fixtures/share.json: sharing's state (src/core/share.ts), for the Swift
 * port to be held to.
 *
 *  - `uids`: which strings are a cook's id.
 *  - `reads`: stored states, well and badly formed, and what a defensive read
 *    makes of each: a damaged state reads as off and keeps every id it can.
 *  - `states`: six starting points (the first six), and every state two
 *    moves from them.
 *  - `transitions`: every move from every state one move or none from a
 *    starting point, by index into `states`: on (with the new id it would
 *    take), off, forget (likewise), delete, a log dropped to 0 or 2 eggs, an
 *    answer of 201, 400 or 503 now or 503 four days on (and whether the
 *    cursor moved), and the first pending deletion confirmed.
 *  - `nextToSend`: the egg each starting point sends next, for a few logs.
 *  - `deletionDone`: which answers to a deletion end it.
 *  - `answers`: what a sender makes of the endpoint's answer, and when it
 *    stops waiting on a busy one.
 */

import {
  FRESH_SHARE, ShareState, answered, deletionAsked, deletionConfirmed, deletionDone, forgotten, isUid, nextToSend,
  SHARE_WAIT_S, SHARE_WAIT_TRIES, readShareState, reconciled, shareGivesUp, shareReply, turnedOff, turnedOn,
} from '../../src/core/share.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
/** New ids, taken in turn: the one at the count of ids the state has seen. */
const POOL = [
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-9444-444444444444',
  '55555555-5555-4555-a555-555555555555', '66666666-6666-4666-b666-666666666666',
  '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-9888-888888888888',
  '99999999-9999-4999-a999-999999999999', 'aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa',
];
const DAY_S = 24 * 3600;
/** Now, for an answer: 6 October 2026, epoch s. */
const T = 1791244800;

type Move =
  | { turnOn: string } | { turnOff: true } | { forget: string } | { deleteAsked: true }
  | { reconcile: number } | { answer: number; now_s: number } | { deleted: string };

function fresh(s: ShareState): string {
  return POOL[(s.uids.length + s.deleting.length) % POOL.length];
}

function moves(s: ShareState): Move[] {
  return [
    { turnOn: fresh(s) }, { turnOff: true }, { forget: fresh(s) }, { deleteAsked: true },
    { reconcile: 0 }, { reconcile: 2 },
    { answer: 201, now_s: T }, { answer: 400, now_s: T }, { answer: 503, now_s: T },
    { answer: 503, now_s: T + 4 * DAY_S },
    { deleted: s.deleting.length > 0 ? s.deleting[0] : A },
  ];
}

function apply(s: ShareState, m: Move): { next: ShareState; moved: boolean | null } {
  if ('turnOn' in m) return { next: turnedOn(s, m.turnOn), moved: null };
  if ('turnOff' in m) return { next: turnedOff(s), moved: null };
  if ('forget' in m) return { next: forgotten(s, m.forget), moved: null };
  if ('deleteAsked' in m) return { next: deletionAsked(s), moved: null };
  if ('reconcile' in m) return { next: reconciled(s, m.reconcile), moved: null };
  if ('answer' in m) return answered(s, m.answer, m.now_s);
  return { next: deletionConfirmed(s, m.deleted), moved: null };
}

/** The logs a state is asked about: how many eggs are final, of how many. */
const LOGS: [number, number][] = [[0, 0], [1, 2], [2, 2], [3, 3], [5, 3]];

export function shareFixture() {
  const uids = [
    A, B, ...POOL.slice(0, 2), POOL[7], POOL[7].toUpperCase(), 'abcdef01-2345-4789-abcd-ef0123456789',
    'abcdeg01-2345-4789-abcd-ef0123456789', '11111111-1111-1111-8111-111111111111',
    '11111111-1111-4111-c111-111111111111', '11111111111141118111111111111111', ` ${A}`, `${A}0`, '', 'nobody',
  ].map((uid) => ({ uid, isUid: isUid(uid) }));

  const raws: unknown[] = [
    null, 'not an object', 42, true, [], [1], {},
    { on: true, uid: 'nobody' },
    { on: true, uid: A },
    { on: 1, uid: A },
    { on: 'true', uid: A },
    { on: true, uid: POOL[7].toUpperCase() },
    { on: true, uid: A, sent: 3, seq: -1, uids: [B, 'x', 7], deleting: [B] },
    { on: true, uid: A, sent: 2.5, seq: '4', busy: true },
    { on: true, uid: A, sent: 3, seq: 4, uids: [A, A, B], deleting: [A, null, A] },
    { on: true, uid: A, uids: 'not a list', deleting: {} },
    { on: true, uid: A, busy: 2, busySince_s: 1e9 },
    { on: true, uid: A, busy: 2, busySince_s: 1759541767.25 },
    { on: true, uid: A, busy: 'x', busySince_s: 'y' },
    { on: true, uid: A, busySince_s: false },
    { on: false, uid: null, sent: 3, seq: 4, busy: 2, busySince_s: 1e9, uids: [A], deleting: [A, B] },
    { on: true, uid: 'nobody', sent: 3, uids: [B], deleting: [B] },
    { ...FRESH_SHARE, uids: [A, B], deleting: [A], extra: 'ignored' },
  ];
  const reads = raws.map((raw) => ({ raw, state: readShareState(raw) }));

  const starts: ShareState[] = [
    FRESH_SHARE,
    { ...FRESH_SHARE, on: true, uid: A, sent: 2, seq: 3, uids: [A] },
    { ...FRESH_SHARE, uid: A, sent: 1, seq: 1, uids: [B, A] },
    { ...FRESH_SHARE, on: true, uid: A, sent: 1, seq: 1, uids: [A], busy: 4, busySince_s: T },
    // A clock set back since the first busy answer.
    { ...FRESH_SHARE, on: true, uid: A, sent: 1, seq: 1, uids: [A], busy: 4, busySince_s: T + 10 * DAY_S },
    { ...FRESH_SHARE, deleting: [A, B] },
  ];
  const index = new Map<string, number>();
  const states: ShareState[] = [];
  const add = (s: ShareState): number => {
    const key = JSON.stringify(s);
    const known = index.get(key);
    if (known !== undefined) return known;
    states.push(s);
    index.set(key, states.length - 1);
    return states.length - 1;
  };
  const transitions: { from: number; move: Move; to: number; moved?: boolean }[] = [];
  let frontier = starts.map(add);
  const explored = new Set<number>();
  for (let depth = 0; depth < 2; depth++) {
    const nextFrontier: number[] = [];
    for (const from of frontier) {
      if (explored.has(from)) continue;
      explored.add(from);
      for (const move of moves(states[from])) {
        const { next, moved } = apply(states[from], move);
        const to = add(next);
        transitions.push(moved === null ? { from, move, to } : { from, move, to, moved });
        nextFrontier.push(to);
      }
    }
    frontier = nextFrontier;
  }

  return {
    about: 'Sharing\'s state: ids, defensive reads, every move from every reachable state, and what a sender makes of the endpoint\'s answer. src/core/share.ts.',
    fresh: FRESH_SHARE,
    uids,
    reads,
    states,
    transitions,
    nextToSend: starts.flatMap((state, i) => LOGS.map(([finalCount, logLength]) => ({
      state: i, finalCount, logLength, at: nextToSend(state, finalCount, logLength),
    }))),
    deletionDone: [200, 201, 400, 404, 409, 429, 500, 503].map((status) => ({ status, done: deletionDone(status) })),
    /* What a sender makes of the endpoint's answer, and when it stops waiting:
     * every status class's edges, and both bounds either side. */
    answers: {
      waitTries: SHARE_WAIT_TRIES,
      wait_s: SHARE_WAIT_S,
      replies: [100, 199, 200, 201, 202, 204, 299, 301, 304, 399, 400, 401, 402, 403, 404, 405, 407, 408, 409, 413,
        415, 422, 428, 429, 430, 451, 499, 500, 502, 503, 504, 511, 599, 600].map((status) => ({
        status: status,
        reply: shareReply(status),
      })),
      givesUp: [0, 1, 4, 5, 6, 50].flatMap((tries) => [
        -1, 0, 3600, SHARE_WAIT_S - 1, SHARE_WAIT_S, SHARE_WAIT_S + 1, 30 * 24 * 3600,
      ].map((waited_s) => ({ tries: tries, waited_s: waited_s, givesUp: shareGivesUp(tries, waited_s) }))),
    },
  };
}
