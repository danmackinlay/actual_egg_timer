/**
 * That the fixtures on disk are what the TypeScript makes of them now:
 * fixtures/, and the fit's beside its tests in fit/tests/.
 *
 *   npm run fixtures:check
 *   npm run fixtures:check -- --words   only the fixtures that can read the
 *                                       words (tools/wordsOnly.ts), for a
 *                                       save from the words' editor
 *
 * Reads every fixture as it is in the working tree, makes them all afresh
 * (tools/fixtures.ts, in a process of its own), and compares each with what
 * was there by tools/fixtureCompare.ts: the same keys, strings and lengths,
 * and the same numbers to Swift's conformance tolerance, so the check holds
 * on x86 Linux as on arm64 macOS, where the fixtures are made. A fixture
 * that agrees but for its numbers' last digits is put back as it was, so the
 * check leaves the tree as it found it; one that disagrees is left as
 * written, for `git diff`, and the differences are listed by path, so a run
 * after a failing one passes and the fresh fixtures are ready to commit. In
 * CI's clean checkout the working tree is the commit, so there it fails a
 * change committed without its fixtures. A fixture git does not know fails,
 * as one the check cannot compare, and so does one in another layout than
 * one row per line (`fixtureLayout`), say from a branch from before it: it
 * is written in this one, its values unchanged, to be committed.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { compareFixtures, FIXTURE_TOLERANCE, fixtureLayout, replaceFile } from './fixtureCompare.ts';
import { FIXTURES, pathOf } from './fixtures.ts';
import { wordsFixtures } from './wordsOnly.ts';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });

const WORDS = process.argv.includes('--words');
// fixtures/, and the fit's fixtures beside its tests (tools/fixtures.ts);
// with --words, only those that can read the words.
const WRITTEN = WORDS ? [...(await wordsFixtures(FIXTURES)).keys()].map(pathOf) : ['fixtures/', 'fit/tests/*.json'];
const tracked = WRITTEN.length === 0 ? [] : git('ls-files', '--', ...WRITTEN).split('\n').filter((f) => f.endsWith('.json'));
const before = new Map(tracked.filter((f) => existsSync(f)).map((f) => [f, readFileSync(f, 'utf8')]));

execFileSync(process.execPath, ['tools/fixtures.ts', ...(WORDS ? ['--words'] : [])], { stdio: 'inherit' });

const untracked = WRITTEN.length === 0 ? [] : git('ls-files', '--others', '--exclude-standard', '--', ...WRITTEN).split('\n').filter(Boolean);

let failed = false;
for (const file of untracked) {
  console.error(`${file}: not in git; add it, or stop writing it`);
  failed = true;
}

const SHOWN = 20;
for (const file of tracked) {
  const fresh = readFileSync(file, 'utf8');
  const was = before.get(file);
  if (was === undefined) {
    console.error(`${file}: deleted from the working tree, and written again`);
    failed = true;
    continue;
  }
  if (fresh === was) continue;
  const { close, largest, differences } = compareFixtures(JSON.parse(was), JSON.parse(fresh));
  if (differences.length === 0) {
    // The values that were there, laid out as the generator lays them out:
    // the file as it was, unless it was in another layout.
    const relaid = fixtureLayout(JSON.parse(was));
    replaceFile(file, relaid);
    if (relaid !== was) {
      failed = true;
      console.error(`${file}: the same values, not laid out one row per line; written so, to be committed`);
      continue;
    }
    console.log(`${file}: ${close} numbers differ in their last digits (at most ${largest.toExponential(1)}), within ${FIXTURE_TOLERANCE}; kept as it was`);
    continue;
  }
  failed = true;
  console.error(`${file}: ${differences.length} differences from the fixture on disk${close > 0 ? `, and ${close} numbers within ${FIXTURE_TOLERANCE}` : ''}`);
  for (const d of differences.slice(0, SHOWN)) {
    const error = d.error === null ? '' : ` (${d.error.toExponential(1)})`;
    console.error(`  ${d.path}: ${d.committed} -> ${d.fresh}${error}`);
  }
  if (differences.length > SHOWN) console.error(`  and ${differences.length - SHOWN} more`);
}

if (failed) {
  console.error('fixtures:check: the fixtures were not what the TypeScript makes now, and are written afresh. If the change is meant, commit them (`git diff -- fixtures/ fit/tests/`); never edit them by hand.');
  process.exit(1);
}
console.log(`fixtures:check: ${tracked.length} fixtures${WORDS ? ', those that can read the words,' : ''} agree with the TypeScript`);
