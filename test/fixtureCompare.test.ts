/**
 * The rule `npm run fixtures:check` holds a fresh fixture to
 * (tools/fixtureCompare.ts): numbers to Swift's conformance tolerance,
 * everything else exactly; and the layout every fixture is written in.
 *
 * Run from the repo root (npm test does). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { compareFixtures, FIXTURE_TOLERANCE, ROW_LIMIT, fixtureLayout } from '../tools/fixtureCompare.js';

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
