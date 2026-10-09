/**
 * Persistence: localStorage in, localStorage out.
 *
 * Everything here must survive localStorage being absent, disabled, full, or
 * throwing (Safari private mode throws on setItem).
 *
 * The BOUNDS and the DEFAULTS are core's (`src/core/inputs.ts`), so the
 * two apps share one set. This module applies them; it does not decide them.
 */

import { SizeClass } from '../core/geometry.js';
import { UnitSystem, readChosenUnits } from '../core/units.js';
import { FRESH_LANGUAGE, LANGUAGES, LanguageState, readLanguageState } from '../core/language.js';
import { StartMode, Cooling, HeatAfterBoil } from '../core/protocol.js';
import { AlarmSound, DEFAULT_ALARM_SOUND, readAlarmSound } from '../core/sounds.js';
import { BoilMemory, rememberBoil } from '../core/boil.js';
import { DEFAULTS, LIMITS, Limit, carrySizeIndex, clamp, isWithin } from '../core/inputs.js';
import { RunningCook, readRunningCook } from '../core/running.js';
import { WriterVerdict, parseVersion, writerCheck } from '../core/newer.js';
import { send } from './send.js';

export type { Limit } from '../core/inputs.js';
export { LIMITS, START_TEMP_PRESETS_C } from '../core/inputs.js';
export { estimateTimeToBoil, hasBoilMemory } from '../core/boil.js';

const SETTINGS_KEY = 'aet.settings.v1';
const COOK_KEY = 'aet.cook.v5';
const BOIL_KEY = 'aet.boil.v1';

/**
 * Every key an earlier build of this app wrote that this one does not read,
 * deleted at boot (`claimStorage`) rather than left in storage being neither
 * read nor collected: the posteriors before the log (`v1`-`v3`), the log of
 * 0.3 and 0.4 (`v4`; the log starts fresh in 0.5, DECISIONS.md 107), the
 * copies 0.4 kept aside of what it could not read, and the cooks in progress
 * before this one's shape (`aet.cook.v1`-`v4`; `v5` keeps a cook's log).
 */
export const RETIRED_KEYS = [
  'aet.calibration.v1', 'aet.calibration.v2', 'aet.calibration.v3', 'aet.calibration.v4',
  'aet.calibration.v4.unread', 'aet.cook.unread', 'aet.cook.v1', 'aet.cook.v2', 'aet.cook.v3', 'aet.cook.v4',
];

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
  /** Which sound the alarm makes (`ALARM_SOUNDS`, DECISIONS.md 101). */
  alarm: AlarmSound;
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
  alarm: DEFAULT_ALARM_SOUND,
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

/** Every write the app makes, of every store, comes through here or through
 *  `removeStorage`, so the guard below holds for all of them. */
export function writeStorage(key: string, value: string): void {
  if (!mayWrite()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode, quota, or no storage at all: carry on without memory. */
  }
}

export function removeStorage(key: string): void {
  if (!mayWrite()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing stored means nothing to remove. */
  }
}

/* ------------------------------------------------- the newest build's mark */

/**
 * The newest version of the app that has run in this browser
 * (DECISIONS.md 100). An older build writes what it stores whole, from the
 * fields it knows, and drops what a newer one added, so a build that finds a
 * newer version here writes nothing at all for the rest of the page's life:
 * no setting, pan, cook, result or sharing state. It still times the egg. Whether it may write is core's `writerCheck`.
 *
 * The mark is written before anything else, and checked again before every
 * write: a tab of a newer build opened since, or a tab that cleared the
 * storage, is seen at this page's next write even if its `storage` event
 * has not yet arrived. Never removed: "Start learning again" keeps it.
 */
const NEWEST_KEY = 'aet.newest';

/** This build's version, once `claimStorage` has been called; until then
 *  (tests, tools) every write goes through unguarded. The page's own: the
 *  browser's storage is one for the page. */
let mine: string | null = null;
let readOnly = false;

/**
 * Before anything is read for writing back, or written: compare the mark
 * with this build, and write this build's version there if it is not older
 * than what is there; then, if this build may write, delete the keys no
 * build from this one on reads (`RETIRED_KEYS`). A build that finds a newer
 * mark deletes nothing. Says what this page does with the stores from now on.
 * When it stops writing, then or later, the page is told once (`leftAlone`).
 */
export function claimStorage(version: string): WriterVerdict {
  mine = version;
  readOnly = false;
  mayWrite();
  for (const key of RETIRED_KEYS) if (readStorage(key) !== null) removeStorage(key);
  return readOnly ? 'readOnly' : 'write';
}

/** Whether a newer build has run here since this page started: if so this
 *  page writes nothing, sends nothing and learns nothing. */
export function storageReadOnly(): boolean {
  return readOnly;
}

/** The mark as stored, and this build's verdict on it; the mark brought up
 *  to this build when it may write. */
function mayWrite(): boolean {
  if (mine === null) return true;
  if (readOnly) return false;
  const mark = readStorage(NEWEST_KEY);
  if (writerCheck(mark, mine) === 'readOnly') {
    leftAlone();
    return false;
  }
  if (mark !== mine && parseVersion(mine) !== null) {
    try {
      window.localStorage.setItem(NEWEST_KEY, mine);
    } catch {
      /* no storage: nothing else will be written either. */
    }
  }
  return true;
}

/** Another tab changed storage (the page's `storage` event; a null key is a
 *  tab that cleared it all): whether it was a newer build's, which this
 *  page has now stopped writing for. */
export function newerStoredElsewhere(key: string | null): boolean {
  if (mine === null || readOnly || (key !== null && key !== NEWEST_KEY)) return false;
  if (writerCheck(readStorage(NEWEST_KEY), mine) === 'write') return false;
  leftAlone();
  return true;
}

/**
 * A newer build has run in this browser, found at boot or told of later:
 * what this page stores is left alone from now on. The page is told (the
 * `stores` message): the line at the top of every view says so, and the
 * questions after an egg, sharing and "Start learning again" go, since
 * nothing they do could be kept. The timer runs as before.
 */
function leftAlone(): void {
  readOnly = true;
  send({ kind: 'stores' });
}

/* ------------------------------------------- a store kept across the tabs */

/** Another tab's write, taken up: what it wrote, and what this page had last
 *  read or written there before it, for a store merged field by field. */
export interface Taken<T> {
  theirs: T;
  base(): T;
}

/**
 * One store kept in step with the other tabs open on the site. Every tab
 * writes a store whole, so a tab that wrote back what it loaded would undo
 * whatever another tab wrote since. The key remembers the text this page
 * last read or wrote; anything else found there is another tab's, taken up
 * (`takeUp`) before this page acts on the store, and when the page's
 * `storage` event names the key (`elsewhere`).
 *
 * Text that does not read is `parse`'s to refuse, as an empty store or
 * null. A write goes through `writeStorage`, so it stops at a newer build's
 * mark, and is read back: a write that failed leaves the store as it was,
 * which is then not another tab's.
 *
 * A store taken up that `writesBack` refuses is not this page's to write
 * (`owns`) until its own next load, write or removal: a store it would not
 * have written, written back unchanged, would answer another build's every
 * write with one of its own.
 */
export interface SyncedKey<T> {
  readonly key: string;
  /** The text stored now, whichever tab wrote it; nothing taken up. */
  text(): string | null;
  /** What is stored now; nothing taken up. */
  peek(): T;
  /** What is stored now, as this page's own from here on. */
  load(): T;
  /** What another tab wrote since this page last read or wrote the key, or
   *  null if nothing; from now on it is what this page has seen. */
  takeUp(): Taken<T> | null;
  /** `takeUp`, if the `storage` event's key is this one (null: a tab
   *  cleared all storage). */
  elsewhere(eventKey: string | null): Taken<T> | null;
  touches(eventKey: string | null): boolean;
  /** Write `text`; what reads back. */
  write(text: string): string | null;
  remove(): void;
  owns(): boolean;
}

export function syncedKey<T>(
  key: string, parse: (text: string | null) => T, writesBack: (theirs: T) => boolean = () => true,
): SyncedKey<T> {
  let seen: string | null = null;
  let own = true;
  const mark = (text: string | null): string | null => {
    seen = text;
    own = true;
    return text;
  };
  const self: SyncedKey<T> = {
    key: key,
    text: () => readStorage(key),
    peek: () => parse(readStorage(key)),
    load: () => parse(mark(readStorage(key))),
    takeUp: () => {
      const text = readStorage(key);
      if (text === seen) return null;
      const base = seen;
      seen = text;
      const theirs = parse(text);
      own = writesBack(theirs);
      return { theirs: theirs, base: () => parse(base) };
    },
    elsewhere: (eventKey) => (self.touches(eventKey) ? self.takeUp() : null),
    touches: (eventKey) => eventKey === null || eventKey === key,
    write: (text) => {
      writeStorage(key, text);
      return mark(readStorage(key));
    },
    remove: () => {
      removeStorage(key);
      mark(readStorage(key));
    },
    owns: () => own,
  };
  return self;
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
/** The settings as stored, each tab's change taken up by the others before
 *  they write (`takenUp`). */
const settingsStore = syncedKey(SETTINGS_KEY, parseObject);
/** The size table the settings were read against (`loadSettings`). */
let settingsClasses: SizeClass[] = [];

/** `classes` is the table the app is showing now, which need not be the one
 *  the record was saved against. */
export function loadSettings(classes: SizeClass[]): Settings {
  settingsClasses = classes;
  const raw = settingsStore.load();
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
    // Absent from every settings record before 9 October 2026: the default.
    alarm: readAlarmSound(raw['alarm']),
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
  const raw = settingsStore.peek();
  return raw === null ? FRESH_LANGUAGE : readLanguageState(raw['language'], LANGUAGES);
}

/** Sous-vide is never remembered. Its answer is a start time in the past - a
 *  58 °C bath wants most of a day - so an app that reopened on it would greet
 *  the cook by telling them they are 22 hours late, which is a bad first
 *  choice. It is still a choice for as long as the page is open; what is saved
 *  in its place is whatever pan was saved before it, cold or hot, so a reload
 *  comes back to the last pan the cook used. `loadSettings` comes first. */
export function saveSettings(settings: Settings): Settings {
  const next = takenUp(settings, settingsStore.takeUp());
  if (next.startMode !== 'sous') lastPanStart = next.startMode;
  settingsStore.write(JSON.stringify({ ...next, startMode: lastPanStart }));
  return next;
}

/**
 * The settings with what another tab wrote since this page last read or
 * wrote them taken up: each setting this page has not changed since then
 * becomes the other tab's, and each one it has changed stays its own. The
 * settings given, as they are, when no other tab wrote; what is written is
 * what comes back, so the page shows it.
 */
function takenUp(ours: Settings, taken: Taken<Record<string, unknown> | null> | null): Settings {
  if (taken === null) return ours;
  const baseRaw = taken.base();
  const theirRaw = taken.theirs;
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
  const taken = settingsStore.elsewhere(key);
  return taken === null ? null : takenUp(ours, taken);
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

/** The pans as stored: another tab's write is taken up before this page
 *  writes, so that a "Forget everything" in another tab is not undone by
 *  this one's next measured boil. */
const boilStore = syncedKey(BOIL_KEY, readBoilMemory);

export function loadBoilMemory(): BoilMemory {
  return boilStore.load();
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
  const taken = boilStore.takeUp();
  const now = taken === null ? memory : taken.theirs;
  const updated = rememberBoil(now, clampLitres(litres), seconds);
  if (updated === now) return now;
  boilStore.write(JSON.stringify(updated));
  return updated;
}

/** Another tab changed storage: the pans as it left them, or null if it did
 *  not touch them. */
export function boilStoredElsewhere(key: string | null): BoilMemory | null {
  return boilStore.elsewhere(key)?.theirs ?? null;
}

/** Forget every measured pan. Paired with the calibration reset: someone
 *  taking their learning back usually means the whole kitchen. */
export function clearBoilMemory(): void {
  boilStore.remove();
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

/**
 * The cook as stored, whichever tab wrote it. What this tab last read or
 * wrote there is what it has seen; another tab's write is taken up
 * (model.ts, `elsewhere`) only when it is of this tab's own cook, by id,
 * since each tab runs the cook it started, and then only what that tab saw
 * in the pan (`takeUpEvents`).
 */
export const cookStore: SyncedKey<StoredCook | null> = syncedKey(COOK_KEY, readStoredCook);

/** Write the cook down; the text that reads back. */
export function saveCook(cook: RunningCook, answers: KeptAnswers, leanHint_s: number): string | null {
  return cookStore.write(JSON.stringify({ cook: cook, answers: answers, leanHint_s: leanHint_s }));
}

/** The cook written down, whole, or null: none, or one this build cannot
 *  read (`readRunningCook`), which the caller drops. One without a known
 *  `answers` is refused rather than read as unanswered, which would log its
 *  egg a second time. */
export function loadCook(): StoredCook | null {
  return cookStore.peek();
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
  const raw = parseObject(cookStore.text());
  const cook = raw === null ? null : raw['cook'];
  const stored = cook !== null && typeof cook === 'object' ? (cook as Record<string, unknown>)['id_ms'] : undefined;
  if (raw === null || stored === undefined || stored === id_ms) cookStore.remove();
}

/** Forget whatever is written down: a cook this build cannot read. */
export function dropStoredCook(): void {
  cookStore.remove();
}

/** The stored cook as it is now, whichever tab wrote it, or null: what
 *  sharing holds back (`openEggId`). */
export function storedCook(): RunningCook | null {
  return cookStore.peek()?.cook ?? null;
}

/** The lean last decided, a cache, written beside the stored cook if it is
 *  the one started at `id_ms`, without writing the cook: a plan alone never
 *  writes a tab's copy of the cook over another's (running-cook review 1.2). */
export function saveLeanHint(id_ms: number, leanHint_s: number): void {
  const raw = parseObject(cookStore.text());
  if (raw === null || raw['leanHint_s'] === leanHint_s) return;
  const cook = raw['cook'];
  if (cook === null || typeof cook !== 'object' || (cook as Record<string, unknown>)['id_ms'] !== id_ms) return;
  cookStore.write(JSON.stringify({ ...raw, leanHint_s: leanHint_s }));
}

/** What another tab wrote for this cook, taken up, and which copy a reload
 *  restores: core's, over the two copies' logs (src/core/running.ts). */
export { correctedLater, takeUpEvents } from '../core/running.js';

/** The cook as stored, whichever tab wrote it. */
export function storedCookText(): string | null {
  return cookStore.text();
}
