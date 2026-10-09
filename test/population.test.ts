/**
 * The population a prior is drawn from (E7; src/core/population.ts): the
 * literature's is the default prior, a fitted one moves where a new cook
 * starts, and a posterior drawn from one population is replayed from the
 * next (src/ui/calibrationStore.ts).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { LITERATURE_POPULATION, Population, createPrior } from '../src/core/infer.js';
import { parsePopulation, priorStart } from '../src/core/population.js';
import { CALIBRATION_SEED, calibrationDoneness, calibrationParams, freshCalibration } from '../src/core/record.js';
import { DEFAULT_PARAMS, WHITE_DOSE_TARGET, donenessFromSlider } from '../src/core/solve.js';
import { decodeKept, encodeKept } from '../src/ui/calibrationStore.js';
import { recordAt } from '../tools/common.js';

const SHIFTED: Population = {
  id: 'test-shifted',
  alpha_m2s: { median: 1.81e-7, logSd: 0.071 },
  logDoseOffset: { mean: 0.0, sd: 0.13 },
  noise: { median: 0.17, logSd: 0.42 },
  whiteOffset: { mean: 0.21, sd: 0.33 },
  whiteFirmGap: { median: 0.97, logSd: 0.31 },
};

test('1. the published file reads, and the literature is the default prior', () => {
  const published = parsePopulation(JSON.parse(readFileSync('fixtures/population.json', 'utf8')));
  assert.notEqual(published, null);
  const a = createPrior(200, CALIBRATION_SEED);
  const b = createPrior(200, CALIBRATION_SEED, LITERATURE_POPULATION);
  assert.deepEqual(a, b);
  assert.deepEqual(priorStart(LITERATURE_POPULATION), { alpha_m2s: DEFAULT_PARAMS.alpha_m2s, whiteOffset: 0 });
  const c = freshCalibration(64, 7);
  assert.deepEqual(calibrationParams(c), DEFAULT_PARAMS, 'before any egg, the literature values');
  assert.deepEqual(calibrationDoneness(c, 0.22), donenessFromSlider(0.22));
});

test('1b. a population file from before 0.5, with a spread for the carryover, reads as one without', () => {
  // The web may hold an old file in its cache (DECISIONS.md 95).
  const file = { id: 'x', prior: { ...SHIFTED, id: undefined } };
  const old = { id: 'x', prior: { ...SHIFTED, id: undefined, tauAirScale: { median: 1.12, logSd: 0.3 } } };
  assert.deepEqual(parsePopulation(old), parsePopulation(file));
  assert.notEqual(parsePopulation(old), null);
});

test('2. a fitted population moves the prior and where a new cook starts', () => {
  const c = freshCalibration(4000, 11, SHIFTED);
  assert.deepEqual(c.start, priorStart(SHIFTED));
  // The carryover stays at the physics whatever the population (DECISIONS.md 95).
  assert.deepEqual(calibrationParams(c), { alpha_m2s: 1.81e-7 });
  assert.equal(calibrationDoneness(c, 0.22).whiteDose_min, WHITE_DOSE_TARGET * 10 ** 0.21);
  // The particles are drawn from it: the medians and spreads come back.
  const logs = c.posterior.particles.map((p) => Math.log(p.alpha_m2s));
  const mean = logs.reduce((s, x) => s + x, 0) / logs.length;
  const sd = Math.sqrt(logs.reduce((s, x) => s + (x - mean) ** 2, 0) / logs.length);
  assert.ok(Math.abs(Math.exp(mean) / 1.81e-7 - 1) < 0.01);
  assert.ok(Math.abs(sd - 0.071) < 0.004);
  const white = c.posterior.particles.map((p) => p.whiteOffset);
  assert.ok(Math.abs(white.reduce((s, x) => s + x, 0) / white.length - 0.21) < 0.02);
});

test('3. a reader refuses a population it cannot trust', () => {
  const file = { id: 'x', prior: { ...SHIFTED, id: undefined } };
  assert.notEqual(parsePopulation(file), null);
  for (const spoil of [
    (f: Record<string, unknown>) => { f['id'] = ''; },
    (f: Record<string, unknown>) => { (f['prior'] as Record<string, unknown>)['noise'] = { median: 0.2, logSd: 0 }; },
    (f: Record<string, unknown>) => { (f['prior'] as Record<string, unknown>)['whiteOffset'] = { mean: Number.NaN, sd: 1 }; },
    (f: Record<string, unknown>) => { delete f['prior']; },
  ]) {
    const f = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    spoil(f);
    assert.equal(parsePopulation(f), null);
  }
});

test('4. a posterior from another population is replayed; one from this one is kept', () => {
  const log = [recordAt(0.41, 470, 'jammy', 'tender')];
  const kept = { base: null, calibration: freshCalibration(64, 3), folded: 1, log: log };
  kept.calibration.eggsLogged = 1;
  // Stored under the literature, read under it: kept as it is.
  const raw = encodeKept(kept, LITERATURE_POPULATION);
  const same = decodeKept(raw, LITERATURE_POPULATION);
  assert.equal(same.path, 'loaded');
  assert.deepEqual(same.kept.calibration.start, priorStart(LITERATURE_POPULATION));
  // Read under a new population: the log is folded again from its prior.
  const moved = decodeKept(raw, SHIFTED);
  assert.equal(moved.path, 'rebuild');
  assert.equal(moved.kept.folded, 0);
  assert.equal(moved.kept.log.length, 1);
  assert.equal(moved.kept.calibration.eggsLogged, 0);
  assert.deepEqual(moved.kept.calibration.start, priorStart(SHIFTED));
  // A store that names no population is replayed, whichever this page has.
  const none = JSON.parse(raw) as Record<string, unknown>;
  delete none['p'];
  assert.equal(decodeKept(JSON.stringify(none), LITERATURE_POPULATION).path, 'rebuild');
  assert.equal(decodeKept(JSON.stringify(none), SHIFTED).path, 'rebuild');
});

test('5. a store folded under another model is replayed, and its base kept as it is', () => {
  // A base cannot be replayed. The counter's carryover is no column of the
  // store: it is the physics' for every particle (DECISIONS.md 95).
  const log = [recordAt(0.41, 470, 'jammy', 'tender')];
  const base = freshCalibration(64, 5);
  base.eggsLogged = 2;
  const kept = { base: base, calibration: freshCalibration(64, 3), folded: 1, log: log };
  kept.calibration.eggsLogged = 3;
  const text = encodeKept(kept, LITERATURE_POPULATION, '2026-10-e9');
  const stored = JSON.parse(text) as Record<string, Record<string, number[]>>;
  assert.deepEqual(Object.keys(stored['cal']).sort(), ['a', 'n', 'o', 'rng', 'sd', 'w', 'wg', 'wo']);
  const read = decodeKept(text, LITERATURE_POPULATION);
  assert.equal(read.path, 'rebuild');
  assert.equal(read.kept.log.length, 1);
  assert.notEqual(read.kept.base, null);
  assert.deepEqual(read.kept.base?.posterior.particles, base.posterior.particles);
  assert.equal(read.kept.base?.eggsLogged, 2);
});
