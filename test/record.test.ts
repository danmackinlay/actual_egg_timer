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

import { STORES } from '../src/core/stores.js';
import { readFileSync } from 'node:fs';

import { GridSpec, buildRequestedGrid } from '../src/core/doseGrid.js';
import {
  CALIBRATION_SEED, Calibration, EggRecord, LIKELIHOOD_ID, MODEL_ID, PARTICLE_COUNT, RESULTS_FILE_VERSION,
  calibrationGrid, copyCalibration, foldRecord, freshCalibration, gridRequestFor, jsonString, parseLog, parseRecord,
  recordCookTime_s, recordMass_g, replay, resultsFile, resultsFileName,
} from '../src/core/record.js';
import { LITERATURE_POPULATION, WhiteReport, YolkWord } from '../src/core/infer.js';
import { BoilMemory } from '../src/core/boil.js';
import {
  CookChoices, CookPlan, PULL_GRACE_SECONDS, RunningCook, cookEnding, cookTooOld, eventsDue, phaseAt, readRunningCook,
  replan, startCook, withBoil, withOut, writeEvents,
} from '../src/core/running.js';
import { createPrior, posteriorParams, updatePosterior } from '../src/core/infer.js';
import { eggFromMass } from '../src/core/geometry.js';
import { DEFAULT_PARAMS, donenessFromSlider, solveCookTime } from '../src/core/solve.js';
import { CookSetup } from '../src/core/protocol.js';
import { Learner, openLearner } from '../src/ui/calibration.js';
import { decodeKept, encodeKept } from '../src/ui/calibrationStore.js';
import { APP_VERSION } from '../src/ui/version.js';
import { appSetup, gridFor, knowing, recordAt, webRecordFor } from '../tools/common.js';
import {
  PosteriorReference, REFERENCE_FILE, SUMMARY_KEYS, Summary, decisionSurface, fixedSurfaces, foldOnSurfaces,
  seedOf, spread, summarise, wordLog,
} from '../tools/posterior.js';

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

/** The page under test, as boot() opens it: opened again for a reload. */
let cal: Learner;

const COARSE = (alphaCentre: number, cookTime_s: number): GridSpec => ({
  ...calibrationGrid(alphaCentre, cookTime_s), alphaCount: 7, timeCount: 9,
});

/** A realistic record: the time is what the solver says for this egg. */
function solvedRecord(
  level: number, yolkWord: YolkWord | null, mass_g = 62, over: Partial<CookSetup> = {},
): EggRecord {
  const egg = eggFromMass(mass_g / 1000);
  const setup = appSetup(over);
  const t = solveCookTime(egg, setup, DEFAULT_PARAMS, donenessFromSlider(level)).result.cookTime_s;
  return {
    v: 1, uid: null, day: '2026-09-26', app: 'web', appVersion: APP_VERSION, prior: LITERATURE_POPULATION.id, model: MODEL_ID,
    egg: { mass_g: recordMass_g(egg.mass_kg), massFrom: 'class', sizeTable: 'eu' },
    setup: {
      startMode: setup.startMode, eggStart_C: setup.eggStart_C, eggFrom: 'fridge',
      ambient_C: setup.ambient_C, boiling_C: setup.boiling_C, timeToBoil_s: setup.timeToBoil_s,
      timeToBoilFrom: 'remembered',
      cooling: setup.cooling, afterBoil: 'hold', waterLitres: setup.waterLitres,
      eggCount: setup.eggCount,
    },
    level: level, recommended_s: t, nudge_s: 0, pulled_s: t + 4, pulledBy: 'cook',
    cooled_s: 180, yolkWord: yolkWord, white: null, probe: null,
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
  const r = { ...solvedRecord(0.4, 'jammy'), appVersion: '0.0.1', app: 'ios' };
  assert.notEqual(parseRecord(r), null);
});

test('1b. unknown fields are ignored and dropped; a field today\'s records write is never absent', () => {
  const r = solvedRecord(0.4, 'jammy') as unknown as Record<string, unknown>;
  const parsed = parseRecord({ ...r, futureField: 1 });
  assert.notEqual(parsed, null);
  assert.equal('futureField' in (parsed as object), false);
  for (const key of ['uid', 'model', 'yolkWord', 'white', 'probe', 'forecast']) {
    const raw: Record<string, unknown> = { ...r };
    delete raw[key];
    assert.equal(parseRecord(raw), null, `no ${key}`);
  }
  // `id` alone may be absent: the iPhone app keeps none.
  assert.equal(parseRecord({ ...r, id: 1759700000123 })?.id, 1759700000123);
  assert.equal('id' in (parsed as object), false);
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

test('1c2. the five yolk words load, a skip loads, and nothing else does', () => {
  const base = solvedRecord(0.3, null);
  for (const word of ['runny', 'soft', 'jammy', 'fudgy', 'hard']) {
    assert.equal(parseRecord({ ...base, yolkWord: word })?.yolkWord, word, word);
  }
  assert.equal(parseRecord({ ...base, yolkWord: null })?.yolkWord, null, 'skipped');
  assert.equal(parseRecord({ ...base, yolkWord: 'medium' }), null, 'not a yolk word');
  assert.equal(parseRecord({ ...base, yolkWord: 'Jammy' }), null, 'a key, not a word on screen');
  assert.equal(parseRecord({ ...base, yolkWord: 2 }), null, 'not an index');
  // The forecast of the five: kept when there are five that sum to one, null
  // when there are none, and never left out.
  const f = { cook_s: 400, yolk: [0.2, 0.6, 0.2], white: [0.3, 0.5, 0.2] };
  assert.equal(parseRecord({ ...base, forecast: f }), null, 'no yolk words field');
  assert.equal(parseRecord({ ...base, forecast: { ...f, yolkWord: null } })?.forecast?.yolkWord, null);
  const five = [0.0625, 0.25, 0.5, 0.125, 0.0625];
  assert.deepEqual(parseRecord({ ...base, forecast: { ...f, yolkWord: five } })?.forecast?.yolkWord, five);
  assert.equal(parseRecord({ ...base, forecast: { ...f, yolkWord: [0.5, 0.5] } }), null);
});

test('1d. one bad record refuses the whole log', () => {
  const good = solvedRecord(0.4, 'jammy');
  assert.equal(parseLog([good, good])?.length, 2);
  assert.equal(parseLog([good, { ...good, level: 2 }]), null);
  assert.equal(parseLog({ 0: good }), null);
});

test('1e. the web app version is the package version', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  assert.equal(APP_VERSION, pkg.version);
});

test('1f. the results file: the store spliced in as stored, a damaged one as text', () => {
  for (const s of ['', 'plain', 'a"b\\c/d', '\n\r\t\b\f\u0000\u001f\u007f', '‘curly’ café 🥚']) {
    assert.equal(jsonString(s), JSON.stringify(s), `escaped as JSON.stringify: ${JSON.stringify(s)}`);
  }
  const store = JSON.stringify({ v: 4, p: 'x', folded: 0, log: [solvedRecord(0.4, 'jammy')] });
  const meta = { app: 'web' as const, appVersion: APP_VERSION, exported: '2026-10-05T09:00:00.000Z', population: 'x', uid: null };
  const text = resultsFile(meta, store);
  // The store's characters are in the file unchanged.
  assert.ok(text.includes(`"stored":${store}`));
  const file = JSON.parse(text) as Record<string, unknown>;
  assert.equal(file['file'], RESULTS_FILE_VERSION);
  assert.equal(file['model'], MODEL_ID);
  assert.equal(file['uid'], null);
  assert.deepEqual(file['stored'], JSON.parse(store));
  assert.equal('unread' in file, false);
  for (const [stored, spliced] of [['{damaged', '{damaged'], ['[1]', [1]], ['7', '7']] as const) {
    assert.deepEqual(JSON.parse(resultsFile(meta, stored))['stored'], spliced, 'only an object or array is spliced');
  }
  assert.equal(JSON.parse(resultsFile(meta, null))['stored'], null);
  assert.equal(resultsFileName('2026-10-05'), 'actual-egg-timer-results-2026-10-05.json');
});

// --------------------------------------------------------------------------
// 2. Replay
// --------------------------------------------------------------------------

test('2a. a replay is the egg-by-egg fold, and leaves its start alone', () => {
  const log = [solvedRecord(0.3, 'soft'), solvedRecord(0.5, 'fudgy', 70), solvedRecord(0.45, 'jammy', 55), solvedRecord(0.25, null, 64)];
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

test('2a3. a log makes the right posterior: the filter against the exact one, in distribution', () => {
  // A particle filter is random: resampling is discontinuous in the weights,
  // so a last-bit difference in exp can send the particles down another,
  // equally good path, and a posterior pinned particle by particle on one
  // machine is not the one another makes. What is checked is what the
  // particles are a sample OF. Ten eggs answered in the words are folded on fixed
  // surfaces under SEEDS seeds the reference never used, and each summary -
  // the time-scale's and the taste's mean and 10/50/90% points, the white
  // offset's mean, the jammy time chosen and its odds - is averaged over
  // them. That average must sit within Z standard errors of two things:
  // the same filter's average over the reference's seeds, which fails on any
  // change to what the filter does; and the EXACT posterior's (importance
  // sampling from the prior, no filter), which says the filter samples the
  // right posterior. The error is the seed-to-seed sd the reference measured,
  // over the root of the seeds. The seed-to-seed spread is held too: a filter
  // grown noisier is wrong even when it is right on average. None of it
  // fails on rounding. `npm run posterior -- reference` rewrites the
  // reference, and tools/posterior.ts says when.
  const ref = JSON.parse(readFileSync(REFERENCE_FILE, 'utf8')) as PosteriorReference;
  assert.equal(ref.filter.particles, PARTICLE_COUNT, 'the reference was made at another particle count: rewrite it');
  const SEEDS = 60;
  const Z = 5;
  const log = wordLog();
  const surfaces = fixedSurfaces(log);
  const ds = decisionSurface();
  const rows: Summary[] = [];
  for (let k = 0; k < SEEDS; k++) {
    const c = foldOnSurfaces(freshCalibration(PARTICLE_COUNT, seedOf(ref.filter.seeds + k)), log, surfaces);
    assert.equal(c.eggsLogged, 10);
    rows.push(summarise(c.posterior, ds));
  }
  const now = spread(rows);
  for (const key of SUMMARY_KEYS) {
    const sd = ref.filter.sd[key];
    const asBefore = sd * Math.sqrt(1 / SEEDS + 1 / ref.filter.seeds);
    const fromBefore = now.mean[key] - ref.filter.mean[key];
    assert.ok(Math.abs(fromBefore) <= Z * asBefore,
      `${key}: ${now.mean[key]} against the filter's ${ref.filter.mean[key]}, ${(fromBefore / asBefore).toFixed(1)} se`);
    const exactSe = Math.hypot(sd / Math.sqrt(SEEDS), ref.exact.se[key]);
    const fromExact = now.mean[key] - ref.exact.value[key];
    assert.ok(Math.abs(fromExact) <= Z * exactSe,
      `${key}: ${now.mean[key]} against the exact ${ref.exact.value[key]}, ${(fromExact / exactSe).toFixed(1)} se`);
    // The sd of 60 normal draws is within about 9% of the true one; 1.6 is
    // more than six of those, and room for tails heavier than normal.
    assert.ok(now.sd[key] <= 1.6 * sd, `${key}: sd ${now.sd[key]} from seed to seed against ${sd}`);
  }
});

test('2b. an unanswered egg folds nothing and builds no surface', () => {
  const answered = [solvedRecord(0.3, 'soft'), solvedRecord(0.5, 'fudgy', 70)];
  const withSkip = [answered[0], solvedRecord(0.4, null, 58), answered[1]];
  const start = freshCalibration(64, 7);
  assertIdentical(replay(start, withSkip, COARSE), replay(start, answered, COARSE), 'skip');
});

test('2c. the first egg is scored on a surface centred on the literature values', () => {
  // Not on the prior's mean, which is close to them but not them: the app solves
  // with DEFAULT_PARAMS until an egg has taught it anything, and the first
  // surface has always been built around what it solved with.
  const r = solvedRecord(0.4, 'jammy');
  const q = gridRequestFor(freshCalibration(64, 7), r, calibrationGrid);
  assert.equal(q.spec.alphaMin, DEFAULT_PARAMS.alpha_m2s * 0.55);
});

test('2d. an egg is scored at the pull when the cook said when, and at the schedule when not', () => {
  // INFERENCE.md section 4. A measured pull is the
  // cook's tap; an assumed one is the scheduled time standing in for it.
  const measured = { ...solvedRecord(0.35, 'soft'), pulled_s: 0, pulledBy: 'cook' as const };
  measured.pulled_s = measured.recommended_s + 25;
  const assumed = { ...measured, pulledBy: 'timeout' as const, pulled_s: measured.recommended_s };
  assert.equal(recordCookTime_s(measured), measured.recommended_s + 25);
  assert.equal(recordCookTime_s(assumed), assumed.recommended_s);

  for (const r of [measured, assumed]) {
    const surface = buildRequestedGrid(gridRequestFor(freshCalibration(64, 7), r, COARSE));
    const viaRecord = freshCalibration(64, 7);
    foldRecord(viaRecord, r, surface);
    const direct = createPrior(64, 7);
    updatePosterior(direct, surface, recordCookTime_s(r), 'soft', null);
    assertIdentical(viaRecord, { posterior: direct, eggsLogged: 1 }, r.pulledBy);
  }
  // And it matters: 25 s late is a different posterior. Its mean, not one
  // weight: a fold that resamples leaves every weight at 1/64 either way.
  const a = replay(freshCalibration(64, 7), [measured], COARSE);
  const b = replay(freshCalibration(64, 7), [assumed], COARSE);
  assert.notEqual(posteriorParams(a.posterior).alpha_m2s, posteriorParams(b.posterior).alpha_m2s);
});

/* What the fold makes of a fixed log - the apps' prior, particle count and
 * grid, five eggs from five pots with every kind of answer - pinned to the
 * LIKELIHOOD_ID it was made under. A change to the prior's draw, the physics
 * or the likelihood moves these numbers and fails here, until the id moves
 * (and with it MODEL_ID, in both apps) so that every stored posterior is
 * replayed; then pin what the test prints. A change to the decision alone
 * moves nothing here and needs no replay. Each posterior dimension's weighted
 * mean and sd, the effective sample size, and the generator's state after
 * the last resample, held to 1e-9: a last-bit difference between machines is
 * far below that, and a change to the fold far above it. */
const LIKELIHOOD_PIN = {
  id: '2026-10-e10',
  fold: [
    1.733475504969895e-7, 9.459606411996515e-9, -0.10266916794051935, 0.23986487262527864, 0.43535072327788293,
    0.16273697926501188, 0.1905431350941683, 0.4135274983436036, 0.9715919290968168, 0.36025047224995055,
    609.4639698430659, -2016908570, 6,
  ],
};

function foldDigest(c: Calibration): number[] {
  const post = c.posterior;
  const out: number[] = [];
  const dims: ((p: typeof post.particles[number]) => number)[] = [
    (p) => p.alpha_m2s, (p) => p.logDoseOffset, (p) => p.noise, (p) => p.whiteOffset, (p) => p.whiteFirmGap,
  ];
  for (const dim of dims) {
    let mean = 0;
    for (let i = 0; i < post.particles.length; i++) mean += post.weights[i] * dim(post.particles[i]);
    let variance = 0;
    for (let i = 0; i < post.particles.length; i++) variance += post.weights[i] * (dim(post.particles[i]) - mean) ** 2;
    out.push(mean, Math.sqrt(variance));
  }
  let squares = 0;
  for (const w of post.weights) squares += w * w;
  out.push(1 / squares, post.rng, c.eggsLogged);
  return out;
}

test('2e. the likelihood id is pinned to what its fold makes of a fixed log', () => {
  const probed = recordAt(0.45, 430, 'fudgy', null, appSetup({ cooling: 'tap', afterBoil: 'off' }));
  probed.probe = { centre_C: 66.4, after_s: 120 };
  const log = [
    recordAt(0.3, 400, 'soft', 'runny'),
    recordAt(0.5, 455, 'jammy', 'tender', appSetup({ startMode: 'cold', cooling: 'counter' })),
    probed,
    recordAt(0.6, 480, 'hard', 'firm', appSetup({ waterLitres: 1, eggCount: 4, boiling_C: 95 })),
    recordAt(0.2, 380, 'runny', null),
    recordAt(0.4, 420, null, 'tender'),
  ];
  const got = foldDigest(replay(freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED), log));
  const pin = `pin: { id: '${LIKELIHOOD_ID}', fold: [${got.join(', ')}] }`;
  assert.equal(LIKELIHOOD_ID, LIKELIHOOD_PIN.id, `LIKELIHOOD_ID moved: ${pin}`);
  assert.equal(got.length, LIKELIHOOD_PIN.fold.length, pin);
  for (let i = 0; i < got.length; i++) {
    const error = Math.abs(got[i] - LIKELIHOOD_PIN.fold[i]) / Math.max(Math.abs(LIKELIHOOD_PIN.fold[i]), 1e-300);
    assert.ok(error <= 1e-9, `the fold moved (number ${i}, ${error.toExponential(1)}): move LIKELIHOOD_ID; ${pin}`);
  }
});

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
  assert.equal(cal.storedElsewhere(STORES.settings.web), false);
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

// --------------------------------------------------------------------------
// 4. The pull, and the rest of the record, from a running cook
// --------------------------------------------------------------------------

const T0 = 1_750_000_000_000;
const S0 = T0 / 1000;
const C4 = knowing({ particles: 200, eggsLogged: 0 });
const CHOICES: CookChoices = {
  mass_kg: 0.062, massFrom: 'scale', sizeTable: null, eggFrom: 'fridge', customStart_C: 12, room_C: null,
  startMode: 'hot', afterBoil: 'hold', cooling: 'ice', waterLitres: 2, eggCount: 2, altitude_m: 0, level: 0.4,
};

function cookOf(over: Partial<CookChoices> = {}, nudge_s = 0, memory: BoilMemory = {}): RunningCook {
  return startCook(T0 / 1000, { ...CHOICES, ...over }, nudge_s, memory, 'metric', 'en');
}

/** The plan on its pot's surface, as an app makes it once the surface is in:
 *  a record is never made from a plan with no surface. */
function onSurface(cook: RunningCook, now_s: number): CookPlan {
  const first = replan(cook, C4, null, 0, now_s);
  const inputs = first.inputs;
  if (inputs === null) return first;
  return replan(cook, C4, { inputs: inputs, grid: gridFor(C4, inputs.egg, inputs.setup), profile: null }, 0, now_s);
}

/** The record, which a plan on its surface always makes. */
function rec(
  cook: RunningCook, plan: CookPlan, yolk: YolkWord | null, white: WhiteReport | null = null,
): EggRecord {
  const r = webRecordFor(cook, plan, yolk, white);
  assert.ok(r !== null, 'a record');
  return r;
}

/** The cook planned at `now_s`, with what the clock decided by then. */
function ranTo(cook: RunningCook, now_s: number): { cook: RunningCook; plan: CookPlan } {
  const plan = onSurface(cook, now_s);
  const next = writeEvents(cook, eventsDue(cook, plan, now_s));
  return { cook: next, plan: onSurface(next, now_s) };
}

test('4a. the cook\'s tap out of PULL is recorded as a measured pull', () => {
  const cook = cookOf();
  const plan = onSurface(cook, S0);
  const pull = plan.deadlines.cookEnd_s;
  const tapped = withOut(cook, plan, pull + 9.5);
  assert.equal(tapped.events.pulled?.by, 'cook');
  const r = rec(tapped, onSurface(tapped, pull + 9.5), 'jammy');
  assert.ok(Math.abs(r.pulled_s - (plan.cookTime_s + 9.5)) < 1e-6);
  assert.equal(r.pulledBy, 'cook');
  assert.ok(Math.abs(r.recommended_s - plan.cookTime_s) < 0.06);
  assert.equal(r.id, T0, 'the record\'s id is when Start was pressed');
  // The yolk the cook got.
  assert.equal(r.yolkWord, 'jammy');
  assert.notEqual(parseRecord(r), null);
});

test('4b. a pull nobody confirmed is recorded as assumed, at the scheduled time', () => {
  const cook = cookOf({ cooling: 'counter', level: 0.6 });
  const plan = onSurface(cook, S0);
  const after = ranTo(cook, plan.deadlines.cookEnd_s + PULL_GRACE_SECONDS);
  assert.equal(phaseAt(after.plan.deadlines, plan.deadlines.cookEnd_s + PULL_GRACE_SECONDS), 'DONE');
  const r = rec(after.cook, after.plan, null);
  assert.equal(r.pulledBy, 'timeout');
  assert.ok(Math.abs(r.pulled_s - plan.cookTime_s) < 0.06);
  assert.equal(r.cooled_s, 0);
});

test('4b2. a class names its carton, and a weighed egg names none', () => {
  const us = cookOf({ mass_kg: 0.0602, massFrom: 'class', sizeTable: 'us' });
  const r = rec(us, onSurface(us, S0), 'jammy');
  assert.equal(r.egg.sizeTable, 'us');
  assert.equal(r.egg.mass_g, 60.2);
  assert.notEqual(parseRecord(r), null);
  const weighed = cookOf({ sizeTable: 'us' });
  assert.equal(rec(weighed, onSurface(weighed, S0), 'jammy').egg.sizeTable, null,
    'a scale has no carton, whatever the region');
  assert.equal(parseRecord({ ...r, egg: { ...r.egg, sizeTable: null } }), null);
});

test('4b3. the time to boil says whether this cook measured it', () => {
  const plain = cookOf();
  assert.equal(rec(plain, onSurface(plain, S0), 'jammy').setup.timeToBoilFrom, 'default');
  const known = cookOf({}, 0, { '2.0': 450 });
  assert.equal(rec(known, onSurface(known, S0), 'jammy').setup.timeToBoilFrom, 'remembered');
  const cold = withBoil(cookOf({ startMode: 'cold' }), S0 + 431.5);
  const r = rec(cold, onSurface(cold, S0 + 431.5), 'jammy');
  assert.equal(r.setup.timeToBoilFrom, 'measured');
  assert.equal(r.setup.timeToBoil_s, 431.5);
});

test('4b4. a nudged cook is recorded as the time recommended and the nudge, apart', () => {
  // The plan runs the nudged time; the record splits it, and scores an egg
  // nobody pulled at the time that actually ran.
  const cook = cookOf({}, -7);
  const plan = onSurface(cook, S0);
  const r = rec(cook, plan, 'jammy');
  assert.equal(r.nudge_s, -7);
  assert.ok(Math.abs(recordCookTime_s(r) - plan.cookTime_s) < 0.06);
  assert.ok(Math.abs(r.recommended_s - (plan.cookTime_s + 7)) < 0.06);
  assert.notEqual(parseRecord(r), null);
});

test('4b5. the record keeps what the app said for the cook that ran, and names the model that said it', () => {
  const cook = cookOf();
  const interim = replan(cook, C4, null, 0, S0);
  assert.equal(webRecordFor(cook, interim, 'jammy'), null, 'no surface in, nothing said: no record');
  const inputs = interim.inputs;
  assert.ok(inputs !== null);
  const surface = { inputs: inputs, grid: gridFor(C4, inputs.egg, inputs.setup), profile: null };
  const plan = replan(cook, C4, surface, 0, S0);
  const r = rec(cook, plan, 'jammy');
  assert.ok(plan.forecast !== null);
  assert.deepEqual(r.forecast, plan.forecast);
  assert.equal(r.model, MODEL_ID);
  assert.deepEqual(parseRecord(JSON.parse(JSON.stringify(r))), r);
});

test('4c. a stored cook keeps who pulled it: read back, the same record', () => {
  const cook = cookOf();
  const plan = onSurface(cook, S0);
  const out = withOut(cook, plan, plan.deadlines.cookEnd_s + 5);
  const back = readRunningCook(JSON.parse(JSON.stringify(out)));
  assert.ok(back !== null);
  const later = plan.deadlines.cookEnd_s + 60;
  assert.deepEqual(
    rec(back, onSurface(back, later), null), rec(out, onSurface(out, later), null),
  );
});

test('4d. a cook too old to pick back up is still an egg: run on to DONE, by the clock', () => {
  const later = S0 + 3 * 3600;
  const stale = ranTo(cookOf(), later);
  assert.equal(cookTooOld(stale.plan, later), true, 'not picked back up');
  assert.equal(cookEnding(stale.cook, stale.plan, later).finished, true);
  const r = rec(stale.cook, stale.plan, null);
  assert.equal(r.pulledBy, 'timeout');
  assert.ok(Math.abs(r.pulled_s - stale.plan.cookTime_s) < 0.06);
  assert.equal(r.yolkWord, null);
  assert.notEqual(parseRecord(r), null);
  // A cold start nobody said was boiling never cooked anything it could time.
  const heating = ranTo(cookOf({ startMode: 'cold' }), later);
  assert.equal(phaseAt(heating.plan.deadlines, later), 'HEATING');
  assert.equal(cookEnding(heating.cook, heating.plan, later).finished, false);
});

test('4e. the same egg logged again keeps its facts as last corrected, and the answers already given', async () => {
  storage.clear();
  cal = openLearner();
  const cook = cookOf();
  const plan = onSurface(cook, S0);
  const first = rec(cook, plan, 'jammy');
  assert.equal(cal.logEgg(first), 0);
  // The same cook, its record made again from another tab's plan: another
  // forecast, no answer. The answer stays; the rest is the newer record.
  const again = { ...rec(cook, plan, null), cooled_s: first.cooled_s + 10 };
  assert.equal(cal.logEgg(again), 0);
  const kept = cal.keptState().log;
  assert.equal(kept.length, 1);
  assert.equal(kept[0].yolkWord, 'jammy');
  assert.equal(kept[0].cooled_s, again.cooled_s);
  assert.equal(cal.logEgg(again), 0, 'once kept, nothing changes');
  // One already folded is folded again, from the prior: the posterior is the
  // log's replay.
  await cal.learn();
  assert.equal(cal.keptState().folded, 1);
  const corrected = { ...again, cooled_s: again.cooled_s + 30 };
  cal.logEgg(corrected);
  assert.equal(cal.keptState().folded, 0, 'to be folded again');
  await cal.learn();
  assert.equal(cal.keptState().folded, 1);
  assertIdentical(cal.keptState().calibration, replay(freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED), cal.keptState().log),
    'the corrected egg, folded once');
});

// --------------------------------------------------------------------------
// 5. The calibration grid: the bounds that decide the posterior
// --------------------------------------------------------------------------

test('5a. the grid brackets the cook that was actually performed', () => {
  const g = calibrationGrid(1.4e-7, 441);
  assert.ok(g.alphaMin < 1.4e-7 && g.alphaMax > 1.4e-7, 'grid does not contain its centre');
  assert.ok(g.timeMin_s < 441 && g.timeMax_s > 441, 'grid does not contain the cook');
  assert.equal(g.alphaCount, 21);
  assert.equal(g.timeCount, 32);
});

test('5b. a very short cook still gets a grid with a floor on it', () => {
  // 0.35 * 60 is 21 s, which is not a cook. The floor is what stops the
  // interpolation domain collapsing on a fast egg.
  const g = calibrationGrid(1.4e-7, 60);
  assert.ok(g.timeMin_s >= 60, `time floor collapsed to ${g.timeMin_s}`);
  assert.ok(g.timeMax_s > g.timeMin_s, 'grid has no width');
});

test('5c. the grid scales with the cook rather than sitting at fixed seconds', () => {
  const short = calibrationGrid(1.4e-7, 400);
  const long = calibrationGrid(1.4e-7, 800);
  assert.ok(long.timeMax_s > short.timeMax_s, 'grid did not follow the cook');
  close(long.timeMax_s / short.timeMax_s, 2, 1e-12, 'grid scaling');
});

function close(actual: number, expected: number, tol: number, what: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${what}: expected ${expected} +/- ${tol}, got ${actual} (delta ${actual - expected})`,
  );
}
