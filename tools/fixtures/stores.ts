/**
 * fixtures/stores.json: every store either app keeps (src/core/stores.ts),
 * for the Swift port to be held to.
 *
 *  - `stores`: the table, a row a store: its name, its format, and its key
 *    on each app.
 *  - `inFormat`: a stored value, parsed, and whether a store reads it as one
 *    in its format: its own `v`, another, none, one that is not a number,
 *    and values that are not objects.
 */

import { STORES, STORE_LIST, inFormat } from '../../src/core/stores.js';

const VALUES: { about: string; raw: unknown }[] = [
  { about: 'the settings\' format', raw: { v: 1, doneness: 0.5 } },
  { about: 'the cook\'s format', raw: { v: 6, cook: {} } },
  { about: 'a format no build has written', raw: { v: 7 } },
  { about: 'no format: a store from before formats were inside', raw: { doneness: 0.5 } },
  { about: 'a format of null', raw: { v: null } },
  { about: 'a format as text', raw: { v: '1' } },
  { about: 'a format of true', raw: { v: true } },
  { about: 'a format of 1.5', raw: { v: 1.5 } },
  { about: 'a format of -1', raw: { v: -1 } },
  { about: 'nothing stored', raw: null },
  { about: 'a number', raw: 1 },
  { about: 'text', raw: 'v1' },
  { about: 'a list', raw: [{ v: 1 }] },
];

export const storesFixture = {
  about: 'Every store either app keeps: its name, its format and its key on each app, and which stored values a store reads as in its format. src/core/stores.ts.',
  stores: STORE_LIST,
  inFormat: VALUES.flatMap((c) => [STORES.settings, STORES.cook, STORES.share].map((store) => ({
    about: c.about, store: store.name, raw: c.raw, read: inFormat(store, c.raw) !== null,
  }))),
};
