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
 *  - `redesign`: the web redesign of UI.md, with the owner's wording rules
 *    of 27 September, on `80799d0`.
 *  - `outcome`: the web's outcome summary - the direction, the white's line,
 *    the odds in their (i) and the bracket's words - on `7a40373`.
 *  - `safe`: playing safe - the one-tap suggestion under the direction, the
 *    direction's one (i) rewritten for the bracket with "I'm still learning"
 *    folded into it, and the owner's first-egg welcome - on `ff6c6e9`.
 *  - `iosA`: iOS pass A, the web's layout on iOS - the setup sentence,
 *    Settings, Help and the (i) - which shares the web's keys and retires
 *    the iOS ones they replace, on `91d5fff`. Three new keys, all iOS's:
 *    the (i)'s expanded and collapsed, and the units' (i) with "phone" for
 *    "browser".
 *  - `oddsHelp`: Help's "How sure I am" rewritten for what the idle screen
 *    now shows - the direction, the bracket, and the play-safe suggestion
 *    that never points at a runny white - on `91d5fff`.
 *  - `period`: F6's new English on the web - the language picker, the line
 *    under Imperial, and the 1750 title's modern twin - on `05d466b`.
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

/** The web redesign of UI.md, on `80799d0`: two controls and a sentence, a
 *  Kitchen page, the (i) on a `more` surface, and a Help page on a `help`
 *  surface. With it, the owner's wording rules of 27 September: no narrating
 *  what the screen visibly did (the sous-vide hint), no "bath" for sous-vide,
 *  "pan" only where it means the pot, and "I'm still learning". Web only:
 *  where iOS still names a key the web gave up, the key stays and loses
 *  "web" from its apps. Every text is new and unapproved; the owner reviews
 *  them on a deploy preview (UI.md section 6). */
export const REDESIGN_DRAFT: Drafted[] = [
  {
    key: "readout.stat.peakYolk", row: "the layout: one key per meaning",
    before: {"text":"peak yolk"}, after: {"text":"peak yolk"},
    appsBefore: ["web","ios"], appsAfter: ["ios"],
  },
  {
    key: "readout.stat.afterBoil", row: "the layout: one key per meaning",
    before: {"text":"after the boil"}, after: {"text":"after the boil"},
    appsBefore: ["web","ios"], appsAfter: ["ios"],
  },
  {
    key: "readout.stat.bath", row: "the owner, 27 September: wording rules",
    before: {"text":"bath"}, after: {"text":"sous-vide at"},
    appsBefore: ["web","ios"], appsAfter: ["ios"],
  },
  {
    key: "action.hint.whiteNeverSets", row: "the owner, 27 September: wording rules",
    before: {"text":"nothing to start: this pan never sets the white"}, after: {"text":"nothing to start: with this much water the white never sets"},
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "controls.doneness.valueBath", row: "the owner, 27 September: wording rules",
    before: {"text":"{doneness} · bath {bath}"}, after: {"text":"{doneness} · water at {bath}"},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.egg", row: "the layout: one key per meaning",
    before: {"text":"Egg"}, after: {"text":"Egg"},
    appsBefore: ["ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.start.hint", row: "the layout: one key per meaning",
    before: {"text":"Eggs into boiling water peel better. Eggs into cold water are done sooner, counting the wait for the water to boil."}, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: "controls.start.hintSousVide", row: "the owner, 27 September: wording rules",
    before: {"text":"A bath needs no pan, so the pan controls are put away. Your settings are kept and come back when you pick a pan again."}, after: {"text":"A bath needs no pan, so the pan controls are put away. Your settings are kept and come back when you pick a pan again."},
    appsBefore: ["web","ios"], appsAfter: ["ios"],
  },
  {
    key: "controls.atTheBoil", row: "the layout: one key per meaning",
    before: {"text":"At the boil"}, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: "controls.afterTheBoil", row: "the layout: one key per meaning",
    before: {"text":"After the boil"}, after: {"text":"After the boil"},
    appsBefore: ["ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.afterBoil.hint", row: "the layout: one key per meaning",
    before: {"text":"Heat off, lid on: the hot water continues to cook the eggs. More water holds more heat."}, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: "controls.then", row: "the layout: one key per meaning",
    before: {"text":"Then"}, after: {"text":"Then"},
    appsBefore: ["web","ios"], appsAfter: ["ios"],
  },
  {
    key: "controls.eggs", row: "the layout: one key per meaning",
    before: {"text":"Eggs"}, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: "controls.eggsInPan", row: "the layout: one key per meaning",
    before: {"text":"Eggs in the pan"}, after: {"text":"Eggs in the pan"},
    appsBefore: ["ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.pan", row: "the owner, 27 September: wording rules",
    before: {"text":"Pan, hob and altitude"}, after: {"text":"Kitchen"},
    appsBefore: ["ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.probe", row: "the layout: one key per meaning",
    before: {"text":"I have a probe thermometer"}, after: {"text":"I have a probe thermometer"},
    appsBefore: ["web","ios"], appsAfter: ["ios"],
  },
  {
    key: "controls.probe.hint", row: "the layout: one key per meaning",
    before: {"text":"When the cooling ends, I'll ask for one reading from the middle of the egg. From a single egg, that tells me how fast your eggs heat."}, after: {"text":"When the cooling ends, I'll ask for one reading from the middle of the egg. From a single egg, that tells me how fast your eggs heat."},
    appsBefore: ["web","ios"], appsAfter: ["ios"],
  },
  {
    key: "odds.why", row: "the owner, 27 September: wording rules",
    before: {"text":"Before your first egg I don't know your taste, your eggs or your pan, so I can't be sure, and this number starts low. Each egg you tell me about makes me surer, and the number goes up."}, after: {"text":"Before your first egg I don't know your taste, your eggs or your kitchen, so I can't be sure, and this number starts low. Each egg you tell me about makes me surer, and the number goes up."},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "advice.moreWater", row: "the owner, 27 September: wording rules",
    before: {"text":"Use more water. With the heat off, more water holds its heat for longer, so the time depends less on your pan."}, after: {"text":"Use more water. With the heat off, more water holds its heat for longer, so small differences in how fast it cools matter less."},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "odds.stillLearning", row: "the owner, 27 September: wording rules",
    before: {"text":"Still learning your kitchen"}, after: {"text":"I'm still learning"},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.literature", row: "the owner, 27 September: wording rules",
    before: {"text":"I haven't learned anything yet. I learn your pan when you time a boil, and your eggs when you tell me how one came out."}, after: {"text":"I haven't learned anything yet. I learn how fast your stove boils water when you tap the boil, and your eggs when you tell me how one came out."},
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "learned.pan", row: "the owner, 27 September: wording rules",
    before: {"text":"your pan: about {time} to boil, based on history"}, after: {"text":"{water} of water takes about {time} to boil, based on history"},
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "learned.confirm.title", row: "Kitchen: what I've learned, and Forget",
    before: {"text":"Forget what it learned?"}, after: {"text":"Forget what it learned?"},
    appsBefore: ["ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.confirm.forget", row: "Kitchen: what I've learned, and Forget",
    before: {"text":"Forget it"}, after: {"text":"Forget it"},
    appsBefore: ["ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.confirm.keep", row: "Kitchen: what I've learned, and Forget",
    before: {"text":"Keep it"}, after: {"text":"Keep it"},
    appsBefore: ["ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.confirm.message", row: "the owner, 27 September: wording rules",
    before: {"text":"Every egg and your pan's boil time are forgotten, and the times go back to where they started."}, after: {"text":"I forget every egg and how long your water takes to boil, and the times go back to where they started."},
    appsBefore: ["ios"], appsAfter: ["web","ios"],
  },
  {
    key: "feedback.invite", row: "the owner, 27 September: wording rules",
    before: {"text":"Your answers teach me your eggs and your pan."}, after: {"text":"Your answers teach me your eggs and your kitchen."},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "sousvide.subline", row: "the owner, 27 September: wording rules",
    before: {"text":"at {clock} — {duration} in the bath ({bath}), to eat now"}, after: {"text":"at {clock} — {duration} at {bath}, to eat now"},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "sousvide.warn", row: "the owner, 27 September: wording rules",
    before: {"text":"This bath ({bath}) is too cool to set the white, however long you leave it. I'm built for boiling water, and I'm not reliable below {floor}. Use the pan."}, after: {"text":"At {bath} the white won't set, however long you leave it. I'm built for boiling water, and I'm not reliable below {floor}. Use the pan."},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.sub.coldAssumes.info", row: "the (i)",
    before: null, after: {"text":"About this boil time"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "readout.sub.coldAssumes.more", row: "the (i)",
    before: null, after: {"text":"Each time you tap Full rolling boil on a cold-water start, I note how long the water took, and blend it half and half with what I had for that much water. I can't tell your pots apart, only how much water is in them. If I've never timed this much, I scale from the nearest amount I have. Tap the boil today and I'll correct the time while the eggs cook."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "action.hint.heating.info", row: "the (i)",
    before: null, after: {"text":"About the rolling boil"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "action.hint.heating.more", row: "the (i)",
    before: null, after: {"text":"A full rolling boil is when the whole surface is heaving and stirring doesn't calm it, not the first bubbles at the edge. The rest of the cook is timed from your tap, and it teaches me how fast your stove boils water, so a few seconds either way is fine, but a minute early isn't. Until you tap, the countdown is my guess."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.egg.more", row: "the (i)",
    before: null, after: {"text":"The heat has to reach the middle of the egg, and a bigger egg's middle is further from the water. A size from the box covers eggs of quite different weights, so if you have kitchen scales, weigh one and type the weight in, and I'll use that instead of the box."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.eggFrom.more", row: "the (i)",
    before: null, after: {"text":"A fridge keeps its eggs at much the same temperature every day, so I know where a fridge egg starts. A room can be a few degrees warmer or cooler than I assume, and every degree moves the time a little. If you know better, pick Custom and tell me. An egg that has been sitting out is at room temperature, so it also tells me how warm your kitchen is, which matters when the eggs rest on the counter or the heat goes off."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.start.more", row: "the (i)",
    before: null, after: {"text":"Boiling water: lower the eggs into water that's already at a full boil, and the clock starts as they go in. They peel more easily. Cold water: eggs in a cold pan, heat on, and you tap when it boils, which teaches me how fast your stove boils water. They're done sooner, counting the wait for the boil. Sous-vide: I'll tell you when you should have started. It's usually a while ago."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.afterTheBoil.more", row: "the (i)",
    before: null, after: {"text":"Keep boiling: the burner holds the water at a full boil until the eggs come out, and how much water there is hardly matters. Heat off, lid on: once the eggs are in boiling water, turn the burner off, put the lid on, and the hot water finishes the eggs as it cools. That saves energy, but the water is doing all the work, so how much there is decides the time, and with too little it can't finish the job. Measure it if you choose this."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.cooling", row: "the layout: one key per meaning",
    before: null, after: {"text":"Cooling"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.cooling.more", row: "the (i)",
    before: null, after: {"text":"When the eggs come out, the heat in the white keeps moving inward, and the yolk goes on cooking for a few minutes. Ice water takes the heat away fastest, so it stops that soonest and lets me offer the softest yolks; a cold tap is nearly as good. Still air barely takes heat away at all: to a hot egg on the counter it is less a way of cooling than a lid. I allow for that, but it rules out the softest yolks, and how much more the yolk cooks is hard to predict."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.water.more", row: "the (i)",
    before: null, after: {"text":"How much water goes in the pan, not counting the eggs. It matters most with the heat off, when the water's own heat does the cooking: more water holds its heat longer. It matters a little with the heat on, because cold eggs going into boiling water cool a little water more than a lot. And I remember how long it takes to boil each amount you use, so it's worth measuring."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.eggsInPan.more", row: "the (i)",
    before: null, after: {"text":"How many eggs go in together. Cold eggs take heat out of boiling water as they go in, and more eggs take more, so the water takes longer to recover, or with the heat off never does. For eggs that start in cold water it makes no difference to my sums: you tap when the water boils, and that already counts them."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.altitude.more", row: "the (i)",
    before: null, after: {"text":"Higher up, the air presses down less, so water boils cooler, and cooler water cooks more slowly. It adds up: a kitchen up a mountain needs noticeably longer than one by the sea. Tell me roughly how high you are, and I'll cook at the boiling point shown here."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.link", row: "Help",
    before: null, after: {"text":"Help"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.title", row: "Help",
    before: null, after: {"text":"Help"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.how.title", row: "Help",
    before: null, after: {"text":"How I work"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.how.p1", row: "Help",
    before: null, after: {"text":"I don't use a table of minutes. I work out how heat moves from the water into the egg, layer by layer, from the shell to the middle of the yolk, using the size you give me, where the egg starts, and how hot your water boils where you live."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.how.p2", row: "Help",
    before: null, after: {"text":"Egg proteins don't set at one temperature. They set with heat and time together: a yolk held a little cooler for a little longer ends up much like one held hotter for less. So I add up the heat and time the middle of the yolk gets, and stop when it has had what your doneness asks for, as long as the white has set too."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.how.p3", row: "Help",
    before: null, after: {"text":"The cooling is part of the cook. When the egg comes out, the heat already in the white keeps flowing inward, and the yolk goes on cooking for a few minutes. I count that in, which is why I ask how you cool your eggs, and why the countdown carries on after they're out: it ends when the middle of the yolk stops warming."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.learn.title", row: "Help",
    before: null, after: {"text":"What I learn, and from what"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.learn.p1", row: "Help",
    before: null, after: {"text":"At first I know only what's true of eggs in general. Each egg you tell me about teaches me about yours. I keep what I learn in this browser and nowhere else, so another browser, or clearing this site's data, starts me again from scratch."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.learn.p2", row: "Help",
    before: null, after: {"text":"\"How was the yolk?\" teaches me your taste: what you mean by just right. \"And the white?\" teaches me how your whites set, which the yolk alone can't. Either answer also tells me how fast heat gets into your eggs, a number that quietly covers a lot: the eggs themselves, how hard your water really boils, a fridge that runs warm."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.learn.p3", row: "Help",
    before: null, after: {"text":"A probe reading is the quickest teacher: one number from the middle of one yolk tells me how fast heat gets into your eggs. Tapping Full rolling boil on a cold-water start teaches me how long your water takes to boil, for that much water. And only eggs rested on the counter teach me how fast the counter cools them."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.learn.p4", row: "Help",
    before: null, after: {"text":"Every question is optional. An egg you say nothing about teaches me nothing, but it costs nothing either. If I've learned something wrong, a few more eggs wash it out; Forget, on the Kitchen page, starts me again."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.title", row: "Help",
    before: null, after: {"text":"Getting reliable eggs"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.intro", row: "Help",
    before: null, after: {"text":"The biggest lever is time: tell me how each egg came out, and my times close in on yours. The rest depends on how you cook."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.forYou", row: "Help",
    before: null, after: {"text":"For the eggs you've set up now"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.every.title", row: "Help",
    before: null, after: {"text":"Whichever way you cook"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.every", row: "Help",
    before: null, after: {"text":"Weigh the egg. A size from the box covers eggs that need quite different times, and size matters in every method. Use eggs straight from the fridge: I know how cold a fridge is, and I have to guess at a room."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.hot.title", row: "Help",
    before: null, after: {"text":"Into boiling water"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.hot", row: "Help",
    before: null, after: {"text":"The simplest to get right. Lower the eggs into water at a full rolling boil and keep it there. Cold eggs cool the water a little as they go in, and more water cools less, but with the heat on it soon recovers, so the amount hardly matters."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.cold.title", row: "Help",
    before: null, after: {"text":"Into cold water"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.cold", row: "Help",
    before: null, after: {"text":"Eggs in the pan, cold water, lid on, heat on, and tap Full rolling boil when the whole surface rolls. The first time, I guess how long that takes; after that I remember, for that much water. Tap when it truly rolls: the rest of the cook is timed from your tap."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.heatOff.title", row: "Help",
    before: null, after: {"text":"Heat off, lid on"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.heatOff", row: "Help",
    before: null, after: {"text":"The water does all the cooking, so how much of it there is matters more than anything else. Measure it, and use more rather than less: more water holds its heat longer, and small differences in how fast it cools matter less. With too little, I'll tell you I can't finish the job."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.cooling.title", row: "Help",
    before: null, after: {"text":"Ice, tap or counter"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.cooling", row: "Help",
    before: null, after: {"text":"This matters most for soft eggs. Ice water stops the yolk soonest and most predictably. A cold tap is nearly as good, as long as it keeps running. On the counter the yolk keeps cooking for longer than you'd think, by an amount that is hard to predict, so the softest yolks are out of reach there. For a hard egg, the counter is fine."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.odds.title", row: "Help",
    before: null, after: {"text":"How sure I am"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.odds.p1", row: "Help",
    before: null, after: {"text":"No egg timer can promise the egg you pictured, and neither can I. What I can tell you is which way it's likely to go wrong, if it does: softer or firmer than you like. The bracket under the doneness slider shows the range your yolk will probably land in. The narrower it is, the surer I am, and it narrows with every egg you tell me about."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.odds.p2", row: "Help",
    before: null, after: {"text":"Behind that is a number, such as 7/10: how often I expect an egg cooked this way to come out as you asked, with the white set and the yolk just right by your own answer. It starts low, around 2/10, because before your first egg I don't know your taste, your eggs or how hard your water really boils. The time I give is the one with the best odds, which isn't always my average guess."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.odds.p3", row: "Help",
    before: null, after: {"text":"The shading on the doneness slider follows the same odds: the stronger it is, the more often that doneness comes out right. Once I get any doneness right at least 3 times in 10, I stop offering the ones I'd get right less often."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.unsure.title", row: "Help",
    before: null, after: {"text":"Where I'm unsure"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.unsure.counter", row: "Help",
    before: null, after: {"text":"The counter. How fast an egg cools in still air is the least measured number I use: nobody seems to have published the middle of a hot egg after it leaves the water. I start from the physics, and I learn it only from eggs you rest on the counter."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.unsure.heatOff", row: "Help",
    before: null, after: {"text":"Heat off. I work out how fast the water cools from how much there is, assuming an ordinary pan with its lid on. A wide shallow pan, a heavy pot or a missing lid will cool differently, and I won't know until you tell me how the eggs came out."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.unsure.white", row: "Help",
    before: null, after: {"text":"Whites. A white that sets late and a cook who calls a tender white runny look the same to me, so I learn one number for both."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.unsure.sousVide", row: "Help",
    before: null, after: {"text":"Sous-vide. Below {floor} the white stays liquid and moves about inside the shell, which my sums leave out, so I'm not reliable there. The long answer is real, though: at those temperatures the white takes the better part of a day to set."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.sources.title", row: "Help",
    before: null, after: {"text":"Sources"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.sources.intro", row: "Help",
    before: null, after: {"text":"The main sources behind my sums. The project's README lists them all, with what each one settled."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.source.williams", row: "Help",
    before: null, after: {"text":"C. D. H. Williams, \"The Science of Boiling an Egg\", University of Exeter (1998). newton.ex.ac.uk/teaching/CDHW/egg (the host is gone; the page is in the Internet Archive)"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.source.buay", row: "Help",
    before: null, after: {"text":"D. Buay, S. K. Foong, D. Kiang, L. Kuppan and V. H. Liew, \"How long does it take to boil an egg? Revisited\", European Journal of Physics 27, 119-131 (2006). doi:10.1088/0143-0807/27/1/013"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.source.abbasnezhad", row: "Help",
    before: null, after: {"text":"B. Abbasnezhad, N. Hamdami, J.-Y. Monteau and H. Vatankhah, \"Numerical modeling of heat transfer and pasteurizing value during thermal processing of intact egg\", Food Science & Nutrition 4, 42-49 (2016). doi:10.1002/fsn3.257"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.source.denys", row: "Help",
    before: null, after: {"text":"S. Denys, J. G. Pieters and K. Dewettinck, \"Computational fluid dynamics analysis of combined conductive and convective heat transfer in model eggs\", Journal of Food Engineering 63, 281-290 (2004). doi:10.1016/j.jfoodeng.2003.06.002"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.source.vega", row: "Help",
    before: null, after: {"text":"C. Vega and R. Mercadé-Prieto, \"Culinary Biophysics: on the Nature of the 6X °C Egg\", Food Biophysics 6, 152-159 (2011). doi:10.1007/s11483-010-9200-1"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.source.weijers", row: "Help",
    before: null, after: {"text":"M. Weijers, P. A. Barneveld, M. A. Cohen Stuart and R. W. Visschers, \"Heat-induced denaturation and aggregation of ovalbumin at neutral pH described by irreversible first-order kinetics\", Protein Science 12, 2693-2703 (2003). doi:10.1110/ps.03242803"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.source.hoyt", row: "Help",
    before: null, after: {"text":"D. F. Hoyt, \"Practical methods of estimating volume and fresh weight of bird eggs\", The Auk 96, 73-77 (1979)."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.source.usda", row: "Help",
    before: null, after: {"text":"USDA Food Safety and Inspection Service, \"High Altitude Cooking\"."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "nav.back", row: "the layout: one key per meaning",
    before: null, after: {"text":"Back"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "learned.title", row: "Kitchen: what I've learned, and Forget",
    before: null, after: {"text":"What I've learned"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "more.about", row: "the (i)",
    before: null, after: {"text":"About {label}"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.sentence", row: "the setup sentence",
    before: null, after: {"text":"{egg} {from}, {start}, {cooling}."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.sentenceSousVide", row: "the setup sentence",
    before: null, after: {"text":"{egg}, {start}."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.egg", row: "the setup sentence",
    before: null, after: {"text":"{mass} eggs"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.from.fridge", row: "the setup sentence",
    before: null, after: {"text":"from the fridge"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.from.room", row: "the setup sentence",
    before: null, after: {"text":"at room temperature"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.from.custom", row: "the setup sentence",
    before: null, after: {"text":"at {temp}"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.start.cold", row: "the setup sentence",
    before: null, after: {"text":"into cold water"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.start.hot", row: "the setup sentence",
    before: null, after: {"text":"into boiling water"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.start.sous", row: "the setup sentence",
    before: null, after: {"text":"sous-vide at {bath}"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.cooling.ice", row: "the setup sentence",
    before: null, after: {"text":"then an ice bath"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.cooling.tap", row: "the setup sentence",
    before: null, after: {"text":"then under a cold tap"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.cooling.counter", row: "the setup sentence",
    before: null, after: {"text":"then onto the counter"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.clause", row: "the setup sentence",
    before: null, after: {"text":"{label}: {value}, change"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.close", row: "the setup sentence",
    before: null, after: {"text":"Done"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "idle.welcome", row: "the slot: a first-egg welcome",
    before: null, after: {"text":"Our first egg together. Until you tell me how one comes out, I go by what's true of eggs in general, not yours. Afterwards, answer the two questions and I'll start learning your eggs and your kitchen."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.units.more", row: "the (i)",
    before: null, after: {"text":"Metric or Imperial, for every number I show and every number you type. I start with what's usual where your browser says you are. Switching changes only how I write the numbers: the egg and the times stay exactly the same, and the eggs don't mind which."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.thermometer", row: "the layout: one key per meaning",
    before: null, after: {"text":"Probe thermometer"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.thermometer.more", row: "the (i)",
    before: null, after: {"text":"If you have a probe thermometer, I'll ask for one reading when the cooling countdown ends. That's the moment the middle of the yolk is at its warmest, so push the tip to the very middle and tell me the highest number you see: anywhere else, or any later, reads lower. From that single egg I learn how fast heat gets into your eggs. I don't ask when the eggs rest on the counter, because nothing is counted down."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "odds.stillLearning.info", row: "the (i)",
    before: null, after: {"text":"About what I'm learning"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "odds.stillLearning.more", row: "the (i)",
    before: null, after: {"text":"My time for this egg could still be out by more than I'd like. I learn your taste in yolks from how you say they came out, how your whites set from the second question, how fast heat gets into your eggs from both, and how long your water takes to boil when you tap the boil. Answer both questions after each egg, and if you have a probe thermometer, give me a reading: that is the quickest teacher."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "learned.forget.more", row: "the (i)",
    before: null, after: {"text":"This forgets every egg you've told me about and every boil you've timed, and I go back to what's true of eggs in general. You don't need it to undo a wrong answer or two: they wash out after a few more eggs. It's for a new stove, a new kitchen, or a fresh start."},
    appsBefore: [], appsAfter: ["web"],
  },
];

/** The outcome summary on the web (UI.md section 8): which way the egg is
 *  likely to miss in place of the odds under the time, a line for a runny
 *  white, the number moved into what the odds' (i) opens, and the bracket's
 *  words for a screen reader. iOS still says the odds line. */
export const OUTCOME_DRAFT: Drafted[] = [
  {
    key: 'outcome.likely', row: 'the direction',
    before: null, after: { text: 'Probably just right.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.likely.firm', row: 'the direction',
    before: null, after: { text: 'Probably just right. If not, more likely a little firm.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.likely.soft', row: 'the direction',
    before: null, after: { text: 'Probably just right. If not, more likely a little soft.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.unsure', row: 'the direction',
    before: null, after: { text: 'Could come out softer or firmer than you like — I can\'t call it yet.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.miss.firm', row: 'the direction',
    before: null, after: { text: 'It could miss, and if it does, more likely firmer than you like.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.miss.soft', row: 'the direction',
    before: null, after: { text: 'It could miss, and if it does, more likely softer than you like.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.whiteRunny', row: 'the white',
    before: null, after: { text: 'The white might still be runny.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.odds', row: 'the odds, in the (i)',
    before: null,
    after: { text: 'About {hits} in {of} eggs like this come out just as you like them, with the white set.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.range', row: 'the bracket',
    before: null, after: { text: 'Likely yolk: {low} to {high}' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'outcome.range.one', row: 'the bracket',
    before: null, after: { text: 'Likely yolk: {level}' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'odds.hitTheMark', row: 'the odds, in the (i)',
    before: { text: '{hits}/{of} eggs hit the mark' }, after: { text: '{hits}/{of} eggs hit the mark' },
    appsBefore: ['web', 'ios'], appsAfter: ['ios'],
  },
  {
    key: 'help.odds.p2', row: 'Help: how sure I am',
    before: { text: 'Behind that is a number, such as 7/10: how often I expect an egg cooked this way to come out as you asked, with the white set and the yolk just right by your own answer. It starts low, around 2/10, because before your first egg I don\'t know your taste, your eggs or how hard your water really boils. The time I give is the one with the best odds, which isn\'t always my average guess.' },
    after: { text: 'Behind that is a number, such as 7 in 10: how often I expect an egg cooked this way to come out as you asked, with the white set and the yolk just right by your own answer. It starts low, around 2 in 10, because before your first egg I don\'t know your taste, your eggs or how hard your water really boils. The time I give is the one with the best odds, which isn\'t always my average guess.' },
    appsBefore: ['web'], appsAfter: ['web'],
  },
];

/** 27 September: on a counter rest there is no cooling step, so iOS's pull
 *  alarm and pull note get their own lines instead of "into the cooling". */
export const COUNTER_DRAFT: Drafted[] = [
  {
    key: 'alarm.pull.bodyCounter', row: 'counter rest: the pull alarm',
    before: null, after: { text: "Out of the water and onto the counter." },
    appsBefore: [], appsAfter: ['ios'],
  },
  {
    key: 'activity.note.pullCounter', row: 'counter rest: the pull note',
    before: null, after: { text: "resting on the counter" },
    appsBefore: [], appsAfter: ['ios'],
  },
];

/** 27 September, the owner: the setup sentence "into cold water, then an ice
 *  bath" reads as if the eggs never boil. The start clause carries the boil,
 *  and the standing when the heat goes off. */
export const BOIL_DRAFT: Drafted[] = [
  {
    key: 'setup.start.cold', row: 'setup sentence: the boil',
    before: { text: "into cold water" }, after: { text: "into cold water and boiled" },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'setup.start.coldStanding', row: 'setup sentence: cold start, heat off',
    before: null, after: { text: "into cold water, brought to the boil and left to stand" },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'setup.start.hotStanding', row: 'setup sentence: boiling start, heat off',
    before: null, after: { text: "into boiling water and left to stand" },
    appsBefore: [], appsAfter: ['web'],
  },
  // The owner, from a phone: "Kitchen" is a settings page, so call it that;
  // "Number of eggs"; and the app is "I" everywhere, so nothing the cook taps
  // may speak as "I" ("I have one").
  {
    key: 'controls.pan', row: 'Kitchen -> Settings (retired key)',
    before: { text: "Kitchen" }, after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'controls.settings', row: 'Kitchen -> Settings',
    before: null, after: { text: "Settings" },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.eggsInPan', row: 'Number of eggs',
    before: { text: "Eggs in the pan" }, after: { text: "Number of eggs" },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.probe', row: 'no "I" for the cook: iOS toggle',
    before: { text: "I have a probe thermometer" }, after: { text: "Ask for a probe reading" },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'probe.offer.yes', row: 'no "I" for the cook: the offer',
    before: { text: "I have one" }, after: { text: "Yes" },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.thermometer.ask', row: 'no "I" for the cook: web checkbox',
    before: null, after: { text: "Ask for a reading after each egg" },
    appsBefore: [], appsAfter: ['web'],
  },
  // The setup clauses moved from the 27-character "fragment" surface (spliced
  // into iOS's one-line summary) to their own "clause" surface.
  {
    key: 'setup.egg', row: 'setup clause: surface fragment -> clause, words unchanged',
    before: { text: "{mass} eggs" }, after: { text: "{mass} eggs" },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'setup.from.fridge', row: 'setup clause: surface fragment -> clause, words unchanged',
    before: { text: "from the fridge" }, after: { text: "from the fridge" },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'setup.from.room', row: 'setup clause: surface fragment -> clause, words unchanged',
    before: { text: "at room temperature" }, after: { text: "at room temperature" },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'setup.from.custom', row: 'setup clause: surface fragment -> clause, words unchanged',
    before: { text: "at {temp}" }, after: { text: "at {temp}" },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'setup.start.hot', row: 'setup clause: surface fragment -> clause, words unchanged',
    before: { text: "into boiling water" }, after: { text: "into boiling water" },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'setup.start.sous', row: 'setup clause: surface fragment -> clause, words unchanged',
    before: { text: "sous-vide at {bath}" }, after: { text: "sous-vide at {bath}" },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'setup.cooling.ice', row: 'setup clause: surface fragment -> clause, words unchanged',
    before: { text: "then an ice bath" }, after: { text: "then an ice bath" },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'setup.cooling.tap', row: 'setup clause: surface fragment -> clause, words unchanged',
    before: { text: "then under a cold tap" }, after: { text: "then under a cold tap" },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'setup.cooling.counter', row: 'setup clause: surface fragment -> clause, words unchanged',
    before: { text: "then onto the counter" }, after: { text: "then onto the counter" },
    appsBefore: ['web'], appsAfter: ['web'],
  },
];

/** 27 September, the owner: Help had the right shape but belaboured,
 *  contrived text. Each section is now a short gist, then a smaller technical
 *  aside with links (Wikipedia for methods, the README and INFERENCE.md). */
export const HELP_DRAFT: Drafted[] = [
  {
    key: 'help.how.aside', row: 'Help: gist first, then a technical aside',
    before: null, after: { text: "Technically: [heat conduction](https://en.wikipedia.org/wiki/Heat_equation) through a sphere the size of your egg, and protein setting as a dose of heat over time, from the [Arrhenius equation](https://en.wikipedia.org/wiki/Arrhenius_equation). Every constant, with its source, is in the [README](https://github.com/danmackinlay/actual_egg_timer#2-the-physical-model)." },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'help.how.aside2', row: 'Help: gist first, then a technical aside',
    before: null, after: { text: "On the counter, still air takes heat out so slowly that the yolk ends up within a fraction of a degree of where it would if the egg never cooled at all. [README §5](https://github.com/danmackinlay/actual_egg_timer#5-carryover-the-cooling-step-is-part-of-the-recipe)." },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'help.how.p1', row: 'Help: gist first, then a technical aside',
    before: { text: "I don't use a table of minutes. I work out how heat moves from the water into the egg, layer by layer, from the shell to the middle of the yolk, using the size you give me, where the egg starts, and how hot your water boils where you live." }, after: { text: "I don't use a rule of thumb. I work out how heat soaks into your egg from the water, and how far the yolk and the white set on the way, then pick the time that stops the yolk where you asked." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.how.p2', row: 'Help: gist first, then a technical aside',
    before: { text: "Egg proteins don't set at one temperature. They set with heat and time together: a yolk held a little cooler for a little longer ends up much like one held hotter for less. So I add up the heat and time the middle of the yolk gets, and stop when it has had what your doneness asks for, as long as the white has set too." }, after: { text: "The cooling counts too. An egg out of the water keeps cooking from the inside for a few minutes. Ice water stops that soonest; the counter barely slows it." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.how.p3', row: 'Help: gist first, then a technical aside',
    before: { text: "The cooling is part of the cook. When the egg comes out, the heat already in the white keeps flowing inward, and the yolk goes on cooking for a few minutes. I count that in, which is why I ask how you cool your eggs, and why the countdown carries on after they're out: it ends when the middle of the yolk stops warming." }, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'help.learn.aside', row: 'Help: gist first, then a technical aside',
    before: null, after: { text: "I keep a cloud of guesses about your eggs and your taste, and each answer reweights them: [sequential Monte Carlo](https://en.wikipedia.org/wiki/Particle_filter), with an [ordered probit](https://en.wikipedia.org/wiki/Ordered_probit) for too soft, just right or too firm. I keep every egg, so when I improve, I relearn from all of them. [The design](https://github.com/danmackinlay/actual_egg_timer/blob/main/INFERENCE.md)." },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'help.learn.p1', row: 'Help: gist first, then a technical aside',
    before: { text: "At first I know only what's true of eggs in general. Each egg you tell me about teaches me about yours. I keep what I learn in this browser and nowhere else, so another browser, or clearing this site's data, starts me again from scratch." }, after: { text: "Your answers teach me three things: how you like your yolk, how your eggs' whites behave, and how fast your stove boils water. A probe reading teaches me how fast heat gets into your eggs, all at once. Every question is optional." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.learn.p2', row: 'Help: gist first, then a technical aside',
    before: { text: "\"How was the yolk?\" teaches me your taste: what you mean by just right. \"And the white?\" teaches me how your whites set, which the yolk alone can't. Either answer also tells me how fast heat gets into your eggs, a number that quietly covers a lot: the eggs themselves, how hard your water really boils, a fridge that runs warm." }, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'help.learn.p3', row: 'Help: gist first, then a technical aside',
    before: { text: "A probe reading is the quickest teacher: one number from the middle of one yolk tells me how fast heat gets into your eggs. Tapping Full rolling boil on a cold-water start teaches me how long your water takes to boil, for that much water. And only eggs rested on the counter teach me how fast the counter cools them." }, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'help.learn.p4', row: 'Help: gist first, then a technical aside',
    before: { text: "Every question is optional. An egg you say nothing about teaches me nothing, but it costs nothing either. If I've learned something wrong, a few more eggs wash it out; Forget, on the Kitchen page, starts me again." }, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'help.odds.aside', row: 'Help: gist first, then a technical aside',
    before: null, after: { text: "The bracket covers eight eggs in ten. When I choose the time, a runny white counts three times as bad as a yolk a little too firm, so I lean slightly long. The slider's shading shows how often each doneness comes out right for you." },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'help.odds.p1', row: 'Help: gist first, then a technical aside',
    before: { text: "No egg timer can promise the egg you pictured, and neither can I. What I can tell you is which way it's likely to go wrong, if it does: softer or firmer than you like. The bracket under the doneness slider shows the range your yolk will probably land in. The narrower it is, the surer I am, and it narrows with every egg you tell me about." }, after: { text: "I tell you which way an egg is likely to miss, and the bracket under the slider shows how firm the yolk will probably be. Both narrow as I learn." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.odds.p2', row: 'Help: gist first, then a technical aside',
    before: { text: "Behind that is a number, such as 7 in 10: how often I expect an egg cooked this way to come out as you asked, with the white set and the yolk just right by your own answer. It starts low, around 2 in 10, because before your first egg I don't know your taste, your eggs or how hard your water really boils. The time I give is the one with the best odds, which isn't always my average guess." }, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'help.odds.p3', row: 'Help: gist first, then a technical aside',
    before: { text: "The shading on the doneness slider follows the same odds: the stronger it is, the more often that doneness comes out right. Once I get any doneness right at least 3 times in 10, I stop offering the ones I'd get right less often." }, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'help.reliable.cold', row: 'Help: gist first, then a technical aside',
    before: { text: "Eggs in the pan, cold water, lid on, heat on, and tap Full rolling boil when the whole surface rolls. The first time, I guess how long that takes; after that I remember, for that much water. Tap when it truly rolls: the rest of the cook is timed from your tap." }, after: { text: "Tap Full rolling boil when the whole surface rolls, not at the first bubbles. That tap corrects my time while the eggs cook." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.reliable.cooling', row: 'Help: gist first, then a technical aside',
    before: { text: "This matters most for soft eggs. Ice water stops the yolk soonest and most predictably. A cold tap is nearly as good, as long as it keeps running. On the counter the yolk keeps cooking for longer than you'd think, by an amount that is hard to predict, so the softest yolks are out of reach there. For a hard egg, the counter is fine." }, after: { text: "Ice water is the most predictable, a cold tap is nearly as good, and the counter keeps cooking the yolk. For soft eggs, use ice." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.reliable.every', row: 'Help: gist first, then a technical aside',
    before: { text: "Weigh the egg. A size from the box covers eggs that need quite different times, and size matters in every method. Use eggs straight from the fridge: I know how cold a fridge is, and I have to guess at a room." }, after: { text: "Weigh the egg if you can: one size on the box covers eggs that need quite different times. Eggs straight from the fridge are more predictable than eggs at room temperature." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.reliable.heatOff', row: 'Help: gist first, then a technical aside',
    before: { text: "The water does all the cooking, so how much of it there is matters more than anything else. Measure it, and use more rather than less: more water holds its heat longer, and small differences in how fast it cools matter less. With too little, I'll tell you I can't finish the job." }, after: { text: "The water does all the cooking, so measure it, and use plenty. With too little, the white never sets." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.reliable.hot', row: 'Help: gist first, then a technical aside',
    before: { text: "The simplest to get right. Lower the eggs into water at a full rolling boil and keep it there. Cold eggs cool the water a little as they go in, and more water cools less, but with the heat on it soon recovers, so the amount hardly matters." }, after: { text: "The easiest to get right. Keep the water at a full rolling boil the whole time." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.reliable.intro', row: 'Help: gist first, then a technical aside',
    before: { text: "The biggest lever is time: tell me how each egg came out, and my times close in on yours. The rest depends on how you cook." }, after: { text: "The biggest help is telling me how each egg came out. After that, it depends on how you cook." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.sources.intro', row: 'Help: gist first, then a technical aside',
    before: { text: "The main sources behind my sums. The project's README lists them all, with what each one settled." }, after: { text: "The main sources behind my numbers. The [README](https://github.com/danmackinlay/actual_egg_timer#10-references) lists them all, with what each one settled." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.unsure.counter', row: 'Help: gist first, then a technical aside',
    before: { text: "The counter. How fast an egg cools in still air is the least measured number I use: nobody seems to have published the middle of a hot egg after it leaves the water. I start from the physics, and I learn it only from eggs you rest on the counter." }, after: { text: "The counter. Nobody seems to have published how fast an egg cools in still air, so that is my weakest number." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.unsure.heatOff', row: 'Help: gist first, then a technical aside',
    before: { text: "Heat off. I work out how fast the water cools from how much there is, assuming an ordinary pan with its lid on. A wide shallow pan, a heavy pot or a missing lid will cool differently, and I won't know until you tell me how the eggs came out." }, after: { text: "Heat off. I assume an ordinary pan with its lid on; a heavy pot or a loose lid will change the time." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.unsure.sousVide', row: 'Help: gist first, then a technical aside',
    before: { text: "Sous-vide. Below {floor} the white stays liquid and moves about inside the shell, which my sums leave out, so I'm not reliable there. The long answer is real, though: at those temperatures the white takes the better part of a day to set." }, after: { text: "Sous-vide. Below {floor} the white stays liquid and moves inside the shell, which I leave out, so I'm not reliable there. The very long times are real, though: that cool, the white takes most of a day to set." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.unsure.white', row: 'Help: gist first, then a technical aside',
    before: { text: "Whites. A white that sets late and a cook who calls a tender white runny look the same to me, so I learn one number for both." }, after: { text: "Whites. I can't tell a white that sets late from a cook who calls a tender white runny." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
];

/** 27 September, the owner: make the uncertainty actionable. A one-tap
 *  suggestion under the direction moves the slider to a level that plays
 *  safe (`saferLevels`, src/core/reach.ts); the direction's (i) explains the
 *  bracket and how to act on it, why it starts wide, and what I learn from,
 *  and no longer says the number; "I'm still learning" is no longer a line of
 *  its own on the web, its (i) folded into that one; and the first-egg
 *  welcome is in the owner's words. iOS keeps odds.info, odds.why and
 *  odds.stillLearning. */
export const SAFE_DRAFT: Drafted[] = [
  {
    key: 'outcome.info', row: "the direction's one (i)",
    before: null,
    after: { text: "How sure I am" },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'outcome.bracket', row: "the direction's one (i)",
    before: null,
    after: { text: "The bracket under the doneness slider is where I expect your yolk to land. If a soft yolk would bother you more than a firm one, slide right until the bracket's left end is somewhere you'd still be happy; if a firm one would, slide left until its right end is. Or tap the level I suggest, when I suggest one." },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'outcome.why', row: "the direction's one (i)",
    before: null,
    after: { text: "Before your first egg I don't know your taste, your eggs or your kitchen, so the bracket starts wide. Each egg you tell me about narrows it." },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'outcome.learning', row: "the direction's one (i)",
    before: null,
    after: { text: "I learn your taste in yolks from how you say they came out, how your whites set from the second question, how fast heat gets into your eggs from both, and how long your water takes to boil when you tap the boil. Answer both questions after each egg, and if you have a probe thermometer, give me a reading: that is the quickest teacher." },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'outcome.odds', row: "the direction's one (i)",
    before: { text: "About {hits} in {of} eggs like this come out just as you like them, with the white set." },
    after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'odds.info', row: "the direction's one (i)",
    before: { text: "About these odds" },
    after: { text: "About these odds" },
    appsBefore: ["web", "ios"], appsAfter: ["ios"],
  },
  {
    key: 'odds.why', row: "the direction's one (i)",
    before: { text: "Before your first egg I don't know your taste, your eggs or your kitchen, so I can't be sure, and this number starts low. Each egg you tell me about makes me surer, and the number goes up." },
    after: { text: "Before your first egg I don't know your taste, your eggs or your kitchen, so I can't be sure, and this number starts low. Each egg you tell me about makes me surer, and the number goes up." },
    appsBefore: ["web", "ios"], appsAfter: ["ios"],
  },
  {
    key: 'odds.stillLearning', row: "still learning, folded into the (i)",
    before: { text: "I'm still learning" },
    after: { text: "I'm still learning" },
    appsBefore: ["web", "ios"], appsAfter: ["ios"],
  },
  {
    key: 'odds.stillLearning.info', row: "still learning, folded into the (i)",
    before: { text: "About what I'm learning" },
    after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'odds.stillLearning.more', row: "still learning, folded into the (i)",
    before: { text: "My time for this egg could still be out by more than I'd like. I learn your taste in yolks from how you say they came out, how your whites set from the second question, how fast heat gets into your eggs from both, and how long your water takes to boil when you tap the boil. Answer both questions after each egg, and if you have a probe thermometer, give me a reading: that is the quickest teacher." },
    after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'outcome.safe.firm', row: "playing safe",
    before: null,
    after: { text: "Rather not risk it soft? Try: {level}" },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'outcome.safe.soft', row: "playing safe",
    before: null,
    after: { text: "Rather not risk it firm? Try: {level}" },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'outcome.safe.firmer', row: "playing safe",
    before: null,
    after: { text: "A little firmer" },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'outcome.safe.softer', row: "playing safe",
    before: null,
    after: { text: "A little softer" },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'idle.welcome', row: "first-egg welcome",
    before: { text: "Our first egg together. Until you tell me how one comes out, I go by what's true of eggs in general, not yours. Afterwards, answer the two questions and I'll start learning your eggs and your kitchen." },
    after: { text: "Our first egg together. I start off guessing from a generic egg, but as you give me feedback, I learn to specialise on you." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
];

/** iOS pass A (UI.md, "As built (iOS, pass A)"): no wording changes but
 *  three new iOS keys; the rest is which app says what. */
export const IOS_A_DRAFT: Drafted[] = [
  {
    key: 'readout.phase.totalLidOn', row: "retired on iOS",
    before: { text: "Total time, lid on" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'readout.sub.coldAssumes', row: "shared with iOS",
    before: { text: "about {boil} to boil, based on history" },
    after: { text: "about {boil} to boil, based on history" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'readout.sub.coldAssumes.info', row: "shared with iOS",
    before: { text: "About this boil time" },
    after: { text: "About this boil time" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'readout.sub.coldAssumes.more', row: "shared with iOS",
    before: { text: "Each time you tap Full rolling boil on a cold-water start, I note how long the water took, and blend it half and half with what I had for that much water. I can't tell your pots apart, only how much water is in them. If I've never timed this much, I scale from the nearest amount I have. Tap the boil today and I'll correct the time while the eggs cook." },
    after: { text: "Each time you tap Full rolling boil on a cold-water start, I note how long the water took, and blend it half and half with what I had for that much water. I can't tell your pots apart, only how much water is in them. If I've never timed this much, I scale from the nearest amount I have. Tap the boil today and I'll correct the time while the eggs cook." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'readout.sub.coldGuesses', row: "shared with iOS",
    before: { text: "I'm guessing {boil} to boil — tap when it does" },
    after: { text: "I'm guessing {boil} to boil — tap when it does" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'readout.sub.standing', row: "shared with iOS",
    before: { text: "for this much water with the lid on ({water}) — measure the water, it changes the time" },
    after: { text: "for this much water with the lid on ({water}) — measure the water, it changes the time" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'readout.sub.hot', row: "shared with iOS",
    before: { text: "from eggs in to eggs out" },
    after: { text: "from eggs in to eggs out" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'readout.sub.idleCold', row: "retired on iOS",
    before: { text: "from eggs into cold water, heat on, to eggs out" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'readout.sub.idleHot', row: "retired on iOS",
    before: { text: "from eggs into boiling water to eggs out" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'readout.stat.peakYolk', row: "retired on iOS",
    before: { text: "peak yolk" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'readout.stat.peakWhite', row: "retired on iOS",
    before: { text: "peak white" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'readout.stat.afterBoil', row: "retired on iOS",
    before: { text: "after the boil" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'readout.stat.waterBoilsAt', row: "shared with iOS",
    before: { text: "water boils at" },
    after: { text: "water boils at" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'readout.stat.bath', row: "retired on iOS",
    before: { text: "sous-vide at" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'action.startHeating', row: "shared with iOS",
    before: { text: "Start heating" },
    after: { text: "Start heating" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'action.eggsInHeatOn', row: "retired on iOS",
    before: { text: "Eggs in, heat on" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'action.hint.cold', row: "shared with iOS",
    before: { text: "eggs in the pan, lid on, then tap" },
    after: { text: "eggs in the pan, lid on, then tap" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'action.hint.hotStanding', row: "shared with iOS",
    before: { text: "eggs into boiling water, then lid on and heat off" },
    after: { text: "eggs into boiling water, then lid on and heat off" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'action.hint.hotBoiling', row: "shared with iOS",
    before: { text: "water at a full rolling boil, and kept there for the whole {time}" },
    after: { text: "water at a full rolling boil, and kept there for the whole {time}" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'action.hint.whiteNeverSets', row: "shared with iOS",
    before: { text: "nothing to start: with this much water the white never sets" },
    after: { text: "nothing to start: with this much water the white never sets" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'action.hint.heating', row: "shared with iOS",
    before: { text: "wait for the whole surface to roll" },
    after: { text: "wait for the whole surface to roll" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'action.hint.heating.info', row: "shared with iOS",
    before: { text: "About the rolling boil" },
    after: { text: "About the rolling boil" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'action.hint.heating.more', row: "shared with iOS",
    before: { text: "A full rolling boil is when the whole surface is heaving and stirring doesn't calm it, not the first bubbles at the edge. The rest of the cook is timed from your tap, and it teaches me how fast your stove boils water, so a few seconds either way is fine, but a minute early isn't. Until you tap, the countdown is my guess." },
    after: { text: "A full rolling boil is when the whole surface is heaving and stirring doesn't calm it, not the first bubbles at the edge. The rest of the cook is timed from your tap, and it teaches me how fast your stove boils water, so a few seconds either way is fine, but a minute early isn't. Until you tap, the countdown is my guess." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'action.hint.heatingStanding', row: "shared with iOS",
    before: { text: "wait for the whole surface to roll, then lid on and heat off" },
    after: { text: "wait for the whole surface to roll, then lid on and heat off" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.doneness.value', row: "shared with iOS",
    before: { text: "{doneness} · peak yolk {yolk}" },
    after: { text: "{doneness} · peak yolk {yolk}" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.size', row: "shared with iOS",
    before: { text: "Egg size" },
    after: { text: "Egg size" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.egg.more', row: "shared with iOS",
    before: { text: "The heat has to reach the middle of the egg, and a bigger egg's middle is further from the water. A size from the box covers eggs of quite different weights, so if you have kitchen scales, weigh one and type the weight in, and I'll use that instead of the box." },
    after: { text: "The heat has to reach the middle of the egg, and a bigger egg's middle is further from the water. A size from the box covers eggs of quite different weights, so if you have kitchen scales, weigh one and type the weight in, and I'll use that instead of the box." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.measure.weight', row: "shared with iOS",
    before: { text: "Weight" },
    after: { text: "Weight" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.eggFrom.more', row: "shared with iOS",
    before: { text: "A fridge keeps its eggs at much the same temperature every day, so I know where a fridge egg starts. A room can be a few degrees warmer or cooler than I assume, and every degree moves the time a little. If you know better, pick Custom and tell me. An egg that has been sitting out is at room temperature, so it also tells me how warm your kitchen is, which matters when the eggs rest on the counter or the heat goes off." },
    after: { text: "A fridge keeps its eggs at much the same temperature every day, so I know where a fridge egg starts. A room can be a few degrees warmer or cooler than I assume, and every degree moves the time a little. If you know better, pick Custom and tell me. An egg that has been sitting out is at room temperature, so it also tells me how warm your kitchen is, which matters when the eggs rest on the counter or the heat goes off." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.eggFrom.fridge', row: "shared with iOS",
    before: { text: "Fridge" },
    after: { text: "Fridge" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.eggFrom.room', row: "shared with iOS",
    before: { text: "Room" },
    after: { text: "Room" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.eggFrom.custom', row: "shared with iOS",
    before: { text: "Custom" },
    after: { text: "Custom" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.eggFrom.fridgeAt', row: "retired on iOS",
    before: { text: "Fridge {temp}" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'controls.eggFrom.roomAt', row: "retired on iOS",
    before: { text: "Room {temp}" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'controls.eggFrom.hint', row: "shared with iOS",
    before: { text: "Assumed temperatures — fridge: {fridge}, room: {room}. Pick Custom if yours differ." },
    after: { text: "Assumed temperatures — fridge: {fridge}, room: {room}. Pick Custom if yours differ." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.eggTemp', row: "shared with iOS",
    before: { text: "Egg temperature" },
    after: { text: "Egg temperature" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.start.more', row: "shared with iOS",
    before: { text: "Boiling water: lower the eggs into water that's already at a full boil, and the clock starts as they go in. They peel more easily. Cold water: eggs in a cold pan, heat on, and you tap when it boils, which teaches me how fast your stove boils water. They're done sooner, counting the wait for the boil. Sous-vide: I'll tell you when you should have started. It's usually a while ago." },
    after: { text: "Boiling water: lower the eggs into water that's already at a full boil, and the clock starts as they go in. They peel more easily. Cold water: eggs in a cold pan, heat on, and you tap when it boils, which teaches me how fast your stove boils water. They're done sooner, counting the wait for the boil. Sous-vide: I'll tell you when you should have started. It's usually a while ago." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.start.hintSousVide', row: "retired on iOS",
    before: { text: "A bath needs no pan, so the pan controls are put away. Your settings are kept and come back when you pick a pan again." },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'controls.afterTheBoil.more', row: "shared with iOS",
    before: { text: "Keep boiling: the burner holds the water at a full boil until the eggs come out, and how much water there is hardly matters. Heat off, lid on: once the eggs are in boiling water, turn the burner off, put the lid on, and the hot water finishes the eggs as it cools. That saves energy, but the water is doing all the work, so how much there is decides the time, and with too little it can't finish the job. Measure it if you choose this." },
    after: { text: "Keep boiling: the burner holds the water at a full boil until the eggs come out, and how much water there is hardly matters. Heat off, lid on: once the eggs are in boiling water, turn the burner off, put the lid on, and the hot water finishes the eggs as it cools. That saves energy, but the water is doing all the work, so how much there is decides the time, and with too little it can't finish the job. Measure it if you choose this." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.afterBoil.explainHeatOff', row: "retired on iOS",
    before: { text: "Lid on and burner off: the water's own heat finishes the eggs. I work out the time from the water below, so measure it — more or less water changes the time, or whether it works at all." },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'controls.afterBoil.explainHold', row: "retired on iOS",
    before: { text: "The burner holds the water at a rolling boil for the whole cook." },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'controls.then', row: "retired on iOS",
    before: { text: "Then" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'controls.cooling', row: "shared with iOS",
    before: { text: "Cooling" },
    after: { text: "Cooling" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.cooling.more', row: "shared with iOS",
    before: { text: "When the eggs come out, the heat in the white keeps moving inward, and the yolk goes on cooking for a few minutes. Ice water takes the heat away fastest, so it stops that soonest and lets me offer the softest yolks; a cold tap is nearly as good. Still air barely takes heat away at all: to a hot egg on the counter it is less a way of cooling than a lid. I allow for that, but it rules out the softest yolks, and how much more the yolk cooks is hard to predict." },
    after: { text: "When the eggs come out, the heat in the white keeps moving inward, and the yolk goes on cooking for a few minutes. Ice water takes the heat away fastest, so it stops that soonest and lets me offer the softest yolks; a cold tap is nearly as good. Still air barely takes heat away at all: to a hot egg on the counter it is less a way of cooling than a lid. I allow for that, but it rules out the softest yolks, and how much more the yolk cooks is hard to predict." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.water.more', row: "shared with iOS",
    before: { text: "How much water goes in the pan, not counting the eggs. It matters most with the heat off, when the water's own heat does the cooking: more water holds its heat longer. It matters a little with the heat on, because cold eggs going into boiling water cool a little water more than a lot. And I remember how long it takes to boil each amount you use, so it's worth measuring." },
    after: { text: "How much water goes in the pan, not counting the eggs. It matters most with the heat off, when the water's own heat does the cooking: more water holds its heat longer. It matters a little with the heat on, because cold eggs going into boiling water cool a little water more than a lot. And I remember how long it takes to boil each amount you use, so it's worth measuring." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.eggsInPan.more', row: "shared with iOS",
    before: { text: "How many eggs go in together. Cold eggs take heat out of boiling water as they go in, and more eggs take more, so the water takes longer to recover, or with the heat off never does. For eggs that start in cold water it makes no difference to my sums: you tap when the water boils, and that already counts them." },
    after: { text: "How many eggs go in together. Cold eggs take heat out of boiling water as they go in, and more eggs take more, so the water takes longer to recover, or with the heat off never does. For eggs that start in cold water it makes no difference to my sums: you tap when the water boils, and that already counts them." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.altitude.more', row: "shared with iOS",
    before: { text: "Higher up, the air presses down less, so water boils cooler, and cooler water cooks more slowly. It adds up: a kitchen up a mountain needs noticeably longer than one by the sea. Tell me roughly how high you are, and I'll cook at the boiling point shown here." },
    after: { text: "Higher up, the air presses down less, so water boils cooler, and cooler water cooks more slowly. It adds up: a kitchen up a mountain needs noticeably longer than one by the sea. Tell me roughly how high you are, and I'll cook at the boiling point shown here." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.link', row: "shared with iOS",
    before: { text: "Help" },
    after: { text: "Help" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.title', row: "shared with iOS",
    before: { text: "Help" },
    after: { text: "Help" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.how.title', row: "shared with iOS",
    before: { text: "How I work" },
    after: { text: "How I work" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.how.p1', row: "shared with iOS",
    before: { text: "I don't use a rule of thumb. I work out how heat soaks into your egg from the water, and how far the yolk and the white set on the way, then pick the time that stops the yolk where you asked." },
    after: { text: "I don't use a rule of thumb. I work out how heat soaks into your egg from the water, and how far the yolk and the white set on the way, then pick the time that stops the yolk where you asked." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.how.aside', row: "shared with iOS",
    before: { text: "Technically: [heat conduction](https://en.wikipedia.org/wiki/Heat_equation) through a sphere the size of your egg, and protein setting as a dose of heat over time, from the [Arrhenius equation](https://en.wikipedia.org/wiki/Arrhenius_equation). Every constant, with its source, is in the [README](https://github.com/danmackinlay/actual_egg_timer#2-the-physical-model)." },
    after: { text: "Technically: [heat conduction](https://en.wikipedia.org/wiki/Heat_equation) through a sphere the size of your egg, and protein setting as a dose of heat over time, from the [Arrhenius equation](https://en.wikipedia.org/wiki/Arrhenius_equation). Every constant, with its source, is in the [README](https://github.com/danmackinlay/actual_egg_timer#2-the-physical-model)." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.how.p2', row: "shared with iOS",
    before: { text: "The cooling counts too. An egg out of the water keeps cooking from the inside for a few minutes. Ice water stops that soonest; the counter barely slows it." },
    after: { text: "The cooling counts too. An egg out of the water keeps cooking from the inside for a few minutes. Ice water stops that soonest; the counter barely slows it." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.how.aside2', row: "shared with iOS",
    before: { text: "On the counter, still air takes heat out so slowly that the yolk ends up within a fraction of a degree of where it would if the egg never cooled at all. [README §5](https://github.com/danmackinlay/actual_egg_timer#5-carryover-the-cooling-step-is-part-of-the-recipe)." },
    after: { text: "On the counter, still air takes heat out so slowly that the yolk ends up within a fraction of a degree of where it would if the egg never cooled at all. [README §5](https://github.com/danmackinlay/actual_egg_timer#5-carryover-the-cooling-step-is-part-of-the-recipe)." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.learn.title', row: "shared with iOS",
    before: { text: "What I learn, and from what" },
    after: { text: "What I learn, and from what" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.learn.p1', row: "shared with iOS",
    before: { text: "Your answers teach me three things: how you like your yolk, how your eggs' whites behave, and how fast your stove boils water. A probe reading teaches me how fast heat gets into your eggs, all at once. Every question is optional." },
    after: { text: "Your answers teach me three things: how you like your yolk, how your eggs' whites behave, and how fast your stove boils water. A probe reading teaches me how fast heat gets into your eggs, all at once. Every question is optional." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.learn.aside', row: "shared with iOS",
    before: { text: "I keep a cloud of guesses about your eggs and your taste, and each answer reweights them: [sequential Monte Carlo](https://en.wikipedia.org/wiki/Particle_filter), with an [ordered probit](https://en.wikipedia.org/wiki/Ordered_probit) for too soft, just right or too firm. I keep every egg, so when I improve, I relearn from all of them. [The design](https://github.com/danmackinlay/actual_egg_timer/blob/main/INFERENCE.md)." },
    after: { text: "I keep a cloud of guesses about your eggs and your taste, and each answer reweights them: [sequential Monte Carlo](https://en.wikipedia.org/wiki/Particle_filter), with an [ordered probit](https://en.wikipedia.org/wiki/Ordered_probit) for too soft, just right or too firm. I keep every egg, so when I improve, I relearn from all of them. [The design](https://github.com/danmackinlay/actual_egg_timer/blob/main/INFERENCE.md)." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.reliable.title', row: "shared with iOS",
    before: { text: "Getting reliable eggs" },
    after: { text: "Getting reliable eggs" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.reliable.intro', row: "shared with iOS",
    before: { text: "The biggest help is telling me how each egg came out. After that, it depends on how you cook." },
    after: { text: "The biggest help is telling me how each egg came out. After that, it depends on how you cook." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.reliable.forYou', row: "shared with iOS",
    before: { text: "For the eggs you've set up now" },
    after: { text: "For the eggs you've set up now" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.reliable.every.title', row: "shared with iOS",
    before: { text: "Whichever way you cook" },
    after: { text: "Whichever way you cook" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.reliable.every', row: "shared with iOS",
    before: { text: "Weigh the egg if you can: one size on the box covers eggs that need quite different times. Eggs straight from the fridge are more predictable than eggs at room temperature." },
    after: { text: "Weigh the egg if you can: one size on the box covers eggs that need quite different times. Eggs straight from the fridge are more predictable than eggs at room temperature." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.reliable.hot.title', row: "shared with iOS",
    before: { text: "Into boiling water" },
    after: { text: "Into boiling water" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.reliable.hot', row: "shared with iOS",
    before: { text: "The easiest to get right. Keep the water at a full rolling boil the whole time." },
    after: { text: "The easiest to get right. Keep the water at a full rolling boil the whole time." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.reliable.cold.title', row: "shared with iOS",
    before: { text: "Into cold water" },
    after: { text: "Into cold water" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.reliable.cold', row: "shared with iOS",
    before: { text: "Tap Full rolling boil when the whole surface rolls, not at the first bubbles. That tap corrects my time while the eggs cook." },
    after: { text: "Tap Full rolling boil when the whole surface rolls, not at the first bubbles. That tap corrects my time while the eggs cook." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.reliable.heatOff.title', row: "shared with iOS",
    before: { text: "Heat off, lid on" },
    after: { text: "Heat off, lid on" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.reliable.heatOff', row: "shared with iOS",
    before: { text: "The water does all the cooking, so measure it, and use plenty. With too little, the white never sets." },
    after: { text: "The water does all the cooking, so measure it, and use plenty. With too little, the white never sets." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.reliable.cooling.title', row: "shared with iOS",
    before: { text: "Ice, tap or counter" },
    after: { text: "Ice, tap or counter" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.reliable.cooling', row: "shared with iOS",
    before: { text: "Ice water is the most predictable, a cold tap is nearly as good, and the counter keeps cooking the yolk. For soft eggs, use ice." },
    after: { text: "Ice water is the most predictable, a cold tap is nearly as good, and the counter keeps cooking the yolk. For soft eggs, use ice." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.odds.title', row: "shared with iOS",
    before: { text: "How sure I am" },
    after: { text: "How sure I am" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.odds.p1', row: "shared with iOS",
    before: { text: "I tell you which way an egg is likely to miss, and the bracket under the slider shows how firm the yolk will probably be. Both narrow as I learn." },
    after: { text: "I tell you which way an egg is likely to miss, and the bracket under the slider shows how firm the yolk will probably be. Both narrow as I learn." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.odds.aside', row: "shared with iOS",
    before: { text: "The bracket covers eight eggs in ten. When I choose the time, a runny white counts three times as bad as a yolk a little too firm, so I lean slightly long. The slider's shading shows how often each doneness comes out right for you." },
    after: { text: "The bracket covers eight eggs in ten. When I choose the time, a runny white counts three times as bad as a yolk a little too firm, so I lean slightly long. The slider's shading shows how often each doneness comes out right for you." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.unsure.title', row: "shared with iOS",
    before: { text: "Where I'm unsure" },
    after: { text: "Where I'm unsure" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.unsure.counter', row: "shared with iOS",
    before: { text: "The counter. Nobody seems to have published how fast an egg cools in still air, so that is my weakest number." },
    after: { text: "The counter. Nobody seems to have published how fast an egg cools in still air, so that is my weakest number." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.unsure.heatOff', row: "shared with iOS",
    before: { text: "Heat off. I assume an ordinary pan with its lid on; a heavy pot or a loose lid will change the time." },
    after: { text: "Heat off. I assume an ordinary pan with its lid on; a heavy pot or a loose lid will change the time." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.unsure.white', row: "shared with iOS",
    before: { text: "Whites. I can't tell a white that sets late from a cook who calls a tender white runny." },
    after: { text: "Whites. I can't tell a white that sets late from a cook who calls a tender white runny." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.unsure.sousVide', row: "shared with iOS",
    before: { text: "Sous-vide. Below {floor} the white stays liquid and moves inside the shell, which I leave out, so I'm not reliable there. The very long times are real, though: that cool, the white takes most of a day to set." },
    after: { text: "Sous-vide. Below {floor} the white stays liquid and moves inside the shell, which I leave out, so I'm not reliable there. The very long times are real, though: that cool, the white takes most of a day to set." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.sources.title', row: "shared with iOS",
    before: { text: "Sources" },
    after: { text: "Sources" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.sources.intro', row: "shared with iOS",
    before: { text: "The main sources behind my numbers. The [README](https://github.com/danmackinlay/actual_egg_timer#10-references) lists them all, with what each one settled." },
    after: { text: "The main sources behind my numbers. The [README](https://github.com/danmackinlay/actual_egg_timer#10-references) lists them all, with what each one settled." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.source.williams', row: "shared with iOS",
    before: { text: "C. D. H. Williams, \"The Science of Boiling an Egg\", University of Exeter (1998). newton.ex.ac.uk/teaching/CDHW/egg (the host is gone; the page is in the Internet Archive)" },
    after: { text: "C. D. H. Williams, \"The Science of Boiling an Egg\", University of Exeter (1998). newton.ex.ac.uk/teaching/CDHW/egg (the host is gone; the page is in the Internet Archive)" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.source.buay', row: "shared with iOS",
    before: { text: "D. Buay, S. K. Foong, D. Kiang, L. Kuppan and V. H. Liew, \"How long does it take to boil an egg? Revisited\", European Journal of Physics 27, 119-131 (2006). doi:10.1088/0143-0807/27/1/013" },
    after: { text: "D. Buay, S. K. Foong, D. Kiang, L. Kuppan and V. H. Liew, \"How long does it take to boil an egg? Revisited\", European Journal of Physics 27, 119-131 (2006). doi:10.1088/0143-0807/27/1/013" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.source.abbasnezhad', row: "shared with iOS",
    before: { text: "B. Abbasnezhad, N. Hamdami, J.-Y. Monteau and H. Vatankhah, \"Numerical modeling of heat transfer and pasteurizing value during thermal processing of intact egg\", Food Science & Nutrition 4, 42-49 (2016). doi:10.1002/fsn3.257" },
    after: { text: "B. Abbasnezhad, N. Hamdami, J.-Y. Monteau and H. Vatankhah, \"Numerical modeling of heat transfer and pasteurizing value during thermal processing of intact egg\", Food Science & Nutrition 4, 42-49 (2016). doi:10.1002/fsn3.257" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.source.denys', row: "shared with iOS",
    before: { text: "S. Denys, J. G. Pieters and K. Dewettinck, \"Computational fluid dynamics analysis of combined conductive and convective heat transfer in model eggs\", Journal of Food Engineering 63, 281-290 (2004). doi:10.1016/j.jfoodeng.2003.06.002" },
    after: { text: "S. Denys, J. G. Pieters and K. Dewettinck, \"Computational fluid dynamics analysis of combined conductive and convective heat transfer in model eggs\", Journal of Food Engineering 63, 281-290 (2004). doi:10.1016/j.jfoodeng.2003.06.002" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.source.vega', row: "shared with iOS",
    before: { text: "C. Vega and R. Mercadé-Prieto, \"Culinary Biophysics: on the Nature of the 6X °C Egg\", Food Biophysics 6, 152-159 (2011). doi:10.1007/s11483-010-9200-1" },
    after: { text: "C. Vega and R. Mercadé-Prieto, \"Culinary Biophysics: on the Nature of the 6X °C Egg\", Food Biophysics 6, 152-159 (2011). doi:10.1007/s11483-010-9200-1" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.source.weijers', row: "shared with iOS",
    before: { text: "M. Weijers, P. A. Barneveld, M. A. Cohen Stuart and R. W. Visschers, \"Heat-induced denaturation and aggregation of ovalbumin at neutral pH described by irreversible first-order kinetics\", Protein Science 12, 2693-2703 (2003). doi:10.1110/ps.03242803" },
    after: { text: "M. Weijers, P. A. Barneveld, M. A. Cohen Stuart and R. W. Visschers, \"Heat-induced denaturation and aggregation of ovalbumin at neutral pH described by irreversible first-order kinetics\", Protein Science 12, 2693-2703 (2003). doi:10.1110/ps.03242803" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.source.hoyt', row: "shared with iOS",
    before: { text: "D. F. Hoyt, \"Practical methods of estimating volume and fresh weight of bird eggs\", The Auk 96, 73-77 (1979)." },
    after: { text: "D. F. Hoyt, \"Practical methods of estimating volume and fresh weight of bird eggs\", The Auk 96, 73-77 (1979)." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'help.source.usda', row: "shared with iOS",
    before: { text: "USDA Food Safety and Inspection Service, \"High Altitude Cooking\"." },
    after: { text: "USDA Food Safety and Inspection Service, \"High Altitude Cooking\"." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'learned.title', row: "shared with iOS",
    before: { text: "What I've learned" },
    after: { text: "What I've learned" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'more.about', row: "shared with iOS",
    before: { text: "About {label}" },
    after: { text: "About {label}" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'setup.sentence', row: "shared with iOS",
    before: { text: "{egg} {from}, {start}, {cooling}." },
    after: { text: "{egg} {from}, {start}, {cooling}." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'setup.sentenceSousVide', row: "shared with iOS",
    before: { text: "{egg}, {start}." },
    after: { text: "{egg}, {start}." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'setup.egg', row: "shared with iOS",
    before: { text: "{mass} eggs" },
    after: { text: "{mass} eggs" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'setup.from.fridge', row: "shared with iOS",
    before: { text: "from the fridge" },
    after: { text: "from the fridge" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'setup.from.room', row: "shared with iOS",
    before: { text: "at room temperature" },
    after: { text: "at room temperature" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'setup.from.custom', row: "shared with iOS",
    before: { text: "at {temp}" },
    after: { text: "at {temp}" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'setup.start.cold', row: "shared with iOS",
    before: { text: "into cold water and boiled" },
    after: { text: "into cold water and boiled" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'setup.start.coldStanding', row: "shared with iOS",
    before: { text: "into cold water, brought to the boil and left to stand" },
    after: { text: "into cold water, brought to the boil and left to stand" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'setup.start.hot', row: "shared with iOS",
    before: { text: "into boiling water" },
    after: { text: "into boiling water" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'setup.start.hotStanding', row: "shared with iOS",
    before: { text: "into boiling water and left to stand" },
    after: { text: "into boiling water and left to stand" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'setup.start.sous', row: "shared with iOS",
    before: { text: "sous-vide at {bath}" },
    after: { text: "sous-vide at {bath}" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'setup.cooling.ice', row: "shared with iOS",
    before: { text: "then an ice bath" },
    after: { text: "then an ice bath" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'setup.cooling.tap', row: "shared with iOS",
    before: { text: "then under a cold tap" },
    after: { text: "then under a cold tap" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'setup.cooling.counter', row: "shared with iOS",
    before: { text: "then onto the counter" },
    after: { text: "then onto the counter" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'setup.clause', row: "shared with iOS",
    before: { text: "{label}: {value}, change" },
    after: { text: "{label}: {value}, change" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'setup.close', row: "shared with iOS",
    before: { text: "Done" },
    after: { text: "Done" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'idle.welcome', row: "shared with iOS",
    before: { text: "Our first egg together. I start off guessing from a generic egg, but as you give me feedback, I learn to specialise on you." },
    after: { text: "Our first egg together. I start off guessing from a generic egg, but as you give me feedback, I learn to specialise on you." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.probe', row: "retired on iOS",
    before: { text: "Ask for a probe reading" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'controls.probe.hint', row: "retired on iOS",
    before: { text: "When the cooling ends, I'll ask for one reading from the middle of the egg. From a single egg, that tells me how fast your eggs heat." },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'controls.thermometer', row: "shared with iOS",
    before: { text: "Probe thermometer" },
    after: { text: "Probe thermometer" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.thermometer.more', row: "shared with iOS",
    before: { text: "If you have a probe thermometer, I'll ask for one reading when the cooling countdown ends. That's the moment the middle of the yolk is at its warmest, so push the tip to the very middle and tell me the highest number you see: anywhere else, or any later, reads lower. From that single egg I learn how fast heat gets into your eggs. I don't ask when the eggs rest on the counter, because nothing is counted down." },
    after: { text: "If you have a probe thermometer, I'll ask for one reading when the cooling countdown ends. That's the moment the middle of the yolk is at its warmest, so push the tip to the very middle and tell me the highest number you see: anywhere else, or any later, reads lower. From that single egg I learn how fast heat gets into your eggs. I don't ask when the eggs rest on the counter, because nothing is counted down." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'pan.waterBoilsAt', row: "retired on iOS",
    before: { text: "Water boils at" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'pan.timeToBoil', row: "retired on iOS",
    before: { text: "Time to boil" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'pan.timeToBoil.assumed', row: "retired on iOS",
    before: { text: "{time} (assumed)" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'pan.measured', row: "retired on iOS",
    before: { text: "Based on history with this much water. I update it each time you tap the boil on a cold-water start." },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'pan.unmeasured', row: "retired on iOS",
    before: { text: "Tap the boil on a cold-water start and I'll remember for next time." },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'odds.shown', row: "retired on iOS",
    before: { text: "Showing" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'odds.hidden', row: "retired on iOS",
    before: { text: "Hidden" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'learned.literature', row: "shared with iOS",
    before: { text: "I haven't learned anything yet. I learn how fast your stove boils water when you tap the boil, and your eggs when you tell me how one came out." },
    after: { text: "I haven't learned anything yet. I learn how fast your stove boils water when you tap the boil, and your eggs when you tell me how one came out." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'learned.pan', row: "shared with iOS",
    before: { text: "{water} of water takes about {time} to boil, based on history" },
    after: { text: "{water} of water takes about {time} to boil, based on history" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'learned.both', row: "shared with iOS",
    before: { text: "{tuned} · {pan}" },
    after: { text: "{tuned} · {pan}" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'learned.forget.more', row: "shared with iOS",
    before: { text: "This forgets every egg you've told me about and every boil you've timed, and I go back to what's true of eggs in general. You don't need it to undo a wrong answer or two: they wash out after a few more eggs. It's for a new stove, a new kitchen, or a fresh start." },
    after: { text: "This forgets every egg you've told me about and every boil you've timed, and I go back to what's true of eggs in general. You don't need it to undo a wrong answer or two: they wash out after a few more eggs. It's for a new stove, a new kitchen, or a fresh start." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'learned.forgetExplain', row: "retired on iOS",
    before: { text: "Clears what I've learned from your answers and your boil times. A few wrong answers wash out after a few more eggs anyway; this is for when you'd rather not wait." },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'controls.thermometer.ask', row: "shared with iOS",
    before: { text: "Ask for a reading after each egg" },
    after: { text: "Ask for a reading after each egg" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'colophon.name', row: "shared with iOS",
    before: { text: "Actual Egg Timer." },
    after: { text: "Actual Egg Timer." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'colophon.lede', row: "shared with iOS",
    before: { text: "Times computed from heat conduction and denaturation kinetics, not from a recipe." },
    after: { text: "Times computed from heat conduction and denaturation kinetics, not from a recipe." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'colophon.link', row: "shared with iOS",
    before: { text: "Source, and the physics it rests on" },
    after: { text: "Source, and the physics it rests on" },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'colophon.tail', row: "shared with iOS",
    before: { text: "— including what I get wrong." },
    after: { text: "— including what I get wrong." },
    appsBefore: ["web"], appsAfter: ["web","ios"],
  },
  {
    key: 'colophon.ios', row: "retired on iOS",
    before: { text: "I work out times from the physics and chemistry of eggs. Both heating and cooling matter for cooking the middle." },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'more.expanded', row: "new on iOS",
    before: null,
    after: { text: "Expanded" },
    appsBefore: [], appsAfter: ["ios"],
  },
  {
    key: 'more.collapsed', row: "new on iOS",
    before: null,
    after: { text: "Collapsed" },
    appsBefore: [], appsAfter: ["ios"],
  },
  {
    key: 'controls.units.more.ios', row: "new on iOS",
    before: null,
    after: { text: "Metric or Imperial, for every number I show and every number you set. I start with what's usual where your phone says you are. Switching changes only how I write the numbers: the egg and the times stay exactly the same, and the eggs don't mind which." },
    appsBefore: [], appsAfter: ["ios"],
  },
];

/** Help's "How sure I am", brought up to what the idle screen shows since
 *  playing safe and the runny-white guard (INFERENCE.md section 8). */
export const ODDS_HELP_DRAFT: Drafted[] = [
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

/** F6's new English, web only: the language picker, the line under Imperial
 *  that finds the English of 1750, and the 1750 title's modern twin, which
 *  is never shown (LANGUAGE.md section 6). The 1750 itself is its own
 *  catalogue, copy/en-x-1750.json, and not a draft of this one. */
export const PERIOD_DRAFT: Drafted[] = [
  {
    key: 'controls.language', row: 'F6: the picker',
    before: null, after: { text: 'Language' }, appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'controls.language.more', row: 'F6: the picker',
    before: null,
    after: { text: 'English (1750) is English as Samuel Johnson wrote it in the preface to his Dictionary. I switch to it when you change from Metric to Imperial, and back when you change back. Pick English to leave it and keep your units.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'language.en', row: 'F6: the picker',
    before: null, after: { text: 'English' }, appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'language.en1750', row: 'F6: the picker',
    before: null, after: { text: 'English (1750)' }, appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'controls.units.period', row: 'F6: under Imperial',
    before: null, after: { text: 'Imperial units are also available in the English of their period.' },
    appsBefore: [], appsAfter: ['web'],
  },
  {
    key: 'app.titlePage', row: 'F6: the title',
    before: null,
    after: { text: 'The Actual Egg-Timer: in which the times of boiling are deduced from their causes, and illustrated in their different degrees of hardness.' },
    appsBefore: [], appsAfter: ['web'],
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
  redesign: {
    base: '80799d0',
    rows: REDESIGN_DRAFT,
    exampleOnly: {
      'spoken.sousVide': 'its example quotes sousvide.subline, whose wording changed',
      'learned.both': 'its example quotes learned.pan, whose wording changed',
      'advice.toggle': 'its note: on the web it now links to Help instead of opening the advice in place',
    },
  },
  outcome: {
    base: '7a40373',
    rows: OUTCOME_DRAFT,
    exampleOnly: {
      'help.odds.p1': 'its note: the direction line and the bracket it was written for are built',
    },
  },
  counter: {
    base: '4817303',
    rows: COUNTER_DRAFT,
    exampleOnly: {},
  },
  boil: {
    base: 'e29887c',
    rows: BOIL_DRAFT,
    exampleOnly: {},
  },
  help: {
    base: '9116d33',
    rows: HELP_DRAFT,
    exampleOnly: {},
  },
  safe: {
    base: 'ff6c6e9',
    rows: SAFE_DRAFT,
    exampleOnly: {},
  },
  iosA: {
    base: '91d5fff',
    rows: IOS_A_DRAFT,
    exampleOnly: {},
  },
  // iosA and oddsHelp were applied on the same commit by two branches at
  // once, so a proof since 91d5fff sees both; the help.odds rows overlap.
  oddsHelp: {
    base: '91d5fff',
    rows: ODDS_HELP_DRAFT,
    exampleOnly: {},
  },
  period: {
    base: '05d466b',
    rows: PERIOD_DRAFT,
    exampleOnly: {},
  },
};

/** The draft most recently applied: what a proof checks when it is not told. */
export const LATEST_DRAFT = 'period';

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
