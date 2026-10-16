/**
 * fixtures/copy.json: the renderer's contract, and the plural rule of every
 * language at its edges.
 */

import {
  type Catalogue, type CopyArg, type CopyArgs, OVERLAYS, PLURAL_CATEGORIES, catalogueChain, formatArg, parseCatalogue,
  isPeriod, pluralCategory, regionOf, render,
} from '../../src/core/copy.ts';

/* The renderer's contract, pinned on catalogues that exist only here, so
 * that a change of wording in copy/ never rewrites this fixture: placeholders
 * of every kind and their formats, each plural category, the fallback from a
 * translation and from a regional overlay to the English, and every way a
 * brace can be malformed. Then the plural rule of every language on its own,
 * at every edge CLDR has: Czech's `many` is for fractions, and 21 and 22 are
 * `other`, not `one` and `few` as they would be in Russian or Polish.
 *
 * Then a probe: a catalogue in Czech's plural rule with one form per
 * category, so that each category is seen to pick its own template end to
 * end, which falls back to the English across a change of plural rule.
 *
 * That the real catalogues load, and keep the English's keys and
 * placeholders, is a test in each app (copy.test.ts, CopyConformance),
 * not rows here. */
const COPY_COUNTS = [0, 1, 2, 3, 4, 5, 11, 21, 22, 1.5, 2.5, 0.5];
const PLURAL_LOCALES = ['en', 'en-GB-x-1750', 'cs', 'cs-CZ', 'de'];
const PLURAL_NUMBERS = [0, 1, 2, 3, 4, 5, 10, 11, 21, 22, 100, 101, 1.5, 2.5, 0.5, 1.25, -1, -2];

/** The English the others fall back to: one message for each thing a
 *  template can hold. */
const englishCase = {
  locale: 'en',
  messages: {
    'plain': { text: 'Lid on’ “quoted” — done' },
    'one.arg': { text: 'Take them out at {time}' },
    'two.args': { text: '{low} to {high}' },
    'adjacent': { text: '{a}{b} and {a} again' },
    'measure': { text: 'about {mass} each' },
    'eggs': { count: 'eggs', one: '{eggs} egg', other: '{eggs} eggs' },
    'eggs.of': { count: 'n', one: '{n} egg of {total}', other: '{n} eggs of {total}' },
    'english.only': { text: 'Only the English says {name}' },
    'overlaid': { text: 'a pan of water' },
    'braces': { text: '{} {1x} {x y} {{ok}} {ok} {ok_2} {Ok} { ok} {ok' },
    'unicode': { text: 'žluťoučký {ok} — ±{n}%' },
  },
};
/** A translation that lags: some keys its own, the rest the English's. */
const translationCase = {
  locale: 'en-x-1750',
  messages: {
    'plain': { text: 'The lid upon it' },
    'one.arg': { text: 'Withdraw them at {time}' },
    'eggs': { count: 'eggs', one: '{eggs} egg', other: '{eggs} eggs, in all' },
  },
};
/** A regional overlay: only what its region says differently, each over the
 *  English it was written against. */
const overlayCase = {
  locale: 'en-US',
  messages: {
    'overlaid': { base: 'a pan of water', text: 'a pot of water' },
  },
};
const caseEnglish = parseCatalogue(englishCase);
const caseCatalogues: Record<string, Catalogue> = {
  'en': caseEnglish,
  'en-x-1750': parseCatalogue(translationCase, caseEnglish),
  'en-US': parseCatalogue(overlayCase, caseEnglish),
};

interface RenderCase { catalogue: string; key: string; args: CopyArgs; formatLocale?: string }

const renderCases: RenderCase[] = [
  ...['en', 'en-x-1750', 'en-US'].flatMap((catalogue) => [
    { catalogue: catalogue, key: 'plain', args: {} },
    { catalogue: catalogue, key: 'one.arg', args: { time: '7:42' } },
    { catalogue: catalogue, key: 'two.args', args: { low: 'Soft', high: 'Fudgy' } },
    { catalogue: catalogue, key: 'english.only', args: { name: 'it' } },
    { catalogue: catalogue, key: 'overlaid', args: {} },
    { catalogue: catalogue, key: 'no.such.key', args: { n: 1 } },
    ...COPY_COUNTS.map((n) => ({ catalogue: catalogue, key: 'eggs', args: { eggs: n } })),
  ]),
  // Placeholders: a number, a string, a measurement with its own decimals, a
  // missing one, one twice, two side by side; and the same in Czech's
  // formatting, a comma for the point.
  { catalogue: 'en', key: 'measure', args: { mass: { value: 58.25, decimals: 1 } } },
  { catalogue: 'en', key: 'measure', args: { mass: 1234.5 } },
  { catalogue: 'en', key: 'measure', args: { mass: { value: 58.25, decimals: 1 } }, formatLocale: 'cs-CZ' },
  { catalogue: 'en', key: 'measure', args: { mass: 1.5 }, formatLocale: 'cs-CZ' },
  { catalogue: 'en', key: 'measure', args: {} },
  { catalogue: 'en', key: 'two.args', args: { low: 'Soft' } },
  { catalogue: 'en', key: 'adjacent', args: { a: 'x', b: 2 } },
  { catalogue: 'en', key: 'eggs.of', args: { n: 1, total: 6 } },
  { catalogue: 'en', key: 'eggs.of', args: { n: 2.5, total: 6 } },
  { catalogue: 'en', key: 'eggs.of', args: { total: 6 } },
  { catalogue: 'en', key: 'eggs', args: { eggs: '3' } },
  { catalogue: 'en', key: 'eggs', args: { eggs: 1 }, formatLocale: 'cs-CZ' },
  { catalogue: 'en', key: 'eggs', args: { eggs: 1.5 }, formatLocale: 'cs-CZ' },
  // Braces that are not placeholders, and text beyond ASCII.
  { catalogue: 'en', key: 'braces', args: { ok: 'OK', ok_2: 2, Ok: 'capital' } },
  { catalogue: 'en', key: 'braces', args: {} },
  { catalogue: 'en', key: 'unicode', args: { ok: 'kůň', n: 4 } },
];

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
const probe = parseCatalogue(probeJson, caseEnglish);
const probeCases: { key: string; args: CopyArgs }[] = [
  ...PLURAL_NUMBERS.map((n) => ({ key: 'probe.eggs', args: { n: n } })),
  ...[0, 1, 2, 5, 1.5].map((n) => ({ key: 'probe.sparse', args: { n: n } })),
  { key: 'probe.eggs', args: {} },
  { key: 'probe.eggs', args: { n: '3' } },
  { key: 'probe.braces', args: { ok: 'OK', ok_2: 2, Ok: 'capital' } },
  { key: 'probe.braces', args: {} },
  { key: 'probe.unicode', args: { ok: 'kůň', n: 4 } },
  // Czech's catalogue falling back to an English plural: the English form
  // for English's rule, numbers in Czech's formatting.
  { key: 'eggs', args: { eggs: 2 } },
  { key: 'eggs', args: { eggs: 1.5 } },
  { key: 'no.such.key', args: { n: 1 } },
];

export const copyFixture = {
  about: 'The renderer\'s contract on catalogues of its own: placeholders and their formats, plural forms, the fallback from a translation and an overlay to the English, malformed braces; the plural rule of every language at its edges; which tags are the English of 1750; and a probe catalogue. None of it is copy/\'s words. src/core/copy.ts.',
  catalogues: { 'en': englishCase, 'en-x-1750': translationCase, 'en-US': overlayCase },
  render: renderCases.map((c) => ({
    ...c, text: render(caseCatalogues[c.catalogue], c.key, c.args, c.formatLocale),
  })),
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
  // Which catalogues render a language, for every language and a spread of
  // devices, and the region read from each tag on the way.
  overlays: OVERLAYS,
  regions: [
    'en-US', 'en_US', 'en-us', 'en-Latn-US', 'zh-Hant-TW', 'es-419', 'en-US-x-1750', 'en', 'en-x-us',
    'en-Latn', '', 'en-AU', 'cs-CZ',
  ].map((tag) => ({ tag: tag, region: regionOf(tag) })),
  chains: ['en', 'en-x-1750', 'cs'].flatMap((language) => ([
    [[], null], [[], 'US'], [[], 'AU'], [['en-AU'], 'US'], [['en-US'], 'AU'], [['en'], 'US'],
    [['fr-FR', 'en-US'], 'FR'], [['en-GB'], 'GB'], [['cs-CZ'], 'US'], [['en_US'], null],
  ] as [string[], string | null][]).map(([preferred, region]) => ({
    language: language, preferred: preferred, region: region, chain: catalogueChain(language, preferred, region),
  }))),
  // Which tags are the English of 1750: the subtag in any region and any
  // case, ahead of a further subtag, and not a longer or shorter number, a
  // tag in another language, or no language at all.
  periods: [
    'en', 'en-US', 'en-GB', 'EN-gb', 'en-x-1750', 'en-US-x-1750', 'en-GB-x-1750', 'EN-GB-X-1750', 'en-x-1750-a',
    'en-x-17500', 'en-x-175', 'cs', 'cs-CZ', 'cs-x-1750', 'x-1750', '', 'enx-1750',
  ].map((tag) => ({ tag: tag, isPeriod: isPeriod(tag) })),
  probe: {
    catalogue: probeJson,
    cases: probeCases.map((c) => ({ ...c, text: render(probe, c.key, c.args) })),
  },
};
