/**
 * The development clock: a page served from localhost or 127.0.0.1 can run a
 * clock of its own, so an eleven-minute cook takes seconds and a reload, a
 * second tab or a tab woken past the pull can be checked without waiting
 * (`npm run e2e`, tools/e2e.ts). It is loaded only there (main.ts), and not
 * shipped (`npm run build:site` leaves src/ui/dev/ out); on the live site the
 * clock is `Date.now()` (now.ts).
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
 * it is at the moment the script set, however slow the machine running it.
 * While it is on, a mark sits in the page's corner - the speed and the
 * shift, no words - and sharing sends nothing from this browser's log until
 * Forget everything clears it (`devClockUsed`, share.ts): an egg cooked on a
 * made-up clock never reaches a server.
 */

import { clockChanged, isDevHost, nowMs, useClock } from '../now.js';
import { STORES } from '../../core/stores.js';
import { readStorage, removeStorage, writeStorage } from '../store.js';

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
const USED_KEY = STORES.devClockUsed.web;

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

/** Through the store's one door (store.ts), so a page that leaves a newer
 *  build's stores alone does not write this either; sharing reads the clock
 *  itself while it is on. */
function markUsed(): void {
  writeStorage(USED_KEY, '1');
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
  clockChanged();
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

/** The clock this page was asked for, in place of the real one, and its
 *  handle, `window.aetClock`; nothing on any host but this machine. */
export function installDevClock(): void {
  if (typeof window === 'undefined' || typeof location === 'undefined') return;
  if (!isDevHost(location.hostname)) return;
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
  useClock({
    now: () => (dev === null ? Date.now() : devTime(dev, Date.now())),
    speed: () => (dev === null || dev.speed === 0 ? 1 : dev.speed),
    used: () => dev !== null || readStorage(USED_KEY) !== null,
    forget() {
      removeStorage(USED_KEY);
      if (dev !== null) markUsed();
    },
    mark() {
      if (dev !== null) markUsed();
    },
  });
  (window as unknown as { aetClock: ClockHandle }).aetClock = handle();
  if (clock !== null || stored !== null) setClock(clock, false);
}
