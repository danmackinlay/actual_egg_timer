/**
 * The fit's records from outside the live store: a results file read back
 * ("Export my results", DECISIONS.md 81), and the owner's list of the random
 * IDs they vouch for (DECISIONS.md 82). `tools/eggs.ts` is the command line;
 * this is what it does, apart, so test/eggs.test.ts can run it.
 *
 * THE TRUSTED LIST is the owner's own random IDs: results they cooked and
 * rated themselves, which the fit gives the attested tier's full weight
 * whatever tier they arrived in - an iPhone build from Xcode is open
 * (DECISIONS.md 68), and so is the web. It is never committed: it would tie
 * the owner to their records in a public repository. It is read from
 * `fit/trusted.local.txt` (gitignored; `fit/trusted.example.txt` shows the
 * shape) and from `EGGFIT_TRUSTED`, and the two are pooled.
 */

import { existsSync, readFileSync } from 'node:fs';
import { RESULTS_FILE_VERSION, parseRecord } from '../src/core/record.js';

/** A line of a records file: what the store holds, and where. */
export interface Line {
  tier: 'attested' | 'open';
  seq: number;
  record: unknown;
  /** Where a line came from when not from the live store: `export`, a
   *  results file read back by `import`. */
  source?: 'export';
  /** The cook's random ID is on the owner's trusted list: the fit gives the
   *  egg full weight whatever its tier. */
  trusted?: true;
}

/** The owner's trusted list: one random ID per line, `#` to the end of a
 *  line a comment. Gitignored. */
export const TRUSTED_FILE = 'fit/trusted.local.txt';
/** The same list in the environment, separated by commas or white space. */
export const TRUSTED_ENV = 'EGGFIT_TRUSTED';

/** The IDs in a trusted list's text: a line's `#` and what follows it is a
 *  comment; commas and white space separate. */
export function parseTrusted(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const hash = line.indexOf('#');
    for (const id of (hash < 0 ? line : line.slice(0, hash)).split(/[\s,]+/)) {
      if (id !== '') out.push(id);
    }
  }
  return out;
}

/** The trusted list: the file, if there is one, and the environment. */
export function readTrusted(
  path: string = TRUSTED_FILE, env: string | undefined = process.env[TRUSTED_ENV],
): Set<string> {
  const ids = new Set<string>();
  if (existsSync(path)) for (const id of parseTrusted(readFileSync(path, 'utf8'))) ids.add(id);
  if (env !== undefined) for (const id of parseTrusted(env)) ids.add(id);
  return ids;
}

function uidOf(record: unknown): string | null {
  if (record === null || typeof record !== 'object') return null;
  const uid = (record as { uid?: unknown }).uid;
  return typeof uid === 'string' ? uid : null;
}

/** Mark every line whose record's ID is on the list. Returns how many. */
export function tagTrusted(lines: Line[], trusted: Set<string>): number {
  let n = 0;
  for (const l of lines) {
    const uid = uidOf(l.record);
    if (uid !== null && trusted.has(uid)) {
      l.trusted = true;
      n += 1;
    } else {
      delete l.trusted;
    }
  }
  return n;
}

/** A JSON value with every object's keys in order, so two encodings of one
 *  record - Swift's and JavaScript's put the keys in different orders - are
 *  one string. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** The record as the fit sees it, for telling one egg twice: read, so an
 *  absent nullable field and a null one are the same, then canonical. A
 *  record that does not read is compared as it is. */
export function sameEggKey(record: unknown): string {
  return canonical(parseRecord(record) ?? record);
}

/** Every record of a store, in its place: the log and the unread records
 *  put back together (the apps' `readLog`, without reading them). Empty if
 *  it is not a store. */
function recordsOf(store: unknown): unknown[] {
  if (store === null || typeof store !== 'object') return [];
  const s = store as { log?: unknown; unread?: unknown };
  if (!Array.isArray(s.log)) return [];
  const listed = s.log as unknown[];
  const held = (Array.isArray(s.unread) ? s.unread as unknown[] : [])
    .filter((u): u is { at: number; record?: unknown } => u !== null && typeof u === 'object'
      && Number.isInteger((u as { at?: unknown }).at) && (u as { at: number }).at >= 0)
    .sort((a, b) => a.at - b.at);
  const out: unknown[] = [];
  let li = 0;
  let hi = 0;
  for (let at = 0; li < listed.length || hi < held.length; at++) {
    const fromHeld = hi < held.length && (held[hi].at <= at || li >= listed.length);
    out.push(fromHeld ? held[hi++].record ?? null : listed[li++]);
  }
  return out;
}

export interface Imported {
  /** The random ID the records are filed under. */
  uid: string;
  lines: Line[];
  /** Records from the store, and from the copies kept aside beside it. */
  fromStore: number;
  fromAside: number;
  /** Records seen twice - a copy kept aside holds eggs the store has too -
   *  and written once. */
  duplicates: number;
}

/**
 * The records of a results file, as `pull` writes the store's: open, since
 * nothing attested them, each under the file's random ID - or `uid`, which
 * wins - and marked as from an export.
 *
 * The store's records keep their place in its log as `seq`, which is what
 * sharing sends as `seq` (src/ui/share.ts), so a record that was shared too
 * is the same (ID, seq) in both. The copies kept aside are older stores, or
 * a newer build's: their records follow, numbered on from the end of the
 * log, and an egg already seen is written once. A copy that is not a store
 * (a cook in progress, text that did not parse) holds no record and is
 * passed over.
 */
export function importResults(text: string, uid: string | null = null): Imported {
  const file = JSON.parse(text) as unknown;
  if (file === null || typeof file !== 'object') throw new Error('not a results file');
  const f = file as { file?: unknown; uid?: unknown; stored?: unknown; unread?: unknown };
  if (f.file !== RESULTS_FILE_VERSION) throw new Error(`not a results file of version ${RESULTS_FILE_VERSION}`);
  const id = uid ?? (typeof f.uid === 'string' && f.uid !== '' ? f.uid : null);
  if (id === null) {
    throw new Error('the file names no random ID (sharing was never on): give the one to file it under with --uid <id>');
  }
  const seen = new Set<string>();
  const lines: Line[] = [];
  let duplicates = 0;
  const take = (record: unknown, seq: number): boolean => {
    const filed = record !== null && typeof record === 'object' ? { ...(record as object), uid: id } : record;
    const key = sameEggKey(filed);
    if (seen.has(key)) {
      duplicates += 1;
      return false;
    }
    seen.add(key);
    lines.push({ tier: 'open', seq: seq, record: filed, source: 'export' });
    return true;
  };
  const stored = recordsOf(f.stored);
  for (let i = 0; i < stored.length; i++) take(stored[i], i);
  const fromStore = lines.length;
  let next = stored.length;
  for (const copy of Array.isArray(f.unread) ? f.unread as unknown[] : []) {
    for (const r of recordsOf(copy)) if (take(r, next)) next += 1;
  }
  return { uid: id, lines: lines, fromStore: fromStore, fromAside: lines.length - fromStore, duplicates: duplicates };
}
