/**
 * fixtures/running.json: a running cook - its egg and pot, how each thing the
 * cook does moves it, and how a stored one is read (src/core/running.ts).
 */

import { SIZE_CLASSES, US_SIZE_CLASSES } from '../../src/core/geometry.js';
import {
  CookChoices, RunningCook, cookSetupOf, corrected, latestStart_s, readRunningCook, startCook, startCorrected,
  withBoil,
} from '../../src/core/running.js';

/* The egg and the pot (`cookSetupOf`) for choices across every branch: a
 * class off each carton and a measured egg, each egg start with and without
 * a measured room, both starts, both burners, each cooling, at sea level and
 * up a mountain. The moves (`startCook`, `withBoil`, `corrected`,
 * `startCorrected`) from cooks at each stage, taken and refused. The reads
 * (`readRunningCook`): a cook at each stage, written and read back, and every
 * way a stored one is refused. */

/** The cook of these fixtures: a 68 g EU Large from the fridge into 2 L of
 *  cold water at sea level, the heat held, then ice, jammy. */
export const BASE_CHOICES: CookChoices = {
  mass_kg: SIZE_CLASSES[2].mass_kg, massFrom: 'class', sizeTable: 'eu', eggFrom: 'fridge', customStart_C: 12,
  room_C: null, startMode: 'cold', afterBoil: 'hold', cooling: 'ice', waterLitres: 2, eggCount: 2,
  altitude_m: 0, level: 0.41,
};

/** 7 October 2026, 09:00 UTC, in ms: when the fixtures' cooks start. */
export const START_MS = 1791363600000;
export const START_S = START_MS / 1000;

export const MEMORY = { '2.0': 480, '3.0': 610 };

export function cookOf(over: Partial<CookChoices> = {}, nudge_s = 0): RunningCook {
  return startCook(START_MS, { ...BASE_CHOICES, ...over }, nudge_s, MEMORY, 'metric', 'en');
}

const setupChoices: CookChoices[] = [];
{
  const eggs: Partial<CookChoices>[] = [
    { mass_kg: SIZE_CLASSES[0].mass_kg, massFrom: 'class', sizeTable: 'eu' },
    { mass_kg: US_SIZE_CLASSES[4].mass_kg, massFrom: 'class', sizeTable: 'us' },
    { mass_kg: 0.0637, massFrom: 'scale', sizeTable: null },
    { mass_kg: 0.05123456789, massFrom: 'width', sizeTable: null },
  ];
  const starts: Partial<CookChoices>[] = [
    { eggFrom: 'fridge', room_C: null }, { eggFrom: 'fridge', room_C: 27 },
    { eggFrom: 'room', room_C: null }, { eggFrom: 'room', room_C: 9.5 },
    { eggFrom: 'custom', customStart_C: 17, room_C: null }, { eggFrom: 'custom', customStart_C: 8, room_C: null },
    { eggFrom: 'custom', customStart_C: 31, room_C: 22 },
  ];
  const pots: Partial<CookChoices>[] = [
    {},
    { startMode: 'hot', afterBoil: 'off', cooling: 'counter', waterLitres: 0.25, eggCount: 24, altitude_m: 2400 },
    { startMode: 'hot', cooling: 'tap', waterLitres: 12, eggCount: 1, altitude_m: -400 },
  ];
  let k = 0;
  for (const egg of eggs) {
    for (const start of starts) {
      setupChoices.push({ ...BASE_CHOICES, ...egg, ...start, ...pots[k % pots.length] });
      k += 1;
    }
  }
}

const setups = setupChoices.map((choices, i) => {
  const timeToBoil_s = [480, 30, 7200, 611.25][i % 4];
  const pot = cookSetupOf(choices, timeToBoil_s);
  return { choices: choices, timeToBoil_s: timeToBoil_s, egg: pot.egg, setup: pot.setup };
});

/* ---------------------------------------------------------------- moves */

const cold = cookOf();
const hot = cookOf({ startMode: 'hot' }, -7);
const tapped = withBoil(cold, START_S + 532.5);
const pulled: RunningCook = {
  ...tapped,
  events: { ...tapped.events, pulled: { due_s: START_S + 851.2, out_s: START_S + 858.9, by: 'cook' } },
};
const cooled: RunningCook = { ...pulled, events: { ...pulled.events, cooledAt_s: START_S + 1031.9 } };
const hotTapped = withBoil(corrected(hot, { ...hot.choices, startMode: 'cold' }, START_S + 100), START_S + 500);

type Move =
  | { boil: number }
  | { correct: CookChoices; now: number }
  | { start: number; now: number };

const MOVES: { note: string; cook: RunningCook; move: Move }[] = [
  { note: 'the boil, tapped on a cold start', cook: cold, move: { boil: START_S + 532.5 } },
  { note: 'a second tap is not taken', cook: tapped, move: { boil: START_S + 540 } },
  { note: 'no boil to tap on a hot start', cook: hot, move: { boil: START_S + 60 } },
  { note: 'no boil to tap after the pull', cook: { ...cold, events: pulled.events }, move: { boil: START_S + 900 } },
  { note: 'no tap before the start', cook: cold, move: { boil: START_S - 1 } },
  { note: 'boiling corrected to cold: cold from now', cook: hot, move: { correct: { ...hot.choices, startMode: 'cold' }, now: START_S + 240 } },
  { note: 'cold corrected to boiling: no longer cold', cook: tapped, move: { correct: { ...tapped.choices, startMode: 'hot' }, now: START_S + 600 } },
  { note: 'cold kept cold, a heavier egg: cold since the start still', cook: tapped, move: { correct: { ...tapped.choices, mass_kg: 0.076 }, now: START_S + 600 } },
  { note: 'corrected back to cold: cold from the second correction', cook: corrected(tapped, { ...tapped.choices, startMode: 'hot' }, START_S + 600), move: { correct: tapped.choices, now: START_S + 610 } },
  { note: 'a correction after the cooling ended keeps every event', cook: cooled, move: { correct: { ...cooled.choices, level: 0.62, cooling: 'tap' }, now: START_S + 1100 } },
  { note: 'the start two minutes earlier', cook: cold, move: { start: START_S - 120, now: START_S + 200 } },
  { note: 'the start later, to now', cook: cold, move: { start: START_S + 200, now: START_S + 200 } },
  { note: 'the start after now: refused', cook: cold, move: { start: START_S + 200.5, now: START_S + 200 } },
  { note: 'the start to the boil tap itself', cook: tapped, move: { start: START_S + 532.5, now: START_S + 700 } },
  { note: 'the start after the boil tap: refused', cook: tapped, move: { start: START_S + 533, now: START_S + 700 } },
  { note: 'the start after a tap a correction to boiling left unread: refused', cook: corrected(tapped, { ...tapped.choices, startMode: 'hot' }, START_S + 600), move: { start: START_S + 540, now: START_S + 700 } },
  { note: 'the start after the pull was due: refused', cook: { ...hot, events: { ...hot.events, pulled: { due_s: START_S + 380, out_s: START_S + 400, by: 'timeout' } } }, move: { start: START_S + 390, now: START_S + 500 } },
  { note: 'the start earlier, after the cooling ended', cook: cooled, move: { start: START_S - 30, now: START_S + 1200 } },
  { note: 'a start that is not a time: refused', cook: cold, move: { start: Number.NaN, now: START_S + 200 } },
  { note: 'the boil tapped on a cook corrected to cold', cook: corrected(hot, { ...hot.choices, startMode: 'cold' }, START_S + 100), move: { boil: START_S + 500 } },
];

/** NaN as JSON has it: null. */
function timeJson(t: number): number | null {
  return Number.isFinite(t) ? t : null;
}

const moves = MOVES.map((m) => {
  const move = m.move;
  if ('boil' in move) return { note: m.note, cook: m.cook, move: { boil: move.boil }, after: withBoil(m.cook, move.boil) };
  if ('correct' in move) {
    return { note: m.note, cook: m.cook, move: { correct: move.correct, now: move.now }, after: corrected(m.cook, move.correct, move.now) };
  }
  return {
    note: m.note, cook: m.cook, move: { start: timeJson(move.start), now: move.now },
    latest_s: latestStart_s(m.cook, move.now), after: startCorrected(m.cook, move.start, move.now),
  };
});

/* ---------------------------------------------------------------- reads */

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

const READ_COOKS: { note: string; cook: RunningCook }[] = [
  { note: 'just started, cold', cook: cold },
  { note: 'hot, nudged, imperial, in the English of 1750', cook: { ...hot, units: 'imperial', lang: 'en-x-1750' } },
  { note: 'tapped', cook: tapped },
  { note: 'pulled by the cook', cook: pulled },
  { note: 'cooled', cook: cooled },
  { note: 'pulled when the grace ran out, on the counter', cook: { ...hot, choices: { ...hot.choices, cooling: 'counter' }, events: { boilAt_s: null, pulled: { due_s: START_S + 380, out_s: START_S + 400, by: 'timeout' }, cooledAt_s: null } } },
  { note: 'a measured egg and a measured room, no pans remembered', cook: { ...startCook(START_MS, { ...BASE_CHOICES, mass_kg: 0.0612, massFrom: 'girth', sizeTable: null, room_C: 23.5, eggFrom: 'room' }, 3, {}, 'metric', 'cs'), boilRemembered: false } },
  { note: 'a tap kept unread on a cook corrected to boiling', cook: corrected(tapped, { ...tapped.choices, startMode: 'hot' }, START_S + 600) },
  { note: 'corrected to cold after the start', cook: hotTapped },
];

const base = JSON.parse(JSON.stringify(pulled)) as unknown;
const REFUSED: { note: string; path: string[]; value: unknown }[] = [
  { note: 'no id', path: ['id_ms'], value: undefined },
  { note: 'an id that is not a number', path: ['id_ms'], value: '1791363600000' },
  { note: 'a start of zero', path: ['startedAt_s'], value: 0 },
  { note: 'no choices', path: ['choices'], value: undefined },
  { note: 'choices that are a list', path: ['choices'], value: [] },
  { note: 'no mass', path: ['choices', 'mass_kg'], value: undefined },
  { note: 'a mass of zero', path: ['choices', 'mass_kg'], value: 0 },
  { note: 'a mass that is true', path: ['choices', 'mass_kg'], value: true },
  { note: 'an unknown mass source', path: ['choices', 'massFrom'], value: 'guess' },
  { note: 'a class with no carton', path: ['choices', 'sizeTable'], value: null },
  { note: 'an unknown carton', path: ['choices', 'sizeTable'], value: 'uk' },
  { note: 'an unknown egg source', path: ['choices', 'eggFrom'], value: 'counter' },
  { note: 'no egg temperature of its own', path: ['choices', 'customStart_C'], value: null },
  { note: 'a room that is a string', path: ['choices', 'room_C'], value: '20' },
  { note: 'no room at all', path: ['choices', 'room_C'], value: undefined },
  { note: 'sous-vide', path: ['choices', 'startMode'], value: 'sous' },
  { note: 'an unknown burner', path: ['choices', 'afterBoil'], value: 'low' },
  { note: 'no burner', path: ['choices', 'afterBoil'], value: undefined },
  { note: 'an unknown cooling', path: ['choices', 'cooling'], value: 'fridge' },
  { note: 'no water', path: ['choices', 'waterLitres'], value: 0 },
  { note: 'no eggs', path: ['choices', 'eggCount'], value: 0 },
  { note: 'no altitude', path: ['choices', 'altitude_m'], value: null },
  { note: 'a level past hard', path: ['choices', 'level'], value: 1.01 },
  { note: 'a level under runny', path: ['choices', 'level'], value: -0.01 },
  { note: 'no events', path: ['events'], value: undefined },
  { note: 'a boil before the start', path: ['events', 'boilAt_s'], value: START_S - 1 },
  { note: 'a boil that is a string', path: ['events', 'boilAt_s'], value: 'soon' },
  { note: 'no boil field', path: ['events', 'boilAt_s'], value: undefined },
  { note: 'a pull that is a list', path: ['events', 'pulled'], value: [] },
  { note: 'a pull due before the start', path: ['events', 'pulled', 'due_s'], value: START_S - 5 },
  { note: 'out before it was due', path: ['events', 'pulled', 'out_s'], value: START_S + 851 },
  { note: 'pulled by nobody', path: ['events', 'pulled', 'by'], value: null },
  { note: 'no pull field', path: ['events', 'pulled'], value: undefined },
  { note: 'cooled without a pull', path: ['events', 'pulled'], value: null, },
  { note: 'cooled before the egg came out', path: ['events', 'cooledAt_s'], value: START_S + 858 },
  { note: 'a nudge that is not a number', path: ['nudge_s'], value: null },
  { note: 'pans that are a list', path: ['boilMemory'], value: [480] },
  { note: 'a pan that is not a time', path: ['boilMemory', '2.0'], value: 'slow' },
  { note: 'a pan of no time', path: ['boilMemory', '2.0'], value: 0 },
  { note: 'unknown units', path: ['units'], value: 'si' },
  { note: 'no language', path: ['lang'], value: '' },
  { note: 'remembered as a number', path: ['boilRemembered'], value: 1 },
  { note: 'no cold-since field', path: ['coldSince_s'], value: undefined },
  { note: 'cold since a string', path: ['coldSince_s'], value: 'start' },
];

const rawReads: { note: string; raw: unknown }[] = [
  ...READ_COOKS.map((r) => ({ note: r.note, raw: JSON.parse(JSON.stringify(r.cook)) as unknown })),
  { note: 'null', raw: null },
  { note: 'a list', raw: [base] },
  { note: 'a number', raw: 7 },
  ...REFUSED.map((r) => {
    // "Cooled without a pull" is the cooled cook's, with its pull taken away.
    const from = r.note === 'cooled without a pull' ? JSON.parse(JSON.stringify(cooled)) as unknown : base;
    return { note: r.note, raw: withAt(from, r.path, r.value) };
  }),
  { note: 'extra fields are ignored', raw: { ...(base as object), ticket: { old: true } } },
];
const reads = rawReads.map((r) => ({ note: r.note, raw: r.raw, cook: readRunningCook(r.raw) }));

export const runningFixture = {
  about: 'A running cook: its egg and pot, the moves the cook makes, and a stored cook read back. src/core/running.ts.',
  setups: setups,
  moves: moves,
  reads: reads,
};
