/**
 * Saving and approving the words from the editor (tools/copyEdit/server.ts):
 * what is checked, where, and what is committed.
 *
 * Saving: the owner's edits, each a key of copy/en.json or of an overlay
 * with the entry it was made from, are
 *
 *   1. refused where this checkout is not on main, is mid-merge, or has
 *      changes in copy/, fixtures/ or fit/tests/ (someone else's: this
 *      tool leaves none of its own), or where main has moved since the page
 *      loaded the words it edits (`base`): the page lays its drafts on the
 *      words it loads afresh, and the owner saves again;
 *   2. laid on that commit key by key, an edit whose key it holds otherwise
 *      refused as a conflict, and held to the catalogue's rules
 *      (tools/copyRules.ts), with no key and no argument changed;
 *   3. written into a scratch worktree of the commit in the system's
 *      temporary directory, where `npm run fixtures:check` and `npm test`
 *      run side by side (fixtures:check again, when the first run only
 *      wrote the fixtures the words moved). So no one's uncommitted work is
 *      tested with them, a failure leaves this checkout as it was, and only
 *      the words can have moved a fixture;
 *   4. on a pass, committed there, the catalogues and any fixture the words
 *      moved, and main moved on to that commit with `git merge --ff-only`:
 *      the tree committed is the tree tested, and nothing anyone else
 *      staged goes with it. If main moved while the checks ran, nothing is
 *      committed, and the owner saves again.
 *
 * A failure says why in the owner's words. When the tests fail, they run
 * once more on HEAD without the edits, to say whether it is the edit.
 *
 * Approving records the commit the page showed (tools/copyQueue.ts) and
 * commits test/data/copy-approved.txt alone. It is the owner's button: it
 * is off when the editor was started from an agent's shell (CLAUDECODE in
 * its environment), except in a scratch clone under the temporary
 * directory, which the editor's own end-to-end check drives.
 *
 * Nothing here pushes.
 */

import { spawn } from 'node:child_process';
import { existsSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { OVERLAYS } from '../../src/core/copy.ts';
import { type Entry, withEntries } from '../copyFile.ts';
import { APPROVED_PATH, approve, changedPaths, git, showFile } from '../copyQueue.ts';
import { type CatalogueJson, type Notes, type Problem, type Surface, argumentProblems, catalogueProblems } from '../copyRules.ts';
import { problemWords } from './words.ts';

/** The catalogues the editor may write: the English and its overlays. */
export const EDITABLE: readonly string[] = ['en', ...OVERLAYS];
/** The catalogues it reads, the 1750 twin among them, which may lag. */
export const CATALOGUES: readonly string[] = ['en', ...OVERLAYS, 'en-x-1750'];
/** What a save may write: the catalogues, and the fixtures the words move. */
const WRITTEN = ['copy', 'fixtures', 'fit/tests'];
const MAY_CHANGE = (path: string): boolean =>
  EDITABLE.some((t) => path === `copy/${t}.json`) || /^fixtures\/[^/]+\.json$/.test(path) || /^fit\/tests\/[^/]+\.json$/.test(path);
const SCRATCH_PREFIX = 'aet-copy-edit-';

/** One change the owner made: a key of one catalogue, from the entry it had
 *  when he started (null for none) to the entry he wants (null to remove an
 *  overlay's line). */
export interface Edit { tag: string; key: string; from: Entry | null; to: Entry | null }

export interface SaveRequest { base: string; edits: Edit[] }

export type SaveResult =
  | { ok: true; commit: string; subject: string; fixtures: string[]; seconds?: number }
  | { ok: false; reasons: string[]; conflicts?: { tag: string; key: string; theirs: Entry | null }[]; log?: string };

/** `npm run <script>` in `dir`: its exit code and what it printed. */
export type Runner = (dir: string, script: 'test' | 'fixtures:check') => Promise<{ code: number; out: string }>;

export const npmRunner: Runner = (dir, script) => new Promise((resolve) => {
  const child = spawn('npm', ['run', '--silent', script], { cwd: dir, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  let out = '';
  child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
  child.stderr.on('data', (d: Buffer) => { out += d.toString(); });
  child.on('close', (code) => resolve({ code: code ?? 1, out: out }));
});

const canon = (e: Entry | null | undefined): string =>
  e === null || e === undefined ? 'null' : JSON.stringify(Object.keys(e).sort().map((k) => [k, e[k]]));

const shortHash = (h: string): string => h.slice(0, 8);

/* ------------------------------------------------------------ the tree */

/** Why this checkout cannot take a commit of the words now, in the owner's
 *  words; none when it can. `approving` checks the approval's file too. */
export function preflight(cwd: string, approving = false): string[] {
  const reasons: string[] = [];
  let branch = '';
  try {
    branch = git(cwd, 'symbolic-ref', '--quiet', '--short', 'HEAD');
  } catch {
    branch = '';
  }
  if (branch !== 'main') {
    reasons.push(`I commit the words to main, and this checkout is ${branch === '' ? 'on no branch' : `on ${branch}`}.`);
  }
  for (const [file, what] of [['MERGE_HEAD', 'A merge'], ['rebase-merge', 'A rebase'], ['rebase-apply', 'A rebase'],
    ['CHERRY_PICK_HEAD', 'A cherry-pick'], ['REVERT_HEAD', 'A revert']] as const) {
    const path = git(cwd, 'rev-parse', '--git-path', file);
    if (existsSync(join(cwd, path)) || existsSync(path)) {
      reasons.push(`${what} is in progress in the repository; once it’s finished, try again.`);
      break;
    }
  }
  const paths = approving ? [...WRITTEN, APPROVED_PATH] : WRITTEN;
  const dirty = changedPaths(cwd, ...paths);
  if (dirty.length > 0) {
    reasons.push(`${dirty.join(', ')} ${dirty.length === 1 ? 'has' : 'have'} changes I didn’t make. Someone is changing `
      + 'the words or the fixtures in the repository; once they commit them or put them back, try again.');
  }
  if (!approving && !existsSync(join(cwd, 'node_modules'))) {
    reasons.push('The repository has no node_modules, so I can’t run the tests: run npm ci there first.');
  }
  return reasons;
}

/** Every catalogue the editor reads, at a commit. */
export function cataloguesAt(cwd: string, commit: string): Map<string, CatalogueJson> {
  return new Map(CATALOGUES.map((tag) => [tag, JSON.parse(git(cwd, 'show', `${commit}:copy/${tag}.json`)) as CatalogueJson]));
}

/** The notes and surfaces at a commit, which the budgets are measured by. */
export function notesAt(cwd: string, commit: string): { notes: Record<string, Notes>; surfaces: Record<string, Surface> } {
  return {
    notes: (JSON.parse(git(cwd, 'show', `${commit}:copy/en.notes.json`)) as { notes: Record<string, Notes> }).notes,
    surfaces: JSON.parse(git(cwd, 'show', `${commit}:test/data/surfaces.json`)) as Record<string, Surface>,
  };
}

/* ------------------------------------------------------------ the plan */

export interface Plan {
  /** Each catalogue file written, its text. */
  files: Map<string, string>;
  conflicts: { tag: string; key: string; theirs: Entry | null }[];
  problems: Problem[];
  /** Why the edits cannot be taken at all. */
  refused: string[];
}

/** The edits laid on the catalogues at `head`, and what stops them. */
export function plan(cwd: string, head: string, edits: Edit[]): Plan {
  const jsons = cataloguesAt(cwd, head);
  const { notes, surfaces } = notesAt(cwd, head);
  const out: Plan = { files: new Map(), conflicts: [], problems: [], refused: [] };
  const en = jsons.get('en') as CatalogueJson;
  const order = Object.keys(en.messages);
  const byTag = new Map<string, Map<string, Entry | null>>();
  const seen = new Set<string>();
  for (const e of edits) {
    const id = `${e.tag} ${e.key}`;
    if (seen.has(id)) { out.refused.push(`${e.key} is edited twice.`); continue; }
    seen.add(id);
    if (!EDITABLE.includes(e.tag)) { out.refused.push(`I only write the English and its overlays, not ${e.tag}.`); continue; }
    if (!(e.key in en.messages)) {
      out.refused.push(`${e.key} is not a key of the English; a new key needs a change to the code.`);
      continue;
    }
    if (e.tag === 'en' && e.to === null) { out.refused.push(`${e.key}: retiring a key needs a change to the code.`); continue; }
    const theirs = (jsons.get(e.tag) as CatalogueJson).messages[e.key] as Entry | undefined;
    if (canon(theirs) !== canon(e.from)) {
      out.conflicts.push({ tag: e.tag, key: e.key, theirs: theirs ?? null });
      continue;
    }
    if (!byTag.has(e.tag)) byTag.set(e.tag, new Map());
    (byTag.get(e.tag) as Map<string, Entry | null>).set(e.key, e.to);
  }
  if (out.refused.length > 0 || out.conflicts.length > 0) return out;
  const drafted = new Map(jsons);
  for (const [tag, changes] of byTag) {
    const path = `copy/${tag}.json`;
    const text = withEntries(showFile(cwd, head, path), changes, order);
    out.files.set(path, text);
    drafted.set(tag, JSON.parse(text) as CatalogueJson);
  }
  const keys = new Set(edits.map((e) => e.key));
  out.problems = [
    ...argumentProblems(en, drafted.get('en') as CatalogueJson, keys),
    ...catalogueProblems(drafted, notes, surfaces, keys),
  ];
  return out;
}

/* ------------------------------------------------------------ the checks */

/** The scratch worktrees this tool left behind (a run that crashed), taken
 *  away: only those named as it names them. */
export function sweepScratch(cwd: string): void {
  const listed = git(cwd, 'worktree', 'list', '--porcelain').split('\n')
    .filter((l) => l.startsWith('worktree ')).map((l) => l.slice('worktree '.length));
  for (const dir of listed) {
    if (dir.split(sep).at(-1)?.startsWith(SCRATCH_PREFIX)) {
      try { git(cwd, 'worktree', 'remove', '--force', dir); } catch { /* gone already */ }
    }
  }
  git(cwd, 'worktree', 'prune');
}

let scratchCount = 0;

/** A worktree of `commit` of its own, with the repository's node_modules. */
function scratchTree(cwd: string, commit: string): string {
  scratchCount += 1;
  const dir = join(realpathSync(tmpdir()), `${SCRATCH_PREFIX}${process.pid}-${scratchCount}`);
  rmSync(dir, { recursive: true, force: true });
  git(cwd, 'worktree', 'add', '--detach', '--quiet', dir, commit);
  symlinkSync(realpathSync(join(cwd, 'node_modules')), join(dir, 'node_modules'));
  return dir;
}

function dropScratch(cwd: string, dir: string): void {
  try { git(cwd, 'worktree', 'remove', '--force', dir); } catch { rmSync(dir, { recursive: true, force: true }); }
  try { git(cwd, 'worktree', 'prune'); } catch { /* nothing to prune */ }
}

/** The files a check run changed, the node_modules link aside. */
function changedIn(dir: string): string[] {
  return changedPaths(dir).filter((p) => p !== 'node_modules' && !p.startsWith('node_modules/'));
}

/** The tests that failed, as node --test's report names them, and the first
 *  line each says. */
export function failedTests(out: string): string[] {
  const at = out.indexOf('✖ failing tests:');
  const tail = at < 0 ? out : out.slice(at);
  const found: string[] = [];
  const lines = tail.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^✖ (.+?)(?: \([\d.]+m?s\))?$/.exec(lines[i]);
    if (m === null || m[1] === 'failing tests:' || /^test\/.+\.test\.ts$/.test(m[1])) continue;
    const said = lines.slice(i + 1, i + 6).map((l) => l.trim()).find((l) => /^(AssertionError|Error)/.test(l)) ?? '';
    const name = `“${m[1]}”${said === '' ? '' : `: ${said.replace(/^AssertionError \[ERR_ASSERTION\]: /, '')}`}`;
    if (!found.includes(name)) found.push(name);
  }
  return found;
}

/** What failed in a check run, in the owner's words. */
function whyFailed(script: 'test' | 'fixtures:check', out: string): string[] {
  if (/error TS\d+/.test(out)) {
    return ['The code no longer compiles with these words, which only a change to a key or its arguments does.'];
  }
  if (script === 'fixtures:check') return ['The fixtures did not settle when made afresh twice; see the log.'];
  const tests = failedTests(out);
  return tests.length === 0 ? ['The tests failed; see the log.'] : tests.map((t) => `A test failed: ${t}`);
}

type Check = { ok: true; dir: string; changed: string[] } | { ok: false; dir: string; reasons: string[]; log: string; tests: boolean };

/** The edits' files written into a scratch worktree of `head`, and the
 *  checks run there: the fixtures made afresh and the tests, side by side,
 *  for neither reads what the other writes. The worktree is the caller's to
 *  drop. */
async function check(cwd: string, head: string, files: Map<string, string>, runner: Runner,
  stage: (s: string) => void): Promise<Check> {
  const dir = scratchTree(cwd, head);
  for (const [path, text] of files) writeFileSync(join(dir, path), text);
  stage('Running the tests and making the fixtures afresh');
  const [first, tests] = await Promise.all([runner(dir, 'fixtures:check'), runner(dir, 'test')]);
  let fixtures = first;
  if (fixtures.code !== 0 && !/error TS\d+/.test(fixtures.out)) {
    // The first run writes any fixture the words moved, and fails; a run
    // after it passes if that was all.
    stage('Making the fixtures afresh again, as the words moved some');
    fixtures = await runner(dir, 'fixtures:check');
  }
  if (tests.code !== 0) return { ok: false, dir: dir, reasons: whyFailed('test', tests.out), log: tests.out, tests: true };
  if (fixtures.code !== 0) {
    return { ok: false, dir: dir, reasons: whyFailed('fixtures:check', fixtures.out), log: fixtures.out, tests: false };
  }
  const changed = changedIn(dir);
  const unexpected = changed.filter((p) => !MAY_CHANGE(p));
  if (unexpected.length > 0) {
    return {
      ok: false, dir: dir, tests: false, log: '',
      reasons: [`Saving these words changed ${unexpected.join(', ')}, which only a change to a key or its arguments does. I can’t save that here.`],
    };
  }
  return { ok: true, dir: dir, changed: changed };
}

/** The commit's message: the keys, in the repository's way of saying it. */
export function commitMessage(edits: Edit[], order: readonly string[], fixtures: string[], head: string): string {
  const keys = [...new Set(edits.map((e) => e.key))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const listed = keys.length === 1 ? keys[0] : keys.length <= 3 ? `${keys.slice(0, -1).join(', ')} and ${keys.at(-1)}` : `${keys.length} keys`;
  const lines = edits.map((e) => `- ${e.key}${e.tag === 'en' ? '' : ` (${e.tag}${e.to === null ? ', removed' : e.from === null ? ', added' : ''})`}`);
  const body = [
    ...(keys.length > 3 || edits.some((e) => e.tag !== 'en') ? [lines.join('\n'), ''] : []),
    ...(fixtures.length > 0 ? [`The fixtures the words moved: ${fixtures.join(', ')}.`, ''] : []),
    `Made with npm run copy:edit: npm test and fixtures:check passed on ${shortHash(head)} with these words.`,
  ];
  return `${listed} in the owner's words\n\n${body.join('\n')}\n`;
}

/** Save the owner's edits: checked, then committed on main, or why not. */
export async function save(cwd: string, request: SaveRequest, runner: Runner = npmRunner,
  stage: (s: string) => void = () => {}): Promise<SaveResult> {
  if (request.edits.length === 0) return { ok: false, reasons: ['There is nothing to save.'] };
  const started = Date.now();
  stage('Checking the words');
  const before = preflight(cwd);
  if (before.length > 0) return { ok: false, reasons: before };
  const head = git(cwd, 'rev-parse', 'HEAD');
  if (head !== request.base) return { ok: false, reasons: [moved(cwd, request.base, head, 'since the page loaded the words')] };
  const p = plan(cwd, head, request.edits);
  if (p.refused.length > 0) return { ok: false, reasons: p.refused };
  if (p.conflicts.length > 0) {
    return {
      ok: false, conflicts: p.conflicts,
      reasons: p.conflicts.map((c) => `Someone changed ${c.key}${c.tag === 'en' ? '' : ` (${c.tag})`} in the repository since you started editing it.`),
    };
  }
  if (p.problems.length > 0) return { ok: false, reasons: p.problems.map(problemWords) };
  const checked = await check(cwd, head, p.files, runner, stage);
  try {
    if (!checked.ok) {
      const reasons = [...checked.reasons];
      if (checked.tests) {
        stage('Running the tests without your words, to see whether it’s your edit');
        const bare = await check(cwd, head, new Map(), runner, () => {});
        dropScratch(cwd, bare.dir);
        reasons.push(bare.ok
          ? 'Without your words the tests pass, so your edit is what they catch. If a test quotes the old words, whoever works in the repository has to change it.'
          : 'The tests fail on main as it is, without your words too, so it isn’t your edit: ask whoever works in the repository.');
      }
      return { ok: false, reasons: reasons, log: checked.log };
    }
    stage('Committing');
    // The commit is made where it was tested, of the files the checks left
    // there, and main moved on to it: the tree committed is the tree tested.
    const order = Object.keys((cataloguesAt(cwd, head).get('en') as CatalogueJson).messages);
    const fixtures = checked.changed.filter((f) => !f.startsWith('copy/'));
    const message = commitMessage(request.edits, order, fixtures, head);
    git(checked.dir, 'add', '--', ...checked.changed);
    git(checked.dir, 'commit', '--quiet', '-m', message);
    const commit = git(checked.dir, 'rev-parse', 'HEAD');
    const after = preflight(cwd);
    if (after.length > 0) return { ok: false, reasons: after };
    const now = git(cwd, 'rev-parse', 'HEAD');
    if (now !== head) return { ok: false, reasons: [moved(cwd, head, now, 'while I checked your words')] };
    try {
      git(cwd, 'merge', '--ff-only', '--quiet', commit);
    } catch (e) {
      return { ok: false, reasons: [`git would not commit: ${(e as Error).message.split('\n')[0]}`] };
    }
    return {
      ok: true, commit: commit, subject: message.split('\n')[0], fixtures: fixtures,
      seconds: (Date.now() - started) / 1000,
    };
  } finally {
    dropScratch(cwd, checked.dir);
  }
}

/** Main moved from `from` to `to`, in the owner's words: nothing committed,
 *  and save again. */
function moved(cwd: string, from: string, to: string, when: string): string {
  const subject = git(cwd, 'log', '-1', '--format=%s', to);
  return `Main moved ${when}: someone committed ${shortHash(to)}, “${subject}”, after ${shortHash(from)}. `
    + 'I’ve committed nothing; I load the words again, and you can save once you’ve looked.';
}

/* ------------------------------------------------------------ approving */

/** Whether this editor may approve, and why not: the owner's button, off in
 *  an agent's shell but for a scratch clone under the temporary directory. */
export function approvingOff(cwd: string, env: NodeJS.ProcessEnv, scratch: boolean): string | null {
  if (env['CLAUDECODE'] === undefined) return null;
  if (scratch && isUnderTmp(cwd)) return null;
  return 'Approving is off: I was started from an agent’s shell, and approving the words is yours alone. Start me from your own terminal to approve.';
}

/** Whether `dir` is inside the system's temporary directory. */
export function isUnderTmp(dir: string): boolean {
  const tmp = realpathSync(tmpdir());
  const real = realpathSync(dir);
  return real.startsWith(tmp + sep);
}

/** Approve the words at `commit`, the commit the page showed, and commit
 *  the record; or why not. */
export function approveShown(cwd: string, commit: string, off: string | null): SaveResult {
  if (off !== null) return { ok: false, reasons: [off] };
  const reasons = preflight(cwd, true);
  if (reasons.length > 0) return { ok: false, reasons: reasons };
  let hash: string;
  try {
    hash = git(cwd, 'rev-parse', '--verify', '--quiet', `${commit}^{commit}`);
    git(cwd, 'merge-base', '--is-ancestor', hash, 'HEAD');
  } catch {
    return { ok: false, reasons: [`${shortHash(commit)} is not a commit on main, so I can’t approve it.`] };
  }
  if (git(cwd, 'show', `HEAD:${APPROVED_PATH}`).trim() === hash) {
    return { ok: false, reasons: [`The words at ${shortHash(hash)} are approved already.`] };
  }
  approve(hash, cwd);
  const subject = `The words approved at ${shortHash(hash)}`;
  try {
    git(cwd, 'commit', '--only', '--quiet', '-m', `${subject}\n\nApproved by the owner in npm run copy:edit.\n`, '--', APPROVED_PATH);
  } catch (e) {
    git(cwd, 'checkout', 'HEAD', '--', APPROVED_PATH);
    return { ok: false, reasons: [`git would not commit: ${(e as Error).message.split('\n')[0]}`] };
  }
  return { ok: true, commit: git(cwd, 'rev-parse', 'HEAD'), subject: subject, fixtures: [] };
}
