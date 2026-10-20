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
 * `foldRecord` (recordFold.ts), and `replay` is those same calls in a loop.
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
 *
 * In parts: the wire schema (recordSchema.ts), building a record
 * (recordBuild.ts), checking one (recordCheck.ts), the calibration fold
 * (recordFold.ts), loading from the store (recordLoad.ts) and the results
 * file (recordResults.ts). This file is what the rest import: it re-exports
 * what they use.
 */

export {
  RECORD_VERSION, MODEL_ID, LIKELIHOOD_ID, type MassFrom, MASS_FROMS, type EggFrom, EGG_FROMS, TIME_TO_BOIL_FROMS,
  type PulledBy, PULLED_BYS, type ProbeReading, type Forecast, forecastOf, type AppName, type Units, APP_NAMES,
  type EggRecord, recordMass_g, recordProbe_C,
} from './recordSchema.ts';

export {
  type CookFacts, recordFor, probeReadingFor,
} from './recordBuild.ts';

export {
  FORECAST_SUM_TOLERANCE, parseForecast, parseRecord, sharedRecord, parseLog,
} from './recordCheck.ts';

export {
  PARTICLE_COUNT, CALIBRATION_SEED, CALIBRATION_ALPHA_LOW, CALIBRATION_ALPHA_HIGH, calibrationGrid, type Calibration,
  freshCalibration, copyCalibration, calibrationParams, calibrationDoneness, recordTeaches, recordCookTime_s,
  gridRequestFor, foldRecord, replay,
} from './recordFold.ts';

export {
  type LoadPath, type StoreRead, loadDecision,
} from './recordLoad.ts';

export {
  RESULTS_FILE_VERSION, type ResultsMeta, resultsFileName, RESULTS_ABOUT, resultsFile,
} from './recordResults.ts';
