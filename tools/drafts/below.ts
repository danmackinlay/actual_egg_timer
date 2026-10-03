/**
 * The `below` draft: the bracket is "below the slider" in the direction’s (i),
 * as Help has it, so the house term holds everywhere a position is named
 * (`DECISIONS.md` 57; the owner, 3 October 2026), on `b0cb288`, both apps.
 *
 * The 1750 twin moves with it:
 *   outcome.bracket: The bracket under the slider shews where your yolk will probably fall. To be secure against a soft yolk, slide to the right, till the left end of the bracket rests where you would be content; against a firm one, slide to the left, till its right end does.
 *     -> The bracket below the slider shews where your yolk will probably fall. To be secure against a soft yolk, slide to the right, till the left end of the bracket rests where you would be content; against a firm one, slide to the left, till its right end does.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const BELOW_DRAFT: Drafted[] = [
  {
    key: "outcome.bracket", row: "below the slider",
    before: { text: "The bracket under the slider shows the range your yolk will probably fall in. If you’d rather not risk a soft yolk, slide right until the left end of the bracket is somewhere you’d be happy with. If you’d rather not risk a firm one, slide left until the right end is." },
    after: { text: "The bracket below the slider shows the range your yolk will probably fall in. If you’d rather not risk a soft yolk, slide right until the left end of the bracket is somewhere you’d be happy with. If you’d rather not risk a firm one, slide left until the right end is." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
];

export const below: Draft = {
  base: 'b0cb288',
  rows: BELOW_DRAFT,
  exampleOnly: {},
};
