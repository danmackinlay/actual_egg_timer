/**
 * What the record tests share (test/record*.test.ts): localStorage in memory,
 * a realistic record, and the check that two calibrations are bit-identical.
 */

import assert from 'node:assert/strict';

import type { GridSpec } from '../src/core/doseGrid.js';
import { type Calibration, type EggRecord, MODEL_ID, calibrationGrid, recordMass_g } from '../src/core/record.js';
import { LITERATURE_POPULATION, type YolkWord } from '../src/core/infer.js';
import { eggFromMass } from '../src/core/geometry.js';
import { DEFAULT_PARAMS, donenessFromSlider, solveCookTime } from '../src/core/solve.js';
import type { CookSetup } from '../src/core/protocol.js';
import { APP_VERSION } from '../src/ui/version.js';
import { appSetup } from '../tools/common.js';

/** localStorage, in memory. The store module reads `window.localStorage` at call
 *  time, inside a try, so this is all a test needs to give it one. */
export const storage = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); },
    removeItem: (k: string) => { storage.delete(k); },
  },
};

export const COARSE = (alphaCentre: number, cookTime_s: number): GridSpec => ({
  ...calibrationGrid(alphaCentre, cookTime_s), alphaCount: 7, timeCount: 9,
});

/** A realistic record: the time is what the solver says for this egg. */
export function solvedRecord(
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
export function assertIdentical(a: Calibration, b: Calibration, label: string): void {
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
