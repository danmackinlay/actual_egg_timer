/**
 * The alarm on the audio clock (src/ui/clock.ts): the pull's ring scheduled
 * ahead for the deadline the plan sets, so a tab in the background, whose
 * timers the browser holds back, still rings on time; once per deadline;
 * never for a deadline already past when it is set (a page shown after it),
 * nor while muted. Which deadline rings when is `update`'s
 * (test/update.test.ts, the ticks and a reload); this is the sound.
 *
 * Run against an audio context that records what is started and stopped,
 * and the page's clock set here.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { primeAudio, pullSounding, ringAlarm, setMuted, setPullAlarm, stopAlarm } from '../src/ui/clock.js';
import { useClock } from '../src/ui/now.js';

/** The page's clock, ms. */
let now_ms = 1_791_363_600_000;
useClock({ now: () => now_ms, speed: () => 1, used: () => false, forget: () => undefined, mark: () => undefined });

(globalThis as unknown as { window: unknown }).window = {
  setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
  clearTimeout: (h: number) => clearTimeout(h),
};

/** A sound started on the audio clock, and whether it was stopped early. */
interface Played {
  at: number;
  stopped: boolean;
}

const played: Played[] = [];
/** The audio contexts the page made (`primeAudio`): one. */
const contexts: FakeContext[] = [];

class FakeContext {
  constructor() {
    contexts.push(this);
  }

  state = 'running';
  sampleRate = 4000;
  currentTime = 0;
  destination = {};
  resume(): Promise<void> {
    return Promise.resolve();
  }
  createBuffer(_channels: number, length: number, rate: number): unknown {
    const data = new Float32Array(length);
    return { duration: length / rate, getChannelData: () => data };
  }
  createBufferSource(): unknown {
    const p: Played = { at: NaN, stopped: false };
    let stops = 0;
    return {
      buffer: null, loop: false,
      connect: () => undefined,
      disconnect: () => undefined,
      start: (at: number) => { p.at = at; played.push(p); },
      // The first stop is the end of the ring, scheduled with it; a second
      // is the ring stopped.
      stop: () => { stops += 1; if (stops > 1) p.stopped = true; },
    };
  }
  createOscillator(): unknown {
    return { type: '', frequency: { setValueAtTime: () => undefined }, connect: () => undefined, start: () => undefined, stop: () => undefined };
  }
  createGain(): unknown {
    const ramp = { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined };
    return { gain: ramp, connect: () => undefined };
  }
}
(globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeContext;

primeAudio();

/** What is still to sound. */
function live(): Played[] {
  return played.filter((p) => !p.stopped);
}

test('the pull\'s ring is scheduled once for its deadline, and again only when the deadline moves', () => {
  stopAlarm();
  played.length = 0;
  setPullAlarm(now_ms + 60_000);
  setPullAlarm(now_ms + 60_000);
  setPullAlarm(now_ms + 60_000);
  assert.equal(played.length, 1, 'once, however many plans set it');
  assert.equal(Math.round(played[0].at), 60, 'a minute ahead on the audio clock');
  setPullAlarm(now_ms + 90_000);
  assert.equal(played.length, 2);
  assert.deepEqual(live().map((p) => Math.round(p.at)), [90], 'the old one stopped');
  setPullAlarm(null);
  assert.deepEqual(live(), [], 'no pull, nothing to ring');
});

test('a ring scheduled ahead sounds in a tab in the background: nothing waits for a tick', () => {
  stopAlarm();
  played.length = 0;
  setPullAlarm(now_ms + 30_000);
  // No tick comes: the browser holds the tab's timers back. The ring is on
  // the audio clock already, due at the deadline.
  assert.equal(live().length, 1);
  assert.equal(Math.round(live()[0].at), 30);
});

test('nothing is scheduled for a deadline already past when it is set', () => {
  stopAlarm();
  played.length = 0;
  setPullAlarm(now_ms - 1000);
  assert.deepEqual(played, [], 'a page shown after the pull does not ring it from the audio clock');
});

test('the pull rings once: the tick finds its ring sounding and takes it as the alarm, and there is no second', () => {
  stopAlarm();
  played.length = 0;
  setPullAlarm(now_ms + 10_000);
  assert.equal(played.length, 1);
  // The deadline comes on the audio clock.
  contexts[0].currentTime = 10;
  assert.equal(pullSounding(), true, 'sounding: not rung again');
  assert.equal(live().length, 1);
  assert.equal(pullSounding(), false, 'nothing scheduled any more');
  stopAlarm();
  assert.deepEqual(live(), []);
  contexts[0].currentTime = 0;
});

test('a ring not sounding when the tick comes is cancelled, for the tick to ring now', () => {
  stopAlarm();
  played.length = 0;
  setPullAlarm(now_ms + 10_000);
  // The audio clock was suspended with the page: still short of the ring.
  assert.equal(pullSounding(), false);
  assert.deepEqual(live(), [], 'cancelled');
  ringAlarm(true);
  assert.equal(live().length, 1, 'rung now, once');
  stopAlarm();
});

test('muted, nothing is scheduled or rung; unmuted, the pull is scheduled again', () => {
  stopAlarm();
  played.length = 0;
  setMuted(true);
  setPullAlarm(now_ms + 20_000);
  ringAlarm(false);
  assert.deepEqual(played, []);
  setMuted(false);
  assert.deepEqual(live().map((p) => Math.round(p.at)), [20]);
  stopAlarm();
  setPullAlarm(null);
});
