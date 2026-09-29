/**
 * The `iosB` draft: iOS pass B - the direction, the bracket's words and
 * playing safe on iOS, sharing the web's keys and retiring the odds line's,
 * and the phase screens in the web's words - on `44b0cb1`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** iOS pass B (UI.md, "As built (iOS, pass B)"): the web's direction
 *  sentence, its (i), the white's line, the bracket's words and the
 *  play-safe suggestion on iOS, in place of the odds line and "I'm still
 *  learning"; and the phase screens in the web's words where the moment is
 *  the same. No wording changes: the web's keys gain iOS, and the iOS keys
 *  they replace are retired. */
const IOS_B_DRAFT: Drafted[] = [
  {
    key: 'outcome.likely', row: "direction, shared with iOS",
    before: { text: "Probably just right." },
    after: { text: "Probably just right." },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'outcome.likely.firm', row: "direction, shared with iOS",
    before: { text: "Probably just right. If not, more likely a little firm." },
    after: { text: "Probably just right. If not, more likely a little firm." },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'outcome.likely.soft', row: "direction, shared with iOS",
    before: { text: "Probably just right. If not, more likely a little soft." },
    after: { text: "Probably just right. If not, more likely a little soft." },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'outcome.unsure', row: "direction, shared with iOS",
    before: { text: "Could come out softer or firmer than you like — I can't call it yet." },
    after: { text: "Could come out softer or firmer than you like — I can't call it yet." },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'outcome.miss.firm', row: "direction, shared with iOS",
    before: { text: "It could miss, and if it does, more likely firmer than you like." },
    after: { text: "It could miss, and if it does, more likely firmer than you like." },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'outcome.miss.soft', row: "direction, shared with iOS",
    before: { text: "It could miss, and if it does, more likely softer than you like." },
    after: { text: "It could miss, and if it does, more likely softer than you like." },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'outcome.whiteRunny', row: "direction, shared with iOS",
    before: { text: "The white might still be runny." },
    after: { text: "The white might still be runny." },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'outcome.range', row: "direction, shared with iOS",
    before: { text: "Likely yolk: {low} to {high}" },
    after: { text: "Likely yolk: {low} to {high}" },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'outcome.range.one', row: "direction, shared with iOS",
    before: { text: "Likely yolk: {level}" },
    after: { text: "Likely yolk: {level}" },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'outcome.info', row: "direction, shared with iOS",
    before: { text: "How sure I am" },
    after: { text: "How sure I am" },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'outcome.bracket', row: "direction, shared with iOS",
    before: { text: "The bracket under the doneness slider is where I expect your yolk to land. If a soft yolk would bother you more than a firm one, slide right until the bracket's left end is somewhere you'd still be happy; if a firm one would, slide left until its right end is. Or tap the level I suggest, when I suggest one." },
    after: { text: "The bracket under the doneness slider is where I expect your yolk to land. If a soft yolk would bother you more than a firm one, slide right until the bracket's left end is somewhere you'd still be happy; if a firm one would, slide left until its right end is. Or tap the level I suggest, when I suggest one." },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'outcome.why', row: "direction, shared with iOS",
    before: { text: "Before your first egg I don't know your taste, your eggs or your kitchen, so the bracket starts wide. Each egg you tell me about narrows it." },
    after: { text: "Before your first egg I don't know your taste, your eggs or your kitchen, so the bracket starts wide. Each egg you tell me about narrows it." },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'outcome.learning', row: "direction, shared with iOS",
    before: { text: "I learn your taste in yolks from how you say they came out, how your whites set from the second question, how fast heat gets into your eggs from both, and how long your water takes to boil when you tap the boil. Answer both questions after each egg, and if you have a probe thermometer, give me a reading: that is the quickest teacher." },
    after: { text: "I learn your taste in yolks from how you say they came out, how your whites set from the second question, how fast heat gets into your eggs from both, and how long your water takes to boil when you tap the boil. Answer both questions after each egg, and if you have a probe thermometer, give me a reading: that is the quickest teacher." },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'outcome.safe.firm', row: "direction, shared with iOS",
    before: { text: "Rather not risk it soft? Try: {level}" },
    after: { text: "Rather not risk it soft? Try: {level}" },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'outcome.safe.soft', row: "direction, shared with iOS",
    before: { text: "Rather not risk it firm? Try: {level}" },
    after: { text: "Rather not risk it firm? Try: {level}" },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'outcome.safe.firmer', row: "direction, shared with iOS",
    before: { text: "A little firmer" },
    after: { text: "A little firmer" },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'outcome.safe.softer', row: "direction, shared with iOS",
    before: { text: "A little softer" },
    after: { text: "A little softer" },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'odds.info', row: "retired on iOS",
    before: { text: "About these odds" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'odds.why', row: "retired on iOS",
    before: { text: "Before your first egg I don't know your taste, your eggs or your kitchen, so I can't be sure, and this number starts low. Each egg you tell me about makes me surer, and the number goes up." },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'odds.stillLearning', row: "retired on iOS",
    before: { text: "I'm still learning" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'readout.phase.heating', row: "phase screens, shared with iOS",
    before: { text: "Heating" },
    after: { text: "Heating" },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'readout.sub.heating', row: "phase screens, shared with iOS",
    before: { text: "{elapsed} heating · I expect {boil} until you tap" },
    after: { text: "{elapsed} heating · I expect {boil} until you tap" },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'readout.sub.cookingCold', row: "phase screens, shared with iOS",
    before: { text: "boil took {boil} · {after} after the boil" },
    after: { text: "boil took {boil} · {after} after the boil" },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'readout.sub.cookingHot', row: "phase screens, shared with iOS",
    before: { text: "in the water" },
    after: { text: "in the water" },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'readout.sub.doneCold', row: "phase screens, shared with iOS",
    before: { text: "{boil} to boil + {cooking} cooking" },
    after: { text: "{boil} to boil + {cooking} cooking" },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'readout.sub.doneHot', row: "phase screens, shared with iOS",
    before: { text: "total in the water" },
    after: { text: "total in the water" },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'action.hint.cookingStanding', row: "phase screens, shared with iOS",
    before: { text: "lid on, burner off" },
    after: { text: "lid on, burner off" },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'action.hint.cookingBoiling', row: "phase screens, shared with iOS",
    before: { text: "keep it at a full boil ({boiling}) until the eggs come out" },
    after: { text: "keep it at a full boil ({boiling}) until the eggs come out" },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'action.hint.pull', row: "phase screens, shared with iOS",
    before: { text: "cooling starts on its own in {seconds} s" },
    after: { text: "cooling starts on its own in {seconds} s" },
    appsBefore: ["web"], appsAfter: ["web", "ios"],
  },
  {
    key: 'readout.phase.heatingTap', row: "retired on iOS",
    before: { text: "Heating — tap when it boils" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'readout.sub.heatingEstimate', row: "retired on iOS",
    before: { text: "my guess until you tap Full rolling boil" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'readout.sub.done', row: "retired on iOS",
    before: { text: "that is the egg you asked for" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'readout.big.now', row: "retired on iOS",
    before: { text: "NOW" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
  {
    key: 'readout.big.eat', row: "retired on iOS",
    before: { text: "Eat" },
    after: null,
    appsBefore: ["ios"], appsAfter: [],
  },
];

export const iosB: Draft = {
  base: '44b0cb1',
  rows: IOS_B_DRAFT,
  exampleOnly: {
    'odds.hitTheMark': 'its note: iOS now draws it on the Lock Screen only, and the direction under the time',
  },
};
