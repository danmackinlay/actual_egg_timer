/**
 * The words the owner has yet to read, and the record of his approval: the
 * review page's queue (tools/copyReview.ts) and the words' editor's
 * (tools/copyEdit/), from one function, so both show the same keys in the
 * same order. LANGUAGE.md section 3.
 *
 * APPROVED_PATH holds the last commit whose words the owner approved. The
 * queue is copy/en.json and its regional overlays at that commit against
 * the words now, key by key: changed (the English or an overlay), added or
 * retired. "Now" is the working tree for the review page, and a commit for
 * the editor, which never reads words nobody has committed.
 *
 * Every function takes the checkout it reads, `cwd`, so the tests can run
 * them on a repository of their own.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { OVERLAYS } from '../src/core/copy.ts';
import { templatesOf } from './copyDiff.ts';

export const APPROVED_PATH = 'test/data/copy-approved.txt';

/** A catalogue's messages, by key. */
export type Messages = Record<string, Record<string, unknown>>;

/** git in `cwd`, its output trimmed. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: cwd, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Whether copy/ has changes git has not committed. */
export function copyIsDirty(cwd: string = '.'): boolean {
  return git(cwd, 'status', '--porcelain', '--', 'copy') !== '';
}

/** A catalogue's messages at a commit, or in the working tree with none. An
 *  overlay newer than the commit is none there, so each of its keys reads as
 *  added. */
export function messagesAt(tag: string, commit: string | null, cwd: string = '.'): Messages {
  const path = `copy/${tag}.json`;
  if (commit !== null && git(cwd, 'ls-tree', '--name-only', commit, '--', path) === '') return {};
  const text = commit === null ? readFileSync(join(cwd, path), 'utf8') : git(cwd, 'show', `${commit}:${path}`);
  return (JSON.parse(text) as { messages: Messages }).messages;
}

/** The commit whose words the owner last approved. */
export function readApproved(cwd: string = '.'): string {
  const approved = readFileSync(join(cwd, APPROVED_PATH), 'utf8').trim();
  if (!/^[0-9a-f]{40}$/.test(approved)) throw new Error(`${APPROVED_PATH} is not one commit's full hash`);
  return approved;
}

export type State = 'Changed' | 'Added' | 'Retired';
export const STATES: readonly State[] = ['Changed', 'Added', 'Retired'];

/** What is waiting to be read: the catalogues the queue compares, and each
 *  key in it, changed first, then added, then retired, each in the order
 *  the English has its keys (a retired key in the order it had them). */
export interface Queue {
  approved: string;
  /** `en`, then the overlays. */
  tags: string[];
  /** Each tag's messages at the approved commit, and now. */
  then: Messages[];
  now: Messages[];
  keys: { key: string; state: State }[];
}

/** The queue from the approved commit to `commit`, or to the working tree
 *  when `commit` is null. */
export function reviewQueue(cwd: string = '.', commit: string | null = null): Queue {
  const approved = readApproved(cwd);
  const tags = ['en', ...OVERLAYS];
  const then = tags.map((tag) => messagesAt(tag, approved, cwd));
  const now = tags.map((tag) => messagesAt(tag, commit, cwd));
  const same = (i: number, key: string): boolean =>
    JSON.stringify(templatesOf(then[i][key])) === JSON.stringify(templatesOf(now[i][key]));
  const changed = [...new Set([...Object.keys(now[0]), ...Object.keys(then[0])])]
    .filter((key) => tags.some((_t, i) => !same(i, key)));
  const state = (key: string): State => (!(key in then[0]) ? 'Added' : !(key in now[0]) ? 'Retired' : 'Changed');
  const keys = STATES.flatMap((s) => changed.filter((k) => state(k) === s).map((k) => ({ key: k, state: s })));
  return { approved: approved, tags: tags, then: then, now: now, keys: keys };
}

/** Record `commit`, or HEAD, as approved: the commit the page was made from,
 *  so that words committed after the owner read them are not approved too.
 *  Returns the commit's full hash. */
export function approve(commit: string | undefined, cwd: string = '.'): string {
  if (commit === undefined && copyIsDirty(cwd)) {
    throw new Error('copy/ has changes git has not committed, which no commit can record: commit them');
  }
  let hash: string;
  try {
    hash = git(cwd, 'rev-parse', '--verify', '--quiet', `${commit ?? 'HEAD'}^{commit}`);
  } catch {
    throw new Error(`not a commit: ${commit}`);
  }
  writeFileSync(join(cwd, APPROVED_PATH), `${hash}\n`);
  return hash;
}
