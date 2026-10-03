/**
 * The `sharingid` draft: the random number shown in Settings (3 October 2026,
 * DECISIONS.md 67), on `99572b7`, both apps. One new key, none changed or
 * retired.
 *
 * The privacy page tells a person who wants their results deleted to "write
 * to forgetmyeggs@danmackinlay.name with your random number", and until now
 * neither app showed it. `share.id` is the label over it, in the sharing
 * section under the note of what has been sent, once sharing has been turned
 * on (there is no number before). It uses the page's own words, "random
 * number", which `share.what` also uses ("a random number made on this
 * device stands in for you"), so the three agree. The number itself is not
 * words and has no key: it is shown whole, never shortened, since the email
 * needs all of it, in a fixed-width face (the 1750 face's figures would turn
 * its 0 into an o), and selectable, to copy.
 *
 * No `copy/en-US.json` entry: American English says it the same way, and an
 * overlay holds only what a region says differently.
 *
 * The 1750 twin, new, after `share.what`'s "a number drawn at random upon
 * this device stands for you":
 *   share.id: Your number, drawn at random
 */

import type { Draft, Drafted } from '../copyDraft.js';

const SHARINGID_DRAFT: Drafted[] = [
  {
    key: 'share.id', row: 'Settings: sharing',
    before: null, after: { text: 'Your random number' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
];

export const sharingid: Draft = {
  base: '99572b7',
  rows: SHARINGID_DRAFT,
  exampleOnly: {},
};
