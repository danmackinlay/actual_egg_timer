/**
 * The page's clock and its one random draw: every read of the current time
 * in src/ui/ is `nowMs()`, or `realMs()` for what is not a span of the cook,
 * and the nudge's draw (answer.ts) is `random()`. On the live site, and
 * anywhere but a page served from this machine, they are `Date.now()` and
 * `Math.random()` and nothing else.
 *
 * A page served from localhost or 127.0.0.1 loads the development tools
 * before the app boots (main.ts, src/ui/dev/), which `npm run build:site`
 * leaves out of the site: the development clock (dev/clock.ts) puts its time
 * here with `useClock`, and a script's seed (dev/test.ts) its draw with
 * `useRandom`. Neither can be reached from anywhere else.
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

/** A clock other than the real one: the development clock's. */
export interface PageClock {
  /** The page's time, ms since 1970. */
  now(): number;
  /** The cook's seconds to the real second, for what runs in real ones. */
  speed(): number;
  /** Whether this browser's log may hold an egg cooked on it. */
  used(): boolean;
  /** Forget everything: the log is gone, and with it the mark. */
  forget(): void;
  /** The mark, once the app may write. */
  mark(): void;
}

let clock: PageClock | null = null;
let draw: () => number = Math.random;
let moved: () => void = () => {};

/** Only these: never the live site, whatever its address says. */
export function isDevHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/** The current time, ms since 1970: the real one, or the development clock. */
export function nowMs(): number {
  return clock === null ? Date.now() : clock.now();
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
  return clock === null ? 1 : clock.speed();
}

/** Call `f` whenever the development clock is set (never on the live
 *  site): once, at boot (cook.ts, `startRunner`). */
export function onClockChange(f: () => void): void {
  moved = f;
}

/** Whether this browser's log may hold an egg cooked on the development
 *  clock, so sharing sends nothing from it (share.ts): never on the live
 *  site. */
export function devClockUsed(): boolean {
  return clock !== null && clock.used();
}

/** Forget everything: the log is gone, and with it the mark (unless the
 *  development clock is still on). */
export function forgetDevClockUse(): void {
  clock?.forget();
}

/** The mark, for a development clock set when the page loaded: written by
 *  the app once it may write (app.ts, after `claimStorage`). */
export function markDevClockUse(): void {
  clock?.mark();
}

/** A number from [0, 1): `Math.random()`, or a script's seeded draw. */
export function random(): number {
  return draw();
}

/** The development clock in place of the real one (dev/clock.ts). */
export function useClock(c: PageClock): void {
  clock = c;
}

/** The development clock was set: the tick and the beeps take it up. */
export function clockChanged(): void {
  moved();
}

/** A seeded draw in place of `Math.random` (dev/test.ts). */
export function useRandom(f: () => number): void {
  draw = f;
}
