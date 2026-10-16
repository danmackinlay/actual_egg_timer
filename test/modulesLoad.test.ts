/**
 * Every module of the web app loads without a page: nothing finds its
 * elements or reads storage on import - `boot()` does both - so every module
 * can be tested; and every name a lab page in `tools/` imports is still
 * exported. This asserts that and only that: what each module does is its
 * own tests'.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('every module of the web app loads without a document or storage', async () => {
  // main.ts boots the page, and gridWorker.ts is a worker's whole body: those
  // two run when loaded, by design.
  const modules = readdirSync('src/ui')
    .filter((f) => f.endsWith('.ts') && f !== 'main.ts' && f !== 'gridWorker.ts');
  assert.ok(modules.includes('app.ts'));
  assert.equal((globalThis as { document?: unknown }).document, undefined);
  for (const file of modules) {
    await import(`../src/ui/${file}`);
  }
});

// Nothing type-checks a page's module script, so a name a lab page imports
// that its module stopped exporting breaks the page in the browser only.
test('every name a tools/*.html module script imports from src/ is exported', async () => {
  const pages = readdirSync('tools').filter((f) => f.endsWith('.html'));
  assert.ok(pages.includes('egg-section.html'));
  let checked = 0;
  for (const page of pages) {
    const html = readFileSync(`tools/${page}`, 'utf8');
    for (const [, script] of html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)) {
      for (const [, names, from] of script.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.\.\/src\/[^']+)'/g)) {
        const mod = await import(new URL(from, new URL(`../tools/${page}`, import.meta.url)).href);
        for (const name of names.split(',').map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
          assert.ok(name in mod, `${page} imports ${name} from ${from}, which does not export it`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 0, 'no imports found: the pattern no longer matches the pages');
});

