/**
 * The record: the web app's keeping of the log and the posterior, across
 * reloads and builds.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';


import { CALIBRATION_SEED, LIKELIHOOD_ID, PARTICLE_COUNT, freshCalibration, replay } from '../src/core/record.ts';
import type { YolkWord } from '../src/core/infer.ts';
import { type Learner, openLearner } from '../src/ui/calibration.ts';
import { decodeKept, encodeKept } from '../src/ui/calibrationStore.ts';
import { assertIdentical, solvedRecord, storage } from './records.ts';

/** The page under test, as boot() opens it: opened again for a reload. */
let cal: Learner;

// --------------------------------------------------------------------------
// 3. The web app's keeping
// --------------------------------------------------------------------------

test('loading: rebuild, rebase, and refuse a damaged log', () => {
  const r = solvedRecord(0.4, 'jammy');

  assert.equal(decodeKept(null).path, 'fresh');
  assert.equal(decodeKept('{not json').path, 'fresh');
  assert.equal(decodeKept('{"v":3,"log":[]}').path, 'fresh', 'another format');

  const good = { base: null, calibration: freshCalibration(32, 3), log: [r], folded: 1 };
  const stored = JSON.parse(encodeKept(good)) as Record<string, unknown>;
  assert.equal(decodeKept(JSON.stringify(stored)).path, 'loaded');

  const badCal = { ...stored, cal: { ...(stored['cal'] as object), w: [Number.NaN] } };
  const rebuild = decodeKept(JSON.stringify(badCal));
  assert.equal(rebuild.path, 'rebuild');
  assert.equal(rebuild.kept.folded, 0);
  assert.equal(rebuild.kept.log.length, 1, 'the log survives a damaged posterior');
  // A posterior missing the noise, white-offset or gap columns is damaged,
  // not half-read.
  const noNoise = { ...stored, cal: { ...(stored['cal'] as object), sd: undefined } };
  assert.equal(decodeKept(JSON.stringify(noNoise)).path, 'rebuild');
  const zeroNoise = { ...stored, cal: { ...(stored['cal'] as { sd: number[] }), sd: (stored['cal'] as { sd: number[] }).sd.map(() => 0) } };
  assert.equal(decodeKept(JSON.stringify(zeroNoise)).path, 'rebuild', 'a zero noise divides by zero');

  // A record that does not read refuses the log, and what the log taught is
  // kept as the base; so is a log that is not a list.
  for (const log of [[r, { ...r, level: -1 }], [r, { ...r, yolk: -1, yolkWord: undefined }], { 0: r }]) {
    const rebased = decodeKept(JSON.stringify({ ...stored, log: log }));
    assert.equal(rebased.path, 'rebased');
    assert.equal(rebased.kept.log.length, 0);
    assert.equal(rebased.kept.base?.eggsLogged, good.calibration.eggsLogged,
      'what the refused eggs taught is kept, frozen');
  }

  const ahead = { ...stored, folded: 5 };
  assert.equal(decodeKept(JSON.stringify(ahead)).path, 'rebased');
});

test('a posterior folded under another likelihood is replayed', () => {
  const k = { base: null, calibration: freshCalibration(32, 3), folded: 1, log: [solvedRecord(0.4, 'jammy')] };
  const stored = JSON.parse(encodeKept(k)) as Record<string, unknown>;
  assert.equal(stored['m'], LIKELIHOOD_ID);
  assert.equal(decodeKept(JSON.stringify(stored)).path, 'loaded');
  const older = decodeKept(JSON.stringify({ ...stored, m: '2026-09-e5' }));
  assert.equal(older.path, 'rebuild');
  assert.equal(older.kept.folded, 0);
  assert.equal(older.kept.log.length, 1);
  const before = { ...stored };
  delete before['m'];
  assert.equal(decodeKept(JSON.stringify(before)).path, 'rebuild', 'a store that names no likelihood');
});

test('a store this build cannot read is dropped; the export is the store as stored', () => {
  storage.clear();
  storage.set('aet.calibration.v5', '{damaged');
  cal = openLearner();
  assert.equal((JSON.parse(storage.get('aet.calibration.v5') as string) as { v: number }).v, 5, 'written over');
  assert.deepEqual([...storage.keys()], ['aet.calibration.v5'], 'nothing kept aside');
  assert.equal(cal.exportResults(null, Date.UTC(2026, 9, 5, 12)), null, 'nothing to export');
  cal.logEgg(solvedRecord(0.4, 'jammy'));
  const exported = cal.exportResults(null, Date.UTC(2026, 9, 5, 12));
  assert.ok(exported !== null);
  assert.match(exported.name, /^actual-egg-timer-results-2026-10-0[56]\.json$/);
  assert.ok(exported.text.includes(`"stored":${storage.get('aet.calibration.v5') as string}`), 'the store as stored');
  cal.clear();
  assert.equal(cal.exportResults(null, Date.UTC(2026, 9, 5, 12)), null, 'nothing to export');
});

test('eggs answered in either order with a reload between: bit-identical to a replay', async () => {
  storage.clear();
  let calib = (cal = openLearner()).calibration();
  assert.equal(cal.keptState().base, null);
  assert.equal(cal.eggsBehind(), 0);
  assert.equal(calib.eggsLogged, 0);

  // Then the app's own path, on real 21 x 32 surfaces: the yolk then the white;
  // the white alone; nothing; the white then the yolk. The yolk is the yolk
  // the cook got.
  const answers: { first: { yolkWord?: YolkWord; white?: 'runny' | 'tender' | 'firm' };
    second: { yolkWord?: YolkWord; white?: 'runny' | 'tender' | 'firm' } | null }[] = [
    { first: { yolkWord: 'runny' }, second: { white: 'runny' } },
    { first: { white: 'tender' }, second: null },
    { first: {}, second: null },
    { first: { white: 'firm' }, second: { yolkWord: 'fudgy' } },
  ];
  const levels = [0.22, 0.3, 0.5, 0.55];
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    const r = solvedRecord(levels[i], null, 60 + 3 * i);
    r.yolkWord = a.first.yolkWord ?? null;
    r.white = a.first.white ?? null;
    const index = cal.logEgg(r);
    await cal.learn(index);
    if (a.second !== null) assert.ok(await cal.recordSecondAnswer(index, a.second), `egg ${i}: second answer taken`);
    calib = (cal = openLearner()).calibration(); // a reload: everything back from storage
    // After a reload the surface is gone, and a late answer is refused rather
    // than written down unfolded.
    assert.equal(await cal.recordSecondAnswer(index, { yolkWord: 'jammy' }), false, `egg ${i}: nothing after a reload`);
  }
  assert.equal(cal.eggsBehind(), 0);
  const log = cal.keptState().log;
  assert.equal(log.length, 4);
  assert.deepEqual(log.map((r) => [r.yolkWord, r.white]),
    [['runny', 'runny'], [null, 'tender'], [null, null], ['fudgy', 'firm']]);

  const rebuilt = replay(freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED), log);
  assertIdentical(calib, rebuilt, 'incremental vs replay');

  // And the app's own replay, across an upgrade: a posterior folded under
  // another likelihood is folded again from the prior, and comes out as a
  // replay of the log under this one. A damaged posterior loads as the same
  // rebuild (above), so it folds the same way.
  const upgraded = JSON.parse(storage.get('aet.calibration.v5') as string) as Record<string, unknown>;
  storage.set('aet.calibration.v5', JSON.stringify({ ...upgraded, m: '2026-10-e6' }));
  cal = openLearner();
  assert.equal(cal.eggsBehind(), 4);
  await cal.learn();
  assertIdentical(cal.keptState().calibration, rebuilt, 'replayed on a likelihood change');
  assert.equal((JSON.parse(storage.get('aet.calibration.v5') as string) as { m: string }).m, LIKELIHOOD_ID);
});

test('forget everything clears the log, the base and the posterior', () => {
  storage.clear();
  cal = openLearner();
  cal.logEgg(solvedRecord(0.4, null));
  const fresh = cal.clear();
  assert.equal(storage.size, 0);
  assert.equal(cal.keptState().log.length, 0);
  assert.equal(cal.keptState().base, null);
  assert.equal(fresh.eggsLogged, 0);
});
