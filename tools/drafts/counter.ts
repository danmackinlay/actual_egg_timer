/**
 * The `counter` draft: iOS's pull alarm and note on a counter rest, on
 * `4817303`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** 27 September: on a counter rest there is no cooling step, so iOS's pull
 *  alarm and pull note get their own lines instead of "into the cooling". */
const COUNTER_DRAFT: Drafted[] = [
  {
    key: 'alarm.pull.bodyCounter', row: 'counter rest: the pull alarm',
    before: null, after: { text: "Out of the water and onto the counter." },
    appsBefore: [], appsAfter: ['ios'],
  },
  {
    key: 'activity.note.pullCounter', row: 'counter rest: the pull note',
    before: null, after: { text: "resting on the counter" },
    appsBefore: [], appsAfter: ['ios'],
  },
];

export const counter: Draft = {
  base: '4817303',
  rows: COUNTER_DRAFT,
  exampleOnly: {},
};
