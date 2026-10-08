/**
 * fixtures/newer.json: which build may write (src/core/newer.ts,
 * DECISIONS.md 100), for the Swift port to be held to.
 *
 *  - `parse`: strings that are versions and strings that are not, and what
 *    each parses to.
 *  - `compare`: pairs of versions and which is newer, every way round,
 *    across the core triple, pre-releases and their identifiers, the two
 *    apps' forms (`0.4.0-alpha.1` on the web, `0.4.0` on iOS), and strings
 *    that are not versions.
 *  - `check`: a stored mark and this build's version, and the verdict.
 */

import { compareVersions, parseVersion, writerCheck } from '../../src/core/newer.js';

const VERSIONS = [
  '0.3.0', '0.3.0-alpha.1', '0.4.0-alpha.1', '0.4.0-alpha.2', '0.4.0-alpha.10', '0.4.0-alpha', '0.4.0-beta',
  '0.4.0-alpha.beta', '0.4.0-1', '0.4.0', '0.4.1', '0.5.0-alpha.1', '0.5.0', '0.10.0', '1.0.0', '10.0.0',
];
const NOT_VERSIONS = ['', 'unknown', '0.4', '0.4.0.1', 'v0.4.0', '00.4.0', '0.4.0-', '0.4.0-alpha.01', '0.4.0+2', ' 0.4.0'];

export function newerFixture(): Record<string, unknown> {
  const all = [...VERSIONS, ...NOT_VERSIONS];
  const parse = all.map((text) => ({ text, version: parseVersion(text) }));
  const compare: { a: string; b: string; order: number | null }[] = [];
  for (const a of all) {
    for (const b of VERSIONS) compare.push({ a, b, order: compareVersions(a, b) });
  }
  const marks: (string | null)[] = [null, ...VERSIONS, 'unknown', ''];
  const mine = ['0.4.0-alpha.1', '0.4.0', '0.5.0-alpha.1', '0.5.0', 'unknown'];
  const check: { mark: string | null; mine: string; verdict: string }[] = [];
  for (const mark of marks) {
    for (const v of mine) check.push({ mark, mine: v, verdict: writerCheck(mark, v) });
  }
  return {
    about: 'Which build may write: versions parsed and compared, and the verdict on a stored mark. src/core/newer.ts.',
    parse, compare, check,
  };
}
