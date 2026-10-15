/**
 * Which build may write on the web (src/ui/newer.ts): semantic versioning's
 * order, pre-releases included, and the verdict on a stored mark. The
 * iPhone's guard, with its build numbers, is tested in its own suite
 * (ios/EggTimerCore/Tests/EggTimerAppTests/NewerTests.swift).
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { compareVersions, parseVersion, writerCheck } from '../src/ui/newer.ts';

test('1. versions order as semantic versioning orders them', () => {
  const ascending = [
    '0.3.0', '0.4.0-1', '0.4.0-alpha', '0.4.0-alpha.1', '0.4.0-alpha.2', '0.4.0-alpha.10',
    '0.4.0-alpha.beta', '0.4.0-beta', '0.4.0', '0.4.1', '0.5.0-alpha.1', '0.5.0', '0.10.0', '1.0.0', '10.0.0',
  ];
  for (let i = 0; i < ascending.length; i++) {
    for (let j = 0; j < ascending.length; j++) {
      assert.equal(compareVersions(ascending[i], ascending[j]), Math.sign(i - j), `${ascending[i]} against ${ascending[j]}`);
    }
  }
});

test('2. what is not a version is not compared', () => {
  for (const text of ['', 'unknown', '0.4', '0.4.0.1', 'v0.4.0', '00.4.0', '0.4.0-', '0.4.0-alpha.01', '0.4.0+2', ' 0.4.0']) {
    assert.equal(parseVersion(text), null, text);
    assert.equal(compareVersions(text, '0.4.0'), null, text);
  }
  assert.deepEqual(parseVersion('0.4.0-alpha.1'), { major: 0, minor: 4, patch: 0, pre: ['alpha', '1'] });
});

test('3. a newer mark makes a build read-only; none, an older one or its own lets it write', () => {
  assert.equal(writerCheck(null, '0.4.0-alpha.1'), 'write');
  assert.equal(writerCheck('0.3.0-alpha.1', '0.4.0-alpha.1'), 'write');
  assert.equal(writerCheck('0.4.0-alpha.1', '0.4.0-alpha.1'), 'write');
  assert.equal(writerCheck('0.5.0-alpha.1', '0.4.0-alpha.1'), 'readOnly');
  assert.equal(writerCheck('0.4.0', '0.4.0-alpha.1'), 'readOnly');
  assert.equal(writerCheck('0.4.0-alpha.2', '0.4.0-alpha.1'), 'readOnly');
  // iOS marks without the pre-release: every alpha of a version is one.
  assert.equal(writerCheck('0.4.0', '0.4.0'), 'write');
  assert.equal(writerCheck('0.5.0', '0.4.0'), 'readOnly');
  // A mark no build writes is written over; a build that cannot place
  // itself writes over no version.
  assert.equal(writerCheck('garbage', '0.4.0'), 'write');
  assert.equal(writerCheck('0.3.0', 'unknown'), 'readOnly');
  assert.equal(writerCheck(null, 'unknown'), 'write');
});
