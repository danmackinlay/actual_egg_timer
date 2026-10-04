/**
 * Which catalogue the cook reads, and the one rule that moves it without
 * being asked: an English UI switched from metric to Imperial goes into the
 * English of 1750 (LANGUAGE.md section 6). Switching back to metric changes
 * nothing about the language; the cook leaves 1750 with the picker
 * (DECISIONS.md 77).
 *
 * The English of 1750 is a language with a tag of its own, `en-x-1750`: the
 * strings come from `copy/en-x-1750.json`, and the formats from the region,
 * because `formattingLocale` drops a private-use subtag. So nothing here
 * knows about numbers or clocks, only about which catalogue is on screen.
 *
 * Like the units (`chooseUnits` in `units.ts`), the cook's own choice is kept
 * apart from the default. `chosen` is what the cook picked, or null if they
 * never have, in which case the app speaks `DEFAULT_LANGUAGE`. A state stored
 * before 5 October 2026 may also carry `flippedFrom`, what the units switch
 * replaced, for a switch back that no longer happens; a read ignores it.
 *
 * No I/O. The web keeps this in its settings, iOS in UserDefaults.
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
  /** The catalogue on screen, or null for the default: the cook's pick, or
   *  1750 put there by the units switch. */
  chosen: string | null;
}

export const FRESH_LANGUAGE: LanguageState = { chosen: null };

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
 * modern English goes into 1750. Imperial to metric leaves the language as it
 * is, as does any switch in another language or in 1750 already.
 */
export function languageAfterFlip(state: LanguageState, flip: UnitsFlip): LanguageState {
  if (flip !== 'metricToImperial') return state;
  if (!isModernEnglish(effectiveLanguage(state))) return state;
  return { chosen: PERIOD_LANGUAGE };
}

/** The language after the cook picks one: choosing English leaves 1750 and
 *  keeps °F. */
export function languageAfterPick(_state: LanguageState, tag: string): LanguageState {
  return { chosen: tag };
}

/** A stored state, read defensively: anything malformed is the fresh one. A
 *  tag is kept only if it is one of `known`, so a catalogue that has gone
 *  cannot be asked for. Any other field, such as the retired `flippedFrom`,
 *  is ignored. */
export function readLanguageState(raw: unknown, known: readonly string[]): LanguageState {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return FRESH_LANGUAGE;
  const chosen = (raw as Record<string, unknown>)['chosen'];
  return { chosen: typeof chosen === 'string' && known.includes(chosen) ? chosen : null };
}
