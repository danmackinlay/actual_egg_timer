/**
 * The `tidy` draft: WORKLIST section 9, the interface copy, applied as one
 * draft on `bfc070d` (the owner's D8, 28 September), both apps, each changed
 * key's 1750 twin rewritten with it. The owner reviews it in place on a phone
 * and says what to put back. The rows are tagged by the part of section 9
 * they answer: 9.1 the text was false against the code (committed first, so
 * they survive whatever is put back), 9.2 the same thing said twice on one
 * screen, 9.3 the (i) paragraphs and Help cut to what the cook needs, 9.4 the
 * app speaking as "I", 9.5 one wording per meaning. LANGUAGE.md section 3 has
 * the table.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const TIDY_DRAFT: Drafted[] = [
  {
    key: "sousvide.warn", row: "9.1 factual",
    before: { text: "At {bath} the white won't set, however long you leave it. I'm built for boiling water, and I'm not reliable below {floor}. Use the pan." },
    after: { text: "At {bath} the white takes most of a day to set, if it sets at all. I'm built for boiling water, and I'm not reliable below {floor}. Use the pan." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.unsure.sousVide", row: "9.1 factual",
    before: { text: "Sous-vide. Below {floor} the white stays liquid and moves inside the shell, which I leave out, so I'm not reliable there. The very long times are real, though: that cool, the white takes most of a day to set." },
    after: { text: "Sous-vide. Below {floor} the white stays liquid and moves inside the shell, which I leave out, so I'm not reliable there. I estimate the white takes hours, even days, to set that cool, if it sets at all." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "sousvide.note.whiteBound", row: "9.1 factual",
    before: { text: "white still not set, yolk creamy" },
    after: { text: "white only just set, yolk firmer than you asked" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "sousvide.note.yolkBound", row: "9.1 factual",
    before: { text: "yolk set, white still not" },
    after: { text: "yolk as you asked, white set" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.learn.p1", row: "9.1 factual",
    before: { text: "Your answers teach me three things: how you like your yolk, how your eggs' whites behave, and how fast your stove boils water. A probe reading teaches me how fast heat gets into your eggs, all at once. Every question is optional." },
    after: { text: "From your answers I learn how you like your yolk and how your eggs cook. From your taps on Full rolling boil, I learn how long your water takes to boil. One probe reading teaches me how fast heat gets into your eggs. Every question is optional." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.restored", row: "9.1 factual",
    before: { text: "Picked this cook back up after a reload. The deadlines are right, but the alarm went with the old page — keep this tab open, or Cancel and start again." },
    after: { text: "I picked this cook back up after a reload. The times are right, but I can't ring for it: watch the clock." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "help.odds.p1", row: "9.1 factual",
    before: { text: "Under the time, I say which way an egg is likely to miss. The bracket under the slider shows where the yolk will probably land. All of it narrows as I learn." },
    after: { text: "Under the time, I say which way an egg is likely to miss. The bracket under the slider shows where the yolk will probably land, and it narrows as I learn." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "feedback.invite", row: "9.1 factual",
    before: { text: "Your answers teach me your eggs and your kitchen." },
    after: { text: "Your answers teach me your taste and your eggs." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
];

export const tidy: Draft = {
  base: 'bfc070d',
  rows: TIDY_DRAFT,
  exampleOnly: {},
};
