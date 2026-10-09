/**
 * The page's clock: every read of the current time in src/ui/ is `nowMs()`,
 * or `realMs()` for what is not a span of the cook. On the live site, and anywhere but a page served from this machine, it is
 * `Date.now()` and nothing else: the rest of this module never runs.
 *
 * For development, a page served from localhost or 127.0.0.1 can run a clock
 * of its own, so an eleven-minute cook takes seconds and a reload, a second
 * tab or a tab woken past the pull can be checked without waiting
 * (`npm run e2e`, tools/e2e.ts):
 *
 *   ?clock=60        sixty seconds of the cook's time to the real second
 *   ?clock=0         stopped: it moves only when it is moved
 *   ?at=+7m40s       the clock set 7 min 40 s ahead of the real one
 *   ?at=-15m         or a quarter of an hour behind
 *   ?at=2026-10-08T07:30:00Z   or to that moment
 *   ?clock=off       back to the real clock
 *
 * The two combine. The parameters are read once and taken out of the
 * address, and the clock is kept in sessionStorage, so a reload carries on
 * from the time the page had reached, at the same speed; a new tab starts on
 * the real clock. `window.aetClock` sets it from a console or a script
 * (`shift('+20m')`, `set(moment)`, `speed(60)`, `speed(0)`, `off()`). A
 * stopped clock is what a script steps through a cook with (`npm run e2e`):
 * it is at the moment the script set, however slow the machine running it. While it is on, a mark sits in the
 * page's corner - the speed and the shift, no words - and sharing sends
 * nothing from this browser's log until Forget everything clears it
 * (`devClockUsed`, share.ts): an egg cooked on a made-up clock never reaches
 * a server.
 *
 * What follows the clock: every countdown, deadline and record (they read
 * `nowMs()`), the tick (every 0.2 s of the cook's time, `tickMs`), and the
 * pull's beeps scheduled ahead on the audio clock (a pull 60 s of the cook's
 * time away is 1 s of audio at x60; on a stopped clock, 60 s, as on the real
 * one, until the clock is next moved). What does not: the beeps' own rhythm, a
 * sound for a person, and the timers that are not spans of the cook (the
 * solve's and the settings' coalescing, a request's timeout, the hourly look
 * for a new build, which reads `realMs()`).
 */

import { readStorage, removeStorage, writeStorage } from './store.js';

export interface DevClock {
  /** The cook's seconds to the real second; 0 is stopped. */
  speed: number;
  /** The real time and the page's time when the clock was last set, ms. */
  real0_ms: number;
  page0_ms: number;
}

/** sessionStorage: this tab's clock, kept across a reload. */
const CLOCK_KEY = 'aet.devClock';
/** localStorage: the log here may hold an egg cooked on a made-up clock. */
const USED_KEY = 'aet.devClock.used';

/** Only these: never the live site, whatever its address says. */
export function isDevHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/** A span as `?at=` takes it, ms: `+7m40s`, `-15m`, `1h`, `90s`, or bare
 *  seconds (`-90`). Null if it does not read. */
export function parseSpan(text: string): number | null {
  const m = /^([+-]?)(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s?)?$/.exec(text.trim());
  if (m === null || (m[2] === undefined && m[3] === undefined && m[4] === undefined)) return null;
  const s = Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
  return (m[1] === '-' ? -1 : 1) * Math.round(s * 1000);
}

/** A moment as `?at=` takes it: a date and time, ISO 8601 with its zone
 *  (`2026-10-08T07:30:00Z`), ms since 1970. Null if it does not read. */
export function parseMoment(text: string): number | null {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/.test(text.trim())) return null;
  const ms = Date.parse(text.trim());
  return Number.isFinite(ms) ? ms : null;
}

/** The page's time on `clock` at the real time `real_ms`. */
export function devTime(clock: DevClock, real_ms: number): number {
  return clock.page0_ms + clock.speed * (real_ms - clock.real0_ms);
}

function readClock(text: string | null): DevClock | null {
  if (text === null) return null;
  try {
    const o = JSON.parse(text) as Partial<DevClock> | null;
    if (o === null || typeof o !== 'object') return null;
    const { speed, real0_ms, page0_ms } = o;
    if (typeof speed !== 'number' || !(speed >= 0) || !Number.isFinite(speed)) return null;
    if (typeof real0_ms !== 'number' || !Number.isFinite(real0_ms)) return null;
    if (typeof page0_ms !== 'number' || !Number.isFinite(page0_ms)) return null;
    return { speed: speed, real0_ms: real0_ms, page0_ms: page0_ms };
  } catch {
    return null;
  }
}

/** A clock that is the real one is none. */
function orNone(clock: DevClock): DevClock | null {
  return clock.speed === 1 && clock.page0_ms === clock.real0_ms ? null : clock;
}

/**
 * The clock a page starts on: pure, of where it is served from, its query
 * string, the clock this tab kept (sessionStorage's text) and the real time.
 * Null - the real clock - on any host but this machine, whatever the address
 * or the tab's storage says.
 */
export function devClockAt(hostname: string, search: string, stored: string | null, real_ms: number): DevClock | null {
  if (!isDevHost(hostname)) return null;
  const kept = readClock(stored);
  const params = new URLSearchParams(search);
  const speedText = params.get('clock');
  const atText = params.get('at');
  if (speedText === 'off') return null;
  const speed = speedText === null || speedText.trim() === '' ? null : Number(speedText);
  const by = atText === null ? null : parseSpan(atText);
  const moment = atText === null || by !== null ? null : parseMoment(atText);
  const page = kept === null ? real_ms : devTime(kept, real_ms);
  return orNone({
    speed: speed !== null && speed >= 0 && Number.isFinite(speed) ? speed : (kept?.speed ?? 1),
    real0_ms: real_ms,
    page0_ms: moment !== null ? moment : by !== null ? real_ms + by : page,
  });
}

/* ------------------------------------------------------------- the page */

let dev: DevClock | null = null;
let onDevHost = false;
const listeners: (() => void)[] = [];

/** The current time, ms since 1970: the real one, or the development clock. */
export function nowMs(): number {
  return dev === null ? Date.now() : devTime(dev, Date.now());
}

/** The real time, ms since 1970, whatever the development clock says: for
 *  what is not a span of the cook (offline.ts, the hourly look for a new
 *  build). */
export function realMs(): number {
  return Date.now();
}

/** The cook's seconds to the real second, for what runs in real ones (the
 *  tick, the beeps scheduled ahead): 1 but on the development clock running
 *  fast. A stopped clock's steps are the cook's seconds, so it is 1 too. */
export function clockSpeed(): number {
  return dev === null || dev.speed === 0 ? 1 : dev.speed;
}

/** Call `f` whenever the development clock is set (never on the live site). */
export function onClockChange(f: () => void): void {
  listeners.push(f);
}

/** Whether this browser's log may hold an egg cooked on the development
 *  clock: the clock is on, or has been since Forget everything. */
export function devClockUsed(): boolean {
  if (!onDevHost) return false;
  if (dev !== null) return true;
  return readStorage(USED_KEY) !== null;
}

/** Forget everything: the log is gone, and with it the mark (unless the
 *  clock is still on). */
export function forgetDevClockUse(): void {
  if (!onDevHost) return;
  removeStorage(USED_KEY);
  if (dev !== null) markUsed();
}

/** Through the store's one door (store.ts), so a page that leaves a newer
 *  build's stores alone does not write this either; sharing reads the clock
 *  itself while it is on. */
function markUsed(): void {
  writeStorage(USED_KEY, '1');
}

/** The mark, for a clock set when the page loaded: written by the app once
 *  it may write (app.ts, after `claimStorage`), since this module loads, and
 *  sets its clock, before anything has asked whether it may. */
export function markDevClockUse(): void {
  if (onDevHost && dev !== null) markUsed();
}

function setClock(next: DevClock | null, mark = true): void {
  dev = next === null ? null : orNone(next);
  try {
    if (dev === null) sessionStorage.removeItem(CLOCK_KEY);
    else sessionStorage.setItem(CLOCK_KEY, JSON.stringify(dev));
  } catch {
    /* kept for this page only */
  }
  if (mark && dev !== null) markUsed();
  drawMark();
  for (const f of listeners) f();
}

/** The mark in the corner while the clock is on: the speed and the shift. */
function drawMark(): void {
  if (typeof document === 'undefined') return;
  if (document.body === null) {
    document.addEventListener('DOMContentLoaded', drawMark, { once: true });
    return;
  }
  let mark = document.getElementById('devClock');
  if (dev === null) {
    mark?.remove();
    return;
  }
  if (mark === null) {
    mark = document.createElement('div');
    mark.id = 'devClock';
    mark.setAttribute('aria-hidden', 'true');
    mark.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;pointer-events:none;padding:2px 6px;'
      + 'font:600 12px/1.4 ui-monospace,monospace;color:#fff;background:#b00020;border-bottom-right-radius:4px';
    document.body.append(mark);
  }
  const shift_s = Math.round((dev.page0_ms - dev.real0_ms) / 1000);
  const a = Math.abs(shift_s);
  const hms = `${Math.floor(a / 3600)}:${String(Math.floor(a / 60) % 60).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
  mark.textContent = `×${dev.speed} ${shift_s < 0 ? '−' : '+'}${hms}`;
}

/** What a console or a script can do to the clock, on this machine only. */
export interface ClockHandle {
  now(): number;
  /** The page's time moved by a span (`'+20m'`, or seconds). */
  shift(by: string | number): number;
  /** The page's time set to a moment (ms since 1970, or as `?at=` takes
   *  one), at the speed it had. */
  set(at: string | number): number;
  /** The cook's seconds to the real second, from now on; 0 stops it. */
  speed(x: number): number;
  off(): void;
  state(): DevClock | null;
}

function handle(): ClockHandle {
  const fresh = (): DevClock => ({ speed: dev === null ? 1 : dev.speed, real0_ms: Date.now(), page0_ms: nowMs() });
  return {
    now: nowMs,
    shift(by) {
      const ms = typeof by === 'number' ? by * 1000 : parseSpan(by);
      if (ms === null) throw new Error(`not a span: ${String(by)}`);
      const c = fresh();
      setClock({ ...c, page0_ms: c.page0_ms + ms });
      return nowMs();
    },
    set(at) {
      const ms = typeof at === 'number' ? at : parseMoment(at);
      if (ms === null || !Number.isFinite(ms)) throw new Error(`not a moment: ${String(at)}`);
      setClock({ ...fresh(), page0_ms: ms });
      return nowMs();
    },
    speed(x) {
      if (!(x >= 0) || !Number.isFinite(x)) throw new Error(`not a speed: ${x}`);
      setClock({ ...fresh(), speed: x });
      return nowMs();
    },
    off() {
      setClock(null);
    },
    state: () => dev,
  };
}

function boot(): void {
  if (typeof window === 'undefined' || typeof location === 'undefined') return;
  if (!isDevHost(location.hostname)) return;
  onDevHost = true;
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(CLOCK_KEY);
  } catch {
    stored = null;
  }
  const clock = devClockAt(location.hostname, location.search, stored, Date.now());
  const url = new URL(location.href);
  if (url.searchParams.has('clock') || url.searchParams.has('at')) {
    // Read once: a reload carries on from the clock kept, not the address.
    url.searchParams.delete('clock');
    url.searchParams.delete('at');
    history.replaceState(history.state, '', url.href);
  }
  (window as unknown as { aetClock: ClockHandle }).aetClock = handle();
  if (clock !== null || stored !== null) setClock(clock, false);
}

boot();
