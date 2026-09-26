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

/**
 * The language the app speaks. Plumbing only, for now: English is the only
 * catalogue, and a language picker with one row in it would be a control that
 * does nothing. The picker arrives with Czech (PLAN.md, F1 and F5), and it sets
 * this. Everything that renders reads it through `t`, so nothing else changes.
 */
export const ACTIVE_LOCALE = 'en';

let active: Catalogue | null = null;

async function fetchCatalogue(locale: string, fallback: Catalogue | null): Promise<Catalogue> {
  const response = await fetch(`copy/${locale}.json`);
  if (!response.ok) throw new Error(`copy/${locale}.json: ${response.status}`);
  return parseCatalogue(await response.json(), fallback);
}

/** Fetch the active catalogue, and English beneath it for any key it lacks. */
export async function loadCopy(locale: string = ACTIVE_LOCALE): Promise<Catalogue> {
  const english = await fetchCatalogue('en', null);
  active = locale === 'en' ? english : await fetchCatalogue(locale, english);
  return active;
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
 *  document is in. */
export function applyCopy(doc: Document): void {
  doc.documentElement.lang = activeLocale();
  for (const node of Array.from(doc.querySelectorAll<HTMLElement>('[data-copy]'))) {
    const key = node.dataset['copy'];
    if (key !== undefined) node.textContent = t(key);
  }
}
