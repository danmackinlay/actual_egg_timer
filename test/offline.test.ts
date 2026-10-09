/**
 * Opening with no signal: which file answers which address
 * (src/ui/serviceWorker.ts), and the build's list of files and its name that
 * tools/precache.mjs writes into sw.js; and the page's hourly look for a
 * new build (src/ui/offline.ts), which goes by the real clock.
 *
 * The worker itself runs only in a browser; it was checked there, offline,
 * in the built site (LOGBOOK, 3 October 2026).
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { BuildFiles, cacheKeyFor } from '../src/ui/serviceWorker.js';

test('1. a page is answered by its index.html, a file by itself', () => {
  const files: BuildFiles = {
    'index.html': 'a', 'privacy/index.html': 'b', 'styles.css': 'c', 'app/src/ui/main.js': 'd',
  };
  assert.equal(cacheKeyFor('', files), 'index.html');
  assert.equal(cacheKeyFor('index.html', files), 'index.html');
  assert.equal(cacheKeyFor('privacy', files), 'privacy/index.html');
  assert.equal(cacheKeyFor('privacy/', files), 'privacy/index.html');
  assert.equal(cacheKeyFor('privacy/index.html', files), 'privacy/index.html');
  assert.equal(cacheKeyFor('app/src/ui/main.js', files), 'app/src/ui/main.js');
  // Not in the build: left to the network.
  assert.equal(cacheKeyFor('assets/social.jpg', files), null);
  assert.equal(cacheKeyFor('app/', files), null);
  assert.equal(cacheKeyFor('styles', files), null);
  // A name the object has without being given it is not a file.
  assert.equal(cacheKeyFor('constructor', files), null);
});

/** A site as `npm run build:site` leaves it, but small. */
const SITE: Record<string, string> = {
  'index.html': '<head>\n<link rel="manifest" href="site.webmanifest">\n</head>\n',
  'styles.css': 'body {}\n',
  'site.webmanifest': '{}\n',
  'app/src/ui/main.js': 'import "./app.js";\n',
  'app/src/ui/serviceWorker.js': 'export function serve() {}\n',
  'copy/en.json': '{}\n',
  'privacy/index.html': '<p>privacy</p>\n',
  'assets/icon-192.png': 'png',
  'assets/icon-512.png': 'png',
  'assets/icon-maskable-512.png': 'png',
  'assets/social.jpg': 'jpg',
  'assets/.DS_Store': 'finder',
};

/** Build a small site, from `host`'s directory if given: the hosts'
 *  settings are read from where the build runs. */
function buildSite(
  edits: Record<string, string> = {}, host: string = process.cwd(),
): { files: Record<string, string>; build: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'aet-site-'));
  for (const [path, text] of Object.entries({ ...SITE, ...edits })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  execFileSync(process.execPath, [join(process.cwd(), 'tools/precache.mjs'), dir], { cwd: host });
  const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
  assert.match(sw, /^import \{ serve \} from '\.\/app\/src\/ui\/serviceWorker\.js';$/m);
  const m = sw.match(/^serve\('([0-9a-f]{16})', (\{[\s\S]*\})\);\s*$/m);
  assert.ok(m !== null, 'sw.js calls serve with a build and its files');
  return { files: JSON.parse(m[2]) as Record<string, string>, build: m[1], dir };
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

test('2. sw.js lists what the page can ask for, hashed as served', () => {
  const { files, dir } = buildSite();
  try {
    // The 512 px icons and the social card are for the system and for link
    // previews; sw.js is the worker itself; hidden files are not the site's.
    assert.deepEqual(Object.keys(files), [
      'app/src/ui/main.js', 'app/src/ui/serviceWorker.js', 'assets/icon-192.png',
      'copy/en.json', 'index.html', 'privacy/index.html', 'site.webmanifest', 'styles.css',
    ]);
    // The page names its worker, under the manifest, and is hashed with it.
    const page = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.match(page, /<link rel="manifest" href="site\.webmanifest">\n<meta name="service-worker" content="sw\.js">\n/);
    assert.equal(files['index.html'], sha256(page));
    assert.equal(files['styles.css'], sha256(SITE['styles.css']));
    // Run twice, it would name the worker twice: it refuses.
    assert.throws(() => execFileSync(process.execPath, ['tools/precache.mjs', dir], { stdio: 'pipe' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('3. the build is named by its files and the hosts\' headers: any change is a new build', () => {
  const a = buildSite();
  const b = buildSite();
  const c = buildSite({ 'copy/en.json': '{"x": 1}\n' });
  const d = buildSite({ 'assets/social.jpg': 'another card' });
  // A deploy that changes only a header changes no file, but the pages the
  // worker keeps must get it.
  const hosts = [mkdtempSync(join(tmpdir(), 'aet-host-')), mkdtempSync(join(tmpdir(), 'aet-host-'))];
  writeFileSync(join(hosts[0], 'netlify.toml'), 'Content-Security-Policy = "default-src \'self\'"\n');
  writeFileSync(join(hosts[1], 'netlify.toml'), 'Content-Security-Policy = "default-src \'none\'"\n');
  const e = buildSite({}, hosts[0]);
  const f = buildSite({}, hosts[1]);
  try {
    assert.equal(a.build, b.build);
    assert.notEqual(a.build, c.build);
    // A file left out of the list changes nothing the page uses.
    assert.equal(a.build, d.build);
    assert.notEqual(e.build, f.build);
    assert.deepEqual(e.files, f.files);
  } finally {
    for (const site of [a, b, c, d, e, f]) rmSync(site.dir, { recursive: true, force: true });
    for (const host of hosts) rmSync(host, { recursive: true, force: true });
  }
});

test('4. a site without the compiled worker fails the build', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aet-site-'));
  try {
    writeFileSync(join(dir, 'index.html'), SITE['index.html']);
    assert.throws(() => execFileSync(process.execPath, ['tools/precache.mjs', dir], { stdio: 'pipe' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A storage the page's modules can read and write. */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  } as unknown as Storage;
}

test('5. the hourly look for a new build goes by the real clock, never the development one', async () => {
  // A page on localhost with the development clock stopped (dev/clock.ts): the
  // cook's time moves only when a script moves it.
  let real_ms = 1_790_000_000_000;
  const realDateNow = Date.now;
  const g = globalThis as Record<string, unknown>;
  const saved = ['window', 'location', 'history', 'sessionStorage', 'localStorage', 'document', 'fetch']
    .map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)] as const);
  const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Date.now = () => real_ms;
  try {
    g['window'] = { localStorage: memoryStorage(), location: { reload: () => { /* not here */ } } };
    g['location'] = { hostname: 'localhost', search: '?clock=0', href: 'http://localhost/?clock=0' };
    g['history'] = { state: null, replaceState: () => { /* the address */ } };
    g['sessionStorage'] = memoryStorage();
    g['localStorage'] = memoryStorage();
    const now = await import('../src/ui/now.js');
    (await import('../src/ui/dev/clock.js')).installDevClock();
    const clock = (g['window'] as { aetClock: import('../src/ui/dev/clock.js').ClockHandle }).aetClock;
    assert.equal(clock.state()?.speed, 0);

    const onDocument = new Map<string, (() => void)[]>();
    const document = {
      body: null,
      visibilityState: 'visible',
      querySelector: () => ({ content: 'sw.js' }),
      addEventListener: (type: string, f: () => void) => { onDocument.set(type, [...(onDocument.get(type) ?? []), f]); },
    };
    g['document'] = document;
    let heads = 0;
    let updates = 0;
    g['fetch'] = () => { heads += 1; return Promise.resolve({ status: 200 }); };
    const registration = {
      waiting: null, installing: null, addEventListener: () => { /* no new build here */ },
      update: () => { updates += 1; return Promise.resolve(); },
    };
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true, writable: true,
      value: {
        serviceWorker: {
          controller: {}, addEventListener: () => { /* no take-over here */ },
          register: () => Promise.resolve(registration),
        },
      },
    });
    const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
    const comeBack = async (): Promise<void> => {
      for (const f of onDocument.get('visibilitychange') ?? []) f();
      await settle();
    };

    const { startOffline } = await import('../src/ui/offline.js');
    startOffline(() => true);
    await settle();
    // Loading asks only whether the worker is still served.
    assert.deepEqual([heads, updates], [1, 0]);

    // Two hours on the development clock, none on the real one: no look.
    clock.shift('+2h');
    assert.ok(now.nowMs() - real_ms >= 7_200_000);
    await comeBack();
    assert.deepEqual([heads, updates], [1, 0], 'the development clock moved, the real one did not');

    // An hour and a minute of real time, the development clock stopped: a look.
    real_ms += 61 * 60_000;
    await comeBack();
    assert.deepEqual([heads, updates], [2, 1], 'an hour went by on the real clock');
    // And not again within the hour.
    real_ms += 30 * 60_000;
    await comeBack();
    assert.deepEqual([heads, updates], [2, 1]);
  } finally {
    Date.now = realDateNow;
    for (const [k, d] of saved) {
      if (d === undefined) delete g[k];
      else Object.defineProperty(globalThis, k, d);
    }
    if (savedNavigator === undefined) delete g['navigator'];
    else Object.defineProperty(globalThis, 'navigator', savedNavigator);
  }
});
