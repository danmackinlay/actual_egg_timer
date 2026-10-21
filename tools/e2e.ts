/**
 * The web app driven end to end: each a named scenario with assertions on
 * the page and on what it stored. The scenarios are in tools/e2e/, a file
 * for each area, over what they share (tools/e2e/helpers.ts), on the
 * harness (tools/harness.ts); this file runs them. `--shard i/n` runs the
 * ith of n, of the scenarios named or else of all, as CI does.
 *
 *   npm run e2e                              # build the site, then every scenario
 *   npm run e2e -- reload one-tab-takeover   # only those named (after a build)
 *   npm run e2e -- --tree <dir>              # another checkout's build (harness.ts)
 *   npm run e2e -- --shard 2/4               # the second of four shards (e2e/shards.ts)
 *   node tools/e2e.ts --list
 *
 * Time is the development clock, stopped, and stepped by each scenario, so
 * what it sees does not depend on how fast the machine is; DEVELOPING.md,
 * "Checking the web app end to end", says how.
 */

import { allScenarios } from './e2e/all.ts';
import { parseShard, shard } from './e2e/shards.ts';
import { runScenarios, treeArg } from './harness.ts';

/* --------------------------------------------------------------- runner */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const all = allScenarios();
  if (args.includes('--list')) {
    for (const [name, s] of Object.entries(all)) console.log(`${name.padEnd(26)} ${s.what}`);
    return;
  }
  const tree = treeArg(args);
  const at = args.indexOf('--shard');
  const split = at < 0 ? null : parseShard(args[at + 1] ?? '');
  if (at >= 0) args.splice(at, 2);
  const names: string[] = [];
  for (const a of args.length > 0 ? args : Object.keys(all)) {
    if (!(a in all)) throw new Error(`no scenario ${a}; --list lists them`);
    names.push(a);
  }
  const run = split === null ? names : shard(names, split.i, split.n);
  if (split !== null) console.log(`shard ${split.i} of ${split.n}: ${run.length} of ${names.length} scenarios`);
  if (await runScenarios(all, run, tree) > 0) process.exitCode = 1;
}

await main();
