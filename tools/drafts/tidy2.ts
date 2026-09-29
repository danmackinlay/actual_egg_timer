/**
 * The `tidy2` draft: FOLLOWUP.md section 5 with 4.2, applied as one draft on
 * `a04ccfc` (29 September), both apps, each key's 1750 twin rewritten with
 * it. The owner reads it on a phone and says what to put back; LANGUAGE.md
 * section 3 has the table.
 *
 * Where it departs from FOLLOWUP's proposals:
 * - `readout.restored`: "I can't sound the alarm", not "the alarm is off".
 *   The header's Sound on/off button makes "off" read as a setting the cook
 *   could turn back on, and "I" keeps the owner's active voice.
 * - `learned.confirm.forget` joins the two it answers: under "Start learning
 *   again?", "Forget it" reads as "never mind", the opposite of what it does.
 * - "Full rolling boil" stays as the button's name where the cook is told to
 *   tap it (`action.hint.heating.more`, `controls.start.more`,
 *   `help.reliable.cold`, the second sentence of
 *   `readout.sub.coldAssumes.more`, and the owner-approved
 *   `activity.note.estimate`). Where it names a tap already made it becomes
 *   "your taps" or "when the water boils". Where it asks for a future tap
 *   from a screen with no button (`outcome.learning`, `learned.literature`)
 *   it becomes "a full rolling boil" in lower case: "when the water boils"
 *   there would invite the tap at the first bubbles that CLAUDE.md's
 *   invariant 6 exists to prevent. `learned.forget.more` never said it.
 * - The three `spoken.*` are heard only after their phase label
 *   (`spoken.announcement`, app.ts), so none loses its subject. Idle,
 *   `spoken.total` has the same fault ("Total time. Total 6 minutes"); it is
 *   left for now, because `copySnapshot compare --draft` reads the label
 *   "Total time" as an instance of "Total {time}" and fails the proof.
 *
 * The 1750 twins (copy/en-x-1750.json), before -> after:
 *   learned.forget: Forget what is learned
 *     -> Begin to learn anew
 *   learned.confirm.title: Shall it all be forgot?
 *     -> Shall I learn anew?
 *   learned.confirm.forget: Let it be forgot
 *     -> Begin anew
 *   outcome.likely.firm: Probably as you desire, or else a little firm.
 *     -> Probably as you desire; if not, a little firm.
 *   outcome.likely.soft: Probably as you desire, or else a little soft.
 *     -> Probably as you desire; if not, a little soft.
 *   readout.restored: I have taken up this one again after the page was reloaded. The times are true, but I cannot ring for it: watch the clock.
 *     -> I have taken up this one again after the page was reloaded. The times are true, but I cannot sound the alarm, so watch the clock.
 *   controls.eggFrom.more: Eggs from the fridge are the most certain: a fridge is much the same from day to day, a room is not, and every degree moves the time a little.
 *     -> Eggs from the fridge are the most certain. A fridge is much the same from day to day and a room is not, and every degree moves the time a little.
 *   readout.sub.coldAssumes.more: It is how long this quantity of water has hitherto been in boiling, from your taps upon It boils in earnest. For a quantity I have never timed, I reckon from the nearest I have. Tap It boils in earnest to-day, and I shall correct the time while the eggs are cooking.
 *     -> It is how long this quantity of water has hitherto been in boiling, timed by your taps. For a quantity I have never timed, I reckon from the nearest I have. Tap It boils in earnest to-day, and I shall correct the time while the eggs are cooking.
 *   controls.eggsInPan.more: Cold eggs cool boiling water as they enter, and more eggs cool it more; so it is longer in returning to the boil, or, with the fire out, never returns. For eggs begun in cold water I have no need of it: your tap upon It boils in earnest already reckons them.
 *     -> Cold eggs cool boiling water as they enter, and more eggs cool it more; so it is longer in returning to the boil, or, with the fire out, never returns. For eggs begun in cold water I have no need of it: your tap when the water boils already reckons them.
 *   help.learn.p1: From your answers I learn how you like your yolk, and how your eggs cook; from your taps upon It boils in earnest, how long your water is in boiling. A single reading of the probe teaches me how fast heat enters your eggs. No question is compulsory.
 *     -> From your answers I learn how you like your yolk, and how your eggs cook; from your taps at the boil, how long your water is in boiling. A single reading of the probe teaches me how fast heat enters your eggs. No question is compulsory.
 *   outcome.learning: To hasten my learning, answer both questions after every egg, and tap It boils in earnest when the water rolls. If you have a probe thermometer, a single reading instructs me most.
 *     -> To hasten my learning, answer both questions after every egg, and, having begun from cold water, tell me when the water boils in earnest. If you have a probe thermometer, a single reading instructs me most.
 *   learned.literature: I have hitherto learned nothing. Tap It boils in earnest, having begun from cold water, and tell me how each egg came out.
 *     -> I have hitherto learned nothing. Tell me how each egg came out, and, having begun from cold water, when the water boils in earnest.
 *   spoken.heating: Upon the fire. {time} remaining in all
 *     -> {time} remaining in all
 *   spoken.cooking: Cooking. {time} remaining
 *     -> {time} remaining
 *   spoken.cooling: Cooling. {time} remaining
 *     -> {time} remaining
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const TIDY2_DRAFT: Drafted[] = [
  {
    key: "learned.forget", row: "forget: start again",
    before: { text: "Forget what's learned" },
    after: { text: "Start learning again" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.confirm.title", row: "forget: start again",
    before: { text: "Forget what's learned?" },
    after: { text: "Start learning again?" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.confirm.forget", row: "forget: start again",
    before: { text: "Forget it" },
    after: { text: "Start again" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.likely.firm", row: "or else",
    before: { text: "Probably just right, or else a little firm." },
    after: { text: "Probably just right; if not, a little firm." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.likely.soft", row: "or else",
    before: { text: "Probably just right, or else a little soft." },
    after: { text: "Probably just right; if not, a little soft." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.restored", row: "restored",
    before: { text: "I picked this one back up after a reload. The times are right, but I can't ring for it: watch the clock." },
    after: { text: "I picked this one back up after a reload. The times are right, but I can't sound the alarm, so watch the clock." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "controls.eggFrom.more", row: "colon, splice",
    before: { text: "Eggs from the fridge are the most predictable: a fridge is much the same every day, a room isn't, and every degree moves the time a little." },
    after: { text: "Fridge eggs are the most predictable. A fridge is much the same every day and a room isn't, and each degree moves the time a little." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.sub.coldAssumes.more", row: "Full rolling boil",
    before: { text: "It's how long this much water has taken to boil before, from your taps on Full rolling boil. For an amount I haven't timed, I scale from the nearest one I have. Tap Full rolling boil today and I'll correct the time while the eggs cook." },
    after: { text: "It's how long this much water has taken to boil before, timed from your taps. For an amount I haven't timed, I scale from the nearest one I have. Tap Full rolling boil today and I'll correct the time while the eggs cook." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.eggsInPan.more", row: "Full rolling boil",
    before: { text: "Cold eggs cool boiling water as they go in, and more eggs cool it more, so it takes longer to come back to the boil, or with the heat off never does. On a cold-water start I don't need it: your tap on Full rolling boil already counts them." },
    after: { text: "Cold eggs cool boiling water as they go in, and more eggs cool it more, so it takes longer to come back to the boil, or with the heat off never does. On a cold-water start I don't need it: your tap when the water boils already counts them." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.learn.p1", row: "Full rolling boil",
    before: { text: "From your answers I learn how you like your yolk and how your eggs cook. From your taps on Full rolling boil, I learn how long your water takes to boil. One probe reading teaches me how fast heat gets into your eggs. Every question is optional." },
    after: { text: "From your answers I learn how you like your yolk and how your eggs cook. From your taps at the boil, I learn how long your water takes to boil. One probe reading teaches me how fast heat gets into your eggs. Every question is optional." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.learning", row: "Full rolling boil",
    before: { text: "To help me learn faster, answer both questions after each egg, and tap Full rolling boil when the water rolls. If you have a probe thermometer, one reading teaches me most." },
    after: { text: "To help me learn faster, answer both questions after each egg, and on a cold-water start, tell me when the water is at a full rolling boil. If you have a probe thermometer, one reading teaches me most." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.literature", row: "Full rolling boil",
    before: { text: "I haven't learned anything yet. Tap Full rolling boil on a cold-water start, and tell me how each egg came out." },
    after: { text: "I haven't learned anything yet. Tell me how each egg came out, and on a cold-water start, when the water reaches a full rolling boil." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "spoken.heating", row: "spoken: no label twice",
    before: { text: "Heating. {time} left in total" },
    after: { text: "{time} left in total" },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "spoken.cooking", row: "spoken: no label twice",
    before: { text: "Cooking. {time} left" },
    after: { text: "{time} left" },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "spoken.cooling", row: "spoken: no label twice",
    before: { text: "Cooling. {time} left" },
    after: { text: "{time} left" },
    appsBefore: ["web"], appsAfter: ["web"],
  },
];

export const tidy2: Draft = {
  base: 'a04ccfc',
  rows: TIDY2_DRAFT,
  exampleOnly: {},
};
