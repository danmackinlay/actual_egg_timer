/**
 * The answer at a level (src/core/reach.ts): at the far left, for the owner's
 * egg, the envelope's bounds, the one decided answer both apps show, and a
 * counter rest whose 9 in 10 is a neighbouring word's alone, which is a wild
 * guess. That the time never falls as the level rises is
 * test/reachMonotone.test.ts.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { decide } from '../src/core/decide.ts';
import { createPrior, updatePosterior } from '../src/core/infer.ts';
import { eggFromMass } from '../src/core/geometry.ts';
import { logYolkTarget, solveCookTime } from '../src/core/solve.ts';
import { snapUp } from '../src/core/slider.ts';
import {
  CALIBRATION_SEED, type Calibration, type EggRecord, calibrationDoneness, calibrationParams, replay,
} from '../src/core/record.ts';
import { type OddsProfile, adviceWanted, envelopeBounds, answerAt, decideAnswer, oddsProfile } from '../src/core/reach.ts';
import { askedWord, certaintyAt } from '../src/core/certainty.ts';
import { predictOutcome } from '../src/core/outcome.ts';
import { mostLikelyShown, warningKey, whiteAtRisk } from '../src/core/wording.ts';
import { appSetup, gridFor, knowing, recordAt } from '../tools/common.ts';
import { COARSE, PRIOR } from './decisions.ts';
import { EGG, FRESH, PARTICLES, SETUP, point } from './profiles.ts';

test('the far left: the slider rests on the level the time and the bracket are for, and the bracket shows how far the white leans it', () => {
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

test('the owner\'s egg: 58 g from the fridge into boiling water and an ice bath, after a little learned, goes to soft and says what it will likely be', () => {
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

test('the envelope\'s bounds: a point holds its own time, a level between two is held between theirs, and nothing holds a level with no profile', () => {
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

test('one decided answer for both apps: the soft yolk chosen again and held under jammy\'s time, the nudge where a time is chosen, and no advice where the white never sets', () => {
  // The owner's egg (above).
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

test('a counter rest after three eggs: nine times in ten Fudgy, where the slider can only rest at Jammy\'s edge, is a wild guess, not a ballpark', () => {
  // A 60 g egg from the fridge into boiling water, the heat on, rested on
  // the counter. Three eggs cooked at a fresh install's jammy, each yolk
  // called soft and the white not answered, folded as the apps fold them.
  // Every level up to 0.51 snaps to 0.51, the last of Jammy, and there
  // Fudgy alone holds 9 in 10: a neighbour of the word asked carries the
  // mass, and the word asked is outside the interval the tap shows.
  const egg = eggFromMass(0.060);
  const counter = appSetup({ cooling: 'counter' });
  const fresh = answerAt(PRIOR, egg, counter, 0.41, null);
  const r: EggRecord = {
    ...recordAt(fresh.level, fresh.solution.result.cookTime_s, 'soft', null, counter),
    egg: { mass_g: 60, massFrom: 'scale', sizeTable: 'eu' },
  };
  const c = replay(PRIOR, [r, r, r], COARSE);
  const grid = gridFor(c, egg, counter);
  const p = oddsProfile(c, egg, counter, grid);
  for (const level of [0, 0.11, 0.22, 0.3, 0.41, 0.5, 0.51]) {
    const a = answerAt(c, egg, counter, level, p);
    assert.equal(a.level, 0.51, `asked ${level}`);
    const w = decideAnswer(c, egg, counter, grid, a.solution, a.level, p, 0).certainty.words;
    const what = `asked ${level}: P(Jammy) ${w.pAsked.toFixed(3)}, with neighbours ${w.pNear.toFixed(3)}, 90% ${w.from}-${w.to}`;
    assert.equal(w.asked, 2, what);
    assert.deepEqual([w.from, w.to, w.mostLikely], [3, 3, 3], `${what}: 9 times in 10, Fudgy`);
    assert.ok(w.pNear >= 0.9 && w.pAsked < 0.05, `${what}: the neighbour carries it`);
    assert.equal(w.certainty, 'wildGuess', what);
  }
});
