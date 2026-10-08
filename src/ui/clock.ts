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

function wakeLockApi(): WakeLock | null {
  return 'wakeLock' in navigator ? navigator.wakeLock : null;
}

let sentinel: WakeLockSentinel | null = null;
let wakeWanted = false;
let wakeListenerAttached = false;

async function acquire(): Promise<void> {
  const api = wakeLockApi();
  if (api === null || !wakeWanted || sentinel !== null) return;
  if (document.visibilityState !== 'visible') return;
  try {
    const held = await api.request('screen');
    if (!wakeWanted) {
      held.release().catch(() => { /* already gone */ });
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
  if (held !== null) held.release().catch(() => { /* already gone */ });
}

/* -------------------------------------------------------------------- alarm */

type AudioContextCtor = new () => AudioContext;

let audio: AudioContext | null = null;
let ringing: OscillatorNode[] = [];
let muted = false;

/** Silence the alarm and the blips. Muting mid-ring stops the ring. The audio
 *  context is still primed on the Start tap, so unmuting later works. */
export function setMuted(value: boolean): void {
  muted = value;
  if (muted) stopAlarm();
  else armPull();
}

function audioCtor(): AudioContextCtor | null {
  return typeof AudioContext === 'undefined' ? null : AudioContext;
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

/** One beep on the audio clock. The alarm keeps its beeps, to stop them;
 *  a blip is left to end on its own. */
function scheduleBeep(ctx: AudioContext, at: number, freq: number, length: number): OscillatorNode {
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
  return osc;
}

const BURST_PERIOD_S = 1.6;
const BURSTS = 25;

/** The alarm's beeps from `base` on the audio clock: two short, and a third
 *  higher when it is urgent, every 1.6 s for ~40 s. */
function scheduleRing(ctx: AudioContext, base: number, urgent: boolean): OscillatorNode[] {
  const beeps: OscillatorNode[] = [];
  for (let i = 0; i < BURSTS; i += 1) {
    const at = base + i * BURST_PERIOD_S;
    beeps.push(scheduleBeep(ctx, at, 880, 0.14));
    beeps.push(scheduleBeep(ctx, at + 0.2, 880, 0.14));
    if (urgent) beeps.push(scheduleBeep(ctx, at + 0.4, 1175, 0.2));
  }
  return beeps;
}

/** Ring until stopped (or for ~40 s, whichever comes first). Every beep is
 *  scheduled up front on the audio clock so the alarm still sounds if the tab
 *  is backgrounded mid-ring. */
export function ringAlarm(urgent: boolean): void {
  primeAudio();
  const ctx = audio;
  if (ctx === null || muted) return;
  stopAlarm();
  ringing = scheduleRing(ctx, ctx.currentTime + 0.05, urgent);
}

function stopAll(beeps: OscillatorNode[]): void {
  for (let i = 0; i < beeps.length; i += 1) {
    try {
      beeps[i].stop();
      beeps[i].disconnect();
    } catch {
      /* already stopped */
    }
  }
}

/** Silence the alarm, and the pull's beeps scheduled ahead (`setPullAlarm`),
 *  which the next plan schedules again. */
export function stopAlarm(): void {
  stopAll(ringing);
  ringing = [];
  stopAll(pull.beeps);
  pull.beeps = [];
}

/**
 * The pull's alarm, scheduled ahead on the audio clock (running-cook review
 * 1.1): a tab hidden or throttled keeps its audio clock running when its
 * timers do not, so the pull rings on time even if no tick sees it. `at_ms`
 * is the pull's deadline by the wall clock, or null for none; each plan sets
 * it, and the beeps are scheduled again only when it moves. Nothing is
 * scheduled for a time already past, muted, or before the Start tap primed
 * the audio.
 */
const pull = {
  at_ms: null as number | null,
  /** The beeps scheduled, and where on the audio clock they start. */
  beeps: [] as OscillatorNode[],
  start: 0,
};

export function setPullAlarm(at_ms: number | null): void {
  if (at_ms === pull.at_ms && (at_ms === null || pull.beeps.length > 0)) return;
  pull.at_ms = at_ms;
  armPull();
}

function armPull(): void {
  stopAll(pull.beeps);
  pull.beeps = [];
  const ctx = audio;
  if (ctx === null || muted || pull.at_ms === null) return;
  const ahead_s = (pull.at_ms - Date.now()) / 1000;
  if (ahead_s <= 0.05) return;
  pull.start = ctx.currentTime + ahead_s;
  pull.beeps = scheduleRing(ctx, pull.start, true);
}

/**
 * The tick has seen the pull: whether its beeps, scheduled ahead, are
 * already sounding, in which case they ring on as the alarm. If they are not
 * (the audio clock was suspended with the page, or nothing was scheduled)
 * they are cancelled, for the caller to ring now.
 */
export function pullSounding(): boolean {
  const ctx = audio;
  const sounding = ctx !== null && pull.beeps.length > 0 && ctx.currentTime >= pull.start - 0.25;
  if (sounding) {
    stopAll(ringing);
    ringing = pull.beeps;
  } else {
    stopAll(pull.beeps);
  }
  pull.beeps = [];
  pull.at_ms = null;
  return sounding;
}

/** A single short confirmation blip, for state changes that are not alarms. */
export function blip(): void {
  const ctx = audio;
  if (ctx === null || muted) return;
  scheduleBeep(ctx, ctx.currentTime + 0.01, 660, 0.07);
}
