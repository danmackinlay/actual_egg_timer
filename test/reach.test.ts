/**
 * The odds at every level, the range they allow, the shading and the advice
 * (src/core/reach.ts; the owner's answers of 27 September, PLAN.md).
 *
 * The claims: a profile point IS the odds the app shows at that level, so the
 * two cannot disagree; a fresh install is refused nothing the pan can deliver;
 * once an egg has taught something the slider's ends are the softest and
 * firmest levels at 3/10 or better, found on the slider's own grid, and never
 * outside the physical limits; when nothing reaches 3/10 the physical limits
 * stand; and a counter rest asked for soft is refused for the physical reason
 * and lands where the odds are at least 3/10.
 *
 * The fixture (`fixtures/reach.json`) pins the arithmetic for the Swift port.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { decide, oddsInTenths } from '../src/core/decide.js';
import { DoseGrid } from '../src/core/doseGrid.js';
import { createPrior } from '../src/core/infer.js';
import { eggFromMass } from '../src/core/geometry.js';
import { CookSetup } from '../src/core/protocol.js';
import { Solution, solveCookTime } from '../src/core/solve.js';
import { CALIBRATION_SEED, anchorNear, snapUp, verdictFor } from '../src/core/policy.js';
import { Calibration, calibrationDoneness, calibrationParams } from '../src/core/record.js';
import {
  ADVICE_BELOW_TENTHS, AdviceFacts, OddsProfile, REACH_ODDS, adviceWanted, oddsAtLevel, oddsNear,
  oddsProfile, pricedChanges, protocolAdvice, shadingOf, unpricedAdvice, verdictWithOdds,
} from '../src/core/reach.js';
import { appSetup, gridFor, knowing, logTarget } from '../tools/common.js';

const EGG = eggFromMass(0.068);

const SETUP = appSetup();
const COUNTER = appSetup({ cooling: 'counter' });
const PARTICLES = 400;

/** What the app does at a level, verdict and snap and all, with the profile's
 *  range or without it. */
function appAt(c: Calibration, grid: DoseGrid, setup: CookSetup, level: number, profile: OddsProfile | null) {
  const params = calibrationParams(c);
  let sol: Solution = solveCookTime(EGG, setup, params, calibrationDoneness(c, level));
  const v = verdictWithOdds(sol, level, profile);
  let at = level;
  if (v.snapTo !== null) {
    const retry = solveCookTime(EGG, setup, params, calibrationDoneness(c, v.snapTo));
    if (retry.reachable) {
      sol = retry;
      at = v.snapTo;
    }
  }
  return { verdict: v, level: at, decision: decide(c, grid, sol, logTarget(at)) };
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
    assert.equal(appAt(WHITE_BOUND, grid, SETUP, point.level, null).decision.odds, point.odds, `level ${point.level}`);
    assert.equal(oddsAtLevel(WHITE_BOUND, EGG, SETUP, grid, point.level), point.odds);
  }
  assert.equal(p.best, Math.max(...p.points.map((q) => q.odds)));
});

test('2. a fresh install is refused nothing the pan can deliver, at any level', () => {
  for (const setup of [SETUP, COUNTER]) {
    const grid = gridFor(FRESH, EGG, setup);
    const p = oddsProfile(FRESH, EGG, setup, grid);
    assert.equal(p.softest, null);
    assert.equal(p.hardest, null);
    assert.ok(p.best > 0.1 && p.best < REACH_ODDS + 0.05, `best ${p.best}`);
    for (const level of [0, 0.22, 0.41, 0.62, 1]) {
      const sol = solveCookTime(EGG, setup, calibrationParams(FRESH), calibrationDoneness(FRESH, level));
      assert.deepEqual(verdictWithOdds(sol, level, p), verdictFor(sol, level));
    }
    // And still shaded, relative to the best level.
    const shades = shadingOf(p);
    assert.equal(shades.length, p.points.length);
    assert.equal(Math.max(...shades.map((s) => s.strength)), 1);
  }
});

test('3. after eggs, the ends are the softest and firmest levels at 3/10 or better, on the slider\'s grid', () => {
  const grid = gridFor(WHITE_BOUND, EGG, SETUP);
  const p = oddsProfile(WHITE_BOUND, EGG, SETUP, grid);
  assert.ok(p.softest !== null && p.hardest !== null);
  const softest = p.softest as number;
  const hardest = p.hardest as number;
  console.log(`# white-bound cook: physical ${p.physicalSoftest}-${p.physicalHardest}, offered ${softest}-${hardest}, best ${oddsInTenths(p.best)}/10`);
  assert.ok(softest > p.physicalSoftest, 'the odds narrow the soft end here');
  assert.ok(softest >= p.physicalSoftest && hardest <= p.physicalHardest, 'never outside the physical limits');
  assert.equal(Math.round(softest * 100) / 100, softest);
  assert.ok(oddsAtLevel(WHITE_BOUND, EGG, SETUP, grid, softest) >= REACH_ODDS);
  assert.ok(oddsAtLevel(WHITE_BOUND, EGG, SETUP, grid, softest - 0.01) < REACH_ODDS);
  if (hardest < p.physicalHardest) {
    assert.ok(oddsAtLevel(WHITE_BOUND, EGG, SETUP, grid, hardest + 0.01) < REACH_ODDS);
  }
  // The app, asked for anything softer, lands on the end, and says 3/10 or better.
  for (const level of [0, 0.1, softest - 0.01]) {
    const a = appAt(WHITE_BOUND, grid, SETUP, level, p);
    assert.equal(a.level, softest, `asked ${level}`);
    assert.ok(a.decision.oddsTenths >= 3, `asked ${level}: ${a.decision.oddsTenths}/10`);
    assert.ok(a.verdict.kind === 'unlikelySoft' || a.verdict.kind === 'tooSoftForWhite', a.verdict.kind);
  }
  // Inside the range nothing moves.
  const inside = appAt(WHITE_BOUND, grid, SETUP, 0.62, p);
  assert.equal(inside.verdict.kind, 'none');
  assert.equal(inside.level, 0.62);
});

test('4. when no level reaches 3/10, the physical limits stand', () => {
  // The prior's spread, after an egg that taught nothing that narrowed it.
  const unsure: Calibration = { posterior: createPrior(PARTICLES, CALIBRATION_SEED), eggsLogged: 1 };
  const grid = gridFor(unsure, EGG, SETUP);
  const p = oddsProfile(unsure, EGG, SETUP, grid);
  assert.ok(p.best < REACH_ODDS, `best ${p.best}`);
  assert.equal(p.softest, null);
  assert.equal(p.hardest, null);
  for (const level of [0, 0.22, 1]) {
    const sol = solveCookTime(EGG, SETUP, calibrationParams(unsure), calibrationDoneness(unsure, level));
    assert.deepEqual(verdictWithOdds(sol, level, p), verdictFor(sol, level));
  }
});

test('5. a counter rest asked for soft: refused for the physical reason, and landed at 3/10 or better', () => {
  const c = knowing({ particles: PARTICLES, eggsLogged: 4, white: 0.1 });
  const grid = gridFor(c, EGG, COUNTER);
  const p = oddsProfile(c, EGG, COUNTER, grid);
  assert.ok(p.softest !== null);
  const a = appAt(c, grid, COUNTER, 0.22, p);
  console.log(`# counter, soft asked: physical ${p.physicalSoftest}, offered from ${p.softest}, landed ${a.level} at ${a.decision.oddsTenths}/10 (${a.verdict.kind}, "${a.verdict.limit.key}")`);
  assert.equal(a.verdict.kind, 'tooSoftForWhite');
  assert.equal(a.level, Math.max(snapUp(p.physicalSoftest), p.softest as number));
  assert.equal(a.verdict.limit.key, anchorNear(a.level).key);
  assert.ok(a.decision.oddsTenths >= 3);
});

test('6. the verdict, on hand-made ranges: each refusal and where it snaps', () => {
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
  const never: Solution = { ...base, reachable: false, whiteSets: false };

  const soft = verdictWithOdds(reachable, 0.2, profile);
  assert.equal(soft.kind, 'unlikelySoft');
  assert.equal(soft.snapTo, 0.3);
  assert.equal(soft.limit.key, 'doneness.soft');
  assert.equal(soft.worthSaying, false, 'asked soft, landed on a level still called soft');

  const hard = verdictWithOdds(reachable, 1, profile);
  assert.equal(hard.kind, 'unlikelyHard');
  assert.equal(hard.snapTo, 0.8);
  assert.equal(hard.limit.key, 'doneness.fudgy');
  assert.equal(hard.worthSaying, true);

  assert.equal(verdictWithOdds(reachable, 0.5, profile).kind, 'none');
  assert.equal(verdictWithOdds(reachable, 0.3, profile).kind, 'none');
  assert.equal(verdictWithOdds(reachable, 0.8, profile).kind, 'none');

  // Physically too soft: the physical reason, the odds' end.
  const physical = verdictWithOdds(tooSoft, 0.05, profile);
  assert.equal(physical.kind, 'tooSoftForWhite');
  assert.equal(physical.snapTo, 0.3);
  assert.equal(physical.worthSaying, true);
  assert.equal(verdictFor(tooSoft, 0.05).snapTo, 0.1);

  // Physically too firm (heat off): the pan's reason, the odds' end.
  const capped = verdictWithOdds({ ...tooSoft, hardestLevel: 0.9 }, 0.95, profile);
  assert.equal(capped.kind, 'harderThanPanReaches');
  assert.equal(capped.snapTo, 0.8);

  // Nothing to snap to stays nothing to snap to; no profile is verdictFor.
  assert.deepEqual(verdictWithOdds(never, 0.4, profile), verdictFor(never, 0.4));
  assert.deepEqual(verdictWithOdds(reachable, 0.05, null), verdictFor(reachable, 0.05));
  assert.deepEqual(
    verdictWithOdds(reachable, 0.05, { ...profile, softest: null, hardest: null }),
    verdictFor(reachable, 0.05),
  );
});

test('7. the shading is relative to the best level, and empty with nothing to shade', () => {
  const p: OddsProfile = {
    points: [{ level: 0, odds: 0.025 }, { level: 0.5, odds: 0.5 }, { level: 1, odds: 0.25 }],
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
    points: [{ level: 0, odds: 0.5 }, { level: 0.5, odds: 0.7 }, { level: 1, odds: 0.3 }],
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
