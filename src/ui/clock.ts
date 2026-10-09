/**
 * Wall-clock timing, screen wake lock, and the alarm.
 *
 * Nothing here accumulates ticks. A backgrounded tab has its timers clamped to
 * once a minute or stopped outright, so every displayed value is derived from
 * the clock (`nowMs`, now.ts) against an absolute deadline, and the display
 * is reconciled on `visibilitychange`. The audio alarm is scheduled ahead on
 * the AudioContext clock for the same reason: that clock keeps running when
 * setInterval does not.
 */

import { ALARM_RING_S, AlarmMoment, AlarmSound, DEFAULT_ALARM_SOUND, alarmRepeats } from '../core/sounds.js';
import { RECORDINGS, beepsPeriod, recordedPeriod, synthPeriod } from './alarmSounds.js';
import { request, soon } from './idle.js';
import { clockSpeed, nowMs } from './now.js';

/** Nominal tick, ms. Only affects how often we repaint, never the arithmetic. */
const TICK_MS = 200;

/** The tick, real ms: 200 on the real clock. On the development clock
 *  (dev/clock.ts) it is 0.2 s of the cook's time, never under 16 ms, so at x60 a
 *  tick is about a second of the cook and still sees the 20-s pull. */
function tickMs(): number {
  return Math.max(16, TICK_MS / clockSpeed());
}

/** The running ticker's way to take up a new speed, if one runs. */
let ticking: (() => void) | null = null;

/** The development clock set (never on the live site): the tick takes up
 *  its speed, and the pull's beeps are scheduled again for where it now is. */
export function clockMoved(): void {
  if (ticking !== null) ticking();
  armPull();
}

export interface Ticker {
  stop(): void;
}

/** Repaint on a timer, and again whenever the tab comes back to the foreground
 *  or the window is refocused, so a throttled tab snaps straight to the truth. */
export function startTicker(onTick: () => void): Ticker {
  let handle = window.setInterval(onTick, tickMs());
  ticking = (): void => {
    window.clearInterval(handle);
    handle = window.setInterval(onTick, tickMs());
  };
  const reconcile = (): void => {
    onTick();
  };
  document.addEventListener('visibilitychange', reconcile);
  window.addEventListener('focus', reconcile);
  window.addEventListener('pageshow', reconcile);
  return {
    stop(): void {
      window.clearInterval(handle);
      ticking = null;
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
let ringing: AudioScheduledSourceNode[] = [];
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
  prepare();
}

/* ------------------------------------------------------------ alarm sounds */

/** The sound the cook chose (DECISIONS.md 101). */
let sound: AlarmSound = DEFAULT_ALARM_SOUND;

/** One period of each sound and moment, as the audio context's buffers, made
 *  once: the sounds made in code take tens of milliseconds to render, and the
 *  hen's recordings must be fetched and decoded. */
const periods = new Map<string, AudioBuffer>();
/** The hen's recordings as fetched, before a context exists to decode them. */
const fetched = new Map<AlarmMoment, Promise<ArrayBuffer>>();
const decoded = new Map<AlarmMoment, Float32Array>();

/** The cook's choice, from the settings. A pull already scheduled ahead is
 *  scheduled again in the new sound. */
export function setAlarmSound(next: AlarmSound): void {
  if (next === sound) return;
  sound = next;
  prepare();
  armPull();
}

/** Get the chosen sound ready, without holding up the tap that asked: the
 *  hen's files fetched and decoded, the others rendered, a moment later. */
function prepare(): void {
  if (sound === 'hen') {
    for (const moment of ['pull', 'cooled'] as AlarmMoment[]) void loadRecording(moment);
  }
  const ctx = audio;
  if (ctx === null) return;
  const chosen = sound;
  soon(() => {
    periodBuffer(ctx, chosen, 'pull');
    periodBuffer(ctx, chosen, 'cooled');
  }, 0);
}

/** One of the hen's recordings, decoded at the context's rate; null while it
 *  cannot be (no context yet) or if it failed, which the beeps then cover.
 *  A recording decoded after its pull was scheduled ahead in beeps puts the
 *  hen there in their place. */
async function loadRecording(moment: AlarmMoment): Promise<Float32Array | null> {
  const ready = decoded.get(moment);
  if (ready !== undefined) return ready;
  let bytes = fetched.get(moment);
  if (bytes === undefined) {
    bytes = request(RECORDINGS[moment]).then((r) => {
      if (!r.ok) throw new Error(`${RECORDINGS[moment]}: ${r.status}`);
      return r.arrayBuffer();
    });
    // A failed fetch is asked again next time, not remembered.
    bytes.catch(() => fetched.delete(moment));
    fetched.set(moment, bytes);
  }
  const ctx = audio;
  if (ctx === null) return null;
  try {
    // decodeAudioData takes the bytes for its own, so it is given a copy.
    const buffer = await ctx.decodeAudioData((await bytes).slice(0));
    const samples = buffer.getChannelData(0);
    decoded.set(moment, samples);
    if (sound === 'hen' && moment === 'pull') armPull();
    return samples;
  } catch {
    return null;
  }
}

/** One period of a sound as a buffer the context can loop, or null for a
 *  recording not yet decoded. */
function periodBuffer(ctx: AudioContext, of: AlarmSound, moment: AlarmMoment): AudioBuffer | null {
  const key = `${of}-${moment}`;
  const made = periods.get(key);
  if (made !== undefined) return made;
  let samples = synthPeriod(of, moment, ctx.sampleRate);
  if (samples === null) {
    const recording = decoded.get(moment);
    if (recording === undefined) return null;
    samples = recordedPeriod(recording, ctx.sampleRate, moment);
  }
  const buffer = toBuffer(ctx, samples);
  periods.set(key, buffer);
  return buffer;
}

function toBuffer(ctx: AudioContext, samples: Float32Array): AudioBuffer {
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

/** A period looped from `at` on the audio clock, `repeats` times. */
function loop(ctx: AudioContext, buffer: AudioBuffer, at: number, repeats: number): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(ctx.destination);
  source.start(at);
  source.stop(at + repeats * buffer.duration);
  return source;
}

/** The sound being played once in Settings, if one is. */
let previewing: AudioBufferSourceNode | null = null;

/** Play the chosen sound once, as it rings when the cooling is done: the
 *  cook choosing one in Settings hears it. Not a ring, so it stops nothing
 *  but the last one played. Must be called from the tap. */
export function previewAlarm(): void {
  primeAudio();
  const ctx = audio;
  if (ctx === null) return;
  const chosen = sound;
  const play = (): void => {
    const buffer = periodBuffer(ctx, chosen, 'cooled');
    if (buffer === null || chosen !== sound) return;
    if (previewing !== null) stopAll([previewing]);
    previewing = loop(ctx, buffer, ctx.currentTime + 0.05, 1);
  };
  if (chosen === 'hen' && !decoded.has('cooled')) void loadRecording('cooled').then(play);
  else play();
}

/** One beep on the audio clock, for a blip, which is left to end on its
 *  own. */
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

/** The alarm from `base` on the audio clock: the chosen sound's period,
 *  looped for ~40 s (`alarmRepeats`). The hen's, while its recording is not
 *  yet decoded or could not be fetched, is the beeps the sounds replaced, so
 *  that an alarm always rings. */
function scheduleRing(ctx: AudioContext, base: number, urgent: boolean): AudioScheduledSourceNode[] {
  const moment: AlarmMoment = urgent ? 'pull' : 'cooled';
  const buffer = periodBuffer(ctx, sound, moment);
  if (buffer !== null) return [loop(ctx, buffer, base, alarmRepeats(sound, moment))];
  const beeps = toBuffer(ctx, beepsPeriod(moment, ctx.sampleRate));
  return [loop(ctx, beeps, base, Math.round(ALARM_RING_S / beeps.duration))];
}

/** Ring until stopped (or for ~40 s, whichever comes first). The whole ring
 *  is scheduled up front on the audio clock so the alarm still sounds if the
 *  tab is backgrounded mid-ring. */
export function ringAlarm(urgent: boolean): void {
  primeAudio();
  const ctx = audio;
  if (ctx === null || muted) return;
  stopAlarm();
  ringing = scheduleRing(ctx, ctx.currentTime + 0.05, urgent);
}

function stopAll(beeps: AudioScheduledSourceNode[]): void {
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
  /** The ring scheduled, and where on the audio clock it starts. */
  beeps: [] as AudioScheduledSourceNode[],
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
  // Cook seconds ahead, on an audio clock that runs in real ones.
  const ahead_s = (pull.at_ms - nowMs()) / 1000 / clockSpeed();
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
