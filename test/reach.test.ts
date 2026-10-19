/**
 * The odds at every level, the range they allow, the shading and the advice
 * (src/core/reach.ts).
 *
 * The claims: a profile point IS the odds and the certainty the app computes
 * at that level, so the two cannot disagree; a fresh install is warned of
 * nothing; once an egg has taught something the range that is not a wild
 * guess is found on the slider's own grid, never outside the physical limits,
 * and a level outside it stays where it was asked and is warned of; when
 * every level is a wild guess nothing is warned of; a counter rest asked for
 * soft is refused for the physical reason and lands on the physical edge,
 * warned of if it is a wild guess there, and a softest cook just past a
 * word's edge is named as the word the slider lands in; at the far left
 * the slider rests on the level the time and the bracket are for, whose
 * middle leaves the thumb only by the lean the white asks for once a time is
 * chosen; the owner's own egg goes to soft and says so; and the time never
 * falls as the level rises. Only the stripes move the slider. What the screen shows at a level is one function,
 * `decideAnswer`, which both apps call: the decision held by the envelope,
 * the nudge where a time is chosen, the solve, the outcome and the certainty
 * at the time given, and whether advice is wanted.
 *
 * Here, the odds, the range, the shading and the advice;
 * test/reachAnswer.test.ts holds the answer at a level,
 * test/reachMonotone.test.ts the time across the slider, and test/profiles.ts
 * what they share.
 *
 * The fixture (`fixtures/reach.json`) pins the arithmetic for the Swift port.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { DoseGrid } from '../src/core/doseGrid.ts';
import { createPrior, updatePosterior, yolkWordProbabilities } from '../src/core/infer.ts';
import { type Egg, eggFromMass } from '../src/core/geometry.ts';
import type { CookSetup } from '../src/core/protocol.ts';
import { DONENESS_ANCHORS, type Solution, solveCookTime } from '../src/core/solve.ts';
import { anchorNear, anchorReachable, snapUp, verdictFor } from '../src/core/slider.ts';
import {
  CALIBRATION_SEED, type Calibration, PARTICLE_COUNT, calibrationDoneness, calibrationParams, freshCalibration,
} from '../src/core/record.ts';
import {
  ADVICE_GAIN, type AdviceFacts, type OddsProfile, adviceWanted, askedNear, lowOddsAt, answerAt, decideAnswer,
  oddsProfile, pricedChanges, protocolAdvice, shadingOf, unpricedAdvice,
} from '../src/core/reach.ts';
import { askedWord, certaintyAt, wordCertainty } from '../src/core/certainty.ts';
import { mostLikelyShown, warningKey } from '../src/core/wording.ts';
import { appSetup, gridFor, knowing } from '../tools/common.ts';
import { COUNTER, EGG, FRESH, PARTICLES, SETUP, WHITE_BOUND, appAt, point, pointAt } from './profiles.ts';

test('a profile point is the odds and the certainty the app shows at that level', () => {
  const grid = gridFor(WHITE_BOUND, EGG, SETUP);
  const p = oddsProfile(WHITE_BOUND, EGG, SETUP, grid);
  // Every 0.05 from the physical edge, 19 here; a bisection at an end that
  // is a wild guess adds its own.
  assert.ok(p.points.length >= 19, `${p.points.length} points`);
  for (let i = 1; i < p.points.length; i++) assert.ok(p.points[i].level > p.points[i - 1].level);
  for (const q of p.points) {
    const a = answerAt(WHITE_BOUND, EGG, SETUP, q.level, p);
    const shown = decideAnswer(WHITE_BOUND, EGG, SETUP, grid, a.solution, a.level, p, 0);
    const d = shown.decision;
    assert.equal(d.odds, q.odds, `level ${q.level}`);
    assert.equal(d.cookTime_s, q.cookTime_s, `level ${q.level}`);
    // The line under the time, at that level and time, is the point's class.
    assert.equal(shown.certainty.words.certainty, q.certainty, `level ${q.level}`);
    assert.equal(shown.certainty.words.pAsked, q.pAsked, `level ${q.level}`);
    assert.deepEqual(shown.certainty, certaintyAt(WHITE_BOUND.posterior, grid, d.cookTime_s, q.level));
  }
  assert.equal(p.best, Math.max(...p.points.map((q) => q.odds)));
  assert.equal(p.bestAsked, Math.max(...p.points.map((q) => q.pAsked)));
});

test('a fresh install is warned of nothing, at any level, and is never very certain', () => {
  for (const setup of [SETUP, COUNTER]) {
    const grid = gridFor(FRESH, EGG, setup);
    const p = oddsProfile(FRESH, EGG, setup, grid);
    assert.equal(p.softest, null);
    assert.equal(p.hardest, null);
    assert.ok(p.points.every((q) => q.certainty !== 'veryCertain'), 'never very certain');
    assert.ok(p.points.some((q) => q.certainty === 'ballpark'), 'a ballpark at the firm end');
    for (const level of [0, 0.22, 0.41, 0.62, 1]) {
      const a = answerAt(FRESH, EGG, setup, level, p);
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

test('after an egg, the range that is not a wild guess is on the slider\'s grid, and outside it the slider stays and warns', () => {
  // One egg that taught little: the prior's spread, so the soft half is a
  // wild guess and the firm half a ballpark.
  const unsure: Calibration = { posterior: createPrior(PARTICLES, CALIBRATION_SEED), eggsLogged: 1 };
  const grid = gridFor(unsure, EGG, SETUP);
  const p = oddsProfile(unsure, EGG, SETUP, grid);
  assert.ok(p.softest !== null && p.hardest !== null);
  const softest = p.softest as number;
  const hardest = p.hardest as number;
  console.log(`# one egg, unsure: physical ${p.physicalSoftest}-${p.physicalHardest}, not a wild guess ${softest}-${hardest}, `
    + p.points.map((q) => `${q.level}:${q.certainty}`).join(' '));
  assert.ok(softest > p.physicalSoftest, 'a wild guess at the soft end here');
  assert.ok(softest >= p.physicalSoftest && hardest <= p.physicalHardest, 'never outside the physical limits');
  assert.equal(Math.round(softest * 100) / 100, softest);
  // The bisection decided both sides of the end, so each is a point.
  assert.notEqual(pointAt(p, softest).certainty, 'wildGuess');
  assert.equal(pointAt(p, Math.round(softest * 100 - 1) / 100).certainty, 'wildGuess');
  if (hardest < p.physicalHardest) {
    assert.equal(pointAt(p, Math.round(hardest * 100 + 1) / 100).certainty, 'wildGuess');
  }
  // Asked for a level the pan delivers but a wild guess: the slider stays, the
  // answer is for that level, it is a wild guess on screen, and it is warned of.
  for (const level of [p.physicalSoftest, Math.round(softest * 100 - 1) / 100]) {
    const a = answerAt(unsure, EGG, SETUP, level, p);
    const shown = decideAnswer(unsure, EGG, SETUP, grid, a.solution, a.level, p, 0);
    assert.equal(a.verdict.kind, 'none', `asked ${level}`);
    assert.equal(a.level, level, `asked ${level}`);
    assert.equal(a.lowOdds, true, `asked ${level}`);
    assert.equal(shown.certainty.words.certainty, 'wildGuess', `asked ${level}`);
    assert.deepEqual(warningKey(a.verdict, a.lowOdds, 'ice'), { key: 'warn.wildGuess', args: {} });
  }
  // Inside the range nothing moves, and nothing is said.
  for (const level of [softest, 0.62]) {
    const inside = appAt(unsure, grid, SETUP, level, p);
    assert.equal(inside.verdict.kind, 'none');
    assert.equal(inside.level, level);
    assert.equal(inside.lowOdds, false);
    assert.equal(warningKey(inside.verdict, inside.lowOdds, 'ice'), null);
  }
});

test('a white-bound cook is no wild guess anywhere, so nothing is dotted; where its time gives a firmer yolk, "most likely" says so', () => {
  const grid = gridFor(WHITE_BOUND, EGG, SETUP);
  const p = oddsProfile(WHITE_BOUND, EGG, SETUP, grid);
  assert.equal(p.softest, p.physicalSoftest);
  assert.equal(p.hardest, p.physicalHardest);
  // Asked for less than the pan delivers: refused, and moved to the physical
  // edge, where nothing is warned of.
  const stripes = appAt(WHITE_BOUND, grid, SETUP, 0, p);
  assert.equal(stripes.verdict.kind, 'tooSoftForWhite');
  assert.equal(stripes.level, p.physicalSoftest);
  assert.equal(stripes.lowOdds, false);
  // At the edge the white holds the time late: runny is asked, and seldom got.
  const a = answerAt(WHITE_BOUND, EGG, SETUP, p.physicalSoftest, p);
  const shown = decideAnswer(WHITE_BOUND, EGG, SETUP, grid, a.solution, a.level, p, 0).certainty.words;
  console.log(`# white-bound at ${a.level}: ${shown.certainty}, P(asked) ${shown.pAsked.toFixed(2)}, most likely ${shown.mostLikely}`);
  assert.ok(shown.mostLikely > shown.asked, 'a firmer yolk is likelier');
  assert.equal(mostLikelyShown(shown), true);
});

test('when every level is a wild guess, nothing is warned of', () => {
  // Eggs that taught nothing, and a scatter so wide that no word and its
  // neighbours hold 9 in 10 anywhere.
  const post = createPrior(PARTICLES, CALIBRATION_SEED);
  post.particles = post.particles.map((q) => ({ ...q, noise: 16 * q.noise }));
  const scattered: Calibration = { posterior: post, eggsLogged: 2 };
  const grid = gridFor(scattered, EGG, SETUP);
  const p = oddsProfile(scattered, EGG, SETUP, grid);
  assert.ok(p.points.every((q) => q.certainty === 'wildGuess'));
  assert.equal(p.softest, null);
  assert.equal(p.hardest, null);
  for (const level of [0, 0.22, 1]) {
    const a = answerAt(scattered, EGG, SETUP, level, p);
    const sol = solveCookTime(EGG, SETUP, calibrationParams(scattered), calibrationDoneness(scattered, level));
    assert.deepEqual(a.verdict, verdictFor(sol, level));
    assert.equal(a.lowOdds, false);
  }
});

test('a refusal whose limit is just past a word\'s edge names the word the slider lands in, which is not struck out', () => {
  // Fresh installs whose softest cook falls less than a grid step past a
  // word's edge: the slider can only rest in the next word, and the refusal
  // must say that one.
  const fresh = freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED);
  const cases = [
    {
      what: 'a 77 g egg from the fridge, boiled with the heat on, rested on the counter',
      egg: eggFromMass(0.077), setup: appSetup({ cooling: 'counter' }), band: [0.51, 0.515],
      asked: 0.22, word: 'doneness.fudgy', key: 'refusal.counter',
    },
    {
      what: 'a 43 g egg from the room, boiled with the heat off, opened in an egg cup',
      egg: eggFromMass(0.043), setup: appSetup({ cooling: 'eggCup', eggStart_C: 20, afterBoil: 'off' }),
      band: [0.31, 0.315], asked: 0, word: 'doneness.jammy', key: 'refusal.eggCup',
    },
    {
      what: 'the same egg cup, asked for soft',
      egg: eggFromMass(0.043), setup: appSetup({ cooling: 'eggCup', eggStart_C: 20, afterBoil: 'off' }),
      band: [0.31, 0.315], asked: 0.22, word: 'doneness.jammy', key: 'refusal.eggCup',
    },
  ] as const;
  for (const c of cases) {
    const asked = solveCookTime(c.egg, c.setup, calibrationParams(fresh), calibrationDoneness(fresh, c.asked));
    assert.ok(
      asked.softestLevel > c.band[0] && asked.softestLevel <= c.band[1],
      `${c.what}: softest ${asked.softestLevel} has left (${c.band[0]}, ${c.band[1]}], so this case no longer sits on the edge`,
    );
    const a = answerAt(fresh, c.egg, c.setup, c.asked, null);
    assert.equal(a.verdict.kind, 'tooSoftForWhite', c.what);
    assert.equal(a.level, snapUp(asked.softestLevel), c.what);
    assert.equal(anchorNear(a.level).key, c.word, `${c.what}: the slider's word`);
    assert.equal(a.verdict.limit.key, c.word, `${c.what}: the refusal's word`);
    assert.equal(anchorReachable(DONENESS_ANCHORS.findIndex((w) => w.key === c.word), asked.softestLevel, asked.hardestLevel), true,
      `${c.what}: the word named is not struck out`);
    assert.equal(warningKey(a.verdict, a.lowOdds, c.setup.cooling)?.key, c.key, `${c.what}: the refusal is said`);
  }
});

test('a counter rest asked for soft: refused for the physical reason, landed on the physical edge, and warned of if a wild guess there', () => {
  const c = knowing({ particles: PARTICLES, eggsLogged: 4, white: 0.1 });
  const grid = gridFor(c, EGG, COUNTER);
  const p = oddsProfile(c, EGG, COUNTER, grid);
  assert.ok(p.softest !== null);
  const a = appAt(c, grid, COUNTER, 0.22, p);
  console.log(`# counter, soft asked: physical ${p.physicalSoftest}, surer than a guess from ${p.softest}, landed ${a.level} (${a.verdict.kind}, "${a.verdict.limit.key}", dotted ${a.lowOdds})`);
  assert.equal(a.verdict.kind, 'tooSoftForWhite');
  assert.equal(a.level, snapUp(p.physicalSoftest));
  assert.equal(a.verdict.limit.key, anchorNear(a.level).key);
  assert.equal(a.lowOdds, a.level < (p.softest as number));
  // The refusal is said, when it is worth saying, before the warning.
  const key = warningKey(a.verdict, a.lowOdds, 'counter')?.key ?? null;
  assert.equal(key, a.verdict.worthSaying ? 'refusal.counter' : a.lowOdds ? 'warn.wildGuess' : null);
});

test('the warning and the verdict, on hand-made ranges', () => {
  const profile: OddsProfile = {
    points: [], best: 0.6, bestAsked: 0.6, physicalSoftest: 0.1, physicalHardest: 0.9, softest: 0.3, hardest: 0.8,
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
  // A level a hair past an end, as an iPhone slider stepping by 0.01 made
  // one (35 * 0.01 is not 0.35), is that end.
  assert.equal(lowOddsAt({ ...profile, hardest: 0.35 }, 35 * 0.01), false);
  assert.equal(lowOddsAt({ ...profile, softest: 0.41 }, 0.41 - 1e-12), false);
  // Nothing is warned of with no profile, or one with no range.
  assert.equal(lowOddsAt(null, 0.2), false);
  assert.equal(lowOddsAt({ ...profile, softest: null, hardest: null }, 0.2), false);

  // The verdict is the pan's alone: a deliverable level that is a wild guess
  // is not refused, and a level too soft for the white goes to the physical
  // edge.
  assert.equal(verdictFor(reachable, 0.2).kind, 'none');
  assert.equal(verdictFor(reachable, 0.2).snapTo, null);
  assert.equal(verdictFor(tooSoft, 0.05).snapTo, 0.1);

  // The words: the refusal when worth saying, else the warning, else nothing.
  const none = verdictFor(reachable, 0.2);
  assert.deepEqual(warningKey(none, true, 'ice'), { key: 'warn.wildGuess', args: {} });
  assert.equal(warningKey(none, false, 'ice'), null);
  const refused = verdictFor(tooSoft, 0.05);
  assert.equal(refused.worthSaying, false, 'runny asked, still runny where it lands');
  assert.equal(warningKey(refused, true, 'ice')?.key, 'warn.wildGuess');
  const said = { ...refused, worthSaying: true };
  assert.equal(warningKey(said, true, 'tap')?.key, 'refusal.tap');
  assert.equal(warningKey(said, false, 'counter')?.key, 'refusal.counter');
});

test('the shading is the chance of the word asked, relative to the best level\'s, and empty with nothing to shade', () => {
  const p: OddsProfile = {
    points: [point(0, 300, 0.5, 0.025), point(0.5, 400, 0.1, 0.5), point(1, 500, 0.9, 0.25)],
    best: 0.9, bestAsked: 0.5, physicalSoftest: 0, physicalHardest: 1, softest: 0.5, hardest: 0.5,
  };
  assert.deepEqual(shadingOf(p).map((s) => s.strength), [0.05, 1, 0.5], 'the chance of the word asked, not the odds');
  assert.deepEqual(shadingOf({ ...p, bestAsked: 0.01 }), []);
  assert.deepEqual(shadingOf({ ...p, points: [], best: 0, bestAsked: 0 }), []);
  // On a real pot: each point's chance is the five words' spread at its
  // time, read at the word asked there.
  const grid = gridFor(WHITE_BOUND, EGG, SETUP);
  const real = oddsProfile(WHITE_BOUND, EGG, SETUP, grid);
  for (const q of real.points) {
    const w = wordCertainty(yolkWordProbabilities(WHITE_BOUND.posterior, grid, q.cookTime_s), askedWord(q.level));
    assert.equal(q.pAsked, w.pAsked);
    assert.equal(q.certainty, w.certainty);
  }
});

test('advice: when it is looked for, and what it says for which setup', () => {
  // Looked for at a wild guess only.
  assert.equal(adviceWanted('wildGuess'), true);
  assert.equal(adviceWanted('ballpark'), false);
  assert.equal(adviceWanted('veryCertain'), false);

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
  assert.deepEqual(pricedChanges(appSetup({ cooling: 'eggCup' })), [], 'an egg eaten warm is not iced');
  assert.deepEqual(
    pricedChanges(appSetup({ afterBoil: 'off', waterLitres: 2 })).map((c) => [c.key, c.setup.waterLitres]),
    [['advice.moreWater', 4]],
  );
  assert.deepEqual(pricedChanges(appSetup({ afterBoil: 'off', waterLitres: 8 }))[0].setup.waterLitres, 12);
  assert.deepEqual(pricedChanges(appSetup({ afterBoil: 'off', waterLitres: 12 })), [], 'no more water to add');

  // The chance of the word asked under a change, read between its points
  // that ask the same word: Soft is 0.11 to 0.315, so 0.25 reads 0.15 and
  // 0.30, and 0.1 (Runny) reads 0.05 alone, not Soft's 0.15.
  const ice: OddsProfile = {
    points: [point(0.05, 300, 0.5, 0.3), point(0.15, 320, 0.5, 0.4), point(0.3, 360, 0.7, 0.6), point(0.35, 380, 0.7, 0.9), point(1, 500, 0.3, 0.5)],
    best: 0.7, bestAsked: 0.9, physicalSoftest: 0.05, physicalHardest: 1, softest: 0, hardest: 1,
  };
  assert.ok(Math.abs(askedNear(ice, 0.25) - (0.4 + 0.2 * (0.1 / 0.15))) < 1e-12);
  assert.equal(askedNear(ice, 0.1), 0.3, 'Runny reads Runny\'s point, not Soft\'s');
  assert.equal(askedNear(ice, 0.12), 0.4, 'one side only: the nearest that asks Soft');
  assert.equal(askedNear(ice, 0.3), 0.6);
  assert.equal(askedNear(ice, 0.02), 0, 'a level that pot cannot deliver');
  assert.equal(askedNear({ ...ice, points: [] }, 0.25), 0);

  // Kept, and the link shown, only where the change raises that chance by
  // ADVICE_GAIN over the chance on screen.
  const priced = [{ key: 'advice.ice' as const, profile: ice }];
  const at25 = askedNear(ice, 0.25);
  assert.deepEqual(protocolAdvice(COUNTER, facts(true, false), 0.25, 0.2, priced), { keys: ['advice.weigh', 'advice.ice'], surer: true });
  assert.deepEqual(
    protocolAdvice(COUNTER, facts(true, false), 0.25, at25 - ADVICE_GAIN + 0.001, priced),
    { keys: ['advice.weigh'], surer: false }, 'under a twentieth: the weighing is said, but there is no link for it',
  );
  assert.deepEqual(protocolAdvice(COUNTER, facts(false, false), 1, 0.5, priced), { keys: [], surer: false }, 'no help at hard');
});

/** A cook who has cooked `n` eggs at jammy on `setup`, at the times the app
 *  gave, and called each `word`: a posterior the filter learned, not one
 *  written down. */
function cookedAt(setup: CookSetup, egg: Egg, n: number, word: 'runny' | 'soft' | 'jammy' | 'fudgy' | 'hard'): Calibration {
  const post = createPrior(PARTICLES, CALIBRATION_SEED);
  const c: Calibration = { posterior: post, eggsLogged: 0 };
  for (let k = 0; k < n; k++) {
    const grid = gridFor(c, egg, setup);
    const a = answerAt(c, egg, setup, 0.41, null);
    const d = decideAnswer(c, egg, setup, grid, a.solution, a.level, null, 0);
    updatePosterior(post, grid, d.decision.cookTime_s, word, 'tender');
    c.eggsLogged += 1;
  }
  return c;
}

test('on the model, ice makes a counter rest surer once it has bitten, and not before', () => {
  const egg = eggFromMass(0.058);
  const change = pricedChanges(COUNTER)[0];
  // The counter's surface and odds and ice's, for each calibration, made once.
  const profiled = new Map<Calibration, { grid: DoseGrid; p: OddsProfile; ice: OddsProfile }>();
  const at = (c: Calibration, level: number) => {
    let made = profiled.get(c);
    if (made === undefined) {
      const grid = gridFor(c, egg, COUNTER);
      made = {
        grid: grid, p: oddsProfile(c, egg, COUNTER, grid),
        ice: oddsProfile(c, egg, change.setup, gridFor(c, egg, change.setup)),
      };
      profiled.set(c, made);
    }
    const { grid, p, ice } = made;
    const a = answerAt(c, egg, COUNTER, level, p);
    const d = decideAnswer(c, egg, COUNTER, grid, a.solution, a.level, p, 0);
    const advice = protocolAdvice(
      COUNTER, { eggFromClass: false, startAssumed: false }, d.level, d.certainty.words.pAsked,
      [{ key: change.key, profile: ice }],
    );
    console.log(`#   at ${d.level}: ${d.certainty.words.certainty}, the word asked ${d.certainty.words.pAsked.toFixed(2)} on the counter, ${askedNear(ice, d.level).toFixed(2)} with ice; ${advice.keys}`);
    return { d: d, advice: advice };
  };
  // A fresh install asking for soft rests at the counter's softest: a wild
  // guess, but the prior's width, not the carryover, makes it one, and ice
  // makes it no surer. No link.
  console.log('# fresh, counter, soft asked:');
  const fresh = at(FRESH, 0.22);
  assert.equal(fresh.d.certainty.words.certainty, 'wildGuess');
  assert.equal(fresh.d.adviceWanted, true);
  assert.deepEqual(fresh.advice, { keys: [], surer: false });
  // One egg on the counter called runny when jammy was asked: the carryover
  // is the doubt now, and ice settles it. The link shows.
  console.log('# one egg called runny, counter, soft asked:');
  const runny = cookedAt(COUNTER, egg, 1, 'runny');
  const bitten = at(runny, 0.22);
  assert.equal(bitten.d.certainty.words.certainty, 'wildGuess');
  assert.equal(bitten.d.adviceWanted, true);
  assert.deepEqual(bitten.advice, { keys: ['advice.ice'], surer: true });
  // At hard it is surer than a wild guess, and nothing is looked for.
  assert.equal(at(runny, 1).d.adviceWanted, false);
});
