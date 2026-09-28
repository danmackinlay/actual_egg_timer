/**
 * The `outcome` draft: the web's outcome summary - the direction, the white's
 * line, the odds in their (i) and the bracket's words - on `7a40373`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** The outcome summary on the web (UI.md section 8): which way the egg is
 *  likely to miss in place of the odds under the time, a line for a runny
 *  white, the number moved into what the odds' (i) opens, and the bracket's
 *  words for a screen reader. iOS still says the odds line. */
const OUTCOME_DRAFT: Drafted[] = [
  {
    key: 'outcome.likely', row: 'the direction',
    before: null, after: { text: 'Probably just right.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.likely.firm', row: 'the direction',
    before: null, after: { text: 'Probably just right. If not, more likely a little firm.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.likely.soft', row: 'the direction',
    before: null, after: { text: 'Probably just right. If not, more likely a little soft.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.unsure', row: 'the direction',
    before: null, after: { text: 'Could come out softer or firmer than you like — I can\'t call it yet.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.miss.firm', row: 'the direction',
    before: null, after: { text: 'It could miss, and if it does, more likely firmer than you like.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.miss.soft', row: 'the direction',
    before: null, after: { text: 'It could miss, and if it does, more likely softer than you like.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.whiteRunny', row: 'the white',
    before: null, after: { text: 'The white might still be runny.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.odds', row: 'the odds, in the (i)',
    before: null,
    after: { text: 'About {hits} in {of} eggs like this come out just as you like them, with the white set.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.range', row: 'the bracket',
    before: null, after: { text: 'Likely yolk: {low} to {high}' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.range.one', row: 'the bracket',
    before: null, after: { text: 'Likely yolk: {level}' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'odds.hitTheMark', row: 'the odds, in the (i)',
    before: { text: '{hits}/{of} eggs hit the mark' }, after: { text: '{hits}/{of} eggs hit the mark' },
    appsBefore: ['web', 'ios'], appsAfter: ['ios'],
  },
  {
    key: 'help.odds.p2', row: 'Help: how sure I am',
    before: { text: 'Behind that is a number, such as 7/10: how often I expect an egg cooked this way to come out as you asked, with the white set and the yolk just right by your own answer. It starts low, around 2/10, because before your first egg I don\'t know your taste, your eggs or how hard your water really boils. The time I give is the one with the best odds, which isn\'t always my average guess.' },
    after: { text: 'Behind that is a number, such as 7 in 10: how often I expect an egg cooked this way to come out as you asked, with the white set and the yolk just right by your own answer. It starts low, around 2 in 10, because before your first egg I don\'t know your taste, your eggs or how hard your water really boils. The time I give is the one with the best odds, which isn\'t always my average guess.' },
    appsBefore: ['web'], appsAfter: ['web'],
  },
];

export const outcome: Draft = {
  base: '7a40373',
  rows: OUTCOME_DRAFT,
  exampleOnly: {
    'help.odds.p1': 'its note: the direction line and the bracket it was written for are built',
  },
};
