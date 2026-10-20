/**
 * The page's effects that are not the cook's (src/ui/effects.ts), against a
 * page's own stores over storage in memory: which eggs are still open, so not
 * yet final for sharing.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { sizeClassesFor } from '../src/core/geometry.ts';
import { appendEntry, replan, startCook } from '../src/core/running.ts';
import type { Stores } from '../src/ui/cook.ts';
import { finalEggs } from '../src/ui/effects.ts';
import { useClock } from '../src/ui/now.ts';
import { NO_NEED, choicesOf, emptyModel } from '../src/ui/state.ts';
import { DEFAULT_SETTINGS, openCooks, openPans, openSettings } from '../src/ui/store.ts';
import { knowing } from '../tools/common.ts';

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
useClock({ now: () => now_ms, speed: () => 1 });

const C = knowing({ particles: 200, eggsLogged: 3, taste: 0.1 });
const IDS = [S * 1000 - 7_200_000, S * 1000 - 3_600_000, S * 1000];

/** Stores with a log of three eggs, the last of them started at S: the
 *  settings, the pans and the cook as a page opens them; the log and sharing
 *  as far as these tests read them. */
function stores(): Stores {
  const log = IDS.map((id) => ({ id: id }));
  return {
    settings: openSettings(sizeClassesFor('eu')), pans: openPans(), cooks: openCooks(),
    learner: { keptState: () => ({ log: log }) },
    sharing: {},
  } as unknown as Stores;
}

test('the eggs still open are the cooks the page holds: the one on screen, logged, until it is too old, and one ended to be logged again', () => {
  storage.clear();
  now_ms = S * 1000 + 60_000;
  const s = stores();
  const idle = { ...emptyModel(), settings: { ...DEFAULT_SETTINGS }, calib: C };
  assert.equal(finalEggs(s, idle), 3, 'no cook: every egg final');
  const choices = choicesOf({ ...DEFAULT_SETTINGS, startMode: 'hot' }, 'GB');
  const cook = startCook(S, choices, 0, { '2.0': 480 }, 'metric', 'en');
  const plan = replan(cook, C, null, 0, S);
  assert.equal(finalEggs(s, { ...idle, cook: cook, plan: plan }), 3, 'on screen, not yet logged: none of it in the log');
  const logged = appendEntry(cook, { kind: 'logged', at_s: S + 30 });
  assert.equal(finalEggs(s, { ...idle, cook: logged, plan: plan }), 2, 'logged and on screen: open');
  // An earlier egg open, and every egg after it with it.
  assert.equal(finalEggs(s, { ...idle, cook: { ...logged, id_ms: IDS[1] }, plan: plan }), 1);
  // Ended, waiting to be logged again, beside the next cook, whatever is
  // stored: open.
  const next = startCook(S + 60, choices, 0, { '2.0': 480 }, 'metric', 'en');
  s.cooks.save(next, 'none', 0);
  const ended = appendEntry(logged, { kind: 'ended', at_s: S + 40 });
  const beside = {
    ...idle, cook: next, plan: replan(next, C, null, 0, S + 60),
    ending: [{ cook: ended, plan: plan, leanHint_s: 0, need: NO_NEED }],
  };
  assert.equal(finalEggs(s, beside), 2, 'the ended one\'s egg is open, the next cook stored');
  // Too old to pick back up: final.
  now_ms = S * 1000 + 12 * 3_600_000;
  assert.equal(finalEggs(s, { ...idle, cook: logged, plan: plan }), 3);
});
