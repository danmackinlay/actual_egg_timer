// `npm run verify`: the full gate, run before a merge (`DECISIONS.md` 121).
//
// The build first, alone, since everything after it runs what it compiled.
// Then the rest at once, each job's output held and printed whole under its
// name when it ends, so no two jobs' lines interleave:
//
//   npm test         node --test over dist/test
//   validate         the science against the literature (dist/tools/validate.js)
//   copy:literals    no Swift literal is words (dist/tools/copyLiterals.js)
//   fixtures:check   the fixtures made afresh, compared with git's
//   swift build      the package and its tests, compiled
//   swift test       run, once fixtures:check and swift build have both ended
//
// The jobs call the compiled scripts, not their npm scripts: each npm script
// starts with its own `node tools/build.mjs`, and four of them at once would
// be four `tsc -b`s over one dist/.
//
// fixtures:check rewrites fixtures/, and two jobs read it. `swift test` reads
// every fixture, so it waits for fixtures:check to end: Swift never reads
// fixtures/ while anything writes it. `npm test` reads fixtures/stores.json
// and runs alongside; it cannot see a part-written file, because every write
// to fixtures/ is a whole file renamed into place (`replaceFile`,
// tools/fixtureCompare.ts). It sees the committed file or the fresh one, and
// when fixtures:check passes those agree.
//
// A failed job stops nothing else: every job runs to its end (but swift test,
// which needs swift build), and verify fails naming each failed job and its
// exit code.
//
// Usage: node tools/verify.mjs
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
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
const results = [];

const build = await job('build', [['npm', ['run', 'build']]]);
results.push(build);
if (build.code === 0) {
  const tests = readdirSync('dist/test').filter((f) => f.endsWith('.test.js')).sort().map((f) => join('dist/test', f));
  const fixtures = job('fixtures:check', [[node, ['dist/tools/fixtures.js']], [node, ['dist/tools/fixturesCheck.js']]]);
  const swiftBuild = job('swift build', [['swift', ['build', '--build-tests'], SWIFT]]);
  const swiftTest = Promise.all([fixtures, swiftBuild]).then(([, built]) => (built.code === 0
    ? job('swift test', [['swift', ['test', '--skip-build'], SWIFT]])
    : null));
  const all = await Promise.all([
    job('npm test', [[node, ['--test', ...tests]]]),
    job('validate', [[node, ['dist/tools/validate.js']]]),
    job('copy:literals', [[node, ['dist/tools/copyLiterals.js']]]),
    fixtures,
    swiftBuild,
    swiftTest,
  ]);
  results.push(...all.filter((r) => r !== null));
}

console.log('\n===== verify =====');
for (const r of [...results].sort((a, b) => a.end - b.end)) {
  console.log(`${r.code === 0 ? 'ok    ' : 'FAILED'} ${r.name.padEnd(15)} ${seconds(r.start).padStart(6)} s to ${seconds(r.end).padStart(6)} s`);
}
const failed = results.filter((r) => r.code !== 0);
if (build.code === 0 && results.every((r) => r.name !== 'swift test')) console.log('skipped swift test: swift build failed');
if (failed.length > 0) {
  console.log(`verify failed in ${seconds(Date.now() - T0)} s: ${failed.map((r) => `${r.name} (exit ${r.code})`).join(', ')}`);
  process.exit(1);
}
console.log(`verify passed in ${seconds(Date.now() - T0)} s`);
