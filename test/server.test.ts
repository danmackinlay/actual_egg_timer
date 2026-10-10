/**
 * The collection endpoint (server/eggs.ts; COLLECTIVE.md section 1), driven
 * against a map standing in for Netlify Blobs: an egg kept once and only
 * once, in the tier its assertion earns (attested only under a key from
 * Apple's production environment), refused when a phone's loader would
 * refuse it, and every trace of an id gone on DELETE.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_BODY_BYTES, MAX_RECORD_BYTES, MAX_SEQ, MAX_STRING, Options, Store, countedTier, handle, keyKey, recordKey } from '../server/eggs.js';
import { MemoryStore } from '../server/memoryStore.js';
import { EggRecord, MODEL_ID, parseRecord } from '../src/core/record.js';
import { readFitRecord } from '../tools/eggsImport.js';
import { recordAt } from '../tools/common.js';
import { SYNTH, makeAssertion } from './attest.js';

const UID = '6f1c2a9e-2b1d-4c1e-9d6b-1a2b3c4d5e6f';
const SITE = 'https://actualeggtimer.netlify.app';
const OPTS: Options = { root: SYNTH.root };

function egg(uid: string | null = UID, over: Partial<EggRecord> = {}): EggRecord {
  return { ...recordAt(0.41, 412, 'jammy', 'tender'), uid: uid, ...over };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request(SITE + path, {
    method: 'POST', body: text, headers: { 'content-type': 'application/json', ...headers },
  });
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
  // The moment a cook started is never kept, whoever sends it.
  assert.equal((await send(store, post('/api/eggs', { seq: 9, record: egg(UID, { id: 1759700000123 }) }))).status, 201);
  assert.equal('id' in (JSON.parse(store.blobs.get(recordKey('open', UID, 9)) ?? 'null') as object), false);
  assert.equal('id' in kept, false);
  assert.equal(recordKey('open', UID, 0), `records/open/${UID}/000000.json`);
  // A retry is harmless, and nothing is overwritten.
  const again = await send(store, post('/api/eggs', { seq: 0, record: egg(UID, { yolkWord: 'fudgy' }) }));
  assert.deepEqual(again, { status: 200, body: { tier: 'open', stored: false } });
  assert.equal(JSON.parse(store.blobs.get(recordKey('open', UID, 0)) ?? 'null').yolkWord, 'jammy');
  assert.equal((await send(store, post('/api/eggs', { seq: 1, record: egg() }))).status, 201);
  assert.deepEqual(await store.list(`records/open/${UID}/`), [recordKey('open', UID, 0), recordKey('open', UID, 1), recordKey('open', UID, 9)]);
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
    ['a long string', { seq: 0, record: egg(UID, { appVersion: 'x'.repeat(MAX_STRING + 1) }) }, 413],
  ];
  for (const [why, body, status] of refused) {
    assert.equal((await send(store, post('/api/eggs', body))).status, status, why);
  }
  // Not JSON by its type: a page elsewhere could post that through its
  // visitors' browsers without asking.
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', '']) {
    const plain = post('/api/eggs', { seq: 0, record: egg() }, { 'content-type': type });
    assert.equal((await send(store, plain)).status, 415, type);
  }
  assert.equal((await send(store, post('/api/eggs', { seq: 0, record: egg() }, {
    'content-type': 'Application/JSON; charset=utf-8',
  }))).status, 201, 'a parameter and capitals are fine');
  store.blobs.clear();
  // No declared length: read only to the cap.
  const stream = new ReadableStream<Uint8Array>({
    pull(c) { c.enqueue(new Uint8Array(4096).fill(0x20)); },
  });
  const endless = new Request(SITE + '/api/eggs', {
    method: 'POST', body: stream, headers: { 'content-type': 'application/json' }, duplex: 'half',
  } as RequestInit);
  assert.equal((await send(store, endless)).status, 413);
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

test('4. an iPhone from TestFlight or the App Store attests once, and its eggs go to the attested tier', async () => {
  const store = new MemoryStore();
  const P = SYNTH.production;
  const attest = { uid: P.uid, keyId: P.keyId, attestation: P.attestation };
  assert.deepEqual(await send(store, post('/api/attest', attest)), { status: 201, body: { environment: 'production' } });
  assert.equal((await send(store, post('/api/attest', attest))).status, 200, 'the same key again is a retry');
  const wrongId = { ...attest, uid: UID };
  assert.equal((await send(store, post('/api/attest', wrongId))).status, 400, 'bound to the id it was made for');
  assert.equal((await send(store, post('/api/attest', { ...attest, keyId: 'AAAA' }))).status, 400, 'not this key');
  assert.equal((await send(store, post('/api/attest', { uid: P.uid }))).status, 400);
  // One key per id: an id already holding another key refuses a second.
  const kept = store.blobs.get(keyKey(P.uid)) ?? '';
  store.blobs.set(keyKey(P.uid), JSON.stringify({ ...JSON.parse(kept), keyId: 'another' }));
  assert.equal((await send(store, post('/api/attest', attest))).status, 409);
  store.blobs.set(keyKey(P.uid), kept);

  // An egg, signed: attested, and the counter moves on.
  const body = JSON.stringify({ seq: 0, record: egg(P.uid) });
  const signed = (b: string, counter: number) => post('/api/eggs', b, {
    'x-egg-assertion': Buffer.from(makeAssertion(P.leafPrivateKey, new TextEncoder().encode(b), counter)).toString('base64'),
  });
  assert.deepEqual(await send(store, signed(body, 1)), { status: 201, body: { tier: 'attested', stored: true } });
  assert.equal(JSON.parse(store.blobs.get(keyKey(P.uid)) ?? 'null').counter, 1);
  // The same request again: the counter has not gone up, so it reads as open,
  // and the attested copy stands - no second copy is written.
  assert.deepEqual(await send(store, signed(body, 1)), { status: 200, body: { tier: 'attested', stored: false } });
  assert.equal(store.blobs.has(recordKey('open', P.uid, 0)), false);

  // Unsigned, or signed over another body: the open tier.
  const unsigned = JSON.stringify({ seq: 1, record: egg(P.uid) });
  assert.equal((await send(store, post('/api/eggs', unsigned))).body['tier'], 'open');
  const forged = post('/api/eggs', JSON.stringify({ seq: 2, record: egg(P.uid) }), {
    'x-egg-assertion': Buffer.from(makeAssertion(P.leafPrivateKey, new TextEncoder().encode(body), 5)).toString('base64'),
  });
  assert.equal((await send(store, forged)).body['tier'], 'open');
  // The other way: an egg kept as open - sent again once the phone has
  // attested, the first answer lost on the way back, or posted first by
  // anyone who knows the id - is replaced by the attested copy, so an open
  // copy cannot bury it. Still one copy.
  await store.set(recordKey('open', P.uid, 7), '{}', true);
  const later = JSON.stringify({ seq: 7, record: egg(P.uid) });
  assert.deepEqual(await send(store, signed(later, 6)), { status: 201, body: { tier: 'attested', stored: true } });
  assert.equal(store.blobs.has(recordKey('open', P.uid, 7)), false);
  assert.equal(store.blobs.has(recordKey('attested', P.uid, 7)), true);
  // An assertion for an id with no key: open.
  const nokey = JSON.stringify({ seq: 0, record: egg(UID) });
  assert.equal((await send(store, signed(nokey, 9))).body['tier'], 'open');
  assert.equal((await send(store, post('/api/eggs', nokey, { 'x-egg-assertion': '!!' }))).status, 200);
});

test('5. a development build attests, but its eggs go to the open tier, as if unsigned', async () => {
  const store = new MemoryStore();
  const attest = { uid: SYNTH.uid, keyId: SYNTH.keyId, attestation: SYNTH.attestation };
  // The key is verified and kept, so the path can be tried on the owner's phone.
  assert.deepEqual(await send(store, post('/api/attest', attest)), { status: 201, body: { environment: 'development' } });
  assert.equal(JSON.parse(store.blobs.get(keyKey(SYNTH.uid)) ?? 'null').environment, 'development');
  // A properly signed egg: open, and the key's counter is not moved.
  const body = JSON.stringify({ seq: 0, record: egg(SYNTH.uid) });
  const signed = post('/api/eggs', body, {
    'x-egg-assertion': Buffer.from(makeAssertion(SYNTH.leafPrivateKey, new TextEncoder().encode(body), 1)).toString('base64'),
  });
  assert.deepEqual(await send(store, signed), { status: 201, body: { tier: 'open', stored: true } });
  assert.equal(store.blobs.has(recordKey('attested', SYNTH.uid, 0)), false);
  assert.equal(JSON.parse(store.blobs.get(keyKey(SYNTH.uid)) ?? 'null').counter, 0);
  // Exactly as unsigned: the same egg without its assertion is the same copy.
  assert.deepEqual(await send(store, post('/api/eggs', body)), { status: 200, body: { tier: 'open', stored: false } });
  // DELETE takes the key with the results.
  await handle(new Request(SITE + '/api/eggs/' + SYNTH.uid, { method: 'DELETE' }), store);
  assert.equal(store.blobs.size, 0);
});

test('6. the tier a kept record counts in, for the fit: attested only under a key from production', () => {
  assert.equal(countedTier('attested', { environment: 'production' }), 'attested');
  assert.equal(countedTier('attested', { environment: 'development' }), 'open', 'filed before the rule, or by hand');
  assert.equal(countedTier('attested', null), 'open', 'no key left to vouch for it');
  assert.equal(countedTier('open', { environment: 'production' }), 'open', 'an unsigned egg stays open');
});

test('7. the yolk the cook got is kept, and capped like everything else', async () => {
  const store = new MemoryStore();
  const five = [0.0625, 0.25, 0.5, 0.125, 0.0625];
  const forecast = { cook_s: 412, yolk: [0.25, 0.5, 0.25], white: [0.125, 0.375, 0.5], yolkWord: five };
  const named = egg(UID, { yolkWord: 'runny', forecast: forecast });
  assert.equal((await send(store, post('/api/eggs', { seq: 0, record: named }))).status, 201);
  const kept = JSON.parse(store.blobs.get(recordKey('open', UID, 0)) ?? 'null') as Record<string, unknown>;
  assert.equal(kept['yolkWord'], 'runny');
  assert.equal('yolk' in kept, false);
  assert.deepEqual((kept['forecast'] as Record<string, unknown>)['yolkWord'], five);
  // The yolk skipped is kept as null.
  assert.equal((await send(store, post('/api/eggs', { seq: 1, record: egg(UID, { yolkWord: null }) }))).status, 201);
  assert.equal(JSON.parse(store.blobs.get(recordKey('open', UID, 1)) ?? 'null').yolkWord, null);
  // What no app writes is refused: a record without the yolk word, as an
  // app before the five words wrote it; a word nobody offers; a word as long
  // text; five probabilities that are not.
  const refused: [string, Partial<EggRecord> | Record<string, unknown>][] = [
    ['the old yolk answer, no yolk word', { yolk: 0, yolkWord: undefined }],
    ['a word nobody offers', { yolkWord: 'medium' }],
    ['a long word', { yolkWord: 'jammy'.repeat(20) }],
    ['four yolk words', { forecast: { ...forecast, yolkWord: [0.25, 0.25, 0.25, 0.25] } }],
  ];
  for (const [why, over] of refused) {
    const status = (await send(store, post('/api/eggs', { seq: 2, record: { ...egg(), ...over } }))).status;
    assert.equal(status, 400, why);
  }
  // The longest record the loader takes - every string at its cap, every
  // number at full precision, every answer and all eleven forecast numbers -
  // is well inside the record cap.
  const x = 'x'.repeat(MAX_STRING);
  const third = (a: number, b: number): number[] => [a, b, 1 - a - b];
  const words = [0.0123456789012345, 0.2123456789012345, 0.5123456789012345, 0.2506172839506173];
  words.push(1 - words.reduce((s, v) => s + v, 0));
  const longest = {
    ...egg(UID, { yolkWord: 'jammy' }), appVersion: x, prior: x, model: x, lang: x, register: x,
    level: 0.41234567890123456, recommended_s: 412.12345678901234, pulled_s: 419.12345678901234,
    cooled_s: 183.12345678901234, probe: { centre_C: 64.12, after_s: 183.12345678901234 },
    forecast: {
      cook_s: 412.12345678901234, yolk: third(0.1234567890123456, 0.7531234567890123),
      white: third(0.0123456789012345, 0.4876543210987655), yolkWord: words,
    },
  };
  assert.ok(JSON.stringify(longest).length < MAX_RECORD_BYTES * 0.75, `${JSON.stringify(longest).length} bytes`);
  assert.equal((await send(store, post('/api/eggs', { seq: 3, record: longest }))).status, 201);
});

test('8. the model a record names is its provenance: any is kept as sent, and the fit reads it back', async () => {
  // The store's likelihood id stays on the device and is never sent, so a
  // new one changes nothing here; a new MODEL_ID is a new name on new
  // records, and those already kept under the older names still read.
  const store = new MemoryStore();
  const models = ['2026-10-e6', '2026-10-e8', '2026-10-e9', MODEL_ID, 'a-later-model'];
  for (let seq = 0; seq < models.length; seq++) {
    const sent = egg(UID, { model: models[seq] });
    assert.equal((await send(store, post('/api/eggs', { seq: seq, record: sent }))).status, 201, models[seq]);
    const kept = JSON.parse(store.blobs.get(recordKey('open', UID, seq)) ?? 'null') as unknown;
    assert.equal(parseRecord(kept)?.model, models[seq], `${models[seq]}: the loader reads it`);
    assert.equal(readFitRecord(kept)?.model, models[seq], `${models[seq]}: the fit reads it`);
  }
});
