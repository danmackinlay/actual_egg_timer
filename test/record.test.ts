/**
 * The record: what a loader trusts, what a replay rebuilds, and the web app's
 * own keeping of both.
 *
 * The headline claim: a posterior rebuilt from the log is BIT-identical to the
 * one the app built egg by egg, with a reload between every egg, whichever
 * order the two answers came in. Close is not enough. A replay that moves a
 * posterior a little for no reason would turn every future model change into a
 * quiet change of taste, and nobody would ever find out why.
 *
 * The conformance fixture (`fixtures/record.json`) pins the arithmetic particle
 * by particle for the Swift port; what is checked here is the reasoning and the
 * storage around it.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GridSpec, buildRequestedGrid } from '../src/core/doseGrid.js';
import {
  Calibration, EggRecord, MODEL_ID, copyCalibration, foldRecord, freshCalibration, gridRequestFor,
  parseLog, parseRecord, recordCookTime_s, recordMass_g, replay,
  RESULTS_FILE_VERSION, jsonString, resultsFile, resultsFileName,
} from '../src/core/record.js';
import { LITERATURE_POPULATION } from '../src/core/infer.js';
import { calibrationGrid, PARTICLE_COUNT, CALIBRATION_SEED } from '../src/core/policy.js';
import { createPrior, updatePosterior } from '../src/core/infer.js';
import { eggFromMass } from '../src/core/geometry.js';
import {
  DEFAULT_PARAMS, donenessFromSlider, logYolkTarget, solveCookTime,
} from '../src/core/solve.js';
import { CookSetup } from '../src/core/protocol.js';
import {
  APP_VERSION, Cooked, calibrationStoredElsewhere, clearCalibration, decodeKept, eggRecordFor, eggsBehind, encodeKept,
  exportResults, keptState, learn, loadCalibration, logEgg, recordSecondAnswer,
} from '../src/ui/calibration.js';
import {
  Machine, advance, beginCooling, restoreMachine, staleMachine, startCold, startHot, PULL_GRACE_SECONDS,
} from '../src/ui/machine.js';
import { appSetup } from '../tools/common.js';

// --------------------------------------------------------------------------
// shared
// --------------------------------------------------------------------------

/** localStorage, in memory. The store module reads `window.localStorage` at call
 *  time, inside a try, so this is all a test needs to give it one. */
const storage = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); },
    removeItem: (k: string) => { storage.delete(k); },
  },
};

const COARSE = (alphaCentre: number, cookTime_s: number): GridSpec => ({
  ...calibrationGrid(alphaCentre, cookTime_s), alphaCount: 7, timeCount: 9,
});

/** A realistic record: the time is what the solver says for this egg. */
function solvedRecord(
  level: number, yolk: EggRecord['yolk'], mass_g = 62, over: Partial<CookSetup> = {},
): EggRecord {
  const egg = eggFromMass(mass_g / 1000);
  const setup = appSetup(over);
  const t = solveCookTime(egg, setup, DEFAULT_PARAMS, donenessFromSlider(level)).result.cookTime_s;
  return {
    v: 1, uid: null, day: '2026-09-26', app: 'web', appVersion: APP_VERSION, prior: LITERATURE_POPULATION.id, model: null,
    egg: { mass_g: recordMass_g(egg.mass_kg), massFrom: 'class', sizeTable: 'eu' },
    setup: {
      startMode: setup.startMode, eggStart_C: setup.eggStart_C, eggFrom: 'fridge',
      ambient_C: setup.ambient_C, boiling_C: setup.boiling_C, timeToBoil_s: setup.timeToBoil_s,
      timeToBoilFrom: 'remembered',
      cooling: setup.cooling, afterBoil: 'hold', waterLitres: setup.waterLitres,
      eggCount: setup.eggCount,
    },
    level: level, recommended_s: t, nudge_s: 0, pulled_s: t + 4, pulledBy: 'cook',
    cooled_s: 180, yolk: yolk, white: null, probe: null,
    forecast: null,
    lang: 'en', register: 'modern', units: 'metric',
  };
}

/** Every particle, every weight, the RNG and the count - by Object.is, which
 *  is stricter than ===: it tells 0 from -0 and would not forgive a NaN. */
function assertIdentical(a: Calibration, b: Calibration, label: string): void {
  assert.equal(a.eggsLogged, b.eggsLogged, `${label}: eggs`);
  assert.equal(a.posterior.rng, b.posterior.rng, `${label}: rng`);
  assert.equal(a.posterior.particles.length, b.posterior.particles.length);
  for (let i = 0; i < a.posterior.particles.length; i++) {
    const p = a.posterior.particles[i];
    const q = b.posterior.particles[i];
    assert.ok(Object.is(p.alpha_m2s, q.alpha_m2s), `${label}: alpha ${i}`);
    assert.ok(Object.is(p.logDoseOffset, q.logDoseOffset), `${label}: offset ${i}`);
    assert.ok(Object.is(p.tauAirScale, q.tauAirScale), `${label}: tauAir ${i}`);
    assert.ok(Object.is(p.noise, q.noise), `${label}: noise ${i}`);
    assert.ok(Object.is(p.whiteOffset, q.whiteOffset), `${label}: white offset ${i}`);
    assert.ok(Object.is(p.whiteFirmGap, q.whiteFirmGap), `${label}: firm gap ${i}`);
    assert.ok(Object.is(a.posterior.weights[i], b.posterior.weights[i]), `${label}: weight ${i}`);
  }
}

// --------------------------------------------------------------------------
// 1. What a loader trusts
// --------------------------------------------------------------------------

test('1a. a record from an older app version of the same schema is accepted', () => {
  const r = { ...solvedRecord(0.4, 0), appVersion: '0.0.1', app: 'ios' };
  assert.notEqual(parseRecord(r), null);
});

test('1b. unknown fields are ignored and dropped; absent nullable fields read as null', () => {
  const r = solvedRecord(0.4, 0) as unknown as Record<string, unknown>;
  const raw: Record<string, unknown> = { ...r, futureField: 1 };
  delete raw['yolk'];
  delete raw['uid'];
  delete raw['probe'];
  const parsed = parseRecord(raw);
  assert.notEqual(parsed, null);
  assert.equal(parsed?.yolk, null);
  assert.equal(parsed?.uid, null);
  assert.equal('futureField' in (parsed as object), false);
});

test('1c. the white\'s three answers load, a skip loads, and nothing else does', () => {
  const base = solvedRecord(0.3, null);
  for (const white of ['runny', 'tender', 'firm']) {
    assert.equal(parseRecord({ ...base, white: white })?.white, white, white);
  }
  assert.equal(parseRecord({ ...base, white: null })?.white, null, 'skipped');
  assert.equal(parseRecord({ ...base, white: 'soft' }), null, 'not a white answer');
  assert.equal(parseRecord({ ...base, white: 'set' }), null, 'E1\'s two-level answer, gone with D1');
});

test('1d. one bad record refuses the whole log', () => {
  const good = solvedRecord(0.4, 0);
  assert.equal(parseLog([good, good])?.length, 2);
  assert.equal(parseLog([good, { ...good, level: 2 }]), null);
  assert.equal(parseLog({ 0: good }), null);
});

test('1e. the web app version is the package version', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  assert.equal(APP_VERSION, pkg.version);
});

test('1f. the results file: the store spliced in as stored, damaged copies as text', () => {
  for (const s of ['', 'plain', 'a"b\\c/d', '\n\r\t\b\f\u0000\u001f\u007f', '‘curly’ café 🥚']) {
    assert.equal(jsonString(s), JSON.stringify(s), `escaped as JSON.stringify: ${JSON.stringify(s)}`);
  }
  const store = JSON.stringify({ v: 4, p: 'x', folded: 0, log: [solvedRecord(0.4, 0)] });
  const meta = { app: 'web' as const, appVersion: APP_VERSION, exported: '2026-10-05T09:00:00.000Z', population: 'x', uid: null };
  const text = resultsFile(meta, store, ['{damaged', '[1]', '7']);
  // The store's characters are in the file unchanged.
  assert.ok(text.includes(`"stored":${store}`));
  const file = JSON.parse(text) as Record<string, unknown>;
  assert.equal(file['file'], RESULTS_FILE_VERSION);
  assert.equal(file['model'], MODEL_ID);
  assert.equal(file['uid'], null);
  assert.deepEqual(file['stored'], JSON.parse(store));
  assert.deepEqual(file['unread'], ['{damaged', [1], '7'], 'only an object or array is spliced');
  assert.equal(JSON.parse(resultsFile(meta, null, []))['stored'], null);
  assert.equal(resultsFileName('2026-10-05'), 'actual-egg-timer-results-2026-10-05.json');
});

// --------------------------------------------------------------------------
// 2. Replay
// --------------------------------------------------------------------------

test('2a. a replay is the egg-by-egg fold, and leaves its start alone', () => {
  const log = [solvedRecord(0.3, -1), solvedRecord(0.5, 1, 70), solvedRecord(0.45, 0, 55), solvedRecord(0.25, null, 64)];
  log[0].white = 'runny';
  log[3].white = 'tender';
  const start = freshCalibration(64, 7);
  const untouched = copyCalibration(start);

  const c = copyCalibration(start);
  for (const r of log) foldRecord(c, r, buildRequestedGrid(gridRequestFor(c, r, COARSE)));
  assertIdentical(replay(start, log, COARSE), c, 'replay');
  assertIdentical(start, untouched, 'start');
  assert.equal(c.eggsLogged, 4, 'a white alone is an egg the model learned from');
});

test('2b. an unanswered egg folds nothing and builds no surface', () => {
  const answered = [solvedRecord(0.3, -1), solvedRecord(0.5, 1, 70)];
  const withSkip = [answered[0], solvedRecord(0.4, null, 58), answered[1]];
  const start = freshCalibration(64, 7);
  assertIdentical(replay(start, withSkip, COARSE), replay(start, answered, COARSE), 'skip');
});

test('2c. the first egg is scored on a surface centred on the literature values', () => {
  // Not on the prior's mean, which is close to them but not them: the app solves
  // with DEFAULT_PARAMS until an egg has taught it anything, and the first
  // surface has always been built around what it solved with.
  const r = solvedRecord(0.4, 0);
  const q = gridRequestFor(freshCalibration(64, 7), r, calibrationGrid);
  assert.equal(q.spec.alphaMin, DEFAULT_PARAMS.alpha_m2s * 0.55);
  assert.equal(q.tauAirScale, DEFAULT_PARAMS.tauAirScale);
});

test('2d. an egg is scored at the pull when the cook said when, and at the schedule when not', () => {
  // INFERENCE.md section 4. A measured pull is the
  // cook's tap; an assumed one is the scheduled time standing in for it.
  const measured = { ...solvedRecord(0.35, -1), pulled_s: 0, pulledBy: 'cook' as const };
  measured.pulled_s = measured.recommended_s + 25;
  const assumed = { ...measured, pulledBy: 'timeout' as const, pulled_s: measured.recommended_s };
  assert.equal(recordCookTime_s(measured), measured.recommended_s + 25);
  assert.equal(recordCookTime_s(assumed), assumed.recommended_s);

  for (const r of [measured, assumed]) {
    const surface = buildRequestedGrid(gridRequestFor(freshCalibration(64, 7), r, COARSE));
    const viaRecord = freshCalibration(64, 7);
    foldRecord(viaRecord, r, surface);
    const direct = createPrior(64, 7);
    updatePosterior(
      direct, surface, recordCookTime_s(r), logYolkTarget(r.level),
      -1, null,
    );
    assertIdentical(viaRecord, { posterior: direct, eggsLogged: 1 }, r.pulledBy);
  }
  // And it matters: 25 s late is a different posterior.
  const a = replay(freshCalibration(64, 7), [measured], COARSE);
  const b = replay(freshCalibration(64, 7), [assumed], COARSE);
  assert.notEqual(a.posterior.weights[0], b.posterior.weights[0]);
});

// --------------------------------------------------------------------------
// 3. The web app's keeping
// --------------------------------------------------------------------------

test('3a. loading: rebuild, rebase, and refuse a damaged log', () => {
  const r = solvedRecord(0.4, 0);

  assert.equal(decodeKept(null).path, 'fresh');
  assert.equal(decodeKept('{not json').path, 'fresh');
  assert.equal(decodeKept('{"v":3,"log":[]}').path, 'fresh', 'not a v4');

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

  // A record that does not read is set aside, not a reason to drop the log.
  const badLog = { ...stored, log: [{ ...r, level: -1 }] };
  const skipped = decodeKept(JSON.stringify(badLog));
  assert.equal(skipped.path, 'rebuild');
  assert.equal(skipped.loses, false);
  assert.equal(skipped.kept.log.length, 0);
  assert.deepEqual(skipped.kept.unread, [{ at: 0, record: { ...r, level: -1 } }]);

  const notAList = { ...stored, log: { 0: r } };
  const rebased = decodeKept(JSON.stringify(notAList));
  assert.equal(rebased.path, 'rebased');
  assert.equal(rebased.loses, true, 'kept aside before it is written over');
  assert.equal(rebased.kept.log.length, 0);
  assert.equal(rebased.kept.base?.eggsLogged, good.calibration.eggsLogged,
    'what the refused eggs taught is kept, frozen');

  const ahead = { ...stored, folded: 5 };
  assert.equal(decodeKept(JSON.stringify(ahead)).path, 'rebased');
  assert.equal(decodeKept('{not json').loses, true);
  assert.equal(decodeKept('{"v":5,"log":[]}').loses, true, 'a newer store is kept aside');
  assert.equal(decodeKept(null).loses, false);
});

test('3a2. a newer build\'s record is skipped and kept in its place, and comes back', () => {
  const a = solvedRecord(0.3, 0);
  const b = solvedRecord(0.5, 1);
  const c = solvedRecord(0.6, -1);
  const newer = { ...b, v: 2, somethingNew: [1, 2] };
  const k = { base: null, calibration: freshCalibration(32, 3), folded: 0, log: [a, b, c] };
  const stored = JSON.parse(encodeKept(k)) as Record<string, unknown>;
  stored['log'] = [a, newer, c];
  const older = decodeKept(JSON.stringify(stored));
  assert.equal(older.path, 'rebuild', 'what the posterior absorbed is no longer the log');
  assert.deepEqual(older.kept.log.map((r) => r.level), [0.3, 0.6]);
  assert.deepEqual(older.kept.unread, [{ at: 1, record: newer }]);
  // Written back by this build: the newer record goes with it, untouched.
  const written = encodeKept(older.kept);
  assert.deepEqual((JSON.parse(written) as { unread: unknown }).unread, [{ at: 1, record: newer }]);
  const again = decodeKept(written);
  assert.equal(again.path, 'loaded', 'set aside the same way: nothing to replay');
  assert.deepEqual(again.kept.unread, [{ at: 1, record: newer }]);
  // A build that can read it puts it back where it was, and replays.
  const readable = JSON.parse(written) as Record<string, unknown>;
  readable['unread'] = [{ at: 1, record: b }];
  const back = decodeKept(JSON.stringify(readable));
  assert.equal(back.path, 'rebuild');
  assert.deepEqual(back.kept.log.map((r) => r.level), [0.3, 0.5, 0.6]);
  assert.deepEqual(back.kept.unread, []);
  // Appended after: the place of each unread record is among all of them.
  const tail = JSON.parse(written) as Record<string, unknown>;
  tail['unread'] = [{ at: 7, record: newer }, { at: 'x', record: newer }];
  assert.deepEqual(decodeKept(JSON.stringify(tail)).kept.unread, [{ at: 2, record: newer }]);
});

test('3a3. a posterior folded under another model is replayed', () => {
  const k = { base: null, calibration: freshCalibration(32, 3), folded: 1, log: [solvedRecord(0.4, 0)] };
  const stored = JSON.parse(encodeKept(k)) as Record<string, unknown>;
  assert.equal(stored['m'], MODEL_ID);
  assert.equal(decodeKept(JSON.stringify(stored)).path, 'loaded');
  const older = decodeKept(JSON.stringify({ ...stored, m: '2026-09-e5' }));
  assert.equal(older.path, 'rebuild');
  assert.equal(older.kept.folded, 0);
  assert.equal(older.kept.log.length, 1);
  const before = { ...stored };
  delete before['m'];
  assert.equal(decodeKept(JSON.stringify(before)).path, 'rebuild', 'a store from before the model was kept');
});

test('3a4. a store this build cannot read is kept aside before it is written over, and exported', () => {
  storage.clear();
  storage.set('aet.calibration.v4', '{damaged');
  loadCalibration();
  assert.deepEqual(JSON.parse(storage.get('aet.calibration.v4.unread') as string), ['{damaged']);
  assert.equal((JSON.parse(storage.get('aet.calibration.v4') as string) as { v: number }).v, 4);
  // The store written in its place loads as it is: nothing more is kept aside.
  loadCalibration();
  assert.equal((JSON.parse(storage.get('aet.calibration.v4.unread') as string) as string[]).length, 1);
  // The newest three, oldest first.
  for (const s of ['{"v":5,"a":1}', '{"v":5,"a":2}', '{"v":5,"a":3}']) {
    storage.set('aet.calibration.v4', s);
    loadCalibration();
  }
  assert.deepEqual(JSON.parse(storage.get('aet.calibration.v4.unread') as string),
    ['{"v":5,"a":1}', '{"v":5,"a":2}', '{"v":5,"a":3}']);
  const exported = exportResults(null, Date.UTC(2026, 9, 5, 12));
  assert.ok(exported !== null);
  assert.match(exported.name, /^actual-egg-timer-results-2026-10-0[56]\.json$/);
  const file = JSON.parse(exported.text) as { stored: { v: number }; unread: unknown[] };
  assert.equal(file.stored.v, 4);
  assert.deepEqual(file.unread, [{ v: 5, a: 1 }, { v: 5, a: 2 }, { v: 5, a: 3 }]);
  clearCalibration();
  assert.equal(storage.has('aet.calibration.v4.unread'), false, 'Start learning again deletes them too');
  assert.equal(exportResults(null, Date.UTC(2026, 9, 5, 12)), null, 'nothing to export');
});

test('3b. eggs answered in either order with a reload between: bit-identical to a replay', async () => {
  storage.clear();
  // A browser that last ran the live site (v2), or an interim build (v3):
  // both are deleted unread, and the cook starts from the prior.
  storage.set('aet.calibration.v3', '{"v":3,"log":[]}');
  storage.set('aet.calibration.v2', '{"v":2}');

  let calib = loadCalibration();
  assert.equal(storage.has('aet.calibration.v3'), false);
  assert.equal(storage.has('aet.calibration.v2'), false);
  assert.equal(keptState().base, null);
  assert.equal(eggsBehind(), 0);
  assert.equal(calib.eggsLogged, 0);

  // Then the app's own path, on real 21 x 32 surfaces: the yolk then the white;
  // the white alone; nothing; the white then the yolk.
  const answers: { first: { yolk?: -1 | 0 | 1; white?: 'runny' | 'tender' | 'firm' };
    second: { yolk?: -1 | 0 | 1; white?: 'runny' | 'tender' | 'firm' } | null }[] = [
    { first: { yolk: -1 }, second: { white: 'runny' } },
    { first: { white: 'tender' }, second: null },
    { first: {}, second: null },
    { first: { white: 'firm' }, second: { yolk: 1 } },
  ];
  const levels = [0.22, 0.3, 0.5, 0.55];
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    const r = solvedRecord(levels[i], a.first.yolk ?? null, 60 + 3 * i);
    r.white = a.first.white ?? null;
    const index = logEgg(r);
    await learn(index);
    if (a.second !== null) assert.ok(await recordSecondAnswer(index, a.second), `egg ${i}: second answer taken`);
    calib = loadCalibration(); // a reload: everything back from storage
    // After a reload the surface is gone, and a late answer is refused rather
    // than written down unfolded.
    assert.equal(await recordSecondAnswer(index, { yolk: 0 }), false, `egg ${i}: nothing after a reload`);
  }
  assert.equal(eggsBehind(), 0);
  const log = keptState().log;
  assert.equal(log.length, 4);
  assert.deepEqual(log.map((r) => [r.yolk, r.white]),
    [[-1, 'runny'], [null, 'tender'], [null, null], [1, 'firm']]);

  const rebuilt = replay(freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED), log);
  assertIdentical(calib, rebuilt, 'incremental vs replay');

  // And the app's own replay: damage the stored posterior, reload, and let the
  // app fold the whole log again from the prior.
  const stored = JSON.parse(storage.get('aet.calibration.v4') as string) as Record<string, unknown>;
  storage.set('aet.calibration.v4', JSON.stringify({ ...stored, cal: null }));
  calib = loadCalibration();
  assert.equal(eggsBehind(), 4);
  await learn();
  assertIdentical(keptState().calibration, rebuilt, 'the app rebuilt it from the log');

  // And across an upgrade: a posterior folded under another model is folded
  // again, and comes out as a replay of the log under this one.
  const upgraded = JSON.parse(storage.get('aet.calibration.v4') as string) as Record<string, unknown>;
  storage.set('aet.calibration.v4', JSON.stringify({ ...upgraded, m: '2026-10-e6' }));
  loadCalibration();
  assert.equal(eggsBehind(), 4);
  await learn();
  assertIdentical(keptState().calibration, rebuilt, 'replayed on a model change');
  assert.equal((JSON.parse(storage.get('aet.calibration.v4') as string) as { m: string }).m, MODEL_ID);
});

test('3c. forget everything clears the log, the base and the posterior', () => {
  storage.set('aet.calibration.v3', '{"v":3}');
  loadCalibration();
  logEgg(solvedRecord(0.4, null));
  const fresh = clearCalibration();
  assert.equal(storage.size, 0);
  assert.equal(keptState().log.length, 0);
  assert.equal(keptState().base, null);
  assert.equal(fresh.eggsLogged, 0);
});

test('3d. another tab\'s egg is taken up, not written over', () => {
  storage.clear();
  const calib = loadCalibration();
  logEgg(solvedRecord(0.3, null));
  // Another tab, loaded now, logs an egg of its own.
  const other = decodeKept(storage.get('aet.calibration.v4') as string).kept;
  other.log.push(solvedRecord(0.4, null));
  storage.set('aet.calibration.v4', encodeKept(other));
  // This tab never heard, and logs another.
  assert.equal(logEgg(solvedRecord(0.5, null)), 2, 'logged after the other tab\'s egg');
  const stored = decodeKept(storage.get('aet.calibration.v4') as string).kept;
  assert.deepEqual(stored.log.map((r) => r.level), [0.3, 0.4, 0.5]);
  assert.equal(calibrationStoredElsewhere('aet.calibration.v4'), false, 'nothing new since');
  assert.equal(calibrationStoredElsewhere('aet.settings.v1'), false);
  // The other tab forgets everything: this one follows, in the calibration
  // the app holds, and a late answer to its egg is refused.
  storage.delete('aet.calibration.v4');
  assert.equal(calibrationStoredElsewhere(null), true);
  assert.equal(keptState().log.length, 0);
  assert.equal(keptState().calibration, calib, 'the same reference, emptied');
  assert.equal(calib.eggsLogged, 0);
});

// --------------------------------------------------------------------------
// 4. The pull
// --------------------------------------------------------------------------

const T0 = 1_750_000_000_000;
const COOKED: Cooked = {
  egg: eggFromMass(0.062), massFrom: 'scale', sizeTable: null, setup: appSetup(), eggFrom: 'fridge',
  boilRemembered: false, units: 'metric', lang: 'en', forecast: null, nudge_s: 0,
};

function pulled(m: Machine): Machine {
  return advance(m, m.cookEnd_ms).machine;
}

test('4a. the cook\'s tap out of PULL is recorded as a measured pull', () => {
  const m = pulled(startHot(T0, 400, 'ice', 0.4));
  assert.equal(m.phase, 'PULL');
  assert.equal(m.pulledBy, null);
  const tapped = beginCooling(m, T0 + 409_500);
  assert.equal(tapped.pulledBy, 'cook');
  assert.equal(tapped.outAt_ms, T0 + 409_500);
  const r = eggRecordFor(COOKED, tapped, 0);
  assert.equal(r.pulled_s, 409.5);
  assert.equal(r.pulledBy, 'cook');
  assert.equal(r.recommended_s, 400);
  assert.notEqual(parseRecord(r), null);
});

test('4b. a pull nobody confirmed is recorded as assumed, at the scheduled time', () => {
  const m = pulled(startHot(T0, 400, 'counter', 0.6));
  const timedOut = advance(m, m.pulledAt_ms + PULL_GRACE_SECONDS * 1000).machine;
  assert.equal(timedOut.phase, 'DONE');
  assert.equal(timedOut.pulledBy, 'timeout');
  const r = eggRecordFor(COOKED, timedOut, null);
  assert.equal(r.pulledBy, 'timeout');
  assert.equal(r.pulled_s, 400);
  assert.equal(r.cooled_s, 0);
});

test('4b2. a class names its carton, and a weighed egg names none', () => {
  const m = beginCooling(pulled(startHot(T0, 400, 'ice', 0.4)), T0 + 402_000);
  const us = eggRecordFor({ ...COOKED, egg: eggFromMass(0.0602), massFrom: 'class', sizeTable: 'us' }, m, 0);
  assert.equal(us.egg.sizeTable, 'us');
  assert.equal(us.egg.mass_g, 60.2);
  assert.notEqual(parseRecord(us), null);
  const weighed = eggRecordFor({ ...COOKED, sizeTable: 'us' }, m, 0);
  assert.equal(weighed.egg.sizeTable, null, 'a scale has no carton, whatever the region');
  assert.equal(parseRecord({ ...us, egg: { ...us.egg, sizeTable: null } }), null);
});

test('4b3. the time to boil says whether this cook measured it', () => {
  const m = beginCooling(pulled(startHot(T0, 400, 'ice', 0.4)), T0 + 402_000);
  assert.equal(eggRecordFor(COOKED, m, 0).setup.timeToBoilFrom, 'default');
  assert.equal(eggRecordFor({ ...COOKED, boilRemembered: true }, m, 0).setup.timeToBoilFrom, 'remembered');
  const cold = { ...COOKED, setup: appSetup({ startMode: 'cold', timeToBoil_s: 431.5 }) };
  const r = eggRecordFor(cold, m, 0);
  assert.equal(r.setup.timeToBoilFrom, 'measured');
  assert.equal(r.setup.timeToBoil_s, 431.5);
});

test('4b5. a nudged cook is recorded as the time recommended and the nudge, apart', () => {
  // The machine runs the nudged time; the record splits it, and scores an
  // egg nobody pulled at the time that actually ran.
  const m = advance(pulled(startHot(T0, 393, 'ice', 0.4)), T0 + 500_000).machine;
  const r = eggRecordFor({ ...COOKED, nudge_s: -7 }, m, 0);
  assert.equal(r.recommended_s, 400);
  assert.equal(r.nudge_s, -7);
  assert.equal(recordCookTime_s(r), 393);
  assert.notEqual(parseRecord(r), null);
});

test('4b4. the record keeps what the app said at Eggs in, and names the model that said it', () => {
  const m = beginCooling(pulled(startHot(T0, 400, 'ice', 0.4)), T0 + 402_000);
  const forecast = { cook_s: 400, yolk: [0.25, 0.5, 0.25], white: [0.125, 0.375, 0.5] };
  const r = eggRecordFor({ ...COOKED, forecast: forecast }, m, 0);
  assert.deepEqual(r.forecast, forecast);
  assert.equal(r.model, MODEL_ID);
  assert.deepEqual(parseRecord(JSON.parse(JSON.stringify(r))), r);
  const before = eggRecordFor(COOKED, m, 0);
  assert.equal(before.forecast, null, 'started before the odds were known');
  assert.notEqual(parseRecord(before), null);
});

test('4c. a stored cook keeps who pulled it, and one that does not say is refused', () => {
  const m = beginCooling(pulled(startHot(T0, 400, 'ice', 0.4)), T0 + 405_000);
  const old = JSON.parse(JSON.stringify(m)) as Record<string, unknown>;
  delete old['pulledBy'];
  delete old['outAt_ms'];
  assert.equal(restoreMachine(old, T0 + 500_000), null);
  const same = restoreMachine(JSON.parse(JSON.stringify(m)), T0 + 500_000);
  assert.equal(same?.pulledBy, 'cook');
  assert.equal(same?.outAt_ms, T0 + 405_000);
});

test('4d. a cook too old to pick back up is still an egg: run on to DONE, by the clock', () => {
  const m = startHot(T0, 400, 'ice', 0.4);
  const raw = JSON.parse(JSON.stringify(m)) as unknown;
  const later = T0 + 3 * 3600_000;
  assert.equal(restoreMachine(raw, later), null, 'not picked back up');
  const stale = staleMachine(raw, later);
  assert.equal(stale?.phase, 'DONE');
  assert.equal(stale?.pulledBy, 'timeout');
  const r = eggRecordFor(COOKED, stale as Machine, null);
  assert.equal(r.pulledBy, 'timeout');
  assert.equal(r.pulled_s, 400);
  assert.equal(r.yolk, null);
  assert.notEqual(parseRecord(r), null);
  // A cold start nobody said was boiling never cooked anything it could time.
  assert.equal(staleMachine(JSON.parse(JSON.stringify(startCold(T0, 900, 480, 'ice', 0.4))), later)?.phase, 'HEATING');
});
