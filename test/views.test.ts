/**
 * The hash routes (src/ui/views.ts).
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { viewFromHash } from '../src/ui/views.js';

test('the hash names the view, and a Help section to scroll to', () => {
  assert.deepEqual(viewFromHash(''), { view: 'egg', target: null });
  assert.deepEqual(viewFromHash('#'), { view: 'egg', target: null });
  assert.deepEqual(viewFromHash('#settings'), { view: 'settings', target: null });
  assert.deepEqual(viewFromHash('#kitchen'), { view: 'settings', target: null }, 'the old address still opens Settings');
  assert.deepEqual(viewFromHash('#help'), { view: 'help', target: null });
  assert.deepEqual(viewFromHash('#help-odds'), { view: 'help', target: 'help-odds' });
  assert.deepEqual(viewFromHash('#nowhere'), { view: 'egg', target: null });
});
