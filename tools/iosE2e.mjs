// `npm run ios:e2e`: the checks agents kept doing by hand on the simulator,
// scripted. A Debug build on a simulator of the script's own, the app's clock
// frozen at each moment a scenario checks and stepped from one to the next
// (`-clockAt`, `-clockSpeed 0`, `Library/Caches/aet.clock`;
// ios/App/AppClock.swift), taps by launch argument (`-uiDo`,
// ios/App/Screenshots.swift), and what happened read from the app's debug log
// (`Library/Caches/aet.log`) and its stored state (the prefs plist, through
// plistlib). Nothing is timed against the host's clock but one notification
// left to the system (`asleep`), so a slow or loaded machine takes longer
// and checks the same. The device is deleted at the end.
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
// Needs Xcode, xcodegen and python3; not in `npm run verify`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const BUNDLE = 'name.danmackinlay.actualeggtimer';
const DERIVED = 'build/e2e';
const APP = `ios/${DERIVED}/Build/Products/Debug-iphonesimulator/Actual Egg Timer.app`;
/// How long a wait for the app gives up after, the host's s: only how long
/// a broken build takes to fail, never what a check means.
const WAIT_S = Number(process.env.AET_E2E_WAIT ?? 60);
/// How long the system is given to deliver the one notification a scenario
/// waits for, past its moment, the host's s.
const DELIVERY_SLACK_S = 15;

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return false;
  argv.splice(i, 1);
  return true;
};
const option = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  const [, value] = argv.splice(i, 2);
  return value;
};
const listOnly = flag('--list');
const noBuild = flag('--no-build');
const keep = flag('--keep');
const given = option('--device');
const wanted = argv;

const out = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const simctl = (...args) => out('xcrun', ['simctl', ...args]);
const quietly = (f) => {
  try {
    return f();
  } catch {
    return null;
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the device

let udid = given;

function build() {
  console.log('ios:e2e: building (Debug, simulator)');
  out('xcodegen', ['--quiet'], { cwd: 'ios' });
  out('xcodebuild', [
    '-project', 'ActualEggTimer.xcodeproj', '-scheme', 'ActualEggTimer', '-configuration', 'Debug',
    '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', DERIVED,
    'CODE_SIGNING_ALLOWED=NO', '-quiet', 'build',
  ], { cwd: 'ios', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 26 });
}

function createDevice() {
  const list = JSON.parse(simctl('list', '-j', 'runtimes', 'devicetypes'));
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
  const type = types.find((t) => t.name === 'iPhone 17 Pro') ?? types.at(-1);
  const id = simctl('create', `AET e2e ${process.pid}`, type.identifier, runtime.identifier);
  console.log(`ios:e2e: device ${id} (${type.name}, iOS ${runtime.version})`);
  simctl('boot', id);
  simctl('bootstatus', id, '-b');
  return id;
}

// ------------------------------------------------------------- the app's run

/// One scenario's run of the app: its clock, its launches, its log.
///
/// The clock is frozen at each moment a scenario checks: launched there
/// (`-clockAt`, `-clockSpeed 0`) and stepped from one to the next while the
/// app runs (`step`, through `Library/Caches/aet.clock`). What the app does
/// at a moment is then the same on any machine, however slow or loaded: the
/// script waits for the log to say it has happened, never for a span of the
/// host's time to pass. A wait's timeout only says when to give up.
class Run {
  constructor(name) {
    this.name = name;
    this.failures = [];
    this.notes = [];
    // Cook time at the first launch, a whole second: each moment checked is
    // this, a span on, or a deadline the app planned.
    this.t0 = Math.floor(Date.now() / 1000);
    // Where the clock stands, cook time, epoch s.
    this.at = this.t0;
    this.steps = 0;
    this.launched = 0;
  }

  /// A fresh install, nothing stored.
  install() {
    quietly(() => simctl('terminate', udid, BUNDLE));
    quietly(() => simctl('uninstall', udid, BUNDLE));
    simctl('install', udid, APP);
    this.data = simctl('get_app_container', udid, BUNDLE, 'data');
  }

  get stepFile() {
    return `${this.data}/Library/Caches/aet.clock`;
  }

  /// Launch with the clock at `at`, cook time, frozen there unless `speed`
  /// says otherwise; quiet notifications granted with no prompt unless asked
  /// otherwise.
  launch(args = [], { alarms = true, at = this.at, speed = 0 } = {}) {
    this.at = at;
    rmSync(this.stepFile, { force: true });
    const prompt = alarms ? ['-provisionalAlarms', 'YES'] : ['-noAlarmPrompt', 'YES'];
    this.launched = this.lines().length;
    // Silent: the ring and the notifications' sound would otherwise play on
    // the Mac's speakers (-muteAudio is debug-only, like the clock).
    simctl('launch', udid, BUNDLE, '-clockAt', String(at), '-clockSpeed', String(speed), '-muteAudio', 'YES',
      ...prompt, ...args);
  }

  terminate() {
    quietly(() => simctl('terminate', udid, BUNDLE));
  }

  /// Move the running app's clock to `at`, frozen there unless `speed` says
  /// otherwise, as a phone asleep or set would be; once the app says it has,
  /// the index of the line that says so.
  async step(at, speed = 0) {
    this.steps += 1;
    const n = this.steps;
    const path = this.stepFile;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(`${path}.new`, `${n} ${at} ${speed}\n`);
    renameSync(`${path}.new`, path);
    const ack = await this.until(new RegExp(`^clock ${n} at `), {
      from: this.launched, what: `the clock at +${(at - this.t0).toFixed(3)} s`,
    });
    this.at = at;
    return ack.i;
  }

  /// The debug log so far: { t (cook time, s), text }.
  lines() {
    const path = `${this.data}/Library/Caches/aet.log`;
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('AET '))
      .map((l) => {
        const m = l.match(/^AET (-?\d+) (.*)$/);
        return { t: Number(m[1]), text: m[2] };
      });
  }

  /// The lines since the last launch.
  sinceLaunch() {
    return this.lines().slice(this.launched);
  }

  /// Wait for a line matching `re` from line `from` on: the line, with its
  /// index `i`; or fail after `timeoutS` of the host's seconds.
  async until(re, { timeoutS = WAIT_S, from = 0, what = String(re) } = {}) {
    const end = Date.now() + timeoutS * 1000;
    while (Date.now() < end) {
      const lines = this.lines();
      for (let i = from; i < lines.length; i += 1) {
        if (re.test(lines[i].text)) return { ...lines[i], i };
      }
      await sleep(100);
    }
    throw new Error(`timed out waiting for ${what}`);
  }

  /// Wait for a phase to be logged since the last launch.
  phase(name, opts = {}) {
    return this.until(new RegExp(`^phase ${name}$`), { from: this.launched, what: `phase ${name}`, ...opts });
  }

  /// Wait until the cook has nothing under way after line `from`: no plan
  /// being made, no surface being built, no start, restore or read-back of
  /// the alarms (`settled`, Cook.swift). Only after a line that set some of
  /// that going: a tap, a phase, a restore.
  settled(from) {
    return this.until(/^settled$/, { from, what: 'the cook settled' });
  }

  /// The prefs plist as JSON, each data value that is JSON parsed; waits
  /// until `ready(prefs)` holds, since the file lags the app by seconds.
  async prefs(ready = () => true, timeoutS = WAIT_S) {
    const path = `${this.data}/Library/Preferences/${BUNDLE}.plist`;
    const end = Date.now() + timeoutS * 1000;
    let last = null;
    while (Date.now() < end) {
      last = existsSync(path) ? JSON.parse(out('python3', ['-c', PLIST_READ, path])) : {};
      if (ready(last)) return last;
      await sleep(250);
    }
    return last;
  }

  /// Rename a key in the prefs plist, with the app terminated.
  renameKey(from, to) {
    const path = `${this.data}/Library/Preferences/${BUNDLE}.plist`;
    out('python3', ['-c', PLIST_RENAME, path, from, to]);
  }

  check(ok, what) {
    if (!ok) this.failures.push(what);
  }

  note(what) {
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

// ----------------------------------------------------------- reading the log

const num = (x) => (x === '-' ? null : Number(x));

/// The last plan logged in these lines: { pull, cooled, lengthened,
/// surface, next (when the slow hob lengthens it next), asking (whether the
/// eggs are still in the water), overdue }, epoch s, exact.
function lastPlan(lines) {
  const l = lines.filter((x) => x.text.startsWith('plan ')).at(-1);
  if (!l) return null;
  const m = l.text.match(
    /^plan pull (\S+) cooled (\S+) lengthened (\w+) surface (\w+) next (\S+) asking (\w+) overdue (\w+)$/,
  );
  return {
    pull: Number(m[1]), cooled: num(m[2]), lengthened: m[3] === 'true', surface: m[4] === 'true',
    next: num(m[5]), asking: m[6] === 'true', overdue: m[7] === 'true', t: l.t,
  };
}

/// The last Live Activity state pushed: { what, stage, ends, up, cook:
/// [doneness, peak yolk, mass, cooling] }.
function lastCard(lines) {
  const l = lines.filter((x) => /^activity (start|update) /.test(x.text)).at(-1);
  const m = l?.text.match(/^activity (\w+) (\w+) ends (\d+) up (\w+) cook (.*)$/);
  return m ? { what: m[1], stage: m[2], ends: Number(m[3]), up: m[4] === 'true', cook: m[5].split('|'), t: l.t } : null;
}

/// The last cook stored in these lines, or null for none; undefined if
/// nothing was stored.
function lastStored(lines) {
  const l = lines.filter((x) => x.text.startsWith('stored ')).at(-1);
  if (!l) return undefined;
  return l.text === 'stored none' ? null : JSON.parse(l.text.slice('stored '.length));
}

/// The notifications as last scheduled, cancelled and scheduled again:
/// { 'cook.pull': t, 'cook.cool': t } in cook time, exact.
function scheduled(lines) {
  let now = {};
  for (const l of lines) {
    if (l.text === 'alarms cancelled') now = {};
    const m = l.text.match(/^scheduled (\S+) at (\S+)/);
    if (m) now[m[1]] = Number(m[2]);
  }
  return now;
}

/// The ids the last read-back found pending.
function pending(lines) {
  const reads = [];
  let current = null;
  for (const l of lines) {
    const m = l.text.match(/^pending (\S+)/);
    if (!m) {
      current = null;
      continue;
    }
    if (current === null) {
      current = [];
      reads.push(current);
    }
    if (m[1] !== 'none') current.push(m[1]);
  }
  return reads.at(-1) ?? null;
}

/// The ids the last read-back found delivered and still shown.
function delivered(lines) {
  const l = lines.filter((x) => x.text.startsWith('delivered [')).at(-1);
  if (!l) return null;
  const ids = l.text.slice('delivered ['.length, -1);
  return ids === '' ? [] : ids.split(',');
}

/// The egg log as last written: { count, last }.
function eggLog(lines) {
  const l = lines.filter((x) => x.text.startsWith('log ')).at(-1);
  if (!l) return null;
  const m = l.text.match(/^log (\d+) folded (\d+) last (.*)$/);
  return { count: Number(m[1]), folded: Number(m[2]), last: m[3] === '-' ? null : JSON.parse(m[3]), t: l.t };
}

/// Tolerances, s. A moment the clock was frozen at, or a tap a span after a
/// deadline, is exact: to a millisecond, for the decimal round trip. A
/// deadline planned again at a relaunch, against the one planned before it,
/// to the second (the plan is remade from the stored cook, at another
/// moment, before its surface is built again). Neither depends on the
/// machine: the clock does not move while the app works.
const EXACT = 1e-3;
const REPLAN = 1;
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
const has = (lines, re) => lines.some((l) => re.test(l.text));

/// A record made with its forecast, as the fit needs it.
const forecastOk = (r) => Array.isArray(r?.forecast?.yolk) && r.forecast.yolk.length === 3;

// --------------------------------------------------------------- scenarios

const scenarios = [];
const scenario = (name, about, body) => scenarios.push({ name, about, body });

/// Every phase of a cook logged in these lines, in order: not IDLE, which
/// the tick may log once more as a cook ends.
const phases = (lines) =>
  lines.filter((l) => l.text.startsWith('phase ') && l.text !== 'phase IDLE').map((l) => l.text.slice(6));
/// The lines before the first matching `re`, or all of them.
const before = (lines, re) => {
  const i = lines.findIndex((l) => re.test(l.text));
  return i < 0 ? lines : lines.slice(0, i);
};
const index = (lines, re) => lines.findIndex((l) => re.test(l.text));
/// What Done shows, each time a plan is taken: the peak yolk, °C.
const shown = (lines) =>
  lines.map((l) => l.text.match(/^shown peak ([\d.]+)/)).filter(Boolean).map((m) => Number(m[1]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/// A value as JSON with every object's keys sorted: the app writes a
/// record's keys in no fixed order.
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const sorted = (a) => (a ? [...a].sort() : a);

/// A hot start: the planner's stored inputs, which load only with a level.
const HOT = ['-doneness', '0.41', '-altitudeM', '0', '-waterLitres', '2', '-eggCount', '2', '-start', 'hot'];
/// A cold cook's taps to Done: the boil at 5:00, out 3 s into the pull.
const TO_DONE = 'boil@300,out@pull+3';

/// The cook's start, epoch s, cook time.
const startOf = (stored) => stored.cook.startedAt_s;

/// Start a cook at the run's first moment, frozen, and wait until it has
/// its first phase, its plan on its surface and its alarms: the cook as
/// stored.
async function started(run, args = [], opts = {}) {
  run.launch(['-uiScreen', 'heating', ...args], opts);
  const first = await run.until(/^phase (HEATING|COOKING)$/, { from: run.launched, what: 'the cook started' });
  await run.settled(first.i);
  return lastStored(run.sinceLaunch());
}

/// Step to 5:00, where `-uiDo boil@300` taps Full rolling boil: the plan
/// once cooking.
async function boiled(run) {
  const i = await run.step(run.t0 + 300);
  const tap = await run.until(/^action boil/, { from: i, what: 'the boil tapped' });
  const cooking = await run.until(/^phase COOKING$/, { from: tap.i, what: 'phase COOKING' });
  await run.settled(cooking.i);
  return lastPlan(run.lines());
}

/// Step a second into the pull, then to `-uiDo`'s `out@pull+<after>`: the
/// plan once cooling.
async function toCooling(run, after) {
  const plan = lastPlan(run.lines());
  let i = await run.step(plan.pull + 1);
  await run.until(/^phase PULL$/, { from: i, what: 'phase PULL' });
  i = await run.step(plan.pull + after);
  const tap = await run.until(/^action out/, { from: i, what: 'the tap out' });
  const cooling = await run.until(/^phase COOLING$/, { from: tap.i, what: 'phase COOLING' });
  await run.settled(cooling.i);
  return lastPlan(run.lines());
}

/// A cold cook started with TO_DONE's taps, stepped to a second past the
/// cooling's end: the plan at Done.
async function toDone(run) {
  await boiled(run);
  const cooling = await toCooling(run, 3);
  const i = await run.step(cooling.cooled + 1);
  const done = await run.until(/^phase DONE$/, { from: i, what: 'phase DONE' });
  await run.settled(done.i);
  return lastPlan(run.lines());
}

/// Launch again with the clock at `at`: the restore line, the restored
/// plan, and the lines once the alarms and the card are set again and the
/// cook has settled.
async function relaunched(run, at, args = [], opts = {}) {
  run.launch(args, { ...opts, at });
  const restore = await run.until(/^restore /, { from: run.launched, what: 'the restore' });
  const restored = await run.until(/^restored$/, { from: restore.i, what: 'the alarms and the card set again' });
  const phase = await run.until(/^phase /, { from: restore.i, what: 'the first tick' });
  await run.settled(Math.max(restored.i, phase.i));
  const lines = run.sinceLaunch();
  return { restore: restore.text, plan: lastPlan(before(lines, /^pending /)), lines };
}

/// Where each part of the screen last sat, pt from the window's top
/// (`layout <name> <y>`, ContentView.logTop).
function layoutOf(lines) {
  const out = {};
  for (const l of lines) {
    const m = l.text.match(/^layout (\S+) (\S+)$/);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

/// Wait until the lines starting `prefix` have stopped coming for a second of
/// the host's, a view's redraws being the system's to time: the lines then.
async function quiet(run, prefix) {
  const end = Date.now() + WAIT_S * 1000;
  let count = -1;
  let since = Date.now();
  while (Date.now() < end) {
    const lines = run.lines();
    const n = lines.filter((l) => l.text.startsWith(prefix)).length;
    if (n !== count) {
      count = n;
      since = Date.now();
    } else if (Date.now() - since >= 1000) {
      return lines;
    }
    await sleep(100);
  }
  throw new Error(`"${prefix}" never stopped`);
}

/// Wait until the screen has stopped moving: no `layout` line for a second.
/// The layout then.
async function stillLayout(run) {
  return layoutOf(await quiet(run, 'layout '));
}

/// The egg in cross-section once it has stopped changing: its reading
/// (`aim`, `live`, `ran`) and how set its yolk is (EggSectionView).
async function eggNow(run) {
  const l = (await quiet(run, 'egg ')).filter((x) => x.text.startsWith('egg ')).at(-1);
  const m = l?.text.match(/^egg (\w+) yolk ([\d.]+)$/);
  return m ? { reading: m[1], yolk: Number(m[2]) } : { reading: l?.text ?? 'none', yolk: NaN };
}

/// Launch idle on a fresh install and wait for the time decided on its pot's
/// surface and its odds, and the screen still.
async function idle(run, args = []) {
  run.launch(args);
  await run.until(/^answer \S+ decided true odds true$/, { from: run.launched, what: 'the idle time decided' });
  return stillLayout(run);
}

scenario('one-layout', 'C3 step 1: one layout from idle to Done; the slider, the sentence and the egg stay, nothing moves at the start', async (run) => {
  const before = await idle(run, ['-uiDo', `eggsIn@launch+1,${TO_DONE}`]);
  for (const part of ['slider', 'sentence', 'egg']) run.check(part in before, `idle: no ${part}`);
  let i = await run.step(run.t0 + 1);
  const heating = await run.until(/^phase HEATING$/, { from: i, what: 'phase HEATING' });
  await run.settled(heating.i);
  const after = await stillLayout(run);
  for (const part of ['slider', 'sentence', 'egg']) {
    run.check(near(after[part], before[part], 2), `${part} moved at the start: ${before[part]} -> ${after[part]}`);
  }
  // Boiled at 5:00 (from the start, a second after the launch), out 3 s
  // into the pull, and on to Done: the three parts in every phase.
  run.t0 += 1;
  await toDone(run);
  const done = await stillLayout(run);
  for (const part of ['slider', 'sentence', 'egg']) run.check(part in done, `Done: no ${part}`);
  const phasesSeen = phases(run.lines());
  run.check(same(phasesSeen, ['HEATING', 'COOKING', 'PULL', 'COOLING', 'DONE']), `phases ${phasesSeen}`);
  run.note(`slider ${before.slider}, sentence ${before.sentence}, egg ${before.egg} pt, idle and Heating; Done ${done.slider}, ${done.sentence}`);
});

scenario('egg-readings', 'C3 step 2: the egg aimed for at idle (softer and firmer differ), live from raw at the start, as it ran at Done', async (run) => {
  await idle(run, [...HOT, '-uiDo',
    'set:level=0.1@launch+1,set:level=0.95@launch+2,set:level=0.41@launch+3,eggsIn@launch+4,out@pull+2']);
  const at = async (s) => {
    const i = await run.step(run.t0 + s);
    await run.until(/^action set/, { from: i, what: `the level set at +${s} s` });
    await run.until(/^answer \S+ decided true/, { from: i, what: 'decided' });
    return eggNow(run);
  };
  const runny = await at(1);
  const hard = await at(2);
  const jammy = await at(3);
  run.check(runny.reading === 'aim' && hard.reading === 'aim', `idle reads the aim: ${runny.reading}, ${hard.reading}`);
  run.check(runny.yolk < jammy.yolk && jammy.yolk < hard.yolk, `aimed yolks ${runny.yolk}, ${jammy.yolk}, ${hard.yolk}`);
  const i = await run.step(run.t0 + 4);
  const cooking = await run.until(/^phase COOKING$/, { from: i, what: 'phase COOKING' });
  await run.settled(cooking.i);
  const live = await eggNow(run);
  run.check(live.reading === 'live' && live.yolk < 0.01, `the cook reads live, from raw: ${live.reading} ${live.yolk}`);
  run.t0 += 4;
  const cooling = await toCooling(run, 2);
  run.check((await eggNow(run)).reading === 'live', 'cooling reads live');
  const j = await run.step(cooling.cooled + 1);
  const done = await run.until(/^phase DONE$/, { from: j, what: 'phase DONE' });
  await run.settled(done.i);
  const ran = await eggNow(run);
  run.check(ran.reading === 'ran', `Done reads the egg as it ran: ${ran.reading}`);
  run.note(`idle aim yolk runny ${runny.yolk}, jammy ${jammy.yolk}, hard ${hard.yolk}; start ${live.yolk}; Done ${ran.yolk}`);
});

/// A correction committed (`edit committed`, after a tap's settle or on
/// release) from line `from`: the cook as stored then, its plan once the
/// cook has settled, and the lines since.
async function corrected(run, from) {
  const c = await run.until(/^edit committed /, { from, what: 'a correction committed' });
  const stored = await run.until(/^stored /, { from: c.i, what: 'the corrected cook stored' });
  const plan = await run.until(/^plan /, { from: stored.i, what: 'the corrected cook planned' });
  await run.settled(plan.i);
  const lines = run.lines().slice(c.i);
  return { cook: lastStored(lines)?.cook, plan: lastPlan(lines), lines, i: c.i };
}

/// Step to `at`, where a `-uiDo` tap is due, and wait for it: its line.
async function tapAt(run, at, what) {
  const i = await run.step(at);
  return run.until(new RegExp(`^action ${what}`), { from: i, what: `the tap ${what}` });
}

/// A hot cook started and planned on its pot's surface: its plan.
async function hotStarted(run, uiDo) {
  await started(run, [...HOT, '-uiDo', uiDo]);
  return lastPlan(run.lines());
}

/// The words a key says in English, from the catalogue.
const EN = JSON.parse(readFileSync('copy/en.json', 'utf8')).messages;

scenario('owner-case', "C3 step 3: boiling corrected to cold, as the owner needed: Heating again, the pull later, the settings and the card follow", async (run) => {
  const plan0 = await hotStarted(run, 'set:start=cold@60');
  const card0 = lastCard(run.lines());
  const tap = await tapAt(run, run.t0 + 60, 'set');
  const after = await corrected(run, tap.i);
  const phase = await run.until(/^phase HEATING$/, { from: tap.i, what: 'Heating again' });
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
  run.check(r.restore.startsWith('restore HEATING'), r.restore);
  run.check(near(r.plan.pull, after.plan.pull, REPLAN), `relaunched: ${(r.plan.pull - after.plan.pull).toFixed(3)} s`);
  run.note(`the pull ${(after.plan.pull - plan0.pull).toFixed(0)} s later; card ${card0?.stage} -> ${card?.stage}`);
});

scenario('cold-to-hot-after-tap', 'C3 step 3: cold corrected to boiling after the boil was pressed: the tap kept, the pull sooner', async (run) => {
  await started(run, ['-uiDo', 'boil@300,set:start=hot@boil+60']);
  const was = await boiled(run);
  const tap = lastStored(run.lines()).cook.events.boilAt_s;
  const t = await tapAt(run, tap + 60, 'set');
  const after = await corrected(run, t.i);
  run.check(after.cook?.events.boilAt_s === tap, `the tap kept: ${after.cook?.events.boilAt_s - tap}`);
  run.check(after.cook?.choices.startMode === 'hot', 'the cook says boiling');
  run.check(after.plan.pull < was.pull, `a boiling start pulls sooner: ${(after.plan.pull - was.pull).toFixed(0)} s`);
  run.note(`the pull ${(after.plan.pull - was.pull).toFixed(0)} s`);
});

scenario('heavier-lighter', 'C3 step 3: a heavier egg pulls later, a lighter sooner, each committed after the settle; back exactly', async (run) => {
  const plan0 = await hotStarted(run, 'set:size=3@30,set:size=1@40,set:size=2@50');
  let t = await tapAt(run, run.t0 + 30, 'set');
  // Nothing yet: a tap settles first.
  const edit = await run.until(/^edit mass$/, { from: t.i, what: 'the change in hand' });
  run.check(!has(run.lines().slice(t.i, edit.i + 1), /^stored /), 'not committed before the settle');
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
  await run.until(/^phase PULL$/, { from: t.i, what: 'Pull at once' });
  run.check(after.plan.overdue && near(after.plan.pull, plan0.pull - 40, EXACT), `the pull now: ${after.plan.pull - plan0.pull}`);
  await run.until(/^ring pull$/, { from: t.i, what: 'rung at once' });
  t = await tapAt(run, plan0.pull - 35, 'set');
  after = await corrected(run, t.i);
  await run.until(/^phase COOKING$/, { from: t.i, what: 'Cooking again' });
  // The ring the plan no longer holds, cleared by the clock's next look
  // (core `eventsDue`; onescreen review 3).
  const cleared = await run.until(/^stored .*"rangAt_s":null/, { from: t.i, what: 'the ring undone' });
  const ev = lastStored(run.lines().slice(0, cleared.i + 1))?.cook.events;
  run.check(ev?.pulled === null && ev?.rangAt_s === null, `nothing observed: ${JSON.stringify(ev)}`);
  run.check(near(after.plan.pull, plan0.pull, 1), `the pull back: ${(after.plan.pull - plan0.pull).toFixed(1)} s`);
  run.check(near(scheduled(after.lines)['cook.pull'], after.plan.pull, EXACT), 'its alarm set again');
  run.note('overdue: Pull and a ring at once; back within the grace: Cooking, nothing written, the alarm set again');
});

scenario('drag-no-ring', 'C3 step 3: a drag through an overdue level rings nothing before release; the egg shows the aim while held', async (run) => {
  const plan0 = await hotStarted(run, 'drag:0.3/0.1/0@pull-60,drag:0.2/0.41@pull-57,release@pull-56,drag:0@pull-50,release@pull-49');
  const level = lastStored(run.lines()).cook.choices.level;
  let t = await tapAt(run, plan0.pull - 60, 'drag');
  // Held two seconds of the host's (a person's span, past every settle).
  await sleep(2000);
  const egg = await eggNow(run);
  run.check(egg.reading === 'aim', `the aim while held: ${egg.reading}`);
  let lines = run.lines().slice(t.i);
  run.check(!has(lines, /^ring /) && !has(lines, /^edit committed/), 'held: nothing rung or committed');
  await tapAt(run, plan0.pull - 57, 'drag');
  t = await tapAt(run, plan0.pull - 56, 'release');
  await run.until(/^edit committed/, { from: t.i, what: 'the release' });
  await sleep(500);
  lines = run.lines().slice(t.i);
  run.check(!has(lines, /^stored /) && !has(lines, /^ring /), `released at the level it had (${level}): nothing`);
  await tapAt(run, plan0.pull - 50, 'drag');
  t = await tapAt(run, plan0.pull - 49, 'release');
  const after = await corrected(run, t.i);
  await run.until(/^ring pull$/, { from: t.i, what: 'rung on release' });
  run.check(after.cook?.choices.level < 0.1, `the level corrected: ${after.cook?.choices.level}`);
  run.note('held through runny: no ring, the aim drawn; back and released: nothing; released runny: rang');
});

scenario('start-time', 'C3 step 3: the start corrected a minute at a time, stopped with its reason at now, the boil pressed, and two hours back', async (run) => {
  const cook = await started(run, ['-uiDo', 'start:+3@150,boil@240,start:+5@boil+60,start:-140@boil+70']);
  const id = cook.cook.id_ms / 1000;
  let t = await tapAt(run, run.t0 + 150, 'start');
  const now = await run.until(/^start limit now /, { from: t.i, what: 'the limit at now' });
  let after = await corrected(run, t.i);
  run.check(near(after.cook?.startedAt_s, run.t0 + 150, EXACT), `in at now: ${after.cook?.startedAt_s - run.t0}`);
  t = await tapAt(run, run.t0 + 390, 'boil');
  await run.until(/^phase COOKING$/, { from: t.i, what: 'the boil' });
  const tap = run.t0 + 390;
  t = await tapAt(run, tap + 60, 'start');
  const boil = await run.until(/^start limit boil /, { from: t.i, what: 'the limit at the boil' });
  after = await corrected(run, t.i);
  run.check(near(after.cook?.startedAt_s, tap, EXACT), `in at the press: ${after.cook?.startedAt_s - tap}`);
  t = await tapAt(run, tap + 70, 'start');
  const early = await run.until(/^start limit earliest /, { from: t.i, what: 'the limit two hours back' });
  after = await corrected(run, t.i);
  run.check(near(after.cook?.startedAt_s, id - 7200, EXACT), `two hours back: ${after.cook?.startedAt_s - id}`);
  run.note(`"${now.text}"; "${boil.text}"; "${early.text}"`);
});

scenario('settings-mid-cook', "C3 step 3: Settings open while a cook runs; its water corrects the cook and the next cook's; the pull brings the egg back", async (run) => {
  const plan0 = await hotStarted(run, 'open:settings@10,set:water=1@20');
  let t = await tapAt(run, run.t0 + 10, 'open');
  await run.until(/^view settings$/, { from: t.i, what: 'Settings open' });
  t = await tapAt(run, run.t0 + 20, 'set');
  const after = await corrected(run, t.i);
  run.check(after.cook?.choices.waterLitres === 1, `the cook's water: ${after.cook?.choices.waterLitres}`);
  run.check(after.plan.pull !== plan0.pull, `the pull moved: ${(after.plan.pull - plan0.pull).toFixed(1)} s`);
  const prefs = await run.prefs((p) => p.waterLitres === 1);
  run.check(prefs.waterLitres === 1, `the next cook's water: ${prefs.waterLitres}`);
  run.check(prefs.eggCount === undefined || prefs.eggCount === 2, `only what changed written: eggs ${prefs.eggCount}`);
  const i = await run.step(after.plan.pull + 1);
  await run.until(/^phase PULL$/, { from: i, what: 'the pull' });
  await run.until(/^view egg$/, { from: i, what: "the egg's page at the pull" });
  run.note(`water 2 → 1 L: the pull ${(after.plan.pull - plan0.pull).toFixed(1)} s; the egg's page at the pull`);
});

scenario('record-corrected-at-done', 'C3 step 3: a correction at Done changes the record, planned on the calibration before this egg; back, the first to the bit', async (run) => {
  await hotStarted(run, 'out@pull+2,answer:runny@cooled+5,set:size=3@cooled+10,set:size=2@cooled+20');
  const cooling = await toCooling(run, 2);
  let i = await run.step(cooling.cooled + 1);
  await run.until(/^phase DONE$/, { from: i, what: 'Done' });
  i = await run.step(cooling.cooled + 5);
  await run.until(/^log 1 folded 1 /, { from: i, what: 'Runny folded' });
  const first = eggLog(run.lines()).last;
  const peak0 = shown(run.lines()).at(-1);
  let t = await tapAt(run, cooling.cooled + 10, 'set');
  await run.until(/^as ran corrected$/, { from: t.i, what: 'the record planned again' });
  const changed = await run.until(/^log 1 folded 1 /, { from: t.i, what: 'the corrected egg folded again' });
  const heavier = eggLog(run.lines().slice(0, changed.i + 1)).last;
  run.check(heavier.yolkWord === 'runny', `the answer kept: ${heavier.yolkWord}`);
  run.check(heavier.recommended_s === first.recommended_s, 'the time that ran is the time that ran');
  run.check(canon(heavier.forecast) !== canon(first.forecast), "the forecast is the heavier egg's");
  run.check(heavier.egg.mass_g !== first.egg.mass_g, `the egg corrected: ${heavier.egg.mass_g} g`);
  t = await tapAt(run, cooling.cooled + 20, 'set');
  await run.until(/^as ran corrected$/, { from: t.i, what: 'the record planned again' });
  await run.until(/^log 1 folded 1 /, { from: t.i, what: 'folded again' });
  const again = eggLog(run.lines()).last;
  run.check(canon(again.forecast) === canon(first.forecast),
    `back, the first forecast, not one that knew Runny: ${JSON.stringify(again.forecast)} vs ${JSON.stringify(first.forecast)}`);
  run.check(canon(again) === canon(first), 'back, the record is the first to the bit');
  const peak1 = shown(run.lines()).at(-1);
  run.check(Math.abs(peak1 - peak0) < 0.01, `Done shows the cook as it ran: ${peak1} (was ${peak0})`);
  run.note(`heavier: ${heavier.egg.mass_g} g, a new forecast, Runny kept; back: the first record to the bit, ${peak1} °C`);
});

scenario('slider-after-pull', 'C3 step 3: after the pull the slider only previews: no correction, the record as it was, back to its level', async (run) => {
  await hotStarted(run, 'out@pull+2,answer:jammy@cooled+5,drag:0.6/0.9@cooled+10,release@cooled+12');
  const cooling = await toCooling(run, 2);
  let i = await run.step(cooling.cooled + 1);
  await run.until(/^phase DONE$/, { from: i, what: 'Done' });
  i = await run.step(cooling.cooled + 5);
  await run.until(/^log 1 folded 1 /, { from: i, what: 'Jammy folded' });
  const first = canon(eggLog(run.lines()).last);
  const stored0 = lastStored(run.lines()).cook;
  await tapAt(run, cooling.cooled + 10, 'drag');
  const aim = await eggNow(run);
  run.check(aim.reading === 'aim', `the aim while held: ${aim.reading}`);
  const t = await tapAt(run, cooling.cooled + 12, 'release');
  await run.until(/^edit committed/, { from: t.i, what: 'the release' });
  // The aim's settle, then the egg as it ran again.
  await run.until(/^egg ran /, { from: t.i, what: 'the egg as it ran again' });
  const lines = run.lines().slice(t.i);
  const stored = lastStored(run.lines()).cook;
  run.check(stored.correctedAt_s === stored0.correctedAt_s && stored.choices.level === stored0.choices.level,
    `no correction: ${stored.correctedAt_s}, level ${stored.choices.level}`);
  run.check(!has(lines, /^log /) || canon(eggLog(lines).last) === first, 'the record as it was');
  run.note(`dragged to 0.9 and let go: the aim drawn, no correction, the record as it was, the egg as it ran again`);
});

/// A hot cook whose pull's grace ran out unanswered, so the clock assumed
/// the eggs came out, corrected 30 s after the pull to a cold start: the
/// plan asks whether they are still in the water. The plan before, and the
/// correction.
async function asked(run, uiDo) {
  const plan0 = await hotStarted(run, `set:start=cold@pull+30,${uiDo}`);
  let i = await run.step(plan0.pull + 25);
  await run.until(/^phase COOLING$/, { from: i, what: 'the grace run out' });
  const pulled = lastStored(run.lines()).cook.events.pulled;
  run.check(pulled?.by === 'timeout' && !pulled.confirmed, `the clock assumed the pull: ${JSON.stringify(pulled)}`);
  const t = await tapAt(run, plan0.pull + 30, 'set');
  const after = await corrected(run, t.i);
  run.check(after.plan.asking, 'the plan asks');
  return { plan0, after };
}

scenario('still-in-yes', 'C3 step 4: a correction after the grace ran out asks "still in the water?"; nothing past it; yes: timed again', async (run) => {
  const { plan0, after } = await asked(run, 'stillIn@pull+700');
  run.check(has(after.lines, /^alarms cancelled$/) && Object.keys(scheduled(after.lines)).length === 0,
    `nothing scheduled while it asks: ${JSON.stringify(scheduled(after.lines))}`);
  const card = lastCard(after.lines);
  run.check(card?.stage === 'pull', `the card shows the pull while it asks: ${card?.stage}`);
  // The cooling's counted end passes under the question: nothing.
  let i = await run.step(plan0.pull + 640);
  await sleep(1000);
  let lines = run.lines().slice(i);
  run.check(!has(lines, /^phase DONE$/) && !has(lines, /^ring /), 'nothing past the question');
  run.check(lastStored(run.lines()).cook.events.cooledAt_s === null, 'no cooling written');
  const t = await tapAt(run, plan0.pull + 700, 'stillIn');
  const heating = await run.until(/^phase (HEATING|PULL)$/, { from: t.i, what: 'timed again' });
  await run.settled(heating.i);
  lines = run.lines().slice(t.i);
  const cook = lastStored(lines)?.cook;
  run.check(cook?.events.pulled === null, `still in: the assumed pull dropped: ${JSON.stringify(cook?.events.pulled)}`);
  run.check(!lastPlan(lines).asking, 'the question answered');
  run.note(`still in: ${heating.text}; the card ${card?.stage} while it asked`);
});

scenario('still-in-no', 'C3 step 4: "still in the water?" answered no: the pull stands, confirmed, and the record is made for cold water', async (run) => {
  const { plan0 } = await asked(run, 'stillOut@pull+40');
  const t = await tapAt(run, plan0.pull + 40, 'stillOut');
  const out = await run.until(/^stored .*"confirmed":true/, { from: t.i, what: 'the pull confirmed' });
  await run.settled(out.i);
  const lines = run.lines().slice(t.i);
  const cook = lastStored(run.lines())?.cook;
  const pulled = cook?.events.pulled;
  run.check(pulled?.by === 'timeout' && pulled.confirmed, `out: the pull stands, confirmed: ${JSON.stringify(pulled)}`);
  run.check(cook?.choices.startMode === 'cold' && cook.asRan?.correctedAt_s === cook.correctedAt_s, 'as ran, for cold water');
  run.check(!lastPlan(lines).asking, 'not asked again');
  run.note(`out: ${phases(lines).at(-1) ?? 'COOLING'}, the pull confirmed, the record corrected`);
});

scenario('running-lines', 'C3 step 5: corrected to cold and left heating, the slow hob counts the time heated up, on the clock and the card', async (run) => {
  await hotStarted(run, 'set:start=cold@300');
  const t = await tapAt(run, run.t0 + 300, 'set');
  const after = await corrected(run, t.i);
  await run.until(/^phase HEATING$/, { from: t.i, what: 'Heating again' });
  run.check(!after.plan.lengthened, 'on the guess at first');
  const i = await run.step(run.t0 + 16 * 60);
  const plan = await run.until(/^plan .* lengthened true/, { from: i, what: 'the slow hob lengthened' });
  await run.settled(plan.i);
  const said = await run.until(/^readout HEATING 16:00 \|/, { from: i, what: 'the time heated, counting up' });
  const card = lastCard(run.lines().slice(i));
  run.check(card?.stage === 'heating' && card.up, `the card counts up: ${card?.stage} ${card?.up}`);
  run.note(said.text.slice('readout '.length));
});

scenario('white-unset', 'C3 step 5: a correction the white never sets in gets the longest time the pan can give, and the slot says so', async (run) => {
  await hotStarted(run, 'set:heatOff=1@20,set:size=0@30,set:eggs=1@40,set:water=0.5@50');
  let after;
  for (const s of [20, 30, 40, 50]) {
    const t = await tapAt(run, run.t0 + s, 'set');
    after = await corrected(run, t.i);
  }
  const never = EN['refusal.whiteNeverSets'].text;
  const slot = await run.until(/^slot /, { from: run.launched, what: 'the slot' });
  const last = run.lines().filter((l) => l.text.startsWith('slot ')).at(-1);
  run.check(last.text === `slot ${never}`, `the slot: "${last.text}"`);
  run.check(slot, 'the slot says it');
  run.note(`heat off, 0.5 L, one small egg: "${last.text.slice(5)}"`);
});

scenario('cold', 'a cold cook: boil, pull, cooling, Done, an answer, Start again', async (run) => {
  const cook = await started(run, ['-uiDo', `${TO_DONE},answer:jammy@cooled+20,again@cooled+40`]);
  const start = startOf(cook);
  run.check(start === run.t0, `started at +${start - run.t0} s`);
  const done = await toDone(run);
  let i = await run.step(done.cooled + 20);
  await run.until(/^action answer/, { from: i, what: 'the answer' });
  await run.until(/^log 1 folded 1 /, { from: i, what: 'the fold' });
  i = await run.step(done.cooled + 40);
  await run.until(/^stored none$/, { from: i, what: 'Start again' });
  const lines = run.lines();
  run.check(same(phases(lines), ['HEATING', 'COOKING', 'PULL', 'COOLING', 'DONE']), `phases ${phases(lines)}`);
  const last = lastStored(before(lines, /^stored none$/)).cook;
  run.check(near(last.events.boilAt_s, start + 300, EXACT), `boil at ${last.events.boilAt_s - start}`);
  run.check(last.events.pulled?.by === 'cook', `pulled by ${last.events.pulled?.by}`);
  run.check(near(last.events.pulled.out_s - last.events.pulled.due_s, 3, EXACT), 'out 3 s into the pull');
  run.check(last.events.cooledAt_s !== null, 'the cooling ended');
  // The alarms set when the boil was tapped are that plan's.
  const cooking = before(lines, /^phase PULL$/);
  const plan = lastPlan(cooking);
  const alarms = scheduled(cooking);
  run.check(
    near(alarms['cook.pull'], plan.pull, EXACT) && near(alarms['cook.cool'], plan.cooled, EXACT),
    `alarms ${JSON.stringify(alarms)} for the plan ${plan.pull}, ${plan.cooled}`,
  );
  run.check(same(sorted(pending(cooking)), ['cook.cool', 'cook.pull']), `pending ${pending(cooking)}`);
  run.check(!has(lines, /^ring /), 'no ring: the notifications held both');
  run.check(has(lines, /^activity end done$/), 'the card ended at Done');
  const egg = eggLog(lines);
  run.check(egg.count === 1, `one egg logged, not ${egg.count}`);
  run.check(egg.last.yolkWord === 'jammy' && egg.last.pulledBy === 'cook', 'the answer and the pull recorded');
  run.check(forecastOk(egg.last), 'the record has its forecast');
  run.check(egg.last.appVersion.endsWith(' (debug clock)'), `marked: ${egg.last.appVersion}`);
  const prefs = await run.prefs((p) => !('cookInProgress.v3' in p) && p['calibration.v4']?.log?.length === 1);
  run.check(!('cookInProgress.v3' in prefs), 'no cook stored after Start again');
  run.check(prefs['calibration.v4']?.log?.length === 1, 'the plist holds the one egg');
  run.note(
    `in ${Math.round(last.events.pulled.out_s - start)} s, cooled ${Math.round(last.events.cooledAt_s - last.events.pulled.out_s)} s`,
  );
});

scenario('hot', 'a hot start to Done; Start again logs it unanswered', async (run) => {
  const cook = await started(run, [...HOT, '-uiDo', 'out@pull+2,again@cooled+5']);
  run.check(cook.cook.choices.startMode === 'hot', `start mode ${cook.cook.choices.startMode}`);
  const cooling = await toCooling(run, 2);
  let i = await run.step(cooling.cooled + 1);
  await run.until(/^phase DONE$/, { from: i, what: 'phase DONE' });
  i = await run.step(cooling.cooled + 5);
  await run.until(/^stored none$/, { from: i, what: 'Start again' });
  const lines = run.lines();
  run.check(same(phases(lines), ['COOKING', 'PULL', 'COOLING', 'DONE']), `phases ${phases(lines)}`);
  const egg = eggLog(lines);
  run.check(egg?.count === 1 && egg.last.yolkWord === null, 'one egg logged, unanswered');
  run.check(forecastOk(egg?.last), 'with its forecast');
  run.check(egg?.last.setup.startMode === 'hot', 'a hot start recorded');
});

scenario('cancel', 'Cancel while heating: nothing stored, the alarms and the card gone', async (run) => {
  await started(run, ['-uiDo', 'cancel@120']);
  const i = await run.step(run.t0 + 120);
  const ended = await run.until(/^cook ended$/, { from: i, what: 'the cancel' });
  await run.until(/^alarms cancelled$/, { from: ended.i, what: 'the alarms cancelled' });
  await run.until(/^stored none$/, { from: ended.i, what: 'the cook cleared' });
  const lines = run.lines();
  run.check(lastStored(lines) === null, 'nothing stored');
  run.check((eggLog(lines)?.count ?? 0) === 0, 'no egg logged');
  run.terminate();
  run.launch();
  // The launch's own read-back, three seconds on (AppModel.appear).
  await run.until(/^delivered /, { from: run.launched, what: 'the alarms read back' });
  const after = run.sinceLaunch();
  run.check(!has(after, /^restore /), 'idle at the relaunch');
  run.check(!has(after, /activity/), 'no card');
  run.check(same(pending(after), []), `pending ${pending(after)}`);
});

scenario('relaunch-heating', 'a relaunch while heating: the same deadlines and alarms', async (run) => {
  const start = startOf(await started(run));
  await run.step(start + 120);
  const was = lastPlan(run.lines());
  run.terminate();
  const r = await relaunched(run, start + 120);
  run.check(r.restore.startsWith('restore HEATING'), r.restore);
  run.check(
    near(r.plan.pull, was.pull, REPLAN) && near(r.plan.cooled, was.cooled, REPLAN),
    `deadlines ${r.plan.pull}, ${r.plan.cooled} for ${was.pull}, ${was.cooled}`,
  );
  const plan = lastPlan(r.lines);
  run.check(near(scheduled(r.lines)['cook.pull'], plan.pull, EXACT), 'the pull scheduled again, at the plan’s time');
  run.check(same(sorted(pending(r.lines)), ['cook.cool', 'cook.pull']), `pending ${pending(r.lines)}`);
  run.check(has(r.lines, /^activity start heating/), 'the card again');
});

scenario('relaunch-cooking', 'a relaunch while cooking: the same deadlines and alarms', async (run) => {
  await started(run, ['-uiDo', 'boil@300']);
  const was = await boiled(run);
  const boil = lastStored(run.lines()).cook.events.boilAt_s;
  run.check(boil === run.t0 + 300, `boiled at +${boil - run.t0} s`);
  await run.step(run.t0 + 360);
  run.terminate();
  const r = await relaunched(run, run.t0 + 360);
  run.check(r.restore.startsWith('restore COOKING'), r.restore);
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
  run.check(r.restore.startsWith('restore COOKING'), r.restore);
  let i = await run.step(was.pull + 1);
  await run.until(/^phase PULL$/, { from: i, what: 'phase PULL' });
  await run.step(was.pull + 4);
  run.check(!has(run.sinceLaunch(), /^ring /), 'no ring in the pull: the notification holds it');
  run.terminate();
  const again = await relaunched(run, was.pull + 14, ['-uiDo', 'out@pull+15']);
  run.check(again.restore.startsWith('restore PULL'), again.restore);
  const plan = lastPlan(again.lines);
  run.check(near(plan.pull, was.pull, REPLAN), `the pull ${plan.pull} for ${was.pull}`);
  i = await run.step(plan.pull + 15);
  const tap = await run.until(/^action out/, { from: i, what: 'the tap out' });
  await run.until(/^phase COOLING$/, { from: tap.i, what: 'phase COOLING' });
  const after = run.sinceLaunch();
  const out = lastStored(after).cook.events.pulled;
  run.check(out?.by === 'cook', `pulled by ${out?.by}`);
  run.check(near(out?.out_s - out?.due_s, 15, EXACT), `out ${out?.out_s - out?.due_s} s into the pull`);
  run.check(!has(after, /^ring pull/), 'the pull not rung again');
  run.note(`relaunched ${(was.pull + 14 - plan.pull).toFixed(3)} s into the pull`);
});

scenario('relaunch-cooling', 'a relaunch while cooling: the same end, one alarm left', async (run) => {
  await started(run, ['-uiDo', TO_DONE]);
  await boiled(run);
  const was = await toCooling(run, 3);
  const at = lastStored(run.lines()).cook.events.pulled.out_s + 60;
  await run.step(at);
  run.terminate();
  const r = await relaunched(run, at);
  run.check(r.restore.startsWith('restore COOLING'), r.restore);
  run.check(near(r.plan.cooled, was.cooled, REPLAN), `the cooling's end ${r.plan.cooled} for ${was.cooled}`);
  run.check(same(pending(r.lines), ['cook.cool']), `pending ${pending(r.lines)}`);
  run.check(has(r.lines, /^activity start cooling/), 'the card again');
});

scenario('relaunch-done', 'a relaunch at Done: Done again, nothing pending, no card', async (run) => {
  await started(run, ['-uiDo', TO_DONE]);
  const was = await toDone(run);
  await run.step(was.cooled + 30);
  run.terminate();
  const r = await relaunched(run, was.cooled + 30);
  run.check(r.restore.startsWith('restore DONE'), r.restore);
  run.check(near(r.plan.cooled, was.cooled, REPLAN), `the cooling's end ${r.plan.cooled} for ${was.cooled}`);
  run.check(same(pending(r.lines), []), `pending ${pending(r.lines)}`);
  run.check(!has(r.lines, /^activity start/), 'no card started');
  // A minute on at Done, and the ticks of a second of the host's: nothing
  // to wait for, since nothing should happen (a slow host ticks less).
  await run.step(was.cooled + 90);
  await sleep(1000);
  run.check(!has(run.sinceLaunch(), /^ring /), 'nothing rung again');
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
  run.check(r.restore.startsWith('restore COOKING'), r.restore);
  run.check('cook.pull' in scheduled(r.lines), 'the pull scheduled');
  run.terminate();
  await sleep(Math.max(0, seen + (lead + DELIVERY_SLACK_S) * 1000 - Date.now()));
  const after = await relaunched(run, was.pull + 60);
  run.check(after.restore === 'restore COOLING events written true', after.restore);
  const cook = lastStored(after.lines)?.cook;
  const plan = lastPlan(after.lines);
  run.check(cook?.events.pulled?.by === 'timeout', `pulled by ${cook?.events.pulled?.by}`);
  run.check(near(cook?.events.pulled?.out_s, plan.pull + 20, EXACT), "out at the grace's end");
  run.check(same(delivered(after.lines), ['cook.pull']), `delivered ${delivered(after.lines)}`);
  run.check(same(pending(after.lines), ['cook.cool']), `pending ${pending(after.lines)}`);
  const i = await run.step(plan.cooled + 1);
  const done = await run.until(/^phase DONE$/, { from: i, what: 'phase DONE' });
  await run.settled(done.i);
  run.check(!has(run.sinceLaunch(), /^ring /), 'nothing rung by the app: the notifications rang');
});

scenario('too-old', 'relaunched three hours on: ended, its alarms and card gone (2.2)', async (run) => {
  await started(run);
  run.terminate();
  run.launch([], { at: run.t0 + 3 * 3600 });
  const restore = await run.until(/^restore /, { from: run.launched, what: 'the restore' });
  // The launch's own read-back, three seconds on (AppModel.appear).
  await run.until(/^delivered /, { from: restore.i, what: 'the launch’s read-back' });
  const lines = run.sinceLaunch();
  run.check(has(lines, /^restore too old$/), 'dropped as too old');
  run.check(has(lines, /^alarms cancelled$/), 'its alarms cancelled');
  run.check(same(pending(lines), []), `pending ${pending(lines)}`);
  run.check(!has(lines, /^launch\+3s activity/), 'its card ended');
  run.check(!has(lines, /^phase /), 'idle');
  const prefs = await run.prefs((p) => !('cookInProgress.v3' in p));
  run.check(!('cookInProgress.v3' in prefs), 'nothing stored');
});

scenario('final-egg', 'Done, relaunched near the hour: ended at it, a later answer not taken (2.3)', async (run) => {
  await started(run, ['-uiDo', TO_DONE]);
  const was = await toDone(run);
  run.terminate();
  // A minute short of the egg's hour; the answer a second past it.
  const r = await relaunched(run, was.cooled + 3540, ['-uiDo', 'answer:runny@cooled+3601']);
  run.check(r.restore.startsWith('restore DONE'), r.restore);
  run.check(!has(r.lines, /^cook ended$/), 'still open a minute short of the hour');
  const plan = lastPlan(r.lines);
  const i = await run.step(plan.cooled + 3601);
  await run.until(/^cook ended$/, { from: i, what: 'the end at the hour' });
  const tap = await run.until(/^action answer/, { from: i, what: 'the answer after the hour' });
  await run.until(/^log 1 /, { from: run.launched, what: 'the egg logged' });
  const lines = run.sinceLaunch();
  const egg = eggLog(run.lines());
  run.check(egg?.count === 1, `one egg logged, not ${egg?.count}`);
  run.check(egg?.last.yolkWord === null, `logged unanswered: ${egg?.last.yolkWord}`);
  run.check(forecastOk(egg?.last), 'with its forecast');
  // An answer taken is stored with the cook at once (`recordFeedbackGiven`).
  const afterTap = run.lines().slice(tap.i);
  run.check(!has(afterTap, /^stored .*"feedbackGiven":true/), 'the Runny not stored');
  run.check(!lines.some((l) => /^log /.test(l.text) && /"yolkWord":"runny"/.test(l.text)), 'the Runny not logged');
});

scenario('done-as-ran', 'answered at Done, relaunched: Done shows the cook as it ran (2.4)', async (run) => {
  await started(run, ['-uiDo', `${TO_DONE},answer:runny@cooled+5`]);
  const done = await toDone(run);
  const i = await run.step(done.cooled + 5);
  await run.until(/^log 1 folded 1 /, { from: i, what: 'the answer folded' });
  const was = shown(run.lines()).at(-1);
  run.terminate();
  const r = await relaunched(run, done.cooled + 60);
  run.check(r.restore.startsWith('restore DONE'), r.restore);
  run.check(has(r.lines, /^plan .* surface true /), 'a plan on the surface');
  const peaks = shown(r.lines);
  run.check(peaks.length > 0 && peaks.every((p) => Math.abs(p - was) < 0.01), `shown ${peaks} for ${was}`);
  const planned = r.lines.map((l) => l.text.match(/planned peak ([\d.]+)/)).filter(Boolean).map((m) => Number(m[1]));
  run.note(`shown ${was} °C; planned again on the folded posterior ${planned.at(-1)} °C`);
});

scenario('slow-hob', 'never boiled: the guess lengthens, the time heated counts up, ended at two hours', async (run) => {
  const start = startOf(await started(run));
  // A millisecond past each moment the plan says it lengthens next, as a
  // clock running through them would be: core lengthens once the time
  // heated is past it, and the tick plans again from the moment itself, so
  // a clock frozen on it would plan the same plan at every tick. First
  // where the guess gives out.
  const first = lastPlan(run.lines()).next;
  let i = await run.step(first + 0.001);
  const lengthened = await run.until(/^plan .* lengthened true/, { from: i, what: 'a lengthened plan' });
  await run.settled(lengthened.i);
  // Then from 1,000 s through 1,100 s.
  i = await run.step(start + 1000);
  await run.settled((await run.until(/^plan /, { from: i, what: 'a plan at 1,000 s' })).i);
  for (let plan = lastPlan(run.lines()); plan.next !== null && plan.next <= start + 1100;) {
    i = await run.step(plan.next + 0.001);
    await run.settled((await run.until(/^plan /, { from: i, what: 'the next plan' })).i);
    const next = lastPlan(run.lines());
    if (next.next !== null && next.next <= plan.next) throw new Error(`the slow hob stuck at ${plan.next - start}`);
    plan = next;
  }
  const lines = run.lines();
  const card = lines.slice(lengthened.i).find((l) => /^activity update heating/.test(l.text));
  run.check(card && / up true /.test(card.text), `the card counts up: ${card?.text}`);
  const ends = Number(card?.text.match(/ends (\d+)/)?.[1]);
  run.check(near(ends, start + 7200, 1), `the card counts to two hours: ${ends - start}`);
  const creeping = lines.filter((l) => l.text.startsWith('plan ') && l.t >= start + 1000 && l.t <= start + 1100);
  run.check(creeping.length >= 5 && creeping.length <= 15, `${creeping.length} plans in 100 s, creeping`);
  run.note(`lengthened from ${Math.round(first - start)} s; ${creeping.length} plans in 100 s`);
  run.terminate();
  const r = await relaunched(run, start + 7150);
  run.check(r.restore.startsWith('restore HEATING'), r.restore);
  run.check(!has(r.lines, /^cook ended$/), 'still heating 50 s short of two hours');
  i = await run.step(start + 7201);
  const ended = await run.until(/^cook ended$/, { from: i, what: 'the end at two hours' });
  await run.until(/^alarms cancelled$/, { from: ended.i, what: 'its alarms cancelled' });
  await run.until(/^stored none$/, { from: ended.i, what: 'the cook cleared' });
  run.check(lastStored(run.sinceLaunch()) === null, 'nothing stored');
});

scenario('reschedule', 'relaunched while heating past the guess: the pending pull moves (1.4)', async (run) => {
  const start = startOf(await started(run));
  const was = scheduled(run.lines())['cook.pull'];
  run.terminate();
  const r = await relaunched(run, start + 652);
  run.check(r.restore.startsWith('restore HEATING'), r.restore);
  run.check(
    r.plan.lengthened && r.plan.pull > was + 30,
    `the restored pull at ${r.plan.pull - start} s for ${was - start}`,
  );
  const plan = lastPlan(r.lines);
  run.check(near(scheduled(r.lines)['cook.pull'], plan.pull, EXACT), "the pending pull is the restored plan's");
  run.check(same(sorted(pending(r.lines)), ['cook.cool', 'cook.pull']), `pending ${pending(r.lines)}`);
});

scenario('upgrade', "an earlier build's cook (cookInProgress) kept aside, its alarms left", async (run) => {
  await started(run);
  run.terminate();
  const stored = await run.prefs((p) => p['cookInProgress.v3']?.cook);
  run.check(stored['cookInProgress.v3'], 'the cook in the plist');
  // What 0.3 and 0.4 wrote, under the key they wrote: this build's cook
  // stands in for theirs, with the same alarm ids pending (a day out, on a
  // frozen clock: still pending however long the plist takes).
  run.renameKey('cookInProgress.v3', 'cookInProgress');
  run.launch();
  const kept = await run.until(/^restore kept aside cookInProgress$/, { from: run.launched, what: 'the old key kept aside' });
  // The launch's own read-back, three seconds on (AppModel.appear).
  await run.until(/^delivered /, { from: kept.i, what: 'the alarms read back' });
  const lines = run.sinceLaunch();
  run.check(!has(lines, /^alarms cancelled$/), 'its alarms not cancelled');
  run.check(same(sorted(pending(lines)), ['cook.cool', 'cook.pull']), `pending ${pending(lines)}`);
  run.check(!has(lines, /^restore (HEATING|COOKING|PULL|COOLING|DONE)/), 'idle');
  const prefs = await run.prefs((p) => Array.isArray(p['cookInProgress.unread']));
  run.check(!('cookInProgress' in prefs) && !('cookInProgress.v3' in prefs), 'the old key gone');
  run.check(prefs['cookInProgress.unread']?.length === 1, 'kept aside, once');
});

scenario('again-logs', 'Start again logs the unanswered egg before it clears the cook', async (run) => {
  await started(run, ['-uiDo', `${TO_DONE},again@cooled+5`]);
  const done = await toDone(run);
  const i = await run.step(done.cooled + 5);
  await run.until(/^stored none$/, { from: i, what: 'Start again' });
  run.terminate();
  const lines = run.lines();
  const logged = index(lines, /^log 1 /);
  run.check(logged >= 0 && logged < index(lines, /^stored none$/), 'logged before the cook was cleared');
  const egg = eggLog(lines);
  run.check(egg?.last?.yolkWord === null && forecastOk(egg?.last), 'unanswered, with its forecast');
  const prefs = await run.prefs((p) => p['calibration.v4']?.log?.length === 1 && !('cookInProgress.v3' in p));
  run.check(prefs['calibration.v4']?.log?.length === 1, 'the plist holds the egg');
  run.check(!('cookInProgress.v3' in prefs), 'and no cook');
});

// ------------------------------------- the one screen's review, on iOS

/// A hot cook out 2 s into the pull, on to Done, and the answer `-uiDo`
/// gives at the cooling's end + 5 s folded: the plan at Done and the egg
/// logged then.
async function answeredAtDone(run, uiDo) {
  await hotStarted(run, ['out@pull+2,answer:jammy@cooled+5', uiDo].filter(Boolean).join(','));
  const cooling = await toCooling(run, 2);
  let i = await run.step(cooling.cooled + 1);
  await run.until(/^phase DONE$/, { from: i, what: 'Done' });
  i = await run.step(cooling.cooled + 5);
  await run.until(/^log 1 folded 1 /, { from: i, what: 'Jammy folded' });
  return { cooling, first: eggLog(run.lines()).last };
}

scenario('start-again-corrected', 'onescreen review 1.2: Jammy at Done, the egg corrected and Start again pressed while it settles: the corrected egg logged, then the cook forgotten', async (run) => {
  const { cooling, first } = await answeredAtDone(run, 'set:size=3@cooled+10,again@cooled+12');
  const t = await tapAt(run, cooling.cooled + 10, 'set');
  const again = await tapAt(run, cooling.cooled + 12, 'again');
  const gone = await run.until(/^stored none$/, { from: again.i, what: 'the cook forgotten' });
  const lines = run.lines();
  const committed = index(lines.slice(t.i), /^edit committed /) + t.i;
  run.check(committed > again.i, 'committed by Start again, not by its settle (the host too slow to tell)');
  const egg = eggLog(lines.slice(0, gone.i)).last;
  run.check(egg.egg.mass_g !== first.egg.mass_g, `the egg logged corrected: ${first.egg.mass_g} -> ${egg.egg.mass_g} g`);
  run.check(egg.yolkWord === 'jammy', `the answer kept: ${egg.yolkWord}`);
  const prefs = await run.prefs((p) => !('cookInProgress.v3' in p) && p['calibration.v4']?.log?.[0]?.egg?.mass_g === egg.egg.mass_g);
  const kept = prefs['calibration.v4']?.log;
  run.check(kept?.length === 1 && kept[0].egg.mass_g === egg.egg.mass_g, `the plist's egg: ${kept?.[0]?.egg?.mass_g} g`);
  run.note(`the egg logged ${first.egg.mass_g} -> ${egg.egg.mass_g} g, Jammy kept, then forgotten`);
});

scenario('too-old-corrected', 'onescreen review 1.2: an answered egg corrected at Done, killed before its record was made again, relaunched too old: the corrected egg logged', async (run) => {
  // `-uiHoldAsRan YES`: the record is never made again in this launch, as if
  // the app were killed before it landed.
  const { cooling, first } = await answeredAtDone(run, '');
  run.terminate();
  await relaunched(run, cooling.cooled + 9, ['-uiHoldAsRan', 'YES', '-uiDo', 'set:size=3@cooled+10']);
  const t = await tapAt(run, cooling.cooled + 10, 'set');
  const c = await corrected(run, t.i);
  run.check(!has(run.lines().slice(t.i), /^as ran corrected$/), 'the record not made again before the kill');
  run.check(c.cook?.correctedAt_s !== null && eggLog(run.lines()).last.egg.mass_g === first.egg.mass_g, 'stored corrected, logged as it was');
  run.terminate();
  run.launch([], { at: cooling.cooled + 3700 });
  const old = await run.until(/^restore too old$/, { from: run.launched, what: 'too old' });
  const gone = await run.until(/^stored none$/, { from: old.i, what: 'the cook forgotten' });
  const egg = eggLog(run.lines().slice(0, gone.i)).last;
  run.check(egg.egg.mass_g !== first.egg.mass_g, `the egg logged corrected: ${first.egg.mass_g} -> ${egg.egg.mass_g} g`);
  run.check(egg.yolkWord === 'jammy', `the answer kept: ${egg.yolkWord}`);
  const prefs = await run.prefs((p) => !('cookInProgress.v3' in p) && p['calibration.v4']?.log?.[0]?.egg?.mass_g === egg.egg.mass_g);
  run.check(prefs['calibration.v4']?.log?.[0]?.egg.mass_g === egg.egg.mass_g, 'the plist holds the corrected egg');
  run.note(`too old: the egg logged ${first.egg.mass_g} -> ${egg.egg.mass_g} g, then forgotten`);
});


scenario('done-stays-done', 'onescreen review 2.1: on the counter, Done at the out, Jammy, then the cooling corrected to ice: still Done, nothing rung, no alarm or card brought back', async (run) => {
  await started(run, [...HOT, '-cooling', 'counter', '-uiDo', 'out@pull+2,answer:jammy@pull+60,set:cooling=ice@pull+70']);
  const plan0 = lastPlan(run.lines());
  let i = await run.step(plan0.pull + 1);
  await run.until(/^phase PULL$/, { from: i, what: 'phase PULL' });
  i = await run.step(plan0.pull + 2);
  const done = await run.until(/^phase DONE$/, { from: i, what: 'Done at the out' });
  await run.settled(done.i);
  i = await run.step(plan0.pull + 60);
  await run.until(/^log 1 folded 1 /, { from: i, what: 'Jammy folded' });
  const t = await tapAt(run, plan0.pull + 70, 'set');
  const after = await corrected(run, t.i);
  run.check(after.cook?.choices.cooling === 'ice', `the cook says ${after.cook?.choices.cooling}`);
  run.check(after.cook?.events.cooledAt_s !== null, `the cooling ended at the latest at the correction: ${after.cook?.events.cooledAt_s}`);
  // On past where an ice bath from the out would have ended.
  i = await run.step(plan0.pull + 400);
  await sleep(1000);
  const lines = run.lines().slice(t.i);
  run.check(!has(lines, /^phase COOLING$/), 'never back to Cooling');
  run.check(!has(lines, /^ring /), 'nothing rung');
  run.check(!('cook.cool' in scheduled(lines)), `no cooling alarm: ${JSON.stringify(scheduled(lines))}`);
  run.check(!has(lines, /^activity (start|update) /), 'no card brought back');
  const egg = eggLog(run.lines()).last;
  run.check(egg.yolkWord === 'jammy' && egg.cooled_s !== undefined && egg.cooled_s <= 68 + 1e-6,
    `the record: ${egg.yolkWord}, an ice bath of ${egg.cooled_s} s`);
  run.note(`Done kept; the record's ice bath ${egg.cooled_s?.toFixed?.(0)} s`);
});

scenario('answered-pull-stands', 'onescreen review 2.1: a pull the clock assumed, Jammy at Done, then cold water: the pull confirmed, nothing asked, still Done', async (run) => {
  await started(run, [...HOT, '-uiDo', 'answer:jammy@cooled+5,set:start=cold@cooled+10']);
  const plan0 = lastPlan(run.lines());
  let i = await run.step(plan0.pull + 21);
  await run.until(/^phase COOLING$/, { from: i, what: 'the grace run out' });
  await run.settled(i);
  const cooling = lastPlan(run.lines());
  i = await run.step(cooling.cooled + 1);
  await run.until(/^phase DONE$/, { from: i, what: 'Done' });
  i = await run.step(cooling.cooled + 5);
  await run.until(/^log 1 folded 1 /, { from: i, what: 'Jammy folded' });
  const t = await tapAt(run, cooling.cooled + 10, 'set');
  const after = await corrected(run, t.i);
  run.check(!after.plan.asking, 'not asked whether the eggs are still in the water');
  const pulled = after.cook?.events.pulled;
  run.check(pulled?.by === 'timeout' && pulled.confirmed, `the pull stands, confirmed: ${JSON.stringify(pulled)}`);
  run.check(!has(run.lines().slice(t.i), /^phase (HEATING|COOKING|PULL|COOLING)$/), 'still Done');
  run.note('a correction after an answer confirms the pull the clock assumed');
});

// ------------------------------------------------------------------- main

/// A new device's first launches are many seconds slow while the system
/// settles, and its notifications refused ("Source is not authorized"), or,
/// on a loaded machine, the request for them never answered: cooks started
/// until one has its alarms pending, each given two minutes, nothing
/// checked.
async function warmUp() {
  for (let attempt = 1; ; attempt += 1) {
    const warm = new Run('warm-up');
    warm.install();
    warm.launch(['-uiScreen', 'heating']);
    const hit = await warm
      .until(/^(pending cook|not scheduled)/, { timeoutS: 120, what: 'the alarms' })
      .catch(() => null);
    warm.terminate();
    if (hit?.text.startsWith('pending')) return;
    if (attempt === 5) throw new Error(`the device's alarms not working after ${attempt} launches`);
  }
}

async function main() {
  if (listOnly) {
    for (const s of scenarios) console.log(`${s.name.padEnd(24)} ${s.about}`);
    return;
  }
  const matches = (name) =>
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
        run.failures.push(`threw: ${e.message}`);
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
        if (process.env.AET_E2E_LOG) {
          console.log(run.lines().map((l) => `        | ${l.t} ${l.text.slice(0, 200)}`).join('\n'));
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
