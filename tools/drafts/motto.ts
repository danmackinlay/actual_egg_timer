/**
 * The `motto` draft: two new keys on the Help page in both apps, on
 * `f52f254` (2 October 2026; DECISIONS.md 53). `help.motto`, the owner's
 * motto, is a short line under the page's title; `help.credit`, the last
 * line of the page under the privacy link, names the owner and links their
 * blog. Nothing is added to the cooking screen.
 *
 * The 1750 twins (copy/en-x-1750.json), new:
 *   help.motto: Time the egg, and not the minute.
 *     the aphorism the small surfaces take from Johnson (LANGUAGE.md
 *     section 6): an antithesis, compressed.
 *   help.credit: Contrived by [Dan MacKinlay](https://danmackinlay.name)
 *     "contrive" in the Dictionary's sense, to plan out.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const MOTTO_DRAFT: Drafted[] = [
  {
    key: 'help.motto', row: 'Help: motto',
    before: null, after: { text: 'Time eggs, not minutes.' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'help.credit', row: 'Help: credit',
    before: null, after: { text: 'Made by [Dan MacKinlay](https://danmackinlay.name)' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
];

export const motto: Draft = {
  base: 'f52f254',
  rows: MOTTO_DRAFT,
  exampleOnly: {},
};
