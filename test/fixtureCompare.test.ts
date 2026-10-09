/**
 * The rule `npm run fixtures:check` holds a fresh fixture to
 * (tools/fixtureCompare.ts): numbers to Swift's conformance tolerance,
 * everything else exactly.
 *
 * Run from the repo root (npm test does). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { compareFixtures, FIXTURE_TOLERANCE } from '../tools/fixtureCompare.js';

test('a number in its last bits is close, not different', () => {
  // decide.json's grid on x86 Linux and arm64 macOS (10 October 2026).
  const r = compareFixtures({ logWhite: [2.524908250280827, 1] }, { logWhite: [2.5249082502808267, 1] });
  assert.deepEqual(r.differences, []);
  assert.equal(r.close, 1);
  assert.ok(r.largest > 0 && r.largest < 1e-15);
});

test('a number beyond the tolerance differs, relative above 1 and absolute below', () => {
  const big = compareFixtures({ t: 400 }, { t: 400 * (1 + 3 * FIXTURE_TOLERANCE) });
  assert.equal(big.differences.length, 1);
  assert.equal(big.differences[0]!.path, '$.t');
  assert.equal(compareFixtures({ t: 400 }, { t: 400 * (1 + FIXTURE_TOLERANCE / 2) }).differences.length, 0);
  // Below 1 the tolerance is absolute, as Swift's expectClose is.
  assert.equal(compareFixtures({ p: 1e-14 }, { p: 2e-14 }).differences.length, 0);
  assert.equal(compareFixtures({ p: 0.5 }, { p: 0.5 + 3 * FIXTURE_TOLERANCE }).differences.length, 1);
});

test('everything but a number must be the same', () => {
  assert.equal(compareFixtures({ a: 'x' }, { a: 'y' }).differences.length, 1);
  assert.equal(compareFixtures({ a: null }, { a: 0 }).differences.length, 1);
  assert.equal(compareFixtures({ a: true }, { a: false }).differences.length, 1);
  assert.equal(compareFixtures({ a: [1, 2] }, { a: [1, 2, 3] }).differences[0]!.path, '$.a (length)');
  assert.equal(compareFixtures({ a: 1, b: 2 }, { b: 2, a: 1 }).differences[0]!.path, '$ (keys)');
  assert.equal(compareFixtures({ a: [1] }, { a: { 0: 1 } }).differences.length, 1);
  assert.deepEqual(compareFixtures({ a: [{ b: 'c' }] }, { a: [{ b: 'c' }] }), { close: 0, largest: 0, differences: [] });
});
