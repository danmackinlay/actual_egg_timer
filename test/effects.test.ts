/**
 * The page's effects that are not the cook's (src/ui/effects.ts), against a
 * page's own stores over storage in memory: which egg is still open, so not
 * yet final for sharing, and another tab's writes taken up as messages.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { STORES } from '../src/core/stores.js';

import { sizeClassesFor } from '../src/core/geometry.js';
import { startCook } from '../src/core/running.js';
import { Stores, performStored } from '../src/ui/cook.js';
import { finalEggs, storedElsewhere } from '../src/ui/effects.js';
import { Msg, update } from '../src/ui/model.js';
import { useClock } from '../src/ui/now.js';
import { sendTo } from '../src/ui/send.js';
import { choicesOf, emptyModel } from '../src/ui/state.js';
import { DEFAULT_SETTINGS, openCooks, openPans, openSettings } from '../src/ui/store.js';
import { knowing } from '../tools/common.js';

const storage = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); },
    removeItem: (k: string) => { storage.delete(k); },
  },
};

const S = 1791363600;
let now_ms = S * 1000;
useClock({ now: () => now_ms, speed: () => 1, used: () => false, forget: () => undefined, mark: () => undefined });

const C = knowing({ particles: 200, eggsLogged: 3, taste: 0.1 });
const IDS = [S * 1000 - 7_200_000, S * 1000 - 3_600_000, S * 1000];

/** Stores with a log of three eggs, the last of them started at S: the
 *  settings, the pans and the cook as a page opens them; the log and sharing
 *  as far as these tests read them. */
function stores(): Stores {
  const log = IDS.map((id) => ({ id: id }));
  return {
    settings: openSettings(sizeClassesFor('eu')), pans: openPans(), cooks: openCooks(),
    learner: { keptState: () => ({ log: log }), storedElsewhere: () => false },
    sharing: { storedElsewhere: () => false },
  } as unknown as Stores;
}

test('the egg still open is the stored running cook\'s, whichever tab wrote it, until it is too old', () => {
  storage.clear();
  now_ms = S * 1000 + 60_000;
  const s = stores();
  const m = { ...emptyModel(), settings: { ...DEFAULT_SETTINGS }, controls: { ...DEFAULT_SETTINGS }, calib: C };
  assert.equal(finalEggs(s, m), 3, 'no cook stored: every egg final');
  // Another tab's cook, the log's last egg: not this page's, which is idle.
  const cook = startCook(S, choicesOf({ ...DEFAULT_SETTINGS, startMode: 'hot' }, 'GB'), 0, { '2.0': 480 }, 'metric', 'en');
  s.cooks.save(cook, 'none', 0);
  assert.equal(finalEggs(s, m), 2, 'the stored cook\'s egg is open, even though another tab runs it');
  // An earlier egg stored is open, and every egg after it with it.
  s.cooks.save({ ...cook, id_ms: IDS[1] }, 'none', 0);
  assert.equal(finalEggs(s, m), 1);
  // Too old to pick back up: final.
  now_ms = S * 1000 + 12 * 3_600_000;
  s.cooks.save(cook, 'none', 0);
  assert.equal(finalEggs(s, m), 3);
});

test('everything forgotten in another tab is not undone by this tab\'s next measured boil', () => {
  storage.clear();
  const s = stores();
  let m = { ...emptyModel(), settings: { ...DEFAULT_SETTINGS }, controls: { ...DEFAULT_SETTINGS }, calib: C, boilMemory: s.pans.load() };
  const sent: Msg[] = [];
  sendTo((msg) => sent.push(msg));
  const take = (): void => {
    for (const msg of sent.splice(0)) m = update(m, msg, now_ms)[0];
  };
  // A boil measured here.
  performStored({ kind: 'rememberBoil', boil: { litres: 2, seconds: 600 } }, s, m.boilMemory, (msg) => sent.push(msg));
  take();
  assert.deepEqual(Object.keys(m.boilMemory), ['2.0']);
  // Another tab forgets everything, and this page hears of it.
  storage.delete(STORES.boilMemory.web);
  storedElsewhere(s, STORES.boilMemory.web, m.settings);
  take();
  assert.deepEqual(m.boilMemory, {}, 'taken up');
  // The next boil measured here: only it is kept.
  performStored({ kind: 'rememberBoil', boil: { litres: 1.5, seconds: 420 } }, s, m.boilMemory, (msg) => sent.push(msg));
  take();
  assert.deepEqual(Object.keys((JSON.parse(storage.get(STORES.boilMemory.web) ?? '{}') as { pans: object }).pans), ['1.5']);
  assert.deepEqual(Object.keys(m.boilMemory), ['1.5']);
  sendTo(() => undefined);
});
