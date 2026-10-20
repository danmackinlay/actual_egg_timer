/**
 * The words' editor's page: its HTML and its style. Laid out for a wide
 * screen and a keyboard: the keys in a list on the left, the chosen key on
 * the right, its English beside its US and 1750 lines and its note. A
 * narrow window stacks them. The script is editor.ts.
 */

import { COLOURS, MARKS } from '../copyDiff.ts';

/** LANGUAGE.md section 3's rules, short, for when the owner is writing. */
const RULES = `<ul>
<li>Say what to do. When a caveat can’t be put plainly, say what happens, not why.</li>
<li>No word only this repository uses (“carryover”, “calibration”, “the model”).</li>
<li>I am the app and you are the cook, in the active voice. Never narrate what the screen visibly did.</li>
<li>Say it as a person who cooks would: the point once, in plain sentences, “because” for a reason. No dash as a
pivot, no two clauses on a semicolon, no “X, not Y” for effect, no list of three for its rhythm, no wry last line.</li>
<li>Every temperature has its unit. An inserted word stands alone, after a colon or as a label.</li>
<li>Curly quotes and apostrophes: ’ ‘ “ ”.</li>
<li>Sous-vide is not “a bath”; “ice bath” stays. “Pan” only for the pot. “Boil” is the water’s state, never the
cooking: “a full rolling boil”. No “tap” for the screen: a button is pressed.</li>
<li>An (i) is short enough to read at the hob; the rest goes to Help. Judge the words in place, in the apps.</li>
</ul>`;

export function pageHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>The words</title><link rel="stylesheet" href="editor.css"></head>
<body>
<header id="bar">
  <h1>The words</h1>
  <span id="where" class="meta"></span>
  <span id="status" class="meta" aria-live="polite"></span>
  <button id="save" type="button" disabled>Save</button>
</header>
<div id="banners" aria-live="polite"></div>
<div id="layout">
  <nav id="side" aria-label="Keys">
    <input id="search" type="search" placeholder="Search the keys and the words" aria-label="Search the keys and the words" autocomplete="off" spellcheck="false">
    <div id="list" role="listbox" aria-label="Keys" tabindex="-1"></div>
    <section id="approve" aria-label="Approving"></section>
    <details id="rules"><summary>The rules for the words</summary>${RULES}</details>
    <p id="shortcuts" class="meta">⌘S saves · j and k, or ⌘↑ and ⌘↓, move between keys · / searches · Enter edits the key ·
    Esc leaves a field</p>
  </nav>
  <main id="card" aria-live="off"><p class="meta">Loading the words…</p></main>
</div>
<div id="sheet" role="dialog" aria-label="Saving" hidden></div>
<script src="editor.js"></script>
</body></html>
`;
}

export const PAGE_CSS = `${COLOURS}
:root { --warn: #b3261e; --ok: #1e6b35; --accent: #3b5bdb; }
@media (prefers-color-scheme: dark) { :root { --warn: #ff8a80; --ok: #7bd389; --accent: #91a7ff; } }
* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 -apple-system, system-ui, sans-serif;
  display: flex; flex-direction: column; }
h1 { font-size: 1.1rem; margin: 0; white-space: nowrap; }
h2 { font-size: 1.05rem; margin: 0; overflow-wrap: anywhere; font-family: ui-monospace, Menlo, monospace; }
h3 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin: 1rem 0 0.25rem; }
button { font: inherit; padding: 4px 12px; border-radius: 6px; border: 1px solid var(--line); background: var(--card);
  color: var(--fg); cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.meta { color: var(--muted); font-size: 0.85rem; }
#bar { display: flex; align-items: center; gap: 16px; padding: 8px 16px; border-bottom: 1px solid var(--line); background: var(--card); }
#status { margin-left: auto; text-align: right; }
#banners p { margin: 0; padding: 8px 16px; background: var(--del); border-bottom: 1px solid var(--line); }
#layout { flex: 1; display: grid; grid-template-columns: minmax(18rem, 26rem) 1fr; min-height: 0; }
#side { border-right: 1px solid var(--line); overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
#search { font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--fg); }
#list h4 { margin: 12px 0 4px; font-size: 0.8rem; color: var(--muted); }
.row { display: block; width: 100%; text-align: left; border: 0; border-radius: 6px; padding: 4px 8px; background: none; }
.row:hover { background: var(--card); }
.row[aria-selected="true"] { background: var(--ph); }
.row code { font-size: 0.8rem; overflow-wrap: anywhere; }
.row .gist { display: block; color: var(--muted); font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.badge { font-size: 0.7rem; border-radius: 4px; padding: 0 4px; margin-left: 4px; background: var(--ins); }
.badge.bad { background: var(--del); color: var(--warn); }
#card { overflow-y: auto; padding: 16px 24px 48px; }
.columns { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 24px; }
.words { margin: 0.25rem 0; white-space: pre-wrap; overflow-wrap: anywhere; }
textarea { width: 100%; font: inherit; font-size: 1rem; padding: 8px; border: 1px solid var(--line); border-radius: 6px;
  background: var(--card); color: var(--fg); resize: vertical; }
textarea:focus, #search:focus { outline: 2px solid var(--accent); outline-offset: 0; }
textarea[readonly] { opacity: 0.75; }
.form { margin-top: 8px; }
.form label { display: block; color: var(--muted); font-size: 0.8rem; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
.chip { font-family: ui-monospace, Menlo, monospace; font-size: 0.8rem; border-radius: 4px; padding: 0 6px; border: 1px solid var(--line); }
.chip.ok { background: var(--ins); } .chip.missing { background: var(--del); color: var(--warn); }
.preview { padding: 6px 8px; border-left: 3px solid var(--line); margin: 6px 0; }
.meter { display: inline-block; width: 8rem; height: 6px; border-radius: 3px; background: var(--line); vertical-align: middle; margin-left: 6px; }
.meter > span { display: block; height: 100%; border-radius: 3px; background: var(--ok); }
.meter.over > span { background: var(--warn); }
.problems { color: var(--warn); margin: 8px 0; padding-left: 1.2rem; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
.box { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; }
.conflict { border-color: var(--warn); }
#approve { border-top: 1px solid var(--line); padding-top: 8px; }
#rules ul { padding-left: 1.2rem; font-size: 0.85rem; }
#sheet { position: fixed; inset: auto 16px 16px auto; width: min(36rem, calc(100vw - 32px)); max-height: 70vh; overflow-y: auto;
  background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; box-shadow: 0 8px 24px #0004; }
#sheet pre { max-height: 16rem; overflow: auto; font-size: 0.75rem; white-space: pre-wrap; }
${MARKS}
@media (max-width: 900px) {
  #layout { grid-template-columns: 1fr; }
  #side { border-right: 0; border-bottom: 1px solid var(--line); max-height: 40vh; }
  .columns { grid-template-columns: 1fr; }
}`;
