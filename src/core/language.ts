/**
 * Which catalogue the cook reads, and the one rule that moves it without
 * being asked: an English UI switched from metric to Imperial goes into the
 * English of 1750, and back to metric comes out again (LANGUAGE.md section 6).
 *
 * The English of 1750 is a language with a tag of its own, `en-x-1750`: the
 * strings come from `copy/en-x-1750.json`, and the formats from the region,
 * because `formattingLocale` drops a private-use subtag. So nothing here
 * knows about numbers or clocks, only about which catalogue is on screen.
 *
 * Like the units (`chooseUnits` in `units.ts`), the cook's own choice is kept
 * apart from the default. `chosen` is what the cook picked, or null if they
 * never have, in which case the app speaks `DEFAULT_LANGUAGE`. `flippedFrom`
 * remembers what the units switch replaced, so that switching back restores
 * it - including "never chose", which stays a default rather than becoming a
 * choice the cook never made.
 *
 * No I/O. The web keeps this in its settings; iOS will when it follows.
 */

import { languageOf } from './format.js';
import { UnitsFlip } from './units.js';

/** The catalogue a fresh install reads. */
export const DEFAULT_LANGUAGE = 'en';

/** The English of 1750's catalogue tag. */
export const PERIOD_LANGUAGE = 'en-x-1750';

/** Every catalogue the picker offers, in its order. */
export const LANGUAGES: readonly string[] = [DEFAULT_LANGUAGE, PERIOD_LANGUAGE];

/** The private-use subtag that marks the register. */
const PERIOD_SUBTAG = 'x-1750';

export interface LanguageState {
  /** The catalogue the cook chose, or null for the default. */
  chosen: string | null;
  /** When the units switch put the cook into 1750, what `chosen` was before
   *  it did, in a box so that a null choice can be remembered. Null when the
   *  1750 on screen, if any, is not the switch's doing. */
  flippedFrom: { chosen: string | null } | null;
}

export const FRESH_LANGUAGE: LanguageState = { chosen: null, flippedFrom: null };

/** The catalogue on screen. */
export function effectiveLanguage(state: LanguageState): string {
  return state.chosen ?? DEFAULT_LANGUAGE;
}

/** Whether a tag is the English of 1750, in any region: `en-x-1750`,
 *  `en-US-x-1750`. */
export function isPeriod(tag: string): boolean {
  const lower = tag.toLowerCase();
  return languageOf(lower) === 'en' && (lower.endsWith(`-${PERIOD_SUBTAG}`) || lower.includes(`-${PERIOD_SUBTAG}-`));
}

/** Whether a tag is the English of today: English, not 1750. Only a cook
 *  reading this is moved by the units switch; a Czech UI is not. */
export function isModernEnglish(tag: string): boolean {
  return languageOf(tag) === 'en' && !isPeriod(tag);
}

/** The record's `register` (INFERENCE.md section 4): what kind of English the
 *  answers were given in. */
export function registerOf(tag: string): '1750' | 'modern' {
  return isPeriod(tag) ? '1750' : 'modern';
}

/**
 * The language after the cook's own switch of units. Metric to Imperial in
 * modern English goes into 1750 and remembers what it left; Imperial to
 * metric comes back to it, if the switch was what put the cook there. Any
 * other language, or a 1750 the cook chose in the picker, is left alone.
 */
export function languageAfterFlip(state: LanguageState, flip: UnitsFlip): LanguageState {
  if (flip === 'metricToImperial') {
    if (!isModernEnglish(effectiveLanguage(state))) return state;
    return { chosen: PERIOD_LANGUAGE, flippedFrom: { chosen: state.chosen } };
  }
  if (state.flippedFrom === null) return state;
  return { chosen: state.flippedFrom.chosen, flippedFrom: null };
}

/** The language after the cook picks one. A pick is always the cook's own, so
 *  it forgets what the units switch did: choosing English leaves 1750 and
 *  keeps °F, and a later switch to metric does not undo a pick. */
export function languageAfterPick(_state: LanguageState, tag: string): LanguageState {
  return { chosen: tag, flippedFrom: null };
}

/** A stored state, read defensively: anything malformed is the fresh one. A
 *  tag is kept only if it is one of `known`, so a catalogue that has gone
 *  cannot be asked for. */
export function readLanguageState(raw: unknown, known: readonly string[]): LanguageState {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return FRESH_LANGUAGE;
  const r = raw as Record<string, unknown>;
  const tag = (v: unknown): string | null => (typeof v === 'string' && known.includes(v) ? v : null);
  const chosen = tag(r['chosen']);
  const from = r['flippedFrom'];
  let flippedFrom: LanguageState['flippedFrom'] = null;
  if (from !== null && typeof from === 'object' && !Array.isArray(from)) {
    flippedFrom = { chosen: tag((from as Record<string, unknown>)['chosen']) };
  }
  // A remembered switch only means something while 1750 is on screen.
  if (chosen === null || !isPeriod(chosen)) flippedFrom = null;
  return { chosen: chosen, flippedFrom: flippedFrom };
}
