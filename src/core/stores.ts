/**
 * Every store either app keeps, in one table: its name, the key each app
 * keeps it under, and the format of what is kept there.
 *
 * The format is written inside what is stored, as `v` (`stamped`), and a
 * reader takes a store only in its own format (`inFormat`): anything else
 * reads as nothing stored, and the app's next write replaces it. So a change
 * of shape is one number bumped here, which both apps read from this table,
 * and the key stays: no key is left behind, and the running cook, which the
 * two apps store alike, is bumped once for both. Before wide deployment
 * (DECISIONS.md 48) a bump is all a change of format needs; nothing is
 * migrated.
 *
 * A store with no format inside it (`format` null) is a bare value read by
 * its own reader (the newest-build mark, the alarm's sound), or one whose
 * key still names its format, sharing's, where a change is a new key. The
 * log has its format inside and keeps the key it was first written under.
 *
 * Each app keeps only what is listed here. Once the newer-build guard says
 * this build may write (newer.ts), the web deletes any key of its own
 * (`aet.`) that is not in this table (store.ts, `claimStorage`), and iOS the
 * keys an earlier build of it wrote (Store.swift, `retiredKeys`).
 *
 * Pure: a key is a name, and what is read is JSON already parsed.
 */

export interface StoreSpec {
  /** What the code calls it. */
  name: StoreName;
  /** The format of what it holds, written inside as `v`; null for a store
   *  with none inside it. */
  format: number | null;
  /** The key on the web (localStorage, every one under `aet.`) and on iOS
   *  (UserDefaults); null where that app does not keep it. */
  web: string | null;
  ios: string | null;
}

export type StoreName =
  | 'newest' | 'newestBuild' | 'settings' | 'cook' | 'boilMemory' | 'calibration' | 'share' | 'shareAttest'
  | 'languageState' | 'alarmSound' | 'devClockUsed';

export const STORES: Record<StoreName, StoreSpec> = {
  /** The newest version that has run, and on iOS its build (newer.ts):
   *  under these keys for good, since an older build must find them. */
  newest: { name: 'newest', format: null, web: 'aet.newest', ios: 'newestVersion' },
  newestBuild: { name: 'newestBuild', format: null, web: null, ios: 'newestBuild' },
  /** The settings, one value (settings.ts). */
  settings: { name: 'settings', format: 1, web: 'aet.settings', ios: 'settings' },
  /** The running cook: what was fixed at the press, its start and its log,
   *  whether its egg was answered, and the lean last decided (running.ts,
   *  `storedCook`). */
  cook: { name: 'cook', format: 6, web: 'aet.cook', ios: 'cook' },
  /** The pans' measured times to boil (boil.ts), as `pans`. */
  boilMemory: { name: 'boilMemory', format: 1, web: 'aet.boilMemory', ios: 'boilMemory' },
  /** The results log, the posterior and the base under it (record.ts). */
  calibration: { name: 'calibration', format: 5, web: 'aet.calibration.v5', ios: 'calibration.v5' },
  /** Sharing's state (share.ts), and iOS's App Attest key: their formats in
   *  their keys. */
  share: { name: 'share', format: null, web: 'aet.share.v1', ios: 'sharing.v1' },
  shareAttest: { name: 'shareAttest', format: null, web: null, ios: 'sharing.attest.v2' },
  /** iOS keeps the language and the alarm's sound apart from the settings;
   *  the web keeps them in the settings. */
  languageState: { name: 'languageState', format: 1, web: null, ios: 'languageState' },
  alarmSound: { name: 'alarmSound', format: null, web: null, ios: 'alarmSound' },
  /** The web's development clock has been used here: what is logged may hold
   *  an egg cooked on a made-up clock, which is never sent. */
  devClockUsed: { name: 'devClockUsed', format: null, web: 'aet.devClock.used', ios: null },
};

/** The table in one order, for the fixture and the sweeps. */
export const STORE_LIST: StoreSpec[] = [
  STORES.newest, STORES.newestBuild, STORES.settings, STORES.cook, STORES.boilMemory, STORES.calibration,
  STORES.share, STORES.shareAttest, STORES.languageState, STORES.alarmSound, STORES.devClockUsed,
];

/** What a store holds, stamped with its format. */
export function stamped(store: StoreSpec, body: Record<string, unknown>): Record<string, unknown> {
  return { v: store.format, ...body };
}

/** A stored value, parsed: the object itself if it is one in the store's
 *  format, or null for anything else, which reads as nothing stored. */
export function inFormat(store: StoreSpec, raw: unknown): Record<string, unknown> | null {
  if (store.format === null || raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return o['v'] === store.format ? o : null;
}
