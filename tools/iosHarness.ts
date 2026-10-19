// The simulator `npm run ios:e2e` drives (tools/iosE2e.ts, its scenarios):
// a Debug build of the app, a device of the script's own, and one run of the
// app a scenario (`Run`): its launches, its clock stepped from outside, its
// debug log and its stores' plist. `npm run ios:shots` (tools/iosShots.ts)
// drives it the same way. The web's is tools/harness.ts.
import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import {
  closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

import { asRead } from './text.ts';

export const BUNDLE = 'name.danmackinlay.actualeggtimer';
/// The plist of the app's stores, its suite of UserDefaults (`Stores.suite`),
/// in its data container.
const STORES_PLIST = `Library/Preferences/${BUNDLE}.stores.plist`;
const DERIVED = 'build/e2e';
export const APP = `ios/${DERIVED}/Build/Products/Debug-iphonesimulator/Actual Egg Timer.app`;
/// How long a wait for the app gives up after, the host's s: only how long
/// a broken build takes to fail, never what a check means.
export const WAIT_S = Number(process.env['AET_E2E_WAIT'] ?? 60);
/// The locale every launch is given, as the web harness gives each tab one
/// (`DEFAULT_LOCALE`, tools/harness.ts), and overridden the same way
/// (`AET_LOCALE=en-US`). A device `simctl create` makes copies the host's
/// locale, so GitHub's runner, in en-US, would otherwise open the app in
/// Imperial units on the US carton, and this Mac in its own.
export const LOCALE = process.env['AET_LOCALE'] ?? 'en-AU';

/// `tag`, a language and a region (`en-AU`), as launch arguments: the
/// argument domain is read before the device's own preferences, so the app's
/// `Locale.current`, its region and preferred languages are the tag's. The
/// unit and clock preferences are given too, since the device's, copied from
/// the host as well, win over the locale's: Fahrenheit, inches and the US
/// system in the US, Celsius and metric elsewhere; the clock the locale's own.
function localeArgs(tag: string): string[] {
  const m = /^([a-z]{2,3})-([A-Z]{2})$/.exec(tag);
  if (!m) throw new Error(`AET_LOCALE ${tag}: a language and a region, as en-AU`);
  const us = m[2] === 'US';
  return [
    '-AppleLocale', `${m[1]}_${m[2]}`, '-AppleLanguages', `(${tag})`,
    '-AppleTemperatureUnit', us ? 'Fahrenheit' : 'Celsius',
    '-AppleMeasurementUnits', us ? 'Inches' : 'Centimeters', '-AppleMetricUnits', us ? 'NO' : 'YES',
    '-AppleICUForce24HourTime', 'NO', '-AppleICUForce12HourTime', 'NO',
  ];
}
const LOCALE_ARGS = localeArgs(LOCALE);

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
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the device

export function build(tool = 'e2e'): void {
  console.log(`ios:${tool}: building (Debug, simulator)`);
  out('xcodegen', ['--quiet'], { cwd: 'ios' });
  out('xcodebuild', [
    '-project', 'ActualEggTimer.xcodeproj', '-scheme', 'ActualEggTimer', '-configuration', 'Debug',
    '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', DERIVED,
    'CODE_SIGNING_ALLOWED=NO', '-quiet', 'build',
  ], { cwd: 'ios', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 26 });
}

/// What `simctl list -j runtimes devicetypes` says, as far as it is read.
interface SimList {
  runtimes: {
    isAvailable: boolean; platform: string; version: string; identifier: string;
    supportedDeviceTypes?: { identifier: string }[];
  }[];
  devicetypes: { identifier: string; name: string; productFamily: string }[];
}

/// A device of the script's own, booted, named `AET <tool> <pid>`: an iPhone
/// 17 Pro if the newest runtime runs one, else its last iPhone; or, given
/// `model`, that iPhone and no other.
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

/// A new device's first launches are many seconds slow while the system
/// settles, and its notifications refused ("Source is not authorized"), or,
/// on a loaded machine, the request for them never answered: cooks started
/// until one has its alarms pending, each given two minutes, nothing
/// checked.
export async function warmUp(udid: string, tool = 'e2e'): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    const warm = new Run('warm-up', udid);
    warm.install();
    warm.launch(['-uiScreen', 'heating']);
    const hit = await warm
      .until((e) => (e.ev === 'pending' && e.alarms.some((a) => a.id.startsWith('cook'))) || e.ev === 'notScheduled', { timeoutS: 120, what: 'the alarms' })
      .catch(() => null);
    warm.terminate();
    if (hit?.ev === 'pending') return;
    // What the launch got to, for a device that will not warm up.
    const seen = warm.lines().map((e) => e.ev);
    console.log(`ios:${tool}: warm-up ${attempt}: ${hit ? JSON.stringify(hit) : 'no alarms read back'}; `
      + `${seen.length} events, the last ${seen.slice(-8).join(', ') || 'none'}`);
    if (attempt === 5) throw new Error(`the device's alarms not working after ${attempt} launches`);
  }
}

// ------------------------------------------------------------- the app's run

/// How long a wait gives up after, the host's s; from which line it looks;
/// and what it waits for, as a failure says it.
interface WaitOptions { timeoutS?: number; from?: number; what?: string }

/// How a launch is made: notifications granted quietly with no prompt or
/// answered no, the clock's moment, and its speed (0 frozen).
export interface LaunchOptions { alarms?: boolean; at?: number; speed?: number }

/// One scenario's run of the app: its clock, its launches, its log.
///
/// The clock is frozen at each moment a scenario checks: launched there
/// (`-clockAt`, `-clockSpeed 0`) and stepped from one to the next while the
/// app runs (`step`, through `Library/Caches/aet.clock`). What the app does
/// at a moment is then the same on any machine, however slow or loaded: the
/// script waits for the log to say it has happened, never for a span of the
/// host's time to pass. A wait's timeout only says when to give up.
export class Run {
  readonly failures: string[] = [];
  readonly notes: string[] = [];
  /// Cook time at the first launch, a whole second: each moment checked is
  /// this, a span on, or a deadline the app planned.
  t0 = Math.floor(Date.now() / 1000);
  /// Where the clock stands, cook time, epoch s.
  at = this.t0;
  /// Steps taken, and the log's length at the last launch.
  steps = 0;
  launched = 0;
  /// The app's data container.
  data = '';
  /// The debug log as read so far, and how many of its bytes.
  private readonly log: Event[] = [];
  private logBytes = 0;
  readonly name: string;
  /// The device it runs on.
  readonly udid: string;

  constructor(name: string, udid: string) {
    this.name = name;
    this.udid = udid;
  }

  /// A fresh install, nothing stored.
  install(): void {
    quietly(() => simctl('terminate', this.udid, BUNDLE));
    quietly(() => simctl('uninstall', this.udid, BUNDLE));
    simctl('install', this.udid, APP);
    this.data = simctl('get_app_container', this.udid, BUNDLE, 'data');
  }

  get stepFile(): string {
    return `${this.data}/Library/Caches/aet.clock`;
  }

  /// Launch with the clock at `at`, cook time, frozen there unless `speed`
  /// says otherwise; quiet notifications granted with no prompt unless asked
  /// otherwise.
  launch(args: string[] = [], { alarms = true, at = this.at, speed = 0 }: LaunchOptions = {}): void {
    this.at = at;
    rmSync(this.stepFile, { force: true });
    const prompt = alarms ? ['-provisionalAlarms', 'YES'] : ['-noAlarmPrompt', 'YES'];
    this.launched = this.lines().length;
    // Silent: the ring and the notifications' sound would otherwise play on
    // the Mac's speakers (-muteAudio is debug-only, like the clock).
    simctl('launch', this.udid, BUNDLE, '-clockAt', String(at), '-clockSpeed', String(speed), '-muteAudio', 'YES',
      ...LOCALE_ARGS, ...prompt, ...args);
  }

  terminate(): void {
    quietly(() => simctl('terminate', this.udid, BUNDLE));
  }

  /// Move the running app's clock to `at`, frozen there, as a phone asleep
  /// or set would be, and wait until the app has caught up with it (`idle`,
  /// Screenshots.swift): the cook ticked at the moment, the taps due there
  /// tapped, nothing under way, the screen drawn; with `idle: false`, only
  /// until the clock has moved, for a check of what the app does while it
  /// is still at work. The index of the line that says the clock moved,
  /// from which what the step set going follows.
  async step(at: number, { idle = true } = {}): Promise<number> {
    this.steps += 1;
    const n = this.steps;
    const path = this.stepFile;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(`${path}.new`, `${n} ${at} 0\n`);
    renameSync(`${path}.new`, path);
    const what = `the clock at +${(at - this.t0).toFixed(3)} s`;
    const ack = await this.until(is('clock', (e) => e.n === n), { from: this.launched, what });
    if (idle) await this.until(is('idle', (e) => e.step === n), { from: ack.i, what: `the app idle after ${what}` });
    this.at = at;
    return ack.i;
  }

  /// A step to where the frozen clock stands: once the app has ticked there
  /// again and has nothing under way, and the screen is drawn. What a check
  /// that something did not happen waits for, rather than for the host's
  /// time to pass.
  tick(): Promise<number> {
    return this.step(this.at);
  }

  get logPath(): string {
    return `${this.data}/Library/Caches/aet.log`;
  }

  /// The debug log so far, an event a line (`Screenshots.log`): { t (cook
  /// time, epoch s), ev (what happened), and its fields }, a field with no
  /// value left out, each string as it reads: a measure's no-break space as
  /// a space (`asRead`). Read on from where the last read stopped, a whole
  /// line at a time: the bytes after the last newline are a line still being
  /// written, read once it ends. A whole line that is not JSON fails, and
  /// fails the same at the next read, which starts from the same byte.
  lines(): Event[] {
    const path = this.logPath;
    if (!existsSync(path)) return [];
    const fd = openSync(path, 'r');
    try {
      const size = fstatSync(fd).size;
      if (size > this.logBytes) {
        const buffer = Buffer.alloc(size - this.logBytes);
        readSync(fd, buffer, 0, buffer.length, this.logBytes);
        const end = buffer.lastIndexOf(0x0a) + 1;
        const read: Event[] = [];
        for (const line of buffer.subarray(0, end).toString('utf8').split('\n')) {
          if (line === '') continue;
          try {
            read.push(JSON.parse(line, (_, v: unknown) => (typeof v === 'string' ? asRead(v) : v)) as Event);
          } catch {
            throw new Error(`the debug log's line ${this.log.length + read.length + 1} is not JSON: ${line.slice(0, 200)}`);
          }
        }
        this.log.push(...read);
        this.logBytes += end;
      }
    } finally {
      closeSync(fd);
    }
    return this.log.slice();
  }

  /// The debug log's text as it stands, a line each, for a failure to show
  /// whether or not each line reads.
  text(): string[] {
    return existsSync(this.logPath) ? readFileSync(this.logPath, 'utf8').split('\n').filter((l) => l !== '') : [];
  }

  /// The lines since the last launch.
  sinceLaunch(): Event[] {
    return this.lines().slice(this.launched);
  }

  /// Wait for an event that `test` holds of from line `from` on: the event,
  /// with its index `i`; or fail after `timeoutS` of the host's seconds.
  until<E extends Event>(test: (e: Event) => e is E, opts?: WaitOptions): Promise<Found<E>>;
  until(test: (e: Event) => boolean, opts?: WaitOptions): Promise<Found>;
  async until(test: (e: Event) => boolean, { timeoutS = WAIT_S, from = 0, what = 'an event' }: WaitOptions = {}): Promise<Found> {
    const end = Date.now() + timeoutS * 1000;
    while (Date.now() < end) {
      const lines = this.lines();
      for (let i = from; i < lines.length; i += 1) {
        const e = lines[i]!;
        if (test(e)) return { ...e, i };
      }
      await sleep(100);
    }
    throw new Error(`timed out waiting for ${what}`);
  }

  /// Wait until the cook has nothing under way after line `from`: no plan
  /// being made, no surface being built, no start, restore or read-back of
  /// the alarms (`settled`, Cook.swift). Only after a line that set some of
  /// that going: a tap, a phase, a restore.
  settled(from: number): Promise<Found<EventOf<'settled'>>> {
    return this.until(is('settled'), { from, what: 'the cook settled' });
  }

  /// The stores' plist as JSON, each data value that is JSON parsed; waits
  /// until `ready(prefs)` holds, since the file lags the app by seconds.
  async prefs(ready: (p: Prefs) => boolean = () => true, timeoutS = WAIT_S): Promise<Prefs> {
    const path = `${this.data}/${STORES_PLIST}`;
    const end = Date.now() + timeoutS * 1000;
    let last: Prefs = {};
    while (Date.now() < end) {
      last = existsSync(path) ? JSON.parse(out('python3', ['-c', PLIST_READ, path])) as Prefs : {};
      if (ready(last)) return last;
      await sleep(250);
    }
    return last;
  }

  /// Edit the stores' plist, with the app terminated: a key renamed, then
  /// keys set, each value a text stored as data, as the app stores its stores.
  editPlist(rename: [string, string] | null, values: Record<string, string> = {}): void {
    const path = `${this.data}/${STORES_PLIST}`;
    out('python3', ['-c', PLIST_EDIT, path, JSON.stringify(rename), JSON.stringify(values)]);
  }

  check(ok: unknown, what: string | null): void {
    if (!ok) this.failures.push(what ?? 'failed');
  }

  note(what: string): void {
    this.notes.push(what);
  }
}

const PLIST_READ = `
import json, plistlib, sys
with open(sys.argv[1], 'rb') as f:
    p = plistlib.load(f)
def show(v):
    if isinstance(v, bytes):
        try:
            return json.loads(v.decode('utf-8'))
        except Exception:
            return {'bytes': len(v)}
    if isinstance(v, dict):
        return {k: show(x) for k, x in v.items()}
    if isinstance(v, list):
        return [show(x) for x in v]
    if isinstance(v, (int, float, str, bool)) or v is None:
        return v
    return str(v)
print(json.dumps({k: show(v) for k, v in p.items()}))
`;

const PLIST_EDIT = `
import json, plistlib, sys
path, rename, values = sys.argv[1], json.loads(sys.argv[2]), json.loads(sys.argv[3])
with open(path, 'rb') as f:
    p = plistlib.load(f)
if rename:
    p[rename[1]] = p.pop(rename[0])
for k, v in values.items():
    p[k] = v.encode('utf-8')
with open(path, 'wb') as f:
    plistlib.dump(p, f, fmt=plistlib.FMT_BINARY)
`;

// ------------------------------------------------------------- the debug log

/// A store as the app's own table has it (StoreRegistry.swift, read from
/// its source): the key it is kept under, and the format written inside it.
export function iosStore(name: string): { key: string; format: number | null } {
  const table = readFileSync('ios/EggTimerCore/Sources/EggTimerApp/StoreRegistry.swift', 'utf8');
  const m = new RegExp(`StoreSpec\\(name: "${name}", format: (nil|\\d+), key: "([^"]+)"\\)`).exec(table);
  if (m === null) throw new Error(`StoreRegistry.swift has no store named ${name}`);
  return { key: m[2], format: m[1] === 'nil' ? null : Number(m[1]) };
}

/// Where the app keeps its cook and its settings, as its table says.
export const COOK = 'cook';
export const SETTINGS = 'settings';
for (const [name, key] of [['cook', COOK], ['settings', SETTINGS]]) {
  if (iosStore(name).key !== key) throw new Error(`the app keeps its ${name} under ${iosStore(name).key}`);
}

/// The settings as stored, in the app's format, given at launch: what is not
/// given is the default. A launch argument whose value is `<hex>` is data to
/// UserDefaults, as the app stores the value.
export function settingsArg(over: Record<string, unknown>): string[] {
  const text = JSON.stringify({ v: iosStore('settings').format, ...over });
  return [`-${SETTINGS}`, `<${Buffer.from(text, 'utf8').toString('hex')}>`];
}

/// One event of the debug log, as `Screenshots.Event` declares it: `t`, cook
/// time, epoch s, to the millisecond; `ev`, the case; its fields, a field
/// with no value left out. test/iosEvents.test.ts holds it to the Swift.
export type Event = { t: number } & (
  | { ev: 'clock'; n: number; at: number; speed: number }
  | { ev: 'idle'; step: number }
  | { ev: 'action'; name: string; raw: string }
  | { ev: 'actionUnknown'; raw: string }
  | { ev: 'phase'; phase: string }
  | { ev: 'settled' }
  | {
    ev: 'plan'; pull: number; cooled?: number; lengthened: boolean; surface: boolean; next?: number;
    asking: boolean; overdue: boolean;
  }
  | { ev: 'stored'; value?: unknown }
  | { ev: 'restore'; phase: string; eventsWritten: boolean }
  | { ev: 'restoreTooOld' }
  | { ev: 'restored' }
  | { ev: 'ring'; deadline: string }
  | { ev: 'activity'; what: string; stage: string; ends: number; up: boolean; cook: (string | null)[] }
  | { ev: 'activitySeen'; when: string; state: string; stage: string; ends: number }
  | { ev: 'scheduled'; id: string; at: number; inS: number }
  | { ev: 'notScheduled'; id: string; error: string }
  | { ev: 'alarmsCancelled' }
  | { ev: 'pending'; alarms: { id: string; at?: number }[] }
  | { ev: 'delivered'; ids: string[] }
  | { ev: 'log'; count: number; folded: number; last?: unknown }
  | { ev: 'swept'; key: string }
  | { ev: 'wrote'; key: string; number?: number; text?: string }
  | { ev: 'answer'; cookS: number; decided: boolean; odds: boolean }
  | { ev: 'edit'; group?: string }
  | { ev: 'editCommitted'; fields: string[]; start?: number }
  | { ev: 'layout'; part: string; y: number }
  | { ev: 'frame'; at: number; phase: string; big: string; sub: string; range?: string }
  | { ev: 'likely'; shown: boolean }
  | { ev: 'helpSources'; count: number }
);
export type Kind = Event['ev'];
export type EventOf<K extends Kind> = Extract<Event, { ev: K }>;
/// An event found by a wait, with its index in the log.
export type Found<E extends Event = Event> = E & { i: number };

/// The stores' plist as read, each data value that is JSON parsed: the keys a
/// check reads.
export interface Prefs {
  [SETTINGS]?: { startMode?: string; waterLitres?: number; eggCount?: number; doneness?: number };
  [COOK]?: { v?: number; cook?: unknown };
  'calibration.v5'?: { v: number; log: unknown[] };
  [key: string]: unknown;
}

/// A test of an event: that it is `ev`, and that `test` holds of it.
export function is<K extends Kind>(ev: K, test: (e: EventOf<K>) => boolean = () => true): (e: Event) => e is EventOf<K> {
  return (e: Event): e is EventOf<K> => e.ev === ev && test(e as EventOf<K>);
}

/// The last event `ev` in these lines, or undefined.
export function lastOf<K extends Kind>(lines: Event[], ev: K): EventOf<K> | undefined {
  const test = is(ev);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const e = lines[i]!;
    if (test(e)) return e;
  }
  return undefined;
}
