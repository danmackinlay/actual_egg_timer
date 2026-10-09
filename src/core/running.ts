/**
 * A running cook: its start, its choices and what it observed
 * (design/one-screen.md section 3 and 4; DECISIONS.md 96, 97 and 98).
 *
 * A cook is its START (when the egg went in, and the choices then: what the
 * sentence, the slider and Settings' pot rows say) and a LOG of everything
 * since, in order, never rewritten: each correction ("it was always like
 * this"), the boil tapped, the pull ringing, the pull, the end of the counted
 * cooling, the answers. The cook as it stands - the start and choices in
 * force, the events, when it was last corrected, the plan as it ran - is the
 * log folded (`appendEntry`), and nothing else: a stored cook is read back by
 * folding its log again (`readRunningCook`). So changing a setting back gives
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
 * plan, `replan`'s. Nothing derived is ever stored as truth. `step`
 * (step.ts) runs a cook from event to event over these.
 *
 * Times are epoch seconds, as `Deadlines` has them; the record's id is the
 * web's milliseconds. Nothing here reads a clock: the time is handed in.
 * Pure, like the rest of `src/core/`, and `Running.swift` is held to it by
 * `fixtures/running.json` and `fixtures/step.json`.
 */

import { Egg, SizeTable, eggFromMass } from './geometry.js';
import { CookSetup, Cooling, HeatAfterBoil, StartMode } from './protocol.js';
import { boilingPointAtAltitude } from './thermo.js';
import {
  BoilMemory, Deadlines, LIMITS, PULL_GRACE_SECONDS, SLOW_HOB_EVERY_S, SLOW_HOB_EXTRA_S, SLOW_HOB_WHEN_LEFT_S,
  ambientFor, coolingSecondsFor, estimateTimeToBoil, hasBoilMemory, phaseAt, probeMomentFor, startTempPreset_C,
} from './policy.js';
import { ModelParams, Solution, logYolkTarget, simulate } from './solve.js';
import {
  DecisionInputs, appliedNudge, carriedSolution, decisionApplies, decisionInputs, inputsKey, numberKey, solutionAt,
} from './decide.js';
import { DoseGrid } from './doseGrid.js';
import { DecidedAnswer, LevelAnswer, OddsProfile, answerAt, decideAnswer, lowOddsAt } from './reach.js';
import { CertaintyReading, certaintyAt } from './certainty.js';
import { predictOutcome } from './outcome.js';
import { WhiteReport, YOLK_WORDS, YolkWord } from './infer.js';
import {
  AppName, Calibration, CookFacts, EggFrom, Forecast, MassFrom, ProbeReading, PulledBy, Units, calibrationDoneness,
  calibrationParams, forecastOf, parseForecast,
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
   *  (the plan asks whether the egg is still in) until the cook says it
   *  stands (`pullStands`). */
  confirmed: boolean;
}

/** What was observed, as clock times: the log's events folded. Kept when a
 *  correction makes one unread. */
export interface CookEvents {
  /** Full rolling boil, tapped. */
  boilAt_s: number | null;
  pulled: Pulled | null;
  /** The counted cooling ended. Never written on the counter, where nothing
   *  is counted. */
  cooledAt_s: number | null;
  /** The pull rang: the plan's pull, the first time the clock passed it with
   *  the egg still in (`eventsDue`). A plan keeps it - a surface landing, an
   *  egg folded in another tab, or a correction that leaves the pull still
   *  due - so a pull already due never moves or rings twice, and its grace
   *  ends where it began. A correction that moves the pull past the moment
   *  it was made, or back to heating, undoes it: the plan reads it no more
   *  and `eventsDue` clears it. `stillIn` clears it. */
  rangAt_s: number | null;
}

/** A cook with nothing observed yet. */
const NO_EVENTS: CookEvents = { boilAt_s: null, pulled: null, cooledAt_s: null, rangAt_s: null };

/**
 * The plan as the cook ran: what the record says was said for this egg, and
 * what Done shows, kept with the cook so that no later plan moves them - a
 * reload with no surface yet, or a posterior that has since folded this egg's
 * own answer. Taken from the first plan on the pot's surface made once the
 * egg is pulled (`keepAsRan`), and replaced only by a correction, planned on
 * the calibration before this egg (`asRanCorrected`, DECISIONS.md 98). Never
 * taken from a plan with no surface. The rest of the record (the pot, the
 * pull, the cooling) does not depend on the calibration once the egg is out,
 * and is the plan's.
 */
export interface CookAsRan {
  /** The cook's `correctedAt_s` when it was taken: one taken before the last
   *  correction, of the start or the choices, is stale (`asRanCurrent`). */
  correctedAt_s: number | null;
  /** The level it ran at, its cook time and the nudge in it, and what the
   *  app said for it: the record's `level`, `recommended_s`, `nudge_s` and
   *  `forecast`. */
  level: number;
  cook_s: number;
  nudge_s: number;
  forecast: Forecast;
  /** The peak yolk shown ("You asked for: jammy, peak yolk 65 C"), and
   *  whether the cooling ends at it, which offers the probe at Done. */
  peakYolk_C: number;
  probeMoment: boolean;
  /** The model's parameters it was planned under, so Done draws the egg, and
   *  bounds a probe reading, as it ran (`createSection`,
   *  `plausibleProbeRange_C`). */
  params: ModelParams;
}

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
 * A running cook. What is stored is what was fixed at the press (the id, the
 * nudge, the pans, the units and language), the start and the log; the rest
 * is the log folded, kept beside it so a plan need not fold it again, and
 * written down with it for whoever reads a store by eye, but never read back:
 * `readRunningCook` folds the log afresh. Only core makes one (`startCook`,
 * `appendEntry` and the moves over it).
 */
export interface RunningCook {
  /** When Start was pressed, whole ms since 1970: the record's id on the
   *  web. Never corrected, so a cook logged from two tabs is one egg. */
  id_ms: number;
  /** The nudge this cook drew (E8): 0 when sharing was off at the start. A
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
      // slider only previews (DECISIONS.md 98). Done on the counter and
      // corrected to a counted cooling: that cooling ended here at the
      // latest, so Done stays Done and the plan takes the counted time if it
      // is sooner (`replan`, `eventsDue`).
      const choices = e.pulled === null ? entry.choices : { ...entry.choices, level: cook.choices.level };
      const doneOnCounter = e.pulled !== null && e.cooledAt_s === null && cook.choices.cooling === 'counter'
        && entry.choices.cooling !== 'counter';
      return {
        ...cook, choices: choices, events: doneOnCounter ? { ...e, cooledAt_s: entry.at_s } : e,
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

/** The cook folded from its start and log. */
function foldCook(
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
 *   boiled is used for the cook and not remembered (`boilToRemember`,
 *   DECISIONS.md 97).
 * - `firstHotAt_s`: the press for a cook begun hot, the first correction to
 *   boiling for one begun cold, and null if they never have. A tap made
 *   before it was made in the cold the cook began with, so a stray
 *   cold -> hot -> cold after it does not stop it being remembered.
 */
export function coldHistory(cook: RunningCook): { coldSince_s: number | null; firstHotAt_s: number | null } {
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
export interface CookAnswers {
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
    },
  };
}

/* ------------------------------------------------------- the transitions */

/** A cook started at `now_s` with these choices, the nudge it drew (0 with
 *  sharing off) and the pans as remembered now. */
export function startCook(
  now_s: number, choices: CookChoices, nudge_s: number, boilMemory: BoilMemory, units: Units, lang: string,
): RunningCook {
  return freshCook(Math.round(now_s * 1000), { at_s: now_s, choices: choices }, nudge_s, boilMemory, units, lang);
}

/** Full rolling boil, tapped at `now_s`: taken only on a cold start still
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

/** Whether two pulls are the same, every field. */
function samePulled(a: Pulled | null, b: Pulled | null): boolean {
  if (a === null || b === null) return a === b;
  return a.due_s === b.due_s && a.out_s === b.out_s && a.by === b.by && a.confirmed === b.confirmed;
}

/** Whether two sets of events are the same, every field. */
export function sameEvents(a: CookEvents, b: CookEvents): boolean {
  return a.boilAt_s === b.boilAt_s && samePulled(a.pulled, b.pulled) && a.cooledAt_s === b.cooledAt_s
    && a.rangAt_s === b.rangAt_s;
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
  if (!samePulled(events.pulled, e.pulled)) next = appendEntry(next, { kind: 'pulled', pulled: events.pulled });
  if (events.cooledAt_s !== next.events.cooledAt_s) {
    next = appendEntry(next, { kind: 'cooled', at_s: events.cooledAt_s });
  }
  if (events.rangAt_s !== e.rangAt_s) next = appendEntry(next, { kind: 'rang', at_s: events.rangAt_s });
  return next;
}

/** Whether two lists of numbers are the same, every one. */
function sameNumbers(a: number[] | null, b: number[] | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Whether two plans as they ran are the same, every field. */
export function sameAsRan(a: CookAsRan | null, b: CookAsRan | null): boolean {
  if (a === null || b === null) return a === b;
  const f = a.forecast;
  const g = b.forecast;
  return a.correctedAt_s === b.correctedAt_s && a.level === b.level && a.cook_s === b.cook_s
    && a.nudge_s === b.nudge_s && a.peakYolk_C === b.peakYolk_C && a.probeMoment === b.probeMoment
    && a.params.alpha_m2s === b.params.alpha_m2s
    && f.cook_s === g.cook_s && sameNumbers(f.yolk, g.yolk) && sameNumbers(f.white, g.white)
    && sameNumbers(f.yolkWord ?? null, g.yolkWord ?? null);
}

/** The cook with `asRan` as its plan as it ran: logged if it differs. */
export function withAsRan(cook: RunningCook, asRan: CookAsRan | null): RunningCook {
  if (sameAsRan(asRan, cook.asRan)) return cook;
  return appendEntry(cook, { kind: 'ran', asRan: asRan });
}

/**
 * The cook a level asked for after the pull would have made, for the slider's
 * preview (DECISIONS.md 98): these choices, as if not yet pulled and never
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

/** A clock time moved by `by_s`, or null as it was. */
function shift(t: number | null, by_s: number): number | null {
  return t === null ? null : t + by_s;
}

/** One entry with every clock time in it moved by `by_s`. */
function shiftedEntry(entry: CookEntry, by_s: number): CookEntry {
  switch (entry.kind) {
    case 'boil':
    case 'correct':
    case 'stillIn':
    case 'answered':
    case 'logged':
    case 'ended':
      return { ...entry, at_s: entry.at_s + by_s };
    case 'start':
      return { ...entry, at_s: entry.at_s + by_s, startedAt_s: entry.startedAt_s + by_s };
    case 'pulled':
      return entry.pulled === null ? entry
        : { kind: 'pulled', pulled: { ...entry.pulled, due_s: entry.pulled.due_s + by_s, out_s: entry.pulled.out_s + by_s } };
    case 'cooled':
    case 'rang':
      return { ...entry, at_s: shift(entry.at_s, by_s) };
    case 'stands':
      return entry;
    case 'ran':
      return entry.asRan === null ? entry
        : { kind: 'ran', asRan: { ...entry.asRan, correctedAt_s: shift(entry.asRan.correctedAt_s, by_s) } };
  }
}

/** The cook with every clock time in it moved by `by_s`, the press with
 *  them: what a development clock does to a cook to reach a moment without
 *  waiting for it. */
export function shiftedCook(cook: RunningCook, by_s: number): RunningCook {
  const log: CookEntry[] = [];
  for (let i = 0; i < cook.log.length; i++) log.push(shiftedEntry(cook.log[i], by_s));
  return foldCook(
    Math.round(cook.id_ms + by_s * 1000), { at_s: cook.start.at_s + by_s, choices: cook.start.choices },
    cook.nudge_s, cook.boilMemory, cook.units, cook.lang, log,
  );
}

/* ----------------------------------------------- two copies of one cook */

/** The earlier of two times, either of which may be missing. */
function earlier(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

/** The pull to keep of two: the cook's tap over the clock's assumption, and
 *  of two alike the earlier out, then the earlier due. */
function betterPull(a: Pulled | null, b: Pulled | null): Pulled | null {
  if (a === null) return b;
  if (b === null) return a;
  if (a.by !== b.by) return a.by === 'cook' ? a : b;
  if (a.out_s !== b.out_s) return a.out_s < b.out_s ? a : b;
  return a.due_s <= b.due_s ? a : b;
}

/** Whether two copies of one cook were told the same: the same start and
 *  choices, so the same plan, and what either's clock decided is the other's
 *  too. */
function sameCorrections(a: RunningCook, b: RunningCook): boolean {
  return a.startedAt_s === b.startedAt_s && sameChoices(a.choices, b.choices);
}

/**
 * `ours` with what another copy of the same cook saw taken up - another tab's
 * on the web: what it saw in the one pan that this copy has not, logged. The
 * two are one cook, the same id, so neither copy corrects the other, and the
 * events are each the earliest seen: the boil tapped first; a pull by the
 * cook over one the clock assumed (`timeout`), and of two alike the earlier;
 * the cooling's end of the pull kept; the pull that rang, if it rang under
 * the boil kept; and the plan as it ran, if it is of the pull kept. `ours`,
 * the same object, when there is nothing to take up, and always for another
 * cook: a tab never takes up a cook another tab started (DECISIONS.md 97).
 * Taken up both ways, two copies end with the same events.
 *
 * From a copy whose start or choices differ from ours, only the cook's own
 * observations: the boil tap and a pull the cook tapped, which are what was
 * seen in the pan whatever either copy was told. Never what that copy's clock
 * decided from a plan this one has been corrected away from - the pull
 * ringing, a pull it assumed when the grace ran out (`timeout`), the
 * cooling's end - which would end this cook on another's time.
 */
export function takeUpEvents(ours: RunningCook, theirs: RunningCook): RunningCook {
  if (theirs.id_ms !== ours.id_ms) return ours;
  const same = sameCorrections(ours, theirs);
  const a = ours.events;
  const b = theirs.events;
  const boil = earlier(a.boilAt_s, b.boilAt_s);
  const theirPull = same || (b.pulled !== null && b.pulled.by === 'cook') ? b.pulled : null;
  const pulled = betterPull(a.pulled, theirPull);
  const cooled = earlier(
    samePulled(pulled, a.pulled) ? a.cooledAt_s : null, same && samePulled(pulled, b.pulled) ? b.cooledAt_s : null,
  );
  const rang = earlier(a.boilAt_s === boil ? a.rangAt_s : null, same && b.boilAt_s === boil ? b.rangAt_s : null);
  const events: CookEvents = { boilAt_s: boil, pulled: pulled, cooledAt_s: cooled, rangAt_s: rang };
  // The plan as it ran is of one pull's cook time, and of the cook as last
  // corrected: ours if it still is, else theirs if it is.
  const ranFits = (r: CookAsRan | null): boolean => r !== null && pulled !== null
    && r.cook_s === pulled.due_s - ours.startedAt_s && r.correctedAt_s === ours.correctedAt_s;
  const asRan = ranFits(ours.asRan) ? ours.asRan : ranFits(theirs.asRan) ? theirs.asRan : null;
  if (sameEvents(events, a) && sameAsRan(asRan, ours.asRan)) return ours;
  return withAsRan(writeEvents(ours, events), asRan);
}

/** Whether copy `a` of a cook was corrected after copy `b` was: a reload
 *  should restore the latest correction, so `a` is not written over by `b`. */
export function correctedLater(a: RunningCook, b: RunningCook): boolean {
  return a.correctedAt_s !== null && (b.correctedAt_s === null || a.correctedAt_s > b.correctedAt_s);
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

/** A pull, or null if it is not one: out before it was due, by nobody, or a
 *  cook's own tap unconfirmed. */
function readPulled(raw: unknown): Pulled | null {
  if (!isObject(raw)) return null;
  const due = raw['due_s'];
  const out = raw['out_s'];
  const by = raw['by'];
  const confirmed = raw['confirmed'];
  if (!isNumber(due) || !isNumber(out) || out < due) return null;
  if (by !== 'cook' && by !== 'timeout') return null;
  if (typeof confirmed !== 'boolean' || (by === 'cook' && !confirmed)) return null;
  return { due_s: due, out_s: out, by: by, confirmed: confirmed };
}

/** A clock time or null, as `.value`; null if it is neither. */
function timeOrNull(v: unknown): { value: number | null } | null {
  if (v === null) return { value: null };
  return isNumber(v) ? { value: v } : null;
}

/** A probe reading as the log keeps one, or undefined if it is not one. */
function readProbe(raw: unknown): ProbeReading | null | undefined {
  if (raw === null) return null;
  if (!isObject(raw)) return undefined;
  const centre = raw['centre_C'];
  const after = raw['after_s'];
  if (!isNumber(centre) || (after !== null && !isNumber(after))) return undefined;
  return { centre_C: centre, after_s: after };
}

/** One entry of a stored log, or null if it is not one. */
function readEntry(raw: unknown, start_s: number): CookEntry | null {
  if (!isObject(raw)) return null;
  const at = raw['at_s'];
  switch (raw['kind']) {
    case 'boil':
    case 'stillIn':
    case 'logged':
    case 'ended':
      return isNumber(at) ? { kind: raw['kind'], at_s: at } : null;
    case 'correct': {
      const choices = readChoices(raw['choices']);
      return isNumber(at) && choices !== null ? { kind: 'correct', at_s: at, choices: choices } : null;
    }
    case 'start': {
      const startedAt = raw['startedAt_s'];
      return isNumber(at) && isNumber(startedAt) ? { kind: 'start', at_s: at, startedAt_s: startedAt } : null;
    }
    case 'pulled': {
      if (raw['pulled'] === null) return { kind: 'pulled', pulled: null };
      const pulled = readPulled(raw['pulled']);
      return pulled === null ? null : { kind: 'pulled', pulled: pulled };
    }
    case 'stands':
      return { kind: 'stands' };
    case 'cooled':
    case 'rang': {
      const t = timeOrNull(at);
      return t === null ? null : { kind: raw['kind'], at_s: t.value };
    }
    case 'ran': {
      if (raw['asRan'] === null) return { kind: 'ran', asRan: null };
      const asRan = readAsRan(raw['asRan'], start_s);
      return asRan === null ? null : { kind: 'ran', asRan: asRan };
    }
    case 'answered': {
      const yolk = raw['yolkWord'];
      const white = raw['white'];
      const probe = readProbe(raw['probe']);
      if (!isNumber(at) || probe === undefined) return null;
      if (yolk !== null && !YOLK_WORDS.some((w) => w === yolk)) return null;
      if (white !== null && white !== 'runny' && white !== 'tender' && white !== 'firm') return null;
      return { kind: 'answered', at_s: at, yolkWord: yolk as YolkWord | null, white: white, probe: probe };
    }
    default:
      return null;
  }
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

/** The plan as it ran, or null if any field is missing or out of kind. */
function readAsRan(raw: unknown, start_s: number): CookAsRan | null {
  if (!isObject(raw)) return null;
  const at = raw['correctedAt_s'];
  const level = raw['level'];
  const cook = raw['cook_s'];
  const nudge = raw['nudge_s'];
  const forecast = parseForecast(raw['forecast']);
  const peak = raw['peakYolk_C'];
  const probe = raw['probeMoment'];
  const params = raw['params'];
  if (at !== null && (!isNumber(at) || at < start_s)) return null;
  if (!isNumber(level) || level < 0 || level > 1) return null;
  if (!isNumber(cook) || !(cook > 0) || !isNumber(nudge)) return null;
  if (forecast === null || !isNumber(peak) || typeof probe !== 'boolean') return null;
  if (!isObject(params)) return null;
  const alpha = params['alpha_m2s'];
  if (!isNumber(alpha) || !(alpha > 0)) return null;
  return {
    correctedAt_s: at, level: level, cook_s: cook, nudge_s: nudge, forecast: forecast, peakYolk_C: peak,
    probeMoment: probe, params: { alpha_m2s: alpha },
  };
}

/** Whether the folded events are in order: nothing before the start, a pull
 *  out no sooner than it was due, a cooling ended only after the egg came
 *  out, the plan as it ran only once pulled, and no correction before the
 *  start. */
function foldInOrder(cook: RunningCook): boolean {
  const e = cook.events;
  const start = cook.startedAt_s;
  if (e.boilAt_s !== null && e.boilAt_s < start) return false;
  if (e.pulled !== null && e.pulled.due_s < start) return false;
  if (e.cooledAt_s !== null && (e.pulled === null || e.cooledAt_s < e.pulled.out_s)) return false;
  if (e.rangAt_s !== null && e.rangAt_s < start) return false;
  if (cook.correctedAt_s !== null && cook.correctedAt_s < start) return false;
  if (cook.asRan !== null && e.pulled === null) return false;
  return cook.asRan === null || cook.asRan.correctedAt_s === null || cook.asRan.correctedAt_s >= start;
}

/**
 * A stored cook, read defensively: whole, or null. What was fixed at the
 * press, the start and the log are read, and the log folded again; the cook
 * as it stood when written is not read. A cook is what the calibration learns
 * from and what the alarms ring for, so a shape this build cannot read is
 * reported, not guessed at or patched from the controls; the app drops it.
 * Extra fields are ignored.
 */
export function readRunningCook(raw: unknown): RunningCook | null {
  if (!isObject(raw)) return null;
  const id = raw['id_ms'];
  const nudge = raw['nudge_s'];
  const units = raw['units'];
  const lang = raw['lang'];
  const startRaw = raw['start'];
  const logRaw = raw['log'];
  if (!isNumber(id) || !(id > 0)) return null;
  if (!isNumber(nudge)) return null;
  const memory = readBoilMemory(raw['boilMemory']);
  if (memory === null) return null;
  if (units !== 'metric' && units !== 'imperial') return null;
  if (typeof lang !== 'string' || lang === '') return null;
  if (!isObject(startRaw)) return null;
  const at = startRaw['at_s'];
  const choices = readChoices(startRaw['choices']);
  if (!isNumber(at) || !(at > 0) || choices === null) return null;
  if (!Array.isArray(logRaw)) return null;
  const log: CookEntry[] = [];
  for (let i = 0; i < logRaw.length; i++) {
    const entry = readEntry(logRaw[i], 0);
    if (entry === null) return null;
    log.push(entry);
  }
  const cook = foldCook(id, { at_s: at, choices: choices }, nudge, memory, units, lang, log);
  return foldInOrder(cook) ? cook : null;
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
 * calibration's parameters and white target, so `key` is those, to the bit
 * (`slowHobKey`). The place it keeps is the last lengthening that did not
 * creep: one that fired because the pull would come within
 * SLOW_HOB_WHEN_LEFT_S. Such a lengthening does not depend on the clock, only
 * on having heated past it, so the rule worked from the start at any later
 * moment passes through the same place, the same doubles, and a plan started
 * there is the plan made from the start. A creeping step lands where the
 * clock is, so it is never kept; it is always the rule's last step in a
 * plan, and the next plan takes it again from the place before it.
 */
export interface SlowHobPlace extends SlowHobMemo {
  key: string;
  /** The lengthenings to the place kept, its time heated (0 for none) and
   *  the guess there. */
  steps: number;
  last_s: number;
  ramp_s: number;
  /** The carried cook time at `ramp_s`, s, so the next plan need not solve
   *  for it; null when the guess was already the most and no plan needed it. */
  carried_s: number | null;
}

/** The choices as a key: every field, numbers to the bit. */
function choicesKey(ch: CookChoices): string {
  return [
    ch.massFrom, ch.sizeTable ?? '-', ch.eggFrom, ch.startMode, ch.afterBoil, ch.cooling,
    numberKey(ch.mass_kg), numberKey(ch.customStart_C), ch.room_C === null ? '-' : numberKey(ch.room_C),
    numberKey(ch.waterLitres), numberKey(ch.eggCount), numberKey(ch.altitude_m), numberKey(ch.level),
  ].join('|');
}

/** Whether two cooks' choices are the same, every field to the bit. */
export function sameChoices(a: CookChoices, b: CookChoices): boolean {
  return choicesKey(a) === choicesKey(b);
}

/** What the slow hob's rule reads, as a key (`SlowHobPlace`). */
function slowHobKey(cook: RunningCook, c: Calibration, leanHint_s: number): string {
  const p = calibrationParams(c);
  return [
    numberKey(cook.startedAt_s), choicesKey(cook.choices),
    numberKey(estimateTimeToBoil(cook.boilMemory, cook.choices.waterLitres)), numberKey(leanHint_s + cook.nudge_s),
    numberKey(p.alpha_m2s), numberKey(calibrationDoneness(c, 1.0).whiteDose_min),
  ].join('/');
}

/** The memo's place, if it may be taken for `cook` under calibration `c`
 *  with `leanHint_s`, at `now_s`: the cook still heating on a guess (a cold
 *  start, no tap, no pull); worked out under the same start, choices,
 *  remembered time, lean and nudge, parameters and white target; and the
 *  clock past the place kept, so that the rule from the start would get
 *  there too. Otherwise the plan works the rule from the start. */
export function slowHobMemoFits(
  memo: SlowHobMemo | null, cook: RunningCook, c: Calibration, leanHint_s: number, now_s: number,
): boolean {
  return memoPlace(memo, cook, c, leanHint_s, now_s) !== null;
}

/** The memo's place when it fits (`slowHobMemoFits`), or null. */
function memoPlace(
  memo: SlowHobMemo | null, cook: RunningCook, c: Calibration, leanHint_s: number, now_s: number,
): SlowHobPlace | null {
  if (memo === null) return null;
  const place = memo as SlowHobPlace;
  const e = cook.events;
  if (cook.choices.startMode !== 'cold' || e.boilAt_s !== null || e.pulled !== null) return null;
  if (place.key !== slowHobKey(cook, c, leanHint_s)) return null;
  return place.steps === 0 || now_s > cook.startedAt_s + place.last_s ? place : null;
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

/** Whether two decision surfaces' inputs are the same pot, egg and
 *  posterior: the same key (`inputsKey`). */
export function sameDecisionInputs(a: DecisionInputs, b: DecisionInputs): boolean {
  return inputsKey(a) === inputsKey(b);
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
 * The id of the egg still open to correction (design/one-screen.md section
 * 4): the stored running cook's, `cook` with its `plan`, until it is too old
 * to pick back up; null when there is none. Every other egg in the log is
 * final, whichever tab asks, and may be sent; this one becomes final at
 * Start again, which stores another cook, or when it is too old.
 */
export function openEggId(cook: RunningCook | null, plan: CookPlan | null, now_s: number): number | null {
  if (cook === null || plan === null || cookTooOld(plan, now_s)) return null;
  return cook.id_ms;
}

/**
 * Whether the cook on a screen is still the egg open to correction at
 * `now_s`: the stored cook is this one - its id, `storedId_ms`, is this
 * cook's (null when nothing is stored) - and it is not too old by this
 * screen's plan. `openEggId` asks the same of the stored cook and its plan;
 * this asks it of the screen's own, with no second plan. When it is not -
 * Start again or Cancel in another tab, another cook stored, or an hour past
 * the end - the egg is final: the screen ends it as Start again does, or at
 * least puts its questions away, and logs or rewrites nothing more for it.
 */
export function cookStillOpen(cook: RunningCook, plan: CookPlan, storedId_ms: number | null, now_s: number): boolean {
  return storedId_ms === cook.id_ms && !cookTooOld(plan, now_s);
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
 * THE COOLING. To the yolk's peak for the cook time that ran
 * (`coolingSecondsFor`), from the egg out - the cook's tap, or the grace
 * running out - and once ended, as it ran. A correction whose counted end has
 * already passed is Done at once, with the counted time, so the cooling is
 * not stretched to the correction; and one after Done on the counter, which
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

  const measured = tapped && !(boilRemembered(cook) && tappedAfterLateCold(cook));
  let ramp = measured ? boilAt - start : estimateTimeToBoil(cook.boilMemory, ch.waterLitres);
  // The memo's place, taken only when it fits: the rule starts where it got
  // to, and its first place needs no solve.
  const resume = provisional ? memoPlace(memo, cook, c, leanHint_s, now_s) : null;
  if (resume !== null) ramp = resume.ramp_s;
  let pot = cookSetupOf(ch, ramp);
  // Null while the memo stands for it: solved only if the plan stops there.
  let found: LevelAnswer | null = resume === null ? answerAt(c, pot.egg, pot.setup, ch.level, null) : null;
  let lengthened = false;
  let slowHobAt: number | null = null;

  let place: SlowHobPlace | null = null;
  if (provisional) {
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
        slowHobAt = start + fire;
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
    place = {
      slowHob: 'memo', key: slowHobKey(cook, c, leanHint_s),
      steps: keptSteps, last_s: keptLast, ramp_s: keptRamp, carried_s: keptCarried,
    };
  }

  const mean = found !== null ? found : answerAt(c, pot.egg, pot.setup, ch.level, null);
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

  let cool = coolingSecondsFor(ran.result);
  let coolEnd: number | null = null;
  if (ch.cooling !== 'counter') {
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
    slowHobAt_s: slowHobAt,
    memo: place,
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

/* --------------------------------------------------- the cook as it ran */

/** The plan as it ran, from `plan`: null unless the cook is pulled, `plan`
 *  is on its pot's surface (`decided`), and it is a plan of the cook as
 *  pulled, its cook time the pull's to the bit - as every plan made after the
 *  pull is, and the one that rang, made before it, is not quite. */
function asRanOf(cook: RunningCook, plan: CookPlan): CookAsRan | null {
  const pulled = cook.events.pulled;
  if (pulled === null || plan.decided === null || plan.forecast === null || plan.inputs === null) return null;
  if (plan.cookTime_s !== pulled.due_s - cook.startedAt_s) return null;
  return {
    correctedAt_s: cook.correctedAt_s, level: plan.answer.level, cook_s: plan.cookTime_s, nudge_s: plan.nudge_s,
    forecast: plan.forecast, peakYolk_C: plan.solution.result.peakYolk_C, probeMoment: plan.probeMoment,
    params: plan.inputs.params,
  };
}

/**
 * The cook with the plan as it ran kept: taken from `plan` the first time
 * the cook is pulled and `plan`, a plan of the cook as pulled, is on the
 * pot's surface. The app passes every plan it takes up through this (the
 * plan after `eventsDue` or the cook's tap writes the pull, after a surface
 * lands, at a reload) and writes the cook down when it comes back changed (a
 * new object). Otherwise - not pulled, no surface yet, or already kept - the
 * cook as it was: a kept one is replaced only by `asRanCorrected`.
 *
 * Kept before any answer is folded, it is planned on the calibration before
 * this egg; an app must not keep one, or make a record, from a plan made
 * after this egg's own answer was folded (design/one-screen.md section 4,
 * "Never from its own outcome"): it holds the answer until the surface lands.
 */
export function keepAsRan(cook: RunningCook, plan: CookPlan): RunningCook {
  if (cook.asRan !== null || cook.events.pulled === null) return cook;
  const asRan = asRanOf(cook, plan);
  return asRan === null ? cook : appendEntry(cook, { kind: 'ran', asRan: asRan });
}

/** Whether the cook's plan as it ran is kept and still its own: taken since
 *  the last correction of its start or choices (each stamps `correctedAt_s`
 *  with its own moment). */
export function asRanCurrent(cook: RunningCook): boolean {
  return cook.asRan !== null && cook.events.pulled !== null && cook.asRan.correctedAt_s === cook.correctedAt_s;
}

/**
 * What Done shows for the cook: the plan as it ran, kept with the cook, so a
 * relaunch, a surface landing or this egg's own answer folded never moves
 * "You asked for", the peak yolk, the egg drawn or the probe's field; until
 * it is kept, the same from `plan` when that is on its surface; otherwise
 * null, and Done shows `plan` as it is - no surface yet, or a correction
 * since, until `asRanCorrected` has planned it.
 */
export function asRanShown(cook: RunningCook, plan: CookPlan): CookAsRan | null {
  if (cook.asRan !== null) return asRanCurrent(cook) ? cook.asRan : null;
  return asRanOf(cook, plan);
}

/**
 * The solve as the cook ran, for what Done says of the egg beside the peak
 * (the texture note under the slider): the plan's egg and pot at the cook
 * time that ran, on the model's parameters it ran under (`ran`,
 * `asRanShown`'s), so a plan made since on a posterior that has folded this
 * egg's own answer never moves it. `plan.solution` itself when the plan is
 * on those parameters at that time, as before any fold; otherwise one
 * simulation. Its peak yolk is `ran.peakYolk_C` to the bit.
 */
export function solutionAsRan(plan: CookPlan, ran: CookAsRan): Solution {
  const p = plan.inputs === null ? null : plan.inputs.params;
  if (p !== null && p.alpha_m2s === ran.params.alpha_m2s && plan.cookTime_s === ran.cook_s) {
    return plan.solution;
  }
  return { ...plan.solution, result: simulate(plan.egg, plan.setup, ran.params, ran.cook_s) };
}

/**
 * A correction after the pull, as it ran (DECISIONS.md 98; design/one-screen.md
 * section 4, "Never from its own outcome"): the corrected cook planned on
 * `before`, the calibration before this egg - the fold's own starting point
 * once the egg is answered, the calibration as it stands while it is not -
 * on `surface`, that calibration's surface for the corrected pot, and its
 * plan as it ran kept in place of the stale one. Null while `surface` is not
 * that pot's: the app plans `replan(cook, before, null, 0, now_s)`, builds
 * the surface its `inputs` ask for on `before`, and asks again. Before the
 * pull, the cook as it was: nothing has run yet.
 */
export function asRanCorrected(
  cook: RunningCook, before: Calibration, surface: CookSurface | null, now_s: number,
): RunningCook | null {
  if (cook.events.pulled === null) return cook;
  const asRan = asRanOf(cook, replan(cook, before, surface, 0, now_s));
  return asRan === null ? null : appendEntry(cook, { kind: 'ran', asRan: asRan });
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

/** Why `cookFactsFor` made no facts:
 *  - 'noSurface': no plan as it ran is kept and `plan` is not on its pot's
 *    surface, so nothing says what the app said for this egg. The app plans
 *    on the surface `plan.inputs` asks for - building it if it must, as at a
 *    reload, or for a cook dropped too old before its pull ever planned on
 *    one - passes that plan through `keepAsRan`, and asks again; an answer
 *    is held meanwhile. `plan.inputs` is null only for a guess the slow hob
 *    lengthened, a cook still heating, which is never logged.
 *  - 'stale': the plan as it ran was kept before a correction since: the app
 *    plans the corrected cook on the calibration before this egg
 *    (`asRanCorrected`) and asks again. */
export type FactsRefused = 'noSurface' | 'stale';

/** The facts, or why there are none: exactly one of the two is null. */
export interface CookFactsResult {
  facts: CookFacts | null;
  refused: FactsRefused | null;
}

/**
 * The facts `recordFor` makes the record of, from the cook as last corrected
 * and its plan, with whichever answers have been given (DECISIONS.md 97, 8):
 * the egg, the pot with the time to boil in force, the level it ran at, the
 * cook time that ran and the nudge in it, the pull the cook tapped, the
 * cooling as it ran, and what the app said for that cook at that time.
 *
 * The level, cook time, nudge and forecast are the plan as it ran when the
 * cook keeps one (`asRan`), whatever `plan` reads now; otherwise `plan`'s,
 * when it is on its pot's surface. Never from a plan with no surface: no
 * record is made with no forecast, and the result says why (`FactsRefused`)
 * for the app to put right and ask again.
 */
export function cookFactsFor(
  cook: RunningCook, plan: CookPlan, ctx: RecordContext, yolkWord: YolkWord | null, white: WhiteReport | null,
  probe: ProbeReading | null,
): CookFactsResult {
  const kept = cook.asRan;
  if (kept !== null && !asRanCurrent(cook)) return { facts: null, refused: 'stale' };
  let level: number;
  let cook_s: number;
  let nudge_s: number;
  let forecast: Forecast;
  if (kept !== null) {
    level = kept.level;
    cook_s = kept.cook_s;
    nudge_s = kept.nudge_s;
    forecast = kept.forecast;
  } else if (plan.decided !== null && plan.forecast !== null) {
    level = plan.answer.level;
    cook_s = plan.cookTime_s;
    nudge_s = plan.nudge_s;
    forecast = plan.forecast;
  } else {
    return { facts: null, refused: 'noSurface' };
  }
  const pulled = cook.events.pulled;
  return {
    facts: {
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
      boilRemembered: boilRemembered(cook),
      boilTapped: cook.events.boilAt_s !== null && !(boilRemembered(cook) && tappedAfterLateCold(cook)),
      level: level,
      cook_s: cook_s,
      nudge_s: nudge_s,
      out_s: pulled !== null && pulled.by === 'cook' ? pulled.out_s - cook.startedAt_s : null,
      cool_s: plan.cool_s,
      yolkWord: yolkWord,
      white: white,
      probe: probe,
      forecast: forecast,
      lang: cook.lang,
      units: cook.units,
    },
    refused: null,
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

/** What a cook leaves when it ends, by Cancel or by Start again: the boil to
 *  remember; whether it was cooked through - Done by `plan` at `now_s`, and
 *  not while the plan asks whether the egg is still in the water - and so is
 *  an egg to log if no answer has logged it; and whether its record must be
 *  made again first: corrected after the pull, its plan as it ran not yet
 *  planned again (`asRanCurrent`), so the egg logged, or the one about to be,
 *  is the uncorrected one. The app makes it (`asRanCorrected` on the
 *  calibration before this egg), logs it in place of any logged under its
 *  id, and only then forgets the cook: the egg is final, and may be sent,
 *  once the cook is forgotten. */
export interface CookEnding {
  boil: BoilToRemember | null;
  finished: boolean;
  remake: boolean;
}

export function cookEnding(cook: RunningCook, plan: CookPlan, now_s: number): CookEnding {
  return {
    boil: boilToRemember(cook),
    finished: !asksIfStillIn(plan) && phaseAt(plan.deadlines, now_s) === 'DONE',
    remake: cook.events.pulled !== null && cook.asRan !== null && !asRanCurrent(cook),
  };
}
