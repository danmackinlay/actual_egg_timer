/**
 * test/data/appAttestSynthetic.json: an App Attest attestation made the way a
 * phone makes one, for this app, under a root this script makes up - so the
 * server's whole path (attest, then eggs with assertions, into the attested
 * tier) can be tested, which Apple's own sample cannot do: it is for Apple's
 * example app, with a raw challenge rather than SHA256 of a cook's id.
 *
 *   npm run build && node dist/tools/attestTestData.js
 *
 * Needs OpenSSL 3 on the PATH, for the certificates; the test does not. The
 * output is test data, regenerated only when its shape must change, and
 * its keys are throwaway: nothing here is trusted anywhere but in the test.
 */

import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_ID } from '../server/appAttest.js';
import { encode } from '../server/cbor.js';

const UID = '3f0b8c1e-6d2a-4b7e-9a41-0c5d2e7f8a90';
const OUT = 'test/data/appAttestSynthetic.json';

function sha256(...parts: Uint8Array[]): Buffer {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest();
}

const dir = mkdtempSync(join(tmpdir(), 'attest-'));
const at = (name: string): string => join(dir, name);
const ssl = (...args: string[]): void => {
  execFileSync('openssl', args, { stdio: ['ignore', 'ignore', 'inherit'] });
};

try {
  // A root and an intermediate, as Apple's chain has.
  ssl('ecparam', '-name', 'secp384r1', '-genkey', '-noout', '-out', at('root.key'));
  ssl('req', '-x509', '-new', '-key', at('root.key'), '-subj', '/CN=Test App Attestation Root CA',
    '-days', '7300', '-addext', 'basicConstraints=critical,CA:true', '-addext', 'keyUsage=critical,keyCertSign',
    '-out', at('root.pem'));
  ssl('ecparam', '-name', 'secp384r1', '-genkey', '-noout', '-out', at('ca.key'));
  ssl('req', '-new', '-key', at('ca.key'), '-subj', '/CN=Test App Attestation CA 1', '-out', at('ca.csr'));
  writeFileSync(at('ca.ext'), 'basicConstraints=critical,CA:true,pathlen:0\nkeyUsage=critical,keyCertSign\n');
  ssl('x509', '-req', '-in', at('ca.csr'), '-CA', at('root.pem'), '-CAkey', at('root.key'), '-CAcreateserial',
    '-days', '7000', '-extfile', at('ca.ext'), '-out', at('ca.pem'));

  // The phone's key, and the authenticator data a phone would write for it.
  const leaf = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = leaf.publicKey.export({ format: 'jwk' });
  const x = Buffer.from(jwk.x as string, 'base64url');
  const y = Buffer.from(jwk.y as string, 'base64url');
  const keyId = sha256(Buffer.concat([Buffer.from([4]), x, y]));
  const cose = encode(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1], [-2, x], [-3, y]]));
  const counter = Buffer.alloc(4);
  const idLength = Buffer.alloc(2);
  idLength.writeUInt16BE(keyId.length);
  const authData = Buffer.concat([
    sha256(Buffer.from(APP_ID)), Buffer.from([0x40]), counter,
    Buffer.from('appattestdevelop'), idLength, keyId, cose,
  ]);
  const nonce = sha256(authData, sha256(Buffer.from(UID, 'utf8')));

  // credCert, with the nonce where Apple puts it: SEQUENCE { [1] { OCTET STRING } }.
  writeFileSync(at('leaf.key'), leaf.privateKey.export({ format: 'pem', type: 'pkcs8' }));
  ssl('req', '-new', '-key', at('leaf.key'), '-subj', `/CN=${keyId.toString('hex')}`, '-out', at('leaf.csr'));
  const der = Buffer.concat([Buffer.from([0x30, 0x24, 0xa1, 0x22, 0x04, 0x20]), nonce]);
  const hex = [...der].map((b) => b.toString(16).padStart(2, '0')).join(':');
  writeFileSync(at('leaf.ext'), `basicConstraints=critical,CA:false\n1.2.840.113635.100.8.2=DER:${hex}\n`);
  ssl('x509', '-req', '-in', at('leaf.csr'), '-CA', at('ca.pem'), '-CAkey', at('ca.key'), '-CAcreateserial',
    '-days', '3650', '-extfile', at('leaf.ext'), '-outform', 'DER', '-out', at('leaf.der'));
  ssl('x509', '-in', at('ca.pem'), '-outform', 'DER', '-out', at('ca.der'));

  const attestation = encode(new Map<string, unknown>([
    ['fmt', 'apple-appattest'],
    ['attStmt', new Map<string, unknown>([
      ['x5c', [new Uint8Array(readFileSync(at('leaf.der'))), new Uint8Array(readFileSync(at('ca.der')))]],
      ['receipt', new Uint8Array(0)],
    ])],
    ['authData', new Uint8Array(authData)],
  ]) as never);

  writeFileSync(OUT, JSON.stringify({
    about: 'A synthetic App Attest attestation for this app (development environment), bound to the uid as the iPhone binds it (clientDataHash = SHA256(uid)), under a made-up root. Made by tools/attestTestData.ts; throwaway keys, trusted nowhere but test/appAttest.test.ts and test/server.test.ts.',
    uid: UID,
    appId: APP_ID,
    root: readFileSync(at('root.pem'), 'utf8'),
    keyId: keyId.toString('base64'),
    attestation: Buffer.from(attestation).toString('base64'),
    leafPrivateKey: leaf.privateKey.export({ format: 'pem', type: 'pkcs8' }),
    environment: 'development',
  }, null, 2) + '\n');
  console.log(`${OUT} written`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
