/**
 * The words' editor's own logic (tools/copyEdit/): who may reach it, what
 * stops a save, how edits are laid on HEAD and checked, what is committed,
 * and approving. On repositories of the test's own (test/repo.ts), with the
 * checks' npm runs stood in for, so no test here runs npm test inside npm
 * test; tools/copyEditE2e.ts runs the real ones, through the page.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { HEADERS, judge, newToken, tokenMatches } from '../tools/copyEdit/guard.ts';
import {
  type Edit, type Runner, approveShown, approvingOff, commitMessage, failedTests, plan, preflight, save,
} from '../tools/copyEdit/save.ts';
import { problemWords } from '../tools/copyEdit/words.ts';
import { APPROVED_PATH } from '../tools/copyQueue.ts';
import { catalogue, type Repo, scratchRepo } from './repo.ts';

/* ------------------------------------------------------------ the guard */

const TOKEN = newToken();
const ask = (over: Partial<Parameters<typeof judge>[0]> = {}): ReturnType<typeof judge> => judge({
  method: 'GET', url: `/${TOKEN}/api/state`, host: '127.0.0.1:8765', origin: undefined, contentType: undefined, ...over,
}, TOKEN, 8765);

test('the token: 128 bits, new each time, and compared whole', () => {
  assert.match(TOKEN, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(newToken(), TOKEN);
  assert.ok(tokenMatches(TOKEN, TOKEN));
  assert.ok(!tokenMatches(TOKEN.slice(0, -1), TOKEN));
  assert.ok(!tokenMatches(`${TOKEN}x`, TOKEN));
  assert.ok(!tokenMatches('', TOKEN));
});

test('the guard answers only the token\'s paths, by the printed address, and takes writes as JSON from its own page', () => {
  assert.deepEqual(ask(), { ok: true, path: '/api/state' });
  assert.deepEqual(ask({ host: 'localhost:8765' }), { ok: true, path: '/api/state' });
  assert.deepEqual(ask({ url: `/${TOKEN}` }), { ok: true, path: '' });
  // No token, a wrong one, one short: told nothing.
  for (const url of ['/', '/api/state', `/${TOKEN.slice(1)}/api/state`, `/x${TOKEN}/`]) {
    assert.equal(ask({ url: url }).ok ? 200 : (ask({ url: url }) as { status: number }).status, 404, url);
  }
  // Any other name for this machine: a page elsewhere rebinding its own name.
  for (const host of ['evil.example:8765', '127.0.0.1:8766', '192.168.1.164:8765', undefined]) {
    assert.equal((ask({ host: host }) as { status: number }).status, 403, String(host));
  }
  const post = { method: 'POST', url: `/${TOKEN}/api/save`, contentType: 'application/json' };
  assert.deepEqual(ask(post), { ok: true, path: '/api/save' });
  assert.deepEqual(ask({ ...post, origin: 'http://127.0.0.1:8765' }), { ok: true, path: '/api/save' });
  assert.equal((ask({ ...post, contentType: 'text/plain' }) as { status: number }).status, 415, 'a form post');
  assert.equal((ask({ ...post, origin: 'https://evil.example' }) as { status: number }).status, 403, 'another site');
  assert.equal((ask({ ...post, method: 'PUT' }) as { status: number }).status, 405);
  assert.ok(!Object.keys(HEADERS).some((h) => h.startsWith('access-control')), 'no CORS');
  assert.match(HEADERS['content-security-policy'] as string, /frame-ancestors 'none'/);
});

/* ------------------------------------------------------------ a repository */

const EN = { a: { text: 'Pan' }, b: { text: 'Lid on' }, c: { count: 'n', one: '{n} egg', other: '{n} eggs' } };
const US = { a: { base: 'Pan', text: 'Pot' } };

/** A repository like this one, as far as the editor reads it: the
 *  catalogues, their notes and budgets, an approval, a fixture, and
 *  node_modules (untracked, as here). */
function wordsRepo(): Repo {
  const repo = scratchRepo({
    'copy/en.json': catalogue('en', EN),
    'copy/en-US.json': catalogue('en-US', US),
    'copy/en-x-1750.json': catalogue('en-x-1750', { b: { text: 'Lid upon' } }),
    'copy/en.notes.json': JSON.stringify({ notes: { a: { surface: 'button' }, b: { surface: 'body' }, c: { surface: 'button', example: { n: 2 } } } }),
    'test/data/surfaces.json': JSON.stringify({ button: { budget: 12, about: 'a button' }, body: { about: 'prose' } }),
    'fixtures/words.json': '{ "a": "Pan" }\n',
    'src/code.ts': 'export {};\n',
  });
  repo.commit('approved', { [APPROVED_PATH]: `${repo.git('rev-parse', 'HEAD')}\n` });
  mkdirSync(join(repo.dir, 'node_modules'));
  return repo;
}

const edit = (key: string, from: Record<string, string> | null, to: Record<string, string> | null, tag = 'en'): Edit =>
  ({ tag: tag, key: key, from: from, to: to });

/** A stand-in for npm: each run calls `fn` in the scratch tree, which may
 *  write there and says the exit code. */
function runner(fn: (dir: string, script: string, n: number) => number): { run: Runner; calls: string[] } {
  const calls: string[] = [];
  let n = 0;
  return {
    calls: calls,
    run: async (dir, script) => {
      calls.push(script);
      n += 1;
      return { code: fn(dir, script, n), out: '' };
    },
  };
}
const passing = (): { run: Runner; calls: string[] } => runner(() => 0);

/* ------------------------------------------------------------ preflight */

test('a save is refused off main, mid-merge, or with someone else\'s changes in copy/ or fixtures/', () => {
  const repo = wordsRepo();
  assert.deepEqual(preflight(repo.dir), []);
  repo.write({ 'copy/en.json': catalogue('en', { ...EN, a: { text: 'Pot' } }) });
  assert.match(preflight(repo.dir).join(' '), /copy\/en\.json has changes I didn’t make/);
  repo.git('checkout', '--', 'copy/en.json');
  repo.write({ 'fixtures/new.json': '{}\n' });
  assert.match(preflight(repo.dir).join(' '), /fixtures\/new\.json has changes/);
  repo.git('clean', '-fq', 'fixtures');
  repo.write({ 'src/code.ts': 'export const x = 1;\n' });
  assert.deepEqual(preflight(repo.dir), [], 'other work in progress is not the words\', and is not tested with them');
  repo.git('checkout', '--', 'src/code.ts');
  repo.git('checkout', '--quiet', '-b', 'elsewhere');
  assert.match(preflight(repo.dir).join(' '), /to main, and this checkout is on elsewhere/);
  repo.git('checkout', '--quiet', '--detach');
  assert.match(preflight(repo.dir).join(' '), /on no branch/);
  repo.git('checkout', '--quiet', 'main');
  writeFileSync(join(repo.dir, '.git', 'MERGE_HEAD'), `${repo.git('rev-parse', 'HEAD')}\n`);
  assert.match(preflight(repo.dir).join(' '), /A merge is in progress/);
});

test('approving is refused with the approval\'s file changed, and is off in an agent\'s shell', () => {
  const repo = wordsRepo();
  repo.write({ [APPROVED_PATH]: 'x\n' });
  assert.match(preflight(repo.dir, true).join(' '), /copy-approved\.txt has changes/);
  assert.deepEqual(preflight(repo.dir, false), [], 'a save does not write it');
  assert.equal(approvingOff(repo.dir, {}, false), null);
  assert.match(approvingOff(repo.dir, { CLAUDECODE: '1' }, false) as string, /Approving is off/);
  assert.equal(approvingOff(repo.dir, { CLAUDECODE: '1' }, true), null, 'a scratch clone under the temporary directory');
  assert.match(approvingOff(process.cwd(), { CLAUDECODE: '1' }, true) as string, /Approving is off/, 'this checkout is no scratch clone');
});

/* ------------------------------------------------------------ the plan */

test('an edit is laid on HEAD by its key: carried over where another key moved, a conflict where its own did', () => {
  const repo = wordsRepo();
  const mine = edit('a', EN.a, { text: 'Saucepan' });
  repo.commit('someone else\'s word', { 'copy/en.json': catalogue('en', { ...EN, b: { text: 'Lid off' } }) });
  const head = repo.git('rev-parse', 'HEAD');
  const p = plan(repo.dir, head, [mine, edit('a', US.a, { base: 'Saucepan', text: 'Pot' }, 'en-US')]);
  assert.deepEqual(p.conflicts, []);
  assert.deepEqual(p.problems, []);
  const written = p.files.get('copy/en.json') as string;
  assert.ok(written.includes('"a": { "text": "Saucepan" }') && written.includes('"b": { "text": "Lid off" }'));
  repo.commit('and theirs to mine', { 'copy/en.json': catalogue('en', { ...EN, a: { text: 'Pot' } }) });
  const clash = plan(repo.dir, repo.git('rev-parse', 'HEAD'), [mine]);
  assert.deepEqual(clash.conflicts, [{ tag: 'en', key: 'a', theirs: { text: 'Pot' } }]);
});

test('an edit adds no key, retires none, writes no 1750, and keeps its arguments', () => {
  const repo = wordsRepo();
  const head = repo.git('rev-parse', 'HEAD');
  assert.match(plan(repo.dir, head, [edit('z', null, { text: 'New' })]).refused.join(' '), /not a key of the English/);
  assert.match(plan(repo.dir, head, [edit('b', EN.b, null)]).refused.join(' '), /retiring a key/);
  assert.match(plan(repo.dir, head, [edit('b', { text: 'Lid upon' }, { text: 'Lid' }, 'en-x-1750')]).refused.join(' '), /not en-x-1750/);
  const args = plan(repo.dir, head, [edit('c', EN.c, { count: 'n', one: 'an egg', other: '{n} eggs, {m}' })]).problems;
  assert.deepEqual(args.filter((p) => p.rule === 'arguments').map((p) => [p.field, p.detail]),
    [['one', 'drops {n}'], ['other', 'adds {m}']]);
});

test('an edit is held to the catalogue\'s rules, and told in the owner\'s words', () => {
  const repo = wordsRepo();
  const head = repo.git('rev-parse', 'HEAD');
  const rules = (edits: Edit[]): string[] => plan(repo.dir, head, edits).problems.map((p) => p.rule);
  assert.deepEqual(rules([edit('b', EN.b, { text: 'Lid\'s on' })]), ['quote']);
  assert.deepEqual(rules([edit('a', EN.a, { text: 'A saucepan, lidded' })]).sort(), ['budget', 'budget', 'overlay'],
    'over budget in the English and the 1750 that falls back to it, and the US line written for the old English');
  assert.deepEqual(rules([edit('a', EN.a, { text: 'Saucepan' }), edit('a', US.a, { base: 'Saucepan', text: 'Pot' }, 'en-US')]), []);
  assert.deepEqual(rules([edit('a', US.a, { base: 'Pan', text: 'Pan' }, 'en-US')]), ['overlay'], 'the US line says what English says');
  assert.deepEqual(rules([edit('a', US.a, null, 'en-US')]), [], 'a US line removed');
  assert.deepEqual(rules([edit('b', null, { base: 'Lid on', text: 'Lid on tight' }, 'en-US')]), [], 'a US line added');
  const said = plan(repo.dir, head, [edit('a', EN.a, { text: 'A saucepan, lidded' })]).problems.map(problemWords);
  assert.ok(said.includes('a: The English is too long for a button: 18 characters, where there is room for 12.'), said.join('\n'));
  assert.ok(said.some((s) => s.startsWith('a: The US line was written for the English as it was.')));
});

/* ------------------------------------------------------------ saving */

test('a save that passes commits the catalogues alone, by name, on main, and leaves the tree clean', async () => {
  const repo = wordsRepo();
  const before = repo.git('rev-parse', 'HEAD');
  // Someone else's work, staged and not: neither goes into the commit.
  repo.write({ 'src/code.ts': 'export const theirs = 1;\n', 'src/staged.ts': 'export {};\n' });
  repo.git('add', 'src/staged.ts');
  const r = passing();
  const result = await save(repo.dir, { base: before, edits: [edit('b', EN.b, { text: 'Lid on tight' })] }, r.run);
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual(r.calls, ['fixtures:check', 'test']);
  assert.equal(repo.git('rev-parse', 'HEAD^'), before);
  assert.deepEqual(repo.git('show', '--name-only', '--format=', 'HEAD').split('\n'), ['copy/en.json']);
  assert.equal(repo.git('log', '-1', '--format=%s'), 'b in the owner\'s words');
  assert.ok(readFileSync(join(repo.dir, 'copy/en.json'), 'utf8').includes('"b": { "text": "Lid on tight" }'));
  assert.equal(repo.git('status', '--porcelain', '--', 'copy', 'fixtures'), '');
  assert.match(repo.git('status', '--porcelain'), /^ ?M src\/code\.ts$/m, 'their unstaged work is left as it was');
  assert.match(repo.git('status', '--porcelain'), /^A {2}src\/staged\.ts$/m, 'and their staged work, staged');
  assert.ok(!repo.git('worktree', 'list').includes('aet-copy-edit-'), 'the scratch worktree is gone');
});

test('the fixtures the words move are made afresh, checked again and committed with them', async () => {
  const repo = wordsRepo();
  const r = runner((dir, script, n) => {
    if (script !== 'fixtures:check') return 0;
    if (n === 1) {
      // As fixtures:check does: write the fixture afresh and fail.
      writeFileSync(join(dir, 'fixtures/words.json'), '{ "a": "Saucepan" }\n');
      return 1;
    }
    return 0;
  });
  const result = await save(repo.dir, { base: '', edits: [edit('a', EN.a, { text: 'Saucepan' }), edit('a', US.a, { base: 'Saucepan', text: 'Pot' }, 'en-US')] }, r.run);
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual(r.calls, ['fixtures:check', 'fixtures:check', 'test']);
  assert.deepEqual(result.fixtures, ['fixtures/words.json']);
  assert.deepEqual(repo.git('show', '--name-only', '--format=', 'HEAD').split('\n').sort(),
    ['copy/en-US.json', 'copy/en.json', 'fixtures/words.json']);
  assert.match(repo.git('log', '-1', '--format=%B'), /- a \(en-US\)[\s\S]*The fixtures the words moved: fixtures\/words\.json\./);
});

test('a save that fails commits nothing, leaves the tree as it was, and says whether it is the edit', async () => {
  const repo = wordsRepo();
  const head = repo.git('rev-parse', 'HEAD');
  const words = (dir: string): string => readFileSync(join(dir, 'copy/en.json'), 'utf8');
  // The tests fail with the edit, and pass without it.
  const mine = runner((dir, script) => (script === 'test' && words(dir).includes('Lid off') ? 1 : 0));
  const result = await save(repo.dir, { base: head, edits: [edit('b', EN.b, { text: 'Lid off' })] }, mine.run);
  assert.ok(!result.ok);
  assert.match(result.reasons.join(' '), /Without your words the tests pass, so your edit is what they catch/);
  assert.equal(repo.git('rev-parse', 'HEAD'), head);
  assert.equal(repo.git('status', '--porcelain', '--', 'copy', 'fixtures'), '');
  // The tests fail anyway.
  const broken = runner((_dir, script) => (script === 'test' ? 1 : 0));
  const anyway = await save(repo.dir, { base: head, edits: [edit('b', EN.b, { text: 'Lid off' })] }, broken.run);
  assert.ok(!anyway.ok);
  assert.match(anyway.reasons.join(' '), /fail on main as it is, without your words too, so it isn’t your edit/);
  // A check that changes code: a key or its arguments moved.
  const code = runner((dir, script) => {
    if (script === 'test') writeFileSync(join(dir, 'src/code.ts'), 'export const key = 1;\n');
    return 0;
  });
  const keyed = await save(repo.dir, { base: head, edits: [edit('b', EN.b, { text: 'Lid off' })] }, code.run);
  assert.ok(!keyed.ok);
  assert.match(keyed.reasons.join(' '), /changed src\/code\.ts, which only a change to a key or its arguments does/);
  assert.equal(repo.git('rev-parse', 'HEAD'), head);
  assert.ok(!repo.git('worktree', 'list').includes('aet-copy-edit-'), 'no scratch worktree is left');
});

test('a save refused before the checks runs none: a conflict, a broken rule, someone else\'s change', async () => {
  const repo = wordsRepo();
  const r = passing();
  const conflict = await save(repo.dir, { base: '', edits: [edit('b', { text: 'Lid off' }, { text: 'Lid' })] }, r.run);
  assert.ok(!conflict.ok);
  assert.deepEqual(conflict.conflicts, [{ tag: 'en', key: 'b', theirs: EN.b }]);
  const rule = await save(repo.dir, { base: '', edits: [edit('b', EN.b, { text: 'Lid\'s on' })] }, r.run);
  assert.ok(!rule.ok);
  assert.match(rule.reasons[0], /straight quote/);
  repo.write({ 'copy/en-US.json': catalogue('en-US', { a: { base: 'Pan', text: 'Pot!' } }) });
  const dirty = await save(repo.dir, { base: '', edits: [edit('b', EN.b, { text: 'Lid' })] }, r.run);
  assert.ok(!dirty.ok);
  assert.match(dirty.reasons[0], /copy\/en-US\.json has changes I didn’t make/);
  assert.deepEqual(r.calls, []);
});

test('when main moves while the words are checked, they are checked again on the new HEAD', async () => {
  const repo = wordsRepo();
  let moved = false;
  const r = runner((_dir, script) => {
    if (script === 'test' && !moved) {
      moved = true;
      repo.commit('someone else commits', { 'src/code.ts': 'export const later = 1;\n' });
    }
    return 0;
  });
  const result = await save(repo.dir, { base: '', edits: [edit('b', EN.b, { text: 'Lid on tight' })] }, r.run);
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual(r.calls, ['fixtures:check', 'test', 'fixtures:check', 'test']);
  assert.equal(repo.git('log', '-1', '--format=%s', 'HEAD^'), 'someone else commits');
});

test('the commit\'s message names the keys as the repository does', () => {
  const order = ['a', 'b', 'c', 'd'];
  const one = commitMessage([edit('b', EN.b, { text: 'x' })], order, [], 'abcdef0123456789');
  assert.equal(one.split('\n')[0], 'b in the owner\'s words');
  assert.match(one, /passed on abcdef01 with these words/);
  assert.equal(commitMessage([edit('c', null, null), edit('a', null, null)], order, [], 'h').split('\n')[0], 'a and c in the owner\'s words');
  assert.equal(commitMessage(order.map((k) => edit(k, null, null)), order, [], 'h').split('\n')[0], '4 keys in the owner\'s words');
});

test('the failing tests are named from npm test\'s report', () => {
  const out = '✔ fine (1ms)\n✖ failing tests:\n\ntest at test/copy.test.ts:71:1\n✖ the words fit (0.5ms)\n'
    + '  AssertionError [ERR_ASSERTION]: en a: 18 characters on "button", budget 12\n      at x\n';
  assert.deepEqual(failedTests(out), ['“the words fit”: en a: 18 characters on "button", budget 12']);
});

/* ------------------------------------------------------------ approving */

test('approving records the commit shown, commits that file alone, and refuses what it cannot name', () => {
  const repo = wordsRepo();
  const shown = repo.commit('words', { 'copy/en.json': catalogue('en', { ...EN, b: { text: 'Lid off' } }) });
  repo.commit('later', { 'src/code.ts': 'export const later = 1;\n' });
  assert.match((approveShown(repo.dir, shown, 'off') as { reasons: string[] }).reasons[0], /off/);
  assert.match((approveShown(repo.dir, 'f'.repeat(40), null) as { reasons: string[] }).reasons[0], /not a commit on main/);
  repo.write({ 'src/staged.ts': 'export {};\n' });
  repo.git('add', 'src/staged.ts');
  const result = approveShown(repo.dir, shown, null);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(repo.git('show', 'HEAD:' + APPROVED_PATH), shown);
  assert.deepEqual(repo.git('show', '--name-only', '--format=', 'HEAD').split('\n'), [APPROVED_PATH]);
  assert.equal(repo.git('log', '-1', '--format=%s'), `The words approved at ${shown.slice(0, 8)}`);
  assert.match((approveShown(repo.dir, shown, null) as { reasons: string[] }).reasons[0], /approved already/);
  // A commit off main's line cannot be approved from it.
  repo.git('checkout', '--quiet', '-b', 'side');
  const side = repo.commit('a side line', { 'src/code.ts': 'export const side = 1;\n' });
  repo.git('checkout', '--quiet', 'main');
  assert.match((approveShown(repo.dir, side, null) as { reasons: string[] }).reasons[0], /not a commit on main/);
});
