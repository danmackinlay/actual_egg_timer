/**
 * The record: one observation per egg, kept beside the posterior.
 *
 * Until E1 each answer was folded into the particles and thrown away, so the
 * only thing a phone knew about its eggs was the posterior they had left
 * behind. When the likelihood changed in September the v1 posterior had to be
 * discarded rather than repaired, because nothing was left to repair it FROM.
 * With the observations kept, a change to the likelihood is a replay of the
 * log, and every egg already cooked counts under the new model.
 *
 * The schema is INFERENCE.md section 4, and this file is its reference
 * implementation; `EggTimerCore/Record.swift` is held to it by
 * `fixtures/record.json`.
 *
 * WHAT A FOLD READS. The posterior is a function of the log and of nothing
 * else: both apps fold an egg FROM ITS RECORD, through `gridRequestFor` and
 * `foldYolk` / `foldWhite` below, and `replay` is those same calls in a loop.
 * That is what makes the posterior rebuilt from the log bit-identical to the
 * one built egg by egg - not a comparison that happens to pass, but one path
 * taken twice. The price is that the fold sees the egg the record describes
 * (a mass rounded to 0.01 g) rather than the one the solver timed, which is
 * 0.02% of an egg and a hundredth of a second of cook.
 *
 * WHAT E1 DOES NOT CHANGE. The likelihood is the one in `infer.ts`, untouched.
 * It is scored at the SCHEDULED cook time, `recommended_s + nudge_s`, exactly
 * as before; the measured pull time is recorded but not yet used, because using
 * it is a change to the model, and model changes are E2's, made once, by replay.
 *
 * Pure, like the rest of `src/core/`: the day, the times and the version are
 * handed in; nothing here reads a clock.
 */

import { Egg, SizeTable, eggFromMass } from './geometry.js';
import { CookSetup, Cooling, HeatAfterBoil, StartMode } from './protocol.js';
import { DEFAULT_PARAMS, ModelParams, donenessFromSlider } from './solve.js';
import { DoseGrid, buildDoseGrid } from './doseGrid.js';
import {
  Feedback, Particle, Posterior, WhiteReport, createPrior, posteriorParams, shouldAskAboutWhite,
  updatePosterior, updateWhite,
} from './infer.js';
import { GridSpec, calibrationGrid } from './policy.js';

/** The schema version. A loader refuses any other: a record from a later
 *  schema means something this code does not know how to fold. */
export const RECORD_VERSION = 1;

/** Which prior the record's cook was recommended under: the literature prior,
 *  `PARTICLE_COUNT` particles from `CALIBRATION_SEED`, as of September 2026.
 *  Recorded so a later fit knows what policy put the data where it lies. */
export const PRIOR_ID = '2026-09';

/** Where the egg's mass came from. A size class is a 10 g bucket, worth about
 *  +-24 s; a scale is a gram. The fit reads this as egg-level noise. */
export type MassFrom = 'scale' | 'girth' | 'width' | 'class';

/** Where the egg's starting temperature came from: a preset or a typed value. */
export type EggFrom = 'fridge' | 'room' | 'custom';

/** How the egg came out. `cook` when the cook said so - the tap out of PULL -
 *  and `timeout` when nobody did and the grace ran out, in which case
 *  `pulled_s` is the scheduled time, an assumption and not a measurement. */
export type PulledBy = 'cook' | 'timeout';

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
  boiling_C: number;
  timeToBoil_s: number;
  cooling: Cooling;
  afterBoil: HeatAfterBoil;
  waterLitres: number;
  eggCount: number;
}

export interface EggRecord {
  v: 1;
  /** The cook's random id. Null until E6 mints one; never derived from anything. */
  uid: string | null;
  /** The local date the cook started, YYYY-MM-DD. A day, not a timestamp. */
  day: string;
  app: AppName;
  appVersion: string;
  prior: string;
  egg: RecordEgg;
  setup: RecordSetup;
  /** The doneness slider position the cook was RUN at, [0, 1]. */
  level: number;
  /** What the solver said, s from egg-in to egg-out. */
  recommended_s: number;
  /** What the app added to it on purpose (E8). Zero until then. */
  nudge_s: number;
  /** When the egg came out, s from egg-in. See `pulledBy`. */
  pulled_s: number;
  pulledBy: PulledBy;
  /** The counted cooling the app ran, s; 0 on the counter, where there is none. */
  cooled_s: number;
  /** The yolk answer, or null when the question was on screen and the cook
   *  moved on without answering. */
  yolk: Feedback | null;
  /** The white answer. Three states, not two, because today the white is only
   *  sometimes asked about (`shouldAskAboutWhite`):
   *    whiteOffered false, white null   - not asked
   *    whiteOffered true,  white null   - asked, and skipped
   *    whiteOffered true,  white answer - answered
   *  A null alone could not tell the first two apart, and they mean different
   *  things: the first is the model's choice, the second the cook's. */
  white: WhiteReport | null;
  whiteOffered: boolean;
  /** A thermometer reading (E4). Null until then. */
  probe: null;
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
 * reinterpreted, so unknown fields are ignored here, and the nullable fields
 * (`uid`, `egg.sizeTable`, `yolk`, `white`, `probe`) may be absent and read as
 * null - which is
 * also what Swift's Codable does, and the fixtures hold the two to it.
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
  if (white !== null && white !== 'runny' && white !== 'set') return null;
  const offered = raw['whiteOffered'];
  if (typeof offered !== 'boolean') return null;
  // An answer to a question that was never asked is not an observation.
  if (white !== null && !offered) return null;
  if ((raw['probe'] ?? null) !== null) return null;

  if (!nonEmptyString(raw['lang']) || !nonEmptyString(raw['register'])) return null;
  if (!oneOf(raw['units'], ['metric', 'imperial'] as const)) return null;

  return {
    v: RECORD_VERSION,
    uid: uid,
    day: raw['day'],
    app: raw['app'],
    appVersion: raw['appVersion'],
    prior: raw['prior'],
    egg: { mass_g: egg['mass_g'], massFrom: egg['massFrom'], sizeTable: table as SizeTable | null },
    setup: {
      startMode: s['startMode'],
      eggStart_C: s['eggStart_C'],
      eggFrom: s['eggFrom'],
      ambient_C: s['ambient_C'],
      boiling_C: s['boiling_C'],
      timeToBoil_s: s['timeToBoil_s'],
      cooling: s['cooling'],
      afterBoil: s['afterBoil'],
      waterLitres: s['waterLitres'],
      eggCount: s['eggCount'],
    },
    level: level,
    recommended_s: recommended,
    nudge_s: nudge,
    pulled_s: raw['pulled_s'],
    pulledBy: raw['pulledBy'],
    cooled_s: raw['cooled_s'],
    yolk: yolk as Feedback | null,
    white: white as WhiteReport | null,
    whiteOffered: offered,
    probe: null,
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
}

export function freshCalibration(count: number, seed: number): Calibration {
  return { posterior: createPrior(count, seed), eggsLogged: 0 };
}

/** A deep copy, so a replay never moves the base it started from. */
export function copyCalibration(c: Calibration): Calibration {
  const n = c.posterior.particles.length;
  const particles: Particle[] = new Array<Particle>(n);
  const weights: number[] = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const p = c.posterior.particles[i];
    particles[i] = { alpha_m2s: p.alpha_m2s, logDoseOffset: p.logDoseOffset, tauAirScale: p.tauAirScale };
    weights[i] = c.posterior.weights[i];
  }
  return {
    posterior: { particles: particles, weights: weights, rng: c.posterior.rng },
    eggsLogged: c.eggsLogged,
  };
}

/** Parameters to solve with. Before any egg this is the prior mean's stand-in,
 *  the literature values, so calibration is purely additive. */
export function calibrationParams(c: Calibration): ModelParams {
  if (c.eggsLogged === 0) return DEFAULT_PARAMS;
  return posteriorParams(c.posterior);
}

/** Whether a record has anything to fold. An egg nobody answered about is still
 *  a record - the cook, the recommendation and the pull are data for the fit -
 *  but it moves no particle and does not count as an egg the model learned from. */
export function recordTeaches(r: EggRecord): boolean {
  return r.yolk !== null || r.white !== null;
}

/** The egg the fold sees. */
export function recordEggOf(r: EggRecord): Egg {
  return eggFromMass(r.egg.mass_g / 1000);
}

export function recordSetupOf(r: EggRecord): CookSetup {
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

/** The cook time the likelihood is scored at: the scheduled one. See the header. */
export function recordCookTime_s(r: EggRecord): number {
  return r.recommended_s + r.nudge_s;
}

/** log10 of the nominal yolk dose the cook was run at. */
export function recordLogTarget(r: EggRecord): number {
  return Math.log10(donenessFromSlider(r.level).yolkDose_min);
}

/** Where the dose surface goes, given its centre and the cook. Production is
 *  `calibrationGrid`; the fixtures and tests pass a coarser one so a replay of
 *  several eggs costs a fraction of a second rather than several. */
export type GridPolicy = (alphaCentre: number, cookTime_s: number) => GridSpec;

/** Everything a dose-surface build needs, as plain data, so it can be posted to
 *  a Web Worker and built there by `buildRequestedGrid`. */
export interface GridRequest {
  egg: Egg;
  setup: CookSetup;
  tauAirScale: number;
  spec: GridSpec;
}

/** The surface this record is scored on, centred where the posterior stands
 *  NOW - before the egg is folded - exactly as `recordOutcome` always did. */
export function gridRequestFor(c: Calibration, r: EggRecord, grid: GridPolicy): GridRequest {
  const params = calibrationParams(c);
  return {
    egg: recordEggOf(r),
    setup: recordSetupOf(r),
    tauAirScale: params.tauAirScale,
    spec: grid(params.alpha_m2s, recordCookTime_s(r)),
  };
}

export function buildRequestedGrid(q: GridRequest): DoseGrid {
  return buildDoseGrid(
    q.egg, q.setup, q.tauAirScale,
    q.spec.alphaMin, q.spec.alphaMax, q.spec.alphaCount,
    q.spec.timeMin_s, q.spec.timeMax_s, q.spec.timeCount,
  );
}

/**
 * Fold the yolk answer of one record, against the surface `gridRequestFor`
 * described. Counts the egg if it teaches anything at all, and returns whether
 * the white is worth asking about - decided AFTER the fold, as both apps always
 * have, because the yolk answer has just moved alpha and the predicted white
 * with it.
 *
 * Mutates `c`, like `updatePosterior`.
 */
export function foldYolk(c: Calibration, r: EggRecord, grid: DoseGrid): boolean {
  const cookTime_s = recordCookTime_s(r);
  if (r.yolk !== null) {
    updatePosterior(c.posterior, grid, cookTime_s, recordLogTarget(r), r.yolk);
  }
  if (recordTeaches(r)) c.eggsLogged += 1;
  return shouldAskAboutWhite(c.posterior, grid, cookTime_s);
}

/** Fold the white answer of the same record, against the same surface. Not a
 *  second egg, so the count does not move. */
export function foldWhite(c: Calibration, r: EggRecord, grid: DoseGrid): void {
  if (r.white === null) return;
  updateWhite(c.posterior, grid, recordCookTime_s(r), r.white);
}

/**
 * Rebuild a posterior from a starting point and a log.
 *
 * The start is the prior (`freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED)`)
 * or, for the one phone that learned before there was a log, the frozen base
 * that phone migrated with. It is copied, never moved.
 *
 * Each egg is exactly what the app did when it was answered: a surface centred
 * on the posterior as it then stood, the yolk folded, then the white against the
 * same surface. An egg with no answer is skipped, and builds no surface.
 */
export function replay(
  start: Calibration, records: EggRecord[], grid: GridPolicy = calibrationGrid,
): Calibration {
  const c = copyCalibration(start);
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!recordTeaches(r)) continue;
    const surface = buildRequestedGrid(gridRequestFor(c, r, grid));
    foldYolk(c, r, surface);
    foldWhite(c, r, surface);
  }
  return c;
}
