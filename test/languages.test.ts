/**
 * The languages the apps offer: core's table (`LANGUAGES`, src/core/copy.ts)
 * against the catalogues in copy/, iOS's declared localizations, and the
 * reading of a stored choice. Both pickers are built from the table, and
 * iOS's copy of it is written by `npm run swift:constants`, so a language is
 * a row there and a catalogue in copy/, and these hold the two together.
 * What each catalogue's words are held to is copy.test.ts's.
 *
 * Run from the repo root (npm test does). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { DEFAULT_LANGUAGE, LANGUAGES, OVERLAYS } from '../src/core/copy.ts';
import { languageOf } from '../src/core/format.ts';
import { FRESH_LANGUAGE, LANGUAGE_TAGS, readLanguageState } from '../src/ui/settings.ts';
import { NOTES_PATH, catalogueTags, isCatalogueFile, translationTags } from '../tools/copyNotes.ts';

const EN_MESSAGES = (JSON.parse(readFileSync('copy/en.json', 'utf8')) as { messages: Record<string, unknown> }).messages;

test('copy/ holds the catalogues and the notes, and nothing else, since the apps ship the folder', () => {
  // The notes neither app ships (tools/buildSite.ts and ios/project.yml
  // leave them out). Anything else would ship, so the approved record is
  // kept in test/data/.
  for (const f of readdirSync('copy')) {
    assert.ok(isCatalogueFile(f) || `copy/${f}` === NOTES_PATH, `${f}: not a catalogue, and the apps would ship it`);
  }
});

test('each language offered is a catalogue in copy/, named by a key, and each catalogue is offered', () => {
  const tags = LANGUAGES.map((l) => l.tag);
  assert.equal(new Set(tags).size, tags.length, 'each language once');
  assert.ok(tags.includes(DEFAULT_LANGUAGE), 'the default is offered');
  for (const language of LANGUAGES) {
    const json = JSON.parse(readFileSync(`copy/${language.tag}.json`, 'utf8')) as { locale: string };
    assert.equal(json.locale, language.tag, `copy/${language.tag}.json says it is ${json.locale}`);
    assert.ok(language.name in EN_MESSAGES, `${language.tag}: its name, ${language.name}, is not an English key`);
  }
  // Every catalogue but a regional overlay is a language: one with no row
  // would ship and never be offered.
  assert.deepEqual([...catalogueTags()].filter((t) => !OVERLAYS.includes(t)).sort(), [...tags].sort());
  assert.deepEqual([...translationTags()].sort(), tags.filter((t) => t !== DEFAULT_LANGUAGE).sort());
});

test('iOS declares a localization for each language the table offers, and no other', () => {
  // CFBundleLocalizations is what iOS reads to offer the app's own language
  // setting: a language subtag each, so the English of 1750 is English's.
  const yml = readFileSync('ios/project.yml', 'utf8');
  const m = /CFBundleLocalizations: \[([^\]]*)\]/.exec(yml);
  assert.ok(m !== null, 'ios/project.yml declares CFBundleLocalizations');
  const declared = m[1].split(',').map((s) => s.trim());
  assert.deepEqual(declared, [...new Set(LANGUAGES.map((l) => languageOf(l.tag)))]);
});

test('a stored choice is kept only if it is a language offered, and read defensively', () => {
  assert.deepEqual(LANGUAGE_TAGS, LANGUAGES.map((l) => l.tag));
  for (const tag of LANGUAGE_TAGS) assert.deepEqual(readLanguageState({ chosen: tag }, LANGUAGE_TAGS), { chosen: tag });
  for (const raw of [null, 'en', 42, [], {}, { chosen: 5 }, { chosen: 'xx' }, { chosen: null }]) {
    assert.deepEqual(readLanguageState(raw, LANGUAGE_TAGS), FRESH_LANGUAGE, JSON.stringify(raw));
  }
  // A stored `flippedFrom`, what the units switch once replaced, is ignored.
  const last = LANGUAGE_TAGS[LANGUAGE_TAGS.length - 1];
  assert.deepEqual(readLanguageState({ chosen: last, flippedFrom: { chosen: null } }, LANGUAGE_TAGS), { chosen: last });
});
