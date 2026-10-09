/**
 * Which build may write: the newest that has run (DECISIONS.md 100).
 *
 * An older build can damage what a newer one stored: it writes the settings,
 * the pans, the sharing state, the cook in progress and the store around the
 * log whole, from the fields it knows, and drops what the newer one added
 * (ios/RELEASING.md, "Rolling back"). So each app keeps one mark, the
 * newest version that has run on it, and a build that finds a newer version
 * there writes nothing for the rest of the session: it times the egg and
 * leaves the stores alone, until the newer build is back.
 *
 * The ordering is semantic versioning's: major.minor.patch as integers, then
 * a version with a pre-release below the same version without one, and two
 * pre-releases compared identifier by identifier (numbers as numbers, below
 * any word; a shorter list below a longer one it begins). So
 * `0.4.0-alpha.1` < `0.4.0-alpha.2` < `0.4.0` < `0.5.0-alpha.1`.
 *
 * The two apps' versions are one number (test/version.test.ts): the web's
 * `APP_VERSION` is package.json's, such as `0.4.0-alpha.1`; iOS carries it
 * as `MARKETING_VERSION` without the pre-release, `0.4.0`, because Apple
 * takes integers only. Each app marks with its own form and the two marks
 * never meet (localStorage and UserDefaults). On the web each alpha is its
 * own version. On iOS every alpha of one version shares it, so iOS keeps the
 * build number (`CFBundleVersion`) beside the mark and tells two builds of
 * one version apart by it (`writerCheckBuilt`).
 *
 * The mark's format is fixed for good, like the log's key: a version string
 * or nothing. A stored mark that is not a version is overwritten, since no
 * build writes one; a build that cannot read its own version does not write
 * over a mark it cannot place itself against.
 *
 * No I/O: each app reads and writes its own mark.
 */

export interface Version {
  major: number;
  minor: number;
  patch: number;
  /** The pre-release's identifiers, in order; empty for a release. */
  pre: string[];
}

/** What a build does with the stores for the session: write as it always
 *  has, or leave every one of them alone. */
export type WriterVerdict = 'write' | 'readOnly';

const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const NUMERIC = /^(0|[1-9][0-9]*)$/;

/** A version as semantic versioning writes one, without build metadata, or
 *  null for anything else. */
export function parseVersion(text: string): Version | null {
  const m = VERSION_PATTERN.exec(text);
  if (m === null) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)) return null;
  const pre = m[4] === undefined ? [] : m[4].split('.');
  for (let i = 0; i < pre.length; i++) {
    if (/^[0-9]+$/.test(pre[i]) && !NUMERIC.test(pre[i])) return null;
  }
  return { major: major, minor: minor, patch: patch, pre: pre };
}

function sign(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** One pre-release identifier against another: numbers as numbers, and below
 *  any word; words by their characters' codes. */
function compareIdentifier(a: string, b: string): number {
  const an = NUMERIC.test(a);
  const bn = NUMERIC.test(b);
  if (an && bn) {
    if (a.length !== b.length) return sign(a.length, b.length);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (an) return -1;
  if (bn) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** -1, 0 or 1 as `a` is older than, the same as or newer than `b`; null when
 *  either is not a version. */
export function compareVersions(a: string, b: string): number | null {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (va === null || vb === null) return null;
  const core = sign(va.major, vb.major) || sign(va.minor, vb.minor) || sign(va.patch, vb.patch);
  if (core !== 0) return core;
  if (va.pre.length === 0 || vb.pre.length === 0) return sign(vb.pre.length, va.pre.length);
  const n = Math.min(va.pre.length, vb.pre.length);
  for (let i = 0; i < n; i++) {
    const c = compareIdentifier(va.pre[i], vb.pre[i]);
    if (c !== 0) return c;
  }
  return sign(va.pre.length, vb.pre.length);
}

/**
 * What this build, `mine`, does with the stores, given the mark it found:
 * `'write'` when there is no mark, or the mark is not newer than this build
 * (the app then writes `mine` as the mark before anything else); `'readOnly'`
 * when a newer build has run here, or this build cannot place itself.
 */
export function writerCheck(storedMark: string | null, mine: string): WriterVerdict {
  if (storedMark === null || parseVersion(storedMark) === null) return 'write';
  const c = compareVersions(storedMark, mine);
  if (c === null) return 'readOnly';
  return c > 0 ? 'readOnly' : 'write';
}

/** A build number as Apple writes one (`CFBundleVersion`): one to three
 *  integers joined by dots, or null for anything else. */
export function parseBuild(text: string): number[] | null {
  if (!/^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){0,2}$/.test(text)) return null;
  const parts = text.split('.').map(Number);
  for (let i = 0; i < parts.length; i++) {
    if (!Number.isSafeInteger(parts[i])) return null;
  }
  return parts;
}

/** -1, 0 or 1 as build `a` is older than, the same as or newer than `b`,
 *  a missing part read as zero; null when either is not a build number. */
export function compareBuilds(a: string, b: string): number | null {
  const pa = parseBuild(a);
  const pb = parseBuild(b);
  if (pa === null || pb === null) return null;
  for (let i = 0; i < 3; i++) {
    const c = sign(i < pa.length ? pa[i] : 0, i < pb.length ? pb[i] : 0);
    if (c !== 0) return c;
  }
  return 0;
}

/**
 * The iPhone app's verdict, which keeps the build number beside the mark:
 * `writerCheck`, and, when the mark is this build's own version, a stored
 * build later than `myBuild` is a newer build too, since Apple's version is
 * integers only and every TestFlight build of one version shares it. A
 * stored build that is not one is ignored, as a mark that is not a version
 * is; a build that cannot read its own number writes over no build of its
 * version. The app then stores `mine` and `myBuild` before anything else.
 */
export function writerCheckBuilt(
  storedMark: string | null, storedBuild: string | null, mine: string, myBuild: string,
): WriterVerdict {
  const verdict = writerCheck(storedMark, mine);
  if (verdict === 'readOnly' || storedMark === null || storedBuild === null) return verdict;
  if (compareVersions(storedMark, mine) !== 0 || parseBuild(storedBuild) === null) return verdict;
  const c = compareBuilds(storedBuild, myBuild);
  return c === null || c > 0 ? 'readOnly' : 'write';
}
