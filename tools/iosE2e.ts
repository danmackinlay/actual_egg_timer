// `npm run ios:e2e`: the checks agents kept doing by hand on the simulator,
// scripted. A Debug build on a simulator of the script's own, the app's clock
// frozen at each moment a scenario checks and stepped from one to the next
// (`-clockAt`, `-clockSpeed 0`, `Library/Caches/aet.clock`;
// ios/App/AppClock.swift), taps by launch argument (`-uiDo`,
// ios/App/Screenshots.swift), and what happened read from the app's debug log
// (`Library/Caches/aet.log`, an event a line, each a JSON object:
// `Screenshots.Event`) and its stored state (the prefs plist, through
// plistlib). After every step the script waits until the app says it has
// caught up (`idle`), so what it checks next, that something happened or
// that it did not, is checked once the app is done. Nothing is timed
// against the host's clock but one notification left to the system
// (`asleep`), so a slow or loaded machine takes longer and checks the same.
// The device is deleted at the end.
//
//   npm run ios:e2e                      every scenario
//   npm run ios:e2e -- cold relaunch-*   those named (a trailing * matches)
//   npm run ios:e2e -- --list            the names
//   --no-build    use the last build in ios/build/e2e
//   --device <udid>, --keep              a device already booted; keep it
//
// AET_E2E_WAIT=<s> how long a wait for the app gives up after (default 60);
// AET_E2E_LOG=1 prints a failing scenario's log.
//
// Compiled with the other tools (tools/build.mjs), which the npm script runs
// first. Needs Xcode, xcodegen and python3; not in `npm run verify`.
import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import {
  closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

import type { EggRecord } from '../src/core/record.js';
import type { RunningCook } from '../src/core/running.js';

const BUNDLE = 'name.danmackinlay.actualeggtimer';
const DERIVED = 'build/e2e';
const APP = `ios/${DERIVED}/Build/Products/Debug-iphonesimulator/Actual Egg Timer.app`;
/// How long a wait for the app gives up after, the host's s: only how long
/// a broken build takes to fail, never what a check means.
const WAIT_S = Number(process.env['AET_E2E_WAIT'] ?? 60);
/// How long the system is given to deliver the one notification a scenario
/// waits for, past its moment, the host's s.
const DELIVERY_SLACK_S = 15;

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

const out = (cmd: string, args: string[], opts: ExecFileSyncOptions = {}): string =>
  String(execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })).trim();
const simctl = (...args: string[]): string => out('xcrun', ['simctl', ...args]);
const quietly = <T>(f: () => T): T | null => {
  try {
    return f();
  } catch {
    return null;
  }
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the device

/// The device the scenarios run on: given, or made.
let udid = given ?? '';

function build(): void {
  console.log('ios:e2e: building (Debug, simulator)');
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

function createDevice(): string {
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
  const type = types.find((t) => t.name === 'iPhone 17 Pro') ?? types[types.length - 1]!;
  const id = simctl('create', `AET e2e ${process.pid}`, type.identifier, runtime.identifier);
  console.log(`ios:e2e: device ${id} (${type.name}, iOS ${runtime.version})`);
  simctl('boot', id);
  simctl('bootstatus', id, '-b');
  return id;
}

// ------------------------------------------------------------- the app's run

/// How long a wait gives up after, the host's s; from which line it looks;
/// and what it waits for, as a failure says it.
interface WaitOptions { timeoutS?: number; from?: number; what?: string }

/// How a launch is made: notifications granted quietly with no prompt or
/// answered no, the clock's moment, and its speed (0 frozen).
interface LaunchOptions { alarms?: boolean; at?: number; speed?: number }

/// One scenario's run of the app: its clock, its launches, its log.
///
/// The clock is frozen at each moment a scenario checks: launched there
/// (`-clockAt`, `-clockSpeed 0`) and stepped from one to the next while the
/// app runs (`step`, through `Library/Caches/aet.clock`). What the app does
/// at a moment is then the same on any machine, however slow or loaded: the
/// script waits for the log to say it has happened, never for a span of the
/// host's time to pass. A wait's timeout only says when to give up.
class Run {
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

  constructor(name: string) {
    this.name = name;
  }

  /// A fresh install, nothing stored.
  install(): void {
    quietly(() => simctl('terminate', udid, BUNDLE));
    quietly(() => simctl('uninstall', udid, BUNDLE));
    simctl('install', udid, APP);
    this.data = simctl('get_app_container', udid, BUNDLE, 'data');
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
    simctl('launch', udid, BUNDLE, '-clockAt', String(at), '-clockSpeed', String(speed), '-muteAudio', 'YES',
      ...prompt, ...args);
  }

  terminate(): void {
    quietly(() => simctl('terminate', udid, BUNDLE));
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

  /// The debug log so far, an event a line (`Screenshots.log`): { t (cook
  /// time, epoch s), ev (what happened), and its fields }, a field with no
  /// value left out. Read on from where the last read stopped; a line still
  /// being written is left for the next.
  lines(): Event[] {
    const path = `${this.data}/Library/Caches/aet.log`;
    if (!existsSync(path)) return [];
    const fd = openSync(path, 'r');
    try {
      const size = fstatSync(fd).size;
      if (size > this.logBytes) {
        const buffer = Buffer.alloc(size - this.logBytes);
        readSync(fd, buffer, 0, buffer.length, this.logBytes);
        const end = buffer.lastIndexOf(0x0a) + 1;
        for (const line of buffer.subarray(0, end).toString('utf8').split('\n')) {
          if (line === '') continue;
          try {
            this.log.push(JSON.parse(line) as Event);
          } catch {
            throw new Error(`the debug log's line ${this.log.length + 1} is not JSON: ${line.slice(0, 200)}`);
          }
        }
        this.logBytes += end;
      }
    } finally {
      closeSync(fd);
    }
    return this.log.slice();
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

  /// The prefs plist as JSON, each data value that is JSON parsed; waits
  /// until `ready(prefs)` holds, since the file lags the app by seconds.
  async prefs(ready: (p: Prefs) => boolean = () => true, timeoutS = WAIT_S): Promise<Prefs> {
    const path = `${this.data}/Library/Preferences/${BUNDLE}.plist`;
    const end = Date.now() + timeoutS * 1000;
    let last: Prefs = {};
    while (Date.now() < end) {
      last = existsSync(path) ? JSON.parse(out('python3', ['-c', PLIST_READ, path])) as Prefs : {};
      if (ready(last)) return last;
      await sleep(250);
    }
    return last;
  }

  /// Rename a key in the prefs plist, with the app terminated.
  renameKey(from: string, to: string): void {
    const path = `${this.data}/Library/Preferences/${BUNDLE}.plist`;
    out('python3', ['-c', PLIST_RENAME, path, from, to]);
  }

  /// Set keys in the prefs plist, with the app terminated: each value a
  /// text, stored as data, as the app stores its stores.
  setData(values: Record<string, string>): void {
    const path = `${this.data}/Library/Preferences/${BUNDLE}.plist`;
    out('python3', ['-c', PLIST_SET_DATA, path, JSON.stringify(values)]);
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

const PLIST_RENAME = `
import plistlib, sys
path, a, b = sys.argv[1:4]
with open(path, 'rb') as f:
    p = plistlib.load(f)
p[b] = p.pop(a)
with open(path, 'wb') as f:
    plistlib.dump(p, f, fmt=plistlib.FMT_BINARY)
`;

const PLIST_SET_DATA = `
import json, plistlib, sys
path, values = sys.argv[1], json.loads(sys.argv[2])
with open(path, 'rb') as f:
    p = plistlib.load(f)
for k, v in values.items():
    p[k] = v.encode('utf-8')
with open(path, 'wb') as f:
    plistlib.dump(p, f, fmt=plistlib.FMT_BINARY)
`;

// ----------------------------------------------------------- reading the log

/// The cook as the app stores it (Cook.swift, `Stored`).
interface Stored {
  cook: RunningCook;
  feedbackGiven: boolean;
  leanHint_s?: number | null;
}

/// One event of the debug log, as `Screenshots.Event` declares it: `t`, cook
/// time, epoch s, to the millisecond; `ev`, the case; its fields, a field
/// with no value left out.
type Event = { t: number } & (
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
  | { ev: 'verdict'; kind: string; whiteSets: boolean; cookS: number }
  | { ev: 'shown'; peak?: number; level?: number; plannedPeak: number }
  | { ev: 'stored'; value?: Stored }
  | { ev: 'restore'; phase: string; eventsWritten: boolean }
  | { ev: 'restoreTooOld' }
  | { ev: 'restoreUnreadable' }
  | { ev: 'restored' }
  | { ev: 'cookEnded' }
  | { ev: 'ring'; deadline: string }
  | { ev: 'activity'; what: string; stage: string; ends: number; up: boolean; cook: (string | null)[] }
  | { ev: 'activityEnd' }
  | { ev: 'activitySeen'; when: string; state: string; stage: string; ends: number }
  | { ev: 'scheduled'; id: string; at: number; inS: number }
  | { ev: 'notScheduled'; id: string; error: string }
  | { ev: 'alarmsCancelled' }
  | { ev: 'pending'; alarms: { id: string; at?: number }[] }
  | { ev: 'delivered'; ids: string[] }
  | { ev: 'log'; count: number; folded: number; last?: EggRecord }
  | { ev: 'asRanCorrected' }
  | { ev: 'asRanRemade' }
  | { ev: 'asRanNotRemade' }
  | { ev: 'answerHeld' }
  | { ev: 'answerHeldMade' }
  | { ev: 'stores'; verdict: string; mark?: string; markBuild?: string; version: string; build: string }
  | { ev: 'swept'; key: string }
  | { ev: 'wrote'; key: string; number?: number; text?: string }
  | { ev: 'answer'; cookS: number; decided: boolean; odds: boolean }
  | { ev: 'edit'; group?: string }
  | { ev: 'editLeaving' }
  | { ev: 'editCommitted'; fields: string[]; start?: number }
  | { ev: 'startLimit'; kind: string; at: number }
  | { ev: 'announce'; text: string }
  | { ev: 'view'; page: string }
  | { ev: 'layout'; part: string; y: number }
  | { ev: 'newerNote' }
  | { ev: 'sentence'; text: string }
  | { ev: 'panelStart'; at: number }
  | { ev: 'readout'; phase: string; big: string; sub: string }
  | { ev: 'frame'; at: number; phase: string; big: string; sub: string; range?: string }
  | { ev: 'certainty'; word?: string; time?: string }
  | { ev: 'white'; shown: boolean }
  | { ev: 'likely'; shown: boolean }
  | { ev: 'egg'; reading: string; yolk?: number }
  | { ev: 'slot'; text: string }
  | { ev: 'note'; text: string }
);
type Kind = Event['ev'];
type EventOf<K extends Kind> = Extract<Event, { ev: K }>;
/// An event found by a wait, with its index in the log.
type Found<E extends Event = Event> = E & { i: number };

/// The prefs plist as read, each data value that is JSON parsed: the keys a
/// check reads.
interface Prefs {
  start?: string;
  waterLitres?: number;
  eggCount?: number;
  doneness?: number;
  newestVersion?: string;
  newestBuild?: string;
  'cookInProgress.v3'?: Stored;
  'calibration.v5'?: { v: number; log: EggRecord[] };
  [key: string]: unknown;
}

/// A test of an event: that it is `ev`, and that `test` holds of it.
function is<K extends Kind>(ev: K, test: (e: EventOf<K>) => boolean = () => true): (e: Event) => e is EventOf<K> {
  return (e: Event): e is EventOf<K> => e.ev === ev && test(e as EventOf<K>);
}

/// The last event `ev` in these lines, or undefined.
function lastOf<K extends Kind>(lines: Event[], ev: K): EventOf<K> | undefined {
  const test = is(ev);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const e = lines[i]!;
    if (test(e)) return e;
  }
  return undefined;
}

/// A plan as the checks read it: { pull, cooled, lengthened, surface, next
/// (when the slow hob lengthens it next), asking (whether the eggs are still
/// in the water), overdue }, epoch s, exact; cooled and next null for none.
type Plan = Omit<EventOf<'plan'>, 'cooled' | 'next'> & { cooled: number | null; next: number | null };

/// The last plan logged in these lines.
function lastPlan(lines: Event[]): Plan | null {
  const l = lastOf(lines, 'plan');
  return l ? { ...l, cooled: l.cooled ?? null, next: l.next ?? null } : null;
}

/// The last plan logged in these lines, which there must be.
function planIn(lines: Event[]): Plan {
  const plan = lastPlan(lines);
  if (!plan) throw new Error('no plan logged');
  return plan;
}

/// The last Live Activity state pushed: { what (start, update), stage, ends,
/// up, cook: [doneness, peak yolk, mass, cooling] }.
const lastCard = (lines: Event[]): EventOf<'activity'> | null => lastOf(lines, 'activity') ?? null;

/// The last cook stored in these lines, or null for none; undefined if
/// nothing was stored.
function lastStored(lines: Event[]): Stored | null | undefined {
  const l = lastOf(lines, 'stored');
  return l ? l.value ?? null : undefined;
}

/// The last cook stored in these lines, which there must be.
function storedIn(lines: Event[]): Stored {
  const stored = lastStored(lines);
  if (!stored) throw new Error('no cook stored');
  return stored;
}

/// The notifications as last scheduled, cancelled and scheduled again:
/// { 'cook.pull': t, 'cook.cool': t } in cook time, exact.
function scheduled(lines: Event[]): Record<string, number> {
  let now: Record<string, number> = {};
  for (const l of lines) {
    if (l.ev === 'alarmsCancelled') now = {};
    if (l.ev === 'scheduled') now[l.id] = l.at;
  }
  return now;
}

/// The ids the last read-back found pending.
const pending = (lines: Event[]): string[] | null => lastOf(lines, 'pending')?.alarms.map((a) => a.id) ?? null;

/// The ids the last read-back found delivered and still shown.
const delivered = (lines: Event[]): string[] | null => lastOf(lines, 'delivered')?.ids ?? null;

/// The egg log as last written: { count, folded, last }.
function eggLog(lines: Event[]): { count: number; folded: number; last: EggRecord | null; t: number } | null {
  const l = lastOf(lines, 'log');
  return l ? { count: l.count, folded: l.folded, last: l.last ?? null, t: l.t } : null;
}

/// The last egg logged in these lines, which there must be.
function lastEgg(lines: Event[]): EggRecord {
  const egg = eggLog(lines)?.last;
  if (!egg) throw new Error('no egg logged');
  return egg;
}

/// The egg log written holding this many eggs, and this many folded if
/// given.
const logOf = (count: number, folded?: number): ((e: Event) => e is EventOf<'log'>) =>
  is('log', (e) => e.count === count && (folded === undefined || e.folded === folded));

/// Tolerances, s. A moment the clock was frozen at, or a tap a span after a
/// deadline, is exact: to a millisecond, for the decimal round trip. A
/// deadline planned again at a relaunch, against the one planned before it,
/// to the second (the plan is remade from the stored cook, at another
/// moment, before its surface is built again). Neither depends on the
/// machine: the clock does not move while the app works.
const EXACT = 1e-3;
const REPLAN = 1;
const near = (a: number | null | undefined, b: number | null | undefined, tol: number): boolean =>
  a != null && b != null && Math.abs(a - b) <= tol;
const has = (lines: Event[], test: (e: Event) => boolean): boolean => lines.some(test);
/// A number that may be none, as a message's arithmetic takes it.
const num = (x: number | null | undefined): number => x ?? NaN;
/// An event as a failure message says it.
const say = (e: Event | null | undefined): string => (e ? JSON.stringify(e) : 'none');

/// The phase logged, one of these.
const phaseIs = (...names: string[]): ((e: Event) => e is EventOf<'phase'>) =>
  is('phase', (e) => names.includes(e.phase));
/// A tap of `-uiDo`, by name (`boil`, `set`, `drag`).
const tapped = (name: string): ((e: Event) => e is EventOf<'action'>) => is('action', (e) => e.name === name);
/// A stored cook picked up at launch, or dropped as too old or unreadable.
const restoring = (e: Event): e is EventOf<'restore' | 'restoreTooOld' | 'restoreUnreadable'> =>
  e.ev === 'restore' || e.ev === 'restoreTooOld' || e.ev === 'restoreUnreadable';
/// Whether a restore picked the cook up, in this phase.
const restoredIn = (e: Event, phase: string): boolean => e.ev === 'restore' && e.phase === phase;
/// The cook cleared from the store.
const storedNone = is('stored', (e) => e.value === undefined);
/// The cook stored, as `test` holds of it as the store holds it.
const storedAs = (test: (s: Stored) => boolean): ((e: Event) => e is EventOf<'stored'>) =>
  is('stored', (e) => e.value !== undefined && test(e.value));

/// A record made with its forecast, as the fit needs it.
const forecastOk = (r: EggRecord | null | undefined): boolean => {
  const yolk: unknown = r?.forecast?.yolk;
  return Array.isArray(yolk) && yolk.length === 3;
};

// --------------------------------------------------------------- scenarios

interface Scenario { name: string; about: string; body: (run: Run) => Promise<void> }
const scenarios: Scenario[] = [];
const scenario = (name: string, about: string, body: (run: Run) => Promise<void>): void => {
  scenarios.push({ name, about, body });
};

/// Every phase of a cook logged in these lines, in order: not IDLE, which
/// the tick may log once more as a cook ends.
const phases = (lines: Event[]): string[] =>
  lines.filter(is('phase', (l) => l.phase !== 'IDLE')).map((l) => l.phase);
/// The lines before the first that `test` holds of, or all of them.
const before = (lines: Event[], test: (e: Event) => boolean): Event[] => {
  const i = lines.findIndex(test);
  return i < 0 ? lines : lines.slice(0, i);
};
const index = (lines: Event[], test: (e: Event) => boolean): number => lines.findIndex(test);
/// What Done shows, each time a plan is taken: the peak yolk, °C.
const shown = (lines: Event[]): number[] =>
  lines.filter(is('shown')).flatMap((l) => (l.peak === undefined ? [] : [l.peak]));
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
/// A value as JSON with every object's keys sorted: the app writes a
/// record's keys in no fixed order.
const canon = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const sorted = (a: string[] | null): string[] | null => (a ? [...a].sort() : a);

/// A hot start: the planner's stored inputs, which load only with a level.
const HOT = ['-doneness', '0.41', '-altitudeM', '0', '-waterLitres', '2', '-eggCount', '2', '-start', 'hot'];
/// A cold cook's taps to Done: the boil at 5:00, out 3 s into the pull.
const TO_DONE = 'boil@300,out@pull+3';

/// The cooling's end a plan has, epoch s: one made once the eggs are out
/// always has it.
function cooledAt(plan: Plan): number {
  if (plan.cooled === null) throw new Error('the plan has no cooling end');
  return plan.cooled;
}

/// The cook's start, epoch s, cook time.
const startOf = (stored: Stored): number => stored.cook.startedAt_s;

/// Start a cook at the run's first moment, frozen, and wait until it has
/// its first phase, its plan on its surface and its alarms: the cook as
/// stored.
async function started(run: Run, args: string[] = [], opts: LaunchOptions = {}): Promise<Stored> {
  run.launch(['-uiScreen', 'heating', ...args], opts);
  const first = await run.until(phaseIs('HEATING', 'COOKING'), { from: run.launched, what: 'the cook started' });
  await run.settled(first.i);
  return storedIn(run.sinceLaunch());
}

/// Step to 5:00, where `-uiDo boil@300` taps Full rolling boil: the plan
/// once cooking.
async function boiled(run: Run): Promise<Plan> {
  const i = await run.step(run.t0 + 300);
  const tap = await run.until(tapped('boil'), { from: i, what: 'the boil tapped' });
  const cooking = await run.until(phaseIs('COOKING'), { from: tap.i, what: 'phase COOKING' });
  await run.settled(cooking.i);
  return planIn(run.lines());
}

/// Step a second into the pull, then to `-uiDo`'s `out@pull+<after>`: the
/// plan once cooling.
async function toCooling(run: Run, after: number): Promise<Plan> {
  const plan = planIn(run.lines());
  let i = await run.step(plan.pull + 1);
  await run.until(phaseIs('PULL'), { from: i, what: 'phase PULL' });
  i = await run.step(plan.pull + after);
  const tap = await run.until(tapped('out'), { from: i, what: 'the tap out' });
  const cooling = await run.until(phaseIs('COOLING'), { from: tap.i, what: 'phase COOLING' });
  await run.settled(cooling.i);
  return planIn(run.lines());
}

/// A cold cook started with TO_DONE's taps, stepped to a second past the
/// cooling's end: the plan at Done.
async function toDone(run: Run): Promise<Plan> {
  await boiled(run);
  const cooling = await toCooling(run, 3);
  const i = await run.step(cooledAt(cooling) + 1);
  const done = await run.until(phaseIs('DONE'), { from: i, what: 'phase DONE' });
  await run.settled(done.i);
  return planIn(run.lines());
}

/// Launch again with the clock at `at`: the restore line, the restored
/// plan, and the lines once the alarms and the card are set again and the
/// cook has settled.
async function relaunched(
  run: Run, at: number, args: string[] = [], opts: LaunchOptions = {},
): Promise<{ restore: Found<EventOf<'restore' | 'restoreTooOld' | 'restoreUnreadable'>>; plan: Plan; lines: Event[] }> {
  run.launch(args, { ...opts, at });
  const restore = await run.until(restoring, { from: run.launched, what: 'the restore' });
  const restored = await run.until(is('restored'), { from: restore.i, what: 'the alarms and the card set again' });
  const phase = await run.until(is('phase'), { from: restore.i, what: 'the first tick' });
  await run.settled(Math.max(restored.i, phase.i));
  const lines = run.sinceLaunch();
  return { restore, plan: planIn(before(lines, is('pending'))), lines };
}

/// The parts of the screen whose place is logged (ContentView.logTop).
const PARTS = ['slider', 'sentence', 'egg'] as const;
type Part = typeof PARTS[number];
type Layout = Partial<Record<Part, number>>;

/// Where each part of the screen last sat, pt from the window's top
/// (`layout`, ContentView.logTop).
function layoutOf(lines: Event[]): Layout {
  const out: Layout = {};
  for (const l of lines) if (l.ev === 'layout') out[l.part as Part] = l.y;
  return out;
}

/// The lines once the app has nothing under way and the screen is drawn
/// (`tick`): what the screen says now is the last of each.
async function screen(run: Run): Promise<Event[]> {
  await run.tick();
  return run.lines();
}

/// Where each part of the screen sits now.
async function stillLayout(run: Run): Promise<Layout> {
  return layoutOf(await screen(run));
}

/// The egg in cross-section now: its reading (`aim`, `live`, `ran`) and how
/// set its yolk is (EggSectionView); with no egg drawn, a reading that is
/// none of those, and no yolk.
async function eggNow(run: Run): Promise<{ reading: string; yolk: number }> {
  const l = lastOf(await screen(run), 'egg');
  if (!l) return { reading: 'none', yolk: NaN };
  return l.yolk == null ? { reading: `${l.reading} none`, yolk: NaN } : { reading: l.reading, yolk: l.yolk };
}

/// Launch idle on a fresh install and wait for the time decided on its pot's
/// surface and its odds, and the screen still.
async function idle(run: Run, args: string[] = []): Promise<Layout> {
  run.launch(args);
  await run.until(is('answer', (e) => e.decided && e.odds), { from: run.launched, what: 'the idle time decided' });
  return stillLayout(run);
}

scenario('one-layout', 'C3 step 1: one layout from idle to Done; the slider, the sentence and the egg stay, nothing moves at the start', async (run) => {
  const before = await idle(run, ['-uiDo', `eggsIn@launch+1,${TO_DONE}`]);
  for (const part of PARTS) run.check(part in before, `idle: no ${part}`);
  let i = await run.step(run.t0 + 1);
  const heating = await run.until(phaseIs('HEATING'), { from: i, what: 'phase HEATING' });
  await run.settled(heating.i);
  const after = await stillLayout(run);
  for (const part of PARTS) {
    run.check(near(after[part], before[part], 2), `${part} moved at the start: ${before[part]} -> ${after[part]}`);
  }
  // Boiled at 5:00 (from the start, a second after the launch), out 3 s
  // into the pull, and on to Done: the three parts in every phase.
  run.t0 += 1;
  await toDone(run);
  const done = await stillLayout(run);
  for (const part of PARTS) run.check(part in done, `Done: no ${part}`);
  const phasesSeen = phases(run.lines());
  run.check(same(phasesSeen, ['HEATING', 'COOKING', 'PULL', 'COOLING', 'DONE']), `phases ${phasesSeen}`);
  run.note(`slider ${before.slider}, sentence ${before.sentence}, egg ${before.egg} pt, idle and Heating; Done ${done.slider}, ${done.sentence}`);
});

scenario('egg-readings', 'C3 step 2: the egg aimed for at idle (softer and firmer differ), live from raw at the start, as it ran at Done', async (run) => {
  await idle(run, [...HOT, '-uiDo',
    'set:level=0.1@launch+1,set:level=0.95@launch+2,set:level=0.41@launch+3,eggsIn@launch+4,out@pull+2']);
  const at = async (s: number): Promise<{ reading: string; yolk: number }> => {
    const i = await run.step(run.t0 + s);
    await run.until(tapped('set'), { from: i, what: `the level set at +${s} s` });
    await run.until(is('answer', (e) => e.decided), { from: i, what: 'decided' });
    return eggNow(run);
  };
  const runny = await at(1);
  const hard = await at(2);
  const jammy = await at(3);
  run.check(runny.reading === 'aim' && hard.reading === 'aim', `idle reads the aim: ${runny.reading}, ${hard.reading}`);
  run.check(runny.yolk < jammy.yolk && jammy.yolk < hard.yolk, `aimed yolks ${runny.yolk}, ${jammy.yolk}, ${hard.yolk}`);
  const i = await run.step(run.t0 + 4);
  const cooking = await run.until(phaseIs('COOKING'), { from: i, what: 'phase COOKING' });
  await run.settled(cooking.i);
  const live = await eggNow(run);
  run.check(live.reading === 'live' && live.yolk < 0.01, `the cook reads live, from raw: ${live.reading} ${live.yolk}`);
  run.t0 += 4;
  const cooling = await toCooling(run, 2);
  run.check((await eggNow(run)).reading === 'live', 'cooling reads live');
  const j = await run.step(cooledAt(cooling) + 1);
  const done = await run.until(phaseIs('DONE'), { from: j, what: 'phase DONE' });
  await run.settled(done.i);
  const ran = await eggNow(run);
  run.check(ran.reading === 'ran', `Done reads the egg as it ran: ${ran.reading}`);
  run.note(`idle aim yolk runny ${runny.yolk}, jammy ${jammy.yolk}, hard ${hard.yolk}; start ${live.yolk}; Done ${ran.yolk}`);
});

/// The level moved, idle, from one where "Most likely" shows under the
/// certainty word to one where it does not and back, a word asked very
/// certain to a ballpark: the slider never moves (UI.md section 8, "Nothing
/// jumps"). On a fresh install 0.5 and 0.8 show it, 0.6 and 0.9 do not.
async function likelyStill(run: Run, args: string[]): Promise<void> {
  const levels = [0.5, 0.6, 0.8, 0.9];
  const uiDo = levels.map((l, k) => `set:level=${l}@launch+${k + 1}`).join(',');
  const first = await idle(run, [...args, '-doneness', '0.6', '-uiDo', uiDo]);
  const seen = [];
  for (let k = 0; k < levels.length; k += 1) {
    const i = await run.step(run.t0 + k + 1);
    const set = await run.until(tapped('set'), { from: i, what: `the level set to ${levels[k]}` });
    await run.until(is('answer', (e) => e.decided && e.odds), { from: set.i, what: 'decided' });
    const lines = await screen(run);
    seen.push({ level: levels[k], likely: lastOf(lines, 'likely')?.shown === true, slider: layoutOf(lines).slider });
  }
  run.check(seen.some((s) => s.likely) && seen.some((s) => !s.likely),
    `"Most likely" never came and went: ${seen.map((s) => `${s.level} ${s.likely}`).join(', ')}`);
  for (const s of seen) {
    run.check(near(s.slider, first.slider, 0.5), `the slider moved at ${s.level} (likely ${s.likely}): ${first.slider} -> ${s.slider}`);
  }
  run.note(`slider ${first.slider} pt; ${seen.map((s) => `${s.level} ${s.likely ? 'likely' : '-'} ${s.slider}`).join(', ')}`);
}

scenario('likely-still', 'UI.md 8: "Most likely" comes and goes under the certainty word without moving the slider', async (run) => {
  await likelyStill(run, []);
});

scenario('likely-still-largest', 'UI.md 8: the same at the largest text size, in 1750, where "Most probably" wraps', async (run) => {
  await likelyStill(run, [
    '-UIPreferredContentSizeCategoryName', 'UICTContentSizeCategoryAccessibilityXXXL', '-uiLanguage', 'en-x-1750',
  ]);
});

/// A correction committed (`edit committed`, after a tap's settle or on
/// release) from line `from`: the cook as stored then, its plan once the
/// cook has settled, and the lines since.
/// A correction as committed: the cook stored, its plan, and the lines
/// from the commit on, and its index.
interface Corrected { cook: RunningCook | undefined; plan: Plan; lines: Event[]; i: number }

async function corrected(run: Run, from: number): Promise<Corrected> {
  const c = await run.until(is('editCommitted'), { from, what: 'a correction committed' });
  const stored = await run.until(is('stored'), { from: c.i, what: 'the corrected cook stored' });
  const plan = await run.until(is('plan'), { from: stored.i, what: 'the corrected cook planned' });
  await run.settled(plan.i);
  const lines = run.lines().slice(c.i);
  return { cook: lastStored(lines)?.cook, plan: planIn(lines), lines, i: c.i };
}

/// Step to `at`, where a `-uiDo` tap is due, and wait for it: its line.
async function tapAt(run: Run, at: number, what: string, opts: { idle?: boolean } = {}): Promise<Found<EventOf<'action'>>> {
  const i = await run.step(at, opts);
  return run.until(tapped(what), { from: i, what: `the tap ${what}` });
}

/// The start the start's panel shows, from line `from` on: epoch s, and
/// the line's index.
async function panelStart(run: Run, from: number): Promise<{ at: number; i: number }> {
  const l = await run.until(is('panelStart'), { from, what: "the start's panel" });
  return { at: l.at, i: l.i };
}

/// A hot cook started and planned on its pot's surface: its plan.
async function hotStarted(run: Run, uiDo: string): Promise<Plan> {
  await started(run, [...HOT, '-uiDo', uiDo]);
  return planIn(run.lines());
}

/// The words a key says in English, from the catalogue.
const EN = (JSON.parse(readFileSync('copy/en.json', 'utf8')) as { messages: Record<string, { text: string }> }).messages;

scenario('owner-case', "C3 step 3: boiling corrected to cold, as the owner needed: Heating again, the pull later, the settings and the card follow", async (run) => {
  const plan0 = await hotStarted(run, 'set:start=cold@60');
  const card0 = lastCard(run.lines());
  const tap = await tapAt(run, run.t0 + 60, 'set');
  const after = await corrected(run, tap.i);
  const phase = await run.until(phaseIs('HEATING'), { from: tap.i, what: 'Heating again' });
  run.check(phase, 'back to Heating');
  run.check(after.cook?.choices.startMode === 'cold', `the cook says ${after.cook?.choices.startMode}`);
  run.check(near(after.cook?.correctedAt_s, run.t0 + 60, EXACT), 'corrected at the moment of the tap');
  run.check(after.plan.pull > plan0.pull + 60, `the pull later: ${(after.plan.pull - plan0.pull).toFixed(0)} s`);
  run.check(near(scheduled(after.lines)['cook.pull'], after.plan.pull, EXACT), 'the pull rescheduled to the corrected plan');
  const card = lastCard(after.lines);
  run.check(card?.what === 'update' && card.stage === 'heating', `the card in place: ${card?.what} ${card?.stage} (was ${card0?.stage})`);
  run.check(card && card0 && card.ends !== card0.ends, 'the card ends at the corrected pull');
  const prefs = await run.prefs((p) => p.start === 'cold');
  run.check(prefs.start === 'cold', `the next cook's setting: ${prefs.start}`);
  run.terminate();
  const r = await relaunched(run, run.t0 + 90);
  run.check(restoredIn(r.restore, 'HEATING'), say(r.restore));
  run.check(near(r.plan.pull, after.plan.pull, REPLAN), `relaunched: ${(r.plan.pull - after.plan.pull).toFixed(3)} s`);
  run.note(`the pull ${(after.plan.pull - plan0.pull).toFixed(0)} s later; card ${card0?.stage} -> ${card?.stage}`);
});

scenario('cold-to-hot-after-tap', 'C3 step 3: cold corrected to boiling after the boil was pressed: the tap kept, the pull sooner', async (run) => {
  await started(run, ['-uiDo', 'boil@300,set:start=hot@boil+60']);
  const was = await boiled(run);
  const tap = num(storedIn(run.lines()).cook.events.boilAt_s);
  const t = await tapAt(run, tap + 60, 'set');
  const after = await corrected(run, t.i);
  run.check(after.cook?.events.boilAt_s === tap, `the tap kept: ${num(after.cook?.events.boilAt_s) - tap}`);
  run.check(after.cook?.choices.startMode === 'hot', 'the cook says boiling');
  run.check(after.plan.pull < was.pull, `a boiling start pulls sooner: ${(after.plan.pull - was.pull).toFixed(0)} s`);
  run.note(`the pull ${(after.plan.pull - was.pull).toFixed(0)} s`);
});

scenario('heavier-lighter', 'C3 step 3: a heavier egg pulls later, a lighter sooner, each committed after the settle; back exactly', async (run) => {
  const plan0 = await hotStarted(run, 'set:size=3@30,set:size=1@40,set:size=2@50');
  let t = await tapAt(run, run.t0 + 30, 'set');
  // Nothing yet: a tap settles first.
  const edit = await run.until(is('edit', (e) => e.group === 'mass'), { from: t.i, what: 'the change in hand' });
  run.check(!has(run.lines().slice(t.i, edit.i + 1), is('stored')), 'not committed before the settle');
  let after = await corrected(run, t.i);
  const heavier = after.plan.pull;
  run.check(heavier > plan0.pull, `heavier, later: ${(heavier - plan0.pull).toFixed(1)} s`);
  run.check(near(scheduled(after.lines)['cook.pull'], heavier, EXACT), 'the alarm follows');
  t = await tapAt(run, run.t0 + 40, 'set');
  after = await corrected(run, t.i);
  const lighter = after.plan.pull;
  run.check(lighter < plan0.pull, `lighter, sooner: ${(lighter - plan0.pull).toFixed(1)} s`);
  t = await tapAt(run, run.t0 + 50, 'set');
  after = await corrected(run, t.i);
  run.check(after.plan.surface, 'planned on its pot');
  run.check(near(after.plan.pull, plan0.pull, 1e-6), `back gives back: ${(after.plan.pull - plan0.pull).toFixed(6)} s`);
  const card = lastCard(after.lines);
  run.check(card && near(card.ends, Math.round(plan0.pull), 1), `the card back at the pull: ${card?.ends}`);
  run.note(`heavier +${(heavier - plan0.pull).toFixed(1)} s, lighter ${(lighter - plan0.pull).toFixed(1)} s, back exactly`);
});

scenario('overdue-and-back', 'C3 step 3: a correction that makes the egg overdue rings at once; changed back within the grace, the pull is cancelled', async (run) => {
  const plan0 = await hotStarted(run, '');
  // The taps at moments of the cook as first planned, from its start: a tap
  // anchored on the pull would follow the pull the first one moves. Set by
  // relaunching on the stored cook, which takes its controls up again.
  run.terminate();
  const before = plan0.pull - run.t0;
  await relaunched(run, run.t0 + 10, ['-uiDo', `set:size=0@${before - 40},set:size=2@${before - 35}`]);
  let t = await tapAt(run, plan0.pull - 40, 'set');
  let after = await corrected(run, t.i);
  await run.until(phaseIs('PULL'), { from: t.i, what: 'Pull at once' });
  run.check(after.plan.overdue && near(after.plan.pull, plan0.pull - 40, EXACT), `the pull now: ${after.plan.pull - plan0.pull}`);
  await run.until(is('ring', (e) => e.deadline === 'pull'), { from: t.i, what: 'rung at once' });
  t = await tapAt(run, plan0.pull - 35, 'set');
  after = await corrected(run, t.i);
  await run.until(phaseIs('COOKING'), { from: t.i, what: 'Cooking again' });
  // The ring the plan no longer holds, cleared by the clock's next look
  // (core `eventsDue`; onescreen review 3).
  const cleared = await run.until(storedAs((s) => s.cook.events.rangAt_s === null), { from: t.i, what: 'the ring undone' });
  const ev = lastStored(run.lines().slice(0, cleared.i + 1))?.cook.events;
  run.check(ev?.pulled === null && ev?.rangAt_s === null, `nothing observed: ${JSON.stringify(ev)}`);
  run.check(near(after.plan.pull, plan0.pull, 1), `the pull back: ${(after.plan.pull - plan0.pull).toFixed(1)} s`);
  run.check(near(scheduled(after.lines)['cook.pull'], after.plan.pull, EXACT), 'its alarm set again');
  run.note('overdue: Pull and a ring at once; back within the grace: Cooking, nothing written, the alarm set again');
});

scenario('drag-no-ring', 'C3 step 3: a drag through an overdue level rings nothing before release; the egg shows the aim while held', async (run) => {
  const plan0 = await hotStarted(run, 'drag:0.3/0.1/0@pull-60,drag:0.2/0.41@pull-57,release@pull-56,drag:0@pull-50,release@pull-49');
  const level = storedIn(run.lines()).cook.choices.level;
  let t = await tapAt(run, plan0.pull - 60, 'drag');
  // Held until the app has caught up: the drag's levels set, and a settle
  // it began, which a held slider must not, under way and waited for.
  const egg = await eggNow(run);
  run.check(egg.reading === 'aim', `the aim while held: ${egg.reading}`);
  let lines = run.lines().slice(t.i);
  run.check(!has(lines, is('ring')) && !has(lines, is('editCommitted')), 'held: nothing rung or committed');
  await tapAt(run, plan0.pull - 57, 'drag');
  t = await tapAt(run, plan0.pull - 56, 'release');
  await run.until(is('editCommitted'), { from: t.i, what: 'the release' });
  await run.tick();
  lines = run.lines().slice(t.i);
  run.check(!has(lines, is('stored')) && !has(lines, is('ring')), `released at the level it had (${level}): nothing`);
  await tapAt(run, plan0.pull - 50, 'drag');
  t = await tapAt(run, plan0.pull - 49, 'release');
  const after = await corrected(run, t.i);
  await run.until(is('ring', (e) => e.deadline === 'pull'), { from: t.i, what: 'rung on release' });
  run.check(num(after.cook?.choices.level) < 0.1, `the level corrected: ${after.cook?.choices.level}`);
  run.note('held through runny: no ring, the aim drawn; back and released: nothing; released runny: rang');
});

scenario('start-time', "C3 step 3: the start corrected in its clause's panel a minute at a time, stopped with its reason at now, the boil pressed, and two hours back", async (run) => {
  const cook = await started(run, ['-uiDo', 'open:clause-start@140,start:+3@150,boil@240,start:+5@boil+60,start:-140@boil+70']);
  const id = cook.cook.id_ms / 1000;
  let t = await tapAt(run, run.t0 + 140, 'open');
  const shown = await panelStart(run, t.i);
  run.check(near(shown.at, startOf(cook), EXACT), `the panel says when: ${shown.at - run.t0}`);
  t = await tapAt(run, run.t0 + 150, 'start');
  const now = await run.until(is('startLimit', (e) => e.kind === 'now'), { from: t.i, what: 'the limit at now' });
  let after = await corrected(run, t.i);
  run.check(near(after.cook?.startedAt_s, run.t0 + 150, EXACT), `in at now: ${num(after.cook?.startedAt_s) - run.t0}`);
  const movedAt = lastOf(await screen(run), 'panelStart')?.at;
  run.check(near(movedAt, after.cook?.startedAt_s, EXACT), `the panel follows: ${num(movedAt) - run.t0}`);
  t = await tapAt(run, run.t0 + 390, 'boil');
  await run.until(phaseIs('COOKING'), { from: t.i, what: 'the boil' });
  const tap = run.t0 + 390;
  t = await tapAt(run, tap + 60, 'start');
  const boil = await run.until(is('startLimit', (e) => e.kind === 'boil'), { from: t.i, what: 'the limit at the boil' });
  after = await corrected(run, t.i);
  run.check(near(after.cook?.startedAt_s, tap, EXACT), `in at the press: ${num(after.cook?.startedAt_s) - tap}`);
  t = await tapAt(run, tap + 70, 'start');
  const early = await run.until(is('startLimit', (e) => e.kind === 'earliest'), { from: t.i, what: 'the limit two hours back' });
  after = await corrected(run, t.i);
  run.check(near(after.cook?.startedAt_s, id - 7200, EXACT), `two hours back: ${num(after.cook?.startedAt_s) - id}`);
  // Said to VoiceOver too, at each (onescreen review 3).
  const said = run.lines().filter(is('announce')).map((l) => l.text);
  run.check(said.length >= 3 && said[0] === EN['controls.startedAt.latestNow'].text, `announced: ${JSON.stringify(said)}`);
  run.note(`limits: ${[now, boil, early].map((l) => `${l.kind} +${(l.at - run.t0).toFixed(0)} s`).join(', ')}`);
});

scenario('sentence-no-time', "DECISIONS 108: the sentence never says when the eggs went in, idle, heating, cooking or corrected to the heat off; the start's panel does", async (run) => {
  await idle(run, ['-uiDo', 'eggsIn@launch+1,boil@300,open:clause-start@310,set:heatOff=1@320']);
  const said = (lines: Event[]): string[] => lines.filter(is('sentence')).map((l) => l.text);
  const idleSaid = said(run.lines()).at(-1) ?? '';
  const cold = EN['setup.start.cold'].text;
  const i = await run.step(run.t0 + 1);
  const heating = await run.until(phaseIs('HEATING'), { from: i, what: 'phase HEATING' });
  await run.settled(heating.i);
  run.t0 += 1;
  await boiled(run);
  const t = await tapAt(run, run.t0 + 310, 'open');
  const shown = await panelStart(run, t.i);
  run.check(near(shown.at, startOf(storedIn(run.lines())), EXACT), `the panel says when: ${shown.at - run.t0}`);
  const off = await tapAt(run, run.t0 + 320, 'set');
  await corrected(run, off.i);
  const lines = await screen(run);
  const before = said(lines.slice(i, off.i));
  const after = said(lines.slice(off.i));
  const standing = EN['setup.start.coldStanding'].text;
  run.check(idleSaid.includes(cold), `idle: "${idleSaid}"`);
  for (const line of [...before, ...after]) run.check(!/\d:\d\d/.test(line), `a time in the sentence: "${line}"`);
  // Idle, heating and cooking: the same words.
  run.check(before.every((x) => x === idleSaid), `the sentence changed before the heat went off: ${JSON.stringify(before)}`);
  run.check(after.at(-1)?.includes(standing), `the heat off: "${after.at(-1)}"`);
  run.note(`"${idleSaid}"; "${after.at(-1)}"`);
});

scenario('settings-mid-cook', "C3 step 3: Settings open while a cook runs; its water corrects the cook and the next cook's; the pull brings the egg back", async (run) => {
  const plan0 = await hotStarted(run, 'open:settings@10,set:water=1@20');
  let t = await tapAt(run, run.t0 + 10, 'open');
  await run.until(is('view', (e) => e.page === 'settings'), { from: t.i, what: 'Settings open' });
  t = await tapAt(run, run.t0 + 20, 'set');
  const after = await corrected(run, t.i);
  run.check(after.cook?.choices.waterLitres === 1, `the cook's water: ${after.cook?.choices.waterLitres}`);
  run.check(after.plan.pull !== plan0.pull, `the pull moved: ${(after.plan.pull - plan0.pull).toFixed(1)} s`);
  const prefs = await run.prefs((p) => p.waterLitres === 1);
  run.check(prefs.waterLitres === 1, `the next cook's water: ${prefs.waterLitres}`);
  run.check(prefs.eggCount === undefined || prefs.eggCount === 2, `only what changed written: eggs ${prefs.eggCount}`);
  const i = await run.step(after.plan.pull + 1);
  await run.until(phaseIs('PULL'), { from: i, what: 'the pull' });
  await run.until(is('view', (e) => e.page === 'egg'), { from: i, what: "the egg's page at the pull" });
  run.note(`water 2 → 1 L: the pull ${(after.plan.pull - plan0.pull).toFixed(1)} s; the egg's page at the pull`);
});

scenario('record-corrected-at-done', 'C3 step 3: a correction at Done changes the record, planned on the calibration before this egg; back, the first to the bit', async (run) => {
  await hotStarted(run, 'out@pull+2,answer:runny@cooled+5,set:size=3@cooled+10,set:size=2@cooled+20');
  const cooling = await toCooling(run, 2);
  let i = await run.step(cooledAt(cooling) + 1);
  await run.until(phaseIs('DONE'), { from: i, what: 'Done' });
  i = await run.step(cooledAt(cooling) + 5);
  await run.until(logOf(1, 1), { from: i, what: 'Runny folded' });
  const first = lastEgg(run.lines());
  const peak0 = shown(run.lines()).at(-1);
  let t = await tapAt(run, cooledAt(cooling) + 10, 'set');
  await run.until(is('asRanCorrected'), { from: t.i, what: 'the record planned again' });
  const changed = await run.until(logOf(1, 1), { from: t.i, what: 'the corrected egg folded again' });
  const heavier = lastEgg(run.lines().slice(0, changed.i + 1));
  run.check(heavier.yolkWord === 'runny', `the answer kept: ${heavier.yolkWord}`);
  run.check(heavier.recommended_s === first.recommended_s, 'the time that ran is the time that ran');
  run.check(canon(heavier.forecast) !== canon(first.forecast), "the forecast is the heavier egg's");
  run.check(heavier.egg.mass_g !== first.egg.mass_g, `the egg corrected: ${heavier.egg.mass_g} g`);
  t = await tapAt(run, cooledAt(cooling) + 20, 'set');
  await run.until(is('asRanCorrected'), { from: t.i, what: 'the record planned again' });
  await run.until(logOf(1, 1), { from: t.i, what: 'folded again' });
  const again = lastEgg(run.lines());
  run.check(canon(again.forecast) === canon(first.forecast),
    `back, the first forecast, not one that knew Runny: ${JSON.stringify(again.forecast)} vs ${JSON.stringify(first.forecast)}`);
  run.check(canon(again) === canon(first), 'back, the record is the first to the bit');
  const peak1 = num(shown(run.lines()).at(-1));
  run.check(Math.abs(peak1 - num(peak0)) < 0.01, `Done shows the cook as it ran: ${peak1} (was ${peak0})`);
  run.note(`heavier: ${heavier.egg.mass_g} g, a new forecast, Runny kept; back: the first record to the bit, ${peak1.toFixed(2)} °C`);
});

scenario('slider-after-pull', 'C3 step 3: after the pull the slider only previews: no correction, the record as it was, back to its level', async (run) => {
  await hotStarted(run, 'out@pull+2,answer:jammy@cooled+5,drag:0.6/0.9@cooled+10,release@cooled+12');
  const cooling = await toCooling(run, 2);
  let i = await run.step(cooledAt(cooling) + 1);
  await run.until(phaseIs('DONE'), { from: i, what: 'Done' });
  i = await run.step(cooledAt(cooling) + 5);
  await run.until(logOf(1, 1), { from: i, what: 'Jammy folded' });
  const first = canon(lastEgg(run.lines()));
  const stored0 = storedIn(run.lines()).cook;
  await tapAt(run, cooledAt(cooling) + 10, 'drag');
  const aim = await eggNow(run);
  run.check(aim.reading === 'aim', `the aim while held: ${aim.reading}`);
  const t = await tapAt(run, cooledAt(cooling) + 12, 'release');
  await run.until(is('editCommitted'), { from: t.i, what: 'the release' });
  // The aim's settle, then the egg as it ran again.
  await run.until(is('egg', (e) => e.reading === 'ran'), { from: t.i, what: 'the egg as it ran again' });
  const lines = run.lines().slice(t.i);
  const stored = storedIn(run.lines()).cook;
  run.check(stored.correctedAt_s === stored0.correctedAt_s && stored.choices.level === stored0.choices.level,
    `no correction: ${stored.correctedAt_s}, level ${stored.choices.level}`);
  run.check(!has(lines, is('log')) || canon(eggLog(lines)?.last) === first, 'the record as it was');
  run.note(`dragged to 0.9 and let go: the aim drawn, no correction, the record as it was, the egg as it ran again`);
});

/// A hot cook whose pull's grace ran out unanswered, so the clock assumed
/// the eggs came out, corrected 30 s after the pull to a cold start: the
/// plan asks whether they are still in the water. The plan before, and the
/// correction.
async function asked(run: Run, uiDo: string): Promise<{ plan0: Plan; after: Corrected }> {
  const plan0 = await hotStarted(run, `set:start=cold@pull+30,${uiDo}`);
  let i = await run.step(plan0.pull + 25);
  await run.until(phaseIs('COOLING'), { from: i, what: 'the grace run out' });
  const pulled = storedIn(run.lines()).cook.events.pulled;
  run.check(pulled?.by === 'timeout' && !pulled.confirmed, `the clock assumed the pull: ${JSON.stringify(pulled)}`);
  const t = await tapAt(run, plan0.pull + 30, 'set');
  const after = await corrected(run, t.i);
  run.check(after.plan.asking, 'the plan asks');
  return { plan0, after };
}

scenario('still-in-yes', 'C3 step 4: a correction after the grace ran out asks "still in the water?"; nothing past it; yes: timed again', async (run) => {
  const { plan0, after } = await asked(run, 'stillIn@pull+700');
  run.check(has(after.lines, is('alarmsCancelled')) && Object.keys(scheduled(after.lines)).length === 0,
    `nothing scheduled while it asks: ${JSON.stringify(scheduled(after.lines))}`);
  const card = lastCard(after.lines);
  run.check(card?.stage === 'pull', `the card shows the pull while it asks: ${card?.stage}`);
  // No caveat about the pull it doubts (onescreen review 3).
  const white = lastOf(await screen(run), 'white');
  run.check(white?.shown === false, `the white's line under the question: ${say(white)}`);
  // The cooling's counted end passes under the question: nothing, once the
  // app has caught up with it.
  const i = await run.step(plan0.pull + 640);
  let lines = run.lines().slice(i);
  run.check(!has(lines, phaseIs('DONE')) && !has(lines, is('ring')), 'nothing past the question');
  run.check(storedIn(run.lines()).cook.events.cooledAt_s === null, 'no cooling written');
  const t = await tapAt(run, plan0.pull + 700, 'stillIn');
  const heating = await run.until(phaseIs('HEATING', 'PULL'), { from: t.i, what: 'timed again' });
  await run.settled(heating.i);
  lines = run.lines().slice(t.i);
  const cook = lastStored(lines)?.cook;
  run.check(cook?.events.pulled === null, `still in: the assumed pull dropped: ${JSON.stringify(cook?.events.pulled)}`);
  run.check(!planIn(lines).asking, 'the question answered');
  run.note(`still in: ${heating.phase}; the card ${card?.stage} while it asked`);
});

scenario('still-in-no', 'C3 step 4: "still in the water?" answered no: the pull stands, confirmed, and the record is made for cold water', async (run) => {
  const { plan0 } = await asked(run, 'stillOut@pull+40');
  const t = await tapAt(run, plan0.pull + 40, 'stillOut');
  const out = await run.until(storedAs((s) => s.cook.events.pulled?.confirmed === true), { from: t.i, what: 'the pull confirmed' });
  await run.settled(out.i);
  const lines = run.lines().slice(t.i);
  const cook = lastStored(run.lines())?.cook;
  const pulled = cook?.events.pulled;
  run.check(pulled?.by === 'timeout' && pulled.confirmed, `out: the pull stands, confirmed: ${JSON.stringify(pulled)}`);
  run.check(cook?.choices.startMode === 'cold' && cook.asRan?.correctedAt_s === cook.correctedAt_s, 'as ran, for cold water');
  run.check(!planIn(lines).asking, 'not asked again');
  run.note(`out: ${phases(lines).at(-1) ?? 'COOLING'}, the pull confirmed, the record corrected`);
});

scenario('running-lines', 'C3 step 5: corrected to cold and left heating, the slow hob counts the time heated up, on the clock and the card', async (run) => {
  await hotStarted(run, 'set:start=cold@300');
  const t = await tapAt(run, run.t0 + 300, 'set');
  const after = await corrected(run, t.i);
  await run.until(phaseIs('HEATING'), { from: t.i, what: 'Heating again' });
  run.check(!after.plan.lengthened, 'on the guess at first');
  const i = await run.step(run.t0 + 16 * 60);
  const plan = await run.until(is('plan', (e) => e.lengthened), { from: i, what: 'the slow hob lengthened' });
  await run.settled(plan.i);
  const said = await run.until(is('readout', (e) => e.phase === 'HEATING' && e.big === '16:00'), { from: i, what: 'the time heated, counting up' });
  const card = lastCard(run.lines().slice(i));
  run.check(card?.stage === 'heating' && card.up, `the card counts up: ${card?.stage} ${card?.up}`);
  run.note(`${said.phase} ${said.big} | ${said.sub}`);
});

scenario('white-unset', 'C3 step 5: a correction the white never sets in gets the longest time the pan can give, and the slot says so', async (run) => {
  await hotStarted(run, 'set:heatOff=1@20,set:size=0@30,set:eggs=1@40,set:water=0.5@50');
  for (const s of [20, 30, 40, 50]) {
    const t = await tapAt(run, run.t0 + s, 'set');
    await corrected(run, t.i);
  }
  const never = EN['refusal.whiteNeverSets'].text;
  const slot = await run.until(is('slot'), { from: run.launched, what: 'the slot' });
  const now = lastOf(run.lines(), 'slot');
  run.check(now?.text === never, `the slot: "${now?.text}"`);
  run.check(slot, 'the slot says it');
  run.note(`heat off, 0.5 L, one small egg: "${now?.text}"`);
});

scenario('cold', 'a cold cook: boil, pull, cooling, Done, an answer, Start again', async (run) => {
  const cook = await started(run, ['-uiDo', `${TO_DONE},answer:jammy@cooled+20,again@cooled+40`]);
  const start = startOf(cook);
  run.check(start === run.t0, `started at +${start - run.t0} s`);
  const done = await toDone(run);
  let i = await run.step(cooledAt(done) + 20);
  await run.until(tapped('answer'), { from: i, what: 'the answer' });
  await run.until(logOf(1, 1), { from: i, what: 'the fold' });
  i = await run.step(cooledAt(done) + 40);
  await run.until(storedNone, { from: i, what: 'Start again' });
  const lines = run.lines();
  run.check(same(phases(lines), ['HEATING', 'COOKING', 'PULL', 'COOLING', 'DONE']), `phases ${phases(lines)}`);
  const last = storedIn(before(lines, storedNone)).cook;
  run.check(near(last.events.boilAt_s, start + 300, EXACT), `boil at ${num(last.events.boilAt_s) - start}`);
  run.check(last.events.pulled?.by === 'cook', `pulled by ${last.events.pulled?.by}`);
  const pulled = last.events.pulled!;
  run.check(near(pulled.out_s - pulled.due_s, 3, EXACT), 'out 3 s into the pull');
  run.check(last.events.cooledAt_s !== null, 'the cooling ended');
  // The alarms set when the boil was tapped are that plan's.
  const cooking = before(lines, phaseIs('PULL'));
  const plan = planIn(cooking);
  const alarms = scheduled(cooking);
  run.check(
    near(alarms['cook.pull'], plan.pull, EXACT) && near(alarms['cook.cool'], plan.cooled, EXACT),
    `alarms ${JSON.stringify(alarms)} for the plan ${plan.pull}, ${plan.cooled}`,
  );
  run.check(same(sorted(pending(cooking)), ['cook.cool', 'cook.pull']), `pending ${pending(cooking)}`);
  run.check(!has(lines, is('ring')), 'no ring: the notifications held both');
  run.check(has(lines, is('activityEnd')), 'the card ended at Done');
  const egg = eggLog(lines)!;
  run.check(egg.count === 1, `one egg logged, not ${egg.count}`);
  const record = egg.last!;
  run.check(record.yolkWord === 'jammy' && record.pulledBy === 'cook', 'the answer and the pull recorded');
  run.check(forecastOk(record), 'the record has its forecast');
  run.check(record.appVersion.endsWith(' (debug clock)'), `marked: ${record.appVersion}`);
  const prefs = await run.prefs((p) => !('cookInProgress.v3' in p) && p['calibration.v5']?.log?.length === 1);
  run.check(!('cookInProgress.v3' in prefs), 'no cook stored after Start again');
  run.check(prefs['calibration.v5']?.log?.length === 1, 'the plist holds the one egg');
  run.note(
    `in ${Math.round(pulled.out_s - start)} s, cooled ${Math.round(num(last.events.cooledAt_s) - pulled.out_s)} s`,
  );
});

scenario('hot', 'a hot start to Done; Start again logs it unanswered', async (run) => {
  const cook = await started(run, [...HOT, '-uiDo', 'out@pull+2,again@cooled+5']);
  run.check(cook.cook.choices.startMode === 'hot', `start mode ${cook.cook.choices.startMode}`);
  const cooling = await toCooling(run, 2);
  let i = await run.step(cooledAt(cooling) + 1);
  await run.until(phaseIs('DONE'), { from: i, what: 'phase DONE' });
  i = await run.step(cooledAt(cooling) + 5);
  await run.until(storedNone, { from: i, what: 'Start again' });
  const lines = run.lines();
  run.check(same(phases(lines), ['COOKING', 'PULL', 'COOLING', 'DONE']), `phases ${phases(lines)}`);
  const egg = eggLog(lines);
  run.check(egg?.count === 1 && egg.last!.yolkWord === null, 'one egg logged, unanswered');
  run.check(forecastOk(egg?.last), 'with its forecast');
  run.check(egg?.last!.setup.startMode === 'hot', 'a hot start recorded');
});

scenario('cancel', 'Cancel while heating: nothing stored, the alarms and the card gone', async (run) => {
  await started(run, ['-uiDo', 'cancel@120']);
  const i = await run.step(run.t0 + 120);
  const ended = await run.until(is('cookEnded'), { from: i, what: 'the cancel' });
  await run.until(is('alarmsCancelled'), { from: ended.i, what: 'the alarms cancelled' });
  await run.until(storedNone, { from: ended.i, what: 'the cook cleared' });
  const lines = run.lines();
  run.check(lastStored(lines) === null, 'nothing stored');
  run.check((eggLog(lines)?.count ?? 0) === 0, 'no egg logged');
  run.terminate();
  run.launch();
  // The launch's own read-back, three seconds on (AppModel.appear).
  await run.until(is('delivered'), { from: run.launched, what: 'the alarms read back' });
  const after = run.sinceLaunch();
  run.check(!has(after, restoring), 'idle at the relaunch');
  run.check(!has(after, (e) => e.ev.startsWith('activity')), 'no card');
  run.check(same(pending(after), []), `pending ${pending(after)}`);
});

scenario('relaunch-heating', 'a relaunch while heating: the same deadlines and alarms', async (run) => {
  const start = startOf(await started(run));
  await run.step(start + 120);
  const was = planIn(run.lines());
  run.terminate();
  const r = await relaunched(run, start + 120);
  run.check(restoredIn(r.restore, 'HEATING'), say(r.restore));
  run.check(
    near(r.plan.pull, was.pull, REPLAN) && near(r.plan.cooled, was.cooled, REPLAN),
    `deadlines ${r.plan.pull}, ${r.plan.cooled} for ${was.pull}, ${was.cooled}`,
  );
  const plan = planIn(r.lines);
  run.check(near(scheduled(r.lines)['cook.pull'], plan.pull, EXACT), 'the pull scheduled again, at the plan’s time');
  run.check(same(sorted(pending(r.lines)), ['cook.cool', 'cook.pull']), `pending ${pending(r.lines)}`);
  run.check(has(r.lines, is('activity', (e) => e.what === 'start' && e.stage === 'heating')), 'the card again');
});

scenario('relaunch-cooking', 'a relaunch while cooking: the same deadlines and alarms', async (run) => {
  await started(run, ['-uiDo', 'boil@300']);
  const was = await boiled(run);
  const boil = storedIn(run.lines()).cook.events.boilAt_s;
  run.check(boil === run.t0 + 300, `boiled at +${num(boil) - run.t0} s`);
  await run.step(run.t0 + 360);
  run.terminate();
  const r = await relaunched(run, run.t0 + 360);
  run.check(restoredIn(r.restore, 'COOKING'), say(r.restore));
  run.check(
    near(r.plan.pull, was.pull, REPLAN) && near(r.plan.cooled, was.cooled, REPLAN),
    `deadlines ${r.plan.pull}, ${r.plan.cooled} for ${was.pull}, ${was.cooled}`,
  );
  run.check(lastStored(r.lines)?.cook.events.boilAt_s === boil, 'the boil kept to the bit');
  run.check(same(sorted(pending(r.lines)), ['cook.cool', 'cook.pull']), `pending ${pending(r.lines)}`);
});

scenario('relaunch-pull', 'into the pull, killed 4 s in, relaunched 14 s in: out after', async (run) => {
  await started(run, ['-uiDo', 'boil@300']);
  const was = await boiled(run);
  run.terminate();
  // Again half a minute before the pull, and on into it.
  const r = await relaunched(run, was.pull - 30);
  run.check(restoredIn(r.restore, 'COOKING'), say(r.restore));
  let i = await run.step(was.pull + 1);
  await run.until(phaseIs('PULL'), { from: i, what: 'phase PULL' });
  await run.step(was.pull + 4);
  run.check(!has(run.sinceLaunch(), is('ring')), 'no ring in the pull: the notification holds it');
  run.terminate();
  const again = await relaunched(run, was.pull + 14, ['-uiDo', 'out@pull+15']);
  run.check(restoredIn(again.restore, 'PULL'), say(again.restore));
  const plan = planIn(again.lines);
  run.check(near(plan.pull, was.pull, REPLAN), `the pull ${plan.pull} for ${was.pull}`);
  i = await run.step(plan.pull + 15);
  const tap = await run.until(tapped('out'), { from: i, what: 'the tap out' });
  await run.until(phaseIs('COOLING'), { from: tap.i, what: 'phase COOLING' });
  const after = run.sinceLaunch();
  const out = storedIn(after).cook.events.pulled;
  run.check(out?.by === 'cook', `pulled by ${out?.by}`);
  const into = num(out?.out_s) - num(out?.due_s);
  run.check(near(into, 15, EXACT), `out ${into} s into the pull`);
  run.check(!has(after, is('ring', (e) => e.deadline === 'pull')), 'the pull not rung again');
  run.note(`relaunched ${(was.pull + 14 - plan.pull).toFixed(3)} s into the pull`);
});

scenario('relaunch-cooling', 'a relaunch while cooling: the same end, one alarm left', async (run) => {
  await started(run, ['-uiDo', TO_DONE]);
  await boiled(run);
  const was = await toCooling(run, 3);
  const at = storedIn(run.lines()).cook.events.pulled!.out_s + 60;
  await run.step(at);
  run.terminate();
  const r = await relaunched(run, at);
  run.check(restoredIn(r.restore, 'COOLING'), say(r.restore));
  run.check(near(r.plan.cooled, was.cooled, REPLAN), `the cooling's end ${r.plan.cooled} for ${was.cooled}`);
  run.check(same(pending(r.lines), ['cook.cool']), `pending ${pending(r.lines)}`);
  run.check(has(r.lines, is('activity', (e) => e.what === 'start' && e.stage === 'cooling')), 'the card again');
});

scenario('relaunch-done', 'a relaunch at Done: Done again, nothing pending, no card', async (run) => {
  await started(run, ['-uiDo', TO_DONE]);
  const was = await toDone(run);
  await run.step(cooledAt(was) + 30);
  run.terminate();
  const r = await relaunched(run, cooledAt(was) + 30);
  run.check(restoredIn(r.restore, 'DONE'), say(r.restore));
  run.check(near(r.plan.cooled, was.cooled, REPLAN), `the cooling's end ${r.plan.cooled} for ${was.cooled}`);
  run.check(same(pending(r.lines), []), `pending ${pending(r.lines)}`);
  run.check(!has(r.lines, is('activity', (e) => e.what === 'start')), 'no card started');
  // A minute on at Done, and four ticks there, each caught up with: nothing
  // rings.
  await run.step(cooledAt(was) + 90);
  for (let k = 1; k < 4; k += 1) await run.tick();
  run.check(!has(run.sinceLaunch(), is('ring')), 'nothing rung again');
});

scenario('asleep', 'killed before the pull, its notification delivered; relaunched past it', async (run) => {
  await started(run, ['-uiDo', 'boil@300']);
  const was = await boiled(run);
  run.terminate();
  // The one span on the system's clock, and the one wait for the system:
  // launched 20 s of cook before the pull at ×1, so the restore schedules
  // the pull at most 20 s ahead; killed; the notification left to the
  // system, with DELIVERY_SLACK_S for it to arrive.
  const lead = 20;
  const r = await relaunched(run, was.pull - lead, [], { speed: 1 });
  const seen = Date.now();
  run.check(restoredIn(r.restore, 'COOKING'), say(r.restore));
  run.check('cook.pull' in scheduled(r.lines), 'the pull scheduled');
  run.terminate();
  await sleep(Math.max(0, seen + (lead + DELIVERY_SLACK_S) * 1000 - Date.now()));
  const after = await relaunched(run, was.pull + 60);
  const restore = after.restore;
  run.check(restore.ev === 'restore' && restore.phase === 'COOLING' && restore.eventsWritten, say(restore));
  const cook = lastStored(after.lines)?.cook;
  const plan = planIn(after.lines);
  run.check(cook?.events.pulled?.by === 'timeout', `pulled by ${cook?.events.pulled?.by}`);
  run.check(near(cook?.events.pulled?.out_s, plan.pull + 20, EXACT), "out at the grace's end");
  run.check(same(delivered(after.lines), ['cook.pull']), `delivered ${delivered(after.lines)}`);
  run.check(same(pending(after.lines), ['cook.cool']), `pending ${pending(after.lines)}`);
  const i = await run.step(cooledAt(plan) + 1);
  const done = await run.until(phaseIs('DONE'), { from: i, what: 'phase DONE' });
  await run.settled(done.i);
  run.check(!has(run.sinceLaunch(), is('ring')), 'nothing rung by the app: the notifications rang');
});

scenario('too-old', 'relaunched three hours on: ended, its alarms and card gone (2.2)', async (run) => {
  await started(run);
  run.terminate();
  run.launch([], { at: run.t0 + 3 * 3600 });
  const restore = await run.until(restoring, { from: run.launched, what: 'the restore' });
  // The launch's own read-back, three seconds on (AppModel.appear).
  await run.until(is('delivered'), { from: restore.i, what: 'the launch’s read-back' });
  const lines = run.sinceLaunch();
  run.check(has(lines, is('restoreTooOld')), 'dropped as too old');
  run.check(has(lines, is('alarmsCancelled')), 'its alarms cancelled');
  run.check(same(pending(lines), []), `pending ${pending(lines)}`);
  run.check(!has(lines, is('activitySeen', (e) => e.when === 'launch+3s')), 'its card ended');
  run.check(!has(lines, is('phase')), 'idle');
  const prefs = await run.prefs((p) => !('cookInProgress.v3' in p));
  run.check(!('cookInProgress.v3' in prefs), 'nothing stored');
});

scenario('final-egg', 'Done, relaunched near the hour: ended at it, a later answer not taken (2.3)', async (run) => {
  await started(run, ['-uiDo', TO_DONE]);
  const was = await toDone(run);
  run.terminate();
  // A minute short of the egg's hour; the answer a second past it.
  const r = await relaunched(run, cooledAt(was) + 3540, ['-uiDo', 'answer:runny@cooled+3601']);
  run.check(restoredIn(r.restore, 'DONE'), say(r.restore));
  run.check(!has(r.lines, is('cookEnded')), 'still open a minute short of the hour');
  const plan = planIn(r.lines);
  const i = await run.step(cooledAt(plan) + 3601);
  await run.until(is('cookEnded'), { from: i, what: 'the end at the hour' });
  const tap = await run.until(tapped('answer'), { from: i, what: 'the answer after the hour' });
  await run.until(logOf(1), { from: run.launched, what: 'the egg logged' });
  const lines = run.sinceLaunch();
  const egg = eggLog(run.lines());
  run.check(egg?.count === 1, `one egg logged, not ${egg?.count}`);
  run.check(egg?.last?.yolkWord === null, `logged unanswered: ${egg?.last?.yolkWord}`);
  run.check(forecastOk(egg?.last), 'with its forecast');
  // An answer taken is stored with the cook at once (`recordFeedbackGiven`).
  const afterTap = run.lines().slice(tap.i);
  run.check(!has(afterTap, storedAs((s) => s.feedbackGiven === true)), 'the Runny not stored');
  run.check(!lines.some(is('log', (e) => e.last?.yolkWord === 'runny')), 'the Runny not logged');
});

scenario('done-as-ran', 'answered at Done, relaunched: Done shows the cook as it ran (2.4)', async (run) => {
  await started(run, ['-uiDo', `${TO_DONE},answer:runny@cooled+5`]);
  const done = await toDone(run);
  const i = await run.step(cooledAt(done) + 5);
  await run.until(logOf(1, 1), { from: i, what: 'the answer folded' });
  const was = num(shown(run.lines()).at(-1));
  run.terminate();
  const r = await relaunched(run, cooledAt(done) + 60);
  run.check(restoredIn(r.restore, 'DONE'), say(r.restore));
  run.check(has(r.lines, is('plan', (e) => e.surface)), 'a plan on the surface');
  const peaks = shown(r.lines);
  run.check(peaks.length > 0 && peaks.every((p) => Math.abs(p - was) < 0.01), `shown ${peaks} for ${was}`);
  const planned = r.lines.filter(is('shown')).map((l) => l.plannedPeak);
  run.note(`shown ${was.toFixed(2)} °C; planned again on the folded posterior ${planned.at(-1)?.toFixed(2)} °C`);
});

scenario('slow-hob', 'never boiled: the guess lengthens, the time heated counts up, ended at two hours', async (run) => {
  const start = startOf(await started(run));
  // A millisecond past each moment the plan says it lengthens next, as a
  // clock running through them would be: core lengthens once the time
  // heated is past it, and so the tick plans again only past the moment.
  // On the moment itself, frozen there, nothing is planned again: eight
  // ticks, each caught up with (it once planned the same plan at every
  // one). First where the guess gives out.
  const first = num(planIn(run.lines()).next);
  // All the start set going done with first, its pot's surface among it.
  await run.tick();
  let i = await run.step(first);
  for (let k = 1; k < 8; k += 1) await run.tick();
  const onIt = run.lines().slice(i).filter(is('plan')).length;
  run.check(onIt === 0, `${onIt} plans with the clock frozen on the moment the guess gives out`);
  i = await run.step(first + 0.001);
  const lengthened = await run.until(is('plan', (e) => e.lengthened), { from: i, what: 'a lengthened plan' });
  await run.settled(lengthened.i);
  // Then from 1,000 s through 1,100 s.
  i = await run.step(start + 1000);
  await run.settled((await run.until(is('plan'), { from: i, what: 'a plan at 1,000 s' })).i);
  for (let plan = planIn(run.lines()); plan.next !== null && plan.next <= start + 1100;) {
    i = await run.step(plan.next + 0.001);
    await run.settled((await run.until(is('plan'), { from: i, what: 'the next plan' })).i);
    const next = planIn(run.lines());
    if (next.next !== null && next.next <= plan.next) throw new Error(`the slow hob stuck at ${plan.next - start}`);
    plan = next;
  }
  const lines = run.lines();
  const card = lines.slice(lengthened.i).find(is('activity', (e) => e.what === 'update' && e.stage === 'heating'));
  run.check(card?.up === true, `the card counts up: ${say(card)}`);
  const ends = card?.ends;
  run.check(near(ends, start + 7200, 1), `the card counts to two hours: ${num(ends) - start}`);
  // The second each was planned in, as the log once said it.
  const creeping = lines.filter((l) => l.ev === 'plan' && Math.floor(l.t) >= start + 1000 && Math.floor(l.t) <= start + 1100);
  run.check(creeping.length >= 5 && creeping.length <= 15, `${creeping.length} plans in 100 s, creeping`);
  run.note(`lengthened from ${Math.round(first - start)} s; ${creeping.length} plans in 100 s`);
  run.terminate();
  const r = await relaunched(run, start + 7150);
  run.check(restoredIn(r.restore, 'HEATING'), say(r.restore));
  run.check(!has(r.lines, is('cookEnded')), 'still heating 50 s short of two hours');
  i = await run.step(start + 7201);
  const ended = await run.until(is('cookEnded'), { from: i, what: 'the end at two hours' });
  await run.until(is('alarmsCancelled'), { from: ended.i, what: 'its alarms cancelled' });
  await run.until(storedNone, { from: ended.i, what: 'the cook cleared' });
  run.check(lastStored(run.sinceLaunch()) === null, 'nothing stored');
});

scenario('reschedule', 'relaunched while heating past the guess: the pending pull moves (1.4)', async (run) => {
  const start = startOf(await started(run));
  const was = scheduled(run.lines())['cook.pull'];
  run.terminate();
  const r = await relaunched(run, start + 652);
  run.check(restoredIn(r.restore, 'HEATING'), say(r.restore));
  run.check(
    r.plan.lengthened && r.plan.pull > was + 30,
    `the restored pull at ${r.plan.pull - start} s for ${was - start}`,
  );
  const plan = planIn(r.lines);
  run.check(near(scheduled(r.lines)['cook.pull'], plan.pull, EXACT), "the pending pull is the restored plan's");
  run.check(same(sorted(pending(r.lines)), ['cook.cool', 'cook.pull']), `pending ${pending(r.lines)}`);
});

scenario('unreadable', 'a cook and a results log this build cannot read: dropped, the alarms and the card gone, nothing kept aside', async (run) => {
  await started(run);
  run.terminate();
  const stored = await run.prefs((p) => Boolean(p['cookInProgress.v3']?.cook && p['calibration.v5']));
  run.check(stored['cookInProgress.v3'] && stored['calibration.v5'], 'the cook and the log in the plist');
  run.setData({ 'cookInProgress.v3': '{"cook":{"id_ms":1}}', 'calibration.v5': '{damaged' });
  run.launch();
  await run.until(is('restoreUnreadable'), { from: run.launched, what: 'the cook dropped' });
  await run.until(is('alarmsCancelled'), { from: run.launched, what: 'its alarms cancelled' });
  const prefs = await run.prefs((p) => !('cookInProgress.v3' in p) && p['calibration.v5']?.v === 5);
  run.check(!('cookInProgress.v3' in prefs), 'the cook gone');
  run.check(prefs['calibration.v5']?.v === 5 && prefs['calibration.v5']?.log?.length === 0, 'the log written again, empty');
  const aside = Object.keys(prefs).filter((k) => k.endsWith('.unread'));
  run.check(aside.length === 0, `nothing kept aside: ${aside.join(', ')}`);
  run.note('dropped, and nothing kept aside');
});

scenario('sweep', "the keys no build reads, 0.3's log and an earlier build's cook among them, are deleted at launch; its alarms left; under a newer mark, not one", async (run) => {
  await started(run);
  run.terminate();
  await run.prefs((p) => Boolean(p['cookInProgress.v3']?.cook));
  // What 0.3 and 0.4 wrote: this build's cook stands in for theirs, under
  // their key, with the same alarm ids pending (a day out, on a frozen
  // clock: still pending however long the plist takes).
  run.renameKey('cookInProgress.v3', 'cookInProgress');
  const old = {
    'calibration.v4': '{"v":4,"log":[]}', 'calibration.v4.unread': '[]', 'cookInProgress.v2': '{}',
    'cookInProgress.unread': '[]', 'share.v1': '{}', 'probeAsked': '1', 'coldStart': '1',
  };
  run.setData(old);
  const keys = [...Object.keys(old), 'cookInProgress'];
  run.launch();
  const swept = await run.until(is('swept', (e) => e.key === 'cookInProgress'), { from: run.launched, what: 'the old cook swept' });
  await run.until(is('delivered'), { from: swept.i, what: 'the alarms read back' });
  const lines = run.sinceLaunch();
  run.check(keys.every((k) => has(lines, is('swept', (e) => e.key === k))), 'each swept');
  run.check(!has(lines, is('alarmsCancelled')), 'its alarms not cancelled');
  run.check(same(sorted(pending(lines)), ['cook.cool', 'cook.pull']), `pending ${pending(lines)}`);
  run.check(!has(lines, is('restore', (e) => ['HEATING', 'COOKING', 'PULL', 'COOLING', 'DONE'].includes(e.phase))), 'idle');
  const prefs = await run.prefs((p) => keys.every((k) => !(k in p)));
  run.check(keys.every((k) => !(k in prefs)), `gone: ${keys.filter((k) => k in prefs).join(', ')}`);
  run.check(prefs['calibration.v5']?.v === 5, 'this build\'s log kept');
  run.terminate();
  // A newer build's mark: nothing deleted.
  run.setData(old);
  run.launch(['-newestVersion', '9.0.0']);
  await run.until(is('newerNote'), { from: run.launched, what: 'the line shown' });
  run.check(!has(run.sinceLaunch(), is('swept')), 'nothing swept under a newer mark');
  const kept = await run.prefs((p) => Object.keys(old).every((k) => k in p));
  run.check(Object.keys(old).every((k) => k in kept), 'each kept');
  run.note(`${keys.length} swept, the old cook's alarms left; under 9.0.0, none`);
});

scenario('again-logs', 'Start again logs the unanswered egg before it clears the cook', async (run) => {
  await started(run, ['-uiDo', `${TO_DONE},again@cooled+5`]);
  const done = await toDone(run);
  const i = await run.step(cooledAt(done) + 5);
  await run.until(storedNone, { from: i, what: 'Start again' });
  run.terminate();
  const lines = run.lines();
  const logged = index(lines, logOf(1));
  run.check(logged >= 0 && logged < index(lines, storedNone), 'logged before the cook was cleared');
  const egg = eggLog(lines);
  run.check(egg?.last?.yolkWord === null && forecastOk(egg?.last), 'unanswered, with its forecast');
  const prefs = await run.prefs((p) => p['calibration.v5']?.log?.length === 1 && !('cookInProgress.v3' in p));
  run.check(prefs['calibration.v5']?.log?.length === 1, 'the plist holds the egg');
  run.check(!('cookInProgress.v3' in prefs), 'and no cook');
});

// ------------------------------------- the one screen's review, on iOS

/// A hot cook out 2 s into the pull, on to Done, and the answer `-uiDo`
/// gives at the cooling's end + 5 s folded: the plan at Done and the egg
/// logged then.
async function answeredAtDone(run: Run, uiDo: string): Promise<{ cooling: Plan; first: EggRecord }> {
  await hotStarted(run, ['out@pull+2,answer:jammy@cooled+5', uiDo].filter(Boolean).join(','));
  const cooling = await toCooling(run, 2);
  let i = await run.step(cooledAt(cooling) + 1);
  await run.until(phaseIs('DONE'), { from: i, what: 'Done' });
  i = await run.step(cooledAt(cooling) + 5);
  await run.until(logOf(1, 1), { from: i, what: 'Jammy folded' });
  return { cooling, first: lastEgg(run.lines()) };
}

scenario('start-again-corrected', 'onescreen review 1.2: Jammy at Done, the egg corrected and Start again pressed while it settles: the corrected egg logged, then the cook forgotten', async (run) => {
  const { cooling, first } = await answeredAtDone(run, 'set:size=3@cooled+10,again@cooled+12');
  // On to Start again while the change is in hand, not once it has settled.
  const t = await tapAt(run, cooledAt(cooling) + 10, 'set', { idle: false });
  const again = await tapAt(run, cooledAt(cooling) + 12, 'again');
  const gone = await run.until(storedNone, { from: again.i, what: 'the cook forgotten' });
  const lines = run.lines();
  const committed = index(lines.slice(t.i), is('editCommitted')) + t.i;
  run.check(committed > again.i, 'committed by Start again, not by its settle (the host too slow to tell)');
  const egg = lastEgg(lines.slice(0, gone.i));
  run.check(egg.egg.mass_g !== first.egg.mass_g, `the egg logged corrected: ${first.egg.mass_g} -> ${egg.egg.mass_g} g`);
  run.check(egg.yolkWord === 'jammy', `the answer kept: ${egg.yolkWord}`);
  const prefs = await run.prefs((p) => !('cookInProgress.v3' in p) && p['calibration.v5']?.log?.[0]?.egg?.mass_g === egg.egg.mass_g);
  const kept = prefs['calibration.v5']?.log;
  run.check(kept?.length === 1 && kept[0].egg.mass_g === egg.egg.mass_g, `the plist's egg: ${kept?.[0]?.egg?.mass_g} g`);
  run.note(`the egg logged ${first.egg.mass_g} -> ${egg.egg.mass_g} g, Jammy kept, then forgotten`);
});

scenario('too-old-corrected', 'onescreen review 1.2: an answered egg corrected at Done, killed before its record was made again, relaunched too old: the corrected egg logged', async (run) => {
  // `-uiHoldAsRan YES`: the record is never made again in this launch, as if
  // the app were killed before it landed.
  const { cooling, first } = await answeredAtDone(run, '');
  run.terminate();
  await relaunched(run, cooledAt(cooling) + 9, ['-uiHoldAsRan', 'YES', '-uiDo', 'set:size=3@cooled+10']);
  const t = await tapAt(run, cooledAt(cooling) + 10, 'set');
  const c = await corrected(run, t.i);
  run.check(!has(run.lines().slice(t.i), is('asRanCorrected')), 'the record not made again before the kill');
  run.check(c.cook?.correctedAt_s !== null && lastEgg(run.lines()).egg.mass_g === first.egg.mass_g, 'stored corrected, logged as it was');
  run.terminate();
  run.launch([], { at: cooledAt(cooling) + 3700 });
  const old = await run.until(is('restoreTooOld'), { from: run.launched, what: 'too old' });
  const gone = await run.until(storedNone, { from: old.i, what: 'the cook forgotten' });
  const egg = lastEgg(run.lines().slice(0, gone.i));
  run.check(egg.egg.mass_g !== first.egg.mass_g, `the egg logged corrected: ${first.egg.mass_g} -> ${egg.egg.mass_g} g`);
  run.check(egg.yolkWord === 'jammy', `the answer kept: ${egg.yolkWord}`);
  const prefs = await run.prefs((p) => !('cookInProgress.v3' in p) && p['calibration.v5']?.log?.[0]?.egg?.mass_g === egg.egg.mass_g);
  run.check(prefs['calibration.v5']?.log?.[0]?.egg.mass_g === egg.egg.mass_g, 'the plist holds the corrected egg');
  run.note(`too old: the egg logged ${first.egg.mass_g} -> ${egg.egg.mass_g} g, then forgotten`);
});

scenario('again-not-remade', 'red team 0.3: Jammy at Done, corrected, Start again, the record not made again: the cook left stored, and the next launch makes it', async (run) => {
  // `-uiHoldAsRan YES`: the correction is not made again while the cook runs,
  // so Start again must; `-uiFailRemake YES`: it cannot be, in this launch.
  await started(run, [...HOT, '-uiHoldAsRan', 'YES', '-uiFailRemake', 'YES', '-uiDo',
    'out@pull+2,answer:jammy@cooled+5,set:size=3@cooled+10,again@cooled+20']);
  const cooling = await toCooling(run, 2);
  let i = await run.step(cooledAt(cooling) + 1);
  await run.until(phaseIs('DONE'), { from: i, what: 'Done' });
  i = await run.step(cooledAt(cooling) + 5);
  await run.until(logOf(1, 1), { from: i, what: 'Jammy folded' });
  const first = lastEgg(run.lines());
  const t = await tapAt(run, cooledAt(cooling) + 10, 'set');
  await corrected(run, t.i);
  const again = await tapAt(run, cooledAt(cooling) + 20, 'again');
  const end = await run.until((e) => storedNone(e) || e.ev === 'asRanNotRemade', { from: again.i, what: 'the remake given up' });
  run.check(end.ev === 'asRanNotRemade', `the cook kept stored, not forgotten: ${say(end)}`);
  // Caught up with: the cook not cleared from the store since, and in the
  // file, which the system writes when it will, once the app has gone.
  await run.tick();
  run.check(!has(run.lines().slice(again.i), storedNone), 'the cook cleared after Start again');
  run.check(lastEgg(run.lines()).egg.mass_g === first.egg.mass_g, 'the egg as logged, not yet corrected');
  run.terminate();
  const prefs = await run.prefs((p) => 'cookInProgress.v3' in p);
  run.check('cookInProgress.v3' in prefs, 'the plist still holds the cook');
  // The next launch, too old to pick up: the record made again, then forgotten.
  run.launch([], { at: cooledAt(cooling) + 3700 });
  const old = await run.until(is('restoreTooOld'), { from: run.launched, what: 'the stored cook, too old' });
  await run.until(is('asRanRemade'), { from: old.i, what: 'the record made again' });
  const gone = await run.until(storedNone, { from: old.i, what: 'the cook forgotten' });
  const egg = lastEgg(run.lines().slice(0, gone.i));
  run.check(egg.egg.mass_g !== first.egg.mass_g, `the egg logged corrected: ${first.egg.mass_g} -> ${egg.egg.mass_g} g`);
  run.check(egg.yolkWord === 'jammy', `the answer kept: ${egg.yolkWord}`);
  run.note(`left stored at Start again; the next launch logged ${first.egg.mass_g} -> ${egg.egg.mass_g} g, Jammy kept`);
});

scenario('again-held', 'red team 0.4: Done, corrected, Jammy held for the record, Start again: the egg logged with Jammy, not unanswered', async (run) => {
  // `-uiHoldAsRan YES`: the corrected record is never planned as it ran in
  // this launch, so the answer is held until Start again.
  await started(run, [...HOT, '-uiHoldAsRan', 'YES', '-uiDo',
    'out@pull+2,set:size=3@cooled+10,answer:jammy@cooled+15,again@cooled+20']);
  const cooling = await toCooling(run, 2);
  const i = await run.step(cooledAt(cooling) + 1);
  await run.until(phaseIs('DONE'), { from: i, what: 'Done' });
  const t = await tapAt(run, cooledAt(cooling) + 10, 'set');
  await corrected(run, t.i);
  const a = await tapAt(run, cooledAt(cooling) + 15, 'answer');
  await run.until(is('answerHeld'), { from: a.i, what: 'the answer held' });
  const again = await tapAt(run, cooledAt(cooling) + 20, 'again');
  const logged = await run.until(logOf(1), { from: again.i, what: 'the egg logged' });
  const egg = lastEgg(run.lines().slice(0, logged.i + 1));
  run.check(egg.yolkWord === 'jammy', `the held answer logged: ${egg.yolkWord}`);
  run.check(forecastOk(egg), 'with its forecast');
  const folded = await run.until(logOf(1, 1), { from: logged.i, what: 'the egg folded' });
  run.check(folded, 'and learned from');
  run.note(`Start again logged the held answer: ${egg.yolkWord}, folded`);
});


scenario('done-stays-done', 'onescreen review 2.1: on the counter, Done at the out, Jammy, then the cooling corrected to ice: still Done, nothing rung, no alarm or card brought back', async (run) => {
  await started(run, [...HOT, '-cooling', 'counter', '-uiDo', 'out@pull+2,answer:jammy@pull+60,set:cooling=ice@pull+70']);
  const plan0 = planIn(run.lines());
  let i = await run.step(plan0.pull + 1);
  await run.until(phaseIs('PULL'), { from: i, what: 'phase PULL' });
  i = await run.step(plan0.pull + 2);
  const done = await run.until(phaseIs('DONE'), { from: i, what: 'Done at the out' });
  await run.settled(done.i);
  i = await run.step(plan0.pull + 60);
  await run.until(logOf(1, 1), { from: i, what: 'Jammy folded' });
  const t = await tapAt(run, plan0.pull + 70, 'set');
  const after = await corrected(run, t.i);
  run.check(after.cook?.choices.cooling === 'ice', `the cook says ${after.cook?.choices.cooling}`);
  run.check(after.cook?.events.cooledAt_s !== null, `the cooling ended at the latest at the correction: ${after.cook?.events.cooledAt_s}`);
  // On past where an ice bath from the out would have ended, once the app
  // has caught up with it.
  await run.step(plan0.pull + 400);
  const lines = run.lines().slice(t.i);
  run.check(!has(lines, phaseIs('COOLING')), 'never back to Cooling');
  run.check(!has(lines, is('ring')), 'nothing rung');
  run.check(!('cook.cool' in scheduled(lines)), `no cooling alarm: ${JSON.stringify(scheduled(lines))}`);
  run.check(!has(lines, is('activity')), 'no card brought back');
  const egg = lastEgg(run.lines());
  run.check(egg.yolkWord === 'jammy' && egg.cooled_s !== undefined && egg.cooled_s <= 68 + 1e-6,
    `the record: ${egg.yolkWord}, an ice bath of ${egg.cooled_s} s`);
  run.note(`Done kept; the record's ice bath ${egg.cooled_s?.toFixed?.(0)} s`);
});

scenario('answered-pull-stands', 'onescreen review 2.1: a pull the clock assumed, Jammy at Done, then cold water: the pull confirmed, nothing asked, still Done', async (run) => {
  await started(run, [...HOT, '-uiDo', 'answer:jammy@cooled+5,set:start=cold@cooled+10']);
  const plan0 = planIn(run.lines());
  let i = await run.step(plan0.pull + 21);
  await run.until(phaseIs('COOLING'), { from: i, what: 'the grace run out' });
  await run.settled(i);
  const cooling = planIn(run.lines());
  i = await run.step(cooledAt(cooling) + 1);
  await run.until(phaseIs('DONE'), { from: i, what: 'Done' });
  i = await run.step(cooledAt(cooling) + 5);
  await run.until(logOf(1, 1), { from: i, what: 'Jammy folded' });
  const t = await tapAt(run, cooledAt(cooling) + 10, 'set');
  const after = await corrected(run, t.i);
  run.check(!after.plan.asking, 'not asked whether the eggs are still in the water');
  const pulled = after.cook?.events.pulled;
  run.check(pulled?.by === 'timeout' && pulled.confirmed, `the pull stands, confirmed: ${JSON.stringify(pulled)}`);
  run.check(!has(run.lines().slice(t.i), phaseIs('HEATING', 'COOKING', 'PULL', 'COOLING')), 'still Done');
  run.note('a correction after an answer confirms the pull the clock assumed');
});


scenario('grace-correction', 'onescreen review 3: a lighter egg 15 s into the pull keeps the pull that rang and its grace; nothing rings again', async (run) => {
  const plan0 = await hotStarted(run, 'set:size=1@pull+15');
  let i = await run.step(plan0.pull + 1);
  await run.until(phaseIs('PULL'), { from: i, what: 'phase PULL' });
  await run.settled(i);
  const rings = run.lines().filter(is('ring')).length;
  const t = await tapAt(run, plan0.pull + 15, 'set');
  const after = await corrected(run, t.i);
  run.check(near(after.plan.pull, plan0.pull, EXACT), `the pull that rang: ${(after.plan.pull - plan0.pull).toFixed(3)} s`);
  // A tick since, caught up with: what would ring has.
  await run.tick();
  run.check(!has(run.lines().slice(t.i), is('ring')), `rung again (${rings} before)`);
  i = await run.step(plan0.pull + 21);
  await run.until(phaseIs('COOLING'), { from: i, what: 'Cooling at the grace’s end' });
  const pulled = lastStored(run.lines())?.cook.events.pulled;
  run.check(near(pulled?.due_s, plan0.pull, EXACT) && near(pulled?.out_s, plan0.pull + 20, EXACT),
    `due at the pull that rang, out at its grace's end: ${JSON.stringify(pulled)}`);
  run.note('Pull kept, nothing rung again, Cooling at the grace’s first end');
});


scenario('done-note-as-ran', 'onescreen review 2.2: Runny at Done, relaunched: the texture note reads the cook as it ran', async (run) => {
  await started(run, [...HOT, '-uiDo', 'out@pull+2,answer:runny@cooled+5']);
  const cooling = await toCooling(run, 2);
  let i = await run.step(cooledAt(cooling) + 1);
  await run.until(phaseIs('DONE'), { from: i, what: 'Done' });
  i = await run.step(cooledAt(cooling) + 5);
  await run.until(logOf(1, 1), { from: i, what: 'Runny folded' });
  const notes = (lines: Event[]): string[] => lines.filter(is('note')).map((l) => l.text);
  const was = notes(await screen(run)).at(-1);
  run.terminate();
  const r = await relaunched(run, cooledAt(cooling) + 60);
  run.check(restoredIn(r.restore, 'DONE'), say(r.restore));
  // Not the blank before the first plan.
  const now = notes((await screen(run)).slice(run.launched)).filter((n) => n !== '');
  run.check(now.length > 0 && now.every((n) => n === was), `the note ${JSON.stringify(now)} for "${was}"`);
  run.note(`"${was}" kept across the relaunch`);
});


/// The certainty line as last logged: its word and the time range it opens.
const certaintyNow = (lines: Event[]): { word: string; time: string } | null => {
  const l = lastOf(lines, 'certainty');
  return l?.word !== undefined ? { word: l.word, time: l.time ?? '' } : null;
};

scenario('certainty-mid-cook', 'onescreen review 2.3: once cooking, the range opened is when to take the eggs out, as times of day; under a lengthening slow hob it moves with the guess', async (run) => {
  const before = EN['certainty.timeOut'].text.split('{low}')[0];
  const idle = EN['certainty.time'].text.split('{low}')[0];
  await hotStarted(run, 'set:start=cold@300');
  let i = await run.step(run.t0 + 299);
  const hot = certaintyNow(await screen(run));
  run.check(hot?.time.startsWith(before), `five minutes in: "${hot?.time}"`);
  const t = await tapAt(run, run.t0 + 300, 'set');
  await corrected(run, t.i);
  i = await run.step(run.t0 + 16 * 60);
  let plan = await run.until(is('plan', (e) => e.lengthened), { from: i, what: 'the slow hob lengthened' });
  await run.settled(plan.i);
  const a = certaintyNow(await screen(run));
  // Four minutes on: the times are said to the minute.
  i = await run.step(run.t0 + 20 * 60);
  plan = await run.until(is('plan'), { from: i, what: 'planned again' });
  await run.settled(plan.i);
  const b = certaintyNow(await screen(run));
  run.check(a?.time.startsWith(before) && b?.time.startsWith(before), `heated: "${a?.time}", "${b?.time}"`);
  run.check(a && b && a.time !== b.time, 'the range moves with the guess');
  run.check(!a?.time.startsWith(idle) || before === idle, 'not whole times');
  run.note(`"${hot?.time}"; 16:00 "${a?.time}"; 20:00 "${b?.time}"`);
});

/// The readout's frames logged in these lines: { at (the moment drawn for,
/// epoch s, to the millisecond), phase, big, sub, range, i }.
/// A frame of the readout as the checks read it, and its line's index.
interface Frame { at: number; phase: string; big: string; sub: string; range: string | null; i: number }

function frames(lines: Event[], from = 0): Frame[] {
  const out: Frame[] = [];
  for (let i = from; i < lines.length; i += 1) {
    const l = lines[i]!;
    if (l.ev === 'frame') out.push({ at: l.at, phase: l.phase, big: l.big, sub: l.sub, range: l.range ?? null, i });
  }
  return out;
}

/// The app's clock face for a span, s (Presentation.swift `clockString`).
const clockOf = (s: number): string => {
  const total = Math.round(Math.max(0, s));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/// Whether a heating frame is all of its one moment: the countdown to the
/// plan in force when it was drawn and the time heated under it both read
/// at the moment it was drawn for. What it got wrong, or null.
function frameWrong(f: Frame, lines: Event[], start: number): string | null {
  const plan = planIn(lines.slice(0, f.i));
  const big = clockOf(plan.pull - f.at);
  const heated = clockOf(f.at - start);
  if (f.big !== big) return `at +${(f.at - start).toFixed(3)} the time ${f.big}, not ${big}`;
  if (!f.sub.startsWith(`${heated} `)) return `at +${(f.at - start).toFixed(3)} "${f.sub}", not ${heated} heated`;
  return null;
}

scenario('one-moment', 'REFACTOR-0.5 0.5: each frame of the readout reads one moment, the TimelineView\'s: stepped across a second, and run fast', async (run) => {
  const stored = await started(run);
  const start = startOf(stored);
  run.check(stored.cook.choices.startMode === 'cold', `a cold start: ${stored.cook.choices.startMode}`);
  // Frozen either side of where each line's second turns: the time heated at
  // 100.5 s, and the countdown where the pull is a half second off.
  const pull = planIn(run.lines()).pull;
  const turn = pull - Math.floor(pull - start - 200) - 0.5;
  for (const at of [start + 100.499, start + 100.501, turn - 0.001, turn + 0.001]) {
    const i = await run.step(at);
    const f = await run.until(is('frame', (e) => e.at.toFixed(3) === at.toFixed(3)), {
      from: i, what: `a frame at +${(at - start).toFixed(3)}`,
    });
    const lines = run.lines();
    const frame = frames(lines, f.i)[0]!;
    run.check(frame.phase === 'HEATING', say(f));
    const wrong = frameWrong(frame, lines, start);
    run.check(!wrong, wrong);
  }
  // Running at x60 from launch, so the screen redraws ten times a second, each
  // frame six seconds of cook time on: a frame that read the clock again
  // while it was drawn would be off by whatever the draw took, times sixty.
  run.terminate();
  const r = await relaunched(run, start + 120, [], { speed: 60 });
  const from = run.launched + r.lines.findIndex(restoring);
  const end = Date.now() + WAIT_S * 1000;
  while (frames(run.lines(), from).filter((f) => f.phase === 'HEATING').length < 20 && Date.now() < end) await sleep(100);
  const lines = run.lines();
  run.terminate();
  const ran = frames(lines, from).filter((f) => f.phase === 'HEATING' && !planIn(lines.slice(0, f.i)).lengthened);
  run.check(ran.length >= 20, `${ran.length} frames heating at x60`);
  const wrong = ran.map((f) => frameWrong(f, lines, start)).filter(Boolean);
  run.check(wrong.length === 0, `${wrong.length} of ${ran.length} frames not of one moment: ${wrong.slice(0, 3).join('; ')}`);
  const ranges = new Set(ran.map((f) => f.range ?? 'none'));
  run.note(`${ran.length} frames at x60, +${(num(ran[0]?.at) - start).toFixed(1)} to +${(num(ran.at(-1)?.at) - start).toFixed(1)} s; ranges ${[...ranges].join(' / ')}`);
});


scenario('change-kept-on-hide', 'onescreen review 3: a change in hand when the app leaves the screen is committed; two changes are two commits', async (run) => {
  await hotStarted(run, 'drag:0.3@30');
  let t = await tapAt(run, run.t0 + 30, 'drag');
  await run.until(is('edit', (e) => e.group === 'level'), { from: t.i, what: 'the change in hand' });
  // Another app over it, as the app switcher or a call would.
  simctl('launch', udid, 'com.apple.Preferences');
  const c = await run.until(is('editCommitted', (e) => e.fields.join(',') === 'level'), { from: t.i, what: 'committed on leaving', timeoutS: 15 });
  await run.until(storedAs((s) => s.cook.choices.level === 0.3), { from: c.i, what: 'the cook stored' });
  // The next cook's setting, written to the store as the app says; then in
  // its file, which the system writes when it will, so waited for in full.
  await run.until(is('wrote', (e) => e.key === 'doneness' && e.number === 0.3), { from: c.i, what: 'the setting written' });
  run.terminate();
  const prefs = await run.prefs((p) => p.doneness === 0.3);
  run.check(prefs.doneness === 0.3, `the setting in the file: ${prefs.doneness}`);
  const r = await relaunched(run, run.t0 + 40, ['-uiDo', 'set:size=3@50,set:water=1@50']);
  run.check(lastStored(r.lines)?.cook.choices.level === 0.3, 'relaunched with the change');
  t = await tapAt(run, run.t0 + 50, 'set');
  const first = await run.until(is('editCommitted'), { from: t.i, what: 'the first change committed' });
  const second = await run.until(is('editCommitted'), { from: first.i + 1, what: 'the second change committed' });
  run.check(first.fields.join(',') === 'mass' && second.fields.join(',') === 'water',
    `two commits: ${say(first)}, ${say(second)}`);
  run.note('the slider held as the app left: committed, stored and written; size then water: two commits');
});

scenario('newer-version', "DECISIONS 100: a newer build's mark: the line, an egg timed to Done, answered and started again, and nothing stored; without it, the mark", async (run) => {
  // A newer build's mark, as a launch argument, on a fresh install:
  // UserDefaults reads it first, and an edit of the plist can be undone by
  // the system's cached copy. Nothing at all may then be stored.
  await started(run, ['-newestVersion', '9.0.0', '-uiDo', `${TO_DONE},answer:jammy@cooled+20,again@cooled+40`]);
  run.check(has(run.sinceLaunch(), is('stores', (e) => e.verdict === 'readOnly' && e.mark === '9.0.0')), 'read-only at launch');
  await run.until(is('newerNote'), { from: run.launched, what: 'the line shown' });
  const done = await toDone(run);
  let i = await run.step(cooledAt(done) + 20);
  await run.until(tapped('answer'), { from: i, what: 'the answer' });
  i = await run.step(cooledAt(done) + 40);
  await run.until(storedNone, { from: i, what: 'Start again' });
  run.terminate();
  const lines = run.sinceLaunch();
  run.check(same(phases(lines), ['HEATING', 'COOKING', 'PULL', 'COOLING', 'DONE']), `the timer ran: ${phases(lines)}`);
  // The log line says what a save would hold: never an egg; and nothing
  // went through the store.
  run.check(!has(lines, is('log', (e) => e.count >= 1)), 'no egg logged');
  run.check(!has(lines, is('wrote')), `written: ${lines.filter(is('wrote')).map((e) => e.key).join(', ')}`);
  // The same install with no newer mark: this build marks it first.
  run.launch();
  const claimed = await run.until(is('stores'), { from: run.launched, what: 'the claim' });
  run.check(claimed.verdict === 'write' && claimed.mark === undefined, `the claim: ${say(claimed)}`);
  // The plist lags the app by seconds, and is written whole: once it holds
  // this launch's mark, it holds whatever the launch before left with the
  // system too. Nothing may be in it but what this launch wrote, and no egg
  // or cook.
  const marked = await run.prefs((p) => typeof p.newestVersion === 'string');
  run.check(/^\d+\.\d+\.\d+$/.test(marked.newestVersion ?? ''), `the mark: ${marked.newestVersion}`);
  const wrote = new Set(run.sinceLaunch().filter(is('wrote')).map((e) => e.key));
  const stored = Object.keys(marked).filter((k) => !wrote.has(k));
  run.check(stored.length === 0, `stored by the read-only launch: ${stored.join(', ')}`);
  run.check(!('cookInProgress.v3' in marked) && (marked['calibration.v5']?.log?.length ?? 0) === 0,
    `a cook or an egg stored: ${Object.keys(marked).join(', ')}`);
  run.check(!has(run.sinceLaunch(), is('newerNote')), 'no line');
  run.note(`the line shown; Done, answered, started again; nothing stored; then marked ${marked.newestVersion}, `
    + `the plist ${Object.keys(marked).join(', ')}`);
});

scenario('newer-build', 'a later build of the same version has run: read-only, as for a newer version; the same build writes', async (run) => {
  // Marked by this build first, with its version and its build number.
  run.launch();
  const claimed = await run.until(is('stores'), { from: run.launched, what: 'the claim' });
  const first = claimed.verdict === 'write' && claimed.mark === undefined && claimed.markBuild === undefined
    && /^\S+$/.test(claimed.version) && /^\d+$/.test(claimed.build);
  run.check(first, `the first claim: ${say(claimed)}`);
  if (!first) return;
  const { version, build } = claimed;
  const marked = await run.prefs((p) => p.newestBuild === build);
  run.check(marked.newestVersion === version && marked.newestBuild === build, `marked ${marked.newestVersion} build ${marked.newestBuild}`);
  run.terminate();
  // A later build of this version, as a launch argument (see newer-version).
  const later = String(Number(build) + 1);
  run.launch(['-newestVersion', version, '-newestBuild', later]);
  const guarded = await run.until(is('stores'), { from: run.launched, what: 'the claim under a later build' });
  run.check(guarded.verdict === 'readOnly' && guarded.mark === version && guarded.markBuild === later,
    `the claim: ${say(guarded)}`);
  await run.until(is('newerNote'), { from: run.launched, what: 'the line shown' });
  run.terminate();
  // This build's own number again: it writes.
  run.launch(['-newestVersion', version, '-newestBuild', build]);
  const own = await run.until(is('stores'), { from: run.launched, what: 'the claim under its own build' });
  run.check(own.verdict === 'write', `the claim: ${say(own)}`);
  run.check(!has(run.sinceLaunch(), is('newerNote')), 'no line');
  run.note(`${version} build ${build}: read-only under build ${later}, writing under its own`);
});

// ------------------------------------------------------------------- main

/// A new device's first launches are many seconds slow while the system
/// settles, and its notifications refused ("Source is not authorized"), or,
/// on a loaded machine, the request for them never answered: cooks started
/// until one has its alarms pending, each given two minutes, nothing
/// checked.
async function warmUp(): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    const warm = new Run('warm-up');
    warm.install();
    warm.launch(['-uiScreen', 'heating']);
    const hit = await warm
      .until((e) => (e.ev === 'pending' && e.alarms.some((a) => a.id.startsWith('cook'))) || e.ev === 'notScheduled', { timeoutS: 120, what: 'the alarms' })
      .catch(() => null);
    warm.terminate();
    if (hit?.ev === 'pending') return;
    // What the launch got to, for a device that will not warm up.
    const seen = warm.lines().map((e) => e.ev);
    console.log(`ios:e2e: warm-up ${attempt}: ${hit ? say(hit) : 'no alarms read back'}; `
      + `${seen.length} events, the last ${seen.slice(-8).join(', ') || 'none'}`);
    if (attempt === 5) throw new Error(`the device's alarms not working after ${attempt} launches`);
  }
}

async function main(): Promise<void> {
  if (listOnly) {
    for (const s of scenarios) console.log(`${s.name.padEnd(24)} ${s.about}`);
    return;
  }
  const matches = (name: string): boolean =>
    wanted.length === 0 || wanted.some((w) => (w.endsWith('*') ? name.startsWith(w.slice(0, -1)) : name === w));
  const chosen = scenarios.filter((s) => matches(s.name));
  if (chosen.length === 0) throw new Error(`no scenario named ${wanted.join(', ')} (--list)`);

  const began = Date.now();
  if (!noBuild || !existsSync(APP)) build();
  const built = Date.now();
  if (!udid) udid = createDevice();
  let failed = 0;
  try {
    await warmUp();
    for (const s of chosen) {
      const run = new Run(s.name);
      const t0 = Date.now();
      try {
        run.install();
        await s.body(run);
      } catch (e) {
        run.failures.push(`threw: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        run.terminate();
      }
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      if (run.failures.length === 0) {
        console.log(`  pass  ${s.name} (${secs} s)${run.notes.length ? ` - ${run.notes.join('; ')}` : ''}`);
      } else {
        failed += 1;
        console.log(`  FAIL  ${s.name} (${secs} s)`);
        for (const f of run.failures) console.log(`        ${f}`);
        for (const n of run.notes) console.log(`        note: ${n}`);
        if (process.env['AET_E2E_LOG']) {
          console.log(run.lines().map((l) => `        | ${JSON.stringify(l).slice(0, 240)}`).join('\n'));
        }
      }
    }
  } finally {
    if (!given && !keep) {
      quietly(() => simctl('shutdown', udid));
      quietly(() => simctl('delete', udid));
    }
  }
  const total = ((Date.now() - began) / 1000).toFixed(0);
  const building = ((built - began) / 1000).toFixed(0);
  console.log(
    `ios:e2e: ${chosen.length - failed} of ${chosen.length} passed in ${total} s (the build ${building} s)`
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
