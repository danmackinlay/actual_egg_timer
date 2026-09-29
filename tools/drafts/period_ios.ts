/**
 * The `period_ios` draft: F6 on iOS - the web's picker, its (i), the line
 * under Imperial and the title gain iOS; and the Lock Screen's odds line is
 * retired, on the owner's word - on `394f74d`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** F6 on iOS (LANGUAGE.md section 6, "As built (iOS)"): the language picker,
 *  its (i), the line under Imperial and the 1750 title, sharing the web's
 *  keys with no change of wording; and the Lock Screen's odds line retired
 *  on the owner's word of 28 September - mid-cook nothing there can change
 *  what the cook does. The 1750 entries for iOS's own keys are in
 *  copy/en-x-1750.json, which no draft covers: the web's were not drafted
 *  either, and the owner reviews that catalogue whole. */
const PERIOD_IOS_DRAFT: Drafted[] = [
  ...[
    ['controls.language', 'Language'],
    ['controls.language.more', 'English (1750) is English as Samuel Johnson wrote it in the preface to his Dictionary. I switch to it when you change from Metric to Imperial, and back when you change back. Pick English to leave it and keep your units.'],
    ['language.en', 'English'],
    ['language.en1750', 'English (1750)'],
    ['controls.units.period', 'Imperial units are also available in the English of their period.'],
    ['app.titlePage', 'The Actual Egg-Timer: in which the times of boiling are deduced from their causes, and illustrated in their different degrees of hardness.'],
  ].map(([key, text]): Drafted => ({
    key, row: 'F6 on iOS: the picker and the title, shared with the web',
    before: { text }, after: { text }, appsBefore: ['web'], appsAfter: ['web', 'ios'],
  })),
  // The colophon in plain words, on the owner's request of 28 September:
  // no conduction, kinetics or denaturation. Both apps read it as one
  // sentence: "Actual Egg Timer. I work out each time ... not from a
  // recipe. The code and the science — mistakes included."
  {
    key: 'colophon.lede', row: 'the colophon, plainly',
    before: { text: 'Times computed from heat conduction and denaturation kinetics, not from a recipe.' },
    after: { text: 'I work out each time from how heat gets into an egg, not from a recipe.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'colophon.link', row: 'the colophon, plainly',
    before: { text: 'Source, and the physics it rests on' },
    after: { text: 'The code and the science' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'colophon.tail', row: 'the colophon, plainly',
    before: { text: '— including what I get wrong.' },
    after: { text: '— mistakes included.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'odds.hitTheMark', row: 'Lock Screen: no odds mid-cook',
    before: { text: '{hits}/{of} eggs hit the mark' },
    after: null,
    appsBefore: ['ios'], appsAfter: [],
  },
];

export const period_ios: Draft = {
  base: '394f74d',
  rows: PERIOD_IOS_DRAFT,
  exampleOnly: {},
};
