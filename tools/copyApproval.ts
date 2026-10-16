/**
 * The review queue for the words: what has changed since the owner last
 * approved them, and which twins of a translation were written against older
 * English. `tools/copyQueue.ts` is its command line, `tools/copyReview.ts`
 * its page, and `test/copyQueue.test.ts` holds its rules. LANGUAGE.md
 * section 3.
 *
 * Approval is of the whole catalogue at a commit. APPROVED_PATH holds one
 * line, the hash of the last commit whose words the owner approved; the
 * queue is copy/ at that commit against copy/ in the working tree, key by
 * key: a key whose English or regional overlay (copy/en-US.json) differs is
 * changed, one the commit lacks is added, and one only the commit has is
 * retired. The owner says what to put back; once it is, `npm run
 * copy:approve` records the commit. Nothing is approved key by key.
 *
 * A translation's twin (copy/en-x-1750.json) may lag the English. Which
 * twins are stale is read from git, as each catalogue has one key per line:
 * a twin is stale when the last commit that changed its key's English line
 * is not one the last commit that changed the twin's line descends from.
 * A key the translation lacks shows the English (src/core/copy.ts). Both
 * are listed, and neither fails a build. That needs the history, so it is
 * local tooling: CI's clone is shallow, and the tests hold the rules on data
 * of their own.
 *
 * The overlays keep their own `base`, the English each entry was written
 * against, which copy.test.ts holds to today's without any history.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

import { OVERLAYS, PLURAL_CATEGORIES } from '../src/core/copy.ts';

/** A message's templates by category: `text`, or each plural form. */
export type Templates = Record<string, string>;

export type Entry = Record<string, unknown>;

export interface CatalogueJson { locale: string; about?: string; messages: Record<string, Entry> }

/** The commit whose words the owner last approved, as one line. Not in
 *  copy/, which the apps ship whole. */
export const APPROVED_PATH = 'test/data/copy-approved.txt';

/** The categories a template can be under, in the order they are shown. */
export const CATEGORIES: readonly string[] = ['text', ...PLURAL_CATEGORIES];

/** Whether a file in copy/ is a catalogue, `<tag>.json`: everything there
 *  should be, since the apps ship the folder whole. */
export function isCatalogueFile(name: string): boolean {
  return /^[a-zA-Z0-9-]+\.json$/.test(name);
}

/** Every catalogue's tag, sorted: `en`, the overlays and the translations. */
export function catalogueTags(dir: string = 'copy'): string[] {
  return readdirSync(dir).filter(isCatalogueFile).map((f) => f.replace(/\.json$/, '')).sort();
}

/** Every translation: a catalogue that is not English and not one of its
 *  regional overlays. Today the English of 1750; Czech when it lands. */
export function translationTags(): string[] {
  return catalogueTags().filter((tag) => tag !== 'en' && !OVERLAYS.includes(tag));
}

/** An entry's templates, in `CATEGORIES` order; anything else in it
 *  (`count`, an overlay's `base`) is not words. */
export function templatesOf(entry: Entry | undefined): Templates | null {
  if (entry === undefined) return null;
  const out: Templates = {};
  for (const c of CATEGORIES) {
    const t = entry[c];
    if (typeof t === 'string') out[c] = t;
  }
  return out;
}

function same(a: Templates | null, b: Templates | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function readCatalogue(tag: string): CatalogueJson {
  return JSON.parse(readFileSync(`copy/${tag}.json`, 'utf8')) as CatalogueJson;
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** A catalogue as a commit has it, or null if the commit has none. */
export function catalogueAt(commit: string, tag: string): CatalogueJson | null {
  try {
    return JSON.parse(git('show', `${commit}:copy/${tag}.json`)) as CatalogueJson;
  } catch {
    return null;
  }
}

const HASH = /^[0-9a-f]{40}$/;

/** What is wrong with the approved record: the tools say it as it is, with
 *  no stack. */
export class ApprovalError extends Error {}

/** What is wrong with the approved file's text, if anything: it is one
 *  commit's full hash and a newline. */
export function approvedProblem(text: string): string | null {
  return HASH.test(text.replace(/\n$/, '')) ? null : `${APPROVED_PATH} is not one commit's full hash on a line`;
}

/** The commit whose words were last approved. Throws on a malformed file. */
export function readApproved(path: string = APPROVED_PATH): string {
  const text = readFileSync(path, 'utf8');
  const problem = approvedProblem(text);
  if (problem !== null) throw new ApprovalError(problem);
  return text.trim();
}

/** Why `commit` cannot be the approved one, if it cannot, said of the
 *  commit: it is a commit this clone has, and, to be approved, on `main`'s
 *  history, so that no rebase or deleted branch takes the approved words
 *  away. */
export function commitProblem(commit: string, onMain: boolean): string | null {
  try {
    git('cat-file', '-e', `${commit}^{commit}`);
  } catch {
    return 'is no commit in this clone: it was rebased away, or the clone is shallow';
  }
  try {
    if (onMain) git('merge-base', '--is-ancestor', commit, 'main');
  } catch {
    return 'is not on main\'s history: approve a commit main has, once its branch is merged';
  }
  return null;
}

/** Whether copy/ has changes git has not committed. */
export function copyIsDirty(): boolean {
  return git('status', '--porcelain', '--', 'copy').trim() !== '';
}

/* ----------------------------------------------------------- the queue */

/** The English and its overlays, as they were or as they are. */
export interface Words { en: CatalogueJson; overlays: Record<string, CatalogueJson | null> }

export function wordsNow(): Words {
  return { en: readCatalogue('en'), overlays: Object.fromEntries(OVERLAYS.map((tag) => [tag, readCatalogue(tag)])) };
}

export function wordsAt(commit: string): Words {
  const problem = commitProblem(commit, false);
  if (problem !== null) throw new ApprovalError(`${APPROVED_PATH} names ${commit}, which ${problem}`);
  const en = catalogueAt(commit, 'en');
  if (en === null) throw new ApprovalError(`${commit} has no copy/en.json`);
  return { en: en, overlays: Object.fromEntries(OVERLAYS.map((tag) => [tag, catalogueAt(commit, tag)])) };
}

export type QueueState = 'changed' | 'added' | 'retired';

/** One side of a change: the approved words and today's, null where absent. */
export interface Change { approved: Templates | null; current: Templates | null }

export interface Queued extends Change {
  key: string;
  /** `changed`: the English or an overlay moved since the approval; `added`:
   *  not in the approved catalogue; `retired`: only in it. */
  state: QueueState;
  /** Each overlay that has the key on either side, changed or not. */
  overlays: ({ tag: string } & Change)[];
}

/** The keys whose words are not the approved words: in today's order, then
 *  the retired ones in the approved catalogue's. */
export function reviewQueue(approved: Words, now: Words): Queued[] {
  const out: Queued[] = [];
  const queued = (key: string, state: QueueState): void => {
    const overlays = Object.keys({ ...approved.overlays, ...now.overlays }).map((tag) => ({
      tag: tag,
      approved: templatesOf(approved.overlays[tag]?.messages[key]),
      current: templatesOf(now.overlays[tag]?.messages[key]),
    })).filter((o) => o.approved !== null || o.current !== null);
    out.push({
      key: key, state: state, approved: templatesOf(approved.en.messages[key]),
      current: templatesOf(now.en.messages[key]), overlays: overlays,
    });
  };
  for (const key of Object.keys(now.en.messages)) {
    if (!(key in approved.en.messages)) {
      queued(key, 'added');
      continue;
    }
    const moved = !same(templatesOf(approved.en.messages[key]), templatesOf(now.en.messages[key]))
      || OVERLAYS.some((tag) => !same(templatesOf(approved.overlays[tag]?.messages[key]), templatesOf(now.overlays[tag]?.messages[key])));
    if (moved) queued(key, 'changed');
  }
  for (const key of Object.keys(approved.en.messages)) if (!(key in now.en.messages)) queued(key, 'retired');
  return out;
}

/* ----------------------------------------------------------- the twins */

/** What `git blame` names as the commit of a line the working tree has
 *  changed and git has not committed. */
export const UNCOMMITTED = '0'.repeat(40);

/** The commit that last changed each key's line, from `git blame
 *  --porcelain`: a catalogue writes one key per line, `"key": { … }`. */
export function keyCommits(porcelain: string): Map<string, string> {
  const out = new Map<string, string>();
  let commit = '';
  for (const line of porcelain.split('\n')) {
    const header = /^([0-9a-f]{40}) \d+ \d+/.exec(line);
    if (header !== null) {
      commit = header[1];
      continue;
    }
    const key = /^\t\s*"([^"]+)": \{/.exec(line);
    if (key !== null) out.set(key[1], commit);
  }
  return out;
}

export type TwinState = 'current' | 'stale' | 'missing';

/** Where each English key's twin stands. Missing, if the translation has
 *  none. Otherwise its line was last written at a commit, and the twin is
 *  current if the English then is the English now, and stale if the English
 *  has moved since. Comparing the words rather than which commit last
 *  touched the English line keeps a change beside the words (C7 took every
 *  key's notes off its line) from staling every twin. A twin line not yet
 *  committed is current: it is being written against the English as it is. */
export function twinStates(
  now: CatalogueJson, twinCommits: Map<string, string>, englishAt: (commit: string) => CatalogueJson | null,
): Map<string, TwinState> {
  const out = new Map<string, TwinState>();
  for (const [key, entry] of Object.entries(now.messages)) {
    const commit = twinCommits.get(key);
    if (commit === undefined) out.set(key, 'missing');
    else if (commit === UNCOMMITTED) out.set(key, 'current');
    else out.set(key, same(templatesOf(englishAt(commit)?.messages[key]), templatesOf(entry)) ? 'current' : 'stale');
  }
  return out;
}

/** Where each English key's twin stands in a translation, from git: the
 *  translation's lines blamed in the working tree (whitespace ignored, and a
 *  line moved within the file keeps its commit), and the English read at
 *  each commit named, once. */
export function twinStatesOf(tag: string, now: CatalogueJson): Map<string, TwinState> {
  const twins = keyCommits(git('blame', '--porcelain', '-w', '-M', '--', `copy/${tag}.json`));
  const at = new Map<string, CatalogueJson | null>();
  const englishAt = (commit: string): CatalogueJson | null => {
    if (!at.has(commit)) at.set(commit, catalogueAt(commit, 'en'));
    return at.get(commit) ?? null;
  };
  return twinStates(now, twins, englishAt);
}
