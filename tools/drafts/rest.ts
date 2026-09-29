/**
 * The `rest` draft: everything else, and the first-person pass on strings
 * already live, both approved by the owner on 27 September and implemented on
 * `e1f7068`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** The rest of F2, and the first-person pass, on `e1f7068`: F4 merged.
 *
 * Five rows of the two tables are not here, because implementing them as
 * written would break a rule the tables did not know about; LANGUAGE.md
 * section 3 says which and why, and they stay at their live wording:
 *
 *  - alarm.cooled.body, feedback.thanks, learned.forget and
 *    learned.confirm.title run over their surfaces' budgets
 *    (copy/surfaces.json), which are not raised without the owner;
 *  - readout.sub.coldAssumes, "your pan took {boil} to boil last time", would
 *    be false: {boil} is every boil at this volume blended, or the nearest
 *    remembered volume's scaled, not the last boil.
 */
const REST_DRAFT: Drafted[] = [
  {
    key: 'refusal.counter', row: 'refusal.counter',
    before: { text: 'Resting on the counter keeps cooking the yolk — {wanted} isn\'t reachable. Softest here is {limit}. Use an ice bath.' },
    after: { text: 'Resting on the counter keeps cooking the yolk. Softest possible: {limit}. An ice bath would leave the egg softer.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'refusal.tap', row: 'refusal.tap',
    before: { text: 'A cold tap doesn\'t pull the heat out fast enough — {wanted} isn\'t reachable. Softest here is {limit}. Ice water gets you further.' },
    after: { text: 'A cold tap doesn\'t cool the egg fast enough to stop the yolk. Softest possible: {limit}. An ice bath would leave the egg a little softer.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'refusal.ice', row: 'refusal.ice',
    before: { text: 'Any shorter and the white is still raw — {wanted} isn\'t reachable for this egg. Softest here is {limit}.' },
    after: { text: 'Any shorter and the white is still raw. Softest possible for this egg: {limit}.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'refusal.harderThanPan', row: 'refusal.harderThanPan',
    before: { text: 'With the heat off, the water runs out before the yolk gets there — {wanted} isn\'t reachable with this much water ({water}). Hardest here is {limit}. More water, or keep it boiling.' },
    after: { text: 'With the heat off, this much water ({water}) cools before the yolk gets there. Firmest possible: {limit}. Add more water, or keep it boiling.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'refusal.whiteNeverSets', row: 'refusal.whiteNeverSets',
    before: { text: 'With the heat off this pan never sets the white: the water falls below what the white needs while the egg is still in it. Nothing on the slider is reachable. More water, or keep it boiling.' },
    after: { text: 'With the heat off, the water cools before the white sets, so no setting works. Add more water, or keep it boiling.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'activity.note.cooling', row: 'activity.note.cooling',
    before: { text: 'carryover still running' },
    after: { text: 'yolk still cooking' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'colophon.ios', row: 'colophon.ios',
    before: { text: 'Times computed from heat conduction and denaturation kinetics, not from a recipe. The cooling step is part of the recipe: carryover is what ruins a soft egg.' },
    after: { text: 'I work out times from the physics and chemistry of eggs. Both heating and cooling matter for cooking the middle.' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'readout.sub.idleCold', row: 'readout.sub.idleCold',
    before: { text: 'from eggs into COLD water, heat on, to eggs out' },
    after: { text: 'from eggs into cold water, heat on, to eggs out' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'readout.sub.idleHot', row: 'readout.sub.idleHot',
    before: { text: 'from eggs into BOILING water to eggs out' },
    after: { text: 'from eggs into boiling water to eggs out' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'readout.sub.coldGuesses', row: 'readout.sub.coldGuesses',
    before: { text: 'guesses {boil} to a rolling boil' },
    after: { text: 'I\'m guessing {boil} to boil — tap when it does' },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'readout.sub.heating', row: 'readout.sub.heating',
    before: { text: '{elapsed} heating · provisional, assumes {boil} to boil' },
    after: { text: '{elapsed} heating · I expect {boil} until you tap' },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'readout.sub.heatingEstimate', row: 'estimate line',
    before: { text: 'estimate — the clock corrects itself when you tap the boil' },
    after: { text: 'my guess until you tap Full rolling boil' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'activity.note.estimate', row: 'estimate line',
    before: { text: 'estimate until the boil is tapped' },
    after: { text: 'my guess until you tap Full rolling boil' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'controls.start.coldPan', row: 'Cold water, merged',
    before: { text: 'Cold pan' },
    after: null,
    appsBefore: ['web'], appsAfter: [],
  },
  {
    key: 'controls.start.cold', row: 'Cold water, merged',
    before: { text: 'Cold start' },
    after: { text: 'Cold water' },
    appsBefore: ['ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'cook.method.cold', row: 'Cold water, merged',
    before: { text: 'Cold start' },
    after: { text: 'Cold water' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'cook.method.hot', row: 'cook.method.hot',
    before: { text: 'Into boiling water' },
    after: { text: 'Boiling water' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'controls.start.hint', row: 'controls.start.hint',
    before: { text: 'Hot start peels far better; cold start needs no timing of the drop-in.' },
    after: { text: 'Eggs into boiling water peel better. Eggs into cold water are done sooner, counting the wait for the water to boil.' },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'controls.afterBoil.keepItBoiling', row: 'Keep boiling, merged',
    before: { text: 'Keep it boiling' },
    after: null,
    appsBefore: ['web'], appsAfter: [],
  },
  {
    key: 'controls.afterBoil.keepBoiling', row: 'Keep boiling, merged',
    before: { text: 'Keep boiling' },
    after: { text: 'Keep boiling' },
    appsBefore: ['ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'readout.stat.afterBoiling', row: 'after the boil, merged',
    before: { text: 'after boiling' },
    after: null,
    appsBefore: ['web'], appsAfter: [],
  },
  {
    key: 'readout.stat.afterBoil', row: 'after the boil, merged',
    before: { text: 'after boil' },
    after: { text: 'after the boil' },
    appsBefore: ['ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.afterBoil.hint', row: 'controls.afterBoil.hint',
    before: { text: 'Standing in cooling water is a real method, but it lives or dies on the pan: the water has to carry the whole cook. More water holds more heat.' },
    after: { text: 'Heat off, lid on: the hot water continues to cook the eggs. More water holds more heat.' },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'action.hint.cookingStanding', row: 'action.hint.cookingStanding',
    before: { text: 'lid on, burner off — the timing assumes the water cools on its own from the boil ({boiling})' },
    after: { text: 'lid on, burner off' },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'action.hint.cookingBoiling', row: 'action.hint.cookingBoiling',
    before: { text: 'keep it boiling — the timing assumes a full boil ({boiling}) right up to the pull' },
    after: { text: 'keep it at a full boil ({boiling}) until the eggs come out' },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'pan.measured', row: 'pan.measured',
    before: { text: 'Measured on this pan at this volume. It is re-measured every cold start.' },
    after: { text: 'From your earlier boils with this much water. I update it each time you tap the boil on a cold-water start.' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'pan.unmeasured', row: 'pan.unmeasured',
    before: { text: 'Never measured. Run one cold start and tap the boil, and this becomes your pan rather than a guess.' },
    after: { text: 'Tap the boil on a cold-water start and I\'ll remember for next time.' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'learned.forgetExplain', row: 'learned.forgetExplain',
    before: { text: 'Clears both what it learned from your eggs and the time it measured for your pan. The posterior is honest about its own spread, so a few wrong answers wash out after a few more eggs anyway - this is for when you would rather not wait.' },
    after: { text: 'Clears what I\'ve learned from your answers and your boil times. A few wrong answers wash out after a few more eggs anyway; this is for when you\'d rather not wait.' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'sousvide.warn', row: 'sousvide.warn',
    before: { text: 'This bath ({bath}) is below the temperature at which egg white sets — only one of its proteins reacts down here — so the white stays loose however long you leave it. This app was built for boiling water and is out of its depth below {floor} anyway. Use the pan.' },
    after: { text: 'This bath ({bath}) is too cool to set the white, however long you leave it. I\'m built for boiling water, and I\'m not reliable below {floor}. Use the pan.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  // The first-person pass: strings already live, the table after the draft.
  {
    key: 'feedback.invite', row: 'first person',
    before: { text: 'Your answers adjust the times to your eggs and your pan.' },
    after: { text: 'Your answers teach me your eggs and your pan.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'learned.literature', row: 'first person',
    before: { text: 'Nothing learned yet. It learns your pan when you time a boil, and your eggs when you say how one came out.' },
    after: { text: 'I haven\'t learned anything yet. I learn your pan when you time a boil, and your eggs when you tell me how one came out.' },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'controls.probe.hint', row: 'first person',
    before: { text: 'When the cooling ends it asks for one reading from the middle of the egg. That tells it how fast your eggs heat, from a single egg.' },
    after: { text: 'When the cooling ends, I\'ll ask for one reading from the middle of the egg. From a single egg, that tells me how fast your eggs heat.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.afterBoil.explainHeatOff', row: 'first person',
    before: { text: 'Lid on and burner off: the water\'s own heat finishes the eggs. The time is worked out for the water below, so measure it — more or less water changes the time, or whether it works at all.' },
    after: { text: 'Lid on and burner off: the water\'s own heat finishes the eggs. I work out the time from the water below, so measure it — more or less water changes the time, or whether it works at all.' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'probe.offer', row: 'first person',
    before: { text: 'Got a probe thermometer? When the timer says, push it to the middle of the egg and tell us the highest number you see.' },
    after: { text: 'Got a probe thermometer? When I say, push it to the middle of the egg and tell me the highest number you see.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'probe.hint', row: 'first person',
    before: { text: 'Tell us the highest number you see.' },
    after: { text: 'Tell me the highest number you see.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'alarm.probe.body', row: 'first person',
    before: { text: 'Middle of the egg: tell us the highest number.' },
    after: { text: 'Middle of the egg: tell me the highest number.' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'colophon.tail', row: 'first person',
    before: { text: '— including what it gets wrong.' },
    after: { text: '— including what I get wrong.' },
    appsBefore: ['web'], appsAfter: ['web'],
  },
];

export const rest: Draft = {
  base: 'e1f7068',
  rows: REST_DRAFT,
  exampleOnly: { 'cook.method': 'its example quotes cook.method.cold, whose wording changed' },
};
