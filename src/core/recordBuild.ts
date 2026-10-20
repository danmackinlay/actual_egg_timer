/**
 * Building a record (src/core/record.ts): an app's facts about one cook, and
 * the record both apps make of them.
 */

import type { SizeTable } from './geometry.ts';
import { type CookSetup, countsDown } from './protocol.ts';
import type { WhiteReport, YolkWord } from './infer.ts';
import { isPeriod } from './copy.ts';
import {
  type AppName, type EggFrom, type EggRecord, type Forecast, MODEL_ID, type MassFrom, type ProbeReading, RECORD_VERSION,
  type Units, recordMass_g, recordProbe_C,
} from './recordSchema.ts';
import { recordCookTime_s } from './recordFold.ts';

/* ------------------------------------------------------------- the making */

/* WHO MAKES A RECORD. Both apps, from the same facts, through `recordFor`:
 * the record is the fit's training data, and two hand copies of how it is
 * assembled had begun to drift in how they read the same cook. Each app
 * gathers its facts - off the web's ticket and machine, off iOS's ticket and
 * dates - and says nothing else; fixtures/record.json holds the two to one
 * answer for every branch. The facts carry no clock: the day and the start
 * are read by the app, which knows the time zone. */

/**
 * What an app knows about one cook when it writes its egg down: what was
 * frozen at "Eggs in", how the cook went, and whichever answers have been
 * given so far. SI, and every time in s from egg-in.
 */
export interface CookFacts {
  app: AppName;
  appVersion: string;
  /** The population the cook's prior was drawn from: the record's `prior`. */
  prior: string;
  /** The local date the cook started, YYYY-MM-DD, by the app's clock. */
  day: string;
  /** The moment the cook started, whole ms since 1970 UTC, which the web
   *  keeps so that one cook in two tabs is one egg; null on iOS, which runs
   *  one cook at a time. The record has no `id` then. */
  id: number | null;
  /** The egg as the solver was told it. */
  mass_kg: number;
  massFrom: MassFrom;
  /** The cook's carton, read only when `massFrom` is a class: none named
   *  is the European one. */
  sizeTable: SizeTable | null;
  /** The pot as the cook ran it, with the time to boil this cook measured,
   *  if it did. */
  setup: CookSetup;
  eggFrom: EggFrom;
  /** Whether a measured pan was on file at "Eggs in". Read only on a hot
   *  start, which never times its own pan; a finished cold start has. */
  boilRemembered: boolean;
  /** On a cold start, whether this cook's own boil tap set its time to boil.
   *  Absent is true, as on every cold start before 0.5; false when the tap
   *  came after a late correction to cold and the remembered pan was used.
   *  Not read on a hot start. */
  boilTapped?: boolean;
  /** The doneness the cook was RUN at, [0, 1]. */
  level: number;
  /** The cook time that ran, egg-in to the scheduled pull: what was
   *  recommended, with the nudge in it. */
  cook_s: number;
  /** The nudge in that time, which the record keeps apart. */
  nudge_s: number;
  /** When the cook tapped out of PULL, or null when nobody did and the
   *  grace ran out. A tap at or before egg-in measures nothing. */
  out_s: number | null;
  /** How long the counted cooling ran from the pull: read only for a
   *  cooling that is counted (`countsDown`). */
  cool_s: number;
  yolkWord: YolkWord | null;
  white: WhiteReport | null;
  probe: ProbeReading | null;
  /** What the app said at "Eggs in", or null. */
  forecast: Forecast | null;
  /** The catalogue the cook was reading: the record's `lang`, and through
   *  it `register`. */
  lang: string;
  units: Units;
}

/**
 * The record of one egg, from its facts.
 *
 * The pull is MEASURED when the cook tapped out of PULL after egg-in -
 * `pulledBy: 'cook'`, at the tap - and ASSUMED when the grace ran out:
 * `pulledBy: 'timeout'`, at the scheduled time. The time that ran is split
 * into what was recommended and the nudge added on purpose (INFERENCE.md
 * section 4). `id` is written only when there is one: the web's.
 */
export function recordFor(f: CookFacts): EggRecord {
  const measured = f.out_s !== null && f.out_s > 0;
  const s = f.setup;
  const r: EggRecord = {
    v: RECORD_VERSION,
    uid: null,
    day: f.day,
    ...(f.id === null ? {} : { id: f.id }),
    app: f.app,
    appVersion: f.appVersion,
    prior: f.prior,
    model: MODEL_ID,
    egg: {
      mass_g: recordMass_g(f.mass_kg),
      massFrom: f.massFrom,
      sizeTable: f.massFrom === 'class' ? f.sizeTable ?? 'eu' : null,
    },
    setup: {
      startMode: s.startMode,
      eggStart_C: s.eggStart_C,
      eggFrom: f.eggFrom,
      ambient_C: s.ambient_C,
      boiling_C: s.boiling_C,
      timeToBoil_s: s.timeToBoil_s,
      timeToBoilFrom: s.startMode === 'cold' && f.boilTapped !== false
        ? 'measured' : f.boilRemembered ? 'remembered' : 'default',
      cooling: s.cooling,
      afterBoil: s.afterBoil ?? 'hold',
      waterLitres: s.waterLitres,
      eggCount: s.eggCount,
      ...coolingWaterRecorded(s),
      ...(s.startMode === 'cold' && s.panStart_C !== undefined ? { panStart_C: s.panStart_C } : {}),
    },
    level: f.level,
    recommended_s: f.cook_s - f.nudge_s,
    nudge_s: f.nudge_s,
    pulled_s: measured ? f.out_s as number : f.cook_s,
    pulledBy: measured ? 'cook' : 'timeout',
    cooled_s: countsDown(s.cooling) ? f.cool_s : 0,
    yolkWord: f.yolkWord,
    white: f.white,
    probe: f.probe,
    forecast: f.forecast,
    lang: f.lang,
    register: isPeriod(f.lang) ? '1750' : 'modern',
    units: f.units,
  };
  return r;
}

/** The water the eggs cooled in, as a record carries it: only what the
 *  cooling reads, so a record of an ice bath never says a bowl. */
function coolingWaterRecorded(s: CookSetup): { coolingWater_C?: number; bowlLitres?: number } {
  const out: { coolingWater_C?: number; bowlLitres?: number } = {};
  if ((s.cooling === 'tap' || s.cooling === 'bowl') && s.coolingWater_C !== undefined) {
    out.coolingWater_C = s.coolingWater_C;
  }
  if (s.cooling === 'bowl' && s.bowlLitres !== undefined) out.bowlLitres = s.bowlLitres;
  return out;
}

/**
 * A probe reading as the record carries it: the centre to a hundredth of a
 * degree, and when it was asked for - the end of the counted cooling,
 * `coolEnd_s` from egg-in - as seconds after the moment `r` scores as the
 * pull. Null for when, if there was no counted cooling or it ended before
 * that moment.
 */
export function probeReadingFor(r: EggRecord, centre_C: number, coolEnd_s: number | null): ProbeReading {
  const asked = coolEnd_s === null ? null : coolEnd_s - recordCookTime_s(r);
  return { centre_C: recordProbe_C(centre_C), after_s: asked !== null && asked >= 0 ? asked : null };
}
