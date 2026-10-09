/**
 * The rule `npm run fixtures:check` holds a fresh fixture to
 * (tools/fixtureCompare.ts): numbers to 1e-13 of their value at every
 * magnitude, everything else exactly; and the layout every fixture is
 * written in.
 *
 * Run from the repo root (npm test does). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compareFixtures, FIXTURE_TOLERANCE, ROW_LIMIT, SMALLEST_NORMAL, fixtureLayout, relativeDifference,
} from '../tools/fixtureCompare.js';

/** Whether `fresh` passes for `committed`. */
const agrees = (committed: number, fresh: number): boolean =>
  compareFixtures({ x: committed }, { x: fresh }).differences.length === 0;

test('a number in its last bits is close, not different', () => {
  // A number in decide.json's grid as x86 Linux and arm64 macOS make it.
  const r = compareFixtures({ logWhite: [2.524908250280827, 1] }, { logWhite: [2.5249082502808267, 1] });
  assert.deepEqual(r.differences, []);
  assert.equal(r.close, 1);
  assert.ok(r.largest > 0 && r.largest < 1e-15);
  // The farthest apart the two make any number: a particle's offset near
  // zero, whose error is an ulp of the terms it is summed from.
  assert.ok(agrees(-0.003050281876359709, -0.0030502818763599865));
});

test('the tolerance is relative at every magnitude, on both sides of 1', () => {
  for (const x of [400, 1, 0.5, 1e-6, 1e-14, 4e-216, 1e-300, -3e-5]) {
    assert.ok(agrees(x, x * (1 + FIXTURE_TOLERANCE / 2)), `${x} within half the tolerance`);
    assert.ok(!agrees(x, x * (1 + 3 * FIXTURE_TOLERANCE)), `${x} beyond three times it`);
  }
  const big = compareFixtures({ t: 400 }, { t: 400 * (1 + 3 * FIXTURE_TOLERANCE) });
  assert.equal(big.differences[0]!.path, '$.t');
  assert.ok(big.differences[0]!.error! > 2 * FIXTURE_TOLERANCE);
});

test('a small number doubled, or changing sign, differs', () => {
  assert.ok(!agrees(1e-14, 2e-14));
  assert.ok(!agrees(1.809504045294345e-16, -1.809504045294345e-16));
  assert.equal(relativeDifference(1e-20, -1e-20), 2);
  assert.ok(!agrees(0, 1e-300), 'a zero stays zero');
  assert.ok(!agrees(1e-300, 0));
});

test('below the smallest normal double the bound is absolute', () => {
  assert.equal(relativeDifference(0, 0), 0);
  assert.ok(agrees(0, Number.MIN_VALUE), 'zero and the smallest denormal');
  assert.ok(agrees(5e-321, 5.0000001e-321));
  assert.ok(!agrees(0, SMALLEST_NORMAL * FIXTURE_TOLERANCE * 3));
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

test('a fixture is laid out one row per line, and reads back as the same value', () => {
  const fixture = {
    about: 'x',
    grid: { alphaCount: 7, times: [60, 120.5] },
    cases: [{ why: 'a', at: [1, 2], out: { t: 0.1 } }, { why: 'b', at: [], out: null }],
    traces: [{ note: 'n', steps: [{ event: { kind: 'start' }, effects: [{ kind: 'persist' }] }] }],
    empty: [],
    dropped: undefined,
  };
  const text = fixtureLayout(fixture);
  assert.equal(text, [
    '{',
    '  "about": "x",',
    '  "grid": {"alphaCount": 7, "times": [60, 120.5]},',
    '  "cases": [',
    '    {"why": "a", "at": [1, 2], "out": {"t": 0.1}},',
    '    {"why": "b", "at": [], "out": null}',
    '  ],',
    '  "traces": [',
    '    {"note": "n", "steps": [{"event": {"kind": "start"}, "effects": [{"kind": "persist"}]}]}',
    '  ],',
    '  "empty": []',
    '}',
    '',
  ].join('\n'));
  assert.equal(JSON.stringify(JSON.parse(text)), JSON.stringify(fixture), 'the same value, keys in order');
  assert.equal(fixtureLayout(JSON.parse(text)), text, 'laid out again, the same text');
});

test('a row longer than the limit is opened, and its own rows go a line each', () => {
  const long = 'y'.repeat(ROW_LIMIT);
  const text = fixtureLayout({ traces: [{ note: long, steps: [{ a: 1 }, { a: 2 }] }] });
  assert.equal(text, [
    '{',
    '  "traces": [',
    '    {',
    `      "note": "${long}",`,
    '      "steps": [',
    '        {"a": 1},',
    '        {"a": 2}',
    '      ]',
    '    }',
    '  ]',
    '}',
    '',
  ].join('\n'));
});
