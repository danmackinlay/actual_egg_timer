/**
 * The review queue as one page, to read on a phone.
 *
 *   npm run copy:review [out.html]      default copy-review.html, gitignored
 *
 * For each key in the queue (tools/copyApproval.ts): the approved English
 * against today's, word by word; each translation's twin and whether it is
 * stale or missing; the regional overlays' words; the surface's length budget
 * against the longest rendering (test/data/surfaces.json, as copy.test.ts 5a
 * measures it); which apps say it; and the developer's note. Then the twins
 * that want rewriting under English that is already approved. One file, no
 * network: the styles are inline and there is no script, so it can be sent
 * to a phone as it is.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

import { Catalogue, OVERLAYS, parseCatalogue, render } from '../src/core/copy.js';
import {
  CATEGORIES, CatalogueJson, Entry, Queued, REVIEW_DIR, Templates, TwinState, readApproved, readBases, readCatalogue,
  reviewQueue, templatesOf, translationTags, twinQueue, twinState,
} from './copyApproval.js';

interface Surface { budget: number; about: string }

/** The counts every plural message is rendered at, as copy.test.ts 5a does. */
const COUNTS = [0, 1, 2, 3, 4, 5, 11, 21, 22, 1.5];

/** How each translation is named on the page. */
const NAMES: Record<string, string> = { 'en-x-1750': '1750' };

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Escaped text with each placeholder marked, so `{time}` reads as a slot. */
function words(s: string): string {
  return esc(s).replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, (p) => `<span class="ph">${p}</span>`);
}

/* ------------------------------------------------------------ the diff */

/** Words, placeholders, runs of space and single marks, so a diff moves whole words. */
function tokens(s: string): string[] {
  return s.match(/\{[A-Za-z][A-Za-z0-9_]*\}|[\p{L}\p{N}’'-]+|\s+|[^\s\p{L}\p{N}]/gu) ?? [];
}

type Op = { op: 'same' | 'del' | 'ins'; text: string };

/** The longest common subsequence of the two strings' tokens, as runs. */
function diff(a: string, b: string): Op[] {
  const x = tokens(a);
  const y = tokens(b);
  const n = x.length;
  const m = y.length;
  const lcs = new Uint16Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * (m + 1) + j] = x[i] === y[j]
        ? lcs[(i + 1) * (m + 1) + j + 1] + 1
        : Math.max(lcs[(i + 1) * (m + 1) + j], lcs[i * (m + 1) + j + 1]);
    }
  }
  const ops: Op[] = [];
  const push = (op: Op['op'], text: string): void => {
    const last = ops[ops.length - 1];
    if (last !== undefined && last.op === op) last.text += text;
    else ops.push({ op: op, text: text });
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) {
      push('same', x[i]); i++; j++;
    } else if (j < m && (i === n || lcs[i * (m + 1) + j + 1] >= lcs[(i + 1) * (m + 1) + j])) {
      push('ins', y[j]); j++;
    } else {
      push('del', x[i]); i++;
    }
  }
  return ops;
}

/** A run the diff kept that is too slight to read alone between two changes:
 *  a space, or a space and a short word ("the", "a", ","). */
function slight(text: string): boolean {
  return text.trim().length <= 3 && !/\{/.test(text);
}

/** The diff as a reader wants it: each stretch of change once as it was,
 *  then once as it is, with the slight runs inside it folded into both, so
 *  a rewritten clause reads whole rather than word against word. */
function diffHtml(a: string, b: string): string {
  const ops = diff(a, b);
  const out: string[] = [];
  let del = '';
  let ins = '';
  const flush = (): void => {
    if (del !== '') out.push(`<del>${words(del)}</del>`);
    if (ins !== '') out.push(`<ins>${words(ins)}</ins>`);
    del = '';
    ins = '';
  };
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k];
    const inChange = del !== '' || ins !== '';
    const next = ops[k + 1];
    if (o.op === 'del') del += o.text;
    else if (o.op === 'ins') ins += o.text;
    else if (inChange && next !== undefined && slight(o.text)) {
      del += o.text;
      ins += o.text;
    } else {
      flush();
      out.push(words(o.text));
    }
  }
  flush();
  return out.join('');
}

/* ---------------------------------------------------------- the lengths */

/** A key's longest rendering in a catalogue, at its example arguments and,
 *  for a plural, at every count: copy.test.ts 5a's measure, in code points. */
function longest(catalogue: Catalogue, key: string, entry: Entry): number {
  const example = (entry['example'] ?? {}) as Record<string, string | number>;
  const count = entry['count'];
  const argSets = typeof count === 'string'
    ? [example, ...COUNTS.map((n) => ({ ...example, [count]: n }))]
    : [example];
  return Math.max(...argSets.map((args) => [...render(catalogue, key, args)].length));
}

function lengthHtml(n: number, budget: number): string {
  return n > budget ? `<span class="over">${n} of ${budget} characters: over budget</span>` : `${n} of ${budget} characters`;
}

/* ------------------------------------------------------------ the page */

function templatesHtml(t: Templates, cls: string = ''): string {
  return CATEGORIES.filter((c) => c in t).map((c) => `<p class="words ${cls}">`
    + `${c === 'text' ? '' : `<span class="cat">${c}</span> `}${words(t[c])}</p>`).join('');
}

function diffTemplatesHtml(before: Templates, after: Templates): string {
  return CATEGORIES.filter((c) => c in before || c in after).map((c) => {
    const label = c === 'text' ? '' : `<span class="cat">${c}</span> `;
    const body = !(c in before) ? `<ins>${words(after[c])}</ins>`
      : !(c in after) ? `<del>${words(before[c])}</del>` : diffHtml(before[c], after[c]);
    return `<p class="words">${label}${body}</p>`;
  }).join('');
}

const TWIN_FLAG: Record<TwinState, string> = {
  current: '',
  leftToEnglish: '<span class="flag">left to English</span>',
  stale: '<span class="flag warn">stale: written against older English</span>',
  missing: '<span class="flag warn">missing: shows the English</span>',
};

interface Context {
  en: CatalogueJson;
  english: Catalogue;
  surfaces: Record<string, Surface>;
  overlays: { tag: string; json: CatalogueJson; catalogue: Catalogue }[];
  translations: { tag: string; json: CatalogueJson; catalogue: Catalogue; bases: ReturnType<typeof readBases> }[];
}

function card(q: Queued, ctx: Context): string {
  const entry = ctx.en.messages[q.key];
  const parts: string[] = [];
  parts.push(`<h3><code>${esc(q.key)}</code> <span class="state ${q.state}">${q.state}</span></h3>`);
  if (entry === undefined) {
    parts.push('<p class="meta">retired: no app says it now</p>');
    parts.push(templatesHtml(q.approved ?? {}, 'gone'));
    return `<article id="${esc(q.key)}">${parts.join('')}</article>`;
  }
  const apps = (entry['apps'] as string[]).map((a) => (a === 'ios' ? 'iOS' : a)).join(' · ');
  const surfaceName = String(entry['surface']);
  const surface = ctx.surfaces[surfaceName];
  parts.push(`<p class="meta">${esc(apps)} · ${esc(surfaceName)}: `
    + `${lengthHtml(longest(ctx.english, q.key, entry), surface.budget)}</p>`);
  parts.push(q.approved === null ? templatesHtml(q.current ?? {}) : diffTemplatesHtml(q.approved, q.current ?? {}));
  const rows: string[] = [];
  for (const t of ctx.translations) {
    const state = twinState(q.key, t.json, ctx.en, t.bases);
    const twin = t.json.messages[q.key];
    rows.push(`<dt>${esc(NAMES[t.tag] ?? t.tag)} ${TWIN_FLAG[state]}</dt><dd>`
      + `${twin === undefined ? '' : `${templatesHtml(templatesOf(twin))}<p class="meta">`
        + `${lengthHtml(longest(t.catalogue, q.key, entry), surface.budget)}</p>`}</dd>`);
  }
  for (const o of ctx.overlays) {
    const over = o.json.messages[q.key];
    if (over === undefined) continue;
    rows.push(`<dt>${esc(o.tag)}</dt><dd>${templatesHtml(templatesOf(over))}<p class="meta">`
      + `${lengthHtml(longest(o.catalogue, q.key, entry), surface.budget)}</p></dd>`);
  }
  if (typeof entry['note'] === 'string') rows.push(`<dt>Note</dt><dd><p class="note">${esc(entry['note'])}</p></dd>`);
  if (rows.length > 0) parts.push(`<dl>${rows.join('')}</dl>`);
  return `<article id="${esc(q.key)}">${parts.join('')}</article>`;
}

function revision(): string {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'copy', REVIEW_DIR], { encoding: 'utf8' }).trim() !== '';
    return dirty ? `${head}, with uncommitted changes to the words or their approvals` : head;
  } catch {
    return 'an unknown commit';
  }
}

const STYLE = `
:root { color-scheme: light dark; --bg: #faf8f4; --fg: #1d1b18; --muted: #6a655c; --card: #ffffff;
  --line: #e2ddd3; --del-bg: #fbe0de; --del-fg: #8c1d18; --ins-bg: #d9f1df; --ins-fg: #14532d;
  --warn: #9a4a00; --over: #b3261e; --ph: #ebe6f8; --accent: #3b5bab; }
@media (prefers-color-scheme: dark) { :root { --bg: #151412; --fg: #ece8e1; --muted: #a29d93;
  --card: #201e1b; --line: #37332d; --del-bg: #4b1f1c; --del-fg: #fbc8c4; --ins-bg: #173822;
  --ins-fg: #bdf3cc; --warn: #f2b45a; --over: #ff8a80; --ph: #312c48; --accent: #9db4f0; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 17px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
main { max-width: 40rem; margin: 0 auto; padding: 16px 16px 48px; }
h1 { font-size: 1.5rem; margin: 0.5rem 0; }
h2 { font-size: 1.15rem; margin: 2rem 0 0.5rem; }
h3 { font-size: 1rem; margin: 0 0 0.25rem; font-weight: 600; overflow-wrap: anywhere; }
nav a, a { color: var(--accent); }
nav { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; }
article { background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  padding: 12px 14px; margin: 12px 0; }
.meta, .note, dt { color: var(--muted); font-size: 0.85rem; }
.meta { margin: 0 0 0.5rem; }
.words { margin: 0.25rem 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.gone { text-decoration: line-through; color: var(--muted); }
.cat { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.ph { background: var(--ph); border-radius: 4px; padding: 0 2px; font-size: 0.92em; }
del { background: var(--del-bg); color: var(--del-fg); }
ins { background: var(--ins-bg); color: var(--ins-fg); text-decoration: none; }
del + ins { margin-left: 0.2em; }
dl { margin: 0.75rem 0 0; border-top: 1px solid var(--line); padding-top: 0.5rem; }
dt { margin-top: 0.5rem; font-weight: 600; }
dd { margin: 0; }
dd .meta { margin: 0; }
.state, .flag { font-size: 0.75rem; font-weight: 600; border-radius: 999px; padding: 1px 8px;
  border: 1px solid var(--line); color: var(--muted); white-space: nowrap; }
.state.changed { color: var(--accent); } .state.added { color: var(--ins-fg); } .state.removed { color: var(--del-fg); }
.warn { color: var(--warn); }
.over { color: var(--over); font-weight: 600; }
code { font: 0.9em ui-monospace, SFMono-Regular, Menlo, monospace; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--card); border: 1px solid var(--line);
  border-radius: 8px; padding: 8px 10px; font-size: 0.8rem; }
`;

function page(): string {
  const en = readCatalogue('en');
  const english = parseCatalogue(en);
  const surfaces = JSON.parse(readFileSync('test/data/surfaces.json', 'utf8')) as Record<string, Surface>;
  const overlays = OVERLAYS.map((tag) => {
    const json = readCatalogue(tag);
    return { tag: tag, json: json, catalogue: parseCatalogue(json, english) };
  });
  const translations = translationTags().map((tag) => {
    const json = readCatalogue(tag);
    return { tag: tag, json: json, catalogue: parseCatalogue(json, english), bases: readBases(tag) };
  });
  const ctx: Context = { en: en, english: english, surfaces: surfaces, overlays: overlays, translations: translations };

  const queue = reviewQueue(en, readApproved());
  const inQueue = new Set(queue.map((q) => q.key));
  const byState = (s: Queued['state']): Queued[] => queue.filter((q) => q.state === s);
  const sections: string[] = [];
  const nav: string[] = [];
  for (const [state, title] of [['changed', 'Changed'], ['added', 'Added'], ['removed', 'Removed']] as const) {
    const qs = byState(state);
    if (qs.length === 0) continue;
    nav.push(`<a href="#${state}">${title}: ${qs.length}</a>`);
    sections.push(`<h2 id="${state}">${title} (${qs.length})</h2>${qs.map((q) => card(q, ctx)).join('')}`);
  }
  const summaries: string[] = [];
  for (const t of translations) {
    const name = NAMES[t.tag] ?? t.tag;
    const all = twinQueue(t.tag, t.json, en, t.bases);
    const stale = all.filter((x) => x.state === 'stale').length;
    summaries.push(`${esc(name)}: ${stale} stale, ${all.length - stale} missing`);
    const rest = all.filter((x) => !inQueue.has(x.key));
    if (rest.length === 0) continue;
    nav.push(`<a href="#twins-${esc(t.tag)}">${esc(name)} to rewrite: ${rest.length}</a>`);
    sections.push(`<h2 id="twins-${esc(t.tag)}">${esc(name)} to rewrite, under approved English (${rest.length})</h2>`
      + rest.map((x) => `<article id="${esc(t.tag)}-${esc(x.key)}"><h3><code>${esc(x.key)}</code> `
        + `${TWIN_FLAG[x.state]}</h3>${templatesHtml(x.english)}`
        + `${x.twin === null ? '' : `<dl><dt>${esc(name)}</dt><dd>${templatesHtml(x.twin)}</dd></dl>`}</article>`).join(''));
  }
  const keys = queue.map((q) => q.key);
  const total = Object.keys(en.messages).length;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Copy review queue</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>The review queue</h1>
<p class="meta">${queue.length} of ${total} keys to read: ${byState('changed').length} changed, ${byState('added').length} added and
${byState('removed').length} removed since you approved them. ${summaries.join('; ')}. From ${esc(revision())}.
Struck through is what you approved, highlighted what replaced it; a slot like <span class="ph">{time}</span> is filled in by the app.</p>
<nav>${nav.join('')}</nav>
${sections.join('\n')}
<h2 id="approve">Approving</h2>
<p>Every key on this page, once read:</p>
<pre>npm run copy:approve -- ${keys.length === 0 ? '--all' : esc(keys.join(' '))}</pre>
<p>A rewritten twin: <code>npm run copy:approve -- --translation en-x-1750 &lt;key…&gt;</code>.</p>
</main>
</body>
</html>
`;
}

const out = process.argv[2] ?? 'copy-review.html';
const html = page();
writeFileSync(out, html);
console.log(`${out}: ${reviewQueue(readCatalogue('en'), readApproved()).length} keys in the queue, ${html.length} characters.`);
