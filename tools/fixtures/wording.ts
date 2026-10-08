/**
 * fixtures/wording.json: which catalogue key each part of the screen says
 * (src/core/wording.ts), over every combination of the facts it reads. Every
 * key is checked against copy/en.json here, so a fixture cannot name a key
 * the catalogue does not have.
 */

import { readFileSync } from 'node:fs';

import { Outcome } from '../../src/core/outcome.js';
import { Certainty, wordCertainty } from '../../src/core/certainty.js';
import { Phase, RefusalKind, Verdict, anchorNear } from '../../src/core/policy.js';
import { Cooling, HeatAfterBoil, StartMode } from '../../src/core/protocol.js';
import { EggFrom, forecastOf } from '../../src/core/record.js';
import {
  certaintyKey, clauseKeys, intervalWords, mostLikelyOpened, mostLikelyShown, mostLikelyWords, phaseKeys,
  forecastWhiteAtRisk, rangeWords, warningKey, whiteAtRisk,
} from '../../src/core/wording.js';
import { WHITE_RISK } from '../../src/core/outcome.js';

const PHASES: Phase[] = ['IDLE', 'HEATING', 'COOKING', 'PULL', 'COOLING', 'DONE'];
const STARTS: StartMode[] = ['hot', 'cold'];
const AFTER: HeatAfterBoil[] = ['hold', 'off'];
const COOLINGS: Cooling[] = ['ice', 'tap', 'counter'];
const FROMS: EggFrom[] = ['fridge', 'room', 'custom'];
const KINDS: RefusalKind[] = ['none', 'tooSoftForWhite', 'harderThanPanReaches', 'whiteNeverSets'];

const CLASSES: Certainty[] = ['veryCertain', 'ballpark', 'wildGuess'];
/** Spreads of the five words, runny to hard, each read against every word
 *  asked: one word holding 9 in 10, a ballpark around jammy, a pot that runs
 *  firm, and a fresh install's width. */
const SPREADS: number[][] = [
  [0.01, 0.01, 0.94, 0.03, 0.01],
  [0.03, 0.2, 0.68, 0.07, 0.02],
  [0.01, 0.02, 0.1, 0.27, 0.6],
  [0.12, 0.25, 0.32, 0.22, 0.09],
];

export function wordingFixture(): Record<string, unknown> {
  const messages = (JSON.parse(readFileSync('copy/en.json', 'utf8')) as { messages: Record<string, unknown> })
    .messages;
  const known = (key: string | null): string | null => {
    if (key !== null && !(key in messages)) throw new Error(`wording.json: ${key} is not in copy/en.json`);
    return key;
  };

  const warning = KINDS.flatMap((kind) => [true, false].flatMap((worthSaying) => [false, true].flatMap(
    (lowOdds) => COOLINGS.map((cooling) => {
      const v: Verdict = {
        kind: kind, wanted: anchorNear(0.4), limit: anchorNear(0.6), snapTo: null, worthSaying: worthSaying,
      };
      const ref = warningKey(v, lowOdds, cooling);
      return {
        kind: kind, worthSaying: worthSaying, lowOdds: lowOdds, cooling: cooling,
        key: known(ref?.key ?? null), args: ref?.args ?? null,
      };
    }),
  )));

  const outcome = [0, WHITE_RISK - 1e-9, WHITE_RISK].map((pWhiteRunny) => {
    const o: Outcome = {
      pTooSoft: 0, pJustRight: 0, pTooFirm: 0,
      pWhiteRunny: pWhiteRunny, pWhiteTender: 1 - pWhiteRunny, pWhiteFirm: 0, pYolkWord: null,
      levelLow: 0.2, levelMedian: 0.2, levelHigh: 0.7, lean: 'balanced',
    };
    return {
      pWhiteRunny: pWhiteRunny, whiteAtRisk: whiteAtRisk(o),
      forecastWhiteAtRisk: forecastWhiteAtRisk(forecastOf(o, 400)),
    };
  });

  // The bracket in words: the certainty's interval, from five spreads that
  // give one word, two, three at the soft end and the firm, and an interval
  // away from the word asked.
  const range = [
    { p: [0.025, 0.025, 0.9, 0.025, 0.025], asked: 2 },
    { p: [0.01, 0.02, 0.45, 0.5, 0.02], asked: 1 },
    { p: [0.5, 0.42, 0.06, 0.01, 0.01], asked: 0 },
    { p: [0.05, 0.25, 0.4, 0.25, 0.05], asked: 2 },
    { p: [0.01, 0.01, 0.06, 0.42, 0.5], asked: 4 },
  ].map((row) => {
    const r = rangeWords(wordCertainty(row.p, row.asked));
    known(r.key);
    return { ...row, range: r };
  });

  // The line under the time, and what pressing it opens: the class's key,
  // the interval and the most likely word, and whether "most likely" shows
  // unpressed. The words are doneness keys, checked like any other.
  const certainty = {
    keys: CLASSES.map((c) => ({ certainty: c, key: known(certaintyKey(c)) })),
    words: SPREADS.flatMap((p) => [0, 1, 2, 3, 4].map((asked) => {
      const w = wordCertainty(p, asked);
      const interval = intervalWords(w);
      const likely = mostLikelyWords(w);
      known(interval.key);
      known(likely.key);
      for (const word of Object.values(interval.words).concat(Object.values(likely.words))) known(word);
      return {
        p: p, asked: asked, certainty: w.certainty, key: certaintyKey(w.certainty),
        interval: interval, mostLikely: likely, mostLikelyShown: mostLikelyShown(w),
        mostLikelyOpened: mostLikelyOpened(w),
      };
    })),
  };

  // The three flags each read in one phase only: each is false once, with
  // the other two true, so a flag read in the wrong place shows.
  const flags: [boolean, boolean, boolean][] = [[false, true, true], [true, false, true], [true, true, false]];
  const phase = PHASES.flatMap((ph) => STARTS.flatMap((startMode) => AFTER.flatMap((afterBoil) => COOLINGS.flatMap(
    (cooling) => flags.map(([whiteSets, boilKnown, probeWanted]) => {
      const facts = {
        phase: ph, startMode: startMode, afterBoil: afterBoil, cooling: cooling,
        whiteSets: whiteSets, boilKnown: boilKnown, probeWanted: probeWanted,
      };
      const k = phaseKeys(facts);
      known(k.label);
      known(k.subline);
      known(k.action);
      known(k.hint);
      return { ...facts, ...k };
    }),
  ))));

  const clauses = FROMS.flatMap((eggFrom) => STARTS.flatMap((startMode) => [false, true].flatMap(
    (sousVide) => AFTER.flatMap((afterBoil) => COOLINGS.map((cooling) => {
      const facts = { eggFrom: eggFrom, startMode: startMode, sousVide: sousVide, afterBoil: afterBoil, cooling: cooling };
      const k = clauseKeys(facts);
      for (const c of Object.values(k)) {
        known(c.text);
        known(c.label);
        known(c.value);
      }
      return { ...facts, keys: k };
    })),
  )));

  return {
    about: 'Which catalogue key each part of the screen says, from the facts of the cook. src/core/wording.ts.',
    constants: { whiteRisk: WHITE_RISK },
    warning: warning,
    outcome: outcome,
    range: range,
    certainty: certainty,
    phase: phase,
    clauses: clauses,
  };
}
