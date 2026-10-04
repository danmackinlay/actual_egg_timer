/**
 * The `version` draft: the app's version at the foot of Settings (5 October
 * 2026), on `11943b9`, both apps. One new key, none changed or retired.
 *
 * The owner wants a person to be able to find which version they have, as
 * they can find their random number (`share.id`, the `sharingid` draft). It
 * is the last line of Settings, under the colophon: quiet, and where an app's
 * version is looked for. The number is not words and is filled in by each
 * app: the web's `APP_VERSION` (0.4.0-alpha.1); on iOS the App Store version
 * and the build in brackets (0.4.0 (2)), since the App Store version holds
 * only integers. Like the random number it is shown whole, in a fixed-width
 * face (the 1750 face's figures would turn its 0 into an o), and selectable.
 *
 * "Version 0.4.0", not "Version: 0.4.0": the owner's colon rule is for an
 * inserted word, and this is a number after its name, as every app and
 * manual writes it.
 *
 * No `copy/en-US.json` entry: American English says it the same way, and an
 * overlay holds only what a region says differently.
 *
 * The 1750 twin, new, after a printer's title page:
 *   colophon.version: Edition {version}
 */

import type { Draft, Drafted } from '../copyDraft.js';

const VERSION_DRAFT: Drafted[] = [
  {
    key: 'colophon.version', row: 'Settings: foot',
    before: null, after: { text: 'Version {version}' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
];

export const version: Draft = {
  base: '11943b9',
  rows: VERSION_DRAFT,
  exampleOnly: {},
};
