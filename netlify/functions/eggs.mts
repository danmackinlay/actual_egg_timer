/**
 * The collection endpoint, on Netlify (DECISIONS.md 1): `server/eggs.ts`,
 * handed the site's Blobs store. Netlify builds this file with esbuild on
 * deploy, from source, so a push to `main` is what puts it live.
 *
 * Nothing about a request is logged here, and an error is logged by its name
 * only (INFERENCE.md section 7). The rate limit is Netlify's, per address, and
 * counted by Netlify; the address is never written anywhere this code can
 * see.
 */

import { getStore } from '@netlify/blobs';
import { Store, handle } from '../../server/eggs.js';

/** The site-wide store, in Netlify's default region (us-east-2). Fixed once
 *  data exists: a store opened in another region finds nothing. Strong
 *  consistency, so a delete is seen by the next read. */
function blobs(): Store {
  const store = getStore({ name: 'eggs', consistency: 'strong' });
  return {
    get: (key) => store.get(key, { type: 'text' }),
    set: async (key, value, onlyIfNew) => (await store.set(key, value, onlyIfNew ? { onlyIfNew: true } : {})).modified,
    list: async (prefix) => (await store.list({ prefix: prefix })).blobs.map((b) => b.key),
    delete: (key) => store.delete(key),
  };
}

export default async (req: Request): Promise<Response> => {
  try {
    return await handle(req, blobs());
  } catch (error) {
    console.error('eggs:', error instanceof Error ? error.name : 'unknown');
    return new Response(JSON.stringify({ error: 'server' }), {
      status: 500,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
};

// Read by Netlify from the source, so a literal. 120 requests a minute from
// one address is a cook sending a long log at once, twice over.
export const config = {
  path: ['/api/eggs', '/api/eggs/:uid', '/api/attest'],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
