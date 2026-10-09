// `npm run build`: compile the TypeScript into dist/ with `tsc -b`, once,
// and only what changed since the last build, when that is safe.
//
// There are three projects: core (tsconfig.core.json: no DOM, no Node), the
// app (tsconfig.app.json: the DOM, no Node), and the tests, tools and server
// (tsconfig.json, which references the other two). Every script that runs
// compiled code starts here; when nothing has changed, `tsc -b` finds the
// three up to date in half a second and compiles nothing.
//
// `tsc -b` is right about an edit, but it misses two things (both tried,
// 9 October 2026):
//
// - A file deleted, renamed, or no longer included. Its own project is
//   built again, but a project downstream that still imports it is not
//   checked again, so the build passes where a fresh one fails; and the
//   file's old output stays in dist/, so a deleted test still runs under
//   `node --test dist/test/*.test.js`.
// - The installed packages: after an `npm ci` that changes @types/node, a
//   project whose own files have not changed is not checked against them.
//
// So this keeps, beside the build, what it was built from: each project's
// files and options, the TypeScript version and the installed packages
// (dist/.build.json). If any of that differs, dist/ is deleted and built
// from scratch, as `npm test` once did every time.
//
// Usage: node tools/build.mjs [project ...]   (default: tsconfig.json, all)
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative } from 'node:path';
import ts from 'typescript';

const OUT = 'dist';
const STAMP = `${OUT}/.build.json`;
const ROOT = 'tsconfig.json';

/** The config at `path`, parsed; its errors thrown. */
function parse(path) {
  const message = (d) => ts.flattenDiagnosticMessageText(d.messageText, '\n');
  const config = ts.getParsedCommandLineOfConfigFile(path, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(`${path}: ${message(d)}`); },
  });
  if (config === undefined) throw new Error(`${path}: not read`);
  if (config.errors.length > 0) throw new Error(`${path}: ${config.errors.map(message).join('\n')}`);
  return config;
}

/** What the build in dist/ is of, beyond what `tsc -b` checks: each
 *  project's files and options, from the root down its references. */
function stamp() {
  const projects = {};
  const visit = (path) => {
    const key = relative('.', path);
    if (key in projects) return;
    const config = parse(path);
    const options = { ...config.options };
    delete options.configFilePath;
    projects[key] = { files: config.fileNames.map((f) => relative('.', f)).sort(), options: options };
    for (const ref of config.projectReferences ?? []) visit(ref.path);
  };
  visit(ROOT);
  const installed = existsSync('node_modules/.package-lock.json')
    ? 'node_modules/.package-lock.json' : 'package-lock.json';
  return JSON.stringify({
    typescript: ts.version,
    packages: createHash('sha256').update(readFileSync(installed)).digest('hex'),
    projects: projects,
  });
}

const now = stamp();
const before = existsSync(STAMP) ? readFileSync(STAMP, 'utf8') : null;
if (before !== now) {
  if (before !== null) console.log(`build: files, options or packages changed; building ${OUT}/ from scratch`);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT);
  writeFileSync(STAMP, now);
}

const projects = process.argv.slice(2);
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const run = spawnSync(process.execPath, [tsc, '-b', ...(projects.length > 0 ? projects : [ROOT])], {
  stdio: 'inherit',
});
process.exit(run.status ?? 1);
