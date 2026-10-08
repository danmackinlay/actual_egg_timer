/**
 * The `tighten2` draft: the words the red-team review of the one screen
 * asked for (design/onescreen-review.md 2.3 and 3, "Words"), and the owner's
 * decision on the time's two lines (DECISIONS.md 99), in both apps, on
 * `83f7010`.
 *
 *  - The boil line under the time says only "about 8:00 to boil", whether
 *    the time to boil is a guess or remembered (DECISIONS.md 99): the
 *    certainty line below speaks for both. The two keys become one: core's
 *    `phaseKeys` says `readout.sub.coldAssumes` either way, and
 *    `readout.sub.coldGuesses` is retired. The (i) beside it shows only when
 *    the time is remembered, as before, and its paragraph
 *    (`readout.sub.coldAssumes.more`: how long water takes on average,
 *    refined by your past timings) still says what that number is; it is
 *    now the one place that says so.
 *  - Once the eggs are cooking, the likely time range opened under the
 *    certainty line is when to take them out, as times of day, where it was
 *    the whole time in m:ss under a clock counting down (review 2.3): "I
 *    think the right time to take the eggs out is between 7:48 and 7:51."
 *    Before Start it is the whole time, as the clock is (`certainty.time`,
 *    unchanged). Which one, and the times, are core's `timeRangeWords`.
 *  - The cold start's "heat off" clause while a cook runs says the heat off
 *    as the boiling one does, "heat off and lid on", as a sentence rather
 *    than a clipped list (review 3, "Words"): "into cold water at 7:42, heat
 *    off and lid on once it boils". It fits the clause's 60.
 *
 * No `copy/en-US.json` entry: American English says all of it the same way.
 *
 * The 1750 twins, rewritten rather than transformed (LANGUAGE.md section 6):
 *   readout.sub.coldAssumes: about {boil} to the boil (was "about {boil} to
 *     boil, as experience has shewn")
 *   readout.sub.coldGuesses: retired with its key ("about {boil} to boil, by
 *     conjecture")
 *   setup.start.coldStandingAt: set in cold water at {time}, lid on and fire
 *     out as it boils (was "set in cold water at {time}, boiled, the fire
 *     out, lid on")
 *   certainty.timeOut: I judge the true time to take the eggs out to lie
 *     between {low} and {high}.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const TIGHTEN2_DRAFT: Drafted[] = [
  {
    key: 'readout.sub.coldAssumes', row: 'below the time, idle, cold: the time to boil, remembered',
    before: { text: 'about {boil} to boil, from what I’ve timed before' },
    after: { text: 'about {boil} to boil' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'readout.sub.coldGuesses', row: 'below the time, idle, cold: the time to boil, guessed (retired: one line for both)',
    before: { text: 'about {boil} to boil, my guess' },
    after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'setup.start.coldStandingAt', row: 'start clause while a cook runs, the heat off',
    before: { text: 'into cold water at {time}, to the boil, heat off, lid on' },
    after: { text: 'into cold water at {time}, heat off and lid on once it boils' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'certainty.timeOut', row: 'what the certainty line opens, while the eggs cook: the likely time range',
    before: null,
    after: { text: 'I think the right time to take the eggs out is between {low} and {high}.' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
];

export const tighten2: Draft = {
  base: '83f7010',
  rows: TIGHTEN2_DRAFT,
  exampleOnly: {
    'certainty.time': 'Its note now says it is the idle range, beside certainty.timeOut.',
  },
};
