/**
 * Choosing the time under uncertainty, the odds, and how fast the posterior
 * narrows (INFERENCE.md section 8, src/core/decide.ts).
 *
 * The claims: the choice is right on posteriors built to
 * know something - a cook who likes a firmer yolk gets a later time at every
 * level, which the mean solve never gave them; before any egg the time is the
 * literature's, and after one it leans by seconds, not by the 43 s the prior
 * alone would have it lean; the odds are calibrated on simulated cooks, as the
 * answers' probabilities are; and the interval narrows where the "still
 * learning" rule says. Also: the refusals hold, a cook under way keeps its
 * lean, and the numbers for two runny whites at soft as the choice sees them.
 *
 * The fixture (`fixtures/decide.json`) pins the arithmetic for the Swift port;
 * what is checked here is the reasoning. `npm run decide` prints the longer
 * measurements - the grid's accuracy and cost, and why "still learning" is a
 * count.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DECISION_WINDOW_S, Decision, LEAN_COST_PER_S, NUDGE_MAX_S, RUNNY_WHITE_LOSS, appliedNudge, carriedSolution,
  chooseCookTime, decide, decidedSolution, decisionApplies, decisionGridSpec, decisionInputs, expectedLoss,
  hitOdds, nudgeSeconds,
} from '../src/core/decide.js';
import { DoseGrid, GridSpec, buildRequestedGrid } from '../src/core/doseGrid.js';
import {
  CookTimePrediction, Feedback, Posterior, UNRELATED, predictCookTime, whiteAnswerProbabilities, whiteProbit,
  yolkAnswerProbabilities, yolkProbit,
} from '../src/core/infer.js';
import { ALPHA_DEFAULT } from '../src/core/constants.js';
import { eggFromMass } from '../src/core/geometry.js';
import {
  DEFAULT_PARAMS, Solution, donenessFromSlider, logYolkTarget, solveCookTime,
} from '../src/core/solve.js';
import {
  CALIBRATION_SEED, PARTICLE_COUNT, calibrationGrid, verdictFor,
} from '../src/core/policy.js';
import {
  Calibration, EggRecord, calibrationDoneness, calibrationParams, copyCalibration, foldRecord,
  freshCalibration, gridRequestFor, replay,
} from '../src/core/record.js';
import { appSetup, gridFor, knowing, recordAt } from '../tools/common.js';

// --------------------------------------------------------------------------
// shared
// --------------------------------------------------------------------------

const EGG = eggFromMass(0.068);

const SETUP = appSetup();
const LEVELS = [0.22, 0.41, 0.62, 0.85, 1.0];

/** What the apps do: the mean solve, the verdict, a snap if there is one, and
 *  the level the solve is for. */
function meanSolve(c: Calibration, level: number, setup = SETUP): { sol: Solution; level: number } {
  const params = calibrationParams(c);
  const sol = solveCookTime(EGG, setup, params, calibrationDoneness(c, level));
  const v = verdictFor(sol, level);
  if (v.snapTo !== null) {
    const retry = solveCookTime(EGG, setup, params, calibrationDoneness(c, v.snapTo));
    if (retry.reachable) return { sol: retry, level: v.snapTo };
  }
  return { sol: sol, level: level };
}

function decideFor(c: Calibration, grid: DoseGrid, level: number, setup = SETUP): Decision {
  const m = meanSolve(c, level, setup);
  return decide(c, grid, m.sol, logYolkTarget(m.level));
}

/** The folds' surfaces, coarser than the app's for the same reason. */
const COARSE = (alphaCentre: number, cookTime_s: number): GridSpec => ({
  ...calibrationGrid(alphaCentre, cookTime_s), alphaCount: 9, timeCount: 12,
});

const PRIOR = freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED);
const PRIOR_GRID = gridFor(PRIOR, EGG, SETUP);

/** One egg at the literature's jammy time, answered as a cook with the
 *  literature's kitchen would: just right, and a firm white. */
const ONE_EGG = replay(PRIOR, [recordAt(0.41, meanSolve(PRIOR, 0.41).sol.result.cookTime_s, 0, 'firm')], COARSE);
const ONE_EGG_GRID = gridFor(ONE_EGG, EGG, SETUP);

// --------------------------------------------------------------------------
// 1. The loss and the odds
// --------------------------------------------------------------------------

test('1a. for one particle, the loss is the answers\' less a constant, and the odds their product', () => {
  // The unrelated share adds the same amount to every candidate time, so the
  // loss leaves it out; the odds keep it, because they are about what a cook
  // will SAY.
  const one: Posterior = { particles: [PRIOR.posterior.particles[7]], weights: [1], rng: 1 };
  for (const t of [380, 430, 470, 520]) {
    const target = logYolkTarget(0.41);
    const y = yolkAnswerProbabilities(one, PRIOR_GRID, t, target);
    const w = whiteAnswerProbabilities(one, PRIOR_GRID, t);
    const answers = y[0] + y[2] + RUNNY_WHITE_LOSS * w[0];
    const constant = (2 + RUNNY_WHITE_LOSS) * UNRELATED / 3;
    const loss = expectedLoss(one, PRIOR_GRID, t, target);
    assert.ok(Math.abs((answers - constant) / (1 - UNRELATED) - loss) < 1e-12, `loss at ${t}`);
    assert.ok(Math.abs(hitOdds(one, PRIOR_GRID, t, target) - y[1] * (1 - w[0])) < 1e-12, `odds at ${t}`);
  }
});

test('1b. across particles the two answers are correlated: the odds are not the product of the marginals', () => {
  // A slow time-scale makes the yolk soft AND the white runny, so a cook who
  // misses on one tends to miss on both, and the joint beats the product.
  const t = 419;
  const target = logYolkTarget(0.22);
  const y = yolkAnswerProbabilities(PRIOR.posterior, PRIOR_GRID, t, target);
  const w = whiteAnswerProbabilities(PRIOR.posterior, PRIOR_GRID, t);
  const joint = hitOdds(PRIOR.posterior, PRIOR_GRID, t, target);
  assert.ok(joint > y[1] * (1 - w[0]) + 0.005, `joint ${joint.toFixed(3)}, product ${(y[1] * (1 - w[0])).toFixed(3)}`);
});

// --------------------------------------------------------------------------
// 2. The choice, on posteriors built to know something
// --------------------------------------------------------------------------

const NEUTRAL = knowing({ particles: PARTICLE_COUNT, eggsLogged: 6, taste: 0, white: 0 });
const NEUTRAL_GRID = gridFor(NEUTRAL, EGG, SETUP);

test('2a. a posterior that knows the cook likes a firmer yolk moves the time later, at every level', () => {
  // The mean solve never lets the taste offset reach the time. The mean solve for these two posteriors is the same to the second, because
  // their time-scales are; the choice is not.
  const firmer = knowing({ particles: PARTICLE_COUNT, eggsLogged: 6, taste: 0.2, white: 0 });
  const softer = knowing({ particles: PARTICLE_COUNT, eggsLogged: 6, taste: -0.2, white: 0 });
  const rows: string[] = [];
  for (const level of LEVELS) {
    const n = decideFor(NEUTRAL, NEUTRAL_GRID, level);
    const f = decideFor(firmer, NEUTRAL_GRID, level);
    const s = decideFor(softer, NEUTRAL_GRID, level);
    rows.push(`L${level}: ${s.cookTime_s.toFixed(0)} / ${n.cookTime_s.toFixed(0)} / ${f.cookTime_s.toFixed(0)}`);
    assert.ok(Math.abs(f.meanCookTime_s - n.meanCookTime_s) < 1, 'the mean solve cannot tell them apart');
    assert.ok(f.cookTime_s > n.cookTime_s + 5, `firmer at ${level}: ${rows.join('; ')}`);
    // Softer is earlier wherever the white does not hold it back.
    if (level >= 0.41) assert.ok(s.cookTime_s < n.cookTime_s - 5, `softer at ${level}: ${rows.join('; ')}`);
  }
});

test('2b. whites known to set late move the soft end later, and leave the hard end alone', () => {
  const late = knowing({ particles: PARTICLE_COUNT, eggsLogged: 6, taste: 0, white: 0.6 });
  const soft = [decideFor(NEUTRAL, NEUTRAL_GRID, 0.22), decideFor(late, NEUTRAL_GRID, 0.22)];
  const hard = [decideFor(NEUTRAL, NEUTRAL_GRID, 1.0), decideFor(late, NEUTRAL_GRID, 1.0)];
  assert.ok(soft[1].cookTime_s > soft[0].cookTime_s + 5, `soft ${soft[0].cookTime_s.toFixed(1)} -> ${soft[1].cookTime_s.toFixed(1)}`);
  assert.ok(Math.abs(hard[1].cookTime_s - hard[0].cookTime_s) < 2, `hard ${hard[0].cookTime_s.toFixed(1)} -> ${hard[1].cookTime_s.toFixed(1)}`);
});

test('2c. a cook the model knows is offered close to the mean solve, and good odds', () => {
  for (const level of LEVELS) {
    const d = decideFor(NEUTRAL, NEUTRAL_GRID, level);
    assert.ok(Math.abs(d.cookTime_s - d.meanCookTime_s) < 6, `L${level}: leaned ${(d.cookTime_s - d.meanCookTime_s).toFixed(1)} s`);
    assert.ok(d.oddsTenths >= 6, `L${level}: ${d.odds.toFixed(2)}`);
  }
});

test('2d. the choice is the minimum inside its window, and the cost of leaning moves it by under a second', () => {
  const target = logYolkTarget(0.41);
  const around = 464;
  const t = chooseCookTime(ONE_EGG.posterior, ONE_EGG_GRID, target, around);
  const f = (s: number): number => expectedLoss(ONE_EGG.posterior, ONE_EGG_GRID, s, target)
    + LEAN_COST_PER_S * Math.abs(s - around);
  let bare = t;
  for (let s = around - DECISION_WINDOW_S; s <= around + DECISION_WINDOW_S; s += 0.25) {
    assert.ok(f(s) >= f(t) - 1e-9, `lower at ${s}`);
    const l = expectedLoss(ONE_EGG.posterior, ONE_EGG_GRID, s, target);
    if (l < expectedLoss(ONE_EGG.posterior, ONE_EGG_GRID, bare, target)) bare = s;
  }
  assert.ok(Math.abs(bare - t) < 1, `the loss alone is lowest at ${bare.toFixed(2)}, the choice ${t.toFixed(2)}`);
});

test('2e. where the loss is flat, the choice stops at the earliest time that is as good as any', () => {
  // Resting on the counter at the softest level the pot allows, every time
  // past a point loses a whole egg - the yolk certainly too firm, the white
  // certainly set. Without the cost of leaning the minimum would be wherever
  // the last digits put it; with it, the choice stops where waiting longer
  // buys less than LEAN_COST_PER_S.
  const counter = appSetup({ cooling: 'counter' });
  const grid = gridFor(ONE_EGG, EGG, counter);
  const d = decideFor(ONE_EGG, grid, 0.0, counter);
  const target = logYolkTarget(meanSolve(ONE_EGG, 0.0, counter).level);
  const slope = (expectedLoss(ONE_EGG.posterior, grid, d.cookTime_s + 2, target)
    - expectedLoss(ONE_EGG.posterior, grid, d.cookTime_s - 2, target)) / 4;
  assert.ok(Math.abs(slope + LEAN_COST_PER_S) < 5e-5 || d.cookTime_s - d.meanCookTime_s >= DECISION_WINDOW_S - 0.1,
    `slope ${slope.toExponential(2)} at ${d.cookTime_s.toFixed(1)} (mean ${d.meanCookTime_s.toFixed(1)})`);
  assert.ok(d.cookTime_s - d.meanCookTime_s < DECISION_WINDOW_S, 'not pushed to the edge');
});

// --------------------------------------------------------------------------
// 3. Before any feedback, and just after it
// --------------------------------------------------------------------------

test('3a. before any egg the time is the literature\'s, exactly, on every pot', () => {
  for (const over of [{}, { startMode: 'cold' as const }, { cooling: 'tap' as const }, { eggStart_C: 20 }]) {
    const setup = appSetup(over);
    const grid = gridFor(PRIOR, EGG, setup);
    for (const level of LEVELS) {
      const m = meanSolve(PRIOR, level, setup);
      const literature = solveCookTime(EGG, setup, DEFAULT_PARAMS, donenessFromSlider(m.level)).result.cookTime_s;
      const d = decide(PRIOR, grid, m.sol, logYolkTarget(m.level));
      assert.equal(d.chosen, false);
      assert.equal(d.cookTime_s, literature);
    }
  }
});

test('3b. ...because under the prior alone the choice would run far from it (measured, not shipped)', () => {
  // The prior's time-scale sd is about +-70 s of cook time, so the yolk's part
  // of the loss is nearly flat and the white's tail steers. Measured on 28
  // September: jammy +42 s, soft +86 s, hard +2 s (`npm run decide -- lean`).
  const lean = (level: number): number => {
    const m = meanSolve(PRIOR, level);
    return chooseCookTime(PRIOR.posterior, PRIOR_GRID, logYolkTarget(m.level), m.sol.result.cookTime_s) - m.sol.result.cookTime_s;
  };
  assert.ok(lean(0.41) > 30, `jammy would lean ${lean(0.41).toFixed(1)} s`);
  assert.ok(lean(0.22) > 60, `soft would lean ${lean(0.22).toFixed(1)} s`);
  assert.ok(lean(1.0) < 12, `hard would lean ${lean(1.0).toFixed(1)} s`);
});

test('3c. after one egg the choice leans by seconds, whichever level is asked for next', () => {
  for (const level of [0.22, 0.41, 0.62, 1.0]) {
    const d = decideFor(ONE_EGG, ONE_EGG_GRID, level);
    assert.ok(d.chosen);
    assert.ok(Math.abs(d.cookTime_s - d.meanCookTime_s) < 10,
      `L${level}: mean ${d.meanCookTime_s.toFixed(1)}, chosen ${d.cookTime_s.toFixed(1)}`);
  }
  // And with the white skipped: the yolk alone pins the time-scale enough.
  const yolkOnly = replay(PRIOR, [recordAt(0.41, meanSolve(PRIOR, 0.41).sol.result.cookTime_s, 0, null)], COARSE);
  const grid = gridFor(yolkOnly, EGG, SETUP);
  for (const level of [0.22, 0.41, 0.62]) {
    const d = decideFor(yolkOnly, grid, level);
    assert.ok(Math.abs(d.cookTime_s - d.meanCookTime_s) < 10, `yolk only, L${level}: leaned ${(d.cookTime_s - d.meanCookTime_s).toFixed(1)} s`);
  }
});

// The odds' calibration on simulated cooks is test/decideOdds.test.ts, in a file
// of its own so that it runs beside this one.

// --------------------------------------------------------------------------
// 5. How fast the posterior narrows
// --------------------------------------------------------------------------

/** The owner's "still learning" rule (DECISIONS.md 9):
 *  the 80% interval of the right cook time wider than +-15 s. No screen shows
 *  it and `Decision` does not carry it; this computes it on demand, from
 *  `predictCookTime`. */
function stillLearning(interval: CookTimePrediction): boolean {
  return 0.5 * (interval.high_s - interval.low_s) > 15;
}

test('5b. the interval narrows below +-15 s after a few consistent eggs, stays there, and a forget widens it', () => {
  // A kitchen that is exactly the literature's, cooked at jammy at the times
  // the app chooses, answering as the truth would without noise. Measured on
  // 28 September on the app's surfaces: the interval is +-72 s before any
  // egg, +-22 after one, +-13 after two, and narrows egg by egg from there;
  // under a fixed resample jitter it would rise again at every resample. An
  // egg nobody answered about teaches nothing and moves nothing.
  const truth = { alpha_m2s: ALPHA_DEFAULT, logDoseOffset: 0, tauAirScale: 1, noise: 1e-6, whiteOffset: 0, whiteFirmGap: 1.08 };
  const flags: boolean[] = [];
  const widths: string[] = [];
  const c = copyCalibration(PRIOR);
  for (let egg = 0; egg <= 8; egg++) {
    const grid = gridFor(c, EGG, SETUP);
    const d = decideFor(c, grid, 0.41);
    const interval = predictCookTime(c.posterior, grid, logYolkTarget(0.41));
    flags.push(stillLearning(interval));
    widths.push((0.5 * (interval.high_s - interval.low_s)).toFixed(1));
    const t = d.cookTime_s;
    const truthGrid = buildRequestedGrid({ egg: EGG, setup: SETUP, tauAirScale: 1, spec: COARSE(ALPHA_DEFAULT, t) });
    const y = yolkProbit(truthGrid, truth, t, logYolkTarget(0.41));
    const w = whiteProbit(truthGrid, truth, t);
    const r = recordAt(0.41, t, y[0] > 0.5 ? -1 : y[2] > 0.5 ? 1 : 0, w[0] > 0.5 ? 'runny' : w[2] > 0.5 ? 'firm' : 'tender');
    foldRecord(c, r, buildRequestedGrid(gridRequestFor(c, r, COARSE)));
    const unanswered = recordAt(0.41, t, null, null);
    const before = JSON.stringify(c);
    foldRecord(c, unanswered, buildRequestedGrid(gridRequestFor(c, unanswered, COARSE)));
    assert.equal(JSON.stringify(c), before, 'an unanswered egg moves nothing');
  }
  console.log(`# still learning at jammy, a consistent cook: +-${widths.join(', ')} s`);
  const off = flags.indexOf(false);
  assert.ok(off >= 2 && off <= 5, `first quiet after egg ${off}: +-${widths.join(', ')} s`);
  assert.ok(flags.slice(off).every((f) => !f), `came back: +-${widths.join(', ')} s`);
  // "Forget what it learned" is a fresh calibration: learning again.
  assert.equal(stillLearning(predictCookTime(PRIOR.posterior, PRIOR_GRID, logYolkTarget(0.41))), true);
});
// --------------------------------------------------------------------------
// 6. The refusals, and a cook under way
// --------------------------------------------------------------------------

test('6a. the refusals still decide what the slider may ask for; the choice is made where they leave it', () => {
  // Runny is out of reach once the whites have been runny: the verdict snaps it
  // to the softest level whose white sets, and the choice leans from there.
  const twoRunny = replay(PRIOR, [recordAt(0.22, 419, null, 'runny'), recordAt(0.22, 419, null, 'runny')], COARSE);
  const grid = gridFor(twoRunny, EGG, SETUP);
  const params = calibrationParams(twoRunny);
  const asked = solveCookTime(EGG, SETUP, params, calibrationDoneness(twoRunny, 0.0));
  const v = verdictFor(asked, 0.0);
  assert.equal(v.kind, 'tooSoftForWhite');
  assert.ok(v.snapTo !== null && v.snapTo > 0.0);
  const d = decideFor(twoRunny, grid, 0.0);
  assert.ok(d.chosen);
  assert.ok(d.cookTime_s >= d.meanCookTime_s, 'near the white, the lean is later');

  // A pan that never sets the white: nothing to choose, the solver's answer stands.
  const standing = appSetup({ afterBoil: 'off', waterLitres: 2 });
  const sol = solveCookTime(EGG, standing, params, calibrationDoneness(twoRunny, 0.41));
  assert.equal(sol.whiteSets, false);
  assert.equal(decisionApplies(sol), false);
  const none = decide(twoRunny, grid, sol, logYolkTarget(0.41));
  assert.equal(none.chosen, false);
  assert.equal(none.cookTime_s, sol.result.cookTime_s);
});

test('6b. a cold start re-solved for its measured boil keeps its lean, to within a few seconds of choosing again', () => {
  // The boil is tapped with the egg in the water; a new surface is a second
  // away, so the lean chosen at "Eggs in" is carried (`carriedSolution`).
  const assumed = appSetup({ startMode: 'cold', timeToBoil_s: 480 });
  const measured = appSetup({ startMode: 'cold', timeToBoil_s: 600 });
  const c = knowing({ particles: PARTICLE_COUNT, eggsLogged: 6, taste: 0.15, white: 0.2, alphaFactor: 1.05 });
  const params = calibrationParams(c);
  const rows: string[] = [];
  for (const level of [0.22, 0.41, 0.62]) {
    const atStart = decideFor(c, gridFor(c, EGG, assumed), level, assumed);
    const lean = atStart.cookTime_s - atStart.meanCookTime_s;
    const m = meanSolve(c, level, measured);
    const carried = carriedSolution(EGG, measured, params, m.sol, lean).result.cookTime_s;
    const again = decide(c, gridFor(c, EGG, measured), m.sol, logYolkTarget(m.level)).cookTime_s;
    rows.push(`L${level}: lean ${lean.toFixed(1)} s, carried ${carried.toFixed(1)}, chosen again ${again.toFixed(1)}`);
    assert.ok(Math.abs(lean) > 3, `L${level}: a lean worth carrying (${lean.toFixed(1)} s)`);
    // Measured 28 September: 3.1 s at soft, where the white binds and the lean
    // depends on the ramp most; under a second at jammy and fudgy.
    assert.ok(Math.abs(carried - again) < 4, rows.join('; '));
  }
  console.log(`# carried lean, 480 s ramp assumed, 600 s measured: ${rows.join('; ')}`);
});

test('6c. one surface serves every level: the slider never waits for a grid', () => {
  // The surface is keyed on the pot and the posterior, never the level, and it
  // reaches past the soft and hard ends by the choice's whole window.
  const spec = decisionGridSpec(decisionInputs(ONE_EGG, EGG, SETUP));
  for (let level = 0; level <= 1.0001; level += 0.1) {
    const t = meanSolve(ONE_EGG, level).sol.result.cookTime_s;
    assert.ok(t - DECISION_WINDOW_S >= spec.timeMin_s - 1e-9 || spec.timeMin_s <= 20, `L${level.toFixed(1)} low`);
    assert.ok(t + DECISION_WINDOW_S <= spec.timeMax_s + 1e-9, `L${level.toFixed(1)} high`);
  }
});

// --------------------------------------------------------------------------
// 7. Two runny whites at soft, under the choice
// --------------------------------------------------------------------------

test('6d. the decided solution is the mean solve moved to the chosen time, and the mean solve itself at its own time', () => {
  const learned = replay(PRIOR, [recordAt(0.41, 464, 0, 'firm')], COARSE);
  const params = calibrationParams(learned);
  const sol = solveCookTime(EGG, SETUP, params, calibrationDoneness(learned, 0.41));
  const d = decide(learned, gridFor(learned, EGG, SETUP), sol, logYolkTarget(0.41));
  assert.ok(d.chosen);
  assert.notEqual(d.cookTime_s, sol.result.cookTime_s, 'the choice leans off the mean');
  const decided = decidedSolution(EGG, SETUP, params, sol, d);
  assert.equal(decided.result.cookTime_s, d.cookTime_s);
  assert.equal(decided.reachable, sol.reachable);
  assert.equal(decided.softestLevel, sol.softestLevel);
  // A later pull is a firmer yolk, and an earlier one softer.
  assert.equal(Math.sign(decided.result.yolkDose_min - sol.result.yolkDose_min),
    Math.sign(d.cookTime_s - sol.result.cookTime_s));
  // At the mean's own time it is the mean solve, not a re-simulation of it.
  assert.equal(decidedSolution(EGG, SETUP, params, sol, { ...d, cookTime_s: sol.result.cookTime_s }), sol);
});

test('6e. the nudge: every whole second from -10 to +10 alike, and only where a time is chosen', () => {
  const counts = new Map<number, number>();
  for (let i = 0; i < 2100; i++) {
    const n = nudgeSeconds((i + 0.5) / 2100);
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  assert.deepEqual([...counts.keys()].sort((a, b) => a - b), Array.from({ length: 21 }, (_, k) => k - NUDGE_MAX_S));
  for (const c of counts.values()) assert.equal(c, 100, 'each second equally likely');
  assert.equal(nudgeSeconds(-1), -NUDGE_MAX_S);
  assert.equal(nudgeSeconds(1), NUDGE_MAX_S);

  const learned = replay(PRIOR, [recordAt(0.41, 464, 0, 'firm')], COARSE);
  const params = calibrationParams(learned);
  const sol = solveCookTime(EGG, SETUP, params, calibrationDoneness(learned, 0.41));
  const d = decide(learned, gridFor(learned, EGG, SETUP), sol, logYolkTarget(0.41));
  const nudged = decidedSolution(EGG, SETUP, params, sol, d, -7);
  assert.equal(nudged.result.cookTime_s, d.cookTime_s - 7);
  assert.equal(appliedNudge(sol, -7), -7);
  // Where the solver's answer stands, the nudge is not taken: that answer is
  // the furthest the pan goes.
  const stands = { ...sol, whiteSets: false };
  assert.equal(appliedNudge(stands, -7), 0);
  assert.equal(decidedSolution(EGG, SETUP, params, stands, { ...d, cookTime_s: sol.result.cookTime_s }, -7), stands);
});

test('7. two runny whites at soft: what the choice does at soft and at jammy', () => {
  // Two eggs at soft, the white runny - alone, or with the yolk just right -
  // built two ways. 'E3' cooks each at the time the MEAN solve recommends
  // (test/infer.test.ts 5), so it shows what the choice makes of the same
  // evidence; 'E5' cooks the second egg at the time the choice made after
  // the first. The known limit stands (INFERENCE.md section 3): a runny white
  // is blamed on the time-scale about 2:1, so jammy moves too, and the choice
  // does not try to fix that. The LOGBOOK's numbers (28 September) are `npm run
  // decide -- runny`, on the app's surfaces; these are coarser, and within a
  // few seconds of them.
  const rows: string[] = [];
  const before = [decideFor(PRIOR, PRIOR_GRID, 0.22), decideFor(PRIOR, PRIOR_GRID, 0.41)];
  for (const sequence of ['E3', 'E5'] as const) {
    for (const yolk of [null, 0] as (Feedback | null)[]) {
      let cal = PRIOR;
      const log: EggRecord[] = [];
      for (let i = 0; i < 2; i++) {
        const d = decideFor(cal, gridFor(cal, EGG, SETUP), 0.22);
        log.push(recordAt(0.22, sequence === 'E3' ? d.meanCookTime_s : d.cookTime_s, yolk, 'runny'));
        cal = replay(PRIOR, log, COARSE);
      }
      const grid = gridFor(cal, EGG, SETUP);
      const after = [decideFor(cal, grid, 0.22), decideFor(cal, grid, 0.41)];
      rows.push(`${sequence}, ${yolk === null ? 'white only' : 'yolk just right too'}, cooked at ${log.map((r) => r.recommended_s.toFixed(0)).join(' and ')}: `
        + `soft ${before[0].cookTime_s.toFixed(0)} -> mean ${after[0].meanCookTime_s.toFixed(0)}, chosen ${after[0].cookTime_s.toFixed(0)} (${after[0].oddsTenths}/10); `
        + `jammy ${before[1].cookTime_s.toFixed(0)} -> mean ${after[1].meanCookTime_s.toFixed(0)}, chosen ${after[1].cookTime_s.toFixed(0)} (${after[1].oddsTenths}/10)`);
      assert.ok(after[0].cookTime_s > before[0].cookTime_s + 15, rows.join('\n'));
      // Where the white binds, the choice leans later than the mean solve, never
      // earlier: the mean solve times the white at its median, a coin flip on
      // runny, and a runny white costs three.
      assert.ok(after[0].cookTime_s >= after[0].meanCookTime_s - 1, rows.join('\n'));
      assert.ok(Math.abs(after[0].cookTime_s - after[0].meanCookTime_s) <= DECISION_WINDOW_S + 1e-9);
    }
  }
  console.log(`# ${rows.join('\n# ')}`);
});
