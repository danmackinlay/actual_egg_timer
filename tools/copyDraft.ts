/**
 * F2's rewrites, as drafted in LANGUAGE.md section 3: every string each was
 * meant to change, what it was and what it became, and which app says it.
 *
 *  - `feedback`: the feedback screens, implemented with E2 on `cfe38e9`.
 *  - `rest`: everything else, and the first-person pass on strings already
 *    live, both approved by the owner on 27 September and implemented on
 *    `e1f7068`.
 *  - `reach`: the odds-shaded slider's new strings - two refusals, the (i)
 *    and what it opens, and the advice - on `1667dcf`.
 *  - `truths`: no new words; iOS gains the web's runny-white line, on `cc0dc47`.
 *
 * This is the list the proofs hold the catalogue to. `copyLiterals.ts --since`
 * diffs copy/en.json and the keys each app's source names against a base
 * commit, and refuses any difference not listed in that commit's draft;
 * `copySnapshot.ts compare --draft` renders the web app before and after and
 * refuses any string that changed and is not one of these. So the claim the
 * owner reads is exact: these strings changed, and nothing else did.
 *
 * `before` / `after` are the templates by plural category (`text` for a plain
 * message); null where the key did not exist before, or does not after. A key
 * that two apps said differently and now say alike is one key: the key that
 * goes is retired (`after: null`) and the key that stays gains the other app.
 */

export type Templates = Record<string, string>;

export interface Drafted {
  key: string;
  before: Templates | null;
  after: Templates | null;
  appsBefore: string[];
  appsAfter: string[];
  /** The row of LANGUAGE.md section 3 this is. */
  row: string;
}

export interface Draft {
  /** The commit on main the draft was applied to. */
  base: string;
  rows: Drafted[];
  /** Keys whose ENTRY changed only in an example, which renders nothing. */
  exampleOnly: Record<string, string>;
}

/** The first draft. The two "E5, preview" rows of the draft are not here:
 *  they belong to E5. */
export const FEEDBACK_DRAFT: Drafted[] = [
  {
    key: 'feedback.tooFirm', row: 'yolk answers',
    before: { text: 'Too firm' }, after: { text: 'Too firm' },
    appsBefore: ['web'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.tooHard', row: 'yolk answers',
    before: { text: 'Too hard' }, after: null, appsBefore: ['ios'], appsAfter: [],
  },
  {
    key: 'feedback.white.ask', row: 'white question',
    before: { text: 'And the white — was it runny?' }, after: { text: 'And the white?' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.white.runny', row: 'white answers',
    before: { text: 'Still runny' }, after: { text: 'Runny' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.white.set', row: 'white answers',
    before: { text: 'Set right through' }, after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'feedback.white.tender', row: 'white answers',
    before: null, after: { text: 'Tender' }, appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.white.firm', row: 'white answers',
    before: null, after: { text: 'Firm' }, appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.white.why', row: 'optional hint',
    before: { text: 'The white sets from the outside in, so this says something about your eggs that the yolk cannot.' },
    after: null, appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'feedback.optional', row: 'optional hint',
    before: null, after: { text: 'Answer either, both or neither.' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.thanks', row: 'after an answer',
    before: { text: 'Thanks — it has adjusted.' }, after: { text: 'Thanks. The next egg will use that.' },
    appsBefore: ['ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.invite', row: 'before any egg',
    before: { text: 'Telling it tunes the model to your eggs and your pan.' },
    after: { text: 'Your answers adjust the times to your eggs and your pan.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'learned.tuned', row: 'what it has learned',
    before: { one: 'tuned on {eggs} egg · ±{spread}%', other: 'tuned on {eggs} eggs · ±{spread}%' },
    after: { one: 'Learned from {eggs} egg', other: 'Learned from {eggs} eggs' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'learned.literature', row: 'nothing learned yet',
    before: { text: 'Running on the literature values. It learns your pan when you time a boil, and your taste when you say how an egg was.' },
    after: { text: 'Nothing learned yet. It learns your pan when you time a boil, and your eggs when you say how one came out.' },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'learned.confirm.title', row: 'forget dialog, iOS',
    before: { text: 'Forget the calibration?' }, after: { text: 'Forget what it learned?' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'learned.confirm.message', row: 'forget dialog, iOS',
    before: { text: 'The model goes back to the literature values it shipped with, and the time to boil goes back to a guess.' },
    after: { text: 'Every egg and your pan\'s boil time are forgotten, and the times go back to where they started.' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'readout.sub.pull', row: 'pull screen, web',
    before: { text: 'carryover is running' }, after: { text: 'the yolk is still cooking' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'action.pulled.ice', row: 'pull button, iOS',
    before: { text: 'They\'re in the ice bath' }, after: { text: 'They\'re in the ice bath' },
    appsBefore: ['web'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'action.pulled.tap', row: 'pull button, iOS',
    before: { text: 'They\'re under the tap' }, after: { text: 'They\'re under the tap' },
    appsBefore: ['web'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'action.pulled.counter', row: 'pull button, iOS',
    before: { text: 'They\'re out' }, after: { text: 'They\'re out' },
    appsBefore: ['web'], appsAfter: ['web', 'ios'],
  },
];

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
export const REST_DRAFT: Drafted[] = [
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

/** The odds-shaded slider's strings (the owner's answers of 27 September,
 *  PLAN.md): all new, none reworded. Applied on top of F2, `1667dcf`. */
export const REACH_DRAFT: Drafted[] = [
  {
    key: 'refusal.unlikelySoft', row: 'the refusal at the soft end of the odds',
    before: null, after: { text: "The softest I get right at least {hits} times in {of}, so far: {limit}." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'refusal.unlikelyHard', row: 'the refusal at the firm end of the odds',
    before: null, after: { text: "The firmest I get right at least {hits} times in {of}, so far: {limit}." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'odds.info', row: 'the (i) beside the odds',
    before: null, after: { text: "About these odds" },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'odds.why', row: 'what the (i) opens',
    before: null, after: { text: "Before your first egg I don't know your taste, your eggs or your pan, so I can't be sure, and this number starts low. Each egg you tell me about makes me surer, and the number goes up." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'odds.shown', row: 'the (i), open, to VoiceOver',
    before: null, after: { text: "Showing" },
    appsBefore: [], appsAfter: ['ios'],
  },
  {
    key: 'odds.hidden', row: 'the (i), closed, to VoiceOver',
    before: null, after: { text: "Hidden" },
    appsBefore: [], appsAfter: ['ios'],
  },
  {
    key: 'advice.toggle', row: 'the advice line',
    before: null, after: { text: "How to make this more reliable" },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'advice.fridge', row: 'advice: the fridge',
    before: null, after: { text: "Use eggs straight from the fridge. I know how cold a fridge is; a room can be a few degrees either way, and that moves the time." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'advice.weigh', row: 'advice: the scale',
    before: null, after: { text: "Weigh the egg instead of picking a size. One size on the box covers eggs that need quite different times." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'advice.ice', row: 'advice: ice',
    before: null, after: { text: "Put the eggs straight into ice water when they come out. On the counter the yolk keeps cooking, by an amount that is hard to predict." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'advice.moreWater', row: 'advice: more water',
    before: null, after: { text: "Use more water. With the heat off, more water holds its heat for longer, so the time depends less on your pan." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
];

/** 27 September, the owner: "no one pluralises boils except for
 *  dermatologists. 'based on history'". The remembered boil time is a blend
 *  of past boils, or another volume's scaled, so none of these may say it
 *  is a time this pan took. */
export const HISTORY_DRAFT: Drafted[] = [
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
export const TRUTHS_DRAFT: Drafted[] = [
  {
    key: 'texture.white.runny', row: 'texture.white.runny, against iOS\'s texture note',
    before: { text: 'white stays runny' }, after: { text: 'white stays runny' },
    appsBefore: ['web'], appsAfter: ['web', 'ios'],
  },
];

export const DRAFTS: Record<string, Draft> = {
  feedback: {
    base: 'cfe38e9',
    rows: FEEDBACK_DRAFT,
    exampleOnly: { 'learned.both': 'its example quotes learned.tuned, whose wording changed' },
  },
  rest: {
    base: 'e1f7068',
    rows: REST_DRAFT,
    exampleOnly: { 'cook.method': 'its example quotes cook.method.cold, whose wording changed' },
  },
  reach: {
    base: '1667dcf',
    rows: REACH_DRAFT,
    exampleOnly: {},
  },
  // Two branches applied changes on cc0dc47 at once, so one draft carries
  // both: a proof run since that commit must expect all four rows.
  history: {
    base: 'cc0dc47',
    rows: [...HISTORY_DRAFT, ...TRUTHS_DRAFT],
    exampleOnly: {},
  },
};

/** The draft most recently applied: what a proof checks when it is not told. */
export const LATEST_DRAFT = 'history';

/** A draft by its name, or by the commit it was applied to; the latest when
 *  neither is given or neither matches. */
export function draftFor(nameOrRef?: string): Draft {
  if (nameOrRef === undefined) return DRAFTS[LATEST_DRAFT];
  if (nameOrRef in DRAFTS) return DRAFTS[nameOrRef];
  const byBase = Object.values(DRAFTS).find((d) => nameOrRef.startsWith(d.base) || d.base.startsWith(nameOrRef));
  return byBase ?? DRAFTS[LATEST_DRAFT];
}

/** A template as a pattern: each placeholder captures, by name. Unanchored,
 *  it matches only at word boundaries, so "after boil" is not found inside
 *  "after boiling". */
export function templateRegExp(template: string, anchored: boolean): RegExp {
  const names: string[] = [];
  const parts = template.split(/\{([A-Za-z][A-Za-z0-9_]*)\}/);
  let source = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      source += parts[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else {
      names.push(parts[i]);
      source += `(?<${parts[i]}_${names.length}>.+?)`;
    }
  }
  return new RegExp(anchored ? `^${source}$` : `(?<![A-Za-z])${source}(?![A-Za-z])`, 'g');
}

/** Rewrite every rendering of a drafted key's old wording in `text` to its new
 *  wording, category by category, carrying the placeholders that survive. A
 *  retired key's wording is left alone: it is allowed to vanish, not to move. */
export function applyDraft(text: string, rows: Drafted[]): string {
  let out = text;
  for (const d of rows) {
    if (d.before === null || d.after === null) continue;
    for (const [category, from] of Object.entries(d.before)) {
      const to = d.after[category] ?? d.after['text'];
      if (to === undefined || from === to) continue;
      out = out.replace(templateRegExp(from, false), (...m: unknown[]) => {
        const groups = m[m.length - 1] as Record<string, string>;
        return to.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_all, name: string) => {
          const hit = Object.entries(groups).find(([k]) => k.startsWith(`${name}_`));
          return hit === undefined ? `{${name}}` : hit[1];
        });
      });
    }
  }
  return out;
}
