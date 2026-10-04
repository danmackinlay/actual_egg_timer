/**
 * Two checks on the words, one standing and one per rewrite.
 *
 *   npm run copy:literals
 *   node dist/tools/copyLiterals.js --since <ref> [draft]
 *
 * The first is a standing lint on the Swift sources (ios/App, ios/Widget,
 * ios/Shared and the core): every string literal, with `+` concatenations
 * joined and each `\(...)` interpolation reduced to `{}`, must be a catalogue
 * key, an argument's name in key position, or on the NOT_COPY list below with
 * the reason it is not words. So no word reaches an iOS screen without going
 * through copy/.
 *
 * The second is the proof for every rewrite once the words live in the
 * catalogue: both apps, not only iOS. It diffs copy/en.json and the keys each
 * app's source names between <ref> and the working tree, and refuses any
 * difference that is not in tools/copyDraft.ts - so a reviewer reads the
 * intended changes as a list, and nothing else changed. The draft is the one
 * named, or else the one applied to <ref>, or else the latest.
 *
 * The web half of the words is tools/copy-snapshot.html, which renders the
 * running app. What neither proves: that each key is rendered with the right
 * argument in the right slot, or on the right branch. Those are one-line call
 * sites, reviewed in the diff and built by xcodebuild; the renderer itself is
 * held to the web's by fixtures/copy.json.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseCatalogue, placeholders, templatesOf } from '../src/core/copy.js';
import { Templates, draftFor } from './copyDraft.js';

const DIRS = ['ios/App', 'ios/Widget', 'ios/Shared', 'ios/EggTimerCore/Sources/EggTimerCore'];

/** Literals that are not words on a screen, and why. Exact raw text. */
const NOT_COPY: Record<string, string> = {
  // storage keys and identifiers
  boilMemory: 'UserDefaults key',
  cookInProgress: 'UserDefaults key',
  doneness: 'UserDefaults key',
  sizeIndex: 'UserDefaults key',
  altitudeM: 'UserDefaults key',
  waterLitres: 'UserDefaults key',
  eggCount: 'UserDefaults key',
  start: 'UserDefaults key',
  heatOff: 'UserDefaults key',
  cooling: 'UserDefaults key',
  'cook.pull': 'notification identifier',
  'cook.cool': 'notification identifier',
  // SF Symbols
  'flame.fill': 'SF Symbol',
  timer: 'SF Symbol',
  'bell.fill': 'SF Symbol',
  snowflake: 'SF Symbol',
  // number formats: machine text, or formatted for the locale elsewhere
  '%d:%02d': 'clock format',
  '%.1f': 'number format',
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
  // the record (INFERENCE.md §4): schema, never shown
  CFBundleShortVersionString: 'Info.plist key',
  CFBundleVersion: 'Info.plist key',
  '{} ({})': 'the version and its build, "0.4.0 (2)": numbers, not words',
  unknown: 'record field value, never shown',
  '%04d-%02d-%02d': 'record day format, never shown',
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
  // the store and the prior (INFERENCE.md section 4): schema, never shown
  'calibration.v4': 'UserDefaults key',
  'calibration.v4.unread': 'UserDefaults key',
  'cookInProgress.unread': 'UserDefaults key',
  // the results file (Record.swift, `resultsFile`; DECISIONS.md 81): JSON
  // written to a file, never on a screen
  'actual-egg-timer-results-{}.json': 'results file name: the share sheet shows it as a file name',
  'Actual Egg Timer: every result this device kept, as it keeps them. "stored" is the app\'s store, whose "log" has one record per egg (INFERENCE.md section 4); "unread" holds any stored copy the app could not read, kept rather than overwritten.':
    'results file: its description of itself, inside the file, never on a screen',
  about: 'results file field name',
  file: 'results file field name',
  app: 'results file field name',
  appVersion: 'results file field name',
  exported: 'results file field name',
  model: 'results file field name',
  stored: 'results file field name',
  unread: 'results file field name',
  null: 'JSON null, in the results file',
  '"': 'JSON punctuation, in the results file',
  '\\"': 'JSON escape, in the results file',
  '\\\\': 'JSON escape, in the results file',
  '\\b': 'JSON escape, in the results file',
  '\\f': 'JSON escape, in the results file',
  '\\n': 'JSON escape, in the results file',
  '\\r': 'JSON escape, in the results file',
  '\\t': 'JSON escape, in the results file',
  '\\u%04x': 'JSON escape, in the results file',
  '"{}":{}': 'JSON punctuation, in the results file',
  '{': 'JSON punctuation, in the results file',
  '}': 'JSON punctuation, in the results file',
  '[': 'JSON punctuation, in the results file',
  ']': 'JSON punctuation, in the results file',
  // more literals that were never words
  weighedMassG: 'UserDefaults key',
  startTemp: 'UserDefaults key',
  customStartC: 'UserDefaults key',
  probe: 'UserDefaults key',
  probeAsked: 'UserDefaults key',
  roomC: 'UserDefaults key',
  unitsChosen: 'UserDefaults key',
  languageState: 'UserDefaults key',
  flip: 'notification userInfo key',
  unitsFlipped: 'notification name',
  s: 'string format suffix, never shown',
  'init(coder:) is not used': 'developer error, never shown',
  noAlarmPrompt: 'debug launch argument',
  seedEggs: 'debug launch argument',
  sectionAhead: 'debug launch argument',
  uiLanguage: 'debug launch argument',
  uiScreen: 'debug launch argument',
  perfProbe: 'debug launch argument',
  PERF: 'debug timing log (ios/App/Perf.swift), never shown',
  'q{}': 'debug timing log (ios/App/Perf.swift), never shown',
  soft: 'debug launch argument value',
  right: 'debug launch argument value',
  firm: 'debug launch argument value',
  // the face of 1750 (ios/App/PeriodFace.swift)
  IM_FELL_English_Roman: 'font name',
  IM_FELL_English_Italic: 'font name',
  liga: 'OpenType feature tag',
  dlig: 'OpenType feature tag',
  hist: 'OpenType feature tag',
  '{} is not registered: see UIAppFonts in project.yml': 'developer error, never shown',
  '2026-09-28': 'debug seed record date, never shown',
  '{}#{}|{}|{}|{}|{}|{}|{}': 'cache key, never shown',
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
  'clause-': 'view identifier prefix',
  'direction-info': 'view identifier',
  heating: 'view identifier',
  help: 'view identifier',
  'help-reliable': 'view identifier',
  settings: 'view identifier',
  'u{1}': 'separator character, never shown',
  'u{1}{}u{1}': 'separator-wrapped placeholder, never shown',
  '•': 'list bullet',
  '+': 'sign before a late pull, as the web draws it',
  ',': 'separator',
  '.': 'decimal point, parsed not shown',
  '0': 'digit, parsed not shown',
  ' \n ': 'two hidden lines holding a height, never shown',
  '00:00': 'digits sizing the countdown, never shown',
  '0:00': 'digits sizing the countdown, never shown',
  '0:00:00': 'digits sizing the countdown, never shown',
  'arrow.right': 'SF Symbol',
  'info.circle': 'SF Symbol',
  'info.circle.fill': 'SF Symbol',
  'name.danmackinlay.actualeggtimer': 'log subsystem',
  ring: 'log category',
  'ring stopped': 'log message, never shown',
  'audio engine: {}': 'log message, never shown',
  'audio session: {}': 'log message, never shown',
  'ringing for {}: no notification holds it': 'log message, never shown',
  '2026-10-e8': 'record model id, never shown',
  '2026-09': 'the literature population\'s id, never shown',
  population: 'bundle resource name (Calibration.swift)',
  'sharing.v1': 'UserDefaults key (Sharing.swift)',
  'sharing.attest.v1': 'UserDefaults key (Sharing.swift)',
  shareServer: 'debug launch argument (Sharing.swift)',
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
  centre_C: 'record field name',
  alpha_m2s: 'population file field name',
  cook_s: 'record field name',
  after_s: 'record field name',
  '-': 'language tag separator',
  '1750': 'language tag subtag',
  'x-1750': 'language tag subtag',
  'en-x-1750': 'locale tag',
  chosen: 'stored language state field',
  C: 'unit id, never shown (the catalogue draws units)',
  F: 'unit id, never shown',
  g: 'unit id, never shown',
  oz: 'unit id, never shown',
  mm: 'unit id, never shown',
  in: 'unit id, never shown',
  m: 'unit id, never shown',
  ft: 'unit id, never shown',
  L: 'unit id, never shown',
  qt: 'unit id, never shown',
  pt: 'unit id, never shown',
  '%.{}f': 'number format, never shown',
};

/** Old literals that were grammar in code, what each became, and the strings
 *  checked in their place. */
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

/* ------------------------------------------------- since: the catalogue */

type Entry = Record<string, unknown>;

function catalogueAt(ref: string | null): Record<string, Entry> {
  const raw = ref === null
    ? readFileSync('copy/en.json', 'utf8')
    : execFileSync('git', ['show', `${ref}:copy/en.json`], { encoding: 'utf8' });
  return (JSON.parse(raw) as { messages: Record<string, Entry> }).messages;
}

/** An entry's templates by category: `text`, or each plural form. */
function templatesByCategory(e: Entry | undefined): Templates | null {
  if (e === undefined) return null;
  const out: Templates = {};
  for (const k of ['text', 'zero', 'one', 'two', 'few', 'many', 'other']) {
    if (typeof e[k] === 'string') out[k] = e[k] as string;
  }
  return out;
}

function sameTemplates(a: Templates | null, b: Templates | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Every file that can name a key, by app, as test/copy.test.ts reads them. */
const KEY_SOURCES: Record<string, string[]> = {
  web: ['src/ui', 'src/core', 'index.html'],
  ios: ['ios/App', 'ios/Widget', 'ios/Shared', 'ios/EggTimerCore/Sources'],
};
const KEY_SHAPE = /['"`]([a-z][a-zA-Z]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+)['"`]/g;

function filesAt(ref: string | null, root: string): Map<string, string> {
  const out = new Map<string, string>();
  const ext = (f: string): boolean => f.endsWith('.ts') || f.endsWith('.swift') || f.endsWith('.html');
  if (ref === null) {
    const names = root.endsWith('.html') ? [root]
      : readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(ext).map((f) => join(root, f));
    for (const n of names) out.set(n, readFileSync(n, 'utf8'));
    return out;
  }
  const names = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, '--', root], { encoding: 'utf8' })
    .split('\n').filter(ext);
  for (const n of names) out.set(n, execFileSync('git', ['show', `${ref}:${n}`], { encoding: 'utf8' }));
  return out;
}

function keysUsed(ref: string | null, app: string, catalogue: Record<string, Entry>): Set<string> {
  const groups = new Set(Object.keys(catalogue).map((k) => k.split('.')[0]));
  const used = new Set<string>();
  for (const root of KEY_SOURCES[app]) {
    for (const text of filesAt(ref, root).values()) {
      for (const m of text.matchAll(KEY_SHAPE)) {
        if (groups.has(m[1].split('.')[0]) && m[1] in catalogue) used.add(m[1]);
      }
    }
  }
  return used;
}

function since(ref: string, draftName: string | undefined): void {
  const draft = draftFor(draftName ?? ref);
  const before = catalogueAt(ref);
  const after = catalogueAt(null);
  const drafted = new Map(draft.rows.map((d) => [d.key, d]));
  const failures: string[] = [];
  const changed: string[] = [];
  let unchanged = 0;

  for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const b = before[key];
    const a = after[key];
    const tb = templatesByCategory(b);
    const ta = templatesByCategory(a);
    const appsB = JSON.stringify(b?.['apps'] ?? []);
    const appsA = JSON.stringify(a?.['apps'] ?? []);
    const wordsSame = sameTemplates(tb, ta) && appsB === appsA
      && JSON.stringify(b?.['surface']) === JSON.stringify(a?.['surface']);
    if (wordsSame) {
      if (JSON.stringify(b) !== JSON.stringify(a) && !(key in draft.exampleOnly)) {
        failures.push(`${key}: its entry changed outside the words, and no draft says why`);
      }
      unchanged += 1;
      continue;
    }
    const d = drafted.get(key);
    if (d === undefined) {
      failures.push(`${key}: changed, and is not in the draft\n  before ${JSON.stringify(tb)} ${appsB}\n  after  ${JSON.stringify(ta)} ${appsA}`);
      continue;
    }
    if (!sameTemplates(tb, d.before) || !sameTemplates(ta, d.after)) {
      failures.push(`${key}: not the drafted wording\n  draft  ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}\n  actual ${JSON.stringify(tb)} -> ${JSON.stringify(ta)}`);
      continue;
    }
    if (appsB !== JSON.stringify(d.appsBefore) || appsA !== JSON.stringify(d.appsAfter)) {
      failures.push(`${key}: apps ${appsB} -> ${appsA}, the draft says ${JSON.stringify(d.appsBefore)} -> ${JSON.stringify(d.appsAfter)}`);
      continue;
    }
    changed.push(`  ${d.row.padEnd(22)} ${key}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)} `
      + `${appsB === appsA ? '' : `(${appsB} -> ${appsA})`}`);
  }
  for (const d of draft.rows) {
    if (!changed.some((c) => c.includes(` ${d.key}:`))) failures.push(`${d.key}: drafted, and not changed`);
  }

  // What each app's source names, against what the catalogue says it names.
  for (const app of Object.keys(KEY_SOURCES)) {
    const was = keysUsed(ref, app, before);
    const is = keysUsed(null, app, after);
    for (const key of [...new Set([...was, ...is])].sort()) {
      if (was.has(key) === is.has(key)) continue;
      const d = drafted.get(key);
      const expectBefore = d !== undefined && d.appsBefore.includes(app);
      const expectAfter = d !== undefined && d.appsAfter.includes(app);
      if (d === undefined || expectBefore !== was.has(key) || expectAfter !== is.has(key)) {
        failures.push(`${app}: ${was.has(key) ? 'stopped' : 'started'} naming ${key}, and the draft does not say so`);
      }
    }
  }

  console.log(`since ${ref}, draft on ${draft.base}: ${unchanged} keys unchanged; ${changed.length} changed, each as drafted:`);
  console.log(changed.join('\n'));
  if (failures.length > 0) {
    console.log(`\n${failures.length} failures:\n${failures.join('\n')}`);
    process.exit(1);
  }
  console.log('only the drafted strings changed, in the catalogue and in what each app names.');
}

/* ------------------------------------------------------------------ main */

if (process.argv[2] === '--since') {
  const ref = process.argv[3];
  if (ref === undefined) {
    console.error('usage: copyLiterals.js --since <ref> [draft]');
    process.exit(2);
  }
  since(ref, process.argv[4]);
  process.exit(0);
}

// No arguments: the standing lint. No literal in the Swift sources is words:
// each is a catalogue key, an argument's name in key position, or on the
// NOT_COPY list with the reason it is not copy.
const en = parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8')));
const now = [...sourcesAt(null).entries()].flatMap(([f, s]) => literals(s).map((l) => ({ file: f, ...l })));

/** The names of arguments the catalogue takes: `"grams": .int(68)` in a call
 *  is not a word, as long as it is one of these and in key position. */
const argumentNames = new Set([...en.messages.values()]
  .flatMap((m) => templatesOf(m).flatMap(placeholders).concat(m.kind === 'plural' ? [m.count] : [])));

const failures: string[] = [];
let keys = 0;
for (const l of now) {
  if (en.messages.has(l.text)) { keys += 1; continue; }
  if (l.text in NOT_COPY) continue;
  if (l.argument && argumentNames.has(l.text)) continue;
  failures.push(`${l.file}: "${l.text}" is still a literal`);
}

console.log(`${now.length} Swift literals: ${keys} catalogue keys, the rest arguments or on NOT_COPY.`);
if (failures.length > 0) {
  console.log(`\n${failures.length} failures:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('no Swift literal is words.');
