/**
 * The answer at a level (src/core/reach.ts): at the far left, for the owner's
 * egg, the time never falling as the level rises, the envelope's bounds, and
 * the one decided answer both apps show.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { decide } from '../src/core/decide.ts';
import { createPrior, updatePosterior } from '../src/core/infer.ts';
import { type Egg, eggFromMass } from '../src/core/geometry.ts';
import type { CookSetup } from '../src/core/protocol.ts';
import { logYolkTarget, solveCookTime } from '../src/core/solve.ts';
import { snapUp } from '../src/core/slider.ts';
import { CALIBRATION_SEED, type Calibration, calibrationDoneness, calibrationParams } from '../src/core/record.ts';
import { type OddsProfile, adviceWanted, envelopeBounds, answerAt, decideAnswer, oddsProfile } from '../src/core/reach.ts';
import { askedWord, certaintyAt } from '../src/core/certainty.ts';
import { predictOutcome } from '../src/core/outcome.ts';
import { mostLikelyShown, warningKey, whiteAtRisk } from '../src/core/wording.ts';
import { appSetup, gridFor, knowing } from '../tools/common.ts';
import { COUNTER, EGG, FRESH, PARTICLES, SETUP, WHITE_BOUND, point } from './profiles.ts';

test('10. the far left: the slider rests on the level the time and the bracket are for, and the bracket shows how far the white leans it', () => {
  // A cold start, as a fresh install has it: the white sets only from a
  // level above runny, so asked for runny, the slider goes there.
  const cold = appSetup({ startMode: 'cold' });
  const freshGrid = gridFor(FRESH, EGG, cold);
  const fresh = answerAt(FRESH, EGG, cold, 0, oddsProfile(FRESH, EGG, cold, freshGrid));
  assert.equal(fresh.verdict.kind, 'tooSoftForWhite');
  assert.ok(fresh.verdict.snapTo !== null && fresh.verdict.snapTo > 0);
  // Where both apps put the slider (the iOS thumb too, once the finger
  // lifts): the snapped level, which the solve is for.
  assert.equal(fresh.level, fresh.verdict.snapTo);
  assert.equal(fresh.level, snapUp(fresh.solution.softestLevel));
  assert.ok(fresh.solution.reachable);
  // Before the first egg no time is chosen, so nothing leans: the bracket's
  // middle is the thumb.
  const fd = decide(FRESH, freshGrid, fresh.solution, logYolkTarget(fresh.level));
  assert.equal(fd.chosen, false);
  const fo = predictOutcome(FRESH.posterior, freshGrid, fd.cookTime_s, logYolkTarget(fresh.level));
  console.log(`# fresh, cold, asked 0: slider at ${fresh.level}, bracket ${fo.levelLow.toFixed(3)}/${fo.levelMedian.toFixed(3)}/${fo.levelHigh.toFixed(3)}, runny white ${fo.pWhiteRunny.toFixed(2)}`);
  assert.ok(Math.abs(fo.levelMedian - fresh.level) < 0.02, `median ${fo.levelMedian}`);
  assert.ok(fo.levelLow <= fresh.level && fresh.level <= fo.levelHigh);
  assert.ok(whiteAtRisk(fo), 'and the white has its line');

  // After eggs the time is chosen, and at the soft end the white leans it
  // later, because a runny white costs three. The bracket's middle sits right
  // of the thumb by what that costs the yolk.
  const c = knowing({ particles: PARTICLES, eggsLogged: 3 });
  const grid = gridFor(c, EGG, cold);
  const coldProfile = oddsProfile(c, EGG, cold, grid);
  const a = answerAt(c, EGG, cold, 0, coldProfile);
  assert.equal(a.level, a.verdict.snapTo ?? 0);
  const target = logYolkTarget(a.level);
  const d = decide(c, grid, a.solution, target, envelopeBounds(coldProfile, a.level));
  const o = predictOutcome(c.posterior, grid, d.cookTime_s, target);
  const unleaned = predictOutcome(c.posterior, grid, d.meanCookTime_s, target);
  console.log(`# three eggs, cold, asked 0: slider at ${a.level} (${a.verdict.kind}), ${d.meanCookTime_s.toFixed(0)} s -> ${d.cookTime_s.toFixed(0)} s, bracket ${o.levelLow.toFixed(3)}/${o.levelMedian.toFixed(3)}/${o.levelHigh.toFixed(3)}; unleaned middle ${unleaned.levelMedian.toFixed(3)}; runny white ${unleaned.pWhiteRunny.toFixed(2)} -> ${o.pWhiteRunny.toFixed(2)}`);
  assert.ok(d.chosen && d.cookTime_s > d.meanCookTime_s, 'the white leans the time later');
  assert.ok(unleaned.pWhiteRunny > o.pWhiteRunny, 'to keep the white from running');
  assert.ok(Math.abs(unleaned.levelMedian - a.level) < 0.03, 'unleaned, the middle is the thumb');
  assert.ok(o.levelMedian > a.level + 0.03, `the lean moves it right: ${o.levelMedian}`);
  assert.equal(o.lean, 'firm');
});

test('11. the owner\'s egg: 58 g from the fridge into boiling water and an ice bath, after a little learned, goes to soft and says what it will likely be', () => {
  // One egg: soft asked, the yolk soft and the white runny, as on the
  // owner's phone (5 October 2026), where it put 3/10 at jammy. Soft is a
  // ballpark there and is not dotted: soft or a
  // neighbour 9 times in 10, and most likely jammy, which the line says.
  const egg = eggFromMass(0.058);
  const post = createPrior(PARTICLES, CALIBRATION_SEED);
  const first: Calibration = { posterior: post, eggsLogged: 0 };
  const asked = solveCookTime(egg, SETUP, calibrationParams(first), calibrationDoneness(first, 0.22));
  updatePosterior(post, gridFor(first, egg, SETUP), asked.result.cookTime_s, 'soft', 'runny');
  const c: Calibration = { posterior: post, eggsLogged: 1 };
  const grid = gridFor(c, egg, SETUP);
  const p = oddsProfile(c, egg, SETUP, grid);
  const soft = 0.22;
  const a = answerAt(c, egg, SETUP, soft, p);
  const jammy = answerAt(c, egg, SETUP, 0.41, p);
  const own = decide(c, grid, a.solution, logYolkTarget(a.level));
  const d = decide(c, grid, a.solution, logYolkTarget(a.level), envelopeBounds(p, a.level));
  const o = predictOutcome(c.posterior, grid, d.cookTime_s, logYolkTarget(a.level));
  const ownJammy = decide(c, grid, jammy.solution, logYolkTarget(jammy.level));
  const dj = decide(c, grid, jammy.solution, logYolkTarget(jammy.level), envelopeBounds(p, jammy.level));
  const sure = decideAnswer(c, egg, SETUP, grid, a.solution, a.level, p, 0).certainty.words;
  console.log(`# 58 g, fridge, boiling, ice, one egg: physical ${p.physicalSoftest}, surer than a guess from ${p.softest}; soft ${d.oddsTenths}/10 at ${d.cookTime_s.toFixed(0)} s (its own choice ${own.cookTime_s.toFixed(0)} s), bracket ${o.levelLow.toFixed(2)}-${o.levelHigh.toFixed(2)}, ${sure.certainty}, most likely ${sure.mostLikely}; jammy ${dj.oddsTenths}/10 at ${dj.cookTime_s.toFixed(0)} s (its own ${ownJammy.cookTime_s.toFixed(0)} s)`);
  // Soft's own choice, against its own target, is later than jammy's: the
  // white's weight. The envelope gives it no later than jammy's
  // and jammy, which nothing firmer undercuts, keeps its own.
  assert.ok(own.cookTime_s > ownJammy.cookTime_s + 15, 'unheld, soft would be the firmer egg');
  assert.ok(d.cookTime_s <= dj.cookTime_s, `soft ${d.cookTime_s} against jammy ${dj.cookTime_s}`);
  assert.equal(dj.cookTime_s, ownJammy.cookTime_s);
  assert.ok(p.physicalSoftest <= soft);
  assert.equal(a.verdict.kind, 'none');
  assert.equal(a.level, soft, 'the slider stays at soft');
  assert.equal(sure.certainty, 'ballpark');
  assert.equal(a.lowOdds, false, 'a ballpark is not dotted');
  assert.equal(warningKey(a.verdict, a.lowOdds, 'ice'), null);
  // The answer is for soft: its mean solve is sooner than jammy's. After a
  // runny white the time is jammy's, and the bracket and "most likely" say
  // where that puts the yolk.
  assert.ok(a.solution.result.cookTime_s < jammy.solution.result.cookTime_s, 'the solve is for soft');
  assert.equal(o.lean, 'firm');
  assert.ok(o.levelMedian > soft);
  assert.equal(sure.mostLikely, askedWord(0.41), 'most likely jammy');
  assert.equal(mostLikelyShown(sure), true);
});

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

test('12. the time never falls as the level rises: across the slider, for the owner\'s egg, a white-bound cook, a fresh install and a counter rest', () => {
  // The owner's egg (test 11): one egg, soft asked, the white runny.
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
  // nothing, rise with the level by themselves.
  for (const [level, t] of fresh) {
    const sol = solveCookTime(EGG, SETUP, calibrationParams(FRESH), calibrationDoneness(FRESH, level));
    assert.equal(t, sol.result.cookTime_s, `fresh at ${level}`);
  }
});

test('13. the envelope\'s bounds: a point holds its own time, a level between two is held between theirs, and nothing holds a level with no profile', () => {
  const p: OddsProfile = {
    points: [point(0.2, 400, 0.1), point(0.25, 410, 0.3), point(0.3, 430, 0.5)],
    best: 0.5, bestAsked: 0.5, physicalSoftest: 0.2, physicalHardest: 0.3, softest: 0.25, hardest: 0.3,
  };
  assert.deepEqual(envelopeBounds(p, 0.25), { lo_s: 410, hi_s: 410 });
  assert.deepEqual(envelopeBounds(p, 0.27), { lo_s: 410, hi_s: 430 });
  assert.deepEqual(envelopeBounds(p, 0.29 + 1e-12), { lo_s: 410, hi_s: 430 });
  assert.deepEqual(envelopeBounds(p, 0.3 - 1e-12), { lo_s: 430, hi_s: 430 }, 'a hundredth not held exactly is still the point');
  assert.deepEqual(envelopeBounds(p, 0.1), { lo_s: 0, hi_s: 400 });
  assert.deepEqual(envelopeBounds(p, 0.4), { lo_s: 430, hi_s: Number.POSITIVE_INFINITY });
  assert.equal(envelopeBounds(null, 0.25), null);
  assert.equal(envelopeBounds({ ...p, points: [] }, 0.25), null);
});

test('14. one decided answer for both apps: the soft yolk chosen again and held under jammy\'s time, the nudge where a time is chosen, and no advice where the white never sets', () => {
  // The owner's egg (test 11).
  const egg = eggFromMass(0.058);
  const post = createPrior(PARTICLES, CALIBRATION_SEED);
  const first: Calibration = { posterior: post, eggsLogged: 0 };
  const asked = solveCookTime(egg, SETUP, calibrationParams(first), calibrationDoneness(first, 0.22));
  updatePosterior(post, gridFor(first, egg, SETUP), asked.result.cookTime_s, 'soft', 'runny');
  const c: Calibration = { posterior: post, eggsLogged: 1 };
  const grid = gridFor(c, egg, SETUP);
  const p = oddsProfile(c, egg, SETUP, grid);
  const soft = answerAt(c, egg, SETUP, 0.22, p);
  const jammy = answerAt(c, egg, SETUP, 0.41, p);
  const d = decideAnswer(c, egg, SETUP, grid, soft.solution, soft.level, p, 0);
  const dj = decideAnswer(c, egg, SETUP, grid, jammy.solution, jammy.level, p, 0);
  // Soft is decided at soft, not moved: a ballpark, and not dotted.
  assert.equal(soft.lowOdds, false);
  assert.equal(d.level, 0.22);
  assert.equal(d.certainty.words.certainty, 'ballpark');
  // Its own choice is later than jammy's; the time it is
  // given is not.
  const own = decide(c, grid, soft.solution, logYolkTarget(0.22));
  assert.ok(own.cookTime_s > dj.decision.cookTime_s, 'unheld, soft would be the firmer egg');
  assert.ok(d.decision.cookTime_s <= dj.decision.cookTime_s, `${d.decision.cookTime_s} against ${dj.decision.cookTime_s}`);
  // Without the profile, the level keeps its own choice.
  assert.equal(decideAnswer(c, egg, SETUP, grid, soft.solution, soft.level, null, 0).decision.cookTime_s, own.cookTime_s);
  // The solve and the outcome are at the time given; advice is looked for
  // as the certainty there says: a ballpark, so not.
  assert.equal(d.nudge_s, 0);
  assert.equal(d.solution.result.cookTime_s, d.decision.cookTime_s);
  assert.equal(d.solution.whiteSets, soft.solution.whiteSets);
  assert.deepEqual(d.outcome, predictOutcome(c.posterior, grid, d.decision.cookTime_s, logYolkTarget(0.22)));
  assert.equal(d.adviceWanted, adviceWanted(d.certainty.words.certainty));
  assert.equal(d.adviceWanted, false, `${d.certainty.words.certainty} at soft`);
  // Nudged: the decision is the same, and the time shown, the solve and the
  // outcome move with the nudge.
  const n = decideAnswer(c, egg, SETUP, grid, soft.solution, soft.level, p, -7);
  assert.deepEqual(n.decision, d.decision);
  assert.equal(n.nudge_s, -7);
  assert.equal(n.solution.result.cookTime_s, d.decision.cookTime_s - 7);
  assert.deepEqual(n.outcome, predictOutcome(c.posterior, grid, d.decision.cookTime_s - 7, logYolkTarget(0.22)));
  // And the certainty is read at the time shown, for the level decided.
  assert.deepEqual(d.certainty, certaintyAt(c.posterior, grid, d.decision.cookTime_s, 0.22));
  assert.deepEqual(n.certainty, certaintyAt(c.posterior, grid, d.decision.cookTime_s - 7, 0.22));

  // The heat off under a third of a litre and twelve eggs: the white never
  // sets, so the mean solve's time stands, unnudged, with no advice.
  const never = appSetup({ eggCount: 12, afterBoil: 'off', waterLitres: 0.3 });
  const learned = knowing({ particles: PARTICLES, eggsLogged: 3 });
  const neverGrid = gridFor(learned, EGG, never);
  const a = answerAt(learned, EGG, never, 0.41, null);
  assert.equal(a.solution.whiteSets, false);
  const dn = decideAnswer(learned, EGG, never, neverGrid, a.solution, a.level, null, -7);
  assert.equal(dn.decision.chosen, false);
  assert.equal(dn.nudge_s, 0);
  assert.equal(dn.solution, a.solution);
  assert.equal(dn.adviceWanted, false);
});
