/**
 * The page's elements as the code names them (src/ui/dom.ts, `ELEMENTS`),
 * each in index.html under its id with its tag: what `bindDom` checks at
 * boot, checked here without a browser.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ELEMENTS } from '../src/ui/dom.ts';

test('every element the code names is in index.html, under its id, with its tag', () => {
  const tags = new Map<string, string>();
  for (const m of readFileSync('index.html', 'utf8').matchAll(/<([a-z][a-z0-9]*)\b[^>]*\sid="([^"]+)"/g)) tags.set(m[2], m[1]);
  for (const [id, tag] of Object.entries(ELEMENTS)) assert.equal(tags.get(id), tag, `#${id}`);
});
