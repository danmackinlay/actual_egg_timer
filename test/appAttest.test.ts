/**
 * App Attest on the server (server/appAttest.ts, DECISIONS.md 55).
 *
 * Two attestations: Apple's own sample, from its "Attestation Object
 * Validation Guide", which chains to Apple's real root; and a synthetic one
 * for this app, under a made-up root (tools/attestTestData.ts), whose private
 * key the test holds and so can sign assertions with, as a phone does.
 *
 * Apple's guide has two slips its own sample contradicts, and the sample is
 * what a phone sends: step 5's "expected public key hash" is not the hash of
 * the key in credCert (the key id is, as the step says it should be), and
 * the bundle version in the sample's extensions is "1", not "1.0".
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';

import {
  APP_ID, AttestError, verifyAssertion, verifyAttestation,
} from '../server/appAttest.js';
import { CborError, decode, decodeFirst, encode } from '../server/cbor.js';
import { SYNTH, b64, makeAssertion, sha256 } from './attest.js';

interface Sample {
  appId: string;
  challenge: string;
  keyId: string;
  attestation: string;
  nonce: string;
  validAt: string;
}
const SAMPLE = JSON.parse(readFileSync('test/data/appAttestSample.json', 'utf8')) as Sample;

function sample(over: Partial<Parameters<typeof verifyAttestation>[0]> = {}) {
  return verifyAttestation({
    attestation: b64(SAMPLE.attestation),
    keyId: b64(SAMPLE.keyId),
    clientDataHash: new TextEncoder().encode(SAMPLE.challenge),
    appId: SAMPLE.appId,
    now: new Date(SAMPLE.validAt),
    ...over,
  });
}

function throwsAt(step: string, f: () => unknown): void {
  assert.throws(f, (e: unknown) => e instanceof AttestError && e.message.startsWith(step), step);
}

test('1. Apple\'s sample attestation verifies against Apple\'s root, step by step', () => {
  const k = sample();
  assert.equal(k.environment, 'production');
  assert.equal(k.category, 1, 'apple_validation_category_01');
  assert.equal(k.bundleVersion, '1', 'apple_bundle_version_01, as the sample has it');
  // Step 5: the key id is SHA256 of credCert's key as an uncompressed point.
  const der = Buffer.from(k.publicKey, 'base64');
  assert.deepEqual(sha256(der.subarray(der.length - 65)), b64(SAMPLE.keyId));
});

test('2. each of Apple\'s steps refuses what it should', () => {
  throwsAt('1:', () => sample({ now: new Date('2026-10-02T00:00:00Z') }));
  throwsAt('1:', () => sample({ root: SYNTH.root }));
  throwsAt('4:', () => sample({ clientDataHash: new TextEncoder().encode('another challenge') }));
  const otherKey = b64(SAMPLE.keyId);
  otherKey[0] ^= 1;
  throwsAt('5:', () => sample({ keyId: otherKey }));
  throwsAt('6:', () => sample({ appId: APP_ID }));
  throwsAt('unreadable', () => sample({ attestation: new Uint8Array([0xa1, 0x63]) }));
  // Valid CBOR, by chance - a fourteen-byte string - but not an attestation.
  throwsAt('the attestation is not a map', () => sample({ attestation: new TextEncoder().encode('not cbor at all') }));
});

test('3. the synthetic attestation is this app\'s, bound to the cook\'s id', () => {
  const clientDataHash = sha256(new TextEncoder().encode(SYNTH.uid));
  const k = verifyAttestation({
    attestation: b64(SYNTH.attestation), keyId: b64(SYNTH.keyId), clientDataHash: clientDataHash, root: SYNTH.root,
  });
  assert.equal(k.environment, 'development');
  assert.equal(k.category, null, 'no extensions: an older phone writes none');
  // Bound to the id: the same attestation under another id is refused.
  throwsAt('4:', () => verifyAttestation({
    attestation: b64(SYNTH.attestation), keyId: b64(SYNTH.keyId), root: SYNTH.root,
    clientDataHash: sha256(new TextEncoder().encode('6f1c2a9e-2b1d-4c1e-9d6b-1a2b3c4d5e6f')),
  }));
  // And not under Apple's root.
  throwsAt('1:', () => verifyAttestation({
    attestation: b64(SYNTH.attestation), keyId: b64(SYNTH.keyId), clientDataHash: clientDataHash,
  }));
});

function attestedKey(): string {
  return verifyAttestation({
    attestation: b64(SYNTH.attestation), keyId: b64(SYNTH.keyId), root: SYNTH.root,
    clientDataHash: sha256(new TextEncoder().encode(SYNTH.uid)),
  }).publicKey;
}

test('4. an assertion verifies, and only for its body, its app and a counter that went up', () => {
  const key = attestedKey();
  const body = new TextEncoder().encode('{"seq":0}');
  const a = makeAssertion(SYNTH.leafPrivateKey, body, 1);
  assert.equal(verifyAssertion({ assertion: a, clientData: body, publicKey: key, counter: 0 }), 1);
  throwsAt('3:', () => verifyAssertion({
    assertion: a, clientData: new TextEncoder().encode('{"seq":1}'), publicKey: key, counter: 0,
  }));
  throwsAt('5:', () => verifyAssertion({ assertion: a, clientData: body, publicKey: key, counter: 1 }));
  const other = makeAssertion(SYNTH.leafPrivateKey, body, 2, '1234567890.com.example.myapp');
  throwsAt('4:', () => verifyAssertion({ assertion: other, clientData: body, publicKey: key, counter: 0 }));
  // Signed by a key that was never attested.
  const stranger = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'pem', type: 'pkcs8' });
  throwsAt('3:', () => verifyAssertion({
    assertion: makeAssertion(stranger as string, body, 3), clientData: body, publicKey: key, counter: 0,
  }));
  throwsAt('unreadable', () => verifyAssertion({
    assertion: new Uint8Array([1, 2, 3]), clientData: body, publicKey: key, counter: 0,
  }));
});

test('5. CBOR: what is encoded decodes, and what is broken is refused', () => {
  const value = new Map<string | number, unknown>([
    ['a', 1], [-7, new Uint8Array([1, 2, 3])], ['list', [0, 23, 24, 255, 256, 65535, 65536, -1, -25, 'x']],
    ['t', true], ['f', false], ['n', null],
  ]);
  assert.deepEqual(decode(encode(value as never)), value);
  const two = new Uint8Array([...encode(1), ...encode('two')]);
  assert.deepEqual(decodeFirst(two), { value: 1, end: 1 });
  assert.throws(() => decode(two), CborError, 'bytes after the item');
  assert.throws(() => decode(new Uint8Array([0x5f])), CborError, 'indefinite length');
  assert.throws(() => decode(new Uint8Array([0x45, 1, 2])), CborError, 'truncated');
  assert.throws(() => decode(new Uint8Array([0xa2, 0x01, 0x01, 0x01, 0x02])), CborError, 'a repeated key');
});
