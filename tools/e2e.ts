/**
 * The web app driven end to end, in seconds: the checks that were done by
 * hand (design/running-cook-review.md, the LOGBOOK of 6 to 8 October), each
 * a named scenario with assertions on the page and on what it stored.
 *
 *   npm run e2e                      # build the site, then every scenario
 *   npm run e2e -- reload two-tabs   # only those named (after a build)
 *   node dist/tools/e2e.js --list
 *
 * It serves `_site/` with the sharing endpoint on a store in memory
 * (tools/devServer.ts), starts headless Chrome on a profile of its own
 * (tools/chrome.ts; CHROME names the binary) and opens each scenario in a
 * fresh browser context, so no scenario sees another's storage. Time is the
 * development clock (src/ui/now.ts): a scenario either runs fast
 * (`?clock=60`) or jumps (`aetClock.shift`), then tells the page to look
 * again with a `focus` event, as a tab coming back does. Sharing is checked
 * on the real clock, with the stored cook moved into the past, since nothing
 * is sent while the development clock is on.
 *
 * Each page gets, before the app runs, a count of the oscillators made and
 * when each is set to start on the audio clock (`__osc`), and of what it
 * wrote to localStorage (`__writes`). An exception thrown in a page fails
 * its scenario.
 */

import { ChildProcess, spawn } from 'node:child_process';

import { Browser, Cdp, launchChrome, sleep, waitForHttp } from './chrome.js';

const SITE_PORT = 9100 + Math.floor(Math.random() * 400);
const DEBUG_PORT = SITE_PORT + 1000;
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`;

/* ------------------------------------------------------------- the page */

/** Run in every page before the app: what the harness counts. */
const INSTRUMENT = `(() => {
  const osc = [];
  window.__osc = osc;
  const B = window.BaseAudioContext || window.AudioContext;
  if (B) {
    const make = B.prototype.createOscillator;
    B.prototype.createOscillator = function () {
      const o = make.call(this);
      const r = { made: this.currentTime, at: null, page: window.aetClock ? window.aetClock.now() : Date.now() };
      osc.push(r);
      const start = o.start;
      o.start = function (t) { r.at = t === undefined ? this.context.currentTime : t; return start.apply(this, arguments); };
      return o;
    };
  }
  const writes = [];
  window.__writes = writes;
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (this === window.localStorage) writes.push({ key: k, value: v });
    return set.call(this, k, v);
  };
  const ui = (name) => import('/app/src/ui/' + name + '.js');
  window.__e2e = {
    ui: ui,
    async snap() {
      const [st, now, cal, copy] = await Promise.all([ui('state'), ui('now'), ui('calibration'), ui('copy')]);
      const s = st.state;
      const t = now.nowMs();
      const el = (id) => document.getElementById(id);
      return {
        now_ms: t,
        phase: st.phaseNow(t),
        label: el('phaseLabel').textContent,
        digits: el('digits').textContent,
        subline: el('sublineText').textContent,
        primary: el('primary').hidden ? null : el('primary').textContent,
        feedback: !el('feedback').hidden,
        target: el('feedbackTarget').textContent,
        cook: s.cook,
        decided: s.plan !== null && s.plan.decided !== null,
        lengthened: s.plan !== null && s.plan.lengthened,
        deadlines: s.plan === null ? null : s.plan.deadlines,
        stored: localStorage.getItem('aet.cook.v4'),
        log: cal.keptState().log,
        eggsLogged: s.calib.eggsLogged,
        osc: window.__osc.length,
        labels: {
          heating: copy.t('readout.phase.heating'), pull: copy.t('readout.phase.pull'),
          done: copy.t('readout.phase.done'), coolingIce: copy.t('readout.phase.coolingIce'),
          cookingBoiling: copy.t('readout.phase.cookingBoiling'),
        },
      };
    },
  };
})();`;

interface Snap {
  now_ms: number;
  phase: string;
  label: string;
  digits: string;
  subline: string;
  primary: string | null;
  feedback: boolean;
  target: string;
  cook: Cook | null;
  decided: boolean;
  lengthened: boolean;
  deadlines: { cookEnd_s: number; coolEnd_s: number | null; provisional: boolean; outAt_s: number | null } | null;
  stored: string | null;
  log: Rec[];
  eggsLogged: number;
  osc: number;
  labels: Record<string, string>;
}

interface Cook {
  id_ms: number;
  startedAt_s: number;
  choices: { level: number; startMode: string; mass_kg: number; massFrom: string; waterLitres: number; cooling: string };
  firstHotAt_s: number | null;
  coldSince_s: number | null;
  correctedAt_s: number | null;
  events: {
    boilAt_s: number | null;
    pulled: { due_s: number; out_s: number; by: string; confirmed: boolean } | null;
    cooledAt_s: number | null;
    rangAt_s: number | null;
  };
  asRan: unknown;
}

interface Rec {
  id?: number | null;
  egg: unknown;
  level: number;
  recommended_s: number;
  pulledBy: string;
  yolkWord: string | null;
  white: string | null;
  forecast: unknown;
}

/** An oscillator made: when on the audio clock and on the page's clock, and
 *  when on the audio clock it is set to start. */
interface Osc { made: number; at: number | null; page: number }

/** The alarm's beeps scheduled ahead, not rung now (nor a blip). */
const scheduledAhead = (o: Osc): boolean => o.at !== null && o.at - o.made > 1;

class Failure extends Error {}

function check(cond: boolean, what: string): void {
  if (!cond) throw new Failure(what);
}

/** One page, attached on the browser's socket. */
class Tab {
  readonly errors: string[] = [];

  private cdp: Cdp;
  readonly session: string;
  readonly targetId: string;

  private constructor(cdp: Cdp, session: string, targetId: string) {
    this.cdp = cdp;
    this.session = session;
    this.targetId = targetId;
  }

  static async open(cdp: Cdp, contextId: string, url: string): Promise<Tab> {
    const { targetId } = await cdp.send('Target.createTarget', {
      url: 'about:blank', browserContextId: contextId,
    }) as { targetId: string };
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: targetId, flatten: true }) as {
      sessionId: string;
    };
    const tab = new Tab(cdp, sessionId, targetId);
    cdp.on((method, params, session) => {
      if (session !== sessionId || method !== 'Runtime.exceptionThrown') return;
      const d = (params as { exceptionDetails: { text: string; exception?: { description?: string } } }).exceptionDetails;
      tab.errors.push(d.exception?.description ?? d.text);
    });
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT }, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: false,
    }, sessionId);
    await tab.goto(url);
    return tab;
  }

  /** An expression's value in the page, awaited, as a user's gesture (so a
   *  click primes the audio, as the Start tap does). */
  async eval<T>(expression: string): Promise<T> {
    const r = await this.cdp.send('Runtime.evaluate', {
      expression: expression, awaitPromise: true, returnByValue: true, userGesture: true,
    }, this.session) as { result: { value?: unknown }; exceptionDetails?: { text: string; exception?: { description?: string } } };
    if (r.exceptionDetails !== undefined) {
      throw new Error(`in the page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    }
    return r.result.value as T;
  }

  /** Wait for an expression to be truthy. */
  async until(expression: string, what: string, ms = 20000): Promise<void> {
    const end = Date.now() + ms;
    let last = '';
    while (Date.now() < end) {
      try {
        if (await this.eval<boolean>(`(async () => !!(${expression}))()`)) return;
      } catch (e) {
        // The page between documents, most likely.
        last = e instanceof Error ? e.message : String(e);
      }
      await sleep(40);
    }
    throw new Failure(`waited ${ms / 1000} s for ${what}${last === '' ? '' : ` (${last})`}`);
  }

  async goto(url: string): Promise<void> {
    await this.eval('window.__left = true').catch(() => undefined);
    await this.cdp.send('Page.navigate', { url: url }, this.session);
    await this.booted();
  }

  async reload(): Promise<void> {
    await this.eval('window.__left = true');
    await this.cdp.send('Page.reload', {}, this.session);
    await this.booted();
  }

  private async booted(): Promise<void> {
    await this.until("!window.__left && document.readyState === 'complete' && window.__e2e"
      + " && document.getElementById('phaseLabel')?.textContent !== ''", 'the page to boot');
  }

  snap(): Promise<Snap> {
    return this.eval<Snap>('window.__e2e.snap()');
  }

  async click(selector: string): Promise<void> {
    await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)});
      if (e === null) throw new Error('no ${selector.replace(/'/g, '')}'); e.click(); })()`);
  }

  /** The page looked at again, as a tab coming back is. */
  async look(): Promise<void> {
    await this.eval("window.dispatchEvent(new Event('focus'))");
  }

  /** The development clock moved by `s` seconds, and the page told. */
  async shift(s: number): Promise<void> {
    await this.eval(`window.aetClock.shift(${s})`);
    await this.look();
  }

  /** The development clock moved to `at_s`, a clock time, and the page told. */
  async shiftTo(at_s: number): Promise<void> {
    await this.eval(`window.aetClock.shift(${at_s} - window.aetClock.now() / 1000)`);
    await this.look();
  }

  /** Wait for the phase, and for the page to say it (a tick behind the
   *  clock at most); the label is checked against the phase's words. */
  async phase(want: string, ms = 20000): Promise<Snap> {
    await this.until(`await (async () => { const s = await window.__e2e.snap();
      return s.phase === ${JSON.stringify(want)} && (${LABEL_SAYS})(s); })()`, `phase ${want}`, ms);
    const s = await this.snap();
    labelSays(s);
    return s;
  }

  osc(): Promise<Osc[]> {
    return this.eval<Osc[]>('window.__osc');
  }

  writes(): Promise<{ key: string; value: string }[]> {
    return this.eval('window.__writes');
  }

  storage(key: string): Promise<string | null> {
    return this.eval(`localStorage.getItem(${JSON.stringify(key)})`);
  }

  async close(): Promise<void> {
    await this.cdp.send('Target.closeTarget', { targetId: this.targetId }).catch(() => undefined);
  }
}

/** One scenario's browser context: its own storage, its tabs. */
class Ctx {
  readonly tabs: Tab[] = [];
  readonly cdp: Cdp;
  readonly id: string;

  private constructor(cdp: Cdp, id: string) {
    this.cdp = cdp;
    this.id = id;
  }

  static async create(cdp: Cdp): Promise<Ctx> {
    const { browserContextId } = await cdp.send('Target.createBrowserContext', {}) as { browserContextId: string };
    return new Ctx(cdp, browserContextId);
  }

  async open(path: string, origin = ORIGIN): Promise<Tab> {
    const tab = await Tab.open(this.cdp, this.id, origin + path);
    this.tabs.push(tab);
    return tab;
  }

  async dispose(): Promise<void> {
    await this.cdp.send('Target.disposeBrowserContext', { browserContextId: this.id }).catch(() => undefined);
  }
}

/* ------------------------------------------------------------- the cook */

const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

/** Start a cook from idle, once the time on screen is decided. */
async function start(tab: Tab, mode: 'cold' | 'hot'): Promise<Snap> {
  if (mode === 'hot') {
    await tab.click('#startHot');
    await tab.until("(await window.__e2e.ui('state')).state.settings.startMode === 'hot'", 'a hot start chosen');
  }
  await tab.until("(await window.__e2e.ui('state')).state.chosen !== null", 'the time decided');
  await tab.click('#primary');
  return tab.phase(mode === 'cold' ? 'HEATING' : 'COOKING');
}

/** Full rolling boil, tapped, and the measured pot's time decided. */
async function boil(tab: Tab): Promise<Snap> {
  await tab.click('#primary');
  await tab.phase('COOKING');
  await tab.until('(await window.__e2e.snap()).decided', 'the measured pot planned');
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

/** Wait for a correction to be committed: the stored cook's
 *  `correctedAt_s` moved on from `before`, and planned. */
async function corrected(tab: Tab, before: number | null, ms = 6000): Promise<Snap> {
  await tab.until(`await (async () => { const s = await window.__e2e.snap(); const c = s.stored === null ? null : JSON.parse(s.stored).cook;
    return c !== null && c.correctedAt_s !== ${JSON.stringify(before)} && s.cook.correctedAt_s === c.correctedAt_s; })()`,
  'a correction committed', ms);
  return tab.snap();
}

function storedCook(s: Snap): Cook | null {
  return s.stored === null ? null : (JSON.parse(s.stored) as { cook: Cook }).cook;
}

/** Whether the label the page shows is the phase's own words (the cooks
 *  here hold the boil and cool in ice), as a function for the page. */
const LABEL_SAYS = `(s) => {
  const want = { HEATING: s.labels.heating, PULL: s.labels.pull, DONE: s.labels.done,
    COOLING: s.labels.coolingIce, COOKING: s.labels.cookingBoiling };
  return want[s.phase] === undefined || want[s.phase] === s.label;
}`;

function labelSays(s: Snap): void {
  const says = (new Function(`return ${LABEL_SAYS}`) as () => (s: Snap) => boolean)();
  check(says(s), `${s.phase} labelled "${s.label}"`);
}

/* ------------------------------------------------------------ scenarios */

interface Harness {
  ctx: Ctx;
  posts(): string[];
}

type Scenario = (h: Harness) => Promise<string>;

const SCENARIOS: Record<string, { what: string; run: Scenario }> = {
  'inert-off-localhost': {
    what: 'the development clock is off on any host but this machine',
    run: async (h) => {
      const away = await h.ctx.open('/?clock=60&at=+1h', `http://eggs.test:${SITE_PORT}`);
      const a = await away.eval<{ mark: boolean; handle: boolean; skew: number; speed: number; search: string }>(`(async () => {
        const n = await window.__e2e.ui('now');
        return { mark: document.getElementById('devClock') !== null, handle: 'aetClock' in window,
          skew: n.nowMs() - Date.now(), speed: n.clockSpeed(), search: location.search };
      })()`);
      check(!a.mark && !a.handle && Math.abs(a.skew) < 50 && a.speed === 1, `eggs.test: ${JSON.stringify(a)}`);
      check(a.search === '?clock=60&at=+1h', 'the address left alone off this machine');
      const home = await h.ctx.open('/?clock=60&at=+1h');
      const b = await home.eval<{ mark: string | null; skew: number; search: string }>(`(async () => {
        const n = await window.__e2e.ui('now');
        return { mark: document.getElementById('devClock')?.textContent ?? null,
          skew: n.nowMs() - Date.now(), search: location.search };
      })()`);
      check(b.mark !== null && b.skew > 3_590_000 && b.search === '', `127.0.0.1: ${JSON.stringify(b)}`);
      return `eggs.test: Date.now, no mark, no handle; 127.0.0.1: mark "${b.mark}"`;
    },
  },

  'cold-cook': {
    what: 'a cold cook at x60: boil, pull, cooling, Done, Jammy, Start again; the record and its forecast',
    run: async (h) => {
      const tab = await h.ctx.open('/?clock=60');
      const real0 = Date.now();
      let s = await start(tab, 'cold');
      labelSays(s);
      // Four minutes of heating, four real seconds.
      await tab.until(`(await window.__e2e.snap()).now_ms > ${s.now_ms + 240_000}`, '4 min heated');
      s = await boil(tab);
      labelSays(s);
      const d = deadlines(s);
      // The pull's beeps, ahead on the audio clock, at x60: the last plan's.
      const ahead = (await tab.osc()).filter(scheduledAhead).slice(-75);
      check(ahead.length === 75, `75 pull beeps scheduled ahead, ${ahead.length}`);
      const first = ahead[0];
      const want_s = (d.cookEnd_s * 1000 - first.page) / 1000 / 60;
      check(near((first.at ?? 0) - first.made, want_s, 0.05),
        `the pull ${want_s.toFixed(2)} s of audio ahead, ${((first.at ?? 0) - first.made).toFixed(2)}`);
      const oscAtBoil = (await tab.osc()).length;
      s = await tab.phase('PULL', 30000);
      labelSays(s);
      // Sounding on the audio clock as the pull came: nothing rung again.
      check(s.osc === oscAtBoil, `the beeps ahead rang the pull: ${s.osc - oscAtBoil} more made`);
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      labelSays(s);
      const out = storedCook(s)?.events.pulled;
      check(out?.by === 'cook' && out.confirmed, `the cook's tap out stored: ${JSON.stringify(out)}`);
      const oscBeforeDone = (await tab.osc()).length;
      s = await tab.phase('DONE', 30000);
      labelSays(s);
      await tab.until(`window.__osc.length >= ${oscBeforeDone + 50}`, "Done's 50 beeps");
      check(s.feedback, 'the questions at Done');
      const cook = storedCook(s);
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('(await window.__e2e.snap()).log.length === 1', 'the egg logged');
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
      const tab = await h.ctx.open('/');
      await tab.until("(await window.__e2e.ui('state')).state.chosen !== null", 'the time decided');
      const idle = await layout(tab);
      check(idle.shown.every((x) => x.visible), `idle: ${JSON.stringify(idle.shown)}`);
      let s = await start(tab, 'cold');
      await tab.until('(await window.__e2e.snap()).deadlines !== null', 'planned');
      await sleep(300);
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
      const tab = await h.ctx.open('/');
      const centre = async (): Promise<{ reading: string; fill: string }> => tab.eval(`(() => {
        const svg = document.getElementById('eggSection');
        return { reading: svg.dataset.egg ?? '', fill: svg.querySelector('path[data-ring="0"]')?.getAttribute('fill') ?? '' };
      })()`);
      const at = async (level: number): Promise<{ reading: string; fill: string }> => {
        await setSlider(tab, level);
        await tab.until(`await (async () => { const st = (await window.__e2e.ui('state')).state;
          return st.chosen !== null && st.chosen.level === st.settings.doneness
            && Math.abs(st.settings.doneness - ${level}) < 0.1; })()`, `level ${level} decided`);
        await sleep(200);
        return centre();
      };
      const runny = await at(0.1);
      const hard = await at(0.95);
      check(runny.reading === 'aim' && hard.reading === 'aim', `idle reads the aim: ${runny.reading}, ${hard.reading}`);
      check(runny.fill !== hard.fill, `a runny and a hard yolk drawn alike: ${runny.fill}`);
      await at(0.41);
      const aimed = await centre();
      let s = await start(tab, 'hot');
      await sleep(300);
      const live = await centre();
      check(live.reading === 'live', `the cook reads live: ${live.reading}`);
      check(live.fill !== aimed.fill, `the live egg starts raw, not as aimed: ${live.fill}`);
      await tab.until('(await window.__e2e.snap()).decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      check((await centre()).reading === 'live', 'cooling reads live');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      await tab.phase('DONE');
      await sleep(300);
      const ran = await centre();
      check(ran.reading === 'ran', `Done reads the egg as it ran: ${ran.reading}`);
      return `idle runny ${runny.fill}, hard ${hard.fill}; start ${live.fill}; Done ${ran.fill}`;
    },
  },

  'owner-case': {
    what: 'C3 step 3: boiling corrected to cold after Start, as the owner needed: back to Heating, the pull later, the settings follow',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      let s = await start(tab, 'hot');
      await tab.until('(await window.__e2e.snap()).decided', 'the pot planned');
      const pull0 = deadlines(await tab.snap()).cookEnd_s;
      await tab.shift(60);
      await tab.click('#sentence .clause[aria-controls="panelStart"]');
      await tab.click('#startCold');
      s = await corrected(tab, null);
      check(s.phase === 'HEATING', `back to ${s.phase}`);
      check(s.primary === (await tab.eval<string>("(async () => (await window.__e2e.ui('copy')).t('action.fullBoil'))()")),
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
      const tab = await h.ctx.open('/');
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
      const tab = await h.ctx.open('/');
      let s = await start(tab, 'hot');
      await tab.until('(await window.__e2e.snap()).decided', 'the pot planned');
      const pull0 = deadlines(await tab.snap()).cookEnd_s;
      await tab.shift(30);
      await pick(tab, '#size', '3');
      // Nothing yet: a tap settles first.
      s = await tab.snap();
      check(s.cook?.correctedAt_s === null, 'committed before the settle');
      s = await corrected(tab, null);
      const heavier = deadlines(s).cookEnd_s;
      check(heavier > pull0, `heavier, later: ${(heavier - pull0).toFixed(1)} s`);
      await pick(tab, '#size', '1');
      s = await corrected(tab, s.cook?.correctedAt_s ?? null);
      const lighter = deadlines(s).cookEnd_s;
      check(lighter < pull0, `lighter, sooner: ${(lighter - pull0).toFixed(1)} s`);
      await pick(tab, '#size', '2');
      s = await corrected(tab, s.cook?.correctedAt_s ?? null);
      await tab.until('(await window.__e2e.snap()).decided', 'planned on its pot');
      s = await tab.snap();
      check(near(deadlines(s).cookEnd_s, pull0, 1e-6), `back gives back: ${(deadlines(s).cookEnd_s - pull0).toFixed(6)} s`);
      return `heavier +${(heavier - pull0).toFixed(1)} s, lighter ${(lighter - pull0).toFixed(1)} s, back to the pull exactly`;
    },
  },

  'overdue-and-back': {
    what: 'C3 step 3: a correction that makes the egg overdue rings at once; changed back within the grace, the pull is cancelled',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      await start(tab, 'hot');
      await tab.until('(await window.__e2e.snap()).decided', 'the pot planned');
      const pull0 = deadlines(await tab.snap()).cookEnd_s;
      await tab.shiftTo(pull0 - 40);
      let base = (await tab.osc()).length;
      await pick(tab, '#size', '0');
      let s = await corrected(tab, null);
      s = await tab.phase('PULL');
      await sleep(300);
      let osc = (await tab.osc()).slice(base);
      check(osc.length === 75 && (osc[0].at ?? 0) - osc[0].made < 0.1, `rang at once: ${osc.length}`);
      await tab.shift(5);
      await pick(tab, '#size', '2');
      s = await corrected(tab, s.cook?.correctedAt_s ?? null);
      s = await tab.phase('COOKING');
      const ev = storedCook(s)?.events;
      check(ev?.pulled === null && ev?.rangAt_s === null, `nothing observed: ${JSON.stringify(ev)}`);
      check(near(deadlines(s).cookEnd_s, pull0, 1), `the pull back where it was: ${(deadlines(s).cookEnd_s - pull0).toFixed(1)} s`);
      base = (await tab.osc()).length;
      await tab.shiftTo(deadlines(s).cookEnd_s + 1);
      await tab.phase('PULL');
      await sleep(300);
      osc = (await tab.osc()).slice(base);
      check(osc.length === 75, `the pull rings again at its time: ${osc.length}`);
      return 'overdue: Pull and 75 at once; back within the grace: Cooking, nothing written; the pull rang again';
    },
  },

  'drag-no-ring': {
    what: 'C3 step 3: a drag through an overdue level rings nothing before release; the egg shows the aim while held',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      let s = await start(tab, 'hot');
      await tab.until('(await window.__e2e.snap()).decided', 'the pot planned');
      s = await tab.snap();
      const level = s.cook?.choices.level ?? 0.41;
      const pull0 = deadlines(s).cookEnd_s;
      await tab.shiftTo(pull0 - 60);
      const base = (await tab.osc()).length;
      await drag(tab, [0.3, 0.1, 0]);
      await tab.until("document.getElementById('eggSection').dataset.egg === 'aim'", 'the aim while held');
      await sleep(2000);
      s = await tab.snap();
      check(s.phase === 'COOKING' && s.cook?.correctedAt_s === null, `held: ${s.phase}, corrected ${s.cook?.correctedAt_s}`);
      check((await tab.osc()).length === base, 'nothing rang while held');
      await drag(tab, [0.2, level], true, false);
      await sleep(300);
      s = await tab.snap();
      check(s.phase === 'COOKING' && s.cook?.correctedAt_s === null, `released at the level it had: ${s.phase}`);
      check((await tab.osc()).length === base, 'nothing rang on release');
      await tab.until("document.getElementById('eggSection').dataset.egg === 'live'", 'the live egg again', 4000);
      // Released at an overdue level: it rings then.
      await drag(tab, [0], true);
      s = await corrected(tab, null, 3000);
      s = await tab.phase('PULL');
      check((await tab.osc()).length >= base + 75, 'rang on release');
      return 'held through runny: no ring, the aim drawn; back and released: nothing; released runny: Pull, rang';
    },
  },

  'start-time': {
    what: 'C3 step 3: the start corrected in its clause, a minute at a time, and stopped with its reason at now, the boil pressed, and two hours back',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      let s = await start(tab, 'cold');
      const id_s = (s.cook?.id_ms ?? 0) / 1000;
      const start0 = s.cook?.startedAt_s ?? 0;
      await tab.shift(150);
      await tab.click('#sentence .clause[aria-controls="panelStart"]');
      const clock = await tab.eval<string>("document.getElementById('startedAt').textContent");
      const clause = await tab.eval<string>("document.querySelector('#sentence .clause[aria-controls=\"panelStart\"]').textContent");
      check(clause.includes(clock) && clock !== '', `the clause says when: "${clause}", "${clock}"`);
      // + three times, a tap each: the third goes no further than now.
      for (let i = 0; i < 3; i++) await press(tab, '#startedAtMore');
      const limit = await tab.eval<string>("document.getElementById('startedAtLimit').textContent");
      const now = await tab.eval<string>("(async () => (await window.__e2e.ui('copy')).t('controls.startedAt.latestNow'))()");
      check(limit === now, `the reason at now: "${limit}"`);
      s = await corrected(tab, null);
      const late = (s.cook?.startedAt_s ?? 0) - start0;
      check(late > 145 && late < 160, `in at now: ${late.toFixed(1)} s later`);
      // The boil pressed, then + again: no later than the press.
      await tab.shift(240);
      s = await boil(tab);
      const tap = s.cook?.events.boilAt_s ?? 0;
      await tab.shift(60);
      for (let i = 0; i < 5; i++) await press(tab, '#startedAtMore');
      const atBoil = await tab.eval<string>("document.getElementById('startedAtLimit').textContent");
      check(atBoil.includes(await tab.eval<string>(`(async () => (await window.__e2e.ui('copy')).timeOfDay(${tap * 1000}))()`)),
        `the reason at the boil names its time: "${atBoil}"`);
      s = await corrected(tab, s.cook?.correctedAt_s ?? null);
      check(s.cook?.startedAt_s === tap, `in at the press: ${(s.cook?.startedAt_s ?? 0) - tap}`);
      // − all the way back, by the keyboard: two hours before Start was pressed.
      await tab.eval(`(() => { const b = document.getElementById('startedAtLess');
        for (let i = 0; i < 140; i++) b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })); })()`);
      const early = await tab.eval<string>("document.getElementById('startedAtLimit').textContent");
      s = await corrected(tab, s.cook?.correctedAt_s ?? null);
      check(near(s.cook?.startedAt_s ?? 0, id_s - 7200, 1e-6), `two hours back: ${((s.cook?.startedAt_s ?? 0) - id_s).toFixed(1)} s`);
      return `"${clause}"; "${limit}"; "${atBoil}"; "${early}"`;
    },
  },

  'settings-mid-cook': {
    what: 'C3 step 3: Settings is open while a cook runs; its water corrects the cook; the pull brings the egg back',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      let s = await start(tab, 'hot');
      await tab.until('(await window.__e2e.snap()).decided', 'the pot planned');
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
    what: 'review 2.5: a correction in one tab leaves another tab\'s cook and its controls alone (real clock)',
    run: async (h) => {
      const a = await h.ctx.open('/');
      await start(a, 'hot');
      const b = await h.ctx.open('/');
      await b.phase('COOKING');
      // B puts A's cook down and starts its own: two tabs, two cooks.
      await b.click('#secondary');
      await b.phase('IDLE');
      let sb = await start(b, 'hot');
      const idB = sb.cook?.id_ms;
      await b.until('(await window.__e2e.snap()).decided', 'B planned');
      sb = await b.snap();
      const pullB = deadlines(sb).cookEnd_s;
      await pick(a, '#size', '3');
      const sa = await corrected(a, null);
      check(sa.cook?.choices.mass_kg !== sb.cook?.choices.mass_kg, 'A corrected its egg');
      await b.until('JSON.parse(localStorage.getItem(\'aet.settings.v1\')).sizeIndex === 3', 'A\'s correction in the settings');
      await sleep(500);
      sb = await b.snap();
      check(sb.cook?.id_ms === idB, 'B runs its own cook');
      check(sb.cook?.choices.mass_kg === 0.068 && near(deadlines(sb).cookEnd_s, pullB, 1e-6), 'B\'s cook untouched');
      const shown = await b.eval<string>("document.getElementById('size').value");
      check(shown === '2', `B's controls show B's egg: ${shown}`);
      const next = await b.eval<number>("(async () => (await window.__e2e.ui('state')).state.settings.sizeIndex)()");
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
      const tab = await h.ctx.open('/');
      let s = await start(tab, 'hot');
      await tab.until('(await window.__e2e.snap()).decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      await tab.phase('DONE');
      await tab.click('.fb[data-yolk="runny"]');
      await tab.until('(await window.__e2e.snap()).eggsLogged === 1', 'Runny folded');
      const first = (await tab.snap()).log[0];
      const peak0 = await tab.eval<string>("document.getElementById('donenessPeak').textContent");
      await pick(tab, '#size', '3');
      s = await corrected(tab, null);
      await tab.until(`JSON.stringify((await window.__e2e.snap()).log[0].egg) !== ${JSON.stringify(JSON.stringify(first.egg))}`,
        'the record corrected');
      const heavier = (await tab.snap()).log[0];
      check(heavier.yolkWord === 'runny', `the answer kept: ${heavier.yolkWord}`);
      check(heavier.recommended_s === first.recommended_s, 'the time that ran is the time that ran');
      check(JSON.stringify(heavier.forecast) !== JSON.stringify(first.forecast), 'the forecast is the heavier egg\'s');
      await pick(tab, '#size', '2');
      s = await corrected(tab, s.cook?.correctedAt_s ?? null);
      await tab.until(`JSON.stringify((await window.__e2e.snap()).log[0].egg) === ${JSON.stringify(JSON.stringify(first.egg))}`,
        'the record back');
      await tab.until("(await window.__e2e.snap()).eggsLogged === 1 && (await window.__e2e.ui('calibration')).eggsBehind() === 0",
        'folded again');
      const back = (await tab.snap()).log[0];
      check(JSON.stringify(back.forecast) === JSON.stringify(first.forecast),
        `changed back, the forecast is the first, not one that knew Runny: ${JSON.stringify(back.forecast)} vs ${JSON.stringify(first.forecast)}`);
      await sleep(300);
      const peak1 = await tab.eval<string>("document.getElementById('donenessPeak').textContent");
      check(peak1 === peak0, `Done shows the cook as it ran: "${peak1}" (was "${peak0}")`);
      return `heavier: a new forecast, the answer kept; back: the first forecast to the bit, "${peak1}"`;
    },
  },

  'slider-after-pull': {
    what: 'C3 step 3: after the pull the slider only previews: no correction, no record changed, and back to the level the egg ran at',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      let s = await start(tab, 'hot');
      await tab.until('(await window.__e2e.snap()).decided', 'the pot planned');
      s = await tab.snap();
      const level = String(s.cook?.choices.level);
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      await tab.phase('DONE');
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('(await window.__e2e.snap()).eggsLogged === 1', 'Jammy folded');
      const first = JSON.stringify((await tab.snap()).log[0]);
      await drag(tab, [0.6, 0.9]);
      await tab.until("document.getElementById('eggSection').dataset.egg === 'aim'", 'the aim while held');
      await drag(tab, [0.9], true, false);
      await tab.until("document.getElementById('eggSection').dataset.egg === 'ran'", 'the egg as it ran again', 5000);
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
      const tab = await h.ctx.open('/');
      const words = async (key: string): Promise<string> => tab.eval<string>(
        `(async () => (await window.__e2e.ui('copy')).t(${JSON.stringify(key)}))()`);
      const ask = await words('ask.stillIn');
      // The alarm rang and its grace ran out, unanswered: the clock assumed
      // the egg came out. Then the cook says it went into cold water.
      const asked = async (): Promise<Snap> => {
        let s = await start(tab, 'hot');
        await tab.until('(await window.__e2e.snap()).decided', 'the pot planned');
        s = await tab.snap();
        await tab.shiftTo(deadlines(s).cookEnd_s + 25);
        s = await tab.phase('COOLING');
        check(storedCook(s)?.events.pulled?.by === 'timeout', 'the clock assumed the pull');
        await tab.click('#startCold');
        await corrected(tab, null);
        await tab.until(`(await window.__e2e.snap()).label === ${JSON.stringify(ask)}`, 'the question');
        return tab.snap();
      };
      let s = await asked();
      const osc0 = (await tab.osc()).length;
      check(s.primary === await words('ask.stillIn.yes'), `yes: ${s.primary}`);
      check(await tab.eval<boolean>("!document.getElementById('stillOut').hidden"), 'no, on screen');
      // The cooling's counted end passes under the question: nothing.
      await tab.shift(600);
      await sleep(300);
      s = await tab.snap();
      check(s.phase === 'COOLING' && s.label === ask && !s.feedback, `nothing past the question: ${s.phase}, "${s.label}"`);
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
      await tab.until(`(await window.__e2e.snap()).label !== ${JSON.stringify(ask)}`, 'the question answered');
      s = await tab.snap();
      const pulled = storedCook(s)?.events.pulled;
      check(pulled?.by === 'timeout' && pulled.confirmed, `out: the pull stands, confirmed: ${JSON.stringify(pulled)}`);
      check(s.phase === 'COOLING' || s.phase === 'DONE', `out: ${s.phase}`);
      await tab.until('(await window.__e2e.snap()).cook.asRan?.correctedAt_s === (await window.__e2e.snap()).cook.correctedAt_s',
        'the record made again for cold water');
      return `${yes}; out: ${s.phase}, the pull confirmed, the record corrected`;
    },
  },

  'running-lines': {
    what: 'C3 step 5: corrected to cold and left heating, the slow hob counts the time heated up; a correction the white never sets in says so',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      let s = await start(tab, 'hot');
      await tab.until('(await window.__e2e.snap()).decided', 'the pot planned');
      const start_s = s.cook?.startedAt_s ?? 0;
      await tab.shift(300);
      await tab.click('#startCold');
      s = await corrected(tab, null);
      check(s.phase === 'HEATING' && !s.lengthened, `Heating on the guess: ${s.phase}, ${s.lengthened}`);
      await tab.shiftTo(start_s + 16 * 60);
      await sleep(300);
      s = await tab.phase('HEATING');
      check(s.lengthened, 'the slow hob lengthened');
      check(s.digits === '16:00' || s.digits === '16:01', `the time heated, counting up: ${s.digits}`);
      const slow = `${s.digits}, "${s.subline}"`;
      await tab.click('#secondary');
      await tab.phase('IDLE');
      // A boiling start with the heat off in a little water, one small egg:
      // corrected to it mid-cook, the white never sets, and the slot says so.
      await tab.click('#startHot');
      s = await start(tab, 'hot');
      await tab.click('#heatOff');
      s = await corrected(tab, null);
      await pick(tab, '#size', '0');
      s = await corrected(tab, s.cook?.correctedAt_s ?? null);
      await tab.eval(`(() => { const e = document.getElementById('eggCount'); e.value = '1';
        e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      s = await corrected(tab, s.cook?.correctedAt_s ?? null);
      await tab.eval(`(() => { const e = document.getElementById('litres'); e.value = '0.5';
        e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      s = await corrected(tab, s.cook?.correctedAt_s ?? null);
      await sleep(300);
      const warn = await tab.eval<{ hidden: boolean; text: string }>(
        "(() => { const w = document.getElementById('warn'); return { hidden: w.hidden, text: w.textContent }; })()");
      const never = await tab.eval<string>("(async () => (await window.__e2e.ui('copy')).t('refusal.whiteNeverSets'))()");
      check(!warn.hidden && warn.text === never, `the slot: "${warn.text}"`);
      return `${slow}; heat off, 0.5 L, one small egg: "${warn.text}"`;
    },
  },

  'hot-start': {
    what: 'a hot start: in, the pull, out, the cooling, Done, Start again logs the unanswered egg',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      let s = await start(tab, 'hot');
      labelSays(s);
      await tab.until('(await window.__e2e.snap()).decided', 'the pot planned');
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
      await tab.until('(await window.__e2e.snap()).log.length === 1', 'the unanswered egg logged');
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
      const tab = await h.ctx.open('/');
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
      check(Object.values(pans).some((v) => near(v, 300, 3)), `the boil remembered at Cancel: ${JSON.stringify(pans)}`);
      return `pans ${JSON.stringify(pans)}`;
    },
  },

  reload: {
    what: 'a reload at Heating, Cooking, Pull, Cooling and Done: the same deadlines, nothing lost',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      await start(tab, 'cold');
      const notes: string[] = [];
      const again = async (where: string): Promise<Snap> => {
        await tab.until('(await window.__e2e.snap()).decided || (await window.__e2e.snap()).deadlines.provisional',
          'the plan before');
        const before = await tab.snap();
        await tab.reload();
        await tab.until('(await window.__e2e.snap()).decided || (await window.__e2e.snap()).deadlines.provisional',
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
    what: 'review 1.1: a tab woken 25 s past the pull rings it; one woken past the cooling rings the pull, not Done',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      await start(tab, 'cold');
      await tab.shift(470);
      let s = await boil(tab);
      const d = deadlines(s);
      let osc = await tab.osc();
      const ahead = osc.filter(scheduledAhead);
      check(ahead.length === 75, `75 beeps scheduled ahead at the tap, ${ahead.length}`);
      const lead = (ahead[0].at ?? 0) - ahead[0].made;
      check(near(lead, d.cookEnd_s - ahead[0].page / 1000, 0.05), `the pull's beeps ${lead.toFixed(1)} s ahead`);
      // Woken 25 s past the pull, as a throttled or frozen tab is.
      let base = osc.length;
      await tab.shiftTo(d.cookEnd_s + 25);
      s = await tab.phase('COOLING');
      await sleep(300);
      osc = await tab.osc();
      const now = osc.slice(base);
      check(now.length === 75 && (now[0].at ?? 0) - now[0].made < 0.1, `75 rung at once, ${now.length}`);
      const ev = storedCook(s)?.events;
      check(ev?.rangAt_s !== null && ev?.pulled?.by === 'timeout', `the pull rung and timed out: ${JSON.stringify(ev)}`);
      base = osc.length;
      await tab.shiftTo(deadlines(s).coolEnd_s + 1);
      s = await tab.phase('DONE');
      await sleep(300);
      const done = (await tab.osc()).length - base;
      check(done === 50, `Done's 50, ${done}`);
      // A second cook, woken straight past the cooling: the pull rings, not Done.
      await tab.click('#primary');
      await tab.phase('IDLE');
      await start(tab, 'cold');
      await tab.shift(470);
      s = await boil(tab);
      base = (await tab.osc()).length;
      await tab.shiftTo(deadlines(s).coolEnd_s + 600);
      s = await tab.phase('DONE');
      await sleep(300);
      const rung = (await tab.osc()).length - base;
      check(rung === 75, `past the cooling: the pull's 75, not Done's 50: ${rung}`);
      return 'tap: 75 ahead; +25 s: 75 at once, Cooling; Done: 50; straight to Done: 75';
    },
  },

  'two-tabs': {
    what: 'review 1.2: a second tab follows the first one\'s tap and writes nothing back over it (real clock)',
    run: async (h) => {
      const a = await h.ctx.open('/');
      await start(a, 'cold');
      const b = await h.ctx.open('/');
      let sb = await b.phase('HEATING');
      check(storedCook(sb)?.id_ms === (await a.snap()).cook?.id_ms, 'B took up A\'s cook');
      await b.until('(await window.__e2e.snap()).deadlines !== null', 'B planned');
      await a.click('#primary');
      await a.phase('COOKING');
      sb = await b.phase('COOKING', 5000);
      // Both tabs' surfaces in, then a moment for anything B would write.
      await a.until('(await window.__e2e.snap()).decided', 'A planned on the measured pot');
      await b.until('(await window.__e2e.snap()).decided', 'B planned on the measured pot');
      await sleep(1500);
      const stored = storedCook(await a.snap());
      check(stored?.events.boilAt_s !== null, 'the tap still stored');
      const bWrites = (await b.writes()).filter((w) => w.key === 'aet.cook.v4')
        .map((w) => (JSON.parse(w.value) as { cook: Cook }).cook);
      check(bWrites.every((c) => c.events.boilAt_s !== null), 'B never wrote a cook without the tap');
      await a.reload();
      const sa = await a.snap();
      check(sa.phase === 'COOKING', `A reloaded to ${sa.phase}`);
      return `B followed in COOKING; B's writes of the cook: ${bWrites.length}, none without the tap; A reloaded to COOKING`;
    },
  },

  'too-old': {
    what: 'review 2.2: a cold start never tapped is ended at two hours, in the tab that runs it',
    run: async (h) => {
      const tab = await h.ctx.open('/');
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

  'final-egg': {
    what: 'review 2.3: an egg final by the clock takes no more answers',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      let s = await start(tab, 'hot');
      await tab.until('(await window.__e2e.snap()).decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 25);
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 5);
      s = await tab.phase('DONE');
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('(await window.__e2e.snap()).log.length === 1', 'Jammy logged');
      const final0 = await tab.eval<number>("window.__e2e.ui('update').then((m) => m.finalEggs())");
      check(final0 === 0, `open at Done: ${final0} final`);
      await tab.eval('window.aetClock.shift(3 * 3600)');
      const final1 = await tab.eval<number>("window.__e2e.ui('update').then((m) => m.finalEggs())");
      check(final1 === 1, `three hours on: ${final1} final`);
      await tab.click('.wb[data-white="tender"]');
      await sleep(300);
      s = await tab.snap();
      check(s.log.length === 1 && s.log[0].white === null, `Tender not taken: ${s.log[0].white}`);
      check(!s.feedback, 'the questions put away');
      await tab.look();
      s = await tab.phase('IDLE');
      check(s.log.length === 1, 'nothing logged twice');
      return 'final 0 at Done, 1 three hours on; Tender not taken; the cook ended on the next look';
    },
  },

  'done-as-ran': {
    what: 'review 2.4: Done after an answer and a reload shows the cook as it ran',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      let s = await start(tab, 'hot');
      await tab.until('(await window.__e2e.snap()).decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      s = await tab.phase('DONE');
      await tab.until('(await window.__e2e.snap()).target !== ""', 'what was asked for');
      // The slider's heading, the cook's peak yolk (the one screen keeps the
      // slider where the summary under the sentence was).
      const summary = "document.getElementById('donenessPeak').textContent";
      const before = await tab.eval<string>(summary);
      const asked = (await tab.snap()).target;
      check(asked.includes(before), `"${asked}" and "${before}" agree`);
      await tab.click('.fb[data-yolk="runny"]');
      await tab.until('(await window.__e2e.snap()).eggsLogged === 1', 'Runny folded');
      await tab.reload();
      await tab.until('(await window.__e2e.snap()).decided', 'planned on the new posterior');
      s = await tab.snap();
      check(s.phase === 'DONE', `reloaded to ${s.phase}`);
      const after = await tab.eval<string>(summary);
      // What the plan made now, on the posterior that has folded Runny, says.
      const now_C = await tab.eval<number>(`(async () => {
        const st = (await window.__e2e.ui('state')).state; return st.plan.solution.result.peakYolk_C; })()`);
      check(after === before, `"${before}" became "${after}"`);
      return `"${after}" kept (the plan now: peak yolk ${now_C.toFixed(1)} °C)`;
    },
  },

  'slow-hob': {
    what: 'a slow hob: past the guess, the clock counts the time heated up, still Heating',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      let s = await start(tab, 'cold');
      const start_s = s.cook?.startedAt_s ?? 0;
      await tab.shiftTo(start_s + 16 * 60);
      await sleep(300);
      s = await tab.phase('HEATING');
      check(s.lengthened, 'the plan lengthened');
      const first = s.digits;
      check(first === '16:00' || first === '16:01', `the time heated, ${first}`);
      await tab.shift(65);
      await sleep(300);
      s = await tab.snap();
      check(s.phase === 'HEATING' && (s.digits === '17:05' || s.digits === '17:06'), `counting up: ${s.digits}`);
      return `${first}, then ${s.digits}; "${s.subline}"`;
    },
  },

  'old-cooks': {
    what: 'a 0.4 cook under aet.cook.v2 and an earlier 0.5 one under v3: kept aside, the page idle',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      const v2 = JSON.stringify({ machine: { phase: 'COOKING' }, ticket: { startedAt: Date.now() - 60000 } });
      const v3 = JSON.stringify({ cook: { id_ms: Date.now() - 30000 }, answers: 'none' });
      await tab.eval(`localStorage.setItem('aet.cook.v2', ${JSON.stringify(v2)});
        localStorage.setItem('aet.cook.v3', ${JSON.stringify(v3)})`);
      await tab.reload();
      const s = await tab.snap();
      check(s.phase === 'IDLE' && s.stored === null, 'idle');
      check((await tab.storage('aet.cook.v2')) === null && (await tab.storage('aet.cook.v3')) === null, 'the old keys gone');
      const unread = await tab.storage('aet.cook.unread');
      const kept = unread === null ? [] : JSON.parse(unread) as string[];
      check(kept.includes(v2) && kept.includes(v3), `both kept aside, as stored: ${unread}`);
      return `aet.cook.unread holds ${kept.length}`;
    },
  },

  'sharing-final-only': {
    what: 'sharing sends only final eggs: none at Done, the egg at Start again (real clock, the cook moved back)',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      await tab.click('#shareSetting');
      await tab.until("(await window.__e2e.ui('share')).shareState().on", 'sharing on');
      const posts0 = h.posts().length;
      await start(tab, 'hot');
      // The cook begun 20 minutes ago: every clock time in it moved back.
      const D = 20 * 60;
      await tab.goto(`${ORIGIN}/privacy/`);
      await tab.eval(`(() => {
        const o = JSON.parse(localStorage.getItem('aet.cook.v4'));
        const c = o.cook;
        c.id_ms -= ${D * 1000};
        for (const k of ['startedAt_s', 'firstHotAt_s', 'coldSince_s', 'correctedAt_s']) if (c[k] !== null) c[k] -= ${D};
        localStorage.setItem('aet.cook.v4', JSON.stringify(o));
      })()`).catch(() => undefined);
      await tab.goto(`${ORIGIN}/`);
      await tab.phase('DONE');
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('(await window.__e2e.snap()).log.length === 1', 'Jammy logged');
      await sleep(1500);
      check(h.posts().length === posts0, `nothing sent while the egg is open: ${h.posts().slice(posts0).join('; ')}`);
      await tab.click('#primary');
      await tab.phase('IDLE');
      await tab.until("(await window.__e2e.ui('share')).shareState().sent === 1", 'the egg sent');
      const sent = h.posts().slice(posts0);
      check(sent.length === 1 && sent[0].includes('201'), `one egg sent: ${sent.join('; ')}`);
      return `at Done: 0 sent; Start again: ${sent[0]}`;
    },
  },

  'dev-clock-shares-nothing': {
    what: 'nothing is sent from a log the development clock has touched, even with the clock off',
    run: async (h) => {
      const tab = await h.ctx.open('/?at=-1m');
      await tab.click('#shareSetting');
      await tab.until("(await window.__e2e.ui('share')).shareState().on", 'sharing on');
      const posts0 = h.posts().length;
      let s = await start(tab, 'hot');
      await tab.until('(await window.__e2e.snap()).decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 25);
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 5);
      await tab.phase('DONE');
      await tab.click('#primary');
      await tab.until('(await window.__e2e.snap()).log.length === 1', 'the egg logged');
      await tab.eval('window.aetClock.off()');
      await tab.reload();
      await sleep(1500);
      check(h.posts().length === posts0, `nothing sent: ${h.posts().slice(posts0).join('; ')}`);
      return 'the egg logged, nothing sent, the clock on or off';
    },
  },
};

/* --------------------------------------------------------------- runner */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    for (const [name, s] of Object.entries(SCENARIOS)) console.log(`${name.padEnd(26)} ${s.what}`);
    return;
  }
  const names = args.length > 0 ? args : Object.keys(SCENARIOS);
  for (const n of names) if (!(n in SCENARIOS)) throw new Error(`no scenario ${n}; --list lists them`);

  const lines: string[] = [];
  const server: ChildProcess = spawn(process.execPath, ['dist/tools/devServer.js'], {
    env: { ...process.env, PORT: String(SITE_PORT) }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  server.stdout?.on('data', (b: Buffer) => { lines.push(...String(b).split('\n').filter((l) => l !== '')); });
  let chrome: Browser | null = null;
  let failed = 0;
  const t0 = Date.now();
  try {
    await waitForHttp(`${ORIGIN}/index.html`);
    chrome = await launchChrome([
      '--autoplay-policy=no-user-gesture-required', '--lang=en-GB',
      `--host-resolver-rules=MAP eggs.test 127.0.0.1`, 'about:blank',
    ], DEBUG_PORT);
    const cdp = await Cdp.open(await chrome.socket());
    for (const name of names) {
      const ctx = await Ctx.create(cdp);
      const t = Date.now();
      let note = '';
      let error: string | null = null;
      try {
        note = await SCENARIOS[name].run({ ctx: ctx, posts: () => lines.filter((l) => l.startsWith('POST /api/eggs')) });
        const thrown = ctx.tabs.flatMap((tab) => tab.errors);
        if (thrown.length > 0) error = `the page threw: ${thrown.join(' | ')}`;
      } catch (e) {
        error = e instanceof Error ? (e instanceof Failure ? e.message : e.stack ?? e.message) : String(e);
        if (process.env['E2E_DEBUG'] !== undefined) {
          for (const tab of ctx.tabs) {
            console.log(await tab.eval('JSON.stringify({ url: location.href, text: document.body.innerText.slice(0, 1500) })')
              .catch((x: unknown) => String(x)));
          }
        }
      }
      await ctx.dispose();
      const secs = ((Date.now() - t) / 1000).toFixed(1);
      if (error === null) {
        console.log(`ok    ${name.padEnd(26)} ${secs.padStart(5)} s  ${note}`);
      } else {
        failed += 1;
        console.log(`FAIL  ${name.padEnd(26)} ${secs.padStart(5)} s  ${error}`);
      }
    }
    cdp.close();
  } finally {
    server.kill();
    if (chrome !== null) await chrome.close();
  }
  console.log(`${names.length - failed} of ${names.length} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (failed > 0) process.exitCode = 1;
}

await main();
