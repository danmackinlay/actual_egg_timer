/**
 * The `safe` draft: playing safe - the one-tap suggestion under the
 * direction, the direction's one (i) rewritten for the bracket with "I'm
 * still learning" folded into it, and the owner's first-egg welcome - on
 * `ff6c6e9`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** 27 September, the owner: make the uncertainty actionable. A one-tap
 *  suggestion under the direction moves the slider to a level that plays
 *  safe (`saferLevels`, src/core/reach.ts); the direction's (i) explains the
 *  bracket and how to act on it, why it starts wide, and what I learn from,
 *  and no longer says the number; "I'm still learning" is no longer a line of
 *  its own on the web, its (i) folded into that one; and the first-egg
 *  welcome is in the owner's words. iOS keeps odds.info, odds.why and
 *  odds.stillLearning. */
const SAFE_DRAFT: Drafted[] = [
  {
    key: 'outcome.info', row: "the direction's one (i)",
    before: null,
    after: { text: "How sure I am" },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'outcome.bracket', row: "the direction's one (i)",
    before: null,
    after: { text: "The bracket under the doneness slider is where I expect your yolk to land. If a soft yolk would bother you more than a firm one, slide right until the bracket's left end is somewhere you'd still be happy; if a firm one would, slide left until its right end is. Or tap the level I suggest, when I suggest one." },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'outcome.why', row: "the direction's one (i)",
    before: null,
    after: { text: "Before your first egg I don't know your taste, your eggs or your kitchen, so the bracket starts wide. Each egg you tell me about narrows it." },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'outcome.learning', row: "the direction's one (i)",
    before: null,
    after: { text: "I learn your taste in yolks from how you say they came out, how your whites set from the second question, how fast heat gets into your eggs from both, and how long your water takes to boil when you tap the boil. Answer both questions after each egg, and if you have a probe thermometer, give me a reading: that is the quickest teacher." },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'outcome.odds', row: "the direction's one (i)",
    before: { text: "About {hits} in {of} eggs like this come out just as you like them, with the white set." },
    after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'odds.info', row: "the direction's one (i)",
    before: { text: "About these odds" },
    after: { text: "About these odds" },
    appsBefore: ["web", "ios"], appsAfter: ["ios"],
  },
  {
    key: 'odds.why', row: "the direction's one (i)",
    before: { text: "Before your first egg I don't know your taste, your eggs or your kitchen, so I can't be sure, and this number starts low. Each egg you tell me about makes me surer, and the number goes up." },
    after: { text: "Before your first egg I don't know your taste, your eggs or your kitchen, so I can't be sure, and this number starts low. Each egg you tell me about makes me surer, and the number goes up." },
    appsBefore: ["web", "ios"], appsAfter: ["ios"],
  },
  {
    key: 'odds.stillLearning', row: "still learning, folded into the (i)",
    before: { text: "I'm still learning" },
    after: { text: "I'm still learning" },
    appsBefore: ["web", "ios"], appsAfter: ["ios"],
  },
  {
    key: 'odds.stillLearning.info', row: "still learning, folded into the (i)",
    before: { text: "About what I'm learning" },
    after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'odds.stillLearning.more', row: "still learning, folded into the (i)",
    before: { text: "My time for this egg could still be out by more than I'd like. I learn your taste in yolks from how you say they came out, how your whites set from the second question, how fast heat gets into your eggs from both, and how long your water takes to boil when you tap the boil. Answer both questions after each egg, and if you have a probe thermometer, give me a reading: that is the quickest teacher." },
    after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'outcome.safe.firm', row: "playing safe",
    before: null,
    after: { text: "Rather not risk it soft? Try: {level}" },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'outcome.safe.soft', row: "playing safe",
    before: null,
    after: { text: "Rather not risk it firm? Try: {level}" },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'outcome.safe.firmer', row: "playing safe",
    before: null,
    after: { text: "A little firmer" },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'outcome.safe.softer', row: "playing safe",
    before: null,
    after: { text: "A little softer" },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'idle.welcome', row: "first-egg welcome",
    before: { text: "Our first egg together. Until you tell me how one comes out, I go by what's true of eggs in general, not yours. Afterwards, answer the two questions and I'll start learning your eggs and your kitchen." },
    after: { text: "Our first egg together. I start off guessing from a generic egg, but as you give me feedback, I learn to specialise on you." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
];

export const safe: Draft = {
  base: 'ff6c6e9',
  rows: SAFE_DRAFT,
  exampleOnly: {},
};
