/**
 * The record: the web app's keeping of the log and the posterior, across
 * reloads, tabs and builds.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { STORES } from '../src/ui/stores.js';

import { CALIBRATION_SEED, LIKELIHOOD_ID, PARTICLE_COUNT, freshCalibration, replay } from '../src/core/record.js';
import { YolkWord } from '../src/core/infer.js';
import { Learner, openLearner } from '../src/ui/calibration.js';
import { decodeKept, encodeKept } from '../src/ui/calibrationStore.js';
import { assertIdentical, solvedRecord, storage } from './records.js';

/** The page under test, as boot() opens it: opened again for a reload. */
let cal: Learner;

// --------------------------------------------------------------------------
// 3. The web app's keeping
// --------------------------------------------------------------------------

test('3a. loading: rebuild, rebase, and refuse a damaged log', () => {
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

test('3a3. a posterior folded under another likelihood is replayed', () => {
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

test('3a4. a store this build cannot read is dropped; the export is the store as stored', () => {
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

test('3b. eggs answered in either order with a reload between: bit-identical to a replay', async () => {
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

  // And the app's own replay: damage the stored posterior, reload, and let the
  // app fold the whole log again from the prior.
  const stored = JSON.parse(storage.get('aet.calibration.v5') as string) as Record<string, unknown>;
  storage.set('aet.calibration.v5', JSON.stringify({ ...stored, cal: null }));
  calib = (cal = openLearner()).calibration();
  assert.equal(cal.eggsBehind(), 4);
  await cal.learn();
  assertIdentical(cal.keptState().calibration, rebuilt, 'the app rebuilt it from the log');

  // And across an upgrade: a posterior folded under another likelihood is
  // folded again, and comes out as a replay of the log under this one.
  const upgraded = JSON.parse(storage.get('aet.calibration.v5') as string) as Record<string, unknown>;
  storage.set('aet.calibration.v5', JSON.stringify({ ...upgraded, m: '2026-10-e6' }));
  cal = openLearner();
  assert.equal(cal.eggsBehind(), 4);
  await cal.learn();
  assertIdentical(cal.keptState().calibration, rebuilt, 'replayed on a likelihood change');
  assert.equal((JSON.parse(storage.get('aet.calibration.v5') as string) as { m: string }).m, LIKELIHOOD_ID);
});

test('3c. forget everything clears the log, the base and the posterior', () => {
  storage.clear();
  cal = openLearner();
  cal.logEgg(solvedRecord(0.4, null));
  const fresh = cal.clear();
  assert.equal(storage.size, 0);
  assert.equal(cal.keptState().log.length, 0);
  assert.equal(cal.keptState().base, null);
  assert.equal(fresh.eggsLogged, 0);
});

test('3d. another tab\'s egg is taken up, not written over', () => {
  storage.clear();
  const calib = (cal = openLearner()).calibration();
  cal.logEgg(solvedRecord(0.3, null));
  // Another tab, loaded now, logs an egg of its own.
  const other = decodeKept(storage.get('aet.calibration.v5') as string).kept;
  other.log.push(solvedRecord(0.4, null));
  storage.set('aet.calibration.v5', encodeKept(other));
  // This tab never heard, and logs another.
  assert.equal(cal.logEgg(solvedRecord(0.5, null)), 2, 'logged after the other tab\'s egg');
  const stored = decodeKept(storage.get('aet.calibration.v5') as string).kept;
  assert.deepEqual(stored.log.map((r) => r.level), [0.3, 0.4, 0.5]);
  assert.equal(cal.storedElsewhere('aet.calibration.v5'), false, 'nothing new since');
  assert.equal(cal.storedElsewhere(STORES.settings.key), false);
  // The other tab forgets everything: this one follows, in the calibration
  // the app holds, and a late answer to its egg is refused.
  storage.delete('aet.calibration.v5');
  assert.equal(cal.storedElsewhere(null), true);
  assert.equal(cal.keptState().log.length, 0);
  assert.equal(cal.keptState().calibration, calib, 'the same reference, emptied');
  assert.equal(calib.eggsLogged, 0);
});

test('3e. two builds in two tabs: neither writes back the store it takes up, so the writing stops', async () => {
  storage.clear();
  const KEY = 'aet.calibration.v5';
  const NEWER = '2026-10-e99';
  // This page logs two eggs. Unanswered, so they fold nothing and build no
  // surface, and the test runs in milliseconds.
  cal = openLearner();
  cal.logEgg(solvedRecord(0.3, null));
  cal.logEgg(solvedRecord(0.5, null));
  await cal.learn();
  // A second page, a newer build's: the same code under another likelihood, as
  // the service worker leaves an old window on the build it opened with. It
  // opens, replays the log under its own likelihood and writes.
  const newer = openLearner(NEWER);
  await newer.learn();
  assert.equal((JSON.parse(storage.get(KEY) as string) as { m: string }).m, NEWER);
  // The browser tells each page whenever the other writes, and each page
  // folds whatever is behind when it hears, as effects.ts does.
  const pages = [
    { heard: cal.storedElsewhere, learn: cal.learn, behind: cal.eggsBehind },
    { heard: newer.storedElsewhere, learn: newer.learn, behind: newer.eggsBehind },
  ];
  const listen = async (rounds: number): Promise<number> => {
    let writes = 0;
    let text = storage.get(KEY);
    for (let round = 0; round < rounds; round++) {
      const p = pages[round % 2];
      if (p.heard(KEY) && p.behind() > 0) await p.learn();
      if (storage.get(KEY) !== text) {
        writes += 1;
        text = storage.get(KEY);
      }
    }
    return writes;
  };
  assert.equal(await listen(8), 0, 'taking up the other build\'s store writes nothing');
  assert.equal(cal.keptState().log.length, 2);
  assert.equal(cal.keptState().folded, 2, 'what this page folded is kept, not replayed');
  // A page's own change is written, under its own likelihood, and taken up
  // by the other without a write back; the other folds only the egg that is
  // new.
  cal.logEgg(solvedRecord(0.6, null));
  const written = storage.get(KEY);
  assert.equal((JSON.parse(written as string) as { m: string }).m, LIKELIHOOD_ID);
  assert.equal(newer.storedElsewhere(KEY), true);
  assert.equal(newer.eggsBehind(), 1, 'one egg to fold, not the whole log again');
  await newer.learn();
  assert.equal(storage.get(KEY), written, 'folded in memory, not written');
  assert.equal(newer.keptState().log.length, 3);
  assert.equal(await listen(8), 0);
  // And the store is this build's, as it wrote it: the new egg still to fold.
  const back = decodeKept(storage.get(KEY) as string);
  assert.deepEqual([back.path, back.kept.folded, back.kept.log.length], ['loaded', 2, 3]);
});

test('3f. one cook in two tabs is one egg, folded by the tab that wrote it down', async () => {
  storage.clear();
  const KEY = 'aet.calibration.v5';
  const T = 1759700000123;
  const calib = (cal = openLearner()).calibration();
  const other = openLearner();
  // This tab writes the egg down with the yolk.
  const index = cal.logEgg({ ...solvedRecord(0.4, 'jammy'), id: T });
  // The other tab hears, and leaves the egg to this one.
  assert.equal(other.storedElsewhere(KEY), true);
  await other.learn();
  assert.equal(other.keptState().folded, 0, 'another tab\'s newest egg is that tab\'s to fold');
  // The cook answers the white in the other tab, which shows the same cook:
  // the same egg, not a second one, and the answer is written into it.
  assert.equal(other.eggLogged(T), 0);
  assert.equal(other.logEgg({ ...solvedRecord(0.4, null), id: T, white: 'firm' }), 0);
  assert.equal(other.keptState().log.length, 1, 'one cook, one egg');
  assert.equal(await other.recordSecondAnswer(0, { white: 'firm' }), true);
  // This tab folds the egg with both answers, and can still take a third.
  await cal.learn(index);
  assert.equal(calib.eggsLogged, 1);
  assert.deepEqual([cal.keptState().log[0].yolkWord, cal.keptState().log[0].white], ['jammy', 'firm']);
  assert.equal(other.storedElsewhere(KEY), true);
  assert.equal(await other.recordSecondAnswer(0, { probe: { centre_C: 60, after_s: null } }), false,
    'refused where it cannot be folded, and nothing written');
  assert.equal(decodeKept(storage.get(KEY) as string).kept.log[0].probe, null);
  assert.equal(await cal.recordSecondAnswer(0, { probe: { centre_C: 60, after_s: null } }), true);
  // What this tab holds is what a replay of the log makes.
  const stored = decodeKept(storage.get(KEY) as string).kept;
  assert.equal(stored.folded, 1);
  assertIdentical(calib, replay(freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED), stored.log), 'three answers, two tabs');
  // "Start again" in either tab logs nothing more.
  assert.equal(other.logEgg({ ...solvedRecord(0.4, null), id: T }), 0);
  assert.equal(cal.logEgg({ ...solvedRecord(0.4, null), id: T }), 0);
  assert.equal(decodeKept(storage.get(KEY) as string).kept.log.length, 1);
});

