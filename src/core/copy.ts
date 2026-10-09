/**
 * The words, as data: one catalogue per language, and the few lines that turn
 * a key and its arguments into a sentence.
 *
 * Both apps render every string through this, or through its Swift twin in
 * `EggTimerCopy`, and `fixtures/copy.json` holds the two to the same bytes.
 * Before this existed the same sentences were typed twice, once per app, and
 * nothing but care kept them together - the failure core's shared decisions
 * (`inputs.ts`, `slider.ts` and the rest) end for numbers (LANGUAGE.md §1).
 *
 * The format is deliberately small. A message is a template with named
 * placeholders, `{limit}`, and optionally one template per CLDR plural category
 * of one named count argument. That is all the copy needs: there is no
 * `select`, no nesting, and no ICU MessageFormat, because the repo carries no
 * runtime dependencies and MessageFormat is a dependency's worth of grammar.
 *
 * Like everything else in `src/core/`, this does no I/O. The catalogue is data
 * the app has already loaded and hands in.
 *
 * A number that goes in as a number comes out in the formatting locale -
 * "1,234" or "1 234" - through `src/core/format.ts`, so no app formats a count by hand.
 */

import { Fixed, countDecimals, formatCount, formatNumber, isFixed, languageOf, roundTo } from './format.js';

/** A word or phrase written to stand alone - a doneness word, a headline -
 *  set down in the middle of a sentence: its first letter lower-cased in the
 *  catalogue's language, and nothing else, so "Last Wednesday" becomes "last
 *  Wednesday", not "last wednesday". */
export function midSentence(text: string, locale: string): string {
  const first = text.codePointAt(0);
  if (first === undefined) return text;
  const head = String.fromCodePoint(first);
  return head.toLocaleLowerCase(locale) + text.slice(head.length);
}

/** The CLDR plural categories. English uses two, Czech four. */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export const PLURAL_CATEGORIES: readonly PluralCategory[] = [
  'zero', 'one', 'two', 'few', 'many', 'other',
];

/** An argument to a message. A string goes in as it is: a name, or text the
 *  app has already rendered. A number is a count, and is written in the
 *  formatting locale with the decimals it has. A `Fixed` is a measurement,
 *  written with exactly its decimals ("2.00"), which its plural form sees. */
export type CopyArg = string | number | Fixed;

export type CopyArgs = Readonly<Record<string, CopyArg>>;

/** What core returns instead of English: a key, and the numbers
 *  the sentence needs. The app renders it, and may add arguments of its own
 *  (a weekday name, say) that only a platform can answer. */
export interface CopyRef {
  key: string;
  args: Readonly<Record<string, number>>;
}

/** One template per plural category. `other` is always present, and is what
 *  a category with no template of its own falls back to. */
export type PluralForms = Partial<Record<PluralCategory, string>> & { other: string };

/** One message: a template, or, when it has a count in it, one template per
 *  plural category and the argument that picks among them. */
export type Message =
  | { kind: 'text'; text: string }
  | { kind: 'plural'; count: string; forms: PluralForms };

export interface Catalogue {
  /** A BCP 47 tag. Its language subtag picks the plural rule. */
  locale: string;
  messages: ReadonlyMap<string, Message>;
  /** Where a key missing here is looked up next. English, for every other
   *  catalogue; null for English itself. */
  fallback: Catalogue | null;
}

/* ------------------------------------------------------------ the rules */

/**
 * The CLDR plural category of a number, for a locale.
 *
 * Hand-written per language, because Swift has no public equivalent of
 * `Intl.PluralRules` outside the string catalogues this repo does not use
 * (LANGUAGE.md §2), and a rule each app answered differently would be exactly
 * the drift the catalogue exists to end. A new language adds its rule here and
 * in the Swift twin, and a row per boundary to `fixtures/copy.json`.
 *
 * The operands are CLDR's: `i`, the integer digits, and `v`, the count of
 * visible fraction digits. `v` is the decimals the number is SHOWN with when
 * the caller knows them - "2.00" litres has v = 2, and is Czech `many` - and
 * otherwise 0 exactly when the number is whole.
 */
export function pluralCategory(locale: string, n: number, fractionDigits: number | null = null): PluralCategory {
  if (!Number.isFinite(n)) return 'other';
  const abs = Math.abs(n);
  const i = Math.floor(abs);
  const whole = fractionDigits === null ? abs === i : fractionDigits === 0 && abs === i;
  switch (languageOf(locale)) {
    case 'en':
      // one: i = 1 and v = 0
      return i === 1 && whole ? 'one' : 'other';
    case 'cs':
      // one: i = 1 and v = 0; few: i = 2..4 and v = 0; many: v != 0
      if (!whole) return 'many';
      if (i === 1) return 'one';
      if (i >= 2 && i <= 4) return 'few';
      return 'other';
    default:
      // A language with no rule yet. `other` is the one form every message
      // has, so this renders something rather than nothing - and the fixture
      // rows are where a missing rule is supposed to be noticed.
      return 'other';
  }
}

/* ----------------------------------------------------------- rendering */

/**
 * Render a message.
 *
 * A key this catalogue lacks is looked up in its fallback, and the plural rule
 * is the rule of the catalogue the message was FOUND in, since its forms are
 * that language's. A key no catalogue has renders as the key itself, and a
 * placeholder with no argument is left as written: both are bugs, and a bug
 * that shows is one somebody reports. The tests make sure neither ships.
 *
 * Numbers are written in `formatLocale`: the language the app speaks and the
 * region it is in (`formattingLocale` in `src/core/format.ts`). It defaults to the
 * catalogue's own tag, which is what a test or a fixture wants.
 */
export function render(
  catalogue: Catalogue, key: string, args: CopyArgs = {}, formatLocale: string = catalogue.locale,
): string {
  let found: Catalogue | null = catalogue;
  while (found !== null && !found.messages.has(key)) found = found.fallback;
  if (found === null) return key;
  const message = found.messages.get(key) as Message;
  return substitute(templateFor(message, found.locale, args), args, formatLocale);
}

/** Render what core returned, with any arguments the app adds. */
export function renderRef(
  catalogue: Catalogue, ref: CopyRef, extra: CopyArgs = {}, formatLocale: string = catalogue.locale,
): string {
  return render(catalogue, ref.key, { ...ref.args, ...extra }, formatLocale);
}

function templateFor(message: Message, locale: string, args: CopyArgs): string {
  if (message.kind === 'text') return message.text;
  const forms = message.forms;
  // The count must be a number. A string is not parsed, because the two
  // platforms parse strings differently, and a missing count is 'other'. The
  // form is chosen for the number as it is SHOWN: rounded as `formatArg`
  // rounds it, with the decimals it is shown with.
  const raw = args[message.count];
  let category: PluralCategory = 'other';
  if (typeof raw === 'number') {
    category = pluralCategory(locale, roundTo(raw, countDecimals(raw)), countDecimals(raw));
  } else if (isFixed(raw)) {
    category = pluralCategory(locale, roundTo(raw.value, raw.decimals), raw.decimals);
  }
  return forms[category] ?? forms.other;
}

/** An argument as text. A string as it is; a count in the locale, with its
 *  own decimals; a measurement in the locale, to its decimals. */
export function formatArg(value: CopyArg, formatLocale: string = 'en'): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return formatCount(formatLocale, value);
  return formatNumber(formatLocale, value.value, value.decimals);
}

/** Replace every `{name}` that has an argument. Written as a scan rather than a
 *  regular expression so that the Swift twin can be the same loop, and agree
 *  on every malformed brace as well as every good one. */
function substitute(template: string, args: CopyArgs, formatLocale: string): string {
  let out = '';
  let i = 0;
  while (i < template.length) {
    const name = placeholderAt(template, i);
    if (name !== null) {
      const value = args[name];
      out += value === undefined ? `{${name}}` : formatArg(value, formatLocale);
      i += name.length + 2;
    } else {
      out += template[i];
      i += 1;
    }
  }
  return out;
}

/** The placeholder name starting at `i`, if `{` there opens one: a letter,
 *  then letters, digits or underscores, then `}`. Anything else is a literal
 *  brace. */
function placeholderAt(template: string, i: number): string | null {
  if (template[i] !== '{') return null;
  let j = i + 1;
  if (j >= template.length || !isLetter(template.charCodeAt(j))) return null;
  while (j < template.length && isNameChar(template.charCodeAt(j))) j += 1;
  if (template[j] !== '}') return null;
  return template.slice(i + 1, j);
}

function isLetter(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

function isNameChar(c: number): boolean {
  return isLetter(c) || (c >= 48 && c <= 57) || c === 95;
}

/** Every placeholder a template uses, in order of first use. */
export function placeholders(template: string): string[] {
  const names: string[] = [];
  for (let i = 0; i < template.length; i++) {
    const name = placeholderAt(template, i);
    if (name !== null && !names.includes(name)) names.push(name);
  }
  return names;
}

/** Every template of a message: its text, or each of its plural forms. */
export function templatesOf(message: Message): string[] {
  if (message.kind === 'text') return [message.text];
  const forms = message.forms;
  return PLURAL_CATEGORIES.map((c) => forms[c]).filter((t): t is string => t !== undefined);
}

/* ------------------------------------------------------------ overlays */

/**
 * The regional overlays that ship, `copy/<tag>.json`: each holds only the
 * words its region says differently from its language's own catalogue. The
 * English catalogue is Australian (DECISIONS.md 55), and an American reads
 * `en-US` over it: "counter" for the bench, "running water" for the cold tap.
 */
export const OVERLAYS: readonly string[] = ['en-US'];

/** The region subtag of a language tag, upper-cased, or null: the `US` of
 *  `en-US`, `en_US` and `en-Latn-US`. A private-use or extension singleton
 *  ends the search, so `en-x-us` names no region. */
export function regionOf(tag: string): string | null {
  const parts = tag.split(/[-_]/);
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (i === 1 && part.length === 4) continue;
    if (/^[A-Za-z]{2}$/.test(part) || /^[0-9]{3}$/.test(part)) return part.toUpperCase();
    return null;
  }
  return null;
}

/**
 * The catalogues that render a language, the first consulted first, with
 * English always last, beneath everything. Modern English gains its region's
 * overlay, when one ships, for the region of the device's own English: the
 * first English tag in `preferred` (the device's languages, most wanted first)
 * if it names one, or else `region`, the device's. The English of 1750 and
 * any other language have no overlay; a key they lack is English's.
 */
export function catalogueChain(language: string, preferred: readonly string[], region: string | null): string[] {
  if (language !== 'en') return [language, 'en'];
  let wordsRegion = region;
  for (let i = 0; i < preferred.length; i++) {
    if (languageOf(preferred[i]) !== 'en') continue;
    const own = regionOf(preferred[i]);
    if (own !== null) wordsRegion = own;
    break;
  }
  const overlay = wordsRegion === null ? null : `en-${wordsRegion}`;
  return overlay !== null && OVERLAYS.indexOf(overlay) >= 0 ? [overlay, 'en'] : ['en'];
}

/* ------------------------------------------------------------- parsing */

/**
 * A catalogue from its parsed JSON, `copy/<locale>.json`:
 *
 *     { "locale": "en",
 *       "messages": {
 *         "feedback.ask": { "surface": "label", "text": "How was the yolk?" },
 *         "learned.tuned": { "surface": "body", "count": "eggs",
 *                            "one": "Learned from {eggs} egg",
 *                            "other": "Learned from {eggs} eggs" } } }
 *
 * Fields the renderer does not read (`surface`, `example`, `note`) are the
 * tests' business and are ignored here. Throws on anything malformed, naming
 * the key: a catalogue that half-loads would put key names on a screen.
 */
export function parseCatalogue(json: unknown, fallback: Catalogue | null = null): Catalogue {
  const root = asObject(json, 'catalogue');
  const locale = root['locale'];
  if (typeof locale !== 'string' || locale === '') throw new Error('catalogue: no locale');
  const raw = asObject(root['messages'], 'catalogue.messages');
  const messages = new Map<string, Message>();
  for (const key of Object.keys(raw)) messages.set(key, parseMessage(key, raw[key]));
  return { locale: locale, messages: messages, fallback: fallback };
}

function parseMessage(key: string, json: unknown): Message {
  const m = asObject(json, key);
  const text = m['text'];
  if (typeof text === 'string') {
    for (const c of PLURAL_CATEGORIES) {
      if (m[c] !== undefined) throw new Error(`${key}: both text and a plural form`);
    }
    return { kind: 'text', text: text };
  }
  const count = m['count'];
  if (typeof count !== 'string' || count === '') throw new Error(`${key}: neither text nor count`);
  const forms: Partial<Record<PluralCategory, string>> = {};
  for (const c of PLURAL_CATEGORIES) {
    const form = m[c];
    if (form === undefined) continue;
    if (typeof form !== 'string') throw new Error(`${key}.${c}: not a string`);
    forms[c] = form;
  }
  const other = forms.other;
  if (other === undefined) throw new Error(`${key}: a plural with no "other"`);
  return { kind: 'plural', count: count, forms: { ...forms, other: other } };
}

function asObject(json: unknown, what: string): Record<string, unknown> {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error(`${what}: not an object`);
  }
  return json as Record<string, unknown>;
}
