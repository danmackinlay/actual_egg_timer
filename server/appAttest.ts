/**
 * App Attest (DECISIONS.md 60): telling an egg sent by a genuine copy of the
 * iPhone app from one sent by anything else.
 *
 * Two objects come from the phone. The ATTESTATION, once, when the cook turns
 * sharing on: a key made in the phone's Secure Enclave, and Apple's
 * certificate that the key belongs to this app on a real device. The
 * ASSERTION, with every egg: that key's signature over the body sent. The
 * server keeps the key and the count of signatures it has seen; an egg whose
 * assertion checks out goes to the attested tier, and everything else to the
 * open tier (COLLECTIVE.md section 1). Nothing here is fatal to an egg.
 *
 * The checks are Apple's, in Apple's order ("Validating apps that connect to
 * your server"), and `test/appAttest.test.ts` runs them against the sample
 * attestation in Apple's "Attestation Object Validation Guide".
 *
 * The challenge is the cook's id. Apple asks for a one-time challenge from the
 * server so that an attestation cannot be replayed; here the phone attests
 * with `clientDataHash = SHA256(uid)` instead, which binds the attestation to
 * the id it is registered under, and nothing can make assertions for the key
 * without the phone it lives on. An egg timer does not warrant a round trip
 * more (COLLECTIVE.md section 3).
 *
 * Node's crypto only: no X.509 or CBOR library. `cbor.ts` reads the objects,
 * and the few lines of DER below find the nonce in the certificate.
 */

import { X509Certificate, createHash, createPublicKey, createVerify, KeyObject } from 'node:crypto';
import { Cbor, decode, decodeFirst } from './cbor.js';

/** Apple App Attestation Root CA, from
 *  https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem
 *  (SHA-256 fingerprint 1C:B9:82:3B:...:62:42:C9:32). Valid to 2045. */
export const APPLE_APP_ATTEST_ROOT = `-----BEGIN CERTIFICATE-----
MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw
JAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwK
QXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNa
Fw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlv
biBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9y
bmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdh
NbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9au
Yen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/
MB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYw
CgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn
53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijV
oyFraWVIyd/dganmrduC1bmTBGwD
-----END CERTIFICATE-----
`;

/** The app's App ID: the team (ios/project.yml's DEVELOPMENT_TEAM), a
 *  period, and the bundle identifier. */
export const APP_ID = 'L4D3TWC3A4.name.danmackinlay.actualeggtimer';

/** Which App Attest service made the key: the sandbox for a development
 *  build, production for TestFlight and the App Store. */
export type AttestEnvironment = 'development' | 'production';

/**
 * Whether a key from this environment vouches for a genuine copy of the app
 * (DECISIONS.md 68). Only production: TestFlight and the App Store always
 * attest there. A development key is a build installed from Xcode, the
 * owner's own phones, whose results do not count as a genuine copy's; it is
 * still verified and kept, so the path can be tried on a phone, but its
 * results go to the open tier exactly as if they were unsigned. The server
 * (`eggs.ts`) and the fit's pull (`tools/eggs.ts`) both ask this.
 */
export function countsAsGenuine(environment: string): boolean {
  return environment === 'production';
}

export class AttestError extends Error {}

function sha256(...parts: Uint8Array[]): Uint8Array {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return new Uint8Array(h.digest());
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function bytesOf(v: Cbor | undefined, what: string): Uint8Array {
  if (!(v instanceof Uint8Array)) throw new AttestError(`${what} is not bytes`);
  return v;
}

function mapOf(v: Cbor, what: string): Map<Cbor, Cbor> {
  if (!(v instanceof Map)) throw new AttestError(`${what} is not a map`);
  return v;
}

/* --------------------------------------------------------- authenticator */

const AAGUID_DEVELOPMENT = new TextEncoder().encode('appattestdevelop');
const AAGUID_PRODUCTION = Uint8Array.from([...new TextEncoder().encode('appattest'), 0, 0, 0, 0, 0, 0, 0]);

/** Flags: attested credential data follows (AT), extensions follow (ED). */
const FLAG_AT = 0x40;
const FLAG_ED = 0x80;

interface AuthData {
  rpIdHash: Uint8Array;
  counter: number;
  aaguid: Uint8Array | null;
  credentialId: Uint8Array | null;
  extensions: Map<Cbor, Cbor> | null;
}

/** WebAuthn authenticator data: the RP ID's hash, flags and counter, then -
 *  in an attestation - the attested credential and any extensions. */
function readAuthData(a: Uint8Array): AuthData {
  if (a.length < 37) throw new AttestError('authenticator data too short');
  const view = new DataView(a.buffer, a.byteOffset, a.byteLength);
  const flags = a[32];
  const out: AuthData = {
    rpIdHash: a.slice(0, 32), counter: view.getUint32(33), aaguid: null, credentialId: null, extensions: null,
  };
  let p = 37;
  if (flags & FLAG_AT) {
    if (a.length < p + 18) throw new AttestError('attested credential data too short');
    out.aaguid = a.slice(p, p + 16);
    const idLength = view.getUint16(p + 16);
    p += 18;
    if (a.length < p + idLength) throw new AttestError('credential id too short');
    out.credentialId = a.slice(p, p + idLength);
    p += idLength;
    p = decodeFirst(a, p).end; // the COSE key, which credCert carries too
  }
  // Apple's own sample carries its extensions without setting ED, so a map
  // after the credential is read whether the flag says so or not.
  if ((flags & FLAG_ED) || p < a.length) {
    const ext = decodeFirst(a, p);
    out.extensions = mapOf(ext.value, 'the extensions');
    p = ext.end;
  }
  if (p !== a.length) throw new AttestError('bytes after the authenticator data');
  return out;
}

/* -------------------------------------------------------------------- DER */

interface Tlv {
  tag: number;
  start: number;
  end: number;
  next: number;
}

/** One DER element at `at`: its tag, where its contents start and end. */
function tlv(b: Uint8Array, at: number): Tlv {
  if (at + 2 > b.length) throw new AttestError('DER truncated');
  const tag = b[at];
  let len = b[at + 1];
  let start = at + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4 || start + n > b.length) throw new AttestError('DER length');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[start + i];
    start += n;
  }
  if (start + len > b.length) throw new AttestError('DER past the end');
  return { tag: tag, start: start, end: start + len, next: start + len };
}

function children(b: Uint8Array, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  for (let p = parent.start; p < parent.end;) {
    const t = tlv(b, p);
    out.push(t);
    p = t.next;
  }
  return out;
}

/** OID 1.2.840.113635.100.8.2, as DER contents: Apple's nonce extension. */
const NONCE_OID = Uint8Array.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x08, 0x02]);

/** The value of the nonce extension in a certificate: a SEQUENCE holding
 *  [1] EXPLICIT OCTET STRING. */
function certNonce(der: Uint8Array): Uint8Array {
  const cert = tlv(der, 0);
  const tbs = children(der, cert)[0];
  if (tbs === undefined) throw new AttestError('no TBS certificate');
  for (const part of children(der, tbs)) {
    if (part.tag !== 0xa3) continue; // [3] extensions
    const list = children(der, part)[0];
    if (list === undefined) break;
    for (const ext of children(der, list)) {
      const fields = children(der, ext);
      const oid = fields[0];
      if (oid === undefined || oid.tag !== 0x06) continue;
      if (!same(der.subarray(oid.start, oid.end), NONCE_OID)) continue;
      const value = fields[fields.length - 1];
      if (value.tag !== 0x04) throw new AttestError('nonce extension is not an octet string');
      const seq = tlv(der, value.start);
      const tagged = children(der, seq)[0];
      if (seq.tag !== 0x30 || tagged === undefined || tagged.tag !== 0xa1) throw new AttestError('nonce shape');
      const octets = tlv(der, tagged.start);
      if (octets.tag !== 0x04) throw new AttestError('nonce is not an octet string');
      return der.slice(octets.start, octets.end);
    }
  }
  throw new AttestError('no nonce extension');
}

/* ----------------------------------------------------------- certificates */

function within(cert: X509Certificate, now: Date): boolean {
  const t = now.getTime();
  return new Date(cert.validFrom).getTime() <= t && t <= new Date(cert.validTo).getTime();
}

/** The key as X9.62 uncompressed point bytes: 0x04, x, y. */
function uncompressedPoint(key: KeyObject): Uint8Array {
  const jwk = key.export({ format: 'jwk' });
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || jwk.x === undefined || jwk.y === undefined) {
    throw new AttestError('credential key is not P-256');
  }
  return Uint8Array.from([4, ...Buffer.from(jwk.x, 'base64url'), ...Buffer.from(jwk.y, 'base64url')]);
}

/* ------------------------------------------------------------ attestation */

export interface AttestationInput {
  attestation: Uint8Array;
  /** The key identifier the phone sent: SHA256 of the key's public point. */
  keyId: Uint8Array;
  /** What the phone attested with: here SHA256 of the cook's id. */
  clientDataHash: Uint8Array;
  appId?: string;
  now?: Date;
  /** Apple's root, unless a test says otherwise. */
  root?: string;
}

export interface AttestedKey {
  /** The credential's public key, as SPKI DER, base64. */
  publicKey: string;
  environment: AttestEnvironment;
  /** `apple_validation_category_01`, where the phone's OS writes one: how the
   *  app was signed (2 TestFlight, 3 development, 4 App Store). */
  category: number | null;
  /** `apple_bundle_version_01`, where written: the app's build number. */
  bundleVersion: string | null;
}

/** Validation categories Apple says are never an app's (0 invalid; 7-9 the
 *  system's own binaries in restricted situations). */
const REFUSED_CATEGORIES = new Set([0, 7, 8, 9]);

/** Whatever went wrong reading what a phone sent - bad CBOR, a certificate
 *  Node cannot parse - is the phone's problem, and says so as an
 *  `AttestError`, never as a crash. */
function asAttestError<T>(step: () => T): T {
  try {
    return step();
  } catch (error) {
    if (error instanceof AttestError) throw error;
    throw new AttestError(`unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Apple's eleven steps, in order. Throws `AttestError` naming the step that
 * failed; returns the key to keep.
 */
export function verifyAttestation(input: AttestationInput): AttestedKey {
  return asAttestError(() => attestation(input));
}

function attestation(input: AttestationInput): AttestedKey {
  const now = input.now ?? new Date();
  const appId = input.appId ?? APP_ID;
  const top = mapOf(decode(input.attestation), 'the attestation');
  if (top.get('fmt') !== 'apple-appattest') throw new AttestError('not an App Attest attestation');
  const statement = mapOf(top.get('attStmt') ?? null, 'attStmt');
  const x5c = statement.get('x5c');
  if (!Array.isArray(x5c) || x5c.length < 2) throw new AttestError('x5c');
  const authData = bytesOf(top.get('authData'), 'authData');

  // 1. The chain: credCert, signed by the intermediate, signed by Apple's root.
  const credDer = bytesOf(x5c[0], 'credCert');
  const cred = new X509Certificate(credDer);
  const intermediate = new X509Certificate(bytesOf(x5c[1], 'the intermediate'));
  const root = new X509Certificate(input.root ?? APPLE_APP_ATTEST_ROOT);
  if (!intermediate.checkIssued(root) || !intermediate.verify(root.publicKey)) {
    throw new AttestError('1: the intermediate is not Apple\'s');
  }
  if (!cred.checkIssued(intermediate) || !cred.verify(intermediate.publicKey)) {
    throw new AttestError('1: credCert is not the intermediate\'s');
  }
  if (!within(cred, now) || !within(intermediate, now) || !within(root, now)) {
    throw new AttestError('1: a certificate is out of date');
  }

  // 2-4. The nonce: SHA256(authData || clientDataHash), in credCert.
  const nonce = sha256(authData, input.clientDataHash);
  if (!same(certNonce(credDer), nonce)) throw new AttestError('4: the nonce does not match');

  // 5. The key id is the hash of credCert's public key.
  const point = uncompressedPoint(cred.publicKey);
  if (!same(sha256(point), input.keyId)) throw new AttestError('5: the key id is not this key\'s');

  const a = readAuthData(authData);
  // 6. The RP ID is this app's.
  if (!same(a.rpIdHash, sha256(new TextEncoder().encode(appId)))) throw new AttestError('6: another app');
  // 7. A fresh key has signed nothing.
  if (a.counter !== 0) throw new AttestError('7: the counter is not zero');
  // 8. Development or production.
  let environment: AttestEnvironment;
  if (a.aaguid !== null && same(a.aaguid, AAGUID_PRODUCTION)) environment = 'production';
  else if (a.aaguid !== null && same(a.aaguid, AAGUID_DEVELOPMENT)) environment = 'development';
  else throw new AttestError('8: unknown aaguid');
  // 9. The credential is the key.
  if (a.credentialId === null || !same(a.credentialId, input.keyId)) throw new AttestError('9: credential id');

  // 10-11. How the app was signed, and its build, where the OS says.
  let category: number | null = null;
  let bundleVersion: string | null = null;
  if (a.extensions !== null) {
    const c = a.extensions.get('apple_validation_category_01');
    if (c !== undefined) {
      const b = bytesOf(c, 'the validation category');
      if (b.length !== 4) throw new AttestError('10: validation category');
      category = new DataView(b.buffer, b.byteOffset, 4).getUint32(0, true);
      if (REFUSED_CATEGORIES.has(category)) throw new AttestError(`10: validation category ${category}`);
    }
    const v = a.extensions.get('apple_bundle_version_01');
    if (v !== undefined) {
      if (typeof v !== 'string' || v === '') throw new AttestError('11: bundle version');
      bundleVersion = v;
    }
  }

  return {
    publicKey: Buffer.from(cred.publicKey.export({ format: 'der', type: 'spki' })).toString('base64'),
    environment: environment,
    category: category,
    bundleVersion: bundleVersion,
  };
}

/* -------------------------------------------------------------- assertion */

export interface AssertionInput {
  assertion: Uint8Array;
  /** Exactly the bytes the phone signed: here the request body. */
  clientData: Uint8Array;
  /** `AttestedKey.publicKey`. */
  publicKey: string;
  /** The highest counter seen from this key so far. */
  counter: number;
  appId?: string;
}

/**
 * Apple's assertion steps 1-5 and 7: the signature over
 * SHA256(authenticatorData || SHA256(clientData)), the app, and a counter
 * above the last. Step 6, the challenge, is the body itself here: the
 * assertion signs exactly what was sent. Returns the new counter.
 */
export function verifyAssertion(input: AssertionInput): number {
  return asAttestError(() => assertion(input));
}

function assertion(input: AssertionInput): number {
  const top = mapOf(decode(input.assertion), 'the assertion');
  const signature = bytesOf(top.get('signature'), 'signature');
  const authenticatorData = bytesOf(top.get('authenticatorData'), 'authenticatorData');
  const nonce = sha256(authenticatorData, sha256(input.clientData));
  const key = createPublicKey({ key: Buffer.from(input.publicKey, 'base64'), format: 'der', type: 'spki' });
  if (!createVerify('sha256').update(nonce).verify(key, signature)) throw new AttestError('3: signature');
  const a = readAuthData(authenticatorData);
  if (!same(a.rpIdHash, sha256(new TextEncoder().encode(input.appId ?? APP_ID)))) {
    throw new AttestError('4: another app');
  }
  if (!(a.counter > input.counter)) throw new AttestError('5: counter did not go up');
  if (a.extensions !== null) {
    const c = a.extensions.get('apple_validation_category_01');
    if (c instanceof Uint8Array && c.length === 4) {
      const category = new DataView(c.buffer, c.byteOffset, 4).getUint32(0, true);
      if (REFUSED_CATEGORIES.has(category)) throw new AttestError(`7: validation category ${category}`);
    }
  }
  return a.counter;
}
