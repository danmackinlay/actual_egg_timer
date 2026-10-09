/**
 * Whether a fixture made afresh says what the committed one says: the rule
 * `npm run fixtures:check` applies (tools/fixturesCheck.ts).
 *
 * Every key, in the same order, every string, boolean and null, and every
 * array's length must be the same. Numbers must agree to FIXTURE_TOLERANCE,
 * relative to the committed value or absolute below 1: Support.swift's
 * `conformanceTolerance`, the closeness at which Swift is held to these
 * numbers, so a difference the check lets through is one conformance could
 * not have told from no difference. Bitwise agreement is not asked for: the
 * same TypeScript on x86 Linux and arm64 macOS differs in the last bit of
 * some results, and was seen to differ by 7.3e-15 at most (in decide.json,
 * 10 October 2026), so the bytes differ though nothing does.
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

export const FIXTURE_TOLERANCE = 1e-12;

/** A difference between two fixtures: where, and what each side holds. */
export interface FixtureDifference {
  path: string;
  committed: string;
  fresh: string;
  /** Relative (absolute below 1) difference, for two numbers. */
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
      const error = Math.abs(a - b) / Math.max(Math.abs(a), 1);
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
