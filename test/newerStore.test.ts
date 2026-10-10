/**
 * The web's guard against an older build writing over a newer one's stores
 * (src/ui/store.ts, `claimStorage`): with a newer build's
 * mark in storage, the store layer writes nothing at all - the settings, the
 * pans, the cook, the log, the sharing state - sends nothing, and deletes
 * none of the keys it does not keep. With none, or an older one, the mark
 * is brought up to this build before anything else is written, and then
 * every key of the app's that is not in the table of stores
 * (src/core/stores.ts) is deleted.
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
  DEFAULT_SETTINGS, claimStorage, newerStoredElsewhere, openCooks, openPans, openSettings, storageReadOnly,
} from '../src/ui/store.js';
import { openLearner } from '../src/ui/calibration.js';
import { APP_VERSION } from '../src/ui/version.js';
import { openSharing } from '../src/ui/share.js';
import { sendTo } from '../src/ui/send.js';
import { STORES, STORE_LIST, stamped } from '../src/core/stores.js';

/** How many times the page was told its stores are left alone. */
let told = 0;
sendTo((msg) => { if (msg.kind === 'stores') told += 1; });

/** localStorage, in memory, with every write in order. */
const storage = new Map<string, string>();
const writes: string[] = [];
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { writes.push(k); storage.set(k, v); },
    removeItem: (k: string) => { writes.push(`-${k}`); storage.delete(k); },
    get length() { return storage.size; },
    key: (i: number) => [...storage.keys()][i] ?? null,
  },
};

const NEWEST_KEY = STORES.newest.web;
const SETTINGS = STORES.settings.web;
const GONE = '0b5e6c1e-1a2b-4c3d-8e9f-0123456789ab';
const classes = sizeClassesFor('eu');
/** The page's stores, as boot() opens them. */
const settings = openSettings(classes);
const pans = openPans();
const cooks = openCooks();

/** What a newer build left: every store this build knows, in shapes it may
 *  or may not read, and two it does not know of. */
function newerStores(): Map<string, string> {
  return new Map([
    [NEWEST_KEY, '9.0.0'],
    [SETTINGS, JSON.stringify(stamped(STORES.settings, { ...DEFAULT_SETTINGS, altitude_m: 1200, addedLater: true }))],
    [STORES.boilMemory.web, JSON.stringify(stamped(STORES.boilMemory, { pans: { '2': 420 } }))],
    [STORES.cook.web, JSON.stringify({ v: 7, cook: { id_ms: 7, later: 1 }, answers: 'none', leanHint_s: 0 })],
    ['aet.settings.v1', JSON.stringify({ ...DEFAULT_SETTINGS, altitude_m: 600 })],
    ['aet.cook.v5', JSON.stringify({ cook: { id_ms: 7, later: 1 }, answers: 'none', leanHint_s: 0 })],
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
  settings.save({ ...DEFAULT_SETTINGS, altitude_m: 300 });
  assert.equal(storageReadOnly(), false);
  assert.ok(storage.has(SETTINGS));
});

test('2. an older mark is brought up to this build; its own is left as it is', () => {
  storage.clear();
  storage.set(NEWEST_KEY, '0.3.0-alpha.1');
  writes.length = 0;
  assert.equal(claimStorage(APP_VERSION), 'write');
  assert.equal(storage.get(NEWEST_KEY), APP_VERSION);
  writes.length = 0;
  settings.save({ ...DEFAULT_SETTINGS, altitude_m: 300 });
  assert.deepEqual(writes, [SETTINGS], 'the mark is not written again');
});

test('3. a newer mark: nothing is written, removed, logged or sent, and the timer\'s reads still work', async () => {
  storage.clear();
  for (const [k, v] of newerStores()) storage.set(k, v);
  const before = new Map(storage);
  writes.length = 0;
  told = 0;
  assert.equal(claimStorage(APP_VERSION), 'readOnly');
  assert.equal(storageReadOnly(), true);
  assert.equal(told, 1);

  // Everything a page does from boot to "Start learning again".
  const loaded = settings.load();
  assert.equal(loaded.altitude_m, 1200, 'read as before');
  settings.save({ ...loaded, altitude_m: 0, eggCount: 4 });
  pans.remember(pans.load(), 2, 500);
  pans.clear();
  cooks.peek();
  cooks.save({ id_ms: 7 } as never, 'none', 12);
  cooks.saveLeanHint(7, 30);
  cooks.clear(7);
  cooks.remove();
  const learner = openLearner();
  const sizeBefore = learner.keptState().log.length;
  assert.equal(learner.logEgg({ v: 1 } as never), -1, 'no egg is written down');
  assert.equal(learner.keptState().log.length, sizeBefore, 'nor learned from');
  const posts: string[] = [];
  const sharing = openSharing({ log: () => [], finalCount: () => 0 },
    { post: async (b) => { posts.push(b); return 200; }, remove: async (u) => { posts.push(u); return 200; } });
  await sharing.retryDeletes();
  await sharing.setSharing(true);
  await sharing.sendFinal();
  learner.clear();

  assert.deepEqual(writes, [], 'not one write');
  assert.deepEqual(posts, [], 'not one request');
  assert.deepEqual(storage, before, 'every store as the newer build left it');
});

/** Keys earlier builds wrote and this one does not keep: 0.3's log and
 *  cook, 0.4's copies kept aside, and the keys of 0.5 before the table of
 *  stores, with formats in them. */
const EARLIER = [
  'aet.calibration.v1', 'aet.calibration.v4', 'aet.calibration.v4.unread', 'aet.cook.v2', 'aet.cook.unread',
  'aet.cook.v5', 'aet.settings.v1', 'aet.boil.v1', 'aet.later.v1',
];
/** Every key this build keeps. */
const KEPT = STORE_LIST.flatMap((s) => (s.web === null ? [] : [s.web]));

test('3b. a key of an earlier build is deleted at the claim, after the mark; every key this build keeps, and any other app\'s, stays', () => {
  storage.clear();
  for (const key of [...EARLIER, ...KEPT, 'other.app']) storage.set(key, 'a value');
  storage.delete(NEWEST_KEY);
  writes.length = 0;
  assert.equal(claimStorage(APP_VERSION), 'write');
  assert.deepEqual(writes, [NEWEST_KEY, ...EARLIER.map((k) => `-${k}`)]);
  assert.deepEqual([...storage.keys()].sort(), [...KEPT, 'other.app'].sort());
});

test('3c. a build the guard has made read-only deletes nothing', () => {
  storage.clear();
  for (const key of [...EARLIER, ...KEPT]) storage.set(key, 'a value');
  storage.set(NEWEST_KEY, '9.0.0');
  const before = new Map(storage);
  writes.length = 0;
  assert.equal(claimStorage(APP_VERSION), 'readOnly');
  assert.deepEqual(writes, []);
  assert.deepEqual(storage, before);
});

test('4. another tab of a newer build: this page stops writing at its event, or at its next write before it', () => {
  storage.clear();
  claimStorage(APP_VERSION);
  assert.equal(newerStoredElsewhere(SETTINGS), false, 'not the mark');
  storage.set(NEWEST_KEY, '9.0.0');
  assert.equal(newerStoredElsewhere(NEWEST_KEY), true);
  assert.equal(storageReadOnly(), true);
  writes.length = 0;
  settings.save({ ...DEFAULT_SETTINGS, altitude_m: 10 });
  assert.deepEqual(writes, []);

  // The event not yet here: the next write finds the mark first.
  storage.clear();
  told = 0;
  claimStorage(APP_VERSION);
  storage.set(NEWEST_KEY, '9.0.0');
  writes.length = 0;
  settings.save({ ...DEFAULT_SETTINGS, altitude_m: 20 });
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
  settings.save({ ...DEFAULT_SETTINGS, altitude_m: 30 });
  assert.deepEqual(writes, [NEWEST_KEY, SETTINGS]);
});
