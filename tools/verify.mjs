// `npm run verify`: the full gate, run before a merge (`DECISIONS.md` 123).
//
// Every job at once, each one's output held and printed whole under its name
// when it ends, so no two jobs' lines interleave. Node runs the tests and
// tools from their sources, so nothing waits for a build:
//
//   typecheck        tsc over core, the app and the rest (npm run typecheck)
//   npm test         node --test over test/*.test.ts
//   validate         the science against the literature (tools/validate.ts)
//   copy:literals    no Swift literal is words (tools/copyLiterals.ts)
//   copy:keys        the key types made afresh from copy/en.json, compared
//                    with the files on disk (tools/copyKeys.ts --check)
//   fixtures:check   the fixtures made afresh, compared with the files on
//                    disk (tools/fixturesCheck.ts)
//   swift build      the package and its tests, compiled
//   swift app tests  EggTimerAppTests, once swift build has ended
//   swift core tests EggTimerCoreTests, once fixtures:check and swift build
//                    have both ended
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
// A failed job stops nothing else: every job runs to its end (but the Swift
// tests, which need swift build), and verify fails naming each failed job and
// its exit code.
//
// Usage: node tools/verify.mjs
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const T0 = Date.now();
const SWIFT = 'ios/EggTimerCore';
const seconds = (ms) => (ms / 1000).toFixed(1);

/** Run `steps` ([command, args, cwd?] each) in turn, stopping at the first
 *  that fails, with their output held. Resolves to the job's result. */
function job(name, steps) {
  return new Promise((resolve) => {
    const start = Date.now() - T0;
    const output = [];
    const next = (i) => {
      if (i === steps.length) return finish(0);
      const [command, args, cwd] = steps[i];
      output.push(Buffer.from(`$ ${[command, ...args].join(' ')}\n`));
      const child = spawn(command, args, { cwd: cwd ?? '.', stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', (chunk) => output.push(chunk));
      child.stderr.on('data', (chunk) => output.push(chunk));
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
    const finish = (code) => {
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
const tests = readdirSync('test').filter((f) => f.endsWith('.test.ts')).sort().map((f) => join('test', f));
const fixtures = job('fixtures:check', [[node, ['tools/fixturesCheck.ts']]]);
const swiftBuild = job('swift build', [['swift', ['build', '--build-tests'], SWIFT]]);
const swiftTests = (name, target) => job(name, [['swift', ['test', '--skip-build', '--ignore-lock', '--filter', target], SWIFT]]);
const appTests = swiftBuild.then((built) => (built.code === 0 ? swiftTests('swift app tests', 'EggTimerAppTests') : null));
const coreTests = Promise.all([fixtures, swiftBuild]).then(([, built]) => (built.code === 0
  ? swiftTests('swift core tests', 'EggTimerCoreTests')
  : null));
const all = await Promise.all([
  job('typecheck', ['tsconfig.core.json', 'tsconfig.app.json', 'tsconfig.json'].map((p) => [node, [tsc, '-p', p]])),
  job('npm test', [[node, ['--test', ...tests]]]),
  job('validate', [[node, ['tools/validate.ts']]]),
  job('copy:literals', [[node, ['tools/copyLiterals.ts']]]),
  job('copy:keys', [[node, ['tools/copyKeys.ts', '--check']]]),
  fixtures,
  swiftBuild,
  appTests,
  coreTests,
]);
const results = all.filter((r) => r !== null);

console.log('\n===== verify =====');
for (const r of [...results].sort((a, b) => a.end - b.end)) {
  console.log(`${r.code === 0 ? 'ok    ' : 'FAILED'} ${r.name.padEnd(16)} ${seconds(r.start).padStart(6)} s to ${seconds(r.end).padStart(6)} s`);
}
const failed = results.filter((r) => r.code !== 0);
if (results.every((r) => !r.name.startsWith('swift') || r.name === 'swift build')) {
  console.log('skipped the Swift tests: swift build failed');
}
if (failed.length > 0) {
  console.log(`verify failed in ${seconds(Date.now() - T0)} s: ${failed.map((r) => `${r.name} (exit ${r.code})`).join(', ')}`);
  process.exit(1);
}
console.log(`verify passed in ${seconds(Date.now() - T0)} s`);
