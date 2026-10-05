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

import { sizeClassesFor } from '../src/core/geometry.js';
import {
  DEFAULT_SETTINGS, Settings, boilStoredElsewhere, clearBoilMemory, loadBoilMemory, loadCook, loadSettings,
  rememberTimeToBoil, saveCook, saveSettings, settingsStoredElsewhere,
} from '../src/ui/store.js';

/** localStorage, in memory, as in record.test.ts: the store reads
 *  `window.localStorage` at call time, inside a try. */
const storage = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); },
    removeItem: (k: string) => { storage.delete(k); },
  },
};

const SETTINGS_KEY = 'aet.settings.v1';
const COOK_KEY = 'aet.cook.v2';
const classes = sizeClassesFor('eu');

/** A page opened on this storage: as boot() does, the settings are read
 *  before anything is saved, which is where the last pan comes from. */
function freshPage(): void {
  storage.clear();
  loadSettings(classes);
}

function settingsWith(over: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...over };
}

test('a pan start is saved and comes back', () => {
  freshPage();
  saveSettings(settingsWith({ startMode: 'hot' }));
  assert.equal(loadSettings(classes).startMode, 'hot');
  saveSettings(settingsWith({ startMode: 'cold' }));
  assert.equal(loadSettings(classes).startMode, 'cold');
});

test('sous-vide is not saved: a reload comes back to the last pan', () => {
  freshPage();
  saveSettings(settingsWith({ startMode: 'hot', altitude_m: 400 }));
  saveSettings(settingsWith({ startMode: 'sous', altitude_m: 800, eggCount: 3 }));
  const back = loadSettings(classes);
  assert.equal(back.startMode, 'hot');
  // Everything else in the same save is kept as before.
  assert.equal(back.altitude_m, 800);
  assert.equal(back.eggCount, 3);
  // And it stays the last pan however many saves sous-vide makes.
  saveSettings(settingsWith({ startMode: 'sous', doneness: 0.2 }));
  saveSettings(settingsWith({ startMode: 'sous', doneness: 0.3 }));
  assert.equal(loadSettings(classes).startMode, 'hot');
  assert.equal(loadSettings(classes).doneness, 0.3);
});

test('sous-vide with no pan before it comes back as cold', () => {
  freshPage();
  saveSettings(settingsWith({ startMode: 'sous' }));
  assert.equal(loadSettings(classes).startMode, 'cold');
  assert.equal(JSON.parse(storage.get(SETTINGS_KEY) ?? '{}').startMode, 'cold');
});

test('a stored sous-vide from an older build loads as cold', () => {
  freshPage();
  storage.set(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, startMode: 'sous', altitude_m: 600 }));
  const back = loadSettings(classes);
  assert.equal(back.startMode, 'cold');
  assert.equal(back.altitude_m, 600);
});

test('a measured egg saved before measuredBy existed is read as weighed', () => {
  // The live site of 19 September saved a custom diameter with no word of
  // which box it came from; the scale is the first box and the likely one.
  freshPage();
  const old: Record<string, unknown> = { ...DEFAULT_SETTINGS, sizeIndex: -1, customMinor_mm: 44 };
  delete old['measuredBy'];
  storage.set(SETTINGS_KEY, JSON.stringify(old));
  const back = loadSettings(classes);
  assert.equal(back.measuredBy, 'scale');
  assert.equal(back.customMinor_mm, 44);
  saveSettings(settingsWith({ sizeIndex: -1, measuredBy: 'girth' }));
  assert.equal(loadSettings(classes).measuredBy, 'girth', 'a box typed in since is kept');
});

test('choosing sous-vide still works within the session', () => {
  // The in-memory setting is the page's; only what is written down changes.
  freshPage();
  const settings = settingsWith({ startMode: 'sous' });
  saveSettings(settings);
  assert.equal(settings.startMode, 'sous');
});

test('a cook comes back with whether its egg was written down', () => {
  storage.clear();
  const machine = { phase: 'DONE' };
  const ticket = { lang: 'en' };
  saveCook(machine, ticket, 'beforeReload');
  assert.deepEqual(loadCook(), { machine: machine, ticket: ticket, answers: 'beforeReload' });
  saveCook(machine, ticket, 'none');
  assert.equal(loadCook()?.answers, 'none');
});

test('a cook kept before `answers` is dropped, never read as unanswered', () => {
  // Read as unanswered, an egg already in the log would be logged again.
  storage.clear();
  storage.set(COOK_KEY, JSON.stringify({ machine: { phase: 'DONE' }, ticket: null, feedbackGiven: true }));
  assert.equal(loadCook(), null);
  storage.set(COOK_KEY, JSON.stringify({ machine: { phase: 'DONE' }, ticket: null, answers: 'live' }));
  assert.equal(loadCook(), null, 'only what saveCook writes');
});

test('the live site\'s cook, and junk, are never a crash', () => {
  storage.clear();
  storage.set('aet.cook.v1', JSON.stringify({ machine: { phase: 'COOKING' }, feedbackGiven: false }));
  assert.equal(loadCook(), null);
  assert.equal(storage.has('aet.cook.v1'), false, 'the superseded key is removed');
  for (const junk of ['{', 'null', '[]', '"cook"', JSON.stringify({ machine: 3, answers: 'none' })]) {
    storage.set(COOK_KEY, junk);
    assert.equal(loadCook(), null, junk);
  }
});

test('another tab\'s settings are taken up: what this page changed stays its own, the rest is theirs', () => {
  freshPage();
  const mine = loadSettings(classes);
  // Another tab, loaded earlier, changes the altitude and turns the sound off.
  const theirs = { ...DEFAULT_SETTINGS, altitude_m: 900, muted: true };
  storage.set(SETTINGS_KEY, JSON.stringify(theirs));
  // This page, before it hears, moves the slider and saves.
  mine.doneness = 0.8;
  const saved = saveSettings(mine);
  assert.deepEqual([saved.altitude_m, saved.muted, saved.doneness], [900, true, 0.8]);
  const stored = JSON.parse(storage.get(SETTINGS_KEY) ?? '{}') as Settings;
  assert.deepEqual([stored.altitude_m, stored.muted, stored.doneness], [900, true, 0.8], 'nothing undone');
  // The page's storage event: taken up once, keeping a change not yet saved.
  saved.eggCount = 3;
  storage.set(SETTINGS_KEY, JSON.stringify({ ...stored, cooling: 'tap' }));
  assert.equal(settingsStoredElsewhere('aet.boil.v1', saved), null);
  const heard = settingsStoredElsewhere(SETTINGS_KEY, saved);
  assert.deepEqual([heard?.cooling, heard?.eggCount, heard?.altitude_m], ['tap', 3, 900]);
  assert.equal(settingsStoredElsewhere(SETTINGS_KEY, saved), null, 'once');
});

test('a sous-vide on screen stays this page\'s when another tab saves a pan', () => {
  freshPage();
  saveSettings(settingsWith({ startMode: 'cold' }));
  const mine = settingsWith({ startMode: 'sous' });
  storage.set(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, startMode: 'hot' }));
  const saved = saveSettings(mine);
  assert.equal(saved.startMode, 'sous');
  assert.equal(JSON.parse(storage.get(SETTINGS_KEY) ?? '{}').startMode, 'hot', 'the other tab\'s pan, the last saved');
});

test('"Forget everything" in another tab is not undone by this one\'s next measured boil', () => {
  storage.clear();
  const BOIL_KEY = 'aet.boil.v1';
  let memory = loadBoilMemory();
  memory = rememberTimeToBoil(memory, 2, 600);
  assert.equal(boilStoredElsewhere(BOIL_KEY), null, 'its own write is nothing new');
  // Another tab forgets every pan; this one has not heard, and times a boil.
  storage.delete(BOIL_KEY);
  memory = rememberTimeToBoil(memory, 1.5, 420);
  assert.deepEqual(Object.keys(JSON.parse(storage.get(BOIL_KEY) ?? '{}') as object), Object.keys(memory));
  assert.equal(Object.keys(memory).length, 1, 'only the pan timed since');
  // And when it hears, it follows.
  storage.delete(BOIL_KEY);
  assert.deepEqual(boilStoredElsewhere(null), {});
  assert.equal(boilStoredElsewhere(BOIL_KEY), null);
  clearBoilMemory();
});
