/**
 * That the committed fixtures are what the TypeScript makes of them now.
 *
 *   npm run fixtures:check     (npm run fixtures, then this)
 *
 * Each fixture just written is compared with the one in git's index by
 * tools/fixtureCompare.ts: the same keys, strings and lengths, and the same
 * numbers to 1e-13 of their value at every magnitude, so the check holds on
 * x86 Linux as on arm64 macOS, where the fixtures are made, and no number,
 * however small, moves unseen. A fixture that agrees but for its numbers'
 * last digits is put back as committed, so the check leaves the tree as it
 * found it; one that disagrees is left as written, for `git diff`, and the
 * differences are listed by path. A fixture git does not know fails, as one
 * the check cannot compare, and so does one committed in another layout
 * than one row per line (`fixtureLayout`), say by a branch from before it:
 * it is written in this one, its values unchanged, to be committed.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

import { compareFixtures, FIXTURE_TOLERANCE, fixtureLayout } from './fixtureCompare.js';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });

const untracked = git('ls-files', '--others', '--exclude-standard', '--', 'fixtures/').split('\n').filter(Boolean);
const tracked = git('ls-files', '--', 'fixtures/').split('\n').filter((f) => f.endsWith('.json'));

let failed = false;
for (const file of untracked) {
  console.error(`${file}: not in git; add it, or stop writing it`);
  failed = true;
}

const SHOWN = 20;
for (const file of tracked) {
  const fresh = readFileSync(file, 'utf8');
  const committed = git('show', `:${file}`);
  if (fresh === committed) continue;
  const { close, largest, differences } = compareFixtures(JSON.parse(committed), JSON.parse(fresh));
  if (differences.length === 0) {
    // The committed values, laid out as the generator lays them out: the
    // committed file itself, unless it was committed in another layout.
    const relaid = fixtureLayout(JSON.parse(committed));
    writeFileSync(file, relaid);
    if (relaid !== committed) {
      failed = true;
      console.error(`${file}: the same values, not laid out one row per line; written so, to be committed`);
      continue;
    }
    console.log(`${file}: ${close} numbers differ in their last digits (at most ${largest.toExponential(1)}), within ${FIXTURE_TOLERANCE}; kept as committed`);
    continue;
  }
  failed = true;
  console.error(`${file}: ${differences.length} differences from the committed fixture${close > 0 ? `, and ${close} numbers within ${FIXTURE_TOLERANCE}` : ''}`);
  for (const d of differences.slice(0, SHOWN)) {
    const error = d.error === null ? '' : ` (${d.error.toExponential(1)})`;
    console.error(`  ${d.path}: ${d.committed} -> ${d.fresh}${error}`);
  }
  if (differences.length > SHOWN) console.error(`  and ${differences.length - SHOWN} more`);
}

if (failed) {
  console.error('fixtures:check: the fixtures are not what the TypeScript makes now. If the change is meant, commit them (`git diff -- fixtures/`); never edit them by hand.');
  process.exit(1);
}
console.log(`fixtures:check: ${tracked.length} fixtures agree with the TypeScript`);
