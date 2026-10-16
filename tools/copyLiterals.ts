/**
 * `npm run copy:literals`: no word reaches an iOS screen except through
 * copy/, so a wording change is the catalogue's diff. A Swift string literal
 * with a letter in it (less interpolations, escapes and number formats) fails
 * where it is written among the arguments of a call that puts text on screen
 * or says it (TEXT_CALLS), or assigned to a text property, on the same line;
 * not an argument labelled for something else (`systemImage:`) or a
 * dictionary key (a catalogue argument's name). A word routed through a name
 * or a helper not on the list is not read.
 *
 * Read: ios/App, ios/Widget, EggTimerApp and EggTimerShared, less what only a
 * debug build compiles (Screenshots.swift, an `#if DEBUG` branch). A `"""`
 * literal fails where it opens on a line with a text call; elsewhere it is
 * skipped.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIRS = ['ios/App', 'ios/Widget', 'ios/EggTimerCore/Sources/EggTimerApp', 'ios/EggTimerCore/Sources/EggTimerShared'];
const DEBUG_FILES = new Set(['ios/EggTimerCore/Sources/EggTimerApp/Screenshots.swift']);

const TEXT_CALLS = [ // SwiftUI, UIKit and notifications; ForEach's data is what its rows show
  'Text', 'Button', 'Label', 'Toggle', 'Picker', 'TextField', 'SecureField', 'Link', 'ShareLink', 'Menu', 'Section',
  'LabeledContent', 'Stepper', 'NavigationLink', 'ProgressView', 'Gauge', 'DisclosureGroup', 'ContentUnavailableView',
  'AttributedString', 'NSAttributedString', 'ForEach', 'navigationTitle', 'navigationBarTitle', 'accessibilityLabel',
  'accessibilityHint', 'accessibilityValue', 'accessibilityInputLabels', 'accessibilityAction', 'alert',
  'confirmationDialog', 'help', 'badge', 'setTitle', 'UIAlertController', 'UIAlertAction', 'UIAction', 'UIMenu',
  'UNNotificationAction', 'announce', // and the app's own that take text:
  'barTitle', 'MenuChoice', 'ListChoice', 'InfoRow', 'InfoButton', 'MoreText', 'linked', 'subhead', 'para', 'aside',
  'footnote', 'StepperRow', 'StepperValue', 'CountValue', 'MeasureField', 'NudgeField', 'RoomField',
  'CoolingWaterField', 'whiteButton', 'answerButton', 'answerRow', 'YolkBracket',
];
const TEXT_PROPERTIES = 'text|attributedText|title|subtitle|body|placeholder|prompt|accessibilityLabel|accessibilityValue|accessibilityHint';
const CALL = new RegExp(`\\b(?:${TEXT_CALLS.join('|')})\\s*\\(|\\.(?:${TEXT_PROPERTIES})\\s*=(?!=)`, 'g');
const NOT_TEXT = /\b(systemImage|systemName|image|named|destination|url|string|identifier|id|forKey|tag|bundle|tableName|comment|format|specifier|in|for|locale|language)\s*:\s*$/;
/** A one-line literal: escapes, and interpolations holding literals or one level of parentheses. */
const LITERAL = /"(?:[^"\\\n]|\\\((?:[^()"\n]|"(?:[^"\\\n]|\\.)*"|\([^()\n]*\))*\)|\\.)*"/g;

/** A letter left, less interpolations, escapes and printf-style number formats. */
function isWords(literal: string): boolean {
  return /\p{L}/u.test(literal.slice(1, -1).replace(/\\\((?:[^()"]|"[^"]*"|\([^()]*\))*\)/g, '')
    .replace(/\\u\{[0-9a-fA-F]+\}|\\./g, '').replace(/%[-+ 0#]*\d*(\.\d+)?(ll|l|h)?[a-zA-Z@]/g, ''));
}

/** Each literal in `source` that is words in a text call, as `file:line: "…"`. */
export function lintSwift(file: string, source: string): string[] {
  const failures: string[] = [];
  const open: boolean[] = []; // per `#if`: whether this branch is debug-only
  let multiline = false;
  source.split('\n').forEach((raw, i) => {
    const where = `${file}:${i + 1}`;
    const directive = /^\s*#(if|elseif|else|endif)\b\s*(\S*)/.exec(raw);
    if (directive !== null && !multiline) {
      if (directive[1] === 'if') open.push(directive[2] === 'DEBUG');
      else if (directive[1] === 'endif') open.pop();
      else if (open.length > 0) open[open.length - 1] = false;
      return;
    }
    const quotes = raw.split('"""').length - 1;
    if (multiline || quotes > 0) {
      if (!multiline && raw.slice(0, raw.indexOf('"""')).match(CALL)) failures.push(`${where}: a """ literal in a text call cannot be read`);
      if (quotes % 2 === 1) multiline = !multiline;
      return;
    }
    if (open.includes(true)) return;
    const masked = raw.replace(LITERAL, (m) => `"${' '.repeat(m.length - 2)}"`);
    const cut = masked.indexOf('//') < 0 ? raw.length : masked.indexOf('//');
    const flagged = new Set<number>();
    for (const call of masked.slice(0, cut).matchAll(CALL)) {
      let end = call.index + call[0].length;
      for (let depth = call[0].endsWith('(') ? 1 : -1; end < cut && depth !== 0; end++) {
        if (masked[end] === '(') depth++;
        else if (masked[end] === ')') depth--;
      }
      for (const lit of raw.slice(0, end).matchAll(LITERAL)) {
        if (lit.index < call.index || raw[lit.index + lit[0].length] === ':' || flagged.has(lit.index)) continue;
        if (NOT_TEXT.test(raw.slice(0, lit.index)) || !isWords(lit[0])) continue;
        flagged.add(lit.index);
        failures.push(`${where}: ${lit[0]} is words on a screen; give it a key in copy/en.json`);
      }
    }
  });
  return failures;
}

if (process.argv[1]?.endsWith('copyLiterals.ts')) {
  const files = DIRS.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.swift')).map((f) => join(d, f)));
  const read = files.filter((f) => !DEBUG_FILES.has(f));
  if (read.length === files.length) throw new Error(`${[...DEBUG_FILES]} is skipped and is no file; take it off its list`);
  const failures = read.flatMap((f) => lintSwift(f, readFileSync(f, 'utf8')));
  console.log(failures.length > 0 ? `${failures.length} failures:\n${failures.join('\n')}`
    : `copy:literals: ${read.length} files, ${TEXT_CALLS.length} text calls; no literal in one is words.`);
  if (failures.length > 0) process.exit(1);
}
