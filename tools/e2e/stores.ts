/**
 * The stores and the build: the development tools only on this machine, stores
 * this build cannot read, old keys swept, and a newer build's mark. Run by
 * tools/e2e.ts.
 */

import { STORES } from '../../src/ui/stores.ts';
import { type Scenario, check } from '../harness.ts';
import { COOK_KEY, NEWEST_KEY, SETTINGS_KEY, STOPPED, deadlines, pick, start } from './helpers.ts';

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
      // too, as before one tab owned it (owner.ts).
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
    what: 'every key of the app\'s this build does not keep, 0.3\'s log among them, is deleted at boot; under a newer build\'s mark, not one',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      const old = ['aet.calibration.v3', 'aet.calibration.v4', 'aet.calibration.v4.unread', 'aet.cook.unread',
        'aet.cook.v1', 'aet.cook.v2', 'aet.cook.v5', 'aet.settings.v1', 'aet.boil.v1', 'aet.never.written'];
      const plant = `for (const k of ${JSON.stringify(old)}) localStorage.setItem(k, '{"v":4,"log":[]}')`;
      const keys = 'Object.keys(localStorage).sort()';
      await tab.eval(plant);
      await tab.reload();
      await tab.settle();
      const left = await tab.eval<string[]>(keys);
      check(old.every((k) => !left.includes(k)), `each deleted: ${left.join(', ')}`);
      check(left.includes(STORES.calibration.key) && left.includes(NEWEST_KEY), `this build's stores kept: ${left.join(', ')}`);
      await tab.eval(`localStorage.setItem('${NEWEST_KEY}', '9.0.0'); ${plant}`);
      await tab.reload();
      await tab.settle();
      const kept = await tab.eval<string[]>(keys);
      check(old.every((k) => kept.includes(k)), `under a newer mark, each kept: ${kept.join(', ')}`);
      return `${old.length} deleted at boot; under 9.0.0, ${old.length} kept`;
    },
  },

  'newer-version': {
    what: 'a newer build\'s mark: the line shown, an egg timed to Done and started again, and not one write or request',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      // What a newer build left: its mark, the settings with a field this
      // build does not know, a store it never heard of, and a deletion
      // still to ask for, which this build would send at once.
      await tab.eval(`(() => {
        localStorage.setItem('${NEWEST_KEY}', '9.0.0');
        const s = JSON.parse(localStorage.getItem('${SETTINGS_KEY}') ?? '{}');
        localStorage.setItem('${SETTINGS_KEY}', JSON.stringify({ ...s, addedLater: true }));
        localStorage.setItem('aet.later.v1', 'a newer store');
        localStorage.setItem('aet.calibration.v4', 'a key this build would sweep');
        localStorage.setItem('${STORES.share.key}', JSON.stringify({ on: false, uid: null,
          uids: ['0b5e6c1e-1a2b-4c3d-8e9f-0123456789ab'], deleting: ['0b5e6c1e-1a2b-4c3d-8e9f-0123456789ab'] }));
      })()`);
      const dump = 'JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]))';
      const before = await tab.eval<string>(dump);
      await tab.reload();
      await tab.settle();
      const line = await tab.eval<{ shown: boolean; text: string; want: string }>(`(async () => {
        const el = document.getElementById('newerNote');
        return { shown: !el.hidden && el.offsetHeight > 0, text: el.textContent,
          want: aetTest.t('newer.note') };
      })()`);
      check(line.shown && line.text === line.want && line.text !== '', `the line: ${JSON.stringify(line)}`);
      // The timer still works, to Done; no questions; Start again.
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      s = await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      s = await tab.phase('DONE');
      check(!s.feedback, 'no questions after the egg');
      await tab.click('#primary');
      await tab.phase('IDLE');
      await pick(tab, '#size', '3');
      await tab.settle();
      const writes = await tab.writes();
      check(writes.length === 0, `not one write: ${writes.map((w) => w.key).join(', ')}`);
      check((await tab.eval<string>(dump)) === before, 'every store as the newer build left it');
      check((await tab.sends()) === 0, `nothing sent: ${await tab.sends()} requests`);
      check((await tab.snap()).log.length === 0, 'no egg logged');
      return `"${line.text.slice(0, 40)}…" shown; Done and Start again, a setting changed: 0 writes, 0 requests`;
    },
  },
};
