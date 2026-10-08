/**
 * The `onescreen` draft: the words of the one screen for setting up and
 * boiling (SHIP-0.5 C3, DECISIONS.md 91, 96 to 98; design/one-screen.md), on
 * `b314a4c`, the web only for now: iOS adds its own apps to these rows in its
 * step, reusing the words.
 *
 *  - The setup sentence stays on screen while the egg cooks, so the line
 *    under it that said what it did not (the doneness and the peak yolk,
 *    `cook.summary`) is the web's no more: the slider stays too, and its
 *    heading says the peak yolk. iOS keeps it until its own one screen.
 *  - While a cook runs the start clause says when the eggs went in, "into
 *    cold water at 7:42", and its panel corrects it a minute at a time
 *    (design/one-screen.md section 7, 20). Each start clause has a twin with
 *    the time after the water, where a cook would say it. A cold start with
 *    the heat off says "to the boil, heat off, lid on" there, where idle
 *    says "brought to the boil, heat off and lid on": with the time in it
 *    the longer words run past a clause's budget.
 *  - The panel's row is "Eggs in at", as the button that starts a boiling
 *    start says "Eggs in". When a − or + goes no further, the line under it
 *    says why, in the first person, with the time it stops at: now, the press
 *    of Full rolling boil (a cold start reads that as before the eggs went in
 *    if the start passes it, so the cook does not read the stop as a fault),
 *    the time the eggs were due out, or two hours before I started timing.
 *
 * No `copy/en-US.json` entry: American English says all of it the same way.
 *
 * The 1750 twins, rewritten rather than transformed (LANGUAGE.md section 6):
 *   cook.summary: unchanged, iOS's alone now.
 *   setup.start.coldAt: set in cold water at {time} and brought to the boil
 *   setup.start.coldStandingAt: set in cold water at {time}, boiled, the fire out, lid on
 *   setup.start.hotAt: put into boiling water at {time}
 *   setup.start.hotStandingAt: put into boiling water at {time}, the fire out and the lid on
 *   controls.startedAt: The eggs put in at
 *   controls.startedAt.latestNow: I cannot make it later than the present moment.
 *   controls.startedAt.latestBoil: I cannot make it later than {time}, when you told me the water boiled in earnest.
 *   controls.startedAt.latestPull: I cannot make it later than {time}, when the eggs were due out of the water.
 *   controls.startedAt.earliest: I cannot make it earlier than {time}, two hours before I began to keep the time.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const ONESCREEN_DRAFT: Drafted[] = [
  {
    key: 'cook.summary', row: 'under the sentence while a cook runs (web: retired; the slider stays)',
    before: { text: '{doneness} · peak yolk {yolk}' },
    after: { text: '{doneness} · peak yolk {yolk}' },
    appsBefore: ['web', 'ios'], appsAfter: ['ios'],
  },
  {
    key: 'setup.start.coldAt', row: 'start clause while a cook runs',
    before: null,
    after: { text: 'into cold water at {time}, brought to the boil' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'setup.start.coldStandingAt', row: 'start clause while a cook runs',
    before: null,
    after: { text: 'into cold water at {time}, to the boil, heat off, lid on' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'setup.start.hotAt', row: 'start clause while a cook runs',
    before: null,
    after: { text: 'into boiling water at {time}' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'setup.start.hotStandingAt', row: 'start clause while a cook runs',
    before: null,
    after: { text: 'into boiling water at {time}, heat off and lid on' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'controls.startedAt', row: 'the start\'s panel: when the eggs went in',
    before: null,
    after: { text: 'Eggs in at' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'controls.startedAt.latestNow', row: 'the start\'s panel: why + goes no further',
    before: null,
    after: { text: 'I can’t move it later than now.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'controls.startedAt.latestBoil', row: 'the start\'s panel: why + goes no further',
    before: null,
    after: { text: 'I can’t move it later than {time}, when you pressed Full rolling boil.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'controls.startedAt.latestPull', row: 'the start\'s panel: why + goes no further',
    before: null,
    after: { text: 'I can’t move it later than {time}, when the eggs were due out.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'controls.startedAt.earliest', row: 'the start\'s panel: why − goes no further',
    before: null,
    after: { text: 'I can’t move it earlier than {time}, two hours before I started timing.' },
    appsBefore: [], appsAfter: ['web'],
  },
];

export const onescreen: Draft = {
  base: 'b314a4c',
  rows: ONESCREEN_DRAFT,
  exampleOnly: {},
  argumentsMoved: {
    'outcome.range': 'The bracket under the slider, said to a screen reader, is drawn while a cook runs too, '
      + 'from its plan (on the measured pot once the boil is pressed), so it can name a range no idle screen did.',
    'outcome.range.one': 'As outcome.range.',
  },
  redrawn: {
    'setup.sentence': 'While a cook ran, the sentence was drawn whole, as plain prose with nothing to tap; on the '
      + 'one screen it is the setup sentence in every phase, its clauses buttons, so its whole renderings go '
      + 'and its pieces are the idle screen\'s.',
  },
};
