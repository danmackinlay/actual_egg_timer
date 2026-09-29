/**
 * The web app's structure: every module can be imported without a page, and
 * the hash routes (src/ui/views.ts).
 *
 * The app used to find its elements and read storage when app.ts was
 * imported, so no test could import it; `boot()` does both now.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

import { viewFromHash } from '../src/ui/views.js';

test('every module of the web app imports without a document or storage', async () => {
  // main.ts boots the page, and gridWorker.ts is a worker's whole body: those
  // two run when loaded, by design.
  const modules = readdirSync('src/ui')
    .filter((f) => f.endsWith('.ts') && f !== 'main.ts' && f !== 'gridWorker.ts');
  assert.ok(modules.includes('app.ts'));
  assert.equal((globalThis as { document?: unknown }).document, undefined);
  for (const file of modules) {
    await import(`../src/ui/${file.replace(/\.ts$/, '.js')}`);
  }
});

test('the hash names the view, and a Help section to scroll to', () => {
  assert.deepEqual(viewFromHash(''), { view: 'egg', target: null });
  assert.deepEqual(viewFromHash('#'), { view: 'egg', target: null });
  assert.deepEqual(viewFromHash('#settings'), { view: 'settings', target: null });
  assert.deepEqual(viewFromHash('#kitchen'), { view: 'settings', target: null }, 'the old address still opens Settings');
  assert.deepEqual(viewFromHash('#help'), { view: 'help', target: null });
  assert.deepEqual(viewFromHash('#help-odds'), { view: 'help', target: 'help-odds' });
  assert.deepEqual(viewFromHash('#nowhere'), { view: 'egg', target: null });
});
