/**
 * The standing lint on the words in the Swift sources.
 *
 *   npm run copy:literals [-- --list]     --list prints every literal read
 *
 * No word reaches an iOS screen except through copy/, so what a wording
 * change changed is the catalogue's diff. This reads the string literals
 * written straight into the arguments of a call that puts text on screen or
 * says it (TEXT_CALLS: the system's Text, Button, .accessibilityLabel, …,
 * less arguments labelled for something else, NOT_TEXT; and APP_CALLS, the
 * app's own views and functions that take text, by label or position), and
 * into a property that holds text (`label.text =`, a notification's `title`
 * and `body`). One with a letter in it, less interpolations and number
 * formats, is words, and fails, unless it is a catalogue argument's name in
 * a dictionary's key position (`["grams": .int(68)]`) or on NOT_COPY. A
 * literal elsewhere (a log line, a stored key, a URL, an SF Symbol) is not
 * read. Nor is a literal reaching a text call through a name (`let s =
 * "…"; Text(s)`, a computed property, a new helper not yet on APP_CALLS):
 * rare, and left to the review of the diff.
 *
 * Read: ios/App, ios/Widget, EggTimerApp and EggTimerShared, less what only a
 * debug build compiles (an `#if DEBUG` branch, Screenshots.swift). A NOT_COPY
 * entry no literal read needs fails, so the list holds only what the code
 * says now. Planted in a Text, a Label's title, an accessibility label, a
 * ternary, a notification's body, MoreText and a Help paragraph, a literal
 * fails (16 October 2026).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseCatalogue, placeholders, templatesOf } from '../src/core/copy.ts';

const DIRS = [
  'ios/App', 'ios/Widget', 'ios/EggTimerCore/Sources/EggTimerApp', 'ios/EggTimerCore/Sources/EggTimerShared',
];

/** Files a release build compiles but never runs: each acts only on launch
 *  arguments, which a release build does not read. */
const DEBUG_FILES = new Set([
  'ios/EggTimerCore/Sources/EggTimerApp/Screenshots.swift',
]);

/** The system's calls whose arguments are text a cook sees or hears. */
const TEXT_CALLS = new Set([
  // SwiftUI views
  'Text', 'Button', 'Label', 'Toggle', 'Picker', 'TextField', 'SecureField', 'Link', 'ShareLink', 'Menu', 'Section',
  'LabeledContent', 'Stepper', 'NavigationLink', 'ProgressView', 'Gauge', 'DisclosureGroup', 'ContentUnavailableView',
  'AttributedString', 'NSAttributedString',
  // SwiftUI modifiers
  'navigationTitle', 'navigationBarTitle', 'accessibilityLabel', 'accessibilityHint', 'accessibilityValue',
  'accessibilityInputLabels', 'accessibilityAction', 'alert', 'confirmationDialog', 'help', 'badge',
  // UIKit, notifications, and the app's own VoiceOver announcement
  'setTitle', 'UIAlertController', 'UIAlertAction', 'UIAction', 'UIMenu', 'UNNotificationAction', 'announce',
]);

/** The app's own views and functions that take text: the labels, or the
 *  positions of unlabelled arguments, that carry it. */
const APP_CALLS: Record<string, (string | number)[]> = {
  request: ['title', 'body'], // the alarm's notification (Alarm.swift)
  StepperValue: ['label'], StepperRow: ['label'], CountValue: ['label'], ListChoice: ['label'],
  MeasureField: ['label', 'spoken', 'shown'], NudgeField: ['label', 'text'], RoomField: ['shown'],
  CoolingWaterField: ['shown'], MenuChoice: ['label', 'chosen'], YolkSlider: ['label', 'valueText'],
  InfoButton: ['name'], InfoRow: ['name', 'more'], MoreText: [0], BarTitle: ['title'], barTitle: [0],
  linked: [0], para: [0], aside: [0], subhead: [0], footnote: [0], answerButton: [0], answerRow: [0],
  whiteButton: [0],
};

/** Arguments of a text call that name something other than text. */
const NOT_TEXT = new Set([
  'systemImage', 'systemName', 'image', 'named', 'destination', 'url', 'identifier', 'id', 'forKey', 'tag', 'bundle',
  'tableName', 'comment', 'format', 'specifier', 'in', 'for', 'locale', 'language',
]);

/** Properties whose value is drawn or spoken: `x.text = …`. */
const TEXT_PROPERTIES = new Set([
  'text', 'attributedText', 'title', 'subtitle', 'body', 'placeholder', 'prompt', 'accessibilityLabel',
  'accessibilityValue', 'accessibilityHint',
]);

/** Literals read that have a letter but are not words a cook reads, and
 *  why: none today. */
const NOT_COPY: Record<string, string> = {};

/* ------------------------------------------------------------- the lexer */

type Token =
  | { k: 'id'; text: string }
  | { k: 'p'; text: string }
  | { k: 'nl' }
  | { k: 'str'; text: string; key: boolean; inner: Token[] };

/** Swift as tokens, comments dropped. A string literal keeps its text (an
 *  interpolation as `{}`), its interpolations' tokens, and whether a colon
 *  follows at once: a dictionary key, where a ternary's has a space. */
function lex(source: string): Token[] {
  let i = 0;
  // Tokens up to the end, or, in an interpolation, up to its closing `)`.
  const run = (inner: boolean): Token[] => {
    const out: Token[] = [];
    let depth = 0;
    while (i < source.length) {
      const c = source[i];
      const rest = source.slice(i, i + 200);
      const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
      if (rest.startsWith('//')) i = source.indexOf('\n', i) < 0 ? source.length : source.indexOf('\n', i);
      else if (rest.startsWith('/*')) i = source.indexOf('*/', i) + 2;
      else if (rest.startsWith('"""')) throw new Error('multi-line literal: extend the lexer');
      else if (c === '"') out.push(literal());
      else if (c === '`') {
        const end = source.indexOf('`', i + 1);
        out.push({ k: 'id', text: source.slice(i + 1, end) });
        i = end + 1;
      } else if (word !== null) {
        out.push({ k: 'id', text: word[0] });
        i += word[0].length;
      } else if (/^(==|!=|<=|>=|\+=|->)/.test(rest)) {
        out.push({ k: 'p', text: rest.slice(0, 2) });
        i += 2;
      } else {
        i += 1;
        if (c === '\n') out.push({ k: 'nl' });
        if (/\s/.test(c)) continue;
        if (inner && c === ')' && depth-- === 0) return out;
        if (c === '(') depth += 1;
        out.push({ k: 'p', text: c });
      }
    }
    return out;
  };
  const literal = (): Token => {
    let text = '';
    const inner: Token[] = [];
    for (i += 1; i < source.length && source[i] !== '"'; i += 1) {
      if (source[i] !== '\\') { text += source[i]; continue; }
      const e = source[++i];
      if (e === '(') {
        i += 1;
        inner.push(...run(true));
        i -= 1;
        text += '{}';
      } else if (e === 'u' && source[i + 1] === '{') {
        const end = source.indexOf('}', i);
        text += String.fromCodePoint(parseInt(source.slice(i + 2, end), 16));
        i = end;
      } else text += e === 'n' ? '\n' : e === 't' ? '\t' : e;
    }
    i += 1;
    return { k: 'str', text: text, key: source[i] === ':', inner: inner };
  };
  return run(false);
}

const isP = (t: Token | undefined, text: string): boolean => t !== undefined && t.k === 'p' && t.text === text;
const OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

/** The index after the bracket that closes the one at `start`. */
function closing(tokens: Token[], start: number): number {
  const stack: string[] = [];
  for (let j = start; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.k === 'p' && t.text in OPEN) stack.push(OPEN[t.text]);
    else if (t.k === 'p' && t.text === stack[stack.length - 1] && (stack.pop(), stack.length === 0)) return j + 1;
  }
  return tokens.length;
}

/** A call's arguments, between the parentheses at `open`: each with its
 *  label, if it has one, and its tokens after the label. */
function argumentsAt(tokens: Token[], open: number): { label: string | null; tokens: Token[] }[] {
  const end = closing(tokens, open) - 1;
  const args: Token[][] = [[]];
  for (let j = open + 1; j < end; j++) {
    const t = tokens[j];
    if (t.k === 'p' && t.text in OPEN) {
      args[args.length - 1].push(...tokens.slice(j, closing(tokens, j)));
      j = closing(tokens, j) - 1;
    } else if (isP(t, ',')) args.push([]);
    else if (t.k !== 'nl') args[args.length - 1].push(t);
  }
  return args.filter((a) => a.length > 0).map((a) => (a[0].k === 'id' && isP(a[1], ':')
    ? { label: a[0].text, tokens: a.slice(2) }
    : { label: null, tokens: a }));
}

/** What of an expression reaches the screen: all of it, interpolations
 *  too, but a closure, a subscript's key and a nested call's arguments
 *  labelled for something else. */
function textTokens(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const t = tokens[j];
    // An array literal follows anything but a name, `?`, `!`, `)` or `]`.
    const before = tokens[j - 1];
    if (isP(t, '{') || (isP(t, '[') && (before?.k === 'id' || ['?', '!', ')', ']'].some((x) => isP(before, x))))) {
      j = closing(tokens, j) - 1;
      continue;
    }
    if (isP(t, '(') && before?.k === 'id') {
      for (const a of argumentsAt(tokens, j)) if (a.label === null || !NOT_TEXT.has(a.label)) out.push(...textTokens(a.tokens));
      j = closing(tokens, j) - 1;
      continue;
    }
    out.push(t);
    if (t.k === 'str') out.push(...textTokens(t.inner));
  }
  return out;
}

/** Whether an argument of a call to `name` carries text: any argument of
 *  the system's text calls not labelled for something else, and the app's
 *  by its label or position. */
function carriesText(name: string, label: string | null, position: number): boolean {
  if (TEXT_CALLS.has(name)) return label === null || !NOT_TEXT.has(label);
  return APP_CALLS[name]?.includes(label ?? position) ?? false;
}

/** What reaches the screen in `tokens`: the text arguments of every text
 *  call, and the value given each text property. */
function textSites(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const walk = (ts: Token[]): void => {
    for (let j = 0; j < ts.length; j++) {
      const t = ts[j];
      if (t.k === 'str') walk(t.inner);
      if (t.k !== 'id') continue;
      if (isP(ts[j + 1], '(') && !isP(ts[j - 1], 'func')) {
        argumentsAt(ts, j + 1).forEach((a, n) => {
          if (carriesText(t.text, a.label, n)) out.push(...textTokens(a.tokens));
        });
      }
      if (TEXT_PROPERTIES.has(t.text) && isP(ts[j - 1], '.') && isP(ts[j + 1], '=')) {
        let end = j + 2;
        while (end < ts.length && ts[end].k !== 'nl') {
          end = isP(ts[end], '(') || isP(ts[end], '[') || isP(ts[end], '{') ? closing(ts, end) : end + 1;
        }
        out.push(...textTokens(ts.slice(j + 2, end)));
      }
    }
  };
  walk(tokens);
  return out;
}

/* --------------------------------------------------------------- sources */

/** `source` less what only a debug build compiles: an `#if DEBUG` branch
 *  before its `#else`, and an `#if !DEBUG`'s after. Other conditions are
 *  read on both sides. */
function releaseOnly(source: string): string {
  const open: { debug: 'before' | 'after' | null; past: boolean }[] = [];
  return source.split('\n').map((line) => {
    const d = /^\s*#(if|elseif|else|endif)\b\s*(.*?)\s*(\/\/.*)?$/.exec(line);
    if (d === null) return open.some((o) => o.debug !== null && (o.debug === 'before') !== o.past) ? '' : line;
    if (d[1] === 'if') open.push({ debug: d[2] === 'DEBUG' ? 'before' : /^!\s*DEBUG$/.test(d[2]) ? 'after' : null, past: false });
    else if (d[1] === 'endif') open.pop();
    else if (open.length > 0) open[open.length - 1].past = true;
    return '';
  }).join('\n');
}

/** Whether a literal is words: a letter left without its interpolations and
 *  printf-style number formats (`%d`, `%.{}f`). */
function isWords(text: string): boolean {
  return /\p{L}/u.test(text.replace(/%[-+ 0#]*(\d+|\{\})?(\.(\d+|\{\}))?(ll|l|h)?[a-zA-Z@]/g, '').replace(/\{\}/g, ''));
}

/* ------------------------------------------------------------------ main */

const en = parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8')));

/** The names of arguments the catalogue takes: `"grams": .int(68)` in a call
 *  is not a word, as long as it is one of these and in key position. */
const argumentNames = new Set([...en.messages.values()]
  .flatMap((m) => templatesOf(m).flatMap(placeholders).concat(m.kind === 'plural' ? [m.count] : [])));

const failures: string[] = [];
const needed = new Set<string>();
let read = 0;
const files = DIRS.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.swift')).map((f) => join(dir, f)));
for (const file of files.filter((f) => !DEBUG_FILES.has(f))) {
  for (const t of textSites(lex(releaseOnly(readFileSync(file, 'utf8'))))) {
    if (t.k !== 'str') continue;
    read += 1;
    if (process.argv.includes('--list')) console.log(`${file}: ${JSON.stringify(t.text)}`);
    if (t.key && argumentNames.has(t.text)) continue;
    if (!isWords(t.text)) continue;
    if (t.text in NOT_COPY) { needed.add(t.text); continue; }
    failures.push(`${file}: "${t.text}" is words on a screen; give it a key in copy/en.json`);
  }
}
for (const name of DEBUG_FILES) if (!existsSync(name)) failures.push(`${name} is skipped and is no file; take it off its list`);
for (const entry of Object.keys(NOT_COPY)) {
  if (!needed.has(entry)) failures.push(`NOT_COPY: "${entry}" is no literal read that needs it; delete it`);
}

console.log(`${read} literals in the text arguments of ${TEXT_CALLS.size} of the system's calls and `
  + `${Object.keys(APP_CALLS).length} of the app's, and in text properties.`);
if (failures.length > 0) {
  console.log(`\n${failures.length} failures:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('none of them is words, and every NOT_COPY entry is needed.');
