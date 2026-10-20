// `npm run ios:e2e`: what only a device can check, scripted: the screen's
// layout, the sentence's panels, corrections made in them mid-cook, a
// relaunch over the system's notifications and Live Activity, a
// notification delivered while the app is gone, the app leaving the screen,
// the keys an earlier build left, Help's sources and the alarms' sound
// files in the bundle. What the app's logic decides is `swift test`'s
// (ios/EggTimerCore/Tests/EggTimerAppTests).
//
// The scenarios are UI tests (ios/UITests, `Scenarios`): a Debug build on a
// simulator of the script's own, its buttons tapped as a finger would, the
// app's clock frozen at each moment a scenario checks and stepped from one
// to the next, and what happened read from the app's debug log
// (ios/UITests/Harness.swift `Run`). Each runs on a fresh install, the app
// uninstalled before its own `xcodebuild test-without-building`. Nothing is
// timed against the host's clock but one notification left to the system
// (`asleep`). The device is deleted at the end.
//
//   npm run ios:e2e                          every scenario
//   npm run ios:e2e -- alarms relaunch-*     those named (a trailing * matches)
//   npm run ios:e2e -- --list                the names
//   --no-build    use the last build in ios/build/e2e
//   --device <udid>, --keep                  a device already booted; keep it
//
// AET_E2E_WAIT=<s> how long a wait for the app gives up after (default 60);
// AET_E2E_LOG=1 prints a failing scenario's log; AET_LOCALE=en-US launches
// the app in that locale rather than en-AU. A scenario's log and result
// bundle are kept under ios/build/e2e (runs/, results/).
//
// Needs Xcode and xcodegen; not in `npm run verify`.
import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { APP, UI_ENV, build, createDevice, quietly, simctl, uiTest, uiWarmUp } from './iosHarness.ts';

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

/// A scenario: its name, and what it checks.
interface Scenario { name: string; about: string }

/// The scenarios ios/UITests holds: each `test_<name>` of `Scenarios`, its
/// name with hyphens for the underscores, and the comment above it.
function scenarios(): Scenario[] {
  const out: Scenario[] = [];
  for (const file of readdirSync('ios/UITests').filter((f) => f.endsWith('.swift')).sort()) {
    const source = readFileSync(`ios/UITests/${file}`, 'utf8');
    if (!source.includes('extension Scenarios')) continue;
    for (const m of source.matchAll(/\/\/\/ (.+)\n\s*func test_(\w+)\(\)/g)) {
      out.push({ name: m[2]!.replace(/_/g, '-'), about: m[1]! });
    }
  }
  return out;
}

/// Run one scenario on `udid` and say how it went: whether it passed.
function run(s: Scenario, udid: string): boolean {
  const r = uiTest(udid, `Scenarios/test_${s.name.replace(/-/g, '_')}`, UI_ENV);
  const secs = r.secs.toFixed(0);
  if (r.passed) {
    console.log(`  pass  ${s.name} (${secs} s)${r.notes.length ? ` - ${r.notes.join('; ')}` : ''}`);
    return true;
  }
  console.log(`  FAIL  ${s.name} (${secs} s)`);
  for (const f of r.failures) console.log(`        ${f}`);
  for (const n of r.notes) console.log(`        note: ${n}`);
  const log = `${UI_ENV['AET_E2E_DIR']}/${s.name}/aet.log`;
  if (process.env['AET_E2E_LOG'] && existsSync(log)) {
    const lines = readFileSync(log, 'utf8').split('\n').filter((l) => l !== '');
    console.log(lines.map((l) => `        | ${l.slice(0, 240)}`).join('\n'));
  }
  return false;
}

async function main(): Promise<void> {
  const all = scenarios();
  if (listOnly) {
    for (const s of all) console.log(`${s.name.padEnd(24)} ${s.about}`);
    return;
  }
  const matches = (name: string): boolean =>
    wanted.length === 0 || wanted.some((w) => (w.endsWith('*') ? name.startsWith(w.slice(0, -1)) : name === w));
  const chosen = all.filter((s) => matches(s.name));
  if (chosen.length === 0) throw new Error(`no scenario named ${wanted.join(', ')} (--list)`);

  const began = Date.now();
  if (!noBuild || !existsSync(APP)) build();
  const built = Date.now();
  const udid = given ?? createDevice();
  let failed = 0;
  try {
    uiWarmUp(udid);
    for (const s of chosen) if (!run(s, udid)) failed += 1;
  } finally {
    if (!given && !keep) {
      quietly(() => simctl('shutdown', udid));
      quietly(() => simctl('delete', udid));
    }
  }
  const total = ((Date.now() - began) / 1000).toFixed(0);
  const building = ((built - began) / 1000).toFixed(0);
  console.log(`ios:e2e: ${chosen.length - failed} of ${chosen.length} passed in ${total} s (the build ${building} s)`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
