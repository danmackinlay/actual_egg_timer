// Point the published page at the published scripts. `npm run build:site`
// compiles src/ into _site/app/ (tsconfig.site.json), not _site/dist/: the
// 19 September site served /dist/* as immutable for a year, so a browser
// that visited then keeps those modules, and a new page importing them breaks.
// A path no browser has cached cannot be stale. The repo root, served as is,
// still loads dist/; only the copy in _site is rewritten. Fails the build if
// the page no longer says what it is rewritten from.
import { readFileSync, writeFileSync } from 'node:fs';

const page = '_site/index.html';
const from = 'src="dist/src/ui/main.js"';
const to = 'src="app/src/ui/main.js"';
const html = readFileSync(page, 'utf8');
if (!html.includes(from)) throw new Error(`${page}: ${from} not found`);
writeFileSync(page, html.replace(from, to));
