/**
 * The words changed since the owner last approved them, as one page to read
 * on a phone, and the record of his approval. LANGUAGE.md section 3.
 *
 *   npm run copy:review [-- out.html]   default _dev/copy-review.html
 *   npm run copy:approve [-- <commit>]  record HEAD (or <commit>) as approved
 *
 * APPROVED_PATH holds the last commit whose words the owner approved. The
 * page is copy/en.json and its regional overlays at that commit against the
 * working tree, key by key (changed, added, retired): the English word by
 * word, the overlay's words, and the key's note (copy/en.notes.json). One
 * file with no script and no network, to send to a phone as it is. It
 * prints the commit it was made from, which approving names to approve
 * exactly what the owner read. Approving HEAD refuses while copy/ has
 * uncommitted changes, which no commit could name. Approval is the owner's
 * word; no agent gives it.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { OVERLAYS, PLURAL_CATEGORIES } from '../src/core/copy.ts';
import { readNotes } from './copyNotes.ts';

const APPROVED_PATH = 'test/data/copy-approved.txt';
const CATEGORIES = ['text', ...PLURAL_CATEGORIES];
type Messages = Record<string, Record<string, unknown>>;
type Templates = Record<string, string>;

const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const copyIsDirty = (): boolean => git('status', '--porcelain', '--', 'copy') !== '';

/** A catalogue's messages at a commit, or in the working tree with none. */
function messages(tag: string, commit: string | null): Messages {
  const text = commit === null ? readFileSync(`copy/${tag}.json`, 'utf8') : git('show', `${commit}:copy/${tag}.json`);
  return (JSON.parse(text) as { messages: Messages }).messages;
}

/** An entry's templates, by category; `base` and `count` are not words. */
function templatesOf(entry: Record<string, unknown> | undefined): Templates | null {
  if (entry === undefined) return null;
  return Object.fromEntries(CATEGORIES.filter((c) => typeof entry[c] === 'string').map((c) => [c, entry[c] as string]));
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const words = (s: string): string => esc(s).replace(/\{[A-Za-z]\w*\}/g, (p) => `<span class="ph">${p}</span>`);

/** The two strings' word-by-word difference: the longest common run of
 *  words kept, each stretch of change shown once as it was and once as it is. */
function diffHtml(a: string, b: string): string {
  const split = (s: string): string[] => s.match(/\{\w+\}|[\p{L}\p{N}’'-]+|\s+|[^\s\p{L}\p{N}]/gu) ?? [];
  const x = split(a);
  const y = split(b);
  const lcs = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const runs: { op: 'same' | 'del' | 'ins'; text: string }[] = [];
  const push = (op: 'same' | 'del' | 'ins', text: string): void => {
    if (runs.at(-1)?.op === op) runs[runs.length - 1].text += text;
    else runs.push({ op: op, text: text });
  };
  for (let i = 0, j = 0; i < x.length || j < y.length;) {
    if (i < x.length && j < y.length && x[i] === y[j]) { push('same', x[i++]); j++; }
    else if (j < y.length && (i === x.length || lcs[i][j + 1] >= lcs[i + 1][j])) push('ins', y[j++]);
    else push('del', x[i++]);
  }
  let out = '';
  let del = '';
  let ins = '';
  const flush = (): void => {
    out += (del === '' ? '' : `<del>${words(del)}</del>`) + (ins === '' ? '' : `<ins>${words(ins)}</ins>`);
    del = ins = '';
  };
  runs.forEach((r, k) => {
    if (r.op === 'del') del += r.text;
    else if (r.op === 'ins') ins += r.text;
    // A space or a short word between two changes is folded into both, so a rewritten clause reads whole.
    else if ((del !== '' || ins !== '') && k + 1 < runs.length && r.text.trim().length <= 3 && !r.text.includes('{')) {
      del += r.text;
      ins += r.text;
    } else {
      flush();
      out += words(r.text);
    }
  });
  flush();
  return out;
}

/** Words as approved against words now: a diff, all new, or all gone. */
function changeHtml(before: Templates | null, after: Templates | null): string {
  return CATEGORIES.filter((c) => before?.[c] !== undefined || after?.[c] !== undefined).map((c) => {
    const a = before?.[c];
    const b = after?.[c];
    const body = a === undefined ? `<ins>${words(b!)}</ins>` : b === undefined ? `<del>${words(a)}</del>` : diffHtml(a, b);
    return `<p class="words">${c === 'text' ? '' : `<span class="cat">${c}</span> `}${body}</p>`;
  }).join('');
}

const STYLE = `:root { color-scheme: light dark; --bg: #faf8f4; --fg: #1d1b18; --muted: #6a655c; --card: #fff;
  --line: #e2ddd3; --del: #fbe0de; --ins: #d9f1df; --ph: #ebe6f8; }
@media (prefers-color-scheme: dark) { :root { --bg: #151412; --fg: #ece8e1; --muted: #a29d93; --card: #201e1b;
  --line: #37332d; --del: #4b1f1c; --ins: #173822; --ph: #312c48; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.5 -apple-system, system-ui, sans-serif; }
main { max-width: 40rem; margin: 0 auto; padding: 16px 16px 48px; }
h1 { font-size: 1.5rem; } h2 { font-size: 1.15rem; margin-top: 2rem; }
h3 { font-size: 1rem; margin: 0; overflow-wrap: anywhere; }
article { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin: 12px 0; }
.meta, dt, .cat { color: var(--muted); font-size: 0.85rem; } dt { margin-top: 0.5rem; font-weight: 600; } dd { margin: 0; }
.words { margin: 0.25rem 0; white-space: pre-wrap; overflow-wrap: anywhere; }
del { background: var(--del); } ins { background: var(--ins); text-decoration: none; } del + ins { margin-left: 0.2em; }
.ph { background: var(--ph); border-radius: 4px; padding: 0 2px; }`;

function review(out: string): void {
  const approved = readFileSync(APPROVED_PATH, 'utf8').trim();
  if (!/^[0-9a-f]{40}$/.test(approved)) throw new Error(`${APPROVED_PATH} is not one commit's full hash`);
  const tags = ['en', ...OVERLAYS];
  const then = tags.map((tag) => messages(tag, approved));
  const now = tags.map((tag) => messages(tag, null));
  const notes = readNotes();
  const same = (i: number, key: string): boolean =>
    JSON.stringify(templatesOf(then[i][key])) === JSON.stringify(templatesOf(now[i][key]));
  const queue = [...new Set([...Object.keys(now[0]), ...Object.keys(then[0])])]
    .filter((key) => tags.some((_t, i) => !same(i, key)));
  const state = (key: string): string => (!(key in then[0]) ? 'Added' : !(key in now[0]) ? 'Retired' : 'Changed');
  const card = (key: string): string => {
    const rows = tags.map((tag, i) => [tag, then[i][key], now[i][key]] as const).slice(1)
      .filter(([, a, b]) => a !== undefined || b !== undefined)
      .map(([tag, a, b]) => `<dt>${tag}</dt><dd>${changeHtml(templatesOf(a), templatesOf(b))}</dd>`);
    const note = notes[key]?.note;
    if (note !== undefined) rows.push(`<dt>Note</dt><dd class="meta">${esc(note)}</dd>`);
    const english = changeHtml(templatesOf(then[0][key]), templatesOf(now[0][key]));
    return `<article><h3><code>${esc(key)}</code></h3>${english}${rows.length > 0 ? `<dl>${rows.join('')}</dl>` : ''}</article>`;
  };
  const sections = ['Changed', 'Added', 'Retired'].map((s) => [s, queue.filter((k) => state(k) === s)] as const)
    .filter(([, ks]) => ks.length > 0).map(([s, ks]) => `<h2>${s} (${ks.length})</h2>${ks.map(card).join('')}`);
  const count = `${queue.length} key${queue.length === 1 ? '' : 's'}`;
  const head = git('rev-parse', 'HEAD');
  const approving = copyIsDirty()
    ? `Made from ${head} with changes to the words not yet committed, so no commit holds them: commit, and make the
page again.`
    : `Made from ${head}; to approve exactly these words: <code>npm run copy:approve -- ${head}</code>. Otherwise,
say what to put back, and once that is committed, <code>npm run copy:approve</code> approves the words at HEAD.`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Copy review</title><style>${STYLE}</style></head>
<body><main><h1>The words to read</h1>
<p class="meta">${count} changed, added or retired since you approved the words at ${approved.slice(0, 10)}. Struck
through is what you approved, highlighted what replaced it; a slot like <span class="ph">{time}</span> is filled in
by the app.</p>
${sections.join('\n')}
<h2>Approving</h2><p style="overflow-wrap: anywhere">${approving}</p>
</main></body></html>
`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`${out}: ${count} to read.`);
}

/** Record `commit`, or HEAD, as approved: the commit the page was made from,
 *  so that words committed after the owner read them are not approved too. */
function approve(commit: string | undefined): void {
  if (commit === undefined && copyIsDirty()) {
    throw new Error('copy/ has changes git has not committed, which no commit can record: commit them');
  }
  let hash: string;
  try {
    hash = git('rev-parse', '--verify', '--quiet', `${commit ?? 'HEAD'}^{commit}`);
  } catch {
    throw new Error(`not a commit: ${commit}`);
  }
  writeFileSync(APPROVED_PATH, `${hash}\n`);
  console.log(`approved the words at ${hash.slice(0, 10)}; commit ${APPROVED_PATH}.`);
}

try {
  if (process.argv[2] === 'approve') approve(process.argv[3]);
  else review(process.argv[2] ?? '_dev/copy-review.html');
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
