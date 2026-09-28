/**
 * fixtures/wording.json: which catalogue key each part of the screen says
 * (src/core/wording.ts), over every combination of the facts it reads. Every
 * key is checked against copy/en.json here, so a fixture cannot name a key
 * the catalogue does not have.
 */

import { readFileSync } from 'node:fs';

import { Lean, Outcome } from '../src/core/outcome.js';
import { Phase, RefusalKind, Verdict, anchorNear } from '../src/core/policy.js';
import { Cooling, HeatAfterBoil, StartMode } from '../src/core/protocol.js';
import { EggFrom } from '../src/core/record.js';
import {
  DIRECTION_LIKELY, clauseKeys, directionKey, phaseKeys, rangeWords, refusalKey, whiteAtRisk,
} from '../src/core/wording.js';
import { WHITE_RISK } from '../src/core/outcome.js';

const PHASES: Phase[] = ['IDLE', 'HEATING', 'COOKING', 'PULL', 'COOLING', 'DONE'];
const STARTS: StartMode[] = ['hot', 'cold'];
const AFTER: HeatAfterBoil[] = ['hold', 'off'];
const COOLINGS: Cooling[] = ['ice', 'tap', 'counter'];
const FROMS: EggFrom[] = ['fridge', 'room', 'custom'];
const KINDS: RefusalKind[] = [
  'none', 'tooSoftForWhite', 'harderThanPanReaches', 'whiteNeverSets', 'unlikelySoft', 'unlikelyHard',
];
const LEANS: Lean[] = ['soft', 'firm', 'balanced'];

export function wordingFixture(): Record<string, unknown> {
  const messages = (JSON.parse(readFileSync('copy/en.json', 'utf8')) as { messages: Record<string, unknown> })
    .messages;
  const known = (key: string | null): string | null => {
    if (key !== null && !(key in messages)) throw new Error(`wording.json: ${key} is not in copy/en.json`);
    return key;
  };

  const refusal = KINDS.flatMap((kind) => [true, false].flatMap((worthSaying) => COOLINGS.map((cooling) => {
    const v: Verdict = {
      kind: kind, wanted: anchorNear(0.4), limit: anchorNear(0.6), snapTo: null, worthSaying: worthSaying,
    };
    const ref = refusalKey(v, cooling);
    return {
      kind: kind, worthSaying: worthSaying, cooling: cooling,
      key: known(ref?.key ?? null), args: ref?.args ?? null,
    };
  })));

  const outcome = [0, DIRECTION_LIKELY - 1e-9, DIRECTION_LIKELY, 0.9].flatMap((pJustRight) => LEANS.flatMap(
    (lean) => [0, WHITE_RISK - 1e-9, WHITE_RISK].flatMap((pWhiteRunny) => [[0.1, 0.12], [0.2, 0.7]].map(
      ([levelLow, levelHigh]) => {
        const o: Outcome = {
          pTooSoft: 0, pJustRight: pJustRight, pTooFirm: 0, pWhiteRunny: pWhiteRunny,
          levelLow: levelLow, levelMedian: levelLow, levelHigh: levelHigh, lean: lean,
        };
        const range = rangeWords(o);
        known(range.key);
        return {
          pJustRight: pJustRight, lean: lean, pWhiteRunny: pWhiteRunny, levelLow: levelLow, levelHigh: levelHigh,
          direction: known(directionKey(o)), whiteAtRisk: whiteAtRisk(o), range: range,
        };
      },
    )),
  ));

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
    constants: { directionLikely: DIRECTION_LIKELY, whiteRisk: WHITE_RISK },
    refusal: refusal,
    outcome: outcome,
    phase: phase,
    clauses: clauses,
  };
}
