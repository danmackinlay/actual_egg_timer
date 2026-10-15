/**
 * fixtures/share.json: sharing's contract with the server
 * (src/core/share.ts), for the Swift port to be held to.
 *
 *  - `uids`: which strings are a cook's id.
 *  - `seq`: the number the first egg under a new id is filed at, and the
 *    number after each of a few.
 *  - `deletionDone`: which answers to a deletion end it.
 *  - `replies`: what a sender makes of the endpoint's answer, every status
 *    class's edges.
 */

import { FIRST_SEQ, deletionDone, isUid, nextSeq, shareReply } from '../../src/core/share.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = 'aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa';

export function shareFixture() {
  const uids = [
    A, B, '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-9444-444444444444', C, C.toUpperCase(),
    'abcdef01-2345-4789-abcd-ef0123456789', 'abcdeg01-2345-4789-abcd-ef0123456789',
    '11111111-1111-1111-8111-111111111111', '11111111-1111-4111-c111-111111111111',
    '11111111111141118111111111111111', ` ${A}`, `${A}0`, '', 'nobody',
  ].map((uid) => ({ uid, isUid: isUid(uid) }));

  return {
    about: 'Sharing\'s contract with the server: ids, the number each egg is filed under, which answers end a deletion, and what a sender makes of the endpoint\'s answer. src/core/share.ts.',
    uids,
    seq: { first: FIRST_SEQ, next: [0, 1, 2, 41, 4999].map((seq) => ({ seq, next: nextSeq(seq) })) },
    deletionDone: [200, 201, 400, 404, 409, 429, 500, 503].map((status) => ({ status, done: deletionDone(status) })),
    replies: [100, 199, 200, 201, 202, 204, 299, 301, 304, 399, 400, 401, 402, 403, 404, 405, 407, 408, 409, 413,
      415, 422, 428, 429, 430, 451, 499, 500, 502, 503, 504, 511, 599, 600].map((status) => ({
      status: status,
      reply: shareReply(status),
    })),
  };
}
