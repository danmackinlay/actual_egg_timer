/**
 * The `feedback2` draft: the owner's requests of 5 October 2026 (DECISIONS.md
 * 79), on `7931530`, both apps. Named `feedback2` because `feedback` is the
 * first draft of all (the feedback screens, E2), and a draft's name is its key.
 * Three new keys, none changed or retired.
 *
 *  - After a cook, above "How was the yolk?", one line says what the cook was
 *    started for, from what was started rather than the slider now, so the
 *    answer is graded against it: "You asked for: jammy, peak yolk 65 °C".
 *  - The probe reading gets a − and a +, in whole degrees from the peak yolk
 *    the cook was started at, which the empty field shows greyed. No words:
 *    on the web the buttons are named "Less: Highest reading" from the keys
 *    the `steppers` draft made, and iOS's system stepper names its own.
 *  - Settings has an optional Room temperature, shown while the probe is on,
 *    with an (i) that says why it matters.
 *
 * No `copy/en-US.json` entry: American English says these the same way.
 *
 * The 1750 twins, new, rewritten rather than transformed:
 *   feedback.target: You desired: {doneness}, the yolk rising to {yolk}
 *     (after the just-right answer, "As was desired", and the running cook's
 *     "the yolk rising to")
 *   controls.room: The warmth of the room
 *   controls.room.more: At your pleasure. Hold the probe in the air of your
 *     kitchen, and set down what it reads; it signifies most for eggs that
 *     have stood in the room, and for eggs cooled in the open air. Leave it
 *     empty, and I shall suppose {room}.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const FEEDBACK2_DRAFT: Drafted[] = [
  {
    key: 'feedback.target', row: 'After a cook: over the yolk question',
    before: null, after: { text: 'You asked for: {doneness}, peak yolk {yolk}' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.room', row: 'Settings: under the probe',
    before: null, after: { text: 'Room temperature' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.room.more', row: 'Settings: the room’s (i)',
    before: null,
    after: { text: 'Optional. Hold your probe in the air of your kitchen and set what it reads. It matters most for eggs left out at room temperature and eggs cooled in the air. Leave it blank and I’ll assume {room}.' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
];

export const feedback2: Draft = {
  base: '7931530',
  rows: FEEDBACK2_DRAFT,
  exampleOnly: {},
};
