/**
 * The catalogue: the renderer, the plural rules, and the three things every
 * language is held to - the shape of its entries, the same placeholders as the
 * English, and the length budget of the surface each string is drawn on.
 *
 * Run from the repo root (npm test does), because the catalogue is read from
 * copy/ as the apps read it, not copied into the test.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import {
  Catalogue, Message, PLURAL_CATEGORIES, midSentence, parseCatalogue, placeholders, pluralCategory, render,
  renderRef, templatesOf,
} from '../src/core/copy.js';

/** The argument that picks a message's plural form, or null for plain text. */
function countOf(m: Message): string | null {
  return m.kind === 'plural' ? m.count : null;
}

type Entry = Record<string, unknown>;
interface CatalogueJson { locale: string; messages: Record<string, Entry> }
interface Surface { budget: number; about: string }

const SURFACES = JSON.parse(readFileSync('test/data/surfaces.json', 'utf8')) as Record<string, Surface>;
/** Every catalogue: `copy/<tag>.json`, and nothing else is in copy/ (the
 *  surfaces and the 1750 spelling table are tests' data, in test/data/). The
 *  same rule as `tools/fixtures/copy.ts`. */
const LOCALES = readdirSync('copy')
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));
const JSONS = new Map<string, CatalogueJson>(LOCALES.map((l) => [
  l, JSON.parse(readFileSync(`copy/${l}.json`, 'utf8')) as CatalogueJson,
]));
const EN_JSON = JSONS.get('en') as CatalogueJson;
const EN = parseCatalogue(EN_JSON);

function catalogueFor(locale: string): Catalogue {
  return locale === 'en' ? EN : parseCatalogue(JSONS.get(locale), EN);
}

/** Code points, not UTF-16 units: "ž" is one character on a screen. */
function width(s: string): number {
  return [...s].length;
}

/** The counts every plural message is rendered at, for the budget. */
const COUNTS = [0, 1, 2, 3, 4, 5, 11, 21, 22, 1.5];

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

test('1a. placeholders are substituted, repeated ones every time, missing ones left showing', () => {
  assert.equal(render(TINY, 'greeting', { name: 'Dan' }), 'Hello, Dan. Dan again, and {missing}.');
});

test('1b. the plural form is chosen by the count argument, in the catalogue\'s language', () => {
  assert.equal(render(TINY, 'eggs', { n: 1 }), '1 vejce');
  assert.equal(render(TINY, 'eggs', { n: 5 }), '5 vajec');
  // Written in the catalogue's own locale when no other is given: Czech,
  // with its decimal comma.
  assert.equal(render(TINY, 'eggs', { n: 1.5 }), '1,5 vejce');
});

test('1c. a key the language lacks falls back to English, with the English plural rule', () => {
  assert.equal(render(TINY, 'learned.tuned', { eggs: 1 }), 'Learned from 1 egg');
  assert.equal(render(TINY, 'learned.tuned', { eggs: 2 }), 'Learned from 2 eggs');
});

test('1d. a key nobody has renders as itself, so it is seen rather than blank', () => {
  assert.equal(render(EN, 'no.such.key'), 'no.such.key');
});

test('1e. a word set mid-sentence loses its first capital and keeps the rest', () => {
  assert.equal(midSentence('Last Wednesday', 'en'), 'last Wednesday');
  assert.equal(midSentence('Jammy', 'en-GB-x-1750'), 'jammy');
  assert.equal(midSentence('To-day', 'en'), 'to-day');
  assert.equal(midSentence('İ', 'tr'), 'i');
  assert.equal(midSentence('', 'en'), '');
});

test('1e. a CopyRef from core renders with the app\'s extra arguments', () => {
  assert.equal(renderRef(EN, { key: 'sousvide.start.lastWeekday', args: {} }, { weekday: 'Tuesday' }),
    'Last Tuesday');
  assert.equal(renderRef(EN, { key: 'duration.hoursMinutes', args: { hours: 22, minutes: 43 } }),
    '22 h 43 min');
});

test('1f. a malformed catalogue is refused, naming the key', () => {
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
test('2a. the hand-written rules agree with Intl.PluralRules', () => {
  const numbers = [0, 1, 2, 3, 4, 5, 10, 11, 12, 21, 22, 25, 100, 101, 102, 0.5, 1.5, 2.5, 4.25, 5.5];
  for (const locale of ['en', 'en-US', 'en-GB-x-1750', 'cs', 'cs-CZ']) {
    const intl = new Intl.PluralRules(locale);
    for (const n of numbers) {
      assert.equal(pluralCategory(locale, n), intl.select(n), `${locale} ${n}`);
    }
  }
});

test('2b. Czech, spelled out: 0, 5, 21 and 22 are other; 1.5 is many', () => {
  const expected: [number, string][] = [
    [0, 'other'], [1, 'one'], [2, 'few'], [4, 'few'], [5, 'other'], [1.5, 'many'],
    [21, 'other'], [22, 'other'],
  ];
  for (const [n, category] of expected) assert.equal(pluralCategory('cs', n), category, `cs ${n}`);
});

test('2c. a language with no rule gets other, the one form every message has', () => {
  assert.equal(pluralCategory('de', 1), 'other');
  assert.equal(pluralCategory('en', NaN), 'other');
});

// --------------------------------------------------------------------------
// the catalogue's shape
// --------------------------------------------------------------------------

test('3a. every English entry names its surface, its apps, and an example for each placeholder', () => {
  for (const [key, entry] of Object.entries(EN_JSON.messages)) {
    const surface = entry['surface'];
    assert.ok(typeof surface === 'string' && surface in SURFACES, `${key}: surface ${String(surface)}`);
    const apps = entry['apps'];
    assert.ok(Array.isArray(apps) && apps.length > 0, `${key}: apps`);
    for (const app of apps as unknown[]) assert.ok(app === 'web' || app === 'ios', `${key}: app ${String(app)}`);

    const message = EN.messages.get(key);
    assert.ok(message !== undefined);
    const used = new Set(templatesOf(message).flatMap(placeholders));
    const example = (entry['example'] ?? {}) as Record<string, unknown>;
    assert.deepEqual(new Set(Object.keys(example)), used, `${key}: example args`);
    if (message.kind === 'plural') {
      assert.equal(typeof example[message.count], 'number', `${key}: the count is a number`);
    }
  }
});

test('3b. no template has a brace that is not a placeholder', () => {
  for (const [key, message] of EN.messages) {
    for (const template of templatesOf(message)) {
      const stripped = placeholders(template).reduce((t, name) => t.split(`{${name}}`).join(''), template);
      assert.ok(!/[{}]/.test(stripped), `${key}: stray brace in "${template}"`);
    }
  }
});

// --------------------------------------------------------------------------
// placeholder parity
// --------------------------------------------------------------------------

/** Why each key of `locale` fails parity with English, if it does. A dropped
 *  `{limit}` is a sentence that lies about the egg (LANGUAGE.md §2). */
function parityFailures(json: CatalogueJson): string[] {
  const failures: string[] = [];
  const catalogue = parseCatalogue(json, EN);
  for (const [key, message] of catalogue.messages) {
    const english = EN.messages.get(key);
    if (english === undefined) {
      failures.push(`${key}: not an English key`);
      continue;
    }
    const want = [...new Set(templatesOf(english).flatMap(placeholders))].sort();
    for (const template of templatesOf(message)) {
      // Each form may leave out the count (Czech "jedno vejce"), never anything else.
      const got = new Set(placeholders(template));
      for (const name of want) {
        if (!got.has(name) && name !== countOf(english)) failures.push(`${key}: "${template}" drops {${name}}`);
      }
      for (const name of got) {
        if (!want.includes(name)) failures.push(`${key}: "${template}" invents {${name}}`);
      }
    }
    if (countOf(english) !== countOf(message)) {
      failures.push(`${key}: counts ${String(countOf(message))}, not ${String(countOf(english))}`);
    }
  }
  return failures;
}

test('4a. every language uses exactly the English placeholders', () => {
  for (const [locale, json] of JSONS) {
    if (locale === 'en') continue;
    assert.deepEqual(parityFailures(json), [], locale);
  }
});

test('4b. the parity check catches a dropped, an invented and a miscounted placeholder', () => {
  const broken: CatalogueJson = {
    locale: 'cs',
    messages: {
      'refusal.counter': { text: 'Na lince se žloutek vaří dál — {wanted}.' },
      'readout.alarm.set': { text: 'budík na {time} {when}' },
      'learned.tuned': { text: 'naladěno na {eggs} vajec · ±{spread} %' },
      'learned.pan': { text: 'hrnec {water}: {time}' },
    },
  };
  const failures = parityFailures(broken);
  assert.ok(failures.some((f) => f.startsWith('refusal.counter') && f.includes('{limit}')), 'dropped');
  assert.ok(failures.some((f) => f.startsWith('readout.alarm.set') && f.includes('{when}')), 'invented');
  assert.ok(failures.some((f) => f.startsWith('learned.tuned') && f.includes('counts')), 'miscounted');
  assert.ok(!failures.some((f) => f.startsWith('learned.pan')), 'a faithful one passes');
});

// --------------------------------------------------------------------------
// the length budget
// --------------------------------------------------------------------------

/** Each key's longest rendering in a language, at its example arguments and,
 *  for a plural, at every count. */
function longest(catalogue: Catalogue, key: string, entry: Entry): number {
  const example = (entry['example'] ?? {}) as Record<string, string | number>;
  const count = entry['count'];
  const argSets = typeof count === 'string'
    ? [example, ...COUNTS.map((n) => ({ ...example, [count]: n }))]
    : [example];
  return Math.max(...argSets.map((args) => width(render(catalogue, key, args))));
}

test('5a. every string in every language fits its surface\'s budget', () => {
  for (const locale of LOCALES) {
    const catalogue = catalogueFor(locale);
    for (const [key, entry] of Object.entries(EN_JSON.messages)) {
      const surface = SURFACES[entry['surface'] as string];
      const w = longest(catalogue, key, entry);
      assert.ok(w <= surface.budget,
        `${locale} ${key}: ${w} characters on "${String(entry['surface'])}", budget ${surface.budget}`);
    }
  }
});

test('5b. English fits every budget, and every budget is drawn on', () => {
  // A budget is set from what fits today. Raising one is a design decision
  // about a screen, not a way to make a translation pass - so it is checked
  // here, and moving it means editing this test and saying why.
  const max = new Map<string, number>();
  for (const [key, entry] of Object.entries(EN_JSON.messages)) {
    const surface = entry['surface'] as string;
    max.set(surface, Math.max(max.get(surface) ?? 0, longest(EN, key, entry)));
  }
  for (const [name, surface] of Object.entries(SURFACES)) {
    assert.ok(max.has(name), `${name}: no key is drawn on it`);
    assert.ok((max.get(name) as number) <= surface.budget, `${name}: English is over budget`);
  }
});

test('5c. there are the plural categories CLDR has, and no others', () => {
  assert.deepEqual([...PLURAL_CATEGORIES], ['zero', 'one', 'two', 'few', 'many', 'other']);
});

// --------------------------------------------------------------------------
// the catalogue and the code agree
// --------------------------------------------------------------------------

/** Every file that can name a key, by the app that ships it. A key in a core
 *  counts for the app that core ships in. */
function sourceFiles(dir: string, ext: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith(ext))
    .map((f) => `${dir}/${f}`);
}

const SOURCES: Record<'web' | 'ios', string[]> = {
  web: [...sourceFiles('src/ui', '.ts'), ...sourceFiles('src/core', '.ts'), 'index.html'],
  ios: [
    ...sourceFiles('ios/App', '.swift'), ...sourceFiles('ios/Widget', '.swift'),
    ...sourceFiles('ios/Shared', '.swift'), ...sourceFiles('ios/EggTimerCore/Sources', '.swift'),
  ],
};

/** Quoted strings shaped like a key: 'group.name', "group.name.more". */
const KEY_SHAPE = /['"`]([a-z][a-zA-Z]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+)['"`]/g;

/** Identifiers that are shaped like keys and are not: notification ids. */
const NOT_KEYS = new Set(['cook.pull', 'cook.cool']);

function keysIn(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(KEY_SHAPE)].map((m) => m[1]);
}

const GROUPS = new Set([...EN.messages.keys()].map((k) => k.split('.')[0]));

test('6a. every key the code names exists, and every key is used by the apps it says', () => {
  const usedBy = new Map<string, Set<string>>();
  for (const app of ['web', 'ios'] as const) {
    for (const file of SOURCES[app]) {
      for (const key of keysIn(file)) {
        if (NOT_KEYS.has(key) || !GROUPS.has(key.split('.')[0])) continue;
        assert.ok(EN.messages.has(key), `${file}: "${key}" is not in copy/en.json`);
        if (!usedBy.has(key)) usedBy.set(key, new Set());
        (usedBy.get(key) as Set<string>).add(app);
      }
    }
  }
  for (const [key, entry] of Object.entries(EN_JSON.messages)) {
    const said = [...(entry['apps'] as string[])].sort();
    const found = [...(usedBy.get(key) ?? [])].sort();
    assert.deepEqual(found, said, `${key}: used by [${found.join(', ')}], says [${said.join(', ')}]`);
  }
});

test('6b. index.html has no words of its own below <head>, and names only real keys', () => {
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
