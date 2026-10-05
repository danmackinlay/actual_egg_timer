/**
 * The English of 1750 (LANGUAGE.md section 6): the rules its catalogue is held
 * to beyond any other language's, the switch that goes into it and out, and
 * the record that says it was read.
 *
 * Placeholder parity and the length budgets are copy.test.ts's, which reads
 * every catalogue in copy/ and so this one too; 1a checks that it does. The
 * catalogue covers both apps' keys (1b), so every rule here binds iOS's
 * alarms and Live Activity as it binds the web's page.
 *
 * Run from the repo root (npm test does). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { parseCatalogue, render, templatesOf } from '../src/core/copy.js';
import { formattingLocale } from '../src/core/format.js';
import {
  DEFAULT_LANGUAGE, FRESH_LANGUAGE, LanguageState, PERIOD_LANGUAGE, effectiveLanguage, isModernEnglish,
  isPeriod, languageAfterFlip, languageAfterPick, readLanguageState, registerOf,
} from '../src/core/language.js';
import { eggFromMass } from '../src/core/geometry.js';
import { parseRecord } from '../src/core/record.js';
import { Cooked, eggRecordFor } from '../src/ui/calibration.js';
import { advance, startHot } from '../src/ui/machine.js';

type Entry = Record<string, unknown>;
interface CatalogueJson { locale: string; messages: Record<string, Entry> }

const EN_JSON = JSON.parse(readFileSync('copy/en.json', 'utf8')) as CatalogueJson;
const P_JSON = JSON.parse(readFileSync('copy/en-x-1750.json', 'utf8')) as CatalogueJson;
const SPELLING = (JSON.parse(readFileSync('test/data/en-x-1750.spelling.json', 'utf8')) as {
  spellings: Record<string, string>;
}).spellings;
const EN = parseCatalogue(EN_JSON);
const PERIOD = parseCatalogue(P_JSON, EN);

/** The one key allowed the long s: the title, after the Dictionary's own. */
const TITLE_KEY = 'app.titlePage';

/** Every template of the 1750 catalogue, by key. */
function templates(): [string, string][] {
  return [...PERIOD.messages].flatMap(([key, m]) => templatesOf(m).map((t): [string, string] => [key, t]));
}

/** A whole word, case-insensitive: not inside another word, and an
 *  apostrophe, straight or curly, counts as part of the word. */
function wordPattern(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]");
  return new RegExp(`(?<![A-Za-z'’])${escaped}(?![A-Za-z])`, 'i');
}

// --------------------------------------------------------------------------
// the catalogue
// --------------------------------------------------------------------------

test('1a. the 1750 catalogue is a catalogue: copy.test.ts and the fixture read it', () => {
  // The same rule as test/copy.test.ts and tools/fixtures/copy.ts.
  const catalogues = readdirSync('copy').filter((f) => f.endsWith('.json'));
  assert.ok(catalogues.includes('en-x-1750.json'));
  for (const f of catalogues) assert.match(f, /^[a-zA-Z0-9-]+\.json$/, `${f}: copy/ holds catalogues, <tag>.json, and nothing else`);
  assert.equal(P_JSON.locale, PERIOD_LANGUAGE);
});

/** Keys 1750 leaves to English on purpose: the app's name, which is a name. */
const LEFT_TO_ENGLISH = new Set(['app.name']);

test('1b. every key either app uses has its 1750 twin, and every twin is an English key', () => {
  // The web's, and iOS's: the alarms, the alarm's status lines, the Live
  // Activity and the Dynamic Island. So every rule below - the archaisms, the
  // spellings, the long s - binds them too.
  for (const [key, entry] of Object.entries(EN_JSON.messages)) {
    if (LEFT_TO_ENGLISH.has(key)) continue;
    const apps = entry['apps'] as string[];
    assert.ok(apps.length > 0, `${key}: used by no app`);
    assert.ok(PERIOD.messages.has(key), `${key} (${apps.join(', ')}): no 1750 twin`);
  }
  for (const key of PERIOD.messages.keys()) assert.ok(EN.messages.has(key), `${key}: not an English key`);
  for (const key of LEFT_TO_ENGLISH) assert.ok(!PERIOD.messages.has(key), `${key}: left to English`);
});

test('1b2. the small surfaces keep to a few words of period flavour', () => {
  // LANGUAGE.md section 6, rule 2: on the Lock Screen, the Dynamic Island and
  // an alarm's title the register gets two or three words, not a paragraph.
  // The budgets bind in copy.test.ts; this holds the flavour to few words.
  const small = new Set(['notification.title', 'island.compact', 'island.expanded', 'lockscreen']);
  for (const [key, entry] of Object.entries(EN_JSON.messages)) {
    if (!small.has(entry['surface'] as string) || !PERIOD.messages.has(key)) continue;
    for (const t of templatesOf(PERIOD.messages.get(key) as Parameters<typeof templatesOf>[0])) {
      const words = t.split(/\s+/).filter((w) => w !== '' && w !== '·').length;
      assert.ok(words <= 8, `${key}: ${words} words in "${t}"`);
    }
  }
  // The Dynamic Island's compact word has no room for any flavour at all.
  assert.equal(render(PERIOD, 'activity.now'), 'NOW');
});

test('1c. a key 1750 lacks falls back to English, with English\'s plural rule', () => {
  // app.name is iOS's, and 1750 leaves it to English.
  assert.ok(!PERIOD.messages.has('app.name'));
  assert.equal(render(PERIOD, 'app.name'), 'Actual Egg Timer');
  assert.equal(render(PERIOD, 'learned.tuned', { eggs: 1 }), 'Instructed by 1 result');
  assert.equal(render(PERIOD, 'learned.tuned', { eggs: 3 }), 'Instructed by 3 results');
});

test('1d. none of the eight stage-play archaisms', () => {
  // LANGUAGE.md section 6: zero times each in the 1755 Preface.
  const banned = ["'tis", 'pray', 'forthwith', 'whilst', 'thee', 'thou', 'hath', 'doth'];
  const failures: string[] = [];
  for (const [key, t] of templates()) {
    for (const word of banned) if (wordPattern(word).test(t)) failures.push(`${key}: "${word}" in "${t}"`);
  }
  assert.deepEqual(failures, []);
  // And the check would catch one.
  assert.ok(wordPattern("'tis").test('’Tis done.'));
  assert.ok(wordPattern('hath').test('it Hath boiled'));
  assert.ok(!wordPattern('thou').test('though'));
});

test('1e. no modern spelling the table lists: the 1755 form, as a whole word', () => {
  const failures: string[] = [];
  for (const [key, t] of templates()) {
    for (const [modern, old] of Object.entries(SPELLING)) {
      if (wordPattern(modern).test(t)) failures.push(`${key}: "${modern}" should be "${old}" in "${t}"`);
    }
  }
  assert.deepEqual(failures, []);
  // Whole words only: "shew" is not "show", and "showers" would not be.
  assert.ok(wordPattern('show').test('Show me'));
  assert.ok(!wordPattern('show').test('showers'));
});

test('1f. the spelling table is modern to 1755, lower case, and never maps a word to itself', () => {
  for (const [modern, old] of Object.entries(SPELLING)) {
    assert.equal(modern, modern.toLowerCase(), modern);
    assert.notEqual(modern, old, modern);
  }
  // The table seeds from LANGUAGE.md section 6.
  for (const [modern, old] of [['error', 'errour'], ['public', 'publick'], ['show', 'shew'], ['fuel', 'fewel']]) {
    assert.equal(SPELLING[modern], old);
  }
});

test('1g. the long s only in the title, and the title reads without it', () => {
  for (const [key, t] of templates()) {
    if (key !== TITLE_KEY) assert.ok(!t.includes('ſ'), `${key}: a long s`);
  }
  const title = render(PERIOD, TITLE_KEY);
  assert.ok(title.includes('ſ'));
  // The label a screen reader hears is the title with every long s an s.
  assert.equal(title.replace(/ſ/g, 's'), render(EN, TITLE_KEY));
});

test('1h. the answers keep their meaning: three, distinct, and the soft one says rear', () => {
  const yolk = ['feedback.tooSoft', 'feedback.justRight', 'feedback.tooFirm'].map((k) => render(PERIOD, k));
  assert.deepEqual(yolk, ['Too rear', 'As was desired', 'Too hard']);
  const white = ['feedback.white.runny', 'feedback.white.tender', 'feedback.white.firm'].map((k) => render(PERIOD, k));
  assert.equal(new Set(white).size, 3);
});

test('1i. the owner\'s alarm, word for word', () => {
  // The first clause names the cooling the cook chose; the clause after the
  // semicolon is the owner's, untouched.
  assert.equal(render(PERIOD, 'alarm.pull.bodyIce'),
    'Commit them at once to the ice; for heat, though withdrawn from the fire, is not yet withdrawn from the egg.');
  assert.equal(render(PERIOD, 'alarm.pull.bodyTap'),
    'Commit them at once to the pump; for heat, though withdrawn from the fire, is not yet withdrawn from the egg.');
});

test('1j. Help\'s links are the English links: the same URLs, in the same markdown', () => {
  const links = (s: string): string[] => [...s.matchAll(/\]\((https:\/\/[^\s)]+)\)/g)].map((m) => m[1]);
  for (const [key, entry] of Object.entries(EN_JSON.messages)) {
    const english = typeof entry['text'] === 'string' ? entry['text'] : '';
    if (!english.includes('](https://')) continue;
    assert.deepEqual(links(render(PERIOD, key)), links(english), key);
  }
});

test('1k. formats come from the region: the register is not a format', () => {
  assert.equal(formattingLocale(PERIOD_LANGUAGE, 'US', null), 'en-US');
  assert.equal(formattingLocale(PERIOD_LANGUAGE, 'GB', null), 'en-GB');
  assert.equal(render(PERIOD, 'format.fahrenheit', { value: { value: 1234.5, decimals: 1 } }, 'en-US'), '1,234.5 °F');
});

// --------------------------------------------------------------------------
// the switch
// --------------------------------------------------------------------------

function flip(state: LanguageState, ...flips: ('metricToImperial' | 'imperialToMetric')[]): LanguageState {
  return flips.reduce((s, f) => languageAfterFlip(s, f), state);
}

test('2a. tags: 1750 in any region, and modern English is English without it', () => {
  for (const tag of ['en-x-1750', 'en-US-x-1750', 'EN-GB-X-1750']) assert.ok(isPeriod(tag), tag);
  for (const tag of ['en', 'en-US', 'cs', 'cs-x-1750', 'en-x-17500']) assert.ok(!isPeriod(tag), tag);
  assert.ok(isModernEnglish('en') && isModernEnglish('en-GB'));
  assert.ok(!isModernEnglish('en-x-1750') && !isModernEnglish('cs'));
  assert.equal(effectiveLanguage(FRESH_LANGUAGE), DEFAULT_LANGUAGE);
});

test('2b. metric to Imperial in English goes into 1750, and back to metric stays there', () => {
  const imperial = flip(FRESH_LANGUAGE, 'metricToImperial');
  assert.equal(effectiveLanguage(imperial), PERIOD_LANGUAGE);
  assert.deepEqual(flip(imperial, 'imperialToMetric'), imperial, 'the owner, DECISIONS.md 77');
  const chosen = languageAfterPick(FRESH_LANGUAGE, 'en');
  assert.equal(effectiveLanguage(flip(chosen, 'metricToImperial', 'imperialToMetric')), PERIOD_LANGUAGE);
});

test('2c. Imperial to metric never moves the language', () => {
  for (const state of [FRESH_LANGUAGE, { chosen: 'en' }, { chosen: PERIOD_LANGUAGE }, { chosen: 'cs' }]) {
    assert.deepEqual(flip(state, 'imperialToMetric'), state);
  }
});

test('2d. choosing English in the picker leaves 1750 and keeps the units as they are', () => {
  const picked = languageAfterPick(flip(FRESH_LANGUAGE, 'metricToImperial'), 'en');
  assert.equal(effectiveLanguage(picked), 'en');
  assert.equal(effectiveLanguage(flip(picked, 'imperialToMetric')), 'en');
});

test('2e. 1750 chosen in the picker is not left by the units', () => {
  const picked = languageAfterPick(FRESH_LANGUAGE, PERIOD_LANGUAGE);
  assert.equal(effectiveLanguage(flip(picked, 'imperialToMetric')), PERIOD_LANGUAGE);
  assert.equal(effectiveLanguage(flip(picked, 'metricToImperial', 'imperialToMetric')), PERIOD_LANGUAGE);
});

test('2f. a language that is not English is never moved', () => {
  const czech: LanguageState = { chosen: 'cs' };
  assert.deepEqual(flip(czech, 'metricToImperial'), czech);
  assert.deepEqual(flip(czech, 'imperialToMetric'), czech);
});

test('2g. a stored state is read defensively, and an old one still reads', () => {
  const known = ['en', PERIOD_LANGUAGE];
  assert.deepEqual(readLanguageState(null, known), FRESH_LANGUAGE);
  assert.deepEqual(readLanguageState('en', known), FRESH_LANGUAGE);
  assert.deepEqual(readLanguageState({ chosen: 'xx' }, known), FRESH_LANGUAGE);
  const stored = flip(FRESH_LANGUAGE, 'metricToImperial');
  assert.deepEqual(readLanguageState(JSON.parse(JSON.stringify(stored)), known), stored);
  // Stored before DECISIONS.md 77: what the switch replaced, now ignored.
  assert.deepEqual(readLanguageState({ chosen: PERIOD_LANGUAGE, flippedFrom: { chosen: null } }, known),
    { chosen: PERIOD_LANGUAGE });
});

// --------------------------------------------------------------------------
// the record
// --------------------------------------------------------------------------

test('3a. the record\'s register follows the language', () => {
  assert.equal(registerOf('en'), 'modern');
  assert.equal(registerOf('cs'), 'modern');
  assert.equal(registerOf(PERIOD_LANGUAGE), '1750');
  assert.equal(registerOf('en-US-x-1750'), '1750');
});

test('3b. a cook read in 1750 is recorded as 1750: lang and register both', () => {
  const cooked = (lang: string): Cooked => ({
    egg: eggFromMass(0.068), massFrom: 'class', sizeTable: 'eu', eggFrom: 'fridge',
    boilRemembered: false, units: 'imperial', lang: lang, forecast: null, nudge_s: 0,
    setup: {
      startMode: 'hot', afterBoil: 'hold', eggStart_C: 4, ambient_C: 20, boiling_C: 100,
      timeToBoil_s: 480, cooling: 'ice', waterLitres: 2, eggCount: 2,
    },
  });
  const m = advance(startHot(1_750_000_000_000, 400, 'ice', 0.4), 1_750_000_500_000).machine;
  const period = eggRecordFor(cooked(PERIOD_LANGUAGE), m, 'soft');
  assert.equal(period.lang, PERIOD_LANGUAGE);
  assert.equal(period.register, '1750');
  assert.notEqual(parseRecord(period), null);
  const modern = eggRecordFor(cooked('en'), m, 'soft');
  assert.equal(modern.lang, 'en');
  assert.equal(modern.register, 'modern');
});
