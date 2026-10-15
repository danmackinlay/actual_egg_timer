/**
 * App Attest on the server (server/appAttest.ts).
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

import { encode } from 'cborg';

import {
  APP_ID, AttestError, CborError, countsAsGenuine, decodeCbor, decodeCborFirst, verifyAssertion, verifyAttestation,
} from '../server/appAttest.ts';
import { SYNTH, b64, makeAssertion, sha256 } from './attest.ts';

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
  // Its twin from production verifies the same way, and says so.
  const p = SYNTH.production;
  const kp = verifyAttestation({
    attestation: b64(p.attestation), keyId: b64(p.keyId), root: SYNTH.root,
    clientDataHash: sha256(new TextEncoder().encode(p.uid)),
  });
  assert.equal(kp.environment, 'production');
});

test('3b. only a key from production vouches for a genuine copy of the app', () => {
  assert.equal(countsAsGenuine('production'), true, 'TestFlight and the App Store');
  assert.equal(countsAsGenuine('development'), false, 'a build installed from Xcode');
  assert.equal(countsAsGenuine(''), false);
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
  assert.deepEqual(decodeCbor(encode(value)), value);
  const two = new Uint8Array([...encode(1), ...encode('two')]);
  assert.deepEqual(decodeCborFirst(two), { value: 1, end: 1 });
  assert.deepEqual(decodeCborFirst(two, 1), { value: 'two', end: 5 });
  assert.throws(() => decodeCbor(two), CborError, 'bytes after the item');
  assert.throws(() => decodeCbor(new Uint8Array([0x45, 1, 2])), CborError, 'truncated');
});

test('5b. CBOR: everything Apple never writes is refused', () => {
  const nest = (n: number): number[] => [...Array<number>(n).fill(0x81), 0x00];
  const refused: [string, number[]][] = [
    ['an indefinite byte string', [0x5f, 0x41, 0x00, 0xff]],
    ['an indefinite text string', [0x7f, 0x61, 0x61, 0xff]],
    ['an indefinite array', [0x9f, 0x00, 0xff]],
    ['an indefinite map', [0xbf, 0x01, 0x00, 0xff]],
    ['a lone break', [0xff]],
    ['a reserved length (28)', [0x1c]],
    ['a reserved length (29)', [0x5d]],
    ['a reserved length (30)', [0x9e]],
    ['a reserved simple value (28)', [0xfc]],
    ['simple value 0', [0xe0]],
    ['simple value 19', [0xf3]],
    ['a one-byte simple value', [0xf8, 0x20]],
    ['a half float', [0xf9, 0x3c, 0x00]],
    ['a map key of bytes', [0xa1, 0x41, 0x00, 0x00]],
    ['a map key that is an array', [0xa1, 0x80, 0x00]],
    ['a map key that is a map', [0xa1, 0xa0, 0x00]],
    ['a map key that is an array, after a good pair', [0xa2, 0x01, 0x00, 0x81, 0x00, 0x00]],
    ['a repeated number key', [0xa2, 0x01, 0x01, 0x01, 0x02]],
    ['a repeated text key', [0xa2, 0x61, 0x61, 0x00, 0x61, 0x61, 0x00]],
    ['a repeated negative key', [0xa2, 0x20, 0x00, 0x20, 0x01]],
    ['nesting 17 deep', nest(17)],
    ['nesting 17 deep in maps', [...Array<number>(17).fill(0).flatMap(() => [0xa1, 0x00]), 0x00]],
    ['nesting far too deep', nest(100_000)],
    ['text that is not UTF-8', [0x62, 0xc3, 0x28]],
    ['a lone surrogate in text', [0x63, 0xed, 0xa0, 0x80]],
    ['a byte string longer than 2^53', [0x5b, 0x00, 0x20, 0, 0, 0, 0, 0, 0x01]],
    ['a text string longer than 2^53', [0x7b, 0x00, 0x20, 0, 0, 0, 0, 0, 0x01]],
    ['an array longer than 2^53', [0x9b, 0x00, 0x20, 0, 0, 0, 0, 0, 0x01]],
    ['a map longer than 2^53', [0xbb, 0x00, 0x20, 0, 0, 0, 0, 0, 0x01]],
    ['a tag, small', [0xc1, 0x00]],
    ['a tag, one byte (24, encoded CBOR)', [0xd8, 0x18, 0x41, 0x00]],
    ['a tag, two bytes', [0xd9, 0x01, 0x03, 0xa0]],
    ['a tag inside a map', [0xa1, 0x01, 0xc2, 0x41, 0x01]],
  ];
  for (const [what, bytes] of refused) {
    assert.throws(() => decodeCbor(Uint8Array.from(bytes)), CborError, what);
    assert.throws(() => decodeCborFirst(Uint8Array.from([0x00, ...bytes]), 1), CborError, `${what}, read from an offset`);
  }
  // What is allowed at each edge.
  assert.deepEqual(decodeCbor(Uint8Array.from(nest(16))), [[[[[[[[[[[[[[[[0]]]]]]]]]]]]]]]]);
  assert.deepEqual(decodeCbor(Uint8Array.from([0x84, 0xf4, 0xf5, 0xf6, 0xf7])), [false, true, null, undefined]);
  assert.equal(decodeCbor(Uint8Array.from([0xfa, 0x3f, 0x80, 0, 0])), 1, 'a float32');
  assert.equal(decodeCbor(Uint8Array.from([0xfb, 0x3f, 0xf0, 0, 0, 0, 0, 0, 0])), 1, 'a float64');
  assert.equal(decodeCbor(Uint8Array.from([0x1b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])), 2n ** 64n - 1n);
  assert.equal(decodeCbor(Uint8Array.from([0x62, 0xc3, 0xa9])), 'é');
  assert.equal(decodeCbor(Uint8Array.from([0x60])), '');
  const cose = decodeCbor(Uint8Array.from([0xa3, 0x01, 0x02, 0x20, 0x41, 0x07, 0x61, 0x6b, 0x40]));
  assert.deepEqual(cose, new Map<number | string, unknown>([[1, 2], [-1, Uint8Array.of(7)], ['k', new Uint8Array()]]));
});
