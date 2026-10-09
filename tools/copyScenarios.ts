/**
 * Every word the web app puts on screen, in every state worth reaching: the
 * copy capture's scenarios, run by the one harness (tools/harness.ts) as
 * e2e scenarios (`npm run e2e -- copy/`) and written out by
 * `copySnapshot.js capture`.
 *
 * It is the proof that a change touched no wording: capture the build before
 * and the build after, and the two must be identical. Each scenario plants
 * its settings, opens the app on the development clock stopped at a
 * Saturday morning, 7:30 in London (the time zone pinned, so a time of day
 * is the same on any machine), with its one random draw seeded (the nudge),
 * and steps; after the boot and after every step it waits for the app to
 * have nothing in hand (`aetTest.whenIdle`) and captures:
 *
 *   - body.innerText, which is what is rendered and visible;
 *   - every text node in the body, whitespace collapsed, visible or not, so a
 *     string sitting in a hidden element is compared too;
 *   - aria-valuetext, aria-label, title, placeholder and alt attributes;
 *   - <html lang> and document.title.
 *
 * The development clock's mark is not the app's, and is left out.
 */

import { Failure, Harness, Scenario, Snap, Tab } from './harness.js';

/** One state's words, as `copySnapshot.js compare` reads them. */
export interface CopyState {
  name: string;
  lang: string;
  title: string;
  innerText: string;
  texts: string[];
  attrs: string[];
}

/** A Saturday morning, 7:30, where the time zone is pinned. */
const T0 = '2026-09-26T07:30:00+01:00';
const ZONE = 'Europe/London';
/** The nudge's draw, seeded. */
const SEED = 0x2545f491;

/** The page's words now (run in the page). */
const CAPTURE = `(() => {
  const mark = document.getElementById('devClock');
  if (mark !== null) mark.remove();
  const d = document;
  const texts = [];
  const walker = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    if (n.parentElement && n.parentElement.tagName === 'SCRIPT') continue;
    const s = n.nodeValue.replace(/\\s+/g, ' ').trim();
    if (s !== '') texts.push(s);
  }
  const attrs = [];
  for (const el of d.querySelectorAll('*')) {
    for (const a of ['aria-valuetext', 'aria-label', 'title', 'placeholder', 'alt']) {
      if (el.hasAttribute(a)) attrs.push((el.id || el.tagName.toLowerCase()) + ' ' + a + '=' + el.getAttribute(a));
    }
  }
  const out = { lang: d.documentElement.lang, title: d.title, innerText: d.body.innerText, texts: texts, attrs: attrs };
  if (mark !== null) d.body.append(mark);
  return out;
})()`;

/* ------------------------------------------------------------------ steps */

interface Step {
  name: string;
  run: (tab: Tab) => Promise<void>;
}

function plan(s: Snap): NonNullable<Snap['deadlines']> {
  if (s.deadlines === null) throw new Failure('no plan to step to');
  return s.deadlines;
}

const click = (sel: string): Step => ({ name: `click ${sel}`, run: (tab) => tab.click(sel) });
const advance = (s: number): Step => ({ name: `+${s}s`, run: (tab) => tab.shift(s) });
const toPull: Step = { name: 'to pull', run: async (tab) => tab.shiftTo(plan(await tab.snap()).cookEnd_s + 3) };
/** A countdown left at exactly `s` seconds, for the spoken forms. */
const toLeft = (s: number): Step => ({
  name: `${s}s left`, run: async (tab) => tab.shiftTo(plan(await tab.snap()).cookEnd_s - s),
});
const toCoolEnd: Step = {
  name: 'to cool end',
  run: async (tab) => {
    const end = plan(await tab.snap()).coolEnd_s;
    if (end === null) throw new Failure('no cooling to end');
    await tab.shiftTo(end + 1);
  },
};
const reopen: Step = { name: 'reload', run: (tab) => tab.reload() };
/** Sous-vide chosen, as a tap does: it is never stored, so it cannot be
 *  planted, and a reload comes back to the pan. */
const sousVide: Step = {
  name: 'sous-vide',
  run: async (tab) => {
    await tab.click('#startSous');
    await tab.until("__snap().settings.startMode === 'sous'", 'sous-vide chosen');
  },
};
/** Wait until the feedback fold is done: no note says "learning…". */
const learned: Step = {
  name: 'learned',
  run: (tab) => tab.until("!document.getElementById('calibNote').textContent.includes('…')", 'the fold done'),
};

/* -------------------------------------------------------------- scenarios */

interface CopyScenario {
  name: string;
  /** navigator.language: it picks the carton's size classes (region US gets
   *  the American ones). en-GB unless given. */
  lang?: string;
  settings: Record<string, unknown>;
  boil?: Record<string, number>;
  steps: Step[];
}

const cookThrough = [
  click('#primary'), advance(400), click('#primary'), advance(60), toPull,
  click('#primary'), toCoolEnd,
  click('button.fb[data-yolk="soft"]'), learned,
  click('button.wb[data-white="runny"]'), learned,
  click('#primary'),
];

const SCENARIOS: CopyScenario[] = [
  { name: 'idle default', settings: {}, steps: [click('#mute')] },
  { name: 'idle hot', settings: { startMode: 'hot' }, steps: [] },
  { name: 'US carton', lang: 'en-US', settings: {}, steps: [] },
  { name: 'US carton, Jumbo', lang: 'en-US', settings: { sizeIndex: 4 }, steps: [] },
  { name: 'EU carton, stored Jumbo', settings: { sizeIndex: 4 }, steps: [] },
  { name: 'idle hot standing', settings: { startMode: 'hot', afterBoil: 'off' }, steps: [] },
  { name: 'idle cold standing', settings: { afterBoil: 'off' }, steps: [] },
  { name: 'idle soft', settings: { startMode: 'hot', doneness: 0.22 }, steps: [] },
  { name: 'idle fudgy', settings: { startMode: 'hot', doneness: 0.62 }, steps: [] },
  { name: 'idle hard', settings: { startMode: 'hot', doneness: 1 }, steps: [] },
  { name: 'idle runny hot', settings: { startMode: 'hot', doneness: 0 }, steps: [] },
  { name: 'refusal ice', settings: { sizeIndex: 0, startTempMode: 'room', waterLitres: 0.5, eggCount: 1, doneness: 0 }, steps: [] },
  { name: 'refusal tap', settings: { sizeIndex: 0, cooling: 'tap', waterLitres: 0.5, eggCount: 1, doneness: 0 }, steps: [] },
  { name: 'refusal counter', settings: { sizeIndex: 0, cooling: 'counter', waterLitres: 0.5, eggCount: 1, doneness: 0 }, steps: [] },
  { name: 'refusal hardest', settings: { sizeIndex: 3, afterBoil: 'off', waterLitres: 0.5, eggCount: 1, doneness: 1 }, steps: [] },
  { name: 'refusal hardest 0.75 L', settings: { sizeIndex: 0, afterBoil: 'off', waterLitres: 0.75, eggCount: 2, doneness: 1 }, boil: { '0.8': 300 }, steps: [] },
  { name: 'refusal hardest 1 L', settings: { sizeIndex: 0, afterBoil: 'off', waterLitres: 1, eggCount: 1, doneness: 1 }, boil: { '1.0': 300 }, steps: [] },
  { name: 'white never sets', settings: { sizeIndex: 0, startMode: 'hot', afterBoil: 'off', waterLitres: 0.5, eggCount: 1, doneness: 0 }, steps: [] },
  { name: 'custom temp, measured egg', settings: { startTempMode: 'custom', customStart_C: 15, sizeIndex: -1, customMinor_mm: 45 }, steps: [] },
  { name: 'room temp', settings: { startTempMode: 'room' }, steps: [] },
  { name: 'pan remembered', settings: {}, boil: { '2.0': 480 }, steps: [] },
  { name: 'pan remembered, hot standing', settings: { startMode: 'hot', afterBoil: 'off' }, boil: { '2.0': 480 }, steps: [] },
  { name: 'sous-vide jammy', settings: {}, steps: [sousVide] },
  { name: 'sous-vide 0.8', settings: { doneness: 0.8 }, steps: [sousVide] },
  { name: 'sous-vide 0.9', settings: { doneness: 0.9 }, steps: [sousVide] },
  { name: 'sous-vide hard', settings: { doneness: 1 }, steps: [sousVide] },
  // A time of day and numbers in a 12-hour, comma-grouped locale.
  { name: 'sous-vide jammy, en-US', lang: 'en-US', settings: {}, steps: [sousVide] },
  { name: 'sous-vide hard, en-US', lang: 'en-US', settings: { doneness: 1 }, steps: [sousVide] },
  // The spoken countdown at one of each, so "1 seconds" would show.
  {
    name: 'hot cook, spoken at 61 s and 1 s',
    settings: { muted: true, startMode: 'hot' },
    steps: [click('#primary'), toLeft(61), toLeft(60), toLeft(1)],
  },
  {
    name: 'cold cook, twice, then forget',
    settings: { muted: true },
    steps: [...cookThrough, ...cookThrough, click('#forget'), click('#forgetYes')],
  },
  {
    // The note after an answer says thanks, and the count waits for the next
    // egg's questions. A third egg is what puts "N eggs", plural, on screen.
    name: 'cold cook, three times',
    settings: { muted: true },
    steps: [...cookThrough, ...cookThrough, ...cookThrough],
  },
  {
    name: 'cold cook, reloaded mid-cook',
    settings: { muted: true },
    steps: [click('#primary'), advance(30), reopen, click('#primary'), advance(30), reopen, toPull, reopen, click('#primary'), reopen, toCoolEnd, reopen],
  },
  {
    name: 'hot soft, tap, white question',
    settings: { muted: true, startMode: 'hot', cooling: 'tap', doneness: 0.22 },
    steps: [click('#primary'), advance(30), toPull, click('#primary'), toCoolEnd,
      click('button.fb[data-yolk="fudgy"]'), learned,
      click('button.wb[data-white="firm"]'), learned, click('#primary')],
  },
  {
    name: 'hot soft, the white alone, then a reload',
    settings: { muted: true, startMode: 'hot', doneness: 0.22 },
    steps: [click('#primary'), toPull, click('#primary'), toCoolEnd,
      click('button.wb[data-white="tender"]'), learned,
      reopen, click('#primary')],
  },
  {
    name: 'hot jammy, the white and then the yolk',
    settings: { muted: true, startMode: 'hot' },
    steps: [click('#primary'), toPull, click('#primary'), toCoolEnd,
      click('button.wb[data-white="firm"]'), learned,
      click('button.fb[data-yolk="jammy"]'), learned, click('#primary')],
  },
  {
    name: 'hot runny, white question',
    settings: { muted: true, startMode: 'hot', doneness: 0 },
    steps: [click('#primary'), toPull, click('#primary'), toCoolEnd,
      click('button.fb[data-yolk="jammy"]'), learned,
      click('button.wb[data-white="runny"]'), learned],
  },
  {
    name: 'hot counter',
    settings: { muted: true, startMode: 'hot', cooling: 'counter', doneness: 0.62 },
    steps: [click('#primary'), advance(30), toPull, click('#primary'),
      click('button.fb[data-yolk="jammy"]'), learned, click('#primary')],
  },
  {
    name: 'cold standing, through',
    settings: { muted: true, afterBoil: 'off', cooling: 'tap' },
    steps: [click('#primary'), advance(400), click('#primary'), advance(30), toPull, click('#primary'), toCoolEnd],
  },
  {
    name: 'cold standing, cancel',
    settings: { muted: true, afterBoil: 'off' },
    steps: [click('#primary'), advance(30), click('#primary'), advance(30), click('#secondary')],
  },
];

async function words(tab: Tab, name: string): Promise<CopyState> {
  return { name: name, ...await tab.eval<Omit<CopyState, 'name'>>(CAPTURE) };
}

/** One scenario's states, in order: the app opened, then each step. */
async function capture(h: Harness, sc: CopyScenario): Promise<CopyState[]> {
  // The settings planted from a page of the site with no app on it, so the
  // app boots on them.
  const tab = await h.ctx.open('/privacy/', h.origin, { locale: sc.lang ?? 'en-GB', timezone: ZONE, boot: false });
  await tab.eval(`(() => { localStorage.clear();
    localStorage.setItem('aet.settings.v1', ${JSON.stringify(JSON.stringify(sc.settings))});
    ${sc.boil === undefined ? '' : `localStorage.setItem('aet.boil.v1', ${JSON.stringify(JSON.stringify(sc.boil))});`} })()`);
  await tab.goto(`${h.origin}/?clock=0&at=${encodeURIComponent(T0)}&seed=${SEED}`);
  await tab.settle();
  const out = [await words(tab, `${sc.name} / start`)];
  let i = 0;
  for (const step of sc.steps) {
    await step.run(tab);
    await tab.settle();
    i += 1;
    out.push(await words(tab, `${sc.name} / ${i} ${step.name}`));
  }
  return out;
}

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The copy capture as harness scenarios, `copy/<name>`, in order; each
 *  hands its states to `sink` as well as counting them. */
export function copyScenarios(sink: (states: CopyState[]) => void = () => undefined): Record<string, Scenario> {
  const out: Record<string, Scenario> = {};
  for (const sc of SCENARIOS) {
    out[`copy/${slug(sc.name)}`] = {
      what: `the words: ${sc.name}`,
      run: async (h) => {
        const states = await capture(h, sc);
        sink(states);
        return `${states.length} states`;
      },
    };
  }
  return out;
}
