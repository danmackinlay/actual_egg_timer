/**
 * The standing lint on the words in the Swift sources.
 *
 *   npm run copy:literals
 *
 * No word reaches an iOS screen except through copy/, so what a wording
 * change changed is the catalogue's diff, which the review queue reads
 * (tools/copyQueue.ts). This holds it for the code that draws or says
 * anything: ios/App, ios/Widget, the app's logic (EggTimerApp) and what the
 * app and the widget share (EggTimerShared). Every string literal there,
 * not only a view's arguments, since a notification's body and the Live
 * Activity's text never pass through `Text(`; `+` chains joined and each
 * `\(...)` interpolation reduced to `{}`. A key is no literal: it is a
 * `CopyKey` case, which the compiler holds to the catalogue (npm run
 * copy:keys). So each literal must be an argument's name in key position, or
 * on the NOT_COPY list below with the reason it is not words.
 *
 * Not scanned, because no cook can see it:
 * - the core (EggTimerCore), pure numerics that hands the app catalogue
 *   keys, never sentences; what it says is held by fixtures/wording.json;
 * - what a debug build alone compiles: the part of an `#if DEBUG` before
 *   its `#else` (the `#else` half is the release build's, and is scanned),
 *   and the debug file, Screenshots.swift, which acts only on launch
 *   arguments a release build never reads;
 * - the files that only write and read back what the app stores (FORMAT_FILES):
 *   every literal there is a stored key, a field's name or a version's syntax.
 *
 * A NOT_COPY entry that no scanned literal needs fails too, so the list
 * holds only what the code says now.
 *
 * The web half of the words is the copy capture (tools/copyScenarios.ts,
 * tools/copySnapshot.ts), which renders the running app. What neither
 * proves: that each key is rendered with the right argument in the right
 * slot, or on the right branch. Those are one-line call sites, reviewed in
 * the diff and built by xcodebuild; the renderer itself is held to the
 * web's by fixtures/copy.json.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseCatalogue, placeholders, templatesOf } from '../src/core/copy.js';

const DIRS = [
  'ios/App', 'ios/Widget', 'ios/EggTimerCore/Sources/EggTimerApp', 'ios/EggTimerCore/Sources/EggTimerShared',
];

/** Files a release build compiles but never runs: each acts only on launch
 *  arguments, which a release build does not read. */
const DEBUG_FILES = new Set([
  'ios/EggTimerCore/Sources/EggTimerApp/Screenshots.swift',
]);

/** Files that draw and say nothing: they only write and read back what the
 *  app stores, so every literal in them is a stored field's name, a key, or
 *  the syntax of a version. */
const FORMAT_FILES = new Set([
  'ios/EggTimerCore/Sources/EggTimerApp/Newer.swift',
  'ios/EggTimerCore/Sources/EggTimerApp/Settings.swift',
  'ios/EggTimerCore/Sources/EggTimerApp/ShareQueue.swift',
  'ios/EggTimerCore/Sources/EggTimerApp/StoreRegistry.swift',
  'ios/EggTimerCore/Sources/EggTimerApp/StoredCook.swift',
]);

/** Literals that are not words on a screen, and why. Exact raw text. */
const NOT_COPY: Record<string, string> = {
  // identifiers
  start: 'debug log (CookCard.log), never shown',
  'cook.pull': 'notification identifier',
  'cook.cool': 'notification identifier',
  // SF Symbols
  'flame.fill': 'SF Symbol',
  timer: 'SF Symbol',
  'bell.fill': 'SF Symbol',
  snowflake: 'SF Symbol',
  // number formats: machine text, or formatted for the locale elsewhere
  '%d:%02d': 'clock format',
  '{}': 'a number on its own, "\\(value)"',
  '--:--': 'the empty clock, not words',
  ' ': 'a spacer that keeps a line\'s height while learning',
  '': 'the empty string',
  // the catalogue's own plumbing (EggTimerShared/Copy.swift)
  en: 'locale tag',
  json: 'file extension',
  copy: 'bundle folder',
  'copy/{}.json is not in the bundle - see the copy folder in ios/project.yml': 'developer error, never shown',
  'copy/{}.json: {}': 'developer error, never shown',
  'tr({}): given {}, takes {}': 'a debug build\'s check of a key\'s arguments, never shown',
  // the record (INFERENCE.md §4): schema, never shown
  CFBundleShortVersionString: 'Info.plist key',
  CFBundleVersion: 'Info.plist key',
  '{} ({})': 'the version and its build, "0.4.0 (2)": numbers, not words',
  unknown: 'record field value, never shown',
  '%04d-%02d-%02d': 'record day format, never shown',
  // the store and the prior (INFERENCE.md section 4): schema, never shown
  'surface|{}': 'a build\'s key in Cook, never shown',
  'before|{}': 'a build\'s key in Cook, never shown',
  'beforeSurface|{}|{}': 'a build\'s key in Cook, never shown',
  seconds: 'a readout argument\'s name, read from core\'s readoutAt',
  boiling: 'a readout argument\'s name, read from core\'s readoutAt',
  // fields of what is stored, outside the files that only hold stored formats
  pans: 'stored pans field name (Store.swift, `BoilMemories`)',
  chosen: 'stored language state field (LanguageChoice.swift)',
  // the record's own fields, as the app fills them in: never shown
  '{}+{}': 'the app version a record carries: version, plus, build number',
  'alarm-{}-{}.caf': 'bundle resource name: an alarm sound\'s file (tools/sounds.ts)',
  flip: 'notification userInfo key',
  unitsFlipped: 'notification name',
  s: 'string format suffix, never shown',
  'init(coder:) is not used': 'developer error, never shown',
  // the debug clock (EggTimerApp/AppClock.swift) and what the scripted checks
  // read and tap with (tools/iosE2e.ts)
  update: 'debug log (Screenshots.log), never shown',
  // the one screen's checks (tools/iosE2e.ts): where each part sits, and
  // what the idle screen shows
  action: 'debug log name of a part of the screen, never shown',
  main: 'debug log name of a part of the screen, never shown',
  slider: 'debug log name of a part of the screen, never shown',
  egg: 'debug log name of a part of the screen, never shown',
  sentence: 'debug log name of a part of the screen, never shown',
  '{}|{}|{}|{}': 'cache key, never shown',
  '{}|{}|{}|{}|{}': 'cache key, never shown',
  // the face of 1750 (ios/App/PeriodFace.swift)
  IM_FELL_English_Roman: 'font name',
  IM_FELL_English_Italic: 'font name',
  liga: 'OpenType feature tag',
  dlig: 'OpenType feature tag',
  hist: 'OpenType feature tag',
  '{} is not registered: see UIAppFonts in project.yml': 'developer error, never shown',
  '{}#{}|{}|{}|{}|{}|{}|{}': 'cache key, never shown',
  // links, symbols, separators and digits that size a line, the ring's
  // log, and sharing's endpoint: none of them words on a screen
  'https://github.com/danmackinlay/actual_egg_timer': 'URL',
  'https://actualeggtimer.netlify.app/privacy': 'URL',
  'https://academic.oup.com/auk/article-pdf/96/1/73/32910692/auk0073.pdf': 'URL',
  'https://doi.org/10.1002/fsn3.257': 'URL',
  'https://doi.org/10.1007/s11483-010-9200-1': 'URL',
  'https://doi.org/10.1016/j.jfoodeng.2003.06.002': 'URL',
  'https://doi.org/10.1088/0143-0807/27/1/013': 'URL',
  'https://doi.org/10.1110/ps.03242803': 'URL',
  'https://newton.ex.ac.uk/teaching/CDHW/egg/': 'URL',
  'https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/high-altitude-cooking': 'URL',
  https: 'URL scheme',
  '{}://{}': 'URL built from parts',
  'eggtimer-clause': 'URL scheme, never shown',
  'u{1}': 'separator character, never shown',
  'u{1}{}u{1}': 'separator-wrapped placeholder, never shown',
  '•': 'list bullet',
  ',': 'separator',
  '.': 'decimal point, parsed not shown',
  '0': 'digit, parsed not shown',
  ' \n ': 'two hidden lines holding a height, never shown',
  '00:00': 'digits sizing the countdown, never shown',
  '0:00': 'digits sizing the countdown, never shown',
  '0:00:00': 'digits sizing the countdown, never shown',
  'arrow.right': 'SF Symbol',
  checkmark: 'SF Symbol',
  'chevron.up.chevron.down': 'SF Symbol',
  'info.circle': 'SF Symbol',
  'info.circle.fill': 'SF Symbol',
  'name.danmackinlay.actualeggtimer': 'log subsystem',
  ring: 'log category',
  'ring stopped': 'log message, never shown',
  'audio engine: {}': 'log message, never shown',
  'audio session: {}': 'log message, never shown',
  'ringing for {}: no notification holds it': 'log message, never shown',
  'playing {} frames at {} Hz{}': 'log message, never shown',
  ', looped': 'log message, never shown',
  'no sound to play: its file is missing or unreadable': 'log message, never shown',
  population: 'bundle resource name (Calibration.swift)',
  'https://actualeggtimer.netlify.app': 'the endpoint\'s site, never shown',
  'x-egg-assertion': 'HTTP header name',
  'application/json': 'HTTP content type',
  'content-type': 'HTTP header name',
  POST: 'HTTP method',
  DELETE: 'HTTP method',
  'api/eggs': 'endpoint path',
  'api/eggs/{}': 'endpoint path',
  'api/attest': 'endpoint path',
  uid: 'endpoint field name',
  keyId: 'endpoint field name',
  attestation: 'endpoint field name',
  '%.{}f': 'number format, never shown',
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

/** `source` with what only a debug build compiles blanked, line for line:
 *  an `#if DEBUG` branch up to its `#elseif` or `#else`, and what follows
 *  the `#elseif` or `#else` of an `#if !DEBUG`. Any other condition
 *  (`os(iOS)`) is scanned on both sides, since a release build may compile
 *  either. */
function releaseOnly(source: string): string {
  // Each open `#if`: which half a debug build alone compiles (the half
  // before its `#elseif`/`#else`, the half after, or neither), and whether
  // that point is passed.
  const open: { debugOnly: 'before' | 'after' | null; past: boolean }[] = [];
  return source.split('\n').map((line) => {
    const directive = /^\s*#(if|elseif|else|endif)\b\s*(.*?)\s*(\/\/.*)?$/.exec(line);
    if (directive === null) {
      const skipped = open.some((o) => (o.debugOnly === 'before' && !o.past) || (o.debugOnly === 'after' && o.past));
      return skipped ? '' : line;
    }
    const [, word, condition] = directive;
    if (word === 'if') {
      const debugOnly = condition === 'DEBUG' ? 'before' : /^!\s*DEBUG$/.test(condition) ? 'after' : null;
      open.push({ debugOnly: debugOnly, past: false });
    } else if (word === 'endif') {
      open.pop();
    } else {
      const top = open[open.length - 1];
      if (top === undefined) throw new Error(`#${word} outside an #if`);
      top.past = true;
    }
    return '';
  }).join('\n');
}

function sources(): Map<string, string> {
  const files = new Map<string, string>();
  for (const dir of DIRS) {
    for (const name of swiftFiles(dir)) {
      if (!DEBUG_FILES.has(name) && !FORMAT_FILES.has(name)) files.set(name, releaseOnly(readFileSync(name, 'utf8')));
    }
  }
  return files;
}

/* ------------------------------------------------------------------ main */

// No literal in the Swift sources is words: each is an argument's name in key
// position, or on the NOT_COPY list with the reason it is not copy; and no
// NOT_COPY entry is one none needs.
const en = parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8')));
const now = [...sources().entries()].flatMap(([f, s]) => literals(s).map((l) => ({ file: f, ...l })));

/** The names of arguments the catalogue takes: `"grams": .int(68)` in a call
 *  is not a word, as long as it is one of these and in key position. */
const argumentNames = new Set([...en.messages.values()]
  .flatMap((m) => templatesOf(m).flatMap(placeholders).concat(m.kind === 'plural' ? [m.count] : [])));

const failures: string[] = [];
const needed = new Set<string>();
for (const l of now) {
  if (l.argument && argumentNames.has(l.text)) continue;
  if (l.text in NOT_COPY) { needed.add(l.text); continue; }
  failures.push(`${l.file}: "${l.text}" is still a literal`);
}
for (const name of [...DEBUG_FILES, ...FORMAT_FILES]) {
  if (!existsSync(name)) failures.push(`${name} is skipped and is no file; take it off its list`);
}
for (const entry of Object.keys(NOT_COPY)) {
  if (!needed.has(entry)) failures.push(`NOT_COPY: "${entry}" is no scanned literal that needs it; delete it`);
}

console.log(`${now.length} Swift literals: arguments' names, or on NOT_COPY.`);
if (failures.length > 0) {
  console.log(`\n${failures.length} failures:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('no Swift literal is words, and every NOT_COPY entry is needed.');
