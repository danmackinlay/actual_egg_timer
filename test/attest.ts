/**
 * What the App Attest tests share: the synthetic attestations for this app
 * (test/data/appAttestSynthetic.json, made by tools/attestTestData.ts), and
 * an assertion made the way a phone makes one, with its throwaway key.
 */

import { readFileSync } from 'node:fs';
import { createHash, createSign } from 'node:crypto';
import { APP_ID } from '../server/appAttest.js';
import { encode } from '../server/cbor.js';

/** One phone's attestation, and the key it attests, to sign with. */
export interface SyntheticKey {
  uid: string;
  keyId: string;
  attestation: string;
  leafPrivateKey: string;
}

/** The development attestation at the top level (a build from Xcode), and
 *  a production one beside it (TestFlight and the App Store), under the same
 *  made-up root. Only production counts as a genuine copy. */
export interface Synthetic extends SyntheticKey {
  appId: string;
  root: string;
  production: SyntheticKey;
}

export const SYNTH = JSON.parse(readFileSync('test/data/appAttestSynthetic.json', 'utf8')) as Synthetic;

export function b64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64'));
}

export function sha256(...parts: Uint8Array[]): Uint8Array {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return new Uint8Array(h.digest());
}

/** An assertion as a phone makes one: authenticator data (the App ID's hash,
 *  flags, the counter), signed with the attested key over
 *  SHA256(authenticatorData || SHA256(clientData)). */
export function makeAssertion(
  privateKeyPem: string, clientData: Uint8Array, counter: number, appId = APP_ID,
): Uint8Array {
  const c = Buffer.alloc(4);
  c.writeUInt32BE(counter);
  const authenticatorData = new Uint8Array(
    Buffer.concat([sha256(new TextEncoder().encode(appId)), Buffer.from([0]), c]),
  );
  const signature = createSign('sha256').update(sha256(authenticatorData, sha256(clientData))).sign(privateKeyPem);
  return encode(new Map<string, Uint8Array>([
    ['signature', new Uint8Array(signature)], ['authenticatorData', authenticatorData],
  ]));
}
