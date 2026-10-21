/**
 * The stores and the build: the development tools only on this machine, stores
 * this build cannot read, and old keys swept. Run by tools/e2e.ts.
 */

import { STORES } from '../../src/ui/stores.ts';
import { type Scenario, check } from '../harness.ts';
import { COOK_KEY, STOPPED } from './helpers.ts';

export const storeScenarios: Record<string, Scenario> = {
  'inert-off-localhost': {
    what: 'the development clock is off on any host but this machine',
    run: async (h) => {
      // Off this machine the development tools are not even asked for: the
      // page is the shipped one.
      const away = await h.ctx.open('/?clock=60&at=+1h', `http://eggs.test:${h.port}`);
      const a = await away.eval<{ mark: boolean; handles: boolean; search: string }>(`(() => ({
        mark: document.getElementById('devClock') !== null, handles: 'aetClock' in window || 'aetTest' in window,
        search: location.search }))()`);
      check(!a.mark && !a.handles, `eggs.test: ${JSON.stringify(a)}`);
      check(a.search === '?clock=60&at=+1h', 'the address left alone off this machine');
      const asked = away.requests().filter((r) => r.url.includes('/bundle/dev-'));
      check(asked.length === 0, `eggs.test asked for ${asked.map((r) => r.url).join(', ')}`);
      // No Web Locks there (an insecure context): a second tab runs the app
      // too (owner.ts).
      const second = await h.ctx.open('/', `http://eggs.test:${h.port}`);
      for (const tab of [away, second]) {
        const owns = await tab.eval<{ locks: boolean; tab: string | undefined }>(
          "({ locks: 'locks' in navigator, tab: document.body.dataset.tab })");
        check(!owns.locks && owns.tab === 'owner', `eggs.test without Web Locks: ${JSON.stringify(owns)}`);
      }
      const home = await h.ctx.open('/?clock=60&at=+1h');
      const b = await home.eval<{ mark: string | null; skew: number; search: string }>(`(() => ({
        mark: document.getElementById('devClock')?.textContent ?? null,
        skew: window.aetTest.snapshot().now_ms - Date.now(), search: location.search }))()`);
      check(b.mark !== null && b.skew > 3_590_000 && b.search === '', `127.0.0.1: ${JSON.stringify(b)}`);
      return `eggs.test: no development tools asked for, no mark, no handle, two tabs running; 127.0.0.1: mark "${b.mark}"`;
    },
  },

  'unreadable-stores': {
    what: 'a cook and a results log this build cannot read: dropped, the page idle on the prior, nothing kept aside',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await tab.eval(`localStorage.setItem('${COOK_KEY}', '{"v":${STORES.cook.format},"cook":{"id_ms":1},"answers":"none"}');
        localStorage.setItem('${STORES.calibration.key}', '{damaged')`);
      await tab.reload();
      await tab.settle();
      const s = await tab.snap();
      check(s.phase === 'IDLE' && s.stored === null, 'idle, the cook dropped');
      check(s.log.length === 0, 'no egg');
      const text = await tab.storage(STORES.calibration.key);
      const store = text === null ? null : JSON.parse(text) as { v: number; log: unknown[] };
      check(store !== null && store.v === 5 && store.log.length === 0, `the log written again, empty: ${text?.slice(0, 40)}`);
      const keys = await tab.eval<string[]>('Object.keys(localStorage).sort()');
      check(!keys.some((k) => k.endsWith('.unread')), `nothing kept aside: ${keys.join(', ')}`);
      return `dropped; ${keys.join(', ')}`;
    },
  },

  'retired-keys': {
    what: 'every key of the app\'s this build does not keep, 0.3\'s log among them, is deleted at boot',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      const old = ['aet.calibration.v3', 'aet.calibration.v4', 'aet.calibration.v4.unread', 'aet.cook.unread',
        'aet.cook.v1', 'aet.cook.v2', 'aet.cook.v5', 'aet.settings.v1', 'aet.boil.v1', 'aet.newest', 'aet.devClock.used',
        'aet.never.written'];
      const plant = `for (const k of ${JSON.stringify(old)}) localStorage.setItem(k, '{"v":4,"log":[]}')`;
      const keys = 'Object.keys(localStorage).sort()';
      await tab.eval(plant);
      await tab.reload();
      await tab.settle();
      const left = await tab.eval<string[]>(keys);
      check(old.every((k) => !left.includes(k)), `each deleted: ${left.join(', ')}`);
      check(left.includes(STORES.calibration.key), `this build's stores kept: ${left.join(', ')}`);
      return `${old.length} deleted at boot`;
    },
  },

};
