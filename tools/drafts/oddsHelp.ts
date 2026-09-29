/**
 * The `oddsHelp` draft: Help's "How sure I am" rewritten for what the idle
 * screen now shows - the direction, the bracket, and the play-safe suggestion
 * that never points at a runny white - on `91d5fff`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** Help's "How sure I am", brought up to what the idle screen shows since
 *  playing safe and the runny-white guard (INFERENCE.md section 8). */
const ODDS_HELP_DRAFT: Drafted[] = [
  {
    key: 'help.odds.p1', row: "Help: how sure I am",
    before: { text: "I tell you which way an egg is likely to miss, and the bracket under the slider shows how firm the yolk will probably be. Both narrow as I learn." },
    after: { text: "Under the time, I say which way an egg is likely to miss. The bracket under the slider shows where the yolk will probably land. When a miss is likely enough to matter, I suggest a level that plays safe, one tap away, and never one where the white might be runny. All of it narrows as I learn." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.odds.aside', row: "Help: how sure I am",
    before: { text: "The bracket covers eight eggs in ten. When I choose the time, a runny white counts three times as bad as a yolk a little too firm, so I lean slightly long. The slider's shading shows how often each doneness comes out right for you." },
    after: { text: "The bracket covers eight eggs in ten. When I choose the time, a runny white counts three times as bad as a yolk a little too firm, so I lean slightly long. I suggest playing safe when either way of missing is at least one egg in five: firmer means nine yolks in ten at least as firm as you asked, and softer the mirror of that, with the white's risk under one in five. The slider's shading shows how often each doneness comes out right for you." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
];

// iosA and oddsHelp were applied on the same commit by two branches at
// once, so a proof since 91d5fff names which it checks; the help.odds rows
// overlap.
export const oddsHelp: Draft = {
  base: '91d5fff',
  rows: ODDS_HELP_DRAFT,
  exampleOnly: {},
};
