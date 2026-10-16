// `npm run ios:e2e`: what only a device can check, scripted: the screen's
// layout, a relaunch over the system's notifications and Live Activity, a
// notification delivered while the app is gone, the app leaving the screen,
// the keys an earlier build left, Help's sources in the bundle. What the
// app's logic decides is `swift test`'s
// (ios/EggTimerCore/Tests/EggTimerAppTests).
//
// A Debug build on a simulator of the script's own, the app's clock frozen
// at each moment a scenario checks and stepped from one to the next
// (`-clockAt`, `-clockSpeed 0`, `Library/Caches/aet.clock`; AppClock.swift
// in ios/EggTimerCore/Sources/EggTimerApp), taps by launch argument (`-uiDo`,
// Screenshots.swift there), and what happened read from the app's debug log
// (`Library/Caches/aet.log`, an event a line, each a JSON object:
// `Screenshots.Event`) and its stored state (the prefs plist, through
// plistlib). After every step the script waits until the app says it has
// caught up (`idle`), so what it checks next, that something happened or
// that it did not, is checked once the app is done. Nothing is timed
// against the host's clock but one notification left to the system
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
// the app in that locale rather than en-AU (`localeArgs`).
//
// Needs Xcode, xcodegen and python3; not in `npm run verify`.
import { existsSync } from 'node:fs';

import { type CookEntry, type CookStart, type RunningCook, foldCook } from '../src/core/running.ts';
import type { BoilMemory } from '../src/core/boil.ts';
import type { Units } from '../src/core/record.ts';
import {
  APP, COOK, type Event, type EventOf, type Found, type LaunchOptions, Run, SETTINGS, WAIT_S, build, iosStore,
  createDevice, is, lastOf, quietly, simctl, sleep,
} from './iosHarness.ts';

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

/// The device the scenarios run on: given, or made (`createDevice`).
let udid = given ?? '';

// ----------------------------------------------------------- reading the log

/// The format the app stores its cook in (StoreRegistry.swift).
const COOK_FORMAT = iosStore('cook').format;

/// The cook as the app stores it (StoredCook.swift): what was fixed at the
/// press, the start and the log, folded again by core's `foldCook`, and
/// beside it whether the egg was answered and the lean last decided.
interface Stored { cook: RunningCook; answers: string; leanHint_s: number }

/// A stored cook as the log or the plist has it, read as the app wrote it,
/// in its format; null if it is not one. Trusted, not checked field by
/// field: what the app takes back is EggTimerAppTests'.
function storedOf(raw: unknown): Stored | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as { v?: unknown; cook?: unknown; answers?: unknown; leanHint_s?: unknown };
  if (o.v !== COOK_FORMAT || o.cook === null || typeof o.cook !== 'object') return null;
  const c = o.cook as {
    id_ms: number; nudge_s: number; boilMemory: BoilMemory; units: Units; lang: string; start: CookStart;
    log: CookEntry[];
  };
  return {
    cook: foldCook(c.id_ms, c.start, c.nudge_s, c.boilMemory, c.units, c.lang, c.log),
    answers: String(o.answers), leanHint_s: Number(o.leanHint_s),
  };
}

/// A plan as the checks read it: { pull, cooled, lengthened, surface, next
/// (when the slow hob lengthens it next), asking (whether the eggs are still
/// in the water), overdue }, epoch s, exact; cooled and next null for none.
type Plan = Omit<EventOf<'plan'>, 'cooled' | 'next'> & { cooled: number | null; next: number | null };

/// The last plan logged in these lines, which there must be.
function planIn(lines: Event[]): Plan {
  const l = lastOf(lines, 'plan');
  if (!l) throw new Error('no plan logged');
  return { ...l, cooled: l.cooled ?? null, next: l.next ?? null };
}

/// The last cook stored in these lines, or null for none; undefined if
/// nothing was stored.
function lastStored(lines: Event[]): Stored | null | undefined {
  const l = lastOf(lines, 'stored');
  return l ? (l.value === undefined ? null : storedOf(l.value)) : undefined;
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
/// A stored cook picked up at launch, or dropped as too old.
const restoring = (e: Event): e is EventOf<'restore' | 'restoreTooOld'> => e.ev === 'restore' || e.ev === 'restoreTooOld';
/// Whether a restore picked the cook up, in this phase.
const restoredIn = (e: Event, phase: string): boolean => e.ev === 'restore' && e.phase === phase;
/// The cook cleared from the store.
const storedNone = is('stored', (e) => e.value === undefined);
/// The cook stored, as `test` holds of it as the store holds it.
const storedAs = (test: (s: Stored) => boolean): ((e: Event) => e is EventOf<'stored'>) =>
  is('stored', (e) => { const s = e.value === undefined ? null : storedOf(e.value); return s !== null && test(s); });

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
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const sorted = (a: string[] | null): string[] | null => (a ? [...a].sort() : a);

/// The settings as stored, in the app's format, given at launch: what is not
/// given is the default. A launch argument whose value is `<hex>` is data to
/// UserDefaults, as the app stores the value.
function settingsArg(over: Record<string, unknown>): string[] {
  const text = JSON.stringify({ v: iosStore('settings').format, ...over });
  return [`-${SETTINGS}`, `<${Buffer.from(text, 'utf8').toString('hex')}>`];
}
/// A hot start's settings.
const HOT_SETTINGS = { doneness: 0.41, altitude_m: 0, waterLitres: 2, eggCount: 2, startMode: 'hot' };
const HOT = settingsArg(HOT_SETTINGS);
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

/// Step to 5:00, where `-uiDo boil@300` taps Rolling boil: the plan
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
): Promise<{ restore: Found<EventOf<'restore' | 'restoreTooOld'>>; plan: Plan; lines: Event[] }> {
  run.launch(args, { ...opts, at });
  const restore = await run.until(restoring, { from: run.launched, what: 'the restore' });
  const restored = await run.until(is('restored'), { from: restore.i, what: 'the alarms and the card set again' });
  const phase = await run.until(is('phase'), { from: restore.i, what: 'the first tick' });
  await run.settled(Math.max(restored.i, phase.i));
  const lines = run.sinceLaunch();
  return { restore, plan: planIn(before(lines, is('pending'))), lines };
}

/// The parts of the screen whose place is logged (ContentView.logTop).
const PARTS = ['action', 'main', 'slider', 'sentence', 'egg'] as const;
type Part = typeof PARTS[number];
/// The parts under the action, which its buttons coming and going never move.
const BELOW = ['slider', 'sentence', 'egg'] as const;
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

/// Launch idle on a fresh install and wait for the time decided on its pot's
/// surface and its odds, and the screen still.
async function idle(run: Run, args: string[] = []): Promise<Layout> {
  run.launch(args);
  await run.until(is('answer', (e) => e.decided && e.odds), { from: run.launched, what: 'the idle time decided' });
  return stillLayout(run);
}

/// The action directly under the time, above the slider (UI.md section 3).
function actionAbove(run: Run, l: Layout, when: string): void {
  run.check(l.action != null && l.slider != null && l.action < l.slider,
    `${when}: the action not above the slider: action ${l.action}, slider ${l.slider}`);
}

/// Under the action's row, at the default text size where it is one row,
/// nothing empty: the slider the stack's spacing (22 pt) under the main
/// button's foot.
function nothingEmpty(run: Run, l: Layout, when: string): void {
  run.check(l.main != null && l.slider != null && near(l.slider - l.main, 22, 1),
    `${when}: ${num(l.slider) - num(l.main) - 22} pt empty under the row (main button's foot ${l.main}, slider ${l.slider})`);
}

scenario('one-layout', 'one layout from idle to Done; the action under the time in one row, nothing empty under it, nothing below it moving in any phase', async (run) => {
  await oneLayout(run, [], false);
});

scenario('one-layout-largest', 'the same at the largest text size, in 1750, where the row stacks: nothing below it moves in any phase', async (run) => {
  await oneLayout(run, [
    '-UIPreferredContentSizeCategoryName', 'UICTContentSizeCategoryAccessibilityXXXL', '-uiLanguage', 'en-x-1750',
  ], true);
});

/// One layout from idle to Done, launched with `args`: the action above the
/// slider, and nothing under it moving in any phase; where the row is not
/// `stacked`, nothing empty under it.
async function oneLayout(run: Run, args: string[], stacked: boolean): Promise<void> {
  const before = await idle(run, [...args, '-uiDo', `eggsIn@launch+1,${TO_DONE}`]);
  const nothingEmptyUnless = (l: Layout, when: string): void => {
    if (!stacked) nothingEmpty(run, l, when);
  };
  for (const part of PARTS) run.check(part in before, `idle: no ${part}`);
  actionAbove(run, before, 'idle');
  nothingEmptyUnless(before, 'idle');
  let i = await run.step(run.t0 + 1);
  const heating = await run.until(phaseIs('HEATING'), { from: i, what: 'phase HEATING' });
  await run.settled(heating.i);
  const after = await stillLayout(run);
  // At the default size the readout is one height idle and heating, so
  // nothing moves at all; at the largest its line can wrap again.
  if (!stacked) run.check(near(after.action, before.action, 2), `the action moved at the start: ${before.action} -> ${after.action}`);
  for (const part of BELOW) {
    const was = num(before[part]) - num(before.action);
    const is = num(after[part]) - num(after.action);
    run.check(near(is, was, 2), `${part} moved under the action at the start: ${was} -> ${is} pt`);
  }
  nothingEmptyUnless(after, 'Heating');
  // Boiled at 5:00 (from the start, a second after the launch), out 3 s
  // into the pull, and on to Done: the parts in every phase, and the
  // slider, the sentence and the egg never anywhere else.
  run.t0 += 1;
  await toDone(run);
  const done = await stillLayout(run);
  for (const part of PARTS) run.check(part in done, `Done: no ${part}`);
  actionAbove(run, done, 'Done');
  nothingEmptyUnless(done, 'Done');
  // Each frame's places, as the log gives them a frame at a time: what is
  // under the action as far under its top as at idle. The action itself
  // follows the readout, which at the largest sizes is not one height in
  // every phase.
  const now: Layout = { ...before };
  const moved: string[] = [];
  const lines = run.lines().slice(heating.i);
  lines.forEach((e, k) => {
    if (e.ev === 'layout') now[e.part as Part] = e.y;
    const next = lines[k + 1];
    if (next !== undefined && next.t === e.t) return;
    for (const part of BELOW) {
      const was = num(before[part]) - num(before.action);
      const is = num(now[part]) - num(now.action);
      if (!near(is, was, 2)) moved.push(`${part} ${was} -> ${is} pt under the action at ${e.t}`);
    }
  });
  run.check(moved.length === 0, `moved under the action: ${moved.slice(0, 6).join('; ')}`);
  const phasesSeen = phases(run.lines());
  run.check(same(phasesSeen, ['HEATING', 'COOKING', 'PULL', 'COOLING', 'DONE']), `phases ${phasesSeen}`);
  run.note(`action ${before.action}, main button's foot ${before.main}, slider ${before.slider}, sentence ${before.sentence}, egg ${before.egg} pt, idle to Done`);
}

/// The level moved, idle, from one where "Most likely" shows under the
/// certainty word to one where it does not and back, a word asked very
/// certain to a ballpark: the slider never moves (UI.md section 8, "Nothing
/// jumps"). On a fresh install 0.5 and 0.8 show it, 0.6 and 0.9 do not.
/// Where the bracket's heavy stretch lies is the app's tests' (ScreenTests).
async function likelyStill(run: Run, args: string[]): Promise<void> {
  const levels = [0.5, 0.6, 0.8, 0.9];
  const uiDo = levels.map((l, k) => `set:level=${l}@launch+${k + 1}`).join(',');
  const first = await idle(run, [...args, ...settingsArg({ doneness: 0.6 }), '-uiDo', uiDo]);
  const seen = [];
  for (let k = 0; k < levels.length; k += 1) {
    const i = await run.step(run.t0 + k + 1);
    const set = await run.until(tapped('set'), { from: i, what: `the level set to ${levels[k]}` });
    await run.until(is('answer', (e) => e.decided && e.odds), { from: set.i, what: 'decided' });
    const lines = await screen(run);
    const level = levels[k]!;
    const likely = lastOf(lines, 'likely')?.shown === true;
    seen.push({ level: level, likely: likely, slider: layoutOf(lines).slider });
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

/// Step to `at`, where a `-uiDo` tap is due, and wait for it: its line.
async function tapAt(run: Run, at: number, what: string, opts: { idle?: boolean } = {}): Promise<Found<EventOf<'action'>>> {
  const i = await run.step(at, opts);
  return run.until(tapped(what), { from: i, what: `the tap ${what}` });
}

scenario('relaunch-heating-cooking', 'relaunched while heating, then while cooking: the same deadlines, alarms and card, the boil kept to the bit', async (run) => {
  const start = startOf(await started(run));
  await run.step(start + 120);
  let was = planIn(run.lines());
  run.terminate();
  let r = await relaunched(run, start + 120, ['-uiDo', 'boil@300']);
  run.check(restoredIn(r.restore, 'HEATING'), say(r.restore));
  const deadlines = (): void => run.check(
    near(r.plan.pull, was.pull, REPLAN) && near(r.plan.cooled, was.cooled, REPLAN),
    `deadlines ${r.plan.pull}, ${r.plan.cooled} for ${was.pull}, ${was.cooled}`,
  );
  deadlines();
  run.check(near(scheduled(r.lines)['cook.pull'], planIn(r.lines).pull, EXACT), 'the pull scheduled again, at the plan’s time');
  run.check(same(sorted(pending(r.lines)), ['cook.cool', 'cook.pull']), `pending ${pending(r.lines)}`);
  run.check(has(r.lines, is('activity', (e) => e.what === 'start' && e.stage === 'heating')), 'the card again');
  was = await boiled(run);
  const boil = storedIn(run.lines()).cook.events.boilAt_s;
  run.check(boil === start + 300, `boiled at +${num(boil) - start} s`);
  await run.step(start + 360);
  run.terminate();
  r = await relaunched(run, start + 360);
  run.check(restoredIn(r.restore, 'COOKING'), say(r.restore));
  deadlines();
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

scenario('relaunch-cooling-done', 'relaunched while cooling: the same end, one alarm left, the card again; at Done: Done again, nothing pending, no card, nothing rung', async (run) => {
  await started(run, ['-uiDo', TO_DONE]);
  await boiled(run);
  const was = await toCooling(run, 3);
  const at = storedIn(run.lines()).cook.events.pulled!.out_s + 60;
  await run.step(at);
  run.terminate();
  let r = await relaunched(run, at);
  run.check(restoredIn(r.restore, 'COOLING'), say(r.restore));
  run.check(near(r.plan.cooled, was.cooled, REPLAN), `the cooling's end ${r.plan.cooled} for ${was.cooled}`);
  run.check(same(pending(r.lines), ['cook.cool']), `pending ${pending(r.lines)}`);
  run.check(has(r.lines, is('activity', (e) => e.what === 'start' && e.stage === 'cooling')), 'the card again');
  const i = await run.step(cooledAt(was) + 1);
  await run.settled((await run.until(phaseIs('DONE'), { from: i, what: 'phase DONE' })).i);
  await run.step(cooledAt(was) + 30);
  run.terminate();
  r = await relaunched(run, cooledAt(was) + 30);
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

scenario('alarms', "the notifications as the system holds them: a cold cook's two pending at its plan's moments; relaunched past the guess, the pending pull moved to it; cancelled, none at the next launch", async (run) => {
  const start = startOf(await started(run));
  const plan = planIn(run.lines());
  const at = scheduled(run.lines());
  run.check(near(at['cook.pull'], plan.pull, EXACT) && near(at['cook.cool'], plan.cooled, EXACT),
    `alarms ${JSON.stringify(at)} for the plan ${plan.pull}, ${plan.cooled}`);
  run.check(same(sorted(pending(run.lines())), ['cook.cool', 'cook.pull']), `pending ${pending(run.lines())}`);
  run.terminate();
  const r = await relaunched(run, start + 652, ['-uiDo', 'cancel@660']);
  run.check(restoredIn(r.restore, 'HEATING') && r.plan.lengthened && r.plan.pull > num(at['cook.pull']) + 30,
    `${say(r.restore)}: the pull at +${(r.plan.pull - start).toFixed(0)} s for +${(num(at['cook.pull']) - start).toFixed(0)}`);
  run.check(near(scheduled(r.lines)['cook.pull'], planIn(r.lines).pull, EXACT), "the pending pull is the restored plan's");
  run.check(same(sorted(pending(r.lines)), ['cook.cool', 'cook.pull']), `pending ${pending(r.lines)}`);
  const i = await run.step(start + 660);
  await run.until(is('alarmsCancelled'), { from: i, what: 'the alarms cancelled' });
  await run.until(storedNone, { from: i, what: 'the cook cleared' });
  run.terminate();
  run.launch();
  // The launch's own read-back, three seconds on (AppModel.appear).
  await run.until(is('delivered'), { from: run.launched, what: 'the alarms read back' });
  run.check(same(pending(run.sinceLaunch()), []), `pending at the next launch ${pending(run.sinceLaunch())}`);
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

scenario('help-sources', "Help's sources bundled: the app finds some at launch, not none", async (run) => {
  run.launch();
  const found = await run.until(is('helpSources'), { from: run.launched, what: 'Help’s sources read' });
  run.check(found.count > 0, `${found.count} sources: help-sources.json is not in the bundle (ios/project.yml)`);
  run.note(`${found.count} sources`);
});

scenario('too-old','relaunched three hours on: ended, its alarms and card gone (2.2)', async (run) => {
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
  const prefs = await run.prefs((p) => !(COOK in p));
  run.check(!(COOK in prefs), 'nothing stored');
});

scenario('sweep', "the keys no build reads, 0.3's log and an earlier build's cook among them, are deleted at launch; its alarms left", async (run) => {
  await started(run);
  run.terminate();
  await run.prefs((p) => Boolean(p[COOK]?.cook));
  // What 0.3 and 0.4 wrote: this build's cook stands in for theirs, under
  // their key, with the same alarm ids pending (a day out, on a frozen
  // clock: still pending however long the plist takes).
  const old = {
    'calibration.v4': '{"v":4,"log":[]}', 'calibration.v4.unread': '[]', 'cookInProgress.v2': '{}',
    'cookInProgress.unread': '[]', 'share.v1': '{}', 'probeAsked': '1', 'coldStart': '1',
    'newestVersion': '0.5.0', 'newestBuild': '3',
  };
  run.editPlist([COOK, 'cookInProgress'], old);
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
  run.note(`${keys.length} swept, the old cook's alarms left`);
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

scenario('one-moment', 'each frame of the readout reads one moment, the TimelineView\'s: stepped across a second, and run fast', async (run) => {
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


scenario('change-kept-on-hide', 'a change in hand when the app leaves the screen is committed; two changes are two commits', async (run) => {
  await started(run, [...HOT, '-uiDo', 'drag:0.3@30']);
  let t = await tapAt(run, run.t0 + 30, 'drag');
  await run.until(is('edit', (e) => e.group === 'level'), { from: t.i, what: 'the change in hand' });
  // Another app over it, as the app switcher or a call would.
  simctl('launch', run.udid, 'com.apple.Preferences');
  const c = await run.until(is('editCommitted', (e) => e.fields.join(',') === 'level'), { from: t.i, what: 'committed on leaving', timeoutS: 15 });
  await run.until(storedAs((s) => s.cook.choices.level === 0.3), { from: c.i, what: 'the cook stored' });
  // The next cook's setting, written to the store as the app says; then in
  // its file, which the system writes when it will, so waited for in full.
  await run.until(is('wrote', (e) => e.key === SETTINGS), { from: c.i, what: 'the setting written' });
  run.terminate();
  const prefs = await run.prefs((p) => p[SETTINGS]?.doneness === 0.3);
  run.check(prefs[SETTINGS]?.doneness === 0.3, `the setting in the file: ${prefs[SETTINGS]?.doneness}`);
  const r = await relaunched(run, run.t0 + 40, ['-uiDo', 'set:size=3@50,set:water=1@50']);
  run.check(lastStored(r.lines)?.cook.choices.level === 0.3, 'relaunched with the change');
  t = await tapAt(run, run.t0 + 50, 'set');
  const first = await run.until(is('editCommitted'), { from: t.i, what: 'the first change committed' });
  // The second settles on the cook's clock, which stands until it is stepped.
  await run.step(run.t0 + 52);
  const second = await run.until(is('editCommitted'), { from: first.i + 1, what: 'the second change committed' });
  run.check(first.fields.join(',') === 'mass' && second.fields.join(',') === 'water',
    `two commits: ${say(first)}, ${say(second)}`);
  run.note('the slider held as the app left: committed, stored and written; size then water: two commits');
});

// ------------------------------------------------------------------- main

/// A new device's first launches are many seconds slow while the system
/// settles, and its notifications refused ("Source is not authorized"), or,
/// on a loaded machine, the request for them never answered: cooks started
/// until one has its alarms pending, each given two minutes, nothing
/// checked.
async function warmUp(): Promise<void> {
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
      const run = new Run(s.name, udid);
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
          console.log(run.text().map((l) => `        | ${l.slice(0, 240)}`).join('\n'));
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
