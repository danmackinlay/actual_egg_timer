/**
 * Sharing on the web (src/ui/share.ts; COLLECTIVE.md section 1): the id, the
 * cursor into the log, sending what is final and only that, and deleting
 * everything this browser has sent, under every id it has used.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FRESH_SHARE, REQUEST_TIMEOUT_MS, ShareState, Transport, answered, fetchWithin, deleteSent, deletionAsked, forgetShare, forgotten,
  loadShare, newUid, readShare, reconciled, retryDeletes, sendFinal, setSharing, shareState, shareStoredElsewhere, turnedOff,
  turnedOn,
} from '../src/ui/share.js';
import { EggRecord } from '../src/core/record.js';
import { recordAt } from '../tools/common.js';

const storage = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); },
    removeItem: (k: string) => { storage.delete(k); },
  },
};

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let minted = 0;
const mint = (): string => [A, B][minted++ % 2];

test('1. an id is a version 4 UUID in lower case, from random bytes and nothing else', () => {
  const uid = newUid();
  assert.match(uid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(newUid(), uid);
  assert.equal(newUid((b) => b.fill(0xff)), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.equal(newUid((b) => b.fill(0)), '00000000-0000-4000-8000-000000000000');
});

test('2. what storage holds is read defensively, and every readable id is kept', () => {
  assert.deepEqual(readShare(null), FRESH_SHARE);
  assert.deepEqual(readShare('not json'), FRESH_SHARE);
  assert.deepEqual(readShare('[1]'), FRESH_SHARE);
  assert.equal(readShare(JSON.stringify({ on: true, uid: 'nobody' })).on, false, 'on, with no id, is off');
  const s = readShare(JSON.stringify({ on: true, uid: A, sent: 3, seq: -1, uids: [B, 'x', 7], deleting: [B] }));
  assert.deepEqual(s, { on: true, uid: A, sent: 3, seq: 0, uids: [B, A], deleting: [B], busy: 0, busySince: null });
  const waiting = readShare(JSON.stringify({ on: true, uid: A, busy: 2, busySince: 1e12 }));
  assert.deepEqual([waiting.busy, waiting.busySince], [2, 1e12]);
  const damaged = readShare(JSON.stringify({ on: true, uid: A, busy: 'x', busySince: 'y' }));
  assert.deepEqual([damaged.busy, damaged.busySince], [0, null]);
});

test('3. on, off, forget, delete: the id lives as long as the log it sends', () => {
  minted = 0;
  let s: ShareState = turnedOn(FRESH_SHARE, mint);
  assert.deepEqual([s.on, s.uid, s.uids], [true, A, [A]]);
  s = { ...s, sent: 4, seq: 4 };
  s = turnedOn(turnedOff(s), mint);
  assert.deepEqual([s.uid, s.sent, s.uids], [A, 4, [A]], 'off and on again: the same cook');
  s = forgotten(s, mint);
  assert.deepEqual([s.on, s.uid, s.sent, s.seq, s.uids], [true, B, 0, 0, [A, B]], 'a forget is a new cook');
  const off = forgotten(turnedOff({ ...s, sent: 2 }), mint);
  assert.deepEqual([off.uid, off.sent, off.uids], [null, 0, [A, B]], 'off: the next id is made when it goes on');
  const gone = deletionAsked(s);
  assert.deepEqual(gone, { ...FRESH_SHARE, deleting: [A, B] });
  assert.deepEqual(deletionAsked({ ...gone, uids: [A] }).deleting, [A, B], 'no id asked for twice');
  assert.equal(reconciled({ ...s, sent: 5 }, 2).sent, 0, 'a dropped log begins again');
  assert.equal(reconciled({ ...s, sent: 2 }, 5).sent, 2);
  assert.deepEqual(
    [200, 201, 400, 409, 413, 415, 422, 403, 404, 429, 500, 503].map((status) => answered(s, status, 0).moved),
    [true, true, true, true, true, true, true, false, false, false, false, false],
  );
});

test('3b. a busy server is waited on, counted, and given up on after five busy answers and three days', () => {
  const DAY = 24 * 3600 * 1000;
  let s: ShareState = { ...turnedOn(FRESH_SHARE, () => A), sent: 2, seq: 7 };
  const at = [0, 1, 2, 2.9, 3.5].map((d) => 1e12 + d * DAY);
  for (const now of at.slice(0, 4)) {
    const r = answered(s, 503, now);
    assert.equal(r.moved, false);
    s = r.next;
  }
  assert.deepEqual([s.sent, s.seq, s.busy, s.busySince], [2, 7, 4, 1e12], 'counted from the first');
  const after = answered(s, 429, at[4]);
  assert.equal(after.moved, true, 'the fifth, three days on: passed over');
  assert.deepEqual([after.next.sent, after.next.seq, after.next.busy, after.next.busySince], [3, 8, 0, null]);
  // Many busy answers in one afternoon are only an afternoon.
  let t: ShareState = { ...s, busy: 0, busySince: null };
  for (let i = 0; i < 20; i++) {
    const r = answered(t, 500, 1e12 + i * 60_000);
    assert.equal(r.moved, false);
    t = r.next;
  }
  assert.equal(answered({ ...s, busySince: at[4] - DAY }, 500, at[4]).moved, false, 'four, then a fifth only a day on');
  assert.deepEqual(answered({ ...s, busy: 3 }, 201, at[4]).next.busy, 0, 'kept: the count starts again');
  assert.deepEqual(reconciled({ ...s, sent: 9 }, 2).busy, 0, 'a new log, a new count');
  assert.deepEqual(forgotten(s, () => B).busySince, null, 'a new cook, a new count');
});

/** A transport that records what it was sent and answers from a script. */
function fake(answers: (number | 'offline')[] = []): Transport & { posts: Record<string, unknown>[]; removes: string[] } {
  const posts: Record<string, unknown>[] = [];
  const removes: string[] = [];
  return {
    posts: posts,
    removes: removes,
    post: async (body) => {
      const a = answers.shift() ?? 201;
      if (a === 'offline') throw new TypeError('Failed to fetch');
      posts.push(JSON.parse(body) as Record<string, unknown>);
      return a;
    },
    remove: async (uid) => {
      const a = answers.shift() ?? 200;
      if (a === 'offline') throw new TypeError('Failed to fetch');
      removes.push(uid);
      return a;
    },
  };
}

function page(log: EggRecord[], final = log.length) {
  const h = { log: () => log, finalCount: () => final, changed: () => {} };
  return h;
}

const LOG: EggRecord[] = [0, 1, 2].map((i) => ({
  ...recordAt(0.41, 400 + i, 0, null), day: `2026-10-0${i + 1}`, id: 1759700000000 + i,
}));

test('4. turning sharing on sends the log so far, in order, each copy carrying the id', async () => {
  storage.clear();
  const t = fake();
  loadShare(page(LOG, 2), t);
  await sendFinal();
  assert.equal(t.posts.length, 0, 'off: nothing goes');
  await setSharing(true);
  const uid = shareState().uid;
  assert.equal(t.posts.length, 2, 'the last egg is still on screen');
  assert.deepEqual(t.posts.map((p) => p['seq']), [0, 1]);
  assert.deepEqual(t.posts.map((p) => (p['record'] as EggRecord).day), ['2026-10-01', '2026-10-02']);
  for (const p of t.posts) assert.equal((p['record'] as EggRecord).uid, uid);
  assert.equal(LOG[0].uid, null, 'the log keeps no id');
  for (const p of t.posts) assert.equal('id' in (p['record'] as object), false, 'the moment it started stays here');
  assert.equal(LOG[0].id, 1759700000000, 'and stays in the log');
  assert.equal(JSON.parse(storage.get('aet.share.v1') ?? '{}').sent, 2, 'written through');
});

test('5. a refused egg is passed over; a busy server or none stops the run until the next', async () => {
  storage.clear();
  const t = fake([500]);
  loadShare(page(LOG), t, () => 1e12);
  await setSharing(true);
  assert.deepEqual([shareState().sent, shareState().busy], [0, 1], '500: try again later, counted');
  t.post = fake(['offline']).post;
  await sendFinal();
  assert.deepEqual([shareState().sent, shareState().busy], [0, 1], 'offline: try again later, not counted');
  const ok = fake([415, 201, 200]);
  loadShare(page(LOG), ok);
  await sendFinal();
  assert.deepEqual([shareState().sent, shareState().seq], [3, 3], 'refused (not JSON), kept, already kept: all done with');
  await sendFinal();
  assert.equal(ok.posts.length, 3, 'nothing is sent twice');
});

test('5b. an egg the server stays busy for, or out of reach, is passed over in the end, and the rest go', async () => {
  storage.clear();
  let clock = 1e12;
  // Down, then a bad deploy (404), then a firewall (403): all waited on.
  const t = fake([503, 404, 404, 403, 503, 201, 201]);
  loadShare(page(LOG), t, () => clock);
  await setSharing(true);
  for (let run = 1; run < 5; run++) {
    clock += 24 * 3600 * 1000;
    await sendFinal();
  }
  assert.deepEqual([shareState().sent, shareState().seq], [3, 3], 'the first given up on the fifth try, four days on');
  assert.deepEqual(t.posts.map((p) => p['seq']), [0, 0, 0, 0, 0, 1, 2]);
});

test('6. forgetting starts a new cook; deleting reaches every id, after what was in flight', async () => {
  storage.clear();
  let release: (status: number) => void = () => {};
  const slow: Transport & { removes: string[]; order: string[] } = {
    removes: [], order: [],
    post: () => new Promise<number>((resolve) => { release = resolve; }).then((s) => { slow.order.push('post'); return s; }),
    remove: async (uid) => { slow.order.push('delete'); slow.removes.push(uid); return 200; },
  };
  loadShare(page(LOG), slow);
  void setSharing(true);
  const first = shareState().uid;
  forgetShare();
  const second = shareState().uid;
  assert.notEqual(second, first);
  assert.deepEqual(shareState().uids, [first, second]);
  const sending = sendFinal();
  const deleting = deleteSent();
  release(201);
  await Promise.all([sending, deleting]);
  assert.deepEqual(slow.order, ['post', 'delete', 'delete'], 'the egg in flight lands before the deletion');
  assert.deepEqual(slow.removes, [first, second]);
  assert.deepEqual(shareState(), FRESH_SHARE, 'off, no id, nothing left to delete');
});

test('7. a deletion the server did not confirm is asked again at the next load', async () => {
  storage.clear();
  storage.set('aet.share.v1', JSON.stringify({ on: false, uid: null, uids: [], deleting: [A, B] }));
  const t = fake(['offline']);
  loadShare(page([]), t);
  await retryDeletes();
  assert.deepEqual(shareState().deleting, [A, B]);
  const later = fake([500, 200]);
  loadShare(page([]), later);
  await retryDeletes();
  assert.deepEqual(shareState().deleting, [A], 'B confirmed, A not yet');
  loadShare(page([]), fake([200]));
  await retryDeletes();
  assert.deepEqual(shareState().deleting, []);
});

test('8. another tab\'s change is taken up before this one acts: a stale tab neither sends nor undoes a deletion', async () => {
  storage.clear();
  const t = fake();
  const log = [...LOG];
  loadShare(page(log), t);
  await setSharing(true);
  const uid = shareState().uid as string;
  assert.equal(t.posts.length, 3);
  assert.equal(shareStoredElsewhere('aet.share.v1'), false, 'nothing new');
  // Another tab, loaded later, deletes everything sent.
  storage.set('aet.share.v1', JSON.stringify(deletionAsked(readShare(storage.get('aet.share.v1') ?? null))));
  // This tab, still showing sharing on, finishes an egg before it hears.
  log.push({ ...LOG[0], day: '2026-10-04' });
  await sendFinal();
  assert.equal(t.posts.length, 3, 'nothing goes under an id another tab deleted');
  assert.equal(shareState().on, false);
  // And its own writes start from what the other tab wrote.
  forgetShare();
  assert.deepEqual(readShare(storage.get('aet.share.v1') ?? null).deleting, [uid], 'the deletion is still to be asked');
  // The page's storage event: taken up once, and only for this key.
  storage.set('aet.share.v1', JSON.stringify({ ...FRESH_SHARE, deleting: [uid, B] }));
  assert.equal(shareStoredElsewhere('aet.settings.v1'), false);
  assert.equal(shareStoredElsewhere('aet.share.v1'), true);
  assert.equal(shareStoredElsewhere('aet.share.v1'), false);
  assert.deepEqual(shareState().deleting, [uid, B]);
});

test('9. two tabs sending the same egg move the cursor once', async () => {
  storage.clear();
  let release: (status: number) => void = () => {};
  const slow: Transport = {
    post: () => new Promise<number>((resolve) => { release = resolve; }),
    remove: async () => 200,
  };
  loadShare(page(LOG, 0), slow);
  await setSharing(true);
  const sending = (async () => {
    loadShare(page(LOG, 1), slow);
    return sendFinal();
  })();
  await new Promise((r) => setTimeout(r, 0));
  // Meanwhile the other tab sent egg 0 and moved on.
  const s = readShare(storage.get('aet.share.v1') ?? null);
  storage.set('aet.share.v1', JSON.stringify({ ...s, sent: 1, seq: 1 }));
  release(200);
  await sending;
  assert.deepEqual([shareState().sent, shareState().seq], [1, 1], 'not 2: the other tab already moved it');
});

test('10. a request the server never answers is given up, so the lock it holds is let go', async () => {
  assert.ok(REQUEST_TIMEOUT_MS > 0 && REQUEST_TIMEOUT_MS <= 30000);
  let signal: AbortSignal | null = null;
  const stalled = (_url: string, init: RequestInit): Promise<Response> => new Promise((_resolve, reject) => {
    signal = init.signal ?? null;
    init.signal?.addEventListener('abort', () => { reject(new Error('aborted')); });
  });
  await assert.rejects(fetchWithin('/api/eggs', { method: 'POST' }, 5, stalled), /aborted/);
  assert.equal((signal as AbortSignal | null)?.aborted, true);
  // One that answers in time is answered, and its timer is cleared.
  const quick = async (): Promise<Response> => new Response(null, { status: 201 });
  assert.equal((await fetchWithin('/api/eggs', {}, 5, quick)).status, 201);
});
