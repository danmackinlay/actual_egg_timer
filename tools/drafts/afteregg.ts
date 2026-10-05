/**
 * The `afteregg` draft: the questions after an egg (6 October 2026,
 * DECISIONS.md 92), on `1676676`, both apps. The owner, testing 0.4 on a
 * phone: "too soft / just right / too firm is throwing away bits", and it
 * had no answer for the yolk they wanted, could not choose and got anyway
 * (runny, on a new install). So:
 *
 *  - The yolk question names the yolk the cook got, in the slider's own five
 *    words. The buttons ARE the slider's words, `doneness.runny` to
 *    `doneness.hard`, unchanged: the cook has just read them on the ticks,
 *    and their tick budget of five characters is what lets five sit side by
 *    side on a phone. Only their notes change, to say so. The three answers
 *    against the target retire. "You asked for: …" stays above the question.
 *  - The white question asks about the white next to the yolk, which is the
 *    white the model has always scored (INFERENCE.md section 3); the white
 *    next to the shell is nearly always set.
 *  - The probe is no longer offered while the egg cooks. Its reading is a
 *    field under the two questions, whenever the cook has a moment to probe,
 *    with a question of its own and how to take it. "Now" carries what "when
 *    I ask" did: the panel comes when the countdown ends at the peak. The
 *    offer, its two buttons and the old prompt over the field retire.
 *  - "Both questions are optional" becomes a line that also covers the
 *    reading, and still reads right when there is none.
 *  - Help's technical aside named the three old answers.
 *
 * No `copy/en-US.json` entry: none of these keys has one, and American
 * English says them the same way.
 *
 * The 1750 twins, rewritten rather than transformed:
 *   feedback.white.ask: And of the white about the yolk? ("about" as
 *     Johnson has it, round about)
 *   feedback.optional: Answer what you please, and leave the rest.
 *   probe.ask: Have you a probe thermometer? (the retired offer's opening)
 *   probe.how: Thrust it now to the middle of the yolk, and tell me the
 *     highest number you see.
 *   help.learn.aside: … for the yolk you had, from rear to hard, and the
 *     white about it. …
 * and retired with their keys: "Too rear", "As was desired", "Too hard", the
 * offer ("Have you a probe thermometer? When I bid you, …"), "Yes", "No,
 * thank you", "Thrust the probe to the middle" and "Tell me the highest
 * number you see."
 */

import type { Draft, Drafted } from '../copyDraft.js';

const AFTEREGG_DRAFT: Drafted[] = [
  {
    key: 'feedback.tooSoft', row: 'After a cook: yolk (retired)',
    before: { text: 'Too soft' }, after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'feedback.justRight', row: 'After a cook: yolk (retired)',
    before: { text: 'Just right' }, after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'feedback.tooFirm', row: 'After a cook: yolk (retired)',
    before: { text: 'Too firm' }, after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'feedback.white.ask', row: 'After a cook: the white',
    before: { text: 'And the white?' }, after: { text: 'And the white next to the yolk?' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.optional', row: 'After a cook: under all',
    before: { text: 'Both questions are optional.' }, after: { text: 'Each of these is optional.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'probe.offer', row: 'Running cook: probe offer (retired)',
    before: { text: 'Do you have a probe thermometer? If so, when I ask, push it into the middle of the egg and tell me the highest number you see.' },
    after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'probe.offer.yes', row: 'Running cook: probe offer (retired)',
    before: { text: 'Yes' }, after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'probe.offer.no', row: 'Running cook: probe offer (retired)',
    before: { text: 'No thanks' }, after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'probe.now', row: 'After a cook: probe (retired)',
    before: { text: 'Push the probe to the middle' }, after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'probe.hint', row: 'After a cook: probe (retired)',
    before: { text: 'Tell me the highest number you see.' }, after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'probe.ask', row: 'After a cook: probe',
    before: null, after: { text: 'Do you have a probe thermometer?' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'probe.how', row: 'After a cook: probe',
    before: null,
    after: { text: 'Push it into the middle of the yolk now and tell me the highest number you see.' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'help.learn.aside', row: 'Help: what I learn from',
    before: { text: 'I use [sequential Monte Carlo](https://en.wikipedia.org/wiki/Particle_filter) to learn about your eggs and your taste, with an [ordered probit](https://en.wikipedia.org/wiki/Ordered_probit) for too soft, just right and too firm. I keep a record of every egg, so when I’m updated, I relearn from all of them. [The design](https://github.com/danmackinlay/actual_egg_timer/blob/main/INFERENCE.md).' },
    after: { text: 'I use [sequential Monte Carlo](https://en.wikipedia.org/wiki/Particle_filter) to learn about your eggs and your taste, with an [ordered probit](https://en.wikipedia.org/wiki/Ordered_probit) for the yolk you got, runny to hard, and the white next to it. I keep a record of every egg, so when I’m updated, I relearn from all of them. [The design](https://github.com/danmackinlay/actual_egg_timer/blob/main/INFERENCE.md).' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
];

const ANSWER_NOTE = 'note only: also the yolk answer after a cook (DECISIONS.md 92)';

export const afteregg: Draft = {
  base: '1676676',
  rows: AFTEREGG_DRAFT,
  exampleOnly: {
    'doneness.runny': ANSWER_NOTE,
    'doneness.soft': ANSWER_NOTE,
    'doneness.jammy': ANSWER_NOTE,
    'doneness.fudgy': ANSWER_NOTE,
    'doneness.hard': ANSWER_NOTE,
  },
};
