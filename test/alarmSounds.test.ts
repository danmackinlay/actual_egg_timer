/**
 * The alarm sounds (`src/ui/alarmSounds.ts`, DECISIONS.md 101): the periods
 * the web plays and `npm run sounds` renders for iOS, and the iOS files
 * themselves held to the timing in core.
 *
 * What a sound sounds like is the owner's to judge, by ear. What is pinned
 * here is what an ear cannot check: that a render is the same every time,
 * that every period is as loud as the beeps it replaced and never clips, and
 * that the files the iOS app ships are whole periods of the right length,
 * under the 30 s past which a notification plays iOS's default instead.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  ALARM_SOUNDS, AlarmMoment, NOTIFICATION_SOUND_MAX_S, alarmPeriod_s, notificationRepeats,
} from '../src/core/policy.js';
import { PEAK, RECORDINGS, beepsPeriod, loudness, recordedPeriod, synthPeriod } from '../src/ui/alarmSounds.js';

const MOMENTS: AlarmMoment[] = ['pull', 'cooled'];
const RATE = 22050;

function peakOf(x: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  return peak;
}

test('a sound made in code is the same every time, one period long, as loud as the beeps, and never clips', () => {
  for (const sound of ALARM_SOUNDS.filter((s) => s !== 'hen')) {
    for (const moment of MOMENTS) {
      for (const rate of [RATE, 48000]) {
        const a = synthPeriod(sound, moment, rate);
        const b = synthPeriod(sound, moment, rate);
        assert.ok(a !== null && b !== null, `${sound} is made in code`);
        assert.deepEqual(a, b, `${sound} ${moment} at ${rate} Hz renders the same twice`);
        assert.equal(a.length, Math.round(alarmPeriod_s(sound, moment) * rate));
        assert.ok(peakOf(a) <= PEAK + 1e-6, `${sound} ${moment} peaks at ${peakOf(a)}`);
        const target = loudness(beepsPeriod(moment, rate), rate);
        assert.ok(Math.abs(loudness(a, rate) - target) < 0.05, `${sound} ${moment}: ${loudness(a, rate)} against ${target}`);
      }
    }
  }
});

test('the hen is recorded, and a recording is laid in its period, levelled, and cut if too long', () => {
  for (const moment of MOMENTS) {
    assert.equal(synthPeriod('hen', moment, RATE), null);
    assert.ok(existsSync(RECORDINGS[moment]), `${RECORDINGS[moment]} is in the repository`);
    // A second of 1 kHz, and ten seconds of it.
    for (const seconds of [1, 10]) {
      const recording = new Float32Array(seconds * RATE);
      for (let i = 0; i < recording.length; i++) recording[i] = 0.01 * Math.sin(2 * Math.PI * 1000 * i / RATE);
      const period = recordedPeriod(recording, RATE, moment);
      assert.equal(period.length, Math.round(alarmPeriod_s('hen', moment) * RATE));
      assert.ok(peakOf(period) <= PEAK + 1e-6);
      if (seconds === 1) assert.equal(period[RATE + 10], 0, 'silence after the recording');
    }
  }
});

/** A CAF's frames and rate, from its `desc` and `pakt` chunks. */
function cafLength(path: string): { frames: number; rate: number; format: string } {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString('ascii', 0, 4), 'caff', `${path} is a CAF`);
  let at = 8;
  let rate = 0;
  let format = '';
  let frames = -1;
  while (at + 12 <= bytes.length) {
    const id = bytes.toString('ascii', at, at + 4);
    const size = Number(bytes.readBigInt64BE(at + 4));
    const body = at + 12;
    if (id === 'desc') {
      rate = bytes.readDoubleBE(body);
      format = bytes.toString('ascii', body + 8, body + 12);
    } else if (id === 'pakt') {
      frames = Number(bytes.readBigInt64BE(body + 8));
    }
    if (size < 0) break;
    at = body + size;
  }
  return { frames, rate, format };
}

test('the iOS app has a file for every sound and moment, whole periods under 30 s', () => {
  for (const sound of ALARM_SOUNDS) {
    for (const moment of MOMENTS) {
      const path = `ios/App/Sounds/alarm-${sound}-${moment}.caf`;
      assert.ok(existsSync(path), `${path}: run npm run sounds`);
      const { frames, rate, format } = cafLength(path);
      assert.equal(format, 'ima4', `${path}: a format a notification can play`);
      const seconds = frames / rate;
      const want = notificationRepeats(sound, moment) * alarmPeriod_s(sound, moment);
      assert.ok(Math.abs(seconds - want) < 0.001, `${path}: ${seconds} s, not ${want} s; run npm run sounds`);
      assert.ok(seconds < NOTIFICATION_SOUND_MAX_S);
    }
  }
});
