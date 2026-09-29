/**
 * fixtures/format.json: numbers and times of day in every formatting locale,
 * and a pseudo-Czech catalogue in cs-CZ.
 */

import { readFileSync } from 'node:fs';

import { CopyArgs, parseCatalogue, pluralCategory, render } from '../../src/core/copy.js';
import { weekdayKey } from '../../src/core/wording.js';
import {
  Fixed, HourCycle, countDecimals, formatCount, formatNumber, formatTimeOfDay, formattingLocale,
  normaliseTime, roundTo, unpadHour,
} from '../../src/core/format.js';
import { QUANTITIES, UNIT_SYSTEMS, measureFor, quantityText } from '../../src/core/units.js';

import { CatalogueJson, english } from './shared.js';

/* Numbers and times of day as each supported formatting locale writes them,
 * through `Intl` here and Foundation in Swift. SUPPORTED are the locales the
 * apps are promised to agree in; ALSO are more that were measured to agree
 * and are pinned so that a platform update which changes them is noticed. The
 * disagreements found while choosing these are in LANGUAGE.md §2.
 *
 * Then the pseudo-Czech catalogue in test/pseudo-cs.json - Czech's plural rule
 * and no Czech words - rendered in cs-CZ, which is the machinery a Czech
 * catalogue will use, end to end, before there is a word of Czech to use it
 * with. */
const FORMAT_SUPPORTED = ['en-US', 'en-GB', 'cs-CZ'];
const FORMAT_ALSO = ['en', 'en-AU', 'en-DE', 'en-CZ', 'cs', 'en-US-u-hc-h23', 'en-GB-u-hc-h12'];
const FORMAT_LOCALES = [...FORMAT_SUPPORTED, ...FORMAT_ALSO];

const FORMAT_NUMBERS: [number, number][] = [
  [0, 0], [-0, 0], [-0.4, 0], [-0.004, 2], [1, 0], [2.4, 1], [2.45, 1], [2.55, 1], [2.675, 2], [-2.5, 0],
  [0.25, 2], [2, 2], [12.5, 2], [99.95, 1], [212, 1], [999, 0], [1000, 0], [1234.5, 1], [-1300, 0],
  [16400, 0], [12345678.9, 1], [1.72, 2], [0.02, 2], [1e15, 0],
];
const FORMAT_COUNTS = [0, 1, 2, 5, 17, 45, 1.5, 2.25, 0.125, 1.0004, 2.9996, 1234, 1234567, -3];
const FORMAT_TIMES: [number, boolean][] = [
  [0, false], [5 * 60, false], [9 * 3600 + 5 * 60, false], [12 * 3600, false], [12 * 3600 + 30 * 60, false],
  [15 * 3600 + 5 * 60, false], [23 * 3600 + 59 * 60, false], [8 * 3600 + 47 * 60 + 59, false],
  [7 * 3600 + 41 * 60 + 12, true], [15 * 3600 + 5 * 60 + 9, true], [0, true],
  [86400 + 3600, false], [-60, false],
];

const pseudoJson = JSON.parse(readFileSync('test/pseudo-cs.json', 'utf8')) as CatalogueJson;
const pseudo = parseCatalogue(pseudoJson, english);
const fixed = (value: number, decimals: number): Fixed => ({ value: value, decimals: decimals });
const pseudoCases: { key: string; args: CopyArgs }[] = [
  ...[0, 1, 2, 4, 5, 21, 22, 59].map((n) => ({ key: 'spoken.seconds', args: { seconds: n } })),
  ...[1, 3, 11].map((n) => ({ key: 'spoken.minutes', args: { minutes: n } })),
  ...[[1, 0], [2, 0], [5, 0], [1.5, 1], [1.5, 2], [2, 2], [1, 2], [0.5, 2], [21, 0], [12.5, 2]].map(
    ([v, d]) => ({ key: 'format.litres', args: { value: fixed(v, d) } }),
  ),
  ...[[1250, 0], [16400, 0], [-400, 0], [950, 0]].map(([v, d]) => ({ key: 'format.metres', args: { value: fixed(v, d) } })),
  { key: 'format.celsius', args: { value: fixed(99.7, 1) } },
  { key: 'format.fahrenheit', args: { value: fixed(211.5, 1) } },
  { key: 'format.ounces', args: { value: fixed(2.4, 1) } },
  { key: 'format.inches', args: { value: fixed(1.72, 2) } },
  ...[1, 3, 6, 13, 1234].map((n) => ({ key: 'duration.days', args: { days: n } })),
  { key: 'duration.hoursMinutes', args: { hours: 22, minutes: 43 } },
  ...[1, 2, 5, 1.5].map((n) => ({ key: 'learned.tuned', args: { eggs: n } })),
  {
    key: 'sousvide.subline',
    args: { clock: formatTimeOfDay('cs-CZ', 8 * 3600 + 47 * 60, false), duration: '22 h 43 min', bath: '58 °C' },
  },
  { key: 'sousvide.start.lastWeekday', args: { weekday: render(pseudo, weekdayKey(3)) } },
  { key: 'spoken.minutesSeconds', args: { minutes: render(pseudo, 'spoken.minutes', { minutes: 1 }, 'cs-CZ'), seconds: render(pseudo, 'spoken.seconds', { seconds: 1 }, 'cs-CZ') } },
];

const HOUR_CYCLES: (HourCycle | null)[] = [null, 'h23', 'h12'];
export const formatFixture = {
  about: 'Numbers and times of day in every formatting locale, and a pseudo-Czech catalogue in cs-CZ. src/core/format.ts.',
  supported: FORMAT_SUPPORTED,
  locales: FORMAT_LOCALES,
  roundTo: FORMAT_NUMBERS.map(([value, decimals]) => ({ value: value, decimals: decimals, result: roundTo(value, decimals) })),
  countDecimals: FORMAT_COUNTS.map((value) => ({ value: value, decimals: countDecimals(value) })),
  numbers: FORMAT_LOCALES.flatMap((locale) => FORMAT_NUMBERS.map(([value, decimals]) => ({
    locale: locale, value: value, decimals: decimals, text: formatNumber(locale, value, decimals),
  }))),
  counts: FORMAT_LOCALES.flatMap((locale) => FORMAT_COUNTS.map((value) => ({
    locale: locale, value: value, text: formatCount(locale, value),
  }))),
  times: FORMAT_LOCALES.flatMap((locale) => FORMAT_TIMES.map(([seconds, withSeconds]) => ({
    locale: locale, seconds: seconds, withSeconds: withSeconds, text: formatTimeOfDay(locale, seconds, withSeconds),
  }))),
  normaliseTime: ['3:05 PM', '3:05\u00a0PM', '3:05\u202fPM', '15:05', 'a b\u00a0c'].map((text) => ({
    text: text, normalised: normaliseTime(text),
  })),
  unpadHour: [
    '09:05', '00:05', '0:05', '9:05', '12:05', '15:05', '09:05:09', 'a\u202f09:05', '09:05\u202fPM', '0', '09', '',
    'PM', '10:05', '\u0660\u0669:\u0660\u0665',
  ].map((text) => ({ text: text, unpadded: unpadHour(text) })),
  // The whole path, from what each app knows - the UI's language, the
  // device's region, the device's own clock setting - to the bytes a cook
  // reads: the owner's rules, end to end.
  derived: ([
    ['en', 'GB', null], ['en', 'US', null], ['cs', 'CZ', null], ['en', 'CZ', null], ['cs', 'US', null],
    ['cs', 'GB', null], ['cs', 'DE', null], ['cs', null, null], ['en', 'DE', null], ['en', 'US', 'h23'],
    ['en', 'GB', 'h12'], ['en', 'AU', 'h23'],
  ] as [string, string | null, HourCycle | null][]).map(([ui, region, hc]) => {
    const tag = formattingLocale(ui, region, hc);
    return {
      uiLanguage: ui, region: region, hourCycle: hc, tag: tag,
      number: formatNumber(tag, 1234.5, 1), decimal: formatNumber(tag, 2.4, 1),
      morning: formatTimeOfDay(tag, 9 * 3600 + 5 * 60, false), midnight: formatTimeOfDay(tag, 5 * 60, false),
      afternoon: formatTimeOfDay(tag, 15 * 3600 + 5 * 60, false),
      withSeconds: formatTimeOfDay(tag, 9 * 3600 + 5 * 60 + 9, true),
    };
  }),
  formattingLocale: ['en', 'cs', 'en-x-1750', 'en-GB-x-1750', 'CS', '', 'english'].flatMap((ui) =>
    ['US', 'GB', 'CZ', 'DE', 'gb', '150', null, 'GBR', 'U1'].flatMap((region) =>
      HOUR_CYCLES.map((hc) => ({
        uiLanguage: ui, region: region, hourCycle: hc, tag: formattingLocale(ui, region, hc),
      })))),
  plural: ['en', 'cs'].flatMap((locale) => [
    [1, 0], [1, 1], [1, 2], [2, 0], [2, 2], [5, 0], [1.5, 1], [1.5, 2], [0, 0], [0, 2], [21, 0],
  ].map(([n, v]) => ({ locale: locale, n: n, fractionDigits: v, category: pluralCategory(locale, n, v) }))),
  // Every quantity a cook reads, in both systems, in every supported locale:
  // the key and the words, through the English catalogue.
  // Not the girth or the width: the iOS core measures neither.
  measures: FORMAT_SUPPORTED.flatMap((locale) => QUANTITIES.filter((q) => q !== 'girth' && q !== 'width').flatMap((q) => UNIT_SYSTEMS.flatMap((system) =>
    [0.5, 2.4, 63.5, 1500, 16400].map((si) => {
      const m = measureFor(q, system, locale.slice(-2));
      const text = quantityText(m, si);
      return {
        locale: locale, quantity: q, system: system, region: locale.slice(-2), si: si,
        key: text.key, value: text.value, text: render(english, text.key, { value: text.value }, locale),
      };
    })))),
  pseudo: {
    catalogue: pseudoJson,
    formatLocale: 'cs-CZ',
    cases: pseudoCases.map((c) => ({ ...c, text: render(pseudo, c.key, c.args, 'cs-CZ') })),
  },
};
