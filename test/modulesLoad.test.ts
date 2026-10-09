/**
 * Every module of the web app loads without a page: nothing finds its
 * elements or reads storage on import - `boot()` does both - so every module
 * can be tested. This asserts that and only that: what each module does is
 * its own tests'.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

test('every module of the web app loads without a document or storage', async () => {
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

