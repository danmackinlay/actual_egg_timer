/**
 * A catalogue's file, written in its own layout: one entry a line,
 *
 *     "key": { "text": "…" },
 *
 * its fields in the order they have, the groups of keys parted by blank
 * lines, and the spaces a reader cannot see written as escapes (the
 * no-break space of a measure is `\u00a0`), so the words' editor changes
 * exactly the lines of the keys it changes and a diff shows only those.
 * Pure: text in, text out (tools/copyEdit/ reads and writes the files).
 */

/** One entry: its fields and their words, `count` and `base` among them. */
export type Entry = Record<string, string>;

const ENTRY_LINE = /^ {4}("(?:[^"\\]|\\.)*"): (\{.*\})(,?)$/;

/** The spaces and marks no reader sees, which the files write as escapes. */
const INVISIBLE = /[\u00a0\u00ad\u2000-\u200f\u2028\u2029\u202f\u205f\u2060\ufeff]/g;

/** A string as the files write it: JSON, with each invisible character an escape. */
export function jsonString(s: string): string {
  return JSON.stringify(s).replace(INVISIBLE, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** An entry's line, without its comma. */
export function entryLine(key: string, entry: Entry): string {
  const fields = Object.entries(entry).map(([f, v]) => `${jsonString(f)}: ${jsonString(v)}`);
  return `    ${jsonString(key)}: { ${fields.join(', ')} }`;
}

/** Each entry's key, line and whether a comma follows it. */
export interface Line { key: string; index: number; comma: boolean; entry: Entry }

/** The entries of a catalogue's text, in order. A line in `messages` that is
 *  neither an entry nor blank is refused, since this could not keep it. */
export function entryLines(text: string): { lines: string[]; entries: Line[]; close: number } {
  const lines = text.split('\n');
  const open = lines.indexOf('  "messages": {');
  if (open < 0) throw new Error('no "messages" object, one entry a line');
  const close = lines.indexOf('  }', open);
  if (close < 0) throw new Error('"messages" is not closed');
  const entries: Line[] = [];
  for (let i = open + 1; i < close; i++) {
    if (lines[i] === '') continue;
    const m = ENTRY_LINE.exec(lines[i]);
    if (m === null) throw new Error(`line ${i + 1} is not one entry: ${lines[i]}`);
    entries.push({ key: JSON.parse(m[1]) as string, index: i, comma: m[3] === ',', entry: JSON.parse(m[2]) as Entry });
  }
  return { lines: lines, entries: entries, close: close };
}

/**
 * The text with each key of `edits` set to its entry, or removed when it is
 * null, and every other line as it was. A key the text lacks is inserted
 * after the last key before it in `order` (the English's keys), or first;
 * the commas follow the last entry. The result is parsed again and compared
 * with what was meant, so a writer's mistake throws rather than lands.
 */
export function withEntries(text: string, edits: ReadonlyMap<string, Entry | null>, order: readonly string[]): string {
  const lines = entryLines(text).lines;
  /** Each entry's line as the lines are now. */
  const find = (): Line[] => entryLines(lines.join('\n')).entries;
  // The keys the text has: each line replaced, or removed with the blank line
  // its going would leave doubled.
  for (const [key, entry] of edits) {
    const line = find().find((e) => e.key === key);
    if (line === undefined) continue;
    if (entry !== null) {
      lines[line.index] = entryLine(key, entry) + (line.comma ? ',' : '');
      continue;
    }
    const i = line.index;
    const before = lines[i - 1];
    const after = lines[i + 1];
    if (before === '' && (after === '' || after === '  }')) lines.splice(i - 1, 2);
    else if (before === '  "messages": {' && after === '') lines.splice(i, 2);
    else lines.splice(i, 1);
  }
  // The keys it lacks, each after the last key before it in the English.
  for (const [key, entry] of edits) {
    if (entry === null || find().some((e) => e.key === key)) continue;
    const rank = order.indexOf(key);
    if (rank < 0) throw new Error(`${key}: not an English key`);
    const entries = find();
    let after: Line | undefined;
    for (const e of entries) {
      const r = order.indexOf(e.key);
      if (r >= 0 && r < rank) after = e;
    }
    const index = after !== undefined ? after.index + 1
      : entries.length > 0 ? entries[0].index : entryLines(lines.join('\n')).close;
    lines.splice(index, 0, entryLine(key, entry));
  }
  // A comma after every entry but the last.
  const entries = find();
  entries.forEach((e, k) => {
    const bare = lines[e.index].replace(/,$/, '');
    lines[e.index] = k < entries.length - 1 ? `${bare},` : bare;
  });
  const result = lines.join('\n');
  const meant = { ...(JSON.parse(text) as { messages: Record<string, Entry> }).messages };
  for (const [key, entry] of edits) {
    if (entry === null) delete meant[key];
    else meant[key] = entry;
  }
  const got = (JSON.parse(result) as { messages: Record<string, Entry> }).messages;
  const sorted = (m: Record<string, Entry>): string => JSON.stringify(Object.keys(m).sort().map((k) => [k, m[k]]));
  if (sorted(got) !== sorted(meant)) throw new Error('the catalogue written is not the one meant');
  return result;
}
