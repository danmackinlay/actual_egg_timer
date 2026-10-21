/**
 * The record's wire schema (src/core/record.ts): the ids a record carries,
 * the lists its fields take, and the record itself.
 */

import type { SizeTable } from './geometry.ts';
import type { Cooling, HeatAfterBoil, StartMode } from './protocol.ts';
import type { WhiteReport, YolkWord } from './infer.ts';
import type { Outcome } from './outcome.ts';
import type { UnitSystem } from './units.ts';

/** The schema version. A loader refuses any other: a record from a later
 *  schema means something this code does not know how to fold. */
export const RECORD_VERSION = 1;

/* WHICH PRIOR. A record's `prior` is the id of the population the cook's
 * prior was drawn from (population.ts): '2026-09', the literature's, until a
 * fit publishes another. Older ids, which named the policy too, are
 * INFERENCE.md section 4's; the policy is `model`'s to say. */

/** The code that made the record's forecast and chose its time: the
 *  likelihood, the decision and the nudge. Changed whenever any of
 *  them changes, so that the model as it SHIPPED can be scored after the code
 *  has moved on; a replay can only say what the current code
 *  would have said.
 *
 *  It is the record's provenance (`model`, sent with each record, read by the
 *  fit) and never decides a replay: `LIKELIHOOD_ID` does. A new likelihood
 *  is a new model too, since the forecast is the posterior's, so this moves
 *  whenever that does; a change to the decision or the nudge alone moves
 *  only this. */
export const MODEL_ID = '2026-10-e11';

/** What THIS code makes of a log: the prior's draw from a population, the
 *  physics and the likelihood, which together are the fold. Both apps keep it
 *  beside the posterior (the store's `m`) and replay the log when it differs
 *  (`loadDecision`), so the posterior is always this code's. Moved only when
 *  the fold moves: a change to the decision alone leaves every posterior as
 *  it was. fixtures/record.json keeps a digest of a fixed log's replay
 *  beside it, and its generator (tools/fixtures/record.ts) refuses a digest
 *  that moved under the same id, so a change to the fold fails there until
 *  this moves. */
export const LIKELIHOOD_ID = '2026-10-e10';

/** Where the egg's mass came from. A size class is a 10 g bucket; a scale is
 *  a gram. The fit reads this as egg-level noise. */
export type MassFrom = typeof MASS_FROMS[number];

/** Every source of a mass, as a record may carry one. */
export const MASS_FROMS = ['scale', 'girth', 'width', 'class'] as const;

/** Where the egg's starting temperature came from: a preset or a typed value. */
export type EggFrom = typeof EGG_FROMS[number];

/** Every source of the egg's temperature, as a record may carry one. */
export const EGG_FROMS = ['fridge', 'room', 'custom'] as const;

/** Where the solve's time to boil came from. `measured` is this cook's own boil
 *  tap, and every finished cold start has one, because neither app leaves
 *  HEATING without it; but a tap after a late correction to cold is not
 *  trusted, and that cook runs on the `remembered` pan. A hot start never times the pan, so it cooks on the
 *  `remembered` pan, or on the `default` guess when no pan has ever been
 *  measured. With the heat off, records from before the standing method's pan
 *  constant came from the water volume (`panTimeConstant`) took the pan's
 *  whole cooling curve from this number, so this also says how hard those
 *  cooks leaned on it. */
type TimeToBoilFrom = typeof TIME_TO_BOIL_FROMS[number];

/** Every source of the time to boil, as a record may carry one. */
export const TIME_TO_BOIL_FROMS = ['measured', 'remembered', 'default'] as const;


/** How the egg came out. `cook` when the cook said so - the tap out of PULL -
 *  and `timeout` when nobody did and the grace ran out, in which case
 *  `pulled_s` is the scheduled time, an assumption and not a measurement. */
export type PulledBy = typeof PULLED_BYS[number];

/** Both ways out, as a record may carry one. */
export const PULLED_BYS = ['cook', 'timeout'] as const;

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
 * What the app said at "Eggs in": the probability of each
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
  /** P(too soft), P(just right), P(too firm): the miss around the level
   *  asked for, which the time was chosen on. */
  yolk: number[];
  /** P(runny), P(tender), P(firm). */
  white: number[];
  /** P(runny), P(soft), P(jammy), P(fudgy), P(hard): the yolk the cook will
   *  say they got, which is the question asked. Null when
   *  the outcome on screen had none. */
  yolkWord: number[] | null;
}

/** The forecast a ticket keeps: the outcome on screen at "Eggs in", and the
 *  time it was for. */
export function forecastOf(o: Outcome, cook_s: number): Forecast {
  return {
    cook_s: cook_s,
    yolk: [o.pTooSoft, o.pJustRight, o.pTooFirm],
    white: [o.pWhiteRunny, o.pWhiteTender, o.pWhiteFirm],
    yolkWord: o.pYolkWord === null ? null : o.pYolkWord.slice(),
  };
}

export type AppName = typeof APP_NAMES[number];
export type Units = UnitSystem;

/** Both apps, as a record names the one that wrote it. */
export const APP_NAMES = ['web', 'ios'] as const;

interface RecordEgg {
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
 *  the egg's temperature came from. `ambient_C` is here because the app
 *  derives it from the egg's start temperature by a policy rule (`ambientFor`), and a record that relied on the rule could not
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
  /** As `CookSetup` has them: the water the eggs cooled in as the cook gave
   *  it, C, only when they gave it, for running water or a bowl; and the
   *  bowl's water, litres, for a bowl and only there. */
  coolingWater_C?: number;
  bowlLitres?: number;
  /** The water a cold pan started at, C, given or assumed: on every cold
   *  start, and never on a hot one. Absent on a cold start, from before the
   *  field, the pan started at `ambient_C`, and replays so. */
  panStart_C?: number;
}

export interface EggRecord {
  v: 1;
  /** The cook's random id (`isUid`, share.ts) on a record as sent
   *  (`sharedRecord`); null in the log the device keeps. Never derived from
   *  anything. */
  uid: string | null;
  /** The local date the cook started, YYYY-MM-DD. A day, not a timestamp. */
  day: string;
  /** Which cook this egg was: the moment it started, in whole milliseconds
   *  since 1970 UTC. Two tabs showing one cook, or a cook written down twice,
   *  make one egg, not two, and only the page that wrote an egg down learns
   *  from it (src/ui/calibration.ts). Kept on the device and never sent
   *  (`sharedRecord`): to the millisecond, it says far more about the cook
   *  than `day` does. Absent on the iPhone app's, which runs one cook at a
   *  time and has no need of it, and on a record as sent. */
  id?: number;
  app: AppName;
  appVersion: string;
  prior: string;
  /** `MODEL_ID` when the record was written. */
  model: string;
  egg: RecordEgg;
  setup: RecordSetup;
  /** The doneness slider position the cook was RUN at, [0, 1]. */
  level: number;
  /** What the solver said, s from egg-in to egg-out. */
  recommended_s: number;
  /** What the app added to it on purpose, to learn from: the nudge
   *  (`nudgeSeconds`, decide.ts): zero on the web, and on iOS unless the
   *  cook is sharing. */
  nudge_s: number;
  /** When the egg came out, s from egg-in. See `pulledBy`. */
  pulled_s: number;
  pulledBy: PulledBy;
  /** The counted cooling the app ran, s: in water to the yolk's peak, in an
   *  egg cup to its opening; 0 on the counter, where there is none. */
  cooled_s: number;
  /** The yolk the cook got, in the slider's words, or null
   *  when the question was on screen and the cook moved on without answering. */
  yolkWord: YolkWord | null;
  /** The white answer: runny, tender or firm, or null when the question was
   *  on screen and the cook moved on without answering. It is always asked. */
  white: WhiteReport | null;
  /** A thermometer reading at the centre's peak, or null: no probe, or not
   *  taken. */
  probe: ProbeReading | null;
  /** What the app said at "Eggs in", or null: started before the odds were
   *  known, or no time chosen (the white never sets). */
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
