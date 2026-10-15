/**
 * fixtures/language.json: the switch into the English of 1750
 * (src/core/language.ts), for the Swift port to be held to.
 *
 *  - `tags`: which tags are 1750, which are modern English, and the record's
 *    register for each.
 *  - `transitions`: every state reachable from four starting points in three
 *    moves - a units flip either way, or a pick of English, 1750 or Czech - and
 *    what each move does to it. Czech has no catalogue yet; it stands for "a
 *    language that is not English", which the switch must never move.
 */

import {
  DEFAULT_LANGUAGE, type LanguageState, PERIOD_LANGUAGE, effectiveLanguage, isModernEnglish, isPeriod, languageAfterFlip,
  languageAfterPick, registerOf,
} from '../../src/core/language.js';

type Move = { flip: 'metricToImperial' | 'imperialToMetric' } | { pick: string };

const MOVES: Move[] = [
  { flip: 'metricToImperial' }, { flip: 'imperialToMetric' },
  { pick: DEFAULT_LANGUAGE }, { pick: PERIOD_LANGUAGE }, { pick: 'cs' },
];

function apply(state: LanguageState, move: Move): LanguageState {
  return 'flip' in move ? languageAfterFlip(state, move.flip) : languageAfterPick(state, move.pick);
}

export function languageFixture(): Record<string, unknown> {
  const tags = [
    'en', 'en-US', 'en-GB', 'EN-gb', 'en-x-1750', 'en-US-x-1750', 'en-GB-x-1750', 'EN-GB-X-1750',
    'en-x-1750-a', 'en-x-17500', 'en-x-175', 'cs', 'cs-CZ', 'cs-x-1750', 'x-1750', '', 'enx-1750',
  ].map((tag) => ({
    tag, isPeriod: isPeriod(tag), isModernEnglish: isModernEnglish(tag), register: registerOf(tag),
  }));

  const starts: LanguageState[] = [
    { chosen: null },
    { chosen: DEFAULT_LANGUAGE },
    { chosen: PERIOD_LANGUAGE },
    { chosen: 'cs' },
  ];
  const seen = new Set<string>();
  const transitions: { state: LanguageState; move: Move; next: LanguageState; effective: string }[] = [];
  let frontier = starts;
  for (let depth = 0; depth < 3; depth++) {
    const nextFrontier: LanguageState[] = [];
    for (const state of frontier) {
      for (const move of MOVES) {
        const id = JSON.stringify([state, move]);
        if (seen.has(id)) continue;
        seen.add(id);
        const next = apply(state, move);
        transitions.push({ state, move, next, effective: effectiveLanguage(next) });
        nextFrontier.push(next);
      }
    }
    frontier = nextFrontier;
  }

  return {
    about: 'The switch into the English of 1750: tags and transitions. src/core/language.ts.',
    defaultLanguage: DEFAULT_LANGUAGE,
    periodLanguage: PERIOD_LANGUAGE,
    tags,
    transitions,
  };
}
