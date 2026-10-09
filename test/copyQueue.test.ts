/**
 * The review queue's state (tools/copyApproval.ts): copy/approved.json and
 * each translation's copy/<tag>.base.json are well formed, and the queue,
 * the twins' states and the stamps do what LANGUAGE.md section 3 says. What
 * is in the queue never fails here; a malformed file does.
 *
 * Run from the repo root (npm test does). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  APPROVED_PATH, CatalogueJson, approvedProblems, baseProblems, basePath, hashTemplates, readApproved, readBases,
  reviewQueue, stamp, stampBases, translationTags, twinQueue, twinState,
} from '../tools/copyApproval.js';

test('1a. copy/approved.json is well formed: every hash its templates\'', () => {
  const json = JSON.parse(readFileSync(APPROVED_PATH, 'utf8')) as unknown;
  assert.deepEqual(approvedProblems(json), []);
  assert.ok(Object.keys(readApproved()).length > 0);
});

test('1b. every translation has its bases, well formed', () => {
  assert.ok(translationTags().length > 0);
  for (const tag of translationTags()) {
    const json = JSON.parse(readFileSync(basePath(tag), 'utf8')) as unknown;
    assert.deepEqual(baseProblems(json), [], tag);
    assert.ok(Object.keys(readBases(tag).base).length > 0, tag);
  }
});

test('1c. a malformed file is refused, naming the key', () => {
  const runny = { text: 'Runny' };
  const good = { hash: hashTemplates(runny), ...runny };
  assert.deepEqual(approvedProblems({ about: '', messages: { a: good } }), []);
  assert.deepEqual(approvedProblems({ messages: {} }), ['not { "about": string, "messages": { … } }']);
  assert.match(approvedProblems({ about: '', messages: { a: { ...good, text: 'Soft' } } })[0], /^a: its hash/);
  assert.match(approvedProblems({ about: '', messages: { b: { hash: 'xyz', text: 'Soft' } } })[0], /^b: no hash/);
  assert.match(approvedProblems({ about: '', messages: { c: { hash: good.hash } } })[0], /^c: holds nothing/);
  assert.match(approvedProblems({ about: '', messages: { d: { ...good, note: 'x' } } })[0], /^d: holds/);
  assert.deepEqual(baseProblems({ about: '', english: {}, base: { a: good.hash } }), []);
  assert.match(baseProblems({ about: '', base: {} })[0], /^not/);
  assert.match(baseProblems({ about: '', english: {}, base: { e: 12 } })[0], /^base e: not a hash/);
  assert.match(baseProblems({ about: '', english: { f: good.hash }, base: { f: good.hash } })[0], /^f: both/);
});

test('1d. the hash is pinned: a change to it would empty or fill the queue unseen', () => {
  assert.equal(hashTemplates({ text: 'Runny' }), '2c87891b0d1a121a');
  // Plural forms hash in CLDR order whatever order they are written in.
  assert.equal(hashTemplates({ other: '{n} eggs', one: '{n} egg' }), hashTemplates({ one: '{n} egg', other: '{n} eggs' }));
  assert.notEqual(hashTemplates({ text: 'x' }), hashTemplates({ other: 'x' }));
});

const EN: CatalogueJson = {
  locale: 'en',
  messages: {
    same: { surface: 'tick', apps: ['web'], text: 'Same' },
    moved: { surface: 'tick', apps: ['web'], note: 'notes are not words', text: 'Moved now' },
    fresh: { surface: 'tick', apps: ['ios'], text: 'Fresh' },
    eggs: { surface: 'label', apps: ['web'], count: 'n', one: '{n} egg', other: '{n} eggs' },
  },
};

function approval(t: Record<string, string>): { hash: string } & Record<string, string> {
  return { hash: hashTemplates(t), ...t };
}

const APPROVED = {
  same: approval({ text: 'Same' }),
  moved: approval({ text: 'Moved then' }),
  eggs: approval({ one: '{n} egg', other: '{n} eggs' }),
  gone: approval({ text: 'Gone' }),
};

test('2a. the queue: changed, added and removed keys, nothing approved', () => {
  const q = reviewQueue(EN, APPROVED);
  assert.deepEqual(q.map((e) => [e.key, e.state]), [['moved', 'changed'], ['fresh', 'added'], ['gone', 'removed']]);
  assert.deepEqual(q[0].approved, { text: 'Moved then' });
  assert.deepEqual(q[0].current, { text: 'Moved now' });
  assert.equal(q[2].current, null);
});

test('2b. a stamp empties the queue of what it names, and drops a removed key it names', () => {
  const some = stamp(APPROVED, EN, ['moved']);
  assert.deepEqual(reviewQueue(EN, some).map((e) => e.key), ['fresh', 'gone']);
  const all = stamp(APPROVED, EN, ['same', 'moved', 'fresh', 'eggs', 'gone']);
  assert.deepEqual(reviewQueue(EN, all), []);
  assert.deepEqual(Object.keys(all), ['same', 'moved', 'fresh', 'eggs']);
  // From an older English, a key it has is stamped at its words, and a key
  // gone since is stamped too, so it shows as removed.
  const older: CatalogueJson = { locale: 'en', messages: { moved: { text: 'Moved then' }, gone: { text: 'Gone' } } };
  const baseline = stamp({}, EN, ['same', 'moved', 'fresh', 'eggs', 'gone'], older);
  assert.deepEqual(reviewQueue(EN, baseline).map((e) => [e.key, e.state]),
    [['same', 'added'], ['moved', 'changed'], ['fresh', 'added'], ['eggs', 'added'], ['gone', 'removed']]);
});

test('2c. a twin is current, stale, missing, or left to English on purpose', () => {
  const twins: CatalogueJson = { locale: 'x', messages: { same: { text: 'Ye same' }, moved: { text: 'Moved, then' } } };
  const bases = stampBases({ base: {}, english: {} }, twins, EN, ['same', 'fresh']);
  assert.deepEqual(Object.keys(bases.base), ['same']);
  assert.deepEqual(Object.keys(bases.english), ['fresh']);
  bases.base['moved'] = hashTemplates({ text: 'Moved then' });
  assert.equal(twinState('same', twins, EN, bases), 'current');
  assert.equal(twinState('moved', twins, EN, bases), 'stale');
  assert.equal(twinState('fresh', twins, EN, bases), 'leftToEnglish');
  assert.equal(twinState('eggs', twins, EN, bases), 'missing');
  assert.deepEqual(twinQueue('x', twins, EN, bases).map((t) => [t.key, t.state]), [['moved', 'stale'], ['eggs', 'missing']]);
  // A twin deleted is missing, not left to English: its base says it had one.
  const fewer: CatalogueJson = { locale: 'x', messages: { moved: { text: 'Moved, then' } } };
  assert.equal(twinState('same', fewer, EN, bases), 'missing');
  // Restamped once rewritten; a base of a key the English lost is dropped.
  const after = stampBases({ ...bases, base: { ...bases.base, gone: hashTemplates({ text: 'Gone' }) } }, twins, EN, ['moved']);
  assert.deepEqual(Object.keys(after.base), ['same', 'moved']);
  assert.equal(twinState('moved', twins, EN, after), 'current');
});
