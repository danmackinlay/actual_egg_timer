/**
 * The words as approved against the words now, word by word, as HTML: what
 * the review page (tools/copyReview.ts) prints, and what the words' editor
 * (tools/copyEdit/) shows as it is typed. Pure, so the page can bundle it.
 */

import { PLURAL_CATEGORIES } from '../src/core/copy.ts';

/** The fields of an entry that are words, in order: `text`, or a plural's
 *  forms. `base` and `count` are not words. */
export const CATEGORIES: readonly string[] = ['text', ...PLURAL_CATEGORIES];

/** An entry's templates, by category. */
export type Templates = Record<string, string>;

/** An entry's templates, or null for no entry. */
export function templatesOf(entry: Record<string, unknown> | undefined): Templates | null {
  if (entry === undefined) return null;
  return Object.fromEntries(CATEGORIES.filter((c) => typeof entry[c] === 'string').map((c) => [c, entry[c] as string]));
}

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Words as HTML, each placeholder marked. */
export const words = (s: string): string => esc(s).replace(/\{[A-Za-z]\w*\}/g, (p) => `<span class="ph">${p}</span>`);

/** The two strings' word-by-word difference: the longest common run of
 *  words kept, each stretch of change shown once as it was and once as it is. */
export function diffHtml(a: string, b: string): string {
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
export function changeHtml(before: Templates | null, after: Templates | null): string {
  return CATEGORIES.filter((c) => before?.[c] !== undefined || after?.[c] !== undefined).map((c) => {
    const a = before?.[c];
    const b = after?.[c];
    const body = a === undefined ? `<ins>${words(b!)}</ins>` : b === undefined ? `<del>${words(a)}</del>` : diffHtml(a, b);
    return `<p class="words">${c === 'text' ? '' : `<span class="cat">${c}</span> `}${body}</p>`;
  }).join('');
}

/** The colours of the review page and the editor, light and dark. */
export const COLOURS = `:root { color-scheme: light dark; --bg: #faf8f4; --fg: #1d1b18; --muted: #6a655c; --card: #fff;
  --line: #e2ddd3; --del: #fbe0de; --ins: #d9f1df; --ph: #ebe6f8; }
@media (prefers-color-scheme: dark) { :root { --bg: #151412; --fg: #ece8e1; --muted: #a29d93; --card: #201e1b;
  --line: #37332d; --del: #4b1f1c; --ins: #173822; --ph: #312c48; } }`;

/** A diff's marks and a placeholder. */
export const MARKS = `del { background: var(--del); } ins { background: var(--ins); text-decoration: none; } del + ins { margin-left: 0.2em; }
.ph { background: var(--ph); border-radius: 4px; padding: 0 2px; }`;
