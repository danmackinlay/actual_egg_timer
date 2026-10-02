/**
 * The `learning` draft: the Learning mark on the time (E8, DECISIONS.md 3,
 * 52 and 55), new in both apps, on `421ae8f` (2 October 2026). Two new keys.
 *
 * DECISIONS.md 3 allowed the nudge on one condition, that the app says it is
 * learning, on the screen with the time; 52 made that "a tiny badge over the
 * UI with a disclosure (i)". The mark shows while sharing is on, the only
 * time the time is nudged. Its (i) says why the time may move, that it can
 * cost a little - the owner chose +-10 s knowing it costs a cook about three
 * eggs in a hundred (55) - and how to stop it.
 *
 * The 1750 twins (copy/en-x-1750.json), new:
 *   learning.badge: Yet learning
 *   learning.badge.more: You share your eggs, and so I am yet learning from them. Now and then I move the time some seconds either way, ten at most, to learn what passes just beside the time I would choose. It may leave an egg a little softer or firmer than I would otherwise aim at. Leave off sharing in the settings, and the time stays where I would put it.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const LEARNING_DRAFT: Drafted[] = [
  {
    key: 'learning.badge', row: 'The time: Learning mark',
    before: null, after: { text: "Learning" },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'learning.badge.more', row: 'The time: Learning mark',
    before: null, after: { text: "You're sharing your eggs, so I'm still learning from them. Now and then I move the time a few seconds either way, up to ten, to learn what happens just off the time I'd pick. It can leave an egg a little softer or firmer than I'd otherwise aim for. Turn sharing off in Settings and the time stays where I'd put it." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
];

export const learning: Draft = {
  base: '421ae8f',
  rows: LEARNING_DRAFT,
  exampleOnly: {},
};
