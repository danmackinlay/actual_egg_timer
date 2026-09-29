/**
 * The cook that was started, frozen at "Eggs in": what the running cook's
 * screen describes, and the only thing the calibration is allowed to learn
 * from. Pure: nothing here reads the page or the controls.
 *
 * The calibration must learn from the egg that was actually cooked, not from
 * whatever the controls happen to say when the user gets round to answering
 * how the egg was - which may be after a reload, and is certainly after the
 * measured time to boil has replaced the guess. Everything the posterior
 * update needs is captured here and nowhere else.
 */

import { Egg, SizeTable } from '../core/geometry.js';
import { CookSetup } from '../core/protocol.js';
import { UnitSystem } from '../core/units.js';
import { EggFrom, MassFrom } from '../core/record.js';
import { Outcome } from '../core/outcome.js';
import { restoreOutcome } from './outcome.js';

/** The cook that was started: the only thing the calibration is allowed to
 *  learn from. */
export interface Ticket {
  egg: Egg;
  /** Which input the egg came from, whose carton if it was a class, and where
   *  its temperature came from. */
  massFrom: MassFrom;
  sizeTable: SizeTable | null;
  eggFrom: EggFrom;
  /** Whether the pan's time to boil was on file at "Eggs in": what a hot start,
   *  which never times its own pan, cooked on. */
  boilRemembered: boolean;
  setup: CookSetup;
  /** log10 of the yolk dose this cook was RUN at. Frozen with everything else,
   *  so a slider left somewhere else afterwards cannot rewrite history. */
  logNominalTarget: number;
  /** The system the cook was reading when they set this egg up, for the
   *  record. Everything above is SI whatever it says. */
  units: UnitSystem;
  /** How far the choice leaned from the mean solve at "Eggs in", s,
   *  carried onto a mid-cook re-solve (`carriedSolution`). Zero when the time
   *  was not chosen. */
  lean_s: number;
  /** What the egg was likely to be like at "Eggs in", shown for the whole
   *  cook. Null when the time was started before the odds were known. */
  outcome: Outcome | null;
  /** The peak yolk the cook was started with, C: what the line under the
   *  running cook's sentence says. */
  peakYolk_C: number;
  /** The language they were reading it in, for the record. */
  lang: string;
  /** Whether this cook has a moment to probe at: a counted cooling that
   *  ends when the yolk's centre peaks. Frozen with the cook, and moved only
   *  by the re-solve at the boil. */
  probeMoment: boolean;
}

/** The same cook, against a time to boil that is now known rather than
 *  guessed. Everything else about it is frozen. */
export function withTimeToBoil(t: Ticket, timeToBoil_s: number): Ticket {
  return { ...t, setup: { ...t.setup, timeToBoil_s: timeToBoil_s } };
}

/** A stored ticket, or null if it cannot be trusted. Partial is not good
 *  enough: this is what the posterior learns from. */
export function restoreTicket(raw: unknown): Ticket | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const target = r['logNominalTarget'];
  if (typeof target !== 'number' || !Number.isFinite(target)) return null;

  const egg = positiveFields(r['egg'], ['radius_m', 'minorDiameter_m', 'mass_kg', 'volume_m3']);
  if (egg === null) return null;

  const setup = r['setup'];
  if (setup === null || typeof setup !== 'object') return null;
  const st = setup as Record<string, unknown>;
  // Every number the solver will read. A partial setup does not throw - it
  // produces a plausible wrong answer, and then teaches it to the posterior.
  if (positiveFields(setup, ['boiling_C', 'waterLitres', 'eggCount']) === null) return null;
  for (const key of ['eggStart_C', 'ambient_C', 'timeToBoil_s']) {
    const value = st[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  }
  if (st['startMode'] !== 'cold' && st['startMode'] !== 'hot') return null;
  if (st['cooling'] !== 'ice' && st['cooling'] !== 'tap' && st['cooling'] !== 'counter') return null;
  // Required too: every `aet.cook.v2` ticket this build writes carries it
  // (`buildSetup`), and a missing one would be read as the heat held.
  if (st['afterBoil'] !== 'hold' && st['afterBoil'] !== 'off') return null;

  // Every field is required: the ticket is written whole by this build, and
  // one that is not whole is refused, not patched from the controls.
  const mf = r['massFrom'];
  const ef = r['eggFrom'];
  const tb = r['sizeTable'];
  if (mf !== 'scale' && mf !== 'girth' && mf !== 'width' && mf !== 'class') return null;
  if (ef !== 'fridge' && ef !== 'room' && ef !== 'custom') return null;
  if (mf === 'class' ? tb !== 'us' && tb !== 'eu' : tb !== null) return null;
  if (typeof r['boilRemembered'] !== 'boolean') return null;
  if (r['units'] !== 'metric' && r['units'] !== 'imperial') return null;
  const lang = r['lang'];
  if (typeof lang !== 'string' || lang === '') return null;
  const lean = r['lean_s'];
  if (typeof lean !== 'number' || !Number.isFinite(lean)) return null;
  const peak = r['peakYolk_C'];
  if (typeof peak !== 'number' || !Number.isFinite(peak)) return null;
  if (typeof r['probeMoment'] !== 'boolean') return null;
  // Null when the time was started before the odds were known.
  const outcome = restoreOutcome(r['outcome']);
  if (outcome === null && r['outcome'] !== null) return null;
  return {
    egg: egg as Egg,
    massFrom: mf,
    sizeTable: mf === 'class' ? tb as SizeTable : null,
    boilRemembered: r['boilRemembered'],
    eggFrom: ef,
    setup: setup as CookSetup,
    logNominalTarget: target,
    units: r['units'],
    lang: lang,
    lean_s: lean,
    outcome: outcome,
    peakYolk_C: peak,
    probeMoment: r['probeMoment'],
  };
}

/** The object, if every named field on it is a finite number above zero.
 *  Returns null rather than narrowing by assertion, so the cast at the end of
 *  `restoreTicket` is the last step rather than the only check. */
function positiveFields(raw: unknown, keys: string[]): object | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  for (const key of keys) {
    const value = r[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) return null;
  }
  return raw as object;
}
