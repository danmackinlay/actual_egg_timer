/**
 * The words waiting to be read (tools/copyQueue.ts): the queue the review
 * page and the words' editor share, and approving, on a repository of the
 * test's own (test/repo.ts).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { APPROVED_PATH, approve, reviewQueue } from '../tools/copyQueue.ts';
import { catalogue, scratchRepo } from './repo.ts';

const REVIEW = join(import.meta.dirname, '..', 'tools', 'copyReview.ts');

/** A repository whose approved words are `a`, `b`, `c`, with a US line for
 *  `a`, and whose words now change `b`, add `d`, retire `c` and change `a`'s
 *  US line alone. */
function changedRepo() {
  const repo = scratchRepo({
    'copy/en.json': catalogue('en', { a: { text: 'Pan' }, b: { text: 'Lid on' }, c: { text: 'Gone soon' } }),
    'copy/en-US.json': catalogue('en-US', { a: { base: 'Pan', text: 'Pot' } }),
    'copy/en.notes.json': '{ "notes": { "a": { "surface": "label" }, "b": { "surface": "label", "note": "the lid" } } }\n',
  });
  repo.commit('approved', { [APPROVED_PATH]: `${repo.git('rev-parse', 'HEAD')}\n` });
  repo.commit('the words move', {
    'copy/en.json': catalogue('en', { d: { text: 'New' }, a: { text: 'Pan' }, b: { text: 'Lid off' } }),
    'copy/en-US.json': catalogue('en-US', { a: { base: 'Pan', text: 'Pot, lidded' } }),
  });
  return repo;
}

test('the queue: changed, then added, then retired, each in the English order', () => {
  const repo = changedRepo();
  const q = reviewQueue(repo.dir, 'HEAD');
  assert.deepEqual(q.keys, [
    { key: 'a', state: 'Changed' }, { key: 'b', state: 'Changed' }, { key: 'd', state: 'Added' }, { key: 'c', state: 'Retired' },
  ]);
  assert.deepEqual(q.tags, ['en', 'en-US']);
  // The working tree's queue is the commit's while copy/ is clean, and moves with it.
  assert.deepEqual(reviewQueue(repo.dir, null).keys, q.keys);
  repo.write({ 'copy/en.json': catalogue('en', { d: { text: 'New' }, a: { text: 'Pan' }, b: { text: 'Lid on' } }) });
  assert.deepEqual(reviewQueue(repo.dir, null).keys.map((k) => k.key), ['a', 'd', 'c']);
  assert.deepEqual(reviewQueue(repo.dir, 'HEAD').keys, q.keys, 'a commit\'s queue reads no uncommitted words');
});

test('the review page lists the queue\'s keys, in its order and its sections', () => {
  const repo = changedRepo();
  const out = join(repo.dir, 'review.html');
  execFileSync(process.execPath, [REVIEW, out], { cwd: repo.dir, stdio: 'pipe' });
  const html = readFileSync(out, 'utf8');
  const shown = [...html.matchAll(/<h2>(\w+) \(\d+\)<\/h2>|<h3><code>([^<]+)<\/code><\/h3>/g)].map((m) => m[1] ?? m[2]);
  assert.deepEqual(shown, ['Changed', 'a', 'b', 'Added', 'd', 'Retired', 'c']);
});

test('approving records the commit named, or HEAD, and refuses HEAD with words uncommitted', () => {
  const repo = changedRepo();
  const first = repo.git('rev-list', '--max-parents=0', 'HEAD');
  assert.equal(approve(first, repo.dir), first);
  assert.equal(readFileSync(join(repo.dir, APPROVED_PATH), 'utf8'), `${first}\n`);
  assert.equal(approve(undefined, repo.dir), repo.git('rev-parse', 'HEAD'));
  assert.throws(() => approve('no-such-commit', repo.dir), /not a commit/);
  repo.write({ 'copy/en.json': catalogue('en', { a: { text: 'Pan, edited' } }) });
  assert.throws(() => approve(undefined, repo.dir), /copy\/ has changes/);
  assert.equal(approve(first, repo.dir), first, 'a named commit is what was read, whatever the tree holds');
});
