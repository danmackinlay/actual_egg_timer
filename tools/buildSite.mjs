// `npm run build:site`: the deployable tree, in _site/, from nothing.
//
// The app's part of the build (`node tools/build.mjs tsconfig.app.json`,
// the same build `npm run verify` checks and tests), the page and what it
// loads, and last the service worker that lists all of it:
//
//   _site/index.html, styles.css, site.webmanifest   from the repo root
//   _site/app/                 the compiled scripts (tools/sitePaths.mjs,
//                              which also points the page at them)
//   _site/assets, copy, privacy                      copied as they are
//   _site/fixtures/population.json                   the prior's population
//   _site/sw.js                (tools/precache.mjs; it must run last, since
//                              a file copied in after it is not in its list)
//
// Usage: node tools/buildSite.mjs
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';

const SITE = '_site';

/** A node script, as a step: its output shown, its failure the build's. */
function run(script, ...args) {
  const step = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (step.status !== 0) process.exit(step.status ?? 1);
}

rmSync(SITE, { recursive: true, force: true });
run('tools/build.mjs', 'tsconfig.app.json');
mkdirSync(SITE);
for (const file of ['index.html', 'styles.css', 'site.webmanifest']) copyFileSync(file, `${SITE}/${file}`);
run('tools/sitePaths.mjs');
for (const dir of ['assets', 'copy', 'privacy']) cpSync(dir, `${SITE}/${dir}`, { recursive: true });
mkdirSync(`${SITE}/fixtures`);
copyFileSync('fixtures/population.json', `${SITE}/fixtures/population.json`);
run('tools/precache.mjs');
