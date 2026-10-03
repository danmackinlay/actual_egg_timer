// The last step of `npm run build:site`: write _site/sw.js, the service
// worker that lets the app open with no signal, and name it in the page.
//
// sw.js lists every file of the build that the page can ask for, each with
// its SHA-256, and hands the list to src/ui/serviceWorker.ts, which keeps the
// build whole or not at all. The list's own hash names the build, so sw.js
// changes whenever any file does, and that change is how a browser learns
// there is a new build. Run it after everything is in _site, since a file
// copied in later is not in the list.
//
// The headers the hosts send are kept with the files (a page's CSP arrives
// with it), and changing them changes no file. So the hosts' settings, read
// from where the build runs, go into the build's name as well: a deploy that
// changes only them is still a new build, and the worker fetches the pages
// afresh, with their new headers.
//
// The page finds the worker through <meta name="service-worker">, which only
// the built page gets: the repo root, served as it is, has no sw.js to start.
//
// Usage: node tools/precache.mjs [site directory, default _site]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const site = process.argv[2] ?? '_site';

// Asked for by the operating system when the app is installed, or by a link
// preview, never by the page: leaving them out more than halves what a first
// visit fetches a second time.
const LEFT_OUT = new Set([
  'sw.js',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
  'assets/social.jpg',
]);

const WORKER = 'app/src/ui/serviceWorker.js';

const HOST_SETTINGS = ['netlify.toml', 'vercel.json'];

/** Every file under `dir`, as a path from `site` with forward slashes,
 *  less hidden ones (a .DS_Store copied in with the artwork). */
function walk(dir, prefix = '') {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = prefix + entry.name;
    if (entry.isDirectory()) found.push(...walk(join(dir, entry.name), path + '/'));
    else found.push(path);
  }
  return found;
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

if (!existsSync(join(site, WORKER))) throw new Error(`${site}/${WORKER} not found: is the site compiled?`);

// Name the worker in the page first: index.html is in the list, hashed as
// it is served.
const page = join(site, 'index.html');
const anchor = '<link rel="manifest" href="site.webmanifest">';
const meta = '<meta name="service-worker" content="sw.js">';
const html = readFileSync(page, 'utf8');
if (!html.includes(anchor)) throw new Error(`${page}: ${anchor} not found`);
if (html.includes(meta)) throw new Error(`${page}: already names its service worker`);
writeFileSync(page, html.replace(anchor, `${anchor}\n${meta}`));

const files = {};
for (const path of walk(site).filter((p) => !LEFT_OUT.has(p)).sort()) {
  files[path] = sha256(readFileSync(join(site, path)));
}
const hosts = {};
for (const path of HOST_SETTINGS.filter((p) => existsSync(p))) hosts[path] = sha256(readFileSync(path));
const build = sha256(JSON.stringify({ files, hosts })).slice(0, 16);

writeFileSync(join(site, 'sw.js'), `// Written by tools/precache.mjs; the code is src/ui/serviceWorker.ts.
import { serve } from './${WORKER}';

serve('${build}', ${JSON.stringify(files, null, 2)});
`);
