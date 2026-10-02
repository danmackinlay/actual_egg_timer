/**
 * The record: one observation per egg, kept beside the posterior.
 *
 * Every answer is kept, not only folded into the particles. A posterior on
 * its own cannot be repaired when the likelihood changes, because nothing is
 * left to repair it FROM; with the observations kept, a change to the
 * likelihood is a replay of the log, and every egg already cooked counts under
 * the new model.
 *
 * The schema is INFERENCE.md section 4, and this file is its reference
 * implementation; `EggTimerCore/Record.swift` is held to it by
 * `fixtures/record.json`.
 *
 * WHAT A FOLD READS. The posterior is a function of the log and of nothing
 * else: both apps fold an egg FROM ITS RECORD, through `gridRequestFor` and
 * `foldRecord` below, and `replay` is those same calls in a loop.
 * That is what makes the posterior rebuilt from the log bit-identical to the
 * one built egg by egg - not a comparison that happens to pass, but one path
 * taken twice. The price is that the fold sees the egg the record describes
 * (a mass rounded to 0.01 g) rather than the one the solver timed, which is
 * 0.02% of an egg and a hundredth of a second of cook.
 *
 * WHERE IT IS SCORED. At the moment the egg came out when the cook said so -
 * `pulled_s`, when `pulledBy` is 'cook' - and at the scheduled time,
 * `recommended_s + nudge_s`, when nobody did.
 *
 * Pure, like the rest of `src/core/`: the day, the times and the version are
 * handed in; nothing here reads a clock.
 */

import { Egg, SizeTable, eggFromMass } from './geometry.js';
import { CookSetup, Cooling, HeatAfterBoil, StartMode, coolingMedium_C } from './protocol.js';
import {
  DEFAULT_PARAMS, Doneness, ModelParams, WHITE_DOSE_TARGET, donenessFromSlider, logYolkTarget,
} from './solve.js';
import { DoseGrid, GridPolicy, GridRequest, buildRequestedGrid } from './doseGrid.js';
import {
  Feedback, LITERATURE_POPULATION, Particle, Population, Posterior, WhiteReport, createPrior,
  posteriorMeanWhiteOffset, posteriorParams, updatePosterior,
} from './infer.js';
import { PriorStart, priorStart } from './population.js';
import { calibrationGrid } from './policy.js';
import { Outcome } from './outcome.js';

/** The schema version. A loader refuses any other: a record from a later
 *  schema means something this code does not know how to fold. */
export const RECORD_VERSION = 1;

/* WHICH PRIOR. A record's `prior` is the id of the population the cook's
 * prior was drawn from (population.ts): '2026-09', the literature's, until a
 * fit publishes another. Before E6 it named the policy too - '2026-09' a
 * three-number particle, '2026-09-e2' six numbers whose white offset moved
 * the recommendation, '2026-09-e5' the time chosen from the whole posterior -
 * and the policy is now `model`'s to say. */

/** The code that made the record's forecast and chose its time: the
 *  likelihood, the decision and, from E8, the nudge. Changed whenever any of
 *  them changes, so that the model as it SHIPPED can be scored after the code
 *  has moved on (DECISIONS.md 37); a replay can only say what the current code
 *  would have said. '2026-10-e6' is E5's likelihood and decision, with the
 *  forecast kept; '2026-10-e8' adds the nudge, +-10 s for a cook who is
 *  sharing (DECISIONS.md 55). Records from before E6 carry none. */
export const MODEL_ID = '2026-10-e8';

/** Where the egg's mass came from. A size class is a 10 g bucket, worth about
 *  +-24 s; a scale is a gram. The fit reads this as egg-level noise. */
export type MassFrom = 'scale' | 'girth' | 'width' | 'class';

/** Where the egg's starting temperature came from: a preset or a typed value. */
export type EggFrom = 'fridge' | 'room' | 'custom';

/** Where the solve's time to boil came from. `measured` is this cook's own boil
 *  tap, and every finished cold start has one, because neither app leaves
 *  HEATING without it. A hot start never times the pan, so it cooks on the
 *  `remembered` pan, or on the `default` guess when no pan has ever been
 *  measured. With the heat off, records from before 27 September took the
 *  pan's whole cooling curve from this number (the standing method's pan
 *  constant now comes from the water volume, `panTimeConstant`), so this also
 *  says how hard those cooks leaned on it. */
export type TimeToBoilFrom = 'measured' | 'remembered' | 'default';


/** How the egg came out. `cook` when the cook said so - the tap out of PULL -
 *  and `timeout` when nobody did and the grace ran out, in which case
 *  `pulled_s` is the scheduled time, an assumption and not a measurement. */
export type PulledBy = 'cook' | 'timeout';

/**
 * A probe thermometer reading at the centre of the egg (INFERENCE.md
 * section 5), taken when the app said: at the moment the model has the yolk's
 * centre peaking, which is when the cooling countdown ends. In degrees C
 * whatever the cook typed it in; the record is SI.
 */
export interface ProbeReading {
  /** The highest number the cook saw with the probe at the middle, C. */
  centre_C: number;
  /** When the app asked for it, s after the moment the record scores as the
   *  pull (`recordCookTime_s`): the end of the counted cooling. Null when that
   *  is not known. The likelihood reads the reading as the peak; this is kept
   *  so that a later fit can check that it was. */
  after_s: number | null;
}

/**
 * What the app said at "Eggs in" (DECISIONS.md 37): the probability of each
 * answer the cook could give, at the time the cook was started at, unrelated
 * share included - `predictOutcome`'s, not the odds in tenths. Kept so that
 * the model as shipped can be scored by proper scoring rules after the code
 * changes, which a replay cannot do.
 */
export interface Forecast {
  /** The cook time the forecast was made for, s from egg in: the time on
   *  screen at "Eggs in". A cold start's boil tap re-solves the cook after
   *  that, and `recommended_s` is the re-solved time, so the two can differ. */
  cook_s: number;
  /** P(too soft), P(just right), P(too firm). */
  yolk: number[];
  /** P(runny), P(tender), P(firm). */
  white: number[];
}

/** The forecast a ticket keeps: the outcome on screen at "Eggs in", and the
 *  time it was for. */
export function forecastOf(o: Outcome, cook_s: number): Forecast {
  return {
    cook_s: cook_s,
    yolk: [o.pTooSoft, o.pJustRight, o.pTooFirm],
    white: [o.pWhiteRunny, o.pWhiteTender, o.pWhiteFirm],
  };
}

export type AppName = 'web' | 'ios';
export type Units = 'metric' | 'imperial';

export interface RecordEgg {
  /** Whole-egg mass, grams, rounded to 0.01 g by `recordMass_g`. */
  mass_g: number;
  massFrom: MassFrom;
  /** Whose carton, when `massFrom` is 'class', and null otherwise. The same
   *  class is 68 g in one table and 60.2 g in the other, and a class's width -
   *  the noise the fit reads off `massFrom` - differs with the table. The fold
   *  itself reads only `mass_g`. */
  sizeTable: SizeTable | null;
}

/** The pot, as the solver was told it. Every field `CookSetup` has, plus where
 *  the egg's temperature came from. `ambient_C` is here although the example in
 *  INFERENCE.md omits it: the app derives it from the egg's start temperature by
 *  a policy rule (`ambientFor`), and a record that relied on the rule could not
 *  be replayed faithfully once the rule changed. */
export interface RecordSetup {
  startMode: StartMode;
  eggStart_C: number;
  eggFrom: EggFrom;
  ambient_C: number;
  /** The boiling point the solve used. A one-to-one function of the altitude
   *  setting (`boilingPointAtAltitude`), so it carries everything the altitude
   *  would; the altitude itself is deliberately not recorded. */
  boiling_C: number;
  /** The time to boil the solve actually used, and where it came from. */
  timeToBoil_s: number;
  timeToBoilFrom: TimeToBoilFrom;
  cooling: Cooling;
  afterBoil: HeatAfterBoil;
  waterLitres: number;
  eggCount: number;
}

export interface EggRecord {
  v: 1;
  /** The cook's random id, for opt-in collection, which is not built: nothing
   *  mints one yet. Never derived from anything. */
  uid: string | null;
  /** The local date the cook started, YYYY-MM-DD. A day, not a timestamp. */
  day: string;
  app: AppName;
  appVersion: string;
  prior: string;
  /** `MODEL_ID` when the record was written; null on a record from before
   *  E6, which kept no forecast. */
  model: string | null;
  egg: RecordEgg;
  setup: RecordSetup;
  /** The doneness slider position the cook was RUN at, [0, 1]. */
  level: number;
  /** What the solver said, s from egg-in to egg-out. */
  recommended_s: number;
  /** What the app added to it on purpose, to learn from. Nothing adds any
   *  yet, so it is zero. */
  nudge_s: number;
  /** When the egg came out, s from egg-in. See `pulledBy`. */
  pulled_s: number;
  pulledBy: PulledBy;
  /** The counted cooling the app ran, s; 0 on the counter, where there is none. */
  cooled_s: number;
  /** The yolk answer, or null when the question was on screen and the cook
   *  moved on without answering. */
  yolk: Feedback | null;
  /** The white answer: runny, tender or firm, or null when the question was
   *  on screen and the cook moved on without answering. It is always asked. */
  white: WhiteReport | null;
  /** A thermometer reading at the centre's peak, or null: no probe, or not
   *  taken. */
  probe: ProbeReading | null;
  /** What the app said at "Eggs in", or null: started before the odds were
   *  known, no time chosen (the white never sets), or written before E6. */
  forecast: Forecast | null;
  /** What the cook READ: an answer is a word, and words differ. */
  lang: string;
  register: string;
  units: Units;
}

/** The mass as a record carries it: to 0.01 g, so a record reads as the egg
 *  the cook weighed rather than as 68.00000000000001. */
export function recordMass_g(mass_kg: number): number {
  return Math.round(mass_kg * 100000) / 100;
}

/** A probe reading as a record carries it: to a hundredth of a degree, so a
 *  typed 147.2 F reads as 64 C rather than as 63.99999999999999. A probe
 *  shows tenths; a hundredth keeps a Fahrenheit tenth distinct. */
export function recordProbe_C(centre_C: number): number {
  return Math.round(centre_C * 100) / 100;
}

/* ------------------------------------------------------------- validation */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  if (typeof v !== 'string') return false;
  for (let i = 0; i < allowed.length; i++) {
    if (v === allowed[i]) return true;
  }
  return false;
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** YYYY-MM-DD, digits in the right places. Not a calendar check: the day is a
 *  label for the fit, not something anything computes with. */
function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || v.length !== 10) return false;
  for (let i = 0; i < 10; i++) {
    const c = v.charCodeAt(i);
    if (i === 4 || i === 7) {
      if (c !== 45) return false;
    } else if (c < 48 || c > 57) {
      return false;
    }
  }
  return true;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Three probabilities that sum to one, as a forecast's answers are. */
function threeAnswers(v: unknown): v is number[] {
  if (!Array.isArray(v) || v.length !== 3) return false;
  let sum = 0.0;
  for (let i = 0; i < 3; i++) {
    const p: unknown = v[i];
    if (!isFiniteNumber(p) || p < 0 || p > 1) return false;
    sum += p;
  }
  return Math.abs(sum - 1.0) <= FORECAST_SUM_TOLERANCE;
}

/** How far a forecast's three answers may sum from one: far above what three
 *  doubles add up to, far below any probability that means something. */
const FORECAST_SUM_TOLERANCE = 1e-6;

/** A forecast, or null if it is not one: a positive time and two sets of
 *  three probabilities. A fresh object with exactly the known fields. */
export function parseForecast(raw: unknown): Forecast | null {
  if (!isObject(raw)) return null;
  const t = raw['cook_s'];
  if (!isFiniteNumber(t) || !(t > 0)) return null;
  const yolk = raw['yolk'];
  const white = raw['white'];
  if (!threeAnswers(yolk) || !threeAnswers(white)) return null;
  return { cook_s: t, yolk: [yolk[0], yolk[1], yolk[2]], white: [white[0], white[1], white[2]] };
}

/** The coolest thing this cook's egg ever touched, C: the fridge, the room or
 *  the cooling water, whichever is lowest. */
function coldestOf(s: RecordSetup): number {
  return Math.min(s.eggStart_C, s.ambient_C, coolingMedium_C(s.cooling, s.ambient_C));
}

/**
 * Whether a centre reading is physically possible at all for this cook: no
 * colder than the coldest thing the egg touched and no hotter than the water
 * boiled. The loader's test, so it is deliberately loose - a bound that
 * narrows later must not make an older record unreadable. The apps refuse far
 * more at entry, against the physics of the cook (`plausibleProbeRange_C`).
 */
function probePossible(s: RecordSetup, centre_C: number): boolean {
  return Number.isFinite(centre_C) && centre_C >= coldestOf(s) && centre_C <= s.boiling_C;
}

/**
 * A record read back from storage, or null if it cannot be trusted.
 *
 * The rules are `loadCalibration`'s: finite, and positive where the physics
 * needs it, because a record that passes here is folded into the posterior, and
 * a zero mass or a NaN cook time reaches a solve as a plausible wrong answer.
 * Ranges are physical rather than the UI's `LIMITS`: a bound that narrows in a
 * later version must not make an older version's eggs unreadable.
 *
 * VERSION SKEW. The web app deploys on push and the iOS app ships when a build
 * does, so records from different app versions coexist. Any `appVersion` is
 * accepted under `v: 1`. Fields may be ADDED within v1 but never removed or
 * reinterpreted once a record has left the owner's devices, so unknown
 * fields are ignored here, and the nullable fields (`uid`, `egg.sizeTable`,
 * `yolk`, `white`, `probe`, and E6's `model` and `forecast`) may be absent and
 * read as null - which is also
 * what Swift's Codable does, and the fixtures hold the two to it.
 *
 * Returns a fresh object with exactly the known fields, so what is folded is
 * what was checked.
 */
export function parseRecord(raw: unknown): EggRecord | null {
  if (!isObject(raw)) return null;
  if (raw['v'] !== RECORD_VERSION) return null;

  const uid = raw['uid'] ?? null;
  if (uid !== null && !nonEmptyString(uid)) return null;
  if (!isDay(raw['day'])) return null;
  if (!oneOf(raw['app'], ['web', 'ios'] as const)) return null;
  if (!nonEmptyString(raw['appVersion']) || !nonEmptyString(raw['prior'])) return null;
  const model = raw['model'] ?? null;
  if (model !== null && !nonEmptyString(model)) return null;

  const egg = raw['egg'];
  if (!isObject(egg)) return null;
  if (!isFiniteNumber(egg['mass_g']) || !(egg['mass_g'] > 0)) return null;
  if (!oneOf(egg['massFrom'], ['scale', 'girth', 'width', 'class'] as const)) return null;
  // A class names its carton; nothing else has one.
  const table = egg['sizeTable'] ?? null;
  if (egg['massFrom'] === 'class' ? !oneOf(table, ['eu', 'us'] as const) : table !== null) return null;

  const s = raw['setup'];
  if (!isObject(s)) return null;
  if (!oneOf(s['startMode'], ['cold', 'hot'] as const)) return null;
  if (!oneOf(s['eggFrom'], ['fridge', 'room', 'custom'] as const)) return null;
  if (!oneOf(s['cooling'], ['ice', 'tap', 'counter'] as const)) return null;
  if (!oneOf(s['afterBoil'], ['hold', 'off'] as const)) return null;
  if (!isFiniteNumber(s['eggStart_C']) || !isFiniteNumber(s['ambient_C'])) return null;
  if (!isFiniteNumber(s['boiling_C']) || !(s['boiling_C'] > 0)) return null;
  if (!isFiniteNumber(s['timeToBoil_s']) || !(s['timeToBoil_s'] >= 0)) return null;
  if (!oneOf(s['timeToBoilFrom'], ['measured', 'remembered', 'default'] as const)) return null;
  if (!isFiniteNumber(s['waterLitres']) || !(s['waterLitres'] > 0)) return null;
  if (!isFiniteNumber(s['eggCount']) || !(s['eggCount'] >= 1)) return null;

  const level = raw['level'];
  if (!isFiniteNumber(level) || level < 0 || level > 1) return null;
  const recommended = raw['recommended_s'];
  const nudge = raw['nudge_s'];
  if (!isFiniteNumber(recommended) || !(recommended > 0)) return null;
  if (!isFiniteNumber(nudge) || !(recommended + nudge > 0)) return null;
  if (!isFiniteNumber(raw['pulled_s']) || !(raw['pulled_s'] > 0)) return null;
  if (!oneOf(raw['pulledBy'], ['cook', 'timeout'] as const)) return null;
  if (!isFiniteNumber(raw['cooled_s']) || !(raw['cooled_s'] >= 0)) return null;

  const yolk = raw['yolk'] ?? null;
  if (yolk !== null && yolk !== -1 && yolk !== 0 && yolk !== 1) return null;
  const white = raw['white'] ?? null;
  if (white !== null && white !== 'runny' && white !== 'tender' && white !== 'firm') return null;

  if (!nonEmptyString(raw['lang']) || !nonEmptyString(raw['register'])) return null;
  if (!oneOf(raw['units'], ['metric', 'imperial'] as const)) return null;

  const setup: RecordSetup = {
    startMode: s['startMode'],
    eggStart_C: s['eggStart_C'],
    eggFrom: s['eggFrom'],
    ambient_C: s['ambient_C'],
    boiling_C: s['boiling_C'],
    timeToBoil_s: s['timeToBoil_s'],
    timeToBoilFrom: s['timeToBoilFrom'],
    cooling: s['cooling'],
    afterBoil: s['afterBoil'],
    waterLitres: s['waterLitres'],
    eggCount: s['eggCount'],
  };

  // A reading at the centre: a number the egg could have been, and when
  // it was asked for, if that is known.
  const rawProbe = raw['probe'] ?? null;
  let probe: ProbeReading | null = null;
  if (rawProbe !== null) {
    if (!isObject(rawProbe)) return null;
    const centre = rawProbe['centre_C'];
    const after = rawProbe['after_s'] ?? null;
    if (!isFiniteNumber(centre) || !probePossible(setup, centre)) return null;
    if (after !== null && !(isFiniteNumber(after) && after >= 0)) return null;
    probe = { centre_C: centre, after_s: after };
  }

  const rawForecast = raw['forecast'] ?? null;
  const forecast = rawForecast === null ? null : parseForecast(rawForecast);
  if (rawForecast !== null && forecast === null) return null;

  return {
    v: RECORD_VERSION,
    uid: uid,
    day: raw['day'],
    app: raw['app'],
    appVersion: raw['appVersion'],
    prior: raw['prior'],
    model: model,
    egg: { mass_g: egg['mass_g'], massFrom: egg['massFrom'], sizeTable: table as SizeTable | null },
    setup: setup,
    level: level,
    recommended_s: recommended,
    nudge_s: nudge,
    pulled_s: raw['pulled_s'],
    pulledBy: raw['pulledBy'],
    cooled_s: raw['cooled_s'],
    yolk: yolk as Feedback | null,
    white: white as WhiteReport | null,
    probe: probe,
    forecast: forecast,
    lang: raw['lang'],
    register: raw['register'],
    units: raw['units'],
  };
}

/** Every record, or null if any one of them fails. A log is folded in order, so
 *  a hole in it would silently change what every later egg is scored against;
 *  the caller refuses the whole log rather than guess around it. */
export function parseLog(raw: unknown): EggRecord[] | null {
  if (!Array.isArray(raw)) return null;
  const out: EggRecord[] = new Array<EggRecord>(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const r = parseRecord(raw[i]);
    if (r === null) return null;
    out[i] = r;
  }
  return out;
}

/* ------------------------------------------------------------------- fold */

/** A posterior and the number of eggs that taught it. The count is part of the
 *  state, not a statistic: while it is zero the app solves with the literature
 *  values, and the first egg's grid is centred on them rather than on the
 *  prior's mean - so a replay has to carry it exactly as the app does. */
export interface Calibration {
  posterior: Posterior;
  eggsLogged: number;
  /** Where to solve while no egg has taught anything: the centre of the
   *  population the prior was drawn from (population.ts). The literature's
   *  values when absent, as they always were. */
  start?: PriorStart;
}

/** A prior of `count` particles from `seed`, drawn from a population - the
 *  literature's unless another is given - and starting at its centre. */
export function freshCalibration(
  count: number, seed: number, pop: Population = LITERATURE_POPULATION,
): Calibration {
  return { posterior: createPrior(count, seed, pop), eggsLogged: 0, start: priorStart(pop) };
}

/** A deep copy, so a replay never moves the base it started from. */
export function copyCalibration(c: Calibration): Calibration {
  const n = c.posterior.particles.length;
  const particles: Particle[] = new Array<Particle>(n);
  const weights: number[] = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const p = c.posterior.particles[i];
    particles[i] = {
      alpha_m2s: p.alpha_m2s, logDoseOffset: p.logDoseOffset, tauAirScale: p.tauAirScale,
      noise: p.noise, whiteOffset: p.whiteOffset, whiteFirmGap: p.whiteFirmGap,
    };
    weights[i] = c.posterior.weights[i];
  }
  const copy: Calibration = {
    posterior: { particles: particles, weights: weights, rng: c.posterior.rng },
    eggsLogged: c.eggsLogged,
  };
  if (c.start !== undefined) copy.start = { ...c.start };
  return copy;
}

/** Parameters to solve with. Before any egg this is the prior's centre - the
 *  population's median time-scale and carryover, which for the literature are
 *  the literature values - so calibration is purely additive. */
export function calibrationParams(c: Calibration): ModelParams {
  if (c.eggsLogged === 0) {
    if (c.start === undefined) return DEFAULT_PARAMS;
    return { alpha_m2s: c.start.alpha_m2s, tauAirScale: c.start.tauAirScale };
  }
  return posteriorParams(c.posterior);
}

/**
 * The doneness to solve for: the slider's yolk target, and the white's target
 * moved by what the eggs have said about the white.
 *
 * The solver's white constraint IS the runny | tender cutpoint, so a cook
 * whose whites come out runny moves it up, and the shortest cook that sets the
 * white moves later. Where that is still short of the yolk's own time - a jammy
 * egg, usually - nothing changes; where it is not - a soft one - the soft time
 * gets later, or the slider is refused and snapped up, as any unreachable
 * doneness is. Before any egg it is the literature target exactly.
 */
export function calibrationDoneness(c: Calibration, level: number): Doneness {
  const d = donenessFromSlider(level);
  // Before any egg, the population's mean white offset: none for the
  // literature, which is the literature target exactly.
  const offset = c.eggsLogged > 0 ? posteriorMeanWhiteOffset(c.posterior)
    : c.start === undefined ? 0.0 : c.start.whiteOffset;
  if (c.eggsLogged === 0 && offset === 0.0) return d;
  return {
    level: d.level,
    yolkDose_min: d.yolkDose_min,
    whiteDose_min: WHITE_DOSE_TARGET * Math.pow(10.0, offset),
  };
}

/** Whether a record has anything to fold: an answer, or a probe reading. An
 *  egg nobody answered about is still
 *  a record - the cook, the recommendation and the pull are data for the fit -
 *  but it moves no particle and does not count as an egg the model learned from. */
export function recordTeaches(r: EggRecord): boolean {
  return r.yolk !== null || r.white !== null || r.probe !== null;
}

/** The egg the fold sees. */
function recordEggOf(r: EggRecord): Egg {
  return eggFromMass(r.egg.mass_g / 1000);
}

function recordSetupOf(r: EggRecord): CookSetup {
  return {
    startMode: r.setup.startMode,
    eggStart_C: r.setup.eggStart_C,
    ambient_C: r.setup.ambient_C,
    boiling_C: r.setup.boiling_C,
    timeToBoil_s: r.setup.timeToBoil_s,
    cooling: r.setup.cooling,
    afterBoil: r.setup.afterBoil,
    waterLitres: r.setup.waterLitres,
    eggCount: r.setup.eggCount,
  };
}

/** The cook time the likelihood is scored at: when the cook said the egg came
 *  out, if they said, and the schedule if they did not. See the header. */
export function recordCookTime_s(r: EggRecord): number {
  return r.pulledBy === 'cook' ? r.pulled_s : r.recommended_s + r.nudge_s;
}

/** The surface this record is scored on, centred where the posterior stands
 *  NOW - before the egg is folded. */
export function gridRequestFor(c: Calibration, r: EggRecord, grid: GridPolicy): GridRequest {
  const params = calibrationParams(c);
  return {
    egg: recordEggOf(r),
    setup: recordSetupOf(r),
    tauAirScale: params.tauAirScale,
    spec: grid(params.alpha_m2s, recordCookTime_s(r)),
  };
}

/**
 * Fold one record - its answers and its probe reading, whichever it has -
 * against the
 * surface `gridRequestFor` described, and count the egg if it teaches anything.
 *
 * One fold per egg (see `updatePosterior`). An app that folds the first answer
 * and then hears the second folds the egg AGAIN, from a copy of the calibration
 * as it stood before the egg and against the same surface, so what it holds is
 * exactly what a replay of the log will make.
 *
 * Mutates `c`, like `updatePosterior`.
 */
export function foldRecord(c: Calibration, r: EggRecord, grid: DoseGrid): void {
  if (!recordTeaches(r)) return;
  updatePosterior(
    c.posterior, grid, recordCookTime_s(r), logYolkTarget(r.level), r.yolk, r.white,
    r.probe === null ? null : r.probe.centre_C,
  );
  c.eggsLogged += 1;
}

/**
 * Rebuild a posterior from a starting point and a log.
 *
 * The start is the prior (`freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED)`)
 * or, where a damaged log had to be dropped, the posterior that log had taught
 * (the apps' `rebased` path). It is copied, never moved.
 *
 * Each egg is exactly what the app did when it was answered: a surface centred
 * on the posterior as it then stood, and both answers folded against it. An egg
 * with no answer is skipped, and builds no surface.
 */
export function replay(
  start: Calibration, records: EggRecord[], grid: GridPolicy = calibrationGrid,
): Calibration {
  const c = copyCalibration(start);
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!recordTeaches(r)) continue;
    foldRecord(c, r, buildRequestedGrid(gridRequestFor(c, r, grid)));
  }
  return c;
}
