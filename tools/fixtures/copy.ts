/**
 * fixtures/copy.json: the catalogues rendered, and the plural rule of every
 * language at its edges.
 */

import { readFileSync, readdirSync } from 'node:fs';

import {
  Catalogue, CopyArg, CopyArgs, PLURAL_CATEGORIES, formatArg, parseCatalogue, pluralCategory, render,
} from '../../src/core/copy.js';

import { CatalogueJson, english, englishJson } from './shared.js';

/* Every key of every catalogue, rendered with the arguments its English entry
 * gives as an example, and every plural message again at each count below, so
 * that each form is reached. Then the plural rule of every language on its
 * own, at every edge CLDR has: Czech's `many` is for fractions, and 21 and 22
 * are `other`, not `one` and `few` as they would be in Russian or Polish.
 *
 * Then a probe: a small catalogue that exists only here, which the apps never
 * ship. It is in Czech's plural rule with one form per category, so that each
 * category is seen to pick its own template end to end, and it falls back to
 * English, so that the fallback is seen to work, and it carries the malformed
 * braces and the missing argument, so that both renderers fail the same way. */
const COPY_COUNTS = [0, 1, 2, 3, 4, 5, 11, 21, 22, 1.5, 2.5, 0.5];
const PLURAL_LOCALES = ['en', 'en-GB-x-1750', 'cs', 'cs-CZ', 'de'];
const PLURAL_NUMBERS = [0, 1, 2, 3, 4, 5, 10, 11, 21, 22, 100, 101, 1.5, 2.5, 0.5, 1.25, -1, -2];

interface CopyRow { locale: string; key: string; args: CopyArgs; text: string }

// Every file in copy/ is a catalogue, `<tag>.json`; the tests' data about the
// words (surfaces, the 1750 spelling table) is in test/data/.
const copyFiles = readdirSync('copy').filter((f) => f.endsWith('.json')).sort();
const catalogueJson = new Map<string, CatalogueJson>();
for (const file of copyFiles) {
  catalogueJson.set(file.replace(/\.json$/, ''), JSON.parse(readFileSync(`copy/${file}`, 'utf8')) as CatalogueJson);
}

function copyRows(locale: string, catalogue: Catalogue): CopyRow[] {
  const rows: CopyRow[] = [];
  for (const key of Object.keys(englishJson.messages)) {
    const entry = englishJson.messages[key];
    const example = (entry['example'] ?? {}) as Record<string, string | number>;
    rows.push({ locale: locale, key: key, args: example, text: render(catalogue, key, example) });
    const count = entry['count'];
    if (typeof count === 'string') {
      for (const n of COPY_COUNTS) {
        const args = { ...example, [count]: n };
        rows.push({ locale: locale, key: key, args: args, text: render(catalogue, key, args) });
      }
    }
  }
  return rows;
}

const probeJson = {
  locale: 'cs',
  messages: {
    'probe.eggs': {
      count: 'n', one: '{n} one', few: '{n} few', many: '{n} many', other: '{n} other',
    },
    'probe.sparse': { count: 'n', one: 'just {n}', other: '{n} of them' },
    'probe.braces': { text: '{} {1x} {x y} {{ok}} {ok} {ok_2} {Ok} { ok} {ok' },
    'probe.unicode': { text: 'žluťoučký {ok} — ±{n}%' },
  },
};
const probe = parseCatalogue(probeJson, english);
const probeCases: { key: string; args: CopyArgs }[] = [
  ...PLURAL_NUMBERS.map((n) => ({ key: 'probe.eggs', args: { n: n } })),
  ...[0, 1, 2, 5, 1.5].map((n) => ({ key: 'probe.sparse', args: { n: n } })),
  { key: 'probe.eggs', args: {} },
  { key: 'probe.eggs', args: { n: '3' } },
  { key: 'probe.braces', args: { ok: 'OK', ok_2: 2, Ok: 'capital' } },
  { key: 'probe.braces', args: {} },
  { key: 'probe.unicode', args: { ok: 'kůň', n: 4 } },
  { key: 'learned.tuned', args: { eggs: 2 } },
  { key: 'learned.tuned', args: { eggs: 1.5 } },
  { key: 'no.such.key', args: { n: 1 } },
];

export const copyFixture = {
  about: 'Every catalogue rendered, the plural rule of every language at its edges, and a probe catalogue. src/core/copy.ts.',
  locales: [...catalogueJson.keys()],
  render: [...catalogueJson.entries()].flatMap(([locale, json]) => copyRows(
    locale, locale === 'en' ? english : parseCatalogue(json, english),
  )),
  plural: PLURAL_LOCALES.flatMap((locale) => PLURAL_NUMBERS.map((n) => ({
    locale: locale, n: n, category: pluralCategory(locale, n),
  }))),
  categories: PLURAL_CATEGORIES,
  // An argument as text: a string as it is, a count with its own decimals, a
  // measurement with exactly its own, in English and in Czech formatting.
  formatArg: ['en', 'cs-CZ'].flatMap((locale) => ([
    0, 1, 3, -3, 21, 1234567, 1.5, 2.5, 0.25, -0.5, 1e15, 'text', '', '4,5',
    { value: 2, decimals: 2 }, { value: 1234.5, decimals: 1 }, { value: -0.001, decimals: 2 },
  ] as CopyArg[]).map((value) => ({ locale: locale, value: value, text: formatArg(value, locale) }))),
  probe: {
    catalogue: probeJson,
    cases: probeCases.map((c) => ({ ...c, text: render(probe, c.key, c.args) })),
  },
};
