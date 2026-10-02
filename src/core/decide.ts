/**
 * Deciding, not just estimating (INFERENCE.md section 8).
 *
 * Why not solve at the posterior MEAN of the time-scale and `tauAirScale`,
 * with the white's cutpoint moved by the mean white offset? Three things are
 * wrong with that. The learned yolk taste offset never reaches the
 * recommendation - only the part of a "too soft" answer the posterior happens
 * to blame on the time-scale moves the time. The noise and the spread of the
 * posterior play no part, so a cook the model knows nothing about gets the
 * same time as one it knows well. And the two ways of getting an egg wrong are
 * treated alike, when a runny white is worse than a yolk a step too firm.
 *
 * So the time is CHOSEN. Every particle is a whole hypothesis about this
 * cook - time-scale, taste, noise, white offset, tender | firm gap - and for a
 * candidate pull time each one says how likely each answer is, through the
 * same probit the filter learns with. The expected loss of the candidate is
 *
 *     P(too soft) + P(too firm) + RUNNY_WHITE_LOSS * P(runny)
 *
 * over the posterior, and the recommendation is the candidate that minimises
 * it. RUNNY_WHITE_LOSS is 3: the owner's number (DECISIONS.md 7), a
 * constant, and a per-cook slider only if someone asks.
 *
 * NOT BEFORE THE FIRST EGG. Under the prior alone the choice runs far from the
 * literature: 42 s later at jammy and 86 s at soft, on the reference egg, and
 * the first egg comes out a step too firm. The reason is the prior's width,
 * not the loss. A time-scale sd of 11.9% is about +-70 s of cook time, so the
 * yolk's part of the loss is nearly flat - no time gets the yolk right more
 * than one egg in five - and the white's tail is what is left to steer by. The
 * prior is wide so that the filter can learn, not because anyone believes one
 * kitchen in twenty turns a jammy egg's white runny. One answer of any kind
 * pins the time-scale to about 6%, and from then on the choice leans by a few
 * seconds (test/decide.test.ts). So until an egg has taught something, the
 * time is the literature's, exactly as `calibrationParams` gives it,
 * and only the odds are read from the prior.
 *
 * THE SURFACE. The loss needs the delivered log doses at every particle's
 * time-scale for every candidate time, for the setup on screen. The offsets
 * and the noise are additive in log dose, so only the time-scale needs the
 * physics: a dose grid over (alpha, time) for the current egg and pot, with
 * `tauAirScale` held at its posterior mean as every grid in this repo holds it.
 * The grid does not depend on the slider. It spans every level this pot can
 * deliver, from a little before the white sets to a little past the hardest
 * yolk, so a cook dragging the slider is answered from one grid, with no
 * rebuild and no jump (`decisionGridSpec`). It costs several hundred
 * simulations, which is why the apps build it off the main thread and keep one
 * per setup.
 *
 * THE REFUSALS. The mean solve still runs first, and still decides what the
 * slider may ask for: `verdictFor` reads it, snaps a doneness
 * the white forbids up to the softest one it allows, and says why. The choice
 * is then made at the level the verdict leaves, within DECISION_WINDOW_S of the
 * mean solve's time. It never overrides a refusal; it only leans. Where there is
 * no cook to choose - the white never sets, or the doneness was out of reach and
 * could not be snapped into it - the solver's own answer stands
 * (`decisionApplies`), because that answer is already the furthest the pan goes.
 *
 * THE ODDS. P(hit the mark): the posterior predictive probability
 * that the cook answers "not runny" about the white AND "just right" about the
 * yolk, at the time recommended. Within one particle the two answers are
 * independent - two readings of two latents - and across particles they are
 * correlated, because a slow time-scale makes both late. The probabilities are
 * the answers', unrelated share included, so they are calibrated against what
 * cooks SAY, which is all anyone can check them against. The odds decide
 * which levels the slider offers (reach.ts) and when the app says how to make
 * a cook more reliable.
 *
 * How much is still being learned is not decided here: that is the width of
 * `predictCookTime` (infer.ts), read on demand.
 *
 * Pure, like the rest of `src/core/`.
 */

import { Egg } from './geometry.js';
import { CookSetup } from './protocol.js';
import {
  ModelParams, Solution, YOLK_DOSE_HARD, simulate, solveCookTime,
} from './solve.js';
import { DoseGrid, GridRequest, GridSpec } from './doseGrid.js';
import {
  Posterior, UNRELATED, whiteProbit, withUnrelated, yolkProbit,
} from './infer.js';
import { Calibration, calibrationDoneness, calibrationParams } from './record.js';

/** How much worse a runny white is than a yolk one answer off: the owner's
 *  number (DECISIONS.md 7). */
export const RUNNY_WHITE_LOSS = 3;

/* ------------------------------------------------------------ the surface */

/** The time-scale span of a decision grid, as factors on the posterior mean,
 *  and how many rows. The span is +-4 prior sds; a particle beyond it reads the
 *  edge row, which only the tails of a fresh prior ever do. */
export const DECISION_ALPHA_LO = 0.6;
export const DECISION_ALPHA_HI = 1.65;
export const DECISION_ALPHA_COUNT = 13;

/** The time axis, s between columns. */
export const DECISION_TIME_STEP_S = 10;

/** How far either side of the mean solve's time the choice may go, s, and so how
 *  far past the softest and hardest levels the grid reaches. */
export const DECISION_WINDOW_S = 120;

/** No decision grid starts before this, s: shorter than any egg. */
const DECISION_TIME_MIN_S = 20;

/** What a decision grid is built from: the pot, the egg, and where the
 *  posterior stands. Plain data, so it can cross to a Web Worker, and cheap to
 *  compare, so the apps can keep one grid per setup. */
export interface DecisionInputs {
  egg: Egg;
  setup: CookSetup;
  /** The posterior mean time-scale and carryover scale, which centre the grid,
   *  as `calibrationParams` has them. */
  params: ModelParams;
  /** The white's target, as `calibrationDoneness` has it: it says where the
   *  softest level is. */
  whiteDose_min: number;
}

export function decisionInputs(c: Calibration, egg: Egg, setup: CookSetup): DecisionInputs {
  return {
    egg: egg,
    setup: setup,
    params: calibrationParams(c),
    whiteDose_min: calibrationDoneness(c, 1.0).whiteDose_min,
  };
}

/**
 * Where the decision grid goes, for this pot: every level the pot can deliver,
 * and DECISION_WINDOW_S either side.
 *
 * `solveCookTime` at level 1 answers both ends. Its shortest white-setting cook
 * is the soft end of the slider, and its answer is the hard end: the hardest
 * yolk, or - with the heat off, where the pan may not get there - the start of
 * the plateau, which is the furthest anyone would pull.
 */
export function decisionGridSpec(inputs: DecisionInputs): GridSpec {
  const hard = solveCookTime(inputs.egg, inputs.setup, inputs.params, {
    level: 1, yolkDose_min: YOLK_DOSE_HARD, whiteDose_min: inputs.whiteDose_min,
  });
  const soft_s = hard.minCookTime_s;
  const hard_s = hard.result.cookTime_s > soft_s ? hard.result.cookTime_s : soft_s;
  const lo = Math.max(DECISION_TIME_MIN_S, Math.min(soft_s, hard_s) - DECISION_WINDOW_S);
  const hi = hard_s + DECISION_WINDOW_S;
  const count = Math.ceil((hi - lo) / DECISION_TIME_STEP_S) + 1;
  const alpha = inputs.params.alpha_m2s;
  return {
    alphaMin: alpha * DECISION_ALPHA_LO,
    alphaMax: alpha * DECISION_ALPHA_HI,
    alphaCount: DECISION_ALPHA_COUNT,
    timeMin_s: lo,
    timeMax_s: lo + DECISION_TIME_STEP_S * (count - 1),
    timeCount: count,
  };
}

export function decisionGridRequest(inputs: DecisionInputs): GridRequest {
  return {
    egg: inputs.egg,
    setup: inputs.setup,
    tauAirScale: inputs.params.tauAirScale,
    spec: decisionGridSpec(inputs),
  };
}

/* ------------------------------------------------------------- the choice */

/** The expected loss of pulling at `cookTime_s`, over the posterior. The
 *  unrelated share is left out: it adds the same constant at every time, so it
 *  cannot move the choice. */
export function expectedLoss(
  post: Posterior, grid: DoseGrid, cookTime_s: number, logNominalTarget: number,
): number {
  let loss = 0.0;
  let total = 0.0;
  for (let i = 0; i < post.particles.length; i++) {
    const w = post.weights[i];
    if (w === 0.0) continue;
    const p = post.particles[i];
    const yolk = yolkProbit(grid, p, cookTime_s, logNominalTarget);
    const white = whiteProbit(grid, p, cookTime_s);
    loss += w * (yolk[0] + yolk[2] + RUNNY_WHITE_LOSS * white[0]);
    total += w;
  }
  return total > 0.0 ? loss / total : 0.0;
}

/** P(the white is not runny AND the yolk is just right), as the cook would
 *  answer it: see the header. */
export function hitOdds(
  post: Posterior, grid: DoseGrid, cookTime_s: number, logNominalTarget: number,
): number {
  let hit = 0.0;
  let total = 0.0;
  for (let i = 0; i < post.particles.length; i++) {
    const w = post.weights[i];
    if (w === 0.0) continue;
    const p = post.particles[i];
    const yolk = yolkProbit(grid, p, cookTime_s, logNominalTarget);
    const white = whiteProbit(grid, p, cookTime_s);
    const right = withUnrelated(yolk[1]);
    // withUnrelated(white[1]) + withUnrelated(white[2]), in one step.
    const set = (1.0 - UNRELATED) * (1.0 - white[0]) + 2.0 * UNRELATED / 3.0;
    hit += w * right * set;
    total += w;
  }
  return total > 0.0 ? hit / total : 0.0;
}

/**
 * What leaning costs, in eggs per second away from the mean solve: ten seconds
 * cost a thousandth of an egg.
 *
 * Without it the choice is not defined where the loss is flat. On the counter
 * at the softest level, or once whites have come out runny twice, every time
 * past a point loses the same whole egg - the yolk certainly too firm, the
 * white certainly set - and the minimum is wherever the arithmetic's last
 * digits put it: 17 s apart on two surfaces that agree everywhere else, and
 * usually at the edge of the window. With it, the choice stops where waiting
 * longer buys less than this, which is the earliest time that is as good as
 * any. Where the loss has a real minimum it moves the choice by about a
 * quarter of a second (test/decide.test.ts).
 */
export const LEAN_COST_PER_S = 1e-4;

/** Coarse step of the search, s. */
const CHOICE_SCAN_STEP_S = 4;
/** The golden-section refinement stops when the bracket is this narrow, s. */
const REFINE_TOL_S = 0.02;
const INV_PHI = (Math.sqrt(5.0) - 1.0) / 2.0;

/** What the search minimises: the expected loss, and the cost of leaning. */
function objective(
  post: Posterior, grid: DoseGrid, t: number, logNominalTarget: number, around_s: number,
): number {
  return expectedLoss(post, grid, t, logNominalTarget) + LEAN_COST_PER_S * Math.abs(t - around_s);
}

/**
 * The time that minimises the expected loss, plus LEAN_COST_PER_S for every
 * second away from `around_s`, within DECISION_WINDOW_S of it and inside the
 * grid.
 *
 * A scan at CHOICE_SCAN_STEP_S finds the lowest sample - the first, on a tie - and a
 * golden-section search inside the two steps around it finds the minimum to
 * REFINE_TOL_S. The scan is what makes it safe: the loss is not guaranteed to
 * have one minimum over the whole window, and a golden section alone could
 * settle in the wrong one. Both apps take the same steps in the same order, so
 * they land on the same time.
 */
export function chooseCookTime(
  post: Posterior, grid: DoseGrid, logNominalTarget: number, around_s: number,
): number {
  const gridHi = grid.timeMin_s + grid.timeStep_s * (grid.timeCount - 1);
  const lo = Math.max(grid.timeMin_s, around_s - DECISION_WINDOW_S);
  const hi = Math.min(gridHi, around_s + DECISION_WINDOW_S);
  if (!(hi > lo)) return around_s;
  const f = (t: number): number => objective(post, grid, t, logNominalTarget, around_s);
  const steps = Math.ceil((hi - lo) / CHOICE_SCAN_STEP_S);
  const step = (hi - lo) / steps;
  let best = 0;
  let bestValue = Number.POSITIVE_INFINITY;
  for (let k = 0; k <= steps; k++) {
    const v = f(lo + step * k);
    if (v < bestValue) {
      bestValue = v;
      best = k;
    }
  }
  let a = lo + step * (best > 0 ? best - 1 : 0);
  let b = lo + step * (best < steps ? best + 1 : steps);
  let c = b - INV_PHI * (b - a);
  let d = a + INV_PHI * (b - a);
  let fc = f(c);
  let fd = f(d);
  while (b - a > REFINE_TOL_S) {
    if (fc <= fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - INV_PHI * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + INV_PHI * (b - a);
      fd = f(d);
    }
  }
  const mid = 0.5 * (a + b);
  // The refinement cannot do worse than the scan's best sample.
  return f(mid) <= bestValue ? mid : lo + step * best;
}

/* ------------------------------------------------------------ the decision */

/** Everything the screen needs about one recommendation. */
export interface Decision {
  /** The time to pull, s from eggs in. */
  cookTime_s: number;
  /** What the mean solve said, which the choice started from. */
  meanCookTime_s: number;
  /** Whether the time was chosen, or is the mean solve's: see `decideAt`. */
  chosen: boolean;
  /** P(hit the mark) at `cookTime_s`, and the same in tenths, which is how
   *  the reach and the advice thresholds are written. Not on screen. */
  odds: number;
  oddsTenths: number;
}

/** Whether a solve leaves a cook to choose a time for. Not when the white never
 *  sets, and not when the doneness asked for was out of reach and could not be
 *  snapped into it: the solver's answer there is the furthest the pan goes, and
 *  it stands. */
export function decisionApplies(sol: Solution): boolean {
  return sol.whiteSets && sol.reachable;
}

/** Tenths, which is how the reach and advice thresholds are written. Half away from zero, which is what
 *  both languages' plain rounding does for a probability. */
export function oddsInTenths(odds: number): number {
  return Math.round(odds * 10);
}

/**
 * Decide, from the parts: the time, and the odds there.
 *
 * The time is chosen when `applies` - there is a cook to choose for - and at
 * least one egg has taught something (see the header); otherwise it is
 * `meanCookTime_s`, and only the odds are read there.
 */
export function decideAt(
  post: Posterior, eggsLogged: number, grid: DoseGrid, meanCookTime_s: number, applies: boolean,
  logNominalTarget: number,
): Decision {
  const chosen = applies && eggsLogged > 0;
  const t = chosen ? chooseCookTime(post, grid, logNominalTarget, meanCookTime_s) : meanCookTime_s;
  const odds = hitOdds(post, grid, t, logNominalTarget);
  return {
    cookTime_s: t,
    meanCookTime_s: meanCookTime_s,
    chosen: chosen,
    odds: odds,
    oddsTenths: oddsInTenths(odds),
  };
}

/** Decide for a mean solve at `logNominalTarget` - the level the verdict left,
 *  after any snap. */
export function decide(
  c: Calibration, grid: DoseGrid, sol: Solution, logNominalTarget: number,
): Decision {
  return decideAt(
    c.posterior, c.eggsLogged, grid, sol.result.cookTime_s, decisionApplies(sol), logNominalTarget,
  );
}

/** The solve, re-read at another time: the same verdict and limits, and the
 *  cook the mean parameters predict at `cookTime_s`, so the peak yolk and the
 *  texture on screen describe the egg being offered rather than the one the
 *  mean solve found. */
function solutionAt(
  egg: Egg, setup: CookSetup, params: ModelParams, sol: Solution, cookTime_s: number,
): Solution {
  if (cookTime_s === sol.result.cookTime_s) return sol;
  return { ...sol, result: simulate(egg, setup, params, cookTime_s) };
}

/** The solve, at the decided time, moved by the nudge where one applies
 *  (`appliedNudge`). */
export function decidedSolution(
  egg: Egg, setup: CookSetup, params: ModelParams, sol: Solution, d: Decision, nudge_s = 0,
): Solution {
  return solutionAt(egg, setup, params, sol, d.cookTime_s + appliedNudge(sol, nudge_s));
}

/* ------------------------------------------------------------- the nudge */

/**
 * The most the nudge moves a time, s, either way (INFERENCE.md section 8,
 * E8).
 *
 * WHY. The app chooses the time as a function of the inputs, so every egg a
 * cook reports on lies on one surface - the time the app thinks right - and
 * the slopes off that surface are never seen: whether ten seconds more would
 * have been "too firm" is a question the data cannot answer. Moving the time
 * by a few seconds, at random, for cooks who have agreed to it (the consent,
 * `share.what`), puts eggs either side of the surface at no cost a cook can
 * taste, and the movement is independent of everything about the cook, so it
 * is an estimate free of selection.
 *
 * WHY TEN. "Just right" is about +-12 s wide on the reference egg (a 10 g size
 * class is +-24 s, twice the band; INFERENCE.md section 4), so +-10 s stays
 * inside it. What it costs is measured, not assumed (`npm run decide --
 * nudge`, LOGBOOK.md).
 */
export const NUDGE_MAX_S = 10;

/** A uniform draw on [0, 1) as the nudge: a whole number of seconds from
 *  -NUDGE_MAX_S to +NUDGE_MAX_S, each equally likely, so the nudge is
 *  centred on the chosen time. The app supplies the randomness, as it
 *  supplies the clock; core only turns it into seconds. */
export function nudgeSeconds(u: number): number {
  const n = 2 * NUDGE_MAX_S + 1;
  const k = Math.floor(u * n);
  return (k < 0 ? 0 : k > n - 1 ? n - 1 : k) - NUDGE_MAX_S;
}

/** The nudge a solve takes: all of it where a time is chosen for
 *  (`decisionApplies`), none where the solver's own answer stands - the
 *  furthest the pan goes, which the nudge must not overrun. */
export function appliedNudge(sol: Solution, nudge_s: number): number {
  return decisionApplies(sol) ? nudge_s : 0;
}

/**
 * A cook already under way, re-solved for a time to boil measured or revised
 * mid-cook: the mean solve for the new ramp, leaned by what the choice leaned
 * at "Eggs in".
 *
 * A new ramp is a new pot, and a new pot needs a new grid - a second or more,
 * with the egg already in the water and the deadline about to be set. The lean
 * barely depends on the ramp (test/decide.test.ts measures it), so it is
 * carried instead. When the solve leaves no cook to choose for, it stands.
 */
export function carriedSolution(
  egg: Egg, setup: CookSetup, params: ModelParams, sol: Solution, lean_s: number,
): Solution {
  if (lean_s === 0 || !decisionApplies(sol)) return sol;
  return solutionAt(egg, setup, params, sol, sol.result.cookTime_s + lean_s);
}
