/**
 * The rules every catalogue's words are held to, one function each, over the
 * catalogues as JSON: the shape of an entry, the same placeholders as the
 * English, curly quotes, a measure's no-break space, an overlay's `base`, and
 * the length budget of each small surface. LANGUAGE.md section 3.
 *
 * test/copy.test.ts holds every catalogue in copy/ to them, and the words'
 * editor (tools/copyEdit/) holds a draft to them as it is typed and again
 * before it is saved, so the page and the tests apply one copy of each rule.
 * Pure: no file is read here (tools/copyNotes.ts reads them), so the page
 * can bundle it.
 *
 * Each rule returns its problems, each naming the catalogue, the key and,
 * where there is one, the template's field; the test lists them, and the
 * editor words them for the owner.
 */

import {
  type Catalogue, type Message, OVERLAYS, PLURAL_CATEGORIES, parseCatalogue, placeholders, render, templatesOf,
} from '../src/core/copy.ts';

/** One key's notes, as copy/en.notes.json has them. */
export interface Notes {
  surface: string;
  note?: string;
  example?: Record<string, string | number>;
}

/** A surface a key is drawn on: what it is, and its length budget in code
 *  points if it is a small one. A surface that wraps freely has none. */
export interface Surface { budget?: number; about: string }

/** A catalogue as its file has it. */
export type Entry = Record<string, unknown>;
export interface CatalogueJson { locale: string; messages: Record<string, Entry> }

export type Rule = 'shape' | 'quote' | 'brace' | 'measure' | 'parity' | 'overlay' | 'budget' | 'empty' | 'arguments';

/** What is wrong with one key of one catalogue. `field` is the template's
 *  (`text`, a plural form, `base`), where the rule reads one. */
export interface Problem {
  rule: Rule;
  tag: string;
  key: string;
  field?: string;
  detail: string;
}

/** A problem as the tests print it. */
export function describe(p: Problem): string {
  return `${p.tag} ${p.key}${p.field === undefined ? '' : `.${p.field}`}: ${p.detail}`;
}

const problem = (rule: Rule, tag: string, key: string, field: string | null, detail: string): Problem =>
  field === null ? { rule: rule, tag: tag, key: key, detail: detail } : { rule: rule, tag: tag, key: key, field: field, detail: detail };

/** The fields of an entry that hold words a reader sees. */
const WORD_FIELDS = ['text', ...PLURAL_CATEGORIES, 'base'];
const TEMPLATE_FIELDS = ['text', ...PLURAL_CATEGORIES];

/** U+00A0. A measure's value and unit are joined by it (tools/text.ts). */
export const NBSP = ' ';

/** The argument that picks a message's plural form, or null for plain text. */
export function countOf(m: Message): string | null {
  return m.kind === 'plural' ? m.count : null;
}

/* ------------------------------------------------------------ measures */

/** A key's example arguments, or none. */
export function exampleOf(notes: Record<string, Notes>, key: string): Record<string, string | number> {
  return notes[key]?.example ?? {};
}

/** The counts every plural message is measured at. */
export const PLURAL_COUNTS = [0, 1, 2, 3, 4, 5, 11, 21, 22, 1.5];

/** A key's longest rendering in a catalogue, in code points ("ž" is one
 *  character on a screen): at its example arguments and, for a plural, at
 *  every one of PLURAL_COUNTS. The measure a budget holds. */
export function longest(catalogue: Catalogue, key: string, notes: Record<string, Notes>): number {
  let found: Catalogue | null = catalogue;
  while (found !== null && !found.messages.has(key)) found = found.fallback;
  const m = found?.messages.get(key);
  const example = exampleOf(notes, key);
  const argSets = m?.kind === 'plural' ? [example, ...PLURAL_COUNTS.map((n) => ({ ...example, [m.count]: n }))] : [example];
  return Math.max(...argSets.map((args) => [...render(catalogue, key, args)].length));
}

/* --------------------------------------------------------------- rules */

/** An entry the renderers cannot read, which parseCatalogue refuses. */
export function shapeProblems(json: CatalogueJson): Problem[] {
  const out: Problem[] = [];
  for (const [key, entry] of Object.entries(json.messages)) {
    try {
      parseCatalogue({ locale: json.locale, messages: { [key]: entry } });
    } catch (e) {
      out.push(problem('shape', json.locale, key, null, (e as Error).message));
    }
  }
  return out;
}

/** A catalogue holds only what the renderers read: templates, `count`, and
 *  an overlay's `base`. */
export function fieldProblems(json: CatalogueJson): Problem[] {
  const allowed = new Set(['text', 'count', ...PLURAL_CATEGORIES, ...(OVERLAYS.includes(json.locale) ? ['base'] : [])]);
  const out: Problem[] = [];
  for (const [key, entry] of Object.entries(json.messages)) {
    for (const field of Object.keys(entry)) {
      if (!allowed.has(field)) out.push(problem('shape', json.locale, key, field, 'belongs in the notes'));
    }
  }
  return out;
}

/** Straight apostrophes and quotes, where curly ones belong (DECISIONS.md 56). */
export function quoteProblems(json: CatalogueJson): Problem[] {
  const out: Problem[] = [];
  for (const [key, entry] of Object.entries(json.messages)) {
    for (const field of WORD_FIELDS) {
      const t = entry[field];
      if (typeof t === 'string' && /['"]/.test(t)) out.push(problem('quote', json.locale, key, field, t));
    }
  }
  return out;
}

/** A template that says nothing. */
export function emptyProblems(json: CatalogueJson): Problem[] {
  const out: Problem[] = [];
  for (const [key, entry] of Object.entries(json.messages)) {
    for (const field of WORD_FIELDS) {
      const t = entry[field];
      if (typeof t === 'string' && t.trim() === '') out.push(problem('empty', json.locale, key, field, 'is empty'));
    }
  }
  return out;
}

/** A brace that is not a placeholder's. */
export function braceProblems(catalogue: Catalogue): Problem[] {
  const out: Problem[] = [];
  for (const [key, message] of catalogue.messages) {
    for (const template of templatesOf(message)) {
      const stripped = placeholders(template).reduce((t, name) => t.split(`{${name}}`).join(''), template);
      if (/[{}]/.test(stripped)) out.push(problem('brace', catalogue.locale, key, null, `stray brace in "${template}"`));
    }
  }
  return out;
}

/** A measure that could break across a line: every format.* template joins
 *  `{value}` to its unit with a no-break space, and has no plain one. */
export function measureProblems(json: CatalogueJson): { problems: Problem[]; checked: number } {
  const out: Problem[] = [];
  let checked = 0;
  for (const [key, entry] of Object.entries(json.messages)) {
    if (!key.startsWith('format.')) continue;
    for (const field of TEMPLATE_FIELDS) {
      const t = entry[field];
      if (typeof t !== 'string') continue;
      checked += 1;
      if (!t.includes(`{value}${NBSP}`) || t.includes(' ')) out.push(problem('measure', json.locale, key, field, JSON.stringify(t)));
    }
  }
  return { problems: out, checked: checked };
}

/** Each key of a language whose placeholders are not the English's. Each
 *  form may leave out the count (Czech "jedno vejce"), never anything else.
 *  A dropped `{limit}` is a sentence that lies about the egg (LANGUAGE.md §2). */
export function parityProblems(json: CatalogueJson, english: Catalogue): Problem[] {
  const out: Problem[] = [];
  const tag = json.locale;
  const catalogue = parseCatalogue(json, english);
  for (const [key, message] of catalogue.messages) {
    const en = english.messages.get(key);
    if (en === undefined) {
      out.push(problem('parity', tag, key, null, 'not an English key'));
      continue;
    }
    const want = [...new Set(templatesOf(en).flatMap(placeholders))].sort();
    for (const template of templatesOf(message)) {
      const got = new Set(placeholders(template));
      for (const name of want) {
        if (!got.has(name) && name !== countOf(en)) out.push(problem('parity', tag, key, null, `"${template}" drops {${name}}`));
      }
      for (const name of got) {
        if (!want.includes(name)) out.push(problem('parity', tag, key, null, `"${template}" invents {${name}}`));
      }
    }
    if (countOf(en) !== countOf(message)) {
      out.push(problem('parity', tag, key, null, `counts ${String(countOf(message))}, not ${String(countOf(en))}`));
    }
  }
  return out;
}

/** An overlay says only what its region says differently, against today's
 *  English: each entry a `base` and a `text`, the base the English as it is
 *  now, the text not the English's. */
export function overlayProblems(json: CatalogueJson, english: CatalogueJson): Problem[] {
  const out: Problem[] = [];
  const tag = json.locale;
  for (const [key, entry] of Object.entries(json.messages)) {
    const en = english.messages[key];
    if (en === undefined) {
      out.push(problem('overlay', tag, key, null, 'not an English key'));
      continue;
    }
    const fields = Object.keys(entry).sort().join(',');
    if (fields !== 'base,text') out.push(problem('overlay', tag, key, null, `has ${fields}, not just base and text`));
    // Written against the English as it is: a wording change to the English
    // and not this would leave the region reading the old meaning.
    if (entry['base'] !== en['text']) {
      out.push(problem('overlay', tag, key, 'base', `written against "${String(entry['base'])}", but English now says "${String(en['text'])}"`));
    }
    if (entry['text'] === en['text']) out.push(problem('overlay', tag, key, 'text', 'says what English says'));
  }
  return out;
}

/** Each of `keys` drawn on a small surface whose longest rendering in
 *  `catalogue` is over that surface's budget. */
export function budgetProblems(catalogue: Catalogue, keys: Iterable<string>, notes: Record<string, Notes>,
  surfaces: Record<string, Surface>): Problem[] {
  const out: Problem[] = [];
  for (const key of keys) {
    const name = notes[key]?.surface;
    const budget = name === undefined ? undefined : surfaces[name]?.budget;
    if (budget === undefined) continue;
    const w = longest(catalogue, key, notes);
    if (w > budget) out.push(problem('budget', catalogue.locale, key, null, `${w} characters on "${String(name)}", budget ${budget}`));
  }
  return out;
}

/** A key whose arguments changed between two versions of the English: each
 *  template, form by form, keeps the placeholders it had, the plural keeps
 *  its count and its forms. A wording change that changes no argument needs
 *  npm test and fixtures:check alone (DECISIONS.md 135); one that does needs
 *  the web e2e too, and the code that passes them. */
export function argumentProblems(before: CatalogueJson, after: CatalogueJson, keys: Iterable<string>): Problem[] {
  const out: Problem[] = [];
  const tag = after.locale;
  const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));
  for (const key of keys) {
    const was = before.messages[key];
    const now = after.messages[key];
    if (was === undefined || now === undefined) continue;
    if (was['count'] !== now['count']) {
      out.push(problem('arguments', tag, key, 'count', `counts ${String(now['count'])}, not ${String(was['count'])}`));
    }
    for (const field of TEMPLATE_FIELDS) {
      const a = was[field];
      const b = now[field];
      if (a === undefined && b === undefined) continue;
      if (typeof a !== 'string' || typeof b !== 'string') {
        out.push(problem('arguments', tag, key, field, typeof a === 'string' ? 'a form taken away' : 'a form added'));
        continue;
      }
      const pa = placeholders(a);
      const pb = placeholders(b);
      if (!same(pa, pb)) {
        const dropped = pa.filter((n) => !pb.includes(n)).map((n) => `{${n}}`);
        const added = pb.filter((n) => !pa.includes(n)).map((n) => `{${n}}`);
        out.push(problem('arguments', tag, key, field,
          [dropped.length > 0 ? `drops ${dropped.join(' ')}` : '', added.length > 0 ? `adds ${added.join(' ')}` : '']
            .filter((s) => s !== '').join(', ')));
      }
    }
  }
  return out;
}

/** Every rule a set of catalogues is held to, for the keys in `keys` (every
 *  English key when null): the English first, then its overlays and its
 *  translations, each measured over the English. What the editor checks a
 *  draft by. The shape is checked first: a catalogue the renderers cannot
 *  read is not measured. */
export function catalogueProblems(jsons: ReadonlyMap<string, CatalogueJson>, notes: Record<string, Notes>,
  surfaces: Record<string, Surface>, keys: ReadonlySet<string> | null = null): Problem[] {
  const enJson = jsons.get('en');
  if (enJson === undefined) throw new Error('no English catalogue');
  const only = (ps: Problem[]): Problem[] => (keys === null ? ps : ps.filter((p) => keys.has(p.key)));
  const shapes = only([...jsons.values()].flatMap((j) => [...shapeProblems(j), ...fieldProblems(j)]));
  if (shapes.length > 0) return shapes;
  const english = parseCatalogue(enJson);
  const measured = keys ?? new Set(Object.keys(enJson.messages));
  const out: Problem[] = [];
  for (const [tag, json] of jsons) {
    const catalogue = tag === 'en' ? english : parseCatalogue(json, english);
    out.push(...quoteProblems(json), ...emptyProblems(json), ...measureProblems(json).problems);
    if (tag === 'en') out.push(...braceProblems(english));
    else out.push(...parityProblems(json, english));
    if (OVERLAYS.includes(tag)) out.push(...overlayProblems(json, enJson));
    out.push(...budgetProblems(catalogue, [...measured].filter((k) => k in enJson.messages), notes, surfaces));
  }
  return only(out);
}
