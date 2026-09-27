/**
 * The outcome summary in words (src/ui/outcome.ts): which sentence each
 * outcome gets, when the white gets its line, the range in the slider's own
 * words, a cook's outcome read back after a reload, and which play-safe
 * suggestion, if any, goes under the direction.
 *
 * The numbers are core's and are tested in test/outcome.test.ts; this holds
 * the thresholds the web chose on top of them, at their edges, and checks
 * that every key chosen is in the catalogue.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Lean, Outcome } from '../src/core/outcome.js';
import {
  DIRECTION_LIKELY, SAFE_RISK, WHITE_RISK, directionKey, playSafe, playSafeWanted, rangeWords,
  restoreOutcome, whiteAtRisk,
} from '../src/ui/outcome.js';

const MESSAGES = (JSON.parse(readFileSync('copy/en.json', 'utf8')) as { messages: Record<string, unknown> }).messages;

function outcome(over: Partial<Outcome> = {}): Outcome {
  return {
    pTooSoft: 0.1, pJustRight: 0.8, pTooFirm: 0.1, pWhiteRunny: 0.02,
    levelLow: 0.35, levelMedian: 0.43, levelHigh: 0.51, lean: 'balanced', ...over,
  };
}

test('the direction: "probably just right" from one half, and the lean decides the rest', () => {
  const cases: [number, Lean, string][] = [
    [DIRECTION_LIKELY, 'balanced', 'outcome.likely'],
    [0.77, 'firm', 'outcome.likely.firm'],
    [0.56, 'soft', 'outcome.likely.soft'],
    [DIRECTION_LIKELY - 1e-9, 'balanced', 'outcome.unsure'],
    [0.21, 'balanced', 'outcome.unsure'],
    [0.34, 'firm', 'outcome.miss.firm'],
    [0.3, 'soft', 'outcome.miss.soft'],
  ];
  for (const [right, lean, key] of cases) {
    assert.equal(directionKey(outcome({ pJustRight: right, lean: lean })), key, `${right} ${lean}`);
    assert.ok(key in MESSAGES, `${key} is not in copy/en.json`);
  }
});

test('the white gets its line from one in five, and not below', () => {
  assert.equal(whiteAtRisk(outcome({ pWhiteRunny: WHITE_RISK })), true);
  assert.equal(whiteAtRisk(outcome({ pWhiteRunny: 0.45 })), true);
  // A fresh install at soft on the reference pot: the prior's width, not a belief.
  assert.equal(whiteAtRisk(outcome({ pWhiteRunny: 0.17 })), false);
  assert.equal(whiteAtRisk(outcome({ pWhiteRunny: 0.02 })), false);
  assert.ok('outcome.whiteRunny' in MESSAGES);
});

test('the range is said with the nearest doneness words, once when both ends share one', () => {
  assert.deepEqual(rangeWords(outcome({ levelLow: 0.14, levelMedian: 0.42, levelHigh: 0.72 })),
    { key: 'outcome.range', args: { low: 'doneness.soft', high: 'doneness.fudgy' } });
  assert.deepEqual(rangeWords(outcome({ levelLow: 0.35, levelMedian: 0.43, levelHigh: 0.51 })),
    { key: 'outcome.range.one', args: { level: 'doneness.jammy' } });
  // The clamps are the slider's ends, and read as its end words.
  assert.deepEqual(rangeWords(outcome({ levelLow: 0, levelMedian: 0.06, levelHigh: 0.3 })),
    { key: 'outcome.range', args: { low: 'doneness.runny', high: 'doneness.soft' } });
  assert.deepEqual(rangeWords(outcome({ levelLow: 0.73, levelMedian: 1, levelHigh: 1 })),
    { key: 'outcome.range', args: { low: 'doneness.fudgy', high: 'doneness.hard' } });
  for (const key of ['outcome.range', 'outcome.range.one']) assert.ok(key in MESSAGES);
});

test('an outcome carried with a cook comes back whole, or not at all', () => {
  const o = outcome({ lean: 'firm' });
  assert.deepEqual(restoreOutcome(JSON.parse(JSON.stringify(o))), o);
  assert.equal(restoreOutcome(undefined), null);
  assert.equal(restoreOutcome(null), null);
  assert.equal(restoreOutcome({ ...o, lean: 'sideways' }), null);
  assert.equal(restoreOutcome({ ...o, pJustRight: 1.2 }), null);
  assert.equal(restoreOutcome({ ...o, pWhiteRunny: Number.NaN }), null);
  assert.equal(restoreOutcome({ ...o, levelLow: 0.6 }), null);
  const partial: Record<string, unknown> = { ...o };
  delete partial['levelHigh'];
  assert.equal(restoreOutcome(partial), null);
});

test('playing safe: from one yolk in five, the larger risk, a tie to the firm-safe side', () => {
  const both = { firmerLevel: 0.69, softerLevel: 0.1 };
  // A fresh install at jammy: soft 0.38, firm 0.41. The firm risk is larger.
  assert.deepEqual(playSafe(outcome({ pTooSoft: 0.38, pTooFirm: 0.41 }), both, 0.41),
    { key: 'outcome.safe.soft', level: 0.1, word: 'doneness.runny' });
  assert.deepEqual(playSafe(outcome({ pTooSoft: 0.41, pTooFirm: 0.38 }), both, 0.41),
    { key: 'outcome.safe.firm', level: 0.69, word: 'doneness.fudgy' });
  // A tie goes to the firm-safe side: an underdone egg is the worse failure.
  assert.equal(playSafe(outcome({ pTooSoft: 0.3, pTooFirm: 0.3 }), both, 0.41)?.key, 'outcome.safe.firm');
  // Under one in five, nothing; at it, something.
  assert.equal(playSafe(outcome({ pTooSoft: SAFE_RISK - 1e-9, pTooFirm: 0.1 }), both, 0.41), null);
  assert.equal(playSafe(outcome({ pTooSoft: SAFE_RISK, pTooFirm: 0.1 }), both, 0.41)?.key, 'outcome.safe.firm');
  assert.equal(playSafeWanted(outcome({ pTooSoft: 0.19, pTooFirm: 0.19 })), false);
  assert.equal(playSafeWanted(outcome({ pTooSoft: 0.1, pTooFirm: SAFE_RISK })), true);
  // The larger risk has no level to offer: the other side's, if it is a risk.
  assert.equal(playSafe(outcome({ pTooSoft: 0.4, pTooFirm: 0.25 }), { firmerLevel: null, softerLevel: 0.3 }, 0.41)?.key,
    'outcome.safe.soft');
  assert.equal(playSafe(outcome({ pTooSoft: 0.4, pTooFirm: 0.1 }), { firmerLevel: null, softerLevel: 0.3 }, 0.41), null);
});

test('playing safe: the word is the nearest doneness, or "a little" when that is the word on screen', () => {
  assert.equal(playSafe(outcome({ pTooSoft: 0.3 }), { firmerLevel: 0.49, softerLevel: null }, 0.41)?.word,
    'outcome.safe.firmer');
  assert.equal(playSafe(outcome({ pTooFirm: 0.3 }), { firmerLevel: null, softerLevel: 0.34 }, 0.41)?.word,
    'outcome.safe.softer');
  assert.equal(playSafe(outcome({ pTooSoft: 0.3 }), { firmerLevel: 0.52, softerLevel: null }, 0.41)?.word,
    'doneness.fudgy');
  for (const key of ['outcome.safe.firm', 'outcome.safe.soft', 'outcome.safe.firmer', 'outcome.safe.softer',
    'outcome.info', 'outcome.bracket', 'outcome.why', 'outcome.learning']) {
    assert.ok(key in MESSAGES, key);
  }
});
