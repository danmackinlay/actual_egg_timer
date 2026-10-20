/**
 * That the words-only check (tools/wordsOnly.ts) misses nothing the words
 * can move: every letter of the English and its US overlay swapped for its
 * fullwidth twin (a -> ａ, A -> Ａ), the placeholders kept, each file in its
 * own layout, and then everything run on them.
 *
 *   node tools/wordsOnlyProof.ts     (npm run verify runs it)
 *
 * In a scratch worktree of HEAD in the system's temporary directory, with
 * this checkout's uncommitted changes laid on it, so that what is checked is
 * what is here and this checkout is never written:
 *
 *   1. every fixture made afresh (tools/fixtures.ts) and compared with what
 *      was there (tools/fixtureCompare.ts): each that moved must be one the
 *      check picks, and at least one must move, or the swap reached nothing;
 *   2. the fixtures the check picks made again, with --words: each byte for
 *      byte what the full run made, and no other fixture written;
 *   3. every test/*.test.ts, each in a process of its own: each that fails
 *      must be one the check picks;
 *   4. then, the two catalogues gone, every test the check leaves out: each
 *      must pass, since one that fails reads them. Few tests quote the
 *      words, as they read them from the catalogue, so the swap fails few;
 *      this finds every test that reads them at all.
 *
 * It takes about a minute, longer than npm test and fixtures:check
 * together, so it is verify's, not npm test's. It fails naming what the
 * check missed.
 */

import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { type Entry, withEntries } from './copyFile.ts';
import { compareFixtures } from './fixtureCompare.ts';
import { FIXTURES, pathOf } from './fixtures.ts';
import { testFiles, wordsFixtures, wordsTests } from './wordsOnly.ts';

const ROOT = resolve(import.meta.dirname, '..');
const T0 = Date.now();
const seconds = (): string => `${((Date.now() - T0) / 1000).toFixed(1)} s`;
const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: cwd, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();

/** The catalogues swapped: the English and its overlay, which the editor writes. */
const SWAPPED = ['en', 'en-US'];
/** The fields that hold words: the templates, and an overlay's `base`, the
 *  English it was written against. `count` names an argument. */
const WORDS = new Set(['text', 'zero', 'one', 'two', 'few', 'many', 'other', 'base']);

/** Every ASCII letter outside a placeholder as its fullwidth twin. */
export function fullwidth(s: string): string {
  return s.split(/(\{[^}]*\})/).map((part, i) => (i % 2 === 1 ? part
    : part.replace(/[A-Za-z]/g, (c) => String.fromCodePoint((c.codePointAt(0) as number) + 0xfee0)))).join('');
}

/** A catalogue's text with every entry's words swapped, in its own layout. */
function swapped(text: string, order: readonly string[]): string {
  const messages = (JSON.parse(text) as { messages: Record<string, Entry> }).messages;
  const edits = new Map(Object.entries(messages).map(([key, entry]) => [key,
    Object.fromEntries(Object.entries(entry).map(([f, v]) => [f, WORDS.has(f) ? fullwidth(v) : v])) as Entry]));
  return withEntries(text, edits, order);
}

/** `node args` in `cwd`: its exit code and what it printed. */
function node(cwd: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { cwd: cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { out += d.toString(); });
    child.on('close', (code) => done({ code: code ?? 1, out: out }));
  });
}

/** Which of `tests` fail in `cwd`, each run in a process of its own, as
 *  many at once as the machine has cores but one. */
async function failing(cwd: string, tests: string[]): Promise<string[]> {
  const queue = [...tests];
  const failed: string[] = [];
  const lane = async (): Promise<void> => {
    for (let t = queue.shift(); t !== undefined; t = queue.shift()) {
      if ((await node(cwd, ['--test', '--test-reporter=dot', t])).code !== 0) failed.push(t);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, availableParallelism() - 1) }, lane));
  return failed.sort();
}

const dir = join(realpathSync(tmpdir()), `aet-words-proof-${process.pid}`);
const problems: string[] = [];
try {
  // The scratch tree: HEAD, with this checkout's changes and new files laid on it.
  rmSync(dir, { recursive: true, force: true });
  git(ROOT, 'worktree', 'add', '--detach', '--quiet', dir, 'HEAD');
  const changed = git(ROOT, 'ls-files', '--modified', '--others', '--exclude-standard').split('\n').filter((p) => p !== '');
  for (const path of changed) {
    // A file being written whole (replaceFile's .part, which verify's
    // fixtures:check may be writing beside this) is not one of them.
    if (path === 'node_modules' || path.endsWith('.part') || !existsSync(join(ROOT, path))) continue;
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    copyFileSync(join(ROOT, path), join(dir, path));
  }
  for (const path of git(ROOT, 'ls-files', '--deleted').split('\n').filter((p) => p !== '')) rmSync(join(dir, path), { force: true });
  symlinkSync(realpathSync(join(ROOT, 'node_modules')), join(dir, 'node_modules'));

  const order = Object.keys((JSON.parse(readFileSync(join(dir, 'copy/en.json'), 'utf8')) as { messages: object }).messages);
  for (const tag of SWAPPED) {
    const path = join(dir, `copy/${tag}.json`);
    const before = readFileSync(path, 'utf8');
    const after = swapped(before, order);
    if (after === before) throw new Error(`the swap changed nothing in copy/${tag}.json`);
    writeFileSync(path, after);
  }
  console.log(`the letters of ${SWAPPED.map((t) => `copy/${t}.json`).join(' and ')} swapped in ${dir} (${seconds()})`);

  const pickedTests = await wordsTests();
  const pickedFixtures = [...(await wordsFixtures(FIXTURES)).keys()];
  const paths = Object.keys(FIXTURES).map(pathOf);

  // 1. Every fixture, made afresh on the swapped words.
  const was = new Map(paths.map((p) => [p, readFileSync(join(dir, p), 'utf8')]));
  const full = await node(dir, ['tools/fixtures.ts']);
  if (full.code !== 0) throw new Error(`tools/fixtures.ts failed on the swapped words:\n${full.out}`);
  const made = new Map(paths.map((p) => [p, readFileSync(join(dir, p), 'utf8')]));
  const moved = Object.keys(FIXTURES).filter((name) => {
    const p = pathOf(name);
    return made.get(p) !== was.get(p)
      && compareFixtures(JSON.parse(was.get(p) as string), JSON.parse(made.get(p) as string)).differences.length > 0;
  });
  console.log(`the fixtures the swapped words move: ${moved.join(', ') || 'none'} (${seconds()})`);
  if (moved.length === 0) problems.push('No fixture moved with every letter swapped, so the swap reached nothing.');
  for (const name of moved.filter((n) => !pickedFixtures.includes(n))) {
    problems.push(`${pathOf(name)} moves with the words, and the words-only check does not make it.`);
  }

  // 2. The picked ones again, with --words: what the full run made, and nothing else written.
  const words2 = await node(dir, ['tools/fixtures.ts', '--words']);
  if (words2.code !== 0) throw new Error(`tools/fixtures.ts --words failed:\n${words2.out}`);
  for (const p of paths) {
    if (readFileSync(join(dir, p), 'utf8') !== made.get(p)) {
      problems.push(`${p}: fixtures --words wrote it ${pickedFixtures.map(pathOf).includes(p) ? 'otherwise than a full run' : 'though it does not read the words'}.`);
    }
  }
  console.log(`fixtures --words remade ${pickedFixtures.join(', ')}: byte for byte the full run's (${seconds()})`);

  // 3. Every test, each on its own.
  const failed = await failing(dir, testFiles());
  console.log(`the tests that fail on the swapped words: ${failed.join(', ') || 'none'} (${seconds()})`);
  for (const t of failed.filter((f) => !pickedTests.includes(f))) {
    problems.push(`${t} fails with the words swapped, and the words-only check does not run it.`);
  }

  // 4. The words gone: a test that passes reads none of them.
  for (const tag of SWAPPED) rmSync(join(dir, `copy/${tag}.json`));
  const unpicked = testFiles().filter((t) => !pickedTests.includes(t));
  const without = await failing(dir, unpicked);
  console.log(`with ${SWAPPED.map((t) => `copy/${t}.json`).join(' and ')} gone, the ${unpicked.length} tests the check leaves out `
    + `${without.length === 0 ? 'all pass' : `fail in ${without.join(', ')}`} (${seconds()})`);
  for (const t of without) problems.push(`${t} fails with the words gone, and the words-only check does not run it.`);
  console.log(`the words-only check picks ${pickedTests.length} tests and ${pickedFixtures.length} fixtures`);
} catch (e) {
  problems.push((e as Error).message);
} finally {
  try { git(ROOT, 'worktree', 'remove', '--force', dir); } catch { rmSync(dir, { recursive: true, force: true }); }
  try { git(ROOT, 'worktree', 'prune'); } catch { /* nothing to prune */ }
}

if (problems.length > 0) {
  for (const p of problems) console.error(p);
  console.error(`words-only proof: failed in ${seconds()}`);
  process.exit(1);
}
console.log(`words-only proof: everything the swapped words moved is in the words-only check (${seconds()})`);
