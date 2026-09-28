/**
 * The `units` draft: the units' (i) says only where the first choice came
 * from, on `055bd4e`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** 28 September, the owner: the units' (i) over-explained. You see the
 *  numbers (and, on an English page, the words) change as you switch, so it
 *  says only what you cannot see: where the first choice came from. */
const UNITS_DRAFT: Drafted[] = [
  {
    key: 'controls.units.more', row: "the units' (i): only where it starts",
    before: { text: "Metric or Imperial, for every number I show and every number you type. I start with what's usual where your browser says you are. Switching changes how I write the numbers, and may change my words too: the egg and the times stay exactly the same, and the eggs don't mind which." },
    after: { text: "I start with what's usual where your browser says you are." },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'controls.units.more.ios', row: "the units' (i): only where it starts",
    before: { text: "Metric or Imperial, for every number I show and every number you set. I start with what's usual where your phone says you are. Switching changes how I write the numbers, and may change my words too: the egg and the times stay exactly the same, and the eggs don't mind which." },
    after: { text: "I start with what's usual where your phone says you are." },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
];

export const units: Draft = {
  base: '055bd4e',
  rows: UNITS_DRAFT,
  exampleOnly: {},
};
