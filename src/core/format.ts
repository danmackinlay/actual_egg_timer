/**
 * Numbers and times of day, as a locale writes them: "1,234.5" or "1 234,5",
 * "3:05 PM" or "15:05".
 *
 * The platform does the formatting - `Intl` here, Foundation's formatters in
 * the Swift twin (`EggTimerCopy/Format.swift`) - because a decimal comma, a
 * grouping space and a 12-hour clock are exactly the knowledge a platform
 * ships and an app should not re-type. What this module owns is making the two
 * platforms give the SAME bytes, which they do not always do on their own:
 *
 *  - The rounding is done here, before the platform sees the number, by the
 *    same `floor(x + 0.5)` the units use. `Intl` rounds halves away from zero
 *    and `NumberFormatter` to even, both on the shortest decimal of the double
 *    rather than its exact value; a number already on its decimal grid leaves
 *    neither of them anything to decide.
 *  - Zero has no sign. Both platforms print -0 as "-0".
 *  - A time of day spells every space as U+202F, the narrow no-break space
 *    that CLDR puts before "PM" and Foundation prints. V8 prints a plain space
 *    there instead (a web-compatibility patch, not CLDR), so "3:05 PM" would
 *    otherwise differ by one byte between the apps, and could break a line
 *    between the digits and the "PM".
 *
 * `fixtures/format.json` pins the result for every supported formatting
 * locale, and LANGUAGE.md §2 records where the platforms were found to
 * disagree.
 *
 * Pure, in the sense the rest of `src/core/` is: no clock, no time zone, no
 * device locale. `Intl` is given an explicit locale, and a time of day is
 * formatted as a count of seconds in UTC, so the answer depends on nothing but
 * the arguments.
 */

/** A number with the count of decimals it is shown to - a displayed
 *  measurement, "2.00" litres - as distinct from a count, which shows only
 *  the decimals it has. The plural rule sees the decimals too: CLDR counts
 *  visible fraction digits, so "2,00" litres is Czech `many`, not `few`. */
export interface Fixed {
  value: number;
  decimals: number;
}

export function isFixed(value: unknown): value is Fixed {
  return typeof value === 'object' && value !== null
    && typeof (value as Fixed).value === 'number' && typeof (value as Fixed).decimals === 'number';
}

/** The most decimals a count is shown with. A count is a whole number almost
 *  always; this is the cap for the day one is not, and it is `Intl`'s own
 *  default. */
export const COUNT_MAX_DECIMALS = 3;

/** The space every time of day uses between its parts: U+202F. */
export const TIME_SPACE = ' ';

/* -------------------------------------------------------------- numbers */

/** A value rounded to a number of decimals, halves up, written out so that the
 *  Swift twin is the same arithmetic. Never -0. */
export function roundTo(value: number, decimals: number): number {
  let scale = 1;
  for (let d = 0; d < decimals; d++) scale *= 10;
  const r = Math.floor(value * scale + 0.5) / scale;
  return r === 0 ? 0 : r;
}

/** How many decimals a count shows: the fewest, up to three, that say it
 *  exactly once it is rounded to three. 2 -> 0, 1.5 -> 1, 0.125 -> 3. */
export function countDecimals(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const v = roundTo(value, COUNT_MAX_DECIMALS);
  for (let d = 0; d < COUNT_MAX_DECIMALS; d++) {
    if (roundTo(v, d) === v) return d;
  }
  return COUNT_MAX_DECIMALS;
}

/** A number in a locale, to exactly `decimals` places, grouped as the locale
 *  groups. Not a number is a bug, and prints as JavaScript prints it. */
export function formatNumber(locale: string, value: number, decimals: number): string {
  const v = roundTo(value, decimals);
  if (!Number.isFinite(v)) return String(v);
  return numberFormat(locale, decimals).format(v);
}

/** A count - a number of eggs, of seconds - in a locale: its own decimals,
 *  up to three. */
export function formatCount(locale: string, value: number): string {
  return formatNumber(locale, value, countDecimals(value));
}

function numberFormat(locale: string, decimals: number): Intl.NumberFormat {
  const options = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  try {
    return new Intl.NumberFormat(locale, options);
  } catch {
    // A malformed tag. `formattingLocale` never makes one; Foundation would
    // take it without complaint, so rather than throw, fall back to English.
    return new Intl.NumberFormat('en', options);
  }
}

/* ---------------------------------------------------------- time of day */

/**
 * A wall-clock time in a locale's own short form: "3:05 PM" in en-US, "15:05"
 * in en-GB and Czech, and with the seconds, "7:41:12 AM". Given as seconds
 * after midnight, which the app reads off its own clock in its own time zone;
 * this only writes it down.
 *
 * The locale's short and medium TIME STYLES, and not a skeleton of hour and
 * minute fields: a skeleton lets `Intl` and Foundation pick different hour
 * widths ("9:05" against "09:05" in en-GB), where the style is the locale's
 * own pattern and both platforms print it as CLDR has it.
 *
 * Not the countdown. "7:44" on the timer is a duration, the same in every
 * language, and stays as the apps build it.
 */
export function formatTimeOfDay(locale: string, secondsOfDay: number, withSeconds: boolean): string {
  const s = ((Math.floor(secondsOfDay) % 86400) + 86400) % 86400;
  const options: Intl.DateTimeFormatOptions = {
    timeStyle: withSeconds ? 'medium' : 'short', timeZone: 'UTC',
  };
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat(locale, options);
  } catch {
    format = new Intl.DateTimeFormat('en', options);
  }
  return normaliseTime(format.format(s * 1000));
}

/** Every space in a time of day as U+202F. */
export function normaliseTime(text: string): string {
  let out = '';
  for (const c of text) out += c === ' ' || c === ' ' || c === TIME_SPACE ? TIME_SPACE : c;
  return out;
}

/* ------------------------------------------------------ the formatting locale */

/** The language subtag, lower-cased: 'en' for 'en-GB-x-1750'. It picks the
 *  plural rule in `copy.ts`, and the language of the formatting locale here. */
export function languageOf(locale: string): string {
  const dash = locale.indexOf('-');
  return (dash < 0 ? locale : locale.slice(0, dash)).toLowerCase();
}

/** A 12- or 24-hour preference the device holds apart from its region, as a
 *  BCP 47 `hc` value. iOS knows it; a browser does not say. */
export type HourCycle = 'h11' | 'h12' | 'h23' | 'h24';

/**
 * The locale numbers and times are formatted in: the language the app speaks,
 * and the region the device is in.
 *
 * The language comes from the UI, not the device, so that a Czech UI writes
 * "2,4" even on a phone set to English, and an English UI in Germany reads
 * "2,4" as well, because the region says so: `en-DE` is a real CLDR locale,
 * with English words and German numbers. A private-use subtag (the `x-1750` of
 * LANGUAGE.md §6) is a register, not a format, and is dropped. A region that
 * is not two letters or three digits is ignored.
 *
 * `hourCycle`, when given, is the device's own 12/24-hour setting where it
 * differs from the region's (an iPhone in Australia set to 24-hour time), and
 * rides along as the `-u-hc-` extension, which both platforms honour.
 */
export function formattingLocale(
  uiLanguage: string, region: string | null | undefined, hourCycle: HourCycle | null | undefined,
): string {
  let tag = languageOf(uiLanguage);
  if (tag === '' || !isLanguage(tag)) tag = 'en';
  if (typeof region === 'string' && isRegion(region)) tag += `-${region.toUpperCase()}`;
  if (hourCycle !== null && hourCycle !== undefined) tag += `-u-hc-${hourCycle}`;
  return tag;
}

function isLanguage(s: string): boolean {
  if (s.length < 2 || s.length > 3) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 97 || c > 122) return false;
  }
  return true;
}

function isRegion(s: string): boolean {
  if (s.length === 2) {
    for (let i = 0; i < 2; i++) {
      const c = s.charCodeAt(i) | 32;
      if (c < 97 || c > 122) return false;
    }
    return true;
  }
  if (s.length === 3) {
    for (let i = 0; i < 3; i++) {
      const c = s.charCodeAt(i);
      if (c < 48 || c > 57) return false;
    }
    return true;
  }
  return false;
}
