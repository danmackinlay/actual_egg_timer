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
 * warned of if it is a wild guess there; at the far left
 * the slider rests on the level the time and the bracket are for, whose
 * middle leaves the thumb only by the lean the white asks for once a time is
 * chosen; the owner's own egg goes to soft and says so; and the time never
 * falls as the level rises (DECISIONS.md 84). Only the stripes move the
 * slider (DECISIONS.md 83). What the screen shows at a level is one function,
 * `decideAnswer`, which both apps call: the decision held by the envelope,
 * the nudge where a time is chosen, the solve, the outcome and the certainty
 * at the time given, and whether advice is wanted.
 *
 * The fixture (`fixtures/reach.json`) pins the arithmetic for the Swift port.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { decide } from '../src/core/decide.js';
import { DoseGrid } from '../src/core/doseGrid.js';
import { createPrior, updatePosterior, yolkWordProbabilities } from '../src/core/infer.js';
import { Egg, eggFromMass } from '../src/core/geometry.js';
import { CookSetup } from '../src/core/protocol.js';
import { Solution, logYolkTarget, solveCookTime } from '../src/core/solve.js';
import { anchorNear, snapUp, verdictFor } from '../src/core/slider.js';
import { CALIBRATION_SEED, Calibration, calibrationDoneness, calibrationParams } from '../src/core/record.js';
import {
  ADVICE_GAIN, AdviceFacts, LevelOdds, OddsProfile, adviceWanted, askedNear, envelopeBounds, lowOddsAt, oddsAtLevel,
  answerAt, decideAnswer, oddsProfile, pricedChanges, protocolAdvice, shadingOf, unpricedAdvice,
} from '../src/core/reach.js';
import { askedWord, certaintyAt, wordCertainty } from '../src/core/certainty.js';
import { predictOutcome } from '../src/core/outcome.js';
import { mostLikelyShown, warningKey, whiteAtRisk } from '../src/core/wording.js';
import { appSetup, gridFor, knowing } from '../tools/common.js';

const EGG = eggFromMass(0.068);

const SETUP = appSetup();
const COUNTER = appSetup({ cooling: 'counter' });
const PARTICLES = 400;

/** What the app does at a level, verdict and snap and warning and all, with
 *  the profile or without it: the time held by the profile's envelope, as the
 *  apps hold it (`decideAnswer`, with no nudge). */
function appAt(c: Calibration, grid: DoseGrid, setup: CookSetup, level: number, profile: OddsProfile | null) {
  const a = answerAt(c, EGG, setup, level, profile);
  return {
    verdict: a.verdict, level: a.level, lowOdds: a.lowOdds,
    decision: decideAnswer(c, EGG, setup, grid, a.solution, a.level, profile, 0).decision,
  };
}

/** A point made by hand: its odds, and a class and a chance of the word asked
 *  that the hand-made tests below do not read. */
function point(level: number, cookTime_s: number, odds: number, pAsked = 0.5): LevelOdds {
  return { level: level, cookTime_s: cookTime_s, odds: odds, pAsked: pAsked, certainty: 'ballpark' };
}

/** The profile point at a level, which a bisection put there or the grid did. */
function pointAt(p: OddsProfile, level: number): LevelOdds {
  const found = p.points.find((q) => Math.abs(q.level - level) < 1e-9);
  assert.ok(found !== undefined, `no point at ${level}`);
  return found;
}

const FRESH: Calibration = { posterior: createPrior(PARTICLES, CALIBRATION_SEED), eggsLogged: 0 };
/** A cook whose white needs 0.4 decades more than the literature's: the soft
 *  end is white-bound and its odds fall. */
const WHITE_BOUND = knowing({ particles: PARTICLES, eggsLogged: 4, white: 0.4 });

test('1. a profile point is the odds and the certainty the app shows at that level', () => {
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
    assert.equal(oddsAtLevel(WHITE_BOUND, EGG, SETUP, grid, q.level, p), q.odds);
    // The line under the time, at that level and time, is the point's class.
    assert.equal(shown.certainty.words.certainty, q.certainty, `level ${q.level}`);
    assert.equal(shown.certainty.words.pAsked, q.pAsked, `level ${q.level}`);
    assert.deepEqual(shown.certainty, certaintyAt(WHITE_BOUND.posterior, grid, d.cookTime_s, q.level));
  }
  assert.equal(p.best, Math.max(...p.points.map((q) => q.odds)));
  assert.equal(p.bestAsked, Math.max(...p.points.map((q) => q.pAsked)));
});

test('2. a fresh install is warned of nothing, at any level, and is never very certain', () => {
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

test('3. after an egg, the range that is not a wild guess is on the slider\'s grid, and outside it the slider stays and warns', () => {
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

test('3a. a white-bound cook is no wild guess anywhere, so nothing is dotted; where its time gives a firmer yolk, "most likely" says so', () => {
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

test('4. when every level is a wild guess, nothing is warned of', () => {
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

test('5. a counter rest asked for soft: refused for the physical reason, landed on the physical edge, and warned of if a wild guess there', () => {
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

test('6. the warning and the verdict, on hand-made ranges', () => {
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

test('7. the shading is the chance of the word asked, relative to the best level\'s, and empty with nothing to shade', () => {
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

test('8. advice: when it is looked for, and what it says for which setup', () => {
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
  const priced = [{ key: 'advice.ice', profile: ice }];
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

test('9. on the model, ice makes a counter rest surer once it has bitten, and not before', () => {
  const egg = eggFromMass(0.058);
  const at = (c: Calibration, level: number) => {
    const grid = gridFor(c, egg, COUNTER);
    const p = oddsProfile(c, egg, COUNTER, grid);
    const change = pricedChanges(COUNTER)[0];
    const ice = oddsProfile(c, egg, change.setup, gridFor(c, egg, change.setup));
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
  const bitten = at(cookedAt(COUNTER, egg, 1, 'runny'), 0.22);
  assert.equal(bitten.d.certainty.words.certainty, 'wildGuess');
  assert.equal(bitten.d.adviceWanted, true);
  assert.deepEqual(bitten.advice, { keys: ['advice.ice'], surer: true });
  // At hard it is surer than a wild guess, and nothing is looked for.
  assert.equal(at(cookedAt(COUNTER, egg, 1, 'runny'), 1).d.adviceWanted, false);
});

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
  // owner's phone (5 October 2026), where it put 3/10 at jammy. Since the
  // `certainty` draft soft is a ballpark there and is not dotted: soft or a
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
  // (DECISIONS.md 84), and jammy, which nothing firmer undercuts, keeps its own.
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
 *  app gives there (held by the profile, as the apps hold it). */
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
  // DECISIONS.md 83: soft is decided at soft, not moved. It was warned of
  // under 3/10; since the `certainty` draft it is a ballpark, and not dotted.
  assert.equal(soft.lowOdds, false);
  assert.equal(d.level, 0.22);
  assert.equal(d.certainty.words.certainty, 'ballpark');
  // DECISIONS.md 84: its own choice is later than jammy's; the time it is
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
