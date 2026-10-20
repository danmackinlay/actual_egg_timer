// `npm run ios:e2e`: what only a device can check, scripted: the screen's
// layout, a relaunch over the system's notifications and Live Activity, a
// notification delivered while the app is gone, the app leaving the screen,
// the keys an earlier build left, Help's sources and the alarms' sound
// files in the bundle. What the
// app's logic decides is `swift test`'s
// (ios/EggTimerCore/Tests/EggTimerAppTests).
//
// A Debug build on a simulator of the script's own, the app's clock frozen
// at each moment a scenario checks and stepped from one to the next
// (`-clockAt`, `-clockSpeed 0`, `Library/Caches/aet.clock`; AppClock.swift
// in ios/EggTimerCore/Sources/EggTimerApp), taps by launch argument (`-uiDo`,
// Screenshots.swift there), and what happened read from the app's debug log
// (`Library/Caches/aet.log`, an event a line, each a JSON object:
// `Screenshots.Event`) and its stored state (the stores' plist, through
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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { type CookEntry, type CookStart, type RunningCook, foldCook } from '../src/core/running.ts';
import type { BoilMemory } from '../src/core/boil.ts';
import type { Units } from '../src/core/record.ts';
import {
  APP, COOK, type Event, type EventOf, type Found, LOCALE, type LaunchOptions, Run, SETTINGS, WAIT_S, build, iosStore,
  createDevice, is, lastOf, quietly, settingsArg, simctl, sleep, uiTest,
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

/// The cook as the app stores it (StoredCook.swift): the cook as core codes
/// it, what was fixed at the press, the start and the log, folded again by
/// core's `foldCook`; beside it whether the egg was answered and the lean
/// last decided, and the format, `v`.
interface Stored { cook: RunningCook; answers: string; leanHintS: number }

/// A stored cook as the log or the plist has it, read as the app wrote it,
/// in its format; null if it is not one. Trusted, not checked field by
/// field: what the app takes back is EggTimerAppTests'.
function storedOf(raw: unknown): Stored | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as { v?: unknown; cook?: unknown; answers?: unknown; leanHintS?: unknown };
  if (o.v !== COOK_FORMAT || o.cook === null || typeof o.cook !== 'object') return null;
  const c = o.cook as {
    id_ms: number; nudge_s: number; boilMemory: BoilMemory; units: Units; lang: string; start: CookStart;
    log: CookEntry[];
  };
  return {
    cook: foldCook(c.id_ms, c.start, c.nudge_s, c.boilMemory, c.units, c.lang, c.log),
    answers: String(o.answers), leanHintS: Number(o.leanHintS),
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

/// A hot start's settings.
const HOT_SETTINGS = { doneness: 0.41, altitudeM: 0, waterLitres: 2, eggCount: 2, startMode: 'hot' };
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
/// nothing empty: the slider the stack's spacing (18 pt) under the main
/// button's foot.
function nothingEmpty(run: Run, l: Layout, when: string): void {
  run.check(l.main != null && l.slider != null && near(l.slider - l.main, 18, 1),
    `${when}: ${num(l.slider) - num(l.main) - 18} pt empty under the row (main button's foot ${l.main}, slider ${l.slider})`);
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

/// Where the screen shows the page, and the open panel, top and foot, and
/// the sentence, pt from the window's top (ContentView.logTop, logBottom).
interface Shown { screen: number; screenFoot: number; panel: number; panelFoot: number; sentence: number }

/// The last of each in these lines, which there must be.
function shownIn(lines: Event[], when: string): Shown {
  const l: Record<string, number> = {};
  for (const e of lines) if (e.ev === 'layout') l[e.part] = e.y;
  for (const part of ['screen', 'screenFoot', 'panel', 'panelFoot', 'sentence']) {
    if (l[part] === undefined) throw new Error(`${when}: no ${part} logged`);
  }
  return l as unknown as Shown;
}

scenario('panel-in-view', "UI.md 5: a clause pressed scrolls just far enough to show its panel: the egg's at idle, under the fold, up to its foot at the screen's, and the start's pressed from it; the egg's again from that, on screen, scrolls nothing; the sentence moves only with the page; a panel a launch argument opens scrolls nothing; at the largest text size the start's, taller than the screen, comes up with its head at the top", async (run) => {
  // Each press of `-uiDo`, due at `at`: how the page scrolled to its panel
  // (`reveal`), where the panel opened, from the first line after the press,
  // and where the page left it; null for a panel closed.
  const press = async (at: number, when: string): Promise<{ scroll: string; opened: Shown; shown: Shown } | null> => {
    const tap = await tapAt(run, at, 'clause');
    const lines = await screen(run);
    const after = lines.slice(tap.i);
    const opened = after.find((e) => e.ev === 'layout' && e.part === 'panel');
    if (opened === undefined) return null;
    const first = shownIn([...lines.slice(0, tap.i), ...after.slice(0, after.indexOf(opened) + 2)], when);
    const scroll = after.find(is('reveal'))?.scroll ?? 'no reveal';
    return { scroll: scroll, opened: first, shown: shownIn(lines, when) };
  };
  const px = (s: Shown): string => `${s.panel}-${s.panelFoot} on a screen ${s.screen}-${s.screenFoot}`;
  const opened = async (at: number, when: string): Promise<{ scroll: string; opened: Shown; shown: Shown }> => {
    const p = await press(at, when);
    if (p === null) throw new Error(`${when}: the panel never opened`);
    return p;
  };
  // Below the fold, a panel that fits comes up just far enough: its foot at
  // the screen's.
  const upToFoot = (p: { scroll: string; opened: Shown; shown: Shown }, when: string): void => {
    run.check(p.scroll === 'bottom', `${when}: scrolled ${p.scroll}, not to its foot`);
    run.check(near(p.shown.panelFoot, p.shown.screenFoot, 2) && p.shown.panel >= p.shown.screen,
      `${when}: not scrolled just far enough: ${px(p.shown)}`);
  };

  let base = run.at;
  await idle(run, ['-uiDo', 'clause:egg@launch+1,clause:start@launch+2,clause:egg@launch+3']);
  const egg = await opened(base + 1, "the egg's");
  run.check(egg.opened.panelFoot > egg.opened.screenFoot + 0.5, `the egg's opened on screen, nothing to scroll: ${px(egg.opened)}`);
  upToFoot(egg, "the egg's");
  // Only the page moved: the sentence with the panel. (From another
  // clause, the one going logs its place too as it fades.)
  const moved = egg.shown.panel - egg.opened.panel;
  run.check(near(egg.shown.sentence - egg.opened.sentence, moved, 0.5),
    `the sentence moved ${egg.shown.sentence - egg.opened.sentence} pt, the panel ${moved}: something moved on the page`);
  // Another clause pressed from it is opened too.
  const start = await opened(base + 2, "the start's from the egg's");
  upToFoot(start, "the start's from the egg's");
  // The egg's again, shorter, where the start's was: on screen, so no
  // scroll of its own (the page grown shorter may still take some back).
  const again = await opened(base + 3, "the egg's again");
  run.check(again.opened.panel >= again.opened.screen && again.opened.panelFoot <= again.opened.screenFoot + 0.5,
    `the egg's again opened off the screen: ${px(again.opened)}`);
  run.check(again.scroll === 'none', `the egg's again, on screen, scrolled ${again.scroll}`);
  run.check(again.shown.panel >= again.shown.screen && again.shown.panelFoot <= again.shown.screenFoot + 0.5,
    `the egg's again not on screen: ${px(again.shown)}`);
  run.terminate();

  // Opened by a launch argument: no scroll.
  await idle(run, ['-uiScreen', 'clause-start']);
  const itself = run.sinceLaunch();
  const own = shownIn(itself, 'opened by a launch argument');
  run.check(!itself.some(is('reveal')), 'a panel a launch argument opened was scrolled to');
  run.check(own.panelFoot > own.screenFoot + 0.5, `opened by a launch argument, the panel on screen: ${px(own)}`);
  run.terminate();

  // Taller than the screen: its head at the top.
  base = run.at;
  await idle(run, [
    '-UIPreferredContentSizeCategoryName', 'UICTContentSizeCategoryAccessibilityXXXL', '-uiDo', 'clause:start@launch+1',
  ]);
  const tall = await opened(base + 1, "the start's at the largest text size");
  run.check(tall.opened.panelFoot - tall.opened.panel > tall.opened.screenFoot - tall.opened.screen,
    `at the largest text size the start's panel fits the screen: ${px(tall.opened)}`);
  run.check(tall.scroll === 'top' && near(tall.shown.panel, tall.shown.screen, 2),
    `taller than the screen, scrolled ${tall.scroll}: ${px(tall.shown)}`);
  run.note(`the egg's ${px(egg.opened)} -> ${px(egg.shown)}; the start's -> ${px(start.shown)}; the egg's again ${px(again.shown)}; a launch argument's ${px(own)}; the largest text's ${px(tall.opened)} -> ${px(tall.shown)}`);
});

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

scenario('eggcup-opening', 'an egg cup counted down from the out to its opening: the alarm and the card at the opening, the readout counting to it, Done there', async (run) => {
  await started(run, [...settingsArg({ ...HOT_SETTINGS, cooling: 'eggCup', doneness: 0.22 }), '-uiDo', 'out@pull+3']);
  const was = await toCooling(run, 3);
  const out = storedIn(run.lines()).cook.events.pulled!.out_s;
  const opening = cooledAt(was);
  run.check(near(opening, out + 120, EXACT), `the opening at +${(opening - out).toFixed(3)} s from the out, not 120`);
  const alarm = scheduled(run.lines())['cook.cool'];
  run.check(near(alarm, opening, EXACT), `the opening's alarm ${alarm} for ${opening}`);
  run.check(has(run.lines(), is('activity', (e) => e.stage === 'opening' && near(e.ends, opening, 1))),
    'the card counting to the opening');
  const i = await run.step(opening - 60);
  const f = await run.until(is('frame', (e) => e.at.toFixed(3) === (opening - 60).toFixed(3)), {
    from: i, what: 'a frame a minute before the opening',
  });
  const words = JSON.parse(readFileSync('copy/en.json', 'utf8')) as { messages: Record<string, { text: string }> };
  const sub = words.messages['readout.sub.coolingEggCup']!.text;
  run.check(f.phase === 'COOLING' && f.big === '1:00' && f.sub === sub, `a minute before the opening: ${say(f)}`);
  const j = await run.step(opening + 1);
  await run.settled((await run.until(phaseIs('DONE'), { from: j, what: 'phase DONE at the opening' })).i);
});

scenario('asleep', 'killed before the pull, its notification delivered; relaunched past it: the pull not rung, the cooling’s end rung on screen', async (run) => {
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
  // The pull came while the app was away, and its notification rang; the
  // cooling's end comes on screen, and the app rings it too.
  const rung = run.sinceLaunch().filter(is('ring')).map((e) => e.deadline);
  run.check(same(rung, ['cooled']), `rung ${rung}, not the cooling's end alone`);
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


scenario('tap-water-mid-cook', "the cold tap's temperature while a cold cook heats: one commit of the tap's group, a later pull, and the record's pan at it", async (run) => {
  await started(run, ['-uiDo', `set:tapWater=8@60,${TO_DONE},answer:jammy@cooled+5`]);
  const pull0 = planIn(run.lines()).pull;
  const t = await tapAt(run, run.t0 + 60, 'set');
  // The change settles on the cook's clock, which stands until it is stepped.
  await run.step(run.t0 + 62);
  const c = await run.until(is('editCommitted'), { from: t.i, what: 'the tap committed' });
  run.check(c.fields.join(',') === 'tapWater', `one commit, of the tap: ${say(c)}`);
  await run.until(storedAs((x) => x.cook.choices.tapWater_C === 8), { from: c.i, what: 'the cook stored with the tap' });
  await run.settled(c.i);
  const pull1 = planIn(run.lines()).pull;
  run.check(pull1 > pull0, `a colder pan, a later pull: ${(pull1 - pull0).toFixed(1)} s`);
  const done = await toDone(run);
  const i = await run.step(cooledAt(done) + 5);
  const logged = await run.until(is('log', (e) => e.count >= 1), { from: i, what: 'the egg logged' });
  const setup = (logged.last as { setup?: { panStart_C?: number } } | undefined)?.setup;
  run.check(setup?.panStart_C === 8, `the record's pan: ${JSON.stringify(setup)}`);
  run.note(`tap 15 assumed → 8 at +60 s: the pull ${(pull1 - pull0).toFixed(1)} s later; recorded panStart_C ${setup?.panStart_C}`);
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
  run.check(first.fields.join(',') === 'mass' && second.fields.join(',') === 'waterLitres',
    `two commits: ${say(first)}, ${say(second)}`);
  run.note('the slider held as the app left: committed, stored and written; size then water: two commits');
});

// ------------------------------------------------------------ the UI tests

/// What the UI tests are given (ios/UITests/Harness.swift `Env`): where
/// each scenario's directory is made, how long a wait gives up after, and
/// the locale.
const UI_ENV: Record<string, string> = {
  AET_E2E_DIR: resolve('ios/build/e2e/runs'), AET_E2E_WAIT: String(WAIT_S), AET_LOCALE: LOCALE,
};

/// The scenarios ios/UITests holds: each `test_<name>` of `Scenarios`, its
/// name with hyphens for the underscores, and the comment above it.
function uiScenarios(): { name: string; about: string }[] {
  const out: { name: string; about: string }[] = [];
  for (const file of readdirSync('ios/UITests').filter((f) => f.endsWith('.swift')).sort()) {
    const source = readFileSync(`ios/UITests/${file}`, 'utf8');
    if (!source.includes('extension Scenarios')) continue;
    for (const m of source.matchAll(/\/\/\/ (.+)\n\s*func test_(\w+)\(\)/g)) {
      out.push({ name: m[2]!.replace(/_/g, '-'), about: m[1]! });
    }
  }
  return out;
}

/// The device warmed up for the UI tests (`WarmUp`, ios/UITests/Bundle.swift):
/// run until a cook has its alarms pending, at most five times.
function uiWarmUp(udid: string): void {
  for (let attempt = 1; ; attempt += 1) {
    const r = uiTest(udid, 'WarmUp/test_warm_up', UI_ENV);
    if (r.passed) return;
    console.log(`ios:e2e: warm-up ${attempt}: ${r.failures.join('; ')}`);
    if (attempt === 5) throw new Error(`the device's alarms not working after ${attempt} launches`);
  }
}

// ------------------------------------------------------------------- main

async function main(): Promise<void> {
  const ui = uiScenarios();
  if (listOnly) {
    for (const s of [...scenarios, ...ui]) console.log(`${s.name.padEnd(24)} ${s.about}`);
    return;
  }
  const matches = (name: string): boolean =>
    wanted.length === 0 || wanted.some((w) => (w.endsWith('*') ? name.startsWith(w.slice(0, -1)) : name === w));
  const chosen = scenarios.filter((s) => matches(s.name));
  const chosenUi = ui.filter((s) => matches(s.name));
  if (chosen.length + chosenUi.length === 0) throw new Error(`no scenario named ${wanted.join(', ')} (--list)`);

  const began = Date.now();
  if (!noBuild || !existsSync(APP)) build();
  const built = Date.now();
  if (!udid) udid = createDevice();
  let failed = 0;
  try {
    uiWarmUp(udid);
    for (const s of chosenUi) {
      const r = uiTest(udid, `Scenarios/test_${s.name.replace(/-/g, '_')}`, UI_ENV);
      const secs = r.secs.toFixed(0);
      if (r.passed) {
        console.log(`  pass  ${s.name} (${secs} s)${r.notes.length ? ` - ${r.notes.join('; ')}` : ''}`);
      } else {
        failed += 1;
        console.log(`  FAIL  ${s.name} (${secs} s)`);
        for (const f of r.failures) console.log(`        ${f}`);
        for (const n of r.notes) console.log(`        note: ${n}`);
        const log = `${UI_ENV['AET_E2E_DIR']}/${s.name}/aet.log`;
        if (process.env['AET_E2E_LOG'] && existsSync(log)) {
          const lines = readFileSync(log, 'utf8').split('\n').filter((l) => l !== '');
          console.log(lines.map((l) => `        | ${l.slice(0, 240)}`).join('\n'));
        }
      }
    }
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
  const count = chosen.length + chosenUi.length;
  console.log(`ios:e2e: ${count - failed} of ${count} passed in ${total} s (the build ${building} s)`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
