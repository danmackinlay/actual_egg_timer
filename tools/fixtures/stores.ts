/**
 * fixtures/stores.json: every store either app keeps (src/core/stores.ts),
 * for the Swift port to be held to.
 *
 *  - `stores`: the table, a row a store: its name, its format, and its key
 *    on each app.
 *  - `inFormat`: a stored value, parsed, and whether a store reads it as one
 *    in its format: its own `v`, another, none, one that is not a number,
 *    and values that are not objects.
 *  - `cooks`: a running cook's store as text, the way it lies in storage,
 *    and what it reads as (`readStoredCook`), written again as it is stored
 *    (`storedCook`), or null: cooks at each stage as written, and every way
 *    a stored one is refused, earlier builds' shapes among them. Each app
 *    runs every row through its own load path, the web's store and iOS's
 *    `Cook`, so the two take the same cooks.
 */

import { STORES, STORE_LIST, inFormat } from '../../src/core/stores.js';
import {
  KeptAnswers, RunningCook, appendEntry, corrected, readStoredCook, startCorrected, storedCook, withAsRan, withBoil,
  writeEvents,
} from '../../src/core/running.js';
import { START_S, cookOf } from './running.js';

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

/* ------------------------------------------------------- the stored cook */

const cold = cookOf();
const tapped = withBoil(cold, START_S + 532.5);
const pulled = writeEvents(tapped, {
  ...tapped.events, pulled: { due_s: START_S + 851.2, out_s: START_S + 858.9, by: 'cook', confirmed: true },
});
const ran = withAsRan(pulled, {
  correctedAt_s: null, level: 0.41, cook_s: 318.7, nudge_s: 0, peakYolk_C: 64.7, probeMoment: true,
  forecast: { cook_s: 318.7, yolk: [0.2, 0.7, 0.1], white: [0.05, 0.9, 0.05], yolkWord: [0.1, 0.2, 0.4, 0.2, 0.1] },
  params: { alpha_m2s: 1.4321e-7 },
});
const answered = appendEntry(ran, {
  kind: 'answered', at_s: START_S + 1100, yolkWord: 'jammy', white: 'tender', probe: { centre_C: 64.2, after_s: null },
});
const weighed = { mass_kg: 0.05123456789, massFrom: 'scale', sizeTable: null } as const;
const hot = cookOf({ startMode: 'hot', ...weighed }, -7);
const moved = startCorrected(corrected(hot, { ...hot.choices, startMode: 'cold' }, START_S + 100), START_S - 60, START_S + 130);
if (moved === null) throw new Error('the start could not be moved');

/** A cook's store as an app writes it. */
function written(cook: RunningCook, answers: KeptAnswers, leanHint_s: number): Record<string, unknown> {
  return storedCook({ cook: cook, answers: answers, leanHint_s: leanHint_s });
}

/** A store with `path` set to `value` (deleted for undefined). */
function withAt(o: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(o)) as Record<string, unknown>;
  let node = copy;
  for (const key of path.slice(0, -1)) node = node[key] as Record<string, unknown>;
  const last = path[path.length - 1] as string;
  if (value === undefined) delete node[last];
  else node[last] = value;
  return copy;
}

const base = written(answered, 'none', 0);
/** The cook as it stands, which builds before this one wrote beside the log. */
const folded = {
  ...base,
  cook: {
    ...(base['cook'] as object), startedAt_s: answered.startedAt_s, choices: answered.choices, events: answered.events,
    correctedAt_s: answered.correctedAt_s, asRan: answered.asRan,
  },
};
const text = (o: unknown): string => JSON.stringify(o);

const COOK_TEXTS: { about: string; text: string }[] = [
  { about: 'a cook just started, unanswered, no lean', text: text(written(cold, 'none', 0)) },
  { about: 'the boil tapped, a lean decided', text: text(written(tapped, 'none', 12.5)) },
  { about: 'pulled, answered before a reload', text: text(written(pulled, 'beforeReload', -31.75)) },
  { about: 'the plan as it ran kept', text: text(written(ran, 'none', 0.30000000000000004)) },
  { about: 'answered, with a probe reading', text: text(base) },
  { about: 'corrected and its start moved, a weighed egg', text: text(written(moved, 'none', 3)) },
  { about: 'a field this build does not know: ignored', text: text({ ...base, later: [1, 2] }) },
  { about: 'the cook as it stands written beside its log: folded afresh', text: text(folded) },
  { about: 'the cook as it stands, no plan as it ran: folded afresh', text: text(withAt(folded, ['cook', 'asRan'], undefined)) },
  {
    about: 'the cook as it stands, damaged: folded afresh',
    text: text(withAt(folded, ['cook', 'events', 'boilAt_s'], 'soon')),
  },
  { about: 'not JSON', text: '{damaged' },
  { about: 'empty', text: '' },
  { about: 'null', text: 'null' },
  { about: 'a number', text: '6' },
  { about: 'text', text: '"cook"' },
  { about: 'a list', text: text([base]) },
  { about: 'the web\'s shape before formats were inside (aet.cook.v5)', text: text(withAt(base, ['v'], undefined)) },
  { about: 'the iPhone\'s shape before (cookInProgress.v4): no format, feedbackGiven for answers',
    text: text({ cook: base['cook'], feedbackGiven: false, leanHint_s: 0 }) },
  {
    about: 'the iPhone\'s fields in this format',
    text: text({ v: 6, cook: base['cook'], feedbackGiven: true, leanHint_s: 0 }),
  },
  { about: 'an earlier format', text: text(withAt(base, ['v'], 5)) },
  { about: 'a later format', text: text(withAt(base, ['v'], 7)) },
  { about: 'the format as text', text: text(withAt(base, ['v'], '6')) },
  { about: 'the format true', text: text(withAt(base, ['v'], true)) },
  { about: 'the format 6.5', text: text(withAt(base, ['v'], 6.5)) },
  { about: 'no answers', text: text(withAt(base, ['answers'], undefined)) },
  { about: 'answers this build does not know', text: text(withAt(base, ['answers'], 'some')) },
  { about: 'answers true', text: text(withAt(base, ['answers'], true)) },
  { about: 'answers null', text: text(withAt(base, ['answers'], null)) },
  { about: 'no lean', text: text(withAt(base, ['leanHint_s'], undefined)) },
  { about: 'a lean of null', text: text(withAt(base, ['leanHint_s'], null)) },
  { about: 'a lean as text', text: text(withAt(base, ['leanHint_s'], '12')) },
  { about: 'a lean of true', text: text(withAt(base, ['leanHint_s'], true)) },
  { about: 'a lean past any double', text: text(base).replace('"leanHint_s":0', '"leanHint_s":1e400') },
  { about: 'no cook', text: text(withAt(base, ['cook'], undefined)) },
  { about: 'a cook of null', text: text(withAt(base, ['cook'], null)) },
  { about: 'a cook that is a list', text: text(withAt(base, ['cook'], [])) },
  { about: 'a cook with only an id', text: text(withAt(base, ['cook'], { id_ms: 1 })) },
  { about: 'a cook whose log does not read', text: text(withAt(base, ['cook', 'log', '0', 'kind'], 'heatOff')) },
  { about: 'a cook with no start', text: text(withAt(base, ['cook', 'start'], undefined)) },
  { about: 'a cook with no log', text: text(withAt(base, ['cook', 'log'], undefined)) },
  { about: 'a cook\'s mass past any double', text: text(base).replace(/"mass_kg":[0-9.e-]+/, '"mass_kg":1e400') },
];

/** Text as a store reads it: JSON, or nothing. */
function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

const cooks = COOK_TEXTS.map((c) => {
  const read = readStoredCook(parsed(c.text));
  return { about: c.about, text: c.text, read: read === null ? null : storedCook(read) };
});

export const storesFixture = {
  about: 'Every store either app keeps: its name, its format and its key on each app, and which stored values a store reads as in its format; a running cook\'s store as text, and what it reads as. src/core/stores.ts, src/core/running.ts.',
  stores: STORE_LIST,
  inFormat: VALUES.flatMap((c) => [STORES.settings, STORES.cook, STORES.share].map((store) => ({
    about: c.about, store: store.name, raw: c.raw, read: inFormat(store, c.raw) !== null,
  }))),
  cooks: cooks,
};
