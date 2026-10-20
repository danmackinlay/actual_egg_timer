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
// (`asleep`).
//
// Two lanes, each a device of its own, run the scenarios side by side, the
// longest first by how long each took last time (ios/build/e2e/
// durations.json): about 250 s against 450 s on one. The devices are deleted
// at the end.
//
//   npm run ios:e2e                          every scenario
//   npm run ios:e2e -- alarms relaunch-*     those named (a trailing * matches)
//   npm run ios:e2e -- --list                the names
//   --no-build    use the last build in ios/build/e2e
//   --lanes <n>   that many devices side by side (default 2)
//   --device <udid>                          one lane, on a device already booted
//   --keep                                   keep the devices
//
// AET_E2E_WAIT=<s> how long a wait for the app gives up after (default 60);
// AET_E2E_LOG=1 prints a failing scenario's log; AET_LOCALE=en-US launches
// the app in that locale rather than en-AU. A scenario's log and result
// bundle are kept under ios/build/e2e (runs/, results/).
//
// Needs Xcode and xcodegen; not in `npm run verify`.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

import { APP, build, createDevice, quietly, simctl, uiEnv, uiTest, uiWarmUp } from './iosHarness.ts';

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
const lanes = Number(option('--lanes') ?? 2);
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

/// How long each scenario took when it last ran, s, to share them out
/// between the lanes longest first; one never run is taken as `GUESS_S`.
const DURATIONS = 'ios/build/e2e/durations.json';
const GUESS_S = 30;
const durations = (): Record<string, number> => {
  try {
    return JSON.parse(readFileSync(DURATIONS, 'utf8')) as Record<string, number>;
  } catch {
    return {};
  }
};

/// Run one scenario on a lane's device and say how it went: whether it
/// passed, and how long it took. Its lines are printed whole once it ends,
/// so two lanes' never interleave.
async function run(s: Scenario, udid: string, lane: string): Promise<{ passed: boolean; secs: number }> {
  const env = uiEnv(lane);
  const r = await uiTest(udid, `Scenarios/test_${s.name.replace(/-/g, '_')}`, env);
  const secs = r.secs.toFixed(0);
  const out: string[] = [];
  if (r.passed) {
    out.push(`  pass  ${s.name} (${secs} s)${r.notes.length ? ` - ${r.notes.join('; ')}` : ''}`);
  } else {
    out.push(`  FAIL  ${s.name} (${secs} s, ${lane})`);
    for (const f of r.failures) out.push(`        ${f}`);
    for (const n of r.notes) out.push(`        note: ${n}`);
    const log = `${env['AET_E2E_DIR']}/${s.name}/aet.log`;
    if (process.env['AET_E2E_LOG'] && existsSync(log)) {
      const lines = readFileSync(log, 'utf8').split('\n').filter((l) => l !== '');
      out.push(...lines.map((l) => `        | ${l.slice(0, 240)}`));
    }
  }
  console.log(out.join('\n'));
  return { passed: r.passed, secs: r.secs };
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
  // A device a lane, warmed up side by side; the scenarios taken longest
  // first by whichever lane is free.
  const count = given ? 1 : Math.max(1, Math.min(lanes, chosen.length));
  const devices: string[] = [];
  let failed = 0;
  const took = durations();
  try {
    if (given) devices.push(given);
    for (let k = devices.length; k < count; k += 1) devices.push(createDevice(null, 'e2e', `lane ${k + 1}`));
    const queue = [...chosen].sort((a, b) => (took[b.name] ?? GUESS_S) - (took[a.name] ?? GUESS_S));
    const ran = await Promise.allSettled(devices.map(async (udid, k) => {
      const lane = `lane${k + 1}`;
      await uiWarmUp(udid, lane);
      for (let s = queue.shift(); s; s = queue.shift()) {
        const r = await run(s, udid, lane);
        if (!r.passed) failed += 1;
        took[s.name] = Math.round(r.secs);
      }
    }));
    // A lane whose device never warmed up leaves its scenarios to the
    // others; with none left, they never run, and fail.
    for (const r of ran) if (r.status === 'rejected') console.log(`ios:e2e: a lane stopped: ${String(r.reason)}`);
    if (queue.length > 0) {
      failed += queue.length;
      console.log(`ios:e2e: never run: ${queue.map((s) => s.name).join(', ')}`);
    }
  } finally {
    writeFileSync(DURATIONS, `${JSON.stringify(took, null, 2)}\n`);
    if (!given && !keep) {
      for (const udid of devices) {
        quietly(() => simctl('shutdown', udid));
        quietly(() => simctl('delete', udid));
      }
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
