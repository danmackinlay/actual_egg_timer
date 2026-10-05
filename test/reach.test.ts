/**
 * The odds at every level, the range they allow, the shading and the advice
 * (src/core/reach.ts).
 *
 * The claims: a profile point IS the odds the app computes at that level, so the
 * two cannot disagree; a fresh install is warned of nothing; once an egg has
 * taught something the range at 3/10 or better is found on the slider's own
 * grid, never outside the physical limits, and a level outside it stays where
 * it was asked and is warned of; when nothing reaches 3/10 nothing is warned
 * of; a counter rest asked for soft is refused for the physical reason and
 * lands on the physical edge, warned of if its odds are low; at the far left
 * the slider rests on the level the time and the bracket are for, whose
 * middle leaves the thumb only by the lean the white asks for once a time is
 * chosen; the owner's own egg goes to soft and says so; and the time never
 * falls as the level rises (DECISIONS.md 84). Only the stripes move the
 * slider (DECISIONS.md 83).
 *
 * The fixture (`fixtures/reach.json`) pins the arithmetic for the Swift port.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { decide, oddsInTenths } from '../src/core/decide.js';
import { DoseGrid } from '../src/core/doseGrid.js';
import { createPrior, updatePosterior } from '../src/core/infer.js';
import { Egg, eggFromMass } from '../src/core/geometry.js';
import { CookSetup } from '../src/core/protocol.js';
import { Solution, logYolkTarget, solveCookTime } from '../src/core/solve.js';
import { CALIBRATION_SEED, anchorNear, snapUp, verdictFor } from '../src/core/policy.js';
import { Calibration, calibrationDoneness, calibrationParams } from '../src/core/record.js';
import {
  ADVICE_BELOW_TENTHS, AdviceFacts, OddsProfile, REACH_ODDS, adviceWanted, envelopeBounds, lowOddsAt, oddsAtLevel, oddsNear,
  answerAt, oddsProfile, pricedChanges, protocolAdvice, shadingOf, unpricedAdvice,
} from '../src/core/reach.js';
import { predictOutcome } from '../src/core/outcome.js';
import { directionKey, warningKey, whiteAtRisk } from '../src/core/wording.js';
import { appSetup, gridFor, knowing } from '../tools/common.js';

const EGG = eggFromMass(0.068);

const SETUP = appSetup();
const COUNTER = appSetup({ cooling: 'counter' });
const PARTICLES = 400;

/** What the app does at a level, verdict and snap and warning and all, with
 *  the profile or without it: the time held by the profile's envelope, as the
 *  apps hold it. */
function appAt(c: Calibration, grid: DoseGrid, setup: CookSetup, level: number, profile: OddsProfile | null) {
  const a = answerAt(c, EGG, setup, level, profile, true);
  return {
    verdict: a.verdict, level: a.level, lowOdds: a.lowOdds,
    decision: decide(c, grid, a.solution, logYolkTarget(a.level), envelopeBounds(profile, a.level)),
  };
}

const FRESH: Calibration = { posterior: createPrior(PARTICLES, CALIBRATION_SEED), eggsLogged: 0 };
/** A cook whose white needs 0.4 decades more than the literature's: the soft
 *  end is white-bound and its odds fall. */
const WHITE_BOUND = knowing({ particles: PARTICLES, eggsLogged: 4, white: 0.4 });

test('1. a profile point is the odds the app shows at that level', () => {
  const grid = gridFor(WHITE_BOUND, EGG, SETUP);
  const p = oddsProfile(WHITE_BOUND, EGG, SETUP, grid);
  assert.ok(p.points.length >= 21, `${p.points.length} points`);
  for (let i = 1; i < p.points.length; i++) assert.ok(p.points[i].level > p.points[i - 1].level);
  for (const point of p.points) {
    const d = appAt(WHITE_BOUND, grid, SETUP, point.level, p).decision;
    assert.equal(d.odds, point.odds, `level ${point.level}`);
    assert.equal(d.cookTime_s, point.cookTime_s, `level ${point.level}`);
    assert.equal(oddsAtLevel(WHITE_BOUND, EGG, SETUP, grid, point.level, p), point.odds);
  }
  assert.equal(p.best, Math.max(...p.points.map((q) => q.odds)));
});

test('2. a fresh install is warned of nothing, at any level', () => {
  for (const setup of [SETUP, COUNTER]) {
    const grid = gridFor(FRESH, EGG, setup);
    const p = oddsProfile(FRESH, EGG, setup, grid);
    assert.equal(p.softest, null);
    assert.equal(p.hardest, null);
    assert.ok(p.best > 0.1 && p.best < REACH_ODDS + 0.05, `best ${p.best}`);
    for (const level of [0, 0.22, 0.41, 0.62, 1]) {
      const a = answerAt(FRESH, EGG, setup, level, p, true);
      const sol = solveCookTime(EGG, setup, calibrationParams(FRESH), calibrationDoneness(FRESH, level));
      assert.deepEqual(a.verdict, verdictFor(sol, level));
      assert.equal(a.lowOdds, false, `level ${level}`);
    }
    // And still shaded, relative to the best level.
    const shades = shadingOf(p);
    assert.equal(shades.length, p.points.length);
    assert.equal(Math.max(...shades.map((s) => s.strength)), 1);
  }
});

test('3. after eggs, the range at 3/10 or better is on the slider\'s grid, and outside it the slider stays and warns', () => {
  const grid = gridFor(WHITE_BOUND, EGG, SETUP);
  const p = oddsProfile(WHITE_BOUND, EGG, SETUP, grid);
  assert.ok(p.softest !== null && p.hardest !== null);
  const softest = p.softest as number;
  const hardest = p.hardest as number;
  console.log(`# white-bound cook: physical ${p.physicalSoftest}-${p.physicalHardest}, 3/10 or better ${softest}-${hardest}, best ${oddsInTenths(p.best)}/10`);
  assert.ok(softest > p.physicalSoftest, 'the odds are low at the soft end here');
  assert.ok(softest >= p.physicalSoftest && hardest <= p.physicalHardest, 'never outside the physical limits');
  assert.equal(Math.round(softest * 100) / 100, softest);
  assert.ok(oddsAtLevel(WHITE_BOUND, EGG, SETUP, grid, softest, p) >= REACH_ODDS);
  assert.ok(oddsAtLevel(WHITE_BOUND, EGG, SETUP, grid, softest - 0.01, p) < REACH_ODDS);
  if (hardest < p.physicalHardest) {
    assert.ok(oddsAtLevel(WHITE_BOUND, EGG, SETUP, grid, hardest + 0.01, p) < REACH_ODDS);
  }
  // Asked for a level the pan delivers but under 3/10: the slider stays, the
  // answer is for that level, and it is warned of.
  for (const level of [p.physicalSoftest, softest - 0.01]) {
    const a = appAt(WHITE_BOUND, grid, SETUP, level, p);
    assert.equal(a.verdict.kind, 'none', `asked ${level}`);
    assert.equal(a.level, level, `asked ${level}`);
    assert.equal(a.lowOdds, true, `asked ${level}`);
    assert.ok(a.decision.odds < REACH_ODDS, `asked ${level}: ${a.decision.odds}`);
    assert.equal(warningKey(a.verdict, a.lowOdds, 'ice')?.key, 'warn.lowOdds');
  }
  // Asked for less than the pan delivers: refused, and moved to the physical
  // edge, not to the odds' - where it is warned of too.
  const stripes = appAt(WHITE_BOUND, grid, SETUP, 0, p);
  assert.equal(stripes.verdict.kind, 'tooSoftForWhite');
  assert.equal(stripes.level, p.physicalSoftest);
  assert.equal(stripes.lowOdds, true);
  // Inside the range nothing moves, and nothing is said.
  for (const level of [softest, 0.62]) {
    const inside = appAt(WHITE_BOUND, grid, SETUP, level, p);
    assert.equal(inside.verdict.kind, 'none');
    assert.equal(inside.level, level);
    assert.equal(inside.lowOdds, false);
    assert.equal(warningKey(inside.verdict, inside.lowOdds, 'ice'), null);
  }
});

test('4. when no level reaches 3/10, nothing is warned of', () => {
  // The prior's spread, after an egg that taught nothing that narrowed it.
  const unsure: Calibration = { posterior: createPrior(PARTICLES, CALIBRATION_SEED), eggsLogged: 1 };
  const grid = gridFor(unsure, EGG, SETUP);
  const p = oddsProfile(unsure, EGG, SETUP, grid);
  assert.ok(p.best < REACH_ODDS, `best ${p.best}`);
  assert.equal(p.softest, null);
  assert.equal(p.hardest, null);
  for (const level of [0, 0.22, 1]) {
    const a = answerAt(unsure, EGG, SETUP, level, p, true);
    const sol = solveCookTime(EGG, SETUP, calibrationParams(unsure), calibrationDoneness(unsure, level));
    assert.deepEqual(a.verdict, verdictFor(sol, level));
    assert.equal(a.lowOdds, false);
  }
});

test('5. a counter rest asked for soft: refused for the physical reason, landed on the physical edge, and warned of if the odds there are low', () => {
  const c = knowing({ particles: PARTICLES, eggsLogged: 4, white: 0.1 });
  const grid = gridFor(c, EGG, COUNTER);
  const p = oddsProfile(c, EGG, COUNTER, grid);
  assert.ok(p.softest !== null);
  const a = appAt(c, grid, COUNTER, 0.22, p);
  console.log(`# counter, soft asked: physical ${p.physicalSoftest}, 3/10 from ${p.softest}, landed ${a.level} at ${a.decision.oddsTenths}/10 (${a.verdict.kind}, "${a.verdict.limit.key}", low odds ${a.lowOdds})`);
  assert.equal(a.verdict.kind, 'tooSoftForWhite');
  assert.equal(a.level, snapUp(p.physicalSoftest));
  assert.equal(a.verdict.limit.key, anchorNear(a.level).key);
  assert.equal(a.lowOdds, a.level < (p.softest as number));
  // The refusal is said, when it is worth saying, before the warning.
  const key = warningKey(a.verdict, a.lowOdds, 'counter')?.key ?? null;
  assert.equal(key, a.verdict.worthSaying ? 'refusal.counter' : a.lowOdds ? 'warn.lowOdds' : null);
});

test('6. the warning and the verdict, on hand-made ranges', () => {
  const profile: OddsProfile = {
    points: [], best: 0.6, physicalSoftest: 0.1, physicalHardest: 0.9, softest: 0.3, hardest: 0.8,
  };
  const base = {
    result: {
      cookTime_s: 400, peakYolk_C: 65, peakYolkTime_s: 500, yolkAtPull_C: 60, yolkDose_min: 1,
      whiteDose_min: 1, peakWhite_C: 80,
    },
    minCookTime_s: 300, softestLevel: 0.1, hardestLevel: 0.9,
  };
  const reachable: Solution = { ...base, reachable: true, whiteSets: true };
  const tooSoft: Solution = { ...base, reachable: false, whiteSets: true };

  // The ends of the range are not warned of; past them, at either end, is.
  assert.deepEqual(
    [0.1, 0.2, 0.29, 0.3, 0.5, 0.8, 0.81, 0.9].map((level) => lowOddsAt(profile, level)),
    [true, true, true, false, false, false, true, true],
  );
  // Nothing is warned of with no profile, or one with no range.
  assert.equal(lowOddsAt(null, 0.2), false);
  assert.equal(lowOddsAt({ ...profile, softest: null, hardest: null }, 0.2), false);

  // The verdict is the pan's alone: a deliverable level under 3/10 is not
  // refused, and a level too soft for the white goes to the physical edge.
  assert.equal(verdictFor(reachable, 0.2).kind, 'none');
  assert.equal(verdictFor(reachable, 0.2).snapTo, null);
  assert.equal(verdictFor(tooSoft, 0.05).snapTo, 0.1);

  // The words: the refusal when worth saying, else the warning, else nothing.
  const none = verdictFor(reachable, 0.2);
  assert.deepEqual(warningKey(none, true, 'ice'), { key: 'warn.lowOdds', args: { hits: 3, of: 10 } });
  assert.equal(warningKey(none, false, 'ice'), null);
  const refused = verdictFor(tooSoft, 0.05);
  assert.equal(refused.worthSaying, false, 'runny asked, still runny where it lands');
  assert.equal(warningKey(refused, true, 'ice')?.key, 'warn.lowOdds');
  const said = { ...refused, worthSaying: true };
  assert.equal(warningKey(said, true, 'tap')?.key, 'refusal.tap');
  assert.equal(warningKey(said, false, 'counter')?.key, 'refusal.counter');
});

test('7. the shading is relative to the best level, and empty with nothing to shade', () => {
  const p: OddsProfile = {
    points: [
      { level: 0, cookTime_s: 300, odds: 0.025 }, { level: 0.5, cookTime_s: 400, odds: 0.5 },
      { level: 1, cookTime_s: 500, odds: 0.25 },
    ],
    best: 0.5, physicalSoftest: 0, physicalHardest: 1, softest: 0.5, hardest: 0.5,
  };
  assert.deepEqual(shadingOf(p).map((s) => s.strength), [0.05, 1, 0.5]);
  assert.deepEqual(shadingOf({ ...p, best: 0.01 }), []);
  assert.deepEqual(shadingOf({ ...p, points: [], best: 0 }), []);
});

test('8. advice: when it is offered, and what it says for which setup', () => {
  const p: OddsProfile = {
    points: [], best: 0.8, physicalSoftest: 0, physicalHardest: 1, softest: 0.1, hardest: 1,
  };
  assert.equal(adviceWanted(ADVICE_BELOW_TENTHS - 1, null), true);
  assert.equal(adviceWanted(5, null), false);
  assert.equal(adviceWanted(5, p), true, '5/10 against a best of 8/10 is a clear margin');
  assert.equal(adviceWanted(6, p), false);
  assert.equal(adviceWanted(8, p), false);

  const facts = (eggFromClass: boolean, startAssumed: boolean): AdviceFacts => ({ eggFromClass, startAssumed });
  // What the model cannot price: the inputs it takes as exact.
  assert.deepEqual(unpricedAdvice(SETUP, facts(false, false)), []);
  assert.deepEqual(unpricedAdvice(SETUP, facts(true, false)), ['advice.weigh']);
  assert.deepEqual(unpricedAdvice(appSetup({ eggStart_C: 20 }), facts(true, true)), ['advice.fridge', 'advice.weigh']);
  assert.deepEqual(unpricedAdvice(appSetup({ eggStart_C: 20 }), facts(false, false)), [], 'a temperature the cook typed is known');
  assert.deepEqual(unpricedAdvice(appSetup({ eggStart_C: 5 }), facts(false, true)), [], 'a degree over the fridge is the fridge');

  // What it can: the counter to ice, and more water with the heat off; never the tap.
  assert.deepEqual(pricedChanges(SETUP), []);
  assert.deepEqual(pricedChanges(appSetup({ cooling: 'tap' })), []);
  assert.deepEqual(pricedChanges(COUNTER).map((c) => [c.key, c.setup.cooling]), [['advice.ice', 'ice']]);
  assert.deepEqual(
    pricedChanges(appSetup({ afterBoil: 'off', waterLitres: 2 })).map((c) => [c.key, c.setup.waterLitres]),
    [['advice.moreWater', 4]],
  );
  assert.deepEqual(pricedChanges(appSetup({ afterBoil: 'off', waterLitres: 8 }))[0].setup.waterLitres, 12);
  assert.deepEqual(pricedChanges(appSetup({ afterBoil: 'off', waterLitres: 12 })), [], 'no more water to add');

  // Kept only where the change's own profile raises this level's odds.
  const ice: OddsProfile = {
    points: [
      { level: 0, cookTime_s: 300, odds: 0.5 }, { level: 0.5, cookTime_s: 400, odds: 0.7 },
      { level: 1, cookTime_s: 500, odds: 0.3 },
    ],
    best: 0.7, physicalSoftest: 0, physicalHardest: 1, softest: 0, hardest: 1,
  };
  assert.equal(oddsNear(ice, 0.25), 0.6);
  assert.equal(oddsNear(ice, 1), 0.3);
  assert.equal(oddsNear({ ...ice, points: ice.points.slice(1) }, 0.25), 0, 'a level that pot cannot deliver');
  const priced = [{ key: 'advice.ice', profile: ice }];
  assert.deepEqual(protocolAdvice(COUNTER, facts(true, false), 0.25, 0.2, priced), ['advice.weigh', 'advice.ice']);
  assert.deepEqual(protocolAdvice(COUNTER, facts(true, false), 0.25, 0.56, priced), ['advice.weigh'], 'under half a tenth');
  assert.deepEqual(protocolAdvice(COUNTER, facts(false, false), 1, 0.3, priced), [], 'no help at hard');
});

test('9. on the model, ice helps a counter rest where the carryover binds, and not at hard', () => {
  const c = knowing({ particles: PARTICLES, eggsLogged: 4, white: 0.1 });
  const counter = oddsProfile(c, EGG, COUNTER, gridFor(c, EGG, COUNTER));
  const change = pricedChanges(COUNTER)[0];
  const ice = oddsProfile(c, EGG, change.setup, gridFor(c, EGG, change.setup));
  const at = (level: number): string[] => protocolAdvice(
    COUNTER, { eggFromClass: false, startAssumed: false }, level, oddsNear(counter, level),
    [{ key: change.key, profile: ice }],
  );
  const lowest = counter.softest as number;
  console.log(`# counter vs ice at ${lowest}: ${oddsNear(counter, lowest).toFixed(2)} vs ${oddsNear(ice, lowest).toFixed(2)}; at 1: ${oddsNear(counter, 1).toFixed(2)} vs ${oddsNear(ice, 1).toFixed(2)}`);
  assert.deepEqual(at(lowest), ['advice.ice']);
  assert.deepEqual(at(1), []);
});

test('10. the far left: the slider rests on the level the time and the bracket are for, and the bracket shows how far the white leans it', () => {
  // A cold start, as a fresh install has it: the white sets only from a
  // level above runny, so asked for runny, the slider goes there.
  const cold = appSetup({ startMode: 'cold' });
  const freshGrid = gridFor(FRESH, EGG, cold);
  const fresh = answerAt(FRESH, EGG, cold, 0, oddsProfile(FRESH, EGG, cold, freshGrid), true);
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
  console.log(`# fresh, cold, asked 0: slider at ${fresh.level}, bracket ${fo.levelLow.toFixed(3)}/${fo.levelMedian.toFixed(3)}/${fo.levelHigh.toFixed(3)}, ${directionKey(fo)}, runny white ${fo.pWhiteRunny.toFixed(2)}`);
  assert.ok(Math.abs(fo.levelMedian - fresh.level) < 0.02, `median ${fo.levelMedian}`);
  assert.ok(fo.levelLow <= fresh.level && fresh.level <= fo.levelHigh);
  assert.ok(whiteAtRisk(fo), 'and the white has its line');

  // After eggs the time is chosen, and at the soft end the white leans it
  // later, because a runny white costs three. The bracket's middle sits right
  // of the thumb by what that costs the yolk, and the sentence says firm.
  const c = knowing({ particles: PARTICLES, eggsLogged: 3 });
  const grid = gridFor(c, EGG, cold);
  const coldProfile = oddsProfile(c, EGG, cold, grid);
  const a = answerAt(c, EGG, cold, 0, coldProfile, true);
  assert.equal(a.level, a.verdict.snapTo ?? 0);
  const target = logYolkTarget(a.level);
  const d = decide(c, grid, a.solution, target, envelopeBounds(coldProfile, a.level));
  const o = predictOutcome(c.posterior, grid, d.cookTime_s, target);
  const unleaned = predictOutcome(c.posterior, grid, d.meanCookTime_s, target);
  console.log(`# three eggs, cold, asked 0: slider at ${a.level} (${a.verdict.kind}), ${d.meanCookTime_s.toFixed(0)} s -> ${d.cookTime_s.toFixed(0)} s, bracket ${o.levelLow.toFixed(3)}/${o.levelMedian.toFixed(3)}/${o.levelHigh.toFixed(3)}; unleaned middle ${unleaned.levelMedian.toFixed(3)}; runny white ${unleaned.pWhiteRunny.toFixed(2)} -> ${o.pWhiteRunny.toFixed(2)}; ${directionKey(o)}`);
  assert.ok(d.chosen && d.cookTime_s > d.meanCookTime_s, 'the white leans the time later');
  assert.ok(unleaned.pWhiteRunny > o.pWhiteRunny, 'to keep the white from running');
  assert.ok(Math.abs(unleaned.levelMedian - a.level) < 0.03, 'unleaned, the middle is the thumb');
  assert.ok(o.levelMedian > a.level + 0.03, `the lean moves it right: ${o.levelMedian}`);
  assert.equal(o.lean, 'firm');
  assert.ok(directionKey(o) === 'outcome.likely.firm' || directionKey(o) === 'outcome.miss.firm', directionKey(o));
});

test('11. the owner\'s egg: 58 g from the fridge into boiling water and an ice bath, after a little learned, goes to soft and says so', () => {
  // One egg: soft asked, the yolk just right and the white runny. That puts
  // 3/10 at jammy, as on the owner's phone (5 October 2026).
  const egg = eggFromMass(0.058);
  const post = createPrior(PARTICLES, CALIBRATION_SEED);
  const first: Calibration = { posterior: post, eggsLogged: 0 };
  const asked = solveCookTime(egg, SETUP, calibrationParams(first), calibrationDoneness(first, 0.22));
  updatePosterior(post, gridFor(first, egg, SETUP), asked.result.cookTime_s, logYolkTarget(0.22), 0, 'runny');
  const c: Calibration = { posterior: post, eggsLogged: 1 };
  const grid = gridFor(c, egg, SETUP);
  const p = oddsProfile(c, egg, SETUP, grid);
  const soft = 0.22;
  const a = answerAt(c, egg, SETUP, soft, p, true);
  const jammy = answerAt(c, egg, SETUP, 0.41, p, true);
  const own = decide(c, grid, a.solution, logYolkTarget(a.level));
  const d = decide(c, grid, a.solution, logYolkTarget(a.level), envelopeBounds(p, a.level));
  const o = predictOutcome(c.posterior, grid, d.cookTime_s, logYolkTarget(a.level));
  const ownJammy = decide(c, grid, jammy.solution, logYolkTarget(jammy.level));
  const dj = decide(c, grid, jammy.solution, logYolkTarget(jammy.level), envelopeBounds(p, jammy.level));
  console.log(`# 58 g, fridge, boiling, ice, one egg: physical ${p.physicalSoftest}, 3/10 from ${p.softest}; soft ${d.oddsTenths}/10 at ${d.cookTime_s.toFixed(0)} s (its own choice ${own.cookTime_s.toFixed(0)} s), bracket ${o.levelLow.toFixed(2)}-${o.levelHigh.toFixed(2)}, ${directionKey(o)}; jammy ${dj.oddsTenths}/10 at ${dj.cookTime_s.toFixed(0)} s (its own ${ownJammy.cookTime_s.toFixed(0)} s)`);
  // Soft's own choice, against its own target, is later than jammy's: the
  // white's weight. The envelope gives it no later than jammy's
  // (DECISIONS.md 84), and jammy, which nothing firmer undercuts, keeps its own.
  assert.ok(own.cookTime_s > ownJammy.cookTime_s + 30, 'unheld, soft would be the firmer egg');
  assert.ok(d.cookTime_s <= dj.cookTime_s, `soft ${d.cookTime_s} against jammy ${dj.cookTime_s}`);
  assert.equal(dj.cookTime_s, ownJammy.cookTime_s);
  assert.ok(p.softest !== null && p.softest > soft, `3/10 from ${p.softest}`);
  assert.equal(anchorNear(p.softest).key, 'doneness.jammy');
  assert.ok(p.physicalSoftest <= soft);
  assert.equal(a.verdict.kind, 'none');
  assert.equal(a.level, soft, 'the slider stays at soft');
  assert.equal(a.lowOdds, true);
  assert.equal(warningKey(a.verdict, a.lowOdds, 'ice')?.key, 'warn.lowOdds');
  // The answer is for soft: its mean solve is sooner than jammy's. After a
  // runny white the time is jammy's, and the bracket and the sentence say
  // where that puts the yolk.
  assert.ok(a.solution.result.cookTime_s < jammy.solution.result.cookTime_s, 'the solve is for soft');
  assert.equal(o.lean, 'firm');
  assert.ok(o.levelMedian > soft);
  assert.ok(directionKey(o) === 'outcome.miss.firm' || directionKey(o) === 'outcome.likely.firm', directionKey(o));
});

/** Every slider position the pan delivers, from soft to hard, with the time the
 *  app gives there (held by the profile, as the apps hold it). */
function timesAcross(c: Calibration, egg: Egg, setup: CookSetup): { profile: OddsProfile; times: [number, number][] } {
  const grid = gridFor(c, egg, setup);
  const profile = oddsProfile(c, egg, setup, grid);
  const times: [number, number][] = [];
  const lo = Math.round(profile.physicalSoftest * 100);
  const hi = Math.round(profile.physicalHardest * 100);
  for (let k = lo; k <= hi; k++) {
    const a = answerAt(c, egg, setup, k / 100, profile, true);
    const d = decide(c, grid, a.solution, logYolkTarget(a.level), envelopeBounds(profile, a.level));
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
  updatePosterior(post, gridFor(first, egg58, SETUP), asked.result.cookTime_s, logYolkTarget(0.22), 0, 'runny');
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
    points: [
      { level: 0.2, cookTime_s: 400, odds: 0.1 }, { level: 0.25, cookTime_s: 410, odds: 0.3 },
      { level: 0.3, cookTime_s: 430, odds: 0.5 },
    ],
    best: 0.5, physicalSoftest: 0.2, physicalHardest: 0.3, softest: 0.25, hardest: 0.3,
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
