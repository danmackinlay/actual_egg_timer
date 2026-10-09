/**
 * The standing lint on the words in the Swift sources.
 *
 *   npm run copy:literals
 *
 * Every string literal in ios/App, ios/Widget, ios/Shared and the core, with
 * `+` concatenations joined and each `\(...)` interpolation reduced to `{}`,
 * must be a catalogue key, an argument's name in key position, or on the
 * NOT_COPY list below with the reason it is not words. So no word reaches an
 * iOS screen without going through copy/, and what a wording change changed
 * is the catalogue's diff, which the review queue reads (tools/copyQueue.ts).
 *
 * The web half of the words is tools/copy-snapshot.html, which renders the
 * running app. What neither proves: that each key is rendered with the right
 * argument in the right slot, or on the right branch. Those are one-line call
 * sites, reviewed in the diff and built by xcodebuild; the renderer itself is
 * held to the web's by fixtures/copy.json.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseCatalogue, placeholders, templatesOf } from '../src/core/copy.js';

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
  // the running cook as stored (Cook.swift; design/one-screen.md section 4)
  'cookInProgress.v2': 'UserDefaults key',
  'cookInProgress.v3': 'UserDefaults key',
  leanHint_s: 'stored cook field name',
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
  '{}+{}': 'the app version a record carries: version, plus, build number',
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
  roomC: 'UserDefaults key',
  unitsChosen: 'UserDefaults key',
  languageState: 'UserDefaults key',
  newestVersion: 'UserDefaults key: the newest version that has run (DECISIONS.md 100)',
  alarmSound: 'UserDefaults key: the alarm sound chosen (DECISIONS.md 101)',
  'alarm-{}-{}.caf': 'bundle resource name: an alarm sound\'s file (tools/sounds.ts)',
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
  got: 'debug launch argument value',
  cookAgo: 'debug launch argument',
  doneAgo: 'debug launch argument',
  uiAnswer: 'debug launch argument',
  uiAnswerAfter: 'debug launch argument',
  provisionalAlarms: 'debug launch argument',
  muteAudio: 'debug launch argument',
  '/': 'debug launch argument separator',
  'AET {} {}\n': 'debug log (Screenshots.log), never shown',
  'aet.log': 'debug log file name',
  'newer note': 'debug log (Screenshots.log), never shown',
  'stores {} mark {} mine {}': 'debug log (Screenshots.log), never shown',
  none: 'debug log (Screenshots.log): no mark, no certainty line; never shown',
  'pending {} at {}': 'debug log (Screenshots.log), never shown',
  launch: 'debug log (Screenshots.log), never shown',
  'launch+3s': 'debug log (Screenshots.log), never shown',
  'plan pull {} cooled {} lengthened {} surface {} next {} asking {} overdue {}': 'debug log (Screenshots.log), never shown',
  '{} activity {} {} ends {}': 'debug log (Screenshots.log), never shown',
  'answer held': 'debug log (Screenshots.log), never shown',
  'answer held made': 'debug log (Screenshots.log), never shown',
  // the debug clock (ios/App/AppClock.swift) and what the scripted checks
  // read and tap with (tools/iosE2e.mjs)
  clockSpeed: 'debug launch argument',
  clockOffset: 'debug launch argument',
  clockEpoch: 'debug launch argument',
  clockAt: 'debug launch argument',
  'aet.clock': 'the file the debug clock is stepped through, never shown',
  'clock {} at {} speed {}': 'debug log (Screenshots.log), never shown',
  '%.3f': 'debug log number format',
  ' (debug clock)': 'the mark on a record made under the debug clock, never shown',
  uiDo: 'debug launch argument',
  '@': 'debug launch argument separator',
  ':': 'debug launch argument separator',
  pull: 'debug launch argument value',
  cooled: 'debug launch argument value',
  out: 'debug launch argument value',
  cancel: 'debug launch argument value',
  again: 'debug launch argument value',
  answer: 'debug launch argument value',
  update: 'debug log (Screenshots.log), never shown',
  '%.2f': 'debug log number format',
  'alarms cancelled': 'debug log (Screenshots.log), never shown',
  'pending none': 'debug log (Screenshots.log), never shown',
  'delivered [{}]': 'debug log (Screenshots.log), never shown',
  restored: 'debug log (Screenshots.log), never shown',
  settled: 'debug log (Screenshots.log), never shown',
  'scheduled {} at {} in {}': 'debug log (Screenshots.log), never shown',
  'not scheduled {}: {}': 'debug log (Screenshots.log), never shown',
  'log {} folded {} last {}': 'debug log (Screenshots.log), never shown',
  'cook ended': 'debug log (Screenshots.log), never shown',
  'shown peak %.2f level %.3f planned peak %.2f': 'debug log (Screenshots.log), never shown',
  'stored none': 'debug log (Screenshots.log), never shown',
  'stored {}': 'debug log (Screenshots.log), never shown',
  'restore kept aside {}': 'debug log (Screenshots.log), never shown',
  'restore unreadable': 'debug log (Screenshots.log), never shown',
  'restore too old': 'debug log (Screenshots.log), never shown',
  'restore {} events written {}': 'debug log (Screenshots.log), never shown',
  'ring {}': 'debug log (Screenshots.log), never shown',
  'phase {}': 'debug log (Screenshots.log), never shown',
  'activity {} {} ends {} up {} cook {}|{}|{}|{}': 'debug log (Screenshots.log), never shown',
  'activity end done': 'debug log (Screenshots.log), never shown',
  'action {}': 'debug log (Screenshots.log), never shown',
  'action unknown {}': 'debug log (Screenshots.log), never shown',
  // the one screen's checks (tools/iosE2e.mjs): where each part sits, and
  // what the idle screen shows
  slider: 'debug log name of a part of the screen, never shown',
  egg: 'debug log name of a part of the screen, never shown',
  sentence: 'debug log name of a part of the screen, never shown',
  'layout {} {}': 'debug log (Screenshots.log), never shown',
  'answer {} decided {} odds {}': 'debug log (Screenshots.log), never shown',
  eggsIn: 'debug launch argument value',
  set: 'debug launch argument value',
  '=': 'debug launch argument separator',
  size: 'debug launch argument value',
  altitude: 'debug launch argument value',
  language: 'debug launch argument value',
  '1':'debug launch argument value',
  'action unknown set:{}': 'debug log (Screenshots.log), never shown',
  'egg {}': 'debug log (Screenshots.log), never shown',
  '{} none': 'debug log (Screenshots.log), never shown',
  '%@ yolk %.3f': 'debug log (Screenshots.log), never shown',
  '{}|{}|{}|{}': 'cache key, never shown',
  '{}|{}|{}|{}|{}': 'cache key, never shown',
  // corrections mid-cook (ios/App/Edits.swift), and their checks
  'as ran corrected': 'debug log (Screenshots.log), never shown',
  'view {}': 'debug log (Screenshots.log), never shown',
  'edit {}': 'debug log (Screenshots.log), never shown',
  'edit committed {} start {}': 'debug log (Screenshots.log), never shown',
  'start limit {} {}': 'debug log (Screenshots.log), never shown',
  drag: 'debug launch argument value',
  release: 'debug launch argument value',
  stillIn: 'debug launch argument value',
  stillOut: 'debug launch argument value',
  open: 'debug launch argument value',
  'slot {}': 'debug log (Screenshots.log), never shown',
  '{} {} | {}': 'debug log of the readout (Screenshots.log), never shown',
  'readout {}': 'debug log (Screenshots.log), never shown',
  uiScrollAnchor: 'debug launch argument',
  'verdict {} white sets {} cook {}': 'debug log (Screenshots.log), never shown',
  // the one screen's review on iOS (design/onescreen-review.md), its checks
  'certainty {}': 'debug log (Screenshots.log), never shown',
  '{} | {}': 'debug log of the certainty line (Screenshots.log), never shown',
  'white {}': 'debug log (Screenshots.log), never shown',
  'note {}': 'debug log (Screenshots.log), never shown',
  'as ran remade': 'debug log (Screenshots.log), never shown',
  uiHoldAsRan: 'debug launch argument',
  'edit leaving': 'debug log (Screenshots.log), never shown',
  'announce {}': 'debug log (Screenshots.log), never shown',
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
  'certainty-open': 'view identifier',
  heating: 'view identifier',
  done: 'view identifier',
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
  'playing {} frames at {} Hz{}': 'log message, never shown',
  ', looped': 'log message, never shown',
  'no sound to play: its file is missing or unreadable': 'log message, never shown',
  '2026-10-e10': 'record model id, never shown',
  '2026-09': 'the literature population\'s id, never shown',
  population: 'bundle resource name (Calibration.swift)',
  'sharing.v1': 'UserDefaults key (Sharing.swift)',
  on: 'stored sharing state field (Share.swift)',
  sent: 'stored sharing state field',
  seq: 'stored sharing state field',
  uids: 'stored sharing state field',
  deleting: 'stored sharing state field',
  busy: 'stored sharing state field',
  busySince: 'stored sharing state field',
  '0123456789abcdef': 'hex digits, to read a random ID (Share.swift), never shown',
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
  afterBoil: 'stored running cook field (Running.swift)',
  altitude_m: 'stored running cook field (Running.swift)',
  asRan: 'stored running cook field (Running.swift)',
  boilAt_s: 'stored running cook field (Running.swift)',
  boilRemembered: 'stored running cook field (Running.swift)',
  by: 'stored running cook field (Running.swift)',
  choices: 'stored running cook field (Running.swift)',
  coldSince_s: 'stored running cook field (Running.swift)',
  confirmed: 'stored running cook field (Running.swift)',
  correctedAt_s: 'stored running cook field (Running.swift)',
  cooledAt_s: 'stored running cook field (Running.swift)',
  customStart_C: 'stored running cook field (Running.swift)',
  due_s: 'stored running cook field (Running.swift)',
  eggFrom: 'stored running cook field (Running.swift)',
  events: 'stored running cook field (Running.swift)',
  firstHotAt_s: 'stored running cook field (Running.swift)',
  forecast: 'stored running cook field (Running.swift)',
  id_ms: 'stored running cook field (Running.swift)',
  lang: 'stored running cook field (Running.swift)',
  level: 'stored running cook field (Running.swift)',
  massFrom: 'stored running cook field (Running.swift)',
  mass_kg: 'stored running cook field (Running.swift)',
  out_s: 'stored running cook field (Running.swift)',
  params: 'stored running cook field (Running.swift)',
  peakYolk_C: 'stored running cook field (Running.swift)',
  probeMoment: 'stored running cook field (Running.swift)',
  pulled: 'stored running cook field (Running.swift)',
  rangAt_s: 'stored running cook field (Running.swift)',
  room_C: 'stored running cook field (Running.swift)',
  sizeTable: 'stored running cook field (Running.swift)',
  startMode: 'stored running cook field (Running.swift)',
  startedAt_s: 'stored running cook field (Running.swift)',
  tauAirScale: 'stored running cook field (Running.swift)',
  units: 'stored running cook field (Running.swift)',
  white: 'stored running cook field (Running.swift)',
  yolk: 'stored running cook field (Running.swift)',
  yolkWord: 'stored running cook field (Running.swift)',
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

function sources(): Map<string, string> {
  const files = new Map<string, string>();
  for (const dir of DIRS) {
    for (const name of swiftFiles(dir)) files.set(name, readFileSync(name, 'utf8'));
  }
  return files;
}

/* ------------------------------------------------------------------ main */

// No literal in the Swift sources is words: each is a catalogue key, an
// argument's name in key position, or on the NOT_COPY list with the reason it
// is not copy.
const en = parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8')));
const now = [...sources().entries()].flatMap(([f, s]) => literals(s).map((l) => ({ file: f, ...l })));

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
