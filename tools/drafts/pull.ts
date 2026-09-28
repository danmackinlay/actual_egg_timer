/**
 * The `pull` draft: the pull alarm and the Lock Screen card name the cooling
 * chosen, on `5e38279`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** 28 September, the owner: at the pull, say the cooling the cook chose
 *  ("into the ice bath", "under the cold tap") rather than "the cooling"; the
 *  card's line is the alarm's sentence, word for word; and its heading loses
 *  "now", which the big text beside it already says. */
const PULL_DRAFT: Drafted[] = [
  {
    key: 'alarm.pull.body', row: 'the pull alarm, by cooling',
    before: { text: 'Straight into the cooling, or the yolk keeps cooking.' }, after: null,
    appsBefore: ['ios'], appsAfter: [],
  },
  {
    key: 'alarm.pull.bodyIce', row: 'the pull alarm, by cooling',
    before: null, after: { text: 'Straight into the ice bath, or the yolk keeps cooking.' },
    appsBefore: [], appsAfter: ['ios'],
  },
  {
    key: 'alarm.pull.bodyTap', row: 'the pull alarm, by cooling',
    before: null, after: { text: 'Straight under the cold tap, or the yolk keeps cooking.' },
    appsBefore: [], appsAfter: ['ios'],
  },
  {
    key: 'activity.stage.pull', row: 'the pull card heading',
    before: { text: 'Eggs out — now' }, after: { text: 'Eggs out' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'activity.note.pull', row: 'the pull card line is the alarm\'s',
    before: { text: 'into the cooling, or the yolk keeps going' }, after: null,
    appsBefore: ['ios'], appsAfter: [],
  },
  {
    key: 'activity.note.pullCounter', row: 'the pull card line is the alarm\'s',
    before: { text: 'resting on the counter' }, after: null,
    appsBefore: ['ios'], appsAfter: [],
  },
  {
    key: 'alarm.cooled.body', row: 'the cooled alarm, without "carryover"',
    before: { text: 'The carryover is over. That is the egg you asked for.' },
    after: { text: 'The yolk has stopped cooking. That is the egg you asked for.' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
];

export const pull: Draft = {
  base: '5e38279',
  rows: PULL_DRAFT,
  exampleOnly: {},
};
