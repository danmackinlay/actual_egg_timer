/**
 * The record of one egg (INFERENCE.md section 4), from the cook that was
 * started and the machine that ran it. What a record holds is core's
 * (`recordFor`, src/core/record.ts, iOS's too); this gathers the web's facts
 * for it.
 */

import { Egg, SizeTable } from '../core/geometry.js';
import { CookSetup } from '../core/protocol.js';
import { WhiteReport, YolkWord } from '../core/infer.js';
import { CookFacts, EggFrom, EggRecord, Forecast, MassFrom, ProbeReading, recordFor } from '../core/record.js';
import { UnitSystem } from '../core/units.js';
import { Machine } from './machine.js';
import { activePopulation } from './population.js';
import { APP_VERSION } from './version.js';

/** What a cook was, frozen at "Eggs in" - the fields of the ticket
 *  (ticket.ts) that a record needs. */
export interface Cooked {
  egg: Egg;
  massFrom: MassFrom;
  sizeTable: SizeTable | null;
  setup: CookSetup;
  /** Whether a measured pan was on file at "Eggs in". Read only on a hot start,
   *  which never times its own pan; a finished cold start always has. */
  boilRemembered: boolean;
  eggFrom: EggFrom;
  /** The system the cook was reading at "Eggs in". The record stays SI; this
   *  says only what was on screen, so the fit can look for rounding at input. */
  units: UnitSystem;
  /** The language the cook was reading at "Eggs in": the UI's, a catalogue
   *  tag such as `en`, or `en-x-1750` for the English of 1750, whose
   *  record also says `register: '1750'` (`registerOf`). */
  lang: string;
  /** What the app said at "Eggs in", for the record; null when the time was
   *  started before the odds were known. */
  forecast: Forecast | null;
  /** The nudge in the time that ran (E8), which the record keeps apart from
   *  what was recommended. */
  nudge_s: number;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** The LOCAL date a cook started on. A day, not a timestamp. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** The record of one egg (`recordFor`, in core), from the cook that was
 *  started and the machine that ran it, with whichever answers have been
 *  given so far, and the probe reading if there is one. */
export function eggRecordFor(
  c: Cooked, m: Machine, yolk: YolkWord | null, white: WhiteReport | null = null,
  probe: ProbeReading | null = null,
): EggRecord {
  return recordFor(cookFactsOf(c, m, yolk, white, probe));
}

/** The facts `recordFor` makes the record of (core), off the ticket and the
 *  machine. The pull was the cook's only when they tapped out of PULL. */
function cookFactsOf(
  c: Cooked, m: Machine, yolk: YolkWord | null, white: WhiteReport | null = null,
  probe: ProbeReading | null = null,
): CookFacts {
  return {
    app: 'web',
    appVersion: APP_VERSION,
    prior: activePopulation().id,
    day: localDay(m.startedAt_ms),
    id: Math.round(m.startedAt_ms),
    mass_kg: c.egg.mass_kg,
    massFrom: c.massFrom,
    sizeTable: c.sizeTable,
    setup: c.setup,
    eggFrom: c.eggFrom,
    boilRemembered: c.boilRemembered,
    level: m.targetLevel,
    cook_s: m.cookTime_s,
    nudge_s: c.nudge_s,
    out_s: m.pulledBy === 'cook' ? (m.outAt_ms - m.startedAt_ms) / 1000 : null,
    cool_s: m.cool_s,
    yolkWord: yolk,
    white: white,
    probe: probe,
    forecast: c.forecast,
    lang: c.lang,
    units: c.units,
  };
}
