/**
 * The table of stores (src/core/stores.ts): one row a store, one key per
 * app, and the format inside what is stored rather than in its key.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { STORES, STORE_LIST, inFormat, stamped } from '../src/core/stores.js';

test('every store is listed once, under its own name, and kept by at least one app', () => {
  assert.deepEqual(STORE_LIST.map((s) => s.name).sort(), Object.keys(STORES).sort());
  for (const [name, store] of Object.entries(STORES)) {
    assert.equal(store.name, name);
    assert.ok(store.web !== null || store.ios !== null, `${name} is kept somewhere`);
  }
});

test('no key is two stores\', on either app, and every web key is under aet.', () => {
  for (const app of ['web', 'ios'] as const) {
    const keys = STORE_LIST.map((s) => s[app]).filter((k): k is string => k !== null);
    assert.equal(new Set(keys).size, keys.length, `${app}: ${keys.join(', ')}`);
  }
  for (const s of STORE_LIST) if (s.web !== null) assert.ok(s.web.startsWith('aet.'), s.web);
});

test('a store with its format inside keeps none in its key, but the log, which keeps the key it began with', () => {
  for (const s of STORE_LIST) {
    if (s.format === null) continue;
    assert.ok(Number.isInteger(s.format) && s.format > 0, `${s.name}: ${s.format}`);
    if (s.name === 'calibration') continue;
    for (const key of [s.web, s.ios]) assert.ok(key === null || !/\.v\d+$/.test(key), `${s.name}: ${key}`);
  }
});

test('a store reads back only in its own format', () => {
  const written = JSON.parse(JSON.stringify(stamped(STORES.cook, { answers: 'none' }))) as unknown;
  assert.deepEqual(inFormat(STORES.cook, written), { v: STORES.cook.format, answers: 'none' });
  assert.equal(inFormat(STORES.settings, written), null, 'another store\'s format');
  assert.equal(inFormat(STORES.cook, { answers: 'none' }), null, 'no format');
  assert.equal(inFormat(STORES.share, { v: null }), null, 'a store with none inside reads nothing this way');
});
