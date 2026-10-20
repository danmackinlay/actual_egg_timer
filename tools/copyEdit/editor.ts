/**
 * The words' editor, in the page (page.ts), bundled by esbuild as the server
 * starts (server.ts). It reads the words at HEAD and the queue from the
 * server, holds the owner's edits as drafts (in this browser's storage, so
 * a reload loses none), checks them as he types by the catalogue's own rules
 * (tools/copyRules.ts, the code copy.test.ts runs), and sends them to be
 * saved, which the server checks again and commits, or approves.
 */

import { type Catalogue, parseCatalogue, placeholders, render } from '../../src/core/copy.ts';
import { CATEGORIES, changeHtml, templatesOf } from '../copyDiff.ts';
import {
  type CatalogueJson, type Notes, type Problem, type Surface, argumentProblems, catalogueProblems, exampleOf, longest,
} from '../copyRules.ts';
import { catalogueName, problemWords } from './words.ts';

type Entry = Record<string, string>;
type Messages = Record<string, Entry>;
type QueueState = 'Changed' | 'Added' | 'Retired';

interface State {
  head: string;
  approved: string;
  queue: { key: string; state: QueueState }[];
  catalogues: Record<string, CatalogueJson>;
  approvedMessages: Record<string, Messages>;
  tags: string[];
  notes: Record<string, Notes>;
  surfaces: Record<string, Surface>;
  blocked: string[];
  approveBlocked: string[];
  approveOff: string | null;
}

interface Draft { tag: string; key: string; from: Entry | null; to: Entry | null }

interface SaveResult {
  ok: boolean;
  commit?: string;
  subject?: string;
  reasons?: string[];
  conflicts?: { tag: string; key: string; theirs: Entry | null }[];
  log?: string;
  /** How long the save took, for one that passed. */
  seconds?: number;
}

/** What a save checks, and what it leaves to the full suite. */
const CHECKED = 'the tests and the fixtures';
const LEFT = 'the full suite runs before a release';

const US = 'en-US';
const PERIOD = 'en-x-1750';
const STORE = 'aet-copy-edit-drafts';

/* ------------------------------------------------------------ the DOM */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function el(tag: string, attrs: Record<string, string> = {}, ...children: (Node | string | null)[]): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c !== null) e.append(c);
  return e;
}

function button(label: string, onClick: () => void, attrs: Record<string, string> = {}): HTMLButtonElement {
  const b = el('button', { type: 'button', ...attrs }, label) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

/* ------------------------------------------------------------ the state */

let state: State | null = null;
const drafts = new Map<string, Draft>();
/** Edits whose key someone else changed since: what is there now. */
const conflicts = new Map<string, Entry | null>();
let selected: string | null = null;
let visible: string[] = [];
let saving = false;
let approveAsked = false;
let notice: string | null = null;

const id = (tag: string, key: string): string => `${tag} ${key}`;
const canon = (e: Entry | null | undefined): string =>
  e === null || e === undefined ? 'null' : JSON.stringify(Object.keys(e).sort().map((k) => [k, e[k]]));

function headEntry(tag: string, key: string): Entry | null {
  return (state?.catalogues[tag]?.messages[key] as Entry | undefined) ?? null;
}

/** A key's entry as drafted, or as HEAD has it. */
function entryOf(tag: string, key: string): Entry | null {
  const d = drafts.get(id(tag, key));
  return d !== undefined ? d.to : headEntry(tag, key);
}

/** Set a key's draft; a draft that comes back to HEAD's entry is no draft. */
function setDraft(tag: string, key: string, to: Entry | null): void {
  const head = headEntry(tag, key);
  const k = id(tag, key);
  if (canon(to) === canon(head) && !conflicts.has(k)) drafts.delete(k);
  else drafts.set(k, { tag: tag, key: key, from: drafts.get(k)?.from ?? head, to: to });
  storeDrafts();
}

function storeDrafts(): void {
  try {
    localStorage.setItem(STORE, JSON.stringify([...drafts.values()]));
  } catch { /* a private window: the drafts live as long as the page */ }
}

function loadDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(STORE);
    return raw === null ? [] : (JSON.parse(raw) as Draft[]);
  } catch {
    return [];
  }
}

/** The catalogues as drafted. */
function drafted(): Map<string, CatalogueJson> {
  const s = state as State;
  const out = new Map<string, CatalogueJson>();
  for (const tag of s.tags) {
    const json = s.catalogues[tag] as CatalogueJson;
    const messages: Record<string, Record<string, unknown>> = { ...json.messages };
    for (const d of drafts.values()) {
      if (d.tag !== tag) continue;
      if (d.to === null) delete messages[d.key];
      else messages[d.key] = d.to;
    }
    out.set(tag, { locale: json.locale, messages: messages });
  }
  return out;
}

/** Every problem with the drafts, and with the key on screen. */
function problems(): Problem[] {
  const s = state as State;
  const keys = new Set([...drafts.values()].map((d) => d.key));
  if (selected !== null) keys.add(selected);
  const jsons = drafted();
  const enKeys = new Set([...drafts.values()].filter((d) => d.tag === 'en').map((d) => d.key));
  try {
    return [
      ...argumentProblems(s.catalogues['en'] as CatalogueJson, jsons.get('en') as CatalogueJson, enKeys),
      ...catalogueProblems(jsons, s.notes, s.surfaces, keys),
    ];
  } catch (e) {
    return [{ rule: 'shape', tag: 'en', key: selected ?? '', detail: (e as Error).message }];
  }
}

function catalogueOf(tag: string): Catalogue {
  const jsons = drafted();
  const en = parseCatalogue(jsons.get('en'));
  return tag === 'en' ? en : parseCatalogue(jsons.get(tag), en);
}

/* ------------------------------------------------------------ the server */

const api = async <T>(path: string, body?: unknown): Promise<T> => {
  const res = await fetch(`api/${path}`, body === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
};

/** Load the words at HEAD, and lay the drafts on them again: a draft whose
 *  key HEAD has changed since is a conflict, one HEAD now has is done. */
async function load(): Promise<void> {
  const s = await api<State>('state');
  const previous = state?.head;
  state = s;
  const kept = drafts.size > 0 ? [...drafts.values()] : loadDrafts();
  drafts.clear();
  for (const d of kept) {
    if (!s.tags.includes(d.tag) || !(d.key in (s.catalogues['en'] as CatalogueJson).messages)) continue;
    const now = headEntry(d.tag, d.key);
    if (canon(now) === canon(d.to)) continue;
    if (canon(now) !== canon(d.from) && !conflicts.has(id(d.tag, d.key))) conflicts.set(id(d.tag, d.key), now);
    drafts.set(id(d.tag, d.key), d);
  }
  storeDrafts();
  if (previous !== undefined && previous !== s.head) {
    notice = `Main moved to ${s.head.slice(0, 8)} since this page loaded, and I’ve loaded its words.`;
  }
  if (selected === null) selected = s.queue[0]?.key ?? Object.keys((s.catalogues['en'] as CatalogueJson).messages)[0] ?? null;
  renderAll();
}

/* ------------------------------------------------------------ the list */

const fold = (s: string): string => s.toLowerCase().replace(/\u00a0/g, ' ').replace(/[’‘]/g, '\'').replace(/[“”]/g, '"');

function gistOf(key: string): string {
  const e = entryOf('en', key) ?? (state as State).approvedMessages['en']?.[key] ?? null;
  return e === null ? '' : (e['text'] ?? e['other'] ?? '');
}

function searchHits(query: string): string[] {
  const q = fold(query.trim());
  const s = state as State;
  const keys = Object.keys((s.catalogues['en'] as CatalogueJson).messages);
  return keys.filter((k) => {
    const words = [k, ...Object.values(entryOf('en', k) ?? {}), ...Object.values(entryOf(US, k) ?? {})];
    return words.some((w) => fold(w).includes(q));
  });
}

function renderList(): void {
  const s = state as State;
  const list = $('list');
  list.replaceChildren();
  const query = ($('search') as HTMLInputElement).value;
  const bad = new Set(problems().map((p) => p.key));
  const sections: [string, string[]][] = [];
  if (query.trim() !== '') {
    sections.push([`Found (${searchHits(query).length})`, searchHits(query).slice(0, 300)]);
  } else {
    const queued = new Set(s.queue.map((q) => q.key));
    const edited = [...new Set([...drafts.values()].map((d) => d.key))].filter((k) => !queued.has(k));
    if (edited.length > 0) sections.push([`Your edits (${edited.length})`, edited]);
    for (const st of ['Changed', 'Added', 'Retired'] as const) {
      const keys = s.queue.filter((q) => q.state === st).map((q) => q.key);
      if (keys.length > 0) sections.push([`${st} since you approved (${keys.length})`, keys]);
    }
    if (s.queue.length === 0 && edited.length === 0) {
      list.append(el('p', { class: 'meta' }, 'Nothing is waiting to be read. Search for any key or words to change them.'));
    }
  }
  visible = [];
  for (const [title, keys] of sections) {
    list.append(el('h4', {}, title));
    for (const key of keys) {
      visible.push(key);
      const editedHere = drafts.has(id('en', key)) || drafts.has(id(US, key));
      const conflicted = conflicts.has(id('en', key)) || conflicts.has(id(US, key));
      const row = el('button', {
        type: 'button', class: 'row', role: 'option', 'aria-selected': String(key === selected), 'data-key': key,
      }, el('code', {}, key),
      editedHere ? el('span', { class: 'badge' }, 'edited') : null,
      bad.has(key) && editedHere ? el('span', { class: 'badge bad' }, 'problem') : null,
      conflicted ? el('span', { class: 'badge bad' }, 'changed since') : null,
      el('span', { class: 'gist' }, gistOf(key)));
      row.addEventListener('click', () => select(key));
      list.append(row);
    }
  }
}

function select(key: string, focus = false): void {
  selected = key;
  approveAsked = false;
  renderList();
  renderCard();
  document.querySelector(`.row[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest' });
  if (focus) (document.querySelector('#card textarea:not([readonly])') as HTMLTextAreaElement | null)?.focus();
}

function step(by: number): void {
  if (visible.length === 0) return;
  const at = selected === null ? -1 : visible.indexOf(selected);
  const next = visible[Math.min(visible.length - 1, Math.max(0, at + by))];
  if (next !== undefined) select(next);
}

/* ------------------------------------------------------------ the card */

/** Straight quotes made curly: an opening one after a space or a bracket. */
function curl(s: string): string {
  return s.replace(/(^|[\s([{—-])'/g, '$1‘').replace(/'/g, '’').replace(/(^|[\s([{—-])"/g, '$1“').replace(/"/g, '”');
}

function autosize(t: HTMLTextAreaElement): void {
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight + 2}px`;
}

function formsOf(entry: Entry | null): string[] {
  return entry === null ? [] : CATEGORIES.filter((c) => typeof entry[c] === 'string');
}

function renderCard(): void {
  const s = state as State;
  const card = $('card');
  card.replaceChildren();
  if (selected === null) return;
  const key = selected;
  const queued = s.queue.find((q) => q.key === key)?.state ?? null;
  const head = headEntry('en', key);
  const approved = s.approvedMessages['en']?.[key] ?? null;
  const note = s.notes[key];
  const surface = note === undefined ? undefined : s.surfaces[note.surface];

  const meterBar = el('span');
  const meter = el('span', { class: 'meter' }, meterBar);
  const meterText = el('span', { class: 'meta' });
  card.append(el('h2', {}, key), el('p', { class: 'meta' },
    queued === null ? 'Approved, unchanged since. ' : `${queued} since you approved. `,
    note === undefined ? '' : `Drawn on a ${note.surface}${surface?.about === undefined ? '' : `: ${surface.about.split('. ')[0]}.`} `,
    meterText, surface?.budget === undefined ? null : meter));

  if (head === null) {
    card.append(el('div', { class: 'box' }, el('p', {}, 'Retired: no app shows this key any more, so there is nothing to edit.'),
      el('div', { class: 'words', html: changeHtml(templatesOf(approved ?? undefined), null) })));
    return;
  }

  const conflictBox = el('div');
  const left = el('div');
  const right = el('div');
  card.append(conflictBox, el('div', { class: 'columns' }, left, right));

  // The English: the diff from what was approved, a field per form, its
  // placeholders and a preview.
  const diff = el('div', { class: 'box' });
  left.append(el('h3', {}, 'English, against what you approved'), diff, el('h3', {}, 'The English'));
  const fields: { form: string; area: HTMLTextAreaElement; chips: HTMLElement }[] = [];
  const isPlural = head['count'] !== undefined;
  for (const form of formsOf(head)) {
    const area = el('textarea', { rows: '2', spellcheck: 'true', 'aria-label': `${key} ${form}`, 'data-form': form }) as HTMLTextAreaElement;
    area.value = (entryOf('en', key) ?? head)[form] ?? '';
    const chips = el('div', { class: 'chips' });
    area.addEventListener('input', () => {
      const to: Entry = { ...(entryOf('en', key) ?? head) };
      to[form] = area.value;
      setDraft('en', key, to);
      autosize(area);
      update();
    });
    fields.push({ form: form, area: area, chips: chips });
    left.append(el('div', { class: 'form' },
      isPlural ? el('label', {}, `${form === 'one' ? 'One' : form === 'other' ? 'More than one' : form}, by {${head['count']}}`) : null,
      area, chips));
  }
  const preview = el('div', { class: 'preview' });
  const englishActions = el('div', { class: 'actions' });
  const englishProblems = el('ul', { class: 'problems' });
  left.append(el('h3', {}, 'As the app shows it, with the note’s example'), preview, englishProblems, englishActions);

  // The US line, the 1750 line and the note.
  const usBox = el('div', { class: 'box' });
  right.append(el('h3', {}, 'US'), usBox);
  const period = headEntry(PERIOD, key);
  right.append(el('h3', {}, '1750 (read only; it may lag)'), el('div', { class: 'box' },
    period === null ? el('p', { class: 'meta' }, 'None yet: it shows the English.')
      : el('div', {}, ...formsOf(period).map((f) => el('p', { class: 'words' }, formsOf(period).length > 1 ? `${f}: ` : '', period[f] ?? ''))),
  ));
  if (note?.note !== undefined) right.append(el('h3', {}, 'Note'), el('div', { class: 'box meta' }, note.note));

  const usArea = el('textarea', { rows: '2', spellcheck: 'true', 'aria-label': `${key} US` }) as HTMLTextAreaElement;
  usArea.addEventListener('input', () => {
    const now = entryOf(US, key);
    setDraft(US, key, { base: now?.['base'] ?? '', text: usArea.value });
    autosize(usArea);
    update();
  });

  function renderUs(): void {
    const us = entryOf(US, key);
    const english = entryOf('en', key)?.['text'];
    usBox.replaceChildren();
    if (us === null) {
      usBox.append(el('p', { class: 'meta' }, isPlural ? 'A word with a count has no US line: the US reads the English.'
        : 'No US line: the US reads the English.'));
      if (!isPlural) {
        usBox.append(el('div', { class: 'actions' }, button('Add a US line', () => {
          setDraft(US, key, { base: english ?? '', text: english ?? '' });
          renderUs();
          update();
          usArea.focus();
        })));
      }
      return;
    }
    if (document.activeElement !== usArea) usArea.value = us['text'] ?? '';
    usBox.append(usArea, el('p', { class: 'meta' }, `Written for the English “${us['base'] ?? ''}”.`));
    const actions = el('div', { class: 'actions' });
    if (english !== undefined && us['base'] !== english) {
      actions.append(button('The US line is right', () => { setDraft(US, key, { base: english, text: usArea.value }); renderUs(); update(); }));
    }
    actions.append(button('Remove the US line', () => { setDraft(US, key, null); renderUs(); update(); }));
    usBox.append(actions);
    autosize(usArea);
  }

  function update(): void {
    const now = entryOf('en', key) ?? (head as Entry);
    diff.innerHTML = changeHtml(templatesOf(approved ?? undefined), templatesOf(now));
    for (const f of fields) {
      const want = placeholders((head as Entry)[f.form] ?? '');
      const got = placeholders(f.area.value);
      f.chips.replaceChildren(...want.map((p) => {
        const chip = button(`{${p}}`, () => {
          const at = f.area.selectionStart;
          f.area.setRangeText(`{${p}}`, at, f.area.selectionEnd, 'end');
          f.area.dispatchEvent(new Event('input'));
          f.area.focus();
        }, { class: `chip ${got.includes(p) ? 'ok' : 'missing'}`, title: got.includes(p) ? 'kept' : 'missing: press to put it back' });
        return chip;
      }));
    }
    let shown = '';
    let width = 0;
    try {
      const cat = catalogueOf('en');
      shown = render(cat, key, exampleOf(s.notes, key));
      width = longest(cat, key, s.notes);
    } catch {
      shown = '';
    }
    preview.replaceChildren(shown === '' ? el('span', { class: 'meta' }, '(nothing to show)') : shown);
    if (surface?.budget !== undefined) {
      meterText.textContent = `${width} of ${surface.budget} characters.`;
      meter.classList.toggle('over', width > surface.budget);
      meterBar.style.width = `${Math.min(100, (100 * width) / surface.budget)}%`;
    } else {
      meterText.textContent = 'No length limit.';
    }
    const mine = problems().filter((p) => p.key === key);
    englishProblems.replaceChildren(...mine.map((p) => el('li', {}, problemWords(p))));
    englishActions.replaceChildren();
    if (mine.some((p) => p.rule === 'quote')) {
      englishActions.append(button('Make the quotes curly', () => {
        for (const f of fields) f.area.value = curl(f.area.value);
        const to: Entry = { ...now };
        for (const f of fields) to[f.form] = f.area.value;
        setDraft('en', key, to);
        const us = entryOf(US, key);
        if (us !== null) { usArea.value = curl(usArea.value); setDraft(US, key, { ...us, text: usArea.value }); }
        update();
      }));
    }
    if (drafts.has(id('en', key)) || drafts.has(id(US, key))) {
      englishActions.append(button('Undo my edits to this key', () => {
        drafts.delete(id('en', key));
        drafts.delete(id(US, key));
        conflicts.delete(id('en', key));
        conflicts.delete(id(US, key));
        storeDrafts();
        renderAll();
      }));
    }
    if (approved !== null && canon(approved as Entry) !== canon(now)) {
      englishActions.append(button('Put back what you approved', () => {
        setDraft('en', key, { ...(approved as Entry) });
        for (const f of fields) f.area.value = (approved as Entry)[f.form] ?? '';
        update();
      }));
    }
    // A conflict: what is there now, and which to keep.
    conflictBox.replaceChildren();
    for (const tag of ['en', US]) {
      const k = id(tag, key);
      if (!conflicts.has(k)) continue;
      const theirs = conflicts.get(k) ?? null;
      conflictBox.append(el('div', { class: 'box conflict' },
        el('p', {}, `${catalogueName(tag)} was changed in the repository since you started editing it. It now says:`),
        el('p', { class: 'words' }, theirs === null ? '(nothing)' : formsOf(theirs).map((f) => theirs[f]).join(' / ')),
        el('div', { class: 'actions' },
          button('Keep mine', () => {
            const d = drafts.get(k);
            if (d !== undefined) drafts.set(k, { ...d, from: theirs });
            conflicts.delete(k);
            storeDrafts();
            renderAll();
          }),
          button('Take theirs', () => { drafts.delete(k); conflicts.delete(k); storeDrafts(); renderAll(); }))));
    }
    renderUs();
    renderStatus();
    renderRowBadges();
  }

  for (const f of fields) requestAnimationFrame(() => autosize(f.area));
  update();
}

/** The list's badges, without rebuilding it under the cursor. */
function renderRowBadges(): void {
  if (selected === null) return;
  const row = document.querySelector(`.row[data-key="${CSS.escape(selected)}"]`);
  if (row === null) return;
  const edited = drafts.has(id('en', selected)) || drafts.has(id(US, selected));
  const bad = edited && problems().some((p) => p.key === selected);
  row.querySelectorAll('.badge').forEach((b) => b.remove());
  const gist = row.querySelector('.gist');
  if (edited) row.insertBefore(el('span', { class: 'badge' }, 'edited'), gist);
  if (bad) row.insertBefore(el('span', { class: 'badge bad' }, 'problem'), gist);
  if (gist !== null) gist.textContent = gistOf(selected);
}

/* ------------------------------------------------------------ the bar */

/** Why Save cannot be pressed now, or null. */
function whyNotSave(): string | null {
  const s = state as State;
  if (saving) return 'Saving…';
  if (s.blocked.length > 0) return s.blocked[0] as string;
  if (drafts.size === 0) return 'No edits to save.';
  if (conflicts.size > 0) return 'Some keys were changed in the repository since you edited them: choose which to keep.';
  const n = new Set(problems().filter((p) => [...drafts.values()].some((d) => d.key === p.key)).map((p) => p.key)).size;
  if (n > 0) return `${n} edited key${n === 1 ? ' has a problem' : 's have problems'} to fix first.`;
  return null;
}

function renderStatus(): void {
  const s = state as State;
  $('where').textContent = `main at ${s.head.slice(0, 8)} · approved ${s.approved.slice(0, 8)} · ${s.queue.length} to read`;
  const why = whyNotSave();
  const keys = new Set([...drafts.values()].map((d) => d.key)).size;
  $('status').textContent = why ?? `${keys} key${keys === 1 ? '' : 's'} edited, not saved. ⌘S saves them.`;
  const save = $<HTMLButtonElement>('save');
  save.disabled = why !== null;
  save.classList.toggle('primary', why === null);
  const banners = $('banners');
  banners.replaceChildren(...[...(notice === null ? [] : [notice]), ...s.blocked].map((b) => el('p', {}, b)));
  renderApprove();
}

function renderApprove(): void {
  const s = state as State;
  const box = $('approve');
  box.replaceChildren(el('h3', {}, 'Approving'));
  if (s.approveOff !== null) {
    box.append(el('p', { class: 'meta' }, s.approveOff));
    return;
  }
  const why = drafts.size > 0 ? 'Save or undo your edits first.'
    : s.approveBlocked.length > 0 ? s.approveBlocked[0] as string
      : s.queue.length === 0 ? 'Nothing is waiting to be approved.' : null;
  if (why !== null) {
    box.append(el('p', { class: 'meta' }, why), button(`Approve the words at ${s.head.slice(0, 8)}`, () => {}, { disabled: '' }));
    return;
  }
  if (!approveAsked) {
    box.append(el('p', { class: 'meta' }, `${s.queue.length} key${s.queue.length === 1 ? '' : 's'} changed since you last approved.`),
      button(`Approve the words at ${s.head.slice(0, 8)}`, () => { approveAsked = true; renderApprove(); }, { id: 'approveAsk' }));
    return;
  }
  box.append(el('p', {}, `Approve every word as it is at ${s.head.slice(0, 8)}? The ${s.queue.length} keys leave the list.`),
    el('div', { class: 'actions' },
      button(`Yes, approve all ${s.queue.length}`, () => { void approveNow(); }, { class: 'primary', id: 'approveYes' }),
      button('Not yet', () => { approveAsked = false; renderApprove(); })));
}

function renderAll(): void {
  renderList();
  renderCard();
  renderStatus();
}

/* ------------------------------------------------------------ saving */

function sheet(...children: (Node | string)[]): void {
  const box = $('sheet');
  box.replaceChildren(...children);
  box.hidden = false;
}

function closeSheet(): void {
  if (!saving) $('sheet').hidden = true;
}

async function saveNow(): Promise<void> {
  if (whyNotSave() !== null) return;
  const s = state as State;
  const edits = [...drafts.values()].map((d) => ({ tag: d.tag, key: d.key, from: d.from, to: d.to }));
  saving = true;
  renderStatus();
  const keys = [...new Set(edits.map((e) => e.key))];
  const stage = el('p', {}, 'Checking the words');
  sheet(el('h3', {}, `Saving ${keys.join(', ')}`), stage,
    el('p', { class: 'meta' }, `With your words, I run ${CHECKED}, which takes about half a minute; ${LEFT}.`));
  let result: SaveResult | null = null;
  try {
    const started = await api<{ job?: number; error?: string }>('save', { base: s.head, edits: edits });
    if (started.error !== undefined) result = { ok: false, reasons: [started.error] };
    while (result === null) {
      await new Promise((r) => setTimeout(r, 1000));
      const job = await api<{ job: number | null; stage?: string; result?: SaveResult | null }>('job');
      if (job.job !== started.job) continue;
      stage.textContent = job.stage ?? '';
      if (job.result !== null && job.result !== undefined) result = job.result;
    }
  } catch (e) {
    result = { ok: false, reasons: [`I lost the server: ${(e as Error).message}. Is npm run copy:edit still running?`] };
  }
  saving = false;
  if (result.ok) {
    for (const e of edits) drafts.delete(id(e.tag, e.key));
    storeDrafts();
    notice = null;
    const took = result.seconds === undefined ? '' : ` in ${Math.max(1, Math.round(result.seconds))} s`;
    sheet(el('h3', {}, 'Saved'), el('p', {}, `Committed ${String(result.commit).slice(0, 8)}: ${String(result.subject)}`),
      el('p', { class: 'meta', id: 'checked' }, `I checked ${CHECKED}${took}; ${LEFT}. On main, not pushed.`),
      button('Close', closeSheet, { id: 'sheetClose' }));
  } else {
    for (const c of result.conflicts ?? []) conflicts.set(id(c.tag, c.key), c.theirs);
    sheet(el('h3', {}, 'Not saved'), el('ul', {}, ...(result.reasons ?? []).map((r) => el('li', {}, r))),
      el('p', { class: 'meta' }, 'Nothing was committed, and your edits are still here.'),
      result.log === undefined || result.log === '' ? '' : el('details', {}, el('summary', {}, 'What the checks printed'), el('pre', {}, result.log.slice(-20000))),
      button('Close', closeSheet, { id: 'sheetClose' }));
  }
  await load();
}

async function approveNow(): Promise<void> {
  const s = state as State;
  const result = await api<SaveResult>('approve', { commit: s.head });
  approveAsked = false;
  sheet(el('h3', {}, result.ok ? 'Approved' : 'Not approved'),
    result.ok ? el('p', {}, `Committed ${String(result.commit).slice(0, 8)}: ${String(result.subject)}`)
      : el('ul', {}, ...(result.reasons ?? []).map((r) => el('li', {}, r))),
    button('Close', closeSheet, { id: 'sheetClose' }));
  await load();
}

/* ------------------------------------------------------------ the keys */

function typing(t: EventTarget | null): boolean {
  return t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement;
}

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    void saveNow();
    return;
  }
  if (e.key === 'Escape') {
    if (typing(e.target)) (e.target as HTMLElement).blur();
    else closeSheet();
    return;
  }
  if (typing(e.target)) {
    if (e.target === $('search') && e.key === 'Enter') {
      e.preventDefault();
      if (visible[0] !== undefined) select(visible[0], true);
    }
    return;
  }
  if (e.key === 'j' || (mod && e.key === 'ArrowDown')) { e.preventDefault(); step(1); return; }
  if (e.key === 'k' || (mod && e.key === 'ArrowUp')) { e.preventDefault(); step(-1); return; }
  if (e.key === '/') { e.preventDefault(); $('search').focus(); return; }
  if (e.key === 'Enter' && selected !== null && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); select(selected, true); }
});

$('save').addEventListener('click', () => { void saveNow(); });
$('search').addEventListener('input', () => renderList());

// Main moving, or someone else's change in copy/, seen within a few seconds.
setInterval(() => {
  if (saving || state === null) return;
  void api<{ head: string; blocked: string[] }>('head').then((h) => {
    const s = state as State;
    if (h.head !== s.head) { void load(); return; }
    if (JSON.stringify(h.blocked) !== JSON.stringify(s.blocked)) {
      s.blocked = h.blocked;
      renderStatus();
    }
  }).catch(() => {
    $('banners').replaceChildren(el('p', {}, 'I can’t reach the server: is npm run copy:edit still running?'));
  });
}, 4000);

void load().catch((e: unknown) => {
  $('card').replaceChildren(el('p', {}, `I couldn’t load the words: ${(e as Error).message}`));
});
