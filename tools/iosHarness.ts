// The simulator `npm run ios:e2e` and `npm run ios:shots` drive
// (tools/iosE2e.ts, tools/iosShots.ts): a Debug build of the app and its UI
// tests, a device of the script's own, its notifications made to work, and
// the UI tests run on it in one `xcodebuild`. What a test does with the app, its launches, its clock, its
// debug log and the reset that starts it from a fresh install's state, is
// the tests' own (ios/UITests/Harness.swift). The web's is tools/harness.ts.
import { spawn, execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const BUNDLE = 'name.danmackinlay.actualeggtimer';
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

/// What one UI test came to: its name (`<Class>/<test>`), whether it passed,
/// its failures as XCTest reports them, the lines it noted (`Run.note`),
/// and how long it took, s, by XCTest's count.
export interface UiResult { test: string; passed: boolean; failures: string[]; notes: string[]; secs: number }

/// The UI tests `tests` (`<Class>/<test>`) on `udid`, in one `xcodebuild
/// test-without-building`, each told to `each` as it ends; a test asked for
/// that never ran, a failure, after them. The app is not uninstalled between
/// them: each test's first launch resets it (ios/UITests/Harness.swift).
/// `env` reaches the tests (`TEST_RUNNER_`, ios/UITests/Harness.swift
/// `Env`; `uiEnv`). The run's result bundle lands in
/// ios/build/e2e/results/<name>.xcresult.
export async function uiTests(
  udid: string, tests: string[], env: Record<string, string>, name: string, each: (r: UiResult) => void = () => {},
): Promise<UiResult[]> {
  const bundle = `ios/${DERIVED}/results/${name}.xcresult`;
  rmSync(bundle, { recursive: true, force: true });
  mkdirSync(dirname(bundle), { recursive: true });
  const runnerEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) runnerEnv[`TEST_RUNNER_${k}`] = v;
  const child = spawn('xcodebuild', [
    'test-without-building', '-xctestrun', xctestrun(), '-destination', `id=${udid}`,
    ...tests.map((t) => `-only-testing:EggTimerUITests/${t}`), '-resultBundlePath', bundle,
    // A failure's sysdiagnose of the simulator takes minutes, and says
    // nothing the result bundle and the app's log do not.
    '-collect-test-diagnostics', 'never',
  ], { env: { ...process.env, ...runnerEnv }, stdio: ['ignore', 'pipe', 'pipe'] });

  const results: UiResult[] = [];
  const errors: string[] = [];
  let running: { failures: string[]; notes: string[] } | null = null;
  const caseLine = /Test Case '-\[EggTimerUITests\.(\w+) (\w+)\]' (started|passed|failed)(?: \(([\d.]+) seconds\))?/;
  const read = (l: string): void => {
    const c = caseLine.exec(l);
    if (c?.[3] === 'started') {
      running = { failures: [], notes: [] };
    } else if (c) {
      const r = {
        test: `${c[1]}/${c[2]}`, passed: c[3] === 'passed', failures: running?.failures ?? [],
        notes: running?.notes ?? [], secs: Number(c[4] ?? 0),
      };
      running = null;
      results.push(r);
      each(r);
    } else if (running && l.includes(' error: -[EggTimerUITests.')) {
      running.failures.push(l.replace(/^.*?error: -\[[^\]]*\] : /, '').replace(/^failed: caught error: /, 'threw: '));
    } else if (running && l.startsWith('NOTE: ')) {
      running.notes.push(l.slice(6));
    } else if (/error/i.test(l)) {
      errors.push(l);
    }
  };
  createInterface({ input: child.stdout }).on('line', read);
  createInterface({ input: child.stderr }).on('line', read);
  const status = await new Promise<number | null>((done) => child.on('close', done));
  for (const test of tests.filter((t) => !results.some((r) => r.test === t))) {
    const r = {
      test, passed: false, notes: [], secs: 0,
      failures: [`never ran: xcodebuild exited ${status}: ${errors.slice(0, 5).join('; ') || 'no test ran'}`],
    };
    results.push(r);
    each(r);
  }
  return results;
}

/// What `simctl list -j runtimes devicetypes` says, as far as it is read.
interface SimList {
  runtimes: {
    isAvailable: boolean; platform: string; version: string; identifier: string;
    supportedDeviceTypes?: { identifier: string }[];
  }[];
  devicetypes: { identifier: string; name: string; productFamily: string }[];
}

/// A device of the script's own, booted, named `AET <tool> <pid>`: an
/// iPhone 17 Pro if the newest runtime runs one, else its last iPhone; or,
/// given `model`, that iPhone and no other.
export function createDevice(model: string | null = null, tool = 'e2e'): string {
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
  const id = simctl('create', `AET ${tool} ${process.pid}`, type.identifier, runtime.identifier);
  console.log(`ios:${tool}: device ${id} (${type.name}, iOS ${runtime.version}), the app in ${LOCALE}`);
  simctl('boot', id);
  simctl('bootstatus', id, '-b');
  return id;
}

/// The device's notifications made to work for the app (GOTCHAS.md): an
/// app's first install on a new simulator never has them authorized ("Source
/// is not authorized"), however long it waits or relaunches, but once it has
/// asked for them the next install has. So the app is installed, launched
/// once asking for quiet notifications with a cook started, given until it
/// hears back, and uninstalled; the tests' `xcodebuild` installs it again.
export async function primeNotifications(udid: string): Promise<void> {
  const dir = resolve(`ios/${DERIVED}/runs/prime`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const log = `${dir}/aet.log`;
  const answered = (): boolean => existsSync(log) && /"ev":"(notScheduled|pending)"/.test(readFileSync(log, 'utf8'));
  simctl('install', udid, APP);
  // A new device's first launch now and then says it failed, and runs.
  quietly(() => simctl(
    'launch', udid, BUNDLE, '-debugDir', dir, '-muteAudio', 'YES', '-provisionalAlarms', 'YES', '-uiScreen', 'heating',
  ));
  for (const end = Date.now() + WAIT_S * 1000; !answered() && Date.now() < end;) {
    await new Promise((done) => setTimeout(done, 500));
  }
  quietly(() => simctl('terminate', udid, BUNDLE));
  quietly(() => simctl('uninstall', udid, BUNDLE));
}

/// What the UI tests are given (ios/UITests/Harness.swift `Env`): where
/// each test's directory is made, ios/build/e2e/runs/<test>; how long a wait
/// gives up after; and the locale.
export function uiEnv(): Record<string, string> {
  return { AET_E2E_DIR: resolve(`ios/${DERIVED}/runs`), AET_E2E_WAIT: String(WAIT_S), AET_LOCALE: LOCALE };
}
