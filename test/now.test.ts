/**
 * The page's clock (src/ui/now.ts): the real one everywhere but a page served
 * from this machine, whatever the address or the tab's storage says; on
 * localhost, the development clock the address asks for, kept for a reload.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { devClockAt, devTime, isDevHost, parseSpan } from '../src/ui/now.js';

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
  const win: Record<string, unknown> = {};
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
  assert.equal(local.get('aet.devClock.used'), '1');
  assert.ok(win['aetClock'] !== undefined);
});
