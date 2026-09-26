/**
 * The record (E1): what a loader trusts, what a replay rebuilds, and the web
 * app's own keeping of both - and, since E2, the migration that replays E1's
 * log under the new likelihood.
 *
 * The headline claim is the one E1 is done on: a posterior rebuilt from the log
 * is BIT-identical to the one the app built egg by egg, with a reload between
 * every egg - and since E2, whichever order the two answers came in. Close is not enough. A replay that moves a posterior a little for
 * no reason would turn every future model change into a quiet change of taste,
 * and nobody would ever find out why.
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

import {
  Calibration, EggRecord, PRIOR_ID, buildRequestedGrid, copyCalibration, foldRecord,
  freshCalibration, gridRequestFor, parseLog, parseRecord, recordCookTime_s, recordMass_g, replay,
} from '../src/core/record.js';
import { GridSpec, calibrationGrid, PARTICLE_COUNT, CALIBRATION_SEED } from '../src/core/policy.js';
import { createPrior, updatePosterior } from '../src/core/infer.js';
import { eggFromMass } from '../src/core/geometry.js';
import { DEFAULT_PARAMS, donenessFromSlider, solveCookTime } from '../src/core/solve.js';
import { CookSetup } from '../src/core/protocol.js';
import {
  APP_VERSION, Cooked, clearCalibration, decodeKept, eggRecordFor, eggsBehind, encodeKept,
  keptState, learn, loadCalibration, logEgg, recordSecondAnswer,
} from '../src/ui/calibration.js';
import {
  Machine, advance, beginCooling, restoreMachine, startHot, PULL_GRACE_SECONDS,
} from '../src/ui/machine.js';

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

function setupOf(over: Partial<CookSetup> = {}): CookSetup {
  return {
    startMode: 'hot', eggStart_C: 4, ambient_C: 20, boiling_C: 100, timeToBoil_s: 480,
    cooling: 'ice', afterBoil: 'hold', waterLitres: 2, eggCount: 2, ...over,
  };
}

/** A realistic record: the time is what the solver says for this egg. */
function recordAt(
  level: number, yolk: EggRecord['yolk'], mass_g = 62, over: Partial<CookSetup> = {},
): EggRecord {
  const egg = eggFromMass(mass_g / 1000);
  const setup = setupOf(over);
  const t = solveCookTime(egg, setup, DEFAULT_PARAMS, donenessFromSlider(level)).result.cookTime_s;
  return {
    v: 1, uid: null, day: '2026-09-26', app: 'web', appVersion: APP_VERSION, prior: PRIOR_ID,
    egg: { mass_g: recordMass_g(egg.mass_kg), massFrom: 'class', sizeTable: 'eu' },
    setup: {
      startMode: setup.startMode, eggStart_C: setup.eggStart_C, eggFrom: 'fridge',
      ambient_C: setup.ambient_C, boiling_C: setup.boiling_C, timeToBoil_s: setup.timeToBoil_s,
      timeToBoilFrom: 'remembered',
      cooling: setup.cooling, afterBoil: 'hold', waterLitres: setup.waterLitres,
      eggCount: setup.eggCount,
    },
    level: level, recommended_s: t, nudge_s: 0, pulled_s: t + 4, pulledBy: 'cook',
    cooled_s: 180, yolk: yolk, white: null, whiteOffered: true, probe: null,
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

/** E1's store, as the web app wrote it: a three-number particle, the frozen v2
 *  base under it, and the log. Only the log survives E2. */
function storedV3(log: EggRecord[], withBase: boolean): string {
  const p = createPrior(16, 5);
  const columns = {
    n: 2, rng: p.rng,
    a: p.particles.map((x) => x.alpha_m2s),
    o: p.particles.map((x) => x.logDoseOffset),
    t: p.particles.map((x) => x.tauAirScale),
    w: p.weights,
  };
  return JSON.stringify({ v: 3, base: withBase ? columns : null, cal: columns, folded: log.length, log: log });
}

// --------------------------------------------------------------------------
// 1. What a loader trusts
// --------------------------------------------------------------------------

test('1a. a record from an older app version of the same schema is accepted', () => {
  const r = { ...recordAt(0.4, 0), appVersion: '0.0.1', app: 'ios' };
  assert.notEqual(parseRecord(r), null);
});

test('1b. unknown fields are ignored and dropped; absent nullable fields read as null', () => {
  const r = recordAt(0.4, 0) as unknown as Record<string, unknown>;
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

test('1c. white has three states, and an answer to an unasked question is refused', () => {
  const base = recordAt(0.3, -1);
  assert.notEqual(parseRecord({ ...base, whiteOffered: false, white: null }), null, 'not asked');
  assert.notEqual(parseRecord({ ...base, whiteOffered: true, white: null }), null, 'skipped');
  assert.notEqual(parseRecord({ ...base, whiteOffered: true, white: 'runny' }), null, 'answered');
  assert.equal(parseRecord({ ...base, whiteOffered: false, white: 'runny' }), null, 'unasked');
});

test('1c2. the white\'s three answers load, and so does E1\'s two-level "set"', () => {
  // The schema change E2 needed is additive: three new values a loader
  // accepts, and every egg E1 logged still reads as it did.
  const base = recordAt(0.3, null);
  for (const white of ['runny', 'tender', 'firm', 'set']) {
    assert.equal(parseRecord({ ...base, white: white })?.white, white, white);
  }
  assert.equal(parseRecord({ ...base, white: 'soft' }), null, 'not a white answer');
});

test('1d. one bad record refuses the whole log', () => {
  const good = recordAt(0.4, 0);
  assert.equal(parseLog([good, good])?.length, 2);
  assert.equal(parseLog([good, { ...good, level: 2 }]), null);
  assert.equal(parseLog({ 0: good }), null);
});

test('1e. the web app version is the package version', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  assert.equal(APP_VERSION, pkg.version);
});

// --------------------------------------------------------------------------
// 2. Replay
// --------------------------------------------------------------------------

test('2a. a replay is the egg-by-egg fold, and leaves its start alone', () => {
  const log = [recordAt(0.3, -1), recordAt(0.5, 1, 70), recordAt(0.45, 0, 55), recordAt(0.25, null, 64)];
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
  const answered = [recordAt(0.3, -1), recordAt(0.5, 1, 70)];
  const withSkip = [answered[0], recordAt(0.4, null, 58), answered[1]];
  const start = freshCalibration(64, 7);
  assertIdentical(replay(start, withSkip, COARSE), replay(start, answered, COARSE), 'skip');
});

test('2c. the first egg is scored on a surface centred on the literature values', () => {
  // Not on the prior's mean, which is close to them but not them: the app solves
  // with DEFAULT_PARAMS until an egg has taught it anything, and the first
  // surface has always been built around what it solved with.
  const r = recordAt(0.4, 0);
  const q = gridRequestFor(freshCalibration(64, 7), r, calibrationGrid);
  assert.equal(q.spec.alphaMin, DEFAULT_PARAMS.alpha_m2s * 0.55);
  assert.equal(q.tauAirScale, DEFAULT_PARAMS.tauAirScale);
});

test('2d. an egg is scored at the pull when the cook said when, and at the schedule when not', () => {
  // E2's other model change (INFERENCE.md section 4). A measured pull is the
  // cook's tap; an assumed one is the scheduled time standing in for it.
  const measured = { ...recordAt(0.35, -1), pulled_s: 0, pulledBy: 'cook' as const };
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
      direct, surface, recordCookTime_s(r), Math.log10(donenessFromSlider(r.level).yolkDose_min),
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

test('3a. loading: replay E1\'s log, rebuild, rebase, and refuse a damaged log', () => {
  const r = recordAt(0.4, 0);
  const e1 = [recordAt(0.3, -1), { ...recordAt(0.5, 0), white: 'set' as const }];

  // E2's migration: E1's posterior and its frozen base are dropped, and its log
  // is kept, to be folded again from the prior.
  const replayed = decodeKept(null, storedV3(e1, true));
  assert.equal(replayed.path, 'replayed');
  assert.equal(replayed.kept.base, null, 'the frozen base is dropped (owner, 26 September)');
  assert.equal(replayed.kept.log.length, 2);
  assert.equal(replayed.kept.folded, 0);
  assert.equal(replayed.kept.calibration.eggsLogged, 0, 'from the prior');

  assert.equal(decodeKept(null, null).path, 'fresh');
  assert.equal(decodeKept('{not json', null).path, 'fresh');
  assert.equal(decodeKept(null, '{"v":3,"log":[{"v":1}]}').path, 'fresh', 'an E1 log that cannot be read');

  const good = { base: null, calibration: freshCalibration(32, 3), log: [r], folded: 1 };
  const stored = JSON.parse(encodeKept(good)) as Record<string, unknown>;
  assert.equal(decodeKept(JSON.stringify(stored), null).path, 'loaded');
  // A v4 wins over a v3 written afterwards by an old tab.
  assert.equal(decodeKept(JSON.stringify(stored), storedV3(e1, false)).path, 'loaded');

  const badCal = { ...stored, cal: { ...(stored['cal'] as object), w: [Number.NaN] } };
  const rebuild = decodeKept(JSON.stringify(badCal), null);
  assert.equal(rebuild.path, 'rebuild');
  assert.equal(rebuild.kept.folded, 0);
  assert.equal(rebuild.kept.log.length, 1, 'the log survives a damaged posterior');
  // A posterior missing E2's columns is damaged, not half-read.
  const noNoise = { ...stored, cal: { ...(stored['cal'] as object), sd: undefined } };
  assert.equal(decodeKept(JSON.stringify(noNoise), null).path, 'rebuild');
  const zeroNoise = { ...stored, cal: { ...(stored['cal'] as { sd: number[] }), sd: (stored['cal'] as { sd: number[] }).sd.map(() => 0) } };
  assert.equal(decodeKept(JSON.stringify(zeroNoise), null).path, 'rebuild', 'a zero noise divides by zero');

  const badLog = { ...stored, log: [{ ...r, level: -1 }] };
  const rebased = decodeKept(JSON.stringify(badLog), null);
  assert.equal(rebased.path, 'rebased');
  assert.equal(rebased.kept.log.length, 0);
  assert.equal(rebased.kept.base?.eggsLogged, good.calibration.eggsLogged,
    'what the refused eggs taught is kept, frozen');

  const ahead = { ...stored, folded: 5 };
  assert.equal(decodeKept(JSON.stringify(ahead), null).path, 'rebased');
});

test('3b. E1\'s log, replayed, then eggs answered in either order with a reload between: bit-identical to a replay', async () => {
  storage.clear();
  // The owner's phone at E2: an E1 store with a frozen base and two logged
  // eggs, one of them with E1's two-level white.
  const e1 = [recordAt(0.3, -1), { ...recordAt(0.45, 0, 66), white: 'set' as const }];
  storage.set('aet.calibration.v3', storedV3(e1, true));
  storage.set('aet.calibration.v2', '{"v":2}');

  let calib = loadCalibration();
  assert.equal(storage.has('aet.calibration.v3'), false, 'v3 is gone once v4 holds its log');
  assert.equal(storage.has('aet.calibration.v2'), false);
  assert.equal(keptState().base, null);
  assert.equal(eggsBehind(), 2, 'the log is behind the prior until it is replayed');
  await learn();
  calib = loadCalibration();
  assertIdentical(calib, replay(freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED), e1), 'E1 log replayed');

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
    const r = recordAt(levels[i], a.first.yolk ?? null, 60 + 3 * i);
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
  assert.equal(log.length, 6);
  assert.deepEqual(log.slice(2).map((r) => [r.yolk, r.white]),
    [[-1, 'runny'], [null, 'tender'], [null, null], [1, 'firm']]);

  const rebuilt = replay(freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED), log);
  assertIdentical(calib, rebuilt, 'incremental vs replay');

  // And the app's own replay: damage the stored posterior, reload, and let the
  // app fold the whole log again from the prior.
  const stored = JSON.parse(storage.get('aet.calibration.v4') as string) as Record<string, unknown>;
  storage.set('aet.calibration.v4', JSON.stringify({ ...stored, cal: null }));
  calib = loadCalibration();
  assert.equal(eggsBehind(), 6);
  await learn();
  assertIdentical(keptState().calibration, rebuilt, 'the app rebuilt it from the log');
});

test('3c. forget everything clears the log, the base and the posterior', () => {
  storage.set('aet.calibration.v3', storedV3([recordAt(0.4, 0)], true));
  loadCalibration();
  logEgg(recordAt(0.4, null));
  const fresh = clearCalibration();
  assert.equal(storage.size, 0);
  assert.equal(keptState().log.length, 0);
  assert.equal(keptState().base, null);
  assert.equal(fresh.eggsLogged, 0);
});

// --------------------------------------------------------------------------
// 4. The pull
// --------------------------------------------------------------------------

const T0 = 1_750_000_000_000;
const COOKED: Cooked = {
  egg: eggFromMass(0.062), massFrom: 'scale', sizeTable: null, setup: setupOf(), eggFrom: 'fridge',
  boilRemembered: false, units: 'metric', lang: 'en',
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
  assert.equal(r.whiteOffered, true, 'the white is always offered since E2');
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
  const cold = { ...COOKED, setup: setupOf({ startMode: 'cold', timeToBoil_s: 431.5 }) };
  const r = eggRecordFor(cold, m, 0);
  assert.equal(r.setup.timeToBoilFrom, 'measured');
  assert.equal(r.setup.timeToBoil_s, 431.5);
});

test('4c. a cook stored before E1 restores, with its pull unmeasured', () => {
  const m = beginCooling(pulled(startHot(T0, 400, 'ice', 0.4)), T0 + 405_000);
  const old = JSON.parse(JSON.stringify(m)) as Record<string, unknown>;
  delete old['pulledBy'];
  delete old['outAt_ms'];
  const back = restoreMachine(old, T0 + 500_000);
  assert.notEqual(back, null);
  assert.equal(back?.pulledBy, 'timeout');
  const same = restoreMachine(JSON.parse(JSON.stringify(m)), T0 + 500_000);
  assert.equal(same?.pulledBy, 'cook');
  assert.equal(same?.outAt_ms, T0 + 405_000);
});
