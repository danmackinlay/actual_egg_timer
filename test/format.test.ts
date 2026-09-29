/**
 * Locale formatting: numbers, times of day, the plural rule with visible
 * decimals, the formatting locale each app derives, and Czech formatting end
 * to end through the web's own renderer with a pseudo-Czech catalogue - Czech's
 * plural rule and Czech numbers, and no Czech words.
 *
 * `fixtures/format.json` holds the Swift app to the same answers; this file
 * says what the answers ARE, in the cases a person would check by eye.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

// Before anything reads the clock: the time-of-day tests read local hours.
process.env['TZ'] = 'UTC';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseCatalogue, pluralCategory, render } from '../src/core/copy.js';
import {
  countDecimals, formatCount, formatNumber, formatTimeOfDay, formattingLocale, roundTo, unpadHour,
} from '../src/core/format.js';
import { SousVideEstimate } from '../src/core/sousvide.js';
import { forceFormatLocale, formatLocale, t, useCatalogue } from '../src/ui/copy.js';
import { show, useUnits } from '../src/ui/units.js';
import { spokenClock } from '../src/ui/countdown.js';
import { sousVideCopy } from '../src/ui/sousvide.js';

const NBSP = ' ';
const NNBSP = ' ';

/** A 58 °C bath's answer, near enough: most of a day, bound by the white. */
const BATH: SousVideEstimate = {
  bath_C: 58, equilibrate_s: 1500, yolkHold_s: 3000, whiteHold_s: 80260, total_s: 81760, whiteBound: true,
};

// Node reports its own navigator.language, which may be en-US and so start in
// Imperial; these tests read metric, by choice.
useUnits('metric');

const EN = parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8')));
const PSEUDO = parseCatalogue(JSON.parse(readFileSync('test/pseudo-cs.json', 'utf8')), EN);

// --------------------------------------------------------------------------
// 1. numbers
// --------------------------------------------------------------------------

test('1a. numbers in each supported locale: the separators, the grouping, the precision', () => {
  assert.equal(formatNumber('en-US', 1234.5, 1), '1,234.5');
  assert.equal(formatNumber('en-GB', 1234.5, 1), '1,234.5');
  assert.equal(formatNumber('cs-CZ', 1234.5, 1), `1${NBSP}234,5`, 'Czech groups with a no-break space');
  assert.equal(formatNumber('cs-CZ', 2.4, 1), '2,4');
  assert.equal(formatNumber('cs-CZ', 2, 2), '2,00', 'the precision is the caller\'s, not the locale\'s');
  assert.equal(formatNumber('en-US', 16400, 0), '16,400');
  assert.equal(formatNumber('cs-CZ', -1300, 0), `-1${NBSP}300`);
});

test('1b. the rounding is ours: halves up, on the decimal, and never a signed zero', () => {
  assert.equal(roundTo(2.45, 1), 2.5);
  assert.equal(roundTo(-2.5, 0), -2, 'halves go up, as in units.ts');
  assert.ok(Object.is(roundTo(-0.4, 0), 0), 'no -0');
  assert.equal(formatNumber('en-US', -0.004, 2), '0.00');
  assert.equal(formatNumber('en-US', -0, 0), '0');
});

test('1c. a count shows the decimals it has, up to three', () => {
  assert.equal(countDecimals(2), 0);
  assert.equal(countDecimals(1.5), 1);
  assert.equal(countDecimals(0.125), 3);
  assert.equal(countDecimals(1.0004), 0, 'rounded to three first');
  assert.equal(formatCount('cs-CZ', 1.5), '1,5');
  assert.equal(formatCount('en-US', 1234567), '1,234,567');
});

// --------------------------------------------------------------------------
// 2. times of day
// --------------------------------------------------------------------------

test('2a. a time of day follows the locale\'s clock', () => {
  const at = (h: number, m: number): number => h * 3600 + m * 60;
  assert.equal(formatTimeOfDay('en-US', at(15, 5), false), `3:05${NNBSP}PM`);
  assert.equal(formatTimeOfDay('en-GB', at(15, 5), false), '15:05');
  assert.equal(formatTimeOfDay('cs-CZ', at(15, 5), false), '15:05');
  assert.equal(formatTimeOfDay('en-GB', at(8, 47), false), '8:47', 'the hour is never zero-padded, even in en-GB');
  assert.equal(formatTimeOfDay('cs-CZ', at(8, 47), false), '8:47');
  assert.equal(formatTimeOfDay('en-US', at(7, 41) + 12, true), `7:41:12${NNBSP}AM`);
  assert.equal(formatTimeOfDay('en-GB', at(7, 41) + 12, true), '7:41:12');
});

test('2b. the space before AM and PM is U+202F in both apps, whatever V8 prints', () => {
  const raw = new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' }).format(0);
  assert.match(raw, /12:00[  ]AM/, 'Intl prints one of the two');
  assert.equal(formatTimeOfDay('en-US', 0, false), `12:00${NNBSP}AM`);
});

test('2c. a device\'s own 12/24-hour setting rides along as -u-hc-', () => {
  assert.equal(formatTimeOfDay('en-US-u-hc-h23', 15 * 3600 + 5 * 60, false), '15:05');
  assert.equal(formatTimeOfDay('en-GB-u-hc-h12', 15 * 3600 + 5 * 60, false), `3:05${NNBSP}pm`);
});

test('2d. no time of day zero-pads its hour, in any locale; minutes and seconds keep two digits', () => {
  const at = (h: number, m: number): number => h * 3600 + m * 60;
  for (const locale of ['en-GB', 'en-CZ', 'en-DE', 'cs-CZ', 'cs', 'en-US-u-hc-h23']) {
    assert.equal(formatTimeOfDay(locale, at(9, 5), false), '9:05', locale);
    assert.equal(formatTimeOfDay(locale, at(0, 5), false), '0:05', `${locale} midnight`);
    assert.equal(formatTimeOfDay(locale, at(15, 5), false), '15:05', locale);
    assert.equal(formatTimeOfDay(locale, at(9, 5) + 9, true), '9:05:09', locale);
  }
  assert.equal(formatTimeOfDay('en-US', at(9, 5), false), `9:05${NNBSP}AM`, '12-hour English was never padded');
  assert.equal(formatTimeOfDay('en-GB-u-hc-h12', at(9, 5), false), `9:05${NNBSP}am`);
  assert.equal(unpadHour('09:05'), '9:05');
  assert.equal(unpadHour('00:05'), '0:05');
  assert.equal(unpadHour('0:05'), '0:05', 'one digit is left alone');
  assert.equal(unpadHour('10:05'), '10:05');
  assert.equal(unpadHour(`a${NNBSP}09:05`), `a${NNBSP}9:05`, 'a day period before the hour');
});

// --------------------------------------------------------------------------
// 3. the plural rule, with the decimals a number is shown with
// --------------------------------------------------------------------------

test('3a. the rules agree with Intl.PluralRules when the decimals are given', () => {
  for (const locale of ['en', 'cs']) {
    for (const n of [0, 1, 2, 3, 5, 21, 1.5, 0.5, 12.5]) {
      for (const v of [0, 1, 2]) {
        if (roundTo(n, v) !== n) continue;
        const intl = new Intl.PluralRules(locale, { minimumFractionDigits: v, maximumFractionDigits: v });
        assert.equal(pluralCategory(locale, n, v), intl.select(n), `${locale} ${n} to ${v}`);
      }
    }
  }
});

test('3b. "2,00 l" is Czech many, and "1.0" is English other: CLDR counts visible decimals', () => {
  assert.equal(pluralCategory('cs', 2, 2), 'many');
  assert.equal(pluralCategory('cs', 2, 0), 'few');
  assert.equal(pluralCategory('en', 1, 1), 'other');
  assert.equal(render(PSEUDO, 'format.litres', { value: { value: 2, decimals: 2 } }, 'cs-CZ'), '2,00 [l:many]');
  assert.equal(render(PSEUDO, 'format.litres', { value: { value: 2, decimals: 0 } }, 'cs-CZ'), '2 [l:few]');
  assert.equal(render(PSEUDO, 'format.litres', { value: 1.5 }, 'cs-CZ'), '1,5 [l:many]');
});

// --------------------------------------------------------------------------
// 4. the formatting locale
// --------------------------------------------------------------------------

test('4a. the formatting locale is the UI language in the device\'s region', () => {
  assert.equal(formattingLocale('en', 'GB', null), 'en-GB');
  assert.equal(formattingLocale('en', 'DE', null), 'en-DE', 'English words, German numbers');
  assert.equal(formattingLocale('cs', 'CZ', null), 'cs-CZ');
  assert.equal(formattingLocale('en', null, null), 'en');
  assert.equal(formattingLocale('en-x-1750', 'US', null), 'en-US', 'a register is not a format');
  assert.equal(formattingLocale('en', 'au', 'h23'), 'en-AU-u-hc-h23');
  assert.equal(formattingLocale('en', 'GBR', null), 'en', 'not a region');
});

test('4b. a Czech UI formats as Czech wherever the device is; an English one follows the region', () => {
  assert.equal(formattingLocale('cs', 'US', null), 'cs-CZ', 'Czech has one convention of its own');
  assert.equal(formattingLocale('cs', 'GB', null), 'cs-CZ');
  assert.equal(formattingLocale('cs', null, null), 'cs-CZ');
  assert.equal(formattingLocale('cs', 'US', 'h12'), 'cs-CZ-u-hc-h12', 'the device\'s own clock setting still rides along');
  assert.equal(formattingLocale('en', 'CZ', null), 'en-CZ', 'English has many, so the region decides');
  assert.equal(formatNumber(formattingLocale('cs', 'US', null), 1234.5, 1), `1${NBSP}234,5`);
  assert.equal(formatNumber(formattingLocale('cs', 'GB', null), 2.4, 1), '2,4');
  assert.equal(formatNumber(formattingLocale('en', 'DE', null), 2.4, 1), '2,4', 'F4\'s en-DE stands');
  assert.equal(formatNumber(formattingLocale('en', 'CZ', null), 1234.5, 1), `1${NBSP}234,5`);
  assert.equal(formatTimeOfDay(formattingLocale('en', 'CZ', null), 9 * 3600 + 5 * 60, false), '9:05',
    'en-CZ: the web printed 09:05 and iOS 9:05; both print 9:05');
});

// --------------------------------------------------------------------------
// 5. English, through the web's renderer
// --------------------------------------------------------------------------

test('5a. the screen reader hears "1 second", never "1 seconds"', () => {
  useCatalogue(EN);
  forceFormatLocale('en-GB');
  try {
    assert.equal(spokenClock(1), '1 second');
    assert.equal(spokenClock(45), '45 seconds');
    assert.equal(spokenClock(61), '1 minute 1 second');
    assert.equal(spokenClock(677), '11 minutes 17 seconds');
    assert.equal(spokenClock(120), '2 minutes 0 seconds', 'as before: the seconds are always said');
  } finally {
    forceFormatLocale(null);
  }
});

test('5b. English numbers and clocks by region', () => {
  useCatalogue(EN);
  try {
    forceFormatLocale('en-US');
    assert.equal(show('altitude', 1500), '1,500 m');
    forceFormatLocale('en-GB');
    assert.equal(show('water', 2), '2.00 L', 'unchanged');
  } finally {
    forceFormatLocale(null);
  }
});

// --------------------------------------------------------------------------
// 6. Czech formatting, end to end, with no Czech words
// --------------------------------------------------------------------------

test('6a. forced to cs-CZ, the web renders the pseudo catalogue with Czech numbers and clock', () => {
  useCatalogue(PSEUDO);
  forceFormatLocale('cs-CZ');
  try {
    assert.equal(formatLocale(), 'cs-CZ');
    assert.equal(show('water', 1.5), '1,50 [l:many]', 'fractional litres are many');
    assert.equal(show('altitude', 1250), `1${NBSP}250 [m]`);
    assert.equal(show('boilingPoint', 99.74), '99,7 °C', 'a key the pseudo lacks falls back, numbers stay Czech');
    assert.equal(spokenClock(1), '1 [s:one]');
    assert.equal(spokenClock(3 * 60 + 2), '3 [min:few] + 2 [s:few]');
    assert.equal(spokenClock(5 * 60 + 21), '5 [min:other] + 21 [s:other]');
    assert.equal(t('learned.tuned', { eggs: 1.5 }), '[tuned] 1,5 [eggs:many]');

    // Wednesday 1 October 2025, 15:05 UTC, and 81,760 s earlier is 16:22:20
    // the day before.
    const copy = sousVideCopy(BATH, Date.UTC(2025, 9, 1, 15, 5));
    assert.equal(copy.subline, '[subline] 16:22 · 22 h 43 min · 58 °C');
    assert.equal(copy.headline, 'Yesterday', 'a key the pseudo lacks is English');
  } finally {
    forceFormatLocale(null);
    useCatalogue(EN);
  }
});

test('6b. a weekday comes from the catalogue, in both apps', () => {
  useCatalogue(PSEUDO);
  forceFormatLocale('cs-CZ');
  try {
    // Four days before Wednesday 1 October 2025 is Saturday.
    const now = Date.UTC(2025, 9, 1, 12, 0);
    const est = { ...BATH, total_s: 4 * 86400 };
    assert.equal(sousVideCopy(est, now).headline, '[last] [saturday]');
  } finally {
    forceFormatLocale(null);
    useCatalogue(EN);
  }
});
