/**
 * The `period` draft: F6's new English on the web - the language picker, the
 * line under Imperial, and the 1750 title's modern twin - on `05d466b`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** F6's new English, web only: the language picker, the line under Imperial
 *  that finds the English of 1750, and the 1750 title's modern twin, which
 *  is never shown (LANGUAGE.md section 6). The 1750 itself is its own
 *  catalogue, copy/en-x-1750.json, and not a draft of this one. */
const PERIOD_DRAFT: Drafted[] = [
  {
    key: 'controls.language', row: 'F6: the picker',
    before: null, after: { text: 'Language' }, appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'controls.language.more', row: 'F6: the picker',
    before: null,
    after: { text: 'English (1750) is English as Samuel Johnson wrote it in the preface to his Dictionary. I switch to it when you change from Metric to Imperial, and back when you change back. Pick English to leave it and keep your units.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'language.en', row: 'F6: the picker',
    before: null, after: { text: 'English' }, appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'language.en1750', row: 'F6: the picker',
    before: null, after: { text: 'English (1750)' }, appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'controls.units.period', row: 'F6: under Imperial',
    before: null, after: { text: 'Imperial units are also available in the English of their period.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'app.titlePage', row: 'F6: the title',
    before: null,
    after: { text: 'The Actual Egg-Timer: in which the times of boiling are deduced from their causes, and illustrated in their different degrees of hardness.' },
    appsBefore: [], appsAfter: ['web'],
  },
];

export const period: Draft = {
  base: '05d466b',
  rows: PERIOD_DRAFT,
  exampleOnly: {},
};
