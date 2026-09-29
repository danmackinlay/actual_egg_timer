/**
 * The `feedback` draft: the feedback screens, implemented with E2 on
 * `cfe38e9`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** The first draft. The two "E5, preview" rows of the draft are not here:
 *  they belong to E5. */
const FEEDBACK_DRAFT: Drafted[] = [
  {
    key: 'feedback.tooFirm', row: 'yolk answers',
    before: { text: 'Too firm' }, after: { text: 'Too firm' },
    appsBefore: ['web'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.tooHard', row: 'yolk answers',
    before: { text: 'Too hard' }, after: null, appsBefore: ['ios'], appsAfter: [],
  },
  {
    key: 'feedback.white.ask', row: 'white question',
    before: { text: 'And the white — was it runny?' }, after: { text: 'And the white?' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.white.runny', row: 'white answers',
    before: { text: 'Still runny' }, after: { text: 'Runny' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.white.set', row: 'white answers',
    before: { text: 'Set right through' }, after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'feedback.white.tender', row: 'white answers',
    before: null, after: { text: 'Tender' }, appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.white.firm', row: 'white answers',
    before: null, after: { text: 'Firm' }, appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.white.why', row: 'optional hint',
    before: { text: 'The white sets from the outside in, so this says something about your eggs that the yolk cannot.' },
    after: null, appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'feedback.optional', row: 'optional hint',
    before: null, after: { text: 'Answer either, both or neither.' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.thanks', row: 'after an answer',
    before: { text: 'Thanks — it has adjusted.' }, after: { text: 'Thanks. The next egg will use that.' },
    appsBefore: ['ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.invite', row: 'before any egg',
    before: { text: 'Telling it tunes the model to your eggs and your pan.' },
    after: { text: 'Your answers adjust the times to your eggs and your pan.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'learned.tuned', row: 'what it has learned',
    before: { one: 'tuned on {eggs} egg · ±{spread}%', other: 'tuned on {eggs} eggs · ±{spread}%' },
    after: { one: 'Learned from {eggs} egg', other: 'Learned from {eggs} eggs' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'learned.literature', row: 'nothing learned yet',
    before: { text: 'Running on the literature values. It learns your pan when you time a boil, and your taste when you say how an egg was.' },
    after: { text: 'Nothing learned yet. It learns your pan when you time a boil, and your eggs when you say how one came out.' },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'learned.confirm.title', row: 'forget dialog, iOS',
    before: { text: 'Forget the calibration?' }, after: { text: 'Forget what it learned?' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'learned.confirm.message', row: 'forget dialog, iOS',
    before: { text: 'The model goes back to the literature values it shipped with, and the time to boil goes back to a guess.' },
    after: { text: 'Every egg and your pan\'s boil time are forgotten, and the times go back to where they started.' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'readout.sub.pull', row: 'pull screen, web',
    before: { text: 'carryover is running' }, after: { text: 'the yolk is still cooking' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'action.pulled.ice', row: 'pull button, iOS',
    before: { text: 'They\'re in the ice bath' }, after: { text: 'They\'re in the ice bath' },
    appsBefore: ['web'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'action.pulled.tap', row: 'pull button, iOS',
    before: { text: 'They\'re under the tap' }, after: { text: 'They\'re under the tap' },
    appsBefore: ['web'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'action.pulled.counter', row: 'pull button, iOS',
    before: { text: 'They\'re out' }, after: { text: 'They\'re out' },
    appsBefore: ['web'], appsAfter: ['web', 'ios'],
  },
];

export const feedback: Draft = {
  base: 'cfe38e9',
  rows: FEEDBACK_DRAFT,
  exampleOnly: { 'learned.both': 'its example quotes learned.tuned, whose wording changed' },
};
