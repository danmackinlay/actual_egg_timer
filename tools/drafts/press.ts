/**
 * The `press` draft: no "tap" for the screen gesture in any string (5 October
 * 2026), on `9c9ea24`, both apps. The owner: "eggs in the pan, lid on, then
 * tap" "ambiguously sounds like we tap the eggs with a spoon or something,
 * and is in any case not global English". Where a verb for a button is
 * needed it is "press", which reads the same on a phone and at a desk; the
 * Lock Screen note has no room for one and names the button alone. Every
 * row keeps its meaning: the cook presses Full rolling boil at a full
 * rolling boil, not at the first bubbles (CLAUDE.md invariant 6). "Tap"
 * for the running water was already gone (DECISIONS.md 57); the keys named
 * `*.tap` are the cooling's and say "running water".
 *
 * `copy/en-US.json` rewrites its two twins the same way, with their base;
 * each row's `overlays` carries them, so the snapshot proof reads the US
 * screens too (it is the first draft to need that).
 *
 * The 1750 twins, rewritten:
 *   action.hint.cold: the eggs in the pan, the lid on; then set it on the
 *     fire (the button is "Set it on the fire", so the hint says it)
 *   action.hint.heating.more: Press It boils in earnest when ... I time the
 *     rest of the cooking from that moment; be sure of it.
 *   readout.sub.coldAssumes.more: ... Press It boils in earnest to-day ...
 *   controls.start.more: ... and press It boils in earnest when the water
 *     rolls ...
 *   help.learn.p1: ... from your signal at the boil, how long your water is
 *     in boiling ...
 *   help.reliable.cold: Press It boils in earnest when the whole surface
 *     rolls, not at the first bubbles. By it I correct my time while the
 *     eggs are cooking.
 *   activity.note.estimate: my conjecture, till you signal the boil
 *   share.more: says "Expunge the results takes every one", no tap; stands.
 * And one twin whose modern English never said tap, so it is no row here:
 *   controls.eggsInPan.more: ... for your signal when the water boils
 *     already reckons them. (was "your tap")
 */

import type { Draft, Drafted } from '../copyDraft.js';

const PRESS_DRAFT: Drafted[] = [
  {
    key: "readout.sub.coldAssumes.more", row: "Idle, cold start: the (i) by the subline",
    before: { text: "How long water takes to get to a full rolling boil on average, refined by your past timings. Tap Full rolling boil today and I’ll correct the time while the eggs cook." },
    after: { text: "How long water takes to get to a full rolling boil on average, refined by your past timings. Press Full rolling boil today and I’ll correct the time while the eggs cook." },
    appsBefore: ["web", "ios"], appsAfter: ["web", "ios"],
  },
  {
    key: "action.hint.cold", row: "Idle, cold start: under Start heating",
    before: { text: "eggs in the pan, lid on, then tap" },
    after: { text: "eggs in the pan, lid on, then press Start heating" },
    appsBefore: ["web", "ios"], appsAfter: ["web", "ios"],
    overlays: { 'en-US': {
      before: { text: "eggs in the pot, lid on, then tap" },
      after: { text: "eggs in the pot, lid on, then press Start heating" },
    } },
  },
  {
    key: "action.hint.heating.more", row: "Heating: the (i) by the hint",
    before: { text: "Tap Full rolling boil when the whole surface starts bubbling hard and stirring doesn’t calm it. I time the rest of the cooking from your input here, so get this right!" },
    after: { text: "Press Full rolling boil when the whole surface starts bubbling hard and stirring doesn’t calm it. I time the rest of the cooking from your input here, so get this right!" },
    appsBefore: ["web", "ios"], appsAfter: ["web", "ios"],
  },
  {
    key: "controls.start.more", row: "Start: the (i)",
    before: { text: "Boiling water: lower the eggs into water at a full boil. They peel more easily this way. Cold water: put the eggs in a cold pan, turn the heat on, and tap Full rolling boil when the water rolls. This is quicker overall. Sous-vide: I’ll tell you how long the eggs need in the water." },
    after: { text: "Boiling water: lower the eggs into water at a full boil. They peel more easily this way. Cold water: put the eggs in a cold pan, turn the heat on, and press Full rolling boil when the water rolls. This is quicker overall. Sous-vide: I’ll tell you how long the eggs need in the water." },
    appsBefore: ["web", "ios"], appsAfter: ["web", "ios"],
    overlays: { 'en-US': {
      before: { text: "Boiling water: lower the eggs into water at a full boil. They peel more easily this way. Cold water: put the eggs in a cold pot, turn the heat on, and tap Full rolling boil when the water rolls. This is quicker overall. Sous-vide: I’ll tell you how long the eggs need in the water." },
      after: { text: "Boiling water: lower the eggs into water at a full boil. They peel more easily this way. Cold water: put the eggs in a cold pot, turn the heat on, and press Full rolling boil when the water rolls. This is quicker overall. Sous-vide: I’ll tell you how long the eggs need in the water." },
    } },
  },
  {
    key: "help.learn.p1", row: "Help: how I learn",
    before: { text: "Your answers tell me how you like your yolk and how your eggs cook. When you tap Full rolling boil, I learn how long your water takes to boil. A probe reading, if you take one, tells me how fast heat gets into your eggs. You don’t have to answer anything." },
    after: { text: "Your answers tell me how you like your yolk and how your eggs cook. When you press Full rolling boil, I learn how long your water takes to boil. A probe reading, if you take one, tells me how fast heat gets into your eggs. You don’t have to answer anything." },
    appsBefore: ["web", "ios"], appsAfter: ["web", "ios"],
  },
  {
    key: "help.reliable.cold", row: "Help: getting it right",
    before: { text: "Wait until the whole surface is rolling before you tap Full rolling boil. The first bubbles are too soon. I correct the time from your tap while the eggs cook." },
    after: { text: "Wait until the whole surface is rolling before you press Full rolling boil. The first bubbles are too soon. Pressing it lets me correct the time while the eggs cook." },
    appsBefore: ["web", "ios"], appsAfter: ["web", "ios"],
  },
  {
    key: "share.more", row: "Settings: sharing (i)",
    before: { text: "Results from one kitchen tell me only about that kitchen. Results from many show me how eggs, pots, water and cooling really differ, and the next version of the app starts everyone from what they show. I send each egg’s size, how it was cooked, the water’s boiling point (which says roughly how high up you are), your answers, and what I expected. Moving a time a few seconds teaches me what the usual times can’t, and stays within just right. Turn this off whenever you like, and tap Delete shared results to remove every one from the server." },
    after: { text: "Results from one kitchen tell me only about that kitchen. Results from many show me how eggs, pots, water and cooling really differ, and the next version of the app starts everyone from what they show. I send each egg’s size, how it was cooked, the water’s boiling point (which says roughly how high up you are), your answers, and what I expected. Moving a time a few seconds teaches me what the usual times can’t, and stays within just right. Turn this off whenever you like, and press Delete shared results to remove every one from the server." },
    appsBefore: ["web", "ios"], appsAfter: ["web", "ios"],
  },
  {
    key: "activity.note.estimate", row: "Lock Screen and Dynamic Island: the note",
    before: { text: "my guess until you tap Full rolling boil" },
    after: { text: "my guess until Full rolling boil" },
    appsBefore: ["ios"], appsAfter: ["ios"],
  },
];

export const press: Draft = {
  base: '9c9ea24',
  rows: PRESS_DRAFT,
  exampleOnly: {},
};
