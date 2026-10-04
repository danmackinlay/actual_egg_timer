/**
 * The `steppers` draft: the − and + beside every number the cook sets
 * (4 October 2026), on `6e10a4a`, the web only. Two new keys, none changed or
 * retired.
 *
 * Typing numbers is a chore on a phone, so each number a cook sets - the
 * egg's weight, girth and width, its temperature when it is Custom, the
 * altitude, the water and the number of eggs - has a − and a + beside it,
 * which step it on its grid (src/core/units.ts) and repeat while held. The
 * buttons show a glyph drawn in CSS, not a word; these two keys are their
 * names to a screen reader. The field stays typeable, and its arrow keys
 * still step it.
 *
 * "Less: Altitude", not "Less altitude": the owner's rule is that an inserted
 * word stands alone after a colon, never inside running grammar, and "Less
 * number of eggs" would not read. `more.about` ("About {label}") predates the
 * rule and is left alone here.
 *
 * iOS needs no words: its system steppers name their own buttons, and each
 * number with its stepper is one adjustable element to VoiceOver, named by
 * the label it already has.
 *
 * No `copy/en-US.json` entry: American English says these the same way, and
 * an overlay holds only what a region says differently.
 *
 * The 1750 twins, new, rewritten after Johnson's verbs rather than
 * transformed:
 *   controls.less: Diminish: {label}
 *   controls.more: Augment: {label}
 */

import type { Draft, Drafted } from '../copyDraft.js';

const STEPPERS_DRAFT: Drafted[] = [
  {
    key: 'controls.less', row: 'Every number: −',
    before: null, after: { text: 'Less: {label}' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'controls.more', row: 'Every number: +',
    before: null, after: { text: 'More: {label}' },
    appsBefore: [], appsAfter: ['web'],
  },
];

export const steppers: Draft = {
  base: '6e10a4a',
  rows: STEPPERS_DRAFT,
  exampleOnly: {},
};
