/**
 * The time never falls as the level rises (src/core/reach.ts): every slider
 * position the pan delivers, for four posteriors. A file of its own, since
 * it is the longest of the reach tests and node runs a file's tests one
 * after another.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createPrior, updatePosterior } from '../src/core/infer.ts';
import { type Egg, eggFromMass } from '../src/core/geometry.ts';
import type { CookSetup } from '../src/core/protocol.ts';
import { solveCookTime } from '../src/core/solve.ts';
import { CALIBRATION_SEED, type Calibration, calibrationDoneness, calibrationParams } from '../src/core/record.ts';
import { type OddsProfile, answerAt, decideAnswer, oddsProfile } from '../src/core/reach.ts';
import { gridFor, knowing } from '../tools/common.ts';
import { COUNTER, EGG, FRESH, PARTICLES, SETUP, WHITE_BOUND } from './profiles.ts';

/** Every slider position the pan delivers, from soft to hard, with the time the
 *  app gives there (held by the profile, as the apps hold it). Every
 *  hundredth: a level is held between its profile points' times, so the time
 *  can fall only between two levels in one gap between points, and the sweep
 *  takes every level in each gap. */
function timesAcross(c: Calibration, egg: Egg, setup: CookSetup): { profile: OddsProfile; times: [number, number][] } {
  const grid = gridFor(c, egg, setup);
  const profile = oddsProfile(c, egg, setup, grid);
  const times: [number, number][] = [];
  const lo = Math.round(profile.physicalSoftest * 100);
  const hi = Math.round(profile.physicalHardest * 100);
  for (let k = lo; k <= hi; k++) {
    const a = answerAt(c, egg, setup, k / 100, profile);
    const d = decideAnswer(c, egg, setup, grid, a.solution, a.level, profile, 0).decision;
    times.push([a.level, d.cookTime_s]);
  }
  return { profile, times };
}

function assertMonotone(name: string, profile: OddsProfile, times: [number, number][]): void {
  for (let i = 1; i < profile.points.length; i++) {
    assert.ok(profile.points[i].cookTime_s >= profile.points[i - 1].cookTime_s,
      `${name}: the profile's time falls at ${profile.points[i].level}`);
  }
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i][1] >= times[i - 1][1],
      `${name}: ${times[i - 1][1].toFixed(1)} s at ${times[i - 1][0]}, ${times[i][1].toFixed(1)} s at ${times[i][0]}`);
  }
}

test('the time never falls as the level rises: across the slider, for the owner\'s egg, a white-bound cook, a fresh install and a counter rest', () => {
  // The owner's egg (test/reachAnswer.test.ts): one egg, soft asked, the
  // white runny.
  const egg58 = eggFromMass(0.058);
  const post = createPrior(PARTICLES, CALIBRATION_SEED);
  const first: Calibration = { posterior: post, eggsLogged: 0 };
  const asked = solveCookTime(egg58, SETUP, calibrationParams(first), calibrationDoneness(first, 0.22));
  updatePosterior(post, gridFor(first, egg58, SETUP), asked.result.cookTime_s, 'soft', 'runny');
  const owners: Calibration = { posterior: post, eggsLogged: 1 };
  const cases: [string, Calibration, Egg, CookSetup][] = [
    ['the owner\'s egg', owners, egg58, SETUP],
    ['white-bound', WHITE_BOUND, EGG, SETUP],
    ['three eggs, counter', knowing({ particles: PARTICLES, eggsLogged: 3 }), EGG, COUNTER],
    ['fresh', FRESH, EGG, SETUP],
  ];
  let fresh: [number, number][] = [];
  for (const [name, c, egg, setup] of cases) {
    const { profile, times } = timesAcross(c, egg, setup);
    assert.ok(times.length > 10, `${name}: ${times.length} levels`);
    assertMonotone(name, profile, times);
    console.log(`# ${name}: ${times.filter((_, i) => i % 10 === 0).map(([l, t]) => `${l}:${t.toFixed(0)}`).join(' ')}`);
    if (c === FRESH) fresh = times;
  }
  // A fresh install is monotone as it was: the literature's times, held by
  // nothing, rise with the level by themselves. Each is solved here apart
  // from answerAt, so an answer for the wrong level is not compared with
  // itself.
  for (const [level, t] of fresh) {
    const solved = solveCookTime(EGG, SETUP, calibrationParams(FRESH), calibrationDoneness(FRESH, level));
    assert.equal(t, solved.result.cookTime_s, `fresh at ${level}`);
  }
});
