/**
 * The `warn` draft: low odds warn instead of refusing (5 October 2026), on
 * `ab5cd22`, both apps. The owner, on a phone: the thumb would not go left
 * of jammy though the dotted track looked draggable - "is a soft yolk just
 * impossible?" It was not. The owner's decision (DECISIONS.md 83): only the
 * stripes, what the pan cannot deliver, refuse; a dotted level, one the pan
 * delivers but gets right fewer than 3 times in 10 so far, can be chosen,
 * and the app says so.
 *
 * So the two sentences that named where the slider had been moved to ("The
 * softest I get right at least 3 times in 10, so far: jammy.") are retired,
 * since the slider no longer moves there, and one warning names the level
 * the slider rests on. The doneness word stands alone before the colon, as
 * the owner's rule has it, in the capital the ticks give it; "this" is that
 * yolk. "So far" stays: the odds rise as eggs are answered.
 *
 * No `copy/en-US.json` entry: American English says it the same way, and
 * neither retired key had a twin there.
 *
 * The 1750 twin, rewritten ("hitherto" carries "so far", as the retired
 * twins had it):
 *   warn.lowOdds: {doneness}: in this I have hitherto succeeded fewer than
 *     {hits} times in {of}.
 * retiring "The softest in which I hitherto succeed at least {hits} times in
 * {of}: {limit}." and its firmest.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const WARN_DRAFT: Drafted[] = [
  {
    key: 'refusal.unlikelySoft', row: 'warning line: softest at 3 in 10 (retired)',
    before: { text: 'The softest I get right at least {hits} times in {of}, so far: {limit}.' },
    after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'refusal.unlikelyHard', row: 'warning line: firmest at 3 in 10 (retired)',
    before: { text: 'The firmest I get right at least {hits} times in {of}, so far: {limit}.' },
    after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'warn.lowOdds', row: 'warning line: low odds',
    before: null,
    after: { text: '{doneness}: I get this right fewer than {hits} times in {of} so far.' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
];

export const warn: Draft = {
  base: 'ab5cd22',
  rows: WARN_DRAFT,
  exampleOnly: {},
};
