/**
 * How sure the timer is, in words (DECISIONS.md 93; INFERENCE.md section 8,
 * "How sure, in words").
 *
 * Since DECISIONS.md 92 the cook names the yolk they got in the slider's five
 * words, and the outcome already carries the posterior predictive of those
 * five words at the chosen time (`yolkWordProbabilities`, the record's
 * `forecast.yolkWord`). This reads that spread against the word the cook
 * asked for and says three things: a certainty class, the 90% interval in
 * words with the most likely word, and a likely time range. No probit is
 * computed here; the spread is the one the filter learns with, unrelated
 * share included, so it is about what the cook will SAY, as the odds are.
 *
 * THE WORD ASKED. The slider is continuous; its heading names the anchor
 * nearest the thumb (`anchorNear`), and that is the word asked. The
 * anchors' midpoints are exactly the cutpoints between the five answers
 * (`YOLK_WORD_CUTS`, at levels 0.11, 0.315, 0.515 and 0.81), so the word
 * asked is also the band the level's nominal dose falls in: the word a cook
 * would use for the egg the slider describes. An exact midpoint goes to the
 * softer word, as `anchorNear` has it: the slider's 0.11 reads Runny. Its
 * 0.81 reads Hard, because there the two gaps differ in the last bit; what
 * the heading says is what is asked. The level is the one the time is for
 * (`answerAt`'s, after any snap).
 *
 * THE CLASS. With p the five words' probabilities and a the word asked:
 *   veryCertain  p[a] >= 0.9: nine times in ten it is the word asked for;
 *   ballpark     p[a-1] + p[a] + p[a+1] >= 0.9: that word or a neighbour (at
 *                Runny and Hard only the one neighbour there is);
 *   wildGuess    otherwise.
 * The unrelated share caps any one word at 0.96, so very certain is
 * reachable, and only by a cook the model knows: a fresh install is never
 * very certain (INFERENCE.md section 8 has the table, `npm run decide --
 * certainty` the numbers).
 *
 * THE INTERVAL. The narrowest run of adjacent words holding at least 0.9.
 * Among runs equally narrow, the one holding the most; on an exact tie of
 * that, the softer (the first found, walking from Runny). A run's mass is
 * summed from its soft end, so both languages add the same numbers in the
 * same order. If no run short of all five reaches 0.9 - only rounding can
 * do that, since the five sum to one - the interval is all five. The most
 * likely word is the largest p, the softer on a tie. Neither need contain
 * the word asked: a cook asking for Soft on a pan that runs firm can be told
 * "between Jammy and Fudgy".
 *
 * THE BRACKET. Under the slider the same interval is drawn
 * (`wordBracket`; DECISIONS.md 97, question 14: "the bracket draws the 90%
 * the words say, so the two agree"). Each word has a band on the slider:
 * the levels whose nearest anchor it is, from the midpoint with the anchor
 * below to the midpoint with the anchor above, 0 and 1 at the ends - the
 * same edges `anchorNear` and `YOLK_WORD_CUTS` have. The bracket runs from
 * the outer edge of the interval's first word's band to the outer edge of
 * its last's, so its ends are inside the track by construction, and its
 * mark sits at the most likely word's anchor, where that word's tick is.
 * The most likely word is always inside the interval: a word outside a run
 * holding 0.9 holds at most 0.1, and the five cannot all be that small.
 * Until 8 October 2026 the bracket was the outcome's level range, the egg
 * without the cook's taste, and could name other words than these.
 *
 * THE TIME RANGE. The 90% credible interval of the right cook time for the
 * level asked: `predictCookTime` at the 5% and 95% points, the same per-
 * particle right time (the later of the yolk's centre and the white's
 * cutpoint) that "still learning" reads at 80%. It says how sure the timer
 * is of the time itself, and narrows as it learns, as the words do. It is
 * not where a given yolk word comes out: see INFERENCE.md for the
 * alternatives and why not. Its own function and two constants, so the
 * owner's choice changes here and nowhere else.
 *
 * Pure, like the rest of `src/core/`.
 */

import { DoseGrid } from './doseGrid.js';
import { Posterior, predictCookTime, yolkWordProbabilities } from './infer.js';
import { anchorNear } from './slider.js';
import { DONENESS_ANCHORS, logYolkTarget } from './solve.js';

/** How sure, in three words: the keys D1 will give words to. */
export type Certainty = 'veryCertain' | 'ballpark' | 'wildGuess';

/** Nine times in ten: the mass the class and the interval are read at. */
export const CERTAINTY_MASS = 0.9;

/** The time range's quantiles: a 90% interval, as the words' is. */
export const TIME_RANGE_LOW_Q = 0.05;
export const TIME_RANGE_HIGH_Q = 0.95;

/** The five words' spread, read against the word asked. Words are places in
 *  `YOLK_WORDS` (and `DONENESS_ANCHORS`), 0 (Runny) to 4 (Hard). */
export interface WordCertainty {
  /** The word asked: the slider's word at the level. */
  asked: number;
  certainty: Certainty;
  /** P(the word asked), and P(it or a neighbour). */
  pAsked: number;
  pNear: number;
  /** The 90% interval: words `from` to `to`, softest first, and what it
   *  holds. `from === to` when one word holds 0.9. */
  from: number;
  to: number;
  pInterval: number;
  /** The most likely word. */
  mostLikely: number;
}

/** A likely time range, s from eggs in. */
export interface TimeRange {
  low_s: number;
  high_s: number;
}

/** Everything a tap on the certainty word shows, and the cook time it was
 *  read at, s from eggs in (the time on screen then), so a reading held over
 *  a plan that has moved can say its range about the time now
 *  (`timeRangeWords`). */
export interface CertaintyReading {
  words: WordCertainty;
  time: TimeRange;
  at_s: number;
}

/** Where the bracket under the slider is drawn, as slider levels: from
 *  `low` to `high`, with a mark at `mark`. See the header. */
export interface WordBracket {
  low: number;
  mark: number;
  high: number;
}

/** The word asked at a slider level: the place of `anchorNear(level)`. */
export function askedWord(level: number): number {
  const key = anchorNear(level).key;
  for (let i = 0; i < DONENESS_ANCHORS.length; i++) {
    if (DONENESS_ANCHORS[i].key === key) return i;
  }
  return 0;
}

/** p[from] + ... + p[to], added from the soft end. */
function massOf(p: number[], from: number, to: number): number {
  let m = 0.0;
  for (let k = from; k <= to; k++) m += p[k];
  return m;
}

/** The class, the interval and the most likely word, from the five words'
 *  probabilities (runny to hard) and the word asked. See the header. */
export function wordCertainty(p: number[], asked: number): WordCertainty {
  const n = p.length;
  const pAsked = p[asked];
  const pNear = massOf(p, asked > 0 ? asked - 1 : 0, asked < n - 1 ? asked + 1 : n - 1);
  const certainty: Certainty = pAsked >= CERTAINTY_MASS
    ? 'veryCertain'
    : pNear >= CERTAINTY_MASS ? 'ballpark' : 'wildGuess';

  let from = 0;
  let to = n - 1;
  let pInterval = massOf(p, 0, n - 1);
  let found = false;
  for (let width = 1; width < n && !found; width++) {
    let best = -1.0;
    for (let start = 0; start + width <= n; start++) {
      const m = massOf(p, start, start + width - 1);
      if (m >= CERTAINTY_MASS && m > best) {
        best = m;
        from = start;
        to = start + width - 1;
        pInterval = m;
        found = true;
      }
    }
  }

  let mostLikely = 0;
  for (let k = 1; k < n; k++) {
    if (p[k] > p[mostLikely]) mostLikely = k;
  }
  return {
    asked: asked, certainty: certainty, pAsked: pAsked, pNear: pNear,
    from: from, to: to, pInterval: pInterval, mostLikely: mostLikely,
  };
}

/** The lower edge of word `k`'s band on the slider: the midpoint between
 *  its anchor and the one below, or 0 for the softest. */
export function wordBandLow(k: number): number {
  return k > 0 ? 0.5 * (DONENESS_ANCHORS[k - 1].level + DONENESS_ANCHORS[k].level) : 0.0;
}

/** The upper edge of word `k`'s band: the midpoint between its anchor and
 *  the one above, or 1 for the firmest. */
export function wordBandHigh(k: number): number {
  return k < DONENESS_ANCHORS.length - 1 ? 0.5 * (DONENESS_ANCHORS[k].level + DONENESS_ANCHORS[k + 1].level) : 1.0;
}

/** The bracket for an interval: the outer edges of its first and last
 *  words' bands, and the most likely word's anchor. See the header. */
export function wordBracket(w: WordCertainty): WordBracket {
  return { low: wordBandLow(w.from), mark: DONENESS_ANCHORS[w.mostLikely].level, high: wordBandHigh(w.to) };
}

/** The likely time range for a cook aiming at a nominal yolk dose of
 *  10^`logNominalTarget`: the right cook time's 90% interval. See the
 *  header; this is the one definition the owner may change. */
function likelyTimeRange(post: Posterior, grid: DoseGrid, logNominalTarget: number): TimeRange {
  const r = predictCookTime(post, grid, logNominalTarget, TIME_RANGE_LOW_Q, TIME_RANGE_HIGH_Q);
  return { low_s: r.low_s, high_s: r.high_s };
}

/**
 * How sure the timer is of the egg at `cookTime_s` - the time on screen -
 * when the slider is at `level`, the level that time is for: on the same
 * posterior and surface the decision and the outcome read.
 */
export function certaintyAt(
  post: Posterior, grid: DoseGrid, cookTime_s: number, level: number,
): CertaintyReading {
  return {
    words: wordCertainty(yolkWordProbabilities(post, grid, cookTime_s), askedWord(level)),
    time: likelyTimeRange(post, grid, logYolkTarget(level)),
    at_s: cookTime_s,
  };
}
