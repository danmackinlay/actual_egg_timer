/**
 * The collection endpoint (E6; INFERENCE.md section 7, COLLECTIVE.md
 * section 1): eggs from cooks who turned sharing on, kept as append-only
 * blobs, and deleted by the cook's id.
 *
 *   POST   /api/eggs        { "seq": n, "record": {...} }   one egg
 *   DELETE /api/eggs/<uid>                                  everything sent
 *   POST   /api/attest      { "uid", "keyId", "attestation" }  an iPhone's key
 *
 * An egg is kept at `records/<tier>/<uid>/<seq>.json`, written only if that
 * key is new: a retry is harmless, one egg is one copy, and nothing is ever
 * overwritten. An open copy is not written where an attested one is, and an
 * attested copy replaces an open one, which anyone who knows the id could
 * have posted. The tier is
 * `attested` when the egg came with an App Attest assertion that verifies
 * against the key attested for its id in Apple's production environment, and
 * `open` otherwise - the web app, any iPhone that cannot attest, and a
 * development build, whose key is kept but vouches for nothing
 * (`appAttest.ts`, DECISIONS.md 68).
 *
 * The record must pass `parseRecord`, the loader both apps use, so the
 * server refuses exactly what a phone would; what is kept is what it
 * returns, with exactly the known fields. Nothing about the sender is
 * written or logged: no address, no agent, no time.
 *
 * Pure apart from the store it is handed, so `test/server.test.ts` drives it
 * against a map. `netlify/functions/eggs.mts` hands it Netlify Blobs.
 */

import { createHash } from 'node:crypto';
import { parseRecord } from '../src/core/record.js';
import { AttestError, countsAsGenuine, verifyAssertion, verifyAttestation } from './appAttest.js';

/** The store, as much of it as this needs. */
export interface Store {
  get(key: string): Promise<string | null>;
  /** With `onlyIfNew`, write only when the key does not exist, and say
   *  whether it wrote. */
  set(key: string, value: string, onlyIfNew: boolean): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

export interface Options {
  /** The App ID assertions and attestations must name; the app's own unless
   *  a test says otherwise. */
  appId?: string;
  /** For App Attest's certificate dates; now, unless a test says otherwise. */
  now?: () => Date;
  /** Apple's root, unless a test says otherwise. */
  root?: string;
}

export type Tier = 'attested' | 'open';

/** The largest body taken: a record is about 1.5 KB, an attestation about
 *  6 KB of base64. */
export const MAX_BODY_BYTES = 16384;

/** The largest record kept, as JSON: a record is about 750 bytes, with every
 *  answer and a forecast, the five yolk words' included (DECISIONS.md 92), and
 *  about 1.4 KB with every string at MAX_STRING and every number at full
 *  precision. A cap, so that free ids cannot fill the store with long strings
 *  in the fields the loader takes as any text. The yolk word itself is one of
 *  five, so the loader caps it. */
export const MAX_RECORD_BYTES = 2048;

/** The longest string anywhere in a record: an app version, a population or
 *  model name, a language tag are all far shorter. */
export const MAX_STRING = 64;

/** Eggs one id may send: an egg a day for over a decade. A cap, so that one
 *  id cannot fill the store; `seq` is checked against it. */
export const MAX_SEQ = 5000;

/** The header an iPhone's assertion comes in, base64. */
export const ASSERTION_HEADER = 'x-egg-assertion';

/** A cook's id: a version 4 UUID, in lower case, as both apps make it. */
const UID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUid(v: unknown): v is string {
  return typeof v === 'string' && UID.test(v);
}

/** Where an egg is kept: the sequence number zero-padded, so a listing sorts
 *  in the order the cook sent them. */
export function recordKey(tier: Tier, uid: string, seq: number): string {
  return `records/${tier}/${uid}/${String(seq).padStart(6, '0')}.json`;
}

export function keyKey(uid: string): string {
  return `keys/${uid}.json`;
}

/** What is kept for an attested key. */
interface StoredKey {
  keyId: string;
  publicKey: string;
  counter: number;
  environment: string;
  category: number | null;
  bundleVersion: string | null;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function refuse(status: number, why: string): Response {
  return json(status, { error: why });
}

/** The body, if it is not too big: by its declared length first, so a large
 *  one is refused before it is read, and then as it is read, so one that
 *  lied, or declared nothing, is stopped at the cap rather than read whole. */
async function bodyOf(req: Request): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return null;
  if (req.body === null) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    body.set(c, at);
    at += c.length;
  }
  return body;
}

/** Whether the body says it is JSON. Both apps say so; a page elsewhere can
 *  make a visitor's browser post `text/plain` without asking first, and that
 *  is refused (415), so no other site can post through its visitors. */
function saysJson(req: Request): boolean {
  const type = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  return type === 'application/json';
}

/** Whether every string in a value is at most `MAX_STRING` long. */
function shortStrings(v: unknown): boolean {
  if (typeof v === 'string') return v.length <= MAX_STRING;
  if (Array.isArray(v)) return v.every(shortStrings);
  if (v !== null && typeof v === 'object') return Object.values(v).every(shortStrings);
  return true;
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
}

function base64(v: unknown): Uint8Array | null {
  if (typeof v !== 'string' || v.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(v)) return null;
  return new Uint8Array(Buffer.from(v, 'base64'));
}

/* ------------------------------------------------------------------ eggs */

/**
 * The tier a kept record counts in, given the key kept for its id: attested
 * only if it was kept as attested and its key is from production
 * (`countsAsGenuine`, DECISIONS.md 68). The server files by the same rule;
 * the fit's pull reads every record through this, so that a record filed
 * before the rule, or by hand, cannot count for more than it should.
 */
export function countedTier(kept: Tier, key: { environment: string } | null): Tier {
  return kept === 'attested' && key !== null && countsAsGenuine(key.environment) ? 'attested' : 'open';
}

/** Which tier an egg belongs in: attested if its assertion verifies against
 *  the key kept for its id and that key is from production, and the counter
 *  is then moved on. A development key's results are open, exactly as if
 *  unsigned (DECISIONS.md 68): its assertion is not even read. */
async function tierOf(store: Store, uid: string, body: Uint8Array, req: Request, opts: Options): Promise<Tier> {
  const assertion = base64(req.headers.get(ASSERTION_HEADER));
  if (assertion === null) return 'open';
  const raw = await store.get(keyKey(uid));
  if (raw === null) return 'open';
  const key = JSON.parse(raw) as StoredKey;
  if (countedTier('attested', key) !== 'attested') return 'open';
  try {
    const counter = verifyAssertion({
      assertion: assertion, clientData: body, publicKey: key.publicKey, counter: key.counter,
      ...(opts.appId === undefined ? {} : { appId: opts.appId }),
    });
    await store.set(keyKey(uid), JSON.stringify({ ...key, counter: counter }), false);
    return 'attested';
  } catch (error) {
    if (error instanceof AttestError) return 'open';
    throw error;
  }
}

async function postEgg(req: Request, store: Store, opts: Options): Promise<Response> {
  if (!saysJson(req)) return refuse(415, 'application/json');
  const body = await bodyOf(req);
  if (body === null) return refuse(413, 'too big');
  const parsed = parseJson(body);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return refuse(400, 'not a JSON object');
  const o = parsed as Record<string, unknown>;
  const seq = o['seq'];
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0 || seq >= MAX_SEQ) {
    return refuse(400, 'seq');
  }
  const record = parseRecord(o['record']);
  if (record === null) return refuse(400, 'not a record');
  if (!isUid(record.uid)) return refuse(400, 'uid');
  if (JSON.stringify(record).length > MAX_RECORD_BYTES || !shortStrings(record)) return refuse(413, 'record too big');
  const tier = await tierOf(store, record.uid, body, req, opts);
  // One copy of an egg, and an attested copy wins. A retry can land in the
  // other tier: as open when its assertion no longer counts up, and then the
  // attested copy stands; or as attested when the phone's attestation went
  // through only after the first try was kept, with the answer lost on the
  // way back. Then, and whenever an open copy is there first - anyone who
  // knows a cook's id can post open copies under it - the attested copy is
  // written and the open one deleted, so an open copy can never bury an
  // attested one.
  if (tier === 'open') {
    if (await store.get(recordKey('attested', record.uid, seq)) !== null) {
      return json(200, { tier: 'attested', stored: false });
    }
    const stored = await store.set(recordKey('open', record.uid, seq), JSON.stringify(record), true);
    return json(stored ? 201 : 200, { tier: 'open', stored: stored });
  }
  const stored = await store.set(recordKey('attested', record.uid, seq), JSON.stringify(record), true);
  await store.delete(recordKey('open', record.uid, seq));
  return json(stored ? 201 : 200, { tier: 'attested', stored: stored });
}

async function deleteEggs(uid: string, store: Store): Promise<Response> {
  if (!isUid(uid)) return refuse(400, 'uid');
  let deleted = 0;
  for (const tier of ['attested', 'open'] as const) {
    for (const key of await store.list(`records/${tier}/${uid}/`)) {
      await store.delete(key);
      deleted += 1;
    }
  }
  await store.delete(keyKey(uid));
  return json(200, { deleted: deleted });
}

/* ---------------------------------------------------------------- attest */

async function postAttest(req: Request, store: Store, opts: Options): Promise<Response> {
  if (!saysJson(req)) return refuse(415, 'application/json');
  const body = await bodyOf(req);
  if (body === null) return refuse(413, 'too big');
  const parsed = parseJson(body);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return refuse(400, 'not a JSON object');
  const o = parsed as Record<string, unknown>;
  const uid = o['uid'];
  const keyId = base64(o['keyId']);
  const attestation = base64(o['attestation']);
  if (!isUid(uid) || keyId === null || attestation === null) return refuse(400, 'uid, keyId, attestation');
  let key: StoredKey;
  try {
    const k = verifyAttestation({
      attestation: attestation,
      keyId: keyId,
      clientDataHash: new Uint8Array(createHash('sha256').update(uid, 'utf8').digest()),
      ...(opts.appId === undefined ? {} : { appId: opts.appId }),
      ...(opts.now === undefined ? {} : { now: opts.now() }),
      ...(opts.root === undefined ? {} : { root: opts.root }),
    });
    key = {
      keyId: o['keyId'] as string, publicKey: k.publicKey, counter: 0,
      environment: k.environment, category: k.category, bundleVersion: k.bundleVersion,
    };
  } catch (error) {
    // Which check failed is not said: the library's own words (OpenSSL's,
    // say) are no business of the caller's.
    if (error instanceof AttestError) return refuse(400, 'attestation refused');
    throw error;
  }
  if (await store.set(keyKey(uid), JSON.stringify(key), true)) return json(201, { environment: key.environment });
  // One key per id. The same key again is a retry; another is refused.
  const kept = await store.get(keyKey(uid));
  if (kept !== null && (JSON.parse(kept) as StoredKey).keyId === key.keyId) {
    return json(200, { environment: key.environment });
  }
  return refuse(409, 'this id has another key');
}

/* --------------------------------------------------------------- routing */

/** The function: every route, by path and method. */
export async function handle(req: Request, store: Store, opts: Options = {}): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  if (path === '/api/eggs') {
    return req.method === 'POST' ? postEgg(req, store, opts) : refuse(405, 'POST');
  }
  if (path.startsWith('/api/eggs/')) {
    if (req.method !== 'DELETE') return refuse(405, 'DELETE');
    return deleteEggs(path.slice('/api/eggs/'.length), store);
  }
  if (path === '/api/attest') {
    return req.method === 'POST' ? postAttest(req, store, opts) : refuse(405, 'POST');
  }
  return refuse(404, 'no such route');
}
