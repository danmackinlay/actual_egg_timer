/**
 * The `loose` draft: the loose ends of 28 September - the units' (i) stops
 * saying a switch changes only the numbers, since on an English page Imperial
 * changes the words too; and four iOS strings nothing can draw any more are
 * retired - on `5d71a3c`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** 28 September, the loose ends found reconciling the documents with the
 *  code. The units' (i) said a switch "changes only how I write the numbers",
 *  but on an English page Imperial also switches to the English of 1750
 *  (LANGUAGE.md section 6), so it now says the words may change too, and no
 *  more than that. And four iOS strings are retired because nothing can draw
 *  them: a counter rest never cools, so its cooling label never shows; and
 *  the Lock Screen card ends at once on the stage before done, so its done
 *  state's words never show (an older build's card drawn done takes the app's
 *  own "Done"). */
const LOOSE_DRAFT: Drafted[] = [
  {
    key: 'controls.units.more', row: "the units' (i): the words may change too",
    before: { text: "Metric or Imperial, for every number I show and every number you type. I start with what's usual where your browser says you are. Switching changes only how I write the numbers: the egg and the times stay exactly the same, and the eggs don't mind which." },
    after: { text: "Metric or Imperial, for every number I show and every number you type. I start with what's usual where your browser says you are. Switching changes how I write the numbers, and may change my words too: the egg and the times stay exactly the same, and the eggs don't mind which." },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'controls.units.more.ios', row: "the units' (i): the words may change too",
    before: { text: "Metric or Imperial, for every number I show and every number you set. I start with what's usual where your phone says you are. Switching changes only how I write the numbers: the egg and the times stay exactly the same, and the eggs don't mind which." },
    after: { text: "Metric or Imperial, for every number I show and every number you set. I start with what's usual where your phone says you are. Switching changes how I write the numbers, and may change my words too: the egg and the times stay exactly the same, and the eggs don't mind which." },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'readout.phase.cooling', row: 'retired: nothing draws it',
    before: { text: 'Cooling' }, after: null,
    appsBefore: ['ios'], appsAfter: [],
  },
  {
    key: 'activity.stage.done', row: 'retired: nothing draws it',
    before: { text: 'Done' }, after: null,
    appsBefore: ['ios'], appsAfter: [],
  },
  {
    key: 'activity.note.done', row: 'retired: nothing draws it',
    before: { text: 'that is the egg you asked for' }, after: null,
    appsBefore: ['ios'], appsAfter: [],
  },
  {
    key: 'activity.eat', row: 'retired: nothing draws it',
    before: { text: 'Eat' }, after: null,
    appsBefore: ['ios'], appsAfter: [],
  },
];

export const loose: Draft = {
  base: '5d71a3c',
  rows: LOOSE_DRAFT,
  exampleOnly: {},
};
