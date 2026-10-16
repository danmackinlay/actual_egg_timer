/**
 * `npm run copy:literals` (tools/copyLiterals.ts) fails words written into a
 * text call, interpolated or not, and passes a catalogue key.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { lintSwift } from '../tools/copyLiterals.ts';

test('words in a text call fail, interpolated or not; a key passes', () => {
  assert.equal(lintSwift('V.swift', 'Text("Hello")').length, 1);
  assert.equal(lintSwift('V.swift', 'Text("Eggs: \\(count)")').length, 1);
  assert.deepEqual(lintSwift('V.swift', 'Text(tr(.`more.expanded`, ["mass": .string(weight)]))'), []);
});
