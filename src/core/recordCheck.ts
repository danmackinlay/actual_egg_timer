/**
 * Checking a record (src/core/record.ts): what a loader trusts, a record
 * and a log at a time.
 */

import { SIZE_TABLES, type SizeTable } from './geometry.ts';
import { COOLINGS, HEATS_AFTER_BOIL, START_MODES, coldestTouched_C } from './protocol.ts';
import { WHITE_REPORTS, YOLK_WORDS } from './infer.ts';
import { UNIT_SYSTEMS } from './units.ts';
import {
  APP_NAMES, EGG_FROMS, type EggRecord, type Forecast, MASS_FROMS, PULLED_BYS, type ProbeReading, RECORD_VERSION,
  type RecordSetup, TIME_TO_BOIL_FROMS,
} from './recordSchema.ts';

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
  return answersOf(v, 3);
}

/** `count` probabilities that sum to one. */
function answersOf(v: unknown, count: number): v is number[] {
  if (!Array.isArray(v) || v.length !== count) return false;
  let sum = 0.0;
  for (let i = 0; i < count; i++) {
    const p: unknown = v[i];
    if (!isFiniteNumber(p) || p < 0 || p > 1) return false;
    sum += p;
  }
  return Math.abs(sum - 1.0) <= FORECAST_SUM_TOLERANCE;
}

/** How far a forecast's three answers may sum from one: far above what three
 *  doubles add up to, far below any probability that means something. */
export const FORECAST_SUM_TOLERANCE = 1e-6;

/** Whether `o` has `key` at all: a field today's records always write,
 *  null or not, is refused when it is missing. */
function has(o: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key);
}

/** A forecast, or null if it is not one: a positive time, two sets of three
 *  probabilities, and five for the yolk's words or null. A fresh object with
 *  exactly the known fields. */
export function parseForecast(raw: unknown): Forecast | null {
  if (!isObject(raw) || !has(raw, 'yolkWord')) return null;
  const t = raw['cook_s'];
  if (!isFiniteNumber(t) || !(t > 0)) return null;
  const yolk = raw['yolk'];
  const white = raw['white'];
  if (!threeAnswers(yolk) || !threeAnswers(white)) return null;
  const words = raw['yolkWord'];
  if (words !== null && !answersOf(words, 5)) return null;
  return {
    cook_s: t, yolk: [yolk[0], yolk[1], yolk[2]], white: [white[0], white[1], white[2]],
    yolkWord: words === null ? null : [words[0], words[1], words[2], words[3], words[4]],
  };
}

/**
 * Whether a centre reading is physically possible at all for this cook: no
 * colder than the coldest thing the egg touched and no hotter than the water
 * boiled. The loader's test, so it is deliberately loose; the apps refuse far
 * more at entry, against the physics of the cook (`plausibleProbeRange_C`).
 */
function probePossible(s: RecordSetup, centre_C: number): boolean {
  return Number.isFinite(centre_C) && centre_C >= coldestTouched_C(s) && centre_C <= s.boiling_C;
}

/** The nullable fields a record always carries, null or not. */
const ALWAYS_WRITTEN = ['uid', 'model', 'yolkWord', 'white', 'probe', 'forecast'];

/**
 * A record read back from storage, or null if it cannot be trusted.
 *
 * The rules are the stored posterior's (`readPosterior`,
 * src/ui/calibrationStore.ts): finite, and positive where the physics
 * needs it, because a record that passes here is folded into the posterior, and
 * a zero mass or a NaN cook time reaches a solve as a plausible wrong answer.
 * Ranges are physical rather than the UI's `LIMITS`, so a record never turns
 * on a bound the UI moves.
 *
 * Only today's shape reads: every field `recordFor` writes is there, null or
 * not, and only `id` may be absent (the iPhone app keeps none, and no record
 * sent carries one). Fields this code does not know are ignored, so a record
 * a newer build of the same schema wrote still reads. Any `appVersion` is
 * accepted under `v: 1`; Swift's Codable reads the same, and the fixtures
 * hold the two to it.
 *
 * Returns a fresh object with exactly the known fields, so what is folded is
 * what was checked.
 */
export function parseRecord(raw: unknown): EggRecord | null {
  if (!isObject(raw)) return null;
  if (raw['v'] !== RECORD_VERSION) return null;
  for (let i = 0; i < ALWAYS_WRITTEN.length; i++) {
    if (!has(raw, ALWAYS_WRITTEN[i])) return null;
  }

  const uid = raw['uid'];
  if (uid !== null && !nonEmptyString(uid)) return null;
  if (!isDay(raw['day'])) return null;
  // A moment, in whole milliseconds: what both apps' integers hold exactly.
  const id = has(raw, 'id') ? raw['id'] : null;
  if (id !== null && !(typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) return null;
  if (!oneOf(raw['app'], APP_NAMES)) return null;
  if (!nonEmptyString(raw['appVersion']) || !nonEmptyString(raw['prior'])) return null;
  const model = raw['model'];
  if (!nonEmptyString(model)) return null;

  const egg = raw['egg'];
  if (!isObject(egg) || !has(egg, 'sizeTable')) return null;
  if (!isFiniteNumber(egg['mass_g']) || !(egg['mass_g'] > 0)) return null;
  if (!oneOf(egg['massFrom'], MASS_FROMS)) return null;
  // A class names its carton; nothing else has one.
  const table = egg['sizeTable'];
  if (egg['massFrom'] === 'class' ? !oneOf(table, SIZE_TABLES) : table !== null) return null;

  const s = raw['setup'];
  if (!isObject(s)) return null;
  if (!oneOf(s['startMode'], START_MODES)) return null;
  if (!oneOf(s['eggFrom'], EGG_FROMS)) return null;
  if (!oneOf(s['cooling'], COOLINGS)) return null;
  if (!oneOf(s['afterBoil'], HEATS_AFTER_BOIL)) return null;
  if (!isFiniteNumber(s['eggStart_C']) || !isFiniteNumber(s['ambient_C'])) return null;
  if (!isFiniteNumber(s['boiling_C']) || !(s['boiling_C'] > 0)) return null;
  if (!isFiniteNumber(s['timeToBoil_s']) || !(s['timeToBoil_s'] >= 0)) return null;
  if (!oneOf(s['timeToBoilFrom'], TIME_TO_BOIL_FROMS)) return null;
  if (!isFiniteNumber(s['waterLitres']) || !(s['waterLitres'] > 0)) return null;
  if (!isFiniteNumber(s['eggCount']) || !(s['eggCount'] >= 1)) return null;
  // The water the eggs cooled in: a temperature only for running water or a
  // bowl, and a bowl always says how much water it held.
  const water = has(s, 'coolingWater_C') ? s['coolingWater_C'] : undefined;
  const bowl = has(s, 'bowlLitres') ? s['bowlLitres'] : undefined;
  const watered = s['cooling'] === 'tap' || s['cooling'] === 'bowl';
  if (water !== undefined && !(watered && isFiniteNumber(water))) return null;
  if (s['cooling'] === 'bowl' ? !(isFiniteNumber(bowl) && bowl > 0) : bowl !== undefined) return null;
  // A cold pan's water: only on a cold start, the only start that reads it.
  const pan = has(s, 'panStart_C') ? s['panStart_C'] : undefined;
  if (pan !== undefined && !(s['startMode'] === 'cold' && isFiniteNumber(pan))) return null;

  const level = raw['level'];
  if (!isFiniteNumber(level) || level < 0 || level > 1) return null;
  const recommended = raw['recommended_s'];
  const nudge = raw['nudge_s'];
  if (!isFiniteNumber(recommended) || !(recommended > 0)) return null;
  if (!isFiniteNumber(nudge) || !(recommended + nudge > 0)) return null;
  if (!isFiniteNumber(raw['pulled_s']) || !(raw['pulled_s'] > 0)) return null;
  if (!oneOf(raw['pulledBy'], PULLED_BYS)) return null;
  if (!isFiniteNumber(raw['cooled_s']) || !(raw['cooled_s'] >= 0)) return null;

  const yolkWord = raw['yolkWord'];
  if (yolkWord !== null && !oneOf(yolkWord, YOLK_WORDS)) return null;
  const white = raw['white'];
  if (white !== null && !oneOf(white, WHITE_REPORTS)) return null;

  if (!nonEmptyString(raw['lang']) || !nonEmptyString(raw['register'])) return null;
  if (!oneOf(raw['units'], UNIT_SYSTEMS)) return null;

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
    ...(water === undefined ? {} : { coolingWater_C: water as number }),
    ...(bowl === undefined ? {} : { bowlLitres: bowl as number }),
    ...(pan === undefined ? {} : { panStart_C: pan as number }),
  };

  // A reading at the centre: a number the egg could have been, and when
  // it was asked for, if that is known.
  const rawProbe = raw['probe'];
  let probe: ProbeReading | null = null;
  if (rawProbe !== null) {
    if (!isObject(rawProbe) || !has(rawProbe, 'after_s')) return null;
    const centre = rawProbe['centre_C'];
    const after = rawProbe['after_s'];
    if (!isFiniteNumber(centre) || !probePossible(setup, centre)) return null;
    if (after !== null && !(isFiniteNumber(after) && after >= 0)) return null;
    probe = { centre_C: centre, after_s: after };
  }

  const rawForecast = raw['forecast'];
  const forecast = rawForecast === null ? null : parseForecast(rawForecast);
  if (rawForecast !== null && forecast === null) return null;

  return {
    v: RECORD_VERSION,
    uid: uid,
    day: raw['day'],
    ...(id === null ? {} : { id: id }),
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
    yolkWord: yolkWord,
    white: white,
    probe: probe,
    forecast: forecast,
    lang: raw['lang'],
    register: raw['register'],
    units: raw['units'],
  };
}

/** A record as sharing sends it, and as the server keeps it: under the
 *  cook's random id, and without `id`, the moment the cook started, which
 *  never leaves the device (privacy/index.html). */
export function sharedRecord(r: EggRecord, uid: string | null): EggRecord {
  const out: EggRecord = { ...r, uid: uid };
  delete out.id;
  return out;
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
