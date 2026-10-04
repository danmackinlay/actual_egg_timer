/**
 * The `randomid` draft: the random number that stands in for a person who
 * shares is a "random ID" (5 October 2026), on `8117f9e`, both apps. The
 * owner asked for it; it is a string of letters and digits, not a number,
 * and "ID" is what a person quoting it in an email would call it. The
 * privacy page says "random ID" everywhere it said "random number", and
 * "the ID" where it referred back to it.
 *
 * No `copy/en-US.json` entry: American English says it the same way.
 *
 * The 1750 twins, rewritten after the owner's "cipher", in its eighteenth-
 * century spelling; "ID" would be an anachronism, and "key" would be taken
 * for App Attest's key. Johnson's Dictionary gives cipher as "a character in
 * general" and "an intertexture of letters", that is, a personal mark:
 *   share.id: Your cypher, drawn at random (was "Your number, drawn at
 *     random")
 *   share.what: ... No name nor place: a cypher drawn at random upon this
 *     device stands for you. ... (was "a number drawn at random")
 */

import type { Draft, Drafted } from '../copyDraft.js';

const RANDOMID_DRAFT: Drafted[] = [
  {
    key: 'share.what', row: 'Settings: sharing consent',
    before: { text: 'I’ll send your results, including past ones: how each egg was cooked and how you said it came out. No name or place: a random number made on this device stands in for you. While this is on, I’ll sometimes move a time a few seconds either way, to learn faster.' },
    after: { text: 'I’ll send your results, including past ones: how each egg was cooked and how you said it came out. No name or place: a random ID made on this device stands in for you. While this is on, I’ll sometimes move a time a few seconds either way, to learn faster.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'share.id', row: 'Settings: sharing, over the id',
    before: { text: 'Your random number' },
    after: { text: 'Your random ID' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
];

export const randomid: Draft = {
  base: '8117f9e',
  rows: RANDOMID_DRAFT,
  exampleOnly: {},
};
