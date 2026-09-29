/**
 * The copy proofs' draft lookup: a draft by name or by the commit it was
 * applied to, and a refusal - never a quiet fallback to the latest draft -
 * for anything else.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DRAFTS, LATEST_DRAFT, draftFor } from '../tools/copyDraft.js';

test('draftFor: the latest when not told, and by name or by base', () => {
  const names = Object.keys(DRAFTS);
  assert.equal(LATEST_DRAFT, names[names.length - 1]);
  assert.equal(draftFor(), DRAFTS[LATEST_DRAFT]);
  assert.equal(draftFor('units'), DRAFTS['units']);
  assert.equal(draftFor(DRAFTS['units'].base), DRAFTS['units']);
  assert.equal(draftFor(`${DRAFTS['units'].base}0000`), DRAFTS['units']);
});

test('draftFor: a mistyped name, an unknown ref or a shared base throws', () => {
  assert.throws(() => draftFor('unit'), /no draft/);
  assert.throws(() => draftFor('HEAD'), /no draft/);
  assert.throws(() => draftFor('toString'), /no draft/);
  assert.throws(() => draftFor('deadbeef'), /no draft/);
  // iosA and oddsHelp were applied on the same commit.
  assert.throws(() => draftFor(DRAFTS['iosA'].base), /more than one draft/);
});
