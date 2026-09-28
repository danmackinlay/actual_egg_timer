/**
 * The outcome summary in words (UI.md section 8): which way the egg is likely
 * to miss, whether the white is a risk, and the yolk's likely range as the
 * slider's own words. The numbers are core's (`predictOutcome`,
 * src/core/outcome.ts); this file only chooses which catalogue key says them,
 * so the choice can be tested without a page.
 *
 * THE DIRECTION. "Probably just right" when the yolk is answered just right
 * at least half the time (DIRECTION_LIKELY): "probably" means more likely
 * than not, and nothing less. Then a lean, when core gives one, as a second
 * sentence of the same message. Under half, the sentence leads with the
 * miss, or says it cannot call it when neither way is likelier (core's lean
 * is 'balanced': a miss one way less than three times in five). On the
 * reference pot that is a fresh install at every level (just right 0.21-0.30,
 * balanced), and "probably just right" from the first egg that taught
 * something (0.56-0.58 after one egg just right, 0.77 after three).
 *
 * THE WHITE. A line of its own when P(runny) is at least WHITE_RISK, one egg
 * in five. The chosen time already weighs a runny white three times a yolk
 * miss, so what is left above one in five is a white the time cannot fix
 * without overcooking the yolk: the softest levels, and the counter's softest
 * (0.36-0.45 on a fresh install, 0.21 at runny after three eggs just right).
 * Not 0.15: a fresh install at soft reads 0.17 on the reference pot, and that
 * is the width of the prior, which is wide so the filter can learn and not
 * because anyone believes it (decide.ts, "not before the first egg").
 *
 * THE RANGE. `levelLow` and `levelHigh` as the nearest doneness words, for a
 * screen reader: the bracket under the slider is drawn, and this is what it
 * says. The words stand alone after a colon (LANGUAGE.md section 5).
 *
 * There used to be a fourth part here, PLAYING SAFE: a one-tap suggestion
 * under the direction. The owner took it off both screens on 28 September -
 * it said in words what the slider and the bracket already show - and had
 * core's `saferLevels` deleted with it.
 */

import { Lean, Outcome, WHITE_RISK } from '../core/outcome.js';
import { anchorNear } from '../core/policy.js';

/** P(just right) at or above which the yolk is "probably just right". */
export const DIRECTION_LIKELY = 0.5;

/** P(runny) at or above which the white gets a line of its own: core's. */
export { WHITE_RISK };

/** The catalogue key of the direction sentence. */
export function directionKey(o: Outcome): string {
  if (o.pJustRight >= DIRECTION_LIKELY) {
    if (o.lean === 'firm') return 'outcome.likely.firm';
    if (o.lean === 'soft') return 'outcome.likely.soft';
    return 'outcome.likely';
  }
  if (o.lean === 'firm') return 'outcome.miss.firm';
  if (o.lean === 'soft') return 'outcome.miss.soft';
  return 'outcome.unsure';
}

/** Whether the white gets its line. */
export function whiteAtRisk(o: Outcome): boolean {
  return o.pWhiteRunny >= WHITE_RISK;
}

/** The range in the slider's words: a key and its arguments, each argument
 *  itself a doneness key for the caller to render. One word when both ends
 *  are nearest the same one. */
export function rangeWords(o: Outcome): { key: string; args: Record<string, string> } {
  const low = anchorNear(o.levelLow).key;
  const high = anchorNear(o.levelHigh).key;
  if (low === high) return { key: 'outcome.range.one', args: { level: low } };
  return { key: 'outcome.range', args: { low: low, high: high } };
}

/** An outcome carried with a cook and read back after a reload, if it is one:
 *  every probability in [0, 1], the levels in order, and a lean. */
export function restoreOutcome(raw: unknown): Outcome | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const fields = ['pTooSoft', 'pJustRight', 'pTooFirm', 'pWhiteRunny', 'levelLow', 'levelMedian', 'levelHigh'];
  for (const key of fields) {
    const value = r[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return null;
  }
  const lean = r['lean'];
  if (lean !== 'soft' && lean !== 'firm' && lean !== 'balanced') return null;
  const o = raw as Outcome;
  if (!(o.levelLow <= o.levelMedian && o.levelMedian <= o.levelHigh)) return null;
  return {
    pTooSoft: o.pTooSoft, pJustRight: o.pJustRight, pTooFirm: o.pTooFirm, pWhiteRunny: o.pWhiteRunny,
    levelLow: o.levelLow, levelMedian: o.levelMedian, levelHigh: o.levelHigh, lean: lean as Lean,
  };
}
