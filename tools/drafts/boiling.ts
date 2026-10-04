/**
 * The `boiling` draft: "boil" is never a noun (5 October 2026), on
 * `343fcff`, both apps. The owner: "the boil", "a full boil" and "signal
 * the boil" sound medical. "Boiling" is fine, and so is "boil" the verb
 * ("water boils at", "how long your water takes to boil"). Two exceptions,
 * the owner's: the button keeps its name, "Full rolling boil" (CLAUDE.md
 * invariant 6), and text that names the button keeps the name exactly;
 * and "brought to the boil" and "to the boil" stay, since they sound like
 * cooking (`setup.start.cold`, `setup.start.coldStanding` and the 1750
 * "to the boil" sublines are not rows here). The setting "After the boil" is
 * "Once it’s boiling". Each row keeps its meaning: the cook presses Full
 * rolling boil when the water is boiling hard all over, not at the first
 * bubbles, and a hot start goes into water boiling hard.
 *
 * `copy/en-US.json` rewrites its one twin, `controls.start.more`, with its
 * base; `controls.water.more`'s US twin said "after boiling" and stands.
 *
 * The 1750 twins, rewritten ("It boils in earnest", the button's name there,
 * is already a verb and stays):
 *   controls.afterTheBoil: Once it boils (was "After the boil")
 *   controls.afterTheBoil.more: Keep it boiling: the water boils in earnest
 *     till the eggs come out, ... (was "stays at a full boil")
 *   controls.start.more: ... lower the eggs into water boiling in earnest;
 *     ... the waiting till it boils included, they are done sooner. (was "at
 *     a full boil", "the waiting for the boil included")
 *   action.hint.hotBoiling: the eggs into water boiling in earnest, and kept
 *     so the whole {time} (was "at a full boil")
 *   action.hint.heating.info: When it boils in earnest (was "Of the rolling
 *     boil")
 *   readout.sub.coldAssumes.more: How long, upon the average, water stands
 *     on the fire before it boils in earnest, amended by your past timings.
 *     ... (was "How long water is in coming to a full boil, upon the
 *     average, ...")
 *   help.reliable.hot: ... Keep the water boiling in earnest the whole time.
 *     (was "at a full boil")
 * And three twins whose modern English needed no change, so they are no
 * rows here:
 *   activity.note.estimate: my conjecture, till you tell me it boils (was
 *     "my conjecture, till you signal the boil", which the owner rejected;
 *     40 of the Lock Screen's 41 characters)
 *   help.learn.p1: ... from your signal when the water boils, how long it
 *     is in boiling. ... (was "from your signal at the boil, how long your
 *     water is in boiling")
 *   controls.water.more: ... if you put out the fire once it boils, ...
 *     (was "after the boil")
 * The 1750 twins of readout.sub.coldAssumes.info ("Of this time to boil"),
 * outcome.learning, learned.literature and learned.confirm.message already
 * said it with a verb, and stand.
 *
 * Outside the catalogue, privacy/index.html: Start learning again "deletes
 * your results and how long your water took to boil", not "the boil times".
 */

import type { Draft, Drafted } from '../copyDraft.js';

const BOILING_DRAFT: Drafted[] = [
  {
    key: 'controls.afterTheBoil', row: 'Settings: what to do once it’s boiling',
    before: { text: 'After the boil' },
    after: { text: 'Once it’s boiling' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.afterTheBoil.more', row: 'Settings: the (i) by Once it’s boiling',
    before: { text: 'Keep boiling: keep the water at a full boil until the eggs come out. The amount of water hardly matters. Heat off, lid on: once the eggs are in, turn the heat off and the hot water continues to cook the eggs. This saves energy, but the time depends on how much water there is, so measure it. With too little water the eggs won’t cook through.' },
    after: { text: 'Keep boiling: keep the water boiling hard until the eggs come out. The amount of water hardly matters. Heat off, lid on: once the eggs are in, turn the heat off and the hot water continues to cook the eggs. This saves energy, but the time depends on how much water there is, so measure it. With too little water the eggs won’t cook through.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.start.more', row: 'Start: the (i)',
    before: { text: 'Boiling water: lower the eggs into water at a full boil. They peel more easily this way. Cold water: put the eggs in a cold pan, turn the heat on, and press Full rolling boil when the water rolls. This is quicker overall. Sous-vide: I’ll tell you how long the eggs need in the water.' },
    after: { text: 'Boiling water: lower the eggs into water that’s boiling hard. They peel more easily this way. Cold water: put the eggs in a cold pan, turn the heat on, and press Full rolling boil when the water rolls. This is quicker overall. Sous-vide: I’ll tell you how long the eggs need in the water.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
    overlays: { 'en-US': {
      before: { text: 'Boiling water: lower the eggs into water at a full boil. They peel more easily this way. Cold water: put the eggs in a cold pot, turn the heat on, and press Full rolling boil when the water rolls. This is quicker overall. Sous-vide: I’ll tell you how long the eggs need in the water.' },
      after: { text: 'Boiling water: lower the eggs into water that’s boiling hard. They peel more easily this way. Cold water: put the eggs in a cold pot, turn the heat on, and press Full rolling boil when the water rolls. This is quicker overall. Sous-vide: I’ll tell you how long the eggs need in the water.' },
    } },
  },
  {
    key: 'action.hint.hotBoiling', row: 'Idle, boiling start: under Eggs in',
    before: { text: 'eggs into water at a full boil, and keep it boiling for all {time}' },
    after: { text: 'eggs into boiling water, and keep it boiling hard for all {time}' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'action.hint.heating.info', row: 'Heating: the (i)’s name, read aloud',
    before: { text: 'About the rolling boil' },
    after: { text: 'When to press Full rolling boil' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'readout.sub.coldAssumes.info', row: 'Idle, cold start: the (i)’s name, read aloud',
    before: { text: 'About this boil time' },
    after: { text: 'About the time to boil' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'readout.sub.coldAssumes.more', row: 'Idle, cold start: the (i) by the subline',
    before: { text: 'How long water takes to get to a full rolling boil on average, refined by your past timings. Press Full rolling boil today and I’ll correct the time while the eggs cook.' },
    after: { text: 'How long water takes on average until it’s boiling hard all over, refined by your past timings. Press Full rolling boil today and I’ll correct the time while the eggs cook.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'help.reliable.hot', row: 'Help: getting it right',
    before: { text: 'This is the easiest way to get right. Keep the water at a full rolling boil the whole time.' },
    after: { text: 'This is the easiest way to get right. Keep the water boiling hard the whole time.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'outcome.learning', row: 'After an egg: the (i) by the direction',
    before: { text: 'To help me learn faster, answer both questions after each egg, and on a cold-water start, tell me when the water is at a full rolling boil. If you have a probe thermometer, a single reading helps most.' },
    after: { text: 'To help me learn faster, answer both questions after each egg, and on a cold-water start, tell me when the water is boiling hard all over. If you have a probe thermometer, a single reading helps most.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'learned.literature', row: 'Settings: what I’ve learned, before anything',
    before: { text: 'I haven’t learned anything yet. Tell me how each egg came out, and on a cold-water start, when the water reaches a full rolling boil.' },
    after: { text: 'I haven’t learned anything yet. Tell me how each egg came out, and on a cold-water start, when the water is boiling hard all over.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'learned.confirm.message', row: 'Settings: Start learning again?',
    before: { text: 'I’ll forget all your results and boil times, and go back to the times for a typical egg.' },
    after: { text: 'I’ll forget all your results and how long your water took to boil, and go back to the times for a typical egg.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
];

export const boiling: Draft = {
  base: '343fcff',
  rows: BOILING_DRAFT,
  exampleOnly: {
    'controls.settings': 'its note names the setting as "what to do once it’s boiling", not "heat after the boil"',
  },
};
