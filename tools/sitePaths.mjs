// Put the published scripts in the site and point the published page at
// them. `npm run build:site` builds src/ into dist/ (`node tools/build.mjs
// tsconfig.app.json`, the same build `npm run verify` checks and tests),
// and this copies it into _site/app/, not _site/dist/: the 19 September site
// served /dist/* as immutable for a year, so a browser that visited then
// keeps those modules, and a new page importing them breaks. A path no
// browser has cached cannot be stale. The repo root, served as is, still
// loads dist/; only the copy in _site is rewritten. Fails the build if the
// page no longer says what it is rewritten from.
//
// Each script is copied less its last line, which names its source map: the
// site ships none, so what lands in _site/app is byte for byte what `tsc`
// emits with `sourceMap` off. The list is src/'s .ts files, not dist/'s, so
// a module whose source is gone is never shipped; a source with no compiled
// twin fails the build. The development tools (src/ui/dev/: the development
// clock and the test API, loaded on this machine only, main.ts) are left
// out: a server for the harness adds them from dist/ (tools/devServer.ts).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEV = join('src', 'ui', 'dev');

const MAP = /\n\/\/# sourceMappingURL=[^\n]*\n?$/;

/** Every .ts under `dir`, declaration files aside. */
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

for (const source of sources('src')) {
  const script = source.replace(/\.ts$/, '.js');
  let js;
  try {
    js = readFileSync(join('dist', script), 'utf8');
  } catch {
    throw new Error(`dist/${script} not found: is dist/ older than ${source}?`);
  }
  const target = join('_site/app', script);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, js.replace(MAP, '\n'));
}

const page = '_site/index.html';
const from = 'src="dist/src/ui/main.js"';
const to = 'src="app/src/ui/main.js"';
const html = readFileSync(page, 'utf8');
if (!html.includes(from)) throw new Error(`${page}: ${from} not found`);
writeFileSync(page, html.replace(from, to));
