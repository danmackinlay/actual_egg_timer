/**
 * tools/iosBuild.ts: what the compiler wrote to a `.stringsdata` file, a
 * literal in one of SwiftUI's text calls, is refused, once however many
 * architectures wrote it; a source deleted since is not read; and a build
 * that wrote no file is told from a clean one.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { entries, refused } from '../../tools/iosBuild.ts';

/** A `.stringsdata` as the compiler writes it, for `source`, with `keys` at
 *  lines 1, 2, …. */
const stringsdata = (source: string, keys: string[]): string => JSON.stringify({
  source,
  tables: keys.length === 0 ? {} : {
    Localizable: keys.map((key, i) => ({ comment: '', key, location: { startingColumn: 18, startingLine: i + 1 } })),
  },
  version: 1,
});

test('each literal the compiler took for a strings table is an entry, where it was written', () => {
  assert.deepEqual(entries(stringsdata('/a/V.swift', [])), []);
  assert.deepEqual(entries(stringsdata('/a/V.swift', ['Hello', 'Eggs: %@'])), [
    '/a/V.swift:1: "Hello"',
    '/a/V.swift:2: "Eggs: %@"',
  ]);
});

test('a build’s entries are read once each, from sources that are still there', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aet-iosbuild-'));
  try {
    const source = join(dir, 'V.swift');
    writeFileSync(source, '');
    for (const arch of ['arm64', 'x86_64']) {
      mkdirSync(join(dir, arch));
      writeFileSync(join(dir, arch, 'V.stringsdata'), stringsdata(source, ['Hello']));
      writeFileSync(join(dir, arch, 'Gone.stringsdata'), stringsdata(join(dir, 'Gone.swift'), ['Bye']));
    }
    assert.deepEqual(refused(dir), { files: 2, entries: [`${source}:1: "Hello"`] });
    writeFileSync(join(dir, 'arm64', 'V.stringsdata'), stringsdata(source, []));
    writeFileSync(join(dir, 'x86_64', 'V.stringsdata'), stringsdata(source, []));
    assert.deepEqual(refused(dir), { files: 2, entries: [] });
    assert.deepEqual(refused(join(dir, 'nothing')), { files: 0, entries: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
