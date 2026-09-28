/**
 * The `boil` draft: the setup sentence's start clause carries the boil and
 * the standing, on `e29887c`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** 27 September, the owner: the setup sentence "into cold water, then an ice
 *  bath" reads as if the eggs never boil. The start clause carries the boil,
 *  and the standing when the heat goes off. */
const BOIL_DRAFT: Drafted[] = [
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

export const boil: Draft = {
  base: 'e29887c',
  rows: BOIL_DRAFT,
  exampleOnly: {},
};
