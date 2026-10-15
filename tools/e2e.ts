/**
 * The web app driven end to end, in seconds: the checks that were done by
 * hand (the LOGBOOK of 6 to 8 October), each a named scenario with assertions on the page and on what
 * it stored, and the copy capture's states (tools/copyScenarios.ts), each a
 * scenario too, every state checked for raw keys, straight quotes and the
 * certainty line. The scenarios are in tools/e2e/, a file for each area -
 * layout, the cook's flow, corrections, the record and sharing, the stores
 * and versions, tabs - over what they share (tools/e2e/helpers.ts); this
 * file runs them.
 *
 *   npm run e2e                              # build the site, then every scenario
 *   npm run e2e -- reload one-tab-takeover   # only those named (after a build)
 *   npm run e2e -- copy/                     # those whose names start so
 *   npm run e2e -- --tree <dir>              # another checkout's build (harness.ts)
 *   node tools/e2e.ts --list
 *
 * The harness is tools/harness.ts: the site served, Chrome, a context per
 * scenario, and the page read through its test API (`window.aetTest`,
 * src/ui/dev/test.ts), never by importing the app's modules.
 *
 * Time is the development clock, stopped (`?clock=0`): a scenario steps it
 * to the moment it means (`aetClock.shift`, `.set`), tells the page to look
 * again with a `focus` event, as a tab coming back does, and asserts. So
 * what it sees does not depend on how fast the machine is: a step past the
 * pull lands where it was aimed whether the page took a millisecond or a
 * second to get there. The one span run is the last second before a pull at
 * the real clock's speed, to see the ring scheduled ahead sound as the tick
 * reaches the pull; the 20-s grace after it is that span's margin for a slow
 * machine. The timers that are a person's, not the cook's (a control's
 * settle, a held key), stay real: a scenario waits for the page to have
 * nothing in hand (`aetTest.whenIdle`: no such timer, no worker job, no
 * request) rather than for a fixed time. Sharing is checked on the real
 * clock, with the stored cook moved into the past, since nothing is sent
 * while the development clock is on.
 *
 * The alarm is checked by what was scheduled on the audio clock and for
 * when, never by waiting for it to play.
 */

import { copyScenarios } from './copyScenarios.ts';
import { cookScenarios } from './e2e/cook.ts';
import { correctionScenarios } from './e2e/corrections.ts';
import { layoutScenarios } from './e2e/layout.ts';
import { recordScenarios } from './e2e/record.ts';
import { storeScenarios } from './e2e/stores.ts';
import { tabScenarios } from './e2e/tabs.ts';
import { type Scenario, runScenarios, treeArg } from './harness.ts';

/* --------------------------------------------------------------- runner */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const all: Record<string, Scenario> = {
    ...layoutScenarios, ...cookScenarios, ...correctionScenarios, ...recordScenarios, ...storeScenarios, ...tabScenarios,
    ...copyScenarios(),
  };
  if (args.includes('--list')) {
    for (const [name, s] of Object.entries(all)) console.log(`${name.padEnd(26)} ${s.what}`);
    return;
  }
  const tree = treeArg(args);
  const names: string[] = [];
  for (const a of args.length > 0 ? args : Object.keys(all)) {
    const matched = a.endsWith('/') ? Object.keys(all).filter((n) => n.startsWith(a)) : a in all ? [a] : [];
    if (matched.length === 0) throw new Error(`no scenario ${a}; --list lists them`);
    names.push(...matched);
  }
  if (await runScenarios(all, names, tree) > 0) process.exitCode = 1;
}

await main();
