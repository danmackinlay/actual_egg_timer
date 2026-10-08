/**
 * The `onescreen_ios` draft: the `onescreen` words on iOS (SHIP-0.5 C3, its
 * iOS half; DECISIONS.md 91, 96 to 98; design/one-screen.md), on `ee5ffda`.
 * The web's keys gain iOS with no change of wording, as `period_ios`, `iosA`
 * and `iosB` did for theirs.
 *
 *  - The start clause says when the eggs went in while a cook runs, and its
 *    panel corrects it: the four `*At` start clauses, which core's
 *    `clauseKeys` now names (`startedAt`), so both apps choose them alike.
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
];

export const onescreen_ios: Draft = {
  base: 'ee5ffda',
  rows: ONESCREEN_IOS_DRAFT,
  exampleOnly: {},
};
