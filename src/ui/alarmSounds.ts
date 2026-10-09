/**
 * The alarm sounds, as samples (DECISIONS.md 101).
 *
 * One period of each sound's pattern, mono, at any sample rate: the web plays
 * it looped on the audio clock (`clock.ts`), and `npm run sounds` renders the
 * same samples into the files the iOS app plays (`tools/sounds.ts`). No DOM
 * and no audio API here, so both can call it, and so can the tests.
 *
 * Two are made in code, as the owner first heard them on the auditions page
 * (October 2026), with Math.random replaced by a seeded generator so that a
 * render is the same every time:
 *
 * - The wind-up timer: a hammer striking a small steel dome 21 times a
 *   second, each strike four decaying sines (the dome's modes), fading as it
 *   runs down. It rings 1.2 s when cooled and 2 s at the pull.
 * - The cuckoo clock: two pipe notes a minor third apart, F5 then D5, each a
 *   sine with a little of its second and third harmonics and a breath of
 *   bandpassed noise, after a click of the door. Two calls when cooled and
 *   three, closer together, at the pull.
 *
 * The hen is two recordings, CC0, from Freesound: the egg song, the cackle a
 * hen makes after laying, by Jofae (freesound.org/s/353252, trimmed to 3.4 s
 * from 3.9 s), when cooled, and an alarm call by Rudmer Rotteveel
 * (freesound.org/s/316920), at the pull. Their files are `RECORDINGS`; the
 * caller decodes them, and `recordedPeriod` lays one in its period.
 *
 * Every period is levelled to the beeps the sounds replaced, at the same
 * moment: the loudest 400 ms of a looped period (momentary loudness, ITU-R
 * BS.1770) matches the beeps', so no sound is quieter than the alarm a cook
 * already relied on. A peak is never let past -1 dBFS; a sound that would
 * need more is left that much quieter.
 */

import { AlarmMoment, AlarmSound, alarmPeriod_s } from '../core/sounds.js';

/** The hen's recordings, relative to the page (and to `assets/` in the
 *  repository for `npm run sounds`). */
export const RECORDINGS: Record<AlarmMoment, string> = {
  pull: 'assets/sounds/hen-alarm.mp3',
  cooled: 'assets/sounds/hen-song.mp3',
};

/** The highest a levelled sample may reach: -1 dBFS. */
export const PEAK = 0.891;

/** Where in its period a pattern starts, s: room for the cuckoo's door, which
 *  opens just before the first call. */
const LEAD_S = 0.05;

/* ------------------------------------------------------------- the period */

/** One period of a sound made in code, levelled; null for the hen, which is
 *  recorded (`recordedPeriod`). */
export function synthPeriod(sound: AlarmSound, moment: AlarmMoment, rate: number): Float32Array | null {
  if (sound === 'hen') return null;
  const out = new Float32Array(Math.round(alarmPeriod_s(sound, moment) * rate));
  if (sound === 'timer') timer(out, rate, LEAD_S, moment === 'pull');
  else cuckoo(out, rate, LEAD_S, moment === 'pull');
  return level(out, rate, moment);
}

/** A decoded recording laid at the start of its period, levelled. Longer than
 *  the period, it is cut. */
export function recordedPeriod(samples: Float32Array, rate: number, moment: AlarmMoment): Float32Array {
  const out = new Float32Array(Math.round(alarmPeriod_s('hen', moment) * rate));
  out.set(samples.length > out.length ? samples.subarray(0, out.length) : samples);
  return level(out, rate, moment);
}

/** The beeps both apps rang before these sounds, as one period: two 880 Hz
 *  beeps, and a third at 1175 Hz at the pull, every 1.6 s. The loudness every
 *  sound is levelled to, and the web's alarm when the hen's recordings could
 *  not be loaded. */
export function beepsPeriod(moment: AlarmMoment, rate: number): Float32Array {
  const out = new Float32Array(Math.round(1.6 * rate));
  tone(out, rate, 0, 880, 0.14, 0.35, 0.012, 0.03, 'triangle');
  tone(out, rate, 0.2, 880, 0.14, 0.35, 0.012, 0.03, 'triangle');
  if (moment === 'pull') tone(out, rate, 0.4, 1175, 0.2, 0.35, 0.012, 0.03, 'triangle');
  return out;
}

/* -------------------------------------------------------------- the sounds */

/** The wind-up timer's bell: a hammer on a small steel dome, 21 strikes a
 *  second, each a little off the beat and of its own strength, fading to half
 *  as the spring runs down. */
function timer(out: Float32Array, rate: number, t: number, urgent: boolean): void {
  const dome: [number, number, number][] = [[1760, 0.12, 0.3], [4083, 0.06, 0.18], [6790, 0.03, 0.08], [8980, 0.02, 0.05]];
  const random = seeded(3);
  const length = urgent ? 2.0 : 1.2;
  const every = 1 / 21;
  for (let s = 0; s * every < length; s++) {
    const fade = 1 - 0.5 * (s * every / length);
    const at = t + s * every + (random() - 0.5) * 0.006;
    const strength = (0.7 + random() * 0.3) * fade * 0.55;
    for (let m = 0; m < dome.length; m++) mode(out, rate, at, dome[m][0], dome[m][1], dome[m][2] * strength);
  }
}

/** The cuckoo clock: the door, then "cu-ckoo" on two wooden pipes. */
function cuckoo(out: Float32Array, rate: number, t: number, urgent: boolean): void {
  const random = seeded(5);
  const calls = urgent ? 3 : 2;
  const gap = urgent ? 0.62 : 0.8;
  grain(out, rate, random, t - 0.04, 0.03, 'lowpass', 900, 2, 0.25);
  for (let i = 0; i < calls; i++) {
    const notes: [number, number, number][] = [[0, 698.5, 0.2], [0.25, 587.3, 0.32]];
    for (let n = 0; n < notes.length; n++) {
      const at = t + i * gap + notes[n][0];
      const f = notes[n][1];
      const length = notes[n][2];
      tone(out, rate, at, f, length, 0.32, 0.025, 0.07, 'sine');
      tone(out, rate, at, f * 2, length, 0.07, 0.03, 0.07, 'sine');
      tone(out, rate, at, f * 3, length, 0.025, 0.03, 0.07, 'sine');
      grain(out, rate, random, at, length, 'bandpass', f, 6, 0.06);
    }
  }
}

/* -------------------------------------------------------- the building blocks */

// Each adds into `out` as a ring: what runs past the end of the period comes
// in again at its start, as it does when the period repeats. Envelopes follow
// the Web Audio API's exponential ramps, which the sounds were written with:
// from 0.0001 up to the peak, and down to 0.0001 again.

const FLOOR = 0.0001;

/** An exponential ramp from `from` to `to` over `span`, at `elapsed`. */
function ramp(from: number, to: number, elapsed: number, span: number): number {
  return from * Math.pow(to / from, elapsed / span);
}

/** A tone with an attack, a hold and a release. */
function tone(
  out: Float32Array, rate: number, at: number, f: number, length: number, peak: number,
  attack: number, release: number, shape: 'sine' | 'triangle',
): void {
  // From the first sample at or after `at`, timed from `at` itself: strikes
  // overlap, and where each falls between two samples decides how they add.
  const start = Math.ceil(at * rate);
  const count = Math.round((length + 0.02) * rate);
  for (let n = 0; n < count; n++) {
    const t = (start + n) / rate - at;
    let gain: number;
    if (t < attack) gain = ramp(FLOOR, peak, t, attack);
    else if (t < length - release) gain = peak;
    else if (t < length) gain = ramp(peak, FLOOR, t - (length - release), release);
    else gain = FLOOR;
    const cycle = (t * f) % 1;
    const wave = shape === 'sine' ? Math.sin(2 * Math.PI * cycle) : 1 - 4 * Math.abs(cycle - 0.5);
    add(out, start + n, gain * wave);
  }
}

/** One mode of something struck: a sine that rises in 2 ms and decays to
 *  nothing over about seven times `decay`. */
function mode(out: Float32Array, rate: number, at: number, f: number, decay: number, peak: number): void {
  const start = Math.ceil(at * rate);
  const rise = 0.002;
  const fall = decay * 6.9 - rise;
  const count = Math.round(decay * 7 * rate);
  for (let n = 0; n < count; n++) {
    const t = (start + n) / rate - at;
    const gain = t < rise ? ramp(FLOOR, peak, t, rise) : t < rise + fall ? ramp(peak, FLOOR, t - rise, fall) : FLOOR;
    add(out, start + n, gain * Math.sin(2 * Math.PI * f * t));
  }
}

/** A burst of white noise through a filter, shaped as a strike. */
function grain(
  out: Float32Array, rate: number, random: () => number, at: number, length: number,
  type: 'lowpass' | 'bandpass', f: number, q: number, peak: number,
): void {
  const start = Math.ceil(at * rate);
  const count = Math.round(length * rate);
  const rise = Math.min(0.003, length / 3);
  const filter = biquad(type, f, q, rate);
  for (let n = 0; n < count; n++) {
    const t = (start + n) / rate - at;
    const gain = t < rise ? ramp(FLOOR, peak, t, rise) : ramp(peak, FLOOR, t - rise, length - rise);
    add(out, start + n, gain * filter(random() * 2 - 1));
  }
}

function add(out: Float32Array, index: number, value: number): void {
  const i = ((index % out.length) + out.length) % out.length;
  out[i] += value;
}

/** A biquad filter as the Web Audio API defines it (the Audio EQ Cookbook),
 *  run sample by sample. For a lowpass, as there, `q` is in decibels. */
function biquad(type: 'lowpass' | 'bandpass' | 'highpass' | 'highshelf', f: number, q: number, rate: number,
  gainDb = 0): (x: number) => number {
  const w = 2 * Math.PI * f / rate;
  const cos = Math.cos(w);
  const sin = Math.sin(w);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === 'lowpass') {
    const alpha = sin / (2 * Math.pow(10, q / 20));
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  } else if (type === 'bandpass') {
    const alpha = sin / (2 * q);
    b0 = alpha; b1 = 0; b2 = -alpha;
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  } else if (type === 'highpass') {
    const alpha = sin / (2 * q);
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  } else {
    const a = Math.pow(10, gainDb / 40);
    const alpha = sin / (2 * q);
    const root = 2 * Math.sqrt(a) * alpha;
    b0 = a * ((a + 1) + (a - 1) * cos + root);
    b1 = -2 * a * ((a - 1) + (a + 1) * cos);
    b2 = a * ((a + 1) + (a - 1) * cos - root);
    a0 = (a + 1) - (a - 1) * cos + root;
    a1 = 2 * ((a - 1) - (a + 1) * cos);
    a2 = (a + 1) - (a - 1) * cos - root;
  }
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x: number): number => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

/** mulberry32: small, fast, and the same numbers for the same seed. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* --------------------------------------------------------------- loudness */

/** The loudest 400 ms of a period played over and over, LUFS: BS.1770's
 *  momentary loudness, K-weighted, in windows a tenth of a second apart. */
export function loudness(period: Float32Array, rate: number): number {
  const shelf = biquad('highshelf', 1681.974450955533, 0.7071752369554196, rate, 3.999843853973347);
  const highpass = biquad('highpass', 38.13547087602444, 0.5003270373238773, rate);
  // A period to settle the filters, then two to measure, so that a window
  // may run across the seam.
  const n = period.length;
  const squared = new Float64Array(2 * n);
  for (let i = 0; i < 3 * n; i++) {
    const y = highpass(shelf(period[i % n]));
    if (i >= n) squared[i - n] = y * y;
  }
  const window = Math.round(0.4 * rate);
  const hop = Math.round(0.1 * rate);
  let sum = 0;
  for (let i = 0; i < window; i++) sum += squared[i];
  let loudest = sum;
  for (let start = 0; start + hop < n; start += hop) {
    for (let i = 0; i < hop; i++) sum += squared[start + window + i] - squared[start + i];
    if (sum > loudest) loudest = sum;
  }
  return -0.691 + 10 * Math.log10(Math.max(loudest / window, 1e-12));
}

/** Scale a period to the beeps' loudness at the same moment, its peak held
 *  under `PEAK`. */
function level(period: Float32Array, rate: number, moment: AlarmMoment): Float32Array {
  const target = loudness(beepsPeriod(moment, rate), rate);
  let peak = 0;
  for (let i = 0; i < period.length; i++) peak = Math.max(peak, Math.abs(period[i]));
  if (peak === 0) return period;
  const gain = Math.min(Math.pow(10, (target - loudness(period, rate)) / 20), PEAK / peak);
  for (let i = 0; i < period.length; i++) period[i] *= gain;
  return period;
}
