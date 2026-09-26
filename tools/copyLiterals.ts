/**
 * The iOS half of the proof that Phase F1 moved the words without changing
 * one: every string literal the Swift app, widget and core used to put on
 * screen, set against the catalogue entry that replaced it.
 *
 *   npm run build
 *   node dist/tools/copyLiterals.js <base-ref>
 *
 * `base-ref` is the last commit before the move (942623d). The web half is
 * tools/copy-snapshot.html, which renders the running app; nothing like that
 * exists for SwiftUI short of screenshots, so this side is proved on the
 * source instead, mechanically:
 *
 *  1. Every Swift string literal in ios/App, ios/Widget, ios/Shared and the
 *     core's sources is extracted, at the base ref and now, with `+`
 *     concatenations joined and each `\(...)` interpolation reduced to `{}`.
 *  2. At the base, every literal that is not on the NOT_COPY list below must
 *     be matched by a template of a key the iOS side now uses. A template
 *     matches when it is the literal with each placeholder standing where the
 *     literal had an interpolation or a number - "Small — {grams} g" matches
 *     "Small — 48 g", and "{hours} h" matches "\(hours) h". Nothing else may
 *     differ, not a space.
 *  3. Now, every template of every key the iOS side uses must match some
 *     literal from the base in the same way - so no key renders words that
 *     were not on screen before.
 *  4. Now, no literal is left that is not a key or on the NOT_COPY list.
 *
 * Four old literals were not moved whole, because they were English grammar
 * written as code; RESTRUCTURED says what each became and the expansion that
 * is checked in its place.
 *
 * What this does not prove: that each key is rendered with the right argument
 * in the right slot, or on the right branch. Those are one-line call sites,
 * reviewed in the diff and built by xcodebuild; the renderer itself is held to
 * the web's by fixtures/copy.json.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Message, parseCatalogue, placeholders, templatesOf } from '../src/core/copy.js';

const DIRS = ['ios/App', 'ios/Widget', 'ios/Shared', 'ios/EggTimerCore/Sources/EggTimerCore'];

/** Literals that are not words on a screen, and why. Exact raw text. */
const NOT_COPY: Record<string, string> = {
  // storage keys and identifiers
  'calibration.v2': 'UserDefaults key',
  'calibration.v1': 'UserDefaults key',
  boilMemory: 'UserDefaults key',
  cookInProgress: 'UserDefaults key',
  doneness: 'UserDefaults key',
  eggMassG: 'UserDefaults key',
  sizeIndex: 'UserDefaults key',
  altitudeM: 'UserDefaults key',
  waterLitres: 'UserDefaults key',
  eggCount: 'UserDefaults key',
  fromFridge: 'UserDefaults key',
  start: 'UserDefaults key',
  coldStart: 'UserDefaults key',
  heatOff: 'UserDefaults key',
  cooling: 'UserDefaults key',
  'cook.pull': 'notification identifier',
  'cook.cool': 'notification identifier',
  // SF Symbols
  'flame.fill': 'SF Symbol',
  timer: 'SF Symbol',
  'bell.fill': 'SF Symbol',
  snowflake: 'SF Symbol',
  'checkmark.circle.fill': 'SF Symbol',
  // number and date formats: F4 (locale formatting) owns these
  '%d:%02d': 'clock format, F4',
  'HH:mm:ss': 'clock format, F4',
  'HH:mm': 'clock format, F4',
  EEEE: 'weekday format, F4',
  '%.0f': 'number format, F4',
  '%.1f': 'number format, F4',
  '%.2f': 'number format, F4',
  '{}': 'a number on its own, "\\(value)"',
  '--:--': 'the empty clock, not words',
  ' ': 'a spacer that keeps a line\'s height while learning',
  '': 'the empty string',
  // the catalogue's own plumbing (Shared/Copy.swift)
  en: 'locale tag',
  json: 'file extension',
  copy: 'bundle folder',
  'copy/{}.json is not in the bundle - see the copy folder in ios/project.yml': 'developer error, never shown',
  'copy/{}.json: {}': 'developer error, never shown',
  // core values that are not shown
  US: 'region code',
  IDLE: 'phase name, never shown',
  HEATING: 'phase name, never shown',
  COOKING: 'phase name, never shown',
  PULL: 'phase name, never shown',
  COOLING: 'phase name, never shown',
  DONE: 'phase name, never shown',
  // E1's record (INFERENCE.md §4), merged after the move: schema, never shown
  'calibration.v3': 'UserDefaults key',
  CFBundleShortVersionString: 'Info.plist key',
  unknown: 'record field value, never shown',
  '%04d-%02d-%02d': 'record day format, never shown',
  '2026-09': 'record date prefix, never shown',
  class: 'record field value, never shown',
  mass_g: 'record field name',
  eggStart_C: 'record field name',
  ambient_C: 'record field name',
  boiling_C: 'record field name',
  timeToBoil_s: 'record field name',
  modern: 'record field value (register), never shown',
  recommended_s: 'record field name',
  nudge_s: 'record field name',
  pulled_s: 'record field name',
  cooled_s: 'record field name',
  'probe readings arrive in E4': 'decoding error, never shown',
};

/** Old literals that were grammar in code, what each became, and the strings
 *  checked in their place. */
const RESTRUCTURED: Record<string, { became: string; expansions: string[] }> = {
  'tuned on {} {} · ±{}%': {
    became: 'learned.tuned, a plural message: the second slot was "egg" or "eggs"',
    expansions: ['tuned on {} egg · ±{}%', 'tuned on {} eggs · ±{}%'],
  },
  egg: { became: 'the singular form of learned.tuned', expansions: [] },
  eggs: { became: 'the plural form of learned.tuned', expansions: [] },
  ' (assumed)': {
    became: 'pan.timeToBoil.assumed, "{time} (assumed)": it was appended to the clock',
    expansions: ['{} (assumed)'],
  },
  '%.2f L': {
    became: 'the number format "%.2f" kept in code, and format.litres "{value} L"',
    expansions: ['{} L'],
  },
  '%.0f m': {
    became: 'the number format "%.0f" kept in code, and format.metres "{value} m"',
    expansions: ['{} m'],
  },
};

/* ------------------------------------------------------------- the lexer */

/** A literal, and whether it is a dictionary key - `"grams": .int(68)` - which
 *  is an argument's name rather than a word. */
interface Literal { text: string; argument: boolean }

/** Every string literal in Swift source, `+` chains joined, interpolations
 *  as `{}`. Comments are skipped; nested literals inside an interpolation are
 *  literals of their own (a `specifier: "%.1f"`). */
function literals(source: string): Literal[] {
  const out: Literal[] = [];
  let i = 0;
  let pending: string | null = null;

  // A colon straight after the quote is a dictionary key; a ternary's colon
  // has a space before it.
  const flush = (): void => {
    if (pending !== null) out.push({ text: pending, argument: source[i] === ':' });
    pending = null;
  };

  /** Read a literal whose opening quote is at `i`; returns its text and the
   *  index after the closing quote. */
  const read = (start: number): [string, number] => {
    let j = start + 1;
    let text = '';
    while (j < source.length && source[j] !== '"') {
      if (source[j] === '\\' && source[j + 1] === '(') {
        // An interpolation: skip to the matching paren, lexing any literal
        // inside it as a literal of its own.
        let depth = 1;
        j += 2;
        while (j < source.length && depth > 0) {
          if (source[j] === '"') {
            const [inner, next] = read(j);
            out.push({ text: inner, argument: false });
            j = next;
            continue;
          }
          if (source[j] === '(') depth += 1;
          if (source[j] === ')') depth -= 1;
          j += 1;
        }
        text += '{}';
        continue;
      }
      if (source[j] === '\\') {
        const escaped = source[j + 1];
        text += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped;
        j += 2;
        continue;
      }
      text += source[j];
      j += 1;
    }
    return [text, j + 1];
  };

  while (i < source.length) {
    if (source.startsWith('//', i)) {
      i = source.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    if (source.startsWith('/*', i)) {
      i = source.indexOf('*/', i) + 2;
      continue;
    }
    if (source[i] === '"') {
      if (source.startsWith('"""', i)) throw new Error('multi-line literal: extend the lexer');
      const [text, next] = read(i);
      pending = pending === null ? text : pending + text;
      i = next;
      // A `+` and another literal continue the chain; anything else ends it.
      const rest = /^\s*\+\s*"/.exec(source.slice(i));
      if (rest !== null) {
        i += rest[0].length - 1;
        continue;
      }
      flush();
      continue;
    }
    i += 1;
  }
  flush();
  return out;
}

function swiftFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.swift')).map((f) => join(dir, f));
}

function sourcesAt(ref: string | null): Map<string, string> {
  const files = new Map<string, string>();
  for (const dir of DIRS) {
    const names = ref === null
      ? swiftFiles(dir)
      : execFileSync('git', ['ls-tree', '--name-only', `${ref}:${dir}`], { encoding: 'utf8' })
        .split('\n').filter((f) => f.endsWith('.swift')).map((f) => join(dir, f));
    for (const name of names) {
      files.set(name, ref === null
        ? readFileSync(name, 'utf8')
        : execFileSync('git', ['show', `${ref}:${name}`], { encoding: 'utf8' }));
    }
  }
  return files;
}

/* -------------------------------------------------------------- matching */

/** "Small — {grams} g" -> a pattern that matches "Small — 48 g" and
 *  "Small — {} g", and nothing else. */
function templatePattern(template: string): RegExp {
  const parts = template.split(/\{[A-Za-z][A-Za-z0-9_]*\}/);
  const escaped = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${escaped.join('(?:\\{\\}|-?\\d+(?:\\.\\d+)?)')}$`);
}

function matches(template: string, literal: string): boolean {
  return templatePattern(template).test(literal);
}

/* ------------------------------------------------------------------ main */

const base = process.argv[2];
if (base === undefined) {
  console.error('usage: copyLiterals.js <base-ref>');
  process.exit(2);
}

const en = parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8')));
const before = [...sourcesAt(base).entries()].flatMap(([f, s]) => literals(s).map((l) => ({ file: f, ...l })));
const after = [...sourcesAt(null).entries()].flatMap(([f, s]) => literals(s).map((l) => ({ file: f, ...l })));

/** The names of arguments the catalogue takes: `"grams": .int(68)` in a call
 *  is not a word, as long as it is one of these and in key position. */
const argumentNames = new Set([...en.messages.values()]
  .flatMap((m) => templatesOf(m).flatMap(placeholders).concat(m.count === null ? [] : [m.count])));

const usedKeys = new Set(after.map((l) => l.text).filter((t) => en.messages.has(t)));
const usedTemplates = [...usedKeys].flatMap((key) => templatesOf(en.messages.get(key) as Message)
  .map((template) => ({ key: key, template: template })));

const failures: string[] = [];
const oldCopy = before.filter((l) => !(l.text in NOT_COPY));
let direct = 0;
let restructured = 0;

// 2. every old word is in a key the app now uses
for (const l of oldCopy) {
  const r = RESTRUCTURED[l.text];
  if (r !== undefined) {
    for (const expansion of r.expansions) {
      if (!usedTemplates.some((u) => matches(u.template, expansion))) {
        failures.push(`${l.file}: restructured "${l.text}" expands to "${expansion}", which no key renders`);
      }
    }
    restructured += 1;
    continue;
  }
  const hits = usedTemplates.filter((u) => matches(u.template, l.text));
  if (hits.length === 0) failures.push(`${l.file}: "${l.text}" is in no key the app uses`);
  else direct += 1;
}

// 3. every key the app uses says only what was said before
const oldTexts = oldCopy.map((l) => l.text)
  .concat(Object.values(RESTRUCTURED).flatMap((r) => r.expansions));
for (const u of usedTemplates) {
  if (!oldTexts.some((t) => matches(u.template, t))) {
    failures.push(`${u.key}: "${u.template}" matches nothing the app said before`);
  }
}

// 4. nothing is left in the code that is words
for (const l of after) {
  if (en.messages.has(l.text) || l.text in NOT_COPY) continue;
  if (l.argument && argumentNames.has(l.text)) continue;
  failures.push(`${l.file}: "${l.text}" is still a literal`);
}

console.log(`base ${base}: ${before.length} literals, ${oldCopy.length} of them words `
  + `(${direct} matched a key's template, ${restructured} restructured), `
  + `${before.length - oldCopy.length} not words.`);
console.log(`now: ${after.length} literals, ${usedKeys.size} of them catalogue keys, `
  + `${usedTemplates.length} templates checked against the old words.`);
if (failures.length > 0) {
  console.log(`\n${failures.length} failures:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('every old word is in the catalogue unchanged, and the catalogue says nothing new.');
