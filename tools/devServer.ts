/**
 * The site and its endpoint, locally: `_site/` as Netlify serves it, and
 * /api/* answered by `server/eggs.ts` on a store in memory. For checking
 * sharing end to end - the web app in a browser, and the iOS app in the
 * simulator, launched with `-shareServer http://localhost:<port>` - before
 * a push puts the real one live.
 *
 *   npm run build:site && npm run build && node dist/tools/devServer.js
 *
 * PORT sets the port (8888). Every egg kept, and every deletion, is printed;
 * nothing is written to disk, and everything goes with the process.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { handle } from '../server/eggs.js';
import { MemoryStore } from '../server/memoryStore.js';

const ROOT = '_site';
const PORT = Number(process.env['PORT'] ?? 8888);
const store = new MemoryStore();

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

async function staticFile(path: string): Promise<{ body: Buffer; type: string } | null> {
  const clean = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
  for (const candidate of [clean, join(clean, 'index.html')]) {
    try {
      const body = await readFile(join(ROOT, candidate));
      return { body: body, type: TYPES[extname(candidate)] ?? 'application/octet-stream' };
    } catch {
      continue;
    }
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/')) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length > 0 && req.method !== 'GET' && req.method !== 'DELETE' ? Buffer.concat(chunks) : null;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const before = new Set(store.blobs.keys());
    const answer = await handle(new Request(url, { method: req.method ?? 'GET', headers: headers, body: body }), store);
    const added = [...store.blobs.keys()].filter((k) => !before.has(k));
    const removed = [...before].filter((k) => !store.blobs.has(k));
    console.log(`${req.method} ${url.pathname} -> ${answer.status}`
      + (added.length > 0 ? ` +${added.join(' +')}` : '') + (removed.length > 0 ? ` -${removed.length} blobs` : ''));
    const out: Record<string, string> = {};
    answer.headers.forEach((value, key) => { out[key] = value; });
    res.writeHead(answer.status, out);
    res.end(Buffer.from(await answer.arrayBuffer()));
    return;
  }
  const file = await staticFile(url.pathname === '/' ? '/index.html' : url.pathname);
  if (file === null) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': file.type, 'cache-control': 'no-store' });
  res.end(file.body);
}).listen(PORT, () => console.log(`site and endpoint on http://localhost:${PORT}`));
