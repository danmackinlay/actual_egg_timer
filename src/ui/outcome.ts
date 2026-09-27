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
 * PLAYING SAFE, at the end of the file: the one-tap suggestion under the
 * direction.
 */

import { Lean, Outcome } from '../core/outcome.js';
import { anchorNear } from '../core/policy.js';
import { SaferLevels } from '../core/reach.js';

/** P(just right) at or above which the yolk is "probably just right". */
export const DIRECTION_LIKELY = 0.5;

/** P(runny) at or above which the white gets a line of its own. */
export const WHITE_RISK = 0.2;

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

/* ------------------------------------------------------------ playing safe */

/**
 * PLAYING SAFE. The range says where the yolk will probably land; the
 * suggestion says what to do about it. Under the direction, one tap that
 * moves the slider to core's play-safe level (`saferLevels`, reach.ts):
 *
 *  - "Rather not risk it soft? Try: {level}" when the yolk is answered too
 *    soft at least SAFE_RISK of the time and a firmer level gives an egg at
 *    least as firm as the one asked for nine times in ten;
 *  - "Rather not risk it firm? Try: {level}", its mirror.
 *
 * One at most: the one for the larger risk. A tie goes to the firm-safe one,
 * because an underdone egg is the worse failure for most cooks - a yolk a
 * step too firm is still breakfast, and a runny one where a set one was
 * wanted often is not - which is also why the decision weighs a runny white
 * three times a yolk miss. SAFE_RISK is one egg in five, the white's line's
 * threshold: a risk the cook would notice within a week of eggs.
 *
 * {level} is the doneness word nearest the suggested level, standing alone
 * after the colon. When that is the word the slider already reads - after a
 * few eggs the move is a few hundredths - it says "A little firmer" or "A
 * little softer" instead, so the button never offers the word on screen.
 */

/** P(too soft) or P(too firm) at or above which a play-safe level is offered. */
export const SAFE_RISK = 0.2;

export interface PlaySafe {
  /** The catalogue key of the line. */
  key: 'outcome.safe.firm' | 'outcome.safe.soft';
  /** The level a tap moves the slider to. */
  level: number;
  /** The catalogue key of the word in {level}. */
  word: string;
}

/** Whether either way of missing is risk enough to look for a play-safe
 *  level at all: when neither is, there is nothing to compute. */
export function playSafeWanted(o: Outcome): boolean {
  return o.pTooSoft >= SAFE_RISK || o.pTooFirm >= SAFE_RISK;
}

/** The suggestion for the outcome at `level` and its play-safe levels, or
 *  null when there is none worth making. */
export function playSafe(o: Outcome, s: SaferLevels, level: number): PlaySafe | null {
  const firmSafe = s.firmerLevel !== null && o.pTooSoft >= SAFE_RISK;
  const softSafe = s.softerLevel !== null && o.pTooFirm >= SAFE_RISK;
  // The larger risk wins; a tie goes to the firm-safe side (see above).
  if (firmSafe && s.firmerLevel !== null && (!softSafe || o.pTooSoft >= o.pTooFirm)) {
    return { key: 'outcome.safe.firm', level: s.firmerLevel, word: wordFor(s.firmerLevel, level, 'outcome.safe.firmer') };
  }
  if (softSafe && s.softerLevel !== null) {
    return { key: 'outcome.safe.soft', level: s.softerLevel, word: wordFor(s.softerLevel, level, 'outcome.safe.softer') };
  }
  return null;
}

function wordFor(to: number, from: number, same: string): string {
  const word = anchorNear(to).key;
  return word === anchorNear(from).key ? same : word;
}
