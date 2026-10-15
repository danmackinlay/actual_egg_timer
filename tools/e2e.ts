/**
 * The web app driven end to end, in seconds: the checks that were done by
 * hand (the LOGBOOK of 6 to 8 October), each a named scenario with assertions on the page and on what
 * it stored, and the copy capture's states (tools/copyScenarios.ts), each a
 * scenario too, every state checked for raw keys, straight quotes and the
 * certainty line.
 *
 *   npm run e2e                              # build the site, then every scenario
 *   npm run e2e -- reload one-tab-takeover   # only those named (after a build)
 *   npm run e2e -- copy/                     # those whose names start so
 *   npm run e2e -- --tree <dir>              # another checkout's build (harness.ts)
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

import { readFileSync } from 'node:fs';

import { wordBandHigh, wordBandLow } from '../src/core/certainty.js';
import { readStoredCook } from '../src/ui/storedCook.js';
import { STORES } from '../src/ui/stores.js';
import { sleep } from './chrome.js';
import { copyScenarios } from './copyScenarios.js';
import {
  Cook, Failure, Harness, Osc, Rec, Scenario, Snap, Tab, WAIT_MS, check, labelSays, runScenarios, treeArg,
} from './harness.js';
import { asRead } from './text.js';

/** Where the page keeps its stores (src/ui/stores.ts). */
const COOK_KEY = STORES.cook.key;
const SETTINGS_KEY = STORES.settings.key;
const BOIL_KEY = STORES.boilMemory.key;
const NEWEST_KEY = STORES.newest.key;

/** The pans a stored text holds: litres to the time to boil. */
function pansIn(text: string | null): Record<string, number> {
  return ((JSON.parse(text ?? '{}') as { pans?: Record<string, number> }).pans) ?? {};
}

/** The cook a stored text reads as, folded from its log as the page reads
 *  it (the web's `readStoredCook`), or null. */
function cookIn(text: string): Cook | null {
  return (readStoredCook(JSON.parse(text))?.cook ?? null) as Cook | null;
}

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

/** Rolling boil, tapped, and the measured pot's time decided. */
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

/** A box on the page, px from its top and left. */
interface Box { top: number; bottom: number; left: number }

/** What the one screen shows: whether each of its parts is on screen, where
 *  the action, the slider, the sentence and the egg are, where the readout
 *  and the action end, the action's two buttons (null when not shown), and
 *  the slider's value. */
interface Layout {
  shown: { id: string; visible: boolean }[];
  top: Record<'actions' | 'doneness' | 'sentence' | 'eggSection', number>;
  readoutEnd: number;
  actionsEnd: number;
  primary: Box | null;
  secondary: Box | null;
  level: string;
  row: RowFit;
}

/** How the row of buttons was laid out, read from the probe (the row at
 *  its widest, with Cancel, never seen; styles.css "actions"): whether it
 *  wrapped, the main button over Cancel; the widths that decide it, px:
 *  the widest main button's words with its padding, the gap, Cancel's, and
 *  the row's; and the words it is sized on, in the probe and in the main
 *  button's cell. */
interface RowFit {
  stacked: boolean; main: number; gap: number; cancel: number; room: number; words: string[]; cellWords: string[];
}

async function layout(tab: Tab): Promise<Layout> {
  return tab.eval<Layout>(`(() => {
    const on = (id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect();
      return { id: id, visible: r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' }; };
    const top = (id) => document.getElementById(id).getBoundingClientRect().top + window.scrollY;
    const box = (id) => { const r = document.getElementById(id).getBoundingClientRect();
      return r.height > 0 ? { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, left: r.left } : null; };
    const probe = document.querySelector('.buttons__probe');
    const probeMain = probe.querySelector('.buttons__main').getBoundingClientRect();
    const probeCancel = probe.querySelector('.sizer--cancel').getBoundingClientRect();
    // A sizer's words at their own width, as the flex basis takes them, and
    // its padding and border.
    const own = (e) => { const range = document.createRange(); range.selectNodeContents(e);
      const st = getComputedStyle(e); const px = (k) => parseFloat(st[k]) || 0;
      return range.getBoundingClientRect().width + px('paddingLeft') + px('paddingRight')
        + px('borderLeftWidth') + px('borderRightWidth'); };
    const st = getComputedStyle(probe);
    return {
      shown: ['readout', 'digits', 'doneness', 'donenessPeak', 'sentence', 'eggSection', 'actions'].map(on),
      top: { actions: top('actions'), doneness: top('doneness'), sentence: top('sentence'), eggSection: top('eggSection') },
      readoutEnd: document.getElementById('readout').getBoundingClientRect().bottom + window.scrollY,
      actionsEnd: document.getElementById('actions').getBoundingClientRect().bottom + window.scrollY,
      primary: box('primary'),
      secondary: box('secondary'),
      level: document.getElementById('doneness').value,
      row: {
        stacked: probeCancel.top >= probeMain.bottom - 0.5,
        main: Math.max(...[...probe.querySelectorAll('.sizer--main')].map(own)),
        gap: parseFloat(st.columnGap) || 0,
        cancel: probeCancel.width,
        room: probe.clientWidth - (parseFloat(st.paddingLeft) || 0) - (parseFloat(st.paddingRight) || 0),
        words: [...probe.querySelectorAll('.sizer--main')].map((e) => e.textContent),
        cellWords: [...document.querySelectorAll('.buttons__widths .sizer--main')].map((e) => e.textContent),
      },
    };
  })()`);
}

/** The action directly under the time, above the slider (UI.md section 3). */
function actionUnderTime(l: Layout, when: string): void {
  check(l.readoutEnd <= l.top.actions && l.top.actions < l.top.doneness,
    `${when}: the action not between the time and the slider: readout ends ${l.readoutEnd}, action ${l.top.actions}, slider ${l.top.doneness}`);
}

/** The English the page shows for a key (copy/en.json). */
const EN = (JSON.parse(readFileSync('copy/en.json', 'utf8')) as { messages: Record<string, { text: string }> }).messages;

/** The coolings, by the radio that chooses each and the pull that names it. */
const COOLINGS = [
  { cooling: 'ice', radio: '#coolIce', pull: EN['action.pulled.ice'].text },
  { cooling: 'tap', radio: '#coolTap', pull: EN['action.pulled.tap'].text },
  { cooling: 'bowl', radio: '#coolBowl', pull: EN['action.pulled.bowl'].text },
  { cooling: 'counter', radio: '#coolCounter', pull: EN['action.pulled.counter'].text },
] as const;

/** The widths of the row with the main button and Cancel side by side. */
const need = (fit: RowFit): number => fit.main + fit.gap + fit.cancel;
const widthsSaid = (fit: RowFit): string => `the widest main button ${fit.main.toFixed(1)} + ${fit.gap} + Cancel `
  + `${fit.cancel.toFixed(1)} = ${need(fit).toFixed(1)} px in ${fit.room.toFixed(1)}`;

type Cooling = typeof COOLINGS[number];

/** The cooling `c` chosen while idle, and the row as it is then laid out. */
async function chooseCooling(tab: Tab, c: Cooling): Promise<RowFit> {
  await tab.click(c.radio);
  await tab.until(`__snap().settings.cooling === '${c.cooling}' && __snap().chosen !== null`, `${c.cooling} chosen`);
  await tab.settle();
  return (await layout(tab)).row;
}

/** The row sized on the cooling chosen, as iOS's is (UI.md section 9): at a
 *  screen `width` px wide, idle, each cooling in turn, the sizers carry its
 *  pull and no other, and the row stacks exactly where those words and
 *  Cancel do not fit. Then at a width between running water's need and the
 *  ice bath's, read from the fonts this machine has, running water stacks
 *  and the ice bath does not. Left at `width` with the ice bath. */
async function rowFollowsCooling(tab: Tab, width: number): Promise<string> {
  const fits: Record<string, RowFit> = {};
  for (const c of COOLINGS) {
    const fit = await chooseCooling(tab, c);
    fits[c.cooling] = fit;
    const pulls = COOLINGS.filter((o) => fit.words.includes(o.pull)).map((o) => o.cooling);
    check(pulls.length === 1 && pulls[0] === c.cooling, `${c.cooling}: the row sized on the pulls ${pulls.join(', ')}: ${fit.words.join(' | ')}`);
    check(fit.words.length === 4 && JSON.stringify(fit.cellWords) === JSON.stringify(fit.words),
      `${c.cooling}: the probe on ${fit.words.join(' | ')}, the main button's cell on ${fit.cellWords.join(' | ')}`);
    check(near(need(fit), fit.room, 1) || fit.stacked === need(fit) > fit.room,
      `${c.cooling} ${fit.stacked ? 'stacked' : 'side by side'} at ${width} px: ${widthsSaid(fit)}`);
  }
  const ice = fits['ice'];
  const tap = fits['tap'];
  check(need(tap) > need(ice) + 4, `running water needs more than the ice bath: ${need(tap).toFixed(1)}, ${need(ice).toFixed(1)}`);
  // The row's room moves with the screen's width, px for px.
  const between = Math.round(width + (need(ice) + need(tap)) / 2 - ice.room);
  await tab.viewport(between);
  const iceThere = await chooseCooling(tab, COOLINGS[0]);
  check(!iceThere.stacked, `the ice bath at ${between} px stacked: ${widthsSaid(iceThere)}`);
  const tapThere = await chooseCooling(tab, COOLINGS[1]);
  check(tapThere.stacked, `running water at ${between} px side by side: ${widthsSaid(tapThere)}`);
  await tab.viewport(width);
  await chooseCooling(tab, COOLINGS[0]);
  const at = (c: string): string => `${c} ${need(fits[c]).toFixed(1)}${fits[c].stacked ? ' stacked' : ''}`;
  return `at ${width} px ${COOLINGS.map((c) => at(c.cooling)).join(', ')} in ${ice.room.toFixed(1)}; `
    + `at ${between} px the ice bath one row and running water stacked`;
}

/** One layout from idle to Done at a screen `width` px wide, for a cook
 *  cooled as `cooling`: in every phase the action is under the time, as
 *  tall as at idle, and what is under it as far below it. The row of
 *  buttons is side by side or stacked as the widest main button and Cancel
 *  fit or not, which turns on the fonts the machine has (GitHub's Linux
 *  Chrome sets the words wider than a Mac's): the page's own choice is
 *  read, checked against the widths, and held to `want` if given. Side by
 *  side, Cancel is on the main button's left and nothing is left empty
 *  under the row; stacked, Cancel is under it, and its room is kept at
 *  idle, so only the block's height is held. First, the row follows the
 *  cooling chosen (`rowFollowsCooling`). */
function oneLayout(width: number, want: 'side by side' | 'stacked' | null, cooling: Cooling = COOLINGS[0]): Scenario['run'] {
  return async (h) => {
    const tab = await h.ctx.open(STOPPED);
    await tab.viewport(width);
    await tab.until("__snap().chosen !== null", 'the time decided');
    await tab.settle();
    const coolings = await rowFollowsCooling(tab, width);
    await chooseCooling(tab, cooling);
    const idle = await layout(tab);
    const fit = idle.row;
    const stacked = fit.stacked;
    const widths = widthsSaid(fit);
    // The row stacks where the two do not fit, and only there.
    check(near(need(fit), fit.room, 1) || stacked === need(fit) > fit.room,
      `${stacked ? 'stacked' : 'side by side'} at ${width} px: ${widths}`);
    check(want === null || want === (stacked ? 'stacked' : 'side by side'),
      `${stacked ? 'stacked' : 'side by side'} at ${width} px, not ${want}: ${widths}`);
    const seen: [string, Layout][] = [['idle', idle]];
    let s = await start(tab, 'cold');
    await tab.until('__snap().deadlines !== null', 'planned');
    await tab.settle();
    const heating = await layout(tab);
    seen.push(['HEATING', heating]);
    check(heating.level === String(s.cook?.choices.level), `the slider at the cook's level: ${heating.level}`);
    await tab.shift(300);
    s = await boil(tab);
    for (const want of ['COOKING', 'PULL', 'COOLING', 'DONE']) {
      if (want === 'PULL') await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      if (want === 'COOLING') await tab.click('#primary');
      if (want === 'DONE') await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      s = await tab.phase(want);
      await tab.settle();
      seen.push([want, await layout(tab)]);
    }
    const block = (l: Layout): number => l.actionsEnd - l.top.actions;
    for (const [when, l] of seen) {
      check(l.row.stacked === stacked, `${when}: the row ${l.row.stacked ? 'stacked' : 'side by side'}, idle's not`);
      check(l.shown.every((x) => x.visible), `${when}: ${JSON.stringify(l.shown)}`);
      actionUnderTime(l, when);
      // Nothing under the block moves: the block is as tall as at idle, and
      // the slider, the sentence and the egg as far under its top.
      check(near(block(l), block(idle), 1), `${when}: the action ${block(l)} px tall, idle ${block(idle)}`);
      for (const id of ['doneness', 'sentence', 'eggSection'] as const) {
        check(near(l.top[id] - l.top.actions, idle.top[id] - idle.top.actions, 1),
          `${when}: ${id} moved under the action: ${idle.top[id] - idle.top.actions} -> ${l.top[id] - l.top.actions} px`);
      }
      if (!stacked && l.primary !== null) {
        check(near(l.actionsEnd, l.primary.bottom, 1), `${when}: ${l.actionsEnd - l.primary.bottom} px empty under the row`);
      }
    }
    const p = heating.primary;
    const c = heating.secondary;
    check(p !== null && c !== null, 'Heating: the main button and Cancel');
    if (p !== null && c !== null) {
      check(stacked ? c.top >= p.bottom : c.left < p.left && c.top < p.bottom,
        `Heating at ${width} px: Cancel at ${c.left},${c.top}, the main button at ${p.left},${p.top} to ${p.bottom}`);
    }
    return `${width} px, ${cooling.cooling}, ${stacked ? 'stacked' : 'side by side'} (${widths}): the action ${block(idle).toFixed(0)} px tall, `
      + `the slider ${(idle.top.doneness - idle.top.actions).toFixed(0)} px under its top, idle to Done; the row by cooling: ${coolings}`;
  };
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
  await tab.until(`await (async () => { const s = __snap(); const c = s.storedCook;
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

/** The setup sentence's words, and its start clause's, as they read: a
 *  measure's no-break space as a space (`asRead`). */
async function sentenceSays(tab: Tab): Promise<{ sentence: string; clause: string }> {
  const said = await tab.eval<{ sentence: string; clause: string }>(`(() => ({
    sentence: document.getElementById('sentence').textContent,
    clause: document.querySelector('#sentence .clause[aria-controls="panelStart"]').textContent }))()`);
  return { sentence: asRead(said.sentence), clause: asRead(said.clause) };
}

/** A person's next tap, a few seconds on. */
async function later(tab: Tab): Promise<void> {
  await tab.shift(3);
}

function storedCook(s: Snap): Cook | null {
  return s.storedCook;
}

/** A second tab opened beside one that owns the app: it boots only as far
 *  as the note that the app is open in another tab (owner.ts). */
async function opened(h: Harness, path: string): Promise<Tab> {
  const tab = await h.ctx.open(path, h.origin, { boot: false });
  await tab.until("document.body.dataset.tab === 'waiting' && !document.getElementById('tabNote').hidden",
    'the note that the app is open in another tab');
  return tab;
}

/** Every key the page's storage holds, with its value, in order. */
const DUMP = 'JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]))';

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
      const pans = pansIn(await tab.storage(BOIL_KEY));
      check(Object.keys(pans).length === 1, `the pan remembered: ${JSON.stringify(pans)}`);
      const cooked_s = (s.now_ms - (cook?.startedAt_s ?? 0) * 1000) / 1000;
      return `${(cooked_s / 60).toFixed(1)} min of cook in ${((Date.now() - real0) / 1000).toFixed(1)} s; `
        + `recommended ${rec.recommended_s.toFixed(1)} s, pan ${JSON.stringify(pans)}`;
    },
  },

  'one-layout': {
    what: 'one layout from idle to Done at 390 px; the action under the time, nothing below it moving; Cancel beside the main button and nothing empty under the row, or, where the fonts set the words too wide for that, the two stacked; the row sized on the chosen cooling\'s pull alone',
    run: oneLayout(390, null),
  },

  'one-layout-narrow': {
    what: 'at 320 px, cooled in a bowl of water, the main button and Cancel stack, and the action keeps its height from idle to Done, so nothing below it moves; the row sized on the chosen cooling\'s pull alone',
    // The bowl: its pull stacks at 320 px in every font, by 54 px in
    // Apple's; the ice bath fits there in Apple's by 2 px.
    run: oneLayout(320, 'stacked', COOLINGS[2]),
  },

  'egg-readings': {
    what: 'the egg aimed for at idle (softer and firmer differ), the live egg from raw at the start, the egg as it ran at Done',
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

  'likely-band': {
    what: 'UI.md 8: the bracket is heavier over the most likely word\'s band, the thumb inside it when that is the word asked (the owner\'s Heating)',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      // Where the bracket and its heavy stretch are drawn, as levels: their
      // edges over the width the slider's levels span (styles.css insets
      // the bracket's row as the track is).
      const drawn = async (): Promise<{ bracket: [number, number]; band: [number, number] }> => tab.eval(`(() => {
        const row = document.querySelector('.slider__range').getBoundingClientRect();
        const at = (id) => { const r = document.getElementById(id).getBoundingClientRect();
          return [(r.left - row.left) / row.width, (r.right - row.left) / row.width]; };
        return { bracket: at('donenessBracket'), band: at('donenessLikelyBand') };
      })()`);
      const seen: string[] = [];
      let differs = 0;
      const bandAt = async (level: number, s: Snap): Promise<void> => {
        const w = s.certainty?.words;
        if (w === undefined) throw new Failure(`no certainty at ${level}`);
        const { bracket, band } = await drawn();
        const want = [wordBandLow(w.mostLikely), wordBandHigh(w.mostLikely)];
        // A pixel of the row is about 0.003 of it on a phone.
        check(near(band[0], want[0]!, 0.004) && near(band[1], want[1]!, 0.004),
          `at ${level} the band is ${band.map((x) => x.toFixed(3))}, not word ${w.mostLikely}'s ${want}`);
        check(band[0] >= bracket[0] - 1e-3 && band[1] <= bracket[1] + 1e-3,
          `at ${level} the band ${band.map((x) => x.toFixed(3))} overruns the bracket ${bracket.map((x) => x.toFixed(3))}`);
        if (w.mostLikely === w.asked) {
          check(band[0] <= level && level <= band[1], `at ${level} the most likely word is the word asked, and the thumb is outside its band`);
        } else {
          differs += 1;
        }
        seen.push(`${level}: ${w.mostLikely}${w.mostLikely === w.asked ? '' : ` (asked ${w.asked})`}`);
      };
      // The owner's: a 68 g egg at room temperature, cold start, under cold
      // running water, the slider at 0.30, 5:08 into the heating. The
      // certainty is the plan's, so it is read while the cook runs.
      await pick(tab, '#size', '2');
      await tab.click('#tempRoom');
      await tab.click('#coolTap');
      await setSlider(tab, 0.3);
      await tab.until(`await (async () => { const st = __snap();
        return st.chosen !== null && st.chosen.level === 0.3 && st.settings.cooling === 'tap'; })()`, 'the owner\'s egg decided');
      let s = await start(tab, 'cold');
      check(s.settings.sizeIndex === 2 && s.settings['startTempMode'] === 'room', `the owner's egg: ${JSON.stringify(s.settings)}`);
      await tab.until('__snap().deadlines !== null', 'planned');
      await tab.shift(308);
      await tab.settle();
      s = await tab.phase('HEATING');
      await bandAt(0.3, s);
      const owner = s.subline;
      // Then the default, and on through a level whose most likely word is
      // firmer than the word asked.
      for (const level of [0.41, 0.5, 0.6, 0.85]) {
        await later(tab);
        await setSlider(tab, level);
        s = await corrected(tab, s);
        await tab.settle();
        await bandAt(level, await tab.snap());
      }
      check(differs > 0 && differs < seen.length, `the most likely word never came apart from the word asked and back: ${seen.join(', ')}`);
      return `${owner}; ${seen.join(', ')}`;
    },
  },

  'owner-case': {
    what: 'boiling corrected to cold after Start, as the owner needed: back to Heating, the pull later, the settings follow',
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
      const settings = JSON.parse((await tab.storage(SETTINGS_KEY)) ?? '{}') as { startMode?: string };
      check(settings.startMode === 'cold', `the next cook's setting: ${settings.startMode}`);
      // Picked back up after a reload, as corrected.
      await tab.reload();
      s = await tab.phase('HEATING');
      check(near(deadlines(s).cookEnd_s, pull1, 1e-6), `reloaded: ${(deadlines(s).cookEnd_s - pull1).toFixed(3)} s`);
      return `Heating again; the pull ${(pull1 - pull0).toFixed(0)} s later; settings say cold; the same after a reload`;
    },
  },

  'cold-to-hot-after-tap': {
    what: 'cold corrected to boiling after the boil was pressed: the tap kept, unread, the pot a boiling start',
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
    what: 'a heavier egg mid-cook pulls later, a lighter one sooner; each a correction, committed after the settle',
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
    what: 'a correction that makes the egg overdue rings at once; changed back within the grace, the pull is cancelled',
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
    what: 'a drag through an overdue level rings nothing before release; the egg shows the aim while held',
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
    what: "the start corrected in its clause's panel, a minute at a time, and stopped with its reason at now, the boil pressed, and two hours back",
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
    what: 'Settings is open while a cook runs; its water corrects the cook; the pull brings the egg back',
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
      const saved = JSON.parse((await tab.storage(SETTINGS_KEY)) ?? '{}') as { waterLitres?: number };
      check(saved.waterLitres === 1, `the next cook's water: ${saved.waterLitres}`);
      await tab.shiftTo(pull1 + 1);
      await tab.phase('PULL');
      await tab.until("document.body.dataset.view === 'egg'", 'the egg\'s page at the pull');
      return `water 2 → 1 L: the pull ${(pull1 - pull0).toFixed(1)} s; the egg's page at the pull`;
    },
  },

  'record-corrected-at-done': {
    what: 'a correction at Done changes the record, planned on the calibration before this egg: changed back, the record is the first to the bit',
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
    what: 'after the pull the slider only previews: no correction, no record changed, and back to the level the egg ran at',
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
    what: 'a correction after the grace ran out asks "still in the water?"; nothing past it rings or shows; each answer',
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
    what: 'corrected to cold and left heating, the slow hob counts the time heated up; a correction the white never sets in says so',
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

  'later-answer-refolds': {
    what: 'an answer after a correction at Done, when the egg cannot be folded again from before it, folds the whole log again rather than being refused',
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
      await tab.until('__snap().eggsLogged === 1 && __snap().eggsBehind === 0', 'Jammy folded');
      const first = JSON.stringify((await tab.snap()).log[0].egg);
      // A correction at Done: the egg logged is replaced, and the log folded
      // again from its start, so the fold before this egg is gone.
      await later(tab);
      await pick(tab, '#size', '3');
      await tab.until(`await (async () => { const s = __snap(); return s.log.length === 1 && s.eggsBehind === 0
        && JSON.stringify(s.log[0].egg) !== ${JSON.stringify(first)}; })()`, 'the corrected egg logged and folded');
      // The white, answered after it: it cannot be folded from the fold
      // before this egg, so the whole log is folded again with it.
      await later(tab);
      await tab.click('.wb[data-white="firm"]');
      await tab.until("__snap().log[0].white === 'firm' && __snap().eggsBehind === 0", 'Firm logged and folded');
      s = await tab.snap();
      check(s.log.length === 1, `one egg: ${s.log.length}`);
      check(s.log[0].yolkWord === 'jammy' && s.log[0].white === 'firm', `both answers kept: ${s.log[0].yolkWord}, ${s.log[0].white}`);
      check(s.eggsLogged === 1, `folded once, from the start: ${s.eggsLogged}`);
      check(s.feedback, 'the questions stay, the answer taken');
      check(await tab.eval<boolean>(`document.querySelector('.wb[data-white="firm"]').getAttribute('aria-pressed') === 'true'`),
        'Firm settled as said');
      return `Jammy, a correction (${first} became ${JSON.stringify(s.log[0].egg)}), then Firm: both in the log, folded from the start`;
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
      const saved = JSON.parse((await tab.storage(SETTINGS_KEY)) ?? '{}') as { sizeIndex?: number };
      check(saved.sizeIndex === 3, `the next cook's egg: ${saved.sizeIndex}`);
      // Two changes in a row with no pointer, as a keyboard makes them.
      await later(tab);
      const w0 = (await tab.writes()).length;
      await pick(tab, '#size', '1');
      await tab.click('#coolTap');
      await tab.until("__snap().storedCook?.choices.cooling === 'tap'", 'the second committed');
      await tab.settle();
      const cooks = (await tab.writes()).slice(w0).filter((w) => w.key === COOK_KEY)
        .map((w) => cookIn(w.value)?.choices).filter((c) => c !== undefined);
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

  bowl: {
    what: 'a bowl of water: chosen, its water, the count and the temperature set; the sentence, the plan, the pull, the cooling and the record',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await tab.click('#startHot');
      await tab.until("__snap().settings.startMode === 'hot' && __snap().chosen !== null", 'a hot start decided');
      const minutes = (digits: string): number => {
        const [m, sec] = digits.split(':').map(Number);
        return 60 * m + sec;
      };
      const ice = minutes((await tab.snap()).digits);
      // The bowl and its numbers, each as typed into its field.
      const type = async (id: string, value: string, settled: string): Promise<void> => {
        await tab.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)});
          e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await tab.until(settled, `${id} at ${value}`);
      };
      await tab.click('#sentence .clause[aria-controls="panelCooling"]');
      await tab.click('#coolBowl');
      await tab.until("__snap().settings.cooling === 'bowl'", 'the bowl chosen');
      const shown = await tab.eval<{ bowl: boolean; water: boolean; placeholder: string }>(`(() => ({
        bowl: !document.getElementById('bowlFields').hidden, water: !document.getElementById('coolingWaterField').hidden,
        placeholder: document.getElementById('coolingWater').placeholder }))()`);
      check(shown.bowl && shown.water && shown.placeholder === '20',
        `the bowl's rows, its temperature greyed at the room: ${JSON.stringify(shown)}`);
      await type('bowlLitres', '1', '__snap().settings.bowlLitres === 1');
      await type('eggCount', '4', '__snap().settings.eggCount === 4');
      await type('coolingWater', '12', '__snap().settings.bowlWater_C === 12');
      await tab.settle();
      await tab.until('__snap().chosen !== null', 'the bowl decided');
      let s = await tab.snap();
      const { sentence } = await sentenceSays(tab);
      check(sentence.startsWith('4 × 68 g eggs') && sentence.includes('then into a bowl with 1 L of water at 12 °C.'),
        `the sentence: ${sentence}`);
      const bowl = minutes(s.digits);
      check(bowl < ice && ice - bowl < 60, `the bowl cooks shorter than ice, by seconds: ${bowl} s against ${ice} s`);
      // In, out at the pull, into the bowl.
      await tab.click('#primary');
      await tab.phase('COOKING');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      const ch = s.cook?.choices as unknown as Record<string, unknown>;
      check(ch['cooling'] === 'bowl' && ch['bowlLitres'] === 1 && ch['bowlWater_C'] === 12 && ch['eggCount'] === 4,
        `the cook's own bowl: ${JSON.stringify(ch)}`);
      const d = deadlines(s);
      await tab.shiftTo(d.cookEnd_s + 2);
      s = await tab.phase('PULL');
      check(s.primary === 'In the bowl of water', `the pull: ${s.primary}`);
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      check(s.label === 'Leave them in the bowl', `the cooling: ${s.label}`);
      const d2 = deadlines(s);
      const counted = d2.coolEnd_s - (storedCook(s)?.events.pulled?.out_s ?? NaN);
      check(counted > 120 && counted < 600, `the cooling counted to the yolk's peak in the bowl: ${counted.toFixed(0)} s`);
      await tab.shiftTo(d2.coolEnd_s + 1);
      await tab.phase('DONE');
      await tab.click('#primary');
      await tab.until('__snap().log.length === 1', 'the egg logged');
      s = await tab.snap();
      const setup = (s.log[0] as unknown as { setup: Record<string, unknown> }).setup;
      check(setup['cooling'] === 'bowl' && setup['bowlLitres'] === 1 && setup['coolingWater_C'] === 12 && setup['eggCount'] === 4,
        `the record's bowl: ${JSON.stringify(setup)}`);
      return `ice ${ice} s, the bowl ${bowl} s; cooling counted ${counted.toFixed(0)} s; recorded in 1 L at 12 °C`;
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
      check((await tab.storage(BOIL_KEY)) === null, 'no boil to remember');
      s = await start(tab, 'cold');
      await tab.shift(300);
      s = await boil(tab);
      await tab.click('#secondary');
      s = await tab.phase('IDLE');
      check(s.stored === null && s.log.length === 0, 'Cancel while cooking: nothing logged');
      const pans = pansIn(await tab.storage(BOIL_KEY));
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
        const o = JSON.parse(localStorage.getItem('${COOK_KEY}'));
        const c = o.cook;
        c.id_ms -= ${D * 1000};
        // The press and its start; the log is read, the rest folded from it.
        c.start.at_s -= ${D};
        for (const e of c.log) if (typeof e.at_s === 'number') e.at_s -= ${D};
        localStorage.setItem('${COOK_KEY}', JSON.stringify(o));
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

  'newer-version-tab': {
    what: 'a tab waiting for the app writes no mark; the tab that owns it stops writing at its next write once a newer build has marked the storage',
    run: async (h) => {
      const a = await h.ctx.open(STOPPED);
      check((await a.storage(NEWEST_KEY)) !== null, 'this build marked the storage first');
      check(await a.eval<boolean>("document.getElementById('newerNote').hidden"), 'no line while this build is the newest');
      const before = await a.eval<string>(DUMP);
      const b = await opened(h, STOPPED);
      check((await b.writes()).length === 0 && (await b.eval<string>(DUMP)) === before, 'the waiting tab wrote nothing, no mark');
      // A newer build has run since: the mark is all this build can see of it.
      await b.eval(`localStorage.setItem('${NEWEST_KEY}', '9.0.0')`);
      const n0 = (await a.writes()).length;
      await pick(a, '#size', '3');
      await a.settle();
      await a.until("!document.getElementById('newerNote').hidden", 'the line, at the next write');
      const after = (await a.writes()).slice(n0);
      check(after.length === 0, `not one write after: ${after.map((w) => w.key).join(', ')}`);
      return `the waiting tab wrote nothing; the owner shows the line at its next write and writes nothing (${n0} writes before)`;
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
