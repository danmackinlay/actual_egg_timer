/**
 * The words-only check's choice (tools/wordsOnly.ts): which code reads the
 * catalogue, on a tree of the test's own, and what it picks here. That the
 * choice misses nothing the words move is tools/wordsOnlyProof.ts's, which
 * `npm run verify` runs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { FIXTURES } from '../tools/fixtures.ts';
import { makerModules, namesCatalogue, reach, wordsFixtures, wordsTests } from '../tools/wordsOnly.ts';

test('a string naming copy/ is a read; a comment, an index or another folder is not', () => {
  for (const reads of [
    `readFileSync('copy/en.json', 'utf8')`, 'readdirSync("copy")', 'fetch(`copy/${locale}.json`)',
    `new URL('../copy/en.json', import.meta.url)`, `join(root, 'copy', 'en.json')`,
  ]) assert.ok(namesCatalogue(reads), reads);
  for (const not of [
    '// reads copy/en.json\nexport const x = 1;', '/** `copy/<tag>.json` */ export const y = 2;',
    `node.dataset['copy']`, `readFileSync('test/data/copy-approved.txt')`, `run('copy:keys')`, `'fixtures/copy.json'`,
  ]) assert.ok(!namesCatalogue(not), not);
});

test('a test reads what the code it can run reads: imported, called, or run in a process of its own', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aet-words-only-'));
  try {
    const files: Record<string, string> = {
      'copy/en.json': '{ "locale": "en", "messages": {} }\n',
      'lib.ts': `import { readFileSync } from 'node:fs';\nexport const words = () => readFileSync('copy/en.json', 'utf8');\nexport const other = 1;\n`,
      'tools/run.ts': `import { readdirSync } from 'node:fs';\nconsole.log(readdirSync('copy'));\n`,
      'test/calls.test.ts': `import { words } from '../lib.ts';\nconsole.log(words());\n`,
      'test/shaken.test.ts': `import { other } from '../lib.ts';\nconsole.log(other);\n`,
      'test/runs.test.ts': `import { execFileSync } from 'node:child_process';\nexecFileSync(process.execPath, ['tools/run.ts']);\n`,
      'test/imports.test.ts': `import en from '../copy/en.json' with { type: 'json' };\nconsole.log(en);\n`,
      'test/says.test.ts': `// copy/en.json is the catalogue\nconst d = { copy: 1 };\nconsole.log(d['copy']);\n`,
    };
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    const got = await reach(Object.keys(files).filter((f) => f.endsWith('.test.ts')), root);
    assert.deepEqual(Object.fromEntries(got), {
      'test/calls.test.ts': 'lib.ts',
      'test/shaken.test.ts': null,
      'test/runs.test.ts': 'tools/run.ts, which it runs',
      'test/imports.test.ts': 'copy/en.json',
      'test/says.test.ts': null,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('here: the copy tests and the fixtures that render words, not the physics', async () => {
  const tests = await wordsTests();
  for (const t of ['test/copy.test.ts', 'test/en1750.test.ts', 'test/format.test.ts']) assert.ok(tests.includes(t), t);
  for (const t of ['test/sbc.test.ts', 'test/running.test.ts', 'test/core.test.ts']) assert.ok(!tests.includes(t), t);
  assert.deepEqual(makerModules(FIXTURES['units'] as () => unknown), ['tools/fixtures/english.ts', 'tools/fixtures/units.ts']);
  const fixtures = [...(await wordsFixtures(FIXTURES)).keys()];
  for (const f of ['format', 'units', 'sousvideCopy']) assert.ok(fixtures.includes(f), f);
  for (const f of ['step', 'running', 'reach', 'fitRecovery']) assert.ok(!fixtures.includes(f), f);
});
