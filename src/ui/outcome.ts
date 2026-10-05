/**
 * A cook's outcome read back after a reload. Which words say an outcome is
 * core's (src/core/wording.ts).
 */

import { Lean, Outcome } from '../core/outcome.js';

/** An outcome carried with a cook and read back after a reload, if it is one:
 *  every probability in [0, 1], the levels in order, and a lean. The five
 *  yolk words' are null on a cook carried from a build before them. */
export function restoreOutcome(raw: unknown): Outcome | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const fields = [
    'pTooSoft', 'pJustRight', 'pTooFirm', 'pWhiteRunny', 'pWhiteTender', 'pWhiteFirm',
    'levelLow', 'levelMedian', 'levelHigh',
  ];
  for (const key of fields) {
    const value = r[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return null;
  }
  const lean = r['lean'];
  if (lean !== 'soft' && lean !== 'firm' && lean !== 'balanced') return null;
  const o = raw as Outcome;
  if (!(o.levelLow <= o.levelMedian && o.levelMedian <= o.levelHigh)) return null;
  const words: unknown = r['pYolkWord'] ?? null;
  let pYolkWord: number[] | null = null;
  if (words !== null) {
    if (!Array.isArray(words) || words.length !== 5) return null;
    pYolkWord = [];
    for (const p of words as unknown[]) {
      if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) return null;
      pYolkWord.push(p);
    }
  }
  return {
    pTooSoft: o.pTooSoft, pJustRight: o.pJustRight, pTooFirm: o.pTooFirm,
    pWhiteRunny: o.pWhiteRunny, pWhiteTender: o.pWhiteTender, pWhiteFirm: o.pWhiteFirm,
    pYolkWord: pYolkWord,
    levelLow: o.levelLow, levelMedian: o.levelMedian, levelHigh: o.levelHigh, lean: lean as Lean,
  };
}
