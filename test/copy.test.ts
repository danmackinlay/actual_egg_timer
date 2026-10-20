/**
 * The catalogue: the renderer, the plural rules, and the three things every
 * language is held to - the shape of its entries, the same placeholders as the
 * English, and the length budget of each small surface a string is drawn on.
 *
 * Run from the repo root (npm test does), because the catalogue is read from
 * copy/ as the apps read it, not copied into the test. The rules themselves
 * are tools/copyRules.ts, which the words' editor holds a draft to as well.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  type Catalogue, OVERLAYS, PLURAL_CATEGORIES, catalogueChain, midSentence, parseCatalogue, placeholders,
  pluralCategory, regionOf, render, renderRef, templatesOf,
} from '../src/core/copy.ts';
import { appsUsing, catalogueTags, english, readNotes, readSurfaces } from '../tools/copyNotes.ts';
import {
  type CatalogueJson, type Problem, budgetProblems, braceProblems, catalogueProblems, describe, emptyProblems, exampleOf, fieldProblems,
  longest, measureProblems, overlayProblems, parityProblems, quoteProblems, shapeProblems,
} from '../tools/copyRules.ts';

const listed = (ps: Problem[]): string[] => ps.map(describe);

const SURFACES = readSurfaces();
/** Every catalogue: `copy/<tag>.json` (`tools/copyNotes.ts`). The same
 *  rule as `tools/fixtures/copy.ts`. */
const LOCALES = catalogueTags();
const JSONS = new Map<string, CatalogueJson>(LOCALES.map((l) => [
  l, JSON.parse(readFileSync(`copy/${l}.json`, 'utf8')) as CatalogueJson,
]));
const EN_JSON = JSONS.get('en') as CatalogueJson;
const EN = parseCatalogue(EN_JSON);
/** What each key is for: copy/en.notes.json, beside the catalogue. */
const NOTES = readNotes();
/** Help's sources, which are data beside the words. */
const SOURCES = (JSON.parse(readFileSync('help-sources.json', 'utf8')) as { sources: { url: string; text: string }[] }).sources;

function catalogueFor(locale: string): Catalogue {
  return locale === 'en' ? EN : parseCatalogue(JSONS.get(locale), EN);
}

// --------------------------------------------------------------------------
// the renderer
// --------------------------------------------------------------------------

const TINY = parseCatalogue({
  locale: 'cs',
  messages: {
    eggs: { count: 'n', one: '{n} vejce', few: '{n} vejce', many: '{n} vejce', other: '{n} vajec' },
    greeting: { text: 'Hello, {name}. {name} again, and {missing}.' },
  },
}, EN);

test('placeholders are substituted, repeated ones every time, missing ones left showing', () => {
  assert.equal(render(TINY, 'greeting', { name: 'Dan' }), 'Hello, Dan. Dan again, and {missing}.');
});

test('the plural form is chosen by the count argument, in the catalogue\'s language', () => {
  assert.equal(render(TINY, 'eggs', { n: 1 }), '1 vejce');
  assert.equal(render(TINY, 'eggs', { n: 5 }), '5 vajec');
  // Written in the catalogue's own locale when no other is given: Czech,
  // with its decimal comma.
  assert.equal(render(TINY, 'eggs', { n: 1.5 }), '1,5 vejce');
});

test('a key the language lacks falls back to English, with the English plural rule', () => {
  // Two is Czech's few and English's other: the English form, from the English.
  const tuned = EN_JSON.messages['learned.tuned'] as Record<string, string>;
  assert.equal(render(TINY, 'learned.tuned', { eggs: 1 }), tuned['one'].replace('{eggs}', '1'));
  assert.equal(render(TINY, 'learned.tuned', { eggs: 2 }), tuned['other'].replace('{eggs}', '2'));
});

test('a key nobody has renders as itself, so it is seen rather than blank', () => {
  assert.equal(render(EN, 'no.such.key'), 'no.such.key');
});

test('a word set mid-sentence loses its first capital and keeps the rest', () => {
  assert.equal(midSentence('Last Wednesday', 'en'), 'last Wednesday');
  assert.equal(midSentence('Jammy', 'en-GB-x-1750'), 'jammy');
  assert.equal(midSentence('To-day', 'en'), 'to-day');
  assert.equal(midSentence('İ', 'tr'), 'i');
  assert.equal(midSentence('', 'en'), '');
});

test('a CopyRef from core renders with the app\'s extra arguments', () => {
  assert.equal(renderRef(EN, { key: 'sousvide.start.lastWeekday', args: {} }, { weekday: 'Tuesday' }),
    english('sousvide.start.lastWeekday', { weekday: 'Tuesday' }));
  assert.equal(renderRef(EN, { key: 'duration.hoursMinutes', args: { hours: 22, minutes: 43 } }),
    english('duration.hoursMinutes', { hours: 22, minutes: 43 }));
});

test('a malformed catalogue is refused, naming the key', () => {
  assert.throws(() => parseCatalogue({ locale: 'en', messages: { a: { count: 'n', one: 'x' } } }), /a:/);
  assert.throws(() => parseCatalogue({ locale: 'en', messages: { b: {} } }), /b:/);
  assert.throws(() => parseCatalogue({ locale: 'en', messages: { c: { text: 'x', one: 'y' } } }), /c:/);
  assert.throws(() => parseCatalogue({ messages: {} }), /locale/);
});

// --------------------------------------------------------------------------
// the plural rules
// --------------------------------------------------------------------------

/** Every rule this file has, checked against the platform's own CLDR data.
 *  Node carries full ICU; Swift does not expose it, which is why the rules are
 *  hand-written and fixtured at all. */
test('the hand-written rules agree with Intl.PluralRules', () => {
  const numbers = [0, 1, 2, 3, 4, 5, 10, 11, 12, 21, 22, 25, 100, 101, 102, 0.5, 1.5, 2.5, 4.25, 5.5];
  for (const locale of ['en', 'en-US', 'en-GB-x-1750', 'cs', 'cs-CZ']) {
    const intl = new Intl.PluralRules(locale);
    for (const n of numbers) {
      assert.equal(pluralCategory(locale, n), intl.select(n), `${locale} ${n}`);
    }
  }
});

test('Czech, spelled out: 0, 5, 21 and 22 are other; 1.5 is many', () => {
  const expected: [number, string][] = [
    [0, 'other'], [1, 'one'], [2, 'few'], [4, 'few'], [5, 'other'], [1.5, 'many'],
    [21, 'other'], [22, 'other'],
  ];
  for (const [n, category] of expected) assert.equal(pluralCategory('cs', n), category, `cs ${n}`);
});

test('a language with no rule gets other, the one form every message has', () => {
  assert.equal(pluralCategory('de', 1), 'other');
  assert.equal(pluralCategory('en', NaN), 'other');
});

// --------------------------------------------------------------------------
// the catalogue's shape
// --------------------------------------------------------------------------

test('every English key has notes beside it: its surface, and an example for each placeholder', () => {
  assert.deepEqual(Object.keys(NOTES), Object.keys(EN_JSON.messages), 'the notes have the catalogue\'s keys, in its order');
  for (const key of Object.keys(EN_JSON.messages)) {
    const surface = NOTES[key].surface;
    assert.ok(typeof surface === 'string' && surface in SURFACES, `${key}: surface ${String(surface)}`);
    const message = EN.messages.get(key);
    assert.ok(message !== undefined);
    const used = new Set(templatesOf(message).flatMap(placeholders));
    const example = exampleOf(NOTES, key) as Record<string, unknown>;
    assert.deepEqual(new Set(Object.keys(example)), used, `${key}: example args`);
    if (message.kind === 'plural') {
      assert.equal(typeof example[message.count], 'number', `${key}: the count is a number`);
    }
  }
});

test('a catalogue holds only what the renderers read: templates, `count`, and an overlay\'s `base`', () => {
  for (const json of JSONS.values()) {
    assert.deepEqual(listed([...shapeProblems(json), ...fieldProblems(json)]), []);
  }
});

test('no template has a brace that is not a placeholder', () => {
  assert.deepEqual(listed(braceProblems(EN)), []);
});

test('no template is empty', () => {
  for (const json of JSONS.values()) assert.deepEqual(listed(emptyProblems(json)), []);
});

// --------------------------------------------------------------------------
// placeholder parity
// --------------------------------------------------------------------------

test('every string a reader sees has curly apostrophes and quotes, never straight ones', () => {
  const failures = [...JSONS.values()].flatMap((json) => listed(quoteProblems(json)));
  // Outside the catalogue: the web page's descriptions, which link previews
  // show, and the privacy page's text, less its comment.
  const index = readFileSync('index.html', 'utf8');
  for (const m of index.matchAll(/<meta\b[^>]*(?:name|property)="[a-z:]*description"[^>]*content="([^"]*)"/g)) {
    if (m[1].includes("'")) failures.push(`index.html description: ${m[1]}`);
  }
  const privacy = readFileSync('privacy/index.html', 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '\n');
  for (const line of privacy.split('\n')) if (/['"]/.test(line)) failures.push(`privacy/index.html: ${line.trim()}`);
  for (const s of SOURCES) if (/['"]/.test(s.text)) failures.push(`help-sources.json: ${s.text}`);
  assert.deepEqual(failures, []);
});

/** U+00A0. The other tests read it as a space (tools/text.ts); this one is about it. */
const NBSP = ' ';

test('a measure never breaks across a line: format.* joins value and unit with a no-break space', () => {
  const measured = [...JSONS.values()].map(measureProblems);
  assert.deepEqual(measured.flatMap((m) => listed(m.problems)), []);
  const checked = measured.reduce((n, m) => n + m.checked, 0);
  // The English's at least; a twin that only repeated it is left to English.
  const english = Object.keys(EN_JSON.messages).filter((k) => k.startsWith('format.')).length;
  assert.ok(english >= 11 && checked >= english, `${checked} templates, ${english} of them English`);
  assert.ok(render(EN, 'format.litres', { value: '1.5' }).startsWith(`1.5${NBSP}`), 'the renderer keeps the no-break space');
  assert.equal(measureProblems({ locale: 'x', messages: { 'format.x': { text: '{value} L' } } }).problems.length, 1,
    'a plain space is caught');
});

test('every language uses exactly the English placeholders', () => {
  for (const [locale, json] of JSONS) {
    if (locale === 'en') continue;
    assert.deepEqual(listed(parityProblems(json, EN)), [], locale);
  }
});

test('the parity check catches a dropped, an invented and a miscounted placeholder', () => {
  const broken: CatalogueJson = {
    locale: 'cs',
    messages: {
      'refusal.counter': { text: 'Na lince se žloutek vaří dál — {wanted}.' },
      'readout.alarm.set': { text: 'budík na {time} {when}' },
      'learned.tuned': { text: 'naladěno na {eggs} vajec · ±{spread} %' },
      'learned.pan': { text: 'hrnec {water}: {time}' },
    },
  };
  const failures = parityProblems(broken, EN);
  assert.ok(failures.some((f) => f.key === 'refusal.counter' && f.detail.includes('{limit}')), 'dropped');
  assert.ok(failures.some((f) => f.key === 'readout.alarm.set' && f.detail.includes('{when}')), 'invented');
  assert.ok(failures.some((f) => f.key === 'learned.tuned' && f.detail.includes('counts')), 'miscounted');
  assert.ok(!failures.some((f) => f.key === 'learned.pan'), 'a faithful one passes');
});

// --------------------------------------------------------------------------
// the length budget
// --------------------------------------------------------------------------

// Only a small surface has a budget: a label, a button, a tick, a title, the
// Dynamic Island, an alarm's title. Prose that wraps freely (a body, an (i)'s
// paragraph, Help) has none, and neither does what is only read aloud.

test('every string in every language fits its surface\'s budget', () => {
  for (const locale of LOCALES) {
    assert.deepEqual(listed(budgetProblems(catalogueFor(locale), Object.keys(EN_JSON.messages), NOTES, SURFACES)), []);
  }
});

test('every rule at once, as the words\' editor checks a draft, finds nothing in the catalogues as they are', () => {
  assert.deepEqual(listed(catalogueProblems(JSONS, NOTES, SURFACES)), []);
  // And a draft that breaks two of them is told so, by the key: over budget
  // in English and in each catalogue that falls back to it.
  const draft = new Map(JSONS);
  const en = structuredClone(EN_JSON);
  en.messages['action.startAgain'] = { text: 'Start again, it\'s a very long button label now' };
  draft.set('en', en);
  const rules = [...new Set(catalogueProblems(draft, NOTES, SURFACES, new Set(['action.startAgain'])).map((p) => p.rule))].sort();
  assert.deepEqual(rules, ['budget', 'quote']);
});

test('English fits every budget, and every surface is drawn on', () => {
  // A budget is set from what fits today. Raising one is a design decision
  // about a screen, not a way to make a translation pass: it is the owner's
  // call, made in test/data/surfaces.json with the reason in its `about`.
  const max = new Map<string, number>();
  for (const key of Object.keys(EN_JSON.messages)) {
    const surface = NOTES[key].surface;
    max.set(surface, Math.max(max.get(surface) ?? 0, longest(EN, key, NOTES)));
  }
  for (const [name, surface] of Object.entries(SURFACES)) {
    assert.ok(max.has(name), `${name}: no key is drawn on it`);
    if (surface.budget !== undefined) assert.ok((max.get(name) as number) <= surface.budget, `${name}: English is over budget`);
  }
});

test('there are the plural categories CLDR has, and no others', () => {
  assert.deepEqual([...PLURAL_CATEGORIES], ['zero', 'one', 'two', 'few', 'many', 'other']);
});

// --------------------------------------------------------------------------
// the catalogue and the code agree
// --------------------------------------------------------------------------

test('every key is shown by an app', () => {
  // Which app shows a key is read from the sources, never typed
  // (tools/copyNotes.ts): a key an app's code names is that app's. A key in
  // a core counts for the app that core ships in. That every key the code
  // names exists is the compilers' to say (npm run copy:keys).
  const used = appsUsing(EN.messages.keys());
  for (const key of EN.messages.keys()) assert.ok(used.has(key), `${key}: no app shows it`);
});

test('index.html has no words of its own below <head>, and names only real keys', () => {
  const html = readFileSync('index.html', 'utf8');
  const body = html.slice(html.indexOf('<body'));
  for (const m of body.matchAll(/<([a-z]+)[^>]*\sdata-copy="([^"]+)"[^>]*>([^<]*)</g)) {
    assert.ok(EN.messages.has(m[2]), `data-copy="${m[2]}" is not a key`);
    assert.equal(m[3], '', `<${m[1]} data-copy="${m[2]}"> has text of its own: "${m[3]}"`);
  }
  // What is left once comments, scripts and tags are gone: whitespace, and the
  // two placeholders that stand in for numbers before the first solve.
  const text = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, '\n')
    .split('\n').map((s) => s.trim()).filter((s) => s !== '');
  assert.deepEqual(text.filter((s) => s !== '--:--' && s !== '--'), []);
});

test('Help\'s sources are data both apps read: an https address and a citation each', () => {
  // help-sources.json: the web bundles it (src/ui/sources.ts), iOS has it as
  // a bundle resource (ios/project.yml). The same in every language, so in
  // no catalogue.
  assert.ok(SOURCES.length >= 8);
  for (const s of SOURCES) {
    assert.match(s.url, /^https:\/\/\S+$/, s.text);
    assert.ok(s.text.trim().length > 0, s.url);
  }
  assert.equal(new Set(SOURCES.map((s) => s.url)).size, SOURCES.length, 'each address once');
  assert.ok(!Object.keys(EN_JSON.messages).some((k) => k.startsWith('help.source.')), 'no source is a key');
  assert.match(readFileSync('ios/project.yml', 'utf8'), /- path: \.\.\/help-sources\.json\n\s+buildPhase: resources/);
  assert.match(readFileSync('index.html', 'utf8'), /<ul class="sources" id="helpSources"><\/ul>/);
});

// --------------------------------------------------------------------------
// regional overlays
// --------------------------------------------------------------------------

test('an overlay says only what its region says differently, against today\'s English', () => {
  const regional = LOCALES.filter((l) => l !== 'en' && !l.includes('-x-'));
  assert.deepEqual([...regional].sort(), [...OVERLAYS].sort(), 'every regional catalogue is an overlay, and every overlay ships');
  for (const tag of OVERLAYS) {
    const json = JSONS.get(tag) as CatalogueJson;
    assert.equal(json.locale, tag);
    assert.deepEqual(listed(overlayProblems(json, EN_JSON)), []);
  }
});

test('the region of a tag, and the catalogues that render a language', () => {
  const regions: [string, string | null][] = [
    ['en-US', 'US'], ['en_US', 'US'], ['en-us', 'US'], ['en-Latn-US', 'US'], ['zh-Hant-TW', 'TW'],
    ['es-419', '419'], ['en-US-x-1750', 'US'], ['en', null], ['en-x-us', null], ['en-Latn', null], ['', null],
  ];
  for (const [tag, region] of regions) assert.equal(regionOf(tag), region, tag);

  // An American phone or browser reads the American words; an Australian one,
  // or any English with no overlay, reads the base. The phone's own English
  // decides before its region: English (Australia) in the US is Australian.
  assert.deepEqual(catalogueChain('en', [], 'US'), ['en-US', 'en']);
  assert.deepEqual(catalogueChain('en', [], 'AU'), ['en']);
  assert.deepEqual(catalogueChain('en', [], null), ['en']);
  assert.deepEqual(catalogueChain('en', ['en-AU'], 'US'), ['en']);
  assert.deepEqual(catalogueChain('en', ['en-US'], 'AU'), ['en-US', 'en']);
  assert.deepEqual(catalogueChain('en', ['en'], 'US'), ['en-US', 'en']);
  assert.deepEqual(catalogueChain('en', ['fr-FR', 'en-US'], 'FR'), ['en-US', 'en']);
  assert.deepEqual(catalogueChain('en', ['en-GB'], 'GB'), ['en']);
  // The English of 1750 and any other language have no overlay.
  assert.deepEqual(catalogueChain('en-x-1750', ['en-US'], 'US'), ['en-x-1750', 'en']);
  assert.deepEqual(catalogueChain('cs', ['en-US'], 'US'), ['cs', 'en']);

  // A key the overlay has reads the overlay's words; one it leaves, the
  // English. Both read from the catalogues, so a change of wording moves no test.
  const US_JSON = JSONS.get('en-US') as CatalogueJson;
  const american = parseCatalogue(US_JSON, EN);
  const [overlaid, entry] = Object.entries(US_JSON.messages)[0];
  assert.equal(render(american, overlaid), entry['text']);
  assert.equal(render(EN, overlaid), EN_JSON.messages[overlaid]['text']);
  const left = Object.keys(EN_JSON.messages).find((k) => !(k in US_JSON.messages) && EN.messages.get(k)?.kind === 'text') as string;
  assert.equal(render(american, left), render(EN, left), 'a key the overlay leaves is English\'s');
});
