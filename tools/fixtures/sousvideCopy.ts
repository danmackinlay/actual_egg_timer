/**
 * fixtures/sousvideCopy.json: which words say the sous-vide answer.
 */

import { render, renderRef } from '../../src/core/copy.js';
import { longDuration, startPhrase, weekdayKey } from '../../src/core/sousvide.js';

import { english } from './shared.js';

/* The two unit choices, which at a 58 C bath reach only two of their six
 * branches in normal use. Every boundary, from both sides, because four of
 * these were ported by hand and never once executed in either language. Each
 * row is the bucket core picks - a key and its numbers - and the English it
 * renders to, which is what this file held before core stopped speaking
 * English, and is unchanged. */

export const sousvideCopyFixture = {
  duration: [
    0, 1, 59, 60, 89 * 60, 90 * 60, 91 * 60, 120 * 60,
    2 * 3600, 2.5 * 3600, 47 * 3600, 47.5 * 3600, 48 * 3600, 49 * 3600,
    13 * 86400, 14 * 86400, 20 * 86400, 60 * 86400, 200 * 86400,
    81760.26, 1428737.1,
  ].map((seconds) => {
    const ref = longDuration(seconds);
    return { seconds: seconds, key: ref.key, args: ref.args, text: renderRef(english, ref) };
  }),
  startPhrase: [0, 1, 2, 3, 6, 7, 8, 13, 14, 20, 40, 59, 60, 90, 200, 400]
    .map((daysAgo) => {
      const ref = startPhrase(daysAgo);
      return {
        daysAgo: daysAgo,
        key: ref.key,
        args: ref.args,
        // A fixed weekday, so the branch is pinned without dragging a locale
        // into the fixture. Which weekday each app supplies is its own business.
        text: renderRef(english, ref, { weekday: 'Tuesday' }),
      };
    }),
  // The weekday's catalogue key, by Date.getDay() numbering, and what either
  // app's arithmetic might hand it past the ends of the week.
  weekday: [-8, -1, 0, 1, 2, 3, 4, 5, 6, 7, 13].map((day) => ({
    day: day, key: weekdayKey(day), text: render(english, weekdayKey(day)),
  })),
};
