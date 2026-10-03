/**
 * The `notes` draft: the owner’s notes from reading every string on the
 * review page (3 October 2026), on `b0ac5df`, both apps. The rest of the
 * page, the owner said, is fine.
 *
 * - `controls.start.more`: the sous-vide option no longer says it takes many
 *   hours. That is the point of sous-vide, and the readout says when to start.
 *   The American overlay’s entry moves with it, base and text.
 *
 * The 1750 twins, before -> after. `readout.phase.coolingTap` is not a
 * drafted key, since its modern wording stands: a pump runs only while
 * someone works it.
 *   controls.start.more: Boiling water: lower the eggs into water at a full boil; they peel more easily. Cold water: the eggs in a cold pan, the fire lit, and tap It boils in earnest when the water rolls; the waiting for the boil included, they are done sooner. Sous-vide: I shall tell you how long the eggs require in the water. It is commonly many hours, so provide accordingly.
 *     -> Boiling water: lower the eggs into water at a full boil; they peel more easily. Cold water: the eggs in a cold pan, the fire lit, and tap It boils in earnest when the water rolls; the waiting for the boil included, they are done sooner. Sous-vide: I shall tell you how long the eggs require in the water.
 *   readout.phase.coolingTap: Cooling; keep the pump going
 *     -> Cooling; keep working the pump
 */

import type { Draft, Drafted } from '../copyDraft.js';

const NOTES_DRAFT: Drafted[] = [
  {
    key: "controls.start.more", row: "sous-vide",
    before: { text: "Boiling water: lower the eggs into water at a full boil. They peel more easily this way. Cold water: put the eggs in a cold pan, turn the heat on, and tap Full rolling boil when the water rolls. This is quicker overall. Sous-vide: I’ll tell you how long the eggs need in the water. It’s usually many hours, so plan ahead." },
    after: { text: "Boiling water: lower the eggs into water at a full boil. They peel more easily this way. Cold water: put the eggs in a cold pan, turn the heat on, and tap Full rolling boil when the water rolls. This is quicker overall. Sous-vide: I’ll tell you how long the eggs need in the water." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
];

export const notes: Draft = {
  base: 'b0ac5df',
  rows: NOTES_DRAFT,
  exampleOnly: {},
};
