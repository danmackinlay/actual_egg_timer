/**
 * The function as Netlify runs it (netlify/functions/eggs.mts), through the
 * real Blobs client, against the local Blobs server the client ships for
 * exactly this. What test/server.test.ts cannot see: that the five store
 * calls mean on Netlify what they mean on a map - a conditional write that
 * says whether it wrote, a listing by prefix, a strongly consistent read
 * after a delete.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlobsServer } from '@netlify/blobs/server';

import eggs from '../netlify/functions/eggs.mjs';
import { recordAt } from '../tools/common.js';

const UID = '6f1c2a9e-2b1d-4c1e-9d6b-1a2b3c4d5e6f';
const SITE = 'https://actualeggtimer.netlify.app';

test('the function, through the Blobs client: keep once, list, delete', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'blobs-'));
  const server = new BlobsServer({ directory: directory, token: 'test-token' });
  const { port } = await server.start();
  const url = `http://localhost:${port}`;
  (globalThis as { netlifyBlobsContext?: string }).netlifyBlobsContext = Buffer.from(JSON.stringify({
    siteID: 'test-site', token: 'test-token', edgeURL: url, uncachedEdgeURL: url,
  })).toString('base64');
  try {
    const post = (seq: number) => eggs(new Request(`${SITE}/api/eggs`, {
      method: 'POST', body: JSON.stringify({ seq: seq, record: { ...recordAt(0.41, 412, 0, null), uid: UID } }),
    }));
    assert.equal((await post(0)).status, 201);
    assert.equal((await post(0)).status, 200, 'the conditional write says it did not write');
    assert.equal((await post(1)).status, 201);
    const del = () => eggs(new Request(`${SITE}/api/eggs/${UID}`, { method: 'DELETE' }));
    assert.deepEqual(await (await del()).json(), { deleted: 2 });
    assert.deepEqual(await (await del()).json(), { deleted: 0 }, 'gone at once');
    assert.equal((await post(0)).status, 201, 'and can be sent again');
  } finally {
    delete (globalThis as { netlifyBlobsContext?: string }).netlifyBlobsContext;
    await server.stop();
    rmSync(directory, { recursive: true, force: true });
  }
});
