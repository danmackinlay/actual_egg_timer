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
 *
 * No `copy/en-US.json` entry: American English says all of it the same way.
 *
 * The 1750 twins, rewritten rather than transformed (LANGUAGE.md section 6):
 *   cook.summary: unchanged, iOS's alone now.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const ONESCREEN_DRAFT: Drafted[] = [
  {
    key: 'cook.summary', row: 'under the sentence while a cook runs (web: retired; the slider stays)',
    before: { text: '{doneness} · peak yolk {yolk}' },
    after: { text: '{doneness} · peak yolk {yolk}' },
    appsBefore: ['web', 'ios'], appsAfter: ['ios'],
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
