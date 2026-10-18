/**
 * The cook in progress as the web stores it (src/ui/storedCook.ts), through
 * the page's store (src/ui/store.ts, `openCooks`): a cook at each stage
 * written and read back as it was, and every way a stored one is damaged or
 * of another build refused whole. The iPhone holds its own reader to its own
 * table (StoredCookTests.swift).
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  type CookChoices, type RunningCook, appendEntry, corrected, pullStands, startCook, startCorrected, withBoil,
  writeEvents,
} from '../src/core/running.ts';
import type { CookAsRan } from '../src/core/asRan.ts';
import { STORES } from '../src/ui/stores.ts';
import { type KeptAnswers, readRunningCook, readStoredCook, storedCook } from '../src/ui/storedCook.ts';
import { openCooks } from '../src/ui/store.ts';

const storage = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); },
    removeItem: (k: string) => { storage.delete(k); },
  },
};

/** 7 October 2026, 09:00 UTC. */
const S = 1791363600;
const CHOICES: CookChoices = {
  mass_kg: 0.0625, massFrom: 'class', sizeTable: 'eu', eggFrom: 'fridge', customStart_C: 12, room_C: null,
  startMode: 'cold', afterBoil: 'hold', cooling: 'ice', tapWater_C: null, bowlLitres: 2, bowlWater_C: null,
  waterLitres: 2, eggCount: 2, altitude_m: 0, level: 0.41,
};
const MEMORY = { '2.0': 480, '3.0': 610 };

function cookOf(over: Partial<CookChoices> = {}, nudge_s = 0): RunningCook {
  return startCook(S, { ...CHOICES, ...over }, nudge_s, MEMORY, 'metric', 'en');
}

const AS_RAN: CookAsRan = {
  correctedAt_s: null, level: 0.41, cook_s: 318.7, nudge_s: 0, peakYolk_C: 64.7, probeMoment: true,
  forecast: { cook_s: 318.7, yolk: [0.2, 0.7, 0.1], white: [0.05, 0.9, 0.05], yolkWord: [0.1, 0.2, 0.4, 0.2, 0.1] },
  params: { alpha_m2s: 1.4321e-7 },
};

const cold = cookOf();
const hot = cookOf({ startMode: 'hot' }, -7);
const tapped = withBoil(cold, S + 532.5);
const pulled = writeEvents(tapped, { ...tapped.events, pulled: { due_s: S + 851.2, out_s: S + 858.9, by: 'cook', confirmed: true } });
const cooled = writeEvents(pulled, { ...pulled.events, cooledAt_s: S + 1031.9 });
const kept = appendEntry(cooled, { kind: 'ran', asRan: AS_RAN });
const answered = appendEntry(cooled, {
  kind: 'answered', at_s: S + 1100, yolkWord: 'jammy', white: null, probe: { centre_C: 66.4, after_s: 180 },
});
const timedOut = writeEvents(hot, {
  boilAt_s: null, pulled: { due_s: S + 380, out_s: S + 400, by: 'timeout', confirmed: false },
  cooledAt_s: S + 590, rangAt_s: S + 380,
});
const rung = writeEvents(hot, { ...hot.events, rangAt_s: S + 380 });
const moved = startCorrected(cold, S - 60, S + 10) as RunningCook;
const heavier = corrected(tapped, { ...tapped.choices, mass_kg: 0.076 }, S + 600);

/** A copy of `raw` with the value at `path` replaced, or removed when
 *  `value` is undefined. */
function withAt(raw: unknown, path: string[], value: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  let node: Record<string, unknown> = copy;
  for (let i = 0; i < path.length - 1; i++) node = node[path[i]] as Record<string, unknown>;
  const last = path[path.length - 1];
  if (value === undefined) delete node[last];
  else node[last] = value;
  return copy;
}

test('a cook at each stage is read back as it was written', () => {
  const stages: RunningCook[] = [
    cold, hot, tapped, pulled, cooled, kept, answered, timedOut, pullStands(timedOut), rung, moved, heavier,
    corrected(kept, { ...kept.choices, mass_kg: 0.06 }, S + 1200),
    startCook(S, { ...CHOICES, startMode: 'hot' }, -7, MEMORY, 'imperial', 'en-x-1750'),
    startCook(S, { ...CHOICES, mass_kg: 0.0612, massFrom: 'girth', sizeTable: null, room_C: 23.5, eggFrom: 'room' }, 3, {}, 'metric', 'cs'),
    corrected(tapped, { ...CHOICES, cooling: 'bowl', bowlLitres: 1.5, bowlWater_C: null, tapWater_C: 12.5 }, S + 600),
    startCook(S, { ...CHOICES, startMode: 'hot', cooling: 'eggCup' }, 0, MEMORY, 'metric', 'en'),
  ];
  for (const [i, cook] of stages.entries()) {
    assert.deepEqual(readRunningCook(JSON.parse(JSON.stringify(cook))), cook, `stage ${i}`);
    const answers: KeptAnswers = i % 2 === 0 ? 'none' : 'beforeReload';
    const text = JSON.stringify(storedCook({ cook: cook, answers: answers, leanHint_s: 0.30000000000000004 }));
    assert.deepEqual(readStoredCook(JSON.parse(text)), { cook: cook, answers: answers, leanHint_s: 0.30000000000000004 });
  }
});

/** Each way a stored cook is damaged, from a cook whose log holds the entry
 *  the row damages: pulled `[boil, pulled]`, cooled `[boil, pulled,
 *  cooled]`, kept and answered with a fourth, heavier `[boil, correct]`,
 *  moved `[start]`, rung `[rang]`. */
const FROM: Record<string, RunningCook> = { pulled, cooled, kept, answered, heavier, moved, rung };
const BOIL = { kind: 'boil', at_s: S + 532.5 };
const REFUSED: [string, string, string[], unknown][] = [
  ['no id', 'pulled', ['id_ms'], undefined],
  ['an id that is not a number', 'pulled', ['id_ms'], '1791363600000'],
  ['no start', 'pulled', ['start'], undefined],
  ['a start that is a list', 'pulled', ['start'], []],
  ['a start of zero', 'pulled', ['start', 'at_s'], 0],
  ['no choices', 'pulled', ['start', 'choices'], undefined],
  ['a bowl of no water', 'pulled', ['start', 'choices', 'bowlLitres'], 0],
  ['no bowl', 'pulled', ['start', 'choices', 'bowlLitres'], undefined],
  ['running water at a temperature in words', 'pulled', ['start', 'choices', 'tapWater_C'], 'cold'],
  ['no word on the bowl’s water', 'pulled', ['start', 'choices', 'bowlWater_C'], undefined],
  ['choices that are a list', 'pulled', ['start', 'choices'], []],
  ['no mass', 'pulled', ['start', 'choices', 'mass_kg'], undefined],
  ['a mass of zero', 'pulled', ['start', 'choices', 'mass_kg'], 0],
  ['a mass that is true', 'pulled', ['start', 'choices', 'mass_kg'], true],
  ['an unknown mass source', 'pulled', ['start', 'choices', 'massFrom'], 'guess'],
  ['a class with no carton', 'pulled', ['start', 'choices', 'sizeTable'], null],
  ['an unknown carton', 'pulled', ['start', 'choices', 'sizeTable'], 'uk'],
  ['an unknown egg source', 'pulled', ['start', 'choices', 'eggFrom'], 'counter'],
  ['no egg temperature of its own', 'pulled', ['start', 'choices', 'customStart_C'], null],
  ['a room that is a string', 'pulled', ['start', 'choices', 'room_C'], '20'],
  ['no room at all', 'pulled', ['start', 'choices', 'room_C'], undefined],
  ['sous-vide', 'pulled', ['start', 'choices', 'startMode'], 'sous'],
  ['an unknown burner', 'pulled', ['start', 'choices', 'afterBoil'], 'low'],
  ['no burner', 'pulled', ['start', 'choices', 'afterBoil'], undefined],
  ['an unknown cooling', 'pulled', ['start', 'choices', 'cooling'], 'fridge'],
  ['no water', 'pulled', ['start', 'choices', 'waterLitres'], 0],
  ['no eggs', 'pulled', ['start', 'choices', 'eggCount'], 0],
  ['no altitude', 'pulled', ['start', 'choices', 'altitude_m'], null],
  ['a level past hard', 'pulled', ['start', 'choices', 'level'], 1.01],
  ['a level under runny', 'pulled', ['start', 'choices', 'level'], -0.01],
  ['no log', 'pulled', ['log'], undefined],
  ['a log that is not a list', 'pulled', ['log'], { 0: BOIL }],
  ['an entry that is a number', 'pulled', ['log', '0'], 3],
  ['an entry of a kind this build does not know', 'pulled', ['log', '0', 'kind'], 'heatOff'],
  ['a boil before the start', 'pulled', ['log', '0', 'at_s'], S - 1],
  ['a boil that is a string', 'pulled', ['log', '0', 'at_s'], 'soon'],
  ['a boil with no time', 'pulled', ['log', '0', 'at_s'], undefined],
  ['a pull that is a list', 'pulled', ['log', '1', 'pulled'], []],
  ['a pull due before the start', 'pulled', ['log', '1', 'pulled', 'due_s'], S - 5],
  ['out before it was due', 'pulled', ['log', '1', 'pulled', 'out_s'], S + 851],
  ['pulled by nobody', 'pulled', ['log', '1', 'pulled', 'by'], null],
  ['a pull neither confirmed nor not', 'pulled', ['log', '1', 'pulled', 'confirmed'], undefined],
  ['a pull confirmed as a number', 'pulled', ['log', '1', 'pulled', 'confirmed'], 1],
  ['the cook’s own tap, unconfirmed', 'pulled', ['log', '1', 'pulled', 'confirmed'], false],
  ['no pull in a pull entry', 'pulled', ['log', '1', 'pulled'], undefined],
  ['a correction whose choices do not read', 'heavier', ['log', '1', 'choices', 'level'], 1.01],
  ['a correction with no time', 'heavier', ['log', '1', 'at_s'], 'then'],
  ['corrected before the start', 'heavier', ['log', '1', 'at_s'], S - 1],
  ['a start corrected to no time', 'moved', ['log', '0', 'startedAt_s'], null],
  ['rang before the start', 'rung', ['log', '0', 'at_s'], S - 1],
  ['rang as a string', 'rung', ['log', '0', 'at_s'], 'then'],
  ['cooled without a pull', 'cooled', ['log', '1'], BOIL],
  ['cooled before the egg came out', 'cooled', ['log', '2', 'at_s'], S + 858],
  ['an answer in a word not asked', 'answered', ['log', '3', 'yolkWord'], 'gooey'],
  ['a white answer not asked', 'answered', ['log', '3', 'white'], 'set'],
  ['a probe reading that is not one', 'answered', ['log', '3', 'probe', 'centre_C'], 'hot'],
  ['an answer with no probe word', 'answered', ['log', '3', 'probe'], undefined],
  ['a nudge that is not a number', 'pulled', ['nudge_s'], null],
  ['pans that are a list', 'pulled', ['boilMemory'], [480]],
  ['a pan that is not a time', 'pulled', ['boilMemory', '2.0'], 'slow'],
  ['a pan of no time', 'pulled', ['boilMemory', '2.0'], 0],
  ['unknown units', 'pulled', ['units'], 'si'],
  ['no language', 'pulled', ['lang'], ''],
  ['the plan as it ran, with no pull', 'kept', ['log', '1'], BOIL],
  ['the plan as it ran, a list', 'kept', ['log', '3', 'asRan'], []],
  ['the plan as it ran, no forecast', 'kept', ['log', '3', 'asRan', 'forecast'], null],
  ['the plan as it ran, a forecast that is not one', 'kept', ['log', '3', 'asRan', 'forecast', 'yolk'], [0.5, 0.6, 0.1]],
  ['the plan as it ran, a level past hard', 'kept', ['log', '3', 'asRan', 'level'], 1.5],
  ['the plan as it ran, no cook time', 'kept', ['log', '3', 'asRan', 'cook_s'], 0],
  ['the plan as it ran, a nudge that is a string', 'kept', ['log', '3', 'asRan', 'nudge_s'], '3'],
  ['the plan as it ran, no peak yolk', 'kept', ['log', '3', 'asRan', 'peakYolk_C'], undefined],
  ['the plan as it ran, the probe moment a number', 'kept', ['log', '3', 'asRan', 'probeMoment'], 1],
  ['the plan as it ran, a diffusivity of zero', 'kept', ['log', '3', 'asRan', 'params', 'alpha_m2s'], 0],
  ['the plan as it ran, corrected before the start', 'kept', ['log', '3', 'asRan', 'correctedAt_s'], S - 1],
  ['the plan as it ran, corrected before 1970', 'kept', ['log', '3', 'asRan', 'correctedAt_s'], -1],
];

test('a cook damaged anywhere is refused whole; what is written beside its log is not read', () => {
  for (const [note, from, path, value] of REFUSED) {
    assert.equal(readRunningCook(withAt(FROM[from], path, value)), null, note);
  }
  for (const raw of [null, [pulled], 7, { ...JSON.parse(JSON.stringify(pulled)), start: undefined, log: undefined }]) {
    assert.equal(readRunningCook(raw), null, JSON.stringify(raw).slice(0, 40));
  }
  assert.deepEqual(readRunningCook(withAt(pulled, ['events', 'boilAt_s'], 'soon')), pulled, 'folded afresh');
  assert.deepEqual(readRunningCook(withAt(pulled, ['startedAt_s'], undefined)), pulled, 'folded afresh');
  assert.deepEqual(readRunningCook(withAt(pulled, ['ticket'], { old: true })), pulled, 'extra fields are ignored');
});

test('the store takes a stored cook in its format, whole, and refuses the rest', () => {
  const cooks = openCooks();
  const base = storedCook({ cook: answered, answers: 'none', leanHint_s: 0 });
  /** The cook as it stood, which builds before this one wrote beside the log. */
  const folded = {
    ...base,
    cook: {
      ...(base['cook'] as object), startedAt_s: answered.startedAt_s, choices: answered.choices, events: answered.events,
      correctedAt_s: answered.correctedAt_s, asRan: answered.asRan,
    },
  };
  const text = (o: unknown): string => JSON.stringify(o);
  const TAKEN: [string, string][] = [
    ['as written', text(base)],
    ['a field this build does not know: ignored', text({ ...base, later: [1, 2] })],
    ['the cook as it stands written beside its log: folded afresh', text(folded)],
    ['the cook as it stands, damaged: folded afresh', text(withAt(folded, ['cook', 'events', 'boilAt_s'], 'soon'))],
  ];
  for (const [about, t] of TAKEN) {
    storage.clear();
    storage.set(STORES.cook.key, t);
    assert.deepEqual(cooks.load(), { cook: answered, answers: 'none', leanHint_s: 0 }, about);
  }
  const format = STORES.cook.format;
  const REFUSED_TEXT: [string, string][] = [
    ['not JSON', '{damaged'], ['empty', ''], ['null', 'null'], ['a number', '6'], ['text', '"cook"'],
    ['a list', text([base])],
    ['the web’s shape before formats were inside (aet.cook.v5)', text(withAt(base, ['v'], undefined))],
    ['the iPhone’s shape before (cookInProgress.v4)', text({ cook: base['cook'], feedbackGiven: false, leanHint_s: 0 })],
    ['an earlier format', text(withAt(base, ['v'], format - 1))],
    ['a later format', text(withAt(base, ['v'], format + 1))],
    ['the format as text', text(withAt(base, ['v'], String(format)))],
    ['the format true', text(withAt(base, ['v'], true))],
    ['the format and a half', text(withAt(base, ['v'], format + 0.5))],
    ['no answers', text(withAt(base, ['answers'], undefined))],
    ['answers this build does not know', text(withAt(base, ['answers'], 'some'))],
    ['answers true', text(withAt(base, ['answers'], true))],
    ['no lean', text(withAt(base, ['leanHint_s'], undefined))],
    ['a lean of null', text(withAt(base, ['leanHint_s'], null))],
    ['a lean as text', text(withAt(base, ['leanHint_s'], '12'))],
    ['a lean past any double', text(base).replace('"leanHint_s":0', '"leanHint_s":1e400')],
    ['no cook', text(withAt(base, ['cook'], undefined))],
    ['a cook that is a list', text(withAt(base, ['cook'], []))],
    ['a cook whose log does not read', text(withAt(base, ['cook', 'log', '0', 'kind'], 'heatOff'))],
    ['a cook’s mass past any double', text(base).replace(/"mass_kg":[0-9.e-]+/, '"mass_kg":1e400')],
  ];
  for (const [about, t] of REFUSED_TEXT) {
    storage.clear();
    storage.set(STORES.cook.key, t);
    assert.equal(cooks.load(), null, about);
  }
});
