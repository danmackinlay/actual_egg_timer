/**
 * The `history` draft: the remembered boil said as history, not as a time
 * this pan took; and (`TRUTHS_DRAFT`) no new words, iOS gaining the web's
 * runny-white line - both on `cc0dc47`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** 27 September, the owner: "no one pluralises boils except for
 *  dermatologists. 'based on history'". The remembered boil time is a blend
 *  of past boils, or another volume's scaled, so none of these may say it
 *  is a time this pan took. */
const HISTORY_DRAFT: Drafted[] = [
  {
    key: 'readout.sub.coldAssumes', row: 'held back from rest: coldAssumes',
    before: { text: "assumes {boil} to a rolling boil" }, after: { text: "about {boil} to boil, based on history" },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'learned.pan', row: 'misleading, from the unification proposal',
    before: { text: "your pan takes {time} to boil" }, after: { text: "your pan: about {time} to boil, based on history" },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'pan.measured', row: 'rest: pan.measured, "boils" removed',
    before: { text: "From your earlier boils with this much water. I update it each time you tap the boil on a cold-water start." },
    after: { text: "Based on history with this much water. I update it each time you tap the boil on a cold-water start." },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
];

/** Two lines that said something false, fixed on `cc0dc47` (LANGUAGE.md
 *  section 3, "one wording per meaning"). No wording changes. iOS gains the
 *  web's line for a white the pan never sets, where it used to say "white just
 *  set"; the decision now lives in core, which both apps ship. The web's
 *  "cooling starts on its own" hint is no longer shown on a counter rest, which
 *  is a change of state, not of words, and needs no row. */
const TRUTHS_DRAFT: Drafted[] = [
  {
    key: 'texture.white.runny', row: 'texture.white.runny, against iOS\'s texture note',
    before: { text: 'white stays runny' }, after: { text: 'white stays runny' },
    appsBefore: ['web'], appsAfter: ['web', 'ios'],
  },
];

// Two branches applied changes on cc0dc47 at once, so one draft carries
// both: a proof run since that commit must expect all four rows.
export const history: Draft = {
  base: 'cc0dc47',
  rows: [...HISTORY_DRAFT, ...TRUTHS_DRAFT],
  exampleOnly: {},
};
