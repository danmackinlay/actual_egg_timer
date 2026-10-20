// The simulator `npm run ios:e2e` and `npm run ios:shots` drive
// (tools/iosE2e.ts, tools/iosShots.ts): a Debug build of the app and its UI
// tests, devices of the script's own, and each UI test run on a fresh
// install. What a test does with the app, its launches, its clock and its
// debug log, is the tests' own (ios/UITests/Harness.swift). The web's is
// tools/harness.ts.
import { execFileSync, type ExecFileSyncOptions, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const BUNDLE = 'name.danmackinlay.actualeggtimer';
const DERIVED = 'build/e2e';
export const APP = `ios/${DERIVED}/Build/Products/Debug-iphonesimulator/Actual Egg Timer.app`;
/// How long a wait for the app gives up after, the host's s: only how long
/// a broken build takes to fail, never what a check means.
export const WAIT_S = Number(process.env['AET_E2E_WAIT'] ?? 60);
/// The locale every launch is given, as the web harness gives each tab one
/// (`DEFAULT_LOCALE`, tools/harness.ts), and overridden the same way
/// (`AET_LOCALE=en-US`), as launch arguments (ios/UITests/Harness.swift
/// `localeArgs`). A device `simctl create` makes copies the host's
/// locale, so GitHub's runner, in en-US, would otherwise open the app in
/// Imperial units on the US carton, and this Mac in its own.
export const LOCALE = process.env['AET_LOCALE'] ?? 'en-AU';

export const out = (cmd: string, args: string[], opts: ExecFileSyncOptions = {}): string =>
  String(execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })).trim();
export const simctl = (...args: string[]): string => out('xcrun', ['simctl', ...args]);
export const quietly = <T>(f: () => T): T | null => {
  try {
    return f();
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- the device

/// The app and its UI tests (ios/UITests), built for a simulator in Debug,
/// into ios/build/e2e: the app at `APP`, the tests' run at `xctestrun()`.
export function build(tool = 'e2e'): void {
  console.log(`ios:${tool}: building (Debug, simulator)`);
  out('xcodegen', ['--quiet'], { cwd: 'ios' });
  out('xcodebuild', [
    '-project', 'ActualEggTimer.xcodeproj', '-scheme', 'ActualEggTimer', '-configuration', 'Debug',
    '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', DERIVED,
    'CODE_SIGNING_ALLOWED=NO', '-quiet', 'build-for-testing',
  ], { cwd: 'ios', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 26 });
}

/// The UI tests' run as the last build left it: the file `xcodebuild
/// test-without-building` takes.
export function xctestrun(): string {
  const dir = `ios/${DERIVED}/Build/Products`;
  const found = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.xctestrun')) : [];
  if (found.length === 0) throw new Error(`no .xctestrun in ${dir}: build first`);
  return `${dir}/${found[0]}`;
}

/// What one UI test came to: passed, its failures as XCTest reports them,
/// the lines it noted (`Run.note`), and how long it took, s.
export interface UiResult { passed: boolean; failures: string[]; notes: string[]; secs: number; output: string }

/// One UI test, `<Class>/<test>`, on `udid`, on a fresh install: the app
/// uninstalled first, so that nothing a test before it stored is left, and
/// installed again by xcodebuild. `env` reaches the tests (`TEST_RUNNER_`,
/// ios/UITests/Harness.swift `Env`; `uiEnv`). Its result bundle lands in
/// ios/build/e2e/results, named for the test and `tag`. Run beside others
/// on other devices, each its own xcodebuild.
export async function uiTest(udid: string, test: string, env: Record<string, string>, tag = ''): Promise<UiResult> {
  quietly(() => simctl('terminate', udid, BUNDLE));
  quietly(() => simctl('uninstall', udid, BUNDLE));
  const bundle = `ios/${DERIVED}/results/${tag}${test.replace(/\//g, '.')}.xcresult`;
  rmSync(bundle, { recursive: true, force: true });
  mkdirSync(dirname(bundle), { recursive: true });
  const runnerEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) runnerEnv[`TEST_RUNNER_${k}`] = v;
  const began = Date.now();
  const child = spawn('xcodebuild', [
    'test-without-building', '-xctestrun', xctestrun(), '-destination', `id=${udid}`,
    `-only-testing:EggTimerUITests/${test}`, '-resultBundlePath', bundle,
    // A failure's sysdiagnose of the simulator takes minutes, and says
    // nothing the result bundle and the app's log do not.
    '-collect-test-diagnostics', 'never',
  ], { env: { ...process.env, ...runnerEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks: Buffer[] = [];
  child.stdout.on('data', (d: Buffer) => chunks.push(d));
  child.stderr.on('data', (d: Buffer) => chunks.push(d));
  const status = await new Promise<number | null>((done) => child.on('close', done));
  const output = Buffer.concat(chunks).toString('utf8');
  const secs = (Date.now() - began) / 1000;
  const name = test.split('/').at(-1)!;
  const failures = output.split('\n')
    .filter((l) => l.includes(` error: -[EggTimerUITests.`) && l.includes(`${name}]`))
    .map((l) => l.replace(/^.*?error: -\[[^\]]*\] : /, '').replace(/^failed: caught error: /, 'threw: '));
  const notes = output.split('\n').filter((l) => l.startsWith('NOTE: ')).map((l) => l.slice(6));
  const passed = status === 0 && new RegExp(`Test Case '-\\[EggTimerUITests\\.\\w+ ${name}\\]' passed`).test(output);
  if (!passed && failures.length === 0) {
    const errors = output.split('\n').filter((l) => /error/i.test(l)).slice(0, 5).join('; ');
    failures.push(`xcodebuild exited ${status}: ${errors || 'no test ran'}`);
  }
  return { passed, failures, notes, secs, output };
}

/// What `simctl list -j runtimes devicetypes` says, as far as it is read.
interface SimList {
  runtimes: {
    isAvailable: boolean; platform: string; version: string; identifier: string;
    supportedDeviceTypes?: { identifier: string }[];
  }[];
  devicetypes: { identifier: string; name: string; productFamily: string }[];
}

/// A device of the script's own, booted, named `AET <tool> <pid>` and its
/// `lane`, if any: an iPhone 17 Pro if the newest runtime runs one, else its
/// last iPhone; or, given `model`, that iPhone and no other.
export function createDevice(model: string | null = null, tool = 'e2e', lane = ''): string {
  const list = JSON.parse(simctl('list', '-j', 'runtimes', 'devicetypes')) as SimList;
  const runtime = list.runtimes
    .filter((r) => r.isAvailable && r.platform === 'iOS')
    .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }))
    .at(-1);
  if (!runtime) throw new Error('no iOS simulator runtime installed');
  // The iPhones that runtime runs, where simctl says (a runner has device
  // types newer than its runtimes, or the other way round).
  const supported = runtime.supportedDeviceTypes?.map((t) => t.identifier);
  const types = list.devicetypes.filter(
    (t) => t.productFamily === 'iPhone' && (!supported || supported.includes(t.identifier)),
  );
  if (types.length === 0) throw new Error(`no iPhone for iOS ${runtime.version}`);
  const type = model === null
    ? types.find((t) => t.name === 'iPhone 17 Pro') ?? types[types.length - 1]!
    : types.find((t) => t.name === model);
  if (!type) throw new Error(`no ${model} for iOS ${runtime.version}`);
  const id = simctl('create', `AET ${tool} ${process.pid}${lane ? ` ${lane}` : ''}`, type.identifier, runtime.identifier);
  console.log(`ios:${tool}: device ${id} (${type.name}, iOS ${runtime.version}), the app in ${LOCALE}`);
  simctl('boot', id);
  simctl('bootstatus', id, '-b');
  return id;
}

/// What the UI tests are given (ios/UITests/Harness.swift `Env`): where
/// each run's directory is made, ios/build/e2e/runs/<lane>, so that a test on
/// one device never shares one with a test on another; how long a wait gives
/// up after; and the locale.
export function uiEnv(lane: string): Record<string, string> {
  return { AET_E2E_DIR: resolve(`ios/${DERIVED}/runs/${lane}`), AET_E2E_WAIT: String(WAIT_S), AET_LOCALE: LOCALE };
}

/// The device warmed up for the UI tests (`WarmUp`, ios/UITests/Bundle.swift):
/// run until a cook has its alarms pending, at most five times.
export async function uiWarmUp(udid: string, lane: string, tool = 'e2e'): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    const r = await uiTest(udid, 'WarmUp/test_warm_up', uiEnv(lane), `${lane}.`);
    if (r.passed) return;
    console.log(`ios:${tool}: ${lane}: warm-up ${attempt}: ${r.failures.join('; ')}`);
    if (attempt === 5) throw new Error(`the device's alarms not working after ${attempt} launches`);
  }
}

