/**
 * The collection endpoint (server/eggs.ts; COLLECTIVE.md section 1), driven
 * against a map standing in for Netlify Blobs: an egg kept once and only
 * once, in the tier its assertion earns, refused when a phone's loader would
 * refuse it, and every trace of an id gone on DELETE.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_BODY_BYTES, MAX_SEQ, Options, Store, handle, keyKey, recordKey } from '../server/eggs.js';
import { MemoryStore } from '../server/memoryStore.js';
import { EggRecord } from '../src/core/record.js';
import { recordAt } from '../tools/common.js';
import { SYNTH, makeAssertion } from './attest.js';

const UID = '6f1c2a9e-2b1d-4c1e-9d6b-1a2b3c4d5e6f';
const SITE = 'https://actualeggtimer.netlify.app';
const OPTS: Options = { root: SYNTH.root };

function egg(uid: string | null = UID, over: Partial<EggRecord> = {}): EggRecord {
  return { ...recordAt(0.41, 412, 0, 'tender'), uid: uid, ...over };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request(SITE + path, { method: 'POST', body: text, headers: headers });
}

async function send(store: Store, req: Request): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await handle(req, store, OPTS);
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

test('1. an egg is kept once, in the open tier, as the loader reads it', async () => {
  const store = new MemoryStore();
  const first = await send(store, post('/api/eggs', { seq: 0, record: { ...egg(), extra: 'dropped' } }));
  assert.deepEqual(first, { status: 201, body: { tier: 'open', stored: true } });
  const kept = JSON.parse(store.blobs.get(recordKey('open', UID, 0)) ?? 'null') as Record<string, unknown>;
  assert.equal(kept['uid'], UID);
  assert.equal(kept['extra'], undefined, 'exactly the known fields');
  assert.equal(recordKey('open', UID, 0), `records/open/${UID}/000000.json`);
  // A retry is harmless, and nothing is overwritten.
  const again = await send(store, post('/api/eggs', { seq: 0, record: egg(UID, { yolk: 1 }) }));
  assert.deepEqual(again, { status: 200, body: { tier: 'open', stored: false } });
  assert.equal(JSON.parse(store.blobs.get(recordKey('open', UID, 0)) ?? 'null').yolk, 0);
  assert.equal((await send(store, post('/api/eggs', { seq: 1, record: egg() }))).status, 201);
  assert.deepEqual(await store.list(`records/open/${UID}/`), [recordKey('open', UID, 0), recordKey('open', UID, 1)]);
});

test('2. what a phone would refuse, the server refuses', async () => {
  const store = new MemoryStore();
  const refused: [string, unknown, number][] = [
    ['no id', { seq: 0, record: egg(null) }, 400],
    ['an id that is not a UUID', { seq: 0, record: egg('cook-1') }, 400],
    ['an id in capitals', { seq: 0, record: egg(UID.toUpperCase()) }, 400],
    ['not a record', { seq: 0, record: { ...egg(), level: 3 } }, 400],
    ['no record', { seq: 0 }, 400],
    ['no seq', { record: egg() }, 400],
    ['a fractional seq', { seq: 1.5, record: egg() }, 400],
    ['a negative seq', { seq: -1, record: egg() }, 400],
    ['a seq past the cap', { seq: MAX_SEQ, record: egg() }, 400],
    ['an array', [egg()], 400],
    ['not JSON', '{"seq": 0, "record"', 400],
    ['too big', 'x'.repeat(MAX_BODY_BYTES + 1), 413],
  ];
  for (const [why, body, status] of refused) {
    assert.equal((await send(store, post('/api/eggs', body))).status, status, why);
  }
  assert.equal(store.blobs.size, 0, 'nothing written');
  assert.equal((await handle(new Request(SITE + '/api/eggs'), store)).status, 405);
  assert.equal((await handle(new Request(SITE + '/api/nothing'), store)).status, 404);
  assert.equal((await handle(new Request(SITE + `/api/eggs/${UID}`), store)).status, 405);
});

test('3. DELETE removes every egg under the id, in both tiers, and its key', async () => {
  const store = new MemoryStore();
  await store.set(recordKey('open', UID, 0), '{}', true);
  await store.set(recordKey('open', UID, 1), '{}', true);
  await store.set(recordKey('attested', UID, 2), '{}', true);
  await store.set(keyKey(UID), '{}', true);
  const other = '0e7c9a1b-5f3d-4e2a-8b6c-9d0e1f2a3b4c';
  await store.set(recordKey('open', other, 0), '{}', true);
  const del = (uid: string) => handle(new Request(`${SITE}/api/eggs/${uid}`, { method: 'DELETE' }), store);
  const res = await del(UID);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { deleted: 3 });
  assert.deepEqual([...store.blobs.keys()], [recordKey('open', other, 0)], 'another cook is untouched');
  assert.deepEqual(await (await del(UID)).json(), { deleted: 0 }, 'nothing left is not an error');
  assert.equal((await del('not-an-id')).status, 400);
  assert.equal((await del('')).status, 405, 'DELETE /api/eggs/ is DELETE /api/eggs, which takes only POST');
});

test('4. an iPhone attests once, and its eggs go to the attested tier', async () => {
  const store = new MemoryStore();
  const attest = { uid: SYNTH.uid, keyId: SYNTH.keyId, attestation: SYNTH.attestation };
  assert.deepEqual(await send(store, post('/api/attest', attest)), { status: 201, body: { environment: 'development' } });
  assert.equal((await send(store, post('/api/attest', attest))).status, 200, 'the same key again is a retry');
  const wrongId = { ...attest, uid: UID };
  assert.equal((await send(store, post('/api/attest', wrongId))).status, 400, 'bound to the id it was made for');
  assert.equal((await send(store, post('/api/attest', { ...attest, keyId: 'AAAA' }))).status, 400, 'not this key');
  assert.equal((await send(store, post('/api/attest', { uid: SYNTH.uid }))).status, 400);
  // One key per id: an id already holding another key refuses a second.
  const kept = store.blobs.get(keyKey(SYNTH.uid)) ?? '';
  store.blobs.set(keyKey(SYNTH.uid), JSON.stringify({ ...JSON.parse(kept), keyId: 'another' }));
  assert.equal((await send(store, post('/api/attest', attest))).status, 409);
  store.blobs.set(keyKey(SYNTH.uid), kept);

  // An egg, signed: attested, and the counter moves on.
  const body = JSON.stringify({ seq: 0, record: egg(SYNTH.uid) });
  const signed = (b: string, counter: number) => post('/api/eggs', b, {
    'x-egg-assertion': Buffer.from(makeAssertion(SYNTH.leafPrivateKey, new TextEncoder().encode(b), counter)).toString('base64'),
  });
  assert.deepEqual(await send(store, signed(body, 1)), { status: 201, body: { tier: 'attested', stored: true } });
  assert.equal(JSON.parse(store.blobs.get(keyKey(SYNTH.uid)) ?? 'null').counter, 1);
  // The same request again: the counter has not gone up, so it reads as open,
  // and the attested copy stands - no second copy is written.
  assert.deepEqual(await send(store, signed(body, 1)), { status: 200, body: { tier: 'attested', stored: false } });
  assert.equal(store.blobs.has(recordKey('open', SYNTH.uid, 0)), false);

  // Unsigned, or signed over another body: the open tier.
  const unsigned = JSON.stringify({ seq: 1, record: egg(SYNTH.uid) });
  assert.equal((await send(store, post('/api/eggs', unsigned))).body['tier'], 'open');
  const forged = post('/api/eggs', JSON.stringify({ seq: 2, record: egg(SYNTH.uid) }), {
    'x-egg-assertion': Buffer.from(makeAssertion(SYNTH.leafPrivateKey, new TextEncoder().encode(body), 5)).toString('base64'),
  });
  assert.equal((await send(store, forged)).body['tier'], 'open');
  // The other way: an egg kept as open, then sent again once the phone has
  // attested (the first answer lost on the way back), is not kept twice.
  await store.set(recordKey('open', SYNTH.uid, 7), '{}', true);
  const later = JSON.stringify({ seq: 7, record: egg(SYNTH.uid) });
  assert.deepEqual(await send(store, signed(later, 6)), { status: 200, body: { tier: 'open', stored: false } });
  assert.equal(store.blobs.has(recordKey('attested', SYNTH.uid, 7)), false);
  // An assertion for an id with no key: open.
  const nokey = JSON.stringify({ seq: 0, record: egg(UID) });
  assert.equal((await send(store, signed(nokey, 9))).body['tier'], 'open');
  assert.equal((await send(store, post('/api/eggs', nokey, { 'x-egg-assertion': '!!' }))).status, 200);
});
