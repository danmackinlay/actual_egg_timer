/**
 * tools/iosBuild.ts: what the compiler wrote to a `.stringsdata` file, a
 * literal in one of SwiftUI's text calls, is refused, once however many
 * architectures wrote it; a source deleted since is not read; and a build
 * that wrote no file is told from a clean one. And the app's own files in
 * its bundle: Help's sources, and each alarm's sound as afinfo reads it.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SOUND_FILES, afinfoRead, bundleProblems, entries, refused } from '../../tools/iosBuild.ts';

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

/** afinfo's account of a file, as it prints it, its data `data`, `seconds` long. */
const afinfoText = (data: string, seconds: number): string =>
  `File:           x.caf\nFile type ID:   caff\nNum Tracks:     1\n----\nData format:     1 ch,  22050 Hz, ${data}\n`
  + `Channel layout: Mono\nestimated duration: ${seconds.toFixed(6)} sec\naudio bytes: 337382\n`;

test('afinfo’s format is its code, linear PCM’s, named by its samples, read as lpcm; and its length', () => {
  const ima4 = 'ima4 (0x00000000) 0 bits/channel, 34 bytes/packet, 64 frames/packet, 0 bytes/frame';
  assert.deepEqual(afinfoRead(afinfoText(ima4, 28.8)), { format: 'ima4', seconds: 28.8 });
  assert.deepEqual(afinfoRead(afinfoText('Int16', 2)), { format: 'lpcm', seconds: 2 });
  assert.equal(afinfoRead(afinfoText('Float32', 2)).format, 'lpcm');
  assert.equal(afinfoRead(afinfoText('aac  (0x00000000) 0 bits/channel', 2)).format, 'aac');
  assert.deepEqual(afinfoRead('Fail: AudioFileOpenURL failed'), { format: null, seconds: null });
});

test('the bundle has Help’s sources and every alarm’s file, each one a notification plays', () => {
  const app = mkdtempSync(join(tmpdir(), 'aet-iosbundle-'));
  try {
    const good = afinfoText('ima4 (0x00000000)', 28.8);
    const accounts = new Map<string, string | null>();
    const read = (path: string): string | null => {
      const name = path.split('/').at(-1)!;
      return accounts.has(name) ? accounts.get(name)! : good;
    };
    assert.equal(bundleProblems(app, read).length, 1 + SOUND_FILES.length, 'an empty bundle: every file missing');
    writeFileSync(join(app, 'help-sources.json'), '{"sources":[]}');
    for (const name of SOUND_FILES) writeFileSync(join(app, name), 'caf');
    assert.deepEqual(bundleProblems(app, read), []);
    const [first, second, third] = SOUND_FILES as [string, string, string];
    accounts.set(first, afinfoText('aac  (0x00000000)', 2));
    accounts.set(second, afinfoText('Int16', 30));
    accounts.set(third, null);
    writeFileSync(join(app, 'help-sources.json'), '');
    assert.deepEqual(bundleProblems(app, read), [
      'help-sources.json is not in the bundle, or is empty (ios/project.yml)',
      `${first}: format aac, not one a notification plays (lpcm, ima4, ulaw, alaw)`,
      `${second}: 30 s, not under 30`,
      `${third}: format unreadable, not one a notification plays (lpcm, ima4, ulaw, alaw)`,
      `${third}: no length s, not under 30`,
    ]);
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
});
