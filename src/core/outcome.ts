/**
 * What the egg will be like: the predicted outcome at the chosen time
 * (INFERENCE.md section 8, "The outcome").
 *
 * The odds (`hitOdds`, once on screen as "7/10 eggs hit the mark") say how
 * often the cook will call the egg right. They do not say which way the
 * misses go, and a cook cannot act on a miss without a direction. This reads the same posterior, on the same
 * surface, at the same time, and says two more things.
 *
 * THE ANSWERS. P(too soft), P(just right), P(too firm) for the yolk and
 * P(runny) for the white: the posterior predictive of what the cook will say,
 * through the probit the filter learns with, unrelated share included - the
 * same numbers `yolkAnswerProbabilities` and `whiteAnswerProbabilities` give,
 * and the same parts `hitOdds` is made of. They are calibrated against what
 * cooks SAY, as the odds are.
 *
 * THE LEVEL. How firm the yolk will actually be, as a range on the slider:
 * the 10%, 50% and 90% points of the delivered log yolk dose, mapped through
 * `sliderFromYolkDose`. Each particle delivers its own time-scale's dose,
 * read off the surface, and around it a Gaussian of its own `noise` - the
 * learned egg-to-egg scatter the likelihood sees every answer through. So the
 * range is a mixture of Gaussians, one per particle, weighted, and it carries
 * both what is not yet known about this kitchen and what no number of eggs
 * narrows. Its points are found by inverting the mixture's CDF, not by
 * `weightedQuantile` over the particles: that would give the spread of the
 * particles' MEANS only, and leave out the part no number of eggs narrows.
 * After three consistent eggs the noise makes the range about 1.3 times as
 * wide as the particles alone (test/outcome.test.ts), and it is all that is
 * left once the time-scale is pinned.
 *
 * NOT THE TASTE OFFSET. The taste offset says where this cook's "just right"
 * sits, not how hard the egg is. A cook who likes a firmer yolk is served a
 * firmer egg - the choice leans late for them - and the level says so: its
 * median lands above the slider's own position. Put the offset in and the
 * level would be the egg as this cook's taste reads it, which is what the
 * three answers already are.
 *
 * The noise is the one caveat. On one phone the egg's scatter and the cook's
 * judging are the same number, so the range is as wide as the answers make
 * the egg look; a cook who judges sharply and a kitchen that varies little
 * look the same to it.
 *
 * CLAMPED to [0, 1], the slider's ends. `levelLow` at 0 means at least one
 * egg in ten comes out softer than the runniest level the slider offers - a
 * raw yolk. `levelHigh` at 1 means at least one in ten comes out at or past
 * the hardest one; at hard itself that is half the eggs, and the range says
 * nothing about how far past.
 *
 * THE LEAN. Which way a miss is more likely: 'soft' when P(too soft) is more
 * than LEAN_RATIO times P(too firm), 'firm' the other way round, 'balanced'
 * between. 1.5 is a miss that goes one way three times in five: the least
 * that makes "if not, more likely a little firm" right clearly more often
 * than it is wrong. Nearer 1 the sentence is a coin toss dressed as advice,
 * and flips from egg to egg for no reason the cook can see. Measured (`npm
 * run decide -- outcome`, 400 simulated cooks): the two probabilities are
 * calibrated at every ratio tried, 1 to 3, so the ratio is a choice of when
 * to speak, not a correction. At 1.5 a lean is given for 85% of misses and
 * the miss goes that way 83% of the time (predicted 84%). At the time the app
 * chooses, 73% of eggs are balanced, 24% lean firm - the choice leans late,
 * because a runny white costs three - and 3% soft.
 *
 * Pure, like the rest of `src/core/`, and cheap: one pass over the particles
 * for the answers, and one per bisection step for the level, on a surface and
 * a posterior the decision already has.
 */

import { DoseGrid, lookupLogYolkDose } from './doseGrid.js';
import { Posterior, UNRELATED, whiteProbit, yolkProbit } from './infer.js';
import { erfc } from './sphere.js';
import { YOLK_DOSE_HARD, YOLK_DOSE_RUNNY } from './solve.js';

/** How much likelier one way of missing has to be than the other before the
 *  outcome leans that way: three misses in five. See the header. */
export const LEAN_RATIO = 1.5;

/** The quantiles the level range is read at: an 80% interval, as the cook
 *  time's is (`predictCookTime`). */
export const LEVEL_LOW_Q = 0.1;
export const LEVEL_HIGH_Q = 0.9;

/** P(runny) at or above which the white is a risk: one egg in five. The web
 *  gives the white a line of its own from here (src/ui/outcome.ts, which has
 *  the reasons), and a softer play-safe level must stay under it
 *  (`saferLevels`, reach.ts), so playing safe never buys a firm-enough yolk
 *  with a runny white. */
export const WHITE_RISK = 0.2;

/** Bisection steps for each point of the level range, on the slider's span:
 *  2^-20 of it, a millionth, far below anything shown. A fixed count, so both
 *  apps take the same steps and land on the same number. */
const LEVEL_BISECTIONS = 20;

export type Lean = 'soft' | 'firm' | 'balanced';

/** What the egg at the chosen time will be like. */
export interface Outcome {
  /** P(the cook answers too soft / just right / too firm) about the yolk. Sum
   *  to 1. */
  pTooSoft: number;
  pJustRight: number;
  pTooFirm: number;
  /** P(the cook answers runny) about the white. */
  pWhiteRunny: number;
  /** The 10%, 50% and 90% points of the delivered yolk doneness, on the
   *  slider's scale, clamped to [0, 1]. No taste offset: see the header. */
  levelLow: number;
  levelMedian: number;
  levelHigh: number;
  /** Which way a miss is more likely. */
  lean: Lean;
}

function normalCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}

/** Which way a miss leans, from the two ways of missing. */
export function leanOf(pTooSoft: number, pTooFirm: number): Lean {
  if (pTooSoft > LEAN_RATIO * pTooFirm) return 'soft';
  if (pTooFirm > LEAN_RATIO * pTooSoft) return 'firm';
  return 'balanced';
}

/**
 * The predicted outcome of pulling at `cookTime_s`, for a cook aiming at a
 * nominal yolk dose of 10^`logNominalTarget`: the same inputs as the decision
 * (`decideAt`), read at the time it chose.
 */
export function predictOutcome(
  post: Posterior, grid: DoseGrid, cookTime_s: number, logNominalTarget: number,
): Outcome {
  const n = post.particles.length;
  const centre: number[] = new Array<number>(n);
  let soft = 0.0;
  let right = 0.0;
  let firm = 0.0;
  let runny = 0.0;
  let total = 0.0;
  for (let i = 0; i < n; i++) {
    const p = post.particles[i];
    const w = post.weights[i];
    centre[i] = lookupLogYolkDose(grid, p.alpha_m2s, cookTime_s);
    if (w === 0.0) continue;
    const yolk = yolkProbit(grid, p, cookTime_s, logNominalTarget);
    const white = whiteProbit(grid, p, cookTime_s);
    soft += w * ((1.0 - UNRELATED) * yolk[0] + UNRELATED / 3.0);
    right += w * ((1.0 - UNRELATED) * yolk[1] + UNRELATED / 3.0);
    firm += w * ((1.0 - UNRELATED) * yolk[2] + UNRELATED / 3.0);
    runny += w * ((1.0 - UNRELATED) * white[0] + UNRELATED / 3.0);
    total += w;
  }
  if (total > 0.0) {
    soft /= total;
    right /= total;
    firm /= total;
    runny /= total;
  } else {
    soft = right = firm = runny = 1.0 / 3.0;
  }

  // The share of eggs delivered at or under log dose x: the mixture's CDF.
  const cdf = (x: number): number => {
    let acc = 0.0;
    for (let i = 0; i < n; i++) {
      const w = post.weights[i];
      if (w === 0.0) continue;
      acc += w * normalCdf((x - centre[i]) / post.particles[i].noise);
    }
    return total > 0.0 ? acc / total : 0.5;
  };
  const logLo = Math.log10(YOLK_DOSE_RUNNY);
  const logHi = Math.log10(YOLK_DOSE_HARD);
  const atLo = cdf(logLo);
  const atHi = cdf(logHi);
  // The q-point on the slider: 0 when a q share of eggs is already under the
  // runny end, 1 when less than q is under the hard end, and otherwise found
  // by bisection between the two.
  const level = (q: number): number => {
    if (atLo >= q) return 0.0;
    if (atHi < q) return 1.0;
    let a = logLo;
    let b = logHi;
    for (let k = 0; k < LEVEL_BISECTIONS; k++) {
      const mid = 0.5 * (a + b);
      if (cdf(mid) < q) a = mid;
      else b = mid;
    }
    // `sliderFromYolkDose` of 10^mid, without the round trip through pow and
    // log10 that the two languages' maths libraries need not agree on.
    return (0.5 * (a + b) - logLo) / (logHi - logLo);
  };

  return {
    pTooSoft: soft,
    pJustRight: right,
    pTooFirm: firm,
    pWhiteRunny: runny,
    levelLow: level(LEVEL_LOW_Q),
    levelMedian: level(0.5),
    levelHigh: level(LEVEL_HIGH_Q),
    lean: leanOf(soft, firm),
  };
}
