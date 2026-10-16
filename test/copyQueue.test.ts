/**
 * The review queue's rules (tools/copyApproval.ts, LANGUAGE.md section 3):
 * the approved record is one commit, the queue is the words at it against
 * the words now, and a twin is stale when its English has moved since the
 * twin's line was last written. What is in the queue never fails here; a
 * malformed record does.
 *
 * On data of its own, not the repository's history, since CI clones
 * shallowly: 1b asks git only for HEAD and for a hash no clone has. Run from the repo root (npm test does). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  APPROVED_PATH, ApprovalError, type CatalogueJson, UNCOMMITTED, type Words, approvedProblem, commitProblem, keyCommits,
  readApproved, reviewQueue, twinStates, wordsAt,
} from '../tools/copyApproval.ts';

test('1a. the approved record is one commit\'s full hash on a line', () => {
  assert.equal(approvedProblem(readFileSync(APPROVED_PATH, 'utf8')), null);
  assert.match(readApproved(), /^[0-9a-f]{40}$/);
  assert.notEqual(approvedProblem('2978f81\n'), null, 'a short hash');
  assert.notEqual(approvedProblem('HEAD\n'), null, 'a ref');
  assert.notEqual(approvedProblem(`${'a'.repeat(40)}\n${'b'.repeat(40)}\n`), null, 'two lines');
});

test('1b. a record naming no commit says so, not that the commit has no catalogue', () => {
  assert.equal(commitProblem('HEAD', false), null);
  assert.match(commitProblem('a'.repeat(40), false) ?? '', /^is no commit in this clone/);
  assert.throws(() => wordsAt('a'.repeat(40)), (e: Error) => e instanceof ApprovalError
    && e.message === `${APPROVED_PATH} names ${'a'.repeat(40)}, which is no commit in this clone: it was rebased away, `
      + 'or the clone is shallow');
});

const en = (messages: CatalogueJson['messages']): CatalogueJson => ({ locale: 'en', messages: messages });

const THEN: Words = {
  en: en({
    same: { text: 'Same' },
    moved: { text: 'Moved then' },
    pot: { text: 'the pan' },
    eggs: { count: 'n', one: '{n} egg', other: '{n} eggs' },
    gone: { text: 'Gone' },
  }),
  overlays: { 'en-US': { locale: 'en-US', messages: { pot: { base: 'the pan', text: 'the pot' } } } },
};

const NOW: Words = {
  en: en({
    same: { text: 'Same' },
    moved: { text: 'Moved now' },
    pot: { text: 'the pan' },
    eggs: { count: 'n', other: '{n} eggs', one: '{n} egg' },
    fresh: { text: 'Fresh' },
  }),
  overlays: { 'en-US': { locale: 'en-US', messages: { pot: { base: 'the pan', text: 'the saucepan' } } } },
};

test('2a. the queue: changed, added and retired keys, nothing approved', () => {
  const q = reviewQueue(THEN, NOW);
  assert.deepEqual(q.map((e) => [e.key, e.state]),
    [['moved', 'changed'], ['pot', 'changed'], ['fresh', 'added'], ['gone', 'retired']]);
  assert.deepEqual([q[0].approved, q[0].current], [{ text: 'Moved then' }, { text: 'Moved now' }]);
  // An overlay's words moving puts the key in the queue, its English unchanged.
  assert.deepEqual(q[1].overlays, [{ tag: 'en-US', approved: { text: 'the pot' }, current: { text: 'the saucepan' } }]);
  assert.equal(q[3].current, null);
  // Plural forms compare as words, whatever order they are written in.
  assert.ok(!q.some((e) => e.key === 'eggs'));
  assert.deepEqual(reviewQueue(NOW, NOW), []);
});

test('2b. which commit last wrote each key, from git blame --porcelain', () => {
  const a = 'a'.repeat(40);
  const porcelain = [
    `${a} 1 1 2`, 'author x', 'filename copy/en-x-1750.json', '\t{',
    `${UNCOMMITTED} 4 2`, '\t    "same": { "text": "Ye same" },',
    `${a} 3 3`, '\t    "moved": { "text": "Moved, then" }',
  ].join('\n');
  assert.deepEqual([...keyCommits(porcelain)], [['same', UNCOMMITTED], ['moved', a]]);
});

test('2c. a twin is current while its English is the English it was written against', () => {
  const t1 = '1'.repeat(40);
  const t2 = '2'.repeat(40);
  const atCommit = new Map([[t1, THEN.en], [t2, NOW.en]]);
  const twins = new Map([['same', t1], ['moved', t1], ['eggs', t1], ['fresh', t2], ['pot', UNCOMMITTED]]);
  const states = twinStates(NOW.en, twins, (c) => atCommit.get(c) ?? null);
  assert.deepEqual(Object.fromEntries(states), {
    same: 'current',
    // Written when the English said "Moved then".
    moved: 'stale',
    // Only the forms' order moved, not the words.
    eggs: 'current',
    // A twin being rewritten now is written against today's English.
    pot: 'current',
    fresh: 'current',
  });
  // A key the translation lacks shows the English.
  assert.equal(twinStates(NOW.en, new Map(), () => null).get('same'), 'missing');
  // A twin from a commit with no English, or without the key, is stale.
  assert.equal(twinStates(NOW.en, new Map([['same', t1]]), () => null).get('same'), 'stale');
});
