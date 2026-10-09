/**
 * The web app's saved setup (`src/ui/store.ts`): what a reload comes back to.
 *
 * Only one rule is pinned here so far, the owner's: sous-vide is never
 * remembered. Its answer is a start time most of a day in the past, and an app
 * that reopened on it would open by telling the cook they are 22 hours late.
 * A reload returns to the last PAN method instead, or to cold.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { sizeClassesFor } from '../src/core/geometry.js';
import { RunningCook, startCook, withBoil } from '../src/core/running.js';
import { choicesOf } from '../src/ui/state.js';
import {
  DEFAULT_SETTINGS, Settings, boilStoredElsewhere, clearBoilMemory, clearCook, correctedLater, loadBoilMemory, loadCook,
  loadSettings, rememberTimeToBoil, saveCook, saveLeanHint, saveSettings, settingsStoredElsewhere, storedCook,
  storedCookText, takeUpEvents,
} from '../src/ui/store.js';

/** localStorage, in memory, as in record.test.ts: the store reads
 *  `window.localStorage` at call time, inside a try. */
const storage = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); },
    removeItem: (k: string) => { storage.delete(k); },
  },
};

const SETTINGS_KEY = 'aet.settings.v1';
const COOK_KEY = 'aet.cook.v4';
const classes = sizeClassesFor('eu');

/** A page opened on this storage: as boot() does, the settings are read
 *  before anything is saved, which is where the last pan comes from. */
function freshPage(): void {
  storage.clear();
  loadSettings(classes);
}

function settingsWith(over: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...over };
}

test('a pan start is saved and comes back', () => {
  freshPage();
  saveSettings(settingsWith({ startMode: 'hot' }));
  assert.equal(loadSettings(classes).startMode, 'hot');
  saveSettings(settingsWith({ startMode: 'cold' }));
  assert.equal(loadSettings(classes).startMode, 'cold');
});

test('sous-vide is not saved: a reload comes back to the last pan', () => {
  freshPage();
  saveSettings(settingsWith({ startMode: 'hot', altitude_m: 400 }));
  saveSettings(settingsWith({ startMode: 'sous', altitude_m: 800, eggCount: 3 }));
  const back = loadSettings(classes);
  assert.equal(back.startMode, 'hot');
  // Everything else in the same save is kept as before.
  assert.equal(back.altitude_m, 800);
  assert.equal(back.eggCount, 3);
  // And it stays the last pan however many saves sous-vide makes.
  saveSettings(settingsWith({ startMode: 'sous', doneness: 0.2 }));
  saveSettings(settingsWith({ startMode: 'sous', doneness: 0.3 }));
  assert.equal(loadSettings(classes).startMode, 'hot');
  assert.equal(loadSettings(classes).doneness, 0.3);
});

test('sous-vide with no pan before it comes back as cold', () => {
  freshPage();
  saveSettings(settingsWith({ startMode: 'sous' }));
  assert.equal(loadSettings(classes).startMode, 'cold');
  assert.equal(JSON.parse(storage.get(SETTINGS_KEY) ?? '{}').startMode, 'cold');
});

test('a stored sous-vide from an older build loads as cold', () => {
  freshPage();
  storage.set(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, startMode: 'sous', altitude_m: 600 }));
  const back = loadSettings(classes);
  assert.equal(back.startMode, 'cold');
  assert.equal(back.altitude_m, 600);
});

test('a measured egg saved before measuredBy existed is read as weighed', () => {
  // The live site of 19 September saved a custom diameter with no word of
  // which box it came from; the scale is the first box and the likely one.
  freshPage();
  const old: Record<string, unknown> = { ...DEFAULT_SETTINGS, sizeIndex: -1, customMinor_mm: 44 };
  delete old['measuredBy'];
  storage.set(SETTINGS_KEY, JSON.stringify(old));
  const back = loadSettings(classes);
  assert.equal(back.measuredBy, 'scale');
  assert.equal(back.customMinor_mm, 44);
  saveSettings(settingsWith({ sizeIndex: -1, measuredBy: 'girth' }));
  assert.equal(loadSettings(classes).measuredBy, 'girth', 'a box typed in since is kept');
});

test('choosing sous-vide still works within the session', () => {
  // The in-memory setting is the page's; only what is written down changes.
  freshPage();
  const settings = settingsWith({ startMode: 'sous' });
  saveSettings(settings);
  assert.equal(settings.startMode, 'sous');
});

/** A running cook, as core starts one (src/core/running.ts), the boil
 *  tapped. */
function aCook(id_ms = 1_791_363_600_000): RunningCook {
  const choices = choicesOf({ ...DEFAULT_SETTINGS, sizeIndex: 2 }, 'GB');
  return withBoil(startCook(id_ms, choices, -3, { '2.0': 480 }, 'metric', 'en'), id_ms / 1000 + 500);
}

test('a cook comes back whole, with whether its egg was written down and the lean last decided', () => {
  storage.clear();
  const cook = aCook();
  saveCook(cook, 'beforeReload', 12.5);
  assert.deepEqual(loadCook(), { cook: cook, answers: 'beforeReload', leanHint_s: 12.5 });
  saveCook(cook, 'none', 0);
  assert.equal(loadCook()?.answers, 'none');
  assert.deepEqual(storedCook(), cook, 'whichever tab wrote it');
  saveLeanHint(cook.id_ms + 1, 4);
  assert.equal(loadCook()?.leanHint_s, 0, 'the lean goes only beside its own cook');
  saveLeanHint(cook.id_ms, 4);
  assert.deepEqual(loadCook(), { cook: cook, answers: 'none', leanHint_s: 4 }, 'the cook as it was');
});

test('two tabs on one cook take up each other\'s events, never a copy that lacks them (review 1.2)', () => {
  const start = aCook();
  const untapped: RunningCook = { ...start, events: { ...start.events, boilAt_s: null } };
  const S = start.startedAt_s;
  // B never saw the tap: it takes A's, and A takes nothing from B.
  assert.equal(takeUpEvents(untapped, start).events.boilAt_s, start.events.boilAt_s);
  assert.equal(takeUpEvents(start, untapped), start, 'nothing to take up: the same object');
  // Two taps: the first.
  const later = withBoil(untapped, S + 520);
  assert.equal(takeUpEvents(later, start).events.boilAt_s, S + 500);
  // The cook's tap out over the clock's assumption, whichever tab has it,
  // with the cooling's end of the pull kept.
  const due = S + 900;
  const byCook: RunningCook = {
    ...start, events: { ...start.events, rangAt_s: due, pulled: { due_s: due, out_s: due + 4, by: 'cook', confirmed: true } },
  };
  const byClock: RunningCook = {
    ...start,
    events: {
      ...start.events, rangAt_s: due, cooledAt_s: due + 220,
      pulled: { due_s: due, out_s: due + 20, by: 'timeout', confirmed: false },
    },
  };
  assert.deepEqual(takeUpEvents(byClock, byCook).events, byCook.events);
  assert.equal(takeUpEvents(byCook, byClock), byCook);
  const cooled = { ...byCook, events: { ...byCook.events, cooledAt_s: due + 204 } };
  assert.deepEqual(takeUpEvents(byClock, cooled).events, cooled.events);
  assert.deepEqual(takeUpEvents(untapped, cooled).events, cooled.events, 'all of it, at once');
  // A pull that rang under a guessed boil is not taken up with the real one.
  const rangOnGuess: RunningCook = { ...untapped, events: { ...untapped.events, rangAt_s: S + 700 } };
  assert.equal(takeUpEvents(rangOnGuess, start).events.rangAt_s, null);
  // Taken up both ways, the two copies agree.
  for (const [x, y] of [[byClock, cooled], [rangOnGuess, start], [later, byClock]]) {
    assert.deepEqual(takeUpEvents(x, y).events, takeUpEvents(y, x).events);
  }
  // Another cook is never taken up (DECISIONS.md 97).
  const other = aCook(start.id_ms + 60_000);
  assert.equal(takeUpEvents(untapped, other), untapped);
});

test('a copy with other corrections gives only what the cook saw, never what its clock decided (onescreen review 1.1)', () => {
  const start = aCook();
  const S = start.startedAt_s;
  const due = S + 900;
  // B, never corrected, rang its own pull and its grace ran out; A was
  // corrected to a heavier egg at 600 s.
  const corrected: RunningCook = { ...start, choices: { ...start.choices, mass_kg: 0.076 }, correctedAt_s: S + 600 };
  const byClock: RunningCook = {
    ...start,
    events: {
      ...start.events, rangAt_s: due, cooledAt_s: due + 220,
      pulled: { due_s: due, out_s: due + 20, by: 'timeout', confirmed: false },
    },
  };
  assert.equal(takeUpEvents(corrected, byClock), corrected, 'nothing B\'s clock decided, either way round');
  assert.deepEqual(takeUpEvents(byClock, corrected).events, byClock.events);
  // The cook's own tap out, and the boil, are taken from any copy; a
  // cooling's end, which the plan decides, only from the same corrections.
  const byCook: RunningCook = {
    ...start,
    events: { ...start.events, rangAt_s: due, cooledAt_s: due + 204, pulled: { due_s: due, out_s: due + 4, by: 'cook', confirmed: true } },
  };
  const took = takeUpEvents({ ...corrected, events: { ...corrected.events, boilAt_s: null } }, byCook).events;
  assert.deepEqual(took, { boilAt_s: start.events.boilAt_s, pulled: byCook.events.pulled, cooledAt_s: null, rangAt_s: null });
  // The same start and choices are the same plan, whenever corrected.
  const back: RunningCook = { ...start, correctedAt_s: S + 610 };
  assert.deepEqual(takeUpEvents(back, byClock).events, byClock.events);
  // Which copy a reload restores: the one corrected last.
  assert.equal(correctedLater(corrected, start), true);
  assert.equal(correctedLater(start, corrected), false);
  assert.equal(correctedLater(back, corrected), true);
  assert.equal(correctedLater(start, start), false);
});

test('a cook kept without `answers` or the lean is refused, never read as unanswered', () => {
  // Read as unanswered, an egg already in the log would be logged again.
  storage.clear();
  const cook = aCook();
  storage.set(COOK_KEY, JSON.stringify({ cook: cook, leanHint_s: 0, feedbackGiven: true }));
  assert.equal(loadCook(), null);
  storage.set(COOK_KEY, JSON.stringify({ cook: cook, answers: 'live', leanHint_s: 0 }));
  assert.equal(loadCook(), null, 'only what saveCook writes');
  storage.set(COOK_KEY, JSON.stringify({ cook: cook, answers: 'none' }));
  assert.equal(loadCook(), null, 'without the lean');
  storage.set(COOK_KEY, JSON.stringify({ cook: { ...cook, startedAt_s: 'then' }, answers: 'none', leanHint_s: 0 }));
  assert.equal(loadCook(), null, 'a cook that does not read (`readRunningCook`)');
});

test('Cancel forgets the stored cook only if it is this tab\'s', () => {
  storage.clear();
  const mine = aCook();
  const theirs = aCook(mine.id_ms + 60_000);
  saveCook(theirs, 'none', 0);
  clearCook(mine.id_ms);
  assert.deepEqual(storedCook(), theirs, 'another tab started a cook since: it stays');
  clearCook(theirs.id_ms);
  assert.equal(storedCookText(), null);
  storage.set(COOK_KEY, '{');
  clearCook(mine.id_ms);
  assert.equal(storedCookText(), null, 'junk goes');
});

test('a cook in a shape this build does not read is not read; the live site\'s is dropped', () => {
  storage.clear();
  // A running cook without the plan as it ran (review 1.3).
  const { asRan: _dropped, ...earlier } = aCook();
  storage.set(COOK_KEY, JSON.stringify({ cook: earlier, answers: 'none', leanHint_s: 0 }));
  assert.equal(loadCook(), null, 'without the plan as it ran, not read');
  // 0.4's shape: a machine and a ticket.
  storage.set(COOK_KEY, JSON.stringify({ machine: { phase: 'COOKING', startedAt_ms: 1 }, ticket: { lang: 'en' }, answers: 'none' }));
  assert.equal(loadCook(), null, 'never read as a running cook');
  storage.delete(COOK_KEY);
  storage.set('aet.cook.v1', JSON.stringify({ machine: { phase: 'COOKING' }, feedbackGiven: false }));
  assert.equal(loadCook(), null);
  assert.equal(storage.has('aet.cook.v1'), false, 'the superseded key is removed');
});

test('the settings as a cook\'s choices: the carton\'s class or the measured egg, the pan, the room with the probe', () => {
  const eu = choicesOf({ ...DEFAULT_SETTINGS, sizeIndex: 2, doneness: 0.62 }, 'GB');
  assert.deepEqual([eu.mass_kg, eu.massFrom, eu.sizeTable, eu.level], [sizeClassesFor('GB')[2].mass_kg, 'class', 'eu', 0.62]);
  const us = choicesOf({ ...DEFAULT_SETTINGS, sizeIndex: 2 }, 'US');
  assert.deepEqual([us.mass_kg, us.sizeTable], [sizeClassesFor('US')[2].mass_kg, 'us']);
  const measured = choicesOf({ ...DEFAULT_SETTINGS, sizeIndex: -1, customMinor_mm: 44, measuredBy: 'girth' }, 'GB');
  assert.deepEqual([measured.massFrom, measured.sizeTable], ['girth', null]);
  assert.ok(measured.mass_kg > 0.05 && measured.mass_kg < 0.08);
  assert.equal(choicesOf({ ...DEFAULT_SETTINGS, startMode: 'sous' }, 'GB').startMode, 'hot', 'sous-vide is a hot pan to the solver');
  assert.equal(choicesOf({ ...DEFAULT_SETTINGS, room_C: 26 }, 'GB').room_C, null, 'the room counts only with the probe on');
  assert.equal(choicesOf({ ...DEFAULT_SETTINGS, room_C: 26, probe: true }, 'GB').room_C, 26);
});

test('junk under the cook\'s key is never a crash', () => {
  storage.clear();
  for (const junk of ['{', 'null', '[]', '"cook"', JSON.stringify({ cook: 3, answers: 'none', leanHint_s: 0 })]) {
    storage.set(COOK_KEY, junk);
    assert.equal(loadCook(), null, junk);
    assert.equal(storedCook(), null, junk);
  }
});

test('another tab\'s settings are taken up: what this page changed stays its own, the rest is theirs', () => {
  freshPage();
  const mine = loadSettings(classes);
  // Another tab, loaded earlier, changes the altitude and turns the sound off.
  const theirs = { ...DEFAULT_SETTINGS, altitude_m: 900, muted: true };
  storage.set(SETTINGS_KEY, JSON.stringify(theirs));
  // This page, before it hears, moves the slider and saves.
  mine.doneness = 0.8;
  const saved = saveSettings(mine);
  assert.deepEqual([saved.altitude_m, saved.muted, saved.doneness], [900, true, 0.8]);
  const stored = JSON.parse(storage.get(SETTINGS_KEY) ?? '{}') as Settings;
  assert.deepEqual([stored.altitude_m, stored.muted, stored.doneness], [900, true, 0.8], 'nothing undone');
  // The page's storage event: taken up once, keeping a change not yet saved.
  saved.eggCount = 3;
  storage.set(SETTINGS_KEY, JSON.stringify({ ...stored, cooling: 'tap' }));
  assert.equal(settingsStoredElsewhere('aet.boil.v1', saved), null);
  const heard = settingsStoredElsewhere(SETTINGS_KEY, saved);
  assert.deepEqual([heard?.cooling, heard?.eggCount, heard?.altitude_m], ['tap', 3, 900]);
  assert.equal(settingsStoredElsewhere(SETTINGS_KEY, saved), null, 'once');
});

test('a sous-vide on screen stays this page\'s when another tab saves a pan', () => {
  freshPage();
  saveSettings(settingsWith({ startMode: 'cold' }));
  const mine = settingsWith({ startMode: 'sous' });
  storage.set(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, startMode: 'hot' }));
  const saved = saveSettings(mine);
  assert.equal(saved.startMode, 'sous');
  assert.equal(JSON.parse(storage.get(SETTINGS_KEY) ?? '{}').startMode, 'hot', 'the other tab\'s pan, the last saved');
});

test('"Forget everything" in another tab is not undone by this one\'s next measured boil', () => {
  storage.clear();
  const BOIL_KEY = 'aet.boil.v1';
  let memory = loadBoilMemory();
  memory = rememberTimeToBoil(memory, 2, 600);
  assert.equal(boilStoredElsewhere(BOIL_KEY), null, 'its own write is nothing new');
  // Another tab forgets every pan; this one has not heard, and times a boil.
  storage.delete(BOIL_KEY);
  memory = rememberTimeToBoil(memory, 1.5, 420);
  assert.deepEqual(Object.keys(JSON.parse(storage.get(BOIL_KEY) ?? '{}') as object), Object.keys(memory));
  assert.equal(Object.keys(memory).length, 1, 'only the pan timed since');
  // And when it hears, it follows.
  storage.delete(BOIL_KEY);
  assert.deepEqual(boilStoredElsewhere(null), {});
  assert.equal(boilStoredElsewhere(BOIL_KEY), null);
  clearBoilMemory();
});

test('the alarm sound comes back as stored, and anything else, or nothing, is the wind-up timer', () => {
  freshPage();
  assert.equal(loadSettings(classes).alarm, 'timer', 'a fresh install');
  saveSettings(settingsWith({ alarm: 'hen' }));
  assert.equal(loadSettings(classes).alarm, 'hen');
  storage.set(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, alarm: 'beeps' }));
  assert.equal(loadSettings(classes).alarm, 'timer', 'a sound this version does not offer');
  const before = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  delete before['alarm'];
  storage.set(SETTINGS_KEY, JSON.stringify(before));
  assert.equal(loadSettings(classes).alarm, 'timer', 'a record from before the choice');
});
