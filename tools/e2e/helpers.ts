/**
 * What the e2e scenarios (tools/e2e.ts, and the areas under tools/e2e/)
 * share: where the page keeps its stores, the cook started and its boil
 * pressed, the one screen's layout read off the page, the controls moved as
 * a finger moves them, and a second tab opened.
 */

import { readFileSync } from 'node:fs';

import { readStoredCook } from '../../src/ui/storedCook.ts';
import type { ElementId } from '../../src/ui/dom.ts';
import { STORES } from '../../src/ui/stores.ts';
import {
  type Cook, Failure, type Harness, type Osc, type Scenario, type Selector, type Snap, Tab, WAIT_MS, byId, check,
} from '../harness.ts';
import { asRead } from '../text.ts';

/** Where the page keeps its stores (src/ui/stores.ts). */
export const COOK_KEY = STORES.cook.key;
export const SETTINGS_KEY = STORES.settings.key;
export const BOIL_KEY = STORES.boilMemory.key;

/** The pans a stored text holds: litres to the time to boil. */
export function pansIn(text: string | null): Record<string, number> {
  return ((JSON.parse(text ?? '{}') as { pans?: Record<string, number> }).pans) ?? {};
}

/** The cook a stored text reads as, folded from its log as the page reads
 *  it (the web's `readStoredCook`), or null. */
export function cookIn(text: string): Cook | null {
  return (readStoredCook(JSON.parse(text))?.cook ?? null) as Cook | null;
}

/** Every page but those checking the address or sharing: the clock stopped. */
export const STOPPED = '/?clock=0';

/** The rings among sounds made. */
export const rings = (os: Osc[]): Osc[] => os.filter((o) => o.kind === 'ring');

/** The alarm's ring scheduled ahead, not rung now (nor a blip). */
export const scheduledAhead = (o: Osc): boolean => o.kind === 'ring' && o.at !== null && o.at - o.made > 1;

/* ------------------------------------------------------------- the cook */

export const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

/** Start a cook from idle, once the time on screen is decided. */
export async function start(tab: Tab, mode: 'cold' | 'hot'): Promise<Snap> {
  if (mode === 'hot') {
    await tab.click('#startHot');
    await tab.until("__snap().settings.startMode === 'hot'", 'a hot start chosen');
  }
  await tab.until("__snap().chosen !== null", 'the time decided');
  await tab.click('#primary');
  return tab.phase(mode === 'cold' ? 'HEATING' : 'COOKING');
}

/** Rolling boil, tapped, and the measured pot's time decided. */
export async function boil(tab: Tab): Promise<Snap> {
  await tab.click('#primary');
  await tab.phase('COOKING');
  await tab.until('__snap().decided', 'the measured pot planned');
  return tab.snap();
}

export function deadlines(s: Snap): { cookEnd_s: number; coolEnd_s: number } {
  check(s.deadlines !== null, 'a plan');
  const d = s.deadlines as NonNullable<Snap['deadlines']>;
  return { cookEnd_s: d.cookEnd_s, coolEnd_s: d.coolEnd_s ?? NaN };
}

/** A box on the page, px from its top and left. */
export interface Box { top: number; bottom: number; left: number }

/** What the one screen shows: whether each of its parts is on screen, where
 *  the action, the slider, the sentence and the egg are, where the readout
 *  and the action end, the action's two buttons (null when not shown), and
 *  the slider's value. */
/** The parts of the one screen whose layout is read: those that must be
 *  shown, and those whose tops are compared. */
const SHOWN: ElementId[] = ['readout', 'digits', 'doneness', 'donenessPeak', 'sentence', 'eggSection', 'actions'];
const TOPS = ['actions', 'doneness', 'sentence', 'eggSection'] as const satisfies readonly ElementId[];

export interface Layout {
  shown: { id: ElementId; visible: boolean }[];
  top: Record<(typeof TOPS)[number], number>;
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
export interface RowFit {
  stacked: boolean; main: number; gap: number; cancel: number; room: number; words: string[]; cellWords: string[];
}

export async function layout(tab: Tab): Promise<Layout> {
  return tab.eval<Layout>(`(() => {
    const on = (id, e) => { const r = e.getBoundingClientRect();
      return { id: id, visible: r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' }; };
    const top = (e) => e.getBoundingClientRect().top + window.scrollY;
    const box = (e) => { const r = e.getBoundingClientRect();
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
      shown: [${SHOWN.map((id) => `on('${id}', ${byId(id)})`).join(', ')}],
      top: { ${TOPS.map((id) => `${id}: top(${byId(id)})`).join(', ')} },
      readoutEnd: ${byId('readout')}.getBoundingClientRect().bottom + window.scrollY,
      actionsEnd: ${byId('actions')}.getBoundingClientRect().bottom + window.scrollY,
      primary: box(${byId('primary')}),
      secondary: box(${byId('secondary')}),
      level: ${byId('doneness')}.value,
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
export function actionUnderTime(l: Layout, when: string): void {
  check(l.readoutEnd <= l.top.actions && l.top.actions < l.top.doneness,
    `${when}: the action not between the time and the slider: readout ends ${l.readoutEnd}, action ${l.top.actions}, slider ${l.top.doneness}`);
}

/** The English the page shows for a key (copy/en.json). */
export const EN = (JSON.parse(readFileSync('copy/en.json', 'utf8')) as { messages: Record<string, { text: string }> }).messages;

/** The coolings, by the radio that chooses each and the pull that names it. */
export const COOLINGS = [
  { cooling: 'ice', radio: '#coolIce', pull: EN['action.pulled.ice'].text },
  { cooling: 'tap', radio: '#coolTap', pull: EN['action.pulled.tap'].text },
  { cooling: 'bowl', radio: '#coolBowl', pull: EN['action.pulled.bowl'].text },
  { cooling: 'counter', radio: '#coolCounter', pull: EN['action.pulled.counter'].text },
  { cooling: 'eggCup', radio: '#coolEggCup', pull: EN['action.pulled.eggCup'].text },
] as const;

/** The widths of the row with the main button and Cancel side by side. */
export const need = (fit: RowFit): number => fit.main + fit.gap + fit.cancel;
export const widthsSaid = (fit: RowFit): string => `the widest main button ${fit.main.toFixed(1)} + ${fit.gap} + Cancel `
  + `${fit.cancel.toFixed(1)} = ${need(fit).toFixed(1)} px in ${fit.room.toFixed(1)}`;

export type Cooling = typeof COOLINGS[number];

/** The cooling `c` chosen while idle, and the row as it is then laid out. */
export async function chooseCooling(tab: Tab, c: Cooling): Promise<RowFit> {
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
export async function rowFollowsCooling(tab: Tab, width: number): Promise<string> {
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
export function oneLayout(width: number, want: 'side by side' | 'stacked' | null, cooling: Cooling = COOLINGS[0]): Scenario['run'] {
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
export async function setSlider(tab: Tab, level: number, release = true): Promise<void> {
  await tab.eval(`(() => { const e = ${byId('doneness')};
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
export async function drag(tab: Tab, levels: number[], release = false, press = true): Promise<void> {
  await tab.eval(`(() => { const e = ${byId('doneness')};
    const p = (type) => e.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, isPrimary: true }));
    if (${press}) p('pointerdown');
    for (const v of ${JSON.stringify(levels)}) { e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); }
    if (${release}) { p('pointerup'); e.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
}

/** A − or + tapped, not held: pressed and let go at once. */
export async function press<S extends string>(tab: Tab, selector: S & Selector<S>): Promise<void> {
  await tab.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)});
    const p = (type) => e.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, isPrimary: true }));
    p('pointerdown'); p('pointerup'); })()`);
}

/** A menu's option chosen, as a tap does (no finger held: it settles). */
export async function pick<S extends string>(tab: Tab, selector: S & Selector<S>, value: string): Promise<void> {
  await tab.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)});
    e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}

/** Wait for a correction to be committed and planned: the stored cook's
 *  `correctedAt_s` moved on from the last commit's (`after`, its snap; null
 *  for the cook's first). A cook's corrections are a person's taps apart, so
 *  each has its own stamp, which the record's remaking keys on: on a stopped
 *  clock, step it between them (`later`). */
export async function corrected(tab: Tab, after: Snap | null, ms = WAIT_MS): Promise<Snap> {
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
export async function panelStart(tab: Tab): Promise<string> {
  return tab.eval<string>(`(() => { const f = ${byId('startedAtField')};
    return f.hidden || f.offsetParent === null ? '' : ${byId('startedAt')}.textContent; })()`);
}

/** A moment, epoch s, as the page says a time of day. */
export async function clockAt(tab: Tab, at_s: number): Promise<string> {
  return tab.timeOfDay(at_s * 1000);
}

/** The setup sentence's words, and its start clause's, as they read: a
 *  measure's no-break space as a space (`asRead`). */
export async function sentenceSays(tab: Tab): Promise<{ sentence: string; clause: string }> {
  const said = await tab.eval<{ sentence: string; clause: string }>(`(() => ({
    sentence: ${byId('sentence')}.textContent,
    clause: ${byId('sentence')}.querySelector('.clause[aria-controls="panelStart"]').textContent }))()`);
  return { sentence: asRead(said.sentence), clause: asRead(said.clause) };
}

/** A person's next tap, a few seconds on. */
export async function later(tab: Tab): Promise<void> {
  await tab.shift(3);
}

export function storedCook(s: Snap): Cook | null {
  return s.storedCook;
}

/** A second tab opened beside one that owns the app: it boots only as far
 *  as the note that the app is open in another tab (owner.ts). */
export async function opened(h: Harness, path: string): Promise<Tab> {
  const tab = await h.ctx.open(path, h.origin, { boot: false });
  await tab.until(`document.body.dataset.tab === 'waiting' && !${byId('tabNote')}.hidden`,
    'the note that the app is open in another tab');
  return tab;
}

/** Every key the page's storage holds, with its value, in order. */
export const DUMP = 'JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]))';
