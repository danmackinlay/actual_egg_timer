/**
 * The fit's records from outside the live store: a results file read back
 * ("Export my results", DECISIONS.md 81), and the owner's list of the random
 * IDs they vouch for (DECISIONS.md 82). `tools/eggs.ts` is the command line;
 * this is what it does, apart, so test/eggs.test.ts can run it.
 *
 * OLDER RECORDS. The apps read only today's record (core's `parseRecord`),
 * but the owner's results files from before 0.5 hold older ones: fields a
 * record then could leave out, and the yolk answered too soft, just right or
 * too firm against the level asked for, before the five words (DECISIONS.md
 * 92). The fit still reads them (`readFitRecord`), here and not in core.
 *
 * THE TRUSTED LIST is the owner's own random IDs: results they cooked and
 * rated themselves, which the fit gives the attested tier's full weight
 * whatever tier they arrived in - an iPhone build from Xcode is open
 * (DECISIONS.md 68), and so is the web. It is never committed: it would tie
 * the owner to their records in a public repository. It is read from
 * `fit/trusted.local.txt` (gitignored; `fit/trusted.example.txt` shows the
 * shape) and from `EGGFIT_TRUSTED`, and the two are pooled.
 *
 * What is trusted is a record from the owner's own results file under one of
 * those IDs, never a record in the live store because of its ID: an ID is
 * shown on screen, so anyone who learned one could post open records under
 * it, and only the file comes from the owner's own device.
 */

import { existsSync, readFileSync } from 'node:fs';
import { EggRecord, MODEL_ID, RESULTS_FILE_VERSION, parseRecord } from '../src/core/record.js';

/** A line of a records file: what the store holds, and where. */
export interface Line {
  tier: 'attested' | 'open';
  seq: number;
  record: unknown;
  /** Where a line came from when not from the live store: `export`, a
   *  results file read back by `import`. */
  source?: 'export';
  /** From the owner's own results file, under an ID on the trusted list:
   *  the fit gives the egg full weight whatever its tier. */
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

/** Mark every line from a results file whose record's ID is on the list; a
 *  line from the live store is never marked, whatever its ID. Returns how
 *  many. */
export function tagTrusted(lines: Line[], trusted: Set<string>): number {
  let n = 0;
  for (const l of lines) {
    const uid = uidOf(l.record);
    if (l.source === 'export' && uid !== null && trusted.has(uid)) {
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

/** The yolk answered against the level asked for, before the five words
 *  (DECISIONS.md 92): too soft, just right or too firm. */
export type OldYolk = -1 | 0 | 1;

/** A record as the fit reads it: today's record, the yolk answered the old
 *  way if it was, and the model that made it, null on a record from before
 *  E6, which named none. */
export interface FitRecord {
  record: EggRecord;
  yolk: OldYolk | null;
  model: string | null;
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function has(o: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key);
}

/** The nullable fields a record from before 0.5 could leave out. */
const MAY_BE_ABSENT = ['uid', 'model', 'yolkWord', 'white', 'probe', 'forecast'];

/**
 * A record of any shape the apps have written, as the fit reads it, or null
 * if it cannot be trusted: an absent nullable field read as null, and the old
 * yolk answer taken out, then core's `parseRecord` and its rules. A record
 * holds one yolk answer or none.
 */
export function readFitRecord(raw: unknown): FitRecord | null {
  if (!isPlain(raw)) return null;
  const o: Record<string, unknown> = { ...raw };
  for (const key of MAY_BE_ABSENT) if (!has(o, key)) o[key] = null;
  const egg = o['egg'];
  if (isPlain(egg) && !has(egg, 'sizeTable')) o['egg'] = { ...egg, sizeTable: null };
  const probe = o['probe'];
  if (isPlain(probe) && !has(probe, 'after_s')) o['probe'] = { ...probe, after_s: null };
  const forecast = o['forecast'];
  if (isPlain(forecast) && !has(forecast, 'yolkWord')) o['forecast'] = { ...forecast, yolkWord: null };
  // Core reads a model on every record; one from before E6 has none.
  const model = o['model'];
  if (model === null) o['model'] = MODEL_ID;
  const yolk = has(o, 'yolk') ? o['yolk'] : null;
  if (yolk !== null && yolk !== -1 && yolk !== 0 && yolk !== 1) return null;
  if (yolk !== null && o['yolkWord'] !== null) return null;
  const record = parseRecord(o);
  if (record === null) return null;
  return { record: record, yolk: yolk, model: model === null ? null : record.model };
}

/** The record as the fit sees it, for telling one egg twice: read, so an
 *  absent nullable field and a null one are the same, then canonical. A
 *  record that does not read is compared as it is. */
export function sameEggKey(record: unknown): string {
  return canonical(readFitRecord(record) ?? record);
}

/** Every record of a store: its log, and, in a store from before 0.5, the
 *  records it could not read and kept beside the log (`unread`), after it.
 *  Empty if it is not a store. */
function recordsOf(store: unknown): unknown[] {
  if (!isPlain(store) || !Array.isArray(store['log'])) return [];
  const out: unknown[] = [...store['log'] as unknown[]];
  const unread = store['unread'];
  if (Array.isArray(unread)) {
    for (const u of unread as unknown[]) if (isPlain(u) && has(u, 'record')) out.push(u['record']);
  }
  return out;
}

export interface Imported {
  /** The random ID the records are filed under. */
  uid: string;
  lines: Line[];
  /** Records from the store, and from the copies an app before 0.5 kept
   *  aside beside it. */
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
 * The store's log keeps its place as `seq`, which is what sharing sends as
 * `seq` (src/ui/share.ts), so a record that was shared too is the same (ID,
 * seq) in both. A file from before 0.5 may also hold records its app could
 * not read, in the store (`unread`) and in copies kept aside (the file's
 * `unread`): they follow, numbered on from the end of the log, and an egg
 * already seen is written once. A copy that is not a store (a cook in
 * progress, text that did not parse) holds no record and is passed over.
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
