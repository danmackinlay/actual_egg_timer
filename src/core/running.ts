/**
 * A running cook: its start, its choices and what it observed
 * (design/one-screen.md section 3 and 4; DECISIONS.md 96 and 97).
 *
 * A cook is three things, and everything else is derived from them each time:
 *
 * - THE START: when the egg went in, a clock time the cook can correct ("I
 *   put them in two minutes ago"), never after now or after the first event.
 * - THE CHOICES: what the sentence, the slider and Settings' pot rows say
 *   (`CookChoices`), the same value the idle screen edits. Every change after
 *   the start is a CORRECTION ("it was always like this"): it replaces the
 *   choices, and the whole cook is planned again from its start.
 * - THE EVENTS: what the cook observed or the clock decided - the boil
 *   tapped, the pull, the end of the counted cooling - each a clock time,
 *   never re-derived, and kept even when a correction makes it unread, so
 *   that changing a setting back gives back the old plan exactly.
 *
 * What is derived (the ramp in force, the solve, the decided time, the
 * deadlines `phaseAt` reads, the cooling, how sure, the record's facts) is the
 * plan, `replan`'s. Nothing derived is ever stored as truth.
 *
 * Times are epoch seconds, as `Deadlines` has them, except the record's id,
 * which is the web's milliseconds. Nothing here reads a clock: the time is
 * handed in. Pure, like the rest of `src/core/`, and `Running.swift` is
 * held to it by `fixtures/running.json`.
 */

import { Egg, SizeTable, eggFromMass } from './geometry.js';
import { CookSetup, Cooling, HeatAfterBoil, StartMode } from './protocol.js';
import { boilingPointAtAltitude } from './thermo.js';
import { BoilMemory, ambientFor, hasBoilMemory, startTempPreset_C } from './policy.js';
import { EggFrom, MassFrom, PulledBy, Units } from './record.js';

/* ------------------------------------------------------------- the types */

/** The cook as chosen: what the sentence, the slider and Settings' pot rows
 *  say, in SI. The idle screen edits one (from the settings); a running cook
 *  holds its own, and a correction replaces it. */
export interface CookChoices {
  /** The egg's whole mass, kg: the class's, or the one weighed or measured.
   *  The solver's egg is made from it (`eggFromMass`) whatever it came from. */
  mass_kg: number;
  massFrom: MassFrom;
  /** The carton, for a class; null otherwise. */
  sizeTable: SizeTable | null;
  eggFrom: EggFrom;
  /** The egg's temperature, read only when `eggFrom` is 'custom'. */
  customStart_C: number;
  /** The room as measured, while it counts (`roomInUse`: the probe on), or
   *  null to assume one. */
  room_C: number | null;
  /** Sous-vide starts no cook, so it is not here. */
  startMode: StartMode;
  afterBoil: HeatAfterBoil;
  cooling: Cooling;
  waterLitres: number;
  eggCount: number;
  altitude_m: number;
  /** The yolk wanted, [0, 1]: the slider. */
  level: number;
}

/** The pull: when it was due (the alarm), when the egg came out, and who
 *  said so - the cook's tap, or the grace running out. */
export interface Pulled {
  due_s: number;
  out_s: number;
  by: PulledBy;
}

/** What was observed, as clock times. Never re-derived; kept when a
 *  correction makes one unread. */
export interface CookEvents {
  /** Full rolling boil, tapped. */
  boilAt_s: number | null;
  pulled: Pulled | null;
  /** The counted cooling ended. Never written on the counter, where nothing
   *  is counted. */
  cooledAt_s: number | null;
}

/** A cook with nothing observed yet. */
export const NO_EVENTS: CookEvents = { boilAt_s: null, pulled: null, cooledAt_s: null };

export interface RunningCook {
  /** When Start was pressed, whole ms since 1970: the record's id on the
   *  web. Never corrected, so a cook logged from two tabs is one egg. */
  id_ms: number;
  /** When the egg went in: correctable, never after now or the first event
   *  (`startCorrected`). */
  startedAt_s: number;
  choices: CookChoices;
  events: CookEvents;
  /** The nudge this cook drew (E8): 0 when sharing was off at the start. A
   *  plan takes it where a time is chosen (`appliedNudge`). */
  nudge_s: number;
  /** The pans as remembered at the start, so a corrected water reads the
   *  same memory every time. */
  boilMemory: BoilMemory;
  /** What the cook was reading at the start, for the record. */
  units: Units;
  lang: string;
  /** Whether a measured pan was on file at the start: what a hot start,
   *  which never times its own pan, cooked on. */
  boilRemembered: boolean;
  /** Since when the choices have said a cold start, a clock time: the start
   *  for a cook begun cold, the moment of the correction for one corrected
   *  to cold, and null while they say boiling. A boil tapped on a cook that
   *  was told it was cold only after the water could have boiled is used for
   *  the cook and not remembered (`boilToRemember`, DECISIONS.md 97). */
  coldSince_s: number | null;
}

/* ----------------------------------------------------- the egg and the pot */

/** The solver's egg and pot. */
export interface CookPot {
  egg: Egg;
  setup: CookSetup;
}

/** The egg's temperature as it goes in, C: a preset's (`startTempPreset_C`,
 *  which a measured room moves), or the cook's own number. */
export function eggStartOf(ch: CookChoices): number {
  if (ch.eggFrom === 'custom') return ch.customStart_C;
  return startTempPreset_C(ch.eggFrom, ch.room_C);
}

/**
 * The egg and the pot the solver is told, for these choices and a time to a
 * rolling boil: the one assembly of both, for the idle screen and the running
 * cook alike (once the web's `buildSetup`/`currentEgg` and iOS's
 * `Planner.setup`/`egg`). The setup's fields are in the order the web's
 * decision cache has always keyed them by.
 */
export function cookSetupOf(ch: CookChoices, timeToBoil_s: number): CookPot {
  const eggStart = eggStartOf(ch);
  return {
    egg: eggFromMass(ch.mass_kg),
    setup: {
      startMode: ch.startMode,
      afterBoil: ch.afterBoil,
      eggStart_C: eggStart,
      ambient_C: ambientFor(eggStart, ch.room_C),
      boiling_C: boilingPointAtAltitude(ch.altitude_m),
      timeToBoil_s: timeToBoil_s,
      cooling: ch.cooling,
      waterLitres: ch.waterLitres,
      eggCount: ch.eggCount,
    },
  };
}

/* ------------------------------------------------------- the transitions */

/** A cook started at `now_ms` (epoch ms) with these choices, the nudge it
 *  drew (0 with sharing off) and the pans as remembered now. */
export function startCook(
  now_ms: number, choices: CookChoices, nudge_s: number, boilMemory: BoilMemory, units: Units, lang: string,
): RunningCook {
  const start = now_ms / 1000;
  return {
    id_ms: Math.round(now_ms),
    startedAt_s: start,
    choices: choices,
    events: NO_EVENTS,
    nudge_s: nudge_s,
    boilMemory: boilMemory,
    units: units,
    lang: lang,
    boilRemembered: hasBoilMemory(boilMemory),
    coldSince_s: choices.startMode === 'cold' ? start : null,
  };
}

/** Full rolling boil, tapped at `now_s`: taken only on a cold start still
 *  heating - no tap yet, no pull - and not before the start. Otherwise the
 *  cook as it was. */
export function withBoil(cook: RunningCook, now_s: number): RunningCook {
  const e = cook.events;
  if (cook.choices.startMode !== 'cold' || e.boilAt_s !== null || e.pulled !== null) return cook;
  if (!(now_s >= cook.startedAt_s)) return cook;
  return { ...cook, events: { ...e, boilAt_s: now_s } };
}

/** A correction at `now_s`: the choices replaced, as if they had always been
 *  these. The start and the events are kept. */
export function corrected(cook: RunningCook, choices: CookChoices, now_s: number): RunningCook {
  let since: number | null = null;
  if (choices.startMode === 'cold') {
    since = cook.choices.startMode === 'cold' && cook.coldSince_s !== null ? cook.coldSince_s : now_s;
  }
  return { ...cook, choices: choices, coldSince_s: since };
}

/** The latest the start can be corrected to at `now_s`: now, or the first
 *  event, whichever is sooner. An event the choices do not read (a boil tap
 *  on a cook corrected to boiling) still counts: changing back reads it. */
export function latestStart_s(cook: RunningCook, now_s: number): number {
  let latest = now_s;
  const e = cook.events;
  if (e.boilAt_s !== null && e.boilAt_s < latest) latest = e.boilAt_s;
  if (e.pulled !== null && e.pulled.due_s < latest) latest = e.pulled.due_s;
  if (e.cooledAt_s !== null && e.cooledAt_s < latest) latest = e.cooledAt_s;
  return latest;
}

/** The start corrected to `startedAt_s` at `now_s`, or null: refused when it
 *  is later than `latestStart_s`, or not a time. */
export function startCorrected(cook: RunningCook, startedAt_s: number, now_s: number): RunningCook | null {
  if (!Number.isFinite(startedAt_s) || startedAt_s > latestStart_s(cook, now_s)) return null;
  return { ...cook, startedAt_s: startedAt_s };
}

/* ------------------------------------------------------- the stored cook */

/** A finite number. */
function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** The choices, or null if any field is missing or out of kind. */
function readChoices(raw: unknown): CookChoices | null {
  if (!isObject(raw)) return null;
  const mass = raw['mass_kg'];
  const massFrom = raw['massFrom'];
  const table = raw['sizeTable'];
  const eggFrom = raw['eggFrom'];
  const custom = raw['customStart_C'];
  const room = raw['room_C'];
  const start = raw['startMode'];
  const after = raw['afterBoil'];
  const cooling = raw['cooling'];
  const water = raw['waterLitres'];
  const count = raw['eggCount'];
  const altitude = raw['altitude_m'];
  const level = raw['level'];
  if (!isNumber(mass) || !(mass > 0)) return null;
  if (massFrom !== 'class' && massFrom !== 'scale' && massFrom !== 'girth' && massFrom !== 'width') return null;
  if (massFrom === 'class' ? table !== 'eu' && table !== 'us' : table !== null) return null;
  if (eggFrom !== 'fridge' && eggFrom !== 'room' && eggFrom !== 'custom') return null;
  if (!isNumber(custom)) return null;
  if (room !== null && !isNumber(room)) return null;
  if (start !== 'cold' && start !== 'hot') return null;
  if (after !== 'hold' && after !== 'off') return null;
  if (cooling !== 'ice' && cooling !== 'tap' && cooling !== 'counter') return null;
  if (!isNumber(water) || !(water > 0)) return null;
  if (!isNumber(count) || !(count > 0)) return null;
  if (!isNumber(altitude)) return null;
  if (!isNumber(level) || level < 0 || level > 1) return null;
  return {
    mass_kg: mass, massFrom: massFrom, sizeTable: massFrom === 'class' ? table as SizeTable : null,
    eggFrom: eggFrom, customStart_C: custom, room_C: room, startMode: start, afterBoil: after,
    cooling: cooling, waterLitres: water, eggCount: count, altitude_m: altitude, level: level,
  };
}

/** The events, or null if any is damaged, or before the start, or out of
 *  order: a pull out before it was due, a cooling ended without a pull or
 *  before the egg came out. */
function readEvents(raw: unknown, start_s: number): CookEvents | null {
  if (!isObject(raw)) return null;
  const boil = raw['boilAt_s'];
  const pulledRaw = raw['pulled'];
  const cooled = raw['cooledAt_s'];
  if (boil !== null && (!isNumber(boil) || boil < start_s)) return null;
  let pulled: Pulled | null = null;
  if (pulledRaw !== null) {
    if (!isObject(pulledRaw)) return null;
    const due = pulledRaw['due_s'];
    const out = pulledRaw['out_s'];
    const by = pulledRaw['by'];
    if (!isNumber(due) || due < start_s || !isNumber(out) || out < due) return null;
    if (by !== 'cook' && by !== 'timeout') return null;
    pulled = { due_s: due, out_s: out, by: by };
  }
  if (cooled !== null && (!isNumber(cooled) || pulled === null || cooled < pulled.out_s)) return null;
  return { boilAt_s: boil, pulled: pulled, cooledAt_s: cooled };
}

/** The pans as remembered, or null if any is not a time. */
function readBoilMemory(raw: unknown): BoilMemory | null {
  if (!isObject(raw)) return null;
  const out: BoilMemory = {};
  for (const key of Object.keys(raw)) {
    const seconds = raw[key];
    if (!isNumber(seconds) || !(seconds > 0)) return null;
    out[key] = seconds;
  }
  return out;
}

/**
 * A stored cook, read defensively: whole, or null. A cook is what the
 * calibration learns from and what the alarms ring for, so a shape this build
 * cannot read is reported, not guessed at or patched from the controls; the
 * app keeps it aside, as stored (DECISIONS.md 81). Extra fields are ignored.
 */
export function readRunningCook(raw: unknown): RunningCook | null {
  if (!isObject(raw)) return null;
  const id = raw['id_ms'];
  const start = raw['startedAt_s'];
  const nudge = raw['nudge_s'];
  const units = raw['units'];
  const lang = raw['lang'];
  const remembered = raw['boilRemembered'];
  const since = raw['coldSince_s'];
  if (!isNumber(id) || !(id > 0)) return null;
  if (!isNumber(start) || !(start > 0)) return null;
  const choices = readChoices(raw['choices']);
  if (choices === null) return null;
  const events = readEvents(raw['events'], start);
  if (events === null) return null;
  if (!isNumber(nudge)) return null;
  const memory = readBoilMemory(raw['boilMemory']);
  if (memory === null) return null;
  if (units !== 'metric' && units !== 'imperial') return null;
  if (typeof lang !== 'string' || lang === '') return null;
  if (typeof remembered !== 'boolean') return null;
  if (since !== null && !isNumber(since)) return null;
  return {
    id_ms: id, startedAt_s: start, choices: choices, events: events, nudge_s: nudge, boilMemory: memory,
    units: units, lang: lang, boilRemembered: remembered, coldSince_s: since,
  };
}
