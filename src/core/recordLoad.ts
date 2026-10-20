/**
 * Loading from the store (src/core/record.ts): what a launch makes of the
 * store it read.
 */

/* ----------------------------------------------------------- the store, read */

/* WHAT A LAUNCH MAKES OF THE STORE. Each app keeps the posterior, the base
 * under it and the log in a store of its own (the web's localStorage, iOS's
 * UserDefaults) and reads it apart in its own way: that is I/O, and stays in
 * the app. What it then does with what it read is the same decision in both,
 * and lives here: `loadDecision`, a pure function of the parts and of this
 * build's population and likelihood. Every damaged part is refused, never
 * read around: a store that cannot be read is dropped, a log that cannot be
 * read leaves what it taught as the base, and a store folded under another
 * likelihood or drawn from another population is replayed. */

/** What a launch found: `fresh`, nothing to use, so the prior; `rebuild`,
 *  the log good and the posterior not this build's to use, so the log is
 *  folded again; `rebased`, the log unusable and what it taught kept as the
 *  base, the log starting again empty; `loaded`, everything as stored. */
export type LoadPath = 'fresh' | 'rebuild' | 'rebased' | 'loaded';

/** What an app read from its store, part by part. */
export interface StoreRead {
  /** Whether it is a store of this format that can be taken apart. */
  readable: boolean;
  /** The base under the posterior: null where the store has none, else
   *  whether it read whole. */
  base: 'sound' | 'damaged' | null;
  /** Whether the posterior read whole. */
  posterior: boolean;
  /** How many records the posterior says it has absorbed, or null if that
   *  is not a whole number from zero. */
  folded: number | null;
  /** How many records the log holds, or null when it is not a list of
   *  records this build reads, every one (`parseLog`). */
  records: number | null;
  /** The population the posterior was drawn from, or null when the store
   *  does not say. */
  population: string | null;
  /** The `LIKELIHOOD_ID` it was folded under, or null when the store does
   *  not say. */
  likelihood: string | null;
}

/** What to keep, in the parts that were read. */
interface LoadDecision {
  path: LoadPath;
  /** The base: the stored base, the stored posterior, or none (null). */
  base: 'stored' | 'posterior' | null;
  /** The calibration: the stored posterior as it is, or `start` - a copy of
   *  the base, or the prior where there is none - for the log to be folded
   *  onto again. */
  calibration: 'posterior' | 'start';
  /** How many records of the kept log the calibration has absorbed. */
  folded: number;
  /** Whether the log as read is kept; when not, the log starts again empty. */
  log: boolean;
}

/**
 * What a launch does with the store it read, for a build that draws its
 * prior from `population` and folds under `likelihood`:
 *
 *  - no store of this format that can be read: `fresh`, the prior.
 *  - the log unreadable: `rebased`. Its records cannot be folded, but what
 *    they taught is in the posterior, which becomes the base - or the base,
 *    if the posterior is damaged too.
 *  - the posterior damaged, the base damaged, the count damaged, another
 *    population, another likelihood or none: `rebuild`, the log folded again
 *    from the base, or the prior. A base cannot be replayed, so a sound one
 *    stays as it is.
 *  - a posterior that has absorbed more records than the log holds:
 *    `rebased`, on that posterior.
 *  - otherwise `loaded`.
 */
export function loadDecision(read: StoreRead, population: string, likelihood: string): LoadDecision {
  if (!read.readable) {
    return { path: 'fresh', base: null, calibration: 'start', folded: 0, log: false };
  }
  if (read.records === null) {
    const base = read.posterior ? 'posterior' : read.base === 'sound' ? 'stored' : null;
    return { path: 'rebased', base: base, calibration: 'start', folded: 0, log: false };
  }
  const base = read.base === 'sound' ? 'stored' : null;
  if (
    read.base === 'damaged' || !read.posterior || read.folded === null
    || read.population !== population || read.likelihood !== likelihood
  ) {
    return { path: 'rebuild', base: base, calibration: 'start', folded: 0, log: true };
  }
  if (read.folded > read.records) {
    return { path: 'rebased', base: 'posterior', calibration: 'start', folded: 0, log: false };
  }
  return { path: 'loaded', base: base, calibration: 'posterior', folded: read.folded, log: true };
}
