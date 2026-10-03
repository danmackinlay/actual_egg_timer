/**
 * Opening with no signal: which file answers which address
 * (src/ui/serviceWorker.ts), and the build's list of files that
 * tools/precache.mjs writes into sw.js.
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

function buildSite(edits: Record<string, string> = {}): { files: Record<string, string>; build: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'aet-site-'));
  for (const [path, text] of Object.entries({ ...SITE, ...edits })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  execFileSync(process.execPath, ['tools/precache.mjs', dir]);
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

test('3. the build is named by its files: any change is a new build', () => {
  const a = buildSite();
  const b = buildSite();
  const c = buildSite({ 'copy/en.json': '{"x": 1}\n' });
  const d = buildSite({ 'assets/social.jpg': 'another card' });
  try {
    assert.equal(a.build, b.build);
    assert.notEqual(a.build, c.build);
    // A file left out of the list changes nothing the page uses.
    assert.equal(a.build, d.build);
  } finally {
    for (const site of [a, b, c, d]) rmSync(site.dir, { recursive: true, force: true });
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
