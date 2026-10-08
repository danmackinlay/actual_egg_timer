// `npm run ios:e2e`: the checks agents kept doing by hand on the simulator,
// scripted. A Debug build on a simulator of the script's own, the app's clock
// run fast (`-clockSpeed`, ios/App/AppClock.swift), taps by launch argument
// (`-uiDo`, ios/App/Screenshots.swift), and what happened read from the app's
// debug log (`Library/Caches/aet.log`) and its stored state (the prefs plist,
// through plistlib). The device is deleted at the end.
//
//   npm run ios:e2e                      every scenario
//   npm run ios:e2e -- cold relaunch-*   those named (a trailing * matches)
//   npm run ios:e2e -- --list            the names
//   --no-build    use the last build in ios/build/e2e
//   --device <udid>, --keep              a device already booted; keep it
//
// Needs Xcode, xcodegen and python3; not in `npm run verify`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const BUNDLE = 'name.danmackinlay.actualeggtimer';
const DERIVED = 'build/e2e';
const APP = `ios/${DERIVED}/Build/Products/Debug-iphonesimulator/Actual Egg Timer.app`;
/// Cook seconds per second: an eleven-minute cook in about eleven seconds.
const SPEED = 60;

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
  const types = list.devicetypes.filter((t) => t.productFamily === 'iPhone');
  const type = types.find((t) => t.name === 'iPhone 17 Pro') ?? types.at(-1);
  const id = simctl('create', `AET e2e ${process.pid}`, type.identifier, runtime.identifier);
  console.log(`ios:e2e: device ${id} (${type.name}, iOS ${runtime.version})`);
  simctl('boot', id);
  simctl('bootstatus', id, '-b');
  return id;
}

// ------------------------------------------------------------- the app's run

/// One scenario's run of the app: its clock, its launches, its log.
class Run {
  constructor(name) {
    this.name = name;
    this.failures = [];
    this.notes = [];
    // The clock every launch of this run passes: cook time is
    // epoch + SPEED * (now - epoch) + offset.
    this.epoch = Date.now() / 1000;
    this.offset = 0;
    this.speed = SPEED;
  }

  /// Now in cook time, epoch s.
  appNow() {
    return this.epoch + this.speed * (Date.now() / 1000 - this.epoch) + this.offset;
  }

  /// A fresh install, nothing stored.
  install() {
    quietly(() => simctl('terminate', udid, BUNDLE));
    quietly(() => simctl('uninstall', udid, BUNDLE));
    simctl('install', udid, APP);
    this.data = simctl('get_app_container', udid, BUNDLE, 'data');
  }

  /// Launch with the run's clock and these arguments; quiet notifications
  /// granted with no prompt unless asked otherwise.
  launch(args = [], { alarms = true } = {}) {
    const clock = [
      '-clockSpeed', String(this.speed), '-clockEpoch', String(this.epoch), '-clockOffset', String(this.offset),
    ];
    const prompt = alarms ? ['-provisionalAlarms', 'YES'] : ['-noAlarmPrompt', 'YES'];
    this.launched = this.lines().length;
    simctl('launch', udid, BUNDLE, ...clock, ...prompt, ...args);
  }

  terminate() {
    quietly(() => simctl('terminate', udid, BUNDLE));
  }

  /// The debug log so far: { t (cook time, s), text }.
  lines() {
    const path = `${this.data}/Library/Caches/aet.log`;
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('AET '))
      .map((l) => {
        const m = l.match(/^AET (\d+) (.*)$/);
        return { t: Number(m[1]), text: m[2] };
      });
  }

  /// The lines since the last launch.
  sinceLaunch() {
    return this.lines().slice(this.launched);
  }

  /// Wait for a line matching `re` (after `from`, a line count), or fail.
  async until(re, { timeoutS = 30, from = 0, what = String(re) } = {}) {
    const end = Date.now() + timeoutS * 1000;
    while (Date.now() < end) {
      const hit = this.lines().slice(from).find((l) => re.test(l.text));
      if (hit) return hit;
      await sleep(100);
    }
    throw new Error(`timed out waiting for ${what}`);
  }

  /// Wait for a phase to be logged since the last launch.
  phase(name, opts = {}) {
    return this.until(new RegExp(`^phase ${name}$`), { from: this.launched, what: `phase ${name}`, ...opts });
  }

  /// Run the clock at another speed from now on, carrying on from the cook
  /// time it reads now. Takes effect at the next launch.
  setSpeed(speed) {
    const now = Date.now() / 1000;
    this.offset = this.appNow() - now;
    this.epoch = now;
    this.speed = speed;
  }

  /// Move the clock on by `s` of cook time, as a phone asleep that long.
  /// Takes effect at the next launch.
  jump(s) {
    this.offset += s;
  }

  /// Wait until cook time reaches `t`.
  async untilApp(t) {
    const wait = ((t - this.appNow()) / this.speed) * 1000;
    if (wait > 0) await sleep(wait);
  }

  /// The prefs plist as JSON, each data value that is JSON parsed; waits
  /// until `ready(prefs)` holds, since the file lags the app by seconds.
  async prefs(ready = () => true, timeoutS = 15) {
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

/// The last plan logged in these lines: { pull, cooled, lengthened, surface }.
function lastPlan(lines) {
  const l = lines.filter((x) => x.text.startsWith('plan ')).at(-1);
  if (!l) return null;
  const m = l.text.match(/^plan pull (\d+) cooled (\d+|-) lengthened (\w+) surface (\w+)$/);
  return {
    pull: Number(m[1]), cooled: m[2] === '-' ? null : Number(m[2]),
    lengthened: m[3] === 'true', surface: m[4] === 'true', t: l.t,
  };
}

/// The last cook stored in these lines, or null for none; undefined if
/// nothing was stored.
function lastStored(lines) {
  const l = lines.filter((x) => x.text.startsWith('stored ')).at(-1);
  if (!l) return undefined;
  return l.text === 'stored none' ? null : JSON.parse(l.text.slice('stored '.length));
}

/// The notifications as last scheduled, cancelled and scheduled again:
/// { 'cook.pull': t, 'cook.cool': t } in cook time.
function scheduled(lines) {
  let now = {};
  for (const l of lines) {
    if (l.text === 'alarms cancelled') now = {};
    const m = l.text.match(/^scheduled (\S+) at (\d+)/);
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

/// The egg log as last written: { count, last }.
function eggLog(lines) {
  const l = lines.filter((x) => x.text.startsWith('log ')).at(-1);
  if (!l) return null;
  const m = l.text.match(/^log (\d+) folded (\d+) last (.*)$/);
  return { count: Number(m[1]), folded: Number(m[2]), last: m[3] === '-' ? null : JSON.parse(m[3]), t: l.t };
}

const near = (a, b, tol = 2) => a !== null && b !== null && Math.abs(a - b) <= tol;
const has = (lines, re) => lines.some((l) => re.test(l.text));

/// A record made with its forecast, as the fit needs it.
const forecastOk = (r) => Array.isArray(r?.forecast?.yolk) && r.forecast.yolk.length === 3;

// --------------------------------------------------------------- scenarios

const scenarios = [];
const scenario = (name, about, body) => scenarios.push({ name, about, body });

/// Start a cook and wait for its first plan on its surface; the cook as
/// stored then.
async function started(run, args = [], opts = {}) {
  run.launch(['-uiScreen', 'heating', ...args], opts);
  await run.until(/^stored /, { from: run.launched, what: 'a cook stored' });
  return lastStored(run.sinceLaunch());
}

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
const sorted = (a) => (a ? [...a].sort() : a);

/// A hot start: the planner's stored inputs, which load only with a level.
const HOT = ['-doneness', '0.41', '-altitudeM', '0', '-waterLitres', '2', '-eggCount', '2', '-start', 'hot'];
/// A cold cook's taps to Done: the boil at 5:00, out 3 s into the pull.
const TO_DONE = 'boil@300,out@pull+3';

/// The cook's start, epoch s, cook time.
const startOf = (stored) => stored.cook.startedAt_s;

/// Launch again: the restore line, the restored plan, and the lines once the
/// alarms have been scheduled and read back.
async function relaunched(run, args = [], opts = {}) {
  run.launch(args, opts);
  const restore = await run.until(/^restore /, { from: run.launched, what: 'the restore' });
  await run.until(/^pending /, { from: run.launched, what: 'the alarms read back', timeoutS: 15 });
  await sleep(300);
  const lines = run.sinceLaunch();
  return { restore: restore.text, plan: lastPlan(before(lines, /^pending /)), lines };
}

scenario('cold', 'a cold cook: boil, pull, cooling, Done, an answer, Start again', async (run) => {
  const cook = await started(run, ['-uiDo', `${TO_DONE},answer:jammy@cooled+20,again@cooled+40`]);
  const start = startOf(cook);
  await run.until(/^stored none$/, { timeoutS: 60, what: 'Start again' });
  await run.until(/^log 1 folded 1 /, { timeoutS: 20, what: 'the fold' });
  const lines = run.lines();
  run.check(same(phases(lines), ['HEATING', 'COOKING', 'PULL', 'COOLING', 'DONE']), `phases ${phases(lines)}`);
  const last = lastStored(before(lines, /^stored none$/)).cook;
  run.check(near(last.events.boilAt_s, start + 300, 3), `boil at ${last.events.boilAt_s - start}`);
  run.check(last.events.pulled?.by === 'cook', `pulled by ${last.events.pulled?.by}`);
  run.check(near(last.events.pulled.out_s - last.events.pulled.due_s, 3, 2), 'out 3 s into the pull');
  run.check(last.events.cooledAt_s !== null, 'the cooling ended');
  // The alarms set when the boil was tapped are that plan's.
  const cooking = before(lines, /^phase PULL$/);
  const plan = lastPlan(cooking);
  const alarms = scheduled(cooking);
  run.check(
    near(alarms['cook.pull'], plan.pull, 1) && near(alarms['cook.cool'], plan.cooled, 1),
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
  await run.until(/^stored none$/, { timeoutS: 60, what: 'Start again' });
  const lines = run.lines();
  run.check(same(phases(lines), ['COOKING', 'PULL', 'COOLING', 'DONE']), `phases ${phases(lines)}`);
  const egg = eggLog(lines);
  run.check(egg?.count === 1 && egg.last.yolkWord === null, 'one egg logged, unanswered');
  run.check(forecastOk(egg?.last), 'with its forecast');
  run.check(egg?.last.setup.startMode === 'hot', 'a hot start recorded');
});

scenario('cancel', 'Cancel while heating: nothing stored, the alarms and the card gone', async (run) => {
  await started(run, ['-uiDo', 'cancel@120']);
  await run.until(/^cook ended$/, { what: 'the cancel' });
  await sleep(500);
  const lines = run.lines();
  run.check(has(lines.slice(index(lines, /^cook ended$/)), /^alarms cancelled$/), 'the alarms cancelled');
  run.check(lastStored(lines) === null, 'nothing stored');
  run.check((eggLog(lines)?.count ?? 0) === 0, 'no egg logged');
  run.terminate();
  run.launch();
  await run.until(/^pending /, { from: run.launched, what: 'the alarms read back', timeoutS: 10 });
  const after = run.sinceLaunch();
  run.check(!has(after, /^restore /), 'idle at the relaunch');
  run.check(!has(after, /activity/), 'no card');
  run.check(same(pending(after), []), `pending ${pending(after)}`);
});

scenario('relaunch-heating', 'a relaunch while heating: the same deadlines and alarms', async (run) => {
  const start = startOf(await started(run));
  await run.until(/^pending /, { what: 'the alarms' });
  await run.untilApp(start + 120);
  const was = lastPlan(run.lines());
  run.terminate();
  const r = await relaunched(run);
  run.check(r.restore.startsWith('restore HEATING'), r.restore);
  run.check(
    near(r.plan.pull, was.pull, 1) && near(r.plan.cooled, was.cooled, 1),
    `deadlines ${r.plan.pull}, ${r.plan.cooled} for ${was.pull}, ${was.cooled}`,
  );
  run.check(near(scheduled(r.lines)['cook.pull'], was.pull, 1), 'the pull scheduled again, at the same time');
  run.check(same(sorted(pending(r.lines)), ['cook.cool', 'cook.pull']), `pending ${pending(r.lines)}`);
  run.check(has(r.lines, /^activity start heating/), 'the card again');
});

scenario('relaunch-cooking', 'a relaunch while cooking: the same deadlines and alarms', async (run) => {
  await started(run, ['-uiDo', 'boil@300']);
  const cooking = await run.phase('COOKING');
  await run.untilApp(cooking.t + 60);
  const was = lastPlan(run.lines());
  const boil = lastStored(run.lines()).cook.events.boilAt_s;
  run.terminate();
  const r = await relaunched(run);
  run.check(r.restore.startsWith('restore COOKING'), r.restore);
  run.check(
    near(r.plan.pull, was.pull, 1) && near(r.plan.cooled, was.cooled, 1),
    `deadlines ${r.plan.pull}, ${r.plan.cooled} for ${was.pull}, ${was.cooled}`,
  );
  run.check(lastStored(r.lines)?.cook.events.boilAt_s === boil, 'the boil kept to the bit');
  run.check(same(sorted(pending(r.lines)), ['cook.cool', 'cook.pull']), `pending ${pending(r.lines)}`);
});

scenario('relaunch-pull', 'killed in the pull and relaunched in it (×10 there): out after', async (run) => {
  await started(run, ['-uiDo', 'boil@300']);
  await run.phase('COOKING');
  const was = lastPlan(run.lines());
  await run.untilApp(was.pull - 30);
  // The 20-s pull is a third of a second at ×60: on from here at ×10.
  run.terminate();
  run.setSpeed(10);
  run.launch();
  await run.phase('PULL', { timeoutS: 10 });
  await run.untilApp(was.pull + 4);
  run.terminate();
  const r = await relaunched(run, ['-uiDo', 'out@pull+15']);
  run.check(r.restore.startsWith('restore PULL'), r.restore);
  run.check(near(r.plan.pull, was.pull, 1), `the pull ${r.plan.pull} for ${was.pull}`);
  await run.until(/^action out/, { from: run.launched, what: 'the tap out' });
  await run.phase('COOLING', { timeoutS: 10 });
  const after = run.sinceLaunch();
  const out = lastStored(after).cook.events.pulled;
  run.check(out?.by === 'cook', `pulled by ${out?.by}`);
  run.check(!has(after, /^ring pull/), 'the pull not rung again');
  run.note(`relaunched ${r.lines[0].t - was.pull} s into the pull`);
});

scenario('relaunch-cooling', 'a relaunch while cooling: the same end, one alarm left', async (run) => {
  await started(run, ['-uiDo', TO_DONE]);
  const cooling = await run.phase('COOLING', { timeoutS: 40 });
  await run.untilApp(cooling.t + 60);
  const was = lastPlan(run.lines());
  run.terminate();
  const r = await relaunched(run);
  run.check(r.restore.startsWith('restore COOLING'), r.restore);
  run.check(near(r.plan.cooled, was.cooled, 1), `the cooling's end ${r.plan.cooled} for ${was.cooled}`);
  run.check(same(pending(r.lines), ['cook.cool']), `pending ${pending(r.lines)}`);
  run.check(has(r.lines, /^activity start cooling/), 'the card again');
});

scenario('relaunch-done', 'a relaunch at Done: Done again, nothing pending, no card', async (run) => {
  await started(run, ['-uiDo', TO_DONE]);
  const done = await run.phase('DONE', { timeoutS: 50 });
  const was = lastPlan(run.lines());
  await run.untilApp(done.t + 30);
  run.terminate();
  const r = await relaunched(run);
  run.check(r.restore.startsWith('restore DONE'), r.restore);
  run.check(near(r.plan.cooled, was.cooled, 1), `the cooling's end ${r.plan.cooled} for ${was.cooled}`);
  run.check(same(pending(r.lines), []), `pending ${pending(r.lines)}`);
  run.check(!has(r.lines, /^activity start/), 'no card started');
  await sleep(1000);
  run.check(!has(run.sinceLaunch(), /^ring /), 'nothing rung again');
});

scenario('asleep', 'the app not running through the pull, relaunched past it', async (run) => {
  await started(run, ['-uiDo', 'boil@300']);
  await run.phase('COOKING');
  await run.until(/^pending cook/, { from: index(run.lines(), /^phase COOKING$/), what: 'the alarms' });
  const was = lastPlan(run.lines());
  await run.untilApp(was.pull - 60);
  run.terminate();
  await run.untilApp(was.pull + 60);
  const r = await relaunched(run);
  run.check(r.restore === 'restore COOLING events written true', r.restore);
  const cook = lastStored(r.lines)?.cook;
  run.check(cook?.events.pulled?.by === 'timeout', `pulled by ${cook?.events.pulled?.by}`);
  run.check(near(cook?.events.pulled?.out_s, was.pull + 20, 1), "out at the grace's end");
  run.check(same(pending(r.lines), ['cook.cool']), `pending ${pending(r.lines)} (the pull's was delivered)`);
  await run.phase('DONE', { timeoutS: 30 });
  run.check(!has(run.sinceLaunch(), /^ring /), 'nothing rung by the app: the notifications rang');
});

scenario('too-old', 'relaunched three hours on: ended, its alarms and card gone (2.2)', async (run) => {
  await started(run);
  await run.until(/^pending cook/, { what: 'the alarms' });
  run.terminate();
  run.jump(3 * 3600);
  run.launch();
  await run.until(/^restore /, { from: run.launched, what: 'the restore' });
  // The launch's own read-back, three seconds on.
  await sleep(4000);
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
  await run.phase('DONE', { timeoutS: 50 });
  const was = lastPlan(run.lines());
  run.terminate();
  // A launch takes about half a second, half a minute at ×60: a minute
  // short of the hour, and the answer two seconds after, a minute past it.
  run.jump(was.cooled + 3540 - run.appNow());
  run.launch(['-uiAnswer', 'runny', '-uiAnswerAfter', '2']);
  await run.until(/^restore /, { from: run.launched, what: 'the restore' });
  await run.until(/^cook ended$/, { from: run.launched, what: 'the end at the hour', timeoutS: 10 });
  await sleep(2500);
  const lines = run.sinceLaunch();
  run.check(has(lines, /^restore DONE/), 'restored at Done');
  const egg = eggLog(run.lines());
  run.check(egg?.count === 1, `one egg logged, not ${egg?.count}`);
  run.check(egg?.last.yolkWord === null, `logged unanswered: ${egg?.last.yolkWord}`);
  run.check(forecastOk(egg?.last), 'with its forecast');
  run.check(!lines.some((l) => /^log /.test(l.text) && /"yolkWord":"runny"/.test(l.text)), 'the Runny not taken');
});

scenario('done-as-ran', 'answered at Done, relaunched: Done shows the cook as it ran (2.4)', async (run) => {
  await started(run, ['-uiDo', `${TO_DONE},answer:runny@cooled+5`]);
  await run.until(/^log 1 folded 1 /, { timeoutS: 60, what: 'the answer folded' });
  const was = shown(run.lines()).at(-1);
  run.terminate();
  run.launch();
  await run.until(/^restore DONE/, { from: run.launched, what: 'the restore at Done' });
  await run.until(/^plan .* surface true$/, { from: run.launched, what: 'a plan on the surface', timeoutS: 20 });
  await sleep(500);
  const lines = run.sinceLaunch();
  const peaks = shown(lines);
  run.check(peaks.length > 0 && peaks.every((p) => Math.abs(p - was) < 0.01), `shown ${peaks} for ${was}`);
  const planned = lines.map((l) => l.text.match(/planned peak ([\d.]+)/)).filter(Boolean).map((m) => Number(m[1]));
  run.note(`shown ${was} °C; planned again on the folded posterior ${planned.at(-1)} °C`);
});

scenario('slow-hob', 'never boiled: the guess lengthens, the time heated counts up, ended at two hours', async (run) => {
  const start = startOf(await started(run));
  const first = await run.until(/^plan .* lengthened true/, { timeoutS: 40, what: 'a lengthened plan' });
  await run.untilApp(start + 1100);
  const lines = run.lines();
  const card = lines.slice(index(lines, /lengthened true/)).find((l) => /^activity update heating/.test(l.text));
  run.check(card && / up true$/.test(card.text), `the card counts up: ${card?.text}`);
  const ends = Number(card?.text.match(/ends (\d+)/)?.[1]);
  run.check(near(ends, start + 7200, 2), `the card counts to two hours: ${ends - start}`);
  const creeping = lines.filter((l) => l.text.startsWith('plan ') && l.t >= start + 1000 && l.t <= start + 1100);
  run.check(creeping.length >= 5 && creeping.length <= 15, `${creeping.length} plans in 100 s, creeping`);
  run.note(`lengthened from ${Math.round(first.t - start)} s`);
  run.terminate();
  run.jump(start + 7150 - run.appNow());
  run.launch();
  await run.until(/^restore HEATING/, { from: run.launched, what: 'the restore' });
  await run.until(/^cook ended$/, { from: run.launched, what: 'the end at two hours', timeoutS: 10 });
  const after = run.sinceLaunch();
  run.check(has(after.slice(index(after, /^cook ended$/)), /^alarms cancelled$/), 'its alarms cancelled');
  run.check(lastStored(after) === null, 'nothing stored');
});

scenario('reschedule', 'relaunched while heating past the guess: the pending pull moves (1.4)', async (run) => {
  const start = startOf(await started(run));
  await run.until(/^pending cook/, { what: 'the alarms' });
  const was = scheduled(run.lines())['cook.pull'];
  run.terminate();
  run.jump(start + 652 - run.appNow());
  const r = await relaunched(run);
  run.check(r.restore.startsWith('restore HEATING'), r.restore);
  run.check(
    r.plan.lengthened && r.plan.pull > was + 30,
    `the restored pull at ${r.plan.pull - start} s for ${was - start}`,
  );
  run.check(near(scheduled(r.lines)['cook.pull'], r.plan.pull, 1), "the pending pull is the restored plan's");
  run.check(same(sorted(pending(r.lines)), ['cook.cool', 'cook.pull']), `pending ${pending(r.lines)}`);
});

scenario('upgrade', "an earlier build's cook (cookInProgress) kept aside, its alarms left", async (run) => {
  // At ×10, so its alarms are still pending after the seconds the plist
  // takes to catch up.
  run.speed = 10;
  await started(run);
  await run.until(/^pending cook/, { what: 'the alarms' });
  run.terminate();
  const stored = await run.prefs((p) => p['cookInProgress.v3']?.cook);
  run.check(stored['cookInProgress.v3'], 'the cook in the plist');
  // What 0.3 and 0.4 wrote, under the key they wrote: this build's cook
  // stands in for theirs, with the same alarm ids pending.
  run.renameKey('cookInProgress.v3', 'cookInProgress');
  run.launch();
  await run.until(/^restore kept aside cookInProgress$/, { from: run.launched, what: 'the old key kept aside' });
  await run.until(/^pending /, { from: run.launched, timeoutS: 10, what: 'the alarms read back' });
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
  await run.until(/^action again/, { timeoutS: 60, what: 'Start again' });
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

// ------------------------------------------------------------------- main

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
  // A new device's first launch is seconds slow while the system settles,
  // minutes of cook at ×60: one launch first, nothing checked.
  const warm = new Run('warm-up');
  warm.install();
  warm.launch();
  await warm.until(/^pending /, { timeoutS: 60 }).catch(() => null);
  warm.terminate();
  let failed = 0;
  try {
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
