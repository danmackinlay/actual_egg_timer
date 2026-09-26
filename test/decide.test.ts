/**
 * E5: choosing the time under uncertainty, the odds on screen, and "still
 * learning" (INFERENCE.md section 8, src/core/decide.ts).
 *
 * The claims the phase is done on: the choice is right on posteriors built to
 * know something - a cook who likes a firmer yolk gets a later time at every
 * level, which the mean solve never gave them; before any egg the time is the
 * literature's, and after one it leans by seconds, not by the 43 s the prior
 * alone would have it lean; the odds are calibrated on simulated cooks, as
 * E2's answers were; and "still learning" goes where the rule says. Also: the
 * refusals still work, a cook under way keeps its lean, and the numbers for two
 * runny whites at soft (E3's half-met test) as the choice now sees them.
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
  DECISION_WINDOW_S, Decision, LEAN_COST_PER_S, RUNNY_WHITE_LOSS, STILL_LEARNING_EGGS,
  carriedSolution, chooseCookTime, decide, decideAt, decisionApplies, decisionGridRequest,
  decisionGridSpec, decisionInputs, expectedLoss, hitOdds,
} from '../src/core/decide.js';
import { DoseGrid } from '../src/core/doseGrid.js';
import {
  Feedback, Posterior, UNRELATED, WhiteReport, createPrior, whiteAnswerProbabilities,
  yolkAnswerProbabilities,
} from '../src/core/infer.js';
import { ALPHA_DEFAULT, ALPHA_REL_SD } from '../src/core/constants.js';
import { eggFromMass } from '../src/core/geometry.js';
import { CookSetup } from '../src/core/protocol.js';
import {
  DEFAULT_PARAMS, Solution, donenessFromSlider, solveCookTime,
} from '../src/core/solve.js';
import {
  CALIBRATION_SEED, GridSpec, PARTICLE_COUNT, calibrationGrid, verdictFor,
} from '../src/core/policy.js';
import {
  Calibration, EggRecord, PRIOR_ID, buildRequestedGrid, calibrationDoneness, calibrationParams,
  freshCalibration, replay,
} from '../src/core/record.js';

// --------------------------------------------------------------------------
// shared
// --------------------------------------------------------------------------

const EGG = eggFromMass(0.068);

function setupOf(over: Partial<CookSetup> = {}): CookSetup {
  return {
    startMode: 'hot', eggStart_C: 4, ambient_C: 20, boiling_C: 100, timeToBoil_s: 480,
    cooling: 'ice', afterBoil: 'hold', waterLitres: 2, eggCount: 2, ...over,
  };
}

const SETUP = setupOf();
const LEVELS = [0.22, 0.41, 0.62, 0.85, 1.0];

function logTarget(level: number): number {
  return Math.log10(donenessFromSlider(level).yolkDose_min);
}

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
  return decide(c, grid, m.sol, logTarget(m.level));
}

/** A surface for this calibration and pot: the production extent at a third
 *  of its cost - 9 rows and 20 s columns where the app has 13 and 10. What is
 *  checked here is what the choice does, which a second either way does not
 *  change; `npm run decide` measures the production surface against a fine one
 *  (1.3 s at worst), and fixtures/decide.json pins the arithmetic. */
function gridFor(c: Calibration, setup = SETUP): DoseGrid {
  const q = decisionGridRequest(decisionInputs(c, EGG, setup));
  const count = Math.ceil((q.spec.timeMax_s - q.spec.timeMin_s) / 20) + 1;
  return buildRequestedGrid({
    ...q, spec: { ...q.spec, alphaCount: 9, timeMax_s: q.spec.timeMin_s + 20 * (count - 1), timeCount: count },
  });
}

/** The folds' surfaces, coarser than the app's for the same reason. */
const COARSE = (alphaCentre: number, cookTime_s: number): GridSpec => ({
  ...calibrationGrid(alphaCentre, cookTime_s), alphaCount: 9, timeCount: 12,
});

/** A posterior that KNOWS: the time-scale to 2%, the taste and the white to a
 *  twentieth of a decade, around the centres given. Built from a real prior so
 *  the noise and the firm gap are the prior's. */
function knowing(taste: number, white: number, alphaFactor = 1): Calibration {
  const post = createPrior(PARTICLE_COUNT, CALIBRATION_SEED);
  for (let i = 0; i < post.particles.length; i++) {
    const p = post.particles[i];
    const z = Math.log(p.alpha_m2s / ALPHA_DEFAULT) / ALPHA_REL_SD;
    post.particles[i] = {
      ...p,
      alpha_m2s: ALPHA_DEFAULT * alphaFactor * Math.exp(0.02 * z),
      logDoseOffset: taste + 0.05 * p.logDoseOffset / 0.22,
      whiteOffset: white + 0.05 * p.whiteOffset / 0.5,
    };
  }
  return { posterior: post, eggsLogged: 6 };
}

function recordAt(level: number, t: number, yolk: Feedback | null, white: WhiteReport | null, setup = SETUP): EggRecord {
  return {
    v: 1, uid: null, day: '2026-09-28', app: 'web', appVersion: '0.2.0', prior: PRIOR_ID,
    egg: { mass_g: 68, massFrom: 'class', sizeTable: 'eu' },
    setup: {
      startMode: setup.startMode, eggStart_C: setup.eggStart_C, eggFrom: 'fridge',
      ambient_C: setup.ambient_C, boiling_C: setup.boiling_C, timeToBoil_s: setup.timeToBoil_s,
      timeToBoilFrom: 'default', cooling: setup.cooling, afterBoil: setup.afterBoil ?? 'hold',
      waterLitres: setup.waterLitres, eggCount: setup.eggCount,
    },
    level: level, recommended_s: t, nudge_s: 0, pulled_s: t, pulledBy: 'timeout', cooled_s: 180,
    yolk: yolk, white: white, whiteOffered: true, probe: null, lang: 'en', register: 'modern', units: 'metric',
  };
}

const PRIOR = freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED);
const PRIOR_GRID = gridFor(PRIOR);

/** One egg at the literature's jammy time, answered as a cook with the
 *  literature's kitchen would: just right, and a firm white. */
const ONE_EGG = replay(PRIOR, [recordAt(0.41, meanSolve(PRIOR, 0.41).sol.result.cookTime_s, 0, 'firm')], COARSE);
const ONE_EGG_GRID = gridFor(ONE_EGG);

// --------------------------------------------------------------------------
// 1. The loss and the odds
// --------------------------------------------------------------------------

test('1a. for one particle, the loss is the answers\' less a constant, and the odds their product', () => {
  // The unrelated share adds the same amount to every candidate time, so the
  // loss leaves it out; the odds keep it, because they are about what a cook
  // will SAY.
  const one: Posterior = { particles: [PRIOR.posterior.particles[7]], weights: [1], rng: 1 };
  for (const t of [380, 430, 470, 520]) {
    const target = logTarget(0.41);
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
  const target = logTarget(0.22);
  const y = yolkAnswerProbabilities(PRIOR.posterior, PRIOR_GRID, t, target);
  const w = whiteAnswerProbabilities(PRIOR.posterior, PRIOR_GRID, t);
  const joint = hitOdds(PRIOR.posterior, PRIOR_GRID, t, target);
  assert.ok(joint > y[1] * (1 - w[0]) + 0.005, `joint ${joint.toFixed(3)}, product ${(y[1] * (1 - w[0])).toFixed(3)}`);
});

// --------------------------------------------------------------------------
// 2. The choice, on posteriors built to know something
// --------------------------------------------------------------------------

const NEUTRAL = knowing(0, 0);
const NEUTRAL_GRID = gridFor(NEUTRAL);

test('2a. a posterior that knows the cook likes a firmer yolk moves the time later, at every level', () => {
  // The gap E5 closes: until now the taste offset never reached the time. The
  // mean solve for these two posteriors is the same to the second, because
  // their time-scales are; the choice is not.
  const firmer = knowing(0.2, 0);
  const softer = knowing(-0.2, 0);
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
  const late = knowing(0, 0.6);
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
    assert.ok(!d.stillLearning);
  }
});

test('2d. the choice is the minimum inside its window, and the cost of leaning moves it by under a second', () => {
  const target = logTarget(0.41);
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
  const counter = setupOf({ cooling: 'counter' });
  const grid = gridFor(ONE_EGG, counter);
  const d = decideFor(ONE_EGG, grid, 0.0, counter);
  const target = logTarget(meanSolve(ONE_EGG, 0.0, counter).level);
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
    const setup = setupOf(over);
    const grid = gridFor(PRIOR, setup);
    for (const level of LEVELS) {
      const m = meanSolve(PRIOR, level, setup);
      const literature = solveCookTime(EGG, setup, DEFAULT_PARAMS, donenessFromSlider(m.level)).result.cookTime_s;
      const d = decide(PRIOR, grid, m.sol, logTarget(m.level));
      assert.equal(d.chosen, false);
      assert.equal(d.cookTime_s, literature);
      assert.ok(d.stillLearning);
    }
  }
});

test('3b. ...because under the prior alone the choice would run far from it (measured, not shipped)', () => {
  // The prior's time-scale sd is about +-70 s of cook time, so the yolk's part
  // of the loss is nearly flat and the white's tail steers. Measured on 28
  // September: jammy +42 s, soft +86 s, hard +2 s (`npm run decide -- lean`).
  const lean = (level: number): number => {
    const m = meanSolve(PRIOR, level);
    return chooseCookTime(PRIOR.posterior, PRIOR_GRID, logTarget(m.level), m.sol.result.cookTime_s) - m.sol.result.cookTime_s;
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
  const grid = gridFor(yolkOnly);
  for (const level of [0.22, 0.41, 0.62]) {
    const d = decideFor(yolkOnly, grid, level);
    assert.ok(Math.abs(d.cookTime_s - d.meanCookTime_s) < 10, `yolk only, L${level}: leaned ${(d.cookTime_s - d.meanCookTime_s).toFixed(1)} s`);
  }
});

// The odds' calibration on simulated cooks is test/decideOdds.test.ts, in a file
// of its own so that it runs beside this one.

// --------------------------------------------------------------------------
// 5. Still learning
// --------------------------------------------------------------------------

test('5. "still learning" for the first STILL_LEARNING_EGGS eggs that taught anything, and after a forget', () => {
  assert.equal(STILL_LEARNING_EGGS, 4);
  const log: EggRecord[] = [];
  const flags: boolean[] = [];
  for (let i = 0; i <= 6; i++) {
    const c = replay(PRIOR, log, COARSE);
    flags.push(decideAt(c.posterior, c.eggsLogged, PRIOR_GRID, 464, true, logTarget(0.41)).stillLearning);
    // Every other egg is never answered: it is a record, and it teaches nothing.
    log.push(recordAt(0.41, 464, 0, 'firm'));
    log.push(recordAt(0.41, 464, null, null));
  }
  assert.deepEqual(flags, [true, true, true, true, false, false, false]);
  // "Forget what it learned" is a fresh calibration: learning again.
  assert.equal(decideAt(PRIOR.posterior, 0, PRIOR_GRID, 464, true, logTarget(0.41)).stillLearning, true);
});

// --------------------------------------------------------------------------
// 6. The refusals, and a cook under way
// --------------------------------------------------------------------------

test('6a. the refusals still decide what the slider may ask for; the choice is made where they leave it', () => {
  // Runny is out of reach once the whites have been runny: the verdict snaps it
  // to the softest level whose white sets, and the choice leans from there.
  const twoRunny = replay(PRIOR, [recordAt(0.22, 419, null, 'runny'), recordAt(0.22, 419, null, 'runny')], COARSE);
  const grid = gridFor(twoRunny);
  const params = calibrationParams(twoRunny);
  const asked = solveCookTime(EGG, SETUP, params, calibrationDoneness(twoRunny, 0.0));
  const v = verdictFor(asked, 0.0);
  assert.equal(v.kind, 'tooSoftForWhite');
  assert.ok(v.snapTo !== null && v.snapTo > 0.0);
  const d = decideFor(twoRunny, grid, 0.0);
  assert.ok(d.chosen);
  assert.ok(d.cookTime_s >= d.meanCookTime_s, 'near the white, the lean is later');

  // A pan that never sets the white: nothing to choose, the solver's answer stands.
  const standing = setupOf({ afterBoil: 'off', waterLitres: 2 });
  const sol = solveCookTime(EGG, standing, params, calibrationDoneness(twoRunny, 0.41));
  assert.equal(sol.whiteSets, false);
  assert.equal(decisionApplies(sol), false);
  const none = decide(twoRunny, grid, sol, logTarget(0.41));
  assert.equal(none.chosen, false);
  assert.equal(none.cookTime_s, sol.result.cookTime_s);
});

test('6b. a cold start re-solved for its measured boil keeps its lean, to within a few seconds of choosing again', () => {
  // The boil is tapped with the egg in the water; a new surface is a second
  // away, so the lean chosen at "Eggs in" is carried (`carriedSolution`).
  const assumed = setupOf({ startMode: 'cold', timeToBoil_s: 480 });
  const measured = setupOf({ startMode: 'cold', timeToBoil_s: 600 });
  const c = knowing(0.15, 0.2, 1.05);
  const params = calibrationParams(c);
  const rows: string[] = [];
  for (const level of [0.22, 0.41, 0.62]) {
    const atStart = decideFor(c, gridFor(c, assumed), level, assumed);
    const lean = atStart.cookTime_s - atStart.meanCookTime_s;
    const m = meanSolve(c, level, measured);
    const carried = carriedSolution(EGG, measured, params, m.sol, lean).result.cookTime_s;
    const again = decide(c, gridFor(c, measured), m.sol, logTarget(m.level)).cookTime_s;
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
// 7. Two runny whites at soft (E3's half-met test, under E5)
// --------------------------------------------------------------------------

test('7. two runny whites at soft: what the choice does at soft and at jammy', () => {
  // Two eggs at soft, the white runny - alone, or with the yolk just right -
  // built two ways. E3's construction cooks each at the time the MEAN solve
  // recommended then (test/infer.test.ts 5), so it shows what E5 makes of the
  // same evidence; E5's own sequence cooks the second egg at the time E5 chose
  // after the first. The known limit stands (INFERENCE.md section 3): a runny
  // white is blamed on the time-scale about 2:1, so jammy moves too, and E5 does
  // not try to fix that. The LOGBOOK's numbers (28 September) are `npm run
  // decide -- runny`, on the app's surfaces; these are coarser, and within a
  // few seconds of them.
  const rows: string[] = [];
  const before = [decideFor(PRIOR, PRIOR_GRID, 0.22), decideFor(PRIOR, PRIOR_GRID, 0.41)];
  for (const sequence of ['E3', 'E5'] as const) {
    for (const yolk of [null, 0] as (Feedback | null)[]) {
      let cal = PRIOR;
      const log: EggRecord[] = [];
      for (let i = 0; i < 2; i++) {
        const d = decideFor(cal, gridFor(cal), 0.22);
        log.push(recordAt(0.22, sequence === 'E3' ? d.meanCookTime_s : d.cookTime_s, yolk, 'runny'));
        cal = replay(PRIOR, log, COARSE);
      }
      const grid = gridFor(cal);
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
