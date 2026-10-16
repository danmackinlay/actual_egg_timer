/**
 * Every store the web keeps, in one table: its name, the key it is kept
 * under in localStorage (every one under `aet.`), and the format of what is
 * kept there. The iPhone keeps its own table (StoreRegistry.swift).
 *
 * The format is written inside what is stored, as `v` (`stamped`), and a
 * reader takes a store only in its own format (`inFormat`): anything else
 * reads as nothing stored, and the page's next write replaces it. So a
 * change of shape is one number bumped here, and the key stays: no key is
 * left behind. Before wide deployment (DECISIONS.md 107) a bump is all a
 * change of format needs; nothing is migrated.
 *
 * A store with no format inside it (`format` null) is a bare value read by
 * its own reader (the newest-build mark), or one whose key still names its
 * format, sharing's, where a change is a new key. The log has its format
 * inside and keeps the key it was first written under.
 *
 * The page keeps only what is listed here: once the newer-build guard says
 * this build may write (newer.ts), it deletes any key of its own (`aet.`)
 * that is not in this table (store.ts, `claimStorage`).
 *
 * Pure: a key is a name, and what is read is JSON already parsed.
 */

export interface StoreSpec {
  /** What the code calls it. */
  name: StoreName;
  /** The format of what it holds, written inside as `v`; null for a store
   *  with none inside it. */
  format: number | null;
  /** The key in localStorage. */
  key: string;
}

export type StoreName = 'newest' | 'settings' | 'cook' | 'boilMemory' | 'calibration' | 'share';

export const STORES = {
  /** The newest version that has run here (newer.ts): under this key for
   *  good, since an older build must find it. */
  newest: { name: 'newest', format: null, key: 'aet.newest' },
  /** The settings, one value (settings.ts), the language and the alarm's
   *  sound among them. */
  settings: { name: 'settings', format: 1, key: 'aet.settings' },
  /** The running cook: what was fixed at the press, its start and its log,
   *  whether its egg was answered, and the lean last decided
   *  (storedCook.ts). */
  cook: { name: 'cook', format: 7, key: 'aet.cook' },
  /** The pans' measured times to boil (core's boil.ts), as `pans`. */
  boilMemory: { name: 'boilMemory', format: 1, key: 'aet.boilMemory' },
  /** The results log, the posterior and the base under it (core's
   *  record.ts). */
  calibration: { name: 'calibration', format: 5, key: 'aet.calibration.v5' },
  /** Sharing's state (shareState.ts): its format in its key. */
  share: { name: 'share', format: null, key: 'aet.share.v1' },
} as const satisfies Record<StoreName, StoreSpec>;

/** The table in one order, for the sweep. */
export const STORE_LIST: StoreSpec[] = [
  STORES.newest, STORES.settings, STORES.cook, STORES.boilMemory, STORES.calibration, STORES.share,
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
