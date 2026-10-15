/**
 * The web app's saved setup (`src/ui/store.ts`): what a reload comes back to.
 *
 * Only one rule is pinned here so far, the owner's: sous-vide is never
 * remembered. Its answer is a start time most of a day in the past, and an app
 * that reopened on it would open by telling the cook they are 22 hours late.
 * A reload returns to the last PAN method instead, or to cold.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { sizeClassesFor } from '../src/core/geometry.ts';
import { type RunningCook, startCook, withBoil } from '../src/core/running.ts';
import { STORES, stamped } from '../src/ui/stores.ts';
import { choicesOf } from '../src/ui/state.ts';
import { DEFAULT_SETTINGS, type Settings, loadLanguage, openCooks, openSettings } from '../src/ui/store.ts';

/** localStorage, in memory, as in test/records.ts: the store reads
 *  `window.localStorage` at call time, inside a try. */
const storage = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); },
    removeItem: (k: string) => { storage.delete(k); },
  },
};

const SETTINGS_KEY = STORES.settings.key;

/** Settings as a build of this format stores them. */
const settingsText = (o: object): string => JSON.stringify(stamped(STORES.settings, { ...o }));
const COOK_KEY = STORES.cook.key;
const classes = sizeClassesFor('eu');
/** The page's stores, as boot() opens them. */
const settings = openSettings(classes);
const cooks = openCooks();

/** A page opened on this storage: as boot() does, the settings are read
 *  before anything is saved, which is where the last pan comes from. */
function freshPage(): void {
  storage.clear();
  settings.load();
}

function settingsWith(over: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...over };
}

test('a pan start is saved and comes back', () => {
  freshPage();
  settings.save(settingsWith({ startMode: 'hot' }));
  assert.equal(settings.load().startMode, 'hot');
  settings.save(settingsWith({ startMode: 'cold' }));
  assert.equal(settings.load().startMode, 'cold');
});

test('sous-vide is not saved: a reload comes back to the last pan', () => {
  freshPage();
  settings.save(settingsWith({ startMode: 'hot', altitude_m: 400 }));
  settings.save(settingsWith({ startMode: 'sous', altitude_m: 800, eggCount: 3 }));
  const back = settings.load();
  assert.equal(back.startMode, 'hot');
  // Everything else in the same save is kept as before.
  assert.equal(back.altitude_m, 800);
  assert.equal(back.eggCount, 3);
  // And it stays the last pan however many saves sous-vide makes.
  settings.save(settingsWith({ startMode: 'sous', doneness: 0.2 }));
  settings.save(settingsWith({ startMode: 'sous', doneness: 0.3 }));
  assert.equal(settings.load().startMode, 'hot');
  assert.equal(settings.load().doneness, 0.3);
});

test('sous-vide with no pan before it comes back as cold', () => {
  freshPage();
  settings.save(settingsWith({ startMode: 'sous' }));
  assert.equal(settings.load().startMode, 'cold');
  assert.equal(JSON.parse(storage.get(SETTINGS_KEY) ?? '{}').startMode, 'cold');
});

test('settings stored in no format, as 0.3 stored them, read as a fresh install\'s', () => {
  freshPage();
  storage.set(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, altitude_m: 600 }));
  assert.equal(settings.load().altitude_m, DEFAULT_SETTINGS.altitude_m);
});

test('settings the build before stored, with the iPhone\'s weighed egg in them, read back intact', () => {
  // Format 1 as core's settings wrote it before each app kept its own: every
  // field the web reads, and `weighedMass_g`, which only the iPhone reads.
  freshPage();
  const written = {
    v: 1, sizeIndex: -1, customMinor_mm: 47.5, measuredBy: 'girth', weighedMass_g: 71.25, startTempMode: 'custom',
    customStart_C: 18.5, altitude_m: 1200, startMode: 'hot', afterBoil: 'off', cooling: 'bowl', tapWater_C: 12.5,
    bowlLitres: 1.5, bowlWater_C: 17, waterLitres: 3.5, eggCount: 6, doneness: 0.73, muted: true, alarm: 'hen',
    unitsChosen: 'imperial', language: { chosen: 'en-x-1750' }, probe: true, room_C: 23.5,
  };
  storage.set(SETTINGS_KEY, JSON.stringify(written));
  const { v: _v, weighedMass_g: _weighed, ...read } = written;
  assert.deepEqual(settings.load(), read);
  assert.equal(loadLanguage().chosen, 'en-x-1750', 'the reader of 1750 stays in 1750');
});

test('a stored sous-vide from an older build loads as cold', () => {
  freshPage();
  storage.set(SETTINGS_KEY, settingsText({ ...DEFAULT_SETTINGS, startMode: 'sous', altitude_m: 600 }));
  const back = settings.load();
  assert.equal(back.startMode, 'cold');
  assert.equal(back.altitude_m, 600);
});

test('a measured egg saved before measuredBy existed is read as weighed', () => {
  // The live site of 19 September saved a custom diameter with no word of
  // which box it came from; the scale is the first box and the likely one.
  freshPage();
  const old: Record<string, unknown> = { ...DEFAULT_SETTINGS, sizeIndex: -1, customMinor_mm: 44 };
  delete old['measuredBy'];
  storage.set(SETTINGS_KEY, settingsText(old));
  const back = settings.load();
  assert.equal(back.measuredBy, 'scale');
  assert.equal(back.customMinor_mm, 44);
  settings.save(settingsWith({ sizeIndex: -1, measuredBy: 'girth' }));
  assert.equal(settings.load().measuredBy, 'girth', 'a box typed in since is kept');
});

test('choosing sous-vide still works within the session', () => {
  // The in-memory setting is the page's; only what is written down changes.
  freshPage();
  const sous = settingsWith({ startMode: 'sous' });
  settings.save(sous);
  assert.equal(sous.startMode, 'sous');
});

/** A running cook, as core starts one (src/core/running.ts), not yet
 *  tapped. */
function unboiled(id_ms = 1_791_363_600_000): RunningCook {
  const choices = choicesOf({ ...DEFAULT_SETTINGS, sizeIndex: 2 }, 'GB');
  return startCook(id_ms / 1000, choices, -3, { '2.0': 480 }, 'metric', 'en');
}

/** The same, the boil tapped. */
function aCook(id_ms = 1_791_363_600_000): RunningCook {
  return withBoil(unboiled(id_ms), id_ms / 1000 + 500);
}

test('a cook comes back whole, with whether its egg was written down and the lean last decided', () => {
  storage.clear();
  const cook = aCook();
  cooks.save(cook, 'beforeReload', 12.5);
  assert.deepEqual(cooks.load(), { cook: cook, answers: 'beforeReload', leanHint_s: 12.5 });
  cooks.save(cook, 'none', 0);
  assert.equal(cooks.load()?.answers, 'none');
  cooks.saveLeanHint(cook.id_ms + 1, 4);
  assert.equal(cooks.load()?.leanHint_s, 0, 'the lean goes only beside its own cook');
  cooks.saveLeanHint(cook.id_ms, 4);
  assert.deepEqual(cooks.load(), { cook: cook, answers: 'none', leanHint_s: 4 }, 'the cook as it was');
});

test('a cook is stored without the cook as it stands: its start and log, which a reload folds again', () => {
  storage.clear();
  const cook = aCook();
  cooks.save(cook, 'none', 0);
  const stored = JSON.parse(storage.get(COOK_KEY) ?? '{}') as { v: number; cook: Record<string, unknown> };
  assert.equal(stored.v, STORES.cook.format);
  for (const field of ['startedAt_s', 'choices', 'events', 'correctedAt_s', 'asRan']) {
    assert.ok(!(field in stored.cook), `${field} not written`);
  }
  assert.deepEqual(cooks.load()?.cook, cook);
});

test('a cook forgotten goes from storage only if it is the cook stored', () => {
  storage.clear();
  const ended = aCook();
  const later = aCook(ended.id_ms + 60_000);
  cooks.save(later, 'none', 0);
  cooks.clear(ended.id_ms);
  assert.deepEqual((cooks.load()?.cook ?? null), later, 'a cook started since, while that one waited on its record: it stays');
  cooks.clear(later.id_ms);
  assert.equal(cooks.text(), null);
  storage.set(COOK_KEY, '{');
  cooks.clear(ended.id_ms);
  assert.equal(cooks.text(), null, 'junk goes');
});

test('the settings as a cook\'s choices: the carton\'s class or the measured egg, the pan, the room with or without the probe', () => {
  const eu = choicesOf({ ...DEFAULT_SETTINGS, sizeIndex: 2, doneness: 0.62 }, 'GB');
  assert.deepEqual([eu.mass_kg, eu.massFrom, eu.sizeTable, eu.level], [sizeClassesFor('GB')[2].mass_kg, 'class', 'eu', 0.62]);
  const us = choicesOf({ ...DEFAULT_SETTINGS, sizeIndex: 2 }, 'US');
  assert.deepEqual([us.mass_kg, us.sizeTable], [sizeClassesFor('US')[2].mass_kg, 'us']);
  const measured = choicesOf({ ...DEFAULT_SETTINGS, sizeIndex: -1, customMinor_mm: 44, measuredBy: 'girth' }, 'GB');
  assert.deepEqual([measured.massFrom, measured.sizeTable], ['girth', null]);
  assert.ok(measured.mass_kg > 0.05 && measured.mass_kg < 0.08);
  assert.equal(choicesOf({ ...DEFAULT_SETTINGS, startMode: 'sous' }, 'GB').startMode, 'hot', 'sous-vide is a hot pan to the solver');
  assert.equal(choicesOf({ ...DEFAULT_SETTINGS, room_C: 26 }, 'GB').room_C, 26, 'the room counts without the probe');
  assert.equal(choicesOf({ ...DEFAULT_SETTINGS, room_C: 26, probe: true }, 'GB').room_C, 26);
  assert.equal(choicesOf({ ...DEFAULT_SETTINGS, room_C: null, probe: true }, 'GB').room_C, null);
});

test('the alarm sound comes back as stored, and anything else, or nothing, is the wind-up timer', () => {
  freshPage();
  assert.equal(settings.load().alarm, 'timer', 'a fresh install');
  settings.save(settingsWith({ alarm: 'hen' }));
  assert.equal(settings.load().alarm, 'hen');
  storage.set(SETTINGS_KEY, settingsText({ ...DEFAULT_SETTINGS, alarm: 'beeps' }));
  assert.equal(settings.load().alarm, 'timer', 'a sound this version does not offer');
  const before = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  delete before['alarm'];
  storage.set(SETTINGS_KEY, settingsText(before));
  assert.equal(settings.load().alarm, 'timer', 'a record from before the choice');
});
