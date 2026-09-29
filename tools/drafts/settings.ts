/**
 * The `settings` draft: the last keys named for the old sentence and the
 * Kitchen page take the names of the choices they belong to, on `72f447c`.
 * No word a cook reads changes.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** One rename: the old key retires and the new one says the same words in the
 *  same apps. */
function renamed(from: string, to: string, text: string): Drafted[] {
  const row = 'key rename (D7), words unchanged';
  const apps = ['web', 'ios'];
  return [
    { key: from, row, before: { text }, after: null, appsBefore: apps, appsAfter: [] },
    { key: to, row, before: null, after: { text }, appsBefore: [], appsAfter: apps },
  ];
}

/** 29 September (WORKLIST 5.9, the owner's D7: "kitchen was a terrible
 *  name"): the cooling choices are `controls.cooling.*`, under the
 *  `controls.cooling` heading, and the heat after the boil is
 *  `controls.afterTheBoil.*`, under `controls.afterTheBoil`. The 1750
 *  catalogue renames the same keys, its words unchanged too. */
const SETTINGS_DRAFT: Drafted[] = [
  ...renamed('controls.then.ice', 'controls.cooling.ice', 'Ice bath'),
  ...renamed('controls.then.tap', 'controls.cooling.tap', 'Cold tap'),
  ...renamed('controls.then.counter', 'controls.cooling.counter', 'Counter'),
  ...renamed('controls.afterBoil.keepBoiling', 'controls.afterTheBoil.keepBoiling', 'Keep boiling'),
  ...renamed('controls.afterBoil.heatOff', 'controls.afterTheBoil.heatOff', 'Heat off, lid on'),
];

export const settings: Draft = {
  base: '72f447c',
  rows: SETTINGS_DRAFT,
  exampleOnly: {
    'controls.cooling': 'its note: iOS names its choices controls.cooling.* too now',
    'controls.thermometer': 'its note: the Settings page, and the checkbox is controls.thermometer.ask',
    'help.link': 'its note: the Kitchen page is the Settings page',
    'nav.back': 'its note: the Kitchen page is the Settings page',
    'learned.title': 'its note: the Kitchen page is the Settings page',
    'setup.start.coldStanding': 'its note: the Kitchen page is the Settings page',
    'setup.start.hotStanding': 'its note: the Kitchen page is the Settings page',
  },
};
