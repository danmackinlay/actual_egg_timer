// `npm run ios:e2e`: what only a device shows, scripted: a cook relaunched
// over the system's notifications and Live Activity, the alarms as the
// system holds them, a notification delivered while the app is gone, the
// app leaving the screen with a change in hand, and the layout at the
// largest text size. What the app's logic decides is `swift test`'s
// (ios/EggTimerCore/Tests/EggTimerAppTests); what its bundle holds,
// `npm run ios:build`'s.
//
// The scenarios are UI tests (ios/UITests, `Scenarios`): a Debug build on a
// simulator of the script's own, its buttons tapped as a finger would, the
// app's clock frozen at each moment a scenario checks and stepped from one
// to the next, and what happened read from the app's debug log
// (ios/UITests/Harness.swift `Run`). All of them run in one `xcodebuild
// test-without-building`: XCUITest cannot uninstall the app, so each
// scenario's first launch resets it to what a fresh install has
// (`-resetState`). Before it, the app is installed once, made to ask for
// notifications and uninstalled, without which a new device never
// authorizes them (`primeNotifications`); the tests check its alarms once,
// before the first (`warmUp`). Nothing is timed against the host's clock but one notification
// left to the system (`asleep`). The device is deleted at the end.
//
//   npm run ios:e2e                          every scenario
//   npm run ios:e2e -- alarms asleep         those named
//   npm run ios:e2e -- --list                the names
//   --no-build        use the last build in ios/build/e2e
//   --device <udid>   on a device already booted
//   --keep            keep the device
//
// AET_E2E_WAIT=<s> how long a wait for the app gives up after (default 60);
// AET_E2E_LOG=1 prints a failing scenario's log; AET_LOCALE=en-US launches
// the app in that locale rather than en-AU. Each scenario's log is kept
// under ios/build/e2e/runs/<name>, and the run's result bundle in
// ios/build/e2e/results.
//
// Needs Xcode and xcodegen; not in `npm run verify`.
import { existsSync, readFileSync } from 'node:fs';

import {
  APP, build, createDevice, primeNotifications, quietly, simctl, uiEnv, uiTests, type UiResult,
} from './iosHarness.ts';

/// The scenarios: `Scenarios/test_<name>`, its hyphens as underscores
/// (ios/UITests). What each checks is the comment above its test.
const SCENARIOS = ['relaunch', 'alarms', 'asleep', 'change-kept-on-hide', 'one-layout-largest', 'idle-largest'];

const argv = process.argv.slice(2);
const flag = (name: string): boolean => {
  const i = argv.indexOf(name);
  if (i < 0) return false;
  argv.splice(i, 1);
  return true;
};
const option = (name: string): string | null => {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  const [, value] = argv.splice(i, 2);
  return value ?? null;
};
const listOnly = flag('--list');
const noBuild = flag('--no-build');
const keep = flag('--keep');
const given = option('--device');
const wanted = argv;

const testOf = (name: string): string => `Scenarios/test_${name.replace(/-/g, '_')}`;
const nameOf = (test: string): string => test.replace(/^Scenarios\/test_/, '').replace(/_/g, '-');

/// A scenario's result, printed as it ends: failing, its failures, notes and,
/// under AET_E2E_LOG, its debug log.
function report(r: UiResult): void {
  const name = nameOf(r.test);
  const secs = r.secs.toFixed(0);
  const out: string[] = [];
  if (r.passed) {
    out.push(`  pass  ${name} (${secs} s)${r.notes.length ? ` - ${r.notes.join('; ')}` : ''}`);
  } else {
    out.push(`  FAIL  ${name} (${secs} s)`);
    for (const f of r.failures) out.push(`        ${f}`);
    for (const n of r.notes) out.push(`        note: ${n}`);
    const log = `${uiEnv()['AET_E2E_DIR']}/${name}/aet.log`;
    if (process.env['AET_E2E_LOG'] && existsSync(log)) {
      const lines = readFileSync(log, 'utf8').split('\n').filter((l) => l !== '');
      out.push(...lines.map((l) => `        | ${l.slice(0, 240)}`));
    }
  }
  console.log(out.join('\n'));
}

async function main(): Promise<void> {
  if (listOnly) {
    for (const s of SCENARIOS) console.log(s);
    return;
  }
  const unknown = wanted.filter((w) => !SCENARIOS.includes(w));
  if (unknown.length > 0) throw new Error(`no scenario named ${unknown.join(', ')} (--list)`);
  const chosen = wanted.length === 0 ? SCENARIOS : SCENARIOS.filter((s) => wanted.includes(s));

  const began = Date.now();
  if (!noBuild || !existsSync(APP)) build();
  const built = Date.now();
  const udid = given ?? createDevice();
  let results: UiResult[] = [];
  try {
    await primeNotifications(udid);
    results = await uiTests(udid, chosen.map(testOf), uiEnv(), 'e2e', report);
  } finally {
    if (!given && !keep) {
      quietly(() => simctl('shutdown', udid));
      quietly(() => simctl('delete', udid));
    }
  }
  const failed = results.filter((r) => !r.passed).length;
  const total = ((Date.now() - began) / 1000).toFixed(0);
  const building = ((built - began) / 1000).toFixed(0);
  console.log(`ios:e2e: ${results.length - failed} of ${results.length} passed in ${total} s (the build ${building} s)`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
