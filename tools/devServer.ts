/**
 * The site and its endpoint, locally: `_site/` as Netlify serves it, and
 * /api/* answered by `server/eggs.ts` on a store in memory. For checking
 * sharing end to end - the web app in a browser, and the iOS app in the
 * simulator, launched with `-shareServer http://localhost:<port>` - before
 * a push puts the real one live.
 *
 *   npm run build:site && node tools/devServer.ts   (npm run serve:dev)
 *
 * PORT sets the port (8888). It listens on this machine only (127.0.0.1),
 * which the simulator reaches as localhost. Every egg kept, and every
 * deletion, is printed; nothing is written to disk, and everything goes with
 * the process.
 *
 * The site that ships has no development tools (src/ui/dev/: the development
 * clock and the test API, main.ts), so this serves `_dev/` over `_site/`:
 * the one file the build adds for them (tools/buildSite.ts). The page asks
 * for it only where this server's cookie names the port it is on. TREE
 * names the checkout whose `_site/` and `_dev/` are served (this one):
 * `npm run e2e -- --tree <dir>` (tools/harness.ts).
 *
 * The lab page (tools/egg-section.html) is served too, from this checkout,
 * with the sources it imports (/src/...), each a module with its types
 * stripped by esbuild.
 */

import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { transform } from 'esbuild';
import { handle } from '../server/eggs.ts';
import { MemoryStore } from '../server/memoryStore.ts';

const TREE = process.env['TREE'] ?? '.';
/** Where a file is looked for, in turn: the development build's own file,
 *  then the site. */
const ROOTS = [join(TREE, '_dev'), join(TREE, '_site')];
/** The lab page, and the sources it imports, from this checkout. */
const LAB = '/tools/egg-section.html';
const PORT = Number(process.env['PORT'] ?? 8888);
const store = new MemoryStore();

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

async function staticFile(path: string): Promise<{ body: Buffer; type: string } | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null; // a stray %: no such file
  }
  const clean = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  try {
    if (clean === LAB) return { body: await readFile(`.${LAB}`), type: TYPES['.html'] };
    if (clean.startsWith('/src/') && clean.endsWith('.ts')) {
      const js = await transform(await readFile(`.${clean}`, 'utf8'), { loader: 'ts', format: 'esm' });
      return { body: Buffer.from(js.code), type: TYPES['.js'] };
    }
  } catch {
    return null;
  }
  for (const candidate of [clean, join(clean, 'index.html')]) {
    for (const root of ROOTS) {
      try {
        return { body: await readFile(join(root, candidate)), type: TYPES[extname(candidate)] ?? 'application/octet-stream' };
      } catch {
        continue;
      }
    }
  }
  return null;
}

createServer((req, res) => {
  serve(req, res).catch((error: unknown) => {
    console.error('dev server:', error instanceof Error ? error.message : String(error));
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(PORT, '127.0.0.1', () => console.log(`site and endpoint on http://localhost:${PORT}`));

async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
  // The page loads the development tools only where this names its port
  // (main.ts).
  res.writeHead(200, {
    'content-type': file.type, 'cache-control': 'no-store',
    'set-cookie': `aet-dev-tools=${PORT}; Path=/; SameSite=Strict`,
  });
  res.end(file.body);
}
