/**
 * The `tighten` draft: the owner's three changes of 28 September, both apps -
 * the peak yolk in the doneness slider's heading and no reading line under
 * it, no play-safe suggestion, and the running cook's setup sentence - on
 * `2c090c9`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** 28 September, the owner, after using the iOS app: the doneness control
 *  says the doneness word twice, so the peak yolk moves into the slider's
 *  heading and the reading line under it goes (its words stay, as the
 *  slider's value to a screen reader, with a comma for the dot); the one-tap
 *  play-safe suggestion goes from both apps, and the (i) and Help stop
 *  mentioning it; and the running cook shows the setup sentence it was
 *  started with, over the doneness and peak yolk, in place of iOS's method
 *  line and summary. */
const TIGHTEN_DRAFT: Drafted[] = [
  {
    key: 'controls.doneness.peak', row: "the peak yolk moves into the slider's heading",
    before: null,
    after: { text: "peak yolk {yolk}" },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.doneness.bath', row: "the peak yolk moves into the slider's heading",
    before: null,
    after: { text: "water at {bath}" },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.doneness.value', row: "the reading line goes; its words are the slider's value",
    before: { text: "{doneness} · peak yolk {yolk}" },
    after: { text: "{doneness}, peak yolk {yolk}" },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.doneness.valueBath', row: "the reading line goes; its words are the slider's value",
    before: { text: "{doneness} · water at {bath}" },
    after: { text: "{doneness}, water at {bath}" },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'outcome.safe.firm', row: 'the play-safe suggestion goes',
    before: { text: "Rather not risk it soft? Try: {level}" },
    after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'outcome.safe.soft', row: 'the play-safe suggestion goes',
    before: { text: "Rather not risk it firm? Try: {level}" },
    after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'outcome.safe.firmer', row: 'the play-safe suggestion goes',
    before: { text: "A little firmer" },
    after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'outcome.safe.softer', row: 'the play-safe suggestion goes',
    before: { text: "A little softer" },
    after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'outcome.bracket', row: 'the (i) and Help without the suggestion',
    before: { text: "The bracket under the doneness slider is where I expect your yolk to land. If a soft yolk would bother you more than a firm one, slide right until the bracket\'s left end is somewhere you\'d still be happy; if a firm one would, slide left until its right end is. Or tap the level I suggest, when I suggest one." },
    after: { text: "The bracket under the doneness slider is where I expect your yolk to land. If a soft yolk would bother you more than a firm one, slide right until the bracket\'s left end is somewhere you\'d still be happy; if a firm one would, slide left until its right end is." },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'help.odds.p1', row: 'the (i) and Help without the suggestion',
    before: { text: "Under the time, I say which way an egg is likely to miss. The bracket under the slider shows where the yolk will probably land. When a miss is likely enough to matter, I suggest a level that plays safe, one tap away, and never one where the white might be runny. All of it narrows as I learn." },
    after: { text: "Under the time, I say which way an egg is likely to miss. The bracket under the slider shows where the yolk will probably land. All of it narrows as I learn." },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'help.odds.aside', row: 'the (i) and Help without the suggestion',
    before: { text: "The bracket covers eight eggs in ten. When I choose the time, a runny white counts three times as bad as a yolk a little too firm, so I lean slightly long. I suggest playing safe when either way of missing is at least one egg in five: firmer means nine yolks in ten at least as firm as you asked, and softer the mirror of that, with the white\'s risk under one in five. The slider\'s shading shows how often each doneness comes out right for you." },
    after: { text: "The bracket covers eight eggs in ten. When I choose the time, a runny white counts three times as bad as a yolk a little too firm, so I lean slightly long. The slider\'s shading shows how often each doneness comes out right for you." },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'cook.summary', row: 'the running cook shows its sentence',
    before: { text: "{mass} · {doneness} · peak yolk {yolk}" },
    after: { text: "{doneness} · peak yolk {yolk}" },
    appsBefore: ['ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'cook.method', row: 'the running cook shows its sentence',
    before: { text: "{start} · then {after}" },
    after: null,
    appsBefore: ['ios'], appsAfter: [],
  },
  {
    key: 'cook.method.cold', row: 'the running cook shows its sentence',
    before: { text: "Cold water" },
    after: null,
    appsBefore: ['ios'], appsAfter: [],
  },
  {
    key: 'cook.method.hot', row: 'the running cook shows its sentence',
    before: { text: "Boiling water" },
    after: null,
    appsBefore: ['ios'], appsAfter: [],
  },
  {
    key: 'cook.method.ice', row: 'the running cook shows its sentence',
    before: { text: "ice bath" },
    after: null,
    appsBefore: ['ios'], appsAfter: [],
  },
  {
    key: 'cook.method.tap', row: 'the running cook shows its sentence',
    before: { text: "cold tap" },
    after: null,
    appsBefore: ['ios'], appsAfter: [],
  },
  {
    key: 'cook.method.counter', row: 'the running cook shows its sentence',
    before: { text: "rest on the counter" },
    after: null,
    appsBefore: ['ios'], appsAfter: [],
  },
];

export const tighten: Draft = {
  base: '2c090c9',
  rows: TIGHTEN_DRAFT,
  exampleOnly: {},
};
