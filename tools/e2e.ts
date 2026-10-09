/**
 * The web app driven end to end, in seconds: the checks that were done by
 * hand (design/running-cook-review.md, the LOGBOOK of 6 to 8 October), each
 * a named scenario with assertions on the page and on what it stored, and
 * the copy capture's states (tools/copyScenarios.ts), each a scenario too.
 *
 *   npm run e2e                      # build the site, then every scenario
 *   npm run e2e -- reload two-tabs   # only those named (after a build)
 *   npm run e2e -- copy/             # those whose names start so
 *   npm run e2e -- --tree <dir>      # another checkout's build (harness.ts)
 *   node dist/tools/e2e.js --list
 *
 * The harness is tools/harness.ts: the site served, Chrome, a context per
 * scenario, and the page read through its test API (`window.aetTest`,
 * src/ui/dev/test.ts), never by importing the app's modules.
 *
 * Time is the development clock, stopped (`?clock=0`): a scenario steps it
 * to the moment it means (`aetClock.shift`, `.set`), tells the page to look
 * again with a `focus` event, as a tab coming back does, and asserts. So
 * what it sees does not depend on how fast the machine is: a step past the
 * pull lands where it was aimed whether the page took a millisecond or a
 * second to get there. The one span run is the last second before a pull at
 * the real clock's speed, to see the ring scheduled ahead sound as the tick
 * reaches the pull; the 20-s grace after it is that span's margin for a slow
 * machine. The timers that are a person's, not the cook's (a control's
 * settle, a held key), stay real: a scenario waits for the page to have
 * nothing in hand (`aetTest.whenIdle`: no such timer, no worker job, no
 * request) rather than for a fixed time. Sharing is checked on the real
 * clock, with the stored cook moved into the past, since nothing is sent
 * while the development clock is on.
 *
 * The alarm is checked by what was scheduled on the audio clock and for
 * when, never by waiting for it to play.
 */

import { sleep } from './chrome.js';
import { copyScenarios } from './copyScenarios.js';
import {
  Cook, Failure, Harness, Osc, Rec, Scenario, Snap, Tab, WAIT_MS, check, labelSays, runScenarios, treeArg,
} from './harness.js';

/** Every page but those checking the address or sharing: the clock stopped. */
const STOPPED = '/?clock=0';

/** The rings among sounds made. */
const rings = (os: Osc[]): Osc[] => os.filter((o) => o.kind === 'ring');

/** The alarm's ring scheduled ahead, not rung now (nor a blip). */
const scheduledAhead = (o: Osc): boolean => o.kind === 'ring' && o.at !== null && o.at - o.made > 1;

/* ------------------------------------------------------------- the cook */

const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

/** Start a cook from idle, once the time on screen is decided. */
async function start(tab: Tab, mode: 'cold' | 'hot'): Promise<Snap> {
  if (mode === 'hot') {
    await tab.click('#startHot');
    await tab.until("__snap().settings.startMode === 'hot'", 'a hot start chosen');
  }
  await tab.until("__snap().chosen !== null", 'the time decided');
  await tab.click('#primary');
  return tab.phase(mode === 'cold' ? 'HEATING' : 'COOKING');
}

/** Full rolling boil, tapped, and the measured pot's time decided. */
async function boil(tab: Tab): Promise<Snap> {
  await tab.click('#primary');
  await tab.phase('COOKING');
  await tab.until('__snap().decided', 'the measured pot planned');
  return tab.snap();
}

function deadlines(s: Snap): { cookEnd_s: number; coolEnd_s: number } {
  check(s.deadlines !== null, 'a plan');
  const d = s.deadlines as NonNullable<Snap['deadlines']>;
  return { cookEnd_s: d.cookEnd_s, coolEnd_s: d.coolEnd_s ?? NaN };
}

/** What the one screen shows: whether each of its parts is on screen, where
 *  the slider, the sentence and the egg are, and the slider's value. */
interface Layout {
  shown: { id: string; visible: boolean }[];
  top: Record<'doneness' | 'sentence' | 'eggSection', number>;
  level: string;
}

async function layout(tab: Tab): Promise<Layout> {
  return tab.eval<Layout>(`(() => {
    const on = (id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect();
      return { id: id, visible: r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' }; };
    const top = (id) => document.getElementById(id).getBoundingClientRect().top + window.scrollY;
    return {
      shown: ['readout', 'digits', 'doneness', 'donenessPeak', 'sentence', 'eggSection', 'actions'].map(on),
      top: { doneness: top('doneness'), sentence: top('sentence'), eggSection: top('eggSection') },
      level: document.getElementById('doneness').value,
    };
  })()`);
}

/** The slider moved to `level` as a finger does: pressed, moved, and (unless
 *  `release` is false) let go. */
async function setSlider(tab: Tab, level: number, release = true): Promise<void> {
  await tab.eval(`(() => { const e = document.getElementById('doneness');
    e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, isPrimary: true }));
    e.value = String(${level}); e.dispatchEvent(new Event('input', { bubbles: true }));
    if (${release}) {
      e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, isPrimary: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    } })()`);
}

/** The slider dragged through `levels` as a finger does: pressed (unless
 *  `press` is false, the finger already down), moved, and let go if
 *  `release`. */
async function drag(tab: Tab, levels: number[], release = false, press = true): Promise<void> {
  await tab.eval(`(() => { const e = document.getElementById('doneness');
    const p = (type) => e.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, isPrimary: true }));
    if (${press}) p('pointerdown');
    for (const v of ${JSON.stringify(levels)}) { e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); }
    if (${release}) { p('pointerup'); e.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
}

/** A − or + tapped, not held: pressed and let go at once. */
async function press(tab: Tab, selector: string): Promise<void> {
  await tab.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)});
    const p = (type) => e.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, isPrimary: true }));
    p('pointerdown'); p('pointerup'); })()`);
}

/** A menu's option chosen, as a tap does (no finger held: it settles). */
async function pick(tab: Tab, selector: string, value: string): Promise<void> {
  await tab.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)});
    e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}

/** Wait for a correction to be committed and planned: the stored cook's
 *  `correctedAt_s` moved on from the last commit's (`after`, its snap; null
 *  for the cook's first). A cook's corrections are a person's taps apart, so
 *  each has its own stamp, which the record's remaking keys on: on a stopped
 *  clock, step it between them (`later`). */
async function corrected(tab: Tab, after: Snap | null, ms = WAIT_MS): Promise<Snap> {
  const was = after === null ? null : storedCook(after)?.correctedAt_s ?? null;
  if (was !== null && was === (await tab.now()) / 1000) {
    throw new Failure('two corrections at one moment: no cook makes them; step the clock between them');
  }
  await tab.until(`await (async () => { const s = __snap(); const c = s.stored === null ? null : JSON.parse(s.stored).cook;
    return c !== null && c.correctedAt_s !== ${JSON.stringify(was)} && s.cook.correctedAt_s === c.correctedAt_s; })()`,
  'a correction committed', ms);
  return tab.snap();
}

/** What the start's panel says the eggs went in at. */
async function panelStart(tab: Tab): Promise<string> {
  return tab.eval<string>(`(() => { const f = document.getElementById('startedAtField');
    return f.hidden || f.offsetParent === null ? '' : document.getElementById('startedAt').textContent; })()`);
}

/** A moment, epoch s, as the page says a time of day. */
async function clockAt(tab: Tab, at_s: number): Promise<string> {
  return tab.timeOfDay(at_s * 1000);
}

/** The setup sentence's words, and its start clause's. */
async function sentenceSays(tab: Tab): Promise<{ sentence: string; clause: string }> {
  return tab.eval(`(() => ({ sentence: document.getElementById('sentence').textContent,
    clause: document.querySelector('#sentence .clause[aria-controls="panelStart"]').textContent }))()`);
}

/** A person's next tap, a few seconds on. */
async function later(tab: Tab): Promise<void> {
  await tab.shift(3);
}

function storedCook(s: Snap): Cook | null {
  return s.stored === null ? null : (JSON.parse(s.stored) as { cook: Cook }).cook;
}

/** Two tabs open and idle, each on its stopped clock, and how many writes
 *  the first had made by then. */
async function twoTabs(h: Harness): Promise<[Tab, Tab, number]> {
  const a = await h.ctx.open(STOPPED);
  const b = await h.ctx.open(STOPPED);
  await a.settle();
  await b.settle();
  return [a, b, (await a.writes()).length];
}

/** Once both tabs have settled, what `tab` has written to `key` since its
 *  `from`th write. */
async function settled(tab: Tab, other: Tab, key: string, from: number): Promise<string[]> {
  await other.settle();
  await tab.settle();
  return (await tab.writes()).slice(from).filter((w) => w.key === key).map((w) => w.value);
}

/* ------------------------------------------------------------ scenarios */

const SCENARIOS: Record<string, Scenario> = {
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
      const asked = away.requests().filter((r) => r.url.includes('/dev/'));
      check(asked.length === 0, `eggs.test asked for ${asked.map((r) => r.url).join(', ')}`);
      const home = await h.ctx.open('/?clock=60&at=+1h');
      const b = await home.eval<{ mark: string | null; skew: number; search: string }>(`(() => ({
        mark: document.getElementById('devClock')?.textContent ?? null,
        skew: window.aetTest.snapshot().now_ms - Date.now(), search: location.search }))()`);
      check(b.mark !== null && b.skew > 3_590_000 && b.search === '', `127.0.0.1: ${JSON.stringify(b)}`);
      return `eggs.test: no development tools asked for, no mark, no handle; 127.0.0.1: mark "${b.mark}"`;
    },
  },

  'cold-cook': {
    what: 'a cold cook: boil, pull, cooling, Done, Jammy, Start again; the ring ahead at x1 and x60; the record and its forecast',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      const real0 = Date.now();
      let s = await start(tab, 'cold');
      labelSays(s);
      // Four minutes of heating.
      await tab.shift(240);
      s = await boil(tab);
      labelSays(s);
      const d = deadlines(s);
      // The pull's ring, ahead on the audio clock: the last plan's, the
      // cook's seconds ahead, a stopped clock's steps taken as seconds.
      const ahead = (await tab.osc()).filter(scheduledAhead).slice(-1);
      check(ahead.length === 1, `the pull's ring scheduled ahead, ${ahead.length}`);
      const lead = (o: Osc, speed: number): string | null => {
        const want_s = (d.cookEnd_s * 1000 - o.page) / 1000 / speed;
        const got_s = (o.at ?? 0) - o.made;
        return near(got_s, want_s, 0.05) ? null : `the pull ${want_s.toFixed(2)} s of audio ahead at x${speed}, ${got_s.toFixed(2)}`;
      };
      const at1 = lead(ahead[0], 1);
      check(at1 === null, at1 ?? '');
      // At x60, a sixtieth of that: the clock run fast for an instant, the
      // ring it scheduled read, and the clock stopped at the moment again.
      const fast = await tab.eval<Osc[]>(`(() => { const T = window.aetClock.now(); window.aetClock.speed(60);
        const o = window.__osc.slice(-1); window.aetClock.speed(0); window.aetClock.set(T); return o; })()`);
      check(fast.length === 1 && fast.every(scheduledAhead), `the ring ahead at x60: ${fast.filter(scheduledAhead).length}`);
      const at60 = lead(fast[0], 60);
      check(at60 === null, at60 ?? '');
      // The last second before the pull, at the real clock's speed: the ring
      // ahead is sounding as the tick reaches the pull. The grace, 20 s of
      // it, is the margin for a slow machine to see the pull and stop.
      await tab.shiftTo(d.cookEnd_s - 1);
      const oscAtRun = await tab.eval<number>('(() => { window.aetClock.speed(1); return window.__osc.length; })()');
      await tab.phase('PULL');
      const stopped_s = await tab.eval<number>('window.aetClock.speed(0) / 1000');
      await tab.settle();
      s = await tab.snap();
      check(s.phase === 'PULL', `stopped in the pull's grace: ${s.phase}, ${(stopped_s - d.cookEnd_s).toFixed(1)} s past it`);
      labelSays(s);
      // Sounding on the audio clock as the pull came: nothing rung again.
      check(s.osc === oscAtRun, `the ring ahead rang the pull: ${s.osc - oscAtRun} more made`);
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      labelSays(s);
      const out = storedCook(s)?.events.pulled;
      check(out?.by === 'cook' && out.confirmed, `the cook's tap out stored: ${JSON.stringify(out)}`);
      const oscBeforeDone = (await tab.osc()).length;
      await tab.shiftTo(deadlines(s).coolEnd_s + 1);
      s = await tab.phase('DONE');
      labelSays(s);
      await tab.settle();
      check(rings((await tab.osc()).slice(oscBeforeDone)).length === 1, "Done's ring");
      check(s.feedback, 'the questions at Done');
      const cook = storedCook(s);
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('__snap().log.length === 1', 'the egg logged');
      s = await tab.snap();
      const rec = s.log[0];
      check(rec.id === cook?.id_ms, 'the record is the cook');
      check(rec.yolkWord === 'jammy' && rec.pulledBy === 'cook', `the record: ${rec.yolkWord}, ${rec.pulledBy}`);
      check(rec.forecast !== null && typeof rec.forecast === 'object', 'the record has its forecast');
      await tab.click('#primary');
      s = await tab.phase('IDLE');
      check(s.stored === null, 'Start again forgets the cook');
      check(s.log.length === 1, `one egg logged, ${s.log.length}`);
      const pans = JSON.parse((await tab.storage('aet.boil.v1')) ?? '{}') as Record<string, number>;
      check(Object.keys(pans).length === 1, `the pan remembered: ${JSON.stringify(pans)}`);
      const cooked_s = (s.now_ms - (cook?.startedAt_s ?? 0) * 1000) / 1000;
      return `${(cooked_s / 60).toFixed(1)} min of cook in ${((Date.now() - real0) / 1000).toFixed(1)} s; `
        + `recommended ${rec.recommended_s.toFixed(1)} s, pan ${JSON.stringify(pans)}`;
    },
  },

  'one-layout': {
    what: 'C3 step 1: one layout from idle to Done; the slider, the sentence and the egg stay, and nothing moves at the start',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await tab.until("__snap().chosen !== null", 'the time decided');
      await tab.settle();
      const idle = await layout(tab);
      check(idle.shown.every((x) => x.visible), `idle: ${JSON.stringify(idle.shown)}`);
      let s = await start(tab, 'cold');
      await tab.until('__snap().deadlines !== null', 'planned');
      await tab.settle();
      const heating = await layout(tab);
      check(heating.shown.every((x) => x.visible), `Heating: ${JSON.stringify(heating.shown)}`);
      check(heating.level === String(s.cook?.choices.level), `the slider at the cook's level: ${heating.level}`);
      // Nothing moves at the start: the slider and the sentence stay put.
      for (const id of ['doneness', 'sentence', 'eggSection'] as const) {
        check(near(idle.top[id], heating.top[id], 2), `${id} moved at the start: ${idle.top[id]} -> ${heating.top[id]}`);
      }
      const notes = [`idle→Heating: sentence at ${heating.top.sentence.toFixed(0)} px`];
      await tab.shift(300);
      s = await boil(tab);
      for (const want of ['COOKING', 'PULL', 'COOLING', 'DONE']) {
        if (want === 'PULL') await tab.shiftTo(deadlines(s).cookEnd_s + 2);
        if (want === 'COOLING') await tab.click('#primary');
        if (want === 'DONE') await tab.shiftTo(deadlines(s).coolEnd_s + 2);
        s = await tab.phase(want);
        const l = await layout(tab);
        check(l.shown.every((x) => x.visible), `${want}: ${JSON.stringify(l.shown)}`);
        notes.push(`${want} ✓`);
      }
      return notes.join(', ');
    },
  },

  'egg-readings': {
    what: 'C3 step 2: the egg aimed for at idle (softer and firmer differ), the live egg from raw at the start, the egg as it ran at Done',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      const centre = async (): Promise<{ reading: string; fill: string }> => tab.eval(`(() => {
        const svg = document.getElementById('eggSection');
        return { reading: svg.dataset.egg ?? '', fill: svg.querySelector('path[data-ring="0"]')?.getAttribute('fill') ?? '' };
      })()`);
      const at = async (level: number): Promise<{ reading: string; fill: string }> => {
        await setSlider(tab, level);
        await tab.until(`await (async () => { const st = __snap();
          return st.chosen !== null && st.chosen.level === st.settings.doneness
            && Math.abs(st.settings.doneness - ${level}) < 0.1; })()`, `level ${level} decided`);
        await tab.settle();
        return centre();
      };
      const runny = await at(0.1);
      const hard = await at(0.95);
      check(runny.reading === 'aim' && hard.reading === 'aim', `idle reads the aim: ${runny.reading}, ${hard.reading}`);
      check(runny.fill !== hard.fill, `a runny and a hard yolk drawn alike: ${runny.fill}`);
      await at(0.41);
      const aimed = await centre();
      let s = await start(tab, 'hot');
      await tab.settle();
      const live = await centre();
      check(live.reading === 'live', `the cook reads live: ${live.reading}`);
      check(live.fill !== aimed.fill, `the live egg starts raw, not as aimed: ${live.fill}`);
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      check((await centre()).reading === 'live', 'cooling reads live');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      await tab.phase('DONE');
      await tab.settle();
      const ran = await centre();
      check(ran.reading === 'ran', `Done reads the egg as it ran: ${ran.reading}`);
      return `idle runny ${runny.fill}, hard ${hard.fill}; start ${live.fill}; Done ${ran.fill}`;
    },
  },

  'owner-case': {
    what: 'C3 step 3: boiling corrected to cold after Start, as the owner needed: back to Heating, the pull later, the settings follow',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      const pull0 = deadlines(await tab.snap()).cookEnd_s;
      await tab.shift(60);
      await tab.click('#sentence .clause[aria-controls="panelStart"]');
      await tab.click('#startCold');
      s = await corrected(tab, null);
      check(s.phase === 'HEATING', `back to ${s.phase}`);
      check(s.primary === (await tab.words('action.fullBoil')),
        `the button: ${s.primary}`);
      const pull1 = deadlines(s).cookEnd_s;
      check(pull1 > pull0 + 60, `the pull later: ${(pull1 - pull0).toFixed(0)} s`);
      check(storedCook(s)?.choices.startMode === 'cold', 'the stored cook says cold');
      const settings = JSON.parse((await tab.storage('aet.settings.v1')) ?? '{}') as { startMode?: string };
      check(settings.startMode === 'cold', `the next cook's setting: ${settings.startMode}`);
      // Picked back up after a reload, as corrected.
      await tab.reload();
      s = await tab.phase('HEATING');
      check(near(deadlines(s).cookEnd_s, pull1, 1e-6), `reloaded: ${(deadlines(s).cookEnd_s - pull1).toFixed(3)} s`);
      return `Heating again; the pull ${(pull1 - pull0).toFixed(0)} s later; settings say cold; the same after a reload`;
    },
  },

  'cold-to-hot-after-tap': {
    what: 'C3 step 3: cold corrected to boiling after the boil was pressed: the tap kept, unread, the pot a boiling start',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await start(tab, 'cold');
      await tab.shift(300);
      let s = await boil(tab);
      const pull0 = deadlines(s).cookEnd_s;
      const tap = storedCook(s)?.events.boilAt_s;
      await tab.shift(60);
      await tab.click('#startHot');
      s = await corrected(tab, null);
      const c = storedCook(s);
      check(c?.events.boilAt_s === tap, `the tap kept: ${c?.events.boilAt_s} (was ${tap})`);
      check(c?.choices.startMode === 'hot', 'the stored cook says boiling');
      const pull1 = deadlines(s).cookEnd_s;
      check(pull1 < pull0, `a boiling start pulls sooner: ${(pull1 - pull0).toFixed(0)} s`);
      check(s.phase === 'COOKING' || s.phase === 'PULL', `in the water: ${s.phase}`);
      return `the tap kept; the pull ${(pull1 - pull0).toFixed(0)} s, ${s.phase}`;
    },
  },

  'heavier-lighter': {
    what: 'C3 step 3: a heavier egg mid-cook pulls later, a lighter one sooner; each a correction, committed after the settle',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      const pull0 = deadlines(await tab.snap()).cookEnd_s;
      await tab.shift(30);
      // Nothing yet: a tap settles first. Read in the same task as the tap,
      // so no timer can run between them, however slow the page.
      const atTap = await tab.eval<number | null>(`(() => {
        const e = document.querySelector('#size'); e.value = '3'; e.dispatchEvent(new Event('change', { bubbles: true }));
        return __snap().cook.correctedAt_s; })()`);
      check(atTap === null, 'committed before the settle');
      s = await corrected(tab, null);
      const heavier = deadlines(s).cookEnd_s;
      check(heavier > pull0, `heavier, later: ${(heavier - pull0).toFixed(1)} s`);
      await later(tab);
      await pick(tab, '#size', '1');
      s = await corrected(tab, s);
      const lighter = deadlines(s).cookEnd_s;
      check(lighter < pull0, `lighter, sooner: ${(lighter - pull0).toFixed(1)} s`);
      await later(tab);
      await pick(tab, '#size', '2');
      s = await corrected(tab, s);
      await tab.until('__snap().decided', 'planned on its pot');
      s = await tab.snap();
      check(near(deadlines(s).cookEnd_s, pull0, 1e-6), `back gives back: ${(deadlines(s).cookEnd_s - pull0).toFixed(6)} s`);
      return `heavier +${(heavier - pull0).toFixed(1)} s, lighter ${(lighter - pull0).toFixed(1)} s, back to the pull exactly`;
    },
  },

  'overdue-and-back': {
    what: 'C3 step 3: a correction that makes the egg overdue rings at once; changed back within the grace, the pull is cancelled',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      const pull0 = deadlines(await tab.snap()).cookEnd_s;
      await tab.shiftTo(pull0 - 40);
      let base = (await tab.osc()).length;
      await pick(tab, '#size', '0');
      let s = await corrected(tab, null);
      s = await tab.phase('PULL');
      await tab.settle();
      let osc = rings((await tab.osc()).slice(base));
      check(osc.length === 1 && (osc[0].at ?? 0) - osc[0].made < 0.1, `rang at once: ${osc.length}`);
      await tab.shift(5);
      await pick(tab, '#size', '2');
      s = await corrected(tab, s);
      s = await tab.phase('COOKING');
      const ev = storedCook(s)?.events;
      check(ev?.pulled === null && ev?.rangAt_s === null, `nothing observed: ${JSON.stringify(ev)}`);
      check(near(deadlines(s).cookEnd_s, pull0, 1), `the pull back where it was: ${(deadlines(s).cookEnd_s - pull0).toFixed(1)} s`);
      base = (await tab.osc()).length;
      await tab.shiftTo(deadlines(s).cookEnd_s + 1);
      await tab.phase('PULL');
      await tab.settle();
      osc = rings((await tab.osc()).slice(base));
      check(osc.length === 1, `the pull rings again at its time: ${osc.length}`);
      return 'overdue: Pull and a ring at once; back within the grace: Cooking, nothing written; the pull rang again';
    },
  },

  'drag-no-ring': {
    what: 'C3 step 3: a drag through an overdue level rings nothing before release; the egg shows the aim while held',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      const level = s.cook?.choices.level ?? 0.41;
      const pull0 = deadlines(s).cookEnd_s;
      await tab.shiftTo(pull0 - 60);
      const base = (await tab.osc()).length;
      await drag(tab, [0.3, 0.1, 0]);
      await tab.until("document.getElementById('eggSection').dataset.egg === 'aim'", 'the aim while held');
      // Held two seconds (a person's span, past every settle), and whatever
      // the page had pending done.
      await sleep(2000);
      await tab.settle();
      s = await tab.snap();
      check(s.phase === 'COOKING' && s.cook?.correctedAt_s === null, `held: ${s.phase}, corrected ${s.cook?.correctedAt_s}`);
      check((await tab.osc()).length === base, 'nothing rang while held');
      await drag(tab, [0.2, level], true, false);
      await tab.settle();
      s = await tab.snap();
      check(s.phase === 'COOKING' && s.cook?.correctedAt_s === null, `released at the level it had: ${s.phase}`);
      check((await tab.osc()).length === base, 'nothing rang on release');
      const egg = await tab.eval<string>("document.getElementById('eggSection').dataset.egg");
      check(egg === 'live', `the live egg again once the aim's settle is over: ${egg}`);
      // Released at an overdue level: it rings then.
      await drag(tab, [0], true);
      s = await corrected(tab, null);
      s = await tab.phase('PULL');
      check(rings((await tab.osc()).slice(base)).length >= 1, 'rang on release');
      return 'held through runny: no ring, the aim drawn; back and released: nothing; released runny: Pull, rang';
    },
  },

  'start-time': {
    what: "C3 step 3: the start corrected in its clause's panel, a minute at a time, and stopped with its reason at now, the boil pressed, and two hours back",
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'cold');
      const id_s = (s.cook?.id_ms ?? 0) / 1000;
      const start0 = s.cook?.startedAt_s ?? 0;
      await tab.shift(150);
      await tab.click('#sentence .clause[aria-controls="panelStart"]');
      const clock = await panelStart(tab);
      check(clock === await clockAt(tab, start0), `the panel says when: "${clock}"`);
      // + three times, a tap each: the third goes no further than now.
      for (let i = 0; i < 3; i++) await press(tab, '#startedAtMore');
      const limit = await tab.eval<string>("document.getElementById('startedAtLimit').textContent");
      const now = await tab.words('controls.startedAt.latestNow');
      check(limit === now, `the reason at now: "${limit}"`);
      s = await corrected(tab, null);
      const late = (s.cook?.startedAt_s ?? 0) - start0;
      check(near(late, 150, 1e-6), `in at now, 150 s on: ${late.toFixed(1)} s later`);
      const moved = await panelStart(tab);
      check(moved === await clockAt(tab, s.cook?.startedAt_s ?? 0), `the panel follows: "${moved}"`);
      // The boil pressed, then + again: no later than the press.
      await tab.shift(240);
      s = await boil(tab);
      const tap = s.cook?.events.boilAt_s ?? 0;
      await tab.shift(60);
      for (let i = 0; i < 5; i++) await press(tab, '#startedAtMore');
      const atBoil = await tab.eval<string>("document.getElementById('startedAtLimit').textContent");
      check(atBoil.includes(await tab.timeOfDay(tap * 1000)),
        `the reason at the boil names its time: "${atBoil}"`);
      s = await corrected(tab, s);
      check(s.cook?.startedAt_s === tap, `in at the press: ${(s.cook?.startedAt_s ?? 0) - tap}`);
      // − all the way back, by the keyboard: two hours before Start was pressed.
      await later(tab);
      await tab.eval(`(() => { const b = document.getElementById('startedAtLess');
        for (let i = 0; i < 140; i++) b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })); })()`);
      const early = await tab.eval<string>("document.getElementById('startedAtLimit').textContent");
      s = await corrected(tab, s);
      check(near(s.cook?.startedAt_s ?? 0, id_s - 7200, 1e-6), `two hours back: ${((s.cook?.startedAt_s ?? 0) - id_s).toFixed(1)} s`);
      return `"${clock}" → "${moved}"; "${limit}"; "${atBoil}"; "${early}"`;
    },
  },

  'sentence-no-time': {
    what: "the sentence never says when the eggs went in, idle, heating, cooking or corrected to the heat off; the start's panel does",
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await tab.until("__snap().chosen !== null", 'the time decided');
      await tab.settle();
      const idle = await sentenceSays(tab);
      const cold = await tab.words('setup.start.cold');
      const noTime = (where: string, said: { sentence: string; clause: string }, clause: string): void => {
        check(!/\d:\d\d/.test(said.sentence), `${where}: a time in the sentence: "${said.sentence}"`);
        check(said.clause === clause, `${where}: the start clause "${said.clause}", not "${clause}"`);
      };
      noTime('idle', idle, cold);
      let s = await start(tab, 'cold');
      await tab.settle();
      const heating = await sentenceSays(tab);
      noTime('heating', heating, cold);
      check(heating.sentence === idle.sentence, `heating: "${heating.sentence}", idle "${idle.sentence}"`);
      await tab.shift(300);
      s = await boil(tab);
      await tab.settle();
      const cooking = await sentenceSays(tab);
      noTime('cooking', cooking, cold);
      check(cooking.sentence === idle.sentence, `cooking: "${cooking.sentence}"`);
      // The start's panel says it.
      await tab.click('#sentence .clause[aria-controls="panelStart"]');
      const clock = await panelStart(tab);
      check(clock === await clockAt(tab, s.cook?.startedAt_s ?? 0), `the panel says when: "${clock}"`);
      // Corrected to the heat off: the clause says so, still with no time.
      await later(tab);
      await tab.click('#heatOff');
      s = await corrected(tab, null);
      await tab.settle();
      const standing = await sentenceSays(tab);
      noTime('the heat off', standing,
        await tab.words('setup.start.coldStanding'));
      return `"${cooking.sentence}"; the panel "${clock}"; "${standing.clause}"`;
    },
  },

  'settings-mid-cook': {
    what: 'C3 step 3: Settings is open while a cook runs; its water corrects the cook; the pull brings the egg back',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      const pull0 = deadlines(await tab.snap()).cookEnd_s;
      await tab.click('#settingsLink');
      await tab.until("document.body.dataset.view === 'settings' && document.getElementById('litres').offsetParent !== null", 'Settings open');
      const learned = await tab.eval<boolean>("document.getElementById('learned').offsetParent === null");
      check(learned, 'what I have learned waits for the cook to end');
      for (let i = 0; i < 4; i++) await press(tab, 'button.step[data-for="litres"][data-up="0"]');
      s = await corrected(tab, null);
      const water = storedCook(s)?.choices.waterLitres;
      check(water === 1, `the cook's water: ${water}`);
      const pull1 = deadlines(s).cookEnd_s;
      check(pull1 !== pull0, `the pull moved: ${(pull1 - pull0).toFixed(1)} s`);
      const saved = JSON.parse((await tab.storage('aet.settings.v1')) ?? '{}') as { waterLitres?: number };
      check(saved.waterLitres === 1, `the next cook's water: ${saved.waterLitres}`);
      await tab.shiftTo(pull1 + 1);
      await tab.phase('PULL');
      await tab.until("document.body.dataset.view === 'egg'", 'the egg\'s page at the pull');
      return `water 2 → 1 L: the pull ${(pull1 - pull0).toFixed(1)} s; the egg's page at the pull`;
    },
  },

  'two-tabs-own-cooks': {
    what: 'a correction in one tab leaves another tab\'s cook and its controls alone (both stopped at one moment)',
    run: async (h) => {
      const a = await h.ctx.open(STOPPED);
      await start(a, 'hot');
      const b = await h.ctx.open(`${STOPPED}&at=${new Date(await a.now()).toISOString()}`);
      await b.phase('COOKING');
      // B puts A's cook down and starts its own: two tabs, two cooks.
      await b.click('#secondary');
      await b.phase('IDLE');
      let sb = await start(b, 'hot');
      const idB = sb.cook?.id_ms;
      await b.until('__snap().decided', 'B planned');
      sb = await b.snap();
      const pullB = deadlines(sb).cookEnd_s;
      await pick(a, '#size', '3');
      const sa = await corrected(a, null);
      check(sa.cook?.choices.mass_kg !== sb.cook?.choices.mass_kg, 'A corrected its egg');
      await b.until('JSON.parse(localStorage.getItem(\'aet.settings.v1\')).sizeIndex === 3', 'A\'s correction in the settings');
      await b.settle();
      sb = await b.snap();
      check(sb.cook?.id_ms === idB, 'B runs its own cook');
      check(sb.cook?.choices.mass_kg === 0.068 && near(deadlines(sb).cookEnd_s, pullB, 1e-6), 'B\'s cook untouched');
      const shown = await b.eval<string>("document.getElementById('size').value");
      check(shown === '2', `B's controls show B's egg: ${shown}`);
      const next = await b.eval<number>('__snap().settings.sizeIndex');
      check(next === 3, `B's next cook takes A's correction: ${next}`);
      await b.click('#secondary');
      await b.phase('IDLE');
      const after = await b.eval<string>("document.getElementById('size').value");
      check(after === '3', `B, idle, shows the settings: ${after}`);
      return 'A corrected to size 3; B\'s cook and controls kept size 2; B idle shows 3';
    },
  },

  'record-corrected-at-done': {
    what: 'C3 step 3: a correction at Done changes the record, planned on the calibration before this egg: changed back, the record is the first to the bit',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      await tab.phase('DONE');
      await tab.click('.fb[data-yolk="runny"]');
      await tab.until('__snap().eggsLogged === 1', 'Runny folded');
      const first = (await tab.snap()).log[0];
      const peak0 = await tab.eval<string>("document.getElementById('donenessPeak').textContent");
      await pick(tab, '#size', '3');
      s = await corrected(tab, null);
      await tab.until(`JSON.stringify(__snap().log[0].egg) !== ${JSON.stringify(JSON.stringify(first.egg))}`,
        'the record corrected');
      const heavier = (await tab.snap()).log[0];
      check(heavier.yolkWord === 'runny', `the answer kept: ${heavier.yolkWord}`);
      check(heavier.recommended_s === first.recommended_s, 'the time that ran is the time that ran');
      check(JSON.stringify(heavier.forecast) !== JSON.stringify(first.forecast), 'the forecast is the heavier egg\'s');
      await later(tab);
      await pick(tab, '#size', '2');
      s = await corrected(tab, s);
      await tab.until(`JSON.stringify(__snap().log[0].egg) === ${JSON.stringify(JSON.stringify(first.egg))}`,
        'the record back');
      await tab.until("__snap().eggsLogged === 1 && __snap().eggsBehind === 0",
        'folded again');
      const back = (await tab.snap()).log[0];
      check(JSON.stringify(back.forecast) === JSON.stringify(first.forecast),
        `changed back, the forecast is the first, not one that knew Runny: ${JSON.stringify(back.forecast)} vs ${JSON.stringify(first.forecast)}`);
      await tab.settle();
      const peak1 = await tab.eval<string>("document.getElementById('donenessPeak').textContent");
      check(peak1 === peak0, `Done shows the cook as it ran: "${peak1}" (was "${peak0}")`);
      return `heavier: a new forecast, the answer kept; back: the first forecast to the bit, "${peak1}"`;
    },
  },

  'slider-after-pull': {
    what: 'C3 step 3: after the pull the slider only previews: no correction, no record changed, and back to the level the egg ran at',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      const level = String(s.cook?.choices.level);
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      await tab.phase('DONE');
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('__snap().eggsLogged === 1', 'Jammy folded');
      const first = JSON.stringify((await tab.snap()).log[0]);
      await drag(tab, [0.6, 0.9]);
      await tab.until("document.getElementById('eggSection').dataset.egg === 'aim'", 'the aim while held');
      await drag(tab, [0.9], true, false);
      await tab.settle();
      const egg = await tab.eval<string>("document.getElementById('eggSection').dataset.egg");
      check(egg === 'ran', `the egg as it ran again once the aim's settle is over: ${egg}`);
      s = await tab.snap();
      check(s.cook?.correctedAt_s === null, `no correction: ${s.cook?.correctedAt_s}`);
      check(JSON.stringify(s.log[0]) === first, 'the record as it was');
      const thumb = await tab.eval<string>("document.getElementById('doneness').value");
      check(thumb === level, `the slider back at ${level}: ${thumb}`);
      return `dragged to 0.9 and let go: aim drawn, no correction, the record as it was, the slider back at ${thumb}`;
    },
  },

  'still-in-water': {
    what: 'C3 step 4: a correction after the grace ran out asks "still in the water?"; nothing past it rings or shows; each answer',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      const words = (key: string): Promise<string> => tab.words(key);
      const ask = await words('ask.stillIn');
      // The alarm rang and its grace ran out, unanswered: the clock assumed
      // the egg came out. Then the cook says it went into cold water.
      const asked = async (): Promise<Snap> => {
        let s = await start(tab, 'hot');
        await tab.until('__snap().decided', 'the pot planned');
        s = await tab.snap();
        await tab.shiftTo(deadlines(s).cookEnd_s + 25);
        s = await tab.phase('COOLING');
        check(storedCook(s)?.events.pulled?.by === 'timeout', 'the clock assumed the pull');
        await tab.click('#startCold');
        await corrected(tab, null);
        await tab.until(`__snap().label === ${JSON.stringify(ask)}`, 'the question');
        return tab.snap();
      };
      let s = await asked();
      const osc0 = (await tab.osc()).length;
      check(s.primary === await words('ask.stillIn.yes'), `yes: ${s.primary}`);
      check(await tab.eval<boolean>("!document.getElementById('stillOut').hidden"), 'no, on screen');
      // Nothing past the question: not the white's line, a caveat about the
      // pull it doubts.
      check(await tab.eval<boolean>("document.getElementById('whiteRisk').hidden"), 'no white\'s line under the question');
      // The cooling's counted end passes under the question: nothing.
      await tab.shift(600);
      await tab.settle();
      s = await tab.snap();
      check(s.phase === 'COOLING' && s.label === ask && !s.feedback, `nothing past the question: ${s.phase}, "${s.label}"`);
      check(await tab.eval<boolean>("document.getElementById('whiteRisk').hidden"), 'no white\'s line under the question, settled');
      check(storedCook(s)?.events.cooledAt_s === null, 'no cooling written');
      check((await tab.osc()).length === osc0, 'nothing rang');
      await tab.click('#primary');
      s = await tab.phase('HEATING');
      check(storedCook(s)?.events.pulled === null, 'still in: the assumed pull dropped');
      const yes = `still in: Heating again, "${s.primary}"`;
      // Again, and the other answer.
      await tab.click('#secondary');
      await tab.phase('IDLE');
      await tab.click('#startHot');
      s = await asked();
      await tab.click('#stillOut');
      await tab.until(`__snap().label !== ${JSON.stringify(ask)}`, 'the question answered');
      s = await tab.snap();
      const pulled = storedCook(s)?.events.pulled;
      check(pulled?.by === 'timeout' && pulled.confirmed, `out: the pull stands, confirmed: ${JSON.stringify(pulled)}`);
      check(s.phase === 'COOLING' || s.phase === 'DONE', `out: ${s.phase}`);
      await tab.until('__snap().cook.asRan?.correctedAt_s === __snap().cook.correctedAt_s',
        'the record made again for cold water');
      return `${yes}; out: ${s.phase}, the pull confirmed, the record corrected`;
    },
  },

  'running-lines': {
    what: 'C3 step 5: corrected to cold and left heating, the slow hob counts the time heated up; a correction the white never sets in says so',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      const start_s = s.cook?.startedAt_s ?? 0;
      await tab.shift(300);
      await tab.click('#startCold');
      s = await corrected(tab, null);
      check(s.phase === 'HEATING' && !s.lengthened, `Heating on the guess: ${s.phase}, ${s.lengthened}`);
      await tab.shiftTo(start_s + 16 * 60);
      await tab.settle();
      s = await tab.phase('HEATING');
      check(s.lengthened, 'the slow hob lengthened');
      check(s.digits === '16:00', `the time heated, counting up: ${s.digits}`);
      const slow = `${s.digits}, "${s.subline}"`;
      await tab.click('#secondary');
      await tab.phase('IDLE');
      // A boiling start with the heat off in a little water, one small egg:
      // corrected to it mid-cook, the white never sets, and the slot says so.
      await tab.click('#startHot');
      s = await start(tab, 'hot');
      await later(tab);
      await tab.click('#heatOff');
      s = await corrected(tab, null);
      await later(tab);
      await pick(tab, '#size', '0');
      s = await corrected(tab, s);
      await later(tab);
      await tab.eval(`(() => { const e = document.getElementById('eggCount'); e.value = '1';
        e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      s = await corrected(tab, s);
      await later(tab);
      await tab.eval(`(() => { const e = document.getElementById('litres'); e.value = '0.5';
        e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      s = await corrected(tab, s);
      await tab.settle();
      const warn = await tab.eval<{ hidden: boolean; text: string }>(
        "(() => { const w = document.getElementById('warn'); return { hidden: w.hidden, text: w.textContent }; })()");
      const never = await tab.words('refusal.whiteNeverSets');
      check(!warn.hidden && warn.text === never, `the slot: "${warn.text}"`);
      return `${slow}; heat off, 0.5 L, one small egg: "${warn.text}"`;
    },
  },

  'two-tabs-correction': {
    what: 'a second tab on the same cook never undoes the first one\'s correction with its own ring',
    run: async (h) => {
      const a = await h.ctx.open(STOPPED);
      await start(a, 'hot');
      await a.until('__snap().decided', 'A planned');
      const pull0 = deadlines(await a.snap()).cookEnd_s;
      // B opened on the site, as a second visit: it takes up A's cook.
      const b = await h.ctx.open(`${STOPPED}&at=${new Date(await a.now()).toISOString()}`);
      await b.phase('COOKING');
      await b.until('__snap().decided', 'B planned');
      await a.shift(60);
      await b.shift(60);
      // A minute in, A corrects the start to cold water (the owner's case).
      await a.click('#sentence .clause[aria-controls="panelStart"]');
      await a.click('#startCold');
      let sa = await corrected(a, null);
      check(sa.phase === 'HEATING', `A back to ${sa.phase}`);
      const osc0 = (await a.osc()).length;
      // B, which takes no correction, reaches its own pull and its grace runs out.
      await b.shiftTo(pull0 + 25);
      const sb = await b.phase('COOLING');
      check(sb.cook?.events.pulled?.by === 'timeout', `B's own pull: ${JSON.stringify(sb.cook?.events.pulled)}`);
      await a.shiftTo(pull0 + 25);
      await a.settle();
      sa = await a.snap();
      check(sa.phase === 'HEATING', `A, corrected to cold, still heating: ${sa.phase} "${sa.label}"`);
      check(sa.cook?.events.pulled === null && sa.cook?.events.rangAt_s === null,
        `nothing B's clock decided taken up: ${JSON.stringify(sa.cook?.events)}`);
      check((await a.osc()).length === osc0, `A rang nothing: ${(await a.osc()).length - osc0}`);
      // A reload restores the corrected cook, not B's older copy.
      await a.reload();
      sa = await a.phase('HEATING');
      check(storedCook(sa)?.choices.startMode === 'cold', `stored: ${storedCook(sa)?.choices.startMode}`);
      return `B timed out in COOLING; A stayed HEATING, nothing taken up, nothing rung; A reloaded to HEATING, cold`;
    },
  },

  'start-again-corrected': {
    what: 'a correction at Done, then Start again at once, logs and keeps the corrected egg',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      await tab.phase('DONE');
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('__snap().eggsLogged === 1', 'Jammy folded');
      const first = JSON.stringify((await tab.snap()).log[0].egg);
      await later(tab);
      // A clause tapped, then Start again while the change is still settling.
      await pick(tab, '#size', '3');
      await tab.click('#primary');
      await tab.until(`await (async () => { const s = __snap(); return s.phase === 'IDLE' && s.stored === null
        && s.log.length === 1 && JSON.stringify(s.log[0].egg) !== ${JSON.stringify(first)}; })()`,
      'the corrected egg logged, then the cook forgotten');
      s = await tab.snap();
      check(s.log[0].yolkWord === 'jammy', `the answer kept: ${s.log[0].yolkWord}`);
      return `logged ${first} became ${JSON.stringify(s.log[0].egg)}, Jammy kept, then forgotten`;
    },
  },

  'done-stays-done': {
    what: 'after Done and an answer, the cooling corrected to ice keeps Done, its questions and its silence',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await tab.click('#coolCounter');
      await tab.until("__snap().settings.cooling === 'counter'", 'the counter chosen');
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('DONE');
      const out_s = storedCook(s)?.events.pulled?.out_s ?? 0;
      await tab.shift(60);
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('__snap().eggsLogged === 1', 'Jammy folded');
      await tab.settle();
      const osc0 = (await tab.osc()).length;
      await tab.shift(5);
      await tab.click('#coolIce');
      s = await corrected(tab, null);
      await tab.settle();
      s = await tab.snap();
      check(s.phase === 'DONE' && s.feedback, `Done kept, the questions shown: ${s.phase} "${s.label}", ${s.feedback}`);
      check((await tab.osc()).length === osc0, `nothing rang: ${(await tab.osc()).length - osc0}`);
      const cooled = storedCook(s)?.events.cooledAt_s ?? null;
      check(cooled !== null && cooled - out_s <= 65 + 1e-6, `the cooling ended by the correction: ${cooled === null ? null : cooled - out_s}`);
      await tab.until('__snap().log[0].cooled_s > 0', 'the record corrected');
      const rec = (await tab.snap()).log[0] as Rec & { cooled_s: number };
      check(rec.cooled_s <= 65 + 1e-6, `the record's ice bath no longer than till the correction: ${rec.cooled_s}`);
      // The alarm's grace ran out, the cooling ended, Jammy answered; then
      // corrected to cold water: an egg answered about came out, so the pull
      // stands and nothing asks whether it is still in the water.
      await tab.click('#primary');
      await tab.phase('IDLE');
      await tab.click('#coolIce');
      s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 25);
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 5);
      await tab.phase('DONE');
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('__snap().eggsLogged === 2', 'Jammy folded');
      await tab.shift(5);
      await tab.click('#startCold');
      s = await corrected(tab, null);
      await tab.settle();
      s = await tab.snap();
      check(s.phase === 'DONE' && s.feedback, `answered, then cold: ${s.phase} "${s.label}", questions ${s.feedback}`);
      check(storedCook(s)?.events.pulled?.confirmed === true, 'the pull stands');
      return `Done kept; cooled ${(cooled ?? 0) - out_s} s; the record's ice bath ${rec.cooled_s.toFixed(1)} s; `
        + 'answered, then cold: Done, the pull standing';
    },
  },

  'done-note-as-ran': {
    what: 'Done after an answer and a reload, the texture note is the cook as it ran',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      await tab.phase('DONE');
      await tab.settle();
      const note = "document.getElementById('note').textContent";
      const before = await tab.eval<string>(note);
      await tab.click('.fb[data-yolk="runny"]');
      await tab.until('__snap().eggsLogged === 1', 'Runny folded');
      await tab.reload();
      await tab.until('__snap().decided', 'planned on the new posterior');
      await tab.settle();
      const after = await tab.eval<string>(note);
      check(after === before, `"${before}" became "${after}"`);
      return `"${after}" kept`;
    },
  },

  'certainty-mid-cook': {
    what: 'once the cook runs, the likely time range is when to take them out, and moves with a slow hob',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      await tab.shift(300);
      await tab.click('#certaintyWord');
      await tab.settle();
      const line = "document.getElementById('certaintyTime').textContent";
      // The times of day the eggs come out between, from this plan's range.
      const want = await tab.eval<string>(`(() => { const s = __snap(); const r = s.certainty.time; const t0 = s.cook.startedAt_s;
        return aetTest.t('certainty.timeOut', { low: aetTest.timeOfDay((t0 + r.low_s) * 1000), high: aetTest.timeOfDay((t0 + r.high_s) * 1000) }); })()`);
      const cooking = await tab.eval<string>(line);
      check(cooking === want, `cooking, ${(await tab.snap()).digits} left: "${cooking}", want "${want}"`);
      await tab.click('#secondary');
      await tab.phase('IDLE');
      // Cold and never tapped: the slow hob lengthens the guess.
      await tab.click('#startCold');
      s = await start(tab, 'cold');
      await tab.until('__snap().decided', 'the guessed pot planned');
      const start_s = s.cook?.startedAt_s ?? 0;
      await tab.shiftTo(start_s + 16 * 60);
      await tab.settle();
      s = await tab.phase('HEATING');
      check(s.lengthened, 'the slow hob lengthened');
      check(await tab.eval<boolean>("!document.getElementById('certaintyTime').closest('#certaintyMore').hidden"),
        'the range shown');
      const at16 = await tab.eval<string>(line);
      const pull16 = deadlines(s).cookEnd_s;
      // Four minutes on, as the iOS scenario steps. The times are said to
      // the minute and the cook started at the real clock's second, so the
      // line is sure to change only if the guess moved a whole minute: 65 s
      // on it moved about 38 s, and the line stayed put one start in five.
      await tab.shiftTo(start_s + 20 * 60);
      await tab.settle();
      s = await tab.phase('HEATING');
      const moved_s = deadlines(s).cookEnd_s - pull16;
      check(s.lengthened && moved_s >= 60, `the guess a minute later or more: ${moved_s.toFixed(1)} s`);
      const at20 = await tab.eval<string>(line);
      check(at20 !== at16, `the range moved with the guess: still "${at16}"`);
      return `cooking: "${cooking}"; heating 16:00: "${at16}"; 20:00: "${at20}"`;
    },
  },

  'grace-correction': {
    what: 'a correction in the grace that leaves the pull due keeps the grace\'s end and rings nothing more',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      const pull0 = deadlines(await tab.snap()).cookEnd_s;
      await tab.shiftTo(pull0 + 15);
      let s = await tab.phase('PULL');
      await tab.settle();
      const osc0 = (await tab.osc()).length;
      await pick(tab, '#size', '1');
      s = await corrected(tab, null);
      await tab.settle();
      s = await tab.snap();
      check(s.phase === 'PULL' && near(deadlines(s).cookEnd_s, pull0, 1e-6),
        `a lighter egg in the grace: ${s.phase}, the pull ${(deadlines(s).cookEnd_s - pull0).toFixed(1)} s from the one that rang`);
      check((await tab.osc()).length === osc0, `nothing rang again: ${(await tab.osc()).length - osc0}`);
      await tab.shiftTo(pull0 + 21);
      s = await tab.phase('COOLING');
      const p = storedCook(s)?.events.pulled;
      check(p?.by === 'timeout' && near(p.due_s, pull0, 1e-6), `the grace ended where it began: ${JSON.stringify(p)}`);
      return `lighter at +15 s: Pull, the pull kept, nothing rung; +21 s: Cooling, due at the pull that rang`;
    },
  },

  'change-kept-on-hide': {
    what: 'a change still settling is committed when the page goes, and two changes commit apart by keyboard too',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      await tab.shift(30);
      await pick(tab, '#size', '3');
      await tab.reload();
      let s = await tab.phase('COOKING');
      check(s.cook?.choices.mass_kg !== 0.068 && s.cook?.correctedAt_s !== null, `reloaded: ${s.cook?.choices.mass_kg}`);
      const saved = JSON.parse((await tab.storage('aet.settings.v1')) ?? '{}') as { sizeIndex?: number };
      check(saved.sizeIndex === 3, `the next cook's egg: ${saved.sizeIndex}`);
      // Two changes in a row with no pointer, as a keyboard makes them.
      await later(tab);
      const w0 = (await tab.writes()).length;
      await pick(tab, '#size', '1');
      await tab.click('#coolTap');
      await tab.until("JSON.parse(localStorage.getItem('aet.cook.v5')).cook.choices.cooling === 'tap'", 'the second committed');
      await tab.settle();
      const cooks = (await tab.writes()).slice(w0).filter((w) => w.key === 'aet.cook.v5')
        .map((w) => (JSON.parse(w.value) as { cook: Cook }).cook.choices);
      const firstAlone = cooks.some((c) => c.mass_kg !== s.cook?.choices.mass_kg && c.cooling === 'ice');
      check(firstAlone, `the first committed without the second: ${JSON.stringify(cooks.map((c) => [c.mass_kg, c.cooling]))}`);
      return `the size kept across a reload; then ${cooks.length} writes, the first change alone first`;
    },
  },

  'hot-start': {
    what: 'a hot start: in, the pull, out, the cooling, Done, Start again logs the unanswered egg',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      labelSays(s);
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      const d = deadlines(s);
      check(!s.deadlines?.provisional, 'a hot start knows its pull');
      await tab.shiftTo(d.cookEnd_s + 2);
      s = await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      const d2 = deadlines(s);
      await tab.shiftTo(d2.coolEnd_s + 1);
      s = await tab.phase('DONE');
      const cook = storedCook(s);
      await tab.click('#primary');
      await tab.until('__snap().log.length === 1', 'the unanswered egg logged');
      s = await tab.phase('IDLE');
      const rec = s.log[0];
      check(rec.id === cook?.id_ms && rec.yolkWord === null && rec.forecast !== null,
        `unanswered, with its forecast: ${JSON.stringify({ id: rec.id, yolk: rec.yolkWord, f: rec.forecast !== null })}`);
      check(s.stored === null, 'the cook forgotten');
      return `pull at +${(d.cookEnd_s - (cook?.startedAt_s ?? 0)).toFixed(1)} s, logged unanswered with its forecast`;
    },
  },

  cancel: {
    what: 'Cancel while heating and while cooking: nothing logged, the cook gone, the boil remembered',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'cold');
      await tab.click('#secondary');
      s = await tab.phase('IDLE');
      check(s.stored === null && s.log.length === 0, 'Cancel while heating: nothing kept');
      check((await tab.storage('aet.boil.v1')) === null, 'no boil to remember');
      s = await start(tab, 'cold');
      await tab.shift(300);
      s = await boil(tab);
      await tab.click('#secondary');
      s = await tab.phase('IDLE');
      check(s.stored === null && s.log.length === 0, 'Cancel while cooking: nothing logged');
      const pans = JSON.parse((await tab.storage('aet.boil.v1')) ?? '{}') as Record<string, number>;
      check(Object.values(pans).some((v) => near(v, 300, 1e-6)), `the boil remembered at Cancel: ${JSON.stringify(pans)}`);
      return `pans ${JSON.stringify(pans)}`;
    },
  },

  reload: {
    what: 'a reload at Heating, Cooking, Pull, Cooling and Done: the same deadlines, nothing lost',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await start(tab, 'cold');
      const notes: string[] = [];
      const again = async (where: string): Promise<Snap> => {
        await tab.until('__snap().decided || __snap().deadlines.provisional',
          'the plan before');
        const before = await tab.snap();
        await tab.reload();
        await tab.until('__snap().decided || __snap().deadlines.provisional',
          'the plan after');
        const after = await tab.snap();
        check(after.phase === before.phase, `${where}: ${before.phase} became ${after.phase}`);
        const a = deadlines(before);
        const b = deadlines(after);
        check(near(a.cookEnd_s, b.cookEnd_s, 1e-6) && (Number.isNaN(a.coolEnd_s) || near(a.coolEnd_s, b.coolEnd_s, 1e-6)),
          `${where}: deadlines ${JSON.stringify(a)} became ${JSON.stringify(b)}`);
        const ca = storedCook(before);
        const cb = storedCook(after);
        check(JSON.stringify(ca?.events) === JSON.stringify(cb?.events), `${where}: events ${JSON.stringify(ca?.events)} became ${JSON.stringify(cb?.events)}`);
        check(after.log.length === before.log.length, `${where}: the log`);
        labelSays(after);
        notes.push(`${where} ${after.digits}`);
        return after;
      };
      await tab.shift(200);
      await again('Heating');
      await tab.shift(100);
      let s = await boil(tab);
      await tab.shift(60);
      s = await again('Cooking');
      await tab.shiftTo(deadlines(s).cookEnd_s + 3);
      s = await tab.phase('PULL');
      s = await again('Pull');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      await tab.shift(30);
      s = await again('Cooling');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      s = await tab.phase('DONE');
      s = await again('Done');
      check(storedCook(s)?.events.pulled?.by === 'cook', 'the tap out kept across the reloads');
      return notes.join(', ');
    },
  },

  'woken-past-pull': {
    what: 'a tab woken 25 s past the pull rings it; one woken past the cooling rings the pull, not Done',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await start(tab, 'cold');
      await tab.shift(470);
      let s = await boil(tab);
      const d = deadlines(s);
      let osc = await tab.osc();
      const ahead = osc.filter(scheduledAhead);
      check(ahead.length === 1, `the pull's ring scheduled ahead at the tap, ${ahead.length}`);
      const pullRing = ahead[0].mark;
      const lead = (ahead[0].at ?? 0) - ahead[0].made;
      check(near(lead, d.cookEnd_s - ahead[0].page / 1000, 0.05), `the pull's ring ${lead.toFixed(1)} s ahead`);
      // Woken 25 s past the pull, as a throttled or frozen tab is.
      let base = osc.length;
      await tab.shiftTo(d.cookEnd_s + 25);
      s = await tab.phase('COOLING');
      await tab.settle();
      osc = await tab.osc();
      const now = rings(osc.slice(base));
      check(now.length === 1 && (now[0].at ?? 0) - now[0].made < 0.1, `rung at once, ${now.length}`);
      const ev = storedCook(s)?.events;
      check(ev?.rangAt_s !== null && ev?.pulled?.by === 'timeout', `the pull rung and timed out: ${JSON.stringify(ev)}`);
      base = osc.length;
      await tab.shiftTo(deadlines(s).coolEnd_s + 1);
      s = await tab.phase('DONE');
      await tab.settle();
      const done = rings((await tab.osc()).slice(base));
      check(done.length === 1 && done[0].mark !== pullRing, `Done's ring, not the pull's: ${done.length}`);
      // A second cook, woken straight past the cooling: the pull rings, not Done.
      await tab.click('#primary');
      await tab.phase('IDLE');
      await start(tab, 'cold');
      await tab.shift(470);
      s = await boil(tab);
      base = (await tab.osc()).length;
      await tab.shiftTo(deadlines(s).coolEnd_s + 600);
      s = await tab.phase('DONE');
      await tab.settle();
      const rung = rings((await tab.osc()).slice(base));
      check(rung.length === 1 && rung[0].mark === pullRing, `past the cooling: the pull's ring, not Done's: ${rung.length}`);
      return 'tap: a ring ahead; +25 s: rung at once, Cooling; Done: its own ring; straight to Done: the pull\'s';
    },
  },

  'two-tabs': {
    what: 'a second tab follows the first one\'s tap and writes nothing back over it (both stopped at one moment)',
    run: async (h) => {
      const a = await h.ctx.open(STOPPED);
      await start(a, 'cold');
      const b = await h.ctx.open(`${STOPPED}&at=${new Date(await a.now()).toISOString()}`);
      let sb = await b.phase('HEATING');
      check(storedCook(sb)?.id_ms === (await a.snap()).cook?.id_ms, 'B took up A\'s cook');
      await b.until('__snap().deadlines !== null', 'B planned');
      await a.click('#primary');
      await a.phase('COOKING');
      sb = await b.phase('COOKING');
      // Both tabs' surfaces in, then all B would write written.
      await a.until('__snap().decided', 'A planned on the measured pot');
      await b.until('__snap().decided', 'B planned on the measured pot');
      await a.settle();
      await b.settle();
      const stored = storedCook(await a.snap());
      check(stored?.events.boilAt_s !== null, 'the tap still stored');
      const bWrites = (await b.writes()).filter((w) => w.key === 'aet.cook.v5')
        .map((w) => (JSON.parse(w.value) as { cook: Cook }).cook);
      check(bWrites.every((c) => c.events.boilAt_s !== null), 'B never wrote a cook without the tap');
      await a.reload();
      const sa = await a.snap();
      check(sa.phase === 'COOKING', `A reloaded to ${sa.phase}`);
      return `B followed in COOKING; B's writes of the cook: ${bWrites.length}, none without the tap; A reloaded to COOKING`;
    },
  },

  'two-tabs-settings': {
    what: 'a setting changed in another tab is taken up and shown, and never written back',
    run: async (h) => {
      const [a, b, from] = await twoTabs(h);
      await pick(b, '#size', '3');
      await a.until("__snap().settings.sizeIndex === 3 && document.getElementById('size').value === '3'", 'B\'s size in A');
      const back = await settled(a, b, 'aet.settings.v1', from);
      check(back.length === 0, `A wrote the settings back: ${back.length}`);
      return 'B chose size 3: A shows it, and wrote the settings 0 times';
    },
  },

  'two-tabs-pans': {
    what: 'a pan another tab timed to the boil is taken up, and never written back',
    run: async (h) => {
      const [a, b, from] = await twoTabs(h);
      await start(b, 'cold');
      await b.shift(240);
      await boil(b);
      await b.click('#secondary');
      await b.phase('IDLE');
      const pans = JSON.parse((await b.storage('aet.boil.v1')) ?? '{}') as Record<string, number>;
      check(Object.keys(pans).length === 1, `B remembered the pan: ${JSON.stringify(pans)}`);
      await a.until(`JSON.stringify(__snap().boilMemory) === ${JSON.stringify(JSON.stringify(pans))}`, 'B\'s pan in A');
      const back = await settled(a, b, 'aet.boil.v1', from);
      check(back.length === 0, `A wrote the pans back: ${back.length}`);
      return `B timed ${JSON.stringify(pans)}: A has it, and wrote the pans 0 times`;
    },
  },

  'two-tabs-log': {
    what: 'an egg another tab logged and folded is taken up, and never written back',
    run: async (h) => {
      const [a, b, from] = await twoTabs(h);
      let s = await start(b, 'hot');
      await b.until('__snap().decided', 'B planned');
      s = await b.snap();
      await b.shiftTo(deadlines(s).cookEnd_s + 2);
      await b.phase('PULL');
      await b.click('#primary');
      s = await b.phase('COOLING');
      await b.shiftTo(deadlines(s).coolEnd_s + 2);
      await b.phase('DONE');
      await b.click('.fb[data-yolk="jammy"]');
      await a.until('__snap().log.length === 1 && __snap().eggsLogged === 1 && __snap().eggsBehind === 0',
        'B\'s egg, folded, in A');
      const back = await settled(a, b, 'aet.calibration.v5', from);
      check(back.length === 0, `A wrote the log back: ${back.length}`);
      return 'B logged Jammy and folded it: A has the egg, and wrote the log 0 times';
    },
  },

  'two-tabs-sharing': {
    what: 'sharing turned on in another tab is taken up and shown, and never written back',
    run: async (h) => {
      const [a, b, from] = await twoTabs(h);
      await b.click('#shareSetting');
      await a.until("__snap().share.on && document.getElementById('shareSetting').checked", 'sharing on in A');
      const back = await settled(a, b, 'aet.share.v1', from);
      check(back.length === 0, `A wrote the sharing state back: ${back.length}`);
      return 'B turned sharing on: A shows it, and wrote the sharing state 0 times';
    },
  },

  'two-tabs-cook': {
    what: 'the boil tapped in another tab on the same cook is taken up, and the cook never written back',
    run: async (h) => {
      const a = await h.ctx.open(STOPPED);
      await start(a, 'cold');
      const b = await h.ctx.open(`${STOPPED}&at=${new Date(await a.now()).toISOString()}`);
      await b.phase('HEATING');
      await b.until('__snap().deadlines !== null', 'B planned');
      await b.settle();
      const from = (await b.writes()).length;
      await a.click('#primary');
      const sa = await a.phase('COOKING');
      const sb = await b.phase('COOKING');
      check(sb.cook?.events.boilAt_s === sa.cook?.events.boilAt_s, 'B has A\'s tap');
      const cookOf = (text: string): string => JSON.stringify((JSON.parse(text) as { cook: Cook }).cook);
      const written = await settled(b, a, 'aet.cook.v4', from);
      // B's lean, a cache, may be written beside a cook A stored; a cook of
      // B's own, never.
      const aCooks = new Set((await a.writes()).filter((w) => w.key === 'aet.cook.v4').map((w) => cookOf(w.value)));
      const back = written.filter((w) => !aCooks.has(cookOf(w)));
      check(back.length === 0, `B wrote its copy of the cook back: ${back.length}`);
      return `A tapped the boil: B took it up; of B's ${written.length} writes of the cook, 0 its own copy`;
    },
  },

  'too-old': {
    what: 'a cold start never tapped is ended at two hours, in the tab that runs it',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'cold');
      const start_s = s.cook?.startedAt_s ?? 0;
      await tab.shiftTo(start_s + 7100);
      s = await tab.phase('HEATING');
      check(s.lengthened, 'the slow hob lengthened');
      const at7100 = s.digits;
      await tab.shiftTo(start_s + 7210);
      s = await tab.phase('IDLE');
      check(s.stored === null && s.log.length === 0, 'ended, nothing stored, nothing logged');
      return `Heating at 7,100 s (${at7100}), idle at 7,210 s`;
    },
  },

  'done-wakes': {
    what: 'a page left at Done, never looked at again, ends its cook an hour past the end and logs the egg',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 25);
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s - 2);
      // An hour of the cook in a second of the page's, from here on, with no
      // look: the tick takes it to Done and stops, and the page wakes itself
      // when the plan says the cook is too old.
      await tab.eval('window.aetClock.speed(3600)');
      await tab.until("__snap().phase === 'IDLE'", 'ended by the wake');
      s = await tab.snap();
      check(s.stored === null && s.log.length === 1 && s.log[0].yolkWord === null,
        `forgotten, the egg logged unanswered: ${s.stored === null}, ${s.log.length}`);
      return 'Done, then idle an hour on with no look; the egg logged unanswered';
    },
  },

  'final-egg': {
    what: 'an egg final by the clock takes no more answers',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 25);
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 5);
      s = await tab.phase('DONE');
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('__snap().log.length === 1', 'Jammy logged');
      const final0 = await tab.eval<number>('__snap().finalEggs');
      check(final0 === 0, `open at Done: ${final0} final`);
      await tab.eval('window.aetClock.shift(3 * 3600)');
      const final1 = await tab.eval<number>('__snap().finalEggs');
      check(final1 === 1, `three hours on: ${final1} final`);
      await tab.click('.wb[data-white="tender"]');
      await tab.settle();
      s = await tab.snap();
      check(s.log.length === 1 && s.log[0].white === null, `Tender not taken: ${s.log[0].white}`);
      check(!s.feedback, 'the questions put away');
      await tab.look();
      s = await tab.phase('IDLE');
      check(s.log.length === 1, 'nothing logged twice');
      return 'final 0 at Done, 1 three hours on; Tender not taken; the cook ended on the next look';
    },
  },

  'probe-reading': {
    what: 'a probe reading at Done: one no kitchen could make refused with its range, a believable one scored on the egg\'s record and logged',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      s = await tab.phase('DONE');
      const field = await tab.eval<{ shown: boolean; placeholder: string }>(`(() => ({
        shown: !document.getElementById('probeEntry').hidden,
        placeholder: document.getElementById('probeReading').placeholder }))()`);
      check(field.shown && field.placeholder !== '', `the probe's field, from the peak: ${JSON.stringify(field)}`);
      const save = (typed: string): Promise<void> => tab.eval(`(() => {
        document.getElementById('probeReading').value = ${JSON.stringify(typed)};
        document.getElementById('probeSave').click(); })()`);
      // Freezing, in either unit: no kitchen makes it.
      await save('0');
      await tab.settle();
      const refused = await tab.eval<string>("document.getElementById('probeNote').textContent");
      s = await tab.snap();
      check(s.log.length === 0 && s.cook !== null && JSON.stringify(s.cook).indexOf('"probe":{') < 0,
        `0 refused, nothing logged: ${s.log.length}`);
      check(refused !== '' && refused !== '0', `the range said: "${refused}"`);
      // The peak the field suggests: taken, and logged with the egg.
      await save(field.placeholder);
      await tab.until('__snap().log.length === 1', 'the reading logged');
      s = await tab.snap();
      const probe = (s.log[0] as unknown as { probe: { centre_C: number } | null }).probe;
      const peak = s.peakYolk_C ?? 0;
      check(probe !== null && Math.abs(probe.centre_C - peak) < 1, `logged ${JSON.stringify(probe)} for a peak of ${peak.toFixed(1)} °C`);
      const settled = await tab.eval<boolean>("document.getElementById('probeReading').disabled");
      check(settled, 'the field settled on the reading');
      return `refused 0: "${refused}"; ${field.placeholder} logged as ${probe?.centre_C} °C`;
    },
  },

  'done-as-ran': {
    what: 'Done after an answer and a reload shows the cook as it ran',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      s = await tab.phase('DONE');
      await tab.until('__snap().target !== ""', 'what was asked for');
      // The slider's heading, the cook's peak yolk (the one screen keeps the
      // slider where the summary under the sentence was).
      const summary = "document.getElementById('donenessPeak').textContent";
      const before = await tab.eval<string>(summary);
      const asked = (await tab.snap()).target;
      check(asked.includes(before), `"${asked}" and "${before}" agree`);
      await tab.click('.fb[data-yolk="runny"]');
      await tab.until('__snap().eggsLogged === 1', 'Runny folded');
      await tab.reload();
      await tab.until('__snap().decided', 'planned on the new posterior');
      s = await tab.snap();
      check(s.phase === 'DONE', `reloaded to ${s.phase}`);
      const after = await tab.eval<string>(summary);
      // What the plan made now, on the posterior that has folded Runny, says.
      const now_C = (await tab.snap()).peakYolk_C ?? NaN;
      check(after === before, `"${before}" became "${after}"`);
      return `"${after}" kept (the plan now: peak yolk ${now_C.toFixed(1)} °C)`;
    },
  },

  'slow-hob': {
    what: 'a slow hob: past the guess, the clock counts the time heated up, still Heating',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'cold');
      const start_s = s.cook?.startedAt_s ?? 0;
      await tab.shiftTo(start_s + 16 * 60);
      await tab.settle();
      s = await tab.phase('HEATING');
      check(s.lengthened, 'the plan lengthened');
      const first = s.digits;
      check(first === '16:00', `the time heated, ${first}`);
      await tab.shift(65);
      await tab.settle();
      s = await tab.snap();
      check(s.phase === 'HEATING' && s.digits === '17:05', `counting up: ${s.digits}`);
      return `${first}, then ${s.digits}; "${s.subline}"`;
    },
  },

  'unreadable-stores': {
    what: 'a cook and a results log this build cannot read: dropped, the page idle on the prior, nothing kept aside',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await tab.eval(`localStorage.setItem('aet.cook.v5', '{"cook":{"id_ms":1},"answers":"none"}');
        localStorage.setItem('aet.calibration.v5', '{damaged')`);
      await tab.reload();
      await tab.settle();
      const s = await tab.snap();
      check(s.phase === 'IDLE' && s.stored === null, 'idle, the cook dropped');
      check(s.log.length === 0, 'no egg');
      const text = await tab.storage('aet.calibration.v5');
      const store = text === null ? null : JSON.parse(text) as { v: number; log: unknown[] };
      check(store !== null && store.v === 5 && store.log.length === 0, `the log written again, empty: ${text?.slice(0, 40)}`);
      const keys = await tab.eval<string[]>('Object.keys(localStorage).sort()');
      check(!keys.some((k) => k.endsWith('.unread')), `nothing kept aside: ${keys.join(', ')}`);
      return `dropped; ${keys.join(', ')}`;
    },
  },

  'retired-keys': {
    what: 'the keys no build reads, 0.3\'s log among them, are deleted at boot; under a newer build\'s mark, not one',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      const old = ['aet.calibration.v3', 'aet.calibration.v4', 'aet.calibration.v4.unread', 'aet.cook.unread',
        'aet.cook.v1', 'aet.cook.v2', 'aet.cook.v3', 'aet.cook.v4'];
      const plant = `for (const k of ${JSON.stringify(old)}) localStorage.setItem(k, '{"v":4,"log":[]}')`;
      const keys = 'Object.keys(localStorage).sort()';
      await tab.eval(plant);
      await tab.reload();
      await tab.settle();
      const left = await tab.eval<string[]>(keys);
      check(old.every((k) => !left.includes(k)), `each deleted: ${left.join(', ')}`);
      check(left.includes('aet.calibration.v5') && left.includes('aet.newest'), `this build's stores kept: ${left.join(', ')}`);
      await tab.eval(`localStorage.setItem('aet.newest', '9.0.0'); ${plant}`);
      await tab.reload();
      await tab.settle();
      const kept = await tab.eval<string[]>(keys);
      check(old.every((k) => kept.includes(k)), `under a newer mark, each kept: ${kept.join(', ')}`);
      return `${old.length} deleted at boot; under 9.0.0, ${old.length} kept`;
    },
  },

  'sharing-final-only': {
    what: 'sharing sends only final eggs: none at Done, the egg at Start again (real clock, the cook moved back)',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      await tab.click('#shareSetting');
      await tab.until("__snap().share.on", 'sharing on');
      const posts0 = h.posts().length;
      await start(tab, 'hot');
      // The cook begun 20 minutes ago: every clock time in it moved back.
      const D = 20 * 60;
      await tab.goto(`${h.origin}/privacy/`, false);
      await tab.eval(`(() => {
        const o = JSON.parse(localStorage.getItem('aet.cook.v5'));
        const c = o.cook;
        c.id_ms -= ${D * 1000};
        // The press and its start; the log is read, the rest folded from it.
        c.start.at_s -= ${D};
        for (const e of c.log) if (typeof e.at_s === 'number') e.at_s -= ${D};
        localStorage.setItem('aet.cook.v5', JSON.stringify(o));
      })()`).catch(() => undefined);
      await tab.goto(`${h.origin}/`);
      await tab.phase('DONE');
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('__snap().log.length === 1', 'Jammy logged');
      await tab.settle();
      check((await tab.sends()) === 0, `nothing sent while the egg is open: ${await tab.sends()} requests`);
      check(h.posts().length === posts0, `nothing sent while the egg is open: ${h.posts().slice(posts0).join('; ')}`);
      await tab.click('#primary');
      await tab.phase('IDLE');
      await tab.until("__snap().share.sent === 1", 'the egg sent');
      const sent = h.posts().slice(posts0);
      check(sent.length === 1 && sent[0].includes('201'), `one egg sent: ${sent.join('; ')}`);
      return `at Done: 0 sent; Start again: ${sent[0]}`;
    },
  },

  'dev-clock-shares-nothing': {
    what: 'nothing is sent from a log the development clock has touched, even with the clock off',
    run: async (h) => {
      const tab = await h.ctx.open(`${STOPPED}&at=-1m`);
      await tab.click('#shareSetting');
      await tab.until("__snap().share.on", 'sharing on');
      const posts0 = h.posts().length;
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 25);
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 5);
      await tab.phase('DONE');
      await tab.click('#primary');
      await tab.until('__snap().log.length === 1', 'the egg logged');
      await tab.settle();
      const before = await tab.sends();
      await tab.eval('window.aetClock.off()');
      await tab.reload();
      await tab.settle();
      check(before === 0 && (await tab.sends()) === 0, `nothing sent: ${before} with the clock on, ${await tab.sends()} off`);
      check(h.posts().length === posts0, `nothing sent: ${h.posts().slice(posts0).join('; ')}`);
      return 'the egg logged, nothing sent, the clock on or off';
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
        localStorage.setItem('aet.newest', '9.0.0');
        const s = JSON.parse(localStorage.getItem('aet.settings.v1') ?? '{}');
        localStorage.setItem('aet.settings.v1', JSON.stringify({ ...s, addedLater: true }));
        localStorage.setItem('aet.later.v1', 'a newer store');
        localStorage.setItem('aet.calibration.v4', 'a key this build would sweep');
        localStorage.setItem('aet.share.v1', JSON.stringify({ on: false, uid: null,
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

  'newer-version-tab': {
    what: 'a tab already open stops writing when a newer build\'s tab marks the storage',
    run: async (h) => {
      const a = await h.ctx.open(STOPPED);
      check((await a.storage('aet.newest')) !== null, 'this build marked the storage first');
      check(await a.eval<boolean>("document.getElementById('newerNote').hidden"), 'no line while this build is the newest');
      const b = await h.ctx.open(STOPPED);
      // A newer build's tab: the mark is all this build can see of it.
      await b.eval("localStorage.setItem('aet.newest', '9.0.0')");
      await a.until("!document.getElementById('newerNote').hidden", 'the line in the tab already open');
      const n0 = (await a.writes()).length;
      await pick(a, '#size', '3');
      await a.settle();
      const after = (await a.writes()).slice(n0);
      check(after.length === 0, `not one write after: ${after.map((w) => w.key).join(', ')}`);
      return `the open tab shows the line and writes nothing (${n0} writes before)`;
    },
  },
};

/* --------------------------------------------------------------- runner */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const all: Record<string, Scenario> = { ...SCENARIOS, ...copyScenarios() };
  if (args.includes('--list')) {
    for (const [name, s] of Object.entries(all)) console.log(`${name.padEnd(26)} ${s.what}`);
    return;
  }
  const tree = treeArg(args);
  const names: string[] = [];
  for (const a of args.length > 0 ? args : Object.keys(all)) {
    const matched = a.endsWith('/') ? Object.keys(all).filter((n) => n.startsWith(a)) : a in all ? [a] : [];
    if (matched.length === 0) throw new Error(`no scenario ${a}; --list lists them`);
    names.push(...matched);
  }
  if (await runScenarios(all, names, tree) > 0) process.exitCode = 1;
}

await main();
