/**
 * The web's table of stores (src/ui/stores.ts): one row a store, one key
 * each, under `aet.`, and the format inside what is stored rather than in
 * its key.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { STORES, inFormat, stamped } from '../src/ui/stores.ts';

test('every store has a key of its own under aet.', () => {
  const keys = Object.values(STORES).map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length, keys.join(', '));
  for (const key of keys) assert.ok(key.startsWith('aet.'), key);
});

test('a store with its format inside keeps none in its key, but the log, which keeps the key it began with', () => {
  for (const [name, s] of Object.entries(STORES)) {
    if (s.format === null) continue;
    assert.ok(Number.isInteger(s.format) && s.format > 0, `${name}: ${s.format}`);
    if (name !== 'calibration') assert.ok(!/\.v\d+$/.test(s.key), `${name}: ${s.key}`);
  }
});

test('a store reads back only in its own format', () => {
  const written = JSON.parse(JSON.stringify(stamped(STORES.cook, { answers: 'none' }))) as unknown;
  assert.deepEqual(inFormat(STORES.cook, written), { v: STORES.cook.format, answers: 'none' });
  assert.equal(inFormat(STORES.settings, written), null, 'another store\'s format');
  assert.equal(inFormat(STORES.cook, { answers: 'none' }), null, 'no format: a store from before formats were inside');
  assert.equal(inFormat(STORES.share, { v: null }), null, 'a store with none inside reads nothing this way');
  const format = STORES.settings.format;
  for (const v of [null, String(format), true, format + 0.5, -1, format - 1, format + 1]) {
    assert.equal(inFormat(STORES.settings, { v: v, doneness: 0.5 }), null, `a format of ${JSON.stringify(v)}`);
  }
  assert.notEqual(inFormat(STORES.settings, { v: format, doneness: 0.5 }), null);
  for (const raw of [null, 1, 'v1', [{ v: format }]]) assert.equal(inFormat(STORES.settings, raw), null, JSON.stringify(raw));
});
