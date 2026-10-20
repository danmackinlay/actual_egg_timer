/**
 * The record: what a loader trusts, what a replay rebuilds, and the web app's
 * own keeping of both. Here, the loader and the replay;
 * recordStore.test.ts holds the web app's keeping, recordCook.test.ts the
 * record of a running cook, and test/records.ts what they share.
 *
 * The headline claim: a posterior rebuilt from the log is BIT-identical to the
 * one the app built egg by egg, with a reload between every egg, whichever
 * order the two answers came in (recordStore.test.ts). Close is not
 * enough. A replay that moves a
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

import { buildRequestedGrid } from '../src/core/doseGrid.ts';
import {
  type EggRecord, LIKELIHOOD_ID, MODEL_ID, PARTICLE_COUNT, RESULTS_FILE_VERSION, calibrationGrid,
  copyCalibration, foldRecord, freshCalibration, gridRequestFor, parseLog, parseRecord, recordCookTime_s,
  replay, resultsFile, resultsFileName, sharedRecord,
} from '../src/core/record.ts';
import { WHITE_REPORTS, YOLK_WORDS, createPrior, posteriorParams, updatePosterior } from '../src/core/infer.ts';
import { DEFAULT_PARAMS } from '../src/core/solve.ts';
import { APP_VERSION } from '../src/ui/version.ts';
import { RECORD_ENUMS, fieldAt, withMember } from '../tools/common.ts';
import {
  type PosteriorReference, REFERENCE_FILE, SUMMARY_KEYS, type Summary, decisionSurface, fixedSurfaces, foldOnSurfaces, seedOf,
  spread, summarise, wordLog,
} from '../tools/posterior.ts';
import { COARSE, assertIdentical, solvedRecord } from './records.ts';

// --------------------------------------------------------------------------
// 1. What a loader trusts
// --------------------------------------------------------------------------

test('a record from an older app version of the same schema is accepted', () => {
  const r = { ...solvedRecord(0.4, 'jammy'), appVersion: '0.0.1', app: 'ios' };
  assert.notEqual(parseRecord(r), null);
});

test('unknown fields are ignored and dropped; a field today\'s records write is never absent', () => {
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

test('every member of every list a field takes loads, and a member added to a list is all a record needs', () => {
  const base = solvedRecord(0.3, 'soft');
  for (const e of RECORD_ENUMS) {
    for (const m of e.members) {
      assert.equal(fieldAt(parseRecord(withMember(base, e.path, m)), e.path), m, `${e.path}: ${m}`);
    }
    // A cooling, a carton or an answer core has never heard of is refused,
    // and read the moment its list has it.
    const planted = withMember(base, e.path, 'planted');
    assert.equal(parseRecord(planted), null, `${e.path}: not on the list`);
    const grown = e.members as string[];
    grown.push('planted');
    try {
      assert.equal(fieldAt(parseRecord(planted), e.path), 'planted', `${e.path}: added to the list`);
    } finally {
      grown.pop();
    }
  }
});

test('the white\'s three answers load, a skip loads, and nothing else does', () => {
  const base = solvedRecord(0.3, null);
  for (const white of WHITE_REPORTS) {
    assert.equal(parseRecord({ ...base, white: white })?.white, white, white);
  }
  assert.equal(parseRecord({ ...base, white: null })?.white, null, 'skipped');
  assert.equal(parseRecord({ ...base, white: 'soft' }), null, 'not a white answer');
  assert.equal(parseRecord({ ...base, white: 'set' }), null, 'the first records\' two-level answer, refused');
});

test('the five yolk words load, a skip loads, and nothing else does', () => {
  const base = solvedRecord(0.3, null);
  for (const word of YOLK_WORDS) {
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

test('one bad record refuses the whole log', () => {
  const good = solvedRecord(0.4, 'jammy');
  assert.equal(parseLog([good, good])?.length, 2);
  assert.equal(parseLog([good, { ...good, level: 2 }]), null);
  assert.equal(parseLog({ 0: good }), null);
});

test('the web app version is the package version', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  assert.equal(APP_VERSION, pkg.version);
});

test('the results file: the store as stored, a damaged one as text', () => {
  const store = JSON.stringify({ v: 4, p: 'x', folded: 0, log: [solvedRecord(0.4, 'jammy')] });
  const meta = { app: 'web' as const, appVersion: APP_VERSION, exported: '2026-10-05T09:00:00.000Z', population: 'x', uid: null };
  const file = JSON.parse(resultsFile(meta, store)) as Record<string, unknown>;
  assert.equal(file['file'], RESULTS_FILE_VERSION);
  assert.equal(file['model'], MODEL_ID);
  assert.equal(file['uid'], null);
  assert.deepEqual(file['stored'], JSON.parse(store));
  assert.equal('unread' in file, false);
  for (const [stored, kept] of [['{damaged', '{damaged'], ['[1]', [1]], ['7', '7']] as const) {
    assert.deepEqual(JSON.parse(resultsFile(meta, stored))['stored'], kept, 'only an object or array is read in');
  }
  assert.equal(JSON.parse(resultsFile(meta, null))['stored'], null);
  assert.equal(resultsFileName('2026-10-05'), 'actual-egg-timer-results-2026-10-05.json');
});

// --------------------------------------------------------------------------
// 2. Replay
// --------------------------------------------------------------------------

test('a replay is the egg-by-egg fold, and leaves its start alone', () => {
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

test('a log makes the right posterior: the filter against the exact one, in distribution', () => {
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

test('an unanswered egg folds nothing and builds no surface', () => {
  const answered = [solvedRecord(0.3, 'soft'), solvedRecord(0.5, 'fudgy', 70)];
  const withSkip = [answered[0], solvedRecord(0.4, null, 58), answered[1]];
  const start = freshCalibration(64, 7);
  assertIdentical(replay(start, withSkip, COARSE), replay(start, answered, COARSE), 'skip');
});

test('the first egg is scored on a surface centred on the literature values', () => {
  // Not on the prior's mean, which is close to them but not them: the app solves
  // with DEFAULT_PARAMS until an egg has taught it anything, and the first
  // surface has always been built around what it solved with.
  const r = solvedRecord(0.4, 'jammy');
  const q = gridRequestFor(freshCalibration(64, 7), r, calibrationGrid);
  assert.equal(q.spec.alphaMin, DEFAULT_PARAMS.alpha_m2s * 0.55);
});

test('an egg cooled in a bowl is scored in that bowl: its water and its temperature reach the fold', () => {
  const r = solvedRecord(0.4, 'jammy');
  const bowl = { ...r, setup: { ...r.setup, cooling: 'bowl' as const, bowlLitres: 0.75, coolingWater_C: 9 } };
  const q = gridRequestFor(freshCalibration(64, 7), bowl, calibrationGrid);
  assert.deepEqual([q.setup.cooling, q.setup.bowlLitres, q.setup.coolingWater_C], ['bowl', 0.75, 9]);
  const plain = gridRequestFor(freshCalibration(64, 7), r, calibrationGrid);
  assert.equal('bowlLitres' in plain.setup || 'coolingWater_C' in plain.setup, false, 'an ice bath carries neither');
});

test('an egg is scored at the pull when the cook said when, and at the schedule when not', () => {
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

test("a cold pan's water: a record without it replays as it was cooked, with the pan at the room", () => {
  const cold = { startMode: 'cold' as const, timeToBoil_s: 480 };
  const old = solvedRecord(0.41, 'soft', 62, cold);
  old.setup.timeToBoilFrom = 'measured';
  assert.equal('panStart_C' in old.setup, false);
  const read = parseRecord(JSON.parse(JSON.stringify(old)));
  assert.ok(read !== null, 'a record from before the field still reads');
  assert.equal('panStart_C' in (read as EggRecord).setup, false, 'and gains nothing');
  // Its pan said to be at the room it recorded is the same egg, to the bit.
  const atRoom: EggRecord = { ...old, setup: { ...old.setup, panStart_C: old.setup.ambient_C } };
  assert.equal(parseRecord(JSON.parse(JSON.stringify(atRoom)))?.setup.panStart_C, old.setup.ambient_C);
  assertIdentical(replay(freshCalibration(64, 7), [atRoom], COARSE), replay(freshCalibration(64, 7), [old], COARSE), 'at the room');
  // A colder pan is another egg: the same cook reads as more heat needed.
  const tap: EggRecord = { ...old, setup: { ...old.setup, panStart_C: 8 } };
  const a = replay(freshCalibration(64, 7), [tap], COARSE);
  const b = replay(freshCalibration(64, 7), [old], COARSE);
  assert.notEqual(posteriorParams(a.posterior).alpha_m2s, posteriorParams(b.posterior).alpha_m2s);
  // Sent, it is kept.
  assert.equal(sharedRecord(tap, 'abc').setup.panStart_C, 8);
  // On a hot start it is refused: nothing there reads it.
  const hot = solvedRecord(0.41, 'soft');
  assert.equal(parseRecord(JSON.parse(JSON.stringify({ ...hot, setup: { ...hot.setup, panStart_C: 8 } }))), null);
});

/* What the fold makes of a fixed log is written in fixtures/record.json
 * beside the LIKELIHOOD_ID it was made under, and tools/fixtures/record.ts
 * refuses to write a fold that moved under the same id: a change to the
 * prior's draw, the physics, the likelihood or the apps' grid moves
 * LIKELIHOOD_ID (and with it MODEL_ID, in both apps), so that every stored
 * posterior is replayed. Here, that the fixture was made under the code's
 * id. */
test('the likelihood id is the one the fixture\'s fold was made under', () => {
  const f = JSON.parse(readFileSync('fixtures/record.json', 'utf8')) as { likelihood: { id: string } };
  assert.equal(f.likelihood.id, LIKELIHOOD_ID, 'LIKELIHOOD_ID moved: npm run fixtures');
});

// --------------------------------------------------------------------------
// 5. The calibration grid: the bounds that decide the posterior
// --------------------------------------------------------------------------

test('the grid brackets the cook that was actually performed', () => {
  const g = calibrationGrid(1.4e-7, 441);
  assert.ok(g.alphaMin < 1.4e-7 && g.alphaMax > 1.4e-7, 'grid does not contain its centre');
  assert.ok(g.timeMin_s < 441 && g.timeMax_s > 441, 'grid does not contain the cook');
  assert.equal(g.alphaCount, 21);
  assert.equal(g.timeCount, 32);
});

test('a very short cook still gets a grid with a floor on it', () => {
  // 0.35 * 60 is 21 s, which is not a cook. The floor is what stops the
  // interpolation domain collapsing on a fast egg.
  const g = calibrationGrid(1.4e-7, 60);
  assert.ok(g.timeMin_s >= 60, `time floor collapsed to ${g.timeMin_s}`);
  assert.ok(g.timeMax_s > g.timeMin_s, 'grid has no width');
});

test('the grid scales with the cook rather than sitting at fixed seconds', () => {
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
