/**
 * Persistence: localStorage in, localStorage out.
 *
 * Everything here must survive localStorage being absent, disabled, full, or
 * throwing (Safari private mode throws on setItem).
 *
 * The BOUNDS and the DEFAULTS are core policy (`src/core/policy.ts`), so the
 * two apps share one set. This module applies them; it does not decide them.
 */

import { SizeClass } from '../core/geometry.js';
import { UnitSystem, readChosenUnits } from '../core/units.js';
import { FRESH_LANGUAGE, LANGUAGES, LanguageState, readLanguageState } from '../core/language.js';
import { StartMode, Cooling, HeatAfterBoil } from '../core/protocol.js';
import {
  BoilMemory, DEFAULTS, LIMITS, Limit, carrySizeIndex, clamp, isWithin, rememberBoil,
} from '../core/policy.js';
import { CookAsRan, CookEvents, Pulled, RunningCook, readRunningCook, sameChoices } from '../core/running.js';

export type { Limit } from '../core/policy.js';
export { LIMITS, START_TEMP_PRESETS_C, estimateTimeToBoil, hasBoilMemory } from '../core/policy.js';

const SETTINGS_KEY = 'aet.settings.v1';
const COOK_KEY = 'aet.cook.v4';
/** Cooks in shapes this build does not read, each read once, kept aside as
 *  stored and deleted (`takeOldCooks`), never converted (DECISIONS.md 48, 97):
 *  0.3's and 0.4's machine and ticket (`aet.cook.v2`), and a running cook
 *  without the plan as it ran (`aet.cook.v3`, running-cook review 1.3). */
const OLD_COOK_KEYS = ['aet.cook.v2', 'aet.cook.v3'];
/** The cook as the live site of 19 September stores it: a shape the ticket
 *  does not read. Dropped, not migrated. */
const SUPERSEDED_COOK_KEY = 'aet.cook.v1';
const BOIL_KEY = 'aet.boil.v1';

type StartTempMode = 'fridge' | 'room' | 'custom';

/** The Start control offers one more option than the solver understands.
 *  'sous' never reaches core: see choicesOf in state.ts. */
export type UiStartMode = StartMode | 'sous';

export interface Settings {
  /** Index into the region's size classes, or -1 for a custom measured
   *  diameter. Stored without the region: see `carrySizeIndex`. */
  sizeIndex: number;
  customMinor_mm: number;
  /** Which of the three measurement boxes `customMinor_mm` came from. They are
   *  one number in three units, so nothing else remembers - and a weighed egg
   *  and a ruler-measured one are not equally sure (the record's `massFrom`). */
  measuredBy: 'scale' | 'girth' | 'width';
  startTempMode: StartTempMode;
  customStart_C: number;
  altitude_m: number;
  startMode: UiStartMode;
  afterBoil: HeatAfterBoil;
  cooling: Cooling;
  waterLitres: number;
  eggCount: number;
  /** Doneness slider position, [0, 1]. */
  doneness: number;
  /** No alarm, no blips. The countdown still runs. */
  muted: boolean;
  /** Metric or Imperial, as the COOK chose it, or null if they never have.
   *  Not the system on screen: that is this or, failing it, the region's
   *  default (`effectiveUnits`), and storing the result instead would turn a
   *  default into a choice the cook never made. */
  unitsChosen: UnitSystem | null;
  /** The language the cook chose, or the units switch put on screen, or
   *  null for the default (`src/core/language.ts`). Like the units, a
   *  choice is kept apart from the default it overrides. */
  language: LanguageState;
  /** "I have a probe thermometer": ask for a reading at the middle of
   *  the egg when the cooling ends. Off until the cook says so. */
  probe: boolean;
  /** The room as the cook measured it, C, or null for not measured, when a
   *  room is assumed. Offered, and counted, only while `probe` is on
   *  (`roomInUse`); kept while it is off, for when it comes back on. */
  room_C: number | null;
}

/** The numbers a fresh install starts from come from core; the three settings
 *  that are purely a web-UI state - which temperature button is selected, which
 *  start mode, whether sound is off - are decided here. */
export const DEFAULT_SETTINGS: Settings = {
  sizeIndex: DEFAULTS.sizeIndex,
  customMinor_mm: DEFAULTS.customMinor_mm,
  // Read only for a measured egg, and set by whichever box is typed in. A
  // settings record from the live site of 19 September has no field for it,
  // and its diameter was typed into one of the same three boxes: the first,
  // the scale, is the likely one and the one that is read. The record's
  // `massFrom` has no "unknown" (record v1 is frozen), so it is a guess
  // either way, and the likely one beats the literal one.
  measuredBy: 'scale',
  startTempMode: 'fridge',
  customStart_C: DEFAULTS.customStart_C,
  altitude_m: DEFAULTS.altitude_m,
  startMode: 'cold',
  afterBoil: 'hold',
  cooling: 'ice',
  waterLitres: DEFAULTS.waterLitres,
  eggCount: DEFAULTS.eggCount,
  doneness: DEFAULTS.doneness,
  muted: false,
  unitsChosen: null,
  language: FRESH_LANGUAGE,
  probe: false,
  room_C: null,
};

/* ------------------------------------------------------------- raw storage */

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode, quota, or no storage at all: carry on without memory. */
  }
}

export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing stored means nothing to remove. */
  }
}

function parseObject(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- numbers */

/** Clamp to a finite number in range, falling back when given junk or NaN.
 *  Nothing from an input element or from storage reaches the solver without
 *  passing through here. */
export function clampNumber(value: unknown, limit: Limit, fallback: number): number {
  // An empty or blank field is "not yet typed", not zero: Number('') is 0,
  // which would silently clamp to the minimum while the user is mid-edit.
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, limit);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  for (let i = 0; i < allowed.length; i += 1) {
    if (value === allowed[i]) return allowed[i];
  }
  return fallback;
}

/* -------------------------------------------------------------- settings */

/** The pan method last saved - what a save made in sous-vide writes in its
 *  place (`saveSettings`). Read with the settings, and kept up by every save
 *  of a pan, so a save need not read storage back to find it. */
let lastPanStart: StartMode = 'cold';
/** The settings as this page last read or wrote them, as stored. Anything
 *  else found there was written by another tab, and is taken up before this
 *  page writes (`takenUp`): every page writes them whole, so a page that
 *  wrote back what it loaded would undo every change another tab made. */
let settingsSeen: string | null = null;
/** The size table the settings were read against (`loadSettings`). */
let settingsClasses: SizeClass[] = [];

/** `classes` is the table the app is showing now, which need not be the one
 *  the record was saved against. */
export function loadSettings(classes: SizeClass[]): Settings {
  settingsClasses = classes;
  settingsSeen = readStorage(SETTINGS_KEY);
  const raw = parseObject(settingsSeen);
  lastPanStart = storedPanStart(raw);
  return readSettings(raw, classes);
}

/** Settings as stored, each one checked, the defaults for anything missing. */
function readSettings(raw: Record<string, unknown> | null, classes: SizeClass[]): Settings {
  if (raw === null) return { ...DEFAULT_SETTINGS };
  const d = DEFAULT_SETTINGS;
  return {
    sizeIndex: carrySizeIndex(clampNumber(raw['sizeIndex'], LIMITS.sizeIndex, d.sizeIndex), classes),
    customMinor_mm: clampNumber(raw['customMinor_mm'], LIMITS.minor_mm, d.customMinor_mm),
    measuredBy: oneOf(raw['measuredBy'], ['scale', 'girth', 'width'] as const, d.measuredBy),
    startTempMode: oneOf(raw['startTempMode'], ['fridge', 'room', 'custom'] as const, d.startTempMode),
    customStart_C: clampNumber(raw['customStart_C'], LIMITS.eggTemp_C, d.customStart_C),
    altitude_m: clampNumber(raw['altitude_m'], LIMITS.altitude_m, d.altitude_m),
    // Only a pan comes back. A stored 'sous', from before it stopped being
    // saved, is read as the default, because nothing recorded the pan before it.
    startMode: storedPanStart(raw),
    afterBoil: oneOf(raw['afterBoil'], ['hold', 'off'] as const, d.afterBoil),
    cooling: oneOf(raw['cooling'], ['ice', 'tap', 'counter'] as const, d.cooling),
    waterLitres: clampNumber(raw['waterLitres'], LIMITS.waterLitres, d.waterLitres),
    eggCount: Math.round(clampNumber(raw['eggCount'], LIMITS.eggCount, d.eggCount)),
    doneness: clampNumber(raw['doneness'], LIMITS.doneness, d.doneness),
    muted: raw['muted'] === true,
    unitsChosen: readChosenUnits(raw['unitsChosen']),
    language: readLanguageState(raw['language'], LANGUAGES),
    probe: raw['probe'] === true,
    // Absent from every settings record before 5 October 2026: not measured.
    room_C: typeof raw['room_C'] === 'number' && Number.isFinite(raw['room_C'])
      ? clamp(raw['room_C'], LIMITS.room_C) : null,
  };
}

/** Only the language, for choosing a catalogue before anything else is read:
 *  the page paints nothing until its words are in. */
export function loadLanguage(): LanguageState {
  const raw = parseObject(readStorage(SETTINGS_KEY));
  return raw === null ? FRESH_LANGUAGE : readLanguageState(raw['language'], LANGUAGES);
}

/** Sous-vide is never remembered. Its answer is a start time in the past - a
 *  58 °C bath wants most of a day - so an app that reopened on it would greet
 *  the cook by telling them they are 22 hours late, which is a bad first
 *  choice. It is still a choice for as long as the page is open; what is saved
 *  in its place is whatever pan was saved before it, cold or hot, so a reload
 *  comes back to the last pan the cook used. `loadSettings` comes first. */
export function saveSettings(settings: Settings): Settings {
  const next = takenUp(settings);
  if (next.startMode !== 'sous') lastPanStart = next.startMode;
  writeStorage(SETTINGS_KEY, JSON.stringify({ ...next, startMode: lastPanStart }));
  // Read back: a write that failed leaves the store as it was, which is then
  // not another tab's.
  settingsSeen = readStorage(SETTINGS_KEY);
  return next;
}

/**
 * The settings with what another tab wrote since this page last read or
 * wrote them taken up: each setting this page has not changed since then
 * becomes the other tab's, and each one it has changed stays its own. The
 * settings given, as they are, when no other tab wrote; what is written is
 * what comes back, so the page shows it.
 */
function takenUp(ours: Settings): Settings {
  const text = readStorage(SETTINGS_KEY);
  if (text === settingsSeen) return ours;
  const baseRaw = parseObject(settingsSeen);
  const theirRaw = parseObject(text);
  const base = readSettings(baseRaw, settingsClasses);
  const theirs = readSettings(theirRaw, settingsClasses);
  const next: Settings = { ...ours };
  const into = next as unknown as Record<string, unknown>;
  for (const key of Object.keys(ours) as (keyof Settings)[]) {
    if (key !== 'startMode' && sameSetting(ours[key], base[key])) into[key] = theirs[key];
  }
  // The pan: a sous-vide on screen is this page's alone and never written,
  // and the pan under it is whichever was saved last.
  const pan = ours.startMode === 'sous' ? lastPanStart : ours.startMode;
  if (pan === storedPanStart(baseRaw)) {
    lastPanStart = storedPanStart(theirRaw);
    if (ours.startMode !== 'sous') next.startMode = lastPanStart;
  }
  return next;
}

function sameSetting(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Another tab changed storage (the page's `storage` event; a null key is a
 *  tab that cleared it all): the settings with what it wrote taken up
 *  (`takenUp`), or null if it did not touch them. */
export function settingsStoredElsewhere(key: string | null, ours: Settings): Settings | null {
  if (key !== null && key !== SETTINGS_KEY) return null;
  const text = readStorage(SETTINGS_KEY);
  if (text === settingsSeen) return null;
  const next = takenUp(ours);
  settingsSeen = text;
  return next;
}

/** The pan method in a stored record: cold or hot, and cold for anything else,
 *  including a 'sous' and no record at all. */
function storedPanStart(raw: Record<string, unknown> | null): StartMode {
  return oneOf(raw === null ? undefined : raw['startMode'], ['cold', 'hot'] as const, 'cold');
}

/* ----------------------------------------------------------- boil memory */

/** How the numbers combine - the blend, the nearest-volume scaling, the key -
 *  is core policy, re-exported above. What is left here is getting them in and
 *  out of localStorage, and refusing to load a value that is not a boil. */

/** The pans as this page last read or wrote them, as stored: anything else
 *  there is another tab's, taken up before this page writes, so that a
 *  "Forget everything" in another tab is not undone by this one's next
 *  measured boil. */
let boilSeen: string | null = null;

export function loadBoilMemory(): BoilMemory {
  boilSeen = readStorage(BOIL_KEY);
  return readBoilMemory(boilSeen);
}

function readBoilMemory(text: string | null): BoilMemory {
  const raw = parseObject(text);
  const out: BoilMemory = {};
  if (raw === null) return out;
  for (const key of Object.keys(raw)) {
    const seconds = Number(raw[key]);
    if (isWithin(seconds, LIMITS.timeToBoil_s)) out[key] = seconds;
  }
  return out;
}

/** Record a measured boil and write it through. The blend itself - so that one
 *  odd run (lid off, pan half empty) does not dominate - is `rememberBoil`. */
export function rememberTimeToBoil(
  memory: BoilMemory, litres: number, seconds: number,
): BoilMemory {
  // Blended into the pans as stored now, if another tab changed them.
  const text = readStorage(BOIL_KEY);
  const now = text === boilSeen ? memory : readBoilMemory(text);
  const updated = rememberBoil(now, clampLitres(litres), seconds);
  if (updated === now) return now;
  writeStorage(BOIL_KEY, JSON.stringify(updated));
  boilSeen = readStorage(BOIL_KEY);
  return updated;
}

/** Another tab changed storage: the pans as it left them, or null if it did
 *  not touch them. */
export function boilStoredElsewhere(key: string | null): BoilMemory | null {
  if (key !== null && key !== BOIL_KEY) return null;
  const text = readStorage(BOIL_KEY);
  if (text === boilSeen) return null;
  boilSeen = text;
  return readBoilMemory(text);
}

/** Forget every measured pan. Paired with the calibration reset: someone
 *  taking their learning back usually means the whole kitchen. */
export function clearBoilMemory(): void {
  removeStorage(BOIL_KEY);
  boilSeen = null;
}

function clampLitres(litres: number): number {
  return clampNumber(litres, LIMITS.waterLitres, DEFAULT_SETTINGS.waterLitres);
}

/* ------------------------------------------------------------ the cook */

/**
 * A cook in progress, so a reload does not lose the egg
 * (design/one-screen.md section 4, "What is stored").
 *
 * A running cook is its start, its choices and its events, all clock times
 * (src/core/running.ts), so writing it down is all a reload needs: the plan
 * is derived from it again. With it, whether its egg has been written down,
 * and the lean last decided, the interim while its surface is rebuilt.
 *
 * The alarm is a timer in this tab and dies with it, so unlike iOS there is no
 * notification still counting down to contradict. Whether a cook is still
 * worth restoring is core's `cookTooOld`, asked of its plan by the caller.
 */
export interface StoredCook {
  cook: RunningCook;
  answers: KeptAnswers;
  leanHint_s: number;
}

/** Whether the egg has been written down with an answer, as a cook keeps it
 *  (src/ui/feedback.ts): an egg answered on the page that wrote it is kept as
 *  answered before a reload, which is what it is when it is read back. */
export type KeptAnswers = 'none' | 'beforeReload';

export function saveCook(cook: RunningCook, answers: KeptAnswers, leanHint_s: number): void {
  writeStorage(COOK_KEY, JSON.stringify({ cook: cook, answers: answers, leanHint_s: leanHint_s }));
}

/** The cook written down, whole, or null: none, or one this build cannot
 *  read (`readRunningCook`), which the caller keeps aside (`storedCookText`).
 *  One without a known `answers` is refused rather than read as unanswered,
 *  which would log its egg a second time. */
export function loadCook(): StoredCook | null {
  removeStorage(SUPERSEDED_COOK_KEY);
  return readStoredCook(readStorage(COOK_KEY));
}

/** A stored cook's text read as `loadCook` reads it. */
export function readStoredCook(text: string | null): StoredCook | null {
  const raw = parseObject(text);
  if (raw === null) return null;
  const cook = readRunningCook(raw['cook']);
  if (cook === null) return null;
  const answers = raw['answers'];
  if (answers !== 'none' && answers !== 'beforeReload') return null;
  const hint = raw['leanHint_s'];
  if (typeof hint !== 'number' || !Number.isFinite(hint)) return null;
  return { cook: cook, answers: answers, leanHint_s: hint };
}

/** Forget the cook written down, if it is the one started at `id_ms`: a
 *  cook another tab started and wrote since is that tab's, and stays. */
export function clearCook(id_ms: number): void {
  const raw = parseObject(readStorage(COOK_KEY));
  const cook = raw === null ? null : raw['cook'];
  const stored = cook !== null && typeof cook === 'object' ? (cook as Record<string, unknown>)['id_ms'] : undefined;
  if (raw === null || stored === undefined || stored === id_ms) removeStorage(COOK_KEY);
}

/** Forget whatever is written down: a cook this build cannot read, once
 *  kept aside. */
export function dropStoredCook(): void {
  removeStorage(COOK_KEY);
}

/** The cooks earlier builds wrote under the old keys (`aet.cook.v2`,
 *  `aet.cook.v3`), as stored, oldest key first: each read once and deleted,
 *  so the caller keeps them aside (DECISIONS.md 81, 97; review 2.6). Nothing
 *  else reads those keys. */
export function takeOldCooks(): string[] {
  const out: string[] = [];
  for (const key of OLD_COOK_KEYS) {
    const text = readStorage(key);
    removeStorage(key);
    if (text !== null) out.push(text);
  }
  return out;
}

/** Whether a change of storage (the page's `storage` event; a null key is
 *  a tab that cleared it all) may have touched the cook in progress. */
export function cookStoredElsewhere(key: string | null): boolean {
  return key === null || key === COOK_KEY;
}

/** The stored cook as it is now, whichever tab wrote it, or null: what
 *  sharing holds back (`openEggId`). */
export function storedCook(): RunningCook | null {
  return loadCook()?.cook ?? null;
}

/** The lean last decided, a cache, written beside the stored cook if it is
 *  the one started at `id_ms`, without writing the cook: a plan alone never
 *  writes a tab's copy of the cook over another's (running-cook review 1.2). */
export function saveLeanHint(id_ms: number, leanHint_s: number): void {
  const raw = parseObject(readStorage(COOK_KEY));
  if (raw === null || raw['leanHint_s'] === leanHint_s) return;
  const cook = raw['cook'];
  if (cook === null || typeof cook !== 'object' || (cook as Record<string, unknown>)['id_ms'] !== id_ms) return;
  writeStorage(COOK_KEY, JSON.stringify({ ...raw, leanHint_s: leanHint_s }));
}

/**
 * `ours` with what another tab wrote for the same cook taken up (running-cook
 * review 1.2): what it saw in the one pan that this tab has not. The two are
 * one cook, the same id, so neither copy corrects the other, and the events
 * are each the earliest seen: the boil tapped first; a pull by the cook over
 * one the clock assumed (`timeout`), and of two alike the earlier; the
 * cooling's end of the pull kept; the pull that rang, if it rang under the
 * boil kept; and the plan as it ran, if it is of the pull kept. `ours`, the
 * same object, when there is nothing to take up, and always for another
 * cook: a tab never takes up a cook another tab started (DECISIONS.md 97).
 * Taken up both ways, two tabs end with the same events.
 *
 * From a copy whose start or choices differ from ours (onescreen review
 * 1.1), only the cook's own observations: the boil tap and a pull the cook
 * tapped, which are what was seen in the pan whatever either tab was told.
 * Never what that copy's clock decided from a plan this tab has corrected
 * away from - the pull ringing, a pull it assumed when the grace ran out
 * (`timeout`), the cooling's end - which would end this tab's cook on
 * another's time.
 */
export function takeUpEvents(ours: RunningCook, theirs: RunningCook): RunningCook {
  if (theirs.id_ms !== ours.id_ms) return ours;
  const same = sameCorrections(ours, theirs);
  const a = ours.events;
  const b = theirs.events;
  const boil = earlier(a.boilAt_s, b.boilAt_s);
  const theirPull = same || (b.pulled !== null && b.pulled.by === 'cook') ? b.pulled : null;
  const pulled = betterPull(a.pulled, theirPull);
  const cooled = earlier(
    samePull(pulled, a.pulled) ? a.cooledAt_s : null, same && samePull(pulled, b.pulled) ? b.cooledAt_s : null,
  );
  const rang = earlier(a.boilAt_s === boil ? a.rangAt_s : null, same && b.boilAt_s === boil ? b.rangAt_s : null);
  const events: CookEvents = { boilAt_s: boil, pulled: pulled, cooledAt_s: cooled, rangAt_s: rang };
  // The plan as it ran is of one pull's cook time, and of the cook as last
  // corrected: ours if it still is, else theirs if it is.
  const fits = (r: CookAsRan | null): boolean => r !== null && pulled !== null
    && r.cook_s === pulled.due_s - ours.startedAt_s && r.correctedAt_s === ours.correctedAt_s;
  const asRan = fits(ours.asRan) ? ours.asRan : fits(theirs.asRan) ? theirs.asRan : null;
  if (JSON.stringify(events) === JSON.stringify(a) && asRan === ours.asRan) return ours;
  return { ...ours, events: events, asRan: asRan };
}

/** Whether two copies of one cook were told the same: the same start and
 *  choices, so the same plan, and what either's clock decided is the other's
 *  too. */
function sameCorrections(a: RunningCook, b: RunningCook): boolean {
  return a.startedAt_s === b.startedAt_s && sameChoices(a.choices, b.choices);
}

/** Whether copy `a` of a cook was corrected after copy `b` was: a reload
 *  should restore the latest correction, so `a` is not written over by `b`
 *  (cook.ts, `persistCook`). */
export function correctedLater(a: RunningCook, b: RunningCook): boolean {
  return a.correctedAt_s !== null && (b.correctedAt_s === null || a.correctedAt_s > b.correctedAt_s);
}

function earlier(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function samePull(a: Pulled | null, b: Pulled | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The pull to keep of two: the cook's tap over the clock's assumption, and
 *  of two alike the earlier out, then the earlier due. */
function betterPull(a: Pulled | null, b: Pulled | null): Pulled | null {
  if (a === null) return b;
  if (b === null) return a;
  if (a.by !== b.by) return a.by === 'cook' ? a : b;
  if (a.out_s !== b.out_s) return a.out_s < b.out_s ? a : b;
  return a.due_s <= b.due_s ? a : b;
}

/** The cook as stored, for keeping aside one this build cannot read. */
export function storedCookText(): string | null {
  return readStorage(COOK_KEY);
}
