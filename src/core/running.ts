/**
 * A running cook: its start, its choices and what it observed.
 *
 * A cook is its START (when the egg went in, and the choices then: what the
 * sentence, the slider and Settings' altitude say) and a LOG of everything
 * since, in order, never rewritten: each correction ("it was always like
 * this"), the boil tapped, the pull ringing, the pull, the end of the counted
 * cooling, the answers. The cook as it stands - the start and choices in
 * force, the events, when it was last corrected, the plan as it ran - is the
 * log folded (`appendEntry`), and nothing else: a stored cook is read back by
 * folding its log again (`foldCook`, under each app's reader). So changing a setting back gives
 * back the old choices exactly, and the plan with them.
 *
 * - The start is correctable, never after now or after the first event, nor
 *   two hours before Start was pressed.
 * - Every change after the start is a correction: the whole cook is planned
 *   again from its start under the new choices.
 * - An event is a clock time, never re-derived, and kept even when a
 *   correction makes it unread. A pull the clock decided (the grace ran out)
 *   stays open to correction until the cook says it stands; the pull ringing
 *   holds only until the cook tells the plan something new.
 *
 * What is derived (the ramp in force, the solve, the decided time, the
 * deadlines `phaseAt` reads, the cooling, how sure, the record's facts) is the
 * plan, `replan`'s. Nothing derived is ever stored as truth. The plan as it
 * ran, kept from the pull on, and the record's facts made from it are
 * asRan.ts's. `step` (step.ts) runs a cook from event to event over these.
 *
 * Times are epoch seconds, as `Deadlines` has them; the record's id is the
 * web's milliseconds. Nothing here reads a clock: the time is handed in.
 * Pure, like the rest of `src/core/`, and `Running.swift` is held to it by
 * `fixtures/running.json` and `fixtures/step.json`.
 */

import { type Egg, type SizeTable, eggFromMass } from './geometry.ts';
import {
  type CookSetup, type Cooling, type HeatAfterBoil, type StartMode, coldestTouched_C, countsDown, restsInAir,
} from './protocol.ts';
import { boilingPointAtAltitude } from './thermo.ts';
import { ALPHA_REL_SD, EGG_CUP_OPENED_S, T_COLD_TAP_C } from './constants.ts';
import { LIMITS, ambientFor, startTempPreset_C } from './inputs.ts';
import { type BoilMemory, estimateTimeToBoil, hasBoilMemory } from './boil.ts';
import { type CookResult, type ModelParams, type Solution, logYolkTarget, simulate } from './solve.ts';
import {
  type DecisionInputs, appliedNudge, carriedSolution, decisionApplies, decisionInputs, inputsKey, solutionAt,
} from './decide.ts';
import type { DoseGrid } from './doseGrid.ts';
import { type DecidedAnswer, type LevelAnswer, type OddsProfile, answerAt, decideAnswer, lowOddsAt } from './reach.ts';
import { type CertaintyReading, certaintyAt } from './certainty.ts';
import { predictOutcome } from './outcome.ts';
import type { WhiteReport, YolkWord } from './infer.ts';
import {
  type Calibration, type EggFrom, type Forecast, type MassFrom, type ProbeReading, type PulledBy, type Units,
  calibrationDoneness, calibrationParams, forecastOf,
} from './record.ts';
import type { CookAsRan } from './asRan.ts';

/* ------------------------------------------------------------- the types */

/** The cook as chosen: what the sentence, the slider and Settings' altitude
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
  /** The room as the cook gave it (`roomInUse`), or null to assume one. */
  room_C: number | null;
  /** Sous-vide starts no cook, so it is not here. */
  startMode: StartMode;
  afterBoil: HeatAfterBoil;
  cooling: Cooling;
  /** The cold tap's temperature, C, or null to assume mains water
   *  (T_COLD_TAP_C): what running water cools the eggs in, and what a cold
   *  pan is filled with. One tap, one number. */
  tapWater_C: number | null;
  /** The bowl's water, litres, and its temperature, C, or null to assume the
   *  room. Read only for 'bowl'. */
  bowlLitres: number;
  bowlWater_C: number | null;
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
   *  (the plan asks whether the egg is still in) until the cook says it
   *  stands (`pullStands`). */
  confirmed: boolean;
}

/** What was observed, as clock times: the log's events folded. Kept when a
 *  correction makes one unread. */
interface CookEvents {
  /** Rolling boil, tapped. */
  boilAt_s: number | null;
  pulled: Pulled | null;
  /** The counted cooling ended: the water's, or the egg cup's wait to its
   *  opening. Never written for an egg left on the counter (`countsDown`),
   *  where nothing is counted. */
  cooledAt_s: number | null;
  /** The pull rang: the plan's pull, the first time the clock passed it with
   *  the egg still in (`eventsDue`). A plan keeps it - a surface landing, an
   *  egg folded, or a correction that leaves the pull still
   *  due - so a pull already due never moves or rings twice, and its grace
   *  ends where it began. A correction that moves the pull past the moment
   *  it was made, or back to heating, undoes it: the plan reads it no more
   *  and `eventsDue` clears it. `stillIn` clears it. */
  rangAt_s: number | null;
}

/** A cook with nothing observed yet. */
const NO_EVENTS: CookEvents = { boilAt_s: null, pulled: null, cooledAt_s: null, rangAt_s: null };

/** When the egg went in and the choices, as at the press of Start. */
export interface CookStart {
  at_s: number;
  choices: CookChoices;
}

/**
 * One thing that happened to a cook, as the log keeps it. What the cook told
 * the app: the boil tapped, a correction of the choices or of the start, the
 * egg out (a `pulled` by the cook), the answers to "still in the water?"
 * (`stillIn`, `stands`) and about the egg (`answered`), and the cook ended
 * (`ended`: Start again, Cancel, or too old). What the clock or a plan
 * decided: the pull ringing (`rang`, null when a correction undid it), the
 * grace running out (a `pulled` by `timeout`), the counted cooling's end
 * (`cooled`), the plan as it ran (`ran`), and the egg's record written
 * (`logged`).
 */
export type CookEntry =
  | { kind: 'boil'; at_s: number }
  | { kind: 'correct'; at_s: number; choices: CookChoices }
  | { kind: 'start'; at_s: number; startedAt_s: number }
  | { kind: 'pulled'; pulled: Pulled | null }
  | { kind: 'stands' }
  | { kind: 'cooled'; at_s: number | null }
  | { kind: 'rang'; at_s: number | null }
  | { kind: 'stillIn'; at_s: number }
  | { kind: 'ran'; asRan: CookAsRan | null }
  | { kind: 'answered'; at_s: number; yolkWord: YolkWord | null; white: WhiteReport | null; probe: ProbeReading | null }
  | { kind: 'logged'; at_s: number }
  | { kind: 'ended'; at_s: number };

/**
 * A running cook. What each app stores is what was fixed at the press (the
 * id, the nudge, the pans, the units and language), the start and the log;
 * the rest is the log folded, kept beside it so a plan need not fold it
 * again, and folded afresh from a stored cook (`foldCook`). Only core makes
 * one (`startCook`, `foldCook`, `appendEntry` and the moves over it).
 */
export interface RunningCook {
  /** When Start was pressed, whole ms since 1970: the record's id on the
   *  web. Never corrected, so a cook logged from two tabs is one egg. */
  id_ms: number;
  /** The nudge this cook drew: 0 when sharing was off at the start. A
   *  plan takes it where a time is chosen (`appliedNudge`). */
  nudge_s: number;
  /** The pans as remembered at the start, so a corrected water reads the
   *  same memory every time. */
  boilMemory: BoilMemory;
  /** What the cook was reading at the start, for the record. */
  units: Units;
  lang: string;
  start: CookStart;
  log: CookEntry[];
  /** The log folded. When the egg went in: correctable, never after now or
   *  the first event, nor two hours before Start was pressed
   *  (`startCorrected`). */
  startedAt_s: number;
  choices: CookChoices;
  events: CookEvents;
  /** When the choices or the start were last corrected, or the cook said the
   *  egg was still in; null until then. Nothing observed before it said the
   *  egg was out, so a plan never puts the pull before it (`replan`): a
   *  correction that makes the egg overdue makes the pull then, and a plan
   *  made again later - a reload, a surface landing - puts it there again,
   *  not at its own now. */
  correctedAt_s: number | null;
  /** The plan as it ran, from the pull on; null before it, and until a plan
   *  on the pot's surface has been made since (`keepAsRan`). */
  asRan: CookAsRan | null;
}

/* ---------------------------------------------- the phases and deadlines */

/**
 * The phases of a cook, in order.
 *
 *   IDLE -> HEATING -> COOKING -> PULL -> COOLING -> DONE
 */
export type Phase = 'IDLE' | 'HEATING' | 'COOKING' | 'PULL' | 'COOLING' | 'DONE';

/** Counted-down cooling. Carryover is what ruins a soft egg, so this is a
 *  stage of the cook, not a suggestion appended to the end of it. In an egg
 *  cup it is the wait to the opening (`countedCooling_s`).
 *
 *  This is the FALLBACK: the countdown runs to the moment the yolk's centre
 *  peaks (`coolingSecondsFor`), and this flat three minutes is only what a
 *  cook gets when there is no peak after the pull to run to - a heat-off pan
 *  that ran out while the egg was still in it - and the default before a cook
 *  is given its own. */
export const COOLING_SECONDS = 180;

/** The shortest counted cooling, s. The model's peak never comes sooner than
 *  about a minute and a half after the pull for any egg the app will time
 *  (88 s, a 53 g egg at hard with the heat off); this is a floor under a
 *  rounding, not a rule anyone should meet. */
export const COOLING_MIN_SECONDS = 60;

/**
 * How long to count the cooling down, s from the pull: to the moment the
 * yolk's centre peaks, for this cook as the solver ran it. A flat three minutes
 * would end 3 s before the peak for the default egg in ice and 25 s after it
 * for a small one; the thermometer is read at the peak, so the countdown and
 * the reading end together.
 *
 * `result` is the solve the cook is running on, for its own cooling method -
 * the peak comes about 20 s later under a tap than in ice. In the air, on the
 * counter or in an egg cup, the yolk peaks minutes later, and this is not
 * asked (`countedCooling_s`).
 */
export function coolingSecondsFor(result: CookResult): number {
  const toPeak = result.peakYolkTime_s - result.cookTime_s;
  if (!(toPeak > 0.0)) return COOLING_SECONDS;
  const whole = Math.round(toPeak);
  return whole < COOLING_MIN_SECONDS ? COOLING_MIN_SECONDS : whole;
}

/** How long the cook's countdown after the pull runs, s, for a cooling that
 *  counts down (`countsDown`): in water to the yolk's peak
 *  (`coolingSecondsFor`), in an egg cup to its opening, EGG_CUP_OPENED_S,
 *  where its doses stop. */
export function countedCooling_s(result: CookResult, cooling: Cooling): number {
  return cooling === 'eggCup' ? EGG_CUP_OPENED_S : coolingSecondsFor(result);
}

/**
 * Whether this cook has a moment to take a probe reading at: a counted
 * cooling that ends when the yolk's centre peaks. Not in the air: on the
 * counter the peak is nine minutes off with the carryover constant in it
 * (INFERENCE.md section 5), and an egg cup's countdown ends at the opening,
 * before its yolk peaks, while the centre still climbs about a degree in ten
 * seconds and is the coldest point in the egg, so a probe off-centre or
 * late reads hot, where the likelihood (`probeLikelihood`) has every
 * handling error read cold. And not when the centre peaked before the egg
 * came out, where there is no peak after the pull to read.
 */
export function probeMomentFor(result: CookResult, cooling: Cooling): boolean {
  if (restsInAir(cooling)) return false;
  return result.peakYolkTime_s - result.cookTime_s >= COOLING_MIN_SECONDS;
}

/** How far past the peaks of the fastest and slowest kitchens believed in a
 *  reading may land and still be taken, C: three instrument sds. */
export const PROBE_MARGIN_C = 3.0;

/** How many prior sds of the time-scale either side of where the posterior
 *  stands a kitchen may be and still have its reading taken. Three is wider
 *  than any kitchen the prior believes in, and narrow enough that a reading
 *  with its digits swapped - 46 for 64 - lands outside. */
export const PROBE_ALPHA_SDS = 3.0;

/**
 * The centre readings the app will take for this cook, C, as [low, high].
 *
 * The peak for a time-scale PROBE_ALPHA_SDS prior sds either side of the
 * posterior mean, widened by PROBE_MARGIN_C, and never outside what is
 * possible at all: colder than the coldest thing the egg touched, or hotter
 * than the water boiled. A reading outside is refused at entry rather than
 * folded: it is a typo, the white, or another egg. For the default egg at
 * jammy in ice that is 47.6 to 81.7 C around a peak of 64.7. Two
 * simulations, so cheap enough to run on every keystroke.
 */
export function plausibleProbeRange_C(
  egg: Egg, setup: CookSetup, params: ModelParams, cookTime_s: number,
): [number, number] {
  const spread = Math.exp(PROBE_ALPHA_SDS * ALPHA_REL_SD);
  const slow = simulate(egg, setup, { alpha_m2s: params.alpha_m2s / spread }, cookTime_s);
  const fast = simulate(egg, setup, { alpha_m2s: params.alpha_m2s * spread }, cookTime_s);
  const floor = coldestTouched_C(setup);
  const lo = Math.min(slow.peakYolk_C, fast.peakYolk_C) - PROBE_MARGIN_C;
  const hi = Math.max(slow.peakYolk_C, fast.peakYolk_C) + PROBE_MARGIN_C;
  return [lo < floor ? floor : lo, hi > setup.boiling_C ? setup.boiling_C : hi];
}

/** A slow hob: a cold start still not boiling this close to its provisional
 *  deadline, s, has a slower hob than assumed. Rather than count down to an
 *  alarm for an egg that has not begun cooking, both apps push the estimate
 *  out to the time heating so far plus SLOW_HOB_EXTRA_S, at most once every
 *  SLOW_HOB_EVERY_S. */
export const SLOW_HOB_WHEN_LEFT_S = 45;
export const SLOW_HOB_EXTRA_S = 60;
export const SLOW_HOB_EVERY_S = 10;

/** If nobody confirms the transfer, assume it happened. A stalled timer at the
 *  hob is worse than a slightly optimistic one. */
export const PULL_GRACE_SECONDS = 20;

/** The deadlines a cook is made of, as epoch seconds. `coolEnd_s` is null when
 *  there is no cooling step to time - resting on the counter, where the
 *  carryover IS the point rather than something to wait out (`countsDown`);
 *  in an egg cup it is the opening. */
export interface Deadlines {
  cookEnd_s: number;
  coolEnd_s: number | null;
  /** True on a cold start until the boil is tapped: the deadline is a guess. */
  provisional: boolean;
  /** When the cook said the eggs were out, inside the pull's grace; null
   *  until they do. The tap ends the pull, and the cooling (whose deadline
   *  the app then times from the tap) starts there. */
  outAt_s: number | null;
  /** The plan asks whether the egg is still in the water (`asksIfStillIn`,
   *  below): nothing past the question, so the phase that would be Done
   *  reads Cooling until it is answered. Absent is false. */
  asking?: boolean;
}

/**
 * Which phase a cook is in at a given instant.
 *
 * Pure, and it takes the clock rather than reading it, so one render sees one
 * time. This is the rule both apps derive from, and it exists here because
 * they did not agree on it: the iOS app checked for a cooling deadline BEFORE
 * checking the pull grace, so a counter rest - which has no cooling deadline -
 * fell straight from COOKING to DONE. "Out of the water, now" never appeared,
 * the 20 s grace never ran, and the phone still fired the pull notification at
 * a screen that already said Done. The web app always passed through PULL.
 *
 * PULL is therefore unconditional: every cook has a moment where the egg has
 * to come out, whatever happens to it next. It ends early only when the cook
 * says the eggs are out (`outAt_s`).
 */
export function phaseAt(d: Deadlines, now_s: number): Phase {
  if (d.provisional) return 'HEATING';
  if (now_s < d.cookEnd_s) return 'COOKING';
  const out = d.outAt_s !== null && now_s >= d.outAt_s;
  if (now_s < d.cookEnd_s + PULL_GRACE_SECONDS && !out) return 'PULL';
  // A question open about the pull: the egg may still be in the water, so
  // the cook is not Done, and nothing rings or ends it, until it is answered.
  if (d.asking === true) return 'COOLING';
  if (d.coolEnd_s === null) return 'DONE';
  return now_s < d.coolEnd_s ? 'COOLING' : 'DONE';
}

/* ------------------------------------------------------------- the log */

/** The cook with one more entry in its log, folded in. The one place the
 *  cook as it stands changes: every move below is a check, then this. */
export function appendEntry(cook: RunningCook, entry: CookEntry): RunningCook {
  const log = cook.log.slice();
  log.push(entry);
  return { ...applyEntry(cook, entry), log: log };
}

/** What one entry does to the cook as it stands. */
function applyEntry(cook: RunningCook, entry: CookEntry): RunningCook {
  const e = cook.events;
  switch (entry.kind) {
    case 'boil':
      return { ...cook, events: { ...e, boilAt_s: entry.at_s } };
    case 'correct': {
      // After the pull the yolk wanted is not corrected: it was not a
      // mistake, so the record keeps the level the egg was pulled at, and the
      // slider only previews. Done on the counter and
      // corrected to a counted cooling: that cooling ended here at the
      // latest, so Done stays Done and the plan takes the counted time if it
      // is sooner (`replan`, `eventsDue`).
      const choices = e.pulled === null ? entry.choices : { ...entry.choices, level: cook.choices.level };
      const doneInAir = e.pulled !== null && e.cooledAt_s === null && !countsDown(cook.choices.cooling)
        && countsDown(entry.choices.cooling);
      return {
        ...cook, choices: choices, events: doneInAir ? { ...e, cooledAt_s: entry.at_s } : e,
        correctedAt_s: entry.at_s,
      };
    }
    case 'start':
      return { ...cook, startedAt_s: entry.startedAt_s, correctedAt_s: entry.at_s };
    case 'pulled':
      return { ...cook, events: { ...e, pulled: entry.pulled } };
    case 'stands':
      return e.pulled === null ? cook : { ...cook, events: { ...e, pulled: { ...e.pulled, confirmed: true } } };
    case 'cooled':
      return { ...cook, events: { ...e, cooledAt_s: entry.at_s } };
    case 'rang':
      return { ...cook, events: { ...e, rangAt_s: entry.at_s } };
    case 'stillIn':
      return {
        ...cook, events: { ...e, pulled: null, cooledAt_s: null, rangAt_s: null }, correctedAt_s: entry.at_s,
        asRan: null,
      };
    case 'ran':
      return { ...cook, asRan: entry.asRan };
    case 'answered':
    case 'logged':
    case 'ended':
      return cook;
  }
}

/** The cook at the press, with nothing logged. */
function freshCook(
  id_ms: number, start: CookStart, nudge_s: number, boilMemory: BoilMemory, units: Units, lang: string,
): RunningCook {
  return {
    id_ms: id_ms, nudge_s: nudge_s, boilMemory: boilMemory, units: units, lang: lang, start: start, log: [],
    startedAt_s: start.at_s, choices: start.choices, events: NO_EVENTS, correctedAt_s: null, asRan: null,
  };
}

/** The cook folded from its start and log: what a stored cook is read back
 *  as. */
export function foldCook(
  id_ms: number, start: CookStart, nudge_s: number, boilMemory: BoilMemory, units: Units, lang: string,
  log: CookEntry[],
): RunningCook {
  let cook = freshCook(id_ms, start, nudge_s, boilMemory, units, lang);
  for (let i = 0; i < log.length; i++) cook = applyEntry(cook, log[i]);
  return { ...cook, log: log.slice() };
}

/**
 * Since when the choices have said a cold start, and the first moment they
 * said a boiling one, from the start and the corrections in the log.
 *
 * - `coldSince_s`: the press for a cook begun cold, the moment of the
 *   correction for one corrected to cold, and null while they say boiling. A
 *   boil tapped on a cook told it was cold only after the water could have
 *   boiled is used for the cook and not remembered (`boilToRemember`).
 * - `firstHotAt_s`: the press for a cook begun hot, the first correction to
 *   boiling for one begun cold, and null if they never have. A tap made
 *   before it was made in the cold the cook began with, so a stray
 *   cold -> hot -> cold after it does not stop it being remembered.
 */
function coldHistory(cook: RunningCook): { coldSince_s: number | null; firstHotAt_s: number | null } {
  let mode = cook.start.choices.startMode;
  let since: number | null = mode === 'cold' ? cook.start.at_s : null;
  let firstHot: number | null = mode === 'hot' ? cook.start.at_s : null;
  for (let i = 0; i < cook.log.length; i++) {
    const entry = cook.log[i];
    if (entry.kind !== 'correct') continue;
    const next = entry.choices.startMode;
    if (next === 'cold') {
      if (!(mode === 'cold' && since !== null)) since = entry.at_s;
    } else {
      since = null;
      if (firstHot === null) firstHot = entry.at_s;
    }
    mode = next;
  }
  return { coldSince_s: since, firstHotAt_s: firstHot };
}

/** What has been said about the egg: the first yolk word, white and probe
 *  reading given, each kept once said. */
interface CookAnswers {
  yolkWord: YolkWord | null;
  white: WhiteReport | null;
  probe: ProbeReading | null;
}

/** The answers in the log, the first `count` entries of it. */
function answersIn(log: CookEntry[], count: number): CookAnswers {
  let yolk: YolkWord | null = null;
  let white: WhiteReport | null = null;
  let probe: ProbeReading | null = null;
  for (let i = 0; i < count; i++) {
    const entry = log[i];
    if (entry.kind !== 'answered') continue;
    if (yolk === null) yolk = entry.yolkWord;
    if (white === null) white = entry.white;
    if (probe === null) probe = entry.probe;
  }
  return { yolkWord: yolk, white: white, probe: probe };
}

/** What has been said about the egg so far. */
export function answersOf(cook: RunningCook): CookAnswers {
  return answersIn(cook.log, cook.log.length);
}

/** What had been said about the egg when its record was last written
 *  (`logged`), or null if it never has been. */
export function answersLogged(cook: RunningCook): CookAnswers | null {
  for (let i = cook.log.length - 1; i >= 0; i--) {
    if (cook.log[i].kind === 'logged') return answersIn(cook.log, i);
  }
  return null;
}

/** Whether anything has been said about the egg. */
export function answered(cook: RunningCook): boolean {
  const a = answersOf(cook);
  return a.yolkWord !== null || a.white !== null || a.probe !== null;
}

/** When the cook ended (Start again, Cancel, or too old), or null while it
 *  runs. An ended cook is kept only until its egg is logged. */
export function endedAt_s(cook: RunningCook): number | null {
  for (let i = cook.log.length - 1; i >= 0; i--) {
    const entry = cook.log[i];
    if (entry.kind === 'ended') return entry.at_s;
  }
  return null;
}

/** Whether a measured pan was on file at the start: what a hot start, which
 *  never times its own pan, cooked on. */
export function boilRemembered(cook: RunningCook): boolean {
  return hasBoilMemory(cook.boilMemory);
}

/* ----------------------------------------------------- the egg and the pot */

/** The solver's egg and pot. */
export interface CookPot {
  egg: Egg;
  setup: CookSetup;
}

/** The egg's temperature as it goes in, C: a preset's (`startTempPreset_C`,
 *  which a measured room moves), or the cook's own number. */
function eggStartOf(ch: CookChoices): number {
  if (ch.eggFrom === 'custom') return ch.customStart_C;
  return startTempPreset_C(ch.eggFrom, ch.room_C);
}

/**
 * The egg and the pot the solver is told, for these choices and a time to a
 * rolling boil: the one assembly of both, for the idle screen and the running
 * cook alike. The setup's fields are in the order the web has always written
 * them.
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
      ...coolingWaterOf(ch),
      ...(ch.startMode === 'cold' ? { panStart_C: panStartFrom(ch) } : {}),
    },
  };
}

/** The water a cold pan starts at, C: filled from the cold tap, at the
 *  cook's temperature or mains water's. Written whether given or assumed,
 *  so a record says what its pan started at, and never leans on a default
 *  that may move; an absent one means the room, as every pot before it. */
function panStartFrom(ch: CookChoices): number {
  return ch.tapWater_C === null ? T_COLD_TAP_C : ch.tapWater_C;
}

/** What the setup says of the water the eggs cool in: its temperature, if
 *  the cook gave one (`givenCoolingWater_C`); for a bowl its volume. Nothing
 *  for ice or the air, and nothing assumed: an absent temperature is assumed
 *  where it is read (`coolingMedium_C`), so the pots that never had these
 *  fields keep the setups they had. */
function coolingWaterOf(ch: CookChoices): { coolingWater_C?: number; bowlLitres?: number } {
  const given = givenCoolingWater_C(ch);
  const water = given === null ? {} : { coolingWater_C: given };
  return ch.cooling === 'bowl' ? { ...water, bowlLitres: ch.bowlLitres } : water;
}

/* ------------------------------------------------------ the cooling water */

/** What a cook's choices hold of the waters it may cool in: the cooling,
 *  the cold tap's temperature and the bowl's, each null when not given.
 *  `CookChoices` is one, and so are each app's settings. */
export interface CoolingWaters {
  cooling: Cooling;
  tapWater_C: number | null;
  bowlWater_C: number | null;
}

/** The temperature the cook gave of the water this cooling cools in, C:
 *  running water's, the cold tap's, or the bowl's. Null when none was
 *  given, when it is assumed (`coolingMedium_C`), and for ice or the air,
 *  which take no water of the cook's. */
export function givenCoolingWater_C(w: CoolingWaters): number | null {
  if (w.cooling === 'tap') return w.tapWater_C;
  if (w.cooling === 'bowl') return w.bowlWater_C;
  return null;
}

/** `w` with the temperature of the water this cooling cools in given as
 *  `c`, or cleared with null so it is assumed again: running water's is the
 *  cold tap's, and the bowl's its own. For ice or the air, `w` as it was. */
export function withCoolingWater<W extends CoolingWaters>(w: W, c: number | null): W {
  if (w.cooling === 'tap') return { ...w, tapWater_C: c };
  if (w.cooling === 'bowl') return { ...w, bowlWater_C: c };
  return w;
}

/* ------------------------------------------------------- the transitions */

/** A cook started at `now_s` with these choices, the nudge it drew (0 with
 *  sharing off) and the pans as remembered now. */
export function startCook(
  now_s: number, choices: CookChoices, nudge_s: number, boilMemory: BoilMemory, units: Units, lang: string,
): RunningCook {
  return freshCook(Math.round(now_s * 1000), { at_s: now_s, choices: choices }, nudge_s, boilMemory, units, lang);
}

/** Rolling boil, tapped at `now_s`: taken only on a cold start still
 *  heating - no tap yet, no pull - and not before the start. Otherwise the
 *  cook as it was. */
export function withBoil(cook: RunningCook, now_s: number): RunningCook {
  const e = cook.events;
  if (cook.choices.startMode !== 'cold' || e.boilAt_s !== null || e.pulled !== null) return cook;
  if (!(now_s >= cook.startedAt_s)) return cook;
  return appendEntry(cook, { kind: 'boil', at_s: now_s });
}

/** A correction at `now_s`: the choices replaced, as if they had always been
 *  these. The start and the events are kept: a pull that rang stays rung
 *  while the corrected pull is still due, and the plan undoes it otherwise
 *  (`replan`). After the pull the yolk wanted is not corrected, and a
 *  correction once the cook is Done corrects only the record
 *  (`applyEntry`). */
export function corrected(cook: RunningCook, choices: CookChoices, now_s: number): RunningCook {
  return appendEntry(cook, { kind: 'correct', at_s: now_s, choices: choices });
}

/** The latest the start can be corrected to at `now_s`: now, or the first
 *  event, whichever is sooner. An event the choices do not read (a boil tap
 *  on a cook corrected to boiling) still counts: changing back reads it, and
 *  would read a boil before the egg went in. So a cook who pressed Start as
 *  the pan went on, tapped the boil, put the eggs in then and corrects to
 *  boiling cannot move the start past that tap, and the start's panel has
 *  to say so with the limit. */
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
 *  time. A pull that rang is kept, as by `corrected`. */
export function startCorrected(cook: RunningCook, startedAt_s: number, now_s: number): RunningCook | null {
  if (!Number.isFinite(startedAt_s) || startedAt_s > latestStart_s(cook, now_s)) return null;
  if (startedAt_s < earliestStart_s(cook)) return null;
  return appendEntry(cook, { kind: 'start', at_s: now_s, startedAt_s: startedAt_s });
}

/** The cook's answer when a plan asks whether the egg is still in the water,
 *  at `now_s`: it is. The pull the clock assumed is dropped, with the cooling
 *  it began and the plan as it ran, and the cook planned again as told now:
 *  a pull already past is now, and rings. Otherwise - no pull the clock
 *  assumed, or one the cook said stands - the cook as it was. */
export function stillIn(cook: RunningCook, now_s: number): RunningCook {
  const p = cook.events.pulled;
  if (p === null || p.by !== 'timeout' || p.confirmed) return cook;
  return appendEntry(cook, { kind: 'stillIn', at_s: now_s });
}

/** The other answer: the egg came out when the clock assumed. The pull
 *  stands, the correction applies to the record, and the plan does not ask
 *  again. */
export function pullStands(cook: RunningCook): RunningCook {
  const p = cook.events.pulled;
  if (p === null || p.confirmed) return cook;
  return appendEntry(cook, { kind: 'stands' });
}

/**
 * Whether two of a cook's values - its choices, its events, a pull, a plan as
 * it ran - are the same, every field: what Swift's `Equatable` says of them.
 * A field left out and one that is null are alike, and numbers are compared
 * as numbers, so 0 and -0 are the same and NaN is never.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  if (Array.isArray(a) && (a as unknown[]).length !== (b as unknown[]).length) return false;
  const keys = Object.keys(x);
  const more = Object.keys(y);
  for (let i = 0; i < more.length; i++) if (!(more[i] in x)) keys.push(more[i]);
  for (let i = 0; i < keys.length; i++) {
    if (!sameValue(x[keys[i]] ?? null, y[keys[i]] ?? null)) return false;
  }
  return true;
}

/** The cook with its events made `events`: an entry logged for each that
 *  differs (`eventsDue`'s, or what another copy of the cook saw). The same
 *  cook when none does. */
export function writeEvents(cook: RunningCook, events: CookEvents): RunningCook {
  let next = cook;
  const e = cook.events;
  if (events.boilAt_s !== e.boilAt_s && events.boilAt_s !== null) {
    next = appendEntry(next, { kind: 'boil', at_s: events.boilAt_s });
  }
  if (!sameValue(events.pulled, e.pulled)) next = appendEntry(next, { kind: 'pulled', pulled: events.pulled });
  if (events.cooledAt_s !== next.events.cooledAt_s) {
    next = appendEntry(next, { kind: 'cooled', at_s: events.cooledAt_s });
  }
  if (events.rangAt_s !== e.rangAt_s) next = appendEntry(next, { kind: 'rang', at_s: events.rangAt_s });
  return next;
}

/**
 * The cook a level asked for after the pull would have made, for the slider's
 * preview: these choices, as if not yet pulled and never
 * corrected, so the plan is the egg that level aims for in this pot. Its
 * corrections stay in its log, so the pot's ramp reads as the cook's own. A
 * cook for a plan and nothing else: its fold is not its log's, and it is
 * never stored or stepped.
 */
export function levelPreview(cook: RunningCook, choices: CookChoices): RunningCook {
  const log: CookEntry[] = [];
  for (let i = 0; i < cook.log.length; i++) {
    const kind = cook.log[i].kind;
    if (kind === 'boil' || kind === 'correct' || kind === 'start') log.push(cook.log[i]);
  }
  return {
    ...cook, log: log, choices: choices, correctedAt_s: null, asRan: null,
    events: { ...cook.events, pulled: null, cooledAt_s: null, rangAt_s: null },
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

/**
 * Where the slow hob's rule got to in one plan, handed to the next
 * (`replan`'s `memo`) so it starts the rule there instead of replaying every
 * lengthening from the remembered time to boil. Opaque: the apps hand it back
 * and never read it, and a plan takes it only when it was worked out under
 * exactly this cook, lean and calibration; otherwise it is ignored, never
 * trusted.
 */
export interface SlowHobMemo {
  readonly slowHob: 'memo';
}

/**
 * What a memo holds, read by the tests and the fixtures, never by the apps.
 * The rule reads nothing but the start, the choices, the remembered time it
 * starts from, the lean carried with the nudge, and the
 * calibration's parameters and white target, so `reads` is those
 * (`slowHobReads`). The place it keeps is the last lengthening that did not
 * creep: one that fired because the pull would come within
 * SLOW_HOB_WHEN_LEFT_S. Such a lengthening does not depend on the clock, only
 * on having heated past it, so the rule worked from the start at any later
 * moment passes through the same place, the same doubles, and a plan started
 * there is the plan made from the start. A creeping step lands where the
 * clock is, so it is never kept; it is always the rule's last step in a
 * plan, and the next plan takes it again from the place before it.
 */
export interface SlowHobPlace extends SlowHobMemo {
  reads: SlowHobReads;
  /** The lengthenings to the place kept, its time heated (0 for none) and
   *  the guess there. */
  steps: number;
  last_s: number;
  ramp_s: number;
  /** The carried cook time at `ramp_s`, s, so the next plan need not solve
   *  for it; null when the guess was already the most and no plan needed it. */
  carried_s: number | null;
}

/** What the slow hob's rule reads (`SlowHobPlace`). */
interface SlowHobReads {
  startedAt_s: number;
  choices: CookChoices;
  remembered_s: number;
  carry_s: number;
  alpha_m2s: number;
  whiteDose_min: number;
}

function slowHobReads(cook: RunningCook, c: Calibration, leanHint_s: number): SlowHobReads {
  return {
    startedAt_s: cook.startedAt_s, choices: cook.choices,
    remembered_s: estimateTimeToBoil(cook.boilMemory, cook.choices.waterLitres), carry_s: leanHint_s + cook.nudge_s,
    alpha_m2s: calibrationParams(c).alpha_m2s, whiteDose_min: calibrationDoneness(c, 1.0).whiteDose_min,
  };
}

/** The memo's place, if it may be taken for `cook` under calibration `c`
 *  with `leanHint_s`, at `now_s`: the cook still heating on a guess (a cold
 *  start, no tap, no pull); worked out under the same start, choices,
 *  remembered time, lean and nudge, parameters and white target; and the
 *  clock past the place kept, so that the rule from the start would get
 *  there too. Otherwise null, and the plan works the rule from the start. */
function memoPlace(
  memo: SlowHobMemo | null, cook: RunningCook, c: Calibration, leanHint_s: number, now_s: number,
): SlowHobPlace | null {
  if (memo === null) return null;
  const place = memo as SlowHobPlace;
  const e = cook.events;
  if (cook.choices.startMode !== 'cold' || e.boilAt_s !== null || e.pulled !== null) return null;
  if (!sameValue(place.reads, slowHobReads(cook, c, leanHint_s))) return null;
  return place.steps === 0 || now_s > cook.startedAt_s + place.last_s ? place : null;
}

/** Where the slow hob's rule got to in one plan (`slowHob`). */
interface SlowHob {
  /** The pot with the time to boil the rule gives. */
  pot: CookPot;
  /** The mean solve on `pot`, or null where the rule never needed it. */
  found: LevelAnswer | null;
  /** Whether the guess has been lengthened from the remembered time. */
  lengthened: boolean;
  /** When the rule next lengthens it (`slowHobAt_s`), or null at the most. */
  at_s: number | null;
  place: SlowHobPlace;
}

/**
 * The slow hob's rule for a cook still heating on a guess, at `now_s`, from
 * the remembered time to boil `remembered_s`, or from `memo`'s place when it
 * fits (`memoPlace`): `replan`'s THE TIME TO BOIL says what it does.
 */
function slowHob(
  cook: RunningCook, c: Calibration, leanHint_s: number, now_s: number, memo: SlowHobMemo | null,
  remembered_s: number,
): SlowHob {
  const ch = cook.choices;
  const start = cook.startedAt_s;
  const params = calibrationParams(c);
  const carry = leanHint_s + cook.nudge_s;
  // The memo's place, taken only when it fits: the rule starts where it got
  // to, and its first place needs no solve.
  const resume = memoPlace(memo, cook, c, leanHint_s, now_s);
  let ramp = resume !== null ? resume.ramp_s : remembered_s;
  let pot = cookSetupOf(ch, ramp);
  // Null while the memo stands for it: solved only if the plan stops there.
  let found: LevelAnswer | null = resume === null ? answerAt(c, pot.egg, pot.setup, ch.level, null) : null;
  let lengthened = false;
  let at: number | null = null;
  const heated = now_s - start;
  const most = LIMITS.timeToBoil_s.hi;
  let last = 0.0;
  let step = 0;
  // The carried time at `ramp`, when the memo gave it.
  let known: number | null = null;
  if (resume !== null) {
    step = resume.steps;
    last = resume.last_s;
    known = resume.carried_s;
    lengthened = step > 0;
  }
  // The place to keep: the last lengthening that did not creep.
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
      if (found === null) found = answerAt(c, pot.egg, pot.setup, ch.level, null);
      t = carriedSolution(pot.egg, pot.setup, params, found.solution, carry).result.cookTime_s;
    }
    if (!crept && step === keptSteps) keptCarried = t;
    const next = last + SLOW_HOB_EVERY_S;
    const due = t - SLOW_HOB_WHEN_LEFT_S;
    const creeping = !(due > next);
    const fire = creeping ? next : due;
    // Lengthened only once the clock is strictly past the moment, read as
    // the plan states it (`slowHobAt_s`, `slowHobDue`), so a plan made at
    // that very moment is the plan already made, and the app plans again
    // only after it.
    if (!(now_s > start + fire) || step >= SLOW_HOB_MAX_STEPS) {
      at = start + fire;
      break;
    }
    // Creeping: once every SLOW_HOB_EVERY_S from `next`, up to the last
    // before now.
    last = creeping ? next + SLOW_HOB_EVERY_S * (Math.ceil((heated - next) / SLOW_HOB_EVERY_S) - 1) : fire;
    ramp = last + SLOW_HOB_EXTRA_S < most ? last + SLOW_HOB_EXTRA_S : most;
    lengthened = true;
    pot = cookSetupOf(ch, ramp);
    found = answerAt(c, pot.egg, pot.setup, ch.level, null);
    if (creeping) {
      crept = true;
    } else if (!crept) {
      keptSteps = step + 1;
      keptLast = last;
      keptRamp = ramp;
      keptCarried = null;
    }
  }
  return {
    pot: pot, found: found, lengthened: lengthened, at_s: at,
    place: {
      slowHob: 'memo', reads: slowHobReads(cook, c, leanHint_s),
      steps: keptSteps, last_s: keptLast, ramp_s: keptRamp, carried_s: keptCarried,
    },
  };
}

/** Everything derived from a cook. Never stored as truth. */
export interface CookPlan {
  egg: Egg;
  /** The pot, with the time to boil in force: the tap, the remembered one,
   *  or the slow hob's. */
  setup: CookSetup;
  /** The inputs whose surface this plan reads, and so the one the app asks
   *  for when it is not in; null while the slow hob has lengthened the guess
   *  (`guessLengthened`), whose pot moves with the clock. */
  inputs: DecisionInputs | null;
  /** The mean solve at the yolk wanted, its verdict, the level the cook runs
   *  at (the one wanted, or the one it snapped to), and the warning there. */
  answer: LevelAnswer;
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
  /** The counted cooling, s from the egg out to its end. */
  cool_s: number;
  probeMoment: boolean;
  /** What `phaseAt` reads. `provisional` while the time to boil is a guess;
   *  `asking` while the plan asks whether the egg is still in the water: the
   *  pull is one the clock assumed (the grace ran out), and a correction
   *  since would, without it, put the pull later, or back to heating. The
   *  app asks, and answers with `stillIn` or `pullStands`; until then the
   *  pull stands and nothing passes the question: Cooling where it would be
   *  Done, no event written, not finished. */
  deadlines: Deadlines;
  /** While the time to boil is a guess, when the slow hob's rule next
   *  lengthens it: the app plans again once the clock is past it
   *  (`slowHobDue`). Null otherwise, and once the guess is the most the app
   *  takes for a time to boil. */
  slowHobAt_s: number | null;
  /** While the time to boil is a guess, where the slow hob's rule got to,
   *  for the next plan (`replan`'s `memo`); null otherwise. */
  memo: SlowHobMemo | null;
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

/** Whether the slow hob has lengthened the guess: the pull moves with the
 *  clock, so no time left is shown from it, and its pot asks for no
 *  surface. */
export function guessLengthened(plan: CookPlan): boolean {
  return plan.inputs === null;
}

/**
 * Whether the slow hob's moment has come at `now_s`, so the app plans again
 * (both apps' tick): strictly past `slowHobAt_s`, the one comparison
 * `replan` lengthens by. At the moment itself the plan is the one the app
 * holds, so a clock stopped exactly there plans nothing at every tick.
 */
export function slowHobDue(plan: CookPlan, now_s: number): boolean {
  return plan.slowHobAt_s !== null && now_s > plan.slowHobAt_s;
}

/** The most lengthenings one plan works through, so a plan's cost is
 *  bounded however long the pan has heated. A hob would have to be hours
 *  slow to reach it. */
export const SLOW_HOB_MAX_STEPS = 100;

/** How long past its end a cook is still worth picking back up, s: an egg
 *  an hour past its cooling has been eaten or thrown out. */
export const RESTORE_WINDOW_S = 3600;

/** Whether a cook is too old to pick back up at `now_s`, from its plan:
 *  both apps drop a stored one then, rather than restore a timer for an egg
 *  that is no longer on the hob or the counter. The tick asks it too, of the
 *  plan it holds: a cook running on screen that is too old ends then as
 *  Cancel would end it (`cookEnding`: the boil remembered, a finished
 *  unanswered egg logged), its alarms and card with it. The plan the tick
 *  holds is enough: `tooOldAt_s` moves only with what the cook tells the
 *  plan, which plans again. */
export function cookTooOld(plan: CookPlan, now_s: number): boolean {
  return now_s > plan.tooOldAt_s;
}

/**
 * The id of the egg still open to correction: the stored running cook's, `cook` with its `plan`, until it is too old
 * to pick back up; null when there is none. Every other egg in the log is
 * final, whichever tab asks, and may be sent; this one becomes final at
 * Start again, which stores another cook, or when it is too old.
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
 * tap only when no pan was remembered. Otherwise the
 * remembered one for the water (the memory as it was at the start), and while
 * the cook is still heating, the SLOW HOB'S RULE, as a function of how long
 * it has heated: whenever the pull would come within SLOW_HOB_WHEN_LEFT_S,
 * and SLOW_HOB_EVERY_S after the last lengthening (the start counting as
 * one), the guess becomes the time heated so far plus SLOW_HOB_EXTRA_S. Made
 * here from the start each time, so a plan is a function of the cook and the
 * clock alone. Where a lengthening would fire again at once - the egg would
 * be done before the water boils - the guess creeps with the clock in steps
 * of SLOW_HOB_EVERY_S, without a solve per step. It stops at the most the app
 * takes for a time to boil (`LIMITS.timeToBoil_s`, two hours): a pan still
 * not boiling then is a cook abandoned (`tooOldAt_s`), not one to plan again
 * every few seconds for ever. `memo`, the last plan's, starts the rule where
 * that plan got to when it fits this cook, lean and calibration
 * (`memoPlace`), and the plan is the same, to the bit, as the one worked from
 * the start. A hot start never times its pan: the remembered time is carried
 * for the record only. A pull ends the heating, read or not.
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
 * (`rangAt_s`) it is held there, so a plan the cook did not cause - a surface
 * landing - never moves a pull already due, and a correction in the grace
 * that leaves the pull due (a lighter egg) keeps the grace's end and rings
 * nothing more. A correction since the ring that puts the pull after the
 * moment it was made undoes the ring: the plan's pull is later, out of Pull,
 * and rings when it comes; `eventsDue` clears the ring. While provisional -
 * corrected back to heating - the deadline is a guess and no ring is held;
 * `phaseAt` reads Heating whatever it says.
 *
 * A PULL THE CLOCK ASSUMED. A pull by `timeout` is not something the cook
 * saw. A correction since it that would, without it, pull after the
 * correction itself (or heat again) leaves the pull standing and sets
 * `deadlines.asking`: the app asks, and the answer is `stillIn` or
 * `pullStands`. A cook's own tap is never asked about. Until it is answered
 * nothing passes the question: `phaseAt` reads Cooling where it would read
 * Done (the pull standing, as the egg out, but not finished); `eventsDue`
 * writes nothing; `cookEnding` is not finished; and the cook is too old an
 * hour after the question, if that is later than an hour after its end.
 *
 * THE COOLING. To the yolk's peak for the cook time that ran, or an egg
 * cup's opening (`countedCooling_s`), from the egg out - the cook's tap, or
 * the grace running out - and once ended, as it ran; none on the counter. A
 * correction whose counted end has already passed is Done at once, with the
 * counted time, so the cooling is not stretched to the correction; and one
 * after Done on the counter, which
 * ends the cooling it brings at the correction, never takes the cook back to
 * Cooling: the counted time if that is sooner, which `eventsDue` then writes
 * down.
 *
 * HOW SURE, AND WHAT THE RECORD SAYS WAS SAID: `certaintyAt` and the outcome
 * at the cook time, on this pot's surface.
 */
export function replan(
  cook: RunningCook, c: Calibration, surface: CookSurface | null, leanHint_s: number, now_s: number,
  memo: SlowHobMemo | null = null,
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

  const ramp = tapped && boilTapCounts(cook) ? boilAt - start : estimateTimeToBoil(cook.boilMemory, ch.waterLitres);
  const hob = provisional ? slowHob(cook, c, leanHint_s, now_s, memo, ramp) : null;
  const pot = hob !== null ? hob.pot : cookSetupOf(ch, ramp);
  const found = hob !== null ? hob.found : null;
  const lengthened = hob !== null && hob.lengthened;

  const mean = found !== null ? found : answerAt(c, pot.egg, pot.setup, ch.level, null);
  const inputs = lengthened ? null : decisionInputs(c, pot.egg, pot.setup);
  const s = inputs !== null && surface !== null && inputsKey(surface.inputs) === inputsKey(inputs) ? surface : null;
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
  // The pull that rang, held, unless the cook has told the plan something
  // since that puts the pull after that moment: then the ring is undone.
  const rang = e.rangAt_s;
  const undone = rang !== null && told !== null && told > rang && start + planned.result.cookTime_s > told;
  if (pulled === null && !provisional && rang !== null && !undone) {
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

  let cool = countedCooling_s(ran.result, ch.cooling);
  let coolEnd: number | null = null;
  if (countsDown(ch.cooling)) {
    const out = pulled !== null ? pulled.out_s : cookEnd + PULL_GRACE_SECONDS;
    if (pulled !== null && e.cooledAt_s !== null) {
      // As it ran; but a cooling a correction ended (Done on the counter),
      // not yet written down as counted, ends at the counted time if that is
      // sooner.
      const stamped = e.cooledAt_s === cook.correctedAt_s && out + cool < e.cooledAt_s;
      coolEnd = stamped ? out + cool : e.cooledAt_s;
      cool = coolEnd - out;
    } else {
      coolEnd = out + cool;
    }
  }

  let ended = coolEnd !== null ? coolEnd : pulled !== null ? pulled.out_s : cookEnd + PULL_GRACE_SECONDS;
  // A question open has not ended the cook before it was asked.
  if (ask && cook.correctedAt_s !== null && cook.correctedAt_s > ended) ended = cook.correctedAt_s;
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
    inputs: inputs,
    answer: answer,
    solution: ran,
    decided: decided,
    lean_s: lean,
    nudge_s: nudge,
    cookTime_s: cookTime,
    overdue: overdue,
    cool_s: cool,
    probeMoment: probeMomentFor(ran.result, ch.cooling),
    deadlines: {
      cookEnd_s: cookEnd,
      coolEnd_s: coolEnd,
      provisional: provisional,
      outAt_s: pulled !== null && pulled.by === 'cook' ? pulled.out_s : null,
      asking: ask,
    },
    slowHobAt_s: hob !== null ? hob.at_s : null,
    memo: hob !== null ? hob.place : null,
    tooOldAt_s: tooOld,
    certainty: certainty,
    forecast: forecast,
  };
}

/** Whether the plan asks whether the egg is still in the water
 *  (`deadlines.asking`). */
export function asksIfStillIn(plan: CookPlan): boolean {
  return plan.deadlines.asking === true;
}

/** The cook's tap out of the pull at `now_s` ("they're in the ice bath"):
 *  taken only while `plan` says Pull, and the pull it records is the one
 *  that rang. Otherwise the cook as it was. */
export function withOut(cook: RunningCook, plan: CookPlan, now_s: number): RunningCook {
  if (cook.events.pulled !== null || phaseAt(plan.deadlines, now_s) !== 'PULL') return cook;
  return appendEntry(cook, {
    kind: 'pulled', pulled: { due_s: plan.deadlines.cookEnd_s, out_s: now_s, by: 'cook', confirmed: true },
  });
}

/**
 * The events the clock alone decides, as of `now_s`, from the plan that
 * rang: the pull rang, the grace ran out (the pull, by `timeout`, out at the
 * grace's end and unconfirmed) and the counted cooling ended. The app writes
 * them down (`writeEvents`) the first time it sees them past - a phone
 * asleep through the pull writes them on waking - and plans again. The
 * cook's own events are returned as they were. A ring the plan no longer
 * holds - a correction moved the pull later, or back to heating (`replan`) -
 * is cleared, so the new pull rings in its turn; and a cooling a correction
 * ended after its counted end is written down at the counted end. While the
 * plan asks whether the egg is still in the water, nothing: the counted
 * cooling does not run out under an open question.
 */
export function eventsDue(cook: RunningCook, plan: CookPlan, now_s: number): CookEvents {
  if (asksIfStillIn(plan)) return { ...cook.events };
  const d = plan.deadlines;
  let pulled = cook.events.pulled;
  let cooled = cook.events.cooledAt_s;
  let rang = cook.events.rangAt_s;
  if (pulled === null && rang !== null && (d.provisional || d.cookEnd_s !== rang)) rang = null;
  if (pulled === null && rang === null && !d.provisional && now_s >= d.cookEnd_s) rang = d.cookEnd_s;
  if (pulled === null && !d.provisional && now_s >= d.cookEnd_s + PULL_GRACE_SECONDS) {
    pulled = { due_s: d.cookEnd_s, out_s: d.cookEnd_s + PULL_GRACE_SECONDS, by: 'timeout', confirmed: false };
  }
  if (pulled !== null && cooled === null && d.coolEnd_s !== null && now_s >= d.coolEnd_s) cooled = d.coolEnd_s;
  if (pulled !== null && cooled !== null && d.coolEnd_s !== null && d.coolEnd_s < cooled) cooled = d.coolEnd_s;
  return { boilAt_s: cook.events.boilAt_s, pulled: pulled, cooledAt_s: cooled, rangAt_s: rang };
}

/** A measured time to a rolling boil, for the boil memory. */
export interface BoilToRemember {
  litres: number;
  seconds: number;
}

/**
 * What the boil memory learns from this cook, written when it ends rather
 * than at the tap, so it is the cook as last corrected:
 * the tap on a cold start, for the water as corrected - or nothing. Not a tap
 * the cook was told to watch for only after the water could already have
 * boiled - corrected from boiling to cold, or the start corrected earlier,
 * past the time this water was remembered to take - since it may have
 * boiled before the cook noticed: that tap is used for this cook (or, after
 * a late correction to cold, the remembered time is: `replan`), and not
 * remembered. A tap made before the choices first said boiling was made in
 * the cold the cook began with, and a stray cold -> hot -> cold after it does
 * not change that. `rememberBoil` refuses what is not a credible time, as
 * ever.
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
  const h = coldHistory(cook);
  if (h.firstHotAt_s === null || tap < h.firstHotAt_s) return cook.id_ms / 1000;
  return h.coldSince_s === null ? cook.startedAt_s : h.coldSince_s;
}

/** Whether the cook's boil tap is the time to boil the plan runs on and the
 *  record says was tapped: tapped, and not after a late correction to cold
 *  on a pan remembered (`replan`'s THE TIME TO BOIL). */
export function boilTapCounts(cook: RunningCook): boolean {
  return cook.events.boilAt_s !== null && !(boilRemembered(cook) && tappedAfterLateCold(cook));
}

/** Whether the boil was tapped after a correction from boiling to cold made
 *  later than this water's remembered time to boil: the water may have
 *  boiled unseen long before the tap. */
function tappedAfterLateCold(cook: RunningCook): boolean {
  const tap = cook.events.boilAt_s;
  const hot = coldHistory(cook).firstHotAt_s;
  if (tap === null || hot === null || tap < hot) return false;
  const remembered = estimateTimeToBoil(cook.boilMemory, cook.choices.waterLitres);
  return watchedFrom_s(cook, tap) - cook.startedAt_s > remembered;
}
