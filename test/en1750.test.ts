/**
 * The English of 1750 (LANGUAGE.md section 6), as only it is: the words of
 * its own its catalogue must keep, the tags that are it, the switch that
 * goes into it and out, and the record that says it was read. Its style is
 * guidance (LANGUAGE.md), not a check.
 *
 * What every catalogue is held to - the English's keys, placeholders and
 * links, its plural forms, the region's formats, the length budgets - is
 * copy.test.ts's, and which languages are offered languages.test.ts's; both
 * read this catalogue with the rest. A key without a twin falls back to
 * English.
 *
 * Run from the repo root (npm test does). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DEFAULT_LANGUAGE, PERIOD_LANGUAGE, isPeriod, parseCatalogue, render } from '../src/core/copy.ts';
import {
  FRESH_LANGUAGE, type LanguageState, effectiveLanguage, languageAfterFlip,
} from '../src/ui/settings.ts';
import { parseRecord } from '../src/core/record.ts';
import { type CookChoices, replan, startCook } from '../src/core/running.ts';
import { gridFor, knowing, webRecordFor } from '../tools/common.ts';

type Entry = Record<string, unknown>;
interface CatalogueJson { locale: string; messages: Record<string, Entry> }

const EN_JSON = JSON.parse(readFileSync('copy/en.json', 'utf8')) as CatalogueJson;
const P_JSON = JSON.parse(readFileSync('copy/en-x-1750.json', 'utf8')) as CatalogueJson;
const EN = parseCatalogue(EN_JSON);
const PERIOD = parseCatalogue(P_JSON, EN);

// --------------------------------------------------------------------------
// the catalogue
// --------------------------------------------------------------------------

test('the app\'s name is a name, and 1750 leaves it to English', () => {
  // The twins may lag the English, and `git log -- copy/en-x-1750.json`
  // shows how old a twin is; app.name is iOS's, and has none on purpose.
  assert.ok(!PERIOD.messages.has('app.name'));
  assert.equal(render(PERIOD, 'app.name'), render(EN, 'app.name'));
});

test('the answers keep their meaning: the yolk in the slider\'s five words, the runny one rear', () => {
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

test('the owner\'s alarm: their clause, after the cooling the cook chose', () => {
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

// --------------------------------------------------------------------------
// the switch
// --------------------------------------------------------------------------

function flip(state: LanguageState, ...flips: ('metricToImperial' | 'imperialToMetric')[]): LanguageState {
  return flips.reduce((s, f) => languageAfterFlip(s, f), state);
}

test('tags: 1750 in any region, and nothing else', () => {
  for (const tag of ['en-x-1750', 'en-US-x-1750', 'EN-GB-X-1750', 'en-x-1750-a']) assert.ok(isPeriod(tag), tag);
  for (const tag of ['en', 'en-US', 'xx', 'xx-x-1750', 'en-x-17500', 'en-x-175', 'x-1750', '', 'enx-1750']) {
    assert.ok(!isPeriod(tag), tag);
  }
  assert.equal(effectiveLanguage(FRESH_LANGUAGE), DEFAULT_LANGUAGE);
});

test('metric to Imperial in English goes into 1750, and back to metric stays there', () => {
  const imperial = flip(FRESH_LANGUAGE, 'metricToImperial');
  assert.equal(effectiveLanguage(imperial), PERIOD_LANGUAGE);
  assert.deepEqual(flip(imperial, 'imperialToMetric'), imperial, 'back to metric leaves 1750 alone');
  const chosen = { chosen: 'en' };
  assert.equal(effectiveLanguage(flip(chosen, 'metricToImperial', 'imperialToMetric')), PERIOD_LANGUAGE);
});

test('Imperial to metric never moves the language', () => {
  for (const state of [FRESH_LANGUAGE, { chosen: 'en' }, { chosen: PERIOD_LANGUAGE }, { chosen: 'xx' }]) {
    assert.deepEqual(flip(state, 'imperialToMetric'), state);
  }
});

test('choosing English in the picker leaves 1750 and keeps the units as they are', () => {
  const picked = { chosen: 'en' };
  assert.equal(effectiveLanguage(picked), 'en');
  assert.equal(effectiveLanguage(flip(picked, 'imperialToMetric')), 'en');
});

test('1750 chosen in the picker is not left by the units', () => {
  const picked = { chosen: PERIOD_LANGUAGE };
  assert.equal(effectiveLanguage(flip(picked, 'imperialToMetric')), PERIOD_LANGUAGE);
  assert.equal(effectiveLanguage(flip(picked, 'metricToImperial', 'imperialToMetric')), PERIOD_LANGUAGE);
});

test('a language that is not English is never moved', () => {
  const other: LanguageState = { chosen: 'xx' };
  assert.deepEqual(flip(other, 'metricToImperial'), other);
  assert.deepEqual(flip(other, 'imperialToMetric'), other);
});

// --------------------------------------------------------------------------
// the record
// --------------------------------------------------------------------------

test('a cook read in 1750 is recorded as 1750: lang and register both', () => {
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
