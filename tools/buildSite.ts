// `npm run build:site`: the deployable tree, in _site/, from nothing, and
// beside it the development tools, in _dev/bundle/, which it rebuilds; the
// rest of _dev/ it leaves.
//
//   _site/index.html, styles.css, site.webmanifest   from the repo root
//   _site/bundle/              the scripts, bundled by esbuild (below)
//   _site/assets, copy, privacy                      copied as they are, but
//                              copy/*.notes.json, which no app loads
//   _site/fixtures/population.json                   the prior's population,
//                              refused unless it reads (parsePopulation: a
//                              fit needs its diagnostics, a forced one an id
//                              that says so), since every browser would
//                              silently draw from the literature's instead
//   _site/sw.js                (tools/precache.ts; it must run last, since
//                              a file copied in after it is not in its list)
//   _dev/bundle/dev-<hash>.js  the development tools (src/ui/dev/)
//
// esbuild bundles three entries into _site/bundle/, each file named for its
// contents, so a name never changes what it holds: the page (src/ui/main.ts),
// the grid worker it starts (src/ui/gridWorker.ts), and the service worker
// (src/ui/serviceWorker.ts), which sw.js imports. ES2022 modules, minified,
// no source maps. The two workers are each one file. The page is split, with
// the development tools (src/ui/dev/index.ts, which main.ts imports on this
// machine only) as an entry of their own: they use the app's own clock and
// state, so whatever they share with the page goes to a chunk both import,
// and the tools' own code to dev-<hash>.js. That one file goes to _dev/, not
// _site/: the site that ships is the development build less that file, and
// the development server (tools/devServer.ts) serves _site/ with _dev/ over
// it.
//
// The page starts the grid worker by its hashed name, which esbuild writes
// into the page's code as GRID_WORKER_FILE (src/ui/offThread.ts), and loads
// as index.html's one module script, whose src (src/ui/main.ts in the repo)
// is rewritten to the bundle's name.
//
// The bundles live under bundle/, a path no earlier build used: before them,
// the scripts were app/ and dist/, under fixed names, which browsers may
// still hold (netlify.toml).
//
// Usage: node tools/buildSite.ts
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { type BuildOptions, type Metafile, build } from 'esbuild';
import { parsePopulation } from '../src/core/population.ts';

const SITE = '_site';
const DEV = '_dev';
const BUNDLE = 'bundle';
const PAGE_SCRIPT = '<script type="module" src="src/ui/main.ts"></script>';
/** Words only the development tools hold: none may reach _site/. */
const DEV_ONLY = ['aetClock', 'aetTest'];

/** A node script, as a step: its output shown, its failure the build's. */
function run(script: string, ...args: string[]): void {
  const step = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (step.status !== 0) process.exit(step.status ?? 1);
}

/** What every bundle is built with. */
const OPTIONS = {
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  outdir: join(SITE, BUNDLE),
  entryNames: '[name]-[hash]',
  chunkNames: '[name]-[hash]',
  metafile: true,
  logLevel: 'warning',
} satisfies BuildOptions;

/** The output, as a path under `outdir`, that `entry` was built into. */
function outputOf(result: { metafile: Metafile }, entry: string): string {
  const found = Object.entries(result.metafile.outputs).find(([, o]) => o.entryPoint === entry);
  if (found === undefined) throw new Error(`no output for ${entry}`);
  return found[0];
}

// _dev/ holds what other tools write too (copy:review's page), so only the
// bundle this build writes there goes.
rmSync(SITE, { recursive: true, force: true });
rmSync(join(DEV, BUNDLE), { recursive: true, force: true });
mkdirSync(SITE);

const workers = await build({ ...OPTIONS, entryPoints: ['src/ui/gridWorker.ts', 'src/ui/serviceWorker.ts'] });
const page = await build({
  ...OPTIONS,
  entryPoints: { main: 'src/ui/main.ts', dev: 'src/ui/dev/index.ts' },
  splitting: true,
  define: { GRID_WORKER_FILE: JSON.stringify(`./${basename(outputOf(workers, 'src/ui/gridWorker.ts'))}`) },
});

const dev = outputOf(page, 'src/ui/dev/index.ts');
mkdirSync(join(DEV, BUNDLE), { recursive: true });
renameSync(dev, join(DEV, BUNDLE, basename(dev)));
for (const output of Object.keys({ ...workers.metafile.outputs, ...page.metafile.outputs })) {
  if (output === dev) continue;
  const js = readFileSync(output, 'utf8');
  const found = DEV_ONLY.filter((word) => js.includes(word));
  if (found.length > 0) throw new Error(`${output} holds ${found.join(', ')}: the development tools reached the site`);
}

const html = readFileSync('index.html', 'utf8');
if (!html.includes(PAGE_SCRIPT)) throw new Error(`index.html: ${PAGE_SCRIPT} not found`);
const main = `${BUNDLE}/${basename(outputOf(page, 'src/ui/main.ts'))}`;
writeFileSync(join(SITE, 'index.html'), html.replace(PAGE_SCRIPT, PAGE_SCRIPT.replace('src/ui/main.ts', main)));
for (const file of ['styles.css', 'site.webmanifest']) copyFileSync(file, join(SITE, file));
// The notes beside a catalogue are the tools' and the tests', never the page's.
const shipped = (path: string): boolean => !path.endsWith('.notes.json');
for (const dir of ['assets', 'copy', 'privacy']) cpSync(dir, join(SITE, dir), { recursive: true, filter: shipped });
mkdirSync(join(SITE, 'fixtures'));
const population = JSON.parse(readFileSync('fixtures/population.json', 'utf8'));
const drawn = parsePopulation(population);
if (drawn === null) {
  throw new Error('fixtures/population.json does not read (src/core/population.ts): a fit needs its diagnostics, '
    + 'and one forced past them an id that says so');
}
if (population.diagnostics?.forced === true) {
  console.warn(`build:site: the population ${drawn.id} was forced: its sampler failed its checks`);
}
copyFileSync('fixtures/population.json', join(SITE, 'fixtures', 'population.json'));
run('tools/precache.ts', SITE);
