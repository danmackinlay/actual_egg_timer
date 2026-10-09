/**
 * Every word the web app renders, in every state of the copy capture's
 * scenarios (tools/copyScenarios.ts), written to a JSON file - or two such
 * files compared.
 *
 *   npm run build:site && npm run build
 *   node dist/tools/copySnapshot.js capture <out.json> [--tree <dir>]
 *   node dist/tools/copySnapshot.js compare <before.json> <after.json>
 *
 * `capture` runs the scenarios in the one web harness (tools/harness.ts:
 * the built site served, headless Chrome over the DevTools protocol), the
 * same scenarios `npm run e2e` runs as `copy/…`. It needs Chrome; set CHROME
 * to its binary if it is not where macOS or Linux put it. It is not part of
 * `npm test` for that reason. Run before and after a change that should not
 * touch the words, it proves that no byte of what is rendered moved. Two
 * captures of one build are the same to the byte, on a quiet machine or a
 * loaded one (each step waits for the app to have nothing in hand), so one
 * capture a side is the proof. E2E_CPU_THROTTLE=<rate> slows the page, to
 * show it. `--tree <dir>` captures another checkout's build with this
 * harness (harness.ts says how), so both sides are captured alike; a
 * commit before the test API (src/ui/dev/test.ts) cannot be.
 *
 * `compare` exits non-zero on the first difference and says where it is.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { CopyState, copyScenarios } from './copyScenarios.js';
import { runScenarios, treeArg } from './harness.js';

type Snapshot = CopyState;

async function capture(out: string, tree: string): Promise<void> {
  const states: Snapshot[] = [];
  const scenarios = copyScenarios((s) => { states.push(...s); });
  const failed = await runScenarios(scenarios, Object.keys(scenarios), tree);
  if (failed > 0) throw new Error(`${failed} scenarios failed; nothing written`);
  writeFileSync(out, `${JSON.stringify(states, null, 1)}\n`);
  console.log(`${states.length} states -> ${out}`);
}

function compare(beforePath: string, afterPath: string): void {
  const before = JSON.parse(readFileSync(beforePath, 'utf8')) as Snapshot[];
  const after = JSON.parse(readFileSync(afterPath, 'utf8')) as Snapshot[];
  if (before.length !== after.length) {
    throw new Error(`state count differs: ${before.length} before, ${after.length} after`);
  }
  let strings = 0;
  for (let i = 0; i < before.length; i++) {
    const a = before[i];
    const b = after[i];
    if (a.name !== b.name) throw new Error(`state ${i}: "${a.name}" before, "${b.name}" after`);
    for (const field of ['lang', 'title', 'innerText'] as const) {
      if (a[field] !== b[field]) {
        throw new Error(`${a.name}: ${field} differs\n--- before\n${a[field]}\n--- after\n${b[field]}`);
      }
    }
    for (const field of ['texts', 'attrs'] as const) {
      const x = a[field];
      const y = b[field];
      const n = Math.max(x.length, y.length);
      for (let j = 0; j < n; j++) {
        if (x[j] !== y[j]) {
          throw new Error(`${a.name}: ${field}[${j}] differs\n--- before\n${x[j]}\n--- after\n${y[j]}`);
        }
      }
      strings += x.length;
    }
  }
  const distinct = new Set(before.flatMap((s) => s.texts.concat(s.attrs)));
  console.log(`identical: ${before.length} states, ${strings} strings compared, `
    + `${distinct.size} distinct`);
}

const args = process.argv.slice(2);
const [mode, a, b] = args;
if (mode === 'capture' && a !== undefined) {
  await capture(a, treeArg(args));
} else if (mode === 'compare' && a !== undefined && b !== undefined) {
  compare(a, b);
} else {
  console.error('usage: copySnapshot.js capture <out.json> [--tree <dir>] | compare <before.json> <after.json>');
  process.exit(2);
}
