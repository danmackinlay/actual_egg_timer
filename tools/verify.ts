// `npm run verify`: the full gate, run before a merge.
//
// First the two generators that write sources the others compile, then every
// other job at once, each one's output held and printed whole under its name
// when it ends, so no two jobs' lines interleave. Node runs the tests and
// tools from their sources, so nothing waits for a build:
//
//   copy:keys        the key types made afresh from copy/en.json, compared
//                    with the files on disk (tools/copyKeys.ts --check)
//   swift:constants  the Swift's constants made afresh from src/core/,
//                    compared with the files on disk
//                    (tools/swiftConstants.ts --check)
//   then, once both have ended:
//   typecheck        tsc over core, the app and the rest (npm run typecheck)
//   npm test         node --test over test/*.test.ts and test/tools/*.test.ts
//   copy:literals    no Swift literal in a text call is words (tools/copyLiterals.ts)
//   fixtures:check   the fixtures made afresh, compared with the files on
//                    disk (tools/fixturesCheck.ts)
//   committed        the files those three write, as HEAD has them, once
//                    the three have ended
//   swift build      the package and its tests, compiled
//   swift app tests  EggTimerAppTests, once swift build has ended
//   swift core tests EggTimerCoreTests, once fixtures:check and swift build
//                    have both ended
//
// copy:keys and swift:constants write what they make, to the Swift package
// and src/core/copyKeys.ts, which swift build, the type check and the tests
// read; so they run alone, a fraction of a second, and nothing reads those
// files while they are written.
//
// The jobs call node and tsc directly, not npm test, which type-checks first:
// here the type check is a job of its own, beside the tests.
//
// fixtures:check rewrites fixtures/, and the core's Swift tests read every
// fixture, so they wait for fixtures:check to end: Swift never reads
// fixtures/ while anything writes it. The app's Swift tests read no fixture,
// and are the longest job, so they start as soon as swift build ends. The two
// Swift test runs share the package's .build, which `swift test` locks even
// when it builds nothing; with --skip-build neither writes it, so each passes
// --ignore-lock. `npm test` runs alongside; the one fixture it reads,
// population.json, is the fit's, which fixtures:check never writes.
//
// The three checks compare with the working tree, where an npm test has
// already written the key types and the Swift's constants afresh, so a file
// regenerated but never committed passes them, though CI, which checks the
// commit, fails it. So committed fails any change to those files that HEAD
// lacks; a fixture git does not know is fixtures:check's own failure.
//
// A failed job stops nothing else: every job runs to its end (but the Swift
// tests, which need swift build), and verify fails naming each failed job and
// its exit code.
//
// Usage: node tools/verify.ts
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const T0 = Date.now();
const SWIFT = 'ios/EggTimerCore';
const seconds = (ms: number): string => (ms / 1000).toFixed(1);

/** A command, its arguments, and the directory it runs in, `.` if none. */
type Step = [string, string[], string?];

/** How a job ended, and when, in ms from verify's start. */
interface Result { name: string; code: number; start: number; end: number }

/** Run `steps` in turn, stopping at the first that fails, with their output
 *  held. Resolves to the job's result. */
function job(name: string, steps: Step[]): Promise<Result> {
  return new Promise((resolve) => {
    const start = Date.now() - T0;
    const output: Buffer[] = [];
    const next = (i: number): void => {
      if (i === steps.length) return finish(0);
      const [command, args, cwd] = steps[i];
      output.push(Buffer.from(`$ ${[command, ...args].join(' ')}\n`));
      const child = spawn(command, args, { cwd: cwd ?? '.', stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', (chunk: Buffer) => output.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => output.push(chunk));
      child.on('error', (error) => {
        output.push(Buffer.from(`${error.message}\n`));
        finish(127);
      });
      child.on('close', (code, signal) => {
        if (code === 0) next(i + 1);
        else finish(code ?? (signal !== null ? 128 : 1));
      });
    };
    let done = false;
    const finish = (code: number): void => {
      if (done) return;
      done = true;
      const end = Date.now() - T0;
      const text = Buffer.concat(output).toString('utf8');
      process.stdout.write(`\n===== ${name}: ${code === 0 ? 'passed' : `FAILED, exit ${code}`}`
        + ` (${seconds(start)} s to ${seconds(end)} s) =====\n${text}${text.endsWith('\n') ? '' : '\n'}`);
      resolve({ name, code, start, end });
    };
    next(0);
  });
}

const node = process.execPath;
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const tests = ['test', 'test/tools'].flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.test.ts')).sort().map((f) => join(dir, f)));
// What copy:keys, swift:constants and fixtures:check write (TS_KEYS and
// SWIFT_KEYS, CORE_SWIFT, COPY_SWIFT, PALETTE_SWIFT and ACCENT_COLOURS,
// WRITTEN in their tools).
const GENERATED = [
  'src/core/copyKeys.ts',
  'ios/EggTimerCore/Sources/EggTimerCopy/CopyKeys.swift',
  'ios/EggTimerCore/Sources/EggTimerCore/Constants.generated.swift',
  'ios/EggTimerCore/Sources/EggTimerCopy/Constants.generated.swift',
  'ios/App/Palette.generated.swift',
  'ios/App/Assets.xcassets/AccentColor.colorset/Contents.json',
  'ios/Widget/Assets.xcassets/AccentColor.colorset/Contents.json',
  'fixtures/',
  'fit/tests/*.json',
];
const copyKeys = job('copy:keys', [[node, ['tools/copyKeys.ts', '--check']]]);
const swiftConstants = job('swift:constants', [[node, ['tools/swiftConstants.ts', '--check']]]);
await Promise.all([copyKeys, swiftConstants]);
const fixtures = job('fixtures:check', [[node, ['tools/fixturesCheck.ts']]]);
const committed = Promise.all([copyKeys, swiftConstants, fixtures])
  .then(() => job('committed', [['git', ['diff', '--exit-code', '--stat', 'HEAD', '--', ...GENERATED]]]));
const swiftBuild = job('swift build', [['swift', ['build', '--build-tests'], SWIFT]]);
const swiftTests = (name: string, target: string): Promise<Result> => job(name, [['swift', ['test', '--skip-build', '--ignore-lock', '--filter', target], SWIFT]]);
const appTests = swiftBuild.then((built) => (built.code === 0 ? swiftTests('swift app tests', 'EggTimerAppTests') : null));
const coreTests = Promise.all([fixtures, swiftBuild]).then(([, built]) => (built.code === 0
  ? swiftTests('swift core tests', 'EggTimerCoreTests')
  : null));
const all = await Promise.all([
  job('typecheck', ['tsconfig.core.json', 'tsconfig.app.json', 'tsconfig.json'].map((p): Step => [node, [tsc, '-p', p]])),
  job('npm test', [[node, ['--test', ...tests]]]),
  job('copy:literals', [[node, ['tools/copyLiterals.ts']]]),
  copyKeys,
  swiftConstants,
  fixtures,
  committed,
  swiftBuild,
  appTests,
  coreTests,
]);
const results = all.filter((r): r is Result => r !== null);

console.log('\n===== verify =====');
for (const r of [...results].sort((a, b) => a.end - b.end)) {
  console.log(`${r.code === 0 ? 'ok    ' : 'FAILED'} ${r.name.padEnd(16)} ${seconds(r.start).padStart(6)} s to ${seconds(r.end).padStart(6)} s`);
}
const failed = results.filter((r) => r.code !== 0);
if (results.every((r) => !r.name.startsWith('swift ') || r.name === 'swift build')) {
  console.log('skipped the Swift tests: swift build failed');
}
if (failed.length > 0) {
  console.log(`verify failed in ${seconds(Date.now() - T0)} s: ${failed.map((r) => `${r.name} (exit ${r.code})`).join(', ')}`);
  process.exit(1);
}
console.log(`verify passed in ${seconds(Date.now() - T0)} s`);
