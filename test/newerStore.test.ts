/**
 * The web's guard against an older build writing over a newer one's stores
 * (src/ui/store.ts, `claimStorage`; DECISIONS.md 100): with a newer build's
 * mark in storage, the store layer writes nothing at all - the settings, the
 * pans, the cook, the log, the sharing state - sends nothing, and deletes
 * none of the keys it no longer reads. With none, or an older one, the mark
 * is brought up to this build before anything else is written, and then
 * those keys are deleted.
 *
 * In a file of its own: the guard is the store module's state for the life
 * of the page, and node runs each test file in a process of its own.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { sizeClassesFor } from '../src/core/geometry.js';
import {
  DEFAULT_SETTINGS, claimStorage, clearBoilMemory, clearCook, dropStoredCook, loadBoilMemory, loadCook, loadSettings,
  RETIRED_KEYS, newerStoredElsewhere, rememberTimeToBoil, saveCook, saveLeanHint, saveSettings, storageReadOnly,
} from '../src/ui/store.js';
import { clearCalibration, keptState, loadCalibration, logEgg } from '../src/ui/calibration.js';
import { APP_VERSION } from '../src/ui/version.js';
import { loadShare, sendFinal, setSharing, retryDeletes } from '../src/ui/share.js';

/** localStorage, in memory, with every write in order. */
const storage = new Map<string, string>();
const writes: string[] = [];
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { writes.push(k); storage.set(k, v); },
    removeItem: (k: string) => { writes.push(`-${k}`); storage.delete(k); },
  },
};

const NEWEST_KEY = 'aet.newest';
const GONE = '0b5e6c1e-1a2b-4c3d-8e9f-0123456789ab';
const classes = sizeClassesFor('eu');

/** What a newer build left: every store this build knows, in shapes it may
 *  or may not read, and two it does not know of. */
function newerStores(): Map<string, string> {
  return new Map([
    [NEWEST_KEY, '9.0.0'],
    ['aet.settings.v1', JSON.stringify({ ...DEFAULT_SETTINGS, altitude_m: 1200, addedLater: true })],
    ['aet.boil.v1', JSON.stringify({ '2': 420 })],
    ['aet.cook.v4', JSON.stringify({ cook: { id_ms: 7, later: 1 }, answers: 'none', leanHint_s: 0 })],
    ['aet.cook.v2', JSON.stringify({ machine: { phase: 'COOKING' }, ticket: null, answers: 'none' })],
    ['aet.cook.unread', JSON.stringify(['a cook kept aside'])],
    ['aet.calibration.v4.unread', JSON.stringify(['a store kept aside'])],
    ['aet.calibration.v5', JSON.stringify({ v: 9, whatever: 'a later store' })],
    ['aet.calibration.v4', JSON.stringify({ v: 4, log: [] })],
    ['aet.calibration', 'a key this build would tidy away'],
    // Sharing off, with a deletion still to ask for, which this build would
    // send at once if it could.
    ['aet.share.v1', JSON.stringify({ on: false, uid: null, uids: [GONE], deleting: [GONE], later: [1, 2] })],
    ['aet.later.v1', 'a store this build has never heard of'],
  ]);
}

test('1. no mark: the mark is the first thing written, then the stores as before', () => {
  storage.clear();
  writes.length = 0;
  assert.equal(claimStorage(APP_VERSION), 'write');
  assert.equal(storage.get(NEWEST_KEY), APP_VERSION);
  assert.deepEqual(writes, [NEWEST_KEY]);
  saveSettings({ ...DEFAULT_SETTINGS, altitude_m: 300 });
  assert.equal(storageReadOnly(), false);
  assert.ok(storage.has('aet.settings.v1'));
});

test('2. an older mark is brought up to this build; its own is left as it is', () => {
  storage.clear();
  storage.set(NEWEST_KEY, '0.3.0-alpha.1');
  writes.length = 0;
  assert.equal(claimStorage(APP_VERSION), 'write');
  assert.equal(storage.get(NEWEST_KEY), APP_VERSION);
  writes.length = 0;
  saveSettings({ ...DEFAULT_SETTINGS, altitude_m: 300 });
  assert.deepEqual(writes, ['aet.settings.v1'], 'the mark is not written again');
});

test('3. a newer mark: nothing is written, removed, logged or sent, and the timer\'s reads still work', async () => {
  storage.clear();
  for (const [k, v] of newerStores()) storage.set(k, v);
  const before = new Map(storage);
  writes.length = 0;
  let told = 0;
  assert.equal(claimStorage(APP_VERSION, () => { told += 1; }), 'readOnly');
  assert.equal(storageReadOnly(), true);
  assert.equal(told, 1);

  // Everything a page does from boot to "Start learning again".
  const settings = loadSettings(classes);
  assert.equal(settings.altitude_m, 1200, 'read as before');
  saveSettings({ ...settings, altitude_m: 0, eggCount: 4 });
  rememberTimeToBoil(loadBoilMemory(), 2, 500);
  clearBoilMemory();
  loadCook();
  saveCook({ id_ms: 7 } as never, 'none', 12);
  saveLeanHint(7, 30);
  clearCook(7);
  dropStoredCook();
  loadCalibration();
  const sizeBefore = keptState().log.length;
  assert.equal(logEgg({ v: 1 } as never), -1, 'no egg is written down');
  assert.equal(keptState().log.length, sizeBefore, 'nor learned from');
  const posts: string[] = [];
  loadShare({ log: () => [], finalCount: () => 0, changed: () => undefined },
    { post: async (b) => { posts.push(b); return 200; }, remove: async (u) => { posts.push(u); return 200; } });
  await retryDeletes();
  await setSharing(true);
  await sendFinal();
  clearCalibration();

  assert.deepEqual(writes, [], 'not one write');
  assert.deepEqual(posts, [], 'not one request');
  assert.deepEqual(storage, before, 'every store as the newer build left it');
});

test('3b. the keys no build reads any more are deleted at the claim, after the mark, and nothing else', () => {
  storage.clear();
  for (const key of RETIRED_KEYS) storage.set(key, 'an earlier build\'s');
  storage.set('aet.settings.v1', JSON.stringify(DEFAULT_SETTINGS));
  storage.set('aet.later.v1', 'a store this build has never heard of');
  writes.length = 0;
  assert.equal(claimStorage(APP_VERSION), 'write');
  assert.deepEqual(writes, [NEWEST_KEY, ...RETIRED_KEYS.map((k) => `-${k}`)]);
  assert.deepEqual([...storage.keys()].sort(), ['aet.later.v1', NEWEST_KEY, 'aet.settings.v1'].sort());
  assert.ok(RETIRED_KEYS.includes('aet.calibration.v4'), '0.3\'s log among them (DECISIONS.md 107)');
  // Under a newer build's mark, not one.
  storage.clear();
  for (const key of RETIRED_KEYS) storage.set(key, 'an earlier build\'s');
  storage.set(NEWEST_KEY, '9.0.0');
  writes.length = 0;
  assert.equal(claimStorage(APP_VERSION), 'readOnly');
  assert.deepEqual(writes, []);
  assert.equal(storage.size, RETIRED_KEYS.length + 1);
});

test('4. another tab of a newer build: this page stops writing at its event, or at its next write before it', () => {
  storage.clear();
  claimStorage(APP_VERSION);
  assert.equal(newerStoredElsewhere('aet.settings.v1'), false, 'not the mark');
  storage.set(NEWEST_KEY, '9.0.0');
  assert.equal(newerStoredElsewhere(NEWEST_KEY), true);
  assert.equal(storageReadOnly(), true);
  writes.length = 0;
  saveSettings({ ...DEFAULT_SETTINGS, altitude_m: 10 });
  assert.deepEqual(writes, []);

  // The event not yet here: the next write finds the mark first.
  storage.clear();
  let told = 0;
  claimStorage(APP_VERSION, () => { told += 1; });
  storage.set(NEWEST_KEY, '9.0.0');
  writes.length = 0;
  saveSettings({ ...DEFAULT_SETTINGS, altitude_m: 20 });
  assert.deepEqual(writes, []);
  assert.equal(storageReadOnly(), true);
  assert.equal(told, 1);
  assert.equal(newerStoredElsewhere(NEWEST_KEY), false, 'told once');

  // A tab that cleared the storage: this build marks it again before it writes.
  storage.clear();
  claimStorage(APP_VERSION);
  storage.clear();
  assert.equal(newerStoredElsewhere(null), false);
  writes.length = 0;
  saveSettings({ ...DEFAULT_SETTINGS, altitude_m: 30 });
  assert.deepEqual(writes, [NEWEST_KEY, 'aet.settings.v1']);
});
