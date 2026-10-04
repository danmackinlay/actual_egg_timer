/**
 * The `stay` draft: switching the units back to metric no longer takes the
 * cook out of the English of 1750 (`DECISIONS.md` 77, 5 October 2026), on
 * `11943b9`, both apps. One key changes, the (i) beside Language, which said
 * the app switched back; the sentence that said so goes, and nothing else
 * does. The picker is now the only way out of 1750, and the (i)'s last
 * sentence already says to pick English.
 *
 * No `copy/en-US.json` entry: American English says this the same way.
 *
 * The 1750 twin loses its matching clause, "and back when you choose
 * Metrick", and keeps its footnote, Fahrenheit's scale and all:
 *   controls.language.more: English (1750) is English as Samuel Johnson
 *     wrote it. I change to it when you choose Imperial. Should the reader
 *     find this stile tiresome, choose English: the modern tongue is
 *     restored, and Fahrenheit’s scale kept.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const STAY_DRAFT: Drafted[] = [
  {
    key: 'controls.language.more', row: 'Settings: Language (i)',
    before: { text: 'English (1750) is English as Samuel Johnson wrote it. I switch to it when you pick Imperial, and back when you pick Metric. Pick English to keep Imperial in today’s English.' },
    after: { text: 'English (1750) is English as Samuel Johnson wrote it. I switch to it when you pick Imperial. Pick English to keep Imperial in today’s English.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
];

export const stay: Draft = {
  base: '11943b9',
  rows: STAY_DRAFT,
  exampleOnly: {},
};
