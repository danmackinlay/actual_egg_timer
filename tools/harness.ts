/**
 * The one web harness: the built site served with the sharing endpoint on a
 * store in memory (tools/devServer.ts), headless Chrome on a profile of its
 * own (tools/chrome.ts; CHROME names the binary), and each scenario in a
 * fresh browser context, so no scenario sees another's storage. `npm run
 * e2e` (tools/e2e.ts) and the copy capture (tools/copySnapshot.ts,
 * tools/copyScenarios.ts) are its two sets of scenarios.
 *
 * A scenario talks to the app through what it shows, what it stores, and
 * the page's test API (`window.aetTest`, src/ui/dev/test.ts): `snapshot()`
 * for its state, `whenIdle()` to wait for it to have done what it will.
 * Time is the development clock (src/ui/dev/clock.ts), stopped (`?clock=0`):
 * a scenario steps it to the moment it means (`aetClock.shift`, `.set`),
 * tells the page to look again with a `focus` event, as a tab coming back
 * does, and asserts. Both are loaded on a page served from this machine
 * only, and are not in the site that ships, so the harness's server adds
 * them to it from the build (devServer.ts).
 *
 * Beyond that API the harness watches the platform, not the app: before the
 * app runs, each page counts the sounds made, each ring (one looped buffer,
 * DECISIONS.md 101) and each blip (an oscillator), and when each is set to
 * start on the audio clock (`__osc`), and what it wrote to localStorage
 * (`__writes`); its requests are read off DevTools' network events. An
 * exception thrown in a page fails its scenario.
 *
 * `--tree <dir>` (E2E_TREE) serves another checkout's build - its `_site/`
 * and its `dist/src/ui/dev/` - to this harness: a commit's build, driven by
 * today's scenarios. The commit must have the test API (this one and later):
 *
 *   git worktree add /tmp/aet-old <commit>
 *   (cd /tmp/aet-old && npm ci && npm run build:site)
 *   npm run build && node dist/tools/e2e.js --tree /tmp/aet-old
 *
 * E2E_CPU_THROTTLE=<rate> slows every page's CPU that many times (DevTools'
 * `Emulation.setCPUThrottlingRate`), to show the scenarios do not depend on
 * the machine's speed; E2E_DEBUG=1 prints the page's text when one fails.
 */

import { ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Browser, Cdp, launchChrome, sleep, waitForHttp } from './chrome.js';

/** How long to wait for something that will come, real ms: failure
 *  detection only, never a measure of anything, so long enough for a page
 *  slowed six times on a loaded machine. */
export const WAIT_MS = 60_000;

const THROTTLE = Number(process.env['E2E_CPU_THROTTLE'] ?? '1');

/* ------------------------------------------------------------- the page */

/** Run in every page before the app: the sounds made and the writes, and
 *  `__snap`, the page's snapshot with the sounds counted. */
const INSTRUMENT = `(() => {
  const osc = [];
  window.__osc = osc;
  const B = window.BaseAudioContext || window.AudioContext;
  if (B) {
    const counted = (name, kind) => {
      const make = B.prototype[name];
      B.prototype[name] = function () {
        const o = make.call(this);
        const r = { kind: kind, made: this.currentTime, at: null, page: window.aetClock ? window.aetClock.now() : Date.now() };
        osc.push(r);
        const start = o.start;
        o.start = function (t) {
          r.at = t === undefined ? this.context.currentTime : t;
          // A ring's sound, as a number: the pull's and Done's differ.
          if (this.buffer) {
            const x = this.buffer.getChannelData(0);
            let m = 0;
            for (let i = 0; i < x.length; i++) m += Math.abs(x[i]);
            r.mark = Math.round(m);
          }
          return start.apply(this, arguments);
        };
        return o;
      };
    };
    counted('createOscillator', 'blip');
    counted('createBufferSource', 'ring');
  }
  const writes = [];
  window.__writes = writes;
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (this === window.localStorage) writes.push({ key: k, value: v });
    return set.call(this, k, v);
  };
  window.__snap = () => ({ ...window.aetTest.snapshot(), osc: osc.length });
})();`;

/** The page's snapshot (src/ui/dev/test.ts's `Snapshot`), and the sounds
 *  made so far. */
export interface Snap {
  now_ms: number;
  phase: string;
  label: string;
  digits: string;
  subline: string;
  primary: string | null;
  feedback: boolean;
  target: string;
  labels: Record<string, string>;
  settings: Record<string, unknown> & { startMode: string; cooling: string; sizeIndex: number; doneness: number };
  chosen: { level: number } | null;
  cook: Cook | null;
  deadlines: { cookEnd_s: number; coolEnd_s: number | null; provisional: boolean; outAt_s: number | null } | null;
  decided: boolean;
  lengthened: boolean;
  certainty: { time: { low_s: number; high_s: number } } | null;
  peakYolk_C: number | null;
  stored: string | null;
  log: Rec[];
  eggsLogged: number;
  eggsBehind: number;
  finalEggs: number;
  share: { on: boolean; sent: number };
  inHand: { timers: number; jobs: number; requests: number };
  osc: number;
}

export interface Cook {
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
  asRan: { correctedAt_s?: number | null } | null;
}

export interface Rec {
  id?: number | null;
  egg: unknown;
  level: number;
  recommended_s: number;
  pulledBy: string;
  yolkWord: string | null;
  white: string | null;
  forecast: unknown;
}

/** A sound made, a ring or a blip: when on the audio clock and on the
 *  page's clock, and when on the audio clock it is set to start. */
export interface Osc { kind: 'ring' | 'blip'; made: number; at: number | null; page: number; mark?: number }

export class Failure extends Error {}

export function check(cond: boolean, what: string): void {
  if (!cond) throw new Failure(what);
}

/** How a tab is opened: the locale and time zone it reports (DevTools'
 *  emulation), and whether to wait for the app to boot. */
export interface TabOptions {
  locale?: string;
  timezone?: string;
  boot?: boolean;
}

/** One page, attached on the browser's socket. */
export class Tab {
  readonly errors: string[] = [];
  /** Every request the page made, as DevTools saw it leave. */
  readonly requests: { url: string; method: string }[] = [];

  private cdp: Cdp;
  readonly session: string;
  readonly targetId: string;

  private constructor(cdp: Cdp, session: string, targetId: string) {
    this.cdp = cdp;
    this.session = session;
    this.targetId = targetId;
  }

  static async open(cdp: Cdp, contextId: string, url: string, options: TabOptions = {}): Promise<Tab> {
    const { targetId } = await cdp.send('Target.createTarget', {
      url: 'about:blank', browserContextId: contextId,
    }) as { targetId: string };
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: targetId, flatten: true }) as {
      sessionId: string;
    };
    const tab = new Tab(cdp, sessionId, targetId);
    cdp.on((method, params, session) => {
      if (session !== sessionId) return;
      if (method === 'Runtime.exceptionThrown') {
        const d = (params as { exceptionDetails: { text: string; exception?: { description?: string } } }).exceptionDetails;
        tab.errors.push(d.exception?.description ?? d.text);
      } else if (method === 'Network.requestWillBeSent') {
        const r = (params as { request: { url: string; method: string } }).request;
        tab.requests.push({ url: r.url, method: r.method });
      }
    });
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT }, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: false,
    }, sessionId);
    if (options.locale !== undefined) {
      await cdp.send('Emulation.setLocaleOverride', { locale: options.locale }, sessionId);
      await cdp.send('Emulation.setUserAgentOverride', {
        userAgent: String(await tab.eval('navigator.userAgent')), acceptLanguage: options.locale,
      }, sessionId);
    }
    if (options.timezone !== undefined) {
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId: options.timezone }, sessionId);
    }
    if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE }, sessionId);
    await tab.goto(url, options.boot ?? true);
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
  async until(expression: string, what: string, ms = WAIT_MS): Promise<void> {
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

  async goto(url: string, boot = true): Promise<void> {
    await this.eval('window.__left = true').catch(() => undefined);
    await this.cdp.send('Page.navigate', { url: url }, this.session);
    if (boot) await this.booted();
    else await this.until("!window.__left && document.readyState === 'complete'", 'the page to load');
  }

  async reload(): Promise<void> {
    await this.eval('window.__left = true');
    await this.cdp.send('Page.reload', {}, this.session);
    await this.booted();
  }

  /** The app painted, and on this machine its test API in place. */
  private async booted(): Promise<void> {
    await this.until("!window.__left && document.readyState === 'complete'"
      + " && (window.aetTest !== undefined || !['localhost', '127.0.0.1'].includes(location.hostname))"
      + " && document.getElementById('phaseLabel')?.textContent !== ''", 'the page to boot');
  }

  snap(): Promise<Snap> {
    return this.eval<Snap>('window.__snap()');
  }

  /** The words of a key, as the page renders them. */
  words(key: string, args: Record<string, unknown> = {}): Promise<string> {
    return this.eval<string>(`window.aetTest.t(${JSON.stringify(key)}, ${JSON.stringify(args)})`);
  }

  /** A moment, ms, as the page says a time of day. */
  timeOfDay(ms: number): Promise<string> {
    return this.eval<string>(`window.aetTest.timeOfDay(${ms})`);
  }

  async click(selector: string): Promise<void> {
    await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)});
      if (e === null) throw new Error('no ${selector.replace(/'/g, '')}'); e.click(); })()`);
  }

  /** The page looked at again, as a tab coming back is. */
  async look(): Promise<void> {
    await this.eval("window.dispatchEvent(new Event('focus'))");
  }

  /** Wait for the page to have done what it will (`aetTest.whenIdle`): no
   *  timer of a person's span pending, no worker job, no request. What a
   *  fixed sleep did, whatever the machine's speed. */
  async settle(): Promise<void> {
    try {
      await this.eval(`window.aetTest.whenIdle(${WAIT_MS})`);
    } catch (e) {
      throw new Failure(`the page did not settle: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** The development clock moved by `s` seconds, and the page told. */
  async shift(s: number): Promise<void> {
    await this.eval(`window.aetClock.shift(${s})`);
    await this.look();
  }

  /** The development clock set to `at_s`, a clock time, and the page told. */
  async shiftTo(at_s: number): Promise<void> {
    await this.eval(`window.aetClock.set(${at_s * 1000})`);
    await this.look();
  }

  /** The page's time, ms. */
  now(): Promise<number> {
    return this.eval<number>('window.aetClock.now()');
  }

  /** The requests to the sharing endpoint this page has made. */
  sends(): number {
    return this.requests.filter((r) => r.url.includes('/api/eggs') && r.method !== 'GET').length;
  }

  /** Wait for the phase, and for the page to say it (a tick behind the
   *  clock at most); the label is checked against the phase's words. */
  async phase(want: string, ms = WAIT_MS): Promise<Snap> {
    await this.until(`(() => { const s = window.__snap();
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

/** Whether the label the page shows is the phase's own words (the cooks
 *  here hold the boil and cool in ice), as a function for the page. */
const LABEL_SAYS = `(s) => {
  const want = { HEATING: s.labels.heating, PULL: s.labels.pull, DONE: s.labels.done,
    COOLING: s.labels.coolingIce, COOKING: s.labels.cookingBoiling };
  return want[s.phase] === undefined || want[s.phase] === s.label;
}`;

export function labelSays(s: Snap): void {
  const says = (new Function(`return ${LABEL_SAYS}`) as () => (s: Snap) => boolean)();
  check(says(s), `${s.phase} labelled "${s.label}"`);
}

/** One scenario's browser context: its own storage, its tabs. */
export class Ctx {
  readonly tabs: Tab[] = [];
  readonly cdp: Cdp;
  readonly id: string;
  private origin: string;

  private constructor(cdp: Cdp, id: string, origin: string) {
    this.cdp = cdp;
    this.id = id;
    this.origin = origin;
  }

  static async create(cdp: Cdp, origin: string): Promise<Ctx> {
    const { browserContextId } = await cdp.send('Target.createBrowserContext', {}) as { browserContextId: string };
    return new Ctx(cdp, browserContextId, origin);
  }

  /** A tab at `path` on the site, or on `origin` (another name for it). */
  async open(path: string, origin = this.origin, options: TabOptions = {}): Promise<Tab> {
    const tab = await Tab.open(this.cdp, this.id, origin + path, options);
    this.tabs.push(tab);
    return tab;
  }

  async dispose(): Promise<void> {
    await this.cdp.send('Target.disposeBrowserContext', { browserContextId: this.id }).catch(() => undefined);
  }
}

/* --------------------------------------------------------------- runner */

/** What a scenario is handed: its context, the site's address and port,
 *  and the endpoint's log of eggs kept. */
export interface Harness {
  ctx: Ctx;
  origin: string;
  port: number;
  posts(): string[];
}

export interface Scenario {
  what: string;
  /** Runs it; what it found, in a line, or a throw. */
  run: (h: Harness) => Promise<string>;
}

/** The checkout whose build is served: `--tree <dir>` or E2E_TREE, else
 *  this one. Taken out of `args`. */
export function treeArg(args: string[]): string {
  const at = args.indexOf('--tree');
  let tree = process.env['E2E_TREE'] ?? '.';
  if (at >= 0) {
    tree = args[at + 1] ?? '';
    args.splice(at, 2);
  }
  if (!existsSync(resolve(tree, '_site/index.html'))) throw new Error(`no ${tree}/_site/index.html: is its site built?`);
  return resolve(tree);
}

/**
 * Serve `tree`'s build, start Chrome, and run each of `names` in a context
 * of its own, printing a line each. The count that failed.
 */
export async function runScenarios(scenarios: Record<string, Scenario>, names: string[], tree: string): Promise<number> {
  const port = 9100 + Math.floor(Math.random() * 400);
  const origin = `http://127.0.0.1:${port}`;
  const lines: string[] = [];
  const server: ChildProcess = spawn(process.execPath, ['dist/tools/devServer.js'], {
    env: { ...process.env, PORT: String(port), TREE: tree }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  server.stdout?.on('data', (b: Buffer) => { lines.push(...String(b).split('\n').filter((l) => l !== '')); });
  let chrome: Browser | null = null;
  let failed = 0;
  const t0 = Date.now();
  try {
    await waitForHttp(`${origin}/index.html`);
    chrome = await launchChrome([
      '--autoplay-policy=no-user-gesture-required', '--lang=en-GB',
      `--host-resolver-rules=MAP eggs.test 127.0.0.1`, 'about:blank',
    ], port + 1000);
    const cdp = await Cdp.open(await chrome.socket());
    const width = Math.max(26, ...names.map((n) => n.length));
    for (const name of names) {
      const ctx = await Ctx.create(cdp, origin);
      const t = Date.now();
      let note = '';
      let error: string | null = null;
      try {
        note = await scenarios[name].run({
          ctx: ctx, origin: origin, port: port, posts: () => lines.filter((l) => l.startsWith('POST /api/eggs')),
        });
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
        console.log(`ok    ${name.padEnd(width)} ${secs.padStart(5)} s  ${note}`);
      } else {
        failed += 1;
        console.log(`FAIL  ${name.padEnd(width)} ${secs.padStart(5)} s  ${error}`);
      }
    }
    cdp.close();
  } finally {
    server.kill();
    if (chrome !== null) await chrome.close();
  }
  console.log(`${names.length - failed} of ${names.length} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return failed;
}
