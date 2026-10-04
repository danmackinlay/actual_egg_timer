/**
 * The `export` draft: "Export my results" (5 October 2026), on `5a24742`,
 * both apps. The owner asked for a way to get every result off a device
 * (DECISIONS.md 81): under "What I’ve learned" in Settings, a button that
 * saves the whole log to a file - a download on the web, the share sheet on
 * iOS - and that says so when there is nothing to save. "Export my results"
 * is the owner's own wording; "Nothing to export yet." is the plainest way
 * to say an empty log, with no caveat to explain.
 *
 * No `copy/en-US.json` entry: American English says it the same way.
 *
 * The 1750 twins, new: "export" is a merchant's word for goods sent abroad,
 * not for a copy kept, so the English of 1750 copies out:
 *   learned.export: Copy out my results (19 of a button's 23)
 *   learned.export.none: There is nothing yet to copy out.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const EXPORT_DRAFT: Drafted[] = [
  {
    key: 'learned.export', row: 'Settings: what I’ve learned, export',
    before: null,
    after: { text: 'Export my results' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'learned.export.none', row: 'Settings: what I’ve learned, nothing to export',
    before: null,
    after: { text: 'Nothing to export yet.' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
];

export const exportDraft: Draft = {
  base: '5a24742',
  rows: EXPORT_DRAFT,
  exampleOnly: {},
};
