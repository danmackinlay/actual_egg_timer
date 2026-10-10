/**
 * The fit's records from a results file, and the owner's trusted IDs
 * (tools/eggsImport.ts, `npm run eggs -- import`).
 *
 * A round trip with no fixture: records made here, kept in a store the way
 * both apps keep one, written into a results file by core's own
 * `resultsFile`, read back by the import - in process and through the
 * command line - and every record comes out as it went in, under the ID it
 * is filed under, and trusted when that ID is on the list.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EggRecord, LIKELIHOOD_ID, MODEL_ID, parseRecord, resultsFile } from '../src/core/record.js';
import { LITERATURE_POPULATION } from '../src/core/infer.js';
import { recordAt } from '../tools/common.js';
import {
  Line, canonical, importResults, parseTrusted, readFitRecord, readTrusted, sameEggKey, tagTrusted,
} from '../tools/eggsImport.js';

const UID = '5f0c3a52-7b1e-4d0a-9c33-2a8e61f0b7d4';

function log(): EggRecord[] {
  return [recordAt(0.3, 400, 'runny', 'runny'), recordAt(0.5, 430, 'jammy', null), recordAt(0.6, 460, null, null),
    recordAt(0.45, 420, 'fudgy', 'firm')];
}

/** A store as the apps keep one (src/ui/calibrationStore.ts `encodeKept`), less
 *  the posterior the import never reads. */
function store(records: unknown[], unread: { at: number; record: unknown }[] = []): string {
  return JSON.stringify({ v: 4, p: LITERATURE_POPULATION.id, m: LIKELIHOOD_ID, base: null, cal: null, folded: 0,
    log: records, ...(unread.length > 0 ? { unread: unread } : {}) });
}

function file(stored: string | null, uid: string | null = UID): string {
  return resultsFile({ app: 'ios', appVersion: '0.5.0', exported: '2026-10-05T10:00:00.000Z',
    population: LITERATURE_POPULATION.id, uid: uid }, stored);
}

/** A results file as an app before 0.5 wrote one: the stored copies it could
 *  not read beside the store, under `unread`. */
function oldFile(stored: string, aside: string[]): string {
  const file = JSON.parse(resultsFile({ app: 'ios', appVersion: '0.4.0', exported: '2026-10-05T10:00:00.000Z',
    population: LITERATURE_POPULATION.id, uid: UID }, stored)) as Record<string, unknown>;
  file['unread'] = aside.map((a) => {
    try {
      return JSON.parse(a) as unknown;
    } catch {
      return a;
    }
  });
  return JSON.stringify(file);
}

test('1. every record comes back as it went in, in its place, under the file\'s ID', () => {
  const records = log();
  const got = importResults(file(store(records)));
  assert.equal(got.uid, UID);
  assert.equal(got.lines.length, 4);
  assert.equal(got.fromStore, 4);
  for (let i = 0; i < 4; i++) {
    const l = got.lines[i];
    assert.equal(l.tier, 'open', 'nothing attested an export');
    assert.equal(l.source, 'export');
    assert.equal(l.seq, i, 'its place in the log, which is what sharing sends as seq');
    assert.deepEqual(parseRecord(l.record), { ...records[i], uid: UID });
  }
  // --uid wins over the file's.
  assert.equal(importResults(file(store(records)), 'other-id').lines[0].record !== null, true);
  assert.equal((importResults(file(store(records)), 'other-id').lines[0].record as { uid: string }).uid, 'other-id');
  // No ID anywhere: refused, with what to do.
  assert.throws(() => importResults(file(store(records), null)), /--uid/);
  assert.throws(() => importResults('{"file":2}'), /version/);
});

test('2. a file from before 0.5: what its app set aside follows the log; an egg seen twice is written once', () => {
  const records = log();
  const newer = { ...records[1], v: 2, fromTheFuture: true };
  // The store as an older build left it: one record it could not read, set
  // aside beside the log.
  const stored = store([records[0], records[2], records[3]], [{ at: 1, record: newer }]);
  // Aside: an older copy of the same log plus one egg the store lost, a cook
  // in progress, and text that never parsed.
  const lost = recordAt(0.7, 480, 'fudgy', 'tender');
  const older = store([records[0], lost]);
  const got = importResults(oldFile(stored, [older, '{"startedAt":1}', '{damaged']));
  assert.deepEqual(got.lines.map((l) => l.seq), [0, 1, 2, 3, 4]);
  assert.deepEqual((got.lines[3].record as { fromTheFuture?: boolean }).fromTheFuture, true, 'after the log');
  assert.deepEqual(parseRecord(got.lines[4].record), { ...lost, uid: UID });
  assert.equal(got.fromAside, 1);
  assert.equal(got.duplicates, 1, 'records[0] is in the older copy too');
});

test('2b. the fit reads a record from before 0.5: absent fields as null, the old yolk answer kept', () => {
  const r = { ...log()[0], uid: UID } as Record<string, unknown>;
  const old: Record<string, unknown> = { ...r, yolk: -1, egg: { mass_g: 68, massFrom: 'scale' } };
  for (const key of ['yolkWord', 'model', 'probe', 'forecast']) delete old[key];
  const read = readFitRecord(old);
  assert.ok(read !== null);
  assert.equal(read.yolk, -1);
  assert.equal(read.model, null, 'a record from before E6 names no model');
  assert.equal(read.record.yolkWord, null);
  assert.equal(read.record.egg.sizeTable, null);
  assert.equal(parseRecord(old), null, 'which the apps no longer read');
  assert.equal(readFitRecord({ ...r, yolk: 0 }), null, 'never both yolk answers');
  assert.equal(readFitRecord({ ...r, yolkWord: null, yolk: 2 }), null);
  assert.deepEqual(readFitRecord(r), { record: parseRecord(r), yolk: null, model: MODEL_ID });
});

test('3. the trusted list: a file and the environment, comments and separators', () => {
  assert.deepEqual(parseTrusted('# mine\nabc  # the phone\n\n def,ghi\n'), ['abc', 'def', 'ghi']);
  const dir = mkdtempSync(join(tmpdir(), 'trusted-'));
  try {
    const path = join(dir, 'trusted.local.txt');
    writeFileSync(path, `${UID}\n`);
    assert.deepEqual([...readTrusted(path, undefined)], [UID]);
    assert.deepEqual([...readTrusted(join(dir, 'none.txt'), 'x, y')].sort(), ['x', 'y']);
    assert.deepEqual([...readTrusted(path, 'x')].sort(), [UID, 'x'].sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const lines: Line[] = importResults(file(store(log()))).lines;
  lines.push({ tier: 'attested', seq: 0, record: { ...log()[0], uid: 'someone-else' } });
  // Pulled from the live store under a trusted ID: anyone who learned the ID
  // could have posted it, so only the owner's own file is trusted.
  lines.push({ tier: 'open', seq: 9, record: { ...log()[0], uid: UID } });
  assert.equal(tagTrusted(lines, new Set([UID])), 4);
  assert.deepEqual(lines.map((l) => l.trusted === true), [true, true, true, true, false, false]);
  assert.equal(tagTrusted(lines, new Set()), 0);
  assert.equal(lines.some((l) => l.trusted !== undefined), false, 'untagged when the list no longer has it');
});

test('4. one egg is one key, whichever app wrote it and in whatever key order', () => {
  const r = { ...log()[0], uid: UID };
  const reordered = Object.fromEntries(Object.entries(r).reverse());
  assert.equal(canonical(reordered), canonical(r));
  const absent = { ...r } as Record<string, unknown>;
  delete absent['probe'];
  delete absent['forecast'];
  assert.equal(sameEggKey(absent), sameEggKey(r), 'an absent nullable field is a null one');
  assert.notEqual(sameEggKey({ ...r, yolkWord: null, yolk: 1 }), sameEggKey(r));
});

test('5. the command line: import, then emulate keeps the pull\'s copy of an egg shared too, trusted from the file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'import-'));
  try {
    const input = join(dir, 'actual-egg-timer-results-2026-10-05.json');
    const out = join(dir, 'imported.jsonl');
    writeFileSync(input, file(store(log())));
    const run = spawnSync(process.execPath, ['dist/tools/eggs.js', 'import', input, out], {
      encoding: 'utf8', env: { ...process.env, EGGFIT_TRUSTED: UID },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /4 records under/);
    assert.match(run.stdout, /that ID is trusted/);
    const lines = readFileSync(out, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Line);
    assert.equal(lines.length, 4);
    assert.ok(lines.every((l) => l.trusted === true && l.source === 'export'));
    assert.deepEqual(lines.map((l) => parseRecord(l.record)), log().map((r) => ({ ...r, uid: UID })));

    // The same cook's first egg, pulled from the store as attested, first.
    const pulled: Line = { tier: 'attested', seq: 0, record: { ...log()[0], uid: UID } };
    const all = join(dir, 'all.jsonl');
    writeFileSync(all, [pulled, ...lines].map((l) => JSON.stringify(l)).join('\n') + '\n');
    const emulated = join(dir, 'emulated.json');
    const em = spawnSync(process.execPath, ['dist/tools/eggs.js', 'emulate', all, emulated], { encoding: 'utf8' });
    assert.equal(em.status, 0, em.stderr);
    const e = JSON.parse(readFileSync(emulated, 'utf8')) as {
      counts: { twice: number; unanswered: number };
      eggs: { seq: number; tier: string; trusted: boolean; source?: string }[];
    };
    assert.equal(e.counts.twice, 1);
    assert.equal(e.counts.unanswered, 1);
    // The pulled copy is kept, and is the owner's: its twin in their file
    // is trusted, so it is.
    assert.deepEqual(e.eggs.map((x) => [x.seq, x.tier, x.trusted, x.source]),
      [[0, 'attested', true, 'export'], [1, 'open', true, 'export'], [3, 'open', true, 'export']]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
