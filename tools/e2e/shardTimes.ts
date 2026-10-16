/**
 * Remakes `SECONDS` in shards.ts from a CI run: each scenario's time on the
 * runner, rounded to the second, in the order the scenarios run.
 *
 *   node tools/e2e/shardTimes.ts <run id>     a run of verify.yml whose e2e jobs ran
 *
 * Reads `gh run view <id> --log`, where the harness writes a line a scenario
 * (`ok    <name>   12.4 s  …`, or `FAIL`), and rewrites the table in place.
 * A scenario the run did not time is left out, and counts as `UNTIMED`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

import { allScenarios } from './all.ts';

const run = process.argv[2] ?? '';
if (!/^\d+$/.test(run)) {
  console.error('usage: node tools/e2e/shardTimes.ts <run id>');
  process.exit(2);
}
const log = execFileSync('gh', ['run', 'view', run, '--log'], { encoding: 'utf8', maxBuffer: 1 << 28 });
const seconds = new Map<string, number>();
for (const m of log.matchAll(/Z (?:ok|FAIL)\s+(\S+)\s+(\d+(?:\.\d+)?) s /g)) {
  seconds.set(m[1], Math.max(1, Math.round(Number(m[2]))));
}

const names = Object.keys(allScenarios());
const entries = names.filter((n) => seconds.has(n)).map((n) => `'${n}': ${seconds.get(n)},`);
const lines: string[] = [];
for (const e of entries) {
  const last = lines.length - 1;
  if (last >= 0 && lines[last].length + 1 + e.length <= 118) lines[last] += ` ${e}`;
  else lines.push(`  ${e}`);
}

const path = 'tools/e2e/shards.ts';
const source = readFileSync(path, 'utf8');
const table = /(export const SECONDS[^=]*= \{\n)[\s\S]*?(\n\};)/;
if (!table.test(source)) throw new Error(`${path}: no SECONDS table to remake`);
writeFileSync(path, source.replace(table, (_, open: string, close: string) => `${open}${lines.join('\n')}${close}`));
const untimed = names.filter((n) => !seconds.has(n));
console.log(`${path}: ${entries.length} scenarios timed from run ${run}`
  + `${untimed.length > 0 ? `; untimed: ${untimed.join(', ')}` : ''}.`);
