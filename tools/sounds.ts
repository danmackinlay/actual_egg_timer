/**
 * The files the iOS app rings with.
 *
 * Run: npm run sounds (macOS: it needs afconvert)
 *
 * One file per sound and moment, `ios/App/Sounds/alarm-<sound>-<moment>.caf`:
 * the period `src/ui/alarmSounds.ts` makes, the same samples the web plays,
 * repeated for as many whole periods as a notification's sound may hold
 * (`notificationRepeats`). The notification plays the file once; the in-app
 * ring (`Ringer.swift`) loops it. IMA4 in a CAF, because a notification's
 * sound must be linear PCM, IMA4, µ-law or a-law in an aiff, wav or caf, and
 * IMA4 is a quarter the size of linear PCM; at 22.05 kHz, which holds the
 * timer's highest mode, 8980 Hz.
 *
 * The hen's recordings are decoded by afconvert, from the same mp3s the web
 * fetches (`RECORDINGS`). Generated files, like the fixtures: never edited
 * by hand. Run this again after a change to alarmSounds.ts, to a recording
 * or to the timing in src/core/sounds.ts.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ALARM_SOUNDS, AlarmMoment, alarmPeriod_s } from '../src/core/sounds.js';
import {
  NOTIFICATION_SOUND_MAX_S, RECORDINGS, loudness, notificationRepeats, recordedPeriod, synthPeriod,
} from '../src/ui/alarmSounds.js';

const RATE = 22050;
const OUT = 'ios/App/Sounds';
const MOMENTS: AlarmMoment[] = ['pull', 'cooled'];

const scratch = mkdtempSync(join(tmpdir(), 'aet-sounds-'));
try {
  for (const sound of ALARM_SOUNDS) {
    for (const moment of MOMENTS) {
      const period = synthPeriod(sound, moment, RATE) ?? recordedPeriod(decode(RECORDINGS[moment]), RATE, moment);
      const repeats = notificationRepeats(sound, moment);
      const seconds = repeats * alarmPeriod_s(sound, moment);
      if (seconds >= NOTIFICATION_SOUND_MAX_S) throw new Error(`${sound} ${moment}: ${seconds} s is too long`);
      const pcm = join(scratch, `${sound}-${moment}.wav`);
      writeFileSync(pcm, wav(period, repeats));
      const file = join(OUT, `alarm-${sound}-${moment}.caf`);
      execFileSync('afconvert', [pcm, file, '-d', 'ima4', '-f', 'caff']);
      let peak = 0;
      for (let i = 0; i < period.length; i++) peak = Math.max(peak, Math.abs(period[i]));
      console.log(
        `${file}: ${repeats} x ${alarmPeriod_s(sound, moment)} s = ${seconds.toFixed(1)} s, `
        + `${loudness(period, RATE).toFixed(1)} LUFS at its loudest, peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS, `
        + `${Math.round(statSync(file).size / 1024)} KB`,
      );
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

/** A recording, mono at `RATE`, as samples in [-1, 1]. */
function decode(path: string): Float32Array {
  const out = join(scratch, 'decoded.wav');
  execFileSync('afconvert', [path, out, '-d', `LEI16@${RATE}`, '-f', 'WAVE', '-c', '1']);
  const bytes = readFileSync(out);
  // The chunks after the header: afconvert may put others before the data.
  let at = 12;
  while (at + 8 <= bytes.length) {
    const id = bytes.toString('ascii', at, at + 4);
    const size = bytes.readUInt32LE(at + 4);
    if (id === 'data') {
      const samples = new Float32Array(size / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = bytes.readInt16LE(at + 8 + 2 * i) / 32768;
      return samples;
    }
    at += 8 + size + (size % 2);
  }
  throw new Error(`${path}: no audio`);
}

/** A period repeated, as a 16-bit mono WAV at `RATE`. */
function wav(period: Float32Array, repeats: number): Buffer {
  const frames = period.length * repeats;
  const bytes = Buffer.alloc(44 + 2 * frames);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(36 + 2 * frames, 4);
  bytes.write('WAVEfmt ', 8, 'ascii');
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(RATE, 24);
  bytes.writeUInt32LE(RATE * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36, 'ascii');
  bytes.writeUInt32LE(2 * frames, 40);
  for (let i = 0; i < frames; i++) {
    const v = Math.round(period[i % period.length] * 32767);
    bytes.writeInt16LE(Math.max(-32768, Math.min(32767, v)), 44 + 2 * i);
  }
  return bytes;
}
