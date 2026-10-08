/**
 * The `onescreen_ios` draft: the `onescreen` words on iOS (SHIP-0.5 C3, its
 * iOS half; DECISIONS.md 91, 96 to 98; design/one-screen.md), on `ee5ffda`.
 * The web's keys gain iOS with no change of wording, as `period_ios`, `iosA`
 * and `iosB` did for theirs.
 *
 *  - The start clause says when the eggs went in while a cook runs, and its
 *    panel corrects it: the four `*At` start clauses, which core's
 *    `clauseKeys` now names (`startedAt`), so both apps choose them alike.
 *  - The start's panel, "Eggs in at" with a − and a +, and the line under
 *    it that says why a press went no further.
 *  - The sentence and the slider stay on screen while the egg cooks, and
 *    the slider's heading says the peak yolk, so the line under the running
 *    cook's sentence (`cook.summary`), iOS's alone since `onescreen`, is
 *    retired, its 1750 twin with it ("{doneness} · the yolk rising to
 *    {yolk}").
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** The web's words, unchanged, gaining iOS. */
const shared = (key: string, row: string, text: string): Drafted => ({
  key, row, before: { text }, after: { text }, appsBefore: ['web'], appsAfter: ['web', 'ios'],
});

const ONESCREEN_IOS_DRAFT: Drafted[] = [
  shared('setup.start.coldAt', 'start clause while a cook runs', 'into cold water at {time}, brought to the boil'),
  shared('setup.start.coldStandingAt', 'start clause while a cook runs', 'into cold water at {time}, to the boil, heat off, lid on'),
  shared('setup.start.hotAt', 'start clause while a cook runs', 'into boiling water at {time}'),
  shared('setup.start.hotStandingAt', 'start clause while a cook runs', 'into boiling water at {time}, heat off and lid on'),
  shared('controls.startedAt', 'the start\'s panel: when the eggs went in', 'Eggs in at'),
  shared('controls.startedAt.latestNow', 'the start\'s panel: why + goes no further', 'I can’t move it later than now.'),
  shared('controls.startedAt.latestBoil', 'the start\'s panel: why + goes no further',
    'I can’t move it later than {time}, when you pressed Full rolling boil.'),
  shared('controls.startedAt.latestPull', 'the start\'s panel: why + goes no further',
    'I can’t move it later than {time}, when the eggs were due out.'),
  shared('controls.startedAt.earliest', 'the start\'s panel: why − goes no further',
    'I can’t move it earlier than {time}, two hours before I started timing.'),
  {
    key: 'cook.summary', row: 'under the sentence while a cook runs (retired: the slider stays)',
    before: { text: '{doneness} · peak yolk {yolk}' },
    after: null,
    appsBefore: ['ios'], appsAfter: [],
  },
];

export const onescreen_ios: Draft = {
  base: 'ee5ffda',
  rows: ONESCREEN_IOS_DRAFT,
  exampleOnly: {},
};
