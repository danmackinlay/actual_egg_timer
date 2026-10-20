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

import { type CookEntry, type CookStart, type RunningCook, foldCook } from '../src/core/running.ts';
import type { BoilMemory } from '../src/core/boil.ts';
import type { Units } from '../src/core/record.ts';
import {
  APP, type Event, type EventOf, type Found, type LaunchOptions, Run, UI_ENV, build, iosStore,
  createDevice, is, lastOf, quietly, simctl, uiTest, uiWarmUp,
} from './iosHarness.ts';

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

const near = (a: number | null | undefined, b: number | null | undefined, tol: number): boolean =>
  a != null && b != null && Math.abs(a - b) <= tol;
/// An event as a failure message says it.
const say = (e: Event | null | undefined): string => (e ? JSON.stringify(e) : 'none');

/// The phase logged, one of these.
const phaseIs = (...names: string[]): ((e: Event) => e is EventOf<'phase'>) =>
  is('phase', (e) => names.includes(e.phase));
/// A tap of `-uiDo`, by name (`boil`, `set`, `drag`).
const tapped = (name: string): ((e: Event) => e is EventOf<'action'>) => is('action', (e) => e.name === name);
/// The cook stored, as `test` holds of it as the store holds it.
const storedAs = (test: (s: Stored) => boolean): ((e: Event) => e is EventOf<'stored'>) =>
  is('stored', (e) => { const s = e.value === undefined ? null : storedOf(e.value); return s !== null && test(s); });

// --------------------------------------------------------------- scenarios

interface Scenario { name: string; about: string; body: (run: Run) => Promise<void> }
const scenarios: Scenario[] = [];
const scenario = (name: string, about: string, body: (run: Run) => Promise<void>): void => {
  scenarios.push({ name, about, body });
};

/// A cold cook's taps to Done: the boil at 5:00, out 3 s into the pull.
const TO_DONE ='boil@300,out@pull+3';

/// The cooling's end a plan has, epoch s: one made once the eggs are out
/// always has it.
function cooledAt(plan: Plan): number {
  if (plan.cooled === null) throw new Error('the plan has no cooling end');
  return plan.cooled;
}

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

/// The parts of the screen whose place is logged (ContentView.logTop).
const PARTS = ['action', 'main', 'slider', 'sentence', 'egg'] as const;
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

/// Launch idle on a fresh install and wait for the time decided on its pot's
/// surface and its odds, and the screen still.
async function idle(run: Run, args: string[] = []): Promise<Layout> {
  run.launch(args);
  await run.until(is('answer', (e) => e.decided && e.odds), { from: run.launched, what: 'the idle time decided' });
  return stillLayout(run);
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

/// Step to `at`, where a `-uiDo` tap is due, and wait for it: its line.
async function tapAt(run: Run, at: number, what: string, opts: { idle?: boolean } = {}): Promise<Found<EventOf<'action'>>> {
  const i = await run.step(at, opts);
  return run.until(tapped(what), { from: i, what: `the tap ${what}` });
}

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

// ------------------------------------------------------------ the UI tests

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
