/**
 * The service worker: the web app opens with no signal.
 *
 * It keeps one build of the site, every file the page asks for, and answers
 * the page from it whether or not there is a network. The page, its scripts,
 * the worker they start and the words must all come from one build or the
 * page breaks (netlify.toml says why), so a build is kept whole or not at
 * all: each file must hash to the SHA-256 the build wrote down for it, and
 * one that does not (a deploy landing halfway through, say) fails the
 * install. The build already in use carries on, and the browser tries again
 * at the next visit. A file an earlier build holds with the same contents
 * is copied across rather than fetched, so a deploy costs a browser only the
 * files it changed.
 *
 * A new build waits until the page asks it to take over, which the page
 * does only when no cook is running (offline.ts), and it agrees only when
 * that page is the site's one window: a second window might have a cook
 * running. Until then the old build answers every window it loaded,
 * including the grid worker it starts and the words it fetches later.
 *
 * `_site/sw.js` is written by tools/precache.mjs at build time: it imports
 * this module and calls `serve` with the build's files. Nothing here runs on
 * import, so the tests can reach `cacheKeyFor`.
 */

/** A build's files, by path from the site's root, each with its SHA-256 in
 *  hex. */
export type BuildFiles = Readonly<Record<string, string>>;

/** What the page posts to a waiting build to have it take over. */
export const TAKE_OVER = 'take over';

/** The start of every build's cache name. */
export const BUILD_CACHE_PREFIX = 'aet-build-';

/** The file that answers a request for `path` (from the site's root, without
 *  its query), or null to leave the request to the network. A page's address
 *  is its directory: "" is index.html, and "privacy" or "privacy/" is
 *  privacy/index.html. */
export function cacheKeyFor(path: string, files: BuildFiles): string | null {
  const candidates = path === '' || path.endsWith('/')
    ? [path + 'index.html']
    : [path, path + '/index.html'];
  for (const candidate of candidates) {
    if (Object.hasOwn(files, candidate)) return candidate;
  }
  return null;
}

/* The worker's global and its events, typed as what they are. The project
   compiles against the DOM library, where `self` is a Window, and declaring
   the worker library as well would conflict with it (gridWorker.ts does the
   same). */
interface LifecycleEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchingEvent extends LifecycleEvent {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}
interface PostedEvent extends LifecycleEvent {
  readonly data: unknown;
  readonly source: { readonly id: string } | null;
}
interface WorkerScope {
  readonly registration: { readonly scope: string };
  readonly clients: {
    matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<ReadonlyArray<{ readonly id: string }>>;
  };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', listener: (event: LifecycleEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchingEvent) => void): void;
  addEventListener(type: 'message', listener: (event: PostedEvent) => void): void;
}

/** Run as the service worker for one build. */
export function serve(build: string, files: BuildFiles): void {
  const sw = self as unknown as WorkerScope;
  const cacheName = BUILD_CACHE_PREFIX + build;
  const root = new URL(sw.registration.scope);

  sw.addEventListener('install', (event) => {
    event.waitUntil(fill(cacheName, root, files));
  });

  // Only now is no window left on an older build, so only now can its files
  // go, along with any build that never finished installing.
  sw.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys().then((names) => Promise.all(names
      .filter((name) => name.startsWith(BUILD_CACHE_PREFIX) && name !== cacheName)
      .map((name) => caches.delete(name)))));
  });

  sw.addEventListener('message', (event) => {
    if (event.data !== TAKE_OVER || event.source === null) return;
    const asker = event.source.id;
    event.waitUntil(sw.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        if (windows.length === 1 && windows[0].id === asker) return sw.skipWaiting();
        return undefined;
      }));
  });

  sw.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
    // A page's query is for whoever linked to it; a file's would be a
    // different file.
    if (url.search !== '' && request.mode !== 'navigate') return;
    const key = cacheKeyFor(url.pathname.slice(root.pathname.length), files);
    if (key === null) return;
    event.respondWith(answer(cacheName, new URL(key, root).href, request));
  });
}

/** The build's copy, or the network's if the browser has since thrown the
 *  copy away. */
async function answer(cacheName: string, key: string, request: Request): Promise<Response> {
  const cache = await caches.open(cacheName);
  const kept = await cache.match(key);
  return kept ?? fetch(request);
}

/** Keep every file of the build, or fail if any is missing or is not the
 *  file the build hashed. */
async function fill(cacheName: string, root: URL, files: BuildFiles): Promise<void> {
  const cache = await caches.open(cacheName);
  const earlier = (await caches.keys())
    .filter((name) => name.startsWith(BUILD_CACHE_PREFIX) && name !== cacheName);
  await Promise.all(Object.keys(files).map(async (path) => {
    const url = new URL(path, root).href;
    // A page is always fetched: its headers carry its policy (the CSP among
    // them), which no file's hash covers, and a kept copy keeps the old ones.
    if (!path.endsWith('.html')) {
      const kept = await keptEarlier(earlier, url, files[path]);
      if (kept !== null) {
        await cache.put(url, kept);
        return;
      }
    }
    // Past the browser's own cache, which keeps an icon for a day, so it may
    // still hold the last build's.
    const response = await fetch(url, { cache: 'reload' });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    const body = await response.clone().arrayBuffer();
    if (await sha256(body) !== files[path]) throw new Error(`${path} is not this build's`);
    // A redirected response cannot answer a page load, so a file the host
    // reached by redirecting is kept as its contents alone.
    await cache.put(url, response.redirected ? unredirected(response, body) : response);
  }));
}

/** An earlier build's copy of `url`, if its contents hash to `digest`. */
async function keptEarlier(earlier: readonly string[], url: string, digest: string): Promise<Response | null> {
  for (const name of earlier) {
    const kept = await (await caches.open(name)).match(url);
    if (kept !== undefined && await sha256(await kept.clone().arrayBuffer()) === digest) return kept;
  }
  return null;
}

function unredirected(response: Response, body: ArrayBuffer): Response {
  const headers = new Headers(response.headers);
  // The body is already decoded, and may not be the length the host sent.
  headers.delete('content-encoding');
  headers.delete('content-length');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

async function sha256(body: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', body));
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}
