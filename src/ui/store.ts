/**
 * Persistence: localStorage in, localStorage out.
 *
 * Everything here must survive localStorage being absent, disabled, full, or
 * throwing (Safari private mode throws on setItem).
 *
 * The BOUNDS and the DEFAULTS are core's (`src/core/inputs.ts`), so the
 * two apps share one set. This module applies them; it does not decide them.
 */

import type { SizeClass } from '../core/geometry.ts';
import type { StartMode } from '../core/protocol.ts';
import { type BoilMemory, rememberBoil } from '../core/boil.ts';
import { LIMITS, type Limit, clamp, isWithin } from '../core/inputs.ts';
import {
  DEFAULT_SETTINGS as STORED_DEFAULT_SETTINGS, FRESH_LANGUAGE, LANGUAGES, type LanguageState, type Settings as StoredSettings,
  readLanguageState, readSettings,
} from './settings.ts';
import type { RunningCook } from '../core/running.ts';
import { type KeptAnswers, type StoredCook, readStoredCook, storedCook } from './storedCook.ts';
import { STORES, inFormat, stamped } from './stores.ts';
import { ownsApp } from './owner.ts';

export type { Limit } from '../core/inputs.ts';
export type { KeptAnswers, StoredCook } from './storedCook.ts';
export { LIMITS, START_TEMP_PRESETS_C } from '../core/inputs.ts';
export { estimateTimeToBoil, hasBoilMemory } from '../core/boil.ts';

const SETTINGS_KEY = STORES.settings.key;
const COOK_KEY = STORES.cook.key;
const BOIL_KEY = STORES.boilMemory.key;

/** Every key this build keeps (stores.ts). Any other key of this app's
 *  (`aet.`) is an earlier build's, which this one neither reads nor
 *  collects, and is deleted at boot (`sweepStorage`). */
const KEPT_KEYS: ReadonlySet<string> = new Set(Object.values(STORES).map((s) => s.key));

/** The Start control offers one more option than the solver understands.
 *  'sous' never reaches core: see choicesOf in state.ts. */
export type UiStartMode = StartMode | 'sous';

/** The settings are settings.ts's, but for the start on
 *  screen, which may be a sous-vide; a sous-vide is never stored. */
export interface Settings extends Omit<StoredSettings, 'startMode'> {
  startMode: UiStartMode;
}

export const DEFAULT_SETTINGS: Settings = STORED_DEFAULT_SETTINGS;

/* ------------------------------------------------------------- raw storage */

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Every write the app makes, of every store, comes through here or through
 *  `removeStorage`, so the guard holds for all of them: a page that does not
 *  own the app (owner.ts) writes nothing, whatever timer of its own comes
 *  round after it lost it. */
export function writeStorage(key: string, value: string): void {
  if (!ownsApp()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode, quota, or no storage at all: carry on without memory. */
  }
}

export function removeStorage(key: string): void {
  if (!ownsApp()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing stored means nothing to remove. */
  }
}

/* ------------------------------------------------------------ the sweep */

/**
 * Before anything is read for writing back, or written: delete every key of
 * this app's that this build does not keep (`KEPT_KEYS`), an earlier build's.
 */
export function sweepStorage(): void {
  for (const key of storageKeys()) if (key.startsWith('aet.') && !KEPT_KEYS.has(key)) removeStorage(key);
}

/** Every key in storage now; none if there is no storage. */
function storageKeys(): string[] {
  const keys: string[] = [];
  try {
    const storage = window.localStorage;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null) keys.push(key);
    }
  } catch {
    /* no storage: nothing to delete. */
  }
  return keys;
}

/* ------------------------------------------------------- one store's key */

/**
 * One store, under its key. Text that does not read is `parse`'s to refuse,
 * as an empty store or null. A write goes through `writeStorage`, so it
 * stops at a page that does not own the app, and is read back: a write that failed leaves the store as it was.
 */
export interface StoredKey<T> {
  readonly key: string;
  /** The text stored now. */
  text(): string | null;
  /** What is stored now. */
  load(): T;
  /** Write `text`; what reads back. */
  write(text: string): string | null;
  remove(): void;
}

export function storedKey<T>(key: string, parse: (text: string | null) => T): StoredKey<T> {
  return {
    key: key,
    text: () => readStorage(key),
    load: () => parse(readStorage(key)),
    write: (text) => {
      writeStorage(key, text);
      return readStorage(key);
    },
    remove: () => removeStorage(key),
  };
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

/** A page's settings as stored (`openSettings`). */
export type SettingsStore = ReturnType<typeof openSettings>;

/**
 * The settings as stored, read against `classes`, the table the app is
 * showing now, which need not be the one the record was saved against. One
 * per page, opened at boot (app.ts) and held by the runner (cook.ts).
 */
export function openSettings(classes: SizeClass[]) {
  const store = storedKey(SETTINGS_KEY, (text) => inFormat(STORES.settings, parseObject(text)));
  /** The pan method last saved - what a save made in sous-vide writes in
   *  its place (`save`). Read with the settings, and kept up by every save
   *  of a pan, so a save need not read storage back to find it. */
  let lastPanStart: StartMode = 'cold';

  /** The settings as stored. */
  function load(): Settings {
    const raw = store.load();
    lastPanStart = storedPanStart(raw);
    return readSettings(raw, classes);
  }

  /** Sous-vide is never remembered. Its answer is a start time in the past
   *  - a 58 °C bath wants most of a day - so an app that reopened on it
   *  would greet the cook by telling them they are 22 hours late, which is a
   *  bad first choice. It is still a choice for as long as the page is open;
   *  what is saved in its place is whatever pan was saved before it, cold
   *  or hot, so a reload comes back to the last pan the cook used. */
  function save(settings: Settings): void {
    if (settings.startMode !== 'sous') lastPanStart = settings.startMode;
    store.write(JSON.stringify(stamped(STORES.settings, { ...settings, startMode: lastPanStart })));
  }

  return { load, save };
}

/** Only the language, for choosing a catalogue before anything else is read:
 *  the page paints nothing until its words are in. */
export function loadLanguage(): LanguageState {
  const raw = inFormat(STORES.settings, parseObject(readStorage(SETTINGS_KEY)));
  return raw === null ? FRESH_LANGUAGE : readLanguageState(raw['language'], LANGUAGES);
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

/** A page's pans as stored (`openPans`). */
export type PansStore = ReturnType<typeof openPans>;

/** The pans as stored. One per page, opened at boot (app.ts) and held by
 *  the runner (cook.ts). */
export function openPans() {
  const store = storedKey(BOIL_KEY, readBoilMemory);
  return {
    load: (): BoilMemory => store.load(),
    /** Record a measured boil and write it through. The blend itself - so
     *  that one odd run (lid off, pan half empty) does not dominate - is
     *  `rememberBoil`. */
    remember(memory: BoilMemory, litres: number, seconds: number): BoilMemory {
      const updated = rememberBoil(memory, clampLitres(litres), seconds);
      if (updated === memory) return memory;
      store.write(JSON.stringify(stamped(STORES.boilMemory, { pans: updated })));
      return updated;
    },
    /** Forget every measured pan. Paired with the calibration reset: someone
     *  taking their learning back usually means the whole kitchen. */
    clear: (): void => store.remove(),
  };
}

function readBoilMemory(text: string | null): BoilMemory {
  const pans = inFormat(STORES.boilMemory, parseObject(text))?.['pans'];
  const out: BoilMemory = {};
  if (pans === null || typeof pans !== 'object' || Array.isArray(pans)) return out;
  const raw = pans as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    const seconds = Number(raw[key]);
    if (isWithin(seconds, LIMITS.timeToBoil_s)) out[key] = seconds;
  }
  return out;
}

function clampLitres(litres: number): number {
  return clampNumber(litres, LIMITS.waterLitres, DEFAULT_SETTINGS.waterLitres);
}

/* ------------------------------------------------------------ the cook */

/*
 * A cook in progress, so a reload does not lose the egg: a `StoredCook`,
 * written and read by storedCook.ts in the shape iOS stores its own. The
 * plan is derived from it again.
 *
 * The alarm is a timer in this tab and dies with it, so unlike iOS there is no
 * notification still counting down to contradict. Whether a cook is still
 * worth restoring is core's `cookTooOld`, asked of its plan by the caller.
 */

/** The cook as stored (`openCooks`), and what is written beside it. */
export interface CookStore extends StoredKey<StoredCook | null> {
  /** Write the cook down; the text that reads back. */
  save(cook: RunningCook, answers: KeptAnswers, leanHint_s: number): string | null;
  /** Forget the cook written down, if it is the one started at `id_ms`: a
   *  cook started since, while that one waited on its record, stays. */
  clear(id_ms: number): void;
  /** The lean last decided, a cache, written beside the stored cook if it
   *  is the one started at `id_ms`, without writing the cook again. */
  saveLeanHint(id_ms: number, leanHint_s: number): void;
}

/**
 * The cook as stored, or null: none, or one this build cannot read
 * (`readStoredCook`), which the caller drops. One per page, opened at boot
 * (app.ts) and held by the runner (cook.ts).
 */
export function openCooks(): CookStore {
  const key = storedKey(COOK_KEY, (text) => readStoredCook(parseObject(text)));
  /** The stored record's cook's id, read as little as it takes. */
  const idIn = (raw: Record<string, unknown> | null): unknown => {
    const cook = raw === null ? null : raw['cook'];
    return cook !== null && typeof cook === 'object' ? (cook as Record<string, unknown>)['id_ms'] : undefined;
  };
  return {
    ...key,
    save: (cook, answers, leanHint_s) => key.write(JSON.stringify(storedCook({
      cook: cook, answers: answers, leanHint_s: leanHint_s,
    }))),
    clear(id_ms) {
      const raw = parseObject(key.text());
      const stored = idIn(raw);
      if (raw === null || stored === undefined || stored === id_ms) key.remove();
    },
    saveLeanHint(id_ms, leanHint_s) {
      const raw = parseObject(key.text());
      if (raw === null || raw['leanHint_s'] === leanHint_s || idIn(raw) !== id_ms) return;
      key.write(JSON.stringify({ ...raw, leanHint_s: leanHint_s }));
    },
  };
}
