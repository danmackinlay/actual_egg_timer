/**
 * Tabs: one owns the app, a second waits and can take it over, and the first
 * then falls silent. Run by tools/e2e.ts.
 */

import { type Scenario, check } from '../harness.ts';
import {
  DUMP, STOPPED, boil, deadlines, near, opened, pick, rings, scheduledAhead, start,
} from './helpers.ts';

export const tabScenarios: Record<string, Scenario> = {
  'one-tab-waits': {
    what: 'a second tab says the app is open in another: it writes nothing and arms no alarm while a cook runs in the first',
    run: async (h) => {
      const a = await h.ctx.open(STOPPED);
      await start(a, 'hot');
      await a.until('__snap().decided', 'A planned');
      await a.settle();
      const before = await a.eval<string>(DUMP);
      const b = await opened(h, `${STOPPED}&at=${new Date(await a.now()).toISOString()}`);
      const shown = await b.eval<{ note: string; want: string; button: string; main: boolean }>(`(() => ({
        note: document.querySelector('#tabNote p').textContent, want: aetTest.t('tab.note'),
        button: document.getElementById('useHere').textContent,
        main: document.querySelector('main').offsetHeight > 0 }))()`);
      check(shown.note === shown.want && shown.note !== '' && shown.button !== '' && !shown.main,
        `the note alone: ${JSON.stringify(shown)}`);
      // Time passes in B, past A's pull: still nothing.
      await b.eval(`window.aetClock.shift(900)`);
      await b.look();
      await b.eval('new Promise((r) => setTimeout(r, 500))');
      check((await b.writes()).length === 0, `B wrote ${(await b.writes()).map((w) => w.key).join(', ')}`);
      check((await b.eval<string>(DUMP)) === before, 'every store as A left it');
      const sound = await b.eval<{ contexts: number; osc: number }>('({ contexts: __audio.length, osc: __osc.length })');
      check(sound.contexts === 0 && sound.osc === 0, `B made no sound: ${JSON.stringify(sound)}`);
      check(b.requests().every((r) => !r.url.includes('/api/')), 'B asked the server nothing');
      check((await a.snap()).phase === 'COOKING', 'A cooks on');
      return `B shows "${shown.note.slice(0, 32)}…" and "${shown.button}": 0 writes, no audio context, the stores as A left them`;
    },
  },

  'one-tab-takeover': {
    what: 'pressing the second tab\'s button moves a running cook to it: the same pull, its alarm armed, no note of an alarm lost',
    run: async (h) => {
      const a = await h.ctx.open(STOPPED);
      await start(a, 'cold');
      await a.shift(240);
      let sa = await boil(a);
      await a.shift(60);
      await a.settle();
      sa = await a.snap();
      const pull_s = deadlines(sa).cookEnd_s;
      const b = await opened(h, `${STOPPED}&at=${new Date(await a.now()).toISOString()}`);
      await b.click('#useHere');
      await b.until("document.body.dataset.tab === 'owner' && window.aetTest !== undefined", 'B owns the app');
      await b.until('__snap().decided', 'B planned');
      let sb = await b.phase('COOKING');
      check(sb.cook?.id_ms === sa.cook?.id_ms, 'the same cook');
      check(JSON.stringify(sb.cook?.events) === JSON.stringify(sa.cook?.events), 'what A saw in the pan, kept');
      check(near(deadlines(sb).cookEnd_s, pull_s, 1e-6), `the pull ${deadlines(sb).cookEnd_s} was ${pull_s}`);
      const ahead = (await b.osc()).filter(scheduledAhead);
      check(ahead.length === 1, `B's alarm armed ahead: ${ahead.length}`);
      const lost = await b.eval<boolean>("document.body.innerText.includes(aetTest.t('readout.restored'))");
      check(!lost, 'no note that the alarm was lost');
      // At the pull, B rings.
      const osc0 = (await b.osc()).length;
      await b.shiftTo(pull_s + 2);
      sb = await b.phase('PULL');
      const rang = rings((await b.osc()).slice(osc0));
      check(rang.length === 1, `B rang the pull: ${rang.length}`);
      await a.until("document.body.dataset.tab === 'waiting'", 'A waits');
      return `cook ${sb.cook?.id_ms} moved to B at the same pull; a ring ahead, no lost-alarm note; rung at the pull`;
    },
  },

  'one-tab-silent': {
    what: 'the tab the app was taken from falls silent: its audio closed, and nothing rung or written as its timers come round',
    run: async (h) => {
      const a = await h.ctx.open(STOPPED);
      await start(a, 'hot');
      await a.until('__snap().decided', 'A planned');
      // A correction in hand when the app is taken: its settle would write.
      await pick(a, '#size', '3');
      const sa = await a.snap();
      check((await a.osc()).some(scheduledAhead), 'A\'s alarm armed ahead');
      const b = await opened(h, `${STOPPED}&at=${new Date(await a.now()).toISOString()}`);
      await b.click('#useHere');
      await a.until("document.body.dataset.tab === 'waiting' && !document.getElementById('tabNote').hidden", 'A waits');
      await b.until("document.body.dataset.tab === 'owner' && window.aetTest !== undefined", 'B owns the app');
      const closed = await a.eval<string[]>('__audio.map((c) => c.state)');
      check(closed.length > 0 && closed.every((state) => state === 'closed'), `A's audio: ${closed.join(', ')}`);
      const writes0 = (await a.writes()).length;
      const osc0 = (await a.osc()).length;
      // A's clock past the pull and past the cooling; A looked at, its
      // settle and its ticks come round.
      const d = deadlines(sa);
      for (const at of [d.cookEnd_s + 2, d.cookEnd_s + 30, d.coolEnd_s + 5, d.cookEnd_s + 7200]) {
        await a.shiftTo(at);
        await a.eval("document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow'))");
      }
      await a.eval('new Promise((r) => setTimeout(r, 2500))');
      const wrote = (await a.writes()).slice(writes0);
      check(wrote.length === 0, `A wrote ${wrote.map((w) => w.key).join(', ')}`);
      check((await a.osc()).length === osc0, `A made ${(await a.osc()).length - osc0} sounds`);
      check(await a.eval<boolean>("document.querySelector('main').offsetHeight === 0"), 'A shows the note alone');
      return `A: ${closed.length} audio context closed; past the pull, the cooling and two hours: 0 writes, 0 sounds`;
    },
  },

};
