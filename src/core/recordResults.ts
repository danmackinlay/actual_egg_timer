/**
 * The results file (src/core/record.ts): what "Export my results" saves.
 */

import { type AppName, MODEL_ID } from './recordSchema.ts';

/* ---------------------------------------------------------- the results file */

/* EXPORT. "Export my results", in Settings, saves what a device keeps about
 * its eggs to a file the cook keeps: the store, with enough beside it to say
 * whose and which. `npm run eggs -- import` reads it back for the fit. Each
 * app writes it with its own JSON encoder (Record.swift twins this), so the
 * two files hold the same data, which fixtures/record.json pins, not the same
 * characters. Nothing here reads a clock: the moment of the export is handed
 * in. */

/** The results file's own version. A reader refuses any other. An older
 *  file of this version may also have `unread`, the stored copies its app
 *  could not read; the import tool still reads those. */
export const RESULTS_FILE_VERSION = 1;

/** What a results file says beside the store. */
export interface ResultsMeta {
  app: AppName;
  appVersion: string;
  /** When it was exported: an ISO 8601 instant, UTC. */
  exported: string;
  /** The population the app draws a prior from, which is the store's `p`. */
  population: string;
  /** The random ID sharing made, or null if sharing has none: it is what
   *  lines these records up with the ones the device sent. */
  uid: string | null;
}

/** The file's name, on the LOCAL day it was exported. */
export function resultsFileName(day: string): string {
  return `actual-egg-timer-results-${day}.json`;
}

/** A stored text as it goes into the file: its value when it is a JSON
 *  object or array, the text itself, as a string, when not, so a damaged
 *  store is kept too. */
function storedValue(s: string): unknown {
  try {
    const v: unknown = JSON.parse(s);
    if (v !== null && typeof v === 'object') return v;
  } catch {
    // Not JSON: kept as the text it is.
  }
  return s;
}

/** What the file says it is, for whoever opens it. */
export const RESULTS_ABOUT = 'Actual Egg Timer: every result this device kept, as it keeps them. '
  + '"stored" is the app\'s store, whose "log" has one record per egg (INFERENCE.md section 4).';

/** The results file: the meta and the store (`stored`, null when there is
 *  none). One line of JSON. */
export function resultsFile(meta: ResultsMeta, stored: string | null): string {
  return JSON.stringify({
    about: RESULTS_ABOUT, file: RESULTS_FILE_VERSION, app: meta.app, appVersion: meta.appVersion,
    exported: meta.exported, population: meta.population, model: MODEL_ID, uid: meta.uid,
    stored: stored === null ? null : storedValue(stored),
  });
}
