/**
 * The `privacy` draft: one new key, `help.privacy`, the last thing on the
 * Help page in both apps, linking the privacy page (privacy/index.html, at
 * /privacy on the web app's site; DECISIONS.md 51), on `36c121e`
 * (2 October 2026). The page itself is plain English outside the
 * catalogue (LANGUAGE.md section 2); only the link's word is copy.
 *
 * The 1750 twin (copy/en-x-1750.json), new:
 *   help.privacy: Of Privacy
 *     after the Preface's own headings ("Of what I learn").
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const PRIVACY_DRAFT: Drafted[] = [
  {
    key: 'help.privacy', row: 'Help: privacy',
    before: null, after: { text: 'Privacy' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
];

export const privacy: Draft = {
  base: '36c121e',
  rows: PRIVACY_DRAFT,
  exampleOnly: {},
};
