/**
 * The cook in progress as the web stores it (`aet.cook`): written whole
 * (`storedCook`), and read back defensively (`readStoredCook`), whole or not
 * at all. What was fixed at the press, the start and the log are kept, and
 * the log is folded again by core's `foldCook`; nothing derived is stored as
 * truth. The iPhone stores its cook in the same shape, read by its own
 * reader (`StoredCook.swift`).
 */

import type { SizeTable } from '../core/geometry.ts';
import type { BoilMemory } from '../core/boil.ts';
import { YOLK_WORDS, type YolkWord } from '../core/infer.ts';
import { type ProbeReading, parseForecast } from '../core/record.ts';
import { type CookAsRan, type CookChoices, type CookEntry, type Pulled, type RunningCook, foldCook } from '../core/running.ts';
import { STORES, inFormat, stamped } from './stores.ts';

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
  const tapWater = raw['tapWater_C'];
  const bowlLitres = raw['bowlLitres'];
  const bowlWater = raw['bowlWater_C'];
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
  if (cooling !== 'ice' && cooling !== 'tap' && cooling !== 'bowl' && cooling !== 'counter') return null;
  if (tapWater !== null && !isNumber(tapWater)) return null;
  if (!isNumber(bowlLitres) || !(bowlLitres > 0)) return null;
  if (bowlWater !== null && !isNumber(bowlWater)) return null;
  if (!isNumber(water) || !(water > 0)) return null;
  if (!isNumber(count) || !(count > 0)) return null;
  if (!isNumber(altitude)) return null;
  if (!isNumber(level) || level < 0 || level > 1) return null;
  return {
    mass_kg: mass, massFrom: massFrom, sizeTable: massFrom === 'class' ? table as SizeTable : null,
    eggFrom: eggFrom, customStart_C: custom, room_C: room, startMode: start, afterBoil: after,
    cooling: cooling, tapWater_C: tapWater, bowlLitres: bowlLitres, bowlWater_C: bowlWater,
    waterLitres: water, eggCount: count, altitude_m: altitude, level: level,
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

/** A probe reading as the log keeps one, or none (JSON's null), as `.value`;
 *  null if it is neither. */
function readProbe(raw: unknown): { value: ProbeReading | null } | null {
  if (raw === null) return { value: null };
  if (!isObject(raw)) return null;
  const centre = raw['centre_C'];
  const after = raw['after_s'];
  if (!isNumber(centre) || (after !== null && !isNumber(after))) return null;
  return { value: { centre_C: centre, after_s: after } };
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
      if (!isNumber(at) || probe === null) return null;
      if (yolk !== null && !YOLK_WORDS.some((w) => w === yolk)) return null;
      if (white !== null && white !== 'runny' && white !== 'tender' && white !== 'firm') return null;
      return { kind: 'answered', at_s: at, yolkWord: yolk as YolkWord | null, white: white, probe: probe.value };
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
 * press, the start and the log are read, and the log folded again. A cook is
 * what the calibration learns from and what the alarms ring for, so a shape
 * this build cannot read is reported, not guessed at or patched from the
 * controls; the app drops it. Extra fields are ignored.
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

/** Whether the egg had been written down with an answer when the cook was
 *  stored: a cook stored as answered is read back as answered, so its egg
 *  is never logged a second time. */
export type KeptAnswers = 'none' | 'beforeReload';

/** A cook in progress as this app stores it (`STORES.cook`), so a reload
 *  does not lose the egg: the cook, whether its egg was answered, and the
 *  lean last decided, the interim while its surface is rebuilt. */
export interface StoredCook {
  cook: RunningCook;
  answers: KeptAnswers;
  leanHint_s: number;
}

/** A stored cook as it is written: the cook's id, nudge, pans, units,
 *  language, start and log, and no more, since the rest is the log folded. */
export function storedCook(s: StoredCook): Record<string, unknown> {
  const c = s.cook;
  return stamped(STORES.cook, {
    cook: {
      id_ms: c.id_ms, nudge_s: c.nudge_s, boilMemory: c.boilMemory, units: c.units, lang: c.lang, start: c.start,
      log: c.log,
    },
    answers: s.answers,
    leanHint_s: s.leanHint_s,
  });
}

/** A stored cook read back, parsed JSON: whole, or null for one in another
 *  format, one whose cook does not read (`readRunningCook`), and one without
 *  a known `answers`, which read as unanswered would log its egg twice. */
export function readStoredCook(raw: unknown): StoredCook | null {
  const o = inFormat(STORES.cook, raw);
  if (o === null) return null;
  const cook = readRunningCook(o['cook']);
  const answers = o['answers'];
  const hint = o['leanHint_s'];
  if (cook === null || (answers !== 'none' && answers !== 'beforeReload') || !isNumber(hint)) return null;
  return { cook: cook, answers: answers, leanHint_s: hint };
}
