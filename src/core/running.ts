/**
 * A running cook: its start, its choices and what it observed
 * (design/one-screen.md section 3 and 4; DECISIONS.md 96, 97 and 98).
 *
 * A cook is three things, and everything else is derived from them each time:
 *
 * - THE START: when the egg went in, a clock time the cook can correct ("I
 *   put them in two minutes ago"), never after now or after the first event,
 *   nor two hours before Start was pressed.
 * - THE CHOICES: what the sentence, the slider and Settings' pot rows say
 *   (`CookChoices`), the same value the idle screen edits. Every change after
 *   the start is a CORRECTION ("it was always like this"): it replaces the
 *   choices, and the whole cook is planned again from its start.
 * - THE EVENTS: what the cook observed or the clock decided - the boil
 *   tapped, the pull ringing, the pull, the end of the counted cooling - each
 *   a clock time, never re-derived, and kept even when a correction makes it
 *   unread, so that changing a setting back gives back the old plan exactly.
 *   A pull the clock decided (the grace ran out) stays open to correction
 *   until the cook says it stands; the pull ringing holds only until the cook
 *   tells the plan something new.
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
import {
  BoilMemory, Deadlines, LIMITS, PULL_GRACE_SECONDS, SLOW_HOB_EVERY_S, SLOW_HOB_EXTRA_S, SLOW_HOB_WHEN_LEFT_S,
  ambientFor, coolingSecondsFor, estimateTimeToBoil, hasBoilMemory, phaseAt, probeMomentFor, startTempPreset_C,
} from './policy.js';
import { ModelParams, Solution, logYolkTarget } from './solve.js';
import {
  DecisionInputs, appliedNudge, carriedSolution, decisionApplies, decisionInputs, solutionAt,
} from './decide.js';
import { DoseGrid } from './doseGrid.js';
import { DecidedAnswer, LevelAnswer, OddsProfile, answerAt, decideAnswer, lowOddsAt } from './reach.js';
import { CertaintyReading, certaintyAt } from './certainty.js';
import { predictOutcome } from './outcome.js';
import { WhiteReport, YolkWord } from './infer.js';
import {
  AppName, Calibration, CookFacts, EggFrom, Forecast, MassFrom, ProbeReading, PulledBy, Units, calibrationDoneness,
  calibrationParams, forecastOf,
} from './record.js';

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
  /** Whether the egg is known to have come out then. A cook's tap is an
   *  observation, written true. A pull by `timeout` is the clock's
   *  assumption, not something the cook saw, so it stays open to correction
   *  (`askIfStillIn`) until the cook says it stands (`pullStands`). */
  confirmed: boolean;
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
  /** The pull rang: the plan's pull, the first time the clock passed it with
   *  the egg still in (`eventsDue`). A plan the cook did not cause - a
   *  surface landing, an egg folded in another tab - keeps it, so a pull
   *  already due never moves or rings twice. Anything the cook tells the plan
   *  after it (a correction, the start, `stillIn`) clears it. */
  rangAt_s: number | null;
}

/** A cook with nothing observed yet. */
export const NO_EVENTS: CookEvents = { boilAt_s: null, pulled: null, cooledAt_s: null, rangAt_s: null };

export interface RunningCook {
  /** When Start was pressed, whole ms since 1970: the record's id on the
   *  web. Never corrected, so a cook logged from two tabs is one egg. */
  id_ms: number;
  /** When the egg went in: correctable, never after now or the first event,
   *  nor two hours before Start was pressed (`startCorrected`). */
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
  /** The first moment the choices said a boiling start, a clock time: the
   *  start for a cook begun hot, the first correction to boiling for one
   *  begun cold, and null if they never have. A tap made before it was made
   *  in the cold the cook began with, so a stray cold -> hot -> cold after it
   *  does not stop it being remembered (review 2.2). */
  firstHotAt_s: number | null;
  /** When the choices or the start were last corrected, a clock time; null
   *  until they are. Nothing observed before it said the egg was out, so a
   *  plan never puts the pull before it (`replan`): a correction that makes
   *  the egg overdue makes the pull then, and a plan made again later - a
   *  reload, a surface landing - puts it there again, not at its own now. */
  correctedAt_s: number | null;
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
    firstHotAt_s: choices.startMode === 'hot' ? start : null,
    correctedAt_s: null,
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
 *  these. The start and the events are kept, but for a pull that rang: the
 *  plan is made afresh from what the cook says now. After the pull the yolk
 *  wanted is not corrected: it was not a mistake, so the record keeps the
 *  level the egg was pulled at, and the slider only previews (DECISIONS.md
 *  98). */
export function corrected(cook: RunningCook, choices: CookChoices, now_s: number): RunningCook {
  let since: number | null = null;
  if (choices.startMode === 'cold') {
    since = cook.choices.startMode === 'cold' && cook.coldSince_s !== null ? cook.coldSince_s : now_s;
  }
  const firstHot = cook.firstHotAt_s === null && choices.startMode === 'hot' ? now_s : cook.firstHotAt_s;
  const next = cook.events.pulled === null ? choices : { ...choices, level: cook.choices.level };
  return {
    ...cook, choices: next, events: { ...cook.events, rangAt_s: null }, coldSince_s: since, firstHotAt_s: firstHot,
    correctedAt_s: now_s,
  };
}

/** The latest the start can be corrected to at `now_s`: now, or the first
 *  event, whichever is sooner. An event the choices do not read (a boil tap
 *  on a cook corrected to boiling) still counts: changing back reads it, and
 *  would read a boil before the egg went in. So a cook who pressed Start as
 *  the pan went on, tapped the boil, put the eggs in then and corrects to
 *  boiling cannot move the start past that tap, and the start's panel has
 *  to say so with the limit (design/one-screen.md section 3). */
export function latestStart_s(cook: RunningCook, now_s: number): number {
  let latest = now_s;
  const e = cook.events;
  if (e.boilAt_s !== null && e.boilAt_s < latest) latest = e.boilAt_s;
  if (e.pulled !== null && e.pulled.due_s < latest) latest = e.pulled.due_s;
  if (e.cooledAt_s !== null && e.cooledAt_s < latest) latest = e.cooledAt_s;
  return latest;
}

/** The earliest the start can be corrected to: the most the app takes for a
 *  time to boil (`LIMITS.timeToBoil_s`, two hours) before Start was pressed
 *  (`id_ms`). No egg boils that long, and a cold start that has heated that
 *  long is abandoned (`tooOldAt_s`); it also keeps a typing slip - a start
 *  in 1970 - out of the plan. Fixed at the press, so the limit the start's
 *  panel shows does not move with the clock. */
export function earliestStart_s(cook: RunningCook): number {
  return cook.id_ms / 1000 - LIMITS.timeToBoil_s.hi;
}

/** The start corrected to `startedAt_s` at `now_s`, or null: refused when it
 *  is later than `latestStart_s`, earlier than `earliestStart_s`, or not a
 *  time. */
export function startCorrected(cook: RunningCook, startedAt_s: number, now_s: number): RunningCook | null {
  if (!Number.isFinite(startedAt_s) || startedAt_s > latestStart_s(cook, now_s)) return null;
  if (startedAt_s < earliestStart_s(cook)) return null;
  return { ...cook, startedAt_s: startedAt_s, events: { ...cook.events, rangAt_s: null }, correctedAt_s: now_s };
}

/** The cook's answer when a plan asks (`askIfStillIn`), at `now_s`: the egg
 *  is still in the water. The pull the clock assumed is dropped, with the
 *  cooling it began, and the cook planned again as told now: a pull already
 *  past is now, and rings. Otherwise - no pull the clock assumed, or one the
 *  cook said stands - the cook as it was. */
export function stillIn(cook: RunningCook, now_s: number): RunningCook {
  const p = cook.events.pulled;
  if (p === null || p.by !== 'timeout' || p.confirmed) return cook;
  return { ...cook, events: { ...cook.events, pulled: null, cooledAt_s: null, rangAt_s: null }, correctedAt_s: now_s };
}

/** The other answer: the egg came out when the clock assumed. The pull
 *  stands, the correction applies to the record, and the plan does not ask
 *  again. */
export function pullStands(cook: RunningCook): RunningCook {
  const p = cook.events.pulled;
  if (p === null || p.confirmed) return cook;
  return { ...cook, events: { ...cook.events, pulled: { ...p, confirmed: true } } };
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
 *  order: a pull out before it was due, a cook's own tap unconfirmed, a
 *  cooling ended without a pull or before the egg came out, a pull that rang
 *  before the start. */
function readEvents(raw: unknown, start_s: number): CookEvents | null {
  if (!isObject(raw)) return null;
  const boil = raw['boilAt_s'];
  const pulledRaw = raw['pulled'];
  const cooled = raw['cooledAt_s'];
  const rang = raw['rangAt_s'];
  if (boil !== null && (!isNumber(boil) || boil < start_s)) return null;
  let pulled: Pulled | null = null;
  if (pulledRaw !== null) {
    if (!isObject(pulledRaw)) return null;
    const due = pulledRaw['due_s'];
    const out = pulledRaw['out_s'];
    const by = pulledRaw['by'];
    const confirmed = pulledRaw['confirmed'];
    if (!isNumber(due) || due < start_s || !isNumber(out) || out < due) return null;
    if (by !== 'cook' && by !== 'timeout') return null;
    if (typeof confirmed !== 'boolean' || (by === 'cook' && !confirmed)) return null;
    pulled = { due_s: due, out_s: out, by: by, confirmed: confirmed };
  }
  if (cooled !== null && (!isNumber(cooled) || pulled === null || cooled < pulled.out_s)) return null;
  if (rang !== null && (!isNumber(rang) || rang < start_s)) return null;
  return { boilAt_s: boil, pulled: pulled, cooledAt_s: cooled, rangAt_s: rang };
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
  const firstHot = raw['firstHotAt_s'];
  const correctedAt = raw['correctedAt_s'];
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
  if (firstHot !== null && !isNumber(firstHot)) return null;
  if (correctedAt !== null && (!isNumber(correctedAt) || correctedAt < start)) return null;
  return {
    id_ms: id, startedAt_s: start, choices: choices, events: events, nudge_s: nudge, boilMemory: memory,
    units: units, lang: lang, boilRemembered: remembered, coldSince_s: since, firstHotAt_s: firstHot,
    correctedAt_s: correctedAt,
  };
}

/* ---------------------------------------------------------------- the plan */

/** A pot's decision surface, as the app built it off the main thread, with
 *  the inputs it was built for and the pot's odds profile if that is in. */
export interface CookSurface {
  inputs: DecisionInputs;
  grid: DoseGrid;
  profile: OddsProfile | null;
}

/** Everything derived from a cook. Never stored as truth. */
export interface CookPlan {
  egg: Egg;
  /** The pot, with the time to boil in force: the tap, the remembered one,
   *  or the slow hob's. */
  setup: CookSetup;
  /** A cold start still heating: the time to boil is a guess. */
  provisional: boolean;
  /** The guess lengthened by the slow hob's rule: it moves with the clock,
   *  so its pot asks for no surface, and the time is the carried one. */
  lengthened: boolean;
  /** The inputs whose surface this plan reads, and so the one the app asks
   *  for when it is not in; null while lengthened. */
  inputs: DecisionInputs | null;
  /** The mean solve at the yolk wanted, its verdict, the level it is for (the
   *  one wanted, or the one it snapped to), and the warning there. */
  answer: LevelAnswer;
  /** The level the cook runs at: `answer.level`. */
  level: number;
  /** The solve, read at `cookTime_s`. */
  solution: Solution;
  /** The answer decided on this pot's surface; null until it is in. */
  decided: DecidedAnswer | null;
  /** How far the time leans from the mean solve's, s, and the nudge in it:
   *  the decided ones, or, until the surface is in, the lean carried
   *  (`leanHint_s`) and the cook's nudge, where a time is chosen. */
  lean_s: number;
  nudge_s: number;
  /** Egg in to the pull, s: the pull's due time once it has happened, or
   *  the pull that rang; else the plan's, but never before the last thing
   *  the cook told it (the last correction or the boil tap). */
  cookTime_s: number;
  /** The plan's own pull had passed when the cook last told it something,
   *  so the pull is then. */
  overdue: boolean;
  /** The pull is one the clock assumed (the grace ran out), and a correction
   *  since would, without it, put the pull later, or back to heating: the app
   *  asks whether the egg is still in the water, and answers with `stillIn`
   *  or `pullStands`. Until it is answered the pull stands. */
  askIfStillIn: boolean;
  /** The counted cooling, s from the egg out to its end. */
  cool_s: number;
  probeMoment: boolean;
  /** What `phaseAt` reads. */
  deadlines: Deadlines;
  /** While provisional, when the slow hob's rule next lengthens the guess:
   *  the app plans again then. Null otherwise, and once the guess is the
   *  most the app takes for a time to boil. */
  slowHobAt_s: number | null;
  /** While provisional, where the slow hob's rule got to, for the next plan
   *  to start from (`replan`'s `hint`); null otherwise. */
  slowHob: SlowHobHint | null;
  /** When the cook is too old to pick back up (`cookTooOld`): an hour past
   *  its end (the cooling's, or the out's on the counter), or, still
   *  heating, when the pan has heated for the most the app takes for a time
   *  to boil, which abandons it. */
  tooOldAt_s: number;
  /** How sure, at the cook time, and what the record keeps as said: both
   *  need this pot's surface, and are null until it is in. */
  certainty: CertaintyReading | null;
  forecast: Forecast | null;
}

/**
 * Where the slow hob's rule got to in one plan, and what it was worked out
 * under (review 2.1): handed to the next plan (`replan`'s `hint`), which
 * starts the rule there instead of replaying every lengthening from the
 * remembered time to boil. The rule reads nothing but the start, the
 * choices, the remembered time it starts from, the lean carried with the
 * nudge, and the calibration's parameters and white target, so the hint
 * keeps exactly those, and a plan takes it only when every one is the same
 * to the bit (`slowHobHintFits`); otherwise it is ignored, never trusted.
 *
 * The place it keeps is the last lengthening that did not creep: one that
 * fired because the pull would come within SLOW_HOB_WHEN_LEFT_S. Such a
 * lengthening does not depend on the clock, only on having heated past it,
 * so the rule worked from the start at any later moment passes through the
 * same place, the same doubles, and a plan started there is the plan made
 * from the start. A creeping step lands where the clock is, so it is never
 * kept; it is always the rule's last step in a plan, and the next plan
 * takes it again from the place before it.
 */
export interface SlowHobHint {
  startedAt_s: number;
  choices: CookChoices;
  /** The remembered time to boil the rule starts from, s. */
  fromRamp_s: number;
  /** The lean carried and the cook's nudge, s, as `carriedSolution` takes
   *  them. */
  carry_s: number;
  params: ModelParams;
  /** The white's target, `calibrationDoneness`'s at any level. */
  whiteDose_min: number;
  /** The lengthenings to the place kept, its time heated (0 for none) and
   *  the guess there. */
  steps: number;
  last_s: number;
  ramp_s: number;
  /** The carried cook time at `ramp_s`, s, so the next plan need not solve
   *  for it; null when the guess was already the most and no plan needed it. */
  carried_s: number | null;
}

/** Whether two cooks' choices are the same, every field to the bit. */
export function sameChoices(a: CookChoices, b: CookChoices): boolean {
  return a.mass_kg === b.mass_kg && a.massFrom === b.massFrom && a.sizeTable === b.sizeTable
    && a.eggFrom === b.eggFrom && a.customStart_C === b.customStart_C && a.room_C === b.room_C
    && a.startMode === b.startMode && a.afterBoil === b.afterBoil && a.cooling === b.cooling
    && a.waterLitres === b.waterLitres && a.eggCount === b.eggCount && a.altitude_m === b.altitude_m
    && a.level === b.level;
}

/**
 * Whether the slow hob's `hint` may be taken for `cook` under calibration `c`
 * with `leanHint_s`, at `now_s`: the cook still heating on a guess (a cold
 * start, no tap, no pull); the same start and choices, to the bit; the same
 * remembered time for its water; the same lean and nudge; the calibration's
 * parameters and white target the same; and the clock past the place kept,
 * so that the rule from the start would get there too. Anything else - a
 * correction, a corrected start, the boil tapped, an egg folded, another
 * lean - and the plan works the rule from the start, as with no hint.
 */
export function slowHobHintFits(
  hint: SlowHobHint, cook: RunningCook, c: Calibration, leanHint_s: number, now_s: number,
): boolean {
  const ch = cook.choices;
  const e = cook.events;
  if (ch.startMode !== 'cold' || e.boilAt_s !== null || e.pulled !== null) return false;
  if (hint.startedAt_s !== cook.startedAt_s || !sameChoices(hint.choices, ch)) return false;
  if (hint.fromRamp_s !== estimateTimeToBoil(cook.boilMemory, ch.waterLitres)) return false;
  if (hint.carry_s !== leanHint_s + cook.nudge_s) return false;
  const p = calibrationParams(c);
  if (hint.params.alpha_m2s !== p.alpha_m2s || hint.params.tauAirScale !== p.tauAirScale) return false;
  if (hint.whiteDose_min !== calibrationDoneness(c, 1.0).whiteDose_min) return false;
  return hint.steps === 0 || now_s - cook.startedAt_s > hint.last_s;
}

/** Whether two decision surfaces' inputs are the same pot, egg and
 *  posterior: every number equal. */
export function sameDecisionInputs(a: DecisionInputs, b: DecisionInputs): boolean {
  const ea = a.egg;
  const eb = b.egg;
  const sa = a.setup;
  const sb = b.setup;
  return ea.radius_m === eb.radius_m && ea.minorDiameter_m === eb.minorDiameter_m
    && ea.mass_kg === eb.mass_kg && ea.volume_m3 === eb.volume_m3
    && sa.startMode === sb.startMode && (sa.afterBoil ?? 'hold') === (sb.afterBoil ?? 'hold')
    && sa.eggStart_C === sb.eggStart_C && sa.ambient_C === sb.ambient_C && sa.boiling_C === sb.boiling_C
    && sa.timeToBoil_s === sb.timeToBoil_s && sa.cooling === sb.cooling
    && sa.waterLitres === sb.waterLitres && sa.eggCount === sb.eggCount
    && a.params.alpha_m2s === b.params.alpha_m2s && a.params.tauAirScale === b.params.tauAirScale
    && a.whiteDose_min === b.whiteDose_min;
}

/** The most lengthenings one plan works through, so a plan's cost is
 *  bounded however long the pan has heated. A hob would have to be hours
 *  slow to reach it. */
export const SLOW_HOB_MAX_STEPS = 100;

/** How long past its end a cook is still worth picking back up, s: an egg
 *  an hour past its cooling has been eaten or thrown out. Today's web
 *  `RESTORE_WINDOW_MS` and iOS's bound, now one rule (`cookTooOld`). */
export const RESTORE_WINDOW_S = 3600;

/** Whether a stored cook is too old to pick back up at `now_s`, from its
 *  plan: both apps drop it then, rather than restore a timer for an egg
 *  that is no longer on the hob or the counter. */
export function cookTooOld(plan: CookPlan, now_s: number): boolean {
  return now_s > plan.tooOldAt_s;
}

/**
 * The id of the egg still open to correction (design/one-screen.md section
 * 4, review 2.1): the stored running cook's, `cook` with its `plan`, until
 * it is too old to pick back up; null when there is none. Every other egg
 * in the log is final, whichever tab asks, and may be sent; this one becomes
 * final at Start again, which stores another cook, or when it is too old.
 */
export function openEggId(cook: RunningCook | null, plan: CookPlan | null, now_s: number): number | null {
  if (cook === null || plan === null || cookTooOld(plan, now_s)) return null;
  return cook.id_ms;
}

/**
 * The plan for a cook at `now_s`, under calibration `c`. `now_s` is read by
 * the slow hob's rule alone.
 *
 * THE TIME TO BOIL. On a cold start, the tap if there is one: the measured
 * ramp - but not a tap after a correction from boiling to cold made later
 * than this water's remembered time to boil, which may have come long after
 * the water boiled unseen: that cook runs on the remembered time, and on the
 * tap only when no pan was remembered (DECISIONS.md 98). Otherwise the
 * remembered one for the water (the memory as it was at
 * the start), and while the cook is still heating, the SLOW HOB'S RULE, as a
 * function of how long it has heated: whenever the pull would come within
 * SLOW_HOB_WHEN_LEFT_S, and SLOW_HOB_EVERY_S after the last lengthening (the
 * start counting as one), the guess becomes the time heated so far plus
 * SLOW_HOB_EXTRA_S. That is the revision both apps made on their tick, made
 * here from the start each time, so a plan is a function of the cook and the
 * clock alone. Where a lengthening would fire again at once - the egg would
 * be done before the water boils - the guess creeps with the clock in steps of
 * SLOW_HOB_EVERY_S, as the tick's would, without a solve per step. It stops
 * at the most the app takes for a time to boil (`LIMITS.timeToBoil_s`, two
 * hours): a pan still not boiling then is a cook abandoned (`tooOldAt_s`),
 * not one to plan again every few seconds for ever (review 1.3). Worked from
 * the start, a creeping plan replayed every lengthening, eight solves from
 * fifteen minutes on (review 2.1): `hint`, the last plan's `slowHob`, starts
 * the rule where that plan got to when it fits this cook, lean and
 * calibration (`slowHobHintFits`), and the plan is the same, to the bit, as
 * the one worked from the start. A hot start
 * never times its pan: the remembered time is carried for the record only.
 * A pull ends the heating, read or not.
 *
 * THE TIME. The mean solve at the yolk wanted (`answerAt`, snapping out of
 * the stripes as at setup), then, if `surface` is this pot's, the time
 * decided on it (`decideAnswer`), with the cook's nudge; until it is in, the
 * mean solve leaned by `leanHint_s` and nudged (`carriedSolution`), which is
 * the time the app was showing. A pot whose guess the slow hob lengthened
 * moves with the clock and is never decided: the app would build a surface
 * every few minutes for a guess.
 *
 * THE PULL. Once pulled, the pull's due time: corrections then change only
 * what that time did to the egg. Before, the plan's time, but never before
 * the cook last told it something - the last correction, or the boil tap -
 * since nothing before that said the egg was out: a correction that puts the
 * pull in the past makes it the moment of the correction, and `overdue` says
 * so. That moment is stored, not `now_s`, so a plan made again later (a
 * reload, a surface landing) rings for the same pull, and a plan made after
 * an ordinary pull's grace ran out finds it as it was. Once the pull has rung
 * (`rangAt_s`) it is held there until the cook tells the plan something new,
 * so a plan the cook did not cause - a surface landing - never moves a pull
 * already due. While provisional the deadline is a guess and is not held;
 * `phaseAt` reads Heating whatever it says.
 *
 * A PULL THE CLOCK ASSUMED. A pull by `timeout` is not something the cook saw.
 * A correction since it that would, without it, pull after the correction
 * itself (or heat again) leaves the pull standing and sets `askIfStillIn`: the app asks, and the
 * answer is `stillIn` or `pullStands`. A cook's own tap is never asked about.
 *
 * THE COOLING. To the yolk's peak for the cook time that ran
 * (`coolingSecondsFor`), from the egg out - the cook's tap, or the grace
 * running out - and once ended, as it ran. A correction whose counted end has
 * already passed is Done at once, with the counted time: the cooling is not
 * stretched to the correction.
 *
 * HOW SURE, AND WHAT THE RECORD SAYS WAS SAID: `certaintyAt` and the outcome
 * at the cook time, on this pot's surface.
 */
export function replan(
  cook: RunningCook, c: Calibration, surface: CookSurface | null, leanHint_s: number, now_s: number,
  hint: SlowHobHint | null = null,
): CookPlan {
  const ch = cook.choices;
  const e = cook.events;
  const start = cook.startedAt_s;
  const pulled = e.pulled;
  const cold = ch.startMode === 'cold';
  const boilAt = e.boilAt_s;
  const tapped = cold && boilAt !== null;
  const provisional = cold && boilAt === null && pulled === null;
  const params = calibrationParams(c);
  const carry = leanHint_s + cook.nudge_s;

  const measured = tapped && !(cook.boilRemembered && tappedAfterLateCold(cook));
  let ramp = measured ? boilAt - start : estimateTimeToBoil(cook.boilMemory, ch.waterLitres);
  const fromRamp = ramp;
  // The slow hob's hint, taken only when it fits (`slowHobHintFits`): the rule
  // starts where it got to, and its first place needs no solve.
  const resume = provisional && hint !== null && slowHobHintFits(hint, cook, c, leanHint_s, now_s) ? hint : null;
  if (resume !== null) ramp = resume.ramp_s;
  let pot = cookSetupOf(ch, ramp);
  // Null while the hint stands for it: solved only if the plan stops there.
  let found: LevelAnswer | null = resume === null ? answerAt(c, pot.egg, pot.setup, ch.level, null, true) : null;
  let lengthened = false;
  let slowHobAt: number | null = null;

  let slowHob: SlowHobHint | null = null;
  if (provisional) {
    const heated = now_s - start;
    const most = LIMITS.timeToBoil_s.hi;
    let last = 0.0;
    let step = 0;
    // The carried time at `ramp`, when the hint gave it.
    let known: number | null = null;
    if (resume !== null) {
      step = resume.steps;
      last = resume.last_s;
      known = resume.carried_s;
      lengthened = step > 0;
    }
    // The place to keep: the last lengthening that did not creep (the hint).
    let keptSteps = step;
    let keptLast = last;
    let keptRamp = ramp;
    let keptCarried: number | null = null;
    let crept = false;
    for (; ; step++) {
      // No longer than the most the app takes for a time to boil: past that
      // the cook is abandoned (`tooOldAt_s`), not lengthened for ever.
      if (!(ramp < most)) break;
      let t: number;
      if (known !== null) {
        t = known;
        known = null;
      } else {
        if (found === null) found = answerAt(c, pot.egg, pot.setup, ch.level, null, true);
        t = carriedSolution(pot.egg, pot.setup, params, found.solution, carry).result.cookTime_s;
      }
      if (!crept && step === keptSteps) keptCarried = t;
      const next = last + SLOW_HOB_EVERY_S;
      const due = t - SLOW_HOB_WHEN_LEFT_S;
      const creeping = !(due > next);
      const fire = creeping ? next : due;
      if (!(heated > fire) || step >= SLOW_HOB_MAX_STEPS) {
        slowHobAt = start + fire;
        break;
      }
      // Creeping: once every SLOW_HOB_EVERY_S from `next`, up to the last
      // before now.
      last = creeping ? next + SLOW_HOB_EVERY_S * (Math.ceil((heated - next) / SLOW_HOB_EVERY_S) - 1) : fire;
      ramp = last + SLOW_HOB_EXTRA_S < most ? last + SLOW_HOB_EXTRA_S : most;
      lengthened = true;
      pot = cookSetupOf(ch, ramp);
      found = answerAt(c, pot.egg, pot.setup, ch.level, null, true);
      if (creeping) {
        crept = true;
      } else if (!crept) {
        keptSteps = step + 1;
        keptLast = last;
        keptRamp = ramp;
        keptCarried = null;
      }
    }
    slowHob = {
      startedAt_s: start, choices: ch, fromRamp_s: fromRamp, carry_s: carry, params: params,
      whiteDose_min: calibrationDoneness(c, 1.0).whiteDose_min,
      steps: keptSteps, last_s: keptLast, ramp_s: keptRamp, carried_s: keptCarried,
    };
  }

  const mean = found !== null ? found : answerAt(c, pot.egg, pot.setup, ch.level, null, true);
  const inputs = lengthened ? null : decisionInputs(c, pot.egg, pot.setup);
  const s = inputs !== null && surface !== null && sameDecisionInputs(surface.inputs, inputs) ? surface : null;
  const profile = s === null ? null : s.profile;
  const answer: LevelAnswer = { ...mean, lowOdds: lowOddsAt(profile, mean.level) };

  let decided: DecidedAnswer | null = null;
  let planned: Solution;
  let lean: number;
  let nudge: number;
  if (s !== null) {
    decided = decideAnswer(c, pot.egg, pot.setup, s.grid, answer.solution, answer.level, profile, cook.nudge_s);
    planned = decided.solution;
    lean = decided.decision.cookTime_s - decided.decision.meanCookTime_s;
    nudge = decided.nudge_s;
  } else {
    planned = carriedSolution(pot.egg, pot.setup, params, answer.solution, carry);
    lean = decisionApplies(answer.solution) ? leanHint_s : 0;
    nudge = appliedNudge(answer.solution, cook.nudge_s);
  }

  // The latest the cook told the plan something: a correction, or the tap.
  let told = cook.correctedAt_s;
  if (tapped && (told === null || boilAt > told)) told = boilAt;
  let cookTime = planned.result.cookTime_s;
  let cookEnd = start + cookTime;
  let overdue = false;
  if (pulled !== null) {
    cookTime = pulled.due_s - start;
    cookEnd = pulled.due_s;
  } else if (!provisional && told !== null && start + cookTime < told) {
    cookTime = told - start;
    cookEnd = told;
    overdue = true;
  }
  const rang = e.rangAt_s;
  if (pulled === null && !provisional && rang !== null) {
    cookTime = rang - start;
    cookEnd = rang;
  }
  const ran = solutionAt(pot.egg, pot.setup, params, planned, cookTime);

  // A pull the clock assumed, and a correction since that would, without it,
  // pull later or heat again: ask, rather than land in the cooling.
  let ask = false;
  if (pulled !== null && pulled.by === 'timeout' && !pulled.confirmed
    && cook.correctedAt_s !== null && cook.correctedAt_s >= pulled.out_s) {
    // Only a correction that leaves the egg still to cook at the moment it
    // was made is worth asking about: one that moves the pull a few seconds
    // later, still in the past, leaves the egg as done whether in or out.
    ask = (cold && boilAt === null) || start + planned.result.cookTime_s > cook.correctedAt_s;
  }

  let cool = coolingSecondsFor(ran.result);
  let coolEnd: number | null = null;
  if (ch.cooling !== 'counter') {
    const out = pulled !== null ? pulled.out_s : cookEnd + PULL_GRACE_SECONDS;
    if (pulled !== null && e.cooledAt_s !== null) {
      coolEnd = e.cooledAt_s;
      cool = e.cooledAt_s - out;
    } else {
      coolEnd = out + cool;
    }
  }

  const ended = coolEnd !== null ? coolEnd : pulled !== null ? pulled.out_s : cookEnd + PULL_GRACE_SECONDS;
  const tooOld = provisional ? start + LIMITS.timeToBoil_s.hi : ended + RESTORE_WINDOW_S;

  let certainty: CertaintyReading | null = null;
  let forecast: Forecast | null = null;
  if (s !== null) {
    const outcome = decided !== null && cookTime === decided.solution.result.cookTime_s
      ? decided.outcome
      : predictOutcome(c.posterior, s.grid, cookTime, logYolkTarget(answer.level));
    forecast = forecastOf(outcome, cookTime);
    certainty = certaintyAt(c.posterior, s.grid, cookTime, answer.level);
  }

  return {
    egg: pot.egg,
    setup: pot.setup,
    provisional: provisional,
    lengthened: lengthened,
    inputs: inputs,
    answer: answer,
    level: answer.level,
    solution: ran,
    decided: decided,
    lean_s: lean,
    nudge_s: nudge,
    cookTime_s: cookTime,
    overdue: overdue,
    askIfStillIn: ask,
    cool_s: cool,
    probeMoment: probeMomentFor(ran.result, ch.cooling),
    deadlines: {
      cookEnd_s: cookEnd,
      coolEnd_s: coolEnd,
      provisional: provisional,
      outAt_s: pulled !== null && pulled.by === 'cook' ? pulled.out_s : null,
    },
    slowHobAt_s: slowHobAt,
    slowHob: slowHob,
    tooOldAt_s: tooOld,
    certainty: certainty,
    forecast: forecast,
  };
}

/** The cook's tap out of the pull at `now_s` ("they're in the ice bath"):
 *  taken only while `plan` says Pull, and the pull it records is the one
 *  that rang. Otherwise the cook as it was. */
export function withOut(cook: RunningCook, plan: CookPlan, now_s: number): RunningCook {
  if (cook.events.pulled !== null || phaseAt(plan.deadlines, now_s) !== 'PULL') return cook;
  return {
    ...cook,
    events: {
      ...cook.events, pulled: { due_s: plan.deadlines.cookEnd_s, out_s: now_s, by: 'cook', confirmed: true },
    },
  };
}

/**
 * The events the clock alone decides, as of `now_s`, from the plan that
 * rang: the pull rang, the grace ran out (the pull, by `timeout`, out at the
 * grace's end and unconfirmed) and the counted cooling ended. The app writes
 * them down the first time it sees them past - a phone asleep through the
 * pull writes them on waking - and plans again. The cook's own events are
 * returned as they were.
 */
export function eventsDue(cook: RunningCook, plan: CookPlan, now_s: number): CookEvents {
  const d = plan.deadlines;
  let pulled = cook.events.pulled;
  let cooled = cook.events.cooledAt_s;
  let rang = cook.events.rangAt_s;
  if (pulled === null && rang === null && !d.provisional && now_s >= d.cookEnd_s) rang = d.cookEnd_s;
  if (pulled === null && !d.provisional && now_s >= d.cookEnd_s + PULL_GRACE_SECONDS) {
    pulled = { due_s: d.cookEnd_s, out_s: d.cookEnd_s + PULL_GRACE_SECONDS, by: 'timeout', confirmed: false };
  }
  if (pulled !== null && cooled === null && d.coolEnd_s !== null && now_s >= d.coolEnd_s) cooled = d.coolEnd_s;
  return { boilAt_s: cook.events.boilAt_s, pulled: pulled, cooledAt_s: cooled, rangAt_s: rang };
}

/* ------------------------------------------------- the record, the memory */

/** What an app adds to a cook's facts: which app and build wrote the
 *  record, the population the prior came from, the local day the cook
 *  started (`startedAt_s`, as corrected, in the app's time zone) and the
 *  record's id - the web's `id_ms`, none on iOS. */
export interface RecordContext {
  app: AppName;
  appVersion: string;
  prior: string;
  day: string;
  id: number | null;
}

/**
 * The facts `recordFor` makes the record of, from the cook as last corrected
 * and its plan, with whichever answers have been given (DECISIONS.md 97, 8):
 * the egg, the pot with the time to boil in force, the level it ran at, the
 * cook time that ran and the nudge in it, the pull the cook tapped, the
 * cooling as it ran, and what the app said for that cook at that time. The
 * format does not change (DECISIONS.md 81).
 */
export function cookFactsFor(
  cook: RunningCook, plan: CookPlan, ctx: RecordContext, yolkWord: YolkWord | null, white: WhiteReport | null,
  probe: ProbeReading | null,
): CookFacts {
  const pulled = cook.events.pulled;
  return {
    app: ctx.app,
    appVersion: ctx.appVersion,
    prior: ctx.prior,
    day: ctx.day,
    id: ctx.id,
    mass_kg: plan.egg.mass_kg,
    massFrom: cook.choices.massFrom,
    sizeTable: cook.choices.sizeTable,
    setup: plan.setup,
    eggFrom: cook.choices.eggFrom,
    boilRemembered: cook.boilRemembered,
    boilTapped: cook.events.boilAt_s !== null && !(cook.boilRemembered && tappedAfterLateCold(cook)),
    level: plan.level,
    cook_s: plan.cookTime_s,
    nudge_s: plan.nudge_s,
    out_s: pulled !== null && pulled.by === 'cook' ? pulled.out_s - cook.startedAt_s : null,
    cool_s: plan.cool_s,
    yolkWord: yolkWord,
    white: white,
    probe: probe,
    forecast: plan.forecast,
    lang: cook.lang,
    units: cook.units,
  };
}

/** A measured time to a rolling boil, for the boil memory. */
export interface BoilToRemember {
  litres: number;
  seconds: number;
}

/**
 * What the boil memory learns from this cook, written when it ends rather
 * than at the tap, so it is the cook as last corrected (DECISIONS.md 97, 9):
 * the tap on a cold start, for the water as corrected - or nothing. Not a tap
 * the cook was told to watch for only after the water could already have
 * boiled - corrected from boiling to cold, or the start corrected earlier,
 * past the time this water was remembered to take - since it may have
 * boiled before the cook noticed: that tap is used for this cook (or, after
 * a late correction to cold, the remembered time is: `replan`), and not
 * remembered. A tap made before the choices first said boiling was made in
 * the cold the cook began with, and a stray cold -> hot -> cold after it does
 * not change that (review 2.2). `rememberBoil` refuses what is not a credible
 * time, as ever.
 */
export function boilToRemember(cook: RunningCook): BoilToRemember | null {
  const ch = cook.choices;
  const tap = cook.events.boilAt_s;
  if (ch.startMode !== 'cold' || tap === null) return null;
  if (watchedFrom_s(cook, tap) - cook.startedAt_s > estimateTimeToBoil(cook.boilMemory, ch.waterLitres)) return null;
  return { litres: ch.waterLitres, seconds: tap - cook.startedAt_s };
}

/** When the cook began watching for the boil tapped at `tap`: when Start was
 *  pressed (`id_ms`), for a tap in the cold the cook began with - before the
 *  choices first said boiling - and otherwise when they last said cold. */
function watchedFrom_s(cook: RunningCook, tap: number): number {
  if (cook.firstHotAt_s === null || tap < cook.firstHotAt_s) return cook.id_ms / 1000;
  return cook.coldSince_s === null ? cook.startedAt_s : cook.coldSince_s;
}

/** Whether the boil was tapped after a correction from boiling to cold made
 *  later than this water's remembered time to boil (review 1.2): the water
 *  may have boiled unseen long before the tap. */
function tappedAfterLateCold(cook: RunningCook): boolean {
  const tap = cook.events.boilAt_s;
  const hot = cook.firstHotAt_s;
  if (tap === null || hot === null || tap < hot) return false;
  const remembered = estimateTimeToBoil(cook.boilMemory, cook.choices.waterLitres);
  return watchedFrom_s(cook, tap) - cook.startedAt_s > remembered;
}

/** What a cook leaves when it ends, by Cancel or by Start again: the boil to
 *  remember, and whether it was cooked through - Done by `plan` at `now_s` -
 *  and so is an egg to log if no answer has logged it. */
export interface CookEnding {
  boil: BoilToRemember | null;
  finished: boolean;
}

export function cookEnding(cook: RunningCook, plan: CookPlan, now_s: number): CookEnding {
  return { boil: boilToRemember(cook), finished: phaseAt(plan.deadlines, now_s) === 'DONE' };
}
