/**
 * The `reach` draft: the odds-shaded slider's new strings - two refusals, the
 * (i) and what it opens, and the advice - on `1667dcf`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** The odds-shaded slider's strings (the owner's answers of 27 September,
 *  PLAN.md): all new, none reworded. Applied on top of F2, `1667dcf`. */
const REACH_DRAFT: Drafted[] = [
  {
    key: 'refusal.unlikelySoft', row: 'the refusal at the soft end of the odds',
    before: null, after: { text: "The softest I get right at least {hits} times in {of}, so far: {limit}." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'refusal.unlikelyHard', row: 'the refusal at the firm end of the odds',
    before: null, after: { text: "The firmest I get right at least {hits} times in {of}, so far: {limit}." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'odds.info', row: 'the (i) beside the odds',
    before: null, after: { text: "About these odds" },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'odds.why', row: 'what the (i) opens',
    before: null, after: { text: "Before your first egg I don't know your taste, your eggs or your pan, so I can't be sure, and this number starts low. Each egg you tell me about makes me surer, and the number goes up." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'odds.shown', row: 'the (i), open, to VoiceOver',
    before: null, after: { text: "Showing" },
    appsBefore: [], appsAfter: ['ios'],
  },
  {
    key: 'odds.hidden', row: 'the (i), closed, to VoiceOver',
    before: null, after: { text: "Hidden" },
    appsBefore: [], appsAfter: ['ios'],
  },
  {
    key: 'advice.toggle', row: 'the advice line',
    before: null, after: { text: "How to make this more reliable" },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'advice.fridge', row: 'advice: the fridge',
    before: null, after: { text: "Use eggs straight from the fridge. I know how cold a fridge is; a room can be a few degrees either way, and that moves the time." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'advice.weigh', row: 'advice: the scale',
    before: null, after: { text: "Weigh the egg instead of picking a size. One size on the box covers eggs that need quite different times." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'advice.ice', row: 'advice: ice',
    before: null, after: { text: "Put the eggs straight into ice water when they come out. On the counter the yolk keeps cooking, by an amount that is hard to predict." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'advice.moreWater', row: 'advice: more water',
    before: null, after: { text: "Use more water. With the heat off, more water holds its heat for longer, so the time depends less on your pan." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
];

export const reach: Draft = {
  base: '1667dcf',
  rows: REACH_DRAFT,
  exampleOnly: {},
};
