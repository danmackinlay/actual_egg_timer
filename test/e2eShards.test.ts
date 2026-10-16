/**
 * CI's web e2e in shards (tools/e2e/shards.ts): every scenario runs in
 * exactly one shard, whatever the count. The scenarios are listed, never run.
 * The timings only keep the shards level, so a stale or missing one fails
 * nothing.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { allScenarios } from '../tools/e2e/all.ts';
import { parseShard, shard } from '../tools/e2e/shards.ts';

const names = Object.keys(allScenarios());

test('for any count, the shards hold every scenario once, each in the order run', () => {
  for (let n = 1; n <= 8; n++) {
    const shards = Array.from({ length: n }, (_, i) => shard(names, i + 1, n));
    const union = shards.flat();
    assert.equal(union.length, names.length, `${n} shards: ${union.length} run, ${names.length} scenarios`);
    assert.deepEqual([...union].sort(), [...names].sort(), `${n} shards`);
    for (const s of shards) assert.deepEqual(s, names.filter((x) => s.includes(x)), `${n} shards: out of order`);
  }
});

test('the split is the same every time, and one shard is the whole list', () => {
  assert.deepEqual(shard(names, 2, 4), shard([...names], 2, 4));
  assert.deepEqual(shard(names, 1, 1), names);
});

test('--shard reads i/n, one-based, and nothing else', () => {
  assert.deepEqual(parseShard('2/4'), { i: 2, n: 4 });
  for (const bad of ['0/4', '5/4', '1/0', '2', 'a/b', '', '1/4/2']) assert.throws(() => parseShard(bad), bad);
});
