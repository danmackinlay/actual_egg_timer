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
import { DEFAULT_SETTINGS, Settings, loadSettings, saveSettings } from '../src/ui/store.js';

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
const classes = sizeClassesFor('eu');

function settingsWith(over: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...over };
}

test('a pan start is saved and comes back', () => {
  storage.clear();
  saveSettings(settingsWith({ startMode: 'hot' }));
  assert.equal(loadSettings(classes).startMode, 'hot');
  saveSettings(settingsWith({ startMode: 'cold' }));
  assert.equal(loadSettings(classes).startMode, 'cold');
});

test('sous-vide is not saved: a reload comes back to the last pan', () => {
  storage.clear();
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
  storage.clear();
  saveSettings(settingsWith({ startMode: 'sous' }));
  assert.equal(loadSettings(classes).startMode, 'cold');
  assert.equal(JSON.parse(storage.get(SETTINGS_KEY) ?? '{}').startMode, 'cold');
});

test('a stored sous-vide from an older build loads as cold', () => {
  storage.clear();
  storage.set(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, startMode: 'sous', altitude_m: 600 }));
  const back = loadSettings(classes);
  assert.equal(back.startMode, 'cold');
  assert.equal(back.altitude_m, 600);
});

test('choosing sous-vide still works within the session', () => {
  // The in-memory setting is the page's; only what is written down changes.
  storage.clear();
  const settings = settingsWith({ startMode: 'sous' });
  saveSettings(settings);
  assert.equal(settings.startMode, 'sous');
});
