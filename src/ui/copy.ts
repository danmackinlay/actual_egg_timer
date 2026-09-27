/**
 * The web app's words: which catalogue is active, loading it, and the two
 * calls everything else uses - `t` for a key, `tRef` for what core returned.
 * And the locale its numbers and times are written in, which is the UI's
 * language in the browser's region (`formattingLocale` in core).
 *
 * The catalogue is `copy/<locale>.json`, fetched at boot beside the scripts.
 * `index.html` carries no English of its own: its text nodes are marked
 * `data-copy="key"` and filled in here, so the page and the scripts cannot
 * disagree about a word, and neither can this app and the iOS one, which
 * bundles the same files.
 */

import {
  Catalogue, CopyArgs, CopyRef, parseCatalogue, render, renderRef,
} from '../core/copy.js';
import { formatTimeOfDay, formattingLocale } from '../core/format.js';
import { DEFAULT_LANGUAGE } from '../core/language.js';

/**
 * The language a fresh install speaks. The cook can pick another in Settings,
 * and the units switch can move an English cook into the English of 1750
 * (`src/core/language.ts`, LANGUAGE.md section 6); `main.ts` loads the one
 * they last had, and `switchCopy` changes it in place.
 */
export const ACTIVE_LOCALE = DEFAULT_LANGUAGE;

let active: Catalogue | null = null;

/** Every catalogue fetched so far, by tag, so a language picked twice is
 *  fetched once. English is the fallback beneath every other. */
const fetched = new Map<string, Promise<Catalogue>>();

async function fetchCatalogue(locale: string, fallback: Catalogue | null): Promise<Catalogue> {
  const response = await fetch(`copy/${locale}.json`);
  if (!response.ok) throw new Error(`copy/${locale}.json: ${response.status}`);
  return parseCatalogue(await response.json(), fallback);
}

function catalogueFor(locale: string): Promise<Catalogue> {
  let promise = fetched.get(locale);
  if (promise === undefined) {
    promise = locale === 'en'
      ? fetchCatalogue('en', null)
      : catalogueFor('en').then((english) => fetchCatalogue(locale, english));
    // A failed fetch is not remembered: the next ask tries again.
    promise.catch(() => fetched.delete(locale));
    fetched.set(locale, promise);
  }
  return promise;
}

/** Fetch the active catalogue, and English beneath it for any key it lacks:
 *  `en-x-1750` falls back to `en`. A catalogue that cannot be fetched falls
 *  back to English whole, rather than leave the page without words. */
export async function loadCopy(locale: string = ACTIVE_LOCALE): Promise<Catalogue> {
  try {
    active = await catalogueFor(locale);
  } catch (error) {
    if (locale === 'en') throw error;
    active = await catalogueFor('en');
  }
  return active;
}

/** Change language in place. The caller re-renders what it drew. */
export async function switchCopy(locale: string): Promise<Catalogue> {
  return loadCopy(locale);
}

/** Install a catalogue already in hand - for a test, or a second language. */
export function useCatalogue(catalogue: Catalogue): void {
  active = catalogue;
}

function catalogue(): Catalogue {
  if (active === null) throw new Error('copy used before loadCopy()');
  return active;
}

/** The active locale's tag, for `<html lang>` and the record's `lang`. */
export function activeLocale(): string {
  return catalogue().locale;
}

/** The region in the browser's language tag - the `US` in `en-US` - or null
 *  when the tag names none. It decides how numbers and times are written, and
 *  (in `units.ts`) which carton's size classes to offer, which system a cook
 *  starts in, and which Imperial unit water is in. */
function browserRegion(): string | null {
  try {
    return new Intl.Locale(navigator.language).region ?? null;
  } catch {
    return null;
  }
}

/** Fixed for the life of the page. */
export const REGION = browserRegion();

let forcedFormatLocale: string | null = null;

/**
 * The locale numbers and times are written in: the UI's language, in the
 * browser's region - `en-GB` for an English page in Britain, `en-DE` for one
 * in Germany, which writes "2,4". A browser does not report a 12/24-hour
 * preference of its own, so the region's convention stands.
 */
export function formatLocale(): string {
  return forcedFormatLocale ?? formattingLocale(activeLocale(), REGION, null);
}

/** Pin the formatting locale, or `null` to derive it again. For tests: it is
 *  how a test proves Czech formatting end to end with no Czech words. */
export function forceFormatLocale(tag: string | null): void {
  forcedFormatLocale = tag;
}

/** A message, rendered. */
export function t(key: string, args: CopyArgs = {}): string {
  return render(catalogue(), key, args, formatLocale());
}

/** What core returned, rendered, with any arguments only the app can supply. */
export function tRef(ref: CopyRef, extra: CopyArgs = {}): string {
  return renderRef(catalogue(), ref, extra, formatLocale());
}

/** A wall-clock time, in this browser's time zone and the formatting
 *  locale's clock: "3:05 PM", "15:05". Not the countdown, which is a
 *  duration and is built as m:ss everywhere. */
export function timeOfDay(ms: number, withSeconds: boolean = false): string {
  const d = new Date(ms);
  const seconds = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  return formatTimeOfDay(formatLocale(), seconds, withSeconds);
}

/** Fill every `data-copy` element in the document, and say which language the
 *  document is in: `en`, or `en-x-1750` for the English of 1750, whose
 *  private-use subtag BCP 47 allows in `lang`.
 *
 *  A text with a long s (the 1750 title, and only that: LANGUAGE.md section
 *  6) is drawn with it and named without it, because a screen reader
 *  announces the letter and search does not match it. */
export function applyCopy(doc: Document): void {
  doc.documentElement.lang = activeLocale();
  for (const node of Array.from(doc.querySelectorAll<HTMLElement>('[data-copy]'))) {
    const key = node.dataset['copy'];
    if (key === undefined) continue;
    const text = t(key);
    if (node.hasAttribute('data-copy-links')) fillWithLinks(node, text);
    else node.textContent = text;
    if (text.includes(LONG_S)) {
      node.setAttribute('aria-label', withoutLongS(text));
      node.dataset['copyLabel'] = '';
    } else if (node.dataset['copyLabel'] !== undefined) {
      node.removeAttribute('aria-label');
      delete node.dataset['copyLabel'];
    }
  }
}

const LONG_S = '\u017f';

/** A text as it is read aloud: every long s an s. */
export function withoutLongS(text: string): string {
  return text.split(LONG_S).join('s');
}

/** A catalogue text whose `[label](https://…)` pieces become links, and
 *  everything else plain text. Only https links are made, and every one opens
 *  in a new tab without the opener; anything else stays as the literal text.
 *  No HTML from the catalogue is ever parsed. */
function fillWithLinks(node: HTMLElement, text: string): void {
  node.textContent = '';
  const link = /\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g;
  let at = 0;
  for (const m of text.matchAll(link)) {
    const start = m.index ?? 0;
    if (start > at) node.append(text.slice(at, start));
    const a = node.ownerDocument.createElement('a');
    a.href = m[2];
    a.textContent = m[1];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    node.append(a);
    at = start + m[0].length;
  }
  if (at < text.length) node.append(text.slice(at));
}
