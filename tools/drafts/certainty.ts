/**
 * The `certainty` draft: how sure I am, in words, below the time display
 * (8 October 2026, DECISIONS.md 93 and 97; SHIP-0.5.md D1), on `e9c4208`,
 * both apps. The direction ("Probably just right. If not, a little firm.")
 * spoke of "just right", which the cook is no longer asked (DECISIONS.md 92),
 * so it retires with its lean and its (i). In its place, from core's
 * `certaintyAt` at the time on screen:
 *
 *  - The line is one of the owner's three words, as a short label a cook
 *    can press: "Very certain", "A ballpark figure", "A wild guess". The
 *    owner's "ballpark" is a noun's modifier, so it gets its noun; "A wild
 *    guess" is said whole; "Very certain" stands as the owner said it. No
 *    full stop: each is a label, and the cook presses it.
 *  - Pressed, it opens in place the 90% interval in the slider's words, after
 *    a colon so each word stands alone (LANGUAGE.md section 3): "9 times in
 *    10: Soft to Fudgy.", or one word when one holds it. Then "Most likely:
 *    Jammy." unless it is already under the line or the interval is that
 *    one word. Then the likely time range, as a person says an estimate:
 *    "I think the right time is between 6:41 and 8:27." (A7's range, the
 *    owner's to confirm). Then, while idle, "More about how sure I am", a
 *    link to Help, where the (i)'s three paragraphs now are.
 *  - "Most likely: Fudgy." shows under the line, unpressed, when it is not
 *    the word asked.
 *  - The warning on a dotted level says it is a wild guess, the word
 *    standing alone before the colon, as warn.lowOdds did: "Soft: a wild
 *    guess so far." "So far" stays: it gets surer as eggs are answered.
 *  - Help's "How sure I am" says what the three words mean, and its aside
 *    that the bracket is now nine eggs in ten (it was eight) and what the
 *    shading and the dots now say.
 *
 * The (i)'s three paragraphs keep their words and move to Help, so their
 * surface is Help's: they are rows whose words are the same before and after.
 * Entries changed only in a note are in `exampleOnly`.
 *
 * No `copy/en-US.json` entry: American English says all of it the same
 * way, "ballpark" included, and none of the keys had one.
 *
 * The 1750 twins, rewritten rather than transformed ("morally certain" is
 * the period's own phrase for a certainty enough to act on; "at hazard" is
 * Johnson's "at random"; "trials" is the experimental philosophy's word):
 *   certainty.veryCertain: Morally certain
 *   certainty.ballpark: Near the mark
 *   certainty.wildGuess: A guess at hazard
 *   certainty.interval: In {hits} trials of {of}: {from} to {to}.
 *   certainty.interval.one: In {hits} trials of {of}: {word}.
 *   certainty.mostLikely: Most probably: {word}.
 *   certainty.time: I judge the true time to lie between {low} and {high}.
 *   certainty.help: More of my certainty, in the Preface
 *   warn.wildGuess: {doneness}: hitherto a guess at hazard.
 *   help.odds.p1: I cannot promise every egg. Below the figures of the time
 *     I tell you how far I am sure of it. Morally certain means that in nine
 *     trials of ten you shall have the yolk you desired; near the mark, that
 *     you shall have it or its neighbour upon the slider; and whatever is
 *     less sure than this is a guess at hazard. Press the words, and I shall
 *     shew the yolks you are likely to have, and the bounds within which the
 *     true time probably lies.
 *   help.odds.aside: Nine eggs in ten will come out within the bracket. I
 *     incline to the longer side, since a white left unset is commonly worse
 *     than a yolk too firm. The deeper the shading upon the slider, the
 *     oftener you will have the yolk you desired; and the dots mark the
 *     degrees that are yet a guess at hazard.
 * and retired with their keys: the six direction sentences ("Probably as you
 * desire.", …), "Of my certainty" as the (i)'s name, and "{doneness}: in
 * this I have hitherto succeeded fewer than {hits} times in {of}."
 */

import type { Draft, Drafted } from '../copyDraft.js';

const CERTAINTY_DRAFT: Drafted[] = [
  {
    key: 'certainty.veryCertain', row: 'certainty line',
    before: null,
    after: { text: 'Very certain' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'certainty.ballpark', row: 'certainty line',
    before: null,
    after: { text: 'A ballpark figure' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'certainty.wildGuess', row: 'certainty line',
    before: null,
    after: { text: 'A wild guess' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'certainty.interval', row: 'certainty line, pressed',
    before: null,
    after: { text: '{hits} times in {of}: {from} to {to}.' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'certainty.interval.one', row: 'certainty line, pressed',
    before: null,
    after: { text: '{hits} times in {of}: {word}.' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'certainty.mostLikely', row: 'certainty line, and pressed',
    before: null,
    after: { text: 'Most likely: {word}.' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'certainty.time', row: 'certainty line, pressed',
    before: null,
    after: { text: 'I think the right time is between {low} and {high}.' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'certainty.help', row: 'certainty line, pressed',
    before: null,
    after: { text: 'More about how sure I am' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'outcome.likely', row: 'direction (retired)',
    before: { text: 'Probably just right.' },
    after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'outcome.likely.firm', row: 'direction (retired)',
    before: { text: 'Probably just right. If not, a little firm.' },
    after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'outcome.likely.soft', row: 'direction (retired)',
    before: { text: 'Probably just right. If not, a little soft.' },
    after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'outcome.unsure', row: 'direction (retired)',
    before: { text: 'It could come out too soft or too firm. I can’t tell yet.' },
    after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'outcome.miss.firm', row: 'direction (retired)',
    before: { text: 'It might miss, and if so, probably too firm.' },
    after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'outcome.miss.soft', row: 'direction (retired)',
    before: { text: 'It might miss, and if so, probably too soft.' },
    after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'outcome.info', row: 'direction (i) (retired)',
    before: { text: 'How sure I am' },
    after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'warn.lowOdds', row: 'warning line: low odds (retired)',
    before: { text: '{doneness}: I get this right fewer than {hits} times in {of} so far.' },
    after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'warn.wildGuess', row: 'warning line: a wild guess',
    before: null,
    after: { text: '{doneness}: a wild guess so far.' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'help.odds.p1', row: 'Help: how sure I am',
    before: { text: 'I can’t promise every egg. Below the time display, I tell you whether this one will probably come out as you asked, and if not, whether too soft or too firm. The bracket below the Doneness slider shows the range of yolks you’re likely to get. The more eggs you tell me about, the narrower it gets.' },
    after: { text: 'I can’t promise every egg. Below the time display I say how sure I am of it. Very certain means that 9 times in 10 you’ll get the yolk you asked for. A ballpark figure means that 9 times in 10 you’ll get that yolk or the one next to it on the slider. Anything less sure is a wild guess. Press the words to see which yolks you’re likely to get, and a likely range for the right time.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'help.odds.aside', row: 'Help: how sure I am',
    before: { text: 'Eight eggs out of ten will cook to a target inside this bracket. I try to err on the side of cooking too long, since a runny white is usually worse than an overfirm yolk. The stronger the shading on the slider, the surer I am of getting that doneness right.' },
    after: { text: 'Nine eggs out of ten will cook to a target inside the bracket. I try to err on the side of cooking too long, since a runny white is usually worse than an overfirm yolk. The stronger the shading on the slider, the more often you get the yolk you asked for. Dots mark the yolks that are still a wild guess.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'outcome.bracket', row: 'Help: moved from the (i)',
    before: { text: 'The bracket below the slider shows the range your yolk will probably fall in. If you’d rather not risk a soft yolk, slide right until the left end of the bracket is somewhere you’d be happy with. If you’d rather not risk a firm one, slide left until the right end is.' },
    after: { text: 'The bracket below the slider shows the range your yolk will probably fall in. If you’d rather not risk a soft yolk, slide right until the left end of the bracket is somewhere you’d be happy with. If you’d rather not risk a firm one, slide left until the right end is.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'outcome.why', row: 'Help: moved from the (i)',
    before: { text: 'At first I don’t know your taste, your eggs or your kitchen, so the bracket starts wide. It narrows with each egg you tell me about.' },
    after: { text: 'At first I don’t know your taste, your eggs or your kitchen, so the bracket starts wide. It narrows with each egg you tell me about.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'outcome.learning', row: 'Help: moved from the (i)',
    before: { text: 'To help me learn faster, answer both questions after each egg, and on a cold-water start, tell me when the water is boiling hard all over. If you have a probe thermometer, a single reading helps most.' },
    after: { text: 'To help me learn faster, answer both questions after each egg, and on a cold-water start, tell me when the water is boiling hard all over. If you have a probe thermometer, a single reading helps most.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
];

export const certainty: Draft = {
  base: 'e9c4208',
  rows: CERTAINTY_DRAFT,
  exampleOnly: {
    'outcome.range': 'its note: the bracket is the 5% and 95% points now',
    'outcome.whiteRunny': 'its note: under the certainty line, not the direction',
  },
  argumentsMoved: {
    'outcome.range': 'the bracket is the 90% range now, so a screen reader hears wider ends: "Likely yolk: Soft to Fudgy" on a fresh jammy egg became "Runny to Fudgy"',
  },
};
