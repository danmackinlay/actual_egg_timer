// `npm run build:site`: the deployable tree, in _site/, from nothing.
//
// The app's part of the build (`node tools/build.mjs tsconfig.app.json`,
// the same build `npm run verify` checks and tests), the page and what it
// loads, and last the service worker that lists all of it:
//
//   _site/index.html, styles.css, site.webmanifest   from the repo root
//   _site/app/                 the compiled scripts, from dist/ (below)
//   _site/assets, copy, privacy                      copied as they are
//   _site/fixtures/population.json                   the prior's population
//   _site/sw.js                (tools/precache.mjs; it must run last, since
//                              a file copied in after it is not in its list)
//
// The scripts go to app/, not dist/, and index.html asks for them there: the
// 19 September site served /dist/* as immutable for a year, so a browser that
// visited then keeps those modules, and a new page importing them breaks. A
// path no browser has cached cannot be stale. So the page loads only from a
// built site (`npm run serve:site`, `serve:dev`), not from the repo root.
//
// Each script is copied less its last line, which names its source map: the
// site ships none, so what lands in _site/app is byte for byte what `tsc`
// emits with `sourceMap` off. The list is src/'s .ts files, not dist/'s, so
// a module whose source is gone is never shipped; a source with no compiled
// twin fails the build. The development tools (src/ui/dev/: the development
// clock and the test API, loaded on this machine only, main.ts) are left
// out: a server for the harness adds them from dist/ (tools/devServer.ts).
//
// Usage: node tools/buildSite.mjs
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SITE = '_site';
const DEV = join('src', 'ui', 'dev');
const MAP = /\n\/\/# sourceMappingURL=[^\n]*\n?$/;

/** A node script, as a step: its output shown, its failure the build's. */
function run(script, ...args) {
  const step = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (step.status !== 0) process.exit(step.status ?? 1);
}

/** Every .ts under `dir`, declaration files and the development tools aside. */
function sources(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path !== DEV) found.push(...sources(path));
    } else if (path.endsWith('.ts') && !path.endsWith('.d.ts')) found.push(path);
  }
  return found;
}

rmSync(SITE, { recursive: true, force: true });
run('tools/build.mjs', 'tsconfig.app.json');
mkdirSync(SITE);
for (const file of ['index.html', 'styles.css', 'site.webmanifest']) copyFileSync(file, `${SITE}/${file}`);
for (const source of sources('src')) {
  const script = source.replace(/\.ts$/, '.js');
  let js;
  try {
    js = readFileSync(join('dist', script), 'utf8');
  } catch {
    throw new Error(`dist/${script} not found: is dist/ older than ${source}?`);
  }
  const target = join(SITE, 'app', script);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, js.replace(MAP, '\n'));
}
for (const dir of ['assets', 'copy', 'privacy']) cpSync(dir, `${SITE}/${dir}`, { recursive: true });
mkdirSync(`${SITE}/fixtures`);
copyFileSync('fixtures/population.json', `${SITE}/fixtures/population.json`);
run('tools/precache.mjs');
