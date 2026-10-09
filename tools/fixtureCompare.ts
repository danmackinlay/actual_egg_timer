/**
 * Whether a fixture made afresh says what the committed one says: the rule
 * `npm run fixtures:check` applies (tools/fixturesCheck.ts). And how every
 * fixture is laid out (`fixtureLayout`, at the end).
 *
 * Every key, in the same order, every string, boolean and null, and every
 * array's length must be the same. Numbers must agree to FIXTURE_TOLERANCE
 * relative to the larger of the two, at every magnitude: a probability of
 * 1e-200 is held as closely as a cook time of 400 s, and a number that
 * changes sign differs. Only below the smallest normal double, where a
 * double has fewer digits, is the bound absolute (SMALLEST_NORMAL).
 *
 * This is the TypeScript held to itself, so it is tighter than the bound
 * Swift is held to (Support.swift's `conformanceTolerance`, 1e-12, absolute
 * below 1), which allows for another libm. Bitwise agreement is not asked
 * for: the same TypeScript on x86 Linux and arm64 macOS differs in the last
 * bits of some results: by a few ulps, and by up to 9.1e-14 of the value
 * where a particle's offset lands near zero. An offset is a sum of terms of
 * the prior's scale, carried through each resampling (infer.ts, `resample`),
 * so its error is set by those terms, up to 1e-15, not by itself, and one
 * drawn nearer zero than about 0.01 can differ by more than the bound
 * between the two platforms while meaning nothing.
 *
 * Rounding the numbers when they are written would not have done instead.
 * Wherever two platforms' values straddle a rounding boundary they still
 * differ, in the last digit written: at twelve digits one number in
 * reach.json did. And the fixtures carry inputs as well as answers, which
 * must reach Swift exactly as the TypeScript used them: 4.722222222222222 C
 * is 40.5 F, a half-way case that rounds to 41; 1759700000123.5 is an id in
 * fractions of a millisecond, which a loader refuses. Rounded to thirteen
 * digits, the first read 40 and the second became a whole number.
 */

export const FIXTURE_TOLERANCE = 1e-13;

/** The smallest normal double, 2^-1022: below it a difference is measured
 *  against this rather than against the numbers, which have lost digits. */
export const SMALLEST_NORMAL = 2 ** -1022;

/** A difference between two fixtures: where, and what each side holds. */
export interface FixtureDifference {
  path: string;
  committed: string;
  fresh: string;
  /** Relative difference, for two numbers (`relativeDifference`). */
  error: number | null;
}

/** What comparing a fresh fixture with the committed one found. */
export interface FixtureComparison {
  /** Numbers that differ within FIXTURE_TOLERANCE. */
  close: number;
  /** The largest difference among them. */
  largest: number;
  /** Every difference that matters: a number beyond the tolerance, or any
   *  other value, key or length that is not the same. */
  differences: FixtureDifference[];
}

/** How far apart two numbers are, relative to the larger: 0 when they are
 *  the same, 2 when they are opposite, against SMALLEST_NORMAL below it. */
export function relativeDifference(a: number, b: number): number {
  if (a === b) return 0;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), SMALLEST_NORMAL);
}

function shown(value: unknown): string {
  const text = JSON.stringify(value) ?? 'nothing';
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

/** Compares two parsed fixtures, committed first. */
export function compareFixtures(committed: unknown, fresh: unknown): FixtureComparison {
  const out: FixtureComparison = { close: 0, largest: 0, differences: [] };
  const differ = (path: string, a: unknown, b: unknown, error: number | null = null) => {
    out.differences.push({ path, committed: shown(a), fresh: shown(b), error });
  };
  const walk = (a: unknown, b: unknown, path: string): void => {
    if (typeof a === 'number' && typeof b === 'number') {
      if (a === b) return;
      const error = relativeDifference(a, b);
      if (error <= FIXTURE_TOLERANCE) {
        out.close++;
        out.largest = Math.max(out.largest, error);
      } else {
        differ(path, a, b, error);
      }
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        differ(`${path} (length)`, a.length, b.length);
        return;
      }
      for (let i = 0; i < a.length; i++) walk(a[i], b[i], `${path}[${i}]`);
      return;
    }
    if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object'
      && !Array.isArray(a) && !Array.isArray(b)) {
      const ka = Object.keys(a);
      const kb = Object.keys(b);
      if (ka.join('\n') !== kb.join('\n')) {
        differ(`${path} (keys)`, ka, kb);
        return;
      }
      for (const k of ka) {
        walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
      }
      return;
    }
    if (a !== b) differ(path, a, b);
  };
  walk(committed, fresh, '$');
  return out;
}

/* ------------------------------------------------------------- the layout */

/**
 * How a fixture is laid out: one row per line, so that a diff names the rows
 * that changed and two branches that change different rows merge, and still
 * JSON, so every reader reads it as it read the old layout.
 *
 * A row is an element of a list that holds objects or lists: a case, a step
 * of a trace, a particle. Each row starts a line, and is written whole on it
 * when it is at most ROW_LIMIT characters; a longer row is opened, a key a
 * line, and its own rows go a line each. A list of numbers or strings is one
 * line wherever it is. An object that is not a row is one line when it holds
 * no rows and fits ROW_LIMIT, and is opened otherwise; the file's own object
 * is always opened. Within a line, `, ` and `: ` separate, so that
 * `git diff --word-diff` finds the value that changed in a long row.
 */

/** The longest row written on one line, in characters: room for the largest
 *  case (a running cook's plan, 6.6k), not for a posterior's particles. */
export const ROW_LIMIT = 8000;

function isContainer(v: unknown): v is object {
  return v !== null && typeof v === 'object';
}

/** On one line: what JSON.stringify writes, with a space after each `,` and `:`. */
function inline(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (isContainer(v)) {
    return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')}}`;
  }
  return JSON.stringify(v);
}

/** Whether a value holds a list of rows, at any depth. */
function holdsRows(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(isContainer);
  return isContainer(v) && Object.values(v).some(holdsRows);
}

function laid(v: unknown, depth: number, row: boolean): string {
  if (!isContainer(v)) return JSON.stringify(v);
  const pad = '  '.repeat(depth + 1);
  const end = '  '.repeat(depth);
  if (Array.isArray(v)) {
    if (!v.some(isContainer)) return inline(v);
    if (row) {
      const one = inline(v);
      if (one.length <= ROW_LIMIT) return one;
    }
    return `[\n${v.map((e) => pad + laid(e, depth + 1, true)).join(',\n')}\n${end}]`;
  }
  const entries = Object.entries(v);
  if (entries.length === 0) return '{}';
  if (depth > 0 && (row || !holdsRows(v))) {
    const one = inline(v);
    if (one.length <= ROW_LIMIT) return one;
  }
  return `{\n${entries.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${laid(x, depth + 1, false)}`).join(',\n')}\n${end}}`;
}

/** A fixture's text: its value, as JSON.stringify would keep it, laid out
 *  one row per line, with a closing newline. */
export function fixtureLayout(fixture: unknown): string {
  return `${laid(JSON.parse(JSON.stringify(fixture)) as unknown, 0, false)}\n`;
}
