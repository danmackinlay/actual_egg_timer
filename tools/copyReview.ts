/**
 * The words changed since the owner last approved them, as one page to read,
 * and the record of his approval. LANGUAGE.md section 3.
 *
 *   npm run copy:review [-- out.html]   default _dev/copy-review.html
 *   npm run copy:approve [-- <commit>]  record HEAD (or <commit>) as approved
 *
 * APPROVED_PATH holds the last commit whose words the owner approved. The
 * page is copy/en.json and its regional overlays at that commit against the
 * working tree, key by key (changed, added, retired; tools/copyQueue.ts,
 * the words' editor's queue too): the English word by word, the overlay's
 * words, and the key's note (copy/en.notes.json). One file with no script
 * and no network, to send to a phone as it is. It
 * prints the commit it was made from, which approving names to approve
 * exactly what the owner read. Approving HEAD refuses while copy/ has
 * uncommitted changes, which no commit could name. Approval is the owner's
 * word; no agent gives it.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { COLOURS, MARKS, changeHtml, esc, templatesOf } from './copyDiff.ts';
import { readNotes } from './copyNotes.ts';
import { APPROVED_PATH, STATES, approve, copyIsDirty, git, reviewQueue } from './copyQueue.ts';

const STYLE = `${COLOURS}
body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.5 -apple-system, system-ui, sans-serif; }
main { max-width: 40rem; margin: 0 auto; padding: 16px 16px 48px; }
h1 { font-size: 1.5rem; } h2 { font-size: 1.15rem; margin-top: 2rem; }
h3 { font-size: 1rem; margin: 0; overflow-wrap: anywhere; }
article { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin: 12px 0; }
.meta, dt, .cat { color: var(--muted); font-size: 0.85rem; } dt { margin-top: 0.5rem; font-weight: 600; } dd { margin: 0; }
.words { margin: 0.25rem 0; white-space: pre-wrap; overflow-wrap: anywhere; }
${MARKS}`;

/** How the owner changes what he has read, at the foot of the page: the
 *  workflow of DEVELOPING.md's "Reviewing the words", steps 3 and 4. */
const CHANGING = `<h2>Changing them</h2><ol>
<li>Say what to put back, by its key, to whoever is working in the repository; or edit <code>copy/en.json</code>
yourself, and <code>copy/en-US.json</code> where the key has a US line (its <code>base</code> is the English it
was made from). The 1750 words may lag.</li>
<li>Run <code>npm test</code> and <code>npm run fixtures:check</code>, then commit <code>copy/</code> with any
fixture they wrote.</li>
<li>Run <code>npm run copy:review</code> again and read the new page here, and the words in place in the apps.</li>
<li>When nothing is left to put back, approve, below, and commit <code>test/data/copy-approved.txt</code>.</li>
</ol>`;

function review(out: string): void {
  const { approved, tags, then, now, keys } = reviewQueue('.', null);
  const notes = readNotes();
  const card = (key: string): string => {
    const rows = tags.map((tag, i) => [tag, then[i][key], now[i][key]] as const).slice(1)
      .filter(([, a, b]) => a !== undefined || b !== undefined)
      .map(([tag, a, b]) => `<dt>${tag}</dt><dd>${changeHtml(templatesOf(a), templatesOf(b))}</dd>`);
    const note = notes[key]?.note;
    if (note !== undefined) rows.push(`<dt>Note</dt><dd class="meta">${esc(note)}</dd>`);
    const english = changeHtml(templatesOf(then[0][key]), templatesOf(now[0][key]));
    return `<article><h3><code>${esc(key)}</code></h3>${english}${rows.length > 0 ? `<dl>${rows.join('')}</dl>` : ''}</article>`;
  };
  const sections = STATES.map((s) => [s, keys.filter((k) => k.state === s).map((k) => k.key)] as const)
    .filter(([, ks]) => ks.length > 0).map(([s, ks]) => `<h2>${s} (${ks.length})</h2>${ks.map(card).join('')}`);
  const count = `${keys.length} key${keys.length === 1 ? '' : 's'}`;
  const head = git('.', 'rev-parse', 'HEAD');
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
${CHANGING}
<h2>Approving</h2><p style="overflow-wrap: anywhere">${approving}</p>
</main></body></html>
`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`${out}: ${count} to read.`);
}

try {
  if (process.argv[2] === 'approve') {
    const hash = approve(process.argv[3]);
    console.log(`approved the words at ${hash.slice(0, 10)}; commit ${APPROVED_PATH}.`);
  } else {
    review(process.argv[2] ?? '_dev/copy-review.html');
  }
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
