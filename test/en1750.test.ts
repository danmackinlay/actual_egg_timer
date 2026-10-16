/**
 * The English of 1750 (LANGUAGE.md section 6): the rules its catalogue is held
 * to beyond any other language's, the switch that goes into it and out, and
 * the record that says it was read.
 *
 * Placeholder parity and the length budgets are copy.test.ts's, which reads
 * every catalogue in copy/ and so this one too; 1a checks that it does. Every
 * twin, of either app's key, is held to every rule here; a key without one
 * falls back to English and is listed by `npm run copy:queue` (1b).
 *
 * Run from the repo root (npm test does). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { DEFAULT_LANGUAGE, PERIOD_LANGUAGE, isPeriod, parseCatalogue, render, templatesOf } from '../src/core/copy.ts';
import { formattingLocale } from '../src/core/format.ts';
import {
  FRESH_LANGUAGE, type LanguageState, effectiveLanguage, languageAfterFlip, readLanguageState,
} from '../src/ui/settings.ts';
import { parseRecord } from '../src/core/record.ts';
import { type CookChoices, replan, startCook } from '../src/core/running.ts';
import { catalogueTags, isCatalogueFile, translationTags } from '../tools/copyApproval.ts';
import { gridFor, knowing, webRecordFor } from '../tools/common.ts';
import { NOTES_PATH, readNotes } from '../tools/copyNotes.ts';
import { asRead } from '../tools/text.ts';

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
  assert.ok(catalogueTags().includes(PERIOD_LANGUAGE));
  assert.ok(translationTags().includes(PERIOD_LANGUAGE));
  // copy/ holds the catalogues, `<tag>.json`, and beside them the notes,
  // which neither app ships (tools/buildSite.mjs and ios/project.yml leave
  // them out). Anything else would ship, so the approved record is kept in
  // test/data/.
  for (const f of readdirSync('copy')) {
    assert.ok(isCatalogueFile(f) || `copy/${f}` === NOTES_PATH, `${f}: not a catalogue, and the apps would ship it`);
  }
  assert.equal(P_JSON.locale, PERIOD_LANGUAGE);
});

test('1b. every twin is an English key; a key without one is listed, not refused', () => {
  // The twins may lag the English: a key with no twin renders in English
  // (1c), and `npm run copy:queue` lists it, with the twins written against
  // older English. Every twin there is - the web's, and iOS's alarms, Live
  // Activity and Dynamic Island - is held to every rule below: the
  // archaisms, the spellings, the long s.
  for (const key of PERIOD.messages.keys()) assert.ok(EN.messages.has(key), `${key}: not an English key`);
  // The app's name is a name, and stays English.
  assert.ok(!PERIOD.messages.has('app.name'));
});

test('1b2. the small surfaces keep to a few words of period flavour', () => {
  // LANGUAGE.md section 6, rule 2: on the Lock Screen, the Dynamic Island and
  // an alarm's title the register gets two or three words, not a paragraph.
  // The budgets bind in copy.test.ts; this holds the flavour to few words.
  const small = new Set(['notification.title', 'island.compact', 'island.expanded', 'lockscreen']);
  const notes = readNotes();
  for (const key of Object.keys(EN_JSON.messages)) {
    if (!small.has(notes[key].surface) || !PERIOD.messages.has(key)) continue;
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

test('1h. the answers keep their meaning: the yolk in the slider\'s five words, the runny one rear', () => {
  // The yolk the cook got is answered in the ticks' own
  // words, five and distinct; the white's three are distinct too.
  const yolk = ['doneness.runny', 'doneness.soft', 'doneness.jammy', 'doneness.fudgy', 'doneness.hard']
    .map((k) => render(PERIOD, k));
  assert.equal(new Set(yolk).size, 5, `five distinct words: ${yolk.join(', ')}`);
  for (const w of yolk) assert.ok(w.length > 0 && !w.includes(' '), `one word each: ${w}`);
  // The runny yolk is a word of 1750's own, not the English left in place.
  assert.notEqual(yolk[0], render(EN, 'doneness.runny'));
  const white = ['feedback.white.runny', 'feedback.white.tender', 'feedback.white.firm'].map((k) => render(PERIOD, k));
  assert.equal(new Set(white).size, 3);
});

test('1i. the owner\'s alarm: their clause, after the cooling the cook chose', () => {
  // Each body into water is the catalogue's own twin, not the English left in
  // place. The first clause names the cooling the cook chose, so the three
  // differ there; the clause after the semicolon is the owner's, and the same
  // in all three.
  const keys = ['alarm.pull.bodyIce', 'alarm.pull.bodyTap', 'alarm.pull.bodyBowl'];
  for (const key of keys) assert.ok(key in P_JSON.messages, `${key}: a twin of its own`);
  const parts = keys.map((key) => render(PERIOD, key).split('; '));
  for (const [i, p] of parts.entries()) assert.equal(p.length, 2, `${keys[i]}: two clauses, one semicolon`);
  assert.equal(new Set(parts.map((p) => p[0])).size, 3, 'each names its own cooling');
  assert.equal(new Set(parts.map((p) => p[1])).size, 1, 'the owner\'s clause, the same in all three');
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
  assert.equal(asRead(render(PERIOD, 'format.fahrenheit', { value: { value: 1234.5, decimals: 1 } }, 'en-US')), '1,234.5 °F');
});

// --------------------------------------------------------------------------
// the switch
// --------------------------------------------------------------------------

function flip(state: LanguageState, ...flips: ('metricToImperial' | 'imperialToMetric')[]): LanguageState {
  return flips.reduce((s, f) => languageAfterFlip(s, f), state);
}

test('2a. tags: 1750 in any region, and nothing else', () => {
  for (const tag of ['en-x-1750', 'en-US-x-1750', 'EN-GB-X-1750', 'en-x-1750-a']) assert.ok(isPeriod(tag), tag);
  for (const tag of ['en', 'en-US', 'cs', 'cs-x-1750', 'en-x-17500', 'en-x-175', 'x-1750', '', 'enx-1750']) {
    assert.ok(!isPeriod(tag), tag);
  }
  assert.equal(effectiveLanguage(FRESH_LANGUAGE), DEFAULT_LANGUAGE);
});

test('2b. metric to Imperial in English goes into 1750, and back to metric stays there', () => {
  const imperial = flip(FRESH_LANGUAGE, 'metricToImperial');
  assert.equal(effectiveLanguage(imperial), PERIOD_LANGUAGE);
  assert.deepEqual(flip(imperial, 'imperialToMetric'), imperial, 'back to metric leaves 1750 alone');
  const chosen = { chosen: 'en' };
  assert.equal(effectiveLanguage(flip(chosen, 'metricToImperial', 'imperialToMetric')), PERIOD_LANGUAGE);
});

test('2c. Imperial to metric never moves the language', () => {
  for (const state of [FRESH_LANGUAGE, { chosen: 'en' }, { chosen: PERIOD_LANGUAGE }, { chosen: 'cs' }]) {
    assert.deepEqual(flip(state, 'imperialToMetric'), state);
  }
});

test('2d. choosing English in the picker leaves 1750 and keeps the units as they are', () => {
  const picked = { chosen: 'en' };
  assert.equal(effectiveLanguage(picked), 'en');
  assert.equal(effectiveLanguage(flip(picked, 'imperialToMetric')), 'en');
});

test('2e. 1750 chosen in the picker is not left by the units', () => {
  const picked = { chosen: PERIOD_LANGUAGE };
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
  // A stored `flippedFrom`, what the switch replaced, is ignored.
  assert.deepEqual(readLanguageState({ chosen: PERIOD_LANGUAGE, flippedFrom: { chosen: null } }, known),
    { chosen: PERIOD_LANGUAGE });
});

// --------------------------------------------------------------------------
// the record
// --------------------------------------------------------------------------

test('3b. a cook read in 1750 is recorded as 1750: lang and register both', () => {
  const choices: CookChoices = {
    mass_kg: 0.068, massFrom: 'class', sizeTable: 'eu', eggFrom: 'fridge', customStart_C: 12, room_C: null,
    startMode: 'hot', afterBoil: 'hold', cooling: 'ice', tapWater_C: null, bowlLitres: 2, bowlWater_C: null, waterLitres: 2, eggCount: 2, altitude_m: 0, level: 0.4,
  };
  const C = knowing({ particles: 50, eggsLogged: 0 });
  const recorded = (lang: string) => {
    const cook = startCook(1_750_000_000, choices, 0, {}, 'imperial', lang);
    // On its pot's surface: no record is made from a plan with none.
    const inputs = replan(cook, C, null, 0, 1_750_000_500).inputs;
    assert.ok(inputs !== null);
    const surface = { inputs: inputs, grid: gridFor(C, inputs.egg, inputs.setup), profile: null };
    const r = webRecordFor(cook, replan(cook, C, surface, 0, 1_750_000_500), 'soft');
    assert.ok(r !== null);
    return r;
  };
  const period = recorded(PERIOD_LANGUAGE);
  assert.equal(period.lang, PERIOD_LANGUAGE);
  assert.equal(period.register, '1750');
  assert.notEqual(parseRecord(period), null);
  const modern = recorded('en');
  assert.equal(modern.lang, 'en');
  assert.equal(modern.register, 'modern');
});
