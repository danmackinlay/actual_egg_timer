/**
 * The page's clock (src/ui/now.ts): the real one everywhere but a page served
 * from this machine, whatever the address or the tab's storage says; on
 * localhost, the development clock the address asks for, kept for a reload.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { devClockAt, devTime, isDevHost, parseMoment, parseSpan } from '../src/ui/now.js';

const REAL = 1_790_000_000_000;
const KEPT = JSON.stringify({ speed: 60, real0_ms: REAL - 10_000, page0_ms: REAL + 3_600_000 });

test('1. only localhost and 127.0.0.1 are this machine', () => {
  for (const h of ['localhost', '127.0.0.1']) assert.equal(isDevHost(h), true, h);
  for (const h of ['actualeggtimer.netlify.app', 'localhost.example.com', 'example.localhost', '127.0.0.2', '']) {
    assert.equal(isDevHost(h), false, h);
  }
});

test('2. off this machine the clock is the real one, whatever the address and the tab kept', () => {
  for (const host of ['actualeggtimer.netlify.app', 'deploy-preview-1--actualeggtimer.netlify.app']) {
    assert.equal(devClockAt(host, '?clock=60&at=+1h', null, REAL), null);
    assert.equal(devClockAt(host, '', KEPT, REAL), null);
    assert.equal(devClockAt(host, '?at=-15m', KEPT, REAL), null);
    assert.equal(devClockAt(host, '?clock=0&at=2026-10-08T07:30:00Z', null, REAL), null);
  }
});

test('3. spans as ?at= takes them', () => {
  assert.equal(parseSpan('+7m40s'), 460_000);
  assert.equal(parseSpan('-15m'), -900_000);
  assert.equal(parseSpan('1h'), 3_600_000);
  assert.equal(parseSpan('90s'), 90_000);
  assert.equal(parseSpan('-90'), -90_000);
  assert.equal(parseSpan('2h1m'), 7_260_000);
  for (const bad of ['', '+', 'm', 'soon', '7m40x']) assert.equal(parseSpan(bad), null, bad);
});

test('4. on localhost: the speed and the shift asked for, carried on across a reload', () => {
  const c = devClockAt('localhost', '?clock=60&at=-15m', null, REAL);
  assert.deepEqual(c, { speed: 60, real0_ms: REAL, page0_ms: REAL - 900_000 });
  if (c === null) return;
  // Two real seconds on, a reload with the address read and taken out: the
  // clock carries on from where it had got to, at the same speed.
  const later = REAL + 2000;
  const back = devClockAt('127.0.0.1', '', JSON.stringify(c), later);
  assert.ok(back !== null);
  assert.equal(devTime(back, later), REAL - 900_000 + 120_000);
  assert.equal(back.speed, 60);
  // A shift alone keeps the speed kept; ?clock=off, or the real clock, is none.
  assert.equal(devClockAt('localhost', '?at=+1m', JSON.stringify(c), later)?.speed, 60);
  assert.equal(devClockAt('localhost', '?clock=off', JSON.stringify(c), later), null);
  assert.equal(devClockAt('localhost', '?clock=1&at=0', null, REAL), null);
  assert.equal(devClockAt('localhost', '', null, REAL), null);
  // What does not read is the real clock.
  assert.equal(devClockAt('localhost', '?clock=-3', '{"speed":"fast"}', REAL), null);
});

test('4b. a stopped clock: at the moment set, however much real time passes, and kept so across a reload', () => {
  const MOMENT = Date.UTC(2026, 9, 8, 7, 30);
  assert.equal(parseMoment('2026-10-08T07:30:00Z'), MOMENT);
  assert.equal(parseMoment('2026-10-08T09:30+02:00'), MOMENT);
  for (const bad of ['', '2026-10-08', '07:30', 'tomorrow', '2026-10-08T07:30:00']) assert.equal(parseMoment(bad), null, bad);
  const c = devClockAt('127.0.0.1', '?clock=0&at=2026-10-08T07:30:00Z', null, REAL);
  assert.deepEqual(c, { speed: 0, real0_ms: REAL, page0_ms: MOMENT });
  if (c === null) return;
  assert.equal(devTime(c, REAL + 3_600_000), MOMENT);
  // A reload an hour of real time later: still stopped, still at the moment.
  const back = devClockAt('localhost', '', JSON.stringify(c), REAL + 3_600_000);
  assert.ok(back !== null);
  assert.equal(back.speed, 0);
  assert.equal(devTime(back, REAL + 7_200_000), MOMENT);
  // Stopped where the real clock is: still a clock of its own.
  assert.deepEqual(devClockAt('localhost', '?clock=0', null, REAL), { speed: 0, real0_ms: REAL, page0_ms: REAL });
  // An empty ?clock= is not a speed.
  assert.equal(devClockAt('localhost', '?clock=', null, REAL), null);
});

/** The module as a page loads it, at `hostname` with `search`, the tab
 *  having kept `kept`: a fresh instance each time. */
async function pageAt(hostname: string, search: string, kept: string | null): Promise<{
  m: typeof import('../src/ui/now.js'); win: Record<string, unknown>; local: Map<string, string>;
}> {
  const session = new Map<string, string>(kept === null ? [] : [['aet.devClock', kept]]);
  const local = new Map<string, string>();
  const store = (m: Map<string, string>): Storage => ({
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  }) as unknown as Storage;
  // The store module (store.ts), which the mark is written through, reads
  // `window.localStorage`.
  const win: Record<string, unknown> = { localStorage: store(local) };
  const g = globalThis as Record<string, unknown>;
  g['window'] = win;
  g['location'] = { hostname: hostname, search: search, href: `https://${hostname}/${search}` };
  g['history'] = { state: null, replaceState: () => { /* the address */ } };
  g['sessionStorage'] = store(session);
  g['localStorage'] = store(local);
  const m = await import(`../src/ui/now.js?${hostname}${search}${kept ?? ''}`) as typeof import('../src/ui/now.js');
  return { m: m, win: win, local: local };
}

test('5. the page on the live site: Date.now, no handle, no mark, nothing kept, sharing untouched', async () => {
  const { m, win, local } = await pageAt('actualeggtimer.netlify.app', '?clock=60&at=+2h', KEPT);
  const before = Date.now();
  const t = m.nowMs();
  assert.ok(t >= before && t <= Date.now());
  assert.equal(m.clockSpeed(), 1);
  assert.equal(m.devClockUsed(), false);
  assert.equal(win['aetClock'], undefined);
  assert.equal(local.size, 0);
});

test('6. the page on localhost: the clock asked for, its handle, and the log marked', async () => {
  const { m, win, local } = await pageAt('localhost', '?clock=60&at=+2h', null);
  assert.equal(m.clockSpeed(), 60);
  assert.ok(m.nowMs() - Date.now() > 7_190_000);
  assert.equal(m.devClockUsed(), true);
  // Marked once the app may write (app.ts, after `claimStorage`), not as the
  // module loads (DECISIONS.md 100).
  assert.equal(local.get('aet.devClock.used'), undefined);
  m.markDevClockUse();
  assert.equal(local.get('aet.devClock.used'), '1');
  assert.ok(win['aetClock'] !== undefined);
});

test('7. stepped from a script: stopped, set to a moment, shifted, and running again', async () => {
  const { m, win } = await pageAt('127.0.0.1', '?clock=0&at=2026-10-08T07:30:00Z', null);
  const clock = win['aetClock'] as import('../src/ui/now.js').ClockHandle;
  const MOMENT = Date.UTC(2026, 9, 8, 7, 30);
  assert.equal(m.nowMs(), MOMENT);
  assert.equal(m.clockSpeed(), 1, 'the tick and the beeps ahead take a stopped clock\'s steps as seconds');
  // A shift keeps it stopped: the moment moves by the span, exactly.
  assert.equal(clock.shift('+7m40s'), MOMENT + 460_000);
  assert.equal(clock.shift(-0.5), MOMENT + 459_500);
  assert.equal(clock.state()?.speed, 0);
  assert.equal(clock.set('2026-10-08T08:00:00Z'), MOMENT + 1_800_000);
  assert.equal(clock.set(MOMENT), MOMENT);
  assert.equal(m.nowMs(), MOMENT);
  assert.throws(() => clock.set('soon'));
  assert.throws(() => clock.speed(-1));
  // Running again from where it stood.
  clock.speed(60);
  assert.equal(m.clockSpeed(), 60);
  assert.ok(m.nowMs() >= MOMENT);
  clock.speed(0);
  const t = m.nowMs();
  assert.equal(m.nowMs(), t);
});
