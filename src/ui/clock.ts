/**
 * Wall-clock timing, screen wake lock, and the alarm.
 *
 * Nothing here accumulates ticks. A backgrounded tab has its timers clamped to
 * once a minute or stopped outright, so every displayed value is derived from
 * `Date.now()` against an absolute deadline, and the display is reconciled on
 * `visibilitychange`. The audio alarm is scheduled ahead on the AudioContext
 * clock for the same reason: that clock keeps running when setInterval does not.
 */

/** Nominal tick, ms. Only affects how often we repaint, never the arithmetic. */
const TICK_MS = 200;

export interface Ticker {
  stop(): void;
}

/** Repaint on a timer, and again whenever the tab comes back to the foreground
 *  or the window is refocused, so a throttled tab snaps straight to the truth. */
export function startTicker(onTick: () => void): Ticker {
  const handle = window.setInterval(onTick, TICK_MS);
  const reconcile = (): void => {
    onTick();
  };
  document.addEventListener('visibilitychange', reconcile);
  window.addEventListener('focus', reconcile);
  window.addEventListener('pageshow', reconcile);
  return {
    stop(): void {
      window.clearInterval(handle);
      document.removeEventListener('visibilitychange', reconcile);
      window.removeEventListener('focus', reconcile);
      window.removeEventListener('pageshow', reconcile);
    },
  };
}

/* ---------------------------------------------------------------- wake lock */

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

function wakeLockApi(): WakeLockLike | null {
  const nav = navigator as unknown as { wakeLock?: WakeLockLike };
  return nav.wakeLock === undefined ? null : nav.wakeLock;
}

let sentinel: WakeLockSentinelLike | null = null;
let wakeWanted = false;
let wakeListenerAttached = false;

async function acquire(): Promise<void> {
  const api = wakeLockApi();
  if (api === null || !wakeWanted || sentinel !== null) return;
  if (document.visibilityState !== 'visible') return;
  try {
    const held = await api.request('screen');
    if (!wakeWanted) {
      void held.release();
      return;
    }
    sentinel = held;
    held.addEventListener('release', () => {
      if (sentinel === held) sentinel = null;
    });
  } catch {
    /* Unsupported, blocked by policy, or the tab lost focus mid-request.
       The timer still works; the screen may just sleep. */
  }
}

/** Ask for the screen to stay awake, and keep asking: the sentinel is dropped
 *  every time the tab is hidden, so it has to be re-acquired on return. */
export function keepScreenAwake(): void {
  wakeWanted = true;
  if (!wakeListenerAttached) {
    wakeListenerAttached = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void acquire();
    });
  }
  void acquire();
}

export function releaseScreen(): void {
  wakeWanted = false;
  const held = sentinel;
  sentinel = null;
  if (held !== null) {
    try {
      void held.release();
    } catch {
      /* already gone */
    }
  }
}

/* -------------------------------------------------------------------- alarm */

type AudioContextCtor = new () => AudioContext;

let audio: AudioContext | null = null;
let ringing: OscillatorNode[] = [];

function audioCtor(): AudioContextCtor | null {
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  if (w.AudioContext !== undefined) return w.AudioContext;
  if (w.webkitAudioContext !== undefined) return w.webkitAudioContext;
  return null;
}

/** Must be called from inside a user gesture (the Start tap). Browsers will
 *  not let a page make noise otherwise, and an alarm that cannot ring is
 *  worse than no alarm. Safe to call repeatedly. */
export function primeAudio(): void {
  if (audio === null) {
    const Ctor = audioCtor();
    if (Ctor === null) return;
    try {
      audio = new Ctor();
    } catch {
      audio = null;
      return;
    }
  }
  if (audio.state === 'suspended') void audio.resume();
}

function scheduleBeep(ctx: AudioContext, at: number, freq: number, length: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, at);
  // Ramped rather than gated: a square-edged gate clicks.
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.35, at + 0.012);
  gain.gain.setValueAtTime(0.35, at + length - 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
  ringing.push(osc);
}

const BURST_PERIOD_S = 1.6;
const BURSTS = 25;

/** Ring until stopped (or for ~40 s, whichever comes first). Every beep is
 *  scheduled up front on the audio clock so the alarm still sounds if the tab
 *  is backgrounded when the deadline arrives. */
export function ringAlarm(urgent: boolean): void {
  primeAudio();
  const ctx = audio;
  if (ctx === null) return;
  stopAlarm();
  const base = ctx.currentTime + 0.05;
  for (let i = 0; i < BURSTS; i += 1) {
    const at = base + i * BURST_PERIOD_S;
    scheduleBeep(ctx, at, 880, 0.14);
    scheduleBeep(ctx, at + 0.2, 880, 0.14);
    if (urgent) scheduleBeep(ctx, at + 0.4, 1175, 0.2);
  }
}

export function stopAlarm(): void {
  for (let i = 0; i < ringing.length; i += 1) {
    try {
      ringing[i].stop();
      ringing[i].disconnect();
    } catch {
      /* already stopped */
    }
  }
  ringing = [];
}

/** A single short confirmation blip, for state changes that are not alarms. */
export function blip(): void {
  const ctx = audio;
  if (ctx === null) return;
  scheduleBeep(ctx, ctx.currentTime + 0.01, 660, 0.07);
}
