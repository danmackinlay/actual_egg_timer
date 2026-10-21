/**
 * What the egg will be like: the predicted outcome at the chosen time
 * (INFERENCE.md section 8, "The outcome"). The odds (`hitOdds`) say how
 * often the cook will call the egg right, not which way the misses go; this
 * reads the same posterior, on the same surface, at the same time.
 *
 * THE ANSWERS. P(too soft), P(just right), P(too firm) for the yolk,
 * P(runny), P(tender), P(firm) for the white, and the five yolk words: the
 * posterior predictive of what the cook will say, through the probit the
 * filter learns with, unrelated share included - the same numbers
 * `yolkAnswerProbabilities` and `whiteAnswerProbabilities` give, and the same
 * parts `hitOdds` is made of.
 *
 * THE LEVEL. How firm the yolk will actually be, as a range on the slider:
 * the 5%, 50% and 95% points of the delivered log yolk dose, mapped through
 * `sliderFromYolkDose`. Each particle delivers its own time-scale's dose, and
 * around it a Gaussian of its own `noise`, so the range is a weighted mixture
 * of Gaussians, and its points are found by inverting the mixture's CDF. A
 * `weightedQuantile` over the particles would give the spread of their MEANS
 * only, and leave out the scatter no number of eggs narrows, which is all
 * that is left once the time-scale is pinned. On one phone the egg's scatter
 * and the cook's judging are the same number, so the range is as wide as the
 * answers make the egg look.
 *
 * NOT THE TASTE OFFSET. The offset says where this cook's "just right" sits,
 * not how hard the egg is. A cook who likes a firmer yolk is served a firmer
 * egg, and the level says so: its median lands above the slider's own
 * position. With the offset in, the level would be the egg as this cook's
 * taste reads it, which is what the three answers already are.
 *
 * CLAMPED to [0, 1], the slider's ends. `levelLow` at 0 means at least one
 * egg in twenty comes out softer than the runniest level the slider offers - a
 * raw yolk. `levelHigh` at 1 means at least one in twenty comes out at or past
 * the hardest one, and the range says nothing about how far past.
 *
 * THE LEAN. Which way a miss is more likely: 'soft' when P(too soft) is more
 * than LEAN_RATIO times P(too firm), 'firm' the other way round, 'balanced'
 * between. 1.5 is a miss that goes one way three times in five: the least
 * that makes "if not, more likely a little firm" right clearly more often
 * than it is wrong. Nearer 1 the sentence is a coin toss dressed as advice.
 * The two probabilities are calibrated at every ratio `npm run decide --
 * outcome` tries, so the ratio is a choice of when to speak, not a
 * correction.
 */

import { type DoseGrid, lookupLogYolkDose } from './doseGrid.ts';
import {
  type Posterior, whiteAnswerProbabilities, yolkAnswerProbabilities, yolkWordProbabilities,
} from './infer.ts';
import { normalCdf } from './sphere.ts';
import { YOLK_DOSE_HARD, YOLK_DOSE_RUNNY } from './solve.ts';

/** How much likelier one way of missing has to be than the other before the
 *  outcome leans that way: three misses in five. See the header. */
export const LEAN_RATIO = 1.5;

/** The quantiles the level range is read at: a 90% interval, the mass the
 *  certainty's words are read at (`CERTAINTY_MASS`, certainty.ts). No screen
 *  draws the range: the bracket under the slider is the words' own interval
 *  (`wordBracket`, certainty.ts), the cook's taste included, so that the two
 *  agree. The range is kept as the egg
 *  itself, without the taste, which `npm run decide -- outcome` measures. */
export const LEVEL_LOW_Q = 0.05;
export const LEVEL_HIGH_Q = 0.95;

/** P(runny) at or above which the white is a risk: one egg in five. Both
 *  apps give the white a line of its own from here (wording.ts, which has the
 *  reasons). */
export const WHITE_RISK = 0.2;

/** Bisection steps for each point of the level range, on the slider's span:
 *  2^-20 of it, a millionth, far below anything shown. A fixed count, so both
 *  apps take the same steps and land on the same number. */
export const LEVEL_BISECTIONS = 20;

type Lean = 'soft' | 'firm' | 'balanced';

/** What the egg at the chosen time will be like. */
export interface Outcome {
  /** P(the cook answers too soft / just right / too firm) about the yolk. Sum
   *  to 1. */
  pTooSoft: number;
  pJustRight: number;
  pTooFirm: number;
  /** P(the cook answers runny / tender / firm) about the white. Sum to 1. The
   *  screens read only the first; a record keeps all three as the forecast
   *  the app made at "Eggs in". */
  pWhiteRunny: number;
  pWhiteTender: number;
  pWhiteFirm: number;
  /** P(the cook names the yolk runny / soft / jammy / fudgy / hard): the
   *  question the cook is asked. Sum to 1. No screen reads
   *  them; a record keeps them as the forecast. Null only on an outcome a
   *  running cook kept from a build before them, which only iOS keeps
   *  (`Outcome` is `Codable` there). */
  pYolkWord: number[] | null;
  /** The 5%, 50% and 95% points of the delivered yolk doneness, on the
   *  slider's scale, clamped to [0, 1]. No taste offset: see the header. Not
   *  the bracket under the slider, which is `wordBracket`'s. */
  levelLow: number;
  levelMedian: number;
  levelHigh: number;
  /** Which way a miss is more likely. */
  lean: Lean;
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
  let total = 0.0;
  for (let i = 0; i < n; i++) {
    centre[i] = lookupLogYolkDose(grid, post.particles[i].alpha_m2s, cookTime_s);
    total += post.weights[i];
  }
  // The answers' own predictive, with the unrelated share (infer.ts).
  const [soft, right, firm] = yolkAnswerProbabilities(post, grid, cookTime_s, logNominalTarget);
  const [runny, tender, whiteFirm] = whiteAnswerProbabilities(post, grid, cookTime_s);

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
    pWhiteTender: tender,
    pWhiteFirm: whiteFirm,
    pYolkWord: yolkWordProbabilities(post, grid, cookTime_s),
    levelLow: level(LEVEL_LOW_Q),
    levelMedian: level(0.5),
    levelHigh: level(LEVEL_HIGH_Q),
    lean: leanOf(soft, firm),
  };
}
