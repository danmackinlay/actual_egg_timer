/**
 * The words-only check: the tests and fixtures that can read the words, so a
 * save from the words' editor (tools/copyEdit/save.ts) runs them and not the
 * physics, which no word can move. `npm run verify` and CI still run
 * everything.
 *
 *   node tools/wordsOnly.ts          what it picks, and what in each reads
 *   node tools/wordsOnly.ts test     node --test over the tests it picks
 *                                    (npm run test:words)
 *
 * A test is picked when the code it can run reads the catalogue: each
 * test/*.test.ts is bundled by esbuild, on its own, with what it imports and
 * nothing it cannot call (tree-shaken, comments dropped), and with every
 * script of the repository it names by a path, which it runs in a process of
 * its own (`tools/eggs.ts`), bundled the same way. A fixture is picked the
 * same way, from the modules its maker in tools/fixtures.ts imports.
 *
 * Code reads the catalogue when it holds a file of copy/, imported, or a
 * string naming the folder: `'copy'` (`readdirSync('copy')`), or one that
 * starts `copy/`, after any `./` or `../` (`'copy/en.json'`,
 * `` `copy/${tag}.json` ``); `x['copy']`, an index, is no path. The
 * catalogue is read with fs or fetched, never imported, so the strings are
 * what find it: tools/copyNotes.ts, tools/fixtures/english.ts, the tests
 * that read it themselves. src/core/copy.ts, which renders words, names no
 * file, so reaching it picks nothing: a test that renders with a catalogue
 * of its own cannot see the words. And the web's loader in src/ui/copy.ts
 * picks a test only when the test can call it.
 *
 * Nothing here is a list kept by hand, so a new test that reads the words is
 * picked as it lands. What a string cannot show (a path built from pieces, a
 * module imported by a name computed at run time) the proof catches:
 * tools/wordsOnlyProof.ts swaps every letter of the words and runs
 * everything, and fails when a test fails or a fixture moves that this did
 * not pick. `npm run verify` runs it.
 */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { build, transformSync } from 'esbuild';

/** The repository's root, which the paths here are relative to. */
const ROOT = resolve(import.meta.dirname, '..');

/** A string naming the catalogue's folder: `'copy'` itself, or a path in it,
 *  after any `./` or `../`; never an index, `x['copy']`. */
const NAMES_COPY = /(?<!\[\s*)(['"`])(?:\.{1,2}\/)*copy(?:\/|\1)/;

/** A string naming a script of the repository to run: `tools/eggs.ts`. */
const NAMES_SCRIPT = /['"`]((?:\.{1,2}\/)*(?:tools|src|server|test|studies)\/[\w./-]+\.[cm]?ts)['"`]/g;

/** Whether a module's source, its comments aside, names the catalogue. */
export function namesCatalogue(source: string, loader: 'ts' | 'js' = 'ts'): boolean {
  return NAMES_COPY.test(transformSync(source, { loader: loader, legalComments: 'none', minifyWhitespace: true }).code);
}

/** An entry bundled: its code, tree-shaken, and the files that put code or
 *  data in it. */
interface Bundle { code: string; inputs: string[] }

/** Each of `entries` bundled on its own, with no comments and only the code
 *  it can run. What is in node_modules is not followed: none of it reads
 *  the catalogue. */
async function bundles(root: string, entries: string[]): Promise<Map<string, Bundle>> {
  const result = await build({
    entryPoints: entries.map((e) => join(root, e)), bundle: true, write: false, metafile: true, platform: 'node',
    format: 'esm', packages: 'external', minifyWhitespace: true, legalComments: 'none', logLevel: 'silent',
    absWorkingDir: root, outbase: root, outdir: join(root, '.words-only'),
  });
  const code = new Map(result.outputFiles.map((f) => [relative(root, f.path), f.text]));
  const out = new Map<string, Bundle>();
  for (const [path, output] of Object.entries(result.metafile.outputs)) {
    if (output.entryPoint === undefined) continue;
    out.set(output.entryPoint, {
      code: code.get(path) ?? '',
      inputs: Object.entries(output.inputs).filter(([, i]) => i.bytesInOutput > 0).map(([p]) => p),
    });
  }
  return out;
}

/** The scripts of the repository `code` names by a path, from the root, as
 *  a test runs them, or from `entry`'s folder. */
function scriptsNamed(root: string, entry: string, code: string): string[] {
  const found = new Set<string>();
  for (const m of code.matchAll(NAMES_SCRIPT)) {
    for (const candidate of [relative(root, resolve(root, m[1])), relative(root, resolve(root, dirname(entry), m[1]))]) {
      if (candidate !== entry && existsSync(join(root, candidate))) found.add(candidate);
    }
  }
  return [...found];
}

/** Each entry, and what in it reads the catalogue: a module of it, a script
 *  it runs, or null for nothing. */
export type Reach = Map<string, string | null>;

/** Which of `entries`, paths relative to `root` (the repository's), read
 *  the catalogue. */
export async function reach(entries: string[], under: string = ROOT): Promise<Reach> {
  // esbuild names its outputs by the real path.
  const root = realpathSync(under);
  const bundled = new Map<string, Bundle>();
  for (let pending = [...new Set(entries)]; pending.length > 0;) {
    for (const [entry, b] of await bundles(root, pending)) bundled.set(entry, b);
    const named = new Set<string>();
    for (const [entry, b] of bundled) {
      for (const script of scriptsNamed(root, entry, b.code)) if (!bundled.has(script)) named.add(script);
    }
    pending = [...named];
  }
  const reader = (entry: string, seen: Set<string>): string | null => {
    seen.add(entry);
    const b = bundled.get(entry) as Bundle;
    const file = b.inputs.find((p) => p.startsWith('copy/'));
    if (file !== undefined) return file;
    if (NAMES_COPY.test(b.code)) {
      // The module that does, for the listing: the entry, whose code is all
      // kept, or else the first it imports whose source does.
      const names = (p: string): boolean => /\.[cm]?[jt]s$/.test(p)
        && namesCatalogue(readFileSync(join(root, p), 'utf8'), /\.[cm]?ts$/.test(p) ? 'ts' : 'js');
      return names(entry) ? entry : b.inputs.find(names) ?? entry;
    }
    for (const script of scriptsNamed(root, entry, b.code)) {
      if (!seen.has(script) && reader(script, seen) !== null) return `${script}, which it runs`;
    }
    return null;
  };
  return new Map(entries.map((e) => [e, reader(e, new Set())]));
}

/** Every test file, test/*.test.ts, relative to the root. */
export function testFiles(): string[] {
  return readdirSync(join(ROOT, 'test')).filter((f) => f.endsWith('.test.ts')).sort().map((f) => `test/${f}`);
}

/** The tests that can read the words. */
export async function wordsTests(): Promise<string[]> {
  return [...await reach(testFiles())].filter(([, r]) => r !== null).map(([t]) => t);
}

/** The modules a fixture's maker imports, from its source: the
 *  `import('./fixtures/units.ts')` in each entry of tools/fixtures.ts's
 *  FIXTURES, relative to the root. */
export function makerModules(maker: () => unknown): string[] {
  return [...String(maker).matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map((m) => relative(ROOT, resolve(ROOT, 'tools', m[1])));
}

/** The names of the fixtures, of `makers` (tools/fixtures.ts's FIXTURES),
 *  that can read the words, in their order, and what in each reads. */
export async function wordsFixtures(makers: Record<string, () => unknown>): Promise<Map<string, string>> {
  const modules = new Map(Object.entries(makers).map(([name, maker]) => [name, makerModules(maker)]));
  for (const [name, ms] of modules) if (ms.length === 0) throw new Error(`the fixture ${name}'s maker imports no module`);
  const reached = await reach([...new Set([...modules.values()].flat())]);
  const out = new Map<string, string>();
  for (const [name, ms] of modules) {
    const by = ms.map((m) => reached.get(m) ?? null).find((r) => r !== null);
    if (by !== undefined) out.set(name, by);
  }
  return out;
}

/** `command` run in the root, its output held: its exit code and what it
 *  printed. */
function run(command: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { out += d.toString(); });
    child.on('error', (e) => done({ code: 127, out: `${out}${e.message}\n` }));
    child.on('close', (code) => done({ code: code ?? 1, out: out }));
  });
}

/**
 * npm test's checks for the words: the key types and the Swift's constants
 * made afresh, as npm test makes them; then the three type checks, which
 * catch a key type broken, beside the tests that can read the words. Each
 * one's output is printed whole when all have ended, so none interleave.
 */
async function testWords(): Promise<number> {
  for (const tool of ['tools/copyKeys.ts', 'tools/swiftConstants.ts']) {
    const r = await run(process.execPath, [tool]);
    process.stdout.write(r.out);
    if (r.code !== 0) return r.code;
  }
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  const tests = await wordsTests();
  const jobs = await Promise.all([
    ...['tsconfig.core.json', 'tsconfig.app.json', 'tsconfig.json'].map((p) => run(process.execPath, [tsc, '-p', p])),
    run(process.execPath, ['--test', ...tests]),
  ]);
  for (const j of jobs) process.stdout.write(j.out);
  return jobs.find((j) => j.code !== 0)?.code ?? 0;
}

if (import.meta.main) {
  if (process.argv[2] === 'test') {
    process.exitCode = await testWords();
  } else {
    const { FIXTURES } = await import('./fixtures.ts');
    const all = testFiles();
    const reached = [...await reach(all)].filter(([, r]) => r !== null);
    console.log(`${reached.length} of ${all.length} tests can read the words:`);
    for (const [t, by] of reached) console.log(`  ${t}, through ${by}`);
    const fixtures = await wordsFixtures(FIXTURES);
    console.log(`${fixtures.size} of ${Object.keys(FIXTURES).length} fixtures can:`);
    for (const [name, by] of fixtures) console.log(`  ${name}, through ${by}`);
  }
}
